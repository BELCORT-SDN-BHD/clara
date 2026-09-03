// Postgres connection helper for the data-plane scripts.
//
// Credentials NEVER appear in code or argv. Connection details come from the
// environment only:
//   - DATABASE_URL (full DSN)  — if set, used as-is; OR
//   - libpq vars: PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE — read
//     automatically by node-postgres when no connectionString is given.
//
// This keeps the gitignored .env (or an inline `export PG...` in the shell) as
// the single home for secrets, and satisfies the repo's no-secrets policy.
//
// SINGLE CANONICAL TARGET (finding 1). The node-postgres client resolves a DSN
// URL when present, but the external tools (pg_dump / psql) read ONLY libpq PG*
// and ignore DATABASE_URL. If a URL var and PG* point at DIFFERENT databases,
// the guard label / node client would identify one DB while pg_dump/psql operate
// on another — a destructive op could hit the wrong database. So everything
// resolves ONE canonical target here: `resolveTarget()` is the single resolver,
// `assertNoTargetSplit()` refuses a URL-vs-PG* mismatch, and
// `childEnvForExternalTools()` hands pg_dump/psql a clean env derived from the
// SAME target the node client + guard see.

import pg from "pg";
import { pathToFileURL } from "node:url";

// libpq vars that determine WHICH database a connection lands on. When a DSN URL
// is authoritative these are rebuilt from it for the external-tool child so no
// inherited value can silently redirect pg_dump/psql to a different server.
const PG_IDENTITY_VARS = [
  "PGHOST",
  "PGHOSTADDR",
  "PGPORT",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
  "PGSERVICE",
  "PGSERVICEFILE",
];

/** The DSN URL var, if any (DATABASE_URL wins over WORKFLOW_POSTGRES_URL). */
function urlVar(env = process.env) {
  return env.DATABASE_URL || env.WORKFLOW_POSTGRES_URL;
}

/**
 * Resolve the ONE canonical connection target from exactly one source: a DSN URL
 * var when present, otherwise the libpq PG* vars. Returns host/port/db plus the
 * USER (never a password). Throws on an unparseable URL.
 *
 * `env` defaults to `process.env` — pass an explicit env (e.g. a `sourceEnv`
 * captured by `childEnvForExternalTools()` before a caller redirects
 * `process.env` elsewhere) to resolve THAT target instead of whatever the
 * ambient ENVIRONMENT currently names (rev-498 M2: a guard call must evaluate
 * the SAME env object its caller is about to act on, not assume the two agree).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ source: "url" | "pg", host: string, port: string, db: string, user: string }}
 */
export function resolveTarget(env = process.env) {
  const url = urlVar(env);
  if (url) {
    const u = new URL(url); // throws on garbage — caller surfaces it
    const db = decodeURIComponent((u.pathname || "").replace(/^\//, "")) || "postgres";
    const user = u.username ? decodeURIComponent(u.username) : "";
    return { source: "url", host: (u.hostname || "").toLowerCase(), port: u.port || "5432", db, user };
  }
  const host = (env.PGHOST || "localhost").toLowerCase();
  const port = env.PGPORT || "5432";
  const db = env.PGDATABASE || env.PGUSER || "postgres";
  return { source: "pg", host, port, db, user: env.PGUSER || "" };
}

/**
 * Throw when a DSN URL var is set AND ambient PG* point at a DIFFERENT
 * host/port/db (a "target split"): the node client would use the URL while
 * pg_dump/psql would use PG*. Returns the resolved canonical target.
 * @param {NodeJS.ProcessEnv} [env] Defaults to `process.env` — see `resolveTarget()`.
 * @returns {{ source: "url" | "pg", host: string, port: string, db: string }}
 */
export function assertNoTargetSplit(env = process.env) {
  const url = urlVar(env);
  const target = resolveTarget(env);
  if (!url) return target; // PG*-only: the external tools and node client agree by construction
  const mismatches = [];
  const ph = env.PGHOST;
  const pp = env.PGPORT;
  const pd = env.PGDATABASE;
  if (ph && ph.toLowerCase() !== target.host) mismatches.push(`PGHOST=${ph} != url host ${target.host}`);
  if (pp && pp !== target.port) mismatches.push(`PGPORT=${pp} != url port ${target.port}`);
  if (pd && pd !== target.db) mismatches.push(`PGDATABASE=${pd} != url db ${target.db}`);
  // A service file / hostaddr can silently redirect the child to another server;
  // when a URL is authoritative we cannot verify they agree, so refuse.
  if (env.PGSERVICE) mismatches.push(`PGSERVICE=${env.PGSERVICE} set alongside a DSN URL (cannot verify it targets the URL host)`);
  if (env.PGHOSTADDR && env.PGHOSTADDR.toLowerCase() !== target.host)
    mismatches.push(`PGHOSTADDR=${env.PGHOSTADDR} set alongside a DSN URL`);
  if (mismatches.length) {
    throw new Error(
      `DB target split: a DSN URL var and libpq PG* env point at DIFFERENT targets — ${mismatches.join("; ")}. ` +
        `pg_dump/psql read PG* and ignore the URL, so this could operate on the wrong database. ` +
        `Unset the conflicting PG* vars (or the URL) so exactly one target is resolved. Refusing.`,
    );
  }
  return target;
}

/**
 * Build the child-process env for a pg_dump / psql invocation so it targets the
 * SAME database the node client + guard resolved. When a DSN URL var is set the
 * inherited libpq identity vars are cleared and rebuilt from the URL (the tools
 * don't read the URL); when only PG* are set they pass through unchanged. Throws
 * on a target split before returning.
 * @returns {NodeJS.ProcessEnv}
 */
export function childEnvForExternalTools() {
  assertNoTargetSplit();
  const url = urlVar();
  const env = { ...process.env };
  if (!url) return env; // PG* passthrough — already canonical
  const u = new URL(url);
  for (const k of PG_IDENTITY_VARS) delete env[k]; // drop anything that could redirect the child
  env.PGHOST = u.hostname;
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const db = decodeURIComponent((u.pathname || "").replace(/^\//, ""));
  if (db) env.PGDATABASE = db;
  const sslmode = u.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode; // only override TLS mode when the URL states it
  return env;
}

/** @param {pg.ClientConfig} [overrides] @returns {pg.ClientConfig} */
export function connConfig(overrides = {}) {
  const url = urlVar();
  // When a DSN is provided we use it; otherwise node-postgres reads PG* vars.
  return url ? { connectionString: url, ...overrides } : { ...overrides };
}

/** @param {pg.PoolConfig} [overrides] */
export function makePool(overrides = {}) {
  return new pg.Pool({ ...connConfig(), max: 5, ...overrides });
}

/** @param {pg.ClientConfig} [overrides] */
export function makeClient(overrides = {}) {
  return new pg.Client(connConfig(overrides));
}

/**
 * Human-readable target (host:port/db) with NO password, for logs.
 * @param {NodeJS.ProcessEnv} [env] Defaults to `process.env` — see `resolveTarget()`.
 */
export function targetLabel(env = process.env) {
  try {
    const t = resolveTarget(env);
    return `${t.host}:${t.port}/${t.db}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/**
 * IDENTITY label for the destructive-op named-target confirmation: `user@host:port/db`
 * (no password). MUST include the user — on a managed pooler the project identity lives
 * in the USERNAME, not the host: every Supabase project in a region shares one pooler
 * host and the `postgres` database, so `host:port/db` is byte-identical across projects
 * and could not distinguish a scratch project from the live one. A guard keyed on the
 * plain label would therefore accept a destructive op aimed at the WRONG project.
 * Falls back to the plain label when no user is resolvable (nothing to disambiguate).
 * @param {NodeJS.ProcessEnv} [env] Defaults to `process.env` — see `resolveTarget()`.
 */
export function destructiveTargetLabel(env = process.env) {
  try {
    const t = resolveTarget(env);
    const base = `${t.host}:${t.port}/${t.db}`;
    return t.user ? `${t.user}@${base}` : base;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/** True when this module file is the entrypoint (`node scripts/x.mjs`). */
export function isMain(importMetaUrl) {
  const arg = process.argv[1];
  if (!arg) return false;
  return importMetaUrl === pathToFileURL(arg).href;
}
