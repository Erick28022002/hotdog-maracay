'use strict';
/* Réplica de la lógica de conteo de hot dogs y visibilidad de bebidas.
 * node tests/conteo-bebidas.test.js */
const assert = require('assert');

const DRINK_RE = /\b(coca[\s-]*cola|coca|coke|pepsi|sprite|fanta|7\s*up|seven\s*up|frescolita|nestea|malta|uvita|chinotto|hit|glaceau|agua|refresco|gaseosa|soda|jugo|bebida|cerveza|gatorade|powerade|red\s*bull|monster|limonada|papel[oó]n|chicha|merengada|batido|malteada)\b/i;
const isDrink = n => DRINK_RE.test(n || '');
function hasKitchenItems(o) {
  let items = o.items || [];
  return items.some(it => !isDrink(it.name));
}
// requiresPacking (simplificado a lo relevante)
function requiresPacking(o) {
  const hay = s => /llevar/i.test(s || '');
  return o.order_type === 'pickup' || hay(o.notes) || hay(o.customer_name)
    || (o.items || []).some(it => hay(it.details) || hay(it.note) || hay(it.note_text) || hay(it.name));
}
// Conteo de hot dogs
function contarPerros(items) {
  let perros = 0;
  (items || []).forEach(it => {
    const qty = parseInt(it.qty || 1) || 1;
    const name = it.name || '';
    if (/promo/i.test(name)) perros += 2 * qty;
    else if (/hot\s*dog|perro/i.test(name)) perros += 1 * qty;
  });
  return perros;
}
// Visibilidad
const cocinaVisible  = o => hasKitchenItems(o);
const meserasVisible = o => hasKitchenItems(o) || requiresPacking(o);

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

console.log('== Conteo de hot dogs ==');
t('Promo = 2', () => assert.strictEqual(contarPerros([{name:'Promo Clasica',qty:1}]), 2));
t('Promo Mechada = 2', () => assert.strictEqual(contarPerros([{name:'Promoción Mechada',qty:1}]), 2));
t('Hot Dog = 1', () => assert.strictEqual(contarPerros([{name:'Hot Dog Clásico',qty:1}]), 1));
t('1 Perro Caliente = 1', () => assert.strictEqual(contarPerros([{name:'1 Perro Caliente',qty:1}]), 1));
t('Bebida = 0', () => assert.strictEqual(contarPerros([{name:'Frescolita',qty:1}]), 0));
t('Queso de Mano Extra (producto) = 0', () => assert.strictEqual(contarPerros([{name:'Queso de Mano Extra',qty:2}]), 0));
t('Orden mixta: 2 Promo + Hot Dog + 3 bebidas = 5', () => {
  assert.strictEqual(contarPerros([
    {name:'Promo Clasica',qty:2}, {name:'Hot Dog Clásico',qty:1},
    {name:'Nestea',qty:2}, {name:'Sprite',qty:1}, {name:'Queso de Mano Extra',qty:1},
  ]), 5); // 2*2 + 1 = 5 (bebidas y extra NO cuentan)
});

console.log('== Visibilidad de bebidas ==');
t('Solo bebida en sala → NO en Cocina ni Meseras', () => {
  const o = { order_type:'dinein', notes:'', customer_name:'Luis', items:[{name:'Frescolita'}] };
  assert.strictEqual(cocinaVisible(o), false);
  assert.strictEqual(meserasVisible(o), false);
});
t('Solo bebida PARA LLEVAR → solo en Meseras', () => {
  const o = { order_type:'dinein', notes:'', customer_name:'', items:[{name:'Frescolita', note_text:'para llevar'}] };
  assert.strictEqual(cocinaVisible(o), false);
  assert.strictEqual(meserasVisible(o), true);
});
t('Comida + bebida → visible en ambos', () => {
  const o = { order_type:'dinein', notes:'', items:[{name:'Promo Clasica'},{name:'Nestea'}] };
  assert.strictEqual(cocinaVisible(o), true);
  assert.strictEqual(meserasVisible(o), true);
});
t('Comida sola → visible en ambos', () => {
  const o = { order_type:'dinein', notes:'', items:[{name:'Hot Dog Clásico'}] };
  assert.strictEqual(cocinaVisible(o), true);
  assert.strictEqual(meserasVisible(o), true);
});

console.log('\nResultado: ' + pass + ' OK, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
