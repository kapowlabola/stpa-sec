// Entity store: entities, edges, subscriptions, and the graph-shaped reads
// (outgoing/incoming/linksFor/isOrphan) and writes (create/update/link) every
// view is built on. Risk math lives in rollup.js, edge legality in
// validate.js, serialization in persist.js — this file is the facade views
// import, and re-exports the pieces of those modules views need so a view
// never has to know the domain layer is split into four files.

import { canLink } from './validate.js';
import * as Persist from './persist.js';

export const TYPES = {
  MissionCanvas:      { label: 'Mission Canvas',      side: 'mission', rung: 0, exempt: true  },
  MissionRequirement: { label: 'Mission Requirement', side: 'mission', rung: 1, exempt: false },
  ProtectionNeed:     { label: 'Protection Need',      side: 'mission', rung: 2, exempt: false },
  SecurityObjective:  { label: 'Security Objective',   side: 'mission', rung: 3, exempt: false },
  SecurityRequirement:{ label: 'Security Requirement', side: 'mission', rung: 4, exempt: false },
  SecurityControl:    { label: 'Security Control',     side: 'control', rung: 6, exempt: false },
  Metric:             { label: 'Metric',               side: 'metric',  rung: 7, exempt: false },
  Controller:         { label: 'Controller',           side: 'hazard',  rung: 0, exempt: true  },
  ControlAction:      { label: 'Control Action',       side: 'hazard',  rung: 1, exempt: true  },
  ControlledProcess:  { label: 'Controlled Process',   side: 'hazard',  rung: 1, exempt: true, subrow: 1 },
  UCA:                { label: 'UCA',                  side: 'hazard',  rung: 2, exempt: false },
  Hazard:             { label: 'Hazard',               side: 'hazard',  rung: 3, exempt: false },
  Loss:               { label: 'Loss',                 side: 'loss',    rung: 3, exempt: false, subrow: 1 },
  LossScenario:       { label: 'Loss Scenario',         side: 'hazard',  rung: 4, exempt: false },
  SecurityConstraint: { label: 'Security Constraint',  side: 'hazard',  rung: 5, exempt: false },
};

export const STATUSES = ['To Be Completed', 'Completed'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const UCA_TYPES = ['Not Providing', 'Providing Causes Hazard', 'Wrong Timing Or Order', 'Wrong Duration'];

// Content fields whose edit marks transitively-derived descendants for
// review. Deliberately a whitelist, not a metadata blacklist: a field added
// later defaults to NOT cascading, rather than silently cascade-storming
// every entity on every edit (owner/status/priority/notes/attachments are
// exactly the fields the Phase 2 handoff's "needs review" flag was never
// meant to react to).
const CASCADE_FIELDS = new Set([
  'title', 'description', 'context', 'tier', 'value', 'unit', 'threshold', 'ctype', 'uca_type',
  'key_partners', 'key_activities', 'key_resources', 'buy_in_and_support',
  'beneficiaries', 'deployment', 'cost_structure', 'impact_metrics',
]);

let state = null;
const subs = [];

function defaultSettings() {
  return {
    owners: ['Engineering', 'Cybersecurity', 'Supply Chain', 'Logistics',
             'Contracting', 'Program Management', 'Test & Evaluation'],
    redBoundaryScore: 3, // Critical and above = red, per the spec's stated default
  };
}

export function init(seed) {
  if (!state) {
    state = Persist.loadFromLocalStorage() || seed();
    if (!state.settings) state.settings = defaultSettings();
  }
  return state;
}

function persist() { Persist.saveToLocalStorage(state); }
export function subscribe(fn) { subs.push(fn); }
export function emit() { persist(); subs.forEach(fn => fn()); }

export const getSettings = () => state.settings;
export function updateSettings(patch) { Object.assign(state.settings, patch); emit(); }

export const all = () => Object.values(state.entities);
export const get = (id) => state.entities[id];
export const edges = () => state.edges;
export const canvasMeta = () => state.canvasMeta;

export function updateCanvasMeta(patch) {
  Object.assign(state.canvasMeta, patch);
  state.canvasMeta.dirtyAt = Date.now();
  const canvas = all().find(e => e.type === 'MissionCanvas');
  if (canvas) cascadeStale(canvas.id, 'Mission Canvas');
  emit();
}

let seq = Date.now();
const nextId = () => 'e' + (++seq).toString(36);

export function create(type, fields = {}) {
  if (type === 'MissionCanvas' && all().some(e => e.type === 'MissionCanvas')) {
    console.warn('Only one Mission Canvas is supported; ignoring create().');
    return null;
  }
  const e = {
    id: nextId(), type, title: fields.title || '',
    owner: fields.owner || '', status: fields.status || 'To Be Completed',
    priority: fields.priority || 'Medium', tier: fields.tier || 'Unassessed',
    notes: fields.notes || '', attachments: fields.attachments || [],
    aggregation: fields.aggregation || 'weighted-average',
    worstN: fields.worstN || 1,
    tierOverride: fields.tierOverride || null,
    reviewState: 'current', staleSince: null, staleReason: null, staleDepth: null,
    ...fields,
  };
  state.entities[e.id] = e;
  emit();
  return e;
}

export function update(id, patch) {
  const e = state.entities[id];
  if (!e) return;
  Object.assign(e, patch);
  const touchedContent = Object.keys(patch).some(k => CASCADE_FIELDS.has(k));
  if (touchedContent) cascadeStale(id, e.title || TYPES[e.type].label);
  emit();
}

export function remove(id) {
  delete state.entities[id];
  state.edges = state.edges.filter(x => x.from !== id && x.to !== id);
  emit();
}

/**
 * Mark every entity transitively reachable from `originId` via outgoing
 * `derives` edges as needing review. Does not mark the origin itself — the
 * origin is the *source* of the staleness, not a thing that needs
 * re-reviewing because of its own edit. `threatens` edges never propagate
 * this, matching the rule that they never enter the rollup math either:
 * both are about keeping non-`derives` edges out of anything that flows.
 *
 * Tracks BFS depth from the origin as `staleDepth` purely so the Ladder can
 * stagger the cascade's visual reveal outward by distance — the store has
 * no opinion on animation, but depth is a graph fact this traversal already
 * computes for free, and recomputing it in the view layer would mean
 * duplicating this walk.
 */
function cascadeStale(originId, label) {
  const queue = outgoing(originId, 'derives').map(x => ({ id: x.to, depth: 1 }));
  const visited = new Set([originId]);
  const now = Date.now();
  while (queue.length) {
    const { id, depth } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const e = state.entities[id];
    if (!e) continue;
    e.reviewState = 'needs-review';
    e.staleSince = now;
    e.staleReason = label;
    e.staleDepth = depth;
    for (const edge of outgoing(id, 'derives')) queue.push({ id: edge.to, depth: depth + 1 });
  }
}

export function markReviewed(id) {
  const e = state.entities[id];
  if (!e) return;
  e.reviewState = 'current';
  e.staleSince = null;
  e.staleReason = null;
  e.staleDepth = null;
  emit();
}

export const needsReviewCount = () => all().filter(e => e.reviewState === 'needs-review').length;

/**
 * Create a link. Returns `null` on a self-link, an exact duplicate, or an
 * edge validate.js rejects (with a console warning naming why). For an
 * `equivalence` link, also checks whether the two entities' *computed*
 * tiers disagree — if so the edge is still created (linking and severity
 * agreement are separate concerns) but the return carries `conflict` so the
 * caller can prompt the user to resolve it. Resolution never destructively
 * merges the two records — both keep independent upstream trace, per the
 * spec's non-destructive-link rule.
 */
export function link(from, to, kind = 'derives') {
  if (from === to) return null;
  if (state.edges.some(x => x.from === from && x.to === to && x.kind === kind)) return null;
  const a = get(from), b = get(to);
  if (!a || !b) return null;
  const verdict = canLink(a.type, b.type, kind);
  if (!verdict.ok) { console.warn(verdict.reason); return null; }

  const edge = { id: nextId(), from, to, kind, weight: null, note: '' };
  state.edges.push(edge);

  let conflict = null;
  if (kind === 'equivalence') {
    // Deferred import avoids a load-order dependency at module top-level —
    // rollup.js imports from this file, so this file cannot import rollup.js
    // at the top without both modules needing the other's exports before
    // either has finished initializing.
    const { computedTier } = getRollupFns();
    const tierA = computedTier(from), tierB = computedTier(to);
    if (tierA !== tierB) conflict = { tierA, tierB };
  }

  emit();
  return { edge, conflict };
}

export function unlink(edgeId) {
  state.edges = state.edges.filter(x => x.id !== edgeId);
  emit();
}

export function updateEdge(edgeId, patch) {
  const e = state.edges.find(x => x.id === edgeId);
  if (!e) return;
  Object.assign(e, patch);
  emit();
}

/**
 * Resolve a tier disagreement between two equivalence-linked entities.
 * Non-destructive: both records keep their own upstream trace; only their
 * tier is reconciled, and always as a flagged human override so the UI can
 * show it was decided, not calculated.
 */
export function resolveEquivalenceConflict(aId, bId, resolution) {
  const { computedTier, TIERS } = getRollupFns();
  const tierA = computedTier(aId), tierB = computedTier(bId);
  const scoreOf = t => Math.max(1, TIERS.indexOf(t));
  if (resolution === 'useA') update(bId, { tierOverride: tierA });
  else if (resolution === 'useB') update(aId, { tierOverride: tierB });
  else if (resolution === 'average') {
    const avg = TIERS[Math.max(1, Math.min(4, Math.round((scoreOf(tierA) + scoreOf(tierB)) / 2)))];
    update(aId, { tierOverride: avg });
    update(bId, { tierOverride: avg });
  }
  // 'independent' — leave both as computed, the user explicitly accepts the divergence.
}

// --- graph helpers -----------------------------------------------------------

export const outgoing = (id, kind) => state.edges.filter(x => x.from === id && (!kind || x.kind === kind));
export const incoming = (id, kind) => state.edges.filter(x => x.to === id && (!kind || x.kind === kind));
export const linksFor = (id) => state.edges.filter(x => x.from === id || x.to === id);

/** An entity lacking an expected upward link. Root + operational trio are exempt. */
export function isOrphan(id) {
  const e = state.entities[id];
  if (!e || TYPES[e.type].exempt) return false;
  return incoming(id, 'derives').length === 0;
}

// --- import / export ---------------------------------------------------------

export const exportJSON = () => Persist.toJSON(state);

export function importJSON(text) {
  state = Persist.fromJSON(text);
  if (!state.settings) state.settings = defaultSettings();
  emit();
}

export function reset(seed) {
  state = seed();
  if (!state.settings) state.settings = defaultSettings();
  emit();
}

// --- rollup facade -------------------------------------------------------------
// rollup.js imports {get, outgoing, getSettings} from this file, so this file
// cannot import rollup.js at the top level without a load-order deadlock.
// getRollupFns() is called lazily, inside functions, well after both modules
// have finished evaluating — the standard escape hatch for a two-file cycle
// where each side only needs the other's *functions*, never its top-level
// values. computedTier/isRed/tierIsSet/TIERS are re-exported the normal way
// below since by the time any *caller* of store.js runs, rollup.js has
// already finished loading.
import * as Rollup from './rollup.js';
function getRollupFns() { return Rollup; }
export const { computedTier, isRed, tierIsSet, TIERS } = Rollup;
