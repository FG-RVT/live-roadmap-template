// Live roadmap: git hooks for a local install.
//
// A local install keeps the roadmap out of the repository, so it may not add to
// the project's committed hooks. It gets a private hooks folder instead
// (<install>/hooks, e.g. .roadmap/hooks) that git uses through core.hooksPath in
// this clone's own settings, which are never pushed. Every hook there runs the
// project's own hook of that name first, from the folder git used before, and
// after commits, merges, rebases and branch switches also rebuilds the roadmap
// (hook.sh). The project's hooks keep deciding: a failing pre-commit still
// stops the commit.
//
//   node .roadmap/tools/roadmap/hooks.mjs install     set up, or repair after a
//                                                     hook manager took over
//   node .roadmap/tools/roadmap/hooks.mjs status      are the roadmap's hooks active?
//   node .roadmap/tools/roadmap/hooks.mjs uninstall   give git its previous hooks back
//
// Needs Node 18+ and git. No dependencies.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The hooks git runs on a developer's machine (the set Husky wires up too).
const HOOKS = [
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit',
  'prepare-commit-msg', 'commit-msg', 'post-commit', 'pre-rebase', 'post-checkout',
  'post-merge', 'pre-push', 'pre-auto-gc', 'post-rewrite',
];
const REBUILDS = ['post-commit', 'post-merge', 'post-checkout', 'post-rewrite'];

const TOOLS = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = resolve(TOOLS, '../../hooks');
// chain: the folder git used before (the project's own hooks).
// setting: this clone's core.hooksPath before the install, if it had one.
const CHAIN = resolve(HOOKS_DIR, 'chain');
const SETTING = resolve(HOOKS_DIR, 'setting');

function git(root, ...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const norm = (path) => {
  const p = path.replace(/\\/g, '/').replace(/\/$/, '');
  return process.platform === 'win32' ? p.toLowerCase() : p;
};
const rel = (root, path) => relative(root, path).replace(/\\/g, '/') || '.';
const isOurs = (file) => existsSync(file) && readFileSync(file, 'utf8').includes('hook.sh');

// Null when this is no local install with its own hooks, or they are active;
// otherwise what is wrong, for the builder's warnings.
export function localHooksProblem(root) {
  if (!existsSync(CHAIN)) return null;
  const used = git(root, 'rev-parse', '--git-path', 'hooks');
  if (!used || norm(resolve(root, used)) !== norm(HOOKS_DIR)) {
    return `git runs its hooks from ${used ?? '?'} instead of ${rel(root, HOOKS_DIR)}, so the roadmap is not rebuilt (a hook manager may have reinstalled its own)`;
  }
  const missing = REBUILDS.filter((name) => !isOurs(resolve(HOOKS_DIR, name)));
  if (missing.length) return `the ${missing.join(', ')} hook(s) in ${rel(root, HOOKS_DIR)} no longer rebuild the roadmap`;
  return null;
}

function install(root) {
  const used = git(root, 'rev-parse', '--git-path', 'hooks');
  mkdirSync(HOOKS_DIR, { recursive: true });
  if (norm(resolve(root, used)) !== norm(HOOKS_DIR)) {
    writeFileSync(CHAIN, `${used}\n`);
    const setting = git(root, 'config', '--local', 'core.hooksPath');
    if (setting) writeFileSync(SETTING, `${setting}\n`);
    else rmSync(SETTING, { force: true });
  } else if (!existsSync(CHAIN)) {
    writeFileSync(CHAIN, `${rel(root, resolve(root, git(root, 'rev-parse', '--git-common-dir'), 'hooks'))}\n`);
  }
  const script = rel(root, resolve(TOOLS, 'hook.sh'));
  for (const name of HOOKS) {
    writeFileSync(resolve(HOOKS_DIR, name), `#!/bin/sh\nexec sh "${script}" ${name} "$@"\n`, { mode: 0o755 });
  }
  git(root, 'config', '--local', 'core.hooksPath', rel(root, HOOKS_DIR));
  const chain = readFileSync(CHAIN, 'utf8').trim();
  console.log(`roadmap: hooks active in ${rel(root, HOOKS_DIR)}; the project's own hooks still run from ${chain}`);
}

function uninstall(root) {
  const setting = existsSync(SETTING) ? readFileSync(SETTING, 'utf8').trim() : null;
  if (norm(resolve(root, git(root, 'rev-parse', '--git-path', 'hooks'))) === norm(HOOKS_DIR)) {
    if (setting) git(root, 'config', '--local', 'core.hooksPath', setting);
    else git(root, 'config', '--local', '--unset', 'core.hooksPath');
  }
  rmSync(HOOKS_DIR, { recursive: true, force: true });
  console.log(`roadmap: hooks removed; git runs its hooks from ${git(root, 'rev-parse', '--git-path', 'hooks')} again`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = git(process.cwd(), 'rev-parse', '--show-toplevel');
  if (!root) {
    console.error('roadmap: ERROR not inside a git repository');
    process.exit(1);
  }
  const command = process.argv[2];
  if (command === 'install') install(root);
  else if (command === 'uninstall') uninstall(root);
  else if (command === 'status') {
    const problem = existsSync(CHAIN) ? localHooksProblem(root) : 'not installed';
    console.log(problem ? `roadmap: hooks NOT active: ${problem}` : 'roadmap: hooks active');
    process.exit(problem ? 1 : 0);
  } else {
    console.error('usage: node hooks.mjs install | status | uninstall');
    process.exit(1);
  }
}
