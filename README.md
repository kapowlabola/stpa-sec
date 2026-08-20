# Jacob's Risky Ladder

A tool for visualizing programmatic risk and the downstream effects of changing
assumptions — so that when one piece of a security or mission case changes, only that
piece needs re-analysis, not the whole body of evidence. Grounded in the Mission Model
Canvas (mission definition) and STPA-Sec (hazard / control-structure analysis) rather
than RMF.

Four views over one shared entity store: Mission Canvas, Database, Risk Ladder, Control
Structure.

This repo's first application is security frameworks, but the underlying model — every
decision has intended and unintended consequences, and risk should be visible, not
buried in a document — generalizes to other programmatic decisions.

## Status

Wireframe-validated, early implementation. See [`docs/PROGRESS.md`](docs/PROGRESS.md)
for the current to-do / done / bug list.

## Quick start

No build step — `src/` is served as-is.

```bash
npm install      # once, for the test suite (jsdom is a devDependency only)
npm start        # serves src/ at http://localhost:5173
npm test         # runs test/ via node --test
```

ES modules need a real origin — opening `src/index.html` directly via `file://` will
not work.

## Working in this repo

- **New to the project?** Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) — covers dev
  environment setup, git workflow, and how this project uses Claude Code.
- **Working with Claude Code?** [`CLAUDE.md`](CLAUDE.md) is the project's architecture
  and invariants file that Claude reads automatically; [`.claude/agents/`](.claude/agents)
  has role-scoped agent definitions (`architect`, `backend`, `frontend`, `qa`).
- **Data model / product spec:** [`docs/jacobs_risky_ladder_design_spec.md`](docs/jacobs_risky_ladder_design_spec.md)
  (Phase 1, authoritative) and [`jacobs_risky_ladder_phase2_handoff.md`](jacobs_risky_ladder_phase2_handoff.md)
  (Phase 2 wireframe decisions).
- **What changed and when:** [`CHANGELOG.md`](CHANGELOG.md).

## Project structure

- `src/` — the application, vanilla ES modules + plain CSS, zero runtime dependencies
- `test/` — `node --test test/`, covers rollup math, staleness cascade, contrast, casing, smoke
- `.claude/agents/` — role-scoped Claude Code agent definitions
- `docs/` — design spec, product spec, progress log
- `.devcontainer/` — Docker dev environment (see `CONTRIBUTING.md` for setup)

## Tech stack

Vanilla ES modules, plain CSS, zero runtime dependencies. State persists to
`localStorage`; Export/Import JSON in the header moves a graph between browsers.
Hosting, auth, and classification handling are explicitly out of scope for this repo —
owned by an integrator application later.

## License

Not yet set. Do not distribute outside the team until this is decided.
