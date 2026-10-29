# Live roadmap — setup instructions for an AI agent

You have been asked to install the **live roadmap** in this project. Read this whole file before you change anything. The human who dropped this folder in wants the result described under "What you deliver"; everything else here is how to get there.

## What the live roadmap is

A single web page that shows where the project stands:

- **A timeline.** One line runs from the project start (left) to "now"; past milestones sit on it, built from the git history. To the right, the line splits into **tracks** (topics such as "Editor" or "Accounts") that run in parallel and all meet again at the **release** goal. Points near the focus are spread out and labelled, points far away are squeezed together.
- **Below it:** what is in progress (with a task checklist), what comes next, what waits on a human decision, the full scope as one bar per track, and the most recently finished merges.
- **It stays current by itself as far as git can tell**, and **warns** with a status pill in the page header (green when all is well, slowly pulsing orange otherwise, details on hover) where only a human or an AI can tell: a merge nobody mapped to a milestone, a finished milestone whose merge is missing, or a plan document that changed after the roadmap did.

The page is plain HTML/CSS/JS with no dependencies, light by default with a dark mode. A small Node script (`build.mjs`, Node 18+, no packages) merges the hand-kept **plan file** with the git history and writes `roadmap-data.js` next to the page.

## What you deliver

1. The page, the build script and a **plan file curated from this project's real documents and history**.
2. Git hooks that rebuild the page data after every commit, merge, rebase and branch switch.
3. A check in the project's existing checks / CI that fails on a broken plan and warns when it falls behind.
4. The page data built wherever the page is published.
5. A "Live Roadmap" section in the project's agent instructions, so every later AI session keeps the plan true.
6. A short report to the human: what you chose, what you assumed, what they should correct.

## Template contents

```
install/                     copy its contents into the repository root
  tools/roadmap/             build.mjs, roadmap-live.schema.json (the plan format), rebuild.sh (called by the hooks)
  docs/roadmap/              the page: roadmap.html, roadmap.css, roadmap.js, .gitignore
  .githooks/                 post-commit, post-merge, post-checkout, post-rewrite
example/roadmap-live.json    an example plan; you write docs/roadmap-live.json
snippets/agent-rule.md       the rules for the project's agent instructions (step 8)
```

The defaults are `tools/roadmap/`, `docs/roadmap/` (the page folder) and `docs/roadmap-live.json` (the plan). If the project needs other places, these name the builder's path and must follow: `tools/roadmap/rebuild.sh`, the `.githooks/` scripts, the "no data" message in `roadmap.html`, the plan's `$schema`, and the agent rule. A plan elsewhere than `docs/roadmap-live.json` needs `ROADMAP_PLAN` set for the hooks and the check (or `--plan`).

Read `tools/roadmap/roadmap-live.schema.json` — every field, with its rules — and the header of `build.mjs`.

## Step 0 — Check the requirements

Run `git --version` and `node --version`. **Node.js 18 or newer is required** — without it the page data is never built, and the hooks can only print a reminder. If Node is missing or older, stop here: tell the human, and continue only once it is installed (or they tell you to set up anyway, knowing the page stays empty until it is). Every machine that commits to the project needs Node 18+ too; say so in your report.

## Step 1 — Ask the human first (one message, all questions together, with your recommendation for each)

- **Where should the page live?** A folder inside the repo (recommended: `docs/roadmap/`), or an existing website / docs folder — possibly outside the repo (then `output` is a relative path like `../Website`).
- **How is the page published?** Not at all (opened locally), a static host such as GitHub Pages, or the project's own site build. This decides step 7.
- **Languages.** Default English only. For several, list them; the first is the default. The page ships interface texts for `en` and `de`; for others add a block to `UI` in `roadmap.js` (missing texts fall back to English).
- **What is the release goal** at the right end of the timeline (e.g. "1.0 public release")? If the project's documents name it, propose that.
- **Anything they want on or off the roadmap** (e.g. "leave the marketing site out").

If the human said "just do it", use the recommendations and list them in your report.

## Step 2 — Read the project (do not skip; the plan is only as good as this)

Read, in this order, and take notes:

1. The README and any roadmap / plan / status / milestone documents (`ROADMAP.md`, `docs/`, `PLAN*.md`, `CHANGELOG.md`, ADRs). Note phases, goals, open questions, decisions waiting on someone.
2. The merge history of the main branch:
   ```bash
   git log --first-parent --format="%h %ad %P | %s" --date=short main | head -80
   ```
   Decide which **workflow** the project uses — it decides how past milestones get their evidence:
   - **Merge commits** (`Merge branch 'x'`, `Merge x -- ...`) → history key = branch name.
   - **GitHub pull-request merges** (`Merge pull request #42 from owner/branch`) → keys `#42` and the branch.
   - **Squash merges** (`Title (#42)`) → key `#42`.
   - **Direct commits only** (no merges, no `(#N)`) → past milestones use `commit` (a hash) as evidence, and the "unmapped merge" warning never fires. Tell the human: freshness then rests on the `watch` files alone.
3. If a GitHub remote and the `gh` CLI exist, open issues / milestones / project boards are good sources for upcoming work (`gh issue list`, `gh api repos/:owner/:repo/milestones`). Treat them as input, not truth.
4. The project's agent instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, …), how its checks run (`package.json` scripts, `Makefile`, `checks.*`, CI workflows) and how it is deployed.
5. How git hooks are managed: `.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`, `git config core.hooksPath`, or nothing.

## Step 3 — Curate the plan (`docs/roadmap-live.json`)

This is the part that needs judgement. Start the file with `"$schema": "../tools/roadmap/roadmap-live.schema.json"` (relative to the plan) so editors check it. Follow the writing rules in `snippets/agent-rule.md` ("How to write it"); the setup adds these:

**Tracks**
- 4–10 tracks. Each is a **topic a non-technical reader recognises** (a feature area, a product part, "Release"), not a team or a technical layer.
- One **trunk** (`trunk`): the spine every other track branches off and rejoins — usually "Core" or the product itself. It holds the foundational milestones and the final release.
- Order tracks top to bottom so that the trunk sits in the middle and related tracks are neighbours. A "Release" track (licence, packaging, legal, launch) usually belongs at one edge.

**Milestones**
- **Past:** walk the merge history from oldest to newest and group merges into outcomes. Every merge since you add the plan file must end up in some milestone's `merge` list or in `notOnRoadmap`. Older merges may be left out, but map the meaningful ones so the left side of the timeline tells the real story. Before merges existed, use `commit`.
- **Now and next:** `active` is what is being worked on right now; if its branch or pull request is known, put it in `merge` already — the page shows the milestone as done the moment it lands. `next` is directly queued; everything else up to the release is `later`.
- **`after`** — only real dependencies on milestones in *other* tracks. A track with no `after` branches off the trunk just before its first milestone.
- **`final`** — exactly one milestone, the release goal, last in the trunk.

**Other fields**
- `waiting` — from open-question lists, "TBD" and "needs decision" notes.
- `watch` — the project's own plan / status documents (e.g. `ROADMAP.md`, `docs/plan.md`).
- `notOnRoadmap` — tooling, docs, CI, dependency bumps, refactors with no visible outcome. Prefer patterns where the project's naming allows (`"dependabot/*"`, `"chore*"` — a pattern matches a branch, a pull request key or the commit subject).
- `project` — `name`, optional `homeUrl` (link from the page's logo).

## Step 4 — Install and build

1. Copy the contents of `install/` into the repository root (adapting paths as above) and write the plan.
2. Run from the repository root:
   ```bash
   node tools/roadmap/build.mjs
   node tools/roadmap/build.mjs --check
   ```
   Fix every ERROR. Every WARNING must be either fixed or understood (and reported).
3. Open `roadmap.html` in a browser — straight from disk should work, since the data is a plain script and nothing is fetched; otherwise use a local web server (e.g. `python -m http.server` in the page folder) — and look at it in light and dark mode: every track, the focused milestone card, the sections below. If labels collide or a track is overloaded, re-curate (split a track, merge milestones). Check a phone-width window too.

## Step 5 — Git hooks

The hooks rebuild the page data after commits, merges, rebases and branch switches, and **never fail** them. All logic is in `tools/roadmap/rebuild.sh`; every hook only calls it with its own name and arguments. Pick the variant that matches the project; never replace a hook setup that is already there — add to it.

- **No hook manager, no `core.hooksPath`:** keep `.githooks/` as copied (its `.gitattributes` keeps LF line endings), make the scripts executable in git (`git add --chmod=+x .githooks/post-* tools/roadmap/rebuild.sh`) and run `git config core.hooksPath .githooks`. Document that one command for other clones (README or contributing guide).
- **`core.hooksPath` already set:** move the four scripts into that folder and delete `.githooks/`; where a hook of that name exists, append its `exec sh tools/roadmap/rebuild.sh …` line without the `exec`.
- **Husky:** delete `.githooks/`; add `sh tools/roadmap/rebuild.sh <hook> "$@"` to `.husky/post-commit`, `post-merge`, `post-checkout` and `post-rewrite`, with each file's own name for `<hook>` (create them if missing).
- **Lefthook:** delete `.githooks/`; add the same four hooks, each with a command `sh tools/roadmap/rebuild.sh <hook> {0}`.
- **pre-commit framework:** delete `.githooks/`; a `local` hook running `node tools/roadmap/build.mjs --quiet` with `stages: [post-commit, post-merge, post-checkout, post-rewrite]`, `always_run: true`, `pass_filenames: false`.

If the page folder lies outside the repository, the hooks still write there; the human only needs the folder to exist.

## Step 6 — The check

Add `node tools/roadmap/build.mjs --check` to the project's existing check script and/or CI, next to its other checks:

- It exits 1 **only** when the plan file is broken (invalid JSON, unknown track or milestone, missing text, a loop in `after`, no or several `final`). Staleness and the curating rules print `WARNING` lines. Add `--strict` only if the human wants warnings to fail the run.
- In CI, a shallow clone (the usual default) has no history: the check validates the plan and skips freshness. For freshness in CI, fetch full history (GitHub Actions: `fetch-depth: 0`).
- If the project's checks treat any output as failure, make sure the warnings do not fail the run.

## Step 7 — Build the data where the page is published

`roadmap-data.js` names the commit it was built from, so it changes with every commit. It is therefore **not committed**: `docs/roadmap/.gitignore` keeps it out of git, and every clone builds its own through the hooks.

- **Opened locally only:** nothing more to do.
- **Published by a site build or CI job:** run `node tools/roadmap/build.mjs` before the page is copied out, with full history. In GitHub Actions:
  ```yaml
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  - uses: actions/setup-node@v4
    with:
      node-version: 20
  - run: node tools/roadmap/build.mjs
  ```
  If the page is served straight from a branch with no build (e.g. GitHub Pages "deploy from a branch"), propose switching to a workflow like the one above; do not commit the data file instead — it would always be one commit behind and leave the working tree dirty.
- **Page folder outside the repository:** delete the `.gitignore` there unless that folder is a git repository that publishes through a build of its own.

## Step 8 — The agent rule

Paste `snippets/agent-rule.md` into the project's agent instructions (the file other AI tools read — `AGENTS.md`, `CLAUDE.md`, etc.; if there is none, ask the human which to create). Replace the placeholders: `<PAGE_FOLDER>`, `<PLAN_FILE>`, `<SCHEMA_FILE>`, `<BUILD_SCRIPT>`, `<MAIN_BRANCH>`, `<WATCHED_FILES>`, `<CHECK_COMMAND>`, and `<OPTIONAL_LANGUAGE_NOTE>` (e.g. ", in German and English", or delete it). Match the file's existing heading levels and tone.

## Step 9 — Report and clean up

Tell the human, in plain words:

- where the page is and how to open it;
- the tracks you chose and why; the release goal;
- which milestones you marked `active` / `next`, and the `waiting` items;
- every assumption (a merge you grouped, a status you inferred, an outcome you named) — these are what they should correct;
- any warning still printed, and why;
- what every other clone needs: Node.js 18+, and the one-time command (`git config core.hooksPath ...`), if any;
- what you changed for publishing.

Then ask whether to remove this template folder (everything it holds has been copied to its place). Commit only if the human asks you to, following the project's commit conventions.

## Tuning the page

At the top of `roadmap.js`: `REFRESH_MS` (how often an open page looks for new data, default one minute), `TRACK_STEP` (thumb-wheel travel per track), `DRAG_TRACK_STEP` (drag distance per track), `TIME_STEP` (main-wheel travel per column), `NEAR` / `FADE` / `BAND` (the focus window). Colours, line widths and how far tracks away from the focus fade (`--track-fade-min`, `--track-fade-step`): the variables at the top of `roadmap.css` — light in `:root`, dark under `[data-theme="dark"]`.
