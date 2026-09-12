#!/usr/bin/env bash
# Pack this checkout's untracked secrets (.env* files plus .claude/settings.local.json) into one
# archive so the owner can carry them to another machine. Never prints file CONTENTS — only the
# list of what it's archiving. See docs/agents/fresh-machine.md section f.
#
# Usage: scripts/dev/pack-secrets.sh [output.tgz]
#   output.tgz defaults to ../clara-dev-secrets-<YYYYMMDD>.tgz (one level above the repo root).
#   Refuses to write inside the repo — secrets must never land somewhere `git add` could reach.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "pack-secrets: not inside a git repository" >&2
  exit 1
}
cd "$repo_root"

out=${1:-"../clara-dev-secrets-$(date +%Y%m%d).tgz"}

# Resolve to an absolute path without requiring the target to exist yet.
out_dir=$(dirname -- "$out")
out_base=$(basename -- "$out")
mkdir -p -- "$out_dir"
out_abs="$(cd -- "$out_dir" && pwd)/$out_base"
repo_abs="$(pwd)"

case "$out_abs" in
  "$repo_abs"|"$repo_abs"/*)
    echo "pack-secrets: refusing to write inside the repo ($out_abs is under $repo_abs)" >&2
    exit 1
    ;;
esac

# Every untracked .env* file (git ls-files --others is NOT enough: .env* is gitignored, so
# "untracked" here means "on disk, not the example, not in node_modules" rather than
# "unknown to git"), plus the one machine-local Claude Code settings file worth carrying.
tmp_list=$(mktemp)
trap 'rm -f "$tmp_list"' EXIT

find . -name ".env*" -not -name ".env.example" -not -path "*/node_modules/*" -type f \
  | sed 's#^\./##' >>"$tmp_list"

if [ -f .claude/settings.local.json ]; then
  echo ".claude/settings.local.json" >>"$tmp_list"
fi

if [ ! -s "$tmp_list" ]; then
  echo "pack-secrets: no untracked .env* files or .claude/settings.local.json found — nothing to pack" >&2
  exit 1
fi

echo "pack-secrets: archiving these files (names only; contents are never printed):"
sed 's/^/  /' "$tmp_list"

tar -czf "$out_abs" -C "$repo_abs" -T "$tmp_list"

echo "pack-secrets: wrote $out_abs"
