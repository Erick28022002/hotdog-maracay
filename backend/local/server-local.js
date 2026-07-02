'use strict';

const express = require('express');
const cors    = require('cors');
const https   = require('https');
const path    = require('path');
// Adapter específico de Clover para promos compuestas (2 hot dogs). Solo lo usa pollClover.
const { parseCloverCompositeModifiers, cloverComponentsForPromo, detectComponentPrefix, capFirst, hasComponent2 } = require('./cloverModifiers');

const app  = express();
const PORT = 3000;

/* ══ CREDENCIALES SQUARE — UNA CUENTA POR SEDE ══════════════
   Cada sede tiene su PROPIA cuenta de Square (token + Location ID distintos).
   El campo "sede" DEBE coincidir EXACTO con el botón de sede en kds.html / meseras.html
   (de eso depende el aislamiento por sede en las pantallas).
   Para activar una sede: pega su token (EAAA...) y su Location ID (L...).        */
const SQUARE_HOST = 'connect.squareup.com';
const CLOVER_HOST = 'api.clover.com'; // EE.UU. producción (Europa sería api.eu.clover.com)
// provider: 'square' → token + locId  |  'clover' → token + merchantId
const LOCATIONS = [
  // North Miami trabaja con LOS DOS sistemas a la vez (Square + Clover) → ambos vuelcan a "North Miami"
  { sede: 'North Miami',    provider: 'square', token: 'EAAAl3gZ7tutPUZNn2SB8ttlhB-MERj1D3jWNB1HazSCGBrlLojcDTVlLLhyK7Xw', locId: 'L3WZRABX6ZBX4' },
  { sede: 'North Miami',    provider: 'clover', token: '47c0be34-6973-7c13-0c9b-bbc9638f6b62', merchantId: 'BZHBZSGW80681' },
  { sede: 'Doral',          provider: 'square', token: '', locId: '' },   // ← pega token + Location ID de Doral
  { sede: 'Downtown Miami', provider: 'square', token: '', locId: '' },   // ← pega token + Location ID de Downtown
  { sede: 'Próxima sede',   provider: 'square', token: 'EAAAl6ncOkp2nWqiZV8lpIB2_k3j-3Z9k8yLJNZ4Vt-HdGCMY6rWcqbClQX52TOo', locId: 'L2WHB70494FZB' },   // Hot dog Maracay 5 · Hialeah
];
function locReady(l) {
  return l.provider === 'clover' ? !!(l.token && l.merchantId) : !!(l.token && l.locId);
}

/* ══ SUPABASE ═══════════════════════════════════════════════*/
const SUPABASE_URL = 'ckzvjudhpbhzisrrhozk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5cEosCpGfTIM-culYQ1ofA_xggsaIBc';

function supabaseInsert(row) {
  const data = JSON.stringify(row);
  const req  = https.request({
    hostname: SUPABASE_URL,
    path:     '/rest/v1/web_orders',
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(data),
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Prefer':         'return=minimal',
    }
  }, res => {
    if (res.statusCode === 409) return; // duplicado rechazado por índice único — esperado
    if (res.statusCode >= 300) {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => console.log(`[SUPABASE] Error ${res.statusCode}:`, raw));
    }
  });
  req.on('error', e => console.log('[SUPABASE] Error:', e.message));
  req.write(data);
  req.end();
}

function supabasePatch(squareId, updates) {
  const data = JSON.stringify(updates);
  const path = '/rest/v1/web_orders?payment_id=eq.' + encodeURIComponent(squareId);
  const req  = https.request({
    hostname: SUPABASE_URL,
    path,
    method:   'PATCH',
    headers: {
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(data),
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Prefer':         'return=minimal',
    }
  }, res => {
    if (res.statusCode >= 300) {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => console.log(`[SUPABASE] Patch error ${res.statusCode}:`, raw));
    }
  });
  req.on('error', e => console.log('[SUPABASE] Patch error:', e.message));
  req.write(data);
  req.end();
}

// Devuelve el status actual de una orden por payment_id (o null)
// Timeout de 5s para evitar que el backend quede congelado si Supabase no responde
function supabaseGetStatus(paymentId) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, 5000);
    const path = '/rest/v1/web_orders?select=status&payment_id=eq.' + encodeURIComponent(paymentId);
    const req = https.request({
      hostname: SUPABASE_URL, path, method: 'GET',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { const a = JSON.parse(raw); resolve(a[0] ? a[0].status : null); } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    req.end();
  });
}

function supabaseDelete(squareId) {
  // Borra la orden principal y sus adicionales (payment_id que empiezan igual)
  const path = '/rest/v1/web_orders?payment_id=like.' + encodeURIComponent(squareId) + '*';
  const req  = https.request({
    hostname: SUPABASE_URL,
    path,
    method:   'DELETE',
    headers: {
      'apikey':         SUPABASE_KEY,
      'Authorization':  `Bearer ${SUPABASE_KEY}`,
      'Prefer':         'return=minimal',
    }
  }, res => {
    if (res.statusCode >= 300) {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => console.log(`[SUPABASE] Delete error ${res.statusCode}:`, raw));
    }
  });
  req.on('error', e => console.log('[SUPABASE] Delete error:', e.message));
  req.end();
}

/* ══ ALMACENAMIENTO EN MEMORIA ══════════════════════════════*/
let orders   = [];
let counters = {};
const knownSquareIds = new Set();

// Hash corto y estable de un texto (para IDs deterministas)
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Normaliza los detalles (modificadores) para comparar SIN importar el orden
function normDetails(d) {
  return (d || '').split('·').map(s => s.trim().toLowerCase()).filter(Boolean).sort().join(' · ');
}

// Agrupa items por (nombre + detalles normalizados) sumando cantidades
function aggItems(items) {
  const m = new Map();
  (items || []).forEach(it => {
    const key = (it.name || '').trim().toLowerCase() + '|' + normDetails(it.details);
    if (!m.has(key)) m.set(key, { name: (it.name || '').trim(), details: it.details || '', qty: 0 });
    m.get(key).qty += (parseInt(it.qty) || 1);
  });
  return m;
}

// Firma estable de una orden: independiente del orden de líneas y modificadores
function itemsSig(items) {
  return [...aggItems(items).entries()].map(([k, v]) => k + 'x' + v.qty).sort().join('||');
}

function nextOrderNum(sede) {
  const today = new Date().toISOString().slice(0, 10);
  const key   = `${sede}:${today}`;
  counters[key] = (counters[key] || 0) + 1;
  return counters[key];
}

/* ══ MIDDLEWARES ════════════════════════════════════════════*/
app.use(cors({ origin: '*', methods: ['GET','POST','PATCH','OPTIONS'] }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../../')));

/* ══ HEALTH ═════════════════════════════════════════════════*/
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mode: 'LOCAL (memoria)', square: 'configurado', orders: orders.length });
});

/* ══ PEDIDO DE PRUEBA ═══════════════════════════════════════*/
app.post('/api/test-order', (req, res) => {
  const { items, customer, orderType, location, notes } = req.body;
  if (!items?.length) return res.status(400).json({ error: 'Faltan items' });

  const loc      = location || 'North Miami';
  const orderNum = nextOrderNum(loc);
  const now      = new Date().toISOString();
  const id       = 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);

  orders.push({ id, source: 'web', location: loc, status: 'new',
    order_type: orderType || 'pickup', customer: customer || { name: 'Cliente Test', phone: '' },
    items: items || [], notes: notes || '', amount: 0,
    order_num: orderNum, createdAt: now, created_at: now });

  supabaseInsert({
    customer_name:  customer?.name  || 'Cliente Test',
    customer_phone: customer?.phone || '',
    items, total: 0, order_type: orderType || 'pickup',
    location: loc, notes: notes || '', status: 'new',
  });
  console.log(`[WEB] Pedido #${orderNum} en ${loc} — ${items.length} ítem(s)`);
  res.json({ success: true, orderId: id, orderNum });
});

/* ══ GET PEDIDOS ════════════════════════════════════════════*/
app.get('/api/orders', (req, res) => {
  const { location } = req.query;
  let result = orders.filter(o => o.status !== 'completed');
  if (location) result = result.filter(o => o.location === location);
  result.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(result);
});

/* ══ PATCH ESTADO ═══════════════════════════════════════════*/
app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const valid = ['new','preparing','ready','completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado inválido' });
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  order.status = status;
  res.json({ success: true });
});

/* ══ SQUARE ══════════════════════════════════════════════════*/
function squareRequest(method, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const data    = body ? JSON.stringify(body) : null;
    const headers = { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-05-15' };
    if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = Buffer.byteLength(data); }
    const req = https.request({ hostname: SQUARE_HOST, path: reqPath, method, headers }, res => {
      res.setEncoding('utf8'); // evita cortar caracteres UTF-8 (í, ñ) entre chunks
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('Respuesta inválida')); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* ══ CLOVER ══════════════════════════════════════════════════*/
// Capitaliza una palabra ("backyard" → "Backyard")
function capWord(s) {
  s = (s || '').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
// Limpia la nota de una orden To Go: quita el prefijo "llevar"/"para llevar"/"llevR"
// (lo que el mesero escribe por costumbre) y deja solo el nombre real, si lo hay.
// "llevar xhuxa" → "Xhuxa"   ·   "llevar" → ""   ·   "luis" → "Luis"
function cleanToGoName(note) {
  let s = (note || '').trim();
  if (!s) return '';
  s = s.replace(/^\s*(para\s+)?llev(ar|er|r)?\b[\s:.\-]*/i, '').trim();
  return s ? capWord(s) : '';
}
// Arma el nombre que se muestra en el KDS a partir del título/nota de Clover.
//  - Título con sección "6 - Backyard" / "V - Patio"  → "Backyard 6" / "Patio V"
//  - Título vacío = orden To Go (para llevar): usa la nota como nombre;
//    sin nota → "PARA LLEVAR"
function cloverCustomer(title, note) {
  const t = (title || '').trim();
  if (t) {
    const dash = t.indexOf(' - ');
    if (dash !== -1) {
      const mesa    = t.slice(0, dash).trim().toUpperCase();
      const seccion = t.slice(dash + 3).trim();
      if (!mesa) return seccion ? capWord(seccion) : 'Cliente POS';
      // Backyard = salón principal → se muestra como "Mesa X"
      if (!seccion || /^backyard$/i.test(seccion)) return 'Mesa ' + mesa;
      // Otras secciones (Patio…) → "Patio X" para distinguir el área
      return capWord(seccion) + ' ' + mesa;
    }
    return t; // título sin guion → mostrar tal cual
  }
  // Sin título = To Go / para llevar
  return cleanToGoName(note) || 'PARA LLEVAR';
}
function cloverRequest(method, reqPath, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };
    const req = https.request({ hostname: CLOVER_HOST, path: reqPath, method, headers }, res => {
      res.setEncoding('utf8');
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch(e) { reject(new Error('Respuesta inválida')); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function shiftSince() {
  const now = new Date();
  const cutoff = new Date(now);
  if (cutoff.getHours() < 18) cutoff.setDate(cutoff.getDate() - 1); // antes de 6pm → turno anterior
  cutoff.setHours(18, 0, 0, 0);
  return cutoff;
}

async function pollClover(loc) {
  if (!loc || !loc.token || !loc.merchantId) return; // sede Clover sin credenciales → omitir
  if (loc._busy) return; loc._busy = true;

  const sinceMs = shiftSince().getTime();

  try {
    const qp = 'expand=lineItems.modifications,orderType&filter=' + encodeURIComponent('createdTime>=' + sinceMs) + '&limit=500';
    const result = await cloverRequest('GET', `/v3/merchants/${loc.merchantId}/orders?${qp}`, loc.token);
    const els = result.elements || [];


    for (const ord of els) {
      const lineItems = (ord.lineItems?.elements || []).filter(li => li.name);

      // Borrar del KDS SOLO si Clover la marcó borrada (state 'deleted').
      // NO borrar por venir con lineItems vacíos: una lectura parcial/transitoria o una
      // orden cerrada puede llegar vacía y NO debe perderse — cocina aún la necesita.
      if (ord.state === 'deleted') {
        if (knownSquareIds.has(ord.id)) {
          console.log(`[CLOVER][${loc.sede}] Orden BORRADA en Clover → eliminando del KDS: ${ord.id}`);
          supabaseDelete(ord.id);
          knownSquareIds.delete(ord.id);
          const idx = orders.findIndex(o => o.square_id === ord.id);
          if (idx !== -1) orders.splice(idx, 1);
        }
        continue;
      }
      // Sin ítems de cocina → ignorar: ni crear ni borrar.
      if (!lineItems.length) continue;

      const items = lineItems.map(li => {
        // Modificaciones de Clover ("1 No Maiz", "2 No Vegetale", "Bacon Extra").
        const rawMods   = (li.modifications?.elements || []).map(m => (m.name || '').trim()).filter(Boolean);
        // Nota de línea (puede traer varias líneas: "#2 poca salsa", o notas libres "elias").
        const noteLines = (li.note || '').split(/[\n;]+/).map(s => s.trim()).filter(Boolean);

        // "llevar"/"para llevar" suelto = bandera para-llevar; NO entra al parser de hot dogs.
        const isPL   = t => /^(llevar|para\s+llevar)$/i.test(t);
        const llevar = rawMods.some(isPL) || noteLines.some(isPL);

        // Parser ESPECÍFICO de Clover sobre las modificaciones (clasifica por hot dog 1/2 o general).
        const parsed = parseCloverCompositeModifiers(rawMods.filter(t => !isPL(t)));

        // Notas de línea (sin llevar): numeradas → su hot dog; LIBRES → se conservan como nota (📝).
        const freeNotes = [];
        for (const n of noteLines.filter(t => !isPL(t))) {
          const p = detectComponentPrefix(n);
          if (p.componentIndex === 1)      parsed.component1.notes.push(capFirst(p.instruction));
          else if (p.componentIndex === 2) parsed.component2.notes.push(capFirst(p.instruction));
          else                              freeNotes.push(n); // nota libre → no se pierde
        }

        // details PLANO (compat: contador de producción, detección para-llevar, agrupado) — sin prefijos.
        const flatMods = [
          ...parsed.component1.modifiers, ...parsed.component1.notes,
          ...parsed.component2.modifiers, ...parsed.component2.notes,
          ...parsed.generalModifiers, ...parsed.generalNotes,
        ];
        const detalles = [...flatMods, ...(llevar ? ['para llevar'] : [])].join(' · ');

        // Promo de 2 hot dogs (por nombre). La vista por hot dog SOLO se separa si el cliente
        // marcó el Hot Dog 2; si solo hay "1 ..." el cambio aplica a AMBOS → vista plana.
        const isPromo2 = /promo/i.test(li.name || '');
        const splitByHotDog = isPromo2 && hasComponent2(parsed);

        // Notas libres SIEMPRE se muestran como 📝 (no se pierden, ni en promos ni en ítems simples).
        const item = { name: li.name, qty: 1, details: detalles, note_text: freeNotes.join(' · ') };

        if (splitByHotDog) {
          // Vista compuesta: Hot Dog 1 / Hot Dog 2 + general. (Square nunca trae estos campos.)
          item.components   = cloverComponentsForPromo(parsed);
          item.general      = [...parsed.generalModifiers, ...parsed.generalNotes];
          item.rawModifiers = parsed.rawModifiers; // auditoría
        }
        return item;
      });

      // Título vacío en Clover = orden To Go (para llevar)
      const isToGo  = !(ord.title || '').trim();
      const otLabel = (ord.orderType?.label || '').toLowerCase();
      const orderType = isToGo ? 'pickup'
                      : /pick|to.?go|llevar/.test(otLabel) ? 'pickup'
                      : /deliver/.test(otLabel) ? 'delivery'
                      : 'dinein';
      const channel = 'pos';
      // Para To Go la nota ES el nombre (va en customer_name), no se repite en notes
      const orderNotes = isToGo ? '' : (ord.note || '');

      // Orden ya conocida
      if (knownSquareIds.has(ord.id)) {
        const existing = orders.find(o => o.square_id === ord.id);
        if (!existing) {
          orders.push({ id: 'cl-' + ord.id, square_id: ord.id, items });
        } else if (itemsSig(items) !== itemsSig(existing.items)) {
          // La orden Clover queda ABIERTA toda la comida. La diferencia clave es si el
          // cocinero YA preparó lo anterior (la sacó del KDS) o si todavía está pendiente.
          const status = await supabaseGetStatus(ord.id);
          if (status === 'completed') {
            // Ya se preparó esa ronda → lo nuevo es una ronda adicional (Mesa servida)
            const oldAgg = aggItems(existing.items);
            const newAgg = aggItems(items);
            const addedItems = [];
            newAgg.forEach((v, k) => {
              const diff = v.qty - ((oldAgg.get(k) || {}).qty || 0);
              if (diff > 0) {
                // Preservar la NOTA del ítem agregado (mensaje para preparar bien la orden)
                const src = items.find(it => (it.name || '').trim().toLowerCase() === v.name.trim().toLowerCase()
                                          && normDetails(it.details) === normDetails(v.details) && (it.note_text || '').trim());
                addedItems.push({ name: v.name, details: v.details, qty: diff, note_text: (src && src.note_text) || '' });
              }
            });
            existing.items = items;
            if (addedItems.length > 0) {
              const customerName = cloverCustomer(ord.title, ord.note);
              console.log(`[CLOVER][${loc.sede}] ${customerName} — ${addedItems.length} ítem(s) adicionales (ronda nueva)`);
              supabaseInsert({
                customer_name: customerName, customer_phone: '',
                items: addedItems, total: 0, order_type: orderType, channel,
                location: loc.sede, notes: 'Mesa servida', status: 'new',
                payment_id: ord.id + '_add_' + hashStr(itemsSig(items)),
              });
            }
          } else {
            // Aún pendiente en el KDS → actualizar EL MISMO ticket (no duplicar)
            existing.items = items;
            supabasePatch(ord.id, { items });
          }
        }
        continue;
      }

      knownSquareIds.add(ord.id);

      const customerName = cloverCustomer(ord.title, ord.note);
      const total        = (ord.total || 0) / 100;
      const orderNum     = nextOrderNum(loc.sede);
      const now          = new Date().toISOString();
      const createdIso   = ord.createdTime ? new Date(ord.createdTime).toISOString() : now;

      orders.push({
        id: 'cl-' + ord.id, source: 'clover', square_id: ord.id,
        location: loc.sede, status: 'new', order_type: orderType,
        customer: { name: customerName, phone: '' },
        items, notes: orderNotes, amount: total,
        order_num: orderNum, createdAt: createdIso, created_at: createdIso,
      });

      supabaseInsert({
        customer_name: customerName, customer_phone: '',
        items, total, order_type: orderType, channel,
        location: loc.sede, notes: orderNotes, status: 'new',
        payment_id: ord.id,
      });

      console.log(`[CLOVER][${loc.sede}] Orden #${orderNum}: ${items.map(i=>`${i.qty}x ${i.name}`).join(', ')} | ${customerName}`);
    }
  } catch(e) {
    console.log(`[CLOVER][${loc.sede}] Error polling: ${e.message}`);
  } finally { loc._busy = false; }
}

async function pollSquare(loc) {
  if (!loc || !loc.token || !loc.locId) return; // sede sin credenciales → omitir
  if (loc._busy) return; loc._busy = true;

  const startOfDay = shiftSince();

  try {
    // Buscar ÓRDENES desde que se crean — NO esperar al pago
    const result = await squareRequest('POST', '/v2/orders/search', {
      location_ids: [loc.locId],
      query: {
        filter: {
          date_time_filter: {
            created_at: { start_at: startOfDay.toISOString() }
          }
        },
        sort: { sort_field: 'CREATED_AT', sort_order: 'DESC' }
      },
      limit: 500
    }, loc.token);

    for (const ord of (result.orders || [])) {
      const lineItems = (ord.line_items || []).filter(li => li.name && li.item_type !== 'CUSTOM_AMOUNT');

      // Borrar del KDS SOLO si Square la canceló explícitamente (state CANCELED).
      // NO borrar por venir con line_items vacíos: una orden pagada/cerrada (COMPLETED) o
      // una lectura parcial/transitoria de Square puede llegar vacía y NO debe perderse —
      // cocina todavía la necesita. (Antes esto borraba órdenes reales al pagarlas.)
      if (ord.state === 'CANCELED') {
        if (knownSquareIds.has(ord.id)) {
          console.log(`[SQUARE] Orden CANCELADA en Square → eliminando del KDS: ${ord.id}`);
          supabaseDelete(ord.id);
          knownSquareIds.delete(ord.id);
          const idx = orders.findIndex(o => o.square_id === ord.id);
          if (idx !== -1) orders.splice(idx, 1);
        }
        continue;
      }
      // Sin ítems de cocina (custom amount, vacía, etc.) → ignorar: ni crear ni borrar.
      if (!lineItems.length) continue;

      // Items con variantes y modificadores
      const items = lineItems.map(li => {
        const mods     = (li.modifiers || []).map(m => m.name).filter(Boolean);
        const variante = li.variation_name && !/^(regular|normal|sin\s+variaci[oó]n)$/i.test(li.variation_name) ? li.variation_name : '';
        const detalles = [variante, ...mods].filter(Boolean).join(' · ');
        return { name: li.name, qty: parseInt(li.quantity) || 1, details: detalles, note_text: (li.note || '').trim() };
      });

      // Tipo de entrega según fulfillment de Square
      // IN_STORE = comer aquí (mostrador) | PICKUP = para llevar | DELIVERY = delivery
      const fType = (ord.fulfillments?.[0]?.type || '').toUpperCase();
      const orderType = fType === 'PICKUP' ? 'pickup'
                      : fType === 'DELIVERY' ? 'delivery'
                      : 'dinein';

      // Canal de venta según source.name de Square
      const srcName = (ord.source?.name || '').toLowerCase();
      const channel = /uber/.test(srcName)     ? 'uber'
                    : /doordash|door dash/.test(srcName) ? 'doordash'
                    : /grubhub/.test(srcName)  ? 'grubhub'
                    : 'pos';

      // Orden ya conocida → ¿cambió el contenido?
      if (knownSquareIds.has(ord.id)) {
        const existing = orders.find(o => o.square_id === ord.id);
        if (!existing) {
          // Backend reiniciado: knownSquareIds la tiene pero orders[] está vacío.
          // Guardamos el estado actual para detectar cambios futuros.
          orders.push({ id: 'sq-' + ord.id, square_id: ord.id, items });
        } else if (itemsSig(items) !== itemsSig(existing.items)) {
          // La orden cambió de verdad (no solo reordenamiento de modificadores).
          // La clave es si la ronda original YA fue preparada/empacada o sigue pendiente.
          const status = await supabaseGetStatus(ord.id);
          const prepared = (status === 'completed' || status === 'packing');
          if (prepared) {
            // Ronda anterior YA preparada → SOLO lo añadido va a una RONDA NUEVA (Mesa servida).
            const oldAgg = aggItems(existing.items);
            const newAgg = aggItems(items);
            const addedItems = [];
            newAgg.forEach((v, k) => {
              const diff = v.qty - ((oldAgg.get(k) || {}).qty || 0);
              if (diff > 0) {
                // Preservar la NOTA del ítem agregado (mensaje para preparar bien la orden)
                const src = items.find(it => (it.name || '').trim().toLowerCase() === v.name.trim().toLowerCase()
                                          && normDetails(it.details) === normDetails(v.details) && (it.note_text || '').trim());
                addedItems.push({ name: v.name, details: v.details, qty: diff, note_text: (src && src.note_text) || '' });
              }
            });
            existing.items = items; // actualizar caché local
            if (addedItems.length > 0) {
              const customerName = ord.ticket_name || 'Cliente POS';
              console.log(`[SQUARE][${loc.sede}] ${customerName} — ${addedItems.length} ítem(s) adicionales (ronda nueva)`);
              supabaseInsert({
                customer_name: customerName, customer_phone: '',
                items: addedItems, total: 0, order_type: orderType, channel,
                location: loc.sede, notes: 'Mesa servida', status: 'new',
                // ID determinista según el contenido actual → el índice único evita duplicados
                payment_id: ord.id + '_add_' + hashStr(itemsSig(items)),
              });
            }
          } else {
            // Ronda original AÚN pendiente → actualizar EL MISMO ticket con la versión
            // completa de Square. Refleja artículos eliminados, cantidades reducidas,
            // modificadores cambiados y nuevos agregados, sin crear ticket aparte.
            existing.items = items;
            supabasePatch(ord.id, { items });
          }
        }
        continue;
      }

      knownSquareIds.add(ord.id);

      const customerName = ord.ticket_name || 'Cliente POS';
      const orderNote    = ord.metadata?.note || '';
      const total        = (ord.total_money?.amount || 0) / 100;
      const orderNum     = nextOrderNum(loc.sede);
      const now          = new Date().toISOString();

      orders.push({
        id: 'sq-' + ord.id, source: 'pos', square_id: ord.id,
        location: loc.sede, status: 'new', order_type: orderType,
        customer: { name: customerName, phone: '' },
        items, notes: orderNote, amount: total,
        order_num: orderNum, createdAt: ord.created_at || now, created_at: ord.created_at || now,
      });

      supabaseInsert({
        customer_name: customerName, customer_phone: '',
        items, total, order_type: orderType, channel,
        location: loc.sede, notes: orderNote, status: 'new',
        payment_id: ord.id,
      });

      console.log(`[SQUARE][${loc.sede}] Orden #${orderNum}: ${items.map(i=>`${i.qty}x ${i.name}`).join(', ')} | ${customerName}`);
    }
  } catch(e) {
    console.log(`[SQUARE][${loc.sede}] Error polling: ${e.message}`);
  } finally { loc._busy = false; }
}

/* ══ INIT: cargar IDs de Square ya existentes en Supabase ═══*/
function initKnownIds() {
  return new Promise(resolve => {
    const today = shiftSince(); // desde las 6pm del turno activo
    const qs = `select=payment_id&created_at=gte.${encodeURIComponent(today.toISOString())}&payment_id=not.is.null`;
    const req = https.request({
      hostname: SUPABASE_URL,
      path:     '/rest/v1/web_orders?' + qs,
      method:   'GET',
      headers:  { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const rows = JSON.parse(raw);
          rows.forEach(r => { if (r.payment_id) knownSquareIds.add(r.payment_id); });
          console.log(`   IDs Square conocidos: ${knownSquareIds.size}`);
        } catch(e) {}
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.end();
  });
}

/* ══ ARRANCAR ═══════════════════════════════════════════════*/
app.listen(PORT, async () => {
  console.log(`\n🌭 Hot Dog Maracay Backend LOCAL · Puerto ${PORT}`);
  console.log(`   Polling cada 1s`);
  LOCATIONS.forEach(l => {
    if (locReady(l)) console.log(`   ✓ ${l.sede} (${l.provider})`);
    else             console.log(`   ⏳ ${l.sede} pendiente de credenciales (${l.provider})`);
  });
  await initKnownIds();
  const pollAll = () => LOCATIONS.forEach(loc => (loc.provider === 'clover' ? pollClover : pollSquare)(loc));
  setInterval(pollAll, 1000);
  pollAll();
});
