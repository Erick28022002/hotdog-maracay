/**
 * Hot Dog Maracay — Backend KDS + Pagos
 * Express + SQLite + Square Orders API
 *
 * Endpoints:
 *   POST  /api/pay              Procesar pago web (desde hotdogmaracay.com)
 *   GET   /api/orders?location= Obtener pedidos de una sede (para el KDS)
 *   PATCH /api/orders/:id       Actualizar estado de un pedido
 *   GET   /health               Health check
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const Database = require('better-sqlite3');
const https    = require('https');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ══ CONFIGURACIÓN ════════════════════════════════════════════
   Todas las variables sensibles vienen de Railway → Variables
═════════════════════════════════════════════════════════════*/
const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN || '';
const SQUARE_ENV   = (process.env.SQUARE_ENV || 'production').toLowerCase();
const SQUARE_HOST  = SQUARE_ENV === 'sandbox'
  ? 'connect.squareupsandbox.com'
  : 'connect.squareup.com';

// Mapa: nombre de sede → Square Location ID
const SEDES = {
  'North Miami':    process.env.LOC_NORTHMIAMI || '',
  'Doral':          process.env.LOC_DORAL      || '',
  'Downtown Miami': process.env.LOC_DOWNTOWN   || '',
};

/* ══ BASE DE DATOS ════════════════════════════════════════════*/
const db = new Database('./orders.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL DEFAULT 'web',
    square_id   TEXT UNIQUE,
    location    TEXT NOT NULL DEFAULT '',
    location_id TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'new',
    order_type  TEXT NOT NULL DEFAULT 'pickup',
    customer    TEXT NOT NULL DEFAULT '{}',
    items       TEXT NOT NULL DEFAULT '[]',
    notes       TEXT NOT NULL DEFAULT '',
    amount      INTEGER NOT NULL DEFAULT 0,
    order_num   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS counters (
    key   TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  );
`);

/* Número de pedido diario por sede */
function nextOrderNum(sede) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key   = `${sede}:${today}`;
  db.prepare(`INSERT INTO counters (key, value) VALUES (?, 1)
              ON CONFLICT(key) DO UPDATE SET value = value + 1`).run(key);
  return db.prepare('SELECT value FROM counters WHERE key = ?').get(key).value;
}

/* ══ MIDDLEWARES ══════════════════════════════════════════════*/
app.use(cors({
  origin: [
    'https://hotdogmaracay.com',
    'https://www.hotdogmaracay.com',
    /^http:\/\/localhost(:\d+)?$/,
    /^file:\/\//,
    /^null$/,  // archivos locales abiertos directamente en el navegador
  ],
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
}));
app.use(express.json({ limit: '1mb' }));

/* ══ ROUTES ══════════════════════════════════════════════════*/

/* Health check */
app.get('/health', (_req, res) => {
  const sedesConf = Object.entries(SEDES)
    .map(([name, id]) => `${name}: ${id || '⚠ SIN CONFIGURAR'}`)
    .join(', ');
  res.json({
    status: 'ok',
    squareConnected: !!SQUARE_TOKEN,
    sedes: sedesConf,
  });
});

/* ── Pago web ─────────────────────────────────────────────────
   Recibe el pedido de la web, cobra con Square y lo guarda.
─────────────────────────────────────────────────────────────*/
app.post('/api/pay', async (req, res) => {
  const { sourceId, amount, items, customer, orderType, location, notes } = req.body;

  if (!sourceId || !amount || !items?.length) {
    return res.status(400).json({ error: 'Faltan datos del pedido' });
  }

  const locationId = SEDES[location] || Object.values(SEDES).find(Boolean) || '';

  try {
    // 1. Procesar pago con Square
    const payBody = {
      source_id:         sourceId,
      amount_money:      { amount: Math.round(amount), currency: 'USD' },
      location_id:       locationId,
      idempotency_key:   crypto.randomUUID(),
      buyer_email_address: customer?.email || undefined,
      note: `Pedido web · ${location} · ${customer?.name || 'Cliente'}`,
    };

    const payResult = await squareRequest('POST', '/v2/payments', payBody);

    if (payResult.errors?.length) {
      const msg = payResult.errors[0].detail || 'Error al procesar el pago';
      return res.status(402).json({ error: msg });
    }

    const payment = payResult.payment;

    // 2. Guardar pedido en la base de datos
    const id       = 'web-' + payment.id;
    const orderNum = nextOrderNum(location);
    const now      = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO orders
        (id, source, square_id, location, location_id, status, order_type,
         customer, items, notes, amount, order_num, created_at, updated_at)
      VALUES (?,?,?,?,?,'new',?,?,?,?,?,?,?,?)
    `).run(
      id, 'web', payment.id,
      location || '', locationId,
      orderType || 'pickup',
      JSON.stringify(customer || {}),
      JSON.stringify(items || []),
      notes || '',
      Math.round(amount),
      orderNum,
      now, now
    );

    res.json({ success: true, orderId: id, paymentId: payment.id });

  } catch (err) {
    console.error('[/api/pay]', err.message);
    res.status(500).json({ error: 'Error interno. Intenta de nuevo.' });
  }
});

/* ── GET pedidos para el KDS ─────────────────────────────────
   ?location=North Miami  → pedidos de esa sede
   ?location_id=Lxxx      → por ID de Square
   Sin parámetros          → todos los pedidos activos
─────────────────────────────────────────────────────────────*/
app.get('/api/orders', (req, res) => {
  const { location, location_id } = req.query;

  let sql    = `SELECT * FROM orders WHERE status != 'completed' ORDER BY created_at ASC`;
  let params = [];

  if (location) {
    sql    = `SELECT * FROM orders WHERE status != 'completed' AND location = ? ORDER BY created_at ASC`;
    params = [location];
  } else if (location_id) {
    sql    = `SELECT * FROM orders WHERE status != 'completed' AND location_id = ? ORDER BY created_at ASC`;
    params = [location_id];
  }

  const rows = db.prepare(sql).all(...params);

  const orders = rows.map(row => ({
    ...row,
    customer:  safeJSON(row.customer, {}),
    items:     safeJSON(row.items, []),
    orderType: row.order_type,
    createdAt: row.created_at,
    orderNum:  row.order_num,
  }));

  res.json(orders);
});

/* ── Pedido de prueba (sin pago) ─────────────────────────────
   Para testear el flujo web → KDS sin procesar pago real.
   body: { items, customer, orderType, location, notes }
─────────────────────────────────────────────────────────────*/
app.post('/api/test-order', (req, res) => {
  const { items, customer, orderType, location, notes } = req.body;

  if (!items?.length) {
    return res.status(400).json({ error: 'Faltan items' });
  }

  const loc      = location || 'North Miami';
  const id       = 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const orderNum = nextOrderNum(loc);
  const now      = new Date().toISOString();

  db.prepare(`
    INSERT INTO orders
      (id, source, square_id, location, location_id, status, order_type,
       customer, items, notes, amount, order_num, created_at, updated_at)
    VALUES (?,?,?,?,?,'new',?,?,?,?,?,?,?,?)
  `).run(
    id, 'web', null,
    loc, '',
    orderType || 'pickup',
    JSON.stringify(customer || { name: 'Cliente Test', phone: '' }),
    JSON.stringify(items),
    notes || '',
    0,
    orderNum,
    now, now
  );

  console.log(`[TEST] Pedido de prueba creado en ${loc}: ${id}`);
  res.json({ success: true, orderId: id, orderNum });
});

/* ── PATCH estado de pedido ──────────────────────────────────
   body: { status: 'preparing' | 'ready' | 'completed' }
─────────────────────────────────────────────────────────────*/
app.patch('/api/orders/:id', (req, res) => {
  const { status } = req.body;
  const valid = ['new', 'preparing', 'ready', 'completed'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }

  const result = db.prepare(
    `UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`
  ).run(status, new Date().toISOString(), req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json({ success: true });
});

/* ══ SQUARE ORDERS API — POLLING POS ════════════════════════
   Consulta Square cada 5 segundos para capturar pedidos del POS
   y de cualquier otro canal (Square Online, Dashboard, etc.)
═════════════════════════════════════════════════════════════*/
async function pollSquarePOS() {
  if (!SQUARE_TOKEN) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  for (const [sedeName, locationId] of Object.entries(SEDES)) {
    if (!locationId) continue;

    try {
      const result = await squareRequest('POST', '/v2/orders/search', {
        location_ids: [locationId],
        query: {
          filter: {
            state_filter:     { states: ['OPEN', 'IN_PROGRESS'] },
            date_time_filter: { created_at: { start_at: startOfDay.toISOString() } },
          },
          sort: { sort_field: 'CREATED_AT', sort_order: 'ASC' },
        },
        limit: 50,
      });

      for (const sqOrder of (result.orders || [])) {
        // Ignorar si ya existe en nuestra DB
        const exists = db.prepare('SELECT id FROM orders WHERE square_id = ?').get(sqOrder.id);
        if (exists) continue;

        // Normalizar ítems del pedido de Square POS
        const items = (sqOrder.line_items || []).map(li => ({
          name:    li.name || 'Producto',
          qty:     parseInt(li.quantity) || 1,
          price:   li.gross_sales_money?.amount || 0,
          details: li.note || '',
        }));

        // Tipo de pedido y datos del cliente
        const ful       = sqOrder.fulfillments?.[0];
        const orderType = ful?.type === 'DELIVERY' ? 'delivery' : 'pickup';
        const recipient = ful?.pickup_details?.recipient || ful?.delivery_details?.recipient || {};
        const customer  = {
          name:  recipient.display_name || 'Cliente POS',
          phone: recipient.phone_number || '',
          email: recipient.email_address || '',
        };

        const id       = 'pos-' + sqOrder.id;
        const orderNum = nextOrderNum(sedeName);
        const now      = new Date().toISOString();

        db.prepare(`
          INSERT OR IGNORE INTO orders
            (id, source, square_id, location, location_id, status, order_type,
             customer, items, notes, amount, order_num, created_at, updated_at)
          VALUES (?,?,?,?,?,'new',?,?,?,?,?,?,?,?)
        `).run(
          id, 'pos', sqOrder.id,
          sedeName, locationId,
          orderType,
          JSON.stringify(customer),
          JSON.stringify(items),
          sqOrder.note || '',
          sqOrder.total_money?.amount || 0,
          orderNum,
          sqOrder.created_at || now, now
        );

        console.log(`[POS] Nuevo pedido en ${sedeName}: ${sqOrder.id}`);
      }

    } catch (err) {
      console.error(`[POS poll ${sedeName}]`, err.message);
    }
  }
}

/* ══ HELPER: llamadas a Square API ══════════════════════════*/
function squareRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req  = https.request({
      hostname: SQUARE_HOST,
      path,
      method,
      headers: {
        'Authorization':  `Bearer ${SQUARE_TOKEN}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Square-Version': '2024-05-15',
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Respuesta inválida de Square')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/* ══ HELPER: JSON seguro ════════════════════════════════════*/
function safeJSON(str, fallback) {
  if (typeof str !== 'string') return str || fallback;
  try { return JSON.parse(str); } catch(e) { return fallback; }
}

/* ══ ARRANCAR SERVIDOR ══════════════════════════════════════*/
app.listen(PORT, () => {
  console.log(`\n🌭 Hot Dog Maracay Backend · Puerto ${PORT}`);
  console.log(`   Square: ${SQUARE_ENV} | Token: ${SQUARE_TOKEN ? '✓ configurado' : '✗ FALTA'}`);
  console.log('   Sedes:');
  for (const [name, id] of Object.entries(SEDES)) {
    console.log(`     ${id ? '✓' : '✗'} ${name}: ${id || 'SIN CONFIGURAR'}`);
  }

  if (SQUARE_TOKEN) {
    setInterval(pollSquarePOS, 5000);
    pollSquarePOS();
    console.log('\n   Square POS polling: ✓ activo (cada 5s)');
  } else {
    console.log('\n   ⚠️  Square POS polling: inactivo (configura SQUARE_ACCESS_TOKEN en Railway)');
  }
  console.log('');
});
