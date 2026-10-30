# Live roadmap — setup instructions for an AI agent

You have been asked to install the **live roadmap** in this project. Read this whole file before you change anything. The human who dropped this folder in wants the result described under "What you deliver"; everything else here is how to get there.

This template folder ignores itself (its `.gitignore` holds `*`), so it never ends up in the project's git history. Leave that file alone.

## What the live roadmap is

A single web page that shows where the project stands:

- **A timeline.** One line runs from the project start (left) to "now"; past milestones sit on it, built from the git history. To the right, the line splits into **tracks** (topics such as "Editor" or "Accounts") that run in parallel and all meet again at the **release** goal. Points near the focus are spread out and labelled, points far away are squeezed together.
- **Below it:** what is in progress (with a task checklist), what comes next, what waits on a human decision, the full scope as one bar per track, and the most recently finished merges.
- **It stays current by itself as far as git can tell**, and **warns** with a status pill in the page header (green when all is well, slowly pulsing orange otherwise, details on hover) where only a human or an AI can tell: a merge nobody mapped to a milestone, a finished milestone whose merge is missing, or a plan document that changed after the roadmap did.

The page is plain HTML/CSS/JS with no dependencies, light by default with a dark mode. A small Node script (`build.mjs`, Node 18+, no packages) merges the hand-kept **plan file** with the git history and writes `roadmap-data.js` next to the page.

## Shared or local

The roadmap is installed in one of two ways. The human chooses in step 1.

**Local works exactly like shared** — the same hooks rebuild the page after every commit, merge, rebase and branch switch, an open page refreshes itself, and every later AI session keeps the plan true — **except that nothing reaches the repository.** It is the developer's own overview, not part of the project: `git status` must look the same after a local setup as before it. If you cannot make something automatic in local mode, tell the human what and why; never fall back to changing a tracked file.

| | **Shared** — for the team | **Local** — just for this developer |
| --- | --- | --- |
| Files | `tools/roadmap/`, `docs/roadmap/`, `docs/roadmap-live.json`, committed | everything in `.roadmap/`, kept out of git through `.git/info/exclude` |
| Git hooks | committed (`.githooks/` or the project's hook manager) | a private hooks folder, `.roadmap/hooks/`, switched on in this clone's own git settings; the project's own hooks still run first |
| Agent rule | the project's shared agent instructions | its own rule file that the agent loads automatically, kept out of git |
| Check | in the project's checks / CI | run by the agent before it finishes a task |
| Publishing | built wherever the page is published | none; the page is opened from disk |

## What you deliver

1. The page, the build script and a **plan file curated from this project's real documents and history**.
2. Git hooks that rebuild the page data after every commit, merge, rebase and branch switch.
3. Shared only: a check in the project's existing checks / CI that fails on a broken plan and warns when it falls behind, and the page data built wherever the page is published.
4. A "Live Roadmap" section in agent instructions, so every later AI session keeps the plan true.
5. A short report to the human: what you chose, what you assumed, what they should correct.

## Template contents

```
install/                     everything that goes into the project
  tools/roadmap/             build.mjs, roadmap-live.schema.json (the plan format), rebuild.sh (called by the hooks),
                             hooks.mjs and hook.sh (the private hooks of a local install)
  docs/roadmap/              the page: roadmap.html, roadmap.css, roadmap.js, .gitignore
  .githooks/                 post-commit, post-merge, post-checkout, post-rewrite (shared installs only)
example/roadmap-live.json    an example plan; you write docs/roadmap-live.json
snippets/agent-rule.md       the rules for the agent instructions (step 8)
```

- **Shared:** copy the contents of `install/` into the repository root. The plan is `docs/roadmap-live.json`, the page folder `docs/roadmap/`.
- **Local:** copy `install/tools/` and `install/docs/` into `.roadmap/` (no `.githooks/`). The plan is `.roadmap/docs/roadmap-live.json`, the page folder `.roadmap/docs/roadmap/`, and every command below starts with `.roadmap/` (`node .roadmap/tools/roadmap/build.mjs`).

The builder finds its plan by itself: `docs/roadmap-live.json` beside the `tools/` folder it sits in. If a shared install needs other places, these name the builder's path and must follow: the `.githooks/` scripts, the "no data" message in `roadmap.html`, the plan's `$schema`, and the agent rule; a plan elsewhere needs `ROADMAP_PLAN` set for the hooks and the check (or `--plan`).

Read `tools/roadmap/roadmap-live.schema.json` — every field, with its rules — and the header of `build.mjs`.

## Step 0 — Check the requirements

Run `git --version` and `node --version`. **Node.js 18 or newer is required** — without it the page data is never built, and the hooks can only print a reminder. If Node is missing or older, stop here: tell the human, and continue only once it is installed (or they tell you to set up anyway, knowing the page stays empty until it is). In a shared setup every machine that commits needs Node 18+ too; say so in your report.

## Step 1 — Ask the human first (one message, all questions together, with your recommendation for each)

- **Shared with the team, or just for you?** (see "Shared or local"). Recommend local unless they want teammates, CI or a published page to have it.
- **Shared only — where should the page live?** A folder inside the repo (recommended: `docs/roadmap/`), or an existing website / docs folder — possibly outside the repo (then `output` is a relative path like `../Website`).
- **Shared only — how is the page published?** Not at all (opened locally), a static host such as GitHub Pages, or the project's own site build. This decides step 7.
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

## Step 3 — Curate the plan

This is the part that needs judgement. Start the file with `"$schema": "../tools/roadmap/roadmap-live.schema.json"` (relative to the plan, the same in both modes) so editors check it. Set `output` to the page folder (`docs/roadmap` or `.roadmap/docs/roadmap`). Follow the writing rules in `snippets/agent-rule.md` ("How to write it"); the setup adds these:

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

1. Copy the files as described under "Template contents" and write the plan.
   - **Local:** first add a line `.roadmap/` to the project's exclude file (its path: `git rev-parse --git-path info/exclude`), then check that `git status` does not list `.roadmap/`.
2. Run from the repository root (local: with the `.roadmap/` prefix):
   ```bash
   node tools/roadmap/build.mjs
   node tools/roadmap/build.mjs --check
   ```
   Fix every ERROR. Every WARNING must be either fixed or understood (and reported).
3. Open `roadmap.html` from the page folder in a browser — straight from disk works, since the data is a plain script — and look at it in light and dark mode: every track, the focused milestone card, the sections below. If labels collide or a track is overloaded, re-curate (split a track, merge milestones). Check a phone-width window too.

## Step 5 — Git hooks

The hooks rebuild the page data after commits, merges, rebases and branch switches, and **never fail** them. All logic is in `rebuild.sh`; every hook only calls it with its own name and arguments. Never replace a hook setup that is already there — add to it.

**Shared** — pick the variant that matches the project:

- **No hook manager, no `core.hooksPath`:** keep `.githooks/` as copied (its `.gitattributes` keeps LF line endings), make the scripts executable in git (`git add --chmod=+x .githooks/post-* tools/roadmap/rebuild.sh`) and run `git config core.hooksPath .githooks`. Document that one command for other clones (README or contributing guide).
- **`core.hooksPath` already set:** move the four scripts into that folder and delete `.githooks/`; where a hook of that name exists, append its `exec sh tools/roadmap/rebuild.sh …` line without the `exec`.
- **Husky:** delete `.githooks/`; add `sh tools/roadmap/rebuild.sh <hook> "$@"` to `.husky/post-commit`, `post-merge`, `post-checkout` and `post-rewrite`, with each file's own name for `<hook>` (create them if missing).
- **Lefthook:** delete `.githooks/`; add the same four hooks, each with a command `sh tools/roadmap/rebuild.sh <hook> {0}`.
- **pre-commit framework:** delete `.githooks/`; a `local` hook running `node tools/roadmap/build.mjs --quiet` with `stages: [post-commit, post-merge, post-checkout, post-rewrite]`, `always_run: true`, `pass_filenames: false`.

If the page folder lies outside the repository, the hooks still write there; the human only needs the folder to exist.

**Local** — one command, whatever the project uses for hooks:

```bash
node .roadmap/tools/roadmap/hooks.mjs install
```

It creates `.roadmap/hooks/` and points git at it through `core.hooksPath` in this clone's own settings (`.git/config`, never pushed). Every hook there runs the project's own hook of that name first, from the folder git used before (`.git/hooks`, `.husky/_`, a committed hooks folder, …), so the project's hooks keep working and keep deciding — a failing pre-commit still stops the commit. After commits, merges, rebases and branch switches it then rebuilds the roadmap. `hooks.mjs status` says whether it is active; `hooks.mjs uninstall` gives git its previous hooks folder back.

Hook managers can take the hooks folder back when they reinstall (Husky on every `npm install`). The build and the check then warn, and `hooks.mjs install` repairs it — the agent rule tells later sessions to do so. Tell the human about the one that applies:

- **Husky:** nothing to do now; repaired whenever the check warns.
- **Lefthook:** run `lefthook install` before `hooks.mjs install`, never after.
- **pre-commit framework:** `pre-commit install` refuses to run while `core.hooksPath` is set: `hooks.mjs uninstall`, then `pre-commit install`, then `hooks.mjs install`.

## Step 6 — The check (shared only)

Add `node tools/roadmap/build.mjs --check` to the project's existing check script and/or CI, next to its other checks:

- It exits 1 **only** when the plan file is broken (invalid JSON, unknown track or milestone, missing text, a loop in `after`, no or several `final`). Staleness and the curating rules print `WARNING` lines. Add `--strict` only if the human wants warnings to fail the run.
- In CI, a shallow clone (the usual default) has no history: the check validates the plan and skips freshness. For freshness in CI, fetch full history (GitHub Actions: `fetch-depth: 0`).
- If the project's checks treat any output as failure, make sure the warnings do not fail the run.

Local: skip this step; the hooks print the warnings after each commit, and the agent rule has the agent run the check before it finishes a task.

## Step 7 — Build the data where the page is published (shared only)

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

Local: skip this step.

## Step 8 — The agent rule

Fill in `snippets/agent-rule.md`: replace `<PAGE_FOLDER>`, `<PLAN_FILE>`, `<SCHEMA_FILE>`, `<BUILD_SCRIPT>`, `<MAIN_BRANCH>`, `<WATCHED_FILES>`, `<CHECK_COMMAND>`, `<OPTIONAL_LANGUAGE_NOTE>` (e.g. ", in German and English", or delete it) and `<LOCAL_HOOKS_NOTE>` (local: " If it says the roadmap's hooks are not active, run `node .roadmap/tools/roadmap/hooks.mjs install`."; shared: delete it).

- **Shared:** paste it into the project's agent instructions (the file other AI tools read — `AGENTS.md`, `CLAUDE.md`, etc.; if there is none, ask the human which to create). Match the file's existing heading levels and tone.
- **Local:** the rule goes into a **new file of its own** that the human's agent loads automatically in every session — never into an existing instruction file, which may be tracked. Agents read these files from disk whether git tracks them or not, so list each new file in the exclude file. Drop "(in the same branch / pull request as the change that causes it)": the plan is not in git.
  - **Claude Code:** `.claude/rules/live-roadmap.md`, with no frontmatter (a rule without `paths` loads in every session). Not `CLAUDE.local.md`: while one exists, Claude Code stops reading the project's `AGENTS.md`.
  - **Other agents:** the file type your tool loads from a project folder on its own, as a separate file — for example a Cursor project rule (`.cursor/rules/live-roadmap.mdc` with `alwaysApply: true`) or a GitHub Copilot instructions file (`.github/instructions/live-roadmap.instructions.md` with `applyTo: "**"`). Check the format against your tool's current documentation.
  - Ask which agents the human uses, and add one file per agent.
  - Only if an agent has no such file: save the rule as `.roadmap/AGENT_RULE.md` and tell the human that this agent will not keep the plan up to date unless they point it at that file.

## Step 9 — Report and clean up

Tell the human, in plain words:

- shared or local, where the page is and how to open it;
- the tracks you chose and why; the release goal;
- which milestones you marked `active` / `next`, and the `waiting` items;
- every assumption (a merge you grouped, a status you inferred, an outcome you named) — these are what they should correct;
- any warning still printed, and why;
- shared: what every other clone needs — Node.js 18+, and the one-time command (`git config core.hooksPath ...`), if any — and what you changed for publishing;
- local: that `git status` is unchanged, what `hooks.mjs status` says, the note for their hook manager (step 5), and which agent rule files you created.

Then ask whether to remove this template folder (everything it holds has been copied to its place; it is ignored by git either way). Shared: commit only if the human asks you to, following the project's commit conventions. Local: there is nothing to commit.

## Tuning the page

At the top of `roadmap.js`: `REFRESH_MS` (how often an open page looks for new data, default one minute), `TRACK_STEP` (thumb-wheel travel per track), `DRAG_TRACK_STEP` (drag distance per track), `TIME_STEP` (main-wheel travel per column), `NEAR` / `FADE` / `BAND` (the focus window). Colours, line widths and how far tracks away from the focus fade (`--track-fade-min`, `--track-fade-step`): the variables at the top of `roadmap.css` — light in `:root`, dark under `[data-theme="dark"]`.
