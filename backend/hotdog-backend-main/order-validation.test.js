'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTrustedOrder } = require('./order-validation');

function promoSelections() {
  return {
    removedToppings: [['Cebolla'], []],
    extras: [['Tocineta'], ['Queso de Mano']],
    sauces: ['Ajo', 'Piña'],
    drink: 'Frescolita',
    note: 'Bien caliente'
  };
}

test('calcula precios, extras e impuesto desde el catalogo del servidor', () => {
  const order = buildTrustedOrder([{
    productId: 'promo-clasica',
    qty: 1,
    price: 0.01,
    selections: promoSelections()
  }]);

  assert.equal(order.items[0].unitCents, 2000);
  assert.equal(order.subtotalCents, 2000);
  assert.equal(order.taxCents, 140);
  assert.equal(order.totalCents, 2140);
});

test('ignora nombres y precios inventados por el cliente', () => {
  const order = buildTrustedOrder([{
    productId: 'beb-agua',
    name: 'Producto gratis',
    price: -100,
    qty: 2
  }]);

  assert.equal(order.items[0].name, 'Agua');
  assert.equal(order.items[0].unitCents, 200);
  assert.equal(order.totalCents, 428);
});

test('rechaza productos inexistentes', () => {
  assert.throws(() => buildTrustedOrder([{ productId: 'producto-falso', qty: 1 }]), /no disponible/);
});

test('rechaza personalizaciones incompletas', () => {
  const selections = promoSelections();
  selections.sauces = [];
  assert.throws(() => buildTrustedOrder([{ productId: 'promo-clasica', qty: 1, selections }]), /salsa/);
});

test('rechaza cantidades fuera de limites', () => {
  assert.throws(() => buildTrustedOrder([{ productId: 'beb-agua', qty: 21 }]), /Cantidad invalida/);
});
