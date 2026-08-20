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
    tier, human ? h('span', { class: 'human' }, ' ✑') : null);
}

/** A small badge for reviewState, used on the Database's Review column and inside the card. */
export function reviewBadge(id) {
  const e = S.get(id);
  if (!e || e.reviewState !== 'needs-review') return h('span', { class: 'review-pill current' }, 'Current');
  return h('span', {
    class: 'review-pill stale',
    title: `Flagged because "${e.staleReason}" changed`,
  }, 'Needs Review');
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
// Editing here writes to the same record the Database shows — one store, N
// projections. The card re-renders its own body on every store change while
// open (renderCardBody, called from the S.subscribe hook wired in ensureCard),
// so the computed tier, the link list, the review state and the orphan
// warning never go stale while a user is looking at them.

let cardEl, dimEl, openId = null;

function ensureCard() {
  if (cardEl) return;
  dimEl = h('div', { class: 'overlay-dim', onclick: closeCard });
  cardEl = h('div', { class: 'flip-card' });
  document.body.append(dimEl, cardEl);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCard(); });
  S.subscribe(() => { if (openId && S.get(openId)) renderCardBody(openId); else if (openId) closeCard(); });
}

export function closeCard() {
  if (!cardEl) return;
  cardEl.classList.remove('open');
  dimEl.classList.remove('open');
  openId = null;
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

const numIn = (id, key, val, min, max) => h('input', {
  type: 'number', min: String(min), max: String(max), value: String(val ?? min),
  oninput: e => S.update(id, { [key]: Math.max(min, Math.min(max, +e.target.value || min)) }),
});

/** Rebuild the card's body for `id` in place — used for the first open and for every live refresh. */
function renderCardBody(id) {
  const e = S.get(id);
  if (!e) return;
  const meta = S.TYPES[e.type];
  const settings = S.getSettings();

  const body = [
    h('h3', {}, typeBadge(e.type), h('span', { class: 'close', onclick: closeCard }, '×')),
  ];

  if (e.reviewState === 'needs-review') {
    body.push(h('div', { class: 'card-review-banner' },
      h('span', {}, `Needs Review — flagged because "${e.staleReason}" changed`),
      h('button', { class: 'fake-btn', onclick: () => S.markReviewed(id) }, 'Mark Reviewed')));
  }

  body.push(field('Title', textIn(id, 'title', e.title)));

  if (e.type === 'UCA') {
    body.push(field('UCA Type', selIn(id, 'uca_type', e.uca_type, S.UCA_TYPES)));
    body.push(field('Context', areaIn(id, 'context', e.context)));
  }
  if (e.type === 'Controller') body.push(field('Controller Type', textIn(id, 'ctype', e.ctype)));
  if (e.type === 'Loss' || e.type === 'LossScenario') {
    body.push(field('Description', areaIn(id, 'description', e.description)));
  }
  if (e.type === 'Metric') {
    body.push(field('Value', textIn(id, 'value', e.value)));
    body.push(field('Unit', textIn(id, 'unit', e.unit)));
    body.push(field('Threshold', textIn(id, 'threshold', e.threshold)));
    body.push(field('Trend', selIn(id, 'trend', e.trend, ['Up', 'Flat', 'Down'])));
  }

  body.push(field('Owner', selIn(id, 'owner', e.owner, settings.owners, '— Unassigned —')));
  body.push(field('Status', selIn(id, 'status', e.status, S.STATUSES)));
  body.push(field('Priority', selIn(id, 'priority', e.priority, S.PRIORITIES)));

  const leaf = S.outgoing(id, 'derives').length === 0;
  if (leaf) {
    body.push(field('Risk / Severity Tier (Human-Set Leaf)', selIn(id, 'tier', e.tier, S.TIERS)));
  } else {
    body.push(field('Risk Tier (Computed Rollup)',
      h('div', { class: 'computed' }, S.computedTier(id), e.tierOverride ? ' — human override' : ' — calculated')));
    body.push(field('Aggregation', selIn(id, 'aggregation', e.aggregation, ['weighted-average', 'worst'])));
    if (e.aggregation === 'worst') {
      const m = new Set(S.outgoing(id, 'derives').map(x => x.to)).size;
      body.push(field(`Worst N Of ${m}`, numIn(id, 'worstN', e.worstN, 1, Math.max(1, m))));
    }
    body.push(field('Override Computed Tier', selIn(id, 'tierOverride', e.tierOverride, S.TIERS.slice(1), '— No Override —')));
  }

  body.push(field('Notes', areaIn(id, 'notes', e.notes)));
  body.push(field('Attachments', h('div', {
    class: 'attach',
    onclick: () => {
      const name = prompt('Evidence document filename (attach-only in phase 1):');
      if (name) S.update(id, { attachments: [...e.attachments, name] });
    },
  }, e.attachments.length ? e.attachments.join(', ') : '+ Attach Evidence Document')));

  // linked entities, with edge kind, removable, and per-link note for Metric parents
  const links = S.linksFor(id);
  const linkRows = links.map(x => {
    const other = S.get(x.from === id ? x.to : x.from);
    if (!other) return null;
    const dir = x.from === id ? '→' : '←';
    const row = [
      h('span', { class: 'edge-badge ' + x.kind }, x.kind),
      h('span', {}, x.kind === 'equivalence' ? '⛓' : dir, ' ', other.title || S.TYPES[other.type].label),
    ];
    if (e.type === 'Metric' || other.type === 'Metric') {
      row.push(h('input', {
        class: 'link-note', placeholder: 'Note (optional)', value: x.note || '',
        oninput: ev => S.updateEdge(x.id, { note: ev.target.value }),
      }));
    }
    row.push(h('span', { class: 'x', title: 'Remove Link', onclick: () => S.unlink(x.id) }, '×'));
    return h('div', { class: 'linkrow' }, row);
  }).filter(Boolean);

  body.push(h('div', { class: 'links' },
    h('label', { class: 'links-label' }, `Links (${linkRows.length})`),
    ...(linkRows.length ? linkRows : [h('div', { class: 'links-empty' }, 'None')]),
    !meta.exempt && S.isOrphan(id)
      ? h('div', { class: 'orphan-warn' }, '⚠ Orphan — no upward link. Surfaced in the Database’s orphan filter.')
      : null,
    addLinkControl(id)));

  body.push(h('button', {
    class: 'fake-btn danger', style: 'width:100%; margin-top:8px;',
    onclick: () => { if (confirm('Delete this entity and its links?')) { S.remove(id); closeCard(); } },
  }, 'Delete Entity'));

  body.push(h('div', { class: 'hint' }, 'Edits here write straight to the Database record.'));

  cardEl.replaceChildren(...body);
}

/**
 * Threatens and equivalence links have no natural diagram gesture — derives
 * edges are created by the guided flows in Mission Canvas and Control
 * Structure, but "this threatens that" or "these two are equivalent" are
 * cross-cutting relationships that can point anywhere. The card is where
 * they get created.
 */
function addLinkControl(id) {
  const others = S.all().filter(x => x.id !== id);
  let targetId = others[0]?.id || '';
  let kind = 'threatens';
  const targetSel = h('select', { onchange: e => { targetId = e.target.value; } },
    others.map(o => h('option', { value: o.id }, `${S.TYPES[o.type].label}: ${o.title || '(untitled)'}`.slice(0, 48))));
  const kindSel = h('select', { onchange: e => { kind = e.target.value; } },
    [h('option', { value: 'threatens' }, 'Threatens'), h('option', { value: 'equivalence' }, 'Is Equivalent To')]);

  return h('div', { class: 'add-link' },
    h('label', { class: 'links-label' }, 'Add A Link'),
    h('div', { class: 'add-link-row' }, kindSel, targetSel,
      h('button', {
        class: 'fake-btn', onclick: () => {
          if (!targetId) return;
          const result = S.link(id, targetId, kind);
          if (!result) { toast('Link already exists or is not permitted'); return; }
          if (result.conflict) openEquivalenceConflict(id, targetId, result.conflict);
        },
      }, 'Link')));
}

/** Spec-resolved behaviour: linking two entities whose computed tiers disagree prompts for resolution rather than silently picking one. */
function openEquivalenceConflict(aId, bId, conflict) {
  const a = S.get(aId), b = S.get(bId);
  ensureCard();
  const resolve = (choice) => { S.resolveEquivalenceConflict(aId, bId, choice); closeCard(); };
  cardEl.replaceChildren(
    h('h3', {}, 'Equivalence Conflict', h('span', { class: 'close', onclick: closeCard }, '×')),
    h('div', { class: 'conflict-copy' },
      `${a.title || S.TYPES[a.type].label} computes as ${conflict.tierA}, but ${b.title || S.TYPES[b.type].label} computes as ${conflict.tierB}. Both are now linked as equivalent — pick how their severities should agree.`),
    h('button', { class: 'fake-btn primary', style: 'width:100%; margin-bottom:6px;', onclick: () => resolve('useA') },
      `Use ${conflict.tierA} For Both`),
    h('button', { class: 'fake-btn primary', style: 'width:100%; margin-bottom:6px;', onclick: () => resolve('useB') },
      `Use ${conflict.tierB} For Both`),
    h('button', { class: 'fake-btn primary', style: 'width:100%; margin-bottom:6px;', onclick: () => resolve('average') },
      'Average The Two'),
    h('button', { class: 'fake-btn', style: 'width:100%;', onclick: () => resolve('independent') },
      'Keep Independent (Allow Disagreement)'));
  cardEl.classList.add('open');
  dimEl.classList.add('open');
}

export function openCard(evt, id, opts = {}) {
  ensureCard();
  if (evt && evt.stopPropagation) evt.stopPropagation();
  if (!S.get(id)) return;
  openId = id;
  renderCardBody(id);

  const x = Math.min((opts.x ?? evt?.clientX ?? window.innerWidth / 2) + 16, window.innerWidth - 316);
  const y = Math.min((opts.y ?? evt?.clientY ?? 140) - 20, window.innerHeight - 420);
  cardEl.style.left = Math.max(x, 8) + 'px';
  cardEl.style.top = Math.max(y, 12) + 'px';
  cardEl.classList.add('open');
  dimEl.classList.add('open');
}

/**
 * Resolve a CSS custom property to its computed hex/rgb value, once, cached.
 * SVG attributes set via setAttribute() can't resolve var(...) themselves, so
 * this is the one sanctioned place a hex-shaped string exists in JS — it is
 * always read *from* a token, never authored as a literal.
 */
const tokenCache = new Map();
export function token(name) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  tokenCache.set(name, v);
  return v;
}
