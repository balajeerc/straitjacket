#!/usr/bin/env bash
# PostToolUse hook: format and autofix a file the moment it is written.
#
# Why at edit time rather than at the end: `aube run check` reports mechanical
# problems only once the whole task is done, by which point the fix is a diff
# across many files and competes for attention with real findings. Fixing
# formatting and autofixable lint here keeps `aube run check`'s output about
# things that need judgement.
#
# Calls the binaries in `node_modules/.bin` directly, never through a package
# manager. A package manager's `exec` may decide the tree is stale and install
# before running — from a hook that fires on every edit, with no one watching,
# and possibly mid-change while the lockfile or its guards are being edited.
# If the tree is missing, the hook does nothing.
#
# Exit 0 always. This hook tidies; it is not a gate. `aube run check` is the gate.
set -uo pipefail

file_path=$(jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0
[ -f "$file_path" ] || exit 0

case "$file_path" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs | *.json | *.md | *.yml | *.yaml) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
bin="$CLAUDE_PROJECT_DIR/node_modules/.bin"

case "$file_path" in
  *.ts | *.tsx | *.js | *.mjs | *.cjs)
    [ -x "$bin/oxlint" ] && "$bin/oxlint" --fix "$file_path" >/dev/null 2>&1
    ;;
esac

[ -x "$bin/prettier" ] && "$bin/prettier" --write --log-level error "$file_path" >/dev/null 2>&1

exit 0
