# Project Documentation

## Overview

**Jacob's Risky Ladder** — a tool for visualizing risk and the downstream effects of
changing assumptions, so that when circumstances change only the one changed piece needs
re-analysis, not the whole body of evidence. Grounded in the Mission Model Canvas
(mission definition) and STPA-Sec (hazard / control-structure analysis) rather than RMF.

Four views over one shared entity store: Mission Canvas, Database, Risk Ladder,
Control Structure.

## Project Structure

- `src/` - The application (no build step)
  - `index.html` - Shell: header, tab root, JSON import/export
  - `tokens.css` - Design tokens: USWDS red/white/blue chrome + entity palette
  - `styles.css` - All styling; consumes `tokens.css` only, no hex literals
  - `app.js` - Tab router; splits full `render()` (initial load, tab switches) from
    incremental `patch()` (store-driven refresh while a tab stays mounted, enabling
    animation); exports `goTo(tab, entityId)` for cross-view deep links
  - `store.js` - Entity store: entities, edges, graph reads/writes, staleness cascade,
    orphan detection; re-exports rollup.js's public API as a facade
  - `rollup.js` - Risk-tier computation (weighted-average / worst-N aggregation)
  - `validate.js` - Edge-shape rules, enforced at write time (pure, no store import)
  - `persist.js` - localStorage + JSON import/export (pure, no store import)
  - `geometry.js` - Shared diagram constants (node size, column pitch, zoom bounds)
  - `seed.js` - UAS ISR worked example from the design spec
  - `ui.js` - `h()` DOM helper, the shared click-anchored detail card, equivalence
    conflict resolution, and the design-token cache (`token()`)
  - `views/` - One module per tab; `ladder.js` implements `update()` for the
    animated staleness cascade, the other three use `render()` only
- `test/` - `node --test test/` runs rollup/cascade/contrast/casing/smoke suites
- `.claude/agents/` - `architect`, `backend`, `frontend`, `qa` — role-scoped agent
  definitions, each carrying this file's invariants
- `docs/` - Design spec, product spec, progress log
- `risky_ladder_wireframes_final.html` - Original static wireframes (reference only)
- `jacobs_risky_ladder_phase2_handoff.md` - Wireframe-stage decisions
- `.github/workflows/` - CI/CD workflows

## Development Setup

No build step for the app itself; `jsdom` is a devDependency for the test suite only.
Serve `src/` over HTTP — ES modules need a real origin, so opening the file directly via
`file://` will not work:

```bash
npm install                          # once, for the test suite
npm start                            # serves src/ at http://localhost:5173
npm test                             # runs test/ via node --test
```

## Tech Stack

Vanilla ES modules + plain CSS, zero runtime dependencies. State persists to
`localStorage` under the key `risky-ladder-v1`; Export/Import JSON in the header moves a
graph between browsers. Hosting, auth and classification handling are explicitly out of
scope — owned by an integrator application later. Chrome follows USWDS red/white/blue;
entity colors use USWDS extended-palette families, verified ≥4.5:1 on white by an
automated contrast gate in `test/contrast.test.js`.

## Architecture notes

- **One entity store, four projections.** Database / Ladder / Control Structure / Canvas
  all read and write the same records, never copies. Editing a node's title on the
  Ladder changes the Database row immediately, and the open detail card re-renders its
  own fields live on every store change.
- **Two edge kinds, and the difference is load-bearing.** `derives` edges drive the risk
  rollup; `threatens` edges are traceability only and never enter the math.
  `equivalence` links are non-directional and non-destructive, and a tier disagreement
  between an equivalence-linked pair prompts the user to resolve it.
- **Edges are stored parent-to-child** (`Mission Canvas → Mission Requirement`), uniformly
  — even where the spec's prose writes an edge in the semantic direction (`Metric →
  Security Control (tracks)`). Score flows the *other* way: a node aggregates its outgoing
  `derives` targets, so a leaf's human-set tier is the input and everything above it is
  computed. `derives` edges are whitelisted in `validate.js` and rejected at write time if
  they're not in the spec's enumerated edge list — not merely defended against with a
  runtime cycle guard.
- **Staleness cascades *down* `derives`; risk rolls *up* `derives`.** Two propagations,
  opposite directions, same edges. Editing a content field (title, description, a canvas
  cell, a leaf tier) marks every transitively-derived descendant `needs-review`; editing
  metadata (owner, status, priority, notes, attachments) does not. This is the app's core
  thesis made visible — "only the one changed piece needs re-analysis."
- **Ladder positions are derived, never stored** — position churn must not be part of
  anyone's workflow. Control Structure positions *are* stored, since that view is
  diagram-first by design.
- **The Ladder patches in place; it does not fully re-render.** `app.js`'s `patch()`
  calls `views/ladder.js`'s `update()`, which looks up existing node elements by
  `data-entity-id` and mutates their class/position instead of recreating them — the only
  way a CSS transition (the staleness-cascade animation) can fire. Because this is a
  single-active-tab app, the animation is only visible while the Ladder tab is already
  mounted; switching tabs after an edit shows the settled result, not a live replay.

## Git Workflow
Before making any code changes, create a new branch off up-to-date main
(git checkout main && git pull && git checkout -b descriptive-name).
Never commit directly to main. Open a PR when the work is ready.

## Documentation
Create a to do list and done list to clearly track what work you did. Also include a bug list. Update htis at the end of each coding session.
You should always be working in a dev environment / docker. As such, you are allowed to dangerously skip permissions to enable faster development. 

## Agents and Planning
Before doing any coding, enter plan mode using an Opus model. Then verify the plan and switch to code mode.

## Key Files

- `CLAUDE.md` - This file; project context for Claude Code
- `docs/jacobs_risky_ladder_design_spec.md` - Phase 1: the authoritative data model
- `docs/PROGRESS.md` - To do / done / bug lists, updated each session
- `.env.example` - Environment variables template
- `docs/spec.md` - Product specification and design document

## Getting Help

See the [spec](docs/spec.md) for detailed product information.
