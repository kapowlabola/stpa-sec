import * as S from '../store.js';
import { h, openCard, colorClass, toast } from '../ui.js';

// Diagram-first entry, deliberately unlike the Mission Canvas: this data is
// graph-shaped, so placing a box creates the (blank) record immediately.
const f = { zoom: 100, legend: false, mode: null, pending: null };

const SHOWN = ['Controller', 'ControlAction', 'ControlledProcess', 'UCA', 'Hazard'];
const DEFAULT_Y = { Controller: 40, ControlAction: 40, ControlledProcess: 40, UCA: 210, Hazard: 340 };
const NW = 150, NH = 56;

const svg = (tag, attrs) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function placed(entities) {
  // Only assign a position to records that have never had one; after that the
  // user's own placement is authoritative (unlike the Ladder, which is auto-only).
  const counts = {};
  for (const e of entities) {
    if (typeof e.x !== 'number' || typeof e.y !== 'number') {
      const i = counts[e.type] = (counts[e.type] || 0) + 1;
      const col = { Controller: 0, ControlAction: 1, ControlledProcess: 2, UCA: 0, Hazard: 0 }[e.type];
      e.x = 40 + col * 215 + (e.type === 'UCA' || e.type === 'Hazard' ? (i - 1) * 170 : 0);
      e.y = DEFAULT_Y[e.type] + (e.type === 'UCA' || e.type === 'Hazard' ? 0 : (i - 1) * 90);
    }
  }
}

function startDrag(ev, e) {
  if (f.mode) return;
  ev.preventDefault();
  const scale = f.zoom / 100;
  const sx = ev.clientX, sy = ev.clientY, ox = e.x, oy = e.y;
  const node = ev.currentTarget;
  let moved = false;
  const move = (m) => {
    const nx = ox + (m.clientX - sx) / scale, ny = oy + (m.clientY - sy) / scale;
    if (Math.abs(m.clientX - sx) > 3 || Math.abs(m.clientY - sy) > 3) moved = true;
    node.style.left = Math.max(0, nx) + 'px';
    node.style.top = Math.max(0, ny) + 'px';
    node._nx = Math.max(0, nx); node._ny = Math.max(0, ny);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) S.update(e.id, { x: node._nx, y: node._ny });
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function handleModeClick(ev, e) {
  if (!f.mode) { openCard(ev, e.id); return; }
  ev.stopPropagation();

  if (f.mode === 'action') {
    if (!f.pending) {
      if (e.type !== 'Controller') return toast('Pick a Controller first');
      f.pending = e.id; S.emit(); return;
    }
    if (e.type !== 'ControlledProcess') return toast('Now pick a Controlled Process');
    const src = S.get(f.pending);
    const act = S.create('ControlAction', {
      title: '', owner: src.owner,
      x: (src.x + e.x) / 2, y: (src.y + e.y) / 2 + 4,
    });
    S.link(src.id, act.id);   // issues
    S.link(act.id, e.id);     // targets
    f.mode = null; f.pending = null;
    openCard(ev, act.id);
    return;
  }

  if (f.mode === 'uca') {
    if (e.type !== 'ControlAction') return toast('Pick the Control Action this UCA applies to');
    const uca = S.create('UCA', {
      title: '', uca_type: 'providing causes hazard', owner: e.owner,
      x: e.x, y: e.y + 170,
    });
    S.link(e.id, uca.id);     // can_become
    f.mode = null;
    openCard(ev, uca.id);
  }
}

export function render() {
  const entities = S.all().filter(e => SHOWN.includes(e.type));
  placed(entities);
  const pos = Object.fromEntries(entities.map(e => [e.id, { x: e.x, y: e.y, w: NW, h: NH }]));
  const shown = new Set(entities.map(e => e.id));

  const maxX = Math.max(900, ...entities.map(e => e.x + NW + 60));
  const maxY = Math.max(460, ...entities.map(e => e.y + NH + 50));

  const g = svg('svg', { width: maxX, height: maxY, style: 'position:absolute; top:0; left:0;' });
  const defs = svg('defs', {});
  const m = svg('marker', { id: 'arrowC', viewBox: '0 0 10 10', refX: '8', refY: '5',
    markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
  m.appendChild(svg('path', { d: 'M1 1L9 5L1 9Z', fill: '#333' }));
  defs.appendChild(m);
  g.appendChild(defs);

  for (const e of S.edges()) {
    if (e.kind !== 'derives' || !shown.has(e.from) || !shown.has(e.to)) continue;
    const a = pos[e.from], b = pos[e.to];
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const horizontal = Math.abs(ay - by) < NH;
    const points = horizontal
      ? `${a.x + a.w},${ay} ${b.x},${by}`
      : `${ax},${a.y + (by > ay ? a.h : 0)} ${ax},${(ay + by) / 2} ${bx},${(ay + by) / 2} ${bx},${by > ay ? b.y : b.y + b.h}`;
    g.appendChild(svg('polyline', {
      points, fill: 'none', stroke: '#333', 'stroke-width': '1.8', 'marker-end': 'url(#arrowC)',
    }));
  }

  const nodes = entities.map(e => {
    const isPending = f.pending === e.id;
    const cls = ['node', colorClass(e.type), isPending ? 'sel' : '',
      S.isOrphan(e.id) ? 'orphan' : ''].filter(Boolean).join(' ');
    return h('div', {
      class: cls,
      style: `left:${e.x}px; top:${e.y}px; width:${NW}px; height:${NH}px;` +
             (f.mode ? ' cursor:crosshair;' : ' cursor:grab;'),
      title: f.mode ? 'Click to select' : 'Drag to move · click to open record',
      onpointerdown: ev => startDrag(ev, e),
      onclick: ev => handleModeClick(ev, e),
    },
      h('span', { class: 't' }, e.type === 'UCA' ? (e.uca_type || 'UCA') : S.TYPES[e.type].label),
      h('span', { class: 's' },
        e.type === 'Hazard' ? '→ opens on Ladder' : (e.title || '(untitled)').slice(0, 40)));
  });

  const diagram = h('div', {
    class: 'diagram',
    style: `width:${maxX}px; height:${maxY}px; transform:scale(${f.zoom / 100});`,
  }, nodes);
  diagram.insertBefore(g, diagram.firstChild);

  const modeBtn = (mode, label) => h('button', {
    class: 'fake-btn primary' + (f.mode === mode ? ' on' : ''),
    onclick: () => { f.mode = f.mode === mode ? null : mode; f.pending = null; S.emit(); },
  }, label);

  return h('div', { class: 'view' },
    h('div', { class: 'toolbar' },
      h('button', {
        class: 'fake-btn primary',
        onclick: ev => openCard(ev, S.create('Controller', { title: '' }).id),
      }, '+ Add controller'),
      h('button', {
        class: 'fake-btn primary',
        onclick: ev => openCard(ev, S.create('ControlledProcess', { title: '' }).id),
      }, '+ Add controlled process'),
      modeBtn('action', '+ Draw control action'),
      modeBtn('uca', '+ Add UCA'),
      h('div', { class: 'zoom-row' },
        h('span', { style: 'font-size:11px; color:#666;' }, 'Zoom'),
        h('input', {
          type: 'range', min: '40', max: '150', value: String(f.zoom),
          oninput: ev => {
            f.zoom = +ev.target.value;
            const d = document.querySelector('#control-diagram-wrap .diagram');
            if (d) d.style.transform = `scale(${f.zoom / 100})`;
            const lbl = document.getElementById('controlZoomLabel');
            if (lbl) lbl.textContent = f.zoom + '%';
          },
        }),
        h('span', { id: 'controlZoomLabel', style: 'font-size:11px; width:34px;' }, f.zoom + '%')),
      h('button', {
        class: 'legend-toggle', onclick: () => { f.legend = !f.legend; S.emit(); },
      }, f.legend ? 'Hide legend ▴' : 'Show legend ▾')),

    f.mode ? h('div', { class: 'review-banner' },
      h('span', {}, f.mode === 'action'
        ? (f.pending ? '2 of 2 — now click the Controlled Process this action targets.'
                     : '1 of 2 — click the Controller that issues this action.')
        : 'Click the Control Action this UCA can become.'),
      h('button', { class: 'fake-btn', onclick: () => { f.mode = null; f.pending = null; S.emit(); } }, 'Cancel')) : null,

    f.legend ? h('div', { class: 'legend-panel open' },
      h('div', { class: 'legend-col' }, h('h5', {}, 'Entity color'),
        h('div', { class: 'legend-row' }, h('span', { class: 'swatch c-hazard' }), 'Control structure')),
      h('div', { class: 'legend-col' }, h('h5', {}, 'Edge style'),
        h('div', { class: 'legend-row' }, h('span', { class: 'line-sample', style: 'border-top:2px solid #333;' }),
          'derives — issues / targets / can_become')),
      h('div', { class: 'legend-col' }, h('h5', {}, 'Exemptions'),
        h('div', { class: 'legend-row' },
          'Controller, Controlled Process and Control Action are exempt from orphan detection — an unconnected one just sits there, no flag'))) : null,

    h('div', { class: 'canvas', id: 'control-diagram-wrap' }, diagram),
    h('div', { class: 'annotation' },
      'Placing a box creates the record immediately, blank — you name it in the card, not before it exists. Drag boxes to arrange them; positions persist here (unlike the Ladder, which is auto-laid-out). A UCA here is the same record that feeds the Ladder\'s bottom-up chain, not a duplicate — editing it in either place edits the one entity.'));
}
