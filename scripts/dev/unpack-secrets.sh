#!/usr/bin/env bash
# Extract an archive made by scripts/dev/pack-secrets.sh into this checkout's repo root.
# Never prints file CONTENTS — only the list of what it's writing. See
# docs/agents/fresh-machine.md section f.
#
# Usage: scripts/dev/unpack-secrets.sh <archive.tgz> [--force]
#   Refuses to overwrite a file that already exists in the repo unless --force is given.
set -euo pipefail

archive=""
force=0
for arg in "$@"; do
  case "$arg" in
    --force) force=1 ;;
    *) archive="$arg" ;;
  esac
done

if [ -z "$archive" ]; then
  echo "unpack-secrets: usage: scripts/dev/unpack-secrets.sh <archive.tgz> [--force]" >&2
  exit 1
fi
if [ ! -f "$archive" ]; then
  echo "unpack-secrets: archive not found: $archive" >&2
  exit 1
fi
archive_abs="$(cd -- "$(dirname -- "$archive")" && pwd)/$(basename -- "$archive")"

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "unpack-secrets: not inside a git repository" >&2
  exit 1
}
cd "$repo_root"

tmp_list=$(mktemp)
trap 'rm -f "$tmp_list"' EXIT
tar -tzf "$archive_abs" >"$tmp_list"

if [ ! -s "$tmp_list" ]; then
  echo "unpack-secrets: archive is empty: $archive_abs" >&2
  exit 1
fi

if [ "$force" -ne 1 ]; then
  conflicts=$(mktemp)
  trap 'rm -f "$tmp_list" "$conflicts"' EXIT
  while IFS= read -r entry; do
    [ -e "$entry" ] && printf '%s\n' "$entry" >>"$conflicts"
  done <"$tmp_list"
  if [ -s "$conflicts" ]; then
    echo "unpack-secrets: refusing to overwrite existing files (pass --force to overwrite):" >&2
    sed 's/^/  /' "$conflicts" >&2
    exit 1
  fi
fi

echo "unpack-secrets: extracting these files into $repo_root (names only; contents are never printed):"
sed 's/^/  /' "$tmp_list"

tar -xzf "$archive_abs" -C "$repo_root"

echo "unpack-secrets: done"
