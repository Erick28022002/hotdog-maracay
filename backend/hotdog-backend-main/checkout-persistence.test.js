'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { SquareClient, SquareEnvironment } = require('square');
const { getSquareOrder, verifySquareWebhookSignature } = require('./square-compat');
const {
  claimCheckoutAttempt,
  persistApprovedCheckout,
  reconcileApprovedCheckout,
  webOrderFromAttempt,
  locationDisplayName
} = require('./checkout-persistence');
const app = require('./server');

function duplicateError() {
  return Object.assign(new Error('duplicate'), { code: '23505' });
}

function fakeRepository() {
  const attempts = new Map();
  const orders = new Map();
  return {
    attempts,
    orders,
    failNextOrderInsert: false,
    async insertAttempt(record) {
      if (attempts.has(record.checkout_attempt_id)) throw duplicateError();
      attempts.set(record.checkout_attempt_id, { ...record });
      return attempts.get(record.checkout_attempt_id);
    },
    async getAttempt(id) { return attempts.get(id) || null; },
    async updateAttempt(id, changes) {
      const updated = { ...attempts.get(id), ...changes };
      attempts.set(id, updated);
      return updated;
    },
    async insertWebOrder(record) {
      if (this.failNextOrderInsert) {
        this.failNextOrderInsert = false;
        throw Object.assign(new Error('Supabase unavailable'), { code: 'SUPABASE_DOWN' });
      }
      if (orders.has(record.checkout_attempt_id)) throw duplicateError();
      const order = { id: `order-${orders.size + 1}`, ...record };
      orders.set(record.checkout_attempt_id, order);
      return order;
    },
    async getWebOrder(id) { return orders.get(id) || null; },
    async countActiveOrders(location) {
      return [...orders.values()].filter(order =>
        order.location === location &&
        !['ready', 'completed', 'complete', 'done', 'cancelled', 'canceled'].includes(order.status)
      ).length;
    }
  };
}

function approvedAttempt(id) {
  return {
    checkout_attempt_id: id,
    square_order_id: 'square-order-1',
    payment_id: 'square-payment-1',
    payment_status: 'approved',
    persistence_status: 'pending',
    customer: { name: 'Prueba', phone: '3055550100', email: '' },
    items: [{ id: 'beb-agua', name: 'Agua', price: 2, qty: 1 }],
    total: 2.14,
    receipt_url: 'https://squareup.com/receipt/1',
    order_type: 'pickup',
    location: 'nmb',
    notes: ''
  };
}

test('SDK Square 40 expone orders.get({ orderId }) y no retrieve', () => {
  const client = new SquareClient({ token: 'sandbox-test', environment: SquareEnvironment.Sandbox });
  assert.equal(typeof client.orders.get, 'function');
  assert.equal(typeof client.orders.retrieve, 'undefined');
});

test('webhook firmado consulta order.created mediante orders.get', async () => {
  const notificationUrl = 'https://example.test/webhook/square';
  const rawBody = JSON.stringify({ type: 'order.created', data: { object: { order_created: { order_id: 'O1' } } } });
  const signatureKey = 'sandbox-signature-key';
  const signature = crypto.createHmac('sha256', signatureKey).update(notificationUrl + rawBody).digest('base64');
  assert.equal(verifySquareWebhookSignature({ rawBody, signature, signatureKey, notificationUrl }), true);

  const calls = [];
  const response = await getSquareOrder({ orders: { get: async request => { calls.push(request); return { order: { id: request.orderId } }; } } }, 'O1');
  assert.deepEqual(calls, [{ orderId: 'O1' }]);
  assert.equal(response.order.id, 'O1');
});

test('repetir checkout_attempt_id reclama un solo intento', async () => {
  const repository = fakeRepository();
  const id = '11111111-1111-4111-8111-111111111111';
  const record = approvedAttempt(id);
  const first = await claimCheckoutAttempt(repository, record);
  const second = await claimCheckoutAttempt(repository, record);
  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(repository.attempts.size, 1);
});

test('pago sandbox simulado registra una sola orden al repetir persistencia', async () => {
  const repository = fakeRepository();
  const id = '33333333-3333-4333-8333-333333333333';
  const attempt = approvedAttempt(id);
  await repository.insertAttempt(attempt);

  const first = await persistApprovedCheckout(repository, attempt);
  const second = await persistApprovedCheckout(repository, attempt);
  assert.equal(first.persisted, true);
  assert.equal(second.persisted, true);
  assert.equal(repository.orders.size, 1);
  assert.equal(repository.attempts.get(id).persistence_status, 'persisted');
});

test('fallo de Supabase despues del pago queda verificable y se reconcilia sin otra orden', async () => {
  const repository = fakeRepository();
  const id = '22222222-2222-4222-8222-222222222222';
  const attempt = approvedAttempt(id);
  await repository.insertAttempt(attempt);
  repository.failNextOrderInsert = true;

  const failed = await persistApprovedCheckout(repository, attempt);
  assert.equal(failed.persisted, false);
  assert.equal(repository.attempts.get(id).payment_status, 'approved');
  assert.equal(repository.attempts.get(id).persistence_status, 'failed');
  assert.equal(repository.orders.size, 0);

  const reconciled = await reconcileApprovedCheckout(repository, id);
  assert.equal(reconciled.persisted, true);
  assert.equal(repository.orders.size, 1);

  const repeated = await reconcileApprovedCheckout(repository, id);
  assert.equal(repeated.persisted, true);
  assert.equal(repository.orders.size, 1);
});

test('guarda location con el nombre exacto que filtra el KDS real', () => {
  const order = webOrderFromAttempt(approvedAttempt('55555555-5555-4555-8555-555555555555'));
  assert.equal(order.location, 'North Miami');
  assert.equal(order.sede, 'nmb');
  assert.equal(locationDisplayName('doral'), 'Doral');
  assert.equal(locationDisplayName('downtown'), 'Downtown Miami');
});

test('las ordenes web quedan marcadas como pickup web para empacado en meseras', () => {
  const order = webOrderFromAttempt(approvedAttempt('66666666-6666-4666-8666-666666666666'));
  assert.equal(order.channel, 'web');
  assert.equal(order.order_type, 'pickup');
  assert.equal(order.status, 'paid');
});

test('respuestas de pago no exponen ids internos de Square', async () => {
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/pay/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutAttemptId: 'bad-id' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(Object.hasOwn(body, 'paymentId'), false);
    assert.equal(Object.hasOwn(body, 'squareOrderId'), false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rechaza delivery en checkout web mientras solo existe pickup', async () => {
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'cnon:card-nonce-ok',
        checkoutAttemptId: '44444444-4444-4444-8444-444444444444',
        items: [{ productId: 'beb-agua', qty: 1 }],
        customer: { name: 'Cliente Prueba', phone: '3055550100', email: '' },
        orderType: 'delivery',
        location: 'nmb',
        notes: ''
      })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /Tipo de orden/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('responde JSON limpio cuando el cuerpo excede el limite', async () => {
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'x'.repeat(40000) })
    });
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.success, false);
    assert.match(body.error, /grande/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('responde JSON limpio cuando el cuerpo no es JSON valido', async () => {
  const server = app.listen(0);
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${baseUrl}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"sourceId":'
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.match(body.error, /JSON/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
