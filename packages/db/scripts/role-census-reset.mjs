// Role-census reset (#867) — a from-scratch migration chain re-applied into a
// FRESH database on a Postgres CLUSTER that already ran the chain once reds
// migration 0154's tail: it pins the cluster-wide `clara%` role count at a
// literal (roles are cluster-global, not per-database, so they survive
// `drop database`). Migrations AFTER 0154 mint MORE clara roles, so a cluster
// that already carries them shows a HIGHER count the moment a second chain
// reaches 0154 — a cluster-reuse hazard, not a defect in 0154 itself (0154's own
// comment: "this file mints no role and owes no roles-bootstrap twin"; the
// census is a measured proof of THAT claim, correct at the instant 0154 first
// ran).
//
// 0154's applied bytes are immutable (never edited, never recut). This script
// does not touch it. It READS 0154's own pinned literal (never duplicates it by
// hand) and enumerates every `create role` a LATER migration mints, so a future
// migration that mints yet another role is picked up automatically rather than
// silently drifting this script's manifest out of date.
//
// `check` (default, read-only) reports whether a from-scratch reapply on THIS
// cluster would pass 0154 today, and — for every role a later migration mints —
// whether anything on the cluster still depends on it (a role cannot be DROPped
// while ANY database holds a privilege grant to it; `pg_shdepend` is a SHARED
// catalog, so this is visible from any connection without touching the
// dependent database). `apply` (destructive; guarded by lib/guard.mjs the same
// way reset.mjs is) drops exactly the roles `check` found existing AND
// dependent-free, and REFUSES outright the moment any one of them is still
// depended on — it never partially drops.
//
// packages/db/README.md documents the two recipes (fresh cluster per chain, or
// this script) with the exact statements. See also packages/db/tests/README.md.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient, isMain } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = join(HERE, "..", "migrations");

// The migration whose tail pins the cluster-wide `clara%` role count. Fixed
// forever: 0154 is long applied and its number is part of history, unlike an
// UNMERGED migration's stem-vs-number distinction (tests/README.md's
// frontier-gated-battery rule does not apply to an already-applied number).
export const PIN_MIGRATION = 154;

/** Reads 0154's OWN pinned literal from its applied source text. Throws (rather
 * than silently trusting a hand-kept copy) if that assertion's shape ever moves,
 * since 0154 must never be edited and a mismatch means this script is reasoning
 * about the wrong thing. */
export function pinnedRoleCount(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const stem = String(PIN_MIGRATION).padStart(4, "0") + "_";
  const file = readdirSync(migrationsDir).find((f) => f.startsWith(stem));
  if (!file) throw new Error(`migration ${PIN_MIGRATION} not found under ${migrationsDir}`);
  const text = readFileSync(join(migrationsDir, file), "utf8");
  const m = text.match(/rolname like 'clara%'\)\s*<>\s*(\d+)/);
  if (!m) {
    throw new Error(
      `${file} no longer carries the expected \`rolname like 'clara%'\` census assertion in the ` +
        "shape role-census-reset.mjs expects -- 0154 must never be edited; if this is a false " +
        "alarm, update the regex here, never the migration.",
    );
  }
  return { file, pinned: Number(m[1]) };
}

/** Every `create role <name>` a migration AFTER the pin mints, in file order.
 * Derived from source text (never a hand-kept list) so a future migration that
 * mints another role is picked up the next time this runs. */
export function rolesMintedAfterPin(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .filter((f) => Number(f.slice(0, 4)) > PIN_MIGRATION)
    .sort();
  const roles = [];
  for (const file of files) {
    const text = readFileSync(join(migrationsDir, file), "utf8");
    for (const m of text.matchAll(/create\s+role\s+"?([a-z_][a-z0-9_]*)"?/gi)) {
      roles.push({ name: m[1], file });
    }
  }
  return roles;
}

/** True once `roleName` exists cluster-wide. */
export async function roleExists(client, roleName) {
  const r = await client.query("select 1 from pg_roles where rolname = $1", [roleName]);
  return r.rows.length > 0;
}

/** Every OTHER-catalog dependency on `roleName` (any database's ACL, any
 * ownership, any membership) via the SHARED `pg_shdepend` catalog — visible
 * from any connection without connecting to the dependent database itself.
 * Non-empty means `DROP ROLE` will refuse. */
export async function sharedDependents(client, roleName) {
  const r = await client.query(
    `select d.datname, sd.deptype, count(*)::int as n
       from pg_shdepend sd
       join pg_database d on d.oid = sd.dbid
       join pg_authid a on a.oid = sd.refobjid
      where a.rolname = $1
      group by d.datname, sd.deptype
      order by 1, 2`,
    [roleName],
  );
  return r.rows;
}

export async function clusterClaraRoleCount(client) {
  const r = await client.query("select count(*)::int as n from pg_roles where rolname like 'clara%'");
  return r.rows[0].n;
}

function depLabel(row) {
  const kind = row.deptype === "a" ? "privilege" : row.deptype === "o" ? "ownership" : row.deptype === "m" ? "membership" : row.deptype;
  return `${row.datname} (${row.n} ${kind} dep${row.n === 1 ? "" : "s"})`;
}

/** Read-only report: does this cluster's current state let a from-scratch chain
 * reapplied into a fresh database pass 0154's census today? Never mutates
 * anything. */
export async function check({ log = console.log, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const client = makeClient();
  await client.connect();
  try {
    const { file: pinFile, pinned } = pinnedRoleCount(migrationsDir);
    const minted = rolesMintedAfterPin(migrationsDir);
    const currentCount = await clusterClaraRoleCount(client);
    log(`${pinFile} pins the cluster-wide clara% role count at ${pinned}.`);
    log(
      `Migrations after 0154 mint ${minted.length} role(s): ` +
        (minted.map((r) => `${r.name} (${r.file})`).join(", ") || "(none)") +
        ".",
    );
    log(`This cluster currently carries ${currentCount} clara% role(s).`);
    const rows = [];
    for (const { name, file } of minted) {
      const exists = await roleExists(client, name);
      const deps = exists ? await sharedDependents(client, name) : [];
      rows.push({ name, file, exists, deps });
      const status = !exists
        ? "absent"
        : deps.length
          ? `BLOCKED by ${deps.map(depLabel).join("; ")}`
          : "exists, no shared dependents -- safe to drop";
      log(`- ${name} (minted by ${file}): ${status}`);
    }
    const existing = rows.filter((r) => r.exists);
    const blocked = existing.filter((r) => r.deps.length > 0);
    const wouldReadAfterDrop = currentCount - existing.length;
    const matchesPin = wouldReadAfterDrop === pinned;
    log(
      `Dropping the ${existing.length} existing minted role(s) would bring the count to ` +
        `${wouldReadAfterDrop} (0154 pins ${pinned}) -- ${matchesPin ? "MATCHES" : "does NOT match"}.`,
    );
    return { pinFile, pinned, minted: rows, currentCount, wouldReadAfterDrop, matchesPin, safeToApply: blocked.length === 0 };
  } finally {
    await client.end();
  }
}

/** Destructive: drops exactly the roles `check` found existing AND
 * dependent-free. Guarded like reset.mjs (CLARA_ALLOW_DESTRUCTIVE=1 + a
 * disposable or explicitly-named target). Refuses OUTRIGHT — never a partial
 * drop — the moment any minted role still has a shared dependent anywhere on
 * the cluster; the caller must `drop owned by <role>` in every blocking
 * database first (or drop that database, if it is disposable), then re-run
 * `check` to confirm, before applying. */
export async function apply({ log = console.log, migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  assertDestructiveAllowed({ action: "role-census-reset (drop roles minted after migration 0154)" });
  const result = await check({ log, migrationsDir });
  const blocked = result.minted.filter((r) => r.exists && r.deps.length > 0);
  if (blocked.length > 0) {
    throw new Error(
      "role-census-reset REFUSED: " +
        blocked.map((r) => `${r.name} is still depended on by ${r.deps.map(depLabel).join("; ")}`).join("; ") +
        " -- run `drop owned by <role>` in every named database first (or drop that disposable " +
        "database instead), then re-run --check before --apply.",
    );
  }
  const client = makeClient();
  await client.connect();
  try {
    for (const { name, exists } of result.minted) {
      if (!exists) continue;
      log(`drop role ${name};`);
      await client.query(`drop role "${name.replace(/"/g, '""')}"`);
    }
    const after = await clusterClaraRoleCount(client);
    log(`clara% role count is now ${after} (0154 pins ${result.pinned}).`);
    return after;
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  const mode = process.argv[2] === "--apply" ? apply : check;
  mode().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
