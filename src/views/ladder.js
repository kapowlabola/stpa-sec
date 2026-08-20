import * as S from '../store.js';
import { h, openCard, colorClass } from '../ui.js';

const f = { q: '', owner: 'All', tier: 'All', zoom: 100, legend: false, layoutNonce: 0 };

const NW = 152, NH = 58, COL_W = 196, ROW_H = 78;
// Lane baselines. A node's position is derived, never stored — position churn must
// not be part of anyone's workflow (that's what makes targeted re-analysis work).
const LANE_Y = { mission: 56, control: 196, metric: 206, hazard: 306, process: 402, loss: 408 };

const laneOf = (type) => {
  if (type === 'ControlledProcess') return 'process';
  return S.TYPES[type].side;
};

function layout(entities) {
  const buckets = new Map();
  const pos = {};
  // Deterministic order so the layout doesn't jitter between renders.
  const sorted = [...entities].sort((a, b) =>
    S.TYPES[a.type].rung - S.TYPES[b.type].rung || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const lane = laneOf(e.type);
    const col = S.TYPES[e.type].rung;
    const key = lane + ':' + col;
    const row = buckets.get(key) || 0;
    buckets.set(key, row + 1);
    pos[e.id] = { x: 24 + col * COL_W, y: LANE_Y[lane] + row * ROW_H, w: NW, h: NH };
  }
  return pos;
}

/** Orthogonal router: forward elbow, vertical for same-column, over-the-top for back edges. */
function route(a, b) {
  if (b.x > a.x + a.w - 4) {
    const ax = a.x + a.w, ay = a.y + a.h / 2, bx = b.x, by = b.y + b.h / 2;
    const mx = (ax + bx) / 2;
    return `${ax},${ay} ${mx},${ay} ${mx},${by} ${bx},${by}`;
  }
  if (Math.abs(a.x - b.x) < a.w) {
    const cx = a.x + a.w / 2;
    return b.y > a.y ? `${cx},${a.y + a.h} ${cx},${b.y}` : `${cx},${a.y} ${cx},${b.y + b.h}`;
  }
  const top = Math.min(a.y, b.y) - 26;
  return `${a.x + a.w / 2},${a.y} ${a.x + a.w / 2},${top} ${b.x + b.w / 2},${top} ${b.x + b.w / 2},${b.y}`;
}

const svg = (tag, attrs) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

export function render() {
  const visible = S.all().filter(e => {
    if (f.owner !== 'All' && e.owner !== f.owner) return false;
    if (f.tier !== 'All' && S.computedTier(e.id) !== f.tier) return false;
    if (f.q && !((e.title || '') + ' ' + S.TYPES[e.type].label).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
  const shown = new Set(visible.map(e => e.id));
  const pos = layout(visible);

  const maxX = Math.max(900, ...Object.values(pos).map(p => p.x + p.w + 60));
  const maxY = Math.max(500, ...Object.values(pos).map(p => p.y + p.h + 50));

  const g = svg('svg', { width: maxX, height: maxY, style: 'position:absolute; top:0; left:0;' });
  const defs = svg('defs', {});
  for (const [id, fill] of [['arrowD', '#333'], ['arrowT', '#b23a3a']]) {
    const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '8', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.appendChild(svg('path', { d: 'M1 1L9 5L1 9Z', fill }));
    defs.appendChild(m);
  }
  g.appendChild(defs);

  for (const e of S.edges()) {
    if (!shown.has(e.from) || !shown.has(e.to)) continue;
    const a = pos[e.from], b = pos[e.to];
    const style = e.kind === 'derives'
      ? { stroke: '#333', 'stroke-width': '1.8', 'marker-end': 'url(#arrowD)' }
      : e.kind === 'threatens'
      ? { stroke: '#b23a3a', 'stroke-width': '1.6', 'stroke-dasharray': '6,4', 'marker-end': 'url(#arrowT)' }
      : { stroke: '#2f8f6f', 'stroke-width': '1.6', 'stroke-dasharray': '2,4' };
    const line = svg('polyline', { points: route(a, b), fill: 'none', ...style });
    line.appendChild(svg('title', {})).textContent = e.kind;
    g.appendChild(line);
  }

  const nodes = visible.map(e => {
    const p = pos[e.id];
    const equiv = S.linksFor(e.id).some(x => x.kind === 'equivalence');
    const tier = S.computedTier(e.id);
    const cls = ['node', colorClass(e.type),
      S.isOrphan(e.id) ? 'orphan' : '', equiv ? 'equiv' : '',
      S.isRed(tier) ? 'red-tier' : ''].filter(Boolean).join(' ');
    return h('div', {
      class: cls,
      style: `left:${p.x}px; top:${p.y}px; width:${p.w}px; height:${p.h}px;`,
      title: `${S.TYPES[e.type].label} — ${tier}`,
      onclick: ev => openCard(ev, e.id),
    },
      equiv ? h('span', { class: 'chain', title: 'equivalence link' }, '⛓') : null,
      h('span', { class: 't' }, S.TYPES[e.type].label),
      h('span', { class: 's' }, (e.title || '(untitled)').slice(0, 46)));
  });

  const diagram = h('div', {
    class: 'diagram',
    style: `width:${maxX}px; height:${maxY}px; transform:scale(${f.zoom / 100});`,
  },
    h('div', { class: 'lane-label', style: 'left:24px; top:38px;' }, 'top-down (mission side)'),
    h('div', { class: 'lane-label', style: 'left:24px; top:180px;' }, 'convergence'),
    h('div', { class: 'lane-label', style: 'left:24px; top:288px;' }, 'bottom-up (hazard side)'),
    nodes);
  diagram.insertBefore(g, diagram.firstChild);

  return h('div', { class: 'view' },
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'fake-input', placeholder: 'Search entities…', value: f.q, 'data-focus-key': 'lad-q',
        oninput: ev => { f.q = ev.target.value; S.emit(); },
      }),
      h('select', { class: 'fake-input', onchange: ev => { f.owner = ev.target.value; S.emit(); } },
        [h('option', { value: 'All', selected: f.owner === 'All' }, 'Owner: All'),
         ...S.OWNERS.map(o => h('option', { value: o, selected: f.owner === o }, o))]),
      h('select', { class: 'fake-input', onchange: ev => { f.tier = ev.target.value; S.emit(); } },
        [h('option', { value: 'All', selected: f.tier === 'All' }, 'Risk tier: All'),
         ...S.TIERS.map(t => h('option', { value: t, selected: f.tier === t }, t))]),
      h('button', { class: 'fake-btn', onclick: () => { f.layoutNonce++; S.emit(); } }, 'Auto layout ↻'),
      h('div', { class: 'zoom-row' },
        h('span', { style: 'font-size:11px; color:#666;' }, 'Zoom'),
        h('input', {
          type: 'range', min: '40', max: '150', value: String(f.zoom),
          oninput: ev => {
            f.zoom = +ev.target.value;
            const d = document.querySelector('#ladder-diagram-wrap .diagram');
            if (d) d.style.transform = `scale(${f.zoom / 100})`;
            const lbl = document.getElementById('ladderZoomLabel');
            if (lbl) lbl.textContent = f.zoom + '%';
          },
        }),
        h('span', { id: 'ladderZoomLabel', style: 'font-size:11px; width:34px;' }, f.zoom + '%')),
      h('button', {
        class: 'legend-toggle', onclick: () => { f.legend = !f.legend; S.emit(); },
      }, f.legend ? 'Hide legend ▴' : 'Show legend ▾')),

    f.legend ? legendPanel() : null,

    h('div', { class: 'canvas', id: 'ladder-diagram-wrap' }, diagram),
    h('div', { class: 'rowcount' },
      `${visible.length} nodes shown · positions are auto-derived, never stored · click a node to open its record`));
}

function legendPanel() {
  const row = (sw, txt) => h('div', { class: 'legend-row' }, sw, txt);
  return h('div', { class: 'legend-panel open' },
    h('div', { class: 'legend-col' }, h('h5', {}, 'Entity color'),
      row(h('span', { class: 'swatch c-mission' }), 'Mission-side (top-down)'),
      row(h('span', { class: 'swatch c-hazard' }), 'Hazard-side (bottom-up)'),
      row(h('span', { class: 'swatch c-control' }), 'Security Control (convergence)'),
      row(h('span', { class: 'swatch c-loss' }), 'Loss (terminal, human-set)'),
      row(h('span', { class: 'swatch c-metric' }), 'Metric')),
    h('div', { class: 'legend-col' }, h('h5', {}, 'Edge / link style'),
      row(h('span', { class: 'line-sample', style: 'border-top:2px solid #333;' }), 'derives — drives rollup math'),
      row(h('span', { class: 'line-sample', style: 'border-top:2px dashed var(--c-loss);' }), 'threatens — traceability only'),
      row(h('span', { class: 'line-sample', style: 'border-top:2px dotted var(--c-control);' }), 'equivalence link (⛓, no direction)')),
    h('div', { class: 'legend-col' }, h('h5', {}, 'Flags'),
      row(h('span', { class: 'swatch', style: 'background:#fff; border:2.5px dashed var(--c-loss);' }), 'orphan / gap'),
      row(h('span', { class: 'swatch', style: 'background:#fff; box-shadow:inset 0 -4px 0 var(--c-loss);' }), 'Critical or above (red boundary)'),
      row(h('span', { class: 'tier-pill grey', style: 'width:auto;' }, '✎'), 'human-set, not calculated')));
}
