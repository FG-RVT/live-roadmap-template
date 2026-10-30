#!/bin/sh
# Every hook in a local install's private hooks folder calls this (see
# hooks.mjs). It runs the project's own hook of the same name first, from the
# folder git used before, then rebuilds the roadmap after commits, merges,
# rebases and branch switches. The project's hook decides the outcome, so a
# failing pre-commit still stops the commit.
#   sh <this folder>/hook.sh <hook name> [the hook's arguments]
name="$1"
shift
here="$(dirname "$0")"
chain="$(cat "$here/../../hooks/chain" 2>/dev/null)"
status=0
if [ -n "$chain" ] && [ -x "$chain/$name" ]; then
  "$chain/$name" "$@"
  status=$?
fi
case "$name" in
  post-commit|post-merge|post-checkout|post-rewrite) sh "$here/rebuild.sh" "$name" "$@" ;;
esac
exit $status
