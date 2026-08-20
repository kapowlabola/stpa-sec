# Progress Log

## Session — 2026-08-20 (2) · agents, design system, staleness cascade

### Done

- **Four agent definitions** in `.claude/agents/` — `architect`, `backend`, `frontend`,
  `qa` — each scoped to a slice of the codebase, each carrying the invariants that keep it
  coherent (one store/N projections, `threatens` never enters rollup math, Ladder
  positions never stored, staleness cascades down `derives` while risk rolls up it).
- **Design system**, `src/tokens.css`. Chrome is strict USWDS red/white/blue
  (`#005ea2`/`#d83933`/`#162e51`, the usaspending.gov family, pulled from the actual
  published `@uswds/uswds` package rather than approximated). The five entity hues remap
  onto USWDS extended-palette families (gold/mint/violet alongside the chrome blue/red) —
  every stroke color verified ≥4.5:1 on white by direct WCAG computation, not eyeballed.
  Every hardcoded hex in the app (60+, plus 5 duplicated between CSS and JS) now resolves
  to a token; zero hex literals remain outside `tokens.css` (mechanically verified).
- **Capitalization normalized**: Title Case for chrome (tabs, buttons, headers, field
  labels, legend headings, select options), sentence case for prose (annotations, toasts,
  tooltips, banners). Removed every `text-transform: uppercase` rule — casing is now a
  property of the string, not a CSS accident. Caught and fixed my own casing error mid-pass
  (Title-Cased two full-sentence banners before the QA suite's regression check would have).
- **Domain layer split**: `store.js` (entities/edges/graph reads/writes),
  `rollup.js` (risk math), `validate.js` (edge-shape rules), `persist.js`
  (localStorage + JSON). `store.js` and `rollup.js` share a verified-safe circular import
  (each needs the other's *functions*, never its top-level values).
- **Graph-shape constraint now enforced at write time**, not just defended against at
  compute time — `validate.js` whitelists every `derives` edge the spec actually
  enumerates; an edge outside it is rejected with a console warning naming why.
- **Per-entity staleness cascade** — the spec's actual thesis (*"only the one changed
  piece needs re-analysis, not the whole body of evidence"*), previously just a single
  global flag on the canvas. A content edit (title/description/tier/canvas cells/etc.)
  now marks every transitively-derived descendant `needs-review`, tracks BFS depth for a
  staggered visual reveal, and leaves unrelated branches untouched. Metadata edits
  (owner/status/priority/notes/attachments) never trigger it.
- **Animated staleness cascade on the Risk Ladder** — the demo centerpiece. Required
  killing the full-subtree-replace render (`app.js` previously called
  `root.replaceChildren(...)` on every store change, which destroys and recreates every
  node, so no CSS transition could ever fire). `app.js` now splits `render()` (full
  rebuild, used for the initial load and tab switches) from `patch()` (store-driven
  refresh while the same tab stays mounted); `views/ladder.js` implements `update()`,
  patching existing node elements in place by `data-entity-id` so the `.stale` class
  transition is visible. **Known scope limit**: because this is a single-active-tab app,
  the animation is only visible while already on the Ladder tab — editing on the Mission
  Canvas tab and then switching to the Ladder shows the already-settled result, not a live
  ripple. Keeping all four views mounted simultaneously would fix this but was out of
  scope for this pass.
- **Worst-N-of-M aggregation** (previously worst-1 only) — N defaults to 1, clamps to
  `[1, childCount]`, editable per node in the card.
- **Per-edge weights** — `edge.weight` defaults to 1 (equal shares), overridable.
- **Owner list and the red/green tier boundary** moved from module constants into
  `state.settings`, so they're actually configurable per program and survive export/import,
  as the Phase 1 spec always claimed but the code never delivered.
- **Equivalence conflict detection + resolution.** Linking two entities whose *computed*
  tiers disagree now prompts: use A's tier, use B's, average, or keep independent — always
  as a flagged human override, never a destructive merge.
- **Metrics may have multiple parents**, with an optional per-link note. Verified this
  cannot cause double-counting: metrics are excluded from every parent's rollup regardless
  of link count.
- **Single Mission Canvas enforced** at the store level (`create()` guard) and at the UI
  level (`MissionCanvas` removed from the Database's "+ New Entity" picker).
- **The open detail card now re-renders live** on every store change — computed tier, the
  link list, and the orphan warning no longer go stale while the card is open, closing the
  gap in the "one store, N projections" principle the first build shipped with.
- **Threatens and equivalence link creation UI** — previously only creatable by the seed
  data; every `link()` call site was hardcoded to `derives`. The card now has an "Add A
  Link" control for both.
- **Collapsible Ladder subtrees** (the spec's "filterable *and* collapsible from day one" —
  only filterable existed). A collapse toggle appears on any non-leaf node.
- **"Auto Layout ↻" button removed.** It was a no-op — the Ladder has no manual layout
  mode to toggle, by design, so a button implying one was dishonest UI.
- **Hazard deep-link** from Control Structure to the Risk Ladder now actually navigates
  (`app.js` exports `goTo(tab, entityId)`); previously the node's subtitle promised this
  and the click just opened a local card instead.
- **Shared diagram geometry** (`src/geometry.js`) — the Ladder and Control Structure no
  longer disagree on node size, column pitch, or truncation length.
- **Mission Canvas bottom-band rule fixed** — the gutter above Mission Budget/Cost and
  Mission Achievement was a white gap (`margin-top`) while every other gutter in the
  template is a black hairline; now a matching `border-top`.
- **Full QA suite**, `test/`, 55 tests via `node --test test/`: rollup units (diamond
  dedupe, cycle guard, worst-N clamping, Unassessed exclusion, threatens-never-enters-math
  asserted directly), cascade units (descendant-only propagation, metadata non-propagation,
  depth tracking), an automated WCAG contrast gate over every token pair the app actually
  renders, a casing lint, and a jsdom smoke suite (all four tabs, card↔Database sync,
  cascade↔Ladder↔Database sync, the Hazard deep-link, round-trip, empty-graph resilience).
- **`package.json` added** (there wasn't one) — `jsdom` as a real project devDependency,
  `npm test` runs the suite, `npm start` serves `src/`.

### Resolved this session (user decisions)

- Metric edge direction: confirmed a documentation fix, not a code fix — storage stays
  parent-to-child; the spec's `Metric → Security Control (tracks)` line describes semantic
  direction, not storage direction. Orphan-flaggability is the point, not a bug: it's the
  audit-scan mechanism ("a metric tracked for no reason shouldn't exist").
- worst-N-of-M: N defaults to 1, clamps to `[1, M]`, user-editable per node.
- Propagation direction for the demo: **top-down staleness cascade**, not the (necessarily
  bottom-up) tier rollup. Tier math stays un-animated.
- Equivalence conflicts prompt for resolution; metrics may have multiple parents.
- Exactly one Mission Canvas.

### Still parked (not blockers, by explicit user request)

- Whether Loss severity should reach Mission Requirement. The mission chain bottoming out
  at Security Control (since `threatens` stays excluded from the math) is accepted as-is
  pending further reading on the user's part.

### To do

- Real layout engine (dagre / elkjs) + pan, so a much larger graph stays legible — the
  hand-rolled rung/lane layout is fine at seed scale, not proven past ~40 nodes.
- Real file attachments (currently a filename string, attach-only per phase 1 design).
- Slide-per-tier risk summary export (the second document-generation target in the spec).
- A dedicated gaps view — orphans are surfaced via the Database's toggle and the Ladder's
  `!` badge, which covers the need but isn't its own screen.
- Undo.
- Equivalence *visual* grouping is still light — a hover halo connects the pair, but true
  spatial adjacency in the rung/lane layout is blocked on the layout-engine item above.
- Cross-tab live animation (see the cascade's known scope limit above) would need all four
  views mounted simultaneously rather than one at a time.

---

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
