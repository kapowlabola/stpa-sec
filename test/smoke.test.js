import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const errors = [];
let window, document, $, $$, click, clickTab, S;

before(async () => {
  const html = readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only' });
  window = dom.window; document = window.document;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Element', 'SVGElement',
                   'Event', 'CustomEvent', 'MouseEvent', 'FileReader', 'Blob', 'location',
                   'getComputedStyle', 'requestAnimationFrame', 'alert', 'confirm', 'prompt'])
    globalThis[k] = window[k];
  globalThis.localStorage = { _v: {}, getItem(k) { return this._v[k] ?? null; }, setItem(k, v) { this._v[k] = v; } };
  globalThis.confirm = () => true;
  globalThis.prompt = () => 'evidence.pdf';
  globalThis.URL.createObjectURL = () => 'blob:x';
  globalThis.URL.revokeObjectURL = () => {};
  window.addEventListener('error', e => errors.push(e.message || e.error?.message || String(e)));

  $ = (s) => document.querySelector(s);
  $$ = (s) => [...document.querySelectorAll(s)];
  click = (el) => el && el.dispatchEvent(new window.Event('click', { bubbles: true }));
  clickTab = (name) => click($$('nav button').find(b => b.textContent === name));

  await import(path.join(srcDir, 'app.js'));
  S = await import(path.join(srcDir, 'store.js'));
});

describe('smoke — all four tabs render with zero runtime errors', () => {
  test('Mission Canvas renders its 9-cell grid', () => {
    clickTab('Mission Canvas');
    assert.equal($$('.mmc-cell').length, 9);
  });

  test('Database renders a row per entity', () => {
    clickTab('Database');
    assert.ok($$('table.wire tr').length > 1);
  });

  test('Risk Ladder renders a node per visible entity', () => {
    clickTab('Risk Ladder');
    assert.ok($$('.node').length > 5);
  });

  test('Control Structure renders the operational trio + UCA + Hazard', () => {
    clickTab('Control Structure');
    assert.ok($$('.node').length >= 5);
  });

  test('zero runtime errors collected across all four mounts so far', () => {
    assert.deepEqual(errors, []);
  });
});

describe('smoke — card, cascade, and cross-view sync', () => {
  test('opening a node\'s card shows its detail fields', () => {
    clickTab('Risk Ladder');
    const node = $$('.node')[0];
    node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
    assert.ok($('.flip-card').classList.contains('open'));
    assert.ok($('.flip-card .field input'));
  });

  test('editing the Mission Canvas node\'s title from its card cascades to Ladder nodes as .stale', () => {
    clickTab('Risk Ladder');
    const canvasNode = $$('.node').find(n => n.querySelector('.t')?.textContent === 'Mission Canvas');
    canvasNode.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 300, clientY: 300 }));
    const input = $('.flip-card .field input');
    input.value = 'Edited From Test';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.ok($$('.node.stale').length > 0, 'expected downstream nodes to carry the .stale class after the edit');
  });

  test('the same staleness is visible in the Database Review column', () => {
    clickTab('Database');
    assert.ok($$('table.wire .review-pill.stale').length > 0);
  });

  test('"Needs Review Only" filters the Database to just those rows', () => {
    const before = $$('table.wire tr').length;
    const btn = $$('.toolbar button').find(b => b.textContent.startsWith('Needs Review Only'));
    click(btn);
    const after = $$('table.wire tr').length;
    assert.ok(after < before && after > 1);
    click(btn); // toggle back off for later tests
  });

  test('Mission Canvas is excluded from the "+ New Entity" picker (only one canvas is supported)', () => {
    clickTab('Database');
    const select = $$('.toolbar select').find(s => [...s.options].some(o => o.value === ''));
    assert.equal([...select.options].some(o => o.value === 'MissionCanvas'), false);
  });

  test('clicking a Hazard node in Control Structure deep-links to the Risk Ladder and opens its card', () => {
    clickTab('Control Structure');
    const hazardNode = $$('.node').find(n => (n.getAttribute('title') || '').includes('Risk Ladder'));
    assert.ok(hazardNode, 'expected a Hazard node advertising the deep-link');
    hazardNode.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 400, clientY: 400 }));
    assert.equal($$('nav button').find(b => b.classList.contains('active'))?.textContent, 'Risk Ladder');
    assert.ok($('.flip-card').classList.contains('open'));
  });
});

describe('smoke — round trip and resilience', () => {
  test('export → reset → the graph reloads with the seeded entity count', () => {
    document.getElementById('btn-export').click(); // exercises the export path without asserting on the download itself
    document.getElementById('btn-reset').click();
    assert.equal(S.all().length, 19);
  });

  test('every view survives an empty graph', () => {
    for (const e of [...S.all()]) S.remove(e.id);
    for (const name of ['Mission Canvas', 'Database', 'Risk Ladder', 'Control Structure']) {
      assert.doesNotThrow(() => clickTab(name), `${name} threw on an empty graph`);
    }
  });

  test('zero runtime errors across the entire suite', () => {
    assert.deepEqual(errors, []);
  });
});
