// Persistence: localStorage autosave and JSON import/export. Pure functions
// over a plain state object — no dependency on store.js, so this file can't
// participate in a circular import and is independently testable.

import { validateCanvasMeta } from './validate.js';

const KEY = 'risky-ladder-v1';

export function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt or inaccessible storage falls through to null */ }
  return null;
}

export function saveToLocalStorage(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota or private mode */ }
}

export function toJSON(state) {
  return JSON.stringify(state, null, 2);
}

/**
 * Parse and validate an imported file. Throws with a message naming exactly
 * what is missing, rather than letting a downstream view discover the gap
 * itself — e.g. a file missing `canvasMeta` used to parse successfully here
 * and only throw later when the Canvas tab dereferenced it.
 */
export function fromJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a Risky Ladder file — not an object.');
  if (!parsed.entities || typeof parsed.entities !== 'object') throw new Error('Not a Risky Ladder file — missing "entities".');
  if (!Array.isArray(parsed.edges)) throw new Error('Not a Risky Ladder file — missing "edges" array.');
  if (!validateCanvasMeta(parsed.canvasMeta)) throw new Error('Not a Risky Ladder file — missing or incomplete "canvasMeta".');
  if (!parsed.settings || typeof parsed.settings !== 'object') throw new Error('Not a Risky Ladder file — missing "settings".');
  return parsed;
}
