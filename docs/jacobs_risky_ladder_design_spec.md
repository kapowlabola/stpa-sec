# Jacob's Risky Ladder — Design Spec (Phase 1: Data Model Complete)

## Purpose

A tool to visualize risk and the downstream effects of changing assumptions, so that when circumstances change, only the one changed piece needs re-analysis, not the whole body of evidence. Built to serve a function similar to a Program Protection Plan (PPP) / RMF body of evidence, but grounded in the Mission Model Canvas (mission definition) and STPA-Sec (hazard/control-structure analysis) instead of RMF.

Designed to interoperate with a separate STPA-Security framework tool being built by a collaborator. Entity names and structure below are aligned to standard STPA-Sec vocabulary for that reason.

This document captures every design decision made in the discovery conversation. It's meant to give a new chat enough to start wireframing screens without re-litigating the data model.

---

## Core design principle

Two analysis directions produce entities that both terminate at the Security Control layer:

- **Top-down**: Mission Canvas → Mission Requirement → Protection Need → Security Objective → Security Requirement → Security Control. Starts from mission planning, needs no system design to begin.
- **Bottom-up**: Control Structure (Controller/Controlled Process/Control Action) → Unsafe Control Action (UCA) → Hazard → Loss Scenario → Security Constraint → Security Control. Starts from hazard analysis, needs an actual system design to begin, so it necessarily starts later and matures iteratively.

These two paths sometimes converge on the same practical ask (same Security Control satisfies both a Requirement and a Constraint), sometimes stay entirely separate, and sometimes the bottom-up path surfaces a gap the top-down side never anticipated. All three outcomes are expected and supported. Convergence is never forced.

---

## Entities

Every entity, regardless of type, has these common fields:
- **Owner**: a function/department (configurable picklist per program, not hardcoded — starter set: Engineering, Cybersecurity, Supply Chain, Logistics, Contracting, Program Management, Test & Evaluation)
- **Status**: To Be Completed / Completed (binary for phase 1 — flagged as likely needing an approval workflow later, not built now)
- **Priority**: High / Medium / Low, set by a human. Distinct from risk/severity tier — priority captures urgency and tractability (cost, schedule, how ready a fix is), not how bad the outcome would be. Not derived from risk tier.
- **Risk/Severity tier** (where applicable): Catastrophic / Critical / Marginal / Negligible / Unassessed. Unassessed is a real, distinct tier, not a blank field, so "nobody has looked at this yet" is queryable separately from "assessed as low risk."
- Notes field (free text)
- File attachment field (evidence documents — phase 1 is attach-only, no parsing/auto-extraction of entities from uploaded documents)

### Entity list and type-specific fields

| Entity | Fields beyond common | Notes |
|---|---|---|
| **Mission Canvas** | mission_name, cost_structure, beneficiaries, deployment, impact_metrics | Root of the graph. Persists as its own object (not just a wizard) — editing it later flags downstream Mission Requirements as needing review. Adapted from the Business Model Canvas: cost structure→mission budget, customer segments→beneficiaries, channels→deployment, customer relationships→beneficiaries, revenue streams→mission achievement/impact. |
| **Mission Requirement** | title | Spawned from the canvas. |
| **Protection Need** | title | |
| **Security Objective** | title | |
| **Security Requirement** | title | Top-down derived. |
| **Security Constraint** | title | Bottom-up derived (STPA-Sec naming, replaces earlier "derivation_source flag" approach). |
| **Security Control** | title | Satisfies Requirements and/or Constraints. Can optionally link to the Control Action(s) that implement it (many-to-many) — control constrains/wraps an action, it doesn't replace it. |
| **Controller** | name, type | Part of the control structure, not the risk hierarchy. Exempt from orphan detection (see below). |
| **Controlled Process** | name | Exempt from orphan detection. |
| **Control Action** | name | A standing operational capability ("Controller X can issue this to Controlled Process Y"), not an event or log. Most control actions have no security relevance and never will — that's normal, not a gap. Exempt from orphan detection. |
| **UCA (Unsafe Control Action)** | uca_type (one of: not providing / providing causes hazard / wrong timing or order / wrong duration), context, severity_tier | Fixed four-type guide word structure per STPA. |
| **Hazard** | severity_tier | A system state that could lead to a loss, not an event. Many-to-many with Loss (one hazard can cause multiple losses; one loss can be reached via multiple hazards) — this is intentional, do not collapse. |
| **Loss Scenario** | description | Causal explanation for why a UCA happens. Derives Security Constraints. |
| **Loss** | title, description, severity_tier | Terminal, mission-level unacceptable outcome. Losses do NOT chain into other losses — if an intermediate consequence exists, model it as another Hazard, keep Loss as a leaf/terminal node with no internal ordering. Loss's severity is a human-set leaf input, never computed. |
| **Metric** | name, value, unit, threshold, trend | Tracks effectiveness of a Security Control or state of a Hazard (or any entity) over time. Always requires an upward link — no metric is tracked without a reason it matters to something above it. No exemption from orphan detection. |

**Mission Requirement is NOT the same entity as Loss.** They're related (a Loss often represents the failure mode of a Mission Requirement) but structurally distinct: Mission Requirement's risk tier is a *computed rollup* from its children; Loss's severity tier is a *human-set leaf input*. Merging them would make one field simultaneously computed and manually entered, which breaks the model. Cardinality also differs — one Mission Requirement typically has multiple distinct Losses hanging off different Hazards, not one clean negation.

---

## Relationships / edge types

Two categories of edge exist, and the distinction matters for the math:

### 1. `derives` edges — drive the risk rollup math
Standard hierarchy, flows upward in score even though drawn top-down for readability:
- Mission Canvas → Mission Requirement (produces)
- Mission Requirement → Protection Need (requires)
- Protection Need → Security Objective (requires)
- Security Objective → Security Requirement (requires)
- Security Requirement → Security Control (satisfied_by, many-to-many)
- Security Constraint → Security Control (satisfied_by, many-to-many)
- Controller → Control Action (issues)
- Control Action → Controlled Process (targets)
- Control Action → UCA (can_become)
- UCA → Hazard (leads_to)
- UCA → Loss Scenario (explained_by)
- Loss Scenario → Security Constraint (derives)
- Hazard → Loss (can_cause, many-to-many)
- Metric → Hazard / Security Control / etc. (tracks)

### 2. `threatens` edges — traceability only, NEVER enter the rollup math
- Any entity can threaten any entity above it in the graph (general capability, not restricted to Loss→Mission Requirement).
- Purpose: expose a real risk relationship that hasn't been (or may never be) formalized through the standard chain. Example: a Loss with no matching Security Constraint yet can still be flagged as directly threatening the Mission Requirement it endangers.
- Critically, this is NOT a computational cycle. Both edge types flow the same direction (upward toward mission-level entities). At most you get a diamond (two paths converging on one node), which is normal in a DAG. A `threatens` edge never causes a lower entity's score to depend on a higher one, so there's no loop in the math.
- Because `threatens` edges never feed the rollup formula, they cannot cause double-counting even in cases where they duplicate a path that also exists through the standard chain.
- Render distinctly from `derives` edges in the UI (dashed, different color) so they're never mistaken for the standard hierarchy.

### 3. Equivalence link (a specific case of cross-reference)
When a top-down Security Requirement and a bottom-up Security Constraint converge on the same practical ask, link them non-destructively. Both records survive with their own upstream trace intact (important for audit/ATO provenance — no destructive merges). The UI groups them visually and the risk rollup counts the shared downstream Security Control once, not twice.

### Graph shape constraint
`derives` edges only point from a lower rung to a higher rung — never sideways, never skipping a rung silently, never downward back into a lineage. This keeps propagation guaranteed to terminate (no cycles in the scoring graph).

---

## Risk scoring / propagation

- Every entity uses the same four-tier qualitative scale (Catastrophic / Critical / Marginal / Negligible) plus Unassessed. No raw probability, aligned with STPA's position that control/software failures aren't meaningfully frequency-based.
- Each tier maps to a fixed numeric midpoint, used only internally for rollup math — never shown to the user as a number.
- Red/green flip happens at a tier boundary, configurable per program (default: Critical and above = red).
- Each parent node has an aggregation mode: **weighted average** (default) or **worst-N-of-M**, selectable per node.
- Edge weights default to equal (1/n of siblings) so nothing requires manual setup out of the box. A human can override an individual edge's weight, override a node's aggregation mode, or override the final computed tier outright — an overridden value is visibly flagged as human-set, not calculated.
- Full Bayesian-network-style propagation (conditional probability tables per edge) is the more rigorous long-term option per current risk-engineering research, but is a phase 2+ upgrade, not phase 1 — too heavy an elicitation burden to require up front.

---

## Orphan / gap detection

A general capability, not hardcoded per entity type: any entity that lacks an expected upward link gets surfaced in a "gaps" view a PM can scan across the whole graph. Examples: a Security Control mapped to nothing above it ("why does this exist with no requirement or objective behind it — are we missing an objective?"), a Loss with no Mission Requirement, a Hazard with no UCA behind it.

**Exempt from orphan detection**: Mission Canvas (it's the root), and the operational control-structure trio — Controller, Controlled Process, Control Action — since most control actions have no security relevance and that's normal, not a gap.

**Not exempt**: everything else, including Metric (a metric tracked for no reason related to anything above it shouldn't exist in the first place).

---

## Views (tabs)

1. **Database** — flat view of all entities and relationships.
2. **Risk Ladder** — the downstream-effects visualization. Node-link diagram with animated color propagation when an upstream value changes (not a literal Sankey — flagged during discovery that "Sankey" was being used loosely to mean "things flowing/connected," the actual right pattern is a node-link/circuit-style diagram). Filterable/collapsible from day one, since we don't yet know the entity volume per program.
3. **Control Structure** — separate diagram for Controller/Controlled Process/Control Action/UCA, since this is a wiring diagram, not a rung in the ladder.
4. **Mission Canvas** — its own persisted view/entry form, not just a wizard.

View lenses (senior leader vs. engineer) are tabled for later — audience-tailoring doesn't matter until there's an actual audience using the tool. Noted defaults if/when revisited: senior leader = show every entity but collapse anything green; engineer = show every rung.

No permission/edit restrictions in phase 1 — view-only lenses are automatic dashboards, not access control.

---

## Document handling

- **Ingestion**: attach-only (PDF/Word/Excel as evidence linked to an entity). No auto-extraction/parsing of entities from uploaded documents in phase 1 — flagged as a much larger, later-phase lift.
- **Generation targets**: (1) a one-page Mission Canvas printout, (2) a slide-per-tier risk summary, aimed at giving people a starting point for the PowerPoint briefings this kind of work always ends up in.

---

## Scope / environment notes

- Data may eventually be CUI, but the prototype and initial build are unclassified. Hosting, network accreditation, and authentication are out of scope for this tool — to be handled by an integrator application later.
- Framework alignment is deliberate: mission decomposition side borrows from the Business Model Canvas (adapted into a "Mission Model Canvas"); hazard analysis side aligns to standard STPA-Sec vocabulary (Loss, Hazard, Controller, Controlled Process, Control Action, UCA, Loss Scenario, Security Constraint) specifically to interoperate with a collaborator's separate STPA-Security tool, which is process-based rather than schema-based — so this spec is the more authoritative data model between the two efforts.
- The framework is intentionally domain-general — validated during discovery against both a DoD UAS/ISR scenario and a non-DoD personal scenario (packing lunch the night before to avoid being late to work), both of which mapped cleanly onto the same entity set without modification.

---

## Worked example (for wireframe stress-testing)

Small UAS ISR mission:
- Mission Requirement: maintain uninterrupted C2 link with the UAV.
- Protection Need → Security Objective → Security Requirement (top-down): authenticate/integrity-check nav commands.
- Security Control: HMAC on uplink command messages.
- Controller: ground control station. Controlled Process: UAV flight controller. Control Action: transmit waypoint update.
- UCA: "providing, causes hazard" — GCS spoofed into issuing unauthorized waypoint command. Severity: Catastrophic.
- Hazard: UAV executes a navigation command from an unauthenticated source.
- Loss A: loss of the UAV asset. Loss B: loss of mission. (One hazard, multiple losses — intentional.)
- Loss Scenario: adversary spoofs GCS transmitter identity, injects crafted packets, because the uplink protocol has no message authentication.
- Security Constraint (bottom-up): uplink protocol shall reject any command failing HMAC verification.
- Equivalence link: the top-down Requirement and bottom-up Constraint above both point to the same Security Control — linked, not merged.
- Metric: percentage of uplink messages passing authentication.

---

## Open items deferred past phase 1 (not blockers, just noted)

- Approval/review workflow beyond binary status.
- Permission tiers / role-based editing.
- Audience-specific view lens rules (senior leader vs. engineer collapse logic).
- Document auto-parsing/extraction.
- Bayesian-network-style probabilistic propagation.
- Hosting, classification handling, authentication (owned by integrator app).

---

*This spec reflects the discovery conversation in full. Next step: screen-level wireframes for the four views listed above.*
