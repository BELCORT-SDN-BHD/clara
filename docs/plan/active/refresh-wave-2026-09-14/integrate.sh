# usage: integrate.sh <integration-branch> <branch1> <branch2> ...
# Creates/updates an integration branch from origin/main and rebases each worker branch onto it in order
# (each worker branch is rebased onto the integration tip, then the integration branch fast-forwards to it).
# Stops at the first conflict and prints the state; resolve in the integration worktree, `git rebase --continue`, re-run.
set -e
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
INT="$1"; shift
WT=/c/Users/zhant/Desktop/clara-wt/integration
cd /c/Users/zhant/Desktop/clara-rebuild
git fetch -q origin main
if [ ! -d "$WT" ]; then
  git worktree add "$WT" -b "$INT" origin/main
else
  cd "$WT"; git checkout -q "$INT" 2>/dev/null || git checkout -q -b "$INT" origin/main
fi
cd "$WT"
for B in "$@"; do
  echo "=== rebasing $B onto $INT ($(git rev-parse --short HEAD)) ==="
  git checkout -q -B "int-tmp-$B" "$B"
  if ! git rebase -q "$INT"; then
    echo "!!! conflict rebasing $B onto $INT — resolve in $WT then: git rebase --continue; git checkout $INT; git merge --ff-only int-tmp-$B"
    exit 2
  fi
  git checkout -q "$INT"
  git merge -q --ff-only "int-tmp-$B"
  git branch -q -D "int-tmp-$B"
  echo "    -> $INT at $(git rev-parse --short HEAD)"
done
echo "--- migrations on $INT beyond origin/main ---"
git diff --name-only origin/main -- packages/db/migrations | sort
echo "--- commits ---"
git log --oneline origin/main..HEAD | wc -l
