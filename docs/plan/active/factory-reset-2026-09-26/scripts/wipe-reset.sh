#!/bin/bash
# Factory reset wipe (runbook step 3 = check, step 4 = apply). Runs as the child of via-probe.sh
# (DATABASE_URL and PG* in env from the probe's DSN; never printed). usage:
#   PROBE=<id> via-probe.sh bash wipe-reset.sh check|apply
set -u
MODE="${1:?check|apply}"
REPO=/c/Users/zhant/Desktop/clara-wt/int2
cd "$REPO" || exit 1
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
# the destructive guard wants user@host:port/db, derived here from the DSN, never echoed
export CLARA_DESTRUCTIVE_TARGET="$(node -e "const u=new URL(process.env.DATABASE_URL); console.log(decodeURIComponent(u.username)+'@'+u.hostname+':'+(u.port||'5432')+u.pathname)")"
export CLARA_ALLOW_DESTRUCTIVE=1
q() { node -e "
import('file:///C:/Users/zhant/Desktop/clara-wt/int2/packages/db/lib/pg.mjs').then(async (m) => {
  const c = m.makeClient(); await c.connect();
  try { const r = await c.query(process.argv[1]); console.log((r.rows[0] && Object.values(r.rows[0]).join('  ')) || ('rows=' + r.rowCount)); }
  catch (e) { console.log('ERR', e.code, e.message.slice(0, 120)); process.exitCode = 3; }
  await c.end();
});" "$1"; }
echo "== target resolved: $(echo "$CLARA_DESTRUCTIVE_TARGET" | sed -E 's/^([^@]+)@([^:]+).*/\1@\2.../')"
echo "== ledger: $(q "select count(*)::int || ' / ' || max(version) from clara.schema_migrations")"
echo "== auth rows: $(q "select (select count(*) from auth.users) || ' users, ' || (select count(*) from auth.identities) || ' identities, ' || (select count(*) from auth.sessions) || ' sessions'")"
echo "== storage.objects delete privilege (postgres): $(q "select has_table_privilege('postgres','storage.objects','DELETE')")"
echo "== role-census-reset --check =="; node packages/db/scripts/role-census-reset.mjs 2>&1 | grep -vi "postgres://" | tail -6
if [ "$MODE" != "apply" ]; then echo "== CHECK ONLY: nothing changed =="; exit 0; fi
echo; echo "== 4a auth wipe =="; q "delete from auth.sessions"; q "delete from auth.identities"; q "delete from auth.users"; echo "   remaining: $(q "select count(*) from auth.users")"
echo "== 4b drop schema clara (reset.mjs, guarded) =="; node packages/db/scripts/reset.mjs 2>&1 | grep -vi "postgres://" | tail -5
echo "   clara present: $(q "select count(*) from pg_namespace where nspname='clara'")"
echo "== 4c drop the runtime schemas =="; q "drop schema if exists workflow cascade"; q "drop schema if exists workflow_drizzle cascade"; q "drop schema if exists graphile_worker cascade"
echo "   schemas left: $(q "select string_agg(nspname, ', ' order by nspname) from pg_namespace where nspname in ('clara','graphile_worker','workflow','workflow_drizzle')")"
echo "== 4d storage.objects rows (firm-docs) =="; q "delete from storage.objects where bucket_id = 'firm-docs'"; echo "   remaining: $(q "select count(*) from storage.objects")"
echo "== 4e clara_storage_docs first (deploy-provisioned, never chain-minted; 0154 pins the count at 14 without it; its six policies are re-created after the chain from storage-policies-hosted.sql) =="; q "drop owned by clara_storage_docs"; q "drop role clara_storage_docs"
echo "   storage policies left (expect 0): $(q "select count(*) from pg_policies where schemaname='storage' and tablename='objects'")"
echo "== 4f role-census-reset --apply (the six post-0154 roles; their deps were inside clara) =="; node packages/db/scripts/role-census-reset.mjs --apply 2>&1 | grep -vi "postgres://" | tail -6
echo "   clara% roles now (expect 14): $(q "select count(*) from pg_roles where rolname like 'clara%'")"
echo "== WIPE DONE; next: migrate.mjs (step 5) =="
