'use strict';

const crypto = require('crypto');

async function getSquareOrder(squareClient, orderId) {
  if (!squareClient?.orders || typeof squareClient.orders.get !== 'function') {
    throw new TypeError('Square SDK incompatible: orders.get no esta disponible');
  }
  return squareClient.orders.get({ orderId });
}

function verifySquareWebhookSignature({ rawBody, signature, signatureKey, notificationUrl }) {
  const expected = crypto
    .createHmac('sha256', signatureKey)
    .update(notificationUrl + rawBody)
    .digest('base64');
  const receivedBuffer = Buffer.from(String(signature || ''));
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

module.exports = { getSquareOrder, verifySquareWebhookSignature };
