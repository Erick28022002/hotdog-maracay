'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { SquareClient, SquareEnvironment } = require('square');
const { getSquareOrder, verifySquareWebhookSignature } = require('./square-compat');
const {
  claimCheckoutAttempt,
  persistApprovedCheckout,
  reconcileApprovedCheckout
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
