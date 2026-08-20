# Progress Log

## Session — 2026-08-20 · wireframes → working app

### Done

- **Stood up the app** at `src/`, vanilla ES modules, no build step. Serve with
  `npx http-server src -p 5173 -c-1`.
- **Entity store** (`store.js`) implementing the Phase 1 data model: all 15 entity types,
  common fields (owner / status / priority / risk tier / notes / attachments), three edge
  kinds (`derives`, `threatens`, `equivalence`), localStorage persistence, JSON
  import/export.
- **Risk rollup math.** Four-tier scale with fixed internal midpoints (never shown as a
  number), weighted-average (default) and worst-of aggregation per node, human overrides
  visibly flagged, red boundary at Critical and above. `threatens` edges excluded from
  the math. Diamond paths memoized so an equivalence-linked pair sharing one downstream
  control counts it once.
- **Orphan / gap detection** as a general capability, not per-type. Mission Canvas,
  Controller, Controlled Process and Control Action are exempt.
- **Mission Canvas view** — the real 9-box Mission Model Canvas template with the header
  band, spanning cells, and split top/bottom rows. Value Propositions reflects live
  Mission Requirement records rather than storing text. Editing after requirements exist
  raises the non-blocking "needs review" banner with a Mark reviewed action. Print
  stylesheet gives the 1-page printout.
- **Database view** — flat table across all entity types, inline click-to-edit on every
  cell, search, entity-type filter, orphans-only toggle, type-specific fields behind a
  toggle (off by default), orphan row shading. The edge-type filter narrows the *contents*
  of the Linked column, not just its styling.
- **Risk Ladder view** — auto-layout (positions derived from rung + lane, never stored),
  orthogonal edge router, working 40–150% zoom, collapsible legend (off by default),
  click-anchored detail card at fixed pixel size, orphan and equivalence badges, red-tier
  underline, owner/tier/text filters.
- **Control Structure view** — diagram-first. Add controller / add controlled process
  place a blank record immediately; "Draw control action" is a two-click mode
  (controller → controlled process) that creates the action and both edges; "Add UCA"
  hangs a UCA off a control action. Boxes drag and their positions persist.
- **Seeded** with the UAS ISR worked example from the design spec, including the
  one-hazard-two-losses case, the equivalence link, a `threatens` edge with no constraint
  behind it, and one deliberately orphaned Security Control.
- **Verified** via a jsdom smoke test: all four tabs render, a card edit on the Ladder
  shows up in the Database projection, orphan shading and filters work, zero runtime
  errors.

### To do

- Replace the hand-rolled layout with a real engine (dagre / elkjs) and add pan, per the
  Phase 2 open item. Click coordinates in screen space vs. diagram space will then need
  reconciling for the anchored card.
- Real file attachments — currently stores a filename string only (phase 1 is attach-only
  by design, but it should store the actual blob).
- Per-edge weight overrides. The math supports equal 1/n weights and per-node aggregation
  mode; individual edge weights are not yet editable in the UI.
- Slide-per-tier risk summary export (the second generation target in the spec).
- A dedicated gaps view. Orphans are currently surfaced via the Database's orphans-only
  toggle and the Ladder's `!` badge, which covers the need but isn't its own screen.
- Undo. Every edit writes straight through to the store with no history.

### Bugs / open questions

- **Top-down chain bottoms out at Security Control.** Because rollup flows from leaves
  upward, the entire mission-side chain's tier is driven by whoever assessed the Security
  Control — clear the seed's override and Mission Requirement goes to Unassessed. This is
  faithful to the Phase 1 spec (`threatens` edges are excluded from the math, so Loss
  severities never reach Mission Requirement), but it is worth confirming it's the
  intended behaviour rather than an artifact.
- **Unresolved from Phase 1**, still unresolved here: how conflicting severity weightings
  from an equivalence-linked Requirement/Constraint pair resolve (pick a side vs. average),
  and whether a Metric may link to multiple parent entities.
- **Metric edge direction.** The spec lists `Metric → Security Control (tracks)`, which is
  the opposite direction from every other edge in the list and would false-flag every
  metric as an orphan. Stored as `Security Control → Metric` instead, with metrics
  excluded from the parent's aggregation. Worth confirming.
- Branch hygiene: this work landed on `disable-claude-review` rather than a fresh branch
  off `main`, contrary to the git workflow rule in CLAUDE.md.
