#!/bin/bash
# Factory reset, steps 5 to 8: the chain from empty, storage re-provision, the three login passwords,
# the DevKit schema, the post reads. Runs OUTSIDE the pipe; it invokes via-probe.sh per step.
#   PROBE=<id> bash rebuild-reset.sh
set -u
export PATH="/c/Users/zhant/.fly/bin:/c/Users/zhant/AppData/Local/pnpm:$PATH"
SC="C:/Users/zhant/AppData/Local/Temp/claude/C--Users-zhant-Desktop-clara-rebuild/2d0e3faa-4367-4726-8208-67089ecdd96a/scratchpad"
R="$SC/reset"; V="$SC/release-wS/via-probe.sh"; PROBE="${PROBE:?}"
REPO=/c/Users/zhant/Desktop/clara-wt/int2
cd "$REPO" || exit 1
date -u +"5 migrate start %H:%M:%SZ"; PROBE=$PROBE bash "$V" node packages/db/scripts/migrate.mjs > "$R/migrate.log" 2>&1; echo "migrate exit=$?"; date -u +"5 migrate end %H:%M:%SZ"
grep -E "^migrate:|FAIL|rolled back|CLR10|ERROR" "$R/migrate.log" | cut -c1-200 | head -8
grep -q "migrate: 337 new migration(s) applied · 337 total" "$R/migrate.log" || { echo "CHAIN DID NOT REACH 337, stop here and read migrate.log"; exit 5; }
echo "== 5b the storage role back under its own name (it was parked as zz_storage_docs_parked so 0154's census read 14; its grants, memberships and six policies followed it by OID) =="
cat > "$REPO/reprov.tmp.mjs" <<'EOF'
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
try { await c.query("alter role zz_storage_docs_parked rename to clara_storage_docs"); console.log("renamed back"); } catch (e) { console.log("RENAME BACK FAILED", e.code, e.message.slice(0, 160)); process.exitCode = 6; }
const r = await c.query("select (select count(*) from pg_roles where rolname like 'clara%') roles, (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and 'clara_storage_docs' = any(roles::text[])) policies, (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee='clara_storage_docs' and table_schema='storage' and table_name='objects') grants, (select count(*) from pg_auth_members am join pg_roles m on m.oid=am.member join pg_roles g on g.oid=am.roleid where g.rolname='clara_storage_docs' and m.rolname='authenticator') auth_member");
console.log("roles (expect 21)", r.rows[0].roles, "| storage policies naming clara_storage_docs (expect 6)", r.rows[0].policies, "| its storage.objects grants", r.rows[0].grants, "| authenticator member (expect 1)", r.rows[0].auth_member);
await c.end();
EOF
PROBE=$PROBE bash "$V" node reprov.tmp.mjs 2>&1 | grep -vi "postgres://"; rm -f "$REPO/reprov.tmp.mjs"
echo "== 6 the three login passwords, from the DSNs the runtime holds (never printed) =="
LANE_DSNS="$(fly ssh console --app clara-runtime --machine "$PROBE" -C "sh -c 'printenv CLARA_AUTH_WALL_DATABASE_URL; printenv CLARA_INVITE_PREVIEW_DATABASE_URL; printenv CLARA_STRIPE_WEBHOOK_DATABASE_URL'" 2>/dev/null | tr -d '\r')"
cp "$R/pwreset.mjs" "$REPO/pwreset.tmp.mjs"; LANE_DSNS="$LANE_DSNS" PROBE=$PROBE bash "$V" node pwreset.tmp.mjs 2>&1 | grep -vi "postgres://"; rm -f "$REPO/pwreset.tmp.mjs"; unset LANE_DSNS
echo "== 7 Workflow DevKit schema (bootstrap) =="
PROBE=$PROBE bash "$V" sh -c 'WORKFLOW_POSTGRES_URL="$DATABASE_URL" pnpm --filter @clara/runtime exec bootstrap' 2>&1 | grep -vi "postgres://" | tail -5
cat > "$REPO/wf.tmp.mjs" <<'EOF'
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL}); await c.connect();
const r = await c.query("select string_agg(nspname, ', ' order by nspname) s from pg_namespace where nspname in ('clara','graphile_worker','workflow','workflow_drizzle')");
const t = await c.query("select to_regclass('workflow.workflow_runs') is not null as runs");
console.log("schemas:", r.rows[0].s, "| workflow.workflow_runs present:", t.rows[0].runs); await c.end();
EOF
PROBE=$PROBE bash "$V" node wf.tmp.mjs 2>&1 | grep -vi "postgres://"; rm -f "$REPO/wf.tmp.mjs"
echo "== 8 post reads: counts (expect 0 everywhere) and the fingerprint against the release's upgraded baseline =="
cp "$R/reads-reset.mjs" "$REPO/reads-reset.tmp.mjs"; PROBE=$PROBE bash "$V" node reads-reset.tmp.mjs 2>&1 | tee "$R/reads-post-counts.log" | grep -vi "postgres://" | cut -c1-160; rm -f "$REPO/reads-reset.tmp.mjs"
PROBE=$PROBE bash "$V" node docs/plan/active/riders-2026-09-20/ceremony-wS/reads-wS.mjs --post --prod --no-state --frontier-before 0323_trade_invoice_probe_self_exclusion --baseline "$SC/wS/fp-wS-upg.json" > "$R/reads-post-fp.log" 2>&1; echo "fingerprint exit=$?"; grep -E "== ledger|keys compared|verdict|STOP|differ" "$R/reads-post-fp.log" | cut -c1-160 | head -8
echo "== REBUILD DONE; next: start-reset.sh (destroy probe, start machine, boot lines, smoke) =="
