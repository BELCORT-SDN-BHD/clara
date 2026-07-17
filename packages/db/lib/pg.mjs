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

import pg from "pg";
import { pathToFileURL } from "node:url";

/** @returns {pg.ClientConfig} */
export function connConfig() {
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  // When a DSN is provided we use it; otherwise node-postgres reads PG* vars.
  return url ? { connectionString: url } : {};
}

/** @param {pg.PoolConfig} [overrides] */
export function makePool(overrides = {}) {
  return new pg.Pool({ ...connConfig(), max: 5, ...overrides });
}

export function makeClient() {
  return new pg.Client(connConfig());
}

/** Human-readable target (host:port/db) with NO password, for logs. */
export function targetLabel() {
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  if (url) {
    try {
      const u = new URL(url);
      return `${u.hostname}:${u.port || "5432"}${u.pathname || "/postgres"}`;
    } catch {
      return "(unparseable DATABASE_URL)";
    }
  }
  const host = process.env.PGHOST || "localhost";
  const port = process.env.PGPORT || "5432";
  const db = process.env.PGDATABASE || process.env.PGUSER || "postgres";
  return `${host}:${port}/${db}`;
}

/** True when this module file is the entrypoint (`node scripts/x.mjs`). */
export function isMain(importMetaUrl) {
  const arg = process.argv[1];
  if (!arg) return false;
  return importMetaUrl === pathToFileURL(arg).href;
}
