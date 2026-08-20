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
  - `app.js` - Tab router + re-render loop (preserves focus/caret/scroll across renders)
  - `store.js` - Entity store, edges, rollup math, orphan detection, persistence
  - `seed.js` - UAS ISR worked example from the design spec
  - `ui.js` - `h()` DOM helper + the click-anchored detail card
  - `views/` - One module per tab
- `docs/` - Design spec, product spec, progress log
- `risky_ladder_wireframes_final.html` - Original static wireframes (reference only)
- `jacobs_risky_ladder_phase2_handoff.md` - Wireframe-stage decisions
- `.claude/` - Claude Code configuration and custom agents
- `.github/workflows/` - CI/CD workflows

## Development Setup

No dependencies and no build step. Serve `src/` over HTTP — ES modules need a real
origin, so opening the file directly via `file://` will not work:

```bash
npx http-server src -p 5173 -c-1     # then open http://localhost:5173
```

## Tech Stack

Vanilla ES modules + plain CSS, zero runtime dependencies. State persists to
`localStorage` under the key `risky-ladder-v1`; Export/Import JSON in the header moves a
graph between browsers. Hosting, auth and classification handling are explicitly out of
scope — owned by an integrator application later.

## Architecture notes

- **One entity store, four projections.** Database / Ladder / Control Structure / Canvas
  all read and write the same records, never copies. Editing a node's title on the
  Ladder changes the Database row immediately.
- **Two edge kinds, and the difference is load-bearing.** `derives` edges drive the risk
  rollup; `threatens` edges are traceability only and never enter the math.
  `equivalence` links are non-directional and non-destructive.
- **Edges are stored in spec direction** (`Mission Canvas → Mission Requirement`). Score
  flows the *other* way: a node aggregates its outgoing `derives` targets, so a leaf's
  human-set tier is the input and everything above it is computed.
- **Ladder positions are derived, never stored** — position churn must not be part of
  anyone's workflow. Control Structure positions *are* stored, since that view is
  diagram-first by design.

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
