import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Per .claude/agents/qa.md: prefer under-flagging to a noisy gate nobody
// reads. These checks are deliberately mechanical — enum-like constants that
// must be Title Case (they render as buttons/select-options/labels), a
// css sanity check, and one regression-shaped heuristic for the specific
// mistake this project already made once (Title-Casing a full sentence).

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (rel) => readFileSync(path.join(srcDir, rel), 'utf8');

const isTitleCaseWord = (w) =>
  /^[A-Z0-9]/.test(w) || /^[&/()·—]/.test(w) || w === '' || /^[A-Z]{2,}$/i.test(w) === false && /^[a-z]/.test(w) === false;

/** A permissive Title Case check: every word starts uppercase, digit, or is a connector/punctuation token. */
function looksTitleCase(str) {
  const words = str.replace(/[.:;,!?]+$/, '').split(/\s+/).filter(Boolean);
  return words.every(w => {
    const stripped = w.replace(/^[^\w]+/, '');
    if (!stripped) return true; // pure punctuation token
    return /^[A-Z0-9]/.test(stripped);
  });
}

describe('casing — enum-like UI constants must be Title Case (they render as buttons/options/labels)', () => {
  test('store.js TYPES labels', () => {
    const src = read('store.js');
    const labels = [...src.matchAll(/label:\s*'([^']+)'/g)].map(m => m[1]);
    assert.ok(labels.length > 5, 'sanity: expected to find the TYPES label list');
    for (const l of labels) assert.ok(looksTitleCase(l), `TYPES label "${l}" is not Title Case`);
  });

  test('store.js STATUSES / PRIORITIES / UCA_TYPES', () => {
    const src = read('store.js');
    for (const constName of ['STATUSES', 'PRIORITIES', 'UCA_TYPES']) {
      const m = src.match(new RegExp(constName + '\\s*=\\s*\\[([^\\]]+)\\]'));
      assert.ok(m, `could not find ${constName}`);
      const items = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
      for (const item of items) assert.ok(looksTitleCase(item), `${constName} entry "${item}" is not Title Case`);
    }
  });

  test('app.js tab labels', () => {
    const src = read('app.js');
    const m = src.match(/const TABS = \[([\s\S]*?)\n\];/);
    const labels = [...m[1].matchAll(/label:\s*'([^']+)'/g)].map(x => x[1]);
    assert.equal(labels.length, 4);
    for (const l of labels) assert.ok(looksTitleCase(l), `tab label "${l}" is not Title Case`);
  });
});

describe('casing — structural rules', () => {
  test('no text-transform:uppercase rule survives in styles.css (casing belongs to the string, not a CSS rule)', () => {
    const css = read('styles.css');
    const rule = css.match(/text-transform\s*:\s*uppercase/i);
    assert.equal(rule, null, 'found a text-transform:uppercase rule — casing should be authored in the string itself');
  });

  test('regression: no Title-Cased full sentence in view/ui prose (the mistake this project already made once)', () => {
    // A Title-Cased full sentence looks like "1 Of 2 — Click The Controller..."
    // — capitalized function words (Of/The/And/This) immediately after a
    // digit-and-punctuation prefix, or three-plus capitalized function words
    // in one string, are the tell. Real Title Case labels are short and
    // don't contain these patterns; real sentence-case prose never
    // capitalizes a mid-sentence "The"/"Of"/"And"/"This".
    const files = ['ui.js', 'app.js', ...readdirSync(path.join(srcDir, 'views')).map(f => 'views/' + f)];
    const offenders = [];
    for (const file of files) {
      const src = read(file);
      for (const m of src.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
        const str = m[1];
        const hits = (str.match(/\b(The|Of|And|This|That|Now|Are|Is|Will|Never|Not)\b/g) || []).length;
        if (hits >= 2 && /[.·]/.test(str)) offenders.push(`${file}: "${str}"`);
      }
    }
    assert.deepEqual(offenders, [], 'found Title-Cased prose (should be sentence case):\n' + offenders.join('\n'));
  });
});
