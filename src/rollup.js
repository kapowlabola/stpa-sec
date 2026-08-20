// Risk-tier computation. Imports read-only graph access from store.js
// (get, outgoing, getSettings) — a one-directional dependency; store.js
// re-exports this module's public functions as a convenience facade for
// views, but nothing in here calls back into anything store.js exports, so
// there is no true circularity, just a shared module graph.

import { get, outgoing, getSettings } from './store.js';

export const TIERS = ['Unassessed', 'Negligible', 'Marginal', 'Critical', 'Catastrophic'];
// Fixed numeric midpoints — internal to the rollup math only, never shown to the user as a number.
const TIER_SCORE = { Negligible: 1, Marginal: 2, Critical: 3, Catastrophic: 4 };

export const isRed = (tier) => (TIER_SCORE[tier] || 0) >= getSettings().redBoundaryScore;

export function tierIsSet(id) {
  const e = get(id);
  return !!(e && (e.tierOverride || (outgoing(id, 'derives').length === 0 && e.tier !== 'Unassessed')));
}

/**
 * Rollup. A leaf (no outgoing `derives`) uses its human-set tier. A parent
 * aggregates its outgoing `derives` targets — `threatens` edges are excluded
 * categorically, and Metric children are excluded because a metric is an
 * observation, not a severity.
 *
 * Aggregation is weighted-average (default, edge.weight defaults to 1 —
 * i.e. equal shares — and a human override is just a larger number relative
 * to its siblings) or worst-N-of-M, where N defaults to 1 and clamps to
 * [1, childCount].
 *
 * Diamond paths are memoized by target id, so an equivalence-linked pair
 * sharing one downstream Security Control counts it once, not twice, and a
 * cycle (which the write-time validator in validate.js should make
 * structurally impossible, but memo+stack defends anyway) degrades to the
 * node's own tier rather than recursing forever.
 */
export function computedTier(id, memo = new Map(), stack = new Set()) {
  if (memo.has(id)) return memo.get(id);
  const e = get(id);
  if (!e) return 'Unassessed';
  if (stack.has(id)) return e.tier || 'Unassessed';
  stack.add(id);

  let result;
  if (e.tierOverride) {
    result = e.tierOverride;
  } else {
    const childEdges = [];
    const seenTargets = new Set();
    for (const edge of outgoing(id, 'derives')) {
      if (seenTargets.has(edge.to)) continue;
      const child = get(edge.to);
      if (!child || child.type === 'Metric') continue;
      seenTargets.add(edge.to);
      childEdges.push(edge);
    }

    if (!childEdges.length) {
      result = e.tier || 'Unassessed';
    } else {
      const scored = childEdges
        .map(edge => ({ weight: edge.weight ?? 1, score: TIER_SCORE[computedTier(edge.to, memo, stack)] }))
        .filter(x => x.score);

      if (!scored.length) {
        result = 'Unassessed';
      } else if (e.aggregation === 'worst') {
        const n = Math.max(1, Math.min(e.worstN || 1, scored.length));
        const top = scored.map(x => x.score).sort((a, b) => b - a).slice(0, n);
        const avg = top.reduce((a, b) => a + b, 0) / top.length;
        result = TIERS[Math.max(1, Math.min(4, Math.round(avg)))];
      } else {
        const totalWeight = scored.reduce((a, x) => a + x.weight, 0);
        const avg = scored.reduce((a, x) => a + x.weight * x.score, 0) / totalWeight;
        result = TIERS[Math.max(1, Math.min(4, Math.round(avg)))];
      }
    }
  }

  stack.delete(id);
  memo.set(id, result);
  return result;
}
