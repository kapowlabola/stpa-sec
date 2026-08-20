import * as S from './store.js';
import { seed } from './seed.js';
import { h, toast } from './ui.js';
import * as canvasView from './views/canvas.js';
import * as databaseView from './views/database.js';
import * as ladderView from './views/ladder.js';
import * as controlView from './views/control.js';

const TABS = [
  { id: 'canvas',   label: 'Mission Canvas',   view: canvasView },
  { id: 'database', label: 'Database',         view: databaseView },
  { id: 'ladder',   label: 'Risk Ladder',      view: ladderView },
  { id: 'control',  label: 'Control Structure', view: controlView },
];

S.init(seed);

let active = (location.hash || '#canvas').slice(1);
if (!TABS.some(t => t.id === active)) active = 'canvas';

const root = document.getElementById('root');

function render() {
  // Preserve focus and caret across the re-render triggered by an edit.
  const a = document.activeElement;
  const key = a && a.dataset ? a.dataset.focusKey : null;
  const start = a && a.selectionStart, end = a && a.selectionEnd;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const diagramWrap = document.querySelector('.canvas');
  const dScroll = diagramWrap ? { l: diagramWrap.scrollLeft, t: diagramWrap.scrollTop } : null;

  const tab = TABS.find(t => t.id === active);
  root.replaceChildren(
    h('nav', {}, TABS.map(t => h('button', {
      class: t.id === active ? 'active' : '',
      onclick: () => { active = t.id; location.hash = '#' + t.id; render(); },
    }, t.label))),
    tab.view.render());

  if (key) {
    const el = root.querySelector(`[data-focus-key="${key}"]`);
    if (el) {
      el.focus();
      try { if (start != null) el.setSelectionRange(start, end); } catch (e) { /* selects */ }
    }
  }
  const newWrap = document.querySelector('.canvas');
  if (newWrap && dScroll) { newWrap.scrollLeft = dScroll.l; newWrap.scrollTop = dScroll.t; }
  window.scrollTo(scroll.x, scroll.y);
}

S.subscribe(render);
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (TABS.some(t => t.id === id) && id !== active) { active = id; render(); }
});

// --- header tools ------------------------------------------------------------
document.getElementById('btn-export').onclick = () => {
  const blob = new Blob([S.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `risky-ladder-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Exported JSON');
};

document.getElementById('btn-import').onclick = () => {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { S.importJSON(reader.result); toast('Imported'); }
      catch (err) { alert('Could not import: ' + err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
};

document.getElementById('btn-reset').onclick = () => {
  if (confirm('Discard all local changes and reload the UAS ISR worked example?')) {
    S.reset(seed);
    toast('Reset to the seeded example');
  }
};

render();
