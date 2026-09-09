// OPERATION-CONTRACT CENSUS — THE CALLABLE SIDE, AND THE FRONTIER.
//
// Every routine in schema `clara`, its owner, its SECURITY DEFINER / search_path settings,
// its ACL per grantee and the SQLSTATE codes its own body raises — read from `pg_proc`,
// `pg_roles` and `aclexplode` on the CONNECTED database, never from a roster in this tree.
//
// The frontier is read from `clara.schema_migrations` — the LEDGER — and compared against the
// migration files on disk. A migration's own "I succeeded" text is never consulted: a green
// chain is not a landed frontier (packages/db/README.md).
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { readdirSync, existsSync } from "node:fs";
import { DEFAULT_MIGRATIONS_DIR, OWNER_ROLE, RAISE_RE } from "./scope.mjs";

const FUNCTIONS_SQL = `
  select p.oid::int8 as oid,
         p.proname,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_args,
         pg_catalog.pg_get_userbyid(p.proowner) as owner,
         p.prosecdef as security_definer,
         p.prokind::text as kind,
         p.proconfig::text[] as proconfig,
         p.proargnames::text[] as proargnames,
         p.proargmodes::text[] as proargmodes,
         p.pronargs as pronargs,
         p.pronargdefaults as pronargdefaults,
         p.prosrc as prosrc,
         (p.proacl is null
          or exists (select 1 from pg_catalog.aclexplode(p.proacl) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_execute,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'grantee', case when a.grantee = 0 then 'PUBLIC'
                                            else pg_catalog.pg_get_userbyid(a.grantee) end,
                            'privilege', a.privilege_type)
                          order by case when a.grantee = 0 then 'PUBLIC'
                                        else pg_catalog.pg_get_userbyid(a.grantee) end,
                                   a.privilege_type)
                     from pg_catalog.aclexplode(p.proacl) a), '[]'::jsonb) as acl
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara'`;

const GRANTS_SQL = `
  select p.oid::int8 as oid, r.rolname
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   cross join (select rolname from pg_catalog.pg_roles where rolname like 'clara\\_%') r
   where n.nspname = 'clara'
     and pg_catalog.has_function_privilege(r.rolname, p.oid, 'execute')`;

const POLICY_HELPERS_SQL = `
  select distinct (regexp_matches(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                                  'clara\\.([a-z_][a-z0-9_]*)', 'g'))[1] as fn
    from pg_catalog.pg_policies where schemaname = 'clara'`;

/** Input (IN/INOUT/VARIADIC) argument names, in declaration order. */
function inputArgNames(fn) {
  const names = fn.proargnames || [];
  const modes = fn.proargmodes || null;
  if (!modes) return names.slice(0, fn.pronargs);
  const out = [];
  for (let i = 0; i < names.length; i += 1) if (["i", "b", "v"].includes(modes[i])) out.push(names[i]);
  return out;
}

function raisedCodes(prosrc) {
  const codes = new Set();
  if (!prosrc) return [];
  RAISE_RE.lastIndex = 0;
  let m;
  while ((m = RAISE_RE.exec(prosrc)) !== null) codes.add(m[3].toUpperCase());
  return [...codes].sort();
}

function searchPathOf(proconfig) {
  for (const cfg of proconfig || []) if (cfg.startsWith("search_path=")) return cfg.slice("search_path=".length);
  return null;
}

/** Migration files on disk, resolved exactly the way scripts/migrate.mjs resolves them. */
export function diskMigrations(dir = process.env.CLARA_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[A-Za-z0-9][A-Za-z0-9._-]*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ""))
    .sort();
}

/**
 * The migration frontier: the ledger's own count and max version, and the files on disk.
 *
 * `matched` is the only place the two claims are compared, and it is deliberately an equality
 * on BOTH count and max version: a ledger that skipped a middle migration and a ledger that
 * stops short are different failures, and neither may pass as the other.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: any[]}>} query
 * @param {string} [migrationsDir]
 */
export async function readFrontier(query, migrationsDir) {
  const ledger = await query(
    "select count(*)::int as n, max(version) as max_version from clara.schema_migrations",
  );
  const disk = diskMigrations(migrationsDir);
  const frontier = {
    ledger_count: ledger.rows[0].n,
    ledger_max_version: ledger.rows[0].max_version,
    disk_count: disk.length,
    disk_max_version: disk.length ? disk[disk.length - 1] : null,
  };
  frontier.matched = frontier.ledger_count === frontier.disk_count
    && frontier.ledger_max_version === frontier.disk_max_version;
  return frontier;
}

/**
 * The catalog side of the census, in one read pass.
 *
 * `boundary` is derived here and nowhere else: a routine is `public` when PUBLIC or any
 * application role can EXECUTE it, and `internal` otherwise. `granted_roles` keeps the owner;
 * `application_roles` drops it, because "the owner can run its own body" is not a boundary.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: any[]}>} query
 * @returns {Promise<{functions: object[], byName: Map<string, object[]>, relations: Set<string>,
 *                    policyHelpers: Set<string>, applicationRoles: string[], knownRoles: Set<string>}>}
 */
export async function readCatalog(query) {
  const rawFns = (await query(FUNCTIONS_SQL)).rows;
  const grantRows = (await query(GRANTS_SQL)).rows;
  const policyHelpers = new Set((await query(POLICY_HELPERS_SQL)).rows.map((r) => r.fn));
  const roleRows = (await query(
    "select rolname from pg_catalog.pg_roles where rolname like 'clara\\_%' order by rolname",
  )).rows;
  const allClaraRoles = roleRows.map((r) => r.rolname);
  const applicationRoles = allClaraRoles.filter((r) => r !== OWNER_ROLE);
  const knownRoles = new Set(allClaraRoles);

  const grantsByOid = new Map();
  for (const row of grantRows) {
    const key = String(row.oid);
    if (!grantsByOid.has(key)) grantsByOid.set(key, []);
    grantsByOid.get(key).push(row.rolname);
  }

  const functions = rawFns.map((f) => {
    const granted = (grantsByOid.get(String(f.oid)) || []).slice().sort();
    const appGranted = granted.filter((r) => r !== OWNER_ROLE);
    const inputs = inputArgNames(f);
    return {
      name: f.proname,
      identity: `clara.${f.proname}(${f.identity_args})`,
      kind: f.kind,
      owner: f.owner,
      security_definer: f.security_definer,
      search_path: searchPathOf(f.proconfig),
      acl: f.acl,
      granted_roles: granted,
      application_roles: appGranted,
      public_execute: f.public_execute,
      boundary: f.public_execute || appGranted.length > 0 ? "public" : "internal",
      input_args: inputs,
      // The trailing `pronargdefaults` inputs carry defaults; the rest MUST be supplied, which
      // is how PostgREST picks (or fails to pick) an overload from a JSON body's keys.
      required_args: inputs.slice(0, Math.max(0, inputs.length - (f.pronargdefaults || 0))),
      codes: raisedCodes(f.prosrc),
    };
  }).sort((a, b) => (a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0));

  const byName = new Map();
  for (const fn of functions) {
    if (!byName.has(fn.name)) byName.set(fn.name, []);
    byName.get(fn.name).push(fn);
  }

  // Relations, so `insert into clara.<table> (` is never mistaken for a call to a function
  // that has been dropped.
  const relRows = (await query(
    "select c.relname from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'clara'",
  )).rows;
  const relations = new Set(relRows.map((r) => r.relname));

  return { functions, byName, relations, policyHelpers, applicationRoles, knownRoles };
}
