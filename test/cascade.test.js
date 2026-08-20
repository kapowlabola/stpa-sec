import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { S, freshStore } from './helpers.mjs';

describe('staleness cascade', () => {
  test('a content edit marks every transitively-derived descendant needs-review, and nothing else', () => {
    freshStore();
    const root = S.all().find(e => e.type === 'MissionCanvas'); // the seed's singleton canvas — only one is ever allowed
    const mid = S.create('MissionRequirement', { title: 'mid' });
    const leaf = S.create('ProtectionNeed', { title: 'leaf' });
    const unrelated = S.create('Controller', { title: 'unrelated' }); // not reachable from root via derives
    S.link(root.id, mid.id); S.link(mid.id, leaf.id);

    S.update(root.id, { title: 'root edited' }); // 'title' is a CASCADE_FIELDS entry

    assert.equal(S.get(mid.id).reviewState, 'needs-review');
    assert.equal(S.get(leaf.id).reviewState, 'needs-review');
    assert.equal(S.get(unrelated.id).reviewState, 'current', 'an unrelated branch must not be swept up in the cascade');
    assert.equal(S.get(root.id).reviewState, 'current', 'the edited entity itself is the source of staleness, not a thing needing review of itself');
  });

  test('a metadata-only edit (owner, status, priority, notes, attachments) does not cascade', () => {
    freshStore();
    const root = S.all().find(e => e.type === 'MissionCanvas');
    const child = S.create('MissionRequirement', { title: 'child' });
    S.link(root.id, child.id);

    S.update(root.id, { owner: 'Engineering', status: 'Completed', priority: 'Low', notes: 'x' });
    assert.equal(S.get(child.id).reviewState, 'current',
      'owner/status/priority/notes are metadata — cascading on every field would make the signal worthless');
  });

  test('threatens edges do not propagate staleness (same rule as the rollup math)', () => {
    freshStore();
    const upstream = S.create('MissionRequirement', { title: 'upstream' });
    const threatener = S.create('Loss', { title: 'threat' });
    S.link(threatener.id, upstream.id, 'threatens');

    S.update(threatener.id, { title: 'threat edited' });
    assert.equal(S.get(upstream.id).reviewState, 'current');
  });

  test('marking one entity reviewed clears only that entity, not its siblings', () => {
    freshStore();
    const root = S.all().find(e => e.type === 'MissionCanvas');
    const a = S.create('MissionRequirement', { title: 'a' });
    const b = S.create('MissionRequirement', { title: 'b' });
    S.link(root.id, a.id); S.link(root.id, b.id);
    S.update(root.id, { title: 'edited' });

    S.markReviewed(a.id);
    assert.equal(S.get(a.id).reviewState, 'current');
    assert.equal(S.get(b.id).reviewState, 'needs-review', 'marking one sibling reviewed must not clear the other');
  });

  test('staleDepth increases with distance from the edited entity, for the Ladder\'s staggered animation', () => {
    freshStore();
    const root = S.all().find(e => e.type === 'MissionCanvas');
    const mid = S.create('MissionRequirement', { title: 'mid' });
    const leaf = S.create('ProtectionNeed', { title: 'leaf' });
    S.link(root.id, mid.id); S.link(mid.id, leaf.id);
    S.update(root.id, { title: 'edited' });

    assert.equal(S.get(mid.id).staleDepth, 1);
    assert.equal(S.get(leaf.id).staleDepth, 2);
  });

  test('editing the Mission Canvas via updateCanvasMeta cascades to its Mission Requirements', () => {
    freshStore();
    const canvas = S.all().find(e => e.type === 'MissionCanvas');
    const req = S.create('MissionRequirement', { title: 'req' });
    S.link(canvas.id, req.id);
    S.markReviewed(req.id); // clear whatever the seed itself left, for a clean assertion

    S.updateCanvasMeta({ description: 'a new mission description' });
    assert.equal(S.get(req.id).reviewState, 'needs-review');
  });
});
