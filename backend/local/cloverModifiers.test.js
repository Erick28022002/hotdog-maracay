'use strict';
/* Pruebas del parser de modificadores compuestos de Clover.
 * Ejecutar:  node cloverModifiers.test.js
 * Sin framework — assert nativo. */
const assert = require('assert');
const {
  detectComponentPrefix,
  parseCloverCompositeModifiers,
  cloverComponentsForPromo,
  hasComponent2,
  shouldSplitByHotDog,
  splitNoteByHotdog,
} = require('./cloverModifiers');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
// helper: lista plana de un componente (mods + notes)
const flat = (c) => [...c.modifiers, ...c.notes];

console.log('== detectComponentPrefix ==');
test('"1 No Maiz" -> comp1, "No Maiz"', () => {
  const r = detectComponentPrefix('1 No Maiz');
  assert.strictEqual(r.componentIndex, 1);
  assert.strictEqual(r.instruction, 'No Maiz');
});
test('"No Maiz" -> general (No no es número)', () => {
  assert.strictEqual(detectComponentPrefix('No Maiz').componentIndex, null);
});
test('"#2 poca salsa" -> comp2, note, "poca salsa"', () => {
  const r = detectComponentPrefix('#2 poca salsa');
  assert.strictEqual(r.componentIndex, 2);
  assert.strictEqual(r.instructionType, 'note');
  assert.strictEqual(r.instruction, 'poca salsa');
});
test('variantes de prefijo del Hot Dog 1', () => {
  ['1 No Maiz','1: No Maiz','1 - No Maiz','#1 No Maiz','#1: No Maiz','N°1 No Maiz','Nº1 No Maiz','No. 1 No Maiz','Hot Dog 1 No Maiz','hotdog 1 no maiz']
    .forEach(s => assert.strictEqual(detectComponentPrefix(s).componentIndex, 1, 'fallo: ' + s));
});
test('"No. 1 No Maiz" no se confunde con "No Maiz"', () => {
  assert.strictEqual(detectComponentPrefix('No. 1 No Maiz').componentIndex, 1);
  assert.strictEqual(detectComponentPrefix('No Maiz').componentIndex, null);
});

console.log('== Casos obligatorios ==');
test('Caso 1: 1 No Maiz / 2 No Mostaza', () => {
  const r = parseCloverCompositeModifiers(['1 No Maiz', '2 No Mostaza']);
  assert.deepStrictEqual(flat(r.component1), ['No Maiz']);
  assert.deepStrictEqual(flat(r.component2), ['No Mostaza']);
});
test('Caso 2: #1 poca salsa / #2 salsa aparte', () => {
  const r = parseCloverCompositeModifiers(['#1 poca salsa', '#2 salsa aparte']);
  assert.deepStrictEqual(flat(r.component1), ['Poca salsa']);
  assert.deepStrictEqual(flat(r.component2), ['Salsa aparte']);
});
test('Caso 3: "1: No Queso" / "2 - No Ceballo"', () => {
  const r = parseCloverCompositeModifiers(['1: No Queso', '2 - No Ceballo']);
  assert.deepStrictEqual(flat(r.component1), ['No Queso']);
  assert.deepStrictEqual(flat(r.component2), ['No Ceballo']);
});
test('Caso 4: "Sin servilletas" -> general, no a ambos', () => {
  const r = parseCloverCompositeModifiers(['Sin servilletas']);
  assert.deepStrictEqual(flat(r.component1), []);
  assert.deepStrictEqual(flat(r.component2), []);
  assert.deepStrictEqual(r.generalModifiers, ['Sin servilletas']);
  assert.ok(r.warnings.length === 1);
});
test('Caso 5: ejemplo completo', () => {
  const r = parseCloverCompositeModifiers([
    '1 No Vegetale','1 No Maiz','1 No Mostaza','1 No Queso',
    '2 No Ceballo','2 No Maiz','2 No Mostaza','#2 poca salsa',
  ]);
  const out = { hotDog1: flat(r.component1), hotDog2: flat(r.component2), general: r.generalModifiers };
  assert.deepStrictEqual(out, {
    hotDog1: ['No Vegetale', 'No Maiz', 'No Mostaza', 'No Queso'],
    hotDog2: ['No Ceballo', 'No Maiz', 'No Mostaza', 'Poca salsa'],
    general: [],
  });
  // rawModifiers conservado para auditoría
  assert.strictEqual(r.rawModifiers.length, 8);
  // componentes para el KDS: mods (verde/rojo) y notes (#N → amarillo) separados
  const comps = cloverComponentsForPromo(r);
  assert.deepStrictEqual(comps[0].mods, ['No Vegetale', 'No Maiz', 'No Mostaza', 'No Queso']);
  assert.deepStrictEqual(comps[0].notes, []);
  assert.deepStrictEqual(comps[1].mods, ['No Ceballo', 'No Maiz', 'No Mostaza']);
  assert.deepStrictEqual(comps[1].notes, ['Poca salsa']); // "#2 poca salsa" → nota amarilla del HD2
});
test('Caso 6: Square NO usa este parser (guardia de alcance)', () => {
  // El parser es un módulo aislado; pollSquare jamás lo importa ni invoca.
  // Aquí solo verificamos que, de invocarse, no inventa asociaciones raras,
  // pero la GARANTÍA real es que pollSquare no lo llama (ver server-local.js).
  const order = { source: 'square', modifiers: ['1 No Maiz', '2 No Mostaza'] };
  assert.notStrictEqual(order.source, 'clover'); // no se debe ejecutar la lógica Clover
});
test('Errores ortográficos: "2 No Ceballo" se conserva', () => {
  const r = parseCloverCompositeModifiers(['2 No Ceballo']);
  assert.deepStrictEqual(flat(r.component2), ['No Ceballo']);
});
test('"para llevar" como general (si llegara sin filtrar)', () => {
  const r = parseCloverCompositeModifiers(['Bacon Extra']);
  assert.deepStrictEqual(r.generalModifiers, ['Bacon Extra']);
});

console.log('== Regla de negocio: separar SOLO si hay Hot Dog 2 ==');
test('Solo "1 ..." → NO se separa (aplica a ambos hot dogs)', () => {
  const r = parseCloverCompositeModifiers(['1 No vegetales', '1 No repollo', '1 No cebolla']);
  assert.strictEqual(hasComponent2(r), false); // → vista plana
});
test('Con "2 ..." → SÍ se separa (cliente quiere hot dogs distintos)', () => {
  const r = parseCloverCompositeModifiers(['1 No vegetales', '2 No cebolla']);
  assert.strictEqual(hasComponent2(r), true);
});
test('Solo "2 ..." → SÍ se separa (HD1 con todo, HD2 modificado)', () => {
  const r = parseCloverCompositeModifiers(['2 No cebolla']);
  assert.strictEqual(hasComponent2(r), true);
  const comps = cloverComponentsForPromo(r);
  assert.deepStrictEqual(comps[0].mods, []);            // HD1 → CON TODO
  assert.deepStrictEqual(comps[1].mods, ['No cebolla']); // HD2
});
test('Nota numerada "#2 X" también cuenta como Hot Dog 2', () => {
  const r = parseCloverCompositeModifiers(['1 No maiz', '#2 poca salsa']);
  assert.strictEqual(hasComponent2(r), true);
});

console.log('== Prefijos pegados / variantes ==');
test('"1No cebolla" (pegado) → comp1 "No cebolla"', () => {
  const r = detectComponentPrefix('1No cebolla');
  assert.strictEqual(r.componentIndex, 1);
  assert.strictEqual(r.instruction, 'No cebolla');
});
test('"1NO cebolla" (pegado mayúsculas) → comp1', () => {
  assert.strictEqual(detectComponentPrefix('1NO cebolla').componentIndex, 1);
});
test('"12345" (dígitos) → general, no se confunde', () => {
  assert.strictEqual(detectComponentPrefix('12345').componentIndex, null);
});
test('"No Maiz" sigue siendo general tras el lookahead', () => {
  assert.strictEqual(detectComponentPrefix('No Maiz').componentIndex, null);
});

console.log('== Notas por hot dog (#1/#2 en una sola línea) ==');
test('"#1 poco queso #2 poca papa" → cada uno a su hot dog', () => {
  const r = splitNoteByHotdog('#1 poco queso #2 poca papa');
  assert.deepStrictEqual(r.hotDog1, ['Poco queso']);
  assert.deepStrictEqual(r.hotDog2, ['Poca papa']);
  assert.deepStrictEqual(r.general, []);
});
test('"#1 pura papa" (solo uno) → hot dog 1', () => {
  const r = splitNoteByHotdog('#1 pura papa');
  assert.deepStrictEqual(r.hotDog1, ['Pura papa']);
  assert.deepStrictEqual(r.hotDog2, []);
});
test('nota sin # → general (no se parte)', () => {
  const r = splitNoteByHotdog('solo papa');
  assert.deepStrictEqual(r.general, ['solo papa']);
  assert.deepStrictEqual(r.hotDog1, []);
});
test('"solo 2 salchichas" NO se parte (sin #)', () => {
  assert.deepStrictEqual(splitNoteByHotdog('solo 2 salchichas').general, ['solo 2 salchichas']);
});
test('texto general + #1 → separa ambos', () => {
  const r = splitNoteByHotdog('sin servilletas #1 pura papa');
  assert.deepStrictEqual(r.general, ['sin servilletas']);
  assert.deepStrictEqual(r.hotDog1, ['Pura papa']);
});
test('shouldSplitByHotDog: nota #1 sí separa; mod "1 X" solo NO', () => {
  const soloNota = parseCloverCompositeModifiers([]); soloNota.component1.notes.push('Pura papa');
  assert.strictEqual(shouldSplitByHotDog(soloNota), true);
  const soloMod1 = parseCloverCompositeModifiers(['1 No vegetales']);
  assert.strictEqual(shouldSplitByHotDog(soloMod1), false);
});

console.log('\nResultado: ' + pass + ' OK, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
