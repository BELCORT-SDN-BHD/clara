#!/bin/bash
set -u; cd /c/Users/zhant/Desktop/clara-wt/int2 || exit 1
export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"
export CLARA_DESTRUCTIVE_TARGET="$(node -e "const u=new URL(process.env.DATABASE_URL); console.log(decodeURIComponent(u.username)+'@'+u.hostname+':'+(u.port||'5432')+u.pathname)")"
export CLARA_ALLOW_DESTRUCTIVE=1
node packages/db/scripts/role-census-reset.mjs --apply 2>&1 | tail -9
node -e "import('file:///C:/Users/zhant/Desktop/clara-wt/int2/packages/db/lib/pg.mjs').then(async (m) => { const c = m.makeClient(); await c.connect(); const r = await c.query(\"select count(*)::int n, string_agg(rolname, ' ' order by rolname) r from pg_roles where rolname like 'clara%'\"); console.log('clara% roles now (expect 14):', r.rows[0].n); console.log(r.rows[0].r); await c.end(); })"
