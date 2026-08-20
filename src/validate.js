// Graph-shape validation, enforced at write time rather than defended against
// at compute time. Pure functions: no store import, no state, just type-pair
// rules — so this file is trivially unit-testable and cannot itself develop a
// circular dependency on the rest of the domain layer.
//
// Spec: "`derives` edges only point from a lower rung to a higher rung —
// never sideways, never skipping a rung silently, never downward back into a
// lineage." The most faithful way to enforce that is not a numeric rung
// comparison (mission-side and hazard-side rungs aren't on one shared scale —
// both lanes converge on Security Control independently) but an explicit
// whitelist of the edges the spec actually enumerates. A whitelist can't skip
// a rung, because a skipped rung was simply never listed, and it can't cycle,
// because no pair's reverse is ever also listed.

const DERIVES_WHITELIST = [
  ['MissionCanvas', 'MissionRequirement'],
  ['MissionRequirement', 'ProtectionNeed'],
  ['ProtectionNeed', 'SecurityObjective'],
  ['SecurityObjective', 'SecurityRequirement'],
  ['SecurityRequirement', 'SecurityControl'],
  ['SecurityConstraint', 'SecurityControl'],
  ['Controller', 'ControlAction'],
  ['ControlAction', 'ControlledProcess'],
  ['ControlAction', 'UCA'],
  ['UCA', 'Hazard'],
  ['UCA', 'LossScenario'],
  ['LossScenario', 'SecurityConstraint'],
  ['Hazard', 'Loss'],
];

/**
 * Whether a `derives` edge from `fromType` to `toType` is legal.
 * Metric is a universal sink: "Metric tracks Hazard / Security Control /
 * etc." in the spec's prose is written in the semantic direction, but edges
 * are stored parent-to-child everywhere else in this app, so the tracked
 * entity is the parent and Metric is the child — anything may point at it.
 */
export function derivesAllowed(fromType, toType) {
  if (toType === 'Metric') return true;
  return DERIVES_WHITELIST.some(([f, t]) => f === fromType && t === toType);
}

/**
 * Whether a link of `kind` between `fromType` and `toType` may be created.
 * `derives` is whitelisted (above). `threatens` is deliberately unrestricted
 * — the spec calls it "a general capability, not restricted to Loss→Mission
 * Requirement" — so the only universal rules (no self-link, no exact
 * duplicate) apply and are checked by the caller before this runs.
 * `equivalence` is likewise unrestricted in type, though in practice it is
 * only ever created between a Security Requirement and a Security
 * Constraint converging on the same Security Control.
 */
export function canLink(fromType, toType, kind) {
  if (kind === 'derives') {
    return derivesAllowed(fromType, toType)
      ? { ok: true }
      : { ok: false, reason: `A derives edge from ${fromType} to ${toType} is not part of the model — check the edge list in the design spec.` };
  }
  return { ok: true };
}

export function validateCanvasMeta(meta) {
  return !!meta && typeof meta === 'object'
    && 'description' in meta && 'designedBy' in meta && 'date' in meta && 'version' in meta;
}
