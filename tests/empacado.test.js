'use strict';
const assert = require('assert');
// ── Réplica EXACTA de la lógica aplicada en kds.html y meseras.html ──
function requiresPacking(o) {
  if (['uber', 'doordash'].includes((o.channel || '').toLowerCase())) return false;
  let items = o.items || [];
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch (e) { items = []; } }
  const anyItemLlevar = items.some(it => /para\s+llevar/i.test(it.details || it.note || ''));
  return o.order_type === 'pickup'
      || (o.notes || '').toLowerCase().includes('para llevar')
      || anyItemLlevar;
}
const kitchenComplete = o => { o.status = requiresPacking(o) ? 'packing' : 'completed'; }; // Cocina "Preparado"
const meserasEmpacar  = o => { o.status = 'completed'; };                                  // Meseras "Empacada"
const kitchenVisible  = o => o.status !== 'completed' && o.status !== 'packing';
const meserasVisible  = o => o.status !== 'completed';
const meserasButton   = o => requiresPacking(o);

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); } };

t('Caso 1: orden normal sin para-llevar', () => {
  const o = { status: 'new', order_type: 'dinein', notes: '', items: [{ name: 'Promo', details: '' }] };
  assert.strictEqual(requiresPacking(o), false);
  kitchenComplete(o);
  assert.strictEqual(o.status, 'completed');
  assert.strictEqual(kitchenVisible(o), false); // desaparece de Cocina
  assert.strictEqual(meserasVisible(o), false); // no queda pendiente de empacar en Meseras
});

t('Caso 2: orden completamente para llevar', () => {
  const o = { status: 'new', order_type: 'pickup', notes: '', items: [{ name: 'Promo', details: '' }] };
  assert.strictEqual(meserasButton(o), true);   // aparece con opción de empacar
  assert.strictEqual(meserasVisible(o), true);
  kitchenComplete(o);
  assert.strictEqual(o.status, 'packing');
  assert.strictEqual(kitchenVisible(o), false); // sale de Cocina
  assert.strictEqual(meserasVisible(o), true);  // PERMANECE en Meseras
  assert.strictEqual(meserasButton(o), true);
  meserasEmpacar(o);
  assert.strictEqual(meserasVisible(o), false); // sale de Meseras al empacar
});

t('Caso 3: orden mixta (un ítem para llevar)', () => {
  const o = { status: 'new', order_type: 'dinein', notes: '', items: [
    { name: 'Hot Dog', details: '' }, { name: 'Promo', details: 'para llevar' } ] };
  assert.strictEqual(requiresPacking(o), true);
  kitchenComplete(o);
  assert.strictEqual(o.status, 'packing');
  assert.strictEqual(meserasVisible(o), true);  // permanece hasta empacar
  meserasEmpacar(o);
  assert.strictEqual(meserasVisible(o), false);
});

t('Caso 4: nota "para llevar" (tipo general no es pickup)', () => {
  const o = { status: 'new', order_type: 'dinein', notes: 'Cliente pidió para llevar', items: [{ name: 'Promo', details: '' }] };
  assert.strictEqual(requiresPacking(o), true);
  assert.strictEqual(meserasButton(o), true);
  kitchenComplete(o);
  assert.strictEqual(meserasVisible(o), true);  // visible tras preparar
});

t('Caso 5: Meseras "Empacada" no afecta Cocina ni reabre', () => {
  const o = { status: 'new', order_type: 'pickup', notes: '', items: [{ name: 'Promo', details: '' }] };
  kitchenComplete(o);                 // packing
  meserasEmpacar(o);                  // completed
  assert.strictEqual(o.status, 'completed');
  assert.strictEqual(kitchenVisible(o), false);  // NO reaparece en Cocina
  assert.notStrictEqual(o.status, 'new');        // no revierte preparación
});

t('Caso 6: realtime — solo el empacado real saca de Meseras', () => {
  const o = { status: 'new', order_type: 'pickup', notes: '', items: [{ name: 'Promo', details: '' }] };
  // cambio de preparación (new → packing) NO debe sacarlo de Meseras
  o.status = 'packing';
  assert.strictEqual(meserasVisible(o), true);
  assert.strictEqual(kitchenVisible(o), false);
  // solo el cambio real de empacado (→ completed) lo saca
  o.status = 'completed';
  assert.strictEqual(meserasVisible(o), false);
});

t('Extra: delivery (uber/doordash) NO se trata como empacado', () => {
  const o = { status: 'new', order_type: 'pickup', channel: 'uber', notes: '', items: [] };
  assert.strictEqual(requiresPacking(o), false);
});

t('Extra: items como string JSON también se parsean', () => {
  const o = { status: 'new', order_type: 'dinein', notes: '', items: JSON.stringify([{ name: 'X', details: 'PARA LLEVAR' }]) };
  assert.strictEqual(requiresPacking(o), true);
});

console.log('\nResultado: ' + pass + ' OK, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
