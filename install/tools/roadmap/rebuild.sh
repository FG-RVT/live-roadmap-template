#!/bin/sh
# Rebuilds the live roadmap page's data (roadmap plan + git history) from a git
# hook. Never blocks or fails the git command it runs after.
#   sh tools/roadmap/rebuild.sh <hook name> [the hook's arguments]
case "$1" in
  post-checkout) [ "$4" = 1 ] || exit 0 ;;    # branch switches, not file checkouts
  post-rewrite) [ "$2" = rebase ] || exit 0 ;; # an amend already ran post-commit
esac
if ! command -v node >/dev/null 2>&1; then
  echo "roadmap: Node.js 18+ not found; the roadmap page was not rebuilt" >&2
  exit 0
fi
node tools/roadmap/build.mjs --quiet || echo "roadmap: build failed; git is not affected" >&2
exit 0
