## Live Roadmap

The project's live roadmap page (`<PAGE_FOLDER>/roadmap.html`) is built from `<PLAN_FILE>` (format and field rules: `<SCHEMA_FILE>`) plus the merge history of `<MAIN_BRANCH>`. The plan is curated by hand -- by you -- and must stay true.

**When to update the plan** (in the same branch / pull request as the change that causes it):

- **Work starts** -- set its milestone to `active`, give it 3–7 `tasks` (plain-language checklist, done ones ticked), and put the branch name or pull request (`"#42"`) in `merge` once you know it. Keep at most three milestones `active`; `next` is what follows directly; everything else is `later`.
- **A piece of work finishes** -- set the milestone to `done`; its `merge` list must name every branch or pull request that finished it. A merge that belongs to no milestone (tooling, docs, chores, dependency bumps) goes in `notOnRoadmap` instead, which also takes patterns such as `"dependabot/*"`.
- **The plan changes** -- whenever a status, scope or decision changes in `<WATCHED_FILES>`, mirror it in the plan: add, remove, reorder or re-track milestones; fix `after` dependencies.
- **A decision waits on a human** -- add it to `waiting` (one sentence, what must be decided, `ref` to where it is discussed, `milestone` it blocks). Remove it once decided.

**How to write it**

- Write for a non-technical reader. Titles: a short outcome (2–5 words). Summaries: one sentence saying what a user gets, not how it is built. Ticket numbers, work-package IDs and phase names go in `ref` only.
- Milestones are outcomes, not tasks. A track holds 3–8 of them, in order.
- Every listed language gets every text<OPTIONAL_LANGUAGE_NOTE>.
- No dates for the future. Order comes from track order and `after`.

**The check.** `<CHECK_COMMAND>` fails on a broken plan file and warns about everything else: a merge on `<MAIN_BRANCH>` named by no milestone and not in `notOnRoadmap`, a milestone that is merged but not yet `done` (or `done` without its merge), `<WATCHED_FILES>` changed after the plan, and breaches of the rules above. Fix the plan before you finish a task that triggers a warning. The git hooks rebuild the page data automatically (they need Node.js 18+; without it they print a reminder and skip); run `node <BUILD_SCRIPT>` yourself to see the page after editing the plan.
