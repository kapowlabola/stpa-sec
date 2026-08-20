// Single entity store. Database / Ladder / Control Structure are three projections
// of THIS object, never three copies (Phase 2 handoff, "bidirectional sync principle").

const KEY = 'risky-ladder-v1';

export const TYPES = {
  MissionCanvas:      { label: 'Mission Canvas',      side: 'mission', rung: 0, exempt: true  },
  MissionRequirement: { label: 'Mission Req.',        side: 'mission', rung: 1, exempt: false },
  ProtectionNeed:     { label: 'Protection Need',     side: 'mission', rung: 2, exempt: false },
  SecurityObjective:  { label: 'Security Obj.',       side: 'mission', rung: 3, exempt: false },
  SecurityRequirement:{ label: 'Security Req.',       side: 'mission', rung: 4, exempt: false },
  SecurityControl:    { label: 'Security Control',    side: 'control', rung: 6, exempt: false },
  Metric:             { label: 'Metric',              side: 'metric',  rung: 7, exempt: false },
  Controller:         { label: 'Controller',          side: 'hazard',  rung: 0, exempt: true  },
  ControlAction:      { label: 'Control Action',      side: 'hazard',  rung: 1, exempt: true  },
  ControlledProcess:  { label: 'Controlled Process',  side: 'hazard',  rung: 1, exempt: true, subrow: 1 },
  UCA:                { label: 'UCA',                 side: 'hazard',  rung: 2, exempt: false },
  Hazard:             { label: 'Hazard',              side: 'hazard',  rung: 3, exempt: false },
  Loss:               { label: 'Loss',                side: 'loss',    rung: 3, exempt: false, subrow: 1 },
  LossScenario:       { label: 'Loss Scenario',       side: 'hazard',  rung: 4, exempt: false },
  SecurityConstraint: { label: 'Security Constraint', side: 'hazard',  rung: 5, exempt: false },
};

export const TIERS = ['Unassessed', 'Negligible', 'Marginal', 'Critical', 'Catastrophic'];
// Fixed numeric midpoints — internal to the rollup math only, never rendered as a number.
const TIER_SCORE = { Negligible: 1, Marginal: 2, Critical: 3, Catastrophic: 4 };
export const OWNERS = ['Engineering', 'Cybersecurity', 'Supply Chain', 'Logistics',
                       'Contracting', 'Program Management', 'Test & Evaluation'];
export const STATUSES = ['To Be Completed', 'Completed'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const UCA_TYPES = ['not providing', 'providing causes hazard', 'wrong timing or order', 'wrong duration'];

// Red/green flip boundary — configurable per program, default Critical and above.
export const RED_AT = 3;

let state = load();
const subs = [];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through to seed */ }
  return null;
}

export function init(seed) {
  if (!state) { state = seed(); persist(); }
  return state;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function subscribe(fn) { subs.push(fn); }
export function emit() { persist(); subs.forEach(fn => fn()); }

export const all = () => Object.values(state.entities);
export const get = (id) => state.entities[id];
export const edges = () => state.edges;
export const canvasMeta = () => state.canvasMeta;

let seq = Date.now();
const nextId = () => 'e' + (++seq).toString(36);

export function create(type, fields = {}) {
  const e = {
    id: nextId(), type, title: fields.title || '',
    owner: fields.owner || '', status: fields.status || 'To Be Completed',
    priority: fields.priority || 'Medium', tier: fields.tier || 'Unassessed',
    notes: fields.notes || '', attachments: fields.attachments || [],
    aggregation: fields.aggregation || 'weighted-average',
    tierOverride: fields.tierOverride || null,
    ...fields,
  };
  state.entities[e.id] = e;
  emit();
  return e;
}

export function update(id, patch) {
  Object.assign(state.entities[id], patch);
  if (state.entities[id].type === 'MissionCanvas') state.canvasMeta.dirtyAt = Date.now();
  emit();
}

export function remove(id) {
  delete state.entities[id];
  state.edges = state.edges.filter(x => x.from !== id && x.to !== id);
  emit();
}

export function link(from, to, kind = 'derives') {
  if (from === to) return null;
  if (state.edges.some(x => x.from === from && x.to === to && x.kind === kind)) return null;
  const edge = { id: nextId(), from, to, kind };
  state.edges.push(edge);
  emit();
  return edge;
}

export function unlink(edgeId) {
  state.edges = state.edges.filter(x => x.id !== edgeId);
  emit();
}

// --- graph helpers -----------------------------------------------------------
// Edges are stored in spec direction (Mission Canvas -> Mission Requirement).
// Risk SCORE flows the other way: a parent aggregates its outgoing `derives` targets.

export const outgoing = (id, kind) => state.edges.filter(x => x.from === id && (!kind || x.kind === kind));
export const incoming = (id, kind) => state.edges.filter(x => x.to === id && (!kind || x.kind === kind));
export const linksFor = (id) => state.edges.filter(x => x.from === id || x.to === id);

/** An entity lacking an expected upward link. Root + operational trio are exempt. */
export function isOrphan(id) {
  const e = state.entities[id];
  if (!e || TYPES[e.type].exempt) return false;
  return incoming(id, 'derives').length === 0;
}

/**
 * Rollup. Leaf (no outgoing `derives`) uses its human-set tier.
 * `threatens` edges are excluded — traceability only, never enter the math.
 * Equivalence-linked pairs share a downstream control; it is counted once because
 * dedupe happens on target id, not on path.
 */
export function computedTier(id, memo = new Map(), stack = new Set()) {
  if (memo.has(id)) return memo.get(id);
  const e = state.entities[id];
  if (!e) return 'Unassessed';
  if (stack.has(id)) return e.tier || 'Unassessed';   // cycle guard, memo handles diamonds
  stack.add(id);

  let result;
  if (e.tierOverride) {
    result = e.tierOverride;
  } else {
    // Dedupe on target id, so an equivalence-linked pair sharing one downstream
    // control counts that control once, not twice. Metrics track, they don't score.
    const kids = [...new Set(outgoing(id, 'derives').map(x => x.to))]
      .filter(cid => state.entities[cid] && state.entities[cid].type !== 'Metric')
      .map(cid => computedTier(cid, memo, stack))
      .map(t => TIER_SCORE[t])
      .filter(Boolean);

    if (!kids.length) {
      result = e.tier || 'Unassessed';
    } else {
      const score = e.aggregation === 'worst'
        ? Math.max(...kids)
        : kids.reduce((a, b) => a + b, 0) / kids.length; // equal 1/n edge weights
      result = TIERS[Math.max(1, Math.min(4, Math.round(score)))];
    }
  }

  stack.delete(id);
  memo.set(id, result);
  return result;
}

export const isRed = (tier) => (TIER_SCORE[tier] || 0) >= RED_AT;
export const tierIsSet = (id) => !!state.entities[id].tierOverride;

// --- import / export ---------------------------------------------------------

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed.entities || !parsed.edges) throw new Error('Not a Risky Ladder file');
  state = parsed;
  emit();
}

export function reset(seed) {
  state = seed();
  emit();
}
