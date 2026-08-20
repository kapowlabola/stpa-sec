import * as S from './store.js';

export const h = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.setAttribute('style', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach(c => c != null && c !== false &&
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c))));
  return n;
};

export const colorClass = (type) => ({
  mission: 'c-mission', hazard: 'c-hazard', control: 'c-control',
  loss: 'c-loss', metric: 'c-metric',
}[S.TYPES[type].side]);

export const typeBadge = (type) =>
  h('span', { class: 'type-badge ' + colorClass(type) }, S.TYPES[type].label);

export function tierPill(id) {
  const tier = S.computedTier(id);
  const human = S.tierIsSet(id);
  const cls = tier === 'Unassessed' ? 'grey' : S.isRed(tier) ? 'red' : 'green';
  return h('span', { class: 'tier-pill ' + cls, title: human ? 'Human-set override' : 'Computed rollup' },
    tier, human ? h('span', { class: 'human' }, ' ✎') : null);
}

let toastEl;
export function toast(msg) {
  if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.appendChild(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 1800);
}

// --- click-anchored detail card ---------------------------------------------
// Fixed pixel size regardless of diagram zoom, anchored to the click point.
// Editing here writes to the same record the Database shows — one store, N projections.

let cardEl, dimEl;

function ensureCard() {
  if (cardEl) return;
  dimEl = h('div', { class: 'overlay-dim', onclick: closeCard });
  cardEl = h('div', { class: 'flip-card' });
  document.body.append(dimEl, cardEl);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
}

export function closeCard() {
  if (!cardEl) return;
  cardEl.classList.remove('open');
  dimEl.classList.remove('open');
}

const field = (label, ctrl) => h('div', { class: 'field' }, h('label', {}, label), ctrl);

const textIn = (id, key, val) => h('input', {
  value: val || '',
  oninput: e => S.update(id, { [key]: e.target.value }),
});

const areaIn = (id, key, val) => h('textarea', {
  oninput: e => S.update(id, { [key]: e.target.value }),
}, val || '');

const selIn = (id, key, val, opts, blank) => h('select', {
  onchange: e => S.update(id, { [key]: e.target.value || null }),
}, [blank ? h('option', { value: '' }, blank) : null,
    ...opts.map(o => h('option', { value: o, selected: o === val }, o))]);

export function openCard(evt, id, opts = {}) {
  ensureCard();
  evt.stopPropagation();
  const e = S.get(id);
  if (!e) return;
  const meta = S.TYPES[e.type];

  const body = [
    h('h3', {}, typeBadge(e.type), h('span', { class: 'close', onclick: closeCard }, '×')),
    field('Title', textIn(id, 'title', e.title)),
  ];

  if (e.type === 'UCA') {
    body.push(field('UCA type', selIn(id, 'uca_type', e.uca_type, S.UCA_TYPES)));
    body.push(field('Context', areaIn(id, 'context', e.context)));
  }
  if (e.type === 'Controller') body.push(field('Controller type', textIn(id, 'ctype', e.ctype)));
  if (e.type === 'Loss' || e.type === 'LossScenario') {
    body.push(field('Description', areaIn(id, 'description', e.description)));
  }
  if (e.type === 'Metric') {
    body.push(field('Value', textIn(id, 'value', e.value)));
    body.push(field('Unit', textIn(id, 'unit', e.unit)));
    body.push(field('Threshold', textIn(id, 'threshold', e.threshold)));
    body.push(field('Trend', selIn(id, 'trend', e.trend, ['up', 'flat', 'down'])));
  }

  body.push(field('Owner', selIn(id, 'owner', e.owner, S.OWNERS, '— unassigned —')));
  body.push(field('Status', selIn(id, 'status', e.status, S.STATUSES)));
  body.push(field('Priority', selIn(id, 'priority', e.priority, S.PRIORITIES)));

  const leaf = S.outgoing(id, 'derives').length === 0;
  if (leaf) {
    body.push(field('Risk / severity tier (human-set leaf)',
      selIn(id, 'tier', e.tier, S.TIERS)));
  } else {
    body.push(field('Risk tier (computed rollup)',
      h('div', { class: 'computed' }, S.computedTier(id),
        e.tierOverride ? ' — human override' : ' — calculated')));
    body.push(field('Aggregation',
      selIn(id, 'aggregation', e.aggregation, ['weighted-average', 'worst'])));
    body.push(field('Override computed tier',
      selIn(id, 'tierOverride', e.tierOverride, S.TIERS.slice(1), '— no override —')));
  }

  body.push(field('Notes', areaIn(id, 'notes', e.notes)));
  body.push(field('Attachments', h('div', {
    class: 'attach',
    onclick: () => {
      const name = prompt('Evidence document filename (attach-only in phase 1):');
      if (name) { S.update(id, { attachments: [...e.attachments, name] }); openCard(evt, id, opts); }
    },
  }, e.attachments.length ? e.attachments.join(', ') : '+ Attach evidence document')));

  // linked entities, with edge kind, removable
  const links = S.linksFor(id);
  const linkRows = links.map(x => {
    const other = S.get(x.from === id ? x.to : x.from);
    if (!other) return null;
    const dir = x.from === id ? '→' : '←';
    return h('div', { class: 'linkrow' },
      h('span', { class: 'edge-badge ' + x.kind }, x.kind),
      h('span', {}, x.kind === 'equivalence' ? '⛓' : dir, ' ', other.title || S.TYPES[other.type].label),
      h('span', { class: 'x', title: 'Remove link', onclick: () => { S.unlink(x.id); closeCard(); } }, '×'));
  }).filter(Boolean);

  body.push(h('div', { class: 'links' },
    h('label', { style: 'color:#777; font-size:9.5px; text-transform:uppercase;' },
      `Links (${linkRows.length})`),
    ...(linkRows.length ? linkRows : [h('div', { style: 'color:#999; font-size:10px;' }, 'none')]),
    !meta.exempt && S.isOrphan(id)
      ? h('div', { style: 'color:#b23a3a; font-size:10px; margin-top:5px;' },
          '⚠ Orphan — no upward link. Surfaced in the gaps view.')
      : null));

  body.push(h('button', {
    class: 'fake-btn danger', style: 'width:100%; margin-top:8px;',
    onclick: () => { if (confirm('Delete this entity and its links?')) { S.remove(id); closeCard(); } },
  }, 'Delete entity'));

  body.push(h('div', { class: 'hint' }, 'edits here write straight to the Database record'));

  cardEl.replaceChildren(...body);

  const x = Math.min((opts.x ?? evt.clientX) + 16, window.innerWidth - 316);
  const y = Math.min((opts.y ?? evt.clientY) - 20, window.innerHeight - 420);
  cardEl.style.left = Math.max(x, 8) + 'px';
  cardEl.style.top = Math.max(y, 12) + 'px';
  cardEl.classList.add('open');
  dimEl.classList.add('open');
}

// Re-render an open card in place after a store change (keeps card and store in sync).
export function refreshCardIfOpen() {
  if (cardEl && cardEl.classList.contains('open')) {
    const rect = cardEl.getBoundingClientRect();
    cardEl.style.left = rect.left + 'px';
    cardEl.style.top = rect.top + 'px';
  }
}
