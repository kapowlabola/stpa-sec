// Worked example from the design spec: small UAS ISR mission.
// Stress-tests the model: one hazard -> two losses, an equivalence link, a
// threatens edge with no constraint behind it, a genuinely orphaned control,
// and a metric with two parents (Security Control and Hazard both benefit
// from the same authentication-rate evidence, per the resolved question that
// multi-parent metrics are allowed since metrics never enter the rollup math).

export function seed() {
  const entities = {};
  const edges = [];
  let n = 0;
  const id = () => 's' + (++n);

  const E = (type, title, f = {}) => {
    const e = {
      id: id(), type, title, owner: f.owner || '', status: f.status || 'To Be Completed',
      priority: f.priority || 'Medium', tier: f.tier || 'Unassessed', notes: f.notes || '',
      attachments: f.attachments || [], aggregation: f.aggregation || 'weighted-average',
      worstN: f.worstN || 1, tierOverride: f.tierOverride || null,
      reviewState: 'current', staleSince: null, staleReason: null, staleDepth: null,
      ...f,
    };
    entities[e.id] = e;
    return e;
  };
  const L = (a, b, kind = 'derives') => {
    edges.push({ id: 'l' + (++n), from: a.id, to: b.id, kind, weight: null, note: '' });
  };

  // --- top-down: mission side -----------------------------------------------
  const canvas = E('MissionCanvas', 'UAS ISR Mission', {
    owner: 'Program Management', status: 'Completed', priority: 'High',
    key_partners: 'Payload vendor, comms carrier, launch site host',
    key_activities: 'ISR collection, waypoint nav',
    key_resources: 'UAV airframe, GCS, uplink protocol',
    buy_in_and_support: 'Daily sortie briefing, commander sign-off',
    deployment: 'Forward operating base, line-of-sight uplink to GCS',
    beneficiaries: 'ISR analysts, ground commander, downstream mission planners',
    cost_structure: 'Program-level allocation, see PPP cost tab for detail',
    impact_metrics: 'Mission completion rate, C2 uptime %, ISR data integrity rate',
  });

  const mr1 = E('MissionRequirement', 'Maintain uninterrupted C2 link with the UAV',
    { owner: 'Engineering', status: 'Completed', priority: 'High' });
  const mr2 = E('MissionRequirement', 'Preserve ISR data integrity',
    { owner: 'Engineering', priority: 'Medium' });
  const mr3 = E('MissionRequirement', 'Protect airframe against loss',
    { owner: 'Program Management', priority: 'High' });
  [mr1, mr2, mr3].forEach(m => L(canvas, m));

  const pn = E('ProtectionNeed', 'Nav commands must be trustworthy in origin and content',
    { owner: 'Cybersecurity', priority: 'High' });
  const so = E('SecurityObjective', 'Authenticate and integrity-check nav commands',
    { owner: 'Cybersecurity', priority: 'High' });
  const sr = E('SecurityRequirement', 'Uplink command messages shall carry a verifiable MAC',
    { owner: 'Engineering', priority: 'High' });
  L(mr1, pn); L(pn, so); L(so, sr);

  const ctl = E('SecurityControl', 'HMAC on uplink command messages', {
    owner: 'Cybersecurity', priority: 'High',
    tierOverride: 'Catastrophic', notes: 'Tier set by hand during the Aug review board.',
  });
  L(sr, ctl);

  const metric = E('Metric', 'Percentage of uplink messages passing authentication', {
    owner: 'Test & Evaluation', priority: 'Medium',
    value: '99.2', unit: '%', threshold: '99.5', trend: 'Flat',
  });
  L(ctl, metric);      // parent 1 of 2 — evidences the control's effectiveness

  // --- bottom-up: hazard side ------------------------------------------------
  const controller = E('Controller', 'Ground control station',
    { owner: 'Engineering', ctype: 'Human-in-the-loop', x: 40, y: 40 });
  const process = E('ControlledProcess', 'UAV flight controller',
    { owner: 'Engineering', x: 470, y: 40 });
  const action = E('ControlAction', 'Transmit waypoint update',
    { owner: 'Engineering', x: 255, y: 40 });
  L(controller, action);   // issues
  L(action, process);      // targets

  const uca = E('UCA', 'GCS spoofed into issuing unauthorized waypoint command', {
    owner: 'Cybersecurity', priority: 'High', tier: 'Catastrophic',
    uca_type: 'Providing Causes Hazard',
    context: 'While UAV is executing an autonomous ISR leg beyond visual range.',
    x: 255, y: 210,
  });
  L(action, uca);          // can_become

  const hazard = E('Hazard', 'UAV executes a navigation command from an unauthenticated source',
    { owner: 'Cybersecurity', priority: 'High' });
  L(uca, hazard);          // leads_to
  L(hazard, metric);       // parent 2 of 2 — same evidence also tells you the hazard's state

  const lossA = E('Loss', 'Loss of the UAV asset',
    { owner: 'Program Management', priority: 'Medium', tier: 'Critical',
      description: 'Airframe and payload are destroyed or captured.' });
  const lossB = E('Loss', 'Loss of mission',
    { owner: 'Program Management', priority: 'High', tier: 'Catastrophic',
      description: 'ISR coverage gap over the target area for the remainder of the window.' });
  L(hazard, lossA); L(hazard, lossB);   // one hazard, multiple losses — intentional

  const scenario = E('LossScenario', 'Adversary spoofs GCS transmitter identity and injects crafted packets', {
    owner: 'Cybersecurity', priority: 'High',
    description: 'The uplink protocol has no message authentication, so the flight controller cannot distinguish a crafted packet from a genuine one.',
  });
  L(uca, scenario);        // explained_by

  const constraint = E('SecurityConstraint', 'Uplink protocol shall reject any command failing HMAC verification',
    { owner: 'Engineering', priority: 'High' });
  L(scenario, constraint);
  L(constraint, ctl);      // both paths converge on the same control

  // Equivalence: same practical ask from both directions. Non-destructive, no direction.
  L(sr, constraint, 'equivalence');

  // Traceability only — this Loss has no constraint of its own yet.
  L(lossA, mr3, 'threatens');

  // A real gap for the orphan view: a control with nothing above it.
  E('SecurityControl', 'Serial console lockout on the GCS', {
    owner: 'Cybersecurity', priority: 'Low',
    notes: 'Inherited from the last program. Why does this exist with no requirement behind it?',
  });

  return {
    entities, edges,
    canvasMeta: {
      designedBy: 'Paola', date: 'Aug 2026', version: '1',
      description: 'UAS ISR Mission — maintain uninterrupted C2 link',
      dirtyAt: null, reviewedAt: Date.now(),
    },
    settings: {
      owners: ['Engineering', 'Cybersecurity', 'Supply Chain', 'Logistics',
               'Contracting', 'Program Management', 'Test & Evaluation'],
      redBoundaryScore: 3, // Critical and above = red
    },
  };
}
