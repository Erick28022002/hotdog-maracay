const express = require('express');
const { SquareClient, SquareEnvironment } = require('square');
const { createClient } = require('@supabase/supabase-js');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { buildTrustedOrder, cleanText, TAX_PERCENTAGE } = require('./order-validation');
const { getSquareOrder, verifySquareWebhookSignature } = require('./square-compat');
const {
  createSupabaseCheckoutRepository,
  claimCheckoutAttempt,
  persistApprovedCheckout,
  reconcileApprovedCheckout,
  locationDisplayName
} = require('./checkout-persistence');
const { sendOrderEmails } = require('./email-confirmation');

const ALLOWED_ORIGINS = [
  'https://hotdogmaracay.com',
  'https://www.hotdogmaracay.com'
];

if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:8080', 'http://127.0.0.1:8080');
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));

// CORS manual — primer middleware, siempre se ejecuta incluso en errores
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return origin && ALLOWED_ORIGINS.includes(origin)
    ? res.sendStatus(204)
    : res.sendStatus(403);
  next();
});

app.use(express.json({
  limit: '32kb',
  verify(req, res, buffer) {
    req.rawBody = Buffer.from(buffer);
  }
}));

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Solicitud demasiado grande' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, error: 'JSON invalido' });
  }
  next(err);
});

const paymentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator(req) {
    const forwarded = process.env.VERCEL ? req.headers['x-vercel-forwarded-for'] : req.ip;
    const address = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
      .split(',')[0]
      .trim();
    return ipKeyGenerator(address || req.socket.remoteAddress || 'unknown');
  },
  message: { success: false, error: 'Demasiados intentos. Espera unos minutos.' }
});

// Cuenta Square de demostracion (legado) — nunca se usa como fallback de una
// sede real. Solo queda disponible para pruebas manuales, no es alcanzable
// desde /api/pay (el checkout real solo acepta 'nmb' | 'doral' | 'downtown').
const LOCATION_ID = process.env.SQUARE_LOCATION_ID;
const squareClient = process.env.SQUARE_ACCESS_TOKEN
  ? new SquareClient({
      token: process.env.SQUARE_ACCESS_TOKEN,
      environment: process.env.SQUARE_ENV === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox
    })
  : null;

// Multi-sede: cada sede procesa el pago con SU PROPIA cuenta Square
// (token + location_id independientes). Ninguna sede cae en otra si a la
// suya le faltan credenciales — queda deshabilitada (ver /api/pay).
const BRANCH_CONFIG = {
  nmb: {
    name: 'North Miami Beach',
    accessToken: process.env.SQUARE_NMB_ACCESS_TOKEN || '',
    locationId: process.env.SQUARE_NMB_LOCATION_ID || ''
  },
  doral: {
    name: 'Doral',
    accessToken: process.env.SQUARE_DORAL_ACCESS_TOKEN || '',
    locationId: process.env.SQUARE_DORAL_LOCATION_ID || ''
  },
  downtown: {
    name: 'Downtown Miami',
    accessToken: process.env.SQUARE_DOWNTOWN_ACCESS_TOKEN || '',
    locationId: process.env.SQUARE_DOWNTOWN_LOCATION_ID || ''
  }
};
for (const branch of Object.values(BRANCH_CONFIG)) {
  branch.enabled = Boolean(branch.accessToken && branch.locationId);
  branch.client = branch.enabled
    ? new SquareClient({ token: branch.accessToken, environment: SquareEnvironment.Production })
    : null;
}
console.log('Checkout web inicializado');

function squareClientForLocation(locationId) {
  const branch = Object.values(BRANCH_CONFIG).find(candidate =>
    candidate.enabled && candidate.locationId === locationId
  );
  return branch?.client || squareClient;
}

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;
const checkoutRepository = supabase ? createSupabaseCheckoutRepository(supabase) : null;
const ORDER_TYPES = new Set(['pickup']);

app.get('/health', (req, res) => res.json({
  ok: true,
  version: 6
}));

// Nota legible para el recibo/ticket de Square. El KDS ya no lee esto (usa
// item.details/components/general directamente desde web_orders), esto es
// solo para que el recibo impreso por Square muestre algo entendible.
function squareLineItemNote(item) {
  const parts = [];
  if (item.components && item.components.length) {
    item.components.forEach(c => {
      if (c.mods && c.mods.length) parts.push(`${c.name}: ${c.mods.join(', ')}`);
    });
    if (item.general && item.general.length) parts.push(`General: ${item.general.join(', ')}`);
  } else if (item.details) {
    parts.push(item.details.split(' · ').join(', '));
  }
  if (item.noteText) parts.push(`Nota: ${item.noteText}`);
  return parts.join(' | ');
}

async function estimateReadyTime(repository, attempt) {
  const displayLocation = locationDisplayName(attempt.location);
  const activeOrders = repository?.countActiveOrders
    ? await repository.countActiveOrders(displayLocation)
    : 0;
  const ordersAhead = Math.max(0, Number(activeOrders || 0) - 1);
  const itemCount = (attempt.items || []).reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0);
  const min = Math.min(55, 12 + ordersAhead * 4 + Math.max(0, itemCount - 1) * 2);
  const max = Math.min(60, min + 8);
  return {
    ordersAhead,
    estimated_ready_min: min,
    estimated_ready_max: max,
    estimated_ready_text: `${min}-${max} min`
  };
}

function sendOrderEmailsInBackground(attempt) {
  setTimeout(async () => {
    try {
      const estimate = await estimateReadyTime(checkoutRepository, attempt);
      const emailResult = await sendOrderEmails({ ...attempt, ...estimate });
      if (emailResult.skipped) {
        console.warn('ORDER_EMAIL_SKIPPED', emailResult.reason);
      }
    } catch (emailError) {
      console.error('ORDER_EMAIL_ERROR', emailError?.message || emailError);
    }
  }, 0);
}

app.post('/api/pay', paymentLimiter, async (req, res) => {
  let approvedPaymentContext = null;
  let claimedAttemptId = null;
  try {
    const { sourceId, checkoutAttemptId, items, customer, orderType, location, notes } = req.body || {};
    if (typeof sourceId !== 'string' || sourceId.length < 10 || sourceId.length > 500) {
      return res.status(400).json({ success: false, error: 'Token de pago invalido' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutAttemptId || '')) {
      return res.status(400).json({ success: false, error: 'Identificador de pago invalido' });
    }
    if (!customer || typeof customer !== 'object') {
      return res.status(400).json({ success: false, error: 'Cliente invalido' });
    }

    let trustedOrder;
    try {
      trustedOrder = buildTrustedOrder(items);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: cleanText(validationError.message, 120) || 'Pedido invalido'
      });
    }
    const customerName = cleanText(customer.name, 80);
    const customerPhone = cleanText(customer.phone, 25);
    const customerEmail = cleanText(customer.email, 120).toLowerCase();
    const safeNotes = cleanText(notes, 300);
    if (!customerName || !/^[+\d() .-]{7,25}$/.test(customerPhone)) {
      return res.status(400).json({ success: false, error: 'Nombre o telefono invalido' });
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ success: false, error: 'Correo invalido' });
    }
    const branch = BRANCH_CONFIG[location];
    if (!ORDER_TYPES.has(orderType) || !branch) {
      return res.status(400).json({ success: false, error: 'Tipo de orden o ubicacion invalida' });
    }
    if (!branch.enabled) {
      return res.status(503).json({
        success: false,
        error: 'Los pedidos online para esta sede todavia no estan disponibles. Selecciona otra ubicacion.'
      });
    }
    if (!supabase || !checkoutRepository) {
      console.error('Configuracion privada incompleta para pagos');
      return res.status(503).json({ success: false, error: 'Pago temporalmente no disponible' });
    }

    const trustedItemsForStorage = trustedOrder.items.map(item => ({
      id: item.productId,
      name: item.name,
      price: item.unitCents / 100,
      qty: item.quantity,
      details: item.details,
      components: item.components,
      general: item.general,
      note_text: item.noteText
    }));
    const attemptRecord = {
      checkout_attempt_id: checkoutAttemptId,
      payment_status: 'processing',
      persistence_status: 'pending',
      persistence_error: null,
      customer: { name: customerName, phone: customerPhone, email: customerEmail },
      items: trustedItemsForStorage,
      total: trustedOrder.totalCents / 100,
      order_type: orderType,
      location,
      notes: safeNotes
    };
    const claim = await claimCheckoutAttempt(checkoutRepository, attemptRecord);
    claimedAttemptId = checkoutAttemptId;

    if (!claim.claimed) {
      if (claim.attempt.payment_status === 'approved') {
        const reconciliation = await reconcileApprovedCheckout(checkoutRepository, checkoutAttemptId);
        if (reconciliation.persisted) {
          const attempt = reconciliation.attempt;
          return res.json({
            success: true,
            receiptUrl: attempt.receipt_url || '',
            total: Number(attempt.total),
            reconciled: true
          });
        }
        return res.status(202).json({
          success: false,
          paymentApproved: true,
          paymentStatus: 'verification_pending',
          checkoutAttemptId,
          message: 'Tu pago fue aprobado y esta siendo verificado. No vuelvas a pagar.'
        });
      }
      if (claim.attempt.payment_status !== 'failed') {
        return res.status(202).json({
          success: false,
          paymentStatus: 'processing',
          checkoutAttemptId,
          message: 'Este pago ya se esta procesando. No vuelvas a pagar.'
        });
      }
      await checkoutRepository.updateAttempt(checkoutAttemptId, {
        payment_status: 'processing',
        persistence_status: 'pending',
        persistence_error: null
      });
    }

    const orderResponse = await branch.client.orders.create({
      order: {
        locationId: branch.locationId,
        referenceId: 'web-order',
        lineItems: trustedOrder.items.map(item => ({
          name: item.name,
          quantity: String(item.quantity),
          note: squareLineItemNote(item) || undefined,
          basePriceMoney: {
            amount: BigInt(item.unitCents),
            currency: 'USD'
          }
        })),
        taxes: [{
          uid: 'fl-sales-tax',
          name: 'Sales Tax',
          type: 'ADDITIVE',
          percentage: TAX_PERCENTAGE,
          scope: 'ORDER'
        }]
      },
      idempotencyKey: `${checkoutAttemptId}-order`
    });

    const order = orderResponse?.order || orderResponse?.result?.order;
    const orderId = order?.id;
    const orderTotal = order?.totalMoney?.amount;
    if (!orderId || orderTotal == null || orderTotal !== BigInt(trustedOrder.totalCents)) {
      console.error('Square devolvio un total inesperado para el pedido');
      await checkoutRepository.updateAttempt(checkoutAttemptId, {
        payment_status: 'failed',
        persistence_error: 'square_order_total_mismatch'
      });
      return res.status(502).json({ success: false, error: 'No se pudo verificar el total' });
    }
    await checkoutRepository.updateAttempt(checkoutAttemptId, {
      square_order_id: orderId,
      payment_status: 'processing'
    });

    const payResponse = await branch.client.payments.create({
      sourceId,
      idempotencyKey: `${checkoutAttemptId}-payment`,
      amountMoney: { amount: orderTotal, currency: 'USD' },
      locationId: branch.locationId,
      orderId,
      buyerEmailAddress: customerEmail || undefined,
      note: `Pedido web | ${orderType} | ${location} | ${checkoutAttemptId}`
    });

    const payment = payResponse?.payment || payResponse?.result?.payment || payResponse;
    const paymentId = payment?.id?.toString() || '';
    const receiptUrl = payment?.receiptUrl?.toString() || '';
    if (!paymentId || payment?.status !== 'COMPLETED') {
      console.error('Square no confirmo el pago como completado');
      await checkoutRepository.updateAttempt(checkoutAttemptId, {
        payment_status: 'failed',
        persistence_error: 'square_payment_not_completed'
      });
      return res.status(502).json({ success: false, error: 'El pago no pudo confirmarse' });
    }

    approvedPaymentContext = { checkoutAttemptId, squareOrderId: orderId, paymentId };
    const approvedAttempt = await checkoutRepository.updateAttempt(checkoutAttemptId, {
      square_order_id: orderId,
      payment_id: paymentId,
      receipt_url: receiptUrl,
      payment_status: 'approved',
      persistence_status: 'pending',
      persistence_error: null
    });
    const persistence = await persistApprovedCheckout(checkoutRepository, approvedAttempt);
    if (!persistence.persisted) {
      console.error('CHECKOUT_PERSISTENCE_PENDING', JSON.stringify({
        ...approvedPaymentContext,
        error: persistence.error?.code || persistence.error?.message || 'database_error'
      }));
      return res.status(202).json({
        success: false,
        paymentApproved: true,
        paymentStatus: 'verification_pending',
        checkoutAttemptId,
        message: 'Tu pago fue aprobado y esta siendo verificado. No vuelvas a pagar.'
      });
    }

    sendOrderEmailsInBackground(approvedAttempt);
    res.json({ success: true, receiptUrl, total: Number(orderTotal) / 100 });
  } catch (err) {
    const errMsg = err?.errors?.[0]?.detail || err?.message || JSON.stringify(err);
    console.error('Error en /api/pay:', errMsg);
    if (approvedPaymentContext) {
      console.error('CHECKOUT_PERSISTENCE_INCIDENT', JSON.stringify({
        ...approvedPaymentContext,
        error: err?.code || errMsg
      }));
      return res.status(202).json({
        success: false,
        paymentApproved: true,
        paymentStatus: 'verification_pending',
        checkoutAttemptId: approvedPaymentContext.checkoutAttemptId,
        message: 'Tu pago fue aprobado y esta siendo verificado. No vuelvas a pagar.'
      });
    }
    if (claimedAttemptId && checkoutRepository) {
      try {
        await checkoutRepository.updateAttempt(claimedAttemptId, {
          payment_status: 'failed',
          persistence_error: String(err?.code || errMsg).slice(0, 500)
        });
      } catch (_) {}
    }
    res.status(500).json({ success: false, error: 'No se pudo procesar el pago' });
  }
});

app.post('/api/pay/reconcile', paymentLimiter, async (req, res) => {
  const checkoutAttemptId = req.body?.checkoutAttemptId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutAttemptId || '')) {
    return res.status(400).json({ success: false, error: 'Identificador de pago invalido' });
  }
  try {
    const result = await reconcileApprovedCheckout(checkoutRepository, checkoutAttemptId);
    if (!result.found) return res.status(404).json({ success: false, error: 'Intento no encontrado' });
    if (result.persisted) {
      return res.json({
        success: true,
        reconciled: true,
        receiptUrl: result.attempt.receipt_url || '',
        total: Number(result.attempt.total)
      });
    }
    return res.status(202).json({
      success: false,
      paymentApproved: result.attempt?.payment_status === 'approved',
      paymentStatus: result.attempt?.payment_status === 'approved' ? 'verification_pending' : 'processing',
      checkoutAttemptId,
      message: 'El pago sigue en verificacion. No vuelvas a pagar.'
    });
  } catch (err) {
    console.error('CHECKOUT_RECONCILIATION_ERROR', JSON.stringify({
      checkoutAttemptId,
      error: err?.code || err?.message || 'database_error'
    }));
    return res.status(202).json({
      success: false,
      paymentStatus: 'verification_pending',
      checkoutAttemptId,
      message: 'El pago sigue en verificacion. No vuelvas a pagar.'
    });
  }
});

// Resuelve external_location_id -> sede_id consultando pos_integration_config.
// SEGURIDAD (P1-1): NO hay fallback a 'nmb'. Si el location_id no está
// registrado o Supabase falla, devuelve null y el evento se marca como
// sede desconocida — jamás se atribuye a otra sede. Aislamiento estricto.
async function resolverSede(supabaseClient, locationId) {
  if (!locationId || !supabaseClient) return null;
  try {
    const { data } = await supabaseClient
      .from('pos_integration_config')
      .select('sede_id')
      .eq('provider', 'square')
      .eq('external_location_id', locationId)
      .maybeSingle();
    return data?.sede_id || null;
  } catch (_) {
    return null;
  }
}

// Webhook de Square — recibe eventos del POS y los manda al KDS via Supabase
app.post('/webhook/square', async (req, res) => {
  try {
    if (!supabase) {
      console.error('Configuracion privada incompleta para webhook');
      return res.status(503).json({ error: 'Service unavailable' });
    }
    const rawBody = req.rawBody?.toString('utf8') || '';
    const sigKey  = process.env.SQUARE_WEBHOOK_KEY;
    if (!sigKey) {
      console.error('SQUARE_WEBHOOK_KEY no esta configurada');
      return res.status(503).json({ error: 'Service unavailable' });
    }

    const signature  = String(req.headers['x-square-hmacsha256-signature'] || '');
    const webhookUrl = 'https://hotdog-backend.vercel.app/webhook/square';
    if (!verifySquareWebhookSignature({ rawBody, signature, signatureKey: sigKey, notificationUrl: webhookUrl })) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);

    // Pedido creado en POS — aparece en KDS inmediatamente sin necesidad de pago
    if (event.type === 'order.created') {
      const orderId = event.data?.object?.order_created?.order_id;
      if (!orderId) return res.json({ ok: true });

      const eventLocationId = event.data?.object?.order_created?.location_id || LOCATION_ID || '';
      const eventSquareClient = squareClientForLocation(eventLocationId);
      if (!eventSquareClient) {
        console.error('SQUARE_CLIENT_NO_RESUELTO', JSON.stringify({ event: 'order.created', locationId: eventLocationId, orderId }));
        return res.json({ ok: true, skipped: 'square_client_no_resuelto' });
      }

      let lineItems = [], locationName = '';
      try {
        const orderResp = await getSquareOrder(eventSquareClient, orderId);
        const sqOrder   = orderResp?.order || orderResp?.result?.order;

        // Ignorar pedidos creados desde la web (para no duplicar)
        if (sqOrder?.referenceId === 'web-order') return res.json({ ok: true });

        locationName = sqOrder?.locationId || eventLocationId;
        lineItems = (sqOrder?.lineItems || []).map(li => ({
          name:  li.name,
          qty:   parseInt(li.quantity) || 1,
          price: li.basePriceMoney ? Number(li.basePriceMoney.amount) / 100 : 0
        }));
      } catch (e) {
        console.error('Error fetching order:', e.message);
      }

      const sedeId = await resolverSede(supabase, locationName);

      // SEGURIDAD (P1-1): sin sede resuelta NO se crea el pedido. Antes caía a
      // 'nmb' y el pedido de una sede desconocida aparecía en el KDS de NMB.
      // Ahora se descarta (se responde ok para que Square no reintente en bucle)
      // y se registra el location_id para que ops corrija pos_integration_config.
      if (!sedeId) {
        console.error('SEDE_NO_RESUELTA', JSON.stringify({ event: 'order.created', locationId: locationName, orderId }));
        return res.json({ ok: true, skipped: 'sede_no_resuelta' });
      }

      const { error: orderInsertError } = await supabase.from('web_orders').upsert({
        customer_name: 'Mesa / POS',
        customer_phone: '',
        customer_email: '',
        items: lineItems,
        total: lineItems.reduce((s, i) => s + i.price * i.qty, 0),
        payment_id: 'sq-order-' + orderId,
        receipt_url: '',
        order_type: 'pickup',
        location: locationDisplayName(sedeId),
        sede: sedeId,
        notes: '',
        status: 'pending'
      }, { onConflict: 'payment_id' });
      if (orderInsertError) throw new Error(`POS order insert failed: ${orderInsertError.code || 'database_error'}`);
      return res.json({ ok: true });
    }

    // Pago recibido — actualiza el pedido existente a pagado
    if (event.type === 'payment.created') {
      const payment = event.data?.object?.payment;
      if (!payment) return res.json({ ok: true });

      if (payment.order_id) {
        const { data: existing } = await supabase
          .from('web_orders')
          .select('id')
          .eq('payment_id', 'sq-order-' + payment.order_id)
          .maybeSingle();

        if (existing) {
          const { error: paymentUpdateError } = await supabase.from('web_orders')
            .update({ payment_id: payment.id, receipt_url: payment.receipt_url || '', status: 'paid' })
            .eq('id', existing.id);
          if (paymentUpdateError) throw new Error(`POS payment update failed: ${paymentUpdateError.code || 'database_error'}`);
        }
      }
      return res.json({ ok: true });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Local: node server.js | Vercel: exporta el app como serverless function
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Hotdog backend v4 en puerto ${PORT}`));
}

module.exports = app;
