#!/bin/bash
# usage: build-rig.sh <ticket> <port>  — install deps in the worktree, migrate + seed its cluster, smoke it. Log to scratch rig/<n>.log
set -u
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
n=$1; port=$2
WT=/c/Users/zhant/Desktop/clara-wt/$n
LOG="$3/$n.log"
{
  echo "== $(date -u +%FT%TZ) install in $WT (node $(node --version))"
  cd "$WT" || { echo "no worktree"; exit 1; }
  t0=$(date +%s)
  CI=true pnpm install --frozen-lockfile --prefer-offline > "$3/$n.install.log" 2>&1
  echo "install exit $? in $(( $(date +%s) - t0 ))s"
  export PGHOST=127.0.0.1 PGPORT=$port PGUSER=postgres PGDATABASE=clara_$n CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1
  echo "== $(date -u +%FT%TZ) migrate"
  pnpm db:migrate > "$3/$n.migrate.log" 2>&1; echo "migrate exit $?"; tail -2 "$3/$n.migrate.log"
  echo "== $(date -u +%FT%TZ) seed"
  pnpm db:seed > "$3/$n.seed.log" 2>&1; echo "seed exit $?"; tail -2 "$3/$n.seed.log"
  echo "== smoke"
  (cd packages/db && node -e "const {Client}=require('pg');(async()=>{const c=new Client({host:'127.0.0.1',port:$port,user:'postgres',database:'clara_$n'});await c.connect();const r=await c.query('select count(*)::int as n, max(version) as last from clara.schema_migrations');const v=await c.query('show server_version');console.log('migrations',r.rows[0].n,'last',r.rows[0].last,'pg',v.rows[0].server_version);await c.end();})().catch(e=>{console.error('SMOKE FAIL',e.message);process.exit(1)})")
  echo "== $(date -u +%FT%TZ) done; HEAD $(git rev-parse --short HEAD) branch $(git branch --show-current)"
} > "$LOG" 2>&1
