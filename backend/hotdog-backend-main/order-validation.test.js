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

test('combo de 2 hot dogs: modificadores en components/general, formato que kds.html reconoce', () => {
  const order = buildTrustedOrder([{
    productId: 'promo-clasica',
    qty: 1,
    selections: promoSelections()
  }]);
  const item = order.items[0];

  assert.equal(item.details, '');
  assert.equal(item.components.length, 2);
  assert.equal(item.components[0].name, 'Hot Dog 1');
  assert.deepEqual(item.components[0].mods, ['sin Cebolla', 'extra Tocineta']);
  assert.equal(item.components[1].name, 'Hot Dog 2');
  assert.deepEqual(item.components[1].mods, ['extra Queso de Mano']);
  assert.deepEqual(item.general, ['Ajo', 'Pina', 'Frescolita']);
  assert.equal(item.noteText, 'Bien caliente');
});

test('un solo hot dog: modificadores como string plano separado por " · "', () => {
  const order = buildTrustedOrder([{
    productId: 'hd-clasico',
    qty: 1,
    selections: {
      removedToppings: [['Cebolla']],
      extras: [['Tocineta']],
      sauces: ['Ajo'],
      drink: undefined,
      note: ''
    }
  }]);
  const item = order.items[0];

  assert.equal(item.components, null);
  assert.equal(item.details, 'sin Cebolla · extra Tocineta · Ajo');
});
