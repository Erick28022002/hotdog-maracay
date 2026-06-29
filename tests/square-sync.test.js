'use strict';
/* Pruebas de la lógica de sincronización Square del KDS.
 * Replica las funciones clave del backend (server-local.js) y del render (kds.html)
 * para verificar el comportamiento sin depender del servidor.
 * Ejecutar: node tests/square-sync.test.js */
const assert = require('assert');

// ── Réplica FIEL de helpers del backend (server-local.js) ──
function normDetails(d) {
  return (d || '').split('·').map(s => s.trim().toLowerCase()).filter(Boolean).sort().join(' · ');
}
function aggItems(items) {
  const m = new Map();
  (items || []).forEach(it => {
    const key = (it.name || '').trim().toLowerCase() + '|' + normDetails(it.details);
    if (!m.has(key)) m.set(key, { name: (it.name || '').trim(), details: it.details || '', qty: 0 });
    m.get(key).qty += (parseInt(it.qty) || 1);
  });
  return m;
}
function itemsSig(items) {
  return [...aggItems(items).entries()].map(([k, v]) => k + 'x' + v.qty).sort().join('||');
}

// ── Réplica de la rama "orden ya conocida" de pollSquare (la corregida) ──
// Devuelve la acción que tomaría el backend: {action:'patch'|'round'|'none', rowItems?, addedItems?}
function squareUpdate(existingItems, squareItems, status) {
  if (itemsSig(squareItems) === itemsSig(existingItems)) return { action: 'none' };
  const prepared = (status === 'completed' || status === 'packing');
  if (prepared) {
    const oldAgg = aggItems(existingItems), newAgg = aggItems(squareItems);
    const addedItems = [];
    newAgg.forEach((v, k) => {
      const diff = v.qty - ((oldAgg.get(k) || {}).qty || 0);
      if (diff > 0) addedItems.push({ name: v.name, details: v.details, qty: diff });
    });
    return { action: addedItems.length ? 'round' : 'none', addedItems };
  }
  return { action: 'patch', rowItems: squareItems };
}

// ── Réplica de la detección premium (buildModsHtml) ──
function isPremiumMod(s) { return /\bbacon\b|tocin(o|eta)|q(?:ueso|s)\.?\s*de\s*mano/i.test(s || ''); }

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + '\n      ' + e.message); } };

console.log('== #1 Eliminar / reducir (ronda pendiente → patch) ==');
t('Prueba 1: eliminar Nestea → patch sin Nestea, orden sigue', () => {
  const before = [{name:'Promo Clasica',qty:1},{name:'Nestea',qty:1},{name:'Extra de bacon',qty:1}];
  const after  = [{name:'Promo Clasica',qty:1},{name:'Extra de bacon',qty:1}];
  const r = squareUpdate(before, after, 'new');
  assert.strictEqual(r.action, 'patch');
  assert.deepStrictEqual(r.rowItems.map(i=>i.name), ['Promo Clasica','Extra de bacon']);
});
t('Prueba 2: reducir Promo 3→2 → patch qty 2, sin duplicar', () => {
  const r = squareUpdate([{name:'Promo Clasica',qty:3}], [{name:'Promo Clasica',qty:2}], 'new');
  assert.strictEqual(r.action, 'patch');
  assert.strictEqual(r.rowItems.length, 1);
  assert.strictEqual(r.rowItems[0].qty, 2);
});

console.log('== #2/#3 Unificar vs nueva ronda ==');
t('Prueba 3: agregar antes de preparar (new) → patch (mismo ticket)', () => {
  const r = squareUpdate([{name:'Promo Clasica',qty:1}], [{name:'Promo Clasica',qty:2}], 'new');
  assert.strictEqual(r.action, 'patch');
  assert.strictEqual(r.rowItems[0].qty, 2); // un solo ticket, qty 2
});
t('Prueba 4: agregar durante preparación (status new) → patch', () => {
  const r = squareUpdate([{name:'Promo Clasica',qty:1}], [{name:'Promo Clasica',qty:1},{name:'Nestea',qty:1}], 'new');
  assert.strictEqual(r.action, 'patch');
  assert.strictEqual(r.rowItems.length, 2);
});
t('Prueba 5: agregar después de preparar (completed) → ronda nueva solo con lo añadido', () => {
  const r = squareUpdate([{name:'Promo Clasica',qty:1}], [{name:'Promo Clasica',qty:2}], 'completed');
  assert.strictEqual(r.action, 'round');
  assert.deepStrictEqual(r.addedItems, [{name:'Promo Clasica',details:'',qty:1}]);
});
t('Empacado (packing) también cuenta como preparado → ronda nueva', () => {
  const r = squareUpdate([{name:'Promo',qty:1}], [{name:'Promo',qty:1},{name:'Frescolita',qty:1}], 'packing');
  assert.strictEqual(r.action, 'round');
  assert.deepStrictEqual(r.addedItems.map(i=>i.name), ['Frescolita']);
});

console.log('== #6 Pruebas distinción por modificadores ==');
t('Prueba 6: borrar "Promo sin cebolla" deja la normal (no confunde por nombre)', () => {
  const before = [{name:'Promo Clasica',details:''},{name:'Promo Clasica',details:'sin cebolla'}];
  const after  = [{name:'Promo Clasica',details:''}];
  const r = squareUpdate(before, after, 'new');
  assert.strictEqual(r.action, 'patch');
  assert.strictEqual(r.rowItems.length, 1);
  assert.strictEqual(r.rowItems[0].details, ''); // queda la normal
});

console.log('== #8 Idempotencia ==');
t('Prueba 8: mismo estado dos veces → ninguna acción', () => {
  const items = [{name:'Promo Clasica',qty:1}];
  assert.strictEqual(squareUpdate(items, items, 'new').action, 'none');
  assert.strictEqual(squareUpdate(items, items, 'completed').action, 'none');
});

console.log('== #6 Detección premium (bacon / queso de mano) ==');
t('Detecta bacon/tocineta/queso de mano/QS de mano', () => {
  ['Bacon','Extra Bacon','Add Bacon','Tocineta','Queso de mano','Extra queso de mano','QS de mano']
    .forEach(s => assert.ok(isPremiumMod(s), 'debería: ' + s));
});
t('NO destaca productos no relacionados (queso solo, ketchup, etc.)', () => {
  ['Extra queso','Ketchup','No Maiz','Promo Clasica','Carne desmechada']
    .forEach(s => assert.ok(!isPremiumMod(s), 'no debería: ' + s));
});

console.log('\nResultado: ' + pass + ' OK, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
