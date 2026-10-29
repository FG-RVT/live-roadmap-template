// Live roadmap builder.
//
// Reads the hand-kept plan (default docs/roadmap-live.json), adds the history of
// the main branch from git, and writes roadmap-data.js next to the roadmap page.
// Run by the git hooks (through rebuild.sh) and, with --check, by the project's
// checks or CI. Needs Node 18+ and git. No dependencies.
//
//   node tools/roadmap/build.mjs            build and write the data file
//   node tools/roadmap/build.mjs --check    validate and report freshness; write nothing
//   options: --plan <file>   plan file (default: $ROADMAP_PLAN, else docs/roadmap-live.json)
//            --out <dir>     page folder (default: $ROADMAP_OUT, else the plan's "output")
//            --strict        exit 1 on warnings too
//            --no-git        leave the git history out (e.g. to preview the example plan)
//            --quiet         print warnings only
//   Paths given as options are relative to the current folder; all others are
//   relative to the repository root.
//
// Exit code 1 only when the plan file itself is broken (with --strict: also on
// any warning). Staleness and the curating rules are warnings.
//
// Plan file format: roadmap-live.schema.json next to this script (point the
// plan's "$schema" at it for help in the editor). This script also checks what
// a schema cannot: ids that refer to each other, a text for every language,
// loops in "after", and the curating rules.
//
// History keys: every first-parent commit on mainBranch that is a merge
// ("Merge pull request #42 from owner/feature/login" -> "#42" and
// "feature/login"; "Merge branch 'x'" or "Merge x -- ..." -> "x") or a squash
// merge ("Add login (#42)" -> "#42"). Plain direct commits are not events.
//
// Evidence: a done milestone names the history keys that finish it ("merge") or
// a commit. A milestone that is not done yet may name the keys it expects; once
// all of them are on the main branch the page shows it as done, and the build
// warns until the plan says so too.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error(`roadmap: ERROR Node.js 18 or newer is needed (this is ${process.version})`);
  process.exit(1);
}

const STATUSES = ['done', 'active', 'next', 'later'];
const RECENT = 6;
const TITLE_MAX = 30;
const ACTIVE_MAX = 3;
const TASKS_MIN = 3;
const TASKS_MAX = 7;
const FIELDS = {
  plan: ['project', 'languages', 'mainBranch', 'output', 'watch', 'trunk', 'notOnRoadmap', 'tracks', 'milestones', 'waiting'],
  project: ['name', 'homeUrl'],
  track: ['id', 'title'],
  milestone: ['id', 'track', 'status', 'title', 'summary', 'after', 'merge', 'commit', 'ref', 'tasks', 'final'],
  task: ['done', 'text'],
  waiting: ['text', 'ref', 'milestone'],
};

const args = process.argv.slice(2);
const check = args.includes('--check');
const quiet = args.includes('--quiet');
const strict = args.includes('--strict');
const noGit = args.includes('--no-git');
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

const errors = [];
const warnings = [];
const say = (line) => { if (!quiet) console.log(line); };

function tryGit(gitArgs, cwd = ROOT) {
  try {
    return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const ROOT = tryGit(['rev-parse', '--show-toplevel'], process.cwd()) || process.cwd();
const PLAN = option('--plan')
  ? resolve(option('--plan'))
  : resolve(ROOT, process.env.ROADMAP_PLAN || 'docs/roadmap-live.json');
const PLAN_REL = relative(ROOT, PLAN).replace(/\\/g, '/');

// --- Plan file -----------------------------------------------------------------

function checkFields(object, kind, where) {
  if (!object || typeof object !== 'object') return;
  for (const key of Object.keys(object)) {
    if (!key.startsWith('$') && !FIELDS[kind].includes(key)) warnings.push(`${where}: unknown field "${key}"`);
  }
}

function checkText(value, languages, where, max) {
  if (typeof value === 'string') {
    if (!value) errors.push(`${where}: empty text`);
    else if (languages.length > 1) errors.push(`${where}: needs a text per language (${languages.join(', ')})`);
    else if (max && value.length > max) warnings.push(`${where}: longer than ${max} characters`);
    return;
  }
  if (!value || typeof value !== 'object') { errors.push(`${where}: missing text`); return; }
  for (const lang of languages) {
    if (typeof value[lang] !== 'string' || !value[lang]) errors.push(`${where}: missing "${lang}" text`);
    else if (max && value[lang].length > max) warnings.push(`${where}: "${lang}" text longer than ${max} characters`);
  }
}

function loadPlan() {
  let plan;
  try {
    plan = JSON.parse(readFileSync(PLAN, 'utf8'));
  } catch (error) {
    errors.push(`${PLAN_REL}: ${error.message}`);
    return null;
  }
  const languages = plan.languages?.length ? plan.languages : ['en'];
  plan.languages = languages;
  plan.mainBranch = plan.mainBranch || 'main';
  checkFields(plan, 'plan', PLAN_REL);
  checkFields(plan.project, 'project', '"project"');
  if (!plan.project?.name) errors.push('"project.name" is missing');
  if (!Array.isArray(plan.tracks) || !plan.tracks.length) errors.push('"tracks" lists no track');
  if (!Array.isArray(plan.milestones) || !plan.milestones.length) errors.push('"milestones" lists no milestone');
  plan.tracks = Array.isArray(plan.tracks) ? plan.tracks : [];
  plan.milestones = Array.isArray(plan.milestones) ? plan.milestones : [];

  const trackIds = new Set();
  plan.tracks.forEach((track, i) => {
    if (!track.id) { errors.push(`track ${i + 1} has no "id"`); return; }
    const where = `track "${track.id}"`;
    if (trackIds.has(track.id)) errors.push(`${where} is listed twice`);
    trackIds.add(track.id);
    checkFields(track, 'track', where);
    checkText(track.title, languages, `${where} title`);
  });
  if (!trackIds.has(plan.trunk)) errors.push(`trunk "${plan.trunk}" is not a track`);

  const ids = new Set();
  plan.milestones.forEach((m, i) => {
    if (!m.id) { errors.push(`milestone ${i + 1} has no "id"`); return; }
    if (ids.has(m.id)) errors.push(`milestone "${m.id}" is listed twice`);
    else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(m.id)) warnings.push(`milestone "${m.id}": ids are kebab-case`);
    ids.add(m.id);
  });
  const finals = plan.milestones.filter((m) => m.final);
  if (finals.length !== 1) errors.push(`exactly one milestone needs "final": true (found ${finals.length})`);
  else if (finals[0].track !== plan.trunk) warnings.push(`milestone "${finals[0].id}": the final milestone belongs in the trunk "${plan.trunk}"`);

  for (const m of plan.milestones) {
    const where = `milestone "${m.id}"`;
    checkFields(m, 'milestone', where);
    if (!trackIds.has(m.track)) errors.push(`${where}: unknown track "${m.track}"`);
    if (!STATUSES.includes(m.status)) errors.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
    checkText(m.title, languages, `${where} title`, TITLE_MAX);
    if (m.summary) checkText(m.summary, languages, `${where} summary`);
    for (const a of m.after ?? []) if (!ids.has(a)) errors.push(`${where}: "after" names unknown milestone "${a}"`);
    for (const t of m.tasks ?? []) {
      checkFields(t, 'task', `${where} task`);
      checkText(t.text, languages, `${where} task`);
    }
    if (m.commit && m.status !== 'done') errors.push(`${where}: only a done milestone names a commit`);
    const taskCount = m.tasks?.length ?? 0;
    if (m.status === 'active' && (taskCount < TASKS_MIN || taskCount > TASKS_MAX)) {
      warnings.push(`${where}: an active milestone has ${TASKS_MIN}-${TASKS_MAX} tasks (found ${taskCount})`);
    }
  }
  const active = plan.milestones.filter((m) => m.status === 'active').length;
  if (active > ACTIVE_MAX) warnings.push(`${active} milestones are active; keep it to ${ACTIVE_MAX} at most`);

  // Within a track, work runs done -> active -> next -> later.
  for (const track of plan.tracks) {
    let highest = 0;
    for (const m of plan.milestones.filter((x) => x.track === track.id && !x.final)) {
      const at = STATUSES.indexOf(m.status);
      if (at < 0) continue;
      if (at < highest) warnings.push(`milestone "${m.id}" is ${m.status} but comes after a ${STATUSES[highest]} one in track "${track.id}"`);
      highest = Math.max(highest, at);
    }
  }

  for (const w of plan.waiting ?? []) {
    const where = `waiting item "${w.ref ?? '?'}"`;
    checkFields(w, 'waiting', where);
    checkText(w.text, languages, where);
    if (w.milestone && !ids.has(w.milestone)) errors.push(`${where}: unknown milestone "${w.milestone}"`);
  }
  for (const key of plan.notOnRoadmap ?? []) {
    if (typeof key !== 'string' || !key) errors.push('"notOnRoadmap" lists history keys or patterns (strings) only');
  }
  for (const path of noGit ? [] : plan.watch ?? []) {
    if (!existsSync(resolve(ROOT, path))) warnings.push(`watched file "${path}" does not exist`);
  }
  return plan;
}

// Column of every milestone: one more than the latest thing it waits for (the
// milestone before it in its track, and its "after" list). The final milestone
// waits for the last milestone of every track.
function rank(plan) {
  const deps = new Map();
  for (const track of plan.tracks) {
    const list = plan.milestones.filter((m) => m.track === track.id && !m.final);
    list.forEach((m, i) => deps.set(m.id, [...(i ? [list[i - 1].id] : []), ...(m.after ?? [])]));
  }
  const final = plan.milestones.find((m) => m.final);
  const ends = plan.tracks
    .map((t) => plan.milestones.filter((m) => m.track === t.id && !m.final).pop())
    .filter(Boolean)
    .map((m) => m.id);
  deps.set(final.id, [...ends, ...(final.after ?? [])]);

  const ranks = new Map();
  const visiting = new Set();
  function visit(id) {
    if (ranks.has(id)) return ranks.get(id);
    if (visiting.has(id)) { errors.push(`milestone "${id}" waits for itself (a loop in "after")`); return 0; }
    visiting.add(id);
    const r = Math.max(-1, ...deps.get(id).map(visit)) + 1;
    visiting.delete(id);
    ranks.set(id, r);
    return r;
  }
  for (const m of plan.milestones) visit(m.id);
  return { ranks, deps };
}

// notOnRoadmap entries are history keys, or patterns with "*" that match a key
// or the commit subject ("dependabot/*", "chore*").
function notOnRoadmapMatcher(entries) {
  const literal = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const exact = new Set(entries.filter((e) => !e.includes('*')));
  const patterns = entries.filter((e) => e.includes('*'))
    .map((e) => new RegExp(`^${e.split('*').map(literal).join('.*')}$`));
  return (event) => event.keys.some((k) => exact.has(k) || patterns.some((p) => p.test(k)))
    || patterns.some((p) => p.test(event.subject));
}

// --- Git history ---------------------------------------------------------------

// Shortens a merge title for the page: no conventional-commit prefix
// ("feat(editor): "), nothing from a " (" on.
function tidy(text) {
  const t = text.replace(/^\w+(?:\([^)]*\))?!?:\s+/, '').split(/\s\(/)[0].trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// One event per merge or squash merge on the main branch, newest first.
function parseEvent(record) {
  const [hash, date, time, parents, subject, body = ''] = record.split('\x1f');
  const merge = parents.trim().split(' ').length > 1;
  const firstBodyLine = body.trim().split('\n')[0] || '';
  let keys = [];
  let text = subject;
  let match;
  if (merge && (match = /^Merge pull request #(\d+) from [^/\s]+\/(\S+)/.exec(subject))) {
    keys = [`#${match[1]}`, match[2]];
    text = firstBodyLine || match[2];
  } else if (merge && (match = /^Merge (?:remote-tracking )?branch '([^']+)'/.exec(subject))) {
    keys = [match[1]];
    text = firstBodyLine || match[1];
  } else if (merge && (match = /^Merge (\S+)(?:\s+--\s+(.*))?/.exec(subject))) {
    keys = [match[1]];
    text = match[2] || firstBodyLine || match[1];
  } else if (!merge && (match = /^(.*\S)\s*\(#(\d+)\)\s*$/.exec(subject))) {
    keys = [`#${match[2]}`];
    text = match[1];
  } else {
    return null;
  }
  return { hash, date, time: Number(time), keys, key: keys[0], subject, text: tidy(text) };
}

function readHistory(plan) {
  // A shallow clone (CI default) has no history to compare against.
  if (tryGit(['rev-parse', '--is-shallow-repository']) !== 'false') return null;
  const ref = tryGit(['rev-parse', '--verify', '--quiet', plan.mainBranch]) ? plan.mainBranch : 'HEAD';
  const log = tryGit(['log', '--first-parent', ref, '--format=%h%x1f%ad%x1f%ct%x1f%P%x1f%s%x1f%b%x1e', '--date=short']);
  if (log === null) return null;
  const events = log.split('\x1e').map((r) => r.replace(/^\n/, '')).filter(Boolean).map(parseEvent).filter(Boolean);
  const head = tryGit(['log', '-1', '--format=%h%x1f%ad', '--date=short', 'HEAD']);
  const [headHash, headDate] = head ? head.split('\x1f') : [null, null];
  // File times come from this checkout: an uncommitted edit counts as now.
  const now = Math.floor(Date.now() / 1000);
  const lastChange = (path) => (tryGit(['status', '--porcelain', '--', path])
    ? now
    : Number(tryGit(['log', '-1', '--format=%ct', 'HEAD', '--', path]) || 0));
  return {
    ref, events,
    head: { hash: headHash, date: headDate, branch: tryGit(['rev-parse', '--abbrev-ref', 'HEAD']) },
    planTime: lastChange(PLAN_REL),
    planBorn: Number(tryGit(['log', '--diff-filter=A', '--format=%ct', '-1', 'HEAD', '--', PLAN_REL]) || now),
    watched: (plan.watch ?? []).map((path) => ({ path, time: lastChange(path) })),
  };
}

// --- Build -----------------------------------------------------------------------

const plan = loadPlan();
if (plan && !errors.length) {
  const { ranks, deps } = rank(plan);
  const history = noGit ? null : readHistory(plan);
  if (noGit) say('roadmap: --no-git: past dates and freshness left out');
  else if (!history) warnings.push('no git history (not a repository, or a shallow clone); past dates and freshness skipped');

  const noEvidence = [];
  const milestones = plan.milestones.map((m) => {
    let date = null;
    let status = m.status;
    if (history && m.merge) {
      const dates = m.merge.map((key) => history.events.find((e) => e.keys.includes(key))?.date).filter(Boolean);
      if (dates.length === m.merge.length && status !== 'done') {
        status = 'done';
        warnings.push(`milestone "${m.id}" is merged (${m.merge.join(', ')}) -- set its status to "done" in ${PLAN_REL}`);
      } else if (dates.length < m.merge.length && status === 'done') {
        noEvidence.push(m.id);
        warnings.push(`milestone "${m.id}": no merge of ${m.merge.join(' / ')} on ${history.ref} yet`);
      }
      if (status === 'done') date = dates.sort().pop() ?? null;
    } else if (history && m.commit) {
      date = tryGit(['show', '-s', '--format=%ad', '--date=short', m.commit]);
      if (!date) {
        noEvidence.push(m.id);
        warnings.push(`milestone "${m.id}": commit ${m.commit} not found`);
      }
    } else if (history && m.status === 'done') {
      noEvidence.push(m.id);
      warnings.push(`milestone "${m.id}" is done but names no merge or commit`);
    }
    return { ...m, status, rank: ranks.get(m.id), deps: deps.get(m.id), date };
  });

  let freshness = { unmapped: [], watchNewer: [], noEvidence };
  if (history) {
    const mergeKeys = new Set(plan.milestones.flatMap((m) => m.merge ?? []));
    const notOnRoadmap = notOnRoadmapMatcher(plan.notOnRoadmap ?? []);
    // An unnamed merge is stale only if it came after the plan file was added;
    // older merges are history the plan chose to leave out.
    freshness = {
      unmapped: history.events
        .filter((e) => e.time > history.planBorn && !e.keys.some((k) => mergeKeys.has(k)) && !notOnRoadmap(e))
        .map((e) => ({ hash: e.hash, date: e.date, key: e.key, text: e.text })),
      watchNewer: history.watched.filter((w) => w.time > history.planTime).map((w) => w.path),
      noEvidence,
    };
    for (const e of freshness.unmapped) warnings.push(`merge ${e.hash} (${e.key}) is not named by any milestone or notOnRoadmap -- update ${PLAN_REL}`);
    for (const path of freshness.watchNewer) warnings.push(`${path} changed after ${PLAN_REL} -- check that the roadmap still matches`);
  }

  const data = {
    project: plan.project,
    languages: plan.languages,
    mainBranch: plan.mainBranch,
    generatedFrom: history ? history.head : null,
    trunk: plan.trunk,
    tracks: plan.tracks,
    milestones,
    waiting: plan.waiting ?? [],
    recent: history ? history.events.slice(0, RECENT).map(({ subject, ...e }) => ({
      ...e, milestones: plan.milestones.filter((m) => (m.merge ?? []).some((k) => e.keys.includes(k))).map((m) => m.id),
    })) : [],
    freshness,
  };

  if (errors.length) {
    // A loop in "after" is found while ranking: nothing is valid to write.
  } else if (!check) {
    const outOption = option('--out') ? resolve(option('--out')) : process.env.ROADMAP_OUT || plan.output;
    const outDir = outOption ? (isAbsolute(outOption) ? outOption : resolve(ROOT, outOption)) : null;
    if (!outDir || !existsSync(outDir)) {
      warnings.push(`page folder ${outDir ?? '(no "output" in the plan)'} not found; nothing written`);
    } else {
      const file = join(outDir, 'roadmap-data.js');
      const text = `/* Generated by the live-roadmap builder from ${PLAN_REL} and git. Do not edit. */\n`
        + `window.LIVE_ROADMAP = ${JSON.stringify(data, null, 2)};\n`;
      const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
      if (old !== text) writeFileSync(file, text);
      say(`roadmap: ${milestones.length} milestones, ${plan.tracks.length} tracks -> ${file}${old === text ? ' (unchanged)' : ''}`);
    }
  } else {
    say(`roadmap: ${PLAN_REL} is valid (${milestones.length} milestones, ${plan.tracks.length} tracks)`);
  }
}

for (const w of warnings) console.log(`roadmap: WARNING ${w}`);
for (const e of errors) console.error(`roadmap: ERROR ${e}`);
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
