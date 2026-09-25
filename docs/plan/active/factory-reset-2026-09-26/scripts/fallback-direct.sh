#!/bin/bash
# FALLBACK, run only on the owner's yes: point the runtime's eight database DSN secrets at the direct
# database host (db.<ref>.supabase.co, IPv6, TLS verified against the same pinned CA) instead of the
# shared pooler, stage them, and apply by re-deploying the SAME image digest. Values never printed.
#   PROBE=<sleeping probe id> DIGEST=<current image digest> bash fallback-direct.sh [stage|apply]
set -u
export PATH="/c/Users/zhant/.fly/bin:/c/Users/zhant/AppData/Local/pnpm:$PATH"
MODE="${1:-stage}"; PROBE="${PROBE:?}"; M=48ee715b763048
NAMES="CLARA_AUTH_WALL_DATABASE_URL CLARA_FREEFORM_DATABASE_URL CLARA_INVITE_PREVIEW_DATABASE_URL CLARA_READ_DATABASE_URL CLARA_RUNTIME_DATABASE_URL CLARA_STRIPE_WEBHOOK_DATABASE_URL CLARA_WRITE_DATABASE_URL WORKFLOW_POSTGRES_URL"
# 1. read the current values from the probe (in memory only) and rewrite host + username
PAIRS="$(fly ssh console --app clara-runtime --machine "$PROBE" -C "sh -c 'for n in $NAMES; do printf \"%s=%s\\n\" \"\$n\" \"\$(printenv \$n)\"; done'" 2>/dev/null | tr -d '\r')"
REWRITTEN="$(printf '%s\n' "$PAIRS" | node -e "
let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{ const out=[]; let ref=null;
 for (const line of s.split('\n')) { const i=line.indexOf('='); if(i<1) continue; const name=line.slice(0,i), dsn=line.slice(i+1); if(!dsn.startsWith('postgres')) continue;
  const u=new URL(dsn); const user=decodeURIComponent(u.username); const [role,r]=user.split('.'); if(r) ref=r; if(!ref) { console.error('no project ref in', name); process.exit(2); }
  u.username=encodeURIComponent(role); u.hostname='db.'+ref+'.supabase.co'; u.port='5432'; out.push(name+'='+u.toString()); }
 process.stdout.write(out.join('\n')+'\n'); });")"
COUNT=$(printf '%s\n' "$REWRITTEN" | grep -c '^[A-Z_]*=postgres')
echo "rewritten $COUNT of 8 DSNs to the direct host (usernames without the pooler's project suffix; sslmode/sslrootcert kept as they were)"
[ "$COUNT" -eq 8 ] || { echo "REFUSING: expected 8"; exit 3; }
# 2. prove each rewritten DSN logs in from this rig before staging anything
printf '%s\n' "$REWRITTEN" | node -e "
import('pg').then(async ({default: pg}) => { let s=''; process.stdin.on('data',d=>s+=d).on('end', async ()=>{ let ok=0; for (const line of s.split('\n')) { const i=line.indexOf('='); if(i<1) continue; const name=line.slice(0,i), dsn=line.slice(i+1); const u=new URL(dsn); u.searchParams.delete('sslrootcert'); u.searchParams.set('sslmode','verify-full'); const c=new pg.Client({connectionString:u.toString(), connectionTimeoutMillis:15000}); try { await c.connect(); const r=await c.query('select current_user'); console.log('  ok', name.padEnd(36), r.rows[0].current_user); ok++; await c.end(); } catch(e) { console.log('  FAIL', name.padEnd(34), e.code||'', e.message.slice(0,60)); } } console.log('  logins ok:', ok, 'of 8'); if (ok!==8) process.exit(4); }); });" || { echo "REFUSING: not every direct login works"; exit 4; }
[ "$MODE" = "apply" ] || { echo "STAGE-CHECK ONLY: nothing staged"; exit 0; }
# 3. stage the secrets (stdin, never argv), then apply by re-deploying the same digest
printf '%s\n' "$REWRITTEN" | fly secrets import --app clara-runtime --stage 2>&1 | tail -2
DIGEST="${DIGEST:?}"
fly deploy --config packages/runtime/fly.toml --image "registry.fly.io/clara-runtime@sha256:$DIGEST" 2>&1 | grep -E "Updating|stopped|started|Finished|error|Error" | tail -4
fly machine start "$M" --app clara-runtime 2>&1 | tail -1
for i in $(seq 1 24); do C=$(curl -s -m 8 -o /dev/null -w '%{http_code}' https://clara-runtime.fly.dev/ready); date -u +"   /ready $C %H:%M:%SZ"; [ "$C" = "200" ] && break; sleep 5; done
fly logs --app clara-runtime --machine "$M" --no-tail 2>/dev/null | sed 's/^.*\] //' | grep -E "serving git_sha|stranded bodies|durable world started|CONTROL listening|LEADER acquired|FAIL|FATAL|ECIRCUIT|EAUTH" | tail -8 | cut -c1-200
