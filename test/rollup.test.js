import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { S, freshStore } from './helpers.mjs';

describe('rollup', () => {
  test('a leaf with no outgoing derives edges uses its own human-set tier', () => {
    freshStore();
    const leaf = S.create('Loss', { title: 'x', tier: 'Critical' });
    assert.equal(S.computedTier(leaf.id), 'Critical');
  });

  test('a parent aggregates its outgoing derives targets (weighted average, default equal weights)', () => {
    freshStore();
    const parent = S.create('MissionRequirement', { title: 'p' });
    const a = S.create('ProtectionNeed', { title: 'a', tier: 'Marginal' });   // score 2
    const b = S.create('ProtectionNeed', { title: 'b', tier: 'Catastrophic' }); // score 4
    S.link(parent.id, a.id); S.link(parent.id, b.id);
    // (2+4)/2 = 3 -> Critical
    assert.equal(S.computedTier(parent.id), 'Critical');
  });

  test('threatens edges never enter the rollup math — the single most important rule in the codebase', () => {
    freshStore();
    const parent = S.create('MissionRequirement', { title: 'p' });
    const child = S.create('ProtectionNeed', { title: 'c', tier: 'Negligible' });
    S.link(parent.id, child.id, 'derives');
    const before = S.computedTier(parent.id);

    const threat = S.create('Loss', { title: 'threat', tier: 'Catastrophic' });
    S.link(threat.id, parent.id, 'threatens'); // points at the parent, would dominate if it counted
    assert.equal(S.computedTier(parent.id), before, 'a threatens edge changed a computed tier');
  });

  test('an equivalence-linked pair sharing one downstream control counts it once, not twice (diamond dedupe)', () => {
    freshStore();
    const req = S.create('SecurityRequirement', { title: 'req' });
    const con = S.create('SecurityConstraint', { title: 'con' });
    const ctl = S.create('SecurityControl', { title: 'ctl', tierOverride: 'Catastrophic' });
    S.link(req.id, ctl.id, 'derives');
    S.link(con.id, ctl.id, 'derives');
    S.link(req.id, con.id, 'equivalence');
    // Both converge on the same single Catastrophic control — each should
    // independently compute Catastrophic, not some double-counted average.
    assert.equal(S.computedTier(req.id), 'Catastrophic');
    assert.equal(S.computedTier(con.id), 'Catastrophic');
  });

  test('Unassessed children are excluded from the average, not counted as zero', () => {
    freshStore();
    const parent = S.create('MissionRequirement', { title: 'p' });
    const scored = S.create('ProtectionNeed', { title: 'scored', tier: 'Catastrophic' });
    const unassessed = S.create('ProtectionNeed', { title: 'unassessed' }); // tier defaults Unassessed
    S.link(parent.id, scored.id); S.link(parent.id, unassessed.id);
    // If Unassessed counted as 0 the average would drag toward Marginal/Negligible.
    assert.equal(S.computedTier(parent.id), 'Catastrophic');
  });

  test('a tierOverride wins over the computed rollup', () => {
    freshStore();
    const parent = S.create('MissionRequirement', { title: 'p', tierOverride: 'Negligible' });
    const child = S.create('ProtectionNeed', { title: 'c', tier: 'Catastrophic' });
    S.link(parent.id, child.id);
    assert.equal(S.computedTier(parent.id), 'Negligible');
  });

  test('worst-N-of-M clamps N to [1, M] and picks the top-N average', () => {
    freshStore();
    const parent = S.create('MissionRequirement', { title: 'p', aggregation: 'worst', worstN: 99 });
    const kids = ['Negligible', 'Negligible', 'Catastrophic'].map((t, i) => S.create('ProtectionNeed', { title: 'k' + i, tier: t }));
    kids.forEach(k => S.link(parent.id, k.id));
    // worstN=99 clamps to 3 (all children) -> average of Neg(1)+Neg(1)+Cat(4) = 2 -> Marginal
    assert.equal(S.computedTier(parent.id), 'Marginal');

    S.update(parent.id, { worstN: 1 });
    assert.equal(S.computedTier(parent.id), 'Catastrophic', 'worst-1 should pick only the single worst child');
  });

  test('a numeric tier midpoint never leaks into a rendered tier string', () => {
    freshStore();
    const leaf = S.create('Loss', { title: 'x', tier: 'Critical' });
    assert.ok(S.TIERS.includes(S.computedTier(leaf.id)), 'computedTier must return one of the named tiers, never a number');
  });

  test('isRed respects the configurable red boundary', () => {
    freshStore();
    assert.equal(S.isRed('Critical'), true, 'default boundary is Critical and above');
    assert.equal(S.isRed('Marginal'), false);
    S.updateSettings({ redBoundaryScore: 4 });
    assert.equal(S.isRed('Critical'), false, 'raising the boundary to Catastrophic-only should exclude Critical');
    assert.equal(S.isRed('Catastrophic'), true);
  });

  test('a derives edge outside the whitelist is rejected at write time', () => {
    freshStore();
    const loss = S.create('Loss', { title: 'loss' });
    const ctrl = S.create('Controller', { title: 'ctrl' });
    const result = S.link(loss.id, ctrl.id, 'derives'); // not in the spec's edge list
    assert.equal(result, null);
    assert.equal(S.outgoing(loss.id, 'derives').length, 0);
  });

  test('a Metric may have multiple parents and is excluded from their rollup as dilution', () => {
    freshStore();
    const parent = S.create('ProtectionNeed', { title: 'p', tier: 'Catastrophic' });
    const metric = S.create('Metric', { title: 'm' });
    const otherParent = S.create('Hazard', { title: 'h', tier: 'Catastrophic' });
    S.link(parent.id, metric.id);
    S.link(otherParent.id, metric.id);
    assert.equal(S.incoming(metric.id, 'derives').length, 2);
    assert.equal(S.isOrphan(metric.id), false);
    assert.equal(S.computedTier(parent.id), 'Catastrophic', 'the metric link must not dilute its parent\'s own tier');
  });
});
