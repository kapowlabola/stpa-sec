import * as S from '../store.js';
import { h, openCard, colorClass, token } from '../ui.js';
import { NODE_W, NODE_H, COL_W, ROW_H, SUBTITLE_MAX, ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, CASCADE_STEP_MS } from '../geometry.js';

const f = { q: '', owner: 'All', tier: 'All', zoom: ZOOM_DEFAULT, legend: false, collapsed: new Set() };

// Lane baselines. A node's position is derived, never stored — position
// churn must not be part of anyone's workflow (that's what makes targeted
// re-analysis work). There is no "Auto Layout" toggle because there is
// nothing to toggle: layout is always automatic, with no manual mode.
const LANE_Y = { mission: 56, control: 196, metric: 206, hazard: 306, process: 402, loss: 408 };

const laneOf = (type) => (type === 'ControlledProcess' ? 'process' : S.TYPES[type].side);

/** Every entity reachable from `id` via outgoing derives edges — used for the collapse toggle. */
function descendantsOf(id) {
  const out = new Set();
  const queue = S.outgoing(id, 'derives').map(x => x.to);
  while (queue.length) {
    const cur = queue.shift();
    if (out.has(cur)) continue;
    out.add(cur);
    for (const e of S.outgoing(cur, 'derives')) queue.push(e.to);
  }
  return out;
}

function computeVisible() {
  const base = S.all().filter(e => {
    if (f.owner !== 'All' && e.owner !== f.owner) return false;
    if (f.tier !== 'All' && S.computedTier(e.id) !== f.tier) return false;
    if (f.q && !((e.title || '') + ' ' + S.TYPES[e.type].label).toLowerCase().includes(f.q.toLowerCase())) return false;
    return true;
  });
  if (!f.collapsed.size) return base;
  const hidden = new Set();
  for (const rootId of f.collapsed) for (const id of descendantsOf(rootId)) hidden.add(id);
  return base.filter(e => !hidden.has(e.id));
}

function layout(entities) {
  const buckets = new Map();
  const pos = {};
  const sorted = [...entities].sort((a, b) =>
    S.TYPES[a.type].rung - S.TYPES[b.type].rung || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const lane = laneOf(e.type);
    const col = S.TYPES[e.type].rung;
    const key = lane + ':' + col;
    const row = buckets.get(key) || 0;
    buckets.set(key, row + 1);
    pos[e.id] = { x: 24 + col * COL_W, y: LANE_Y[lane] + row * ROW_H, w: NODE_W, h: NODE_H };
  }
  return pos;
}

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

function buildEdgesSvg(visible, pos) {
  const shown = new Set(visible.map(e => e.id));
  const maxX = Math.max(900, ...Object.values(pos).map(p => p.x + p.w + 60));
  const maxY = Math.max(500, ...Object.values(pos).map(p => p.y + p.h + 50));
  const g = svg('svg', { width: maxX, height: maxY, class: 'diagram-svg' });
  const defs = svg('defs', {});
  for (const [id, colorVar] of [['arrowD', '--color-edge-derives'], ['arrowT', '--color-edge-threatens']]) {
    const m = svg('marker', { id, viewBox: '0 0 10 10', refX: '8', refY: '5',
      markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.appendChild(svg('path', { d: 'M1 1L9 5L1 9Z', fill: token(colorVar) }));
    defs.appendChild(m);
  }
  g.appendChild(defs);

  for (const e of S.edges()) {
    if (!shown.has(e.from) || !shown.has(e.to)) continue;
    const a = pos[e.from], b = pos[e.to];
    const style = e.kind === 'derives'
      ? { stroke: token('--color-edge-derives'), 'stroke-width': '1.8', 'marker-end': 'url(#arrowD)' }
      : e.kind === 'threatens'
      ? { stroke: token('--color-edge-threatens'), 'stroke-width': '1.6', 'stroke-dasharray': '6,4', 'marker-end': 'url(#arrowT)' }
      : { stroke: token('--color-edge-equivalence'), 'stroke-width': '1.8', 'stroke-dasharray': '2,4' };
    const line = svg('polyline', { points: route(a, b), fill: 'none', 'data-edge-kind': e.kind, ...style });
    line.appendChild(svg('title', {})).textContent = e.kind;
    g.appendChild(line);
  }
  return { svgEl: g, maxX, maxY };
}

function nodeClass(e, equivPartnerId) {
  const tier = S.computedTier(e.id);
  return ['node', colorClass(e.type),
    S.isOrphan(e.id) ? 'orphan' : '',
    equivPartnerId ? 'equiv' : '',
    S.isRed(tier) ? 'red-tier' : '',
    e.reviewState === 'needs-review' ? 'stale' : '',
  ].filter(Boolean).join(' ');
}

function equivPartnerOf(id) {
  const link = S.linksFor(id).find(x => x.kind === 'equivalence');
  if (!link) return null;
  return link.from === id ? link.to : link.from;
}

function buildNode(e, p) {
  const equivPartnerId = equivPartnerOf(e.id);
  const tier = S.computedTier(e.id);
  const hasChildren = S.outgoing(e.id, 'derives').length > 0;
  const node = h('div', {
    class: nodeClass(e, equivPartnerId),
    style: `left:${p.x}px; top:${p.y}px; width:${p.w}px; height:${p.h}px;` +
           (e.reviewState === 'needs-review' ? `transition-delay:${(e.staleDepth || 0) * CASCADE_STEP_MS}ms;` : ''),
    title: `${S.TYPES[e.type].label} — ${tier}${e.reviewState === 'needs-review' ? ' — needs review' : ''}`,
    'data-entity-id': e.id,
    onclick: ev => openCard(ev, e.id),
    onmouseenter: () => { if (equivPartnerId) document.querySelector(`[data-entity-id="${equivPartnerId}"]`)?.classList.add('equiv-hover'); },
    onmouseleave: () => { if (equivPartnerId) document.querySelector(`[data-entity-id="${equivPartnerId}"]`)?.classList.remove('equiv-hover'); },
  },
    equivPartnerId ? h('span', { class: 'chain', title: 'Equivalence link — click either node to open it' }, '⛓') : null,
    hasChildren ? h('span', {
      class: 'collapse-toggle', title: f.collapsed.has(e.id) ? 'Expand' : 'Collapse',
      onclick: ev => { ev.stopPropagation(); f.collapsed.has(e.id) ? f.collapsed.delete(e.id) : f.collapsed.add(e.id); S.emit(); },
    }, f.collapsed.has(e.id) ? '▸' : '▾') : null,
    h('span', { class: 't' }, S.TYPES[e.type].label),
    h('span', { class: 's' }, (e.title || '(untitled)').slice(0, SUBTITLE_MAX)));
  return node;
}

/** Patch an already-mounted node element in place — same element, new class/text/position, so a CSS transition can fire. */
function patchNode(el, e, p) {
  const equivPartnerId = equivPartnerOf(e.id);
  el.className = nodeClass(e, equivPartnerId);
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.style.transitionDelay = e.reviewState === 'needs-review' ? `${(e.staleDepth || 0) * CASCADE_STEP_MS}ms` : '';
  const tier = S.computedTier(e.id);
  el.title = `${S.TYPES[e.type].label} — ${tier}${e.reviewState === 'needs-review' ? ' — needs review' : ''}`;
  const s = el.querySelector('.s');
  if (s) s.textContent = (e.title || '(untitled)').slice(0, SUBTITLE_MAX);
  const collapseToggle = el.querySelector('.collapse-toggle');
  if (collapseToggle) collapseToggle.textContent = f.collapsed.has(e.id) ? '▸' : '▾';
}

let mounted = null; // { diagramEl, canvasWrapEl, nodeEls: Map<id, HTMLElement> }

function buildDiagram() {
  const visible = computeVisible();
  const pos = layout(visible);
  const { svgEl, maxX, maxY } = buildEdgesSvg(visible, pos);
  const diagram = h('div', {
    class: 'diagram', id: 'ladderDiagram',
    style: `width:${maxX}px; height:${maxY}px; transform:scale(${f.zoom / 100});`,
  },
    svgEl,
    h('div', { class: 'lane-label', style: 'left:24px; top:38px;' }, 'Top-Down (Mission Side)'),
    h('div', { class: 'lane-label', style: 'left:24px; top:180px;' }, 'Convergence'),
    h('div', { class: 'lane-label', style: 'left:24px; top:288px;' }, 'Bottom-Up (Hazard Side)'));

  const nodeEls = new Map();
  for (const e of visible) {
    const node = buildNode(e, pos[e.id]);
    nodeEls.set(e.id, node);
    diagram.appendChild(node);
  }
  return { diagram, visible, pos, nodeEls };
}

export function render() {
  const built = buildDiagram();
  mounted = { diagramEl: built.diagram, nodeEls: built.nodeEls };

  const view = h('div', { class: 'view' },
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'fake-input', placeholder: 'Search Entities…', value: f.q, 'data-focus-key': 'lad-q',
        oninput: ev => { f.q = ev.target.value; S.emit(); },
      }),
      h('select', { class: 'fake-input', onchange: ev => { f.owner = ev.target.value; S.emit(); } },
        [h('option', { value: 'All', selected: f.owner === 'All' }, 'Owner: All'),
         ...S.getSettings().owners.map(o => h('option', { value: o, selected: f.owner === o }, o))]),
      h('select', { class: 'fake-input', onchange: ev => { f.tier = ev.target.value; S.emit(); } },
        [h('option', { value: 'All', selected: f.tier === 'All' }, 'Risk Tier: All'),
         ...S.TIERS.map(t => h('option', { value: t, selected: f.tier === t }, t))]),
      f.collapsed.size ? h('button', { class: 'fake-btn', onclick: () => { f.collapsed.clear(); S.emit(); } }, 'Expand All') : null,
      h('div', { class: 'zoom-row' },
        h('span', { class: 'zoom-label' }, 'Zoom'),
        h('input', {
          type: 'range', min: String(ZOOM_MIN), max: String(ZOOM_MAX), value: String(f.zoom),
          oninput: ev => {
            f.zoom = +ev.target.value;
            if (mounted?.diagramEl) mounted.diagramEl.style.transform = `scale(${f.zoom / 100})`;
            const lbl = document.getElementById('ladderZoomLabel');
            if (lbl) lbl.textContent = f.zoom + '%';
          },
        }),
        h('span', { id: 'ladderZoomLabel', class: 'zoom-pct' }, f.zoom + '%')),
      h('button', {
        class: 'legend-toggle', onclick: () => { f.legend = !f.legend; S.emit(); },
      }, f.legend ? 'Hide Legend ▴' : 'Show Legend ▾')),

    f.legend ? legendPanel() : null,
    h('div', { class: 'canvas', id: 'ladder-diagram-wrap' }, mounted.diagramEl),
    h('div', { class: 'rowcount' },
      `${built.visible.length} nodes shown${f.collapsed.size ? ` (${f.collapsed.size} subtree${f.collapsed.size === 1 ? '' : 's'} collapsed)` : ''} · positions are auto-derived, never stored · click a node to open its record`));

  return view;
}

/**
 * Incremental refresh while the Ladder tab stays mounted. Patches existing
 * node elements in place (add/remove/patch by entity id) instead of
 * rebuilding the diagram, which is what lets the "needs review" class
 * transition actually animate — a freshly created element has no prior
 * state to animate from.
 */
export function update() {
  if (!mounted || !mounted.diagramEl.isConnected) return; // let app.js fall back to render()
  patchDiagramInPlace();
  return true;
}

function patchDiagramInPlace() {
  const visible = computeVisible();
  const pos = layout(visible);
  const nextIds = new Set(visible.map(e => e.id));

  // Remove nodes no longer visible.
  for (const [id, el] of [...mounted.nodeEls]) {
    if (!nextIds.has(id)) { el.remove(); mounted.nodeEls.delete(id); }
  }
  // Patch existing, create new.
  for (const e of visible) {
    const existing = mounted.nodeEls.get(e.id);
    if (existing) {
      patchNode(existing, e, pos[e.id]);
    } else {
      const node = buildNode(e, pos[e.id]);
      mounted.nodeEls.set(e.id, node);
      mounted.diagramEl.appendChild(node);
    }
  }

  // Edges don't animate — regenerate wholesale, cheaper than incremental diffing.
  const oldSvg = mounted.diagramEl.querySelector('.diagram-svg');
  const { svgEl, maxX, maxY } = buildEdgesSvg(visible, pos);
  if (oldSvg) oldSvg.replaceWith(svgEl); else mounted.diagramEl.prepend(svgEl);
  mounted.diagramEl.style.width = maxX + 'px';
  mounted.diagramEl.style.height = maxY + 'px';

  const rowcount = mounted.diagramEl.closest('.view')?.querySelector('.rowcount');
  if (rowcount) {
    rowcount.textContent = `${visible.length} nodes shown${f.collapsed.size ? ` (${f.collapsed.size} subtree${f.collapsed.size === 1 ? '' : 's'} collapsed)` : ''} · positions are auto-derived, never stored · click a node to open its record`;
  }
}

function legendPanel() {
  const row = (sw, txt) => h('div', { class: 'legend-row' }, sw, txt);
  return h('div', { class: 'legend-panel open' },
    h('div', { class: 'legend-col' }, h('h5', {}, 'Entity Color'),
      row(h('span', { class: 'swatch c-mission' }), 'Mission-side (top-down)'),
      row(h('span', { class: 'swatch c-hazard' }), 'Hazard-side (bottom-up)'),
      row(h('span', { class: 'swatch c-control' }), 'Security Control (convergence)'),
      row(h('span', { class: 'swatch c-loss' }), 'Loss (terminal, human-set)'),
      row(h('span', { class: 'swatch c-metric' }), 'Metric')),
    h('div', { class: 'legend-col' }, h('h5', {}, 'Edge / Link Style'),
      row(h('span', { class: 'line-sample derives-sample' }), 'Derives — drives rollup math'),
      row(h('span', { class: 'line-sample threatens-sample' }), 'Threatens — traceability only'),
      row(h('span', { class: 'line-sample equivalence-sample' }), 'Equivalence link (⛓, no direction)')),
    h('div', { class: 'legend-col' }, h('h5', {}, 'Flags'),
      row(h('span', { class: 'swatch orphan-swatch' }), 'Orphan / gap'),
      row(h('span', { class: 'swatch red-tier-swatch' }), 'Critical or above (red boundary)'),
      row(h('span', { class: 'swatch stale-swatch' }), 'Needs review'),
      row(h('span', { class: 'tier-pill grey human-sample' }, '✑'), 'Human-set, not calculated')));
}
