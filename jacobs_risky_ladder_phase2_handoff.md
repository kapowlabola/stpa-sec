# Jacob's Risky Ladder — Phase 2 Handoff (Wireframes Complete)

Builds on `jacobs_risky_ladder_design_spec.md` (Phase 1: data model). This doc covers wireframe-stage decisions only — read Phase 1 first for the entity/edge model, this doc doesn't repeat it. Reference wireframe file: `risky_ladder_wireframes_final.html` (open in a browser, four tabs, some interactivity works — zoom sliders and click-to-open detail cards are real, everything else is static).

## Data model correction from Phase 1

Mission Canvas needs more fields than Phase 1 listed. The real template in use (Mission Model Canvas, adapted from Strategyzer's Business Model Canvas) has 9 boxes, not 5. Corrected field list:

**Header band (not a grid cell):** mission/problem description, designed by, date, version.

**Grid cells, all stored as plain fields on the Mission Canvas entity, none of them derives edges, none of them enter the risk graph, none of them show up on the Ladder:**
- key_partners
- key_activities
- key_resources
- buy_in_and_support
- beneficiaries (existing)
- deployment (existing)
- cost_structure / "Mission Budget/Cost" (existing)
- impact_metrics / "Mission Achievement/Impact Factors" (existing)

**Value Propositions is not a field.** It's the same concept as Mission Requirement, described from the canvas side instead of the risk side. The canvas UI reflects the actual Mission Requirement records spawned from this canvas in that cell rather than storing separate text. Don't add a `value_propositions` field.

## Tab order

Mission Canvas → Database → Risk Ladder → Control Structure. (Phase 1 discussion had Ladder first; user moved Canvas to front since it's the entry point for top-down data entry.)

## Mission Canvas view

- Matches the real Mission Model Canvas template exactly: title band with 4 meta fields at top, 5-column grid where columns 1/3/5 (Key Partners, Value Propositions, Beneficiaries) span both rows and columns 2/4 split top/bottom (Key Activities/Key Resources, Buy-in & Support/Deployment), full-width bottom band split 50/50 (Mission Budget/Cost, Mission Achievement/Impact Factors).
- One page, no color-blocked boxes — plain white cells, black hairline grid, label + small icon badge per cell, editable text area filling the rest.
- Persisted as its own record, edit-in-place, not a wizard.
- Editing the canvas after Mission Requirements exist flags them "needs review" via a non-blocking banner below the canvas, not a modal.
- A list of Mission Requirements spawned from this canvas renders below the grid (and is what the Value Propositions cell reflects).

## Database view

- Flat table, one row per entity across all types, entity-agnostic columns (Owner, Status, Priority, Risk tier, Notes, Attachments common to everything; type-specific fields deferred behind a toggle, not shown by default).
- Click-to-edit inline on any cell — no drawer, no modal.
- Edge-type filter (All / Derives only / Threatens only) actually filters the contents of the "Linked" column, not just a visual highlight — this was an explicit ask, since `derives` vs `threatens` needs to be a queryable dimension, not just colored badges.
- Each link shown carries a small badge indicating its edge type (solid "derives" / dashed red "threatens").
- Orphan rows (no upward link) shade with the Loss/danger color as a row-level flag, same signal as the orphan badge on the Ladder.

## Risk Ladder view

- Auto-laid-out, not manually positioned — a node's position is not something a user maintains. (This matters for the "targeted re-analysis" value prop: position churn shouldn't be part of anyone's workflow.)
- Working zoom slider (40%–150%) so the whole DAG can be seen at once or zoomed in for detail.
- Clicking a node opens an anchored detail/edit card near the click point (fixed pixel size regardless of zoom level, for legibility) rather than a permanently docked inspector panel. This was a deliberate trade-off: a docked panel is more predictable but costs screen space and loses spatial context; an anchored popup keeps the "click this node to see it" feeling without needing to be legible at native zoomed-out node size. The card is anchored to the click coordinates, not literally tracked to the node's position if you pan afterward — confirmed acceptable, not worth the complexity of coordinate-tracking through the zoom transform.
- Editing a field in the card writes to the same record shown in Database — one entity store, three projections (Database / Ladder / Control Structure), not three separate copies. This bidirectional-sync principle applies everywhere, not just here.
- Split into two visual lanes: top-down (mission side) and bottom-up (hazard side), converging on Security Control.

### Color system (applies to Ladder and Control Structure)
- Mission-side entities (Mission Canvas → Security Requirement): blue
- Hazard-side entities (Controller → Security Constraint): amber
- Security Control (convergence point for both paths): teal
- Loss (terminal, human-set severity, never computed): red
- Metric: purple

### Edge/link style key
- `derives` edge: solid black arrow, direction matters, drives rollup math
- `threatens` edge: dashed red arrow, traceability only, never enters rollup math
- Equivalence link: dotted teal line, no arrowhead (non-directional), small chain icon (⛓) on both linked nodes

### Orphan/gap flag
Dashed red double-outline plus a small "!" badge, top-right of the node. No additional visual distinction for an orphan node that also happens to have a `threatens` edge — the orphan flag is the only signal needed; stacking a second visual treatment for that combination is noise, the inspector card explains the rest on click.

### Legend
Collapsible panel, toggle button in the toolbar, not always-on — shown by default off so it doesn't clutter a screen someone already knows how to read.

## Control Structure view

- Entry pattern is diagram-first, not form-first — deliberately different from Mission Canvas. Reasoning: Controller/Controlled Process/Control Action data is inherently graph-shaped (nodes and connections), while Canvas data is a fixed set of slots with no branching. Forcing both through the same form-first pattern would fight the shape of the data.
- Toolbar has "+ Add controller," "+ Add controlled process," "+ Draw control action" — placing a box creates the record immediately, blank; the click-anchored card (same component as the Ladder) is where you name it and fill fields, not a precondition for placing it.
- Unconnected nodes are allowed, same as any modern diagramming tool (Miro/Figma/draw.io) — since this diagram is schema-backed rather than just a drawing, an unconnected node isn't a dangling shape, it's a real record with no upward link. The existing orphan/gap detection mechanism from Phase 1 is what surfaces that, so no separate "must connect on creation" rule is needed. Controller/Controlled Process/Control Action stay exempt from orphan detection per Phase 1 (most control actions have no security relevance, that's normal).
- Same working zoom slider and legend pattern as the Ladder.
- A UCA node here is the same record as the one that feeds the Ladder's bottom-up chain, not a duplicate — clicking it should deep-link/open the same entity, not fork a copy.

## Open items not yet resolved

- Exact mechanism for the Ladder card staying legible while zoomed out wasn't stress-tested past "fixed pixel size, anchored near click" — worth revisiting once there's a real layout engine (dagre/elkjs or similar) and real pan/zoom, since click coordinates in screen space vs. diagram space will need reconciling.
- Whether conflicting severity weightings from an equivalence-linked Requirement/Constraint pair resolve by picking a side or averaging (flagged in Phase 1, still unresolved).
- Whether a Metric can link to multiple parent entities (flagged in Phase 1, still unresolved).
