'use strict';

/*
 * Adapter ESPECÍFICO de Clover para promociones compuestas (2 hot dogs).
 * Clover manda los modificadores de una "Promo" con un prefijo numérico que
 * identifica a qué hot dog pertenecen:  "1 No Maiz", "2 No Vegetale", "#2 poca salsa".
 *
 * Este módulo NO debe usarse para Square / web / manual / delivery apps.
 * Solo se invoca desde pollClover() (source === 'clover').
 */

// Capitaliza solo la primera letra (presentación). No cambia el resto.
//  "poca salsa" -> "Poca salsa"   ·   "No Maiz" -> "No Maiz"
function capFirst(s) {
  s = String(s == null ? '' : s).trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/*
 * Detecta el prefijo de hot dog al inicio del texto.
 * Reconoce:  1 / #1 / N°1 / Nº1 / No. 1 / Hot Dog 1 / hotdog 1  (y sus equivalentes con 2)
 * Acepta separadores  :  -  .  y uno o varios espacios.
 * IMPORTANTE: "No Maiz" NO es un número — "No" no se confunde con identificador.
 *
 * Devuelve { componentIndex: 1|2|null, instruction: <texto sin prefijo>, instructionType: 'note'|'modifier' }
 */
function detectComponentPrefix(rawText) {
  const text = String(rawText == null ? '' : rawText).trim();
  if (!text) return { componentIndex: null, instruction: '', instructionType: 'modifier' };

  // Una nota explícita con "#" se marca como note; el resto como modifier.
  const hadHash = /^\s*#/.test(text);

  // prefijo OPCIONAL: (# | n°|nº|no. | hotdog | hot dog) seguido de 1 ó 2,
  // y luego separador: espacio(s), o : - . con espacios, o pegado a una letra ("1No cebolla").
  // El lookahead a letra evita confundir "No Maiz" (no empieza por número) y "12345" (le sigue dígito).
  const re = /^\s*(?:#\s*|n[°º]\s*|no\.\s*|hot\s*dog\s+|hotdog\s+)?([12])(?:\s*[:.\-]\s*|\s+|(?=[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]))(.+)$/i;
  const m = text.match(re);
  if (m) {
    return {
      componentIndex: parseInt(m[1], 10),
      instruction: m[2].trim(),
      instructionType: hadHash ? 'note' : 'modifier',
    };
  }
  return { componentIndex: null, instruction: text, instructionType: 'modifier' };
}

/*
 * Clasifica una lista de textos de modificadores/notas en los dos hot dogs + general.
 * Conserva rawModifiers para auditoría. Registra advertencias para los no asignados.
 */
function parseCloverCompositeModifiers(modifiers) {
  const result = {
    component1: { modifiers: [], notes: [] },
    component2: { modifiers: [], notes: [] },
    generalModifiers: [],
    generalNotes: [],
    rawModifiers: [],
    warnings: [],
  };

  for (const raw of (modifiers || [])) {
    const rawText = String(raw == null ? '' : raw);
    const text = rawText.trim();
    if (!text) continue;

    result.rawModifiers.push(rawText);
    const parsed = detectComponentPrefix(text);
    const instr = capFirst(parsed.instruction);

    if (parsed.componentIndex === 1 || parsed.componentIndex === 2) {
      const comp = parsed.componentIndex === 1 ? result.component1 : result.component2;
      if (parsed.instructionType === 'note') comp.notes.push(instr);
      else comp.modifiers.push(instr);
      continue;
    }

    // Sin identificador → general. NO se asigna a ambos, NO se duplica.
    if (parsed.instructionType === 'note') result.generalNotes.push(instr);
    else result.generalModifiers.push(instr);
    result.warnings.push('Modificador sin identificador de hot dog → general: "' + text + '"');
  }

  return result;
}

/*
 * A partir del resultado del parser, arma los componentes para el KDS de una promo de 2 hot dogs.
 * Devuelve [{name:'Hot Dog 1', mods:[...]}, {name:'Hot Dog 2', mods:[...]}]
 * (modificadores y notas juntos: para el KDS ambos van bajo su hot dog).
 */
function cloverComponentsForPromo(parsed) {
  // mods  → modificadores normales (verde "+"/rojo "NO")
  // notes → notas numeradas (#N ...) → se muestran en franja AMARILLA en el KDS
  return [
    { name: 'Hot Dog 1', mods: [...parsed.component1.modifiers], notes: [...parsed.component1.notes] },
    { name: 'Hot Dog 2', mods: [...parsed.component2.modifiers], notes: [...parsed.component2.notes] },
  ];
}

/*
 * REGLA DE NEGOCIO (confirmada con el local):
 * La variación por hot dog SOLO se aplica si el cliente marcó explícitamente el Hot Dog 2.
 * Si SOLO hay modificadores "1 ..." significa que AMBOS hot dogs llevan ese cambio
 * (es la notación del mesero), NO que solo el hot dog 1 → se muestra plano para toda la promo.
 * Solo cuando aparece un "2 ..." el cliente quiere el hot dog 1 distinto del hot dog 2.
 */
function hasComponent2(parsed) {
  return !!(parsed.component2.modifiers.length || parsed.component2.notes.length);
}

// Separa por hot dog si hay diferenciación explícita: algo en el Hot Dog 2 (mod o nota),
// o una NOTA numerada en el Hot Dog 1 (#1 ...). Los modificadores "1 X" solos NO separan.
function shouldSplitByHotDog(parsed) {
  return !!(parsed.component2.modifiers.length || parsed.component2.notes.length
         || parsed.component1.notes.length);
}

/*
 * Divide una NOTA LIBRE por marcadores de hot dog (#1 / #2), incluso varios en una sola línea.
 *   "#1 poco queso #2 poca papa"  -> { hotDog1:['Poco queso'], hotDog2:['Poca papa'], general:[] }
 *   "#1 pura papa"                -> { hotDog1:['Pura papa'],  hotDog2:[],            general:[] }
 *   "solo papa"                   -> { hotDog1:[], hotDog2:[], general:['solo papa'] }
 * Requiere "#" para separar (evita falsos positivos como "solo 2 salchichas").
 */
function splitNoteByHotdog(noteText) {
  const text = String(noteText == null ? '' : noteText).trim();
  const out = { hotDog1: [], hotDog2: [], general: [] };
  if (!text) return out;
  if (!/#\s*[12](?![0-9])/.test(text)) { out.general.push(text); return out; }
  const segs = text.split(/(?=#\s*[12](?![0-9]))/).map(s => s.trim()).filter(Boolean);
  segs.forEach(seg => {
    const m = seg.match(/^#\s*([12])(?![0-9])\s*[:.\-]?\s*([\s\S]*)$/);
    if (m) {
      const instr = capFirst((m[2] || '').replace(/[,;\s]+$/, '').trim());
      if (instr) (m[1] === '1' ? out.hotDog1 : out.hotDog2).push(instr);
    } else {
      const g = seg.replace(/[,;\s]+$/, '').trim();
      if (g) out.general.push(g);
    }
  });
  return out;
}

module.exports = {
  capFirst,
  detectComponentPrefix,
  parseCloverCompositeModifiers,
  cloverComponentsForPromo,
  hasComponent2,
  shouldSplitByHotDog,
  splitNoteByHotdog,
};
