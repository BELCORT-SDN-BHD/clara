// Reset — drops the `clara` schema (schema_migrations + app tables).
//
// GUARDED (findings 5): destructive, so it refuses unless CLARA_ALLOW_DESTRUCTIVE=1
// AND the target is disposable (ephemeral pattern) or explicitly named via
// CLARA_DESTRUCTIVE_TARGET (see lib/guard.mjs).
//
// `DROP SCHEMA clara CASCADE` also drops objects in OTHER schemas that depend on
// clara (cross-schema views, foreign keys) — so the "only touches clara" claim is
// only true when nothing outside clara depends on it. We PREFLIGHT pg_depend for
// such cross-schema dependents and ABORT if any exist, rather than silently
// cascading beyond clara. On the shared project the Slice-0 spike's
// `workflow`/`graphile_worker`/`spike` schemas are independent of clara, so a
// clean reset stays scoped.
//
// Connection comes from the environment only (see lib/pg.mjs).

import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";

// Cross-schema dependents of clara objects that a CASCADE would also drop:
// foreign keys defined in another schema referencing a clara table, and
// views/matviews in another schema built on clara objects.
const CROSS_SCHEMA_DEPENDENTS = `
  with clara_rel as (
    select c.oid from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'clara'
  )
  select distinct kind, dep_schema, dep_object, detail from (
  -- foreign keys in other schemas pointing INTO clara
  select 'foreign-key' as kind,
         (select nspname from pg_namespace where oid = t.relnamespace) as dep_schema,
         t.relname as dep_object, con.conname as detail
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  where con.contype = 'f'
    and t.relnamespace <> 'clara'::regnamespace
    and con.confrelid in (select oid from clara_rel)
  union all
  -- views / matviews in other schemas depending on clara objects
  select 'view' as kind,
         dn.nspname as dep_schema, dc.relname as dep_object,
         'depends on clara object' as detail
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class dc on dc.oid = r.ev_class
  join pg_namespace dn on dn.oid = dc.relnamespace
  where d.deptype = 'n'
    and dn.nspname <> 'clara'
    and d.refobjid in (select oid from clara_rel)
  ) deps
  order by dep_schema, dep_object, kind
`;

export async function reset({ log = console.log } = {}) {
  assertDestructiveAllowed({ action: 'reset (drop schema "clara")' });

  const client = makeClient();
  await client.connect();
  try {
    // Preflight: refuse if the CASCADE would reach outside clara.
    const dep = await client.query(CROSS_SCHEMA_DEPENDENTS);
    if (dep.rows.length > 0) {
      const lines = dep.rows.map((r) => `    ${r.kind}: ${r.dep_schema}.${r.dep_object} (${r.detail})`);
      throw new Error(
        `refusing to DROP SCHEMA clara CASCADE — ${dep.rows.length} object(s) OUTSIDE clara depend on it and would also be dropped:\n${lines.join("\n")}\n  Resolve these cross-schema dependencies first; reset must stay scoped to clara.`,
      );
    }

    await client.query("drop schema if exists clara cascade;");
    log(`reset: dropped schema "clara" · target ${targetLabel()}`);
    return { ok: true };
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  reset().catch((err) => {
    console.error("reset: FAIL —", err.message);
    process.exit(1);
  });
}
