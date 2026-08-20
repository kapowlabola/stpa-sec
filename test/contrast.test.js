import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const tokensPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'tokens.css');
const css = readFileSync(tokensPath, 'utf8');

/** Parse `--name: #hex;` declarations, including one-line `var(--other)` aliases. */
function parseTokens(text) {
  const tokens = {};
  for (const m of text.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6}|var\(--([\w-]+)\))/g)) {
    tokens[m[1]] = m[3] ? { alias: m[3] } : m[2];
  }
  // Resolve one level of var() aliasing (tokens.css only aliases one level deep).
  for (const [name, val] of Object.entries(tokens)) {
    if (val && val.alias) tokens[name] = tokens[val.alias];
  }
  return tokens;
}

function luminance(hex) {
  const c = hex.replace('#', '').match(/.{1,2}/g).map(h => parseInt(h.length === 1 ? h + h : h, 16) / 255);
  const [r, g, b] = c.map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(hexA, hexB) {
  const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const T = parseTokens(css);

describe('token contrast gate — every pair the app actually renders text/strokes with must clear 4.5:1', () => {
  test('every token referenced below resolved to a real hex (parser sanity check)', () => {
    for (const name of ['primary', 'primary-darker', 'secondary', 'ink', 'base-dark', 'base-lightest', 'white',
                         'mission', 'mission-fill', 'hazard', 'hazard-fill', 'control', 'control-fill',
                         'loss', 'loss-fill', 'metric', 'metric-fill', 'review-text', 'review-fill']) {
      assert.ok(/^#[0-9a-fA-F]{3,6}$/.test(T['color-' + name] || ''), `--color-${name} did not resolve to a hex value`);
    }
  });

  test('chrome: white text on the header (primary-darker)', () => {
    assert.ok(ratio(T['color-white'], T['color-primary-darker']) >= 4.5);
  });

  test('chrome: white text on a primary button', () => {
    assert.ok(ratio(T['color-white'], T['color-primary']) >= 4.5);
  });

  test('chrome: white text on a secondary (destructive) button', () => {
    assert.ok(ratio(T['color-white'], T['color-secondary']) >= 4.5);
  });

  test('chrome: ink on the base-lightest panel background', () => {
    assert.ok(ratio(T['color-ink'], T['color-base-lightest']) >= 4.5);
  });

  test('chrome: base-dark secondary text on white', () => {
    assert.ok(ratio(T['color-base-dark'], T['color-white']) >= 4.5);
  });

  for (const entity of ['mission', 'hazard', 'control', 'loss', 'metric']) {
    test(`entity stroke color for ${entity} clears 4.5:1 on white (used for borders, badges, legend text)`, () => {
      const r = ratio(T['color-' + entity], T['color-white']);
      assert.ok(r >= 4.5, `${entity} stroke ${T['color-' + entity]} on white is only ${r.toFixed(2)}:1`);
    });

    test(`ink node text on the ${entity} fill clears 4.5:1 (node title/subtitle always render in ink, never the hue)`, () => {
      const r = ratio(T['color-ink'], T['color-' + entity + '-fill']);
      assert.ok(r >= 4.5, `ink on ${entity}-fill ${T['color-' + entity + '-fill']} is only ${r.toFixed(2)}:1`);
    });
  }

  test('review status text on its own fill', () => {
    assert.ok(ratio(T['color-review-text'], T['color-review-fill']) >= 4.5);
  });

  test('review status text on plain white (the card banner and node tooltips)', () => {
    assert.ok(ratio(T['color-review-text'], T['color-white']) >= 4.5);
  });
});
