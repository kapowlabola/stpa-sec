# Contributing

This project is built with [Claude Code](https://claude.com/product/claude-code), and it
assumes you're using it too. If you've never coded alongside an AI agent before, read
this whole doc before you touch anything — it'll save you both from surprises.

## 1. Set up the dev environment

Everything runs in a Docker dev container so Claude Code can operate freely inside it
without touching your actual machine.

**Using VS Code (recommended):**

1. Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
2. Clone this repo and open it in VS Code.
3. Command Palette → "Dev Containers: Reopen in Container". VS Code builds
   `.devcontainer/Dockerfile` and drops you in as the non-root `node` user.
4. `npm install`, then `npm start` to serve the app at `http://localhost:5173`.

**Using plain Docker (no VS Code):**

```bash
docker build -f .devcontainer/Dockerfile -t stpa-sec-dev .
docker run -it --rm -v "$(pwd)":/workspace stpa-sec-dev
```

The Dockerfile sets `USER node` explicitly, so this works the same way whether or not
VS Code is involved — the container never runs as root.

**Why this matters:** Claude Code refuses to run with `--dangerously-skip-permissions`
as root, for safety. If you ever see Claude Code stuck asking "allow bash..." on every
single action even though you passed that flag, the container is running as root —
check that you're not overriding the `USER` with `docker run --user root` or similar.

## 2. What Claude Code needs from you, once

- Claude Code needs to be authenticated. Run `claude` inside the container and follow
  the login prompt once — your credentials persist via the mount in
  `.devcontainer/devcontainer.json`, so you won't repeat this per-session.
- Never put real secrets in `.env` and commit it — `.env` is gitignored on purpose.
  `.env.example` is the committed template; copy it to `.env` locally.

## 3. How this project uses Claude Code

Read [`CLAUDE.md`](CLAUDE.md) first — it's the file Claude Code loads automatically at
the start of every session in this repo. It has the architecture invariants, tech
stack, and conventions. If you change something architectural, update `CLAUDE.md` in
the same PR — it's documentation that's meant to be correct, not aspirational.

This repo also defines role-scoped sub-agents in [`.claude/agents/`](.claude/agents):

| Agent | Scope |
|---|---|
| `architect` | Module boundaries, design system, spec-to-code traceability. Read-only — decides, doesn't implement. |
| `backend` | Store, rollup math, validation, persistence. |
| `frontend` | Views, rendering, the design system's application. |
| `qa` | Test suite, regressions, contrast/casing gates. |

Claude Code picks these automatically based on task, or you can invoke one directly
(e.g. "use the architect agent to figure out where this belongs"). Each carries a
scoped slice of `CLAUDE.md`'s invariants, so it can't wander outside its lane.

**Plan mode first.** `CLAUDE.md` requires entering plan mode (Opus model) before any
coding — Claude proposes an approach, you approve or redirect it, *then* it writes
code. Don't skip this because it feels slower. The cost of a wrong plan caught at the
plan stage is one message; caught after 200 lines of code, it's a rewrite. If Claude
starts writing code without a plan on anything non-trivial, stop it and ask for one.

## 4. Git workflow

Never commit directly to `main`.

```bash
git checkout main && git pull
git checkout -b descriptive-name
# ... work, with Claude or without ...
git push -u origin descriptive-name
# open a PR
```

Claude Code can do all of this for you (branch, commit, push, open the PR) — ask it to.
It will not force-push, skip hooks, or push to `main` unless you explicitly tell it to;
if it ever does one of those without you asking, that's a bug in how it's being used,
flag it.

**Commit messages:** explain *why*, not just *what*. "Fix bug" is not acceptable from a
human or from Claude. A commit changing rollup weighting should say what was wrong with
the old behavior, not just "update rollup.js".

**PRs merged to `main` auto-update [`CHANGELOG.md`](CHANGELOG.md)** — a GitHub Action
appends a row (date, PR #, author, title, files touched) on every merge. You don't need
to edit the changelog by hand; you do need a PR title and description that are worth
reading later, because that's what ends up in the table. See
[`.github/workflows/update-changelog.yml`](.github/workflows/update-changelog.yml).

## 5. Working alongside Claude Code — what actually helps

- **Be specific about scope.** "Fix the ladder animation" is worse than "the ladder's
  staleness cascade doesn't animate when I switch tabs mid-edit — see the known scope
  limit in `docs/PROGRESS.md`." Claude works from what you tell it, not what you meant.
- **Read the diff before you accept it.** Claude Code is fast, which means it's easy to
  rubber-stamp a change you haven't actually reviewed. You're still the one whose name
  is on the commit.
- **Push back when something looks off.** Claude will confidently produce a wrong
  answer. Treat it like a fast, occasionally overconfident collaborator, not an oracle.
- **Update `docs/PROGRESS.md` at the end of a session** — to-do, done, and bug lists.
  This is how the next session (yours, your teammate's, or Claude's) picks up context
  without re-deriving it.
- **`--dangerously-skip-permissions`** is enabled in this repo's Claude Code config
  because you're always inside the isolated dev container — never run it against your
  host filesystem directly. If you're not in the container, don't use that flag.

## 6. Before opening a PR

```bash
npm test
```

All 55+ tests in `test/` must pass — rollup math, staleness cascade, contrast (WCAG
4.5:1 on every entity color), casing conventions, and a smoke suite. A PR that breaks
one of these should say why in the description, not just skip it.
