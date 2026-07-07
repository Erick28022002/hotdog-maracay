'use strict';

const TAX_PERCENTAGE = '7';
const TAX_RATE = 0.07;
const MAX_ITEMS = 25;
const MAX_TOTAL_QUANTITY = 50;

const TOPPINGS = new Set(['Repollo', 'Cebolla', 'Papitas', 'Maiz', 'Ketchup', 'Mayonesa', 'Mostaza', 'Queso amarillo']);
const EXTRAS = new Map([['Queso de Mano', 200], ['Tocineta', 200]]);
const SAUCES = new Set(['Ajo', 'Chica Sexi', 'Maiz', 'Queso', 'Tocineta', 'Pina', 'Picante', 'BBQ', 'Queso de Ano']);
const DRINKS = new Map([
  ['Coca Cola', 0], ['Coca Cola Zero', 0], ['Diet Coke', 0], ['Sprite', 0],
  ['Nestea Limon', 0], ['Nestea Durazno', 0], ['Frescolita', 350],
  ['Malta', 350], ['Uvita', 350], ['Agua', 0]
]);

const CATALOG = new Map([
  ['promo-especial', { name: 'Promocion Especial', cents: 100, custom: true, hotDogs: 2, drink: true }],
  ['promo-clasica', { name: 'Promo Clasica', cents: 1250, custom: true, hotDogs: 2, drink: true }],
  ['hd-clasico', { name: 'Hot Dog Clasico', cents: 685, custom: true, hotDogs: 1, drink: false }],
  ['promo-mechada', { name: 'Promo de Carne Mechada', cents: 1999, custom: true, hotDogs: 2, drink: true }],
  ['hd-mechada', { name: 'Hot Dog con Carne Mechada', cents: 1099, custom: true, hotDogs: 1, drink: false }],
  ['promo-bacon', { name: 'Promo de Bacon', cents: 1650, custom: true, hotDogs: 2, drink: true }],
  ['hd-bacon', { name: 'Hot Dog con Bacon', cents: 885, custom: true, hotDogs: 1, drink: false }],
  ['promo-queso', { name: 'Promo de Queso de Mano', cents: 1650, custom: true, hotDogs: 2, drink: true }],
  ['hd-queso', { name: 'Hot Dog con Queso de Mano', cents: 885, custom: true, hotDogs: 1, drink: false }],
  ['beb-cola', { name: 'Coca Cola', cents: 350 }],
  ['beb-zero', { name: 'Coca Cola Zero', cents: 350 }],
  ['beb-diet', { name: 'Diet Coke', cents: 350 }],
  ['beb-sprite', { name: 'Sprite', cents: 350 }],
  ['beb-neslim', { name: 'Nestea Limon', cents: 350 }],
  ['beb-nesdur', { name: 'Nestea Durazno', cents: 350 }],
  ['beb-fre', { name: 'Frescolita', cents: 350 }],
  ['beb-malta', { name: 'Malta', cents: 350 }],
  ['beb-uvita', { name: 'Uvita', cents: 350 }],
  ['beb-agua', { name: 'Agua', cents: 200 }]
]);

function cleanText(value, maxLength) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeOption(value) {
  return cleanText(value, 40).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function uniqueAllowed(values, allowed, label, maxLength) {
  if (!Array.isArray(values) || values.length > maxLength) throw new Error(`${label} invalidos`);
  const result = [];
  for (const value of values) {
    const normalized = normalizeOption(value);
    if (!allowed.has(normalized) || result.includes(normalized)) throw new Error(`${label} invalidos`);
    result.push(normalized);
  }
  return result;
}

function buildSelections(product, rawSelections) {
  const selections = rawSelections && typeof rawSelections === 'object' ? rawSelections : {};
  const removedByHotDog = Array.isArray(selections.removedToppings) ? selections.removedToppings : [];
  const extrasByHotDog = Array.isArray(selections.extras) ? selections.extras : [];
  if (removedByHotDog.length !== product.hotDogs || extrasByHotDog.length !== product.hotDogs) {
    throw new Error('Personalizacion incompleta');
  }

  let extraCents = 0;
  const details = [];
  for (let index = 0; index < product.hotDogs; index += 1) {
    const removed = uniqueAllowed(removedByHotDog[index], TOPPINGS, 'Toppings', TOPPINGS.size);
    const extras = uniqueAllowed(extrasByHotDog[index], new Set(EXTRAS.keys()), 'Extras', EXTRAS.size);
    extraCents += extras.reduce((sum, name) => sum + EXTRAS.get(name), 0);
    const parts = [];
    if (removed.length) parts.push(`Sin: ${removed.join(', ')}`);
    if (extras.length) parts.push(`Extra: ${extras.join(', ')}`);
    if (parts.length) details.push(`[HD${index + 1}] ${parts.join(' | ')}`);
  }

  const sauces = uniqueAllowed(selections.sauces, SAUCES, 'Salsas', 2);
  if (sauces.length < 1) throw new Error('Debes elegir al menos una salsa');
  details.push(`Salsas: ${sauces.join(', ')}`);

  const drink = normalizeOption(selections.drink);
  if (product.drink) {
    if (!DRINKS.has(drink)) throw new Error('Bebida invalida');
    extraCents += DRINKS.get(drink);
    details.push(`Bebida: ${drink}`);
  } else if (drink) {
    throw new Error('Este producto no incluye bebida');
  }

  const note = cleanText(selections.note, 200);
  if (note) details.push(`Nota: ${note}`);
  return { extraCents, details: details.join(' | ') };
}

function buildTrustedOrder(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) {
    throw new Error('Cantidad de productos invalida');
  }

  let totalQuantity = 0;
  const items = rawItems.map(rawItem => {
    if (!rawItem || typeof rawItem !== 'object') throw new Error('Producto invalido');
    const productId = cleanText(rawItem.productId, 80);
    const product = CATALOG.get(productId);
    if (!product) throw new Error('Producto no disponible');
    const quantity = Number(rawItem.qty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Cantidad invalida');
    totalQuantity += quantity;

    let unitCents = product.cents;
    let details = '';
    if (product.custom) {
      const selections = buildSelections(product, rawItem.selections);
      unitCents += selections.extraCents;
      details = selections.details;
    } else if (rawItem.selections != null) {
      throw new Error('Opciones no permitidas');
    }

    return {
      productId,
      name: product.name,
      quantity,
      unitCents,
      details
    };
  });

  if (totalQuantity > MAX_TOTAL_QUANTITY) throw new Error('Pedido demasiado grande');
  const subtotalCents = items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return { items, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

module.exports = { buildTrustedOrder, cleanText, TAX_PERCENTAGE };
