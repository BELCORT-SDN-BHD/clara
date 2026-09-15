# usage: mkwt.sh <ticket> <slug>  — create worktree C:/Users/zhant/Desktop/clara-wt/<ticket> on branch impl/<ticket>-<slug> from main, install deps
set -e
T="$1"; S="$2"
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
cd /c/Users/zhant/Desktop/clara-rebuild
mkdir -p /c/Users/zhant/Desktop/clara-wt
git worktree add "/c/Users/zhant/Desktop/clara-wt/$T" -b "impl/$T-$S" main
cd "/c/Users/zhant/Desktop/clara-wt/$T"
CI=true pnpm install --frozen-lockfile --prefer-offline 2>&1 | tail -3
echo "worktree ready: /c/Users/zhant/Desktop/clara-wt/$T on impl/$T-$S at $(git rev-parse --short HEAD)"
