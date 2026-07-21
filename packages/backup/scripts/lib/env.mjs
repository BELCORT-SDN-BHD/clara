// Env + secret resolution for the clara-backup DR job.
//
// SECRETS LAW (house-binding — packages/db/lib/pg.mjs header, scripts/check-leaks.mjs):
//   - The DB connection is libpq PG* env or DATABASE_URL ONLY — never a DSN in code
//     or argv. We do NOT read or reconstruct it here; packages/db/lib/pg.mjs owns that
//     (childEnvForExternalTools) and every dump step goes through it.
//   - Every OTHER secret (the Supabase service_role key, the R2 token, the ping URL)
//     comes from a FILE named by env or from rclone's own config — NEVER an argv, and
//     its VALUE is never logged (only a byte-count + a redacted label).
//
// This module resolves configuration only; it performs no I/O against live services.
import { existsSync, readFileSync } from "node:fs";

/** Read a secret from a file named by env. Never logs the value. */
export function readSecretFile(envName, what, { optional = false } = {}) {
  const path = process.env[envName];
  if (!path) {
    if (optional) return null;
    throw new Error(`${envName} is not set (path to the file holding ${what}).`);
  }
  if (!existsSync(path)) throw new Error(`${envName}=${path} does not exist (${what}).`);
  const v = readFileSync(path, "utf8").trim();
  if (!v) throw new Error(`${envName}=${path} is empty (${what}).`);
  return v;
}

/** A plain-value-or-file resolver for low-power secrets (e.g. the ping URL). */
export function readValueOrFile({ valueEnv, fileEnv, what, optional = false }) {
  if (valueEnv && process.env[valueEnv]) return process.env[valueEnv].trim();
  if (fileEnv && process.env[fileEnv]) return readSecretFile(fileEnv, what, { optional });
  if (optional) return null;
  throw new Error(`neither ${valueEnv} nor ${fileEnv} is set (${what}).`);
}

/** True when a DB target is resolvable (DATABASE_URL or the libpq PG* trio). */
function hasDbTarget() {
  if (process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL) return true;
  return Boolean(process.env.PGHOST && process.env.PGUSER);
}

/**
 * Resolve the full backup config from the environment. Validates presence but reads
 * NO secret VALUES for the optional-in-dry-run paths — the orchestrator reads the
 * service key / ping URL lazily, only when a real run needs them.
 * @param {{ dryRun?: boolean }} opts
 */
export function resolveConfig({ dryRun = false } = {}) {
  const missing = [];
  const need = (name) => {
    if (!process.env[name]) missing.push(name);
    return process.env[name];
  };

  const cfg = {
    dryRun,
    // DB target — the dump steps use packages/db/lib/pg.mjs (libpq/DSN only).
    dbTargetPresent: hasDbTarget(),
    // Supabase Storage (firm-docs byte mirror).
    storageUrl: (process.env.CLARA_BACKUP_STORAGE_URL || "").replace(/\/+$/, ""),
    storageKeyFileEnv: "CLARA_BACKUP_STORAGE_KEY_FILE", // read lazily (never logged)
    storageBucket: process.env.CLARA_BACKUP_STORAGE_BUCKET || "firm-docs",
    // R2 (rclone). The token lives in rclone.conf (RCLONE_CONFIG) or RCLONE_CONFIG_R2_*
    // env — NEVER an argv. We only need the remote name + bucket + the config path.
    r2Remote: process.env.CLARA_BACKUP_R2_REMOTE || "r2",
    r2Bucket: process.env.CLARA_BACKUP_R2_BUCKET || "",
    rcloneConfig: process.env.RCLONE_CONFIG || "",
    // age recipient(s) — PUBLIC key(s), committed to the repo (encrypt needs no secret).
    ageRecipientsFile: process.env.CLARA_BACKUP_AGE_RECIPIENTS_FILE || "",
    // Dead-man's-switch ping (healthchecks.io). URL carries a UUID → treat as low-power
    // secret: value-or-file, never logged verbatim.
    pingValueEnv: "CLARA_BACKUP_PING_URL",
    pingFileEnv: "CLARA_BACKUP_PING_URL_FILE",
    // Local scratch.
    stagingDir: process.env.CLARA_BACKUP_STAGING_DIR || "",
    retentionDays: Number(process.env.CLARA_BACKUP_RETENTION_DAYS || "30"),
    // v17 client binaries — Debian's postgresql-client-common puts pg_dump 17 on PATH;
    // set explicitly for determinism (the image sets these).
    pgDump: process.env.PG_DUMP || "pg_dump",
    pgDumpall: process.env.PG_DUMPALL || "pg_dumpall",
    psql: process.env.PSQL || "psql",
  };

  // Presence checks (a real run needs all of these; a dry run only checks wiring).
  if (!cfg.dbTargetPresent) missing.push("DATABASE_URL (or PGHOST+PGUSER, session pooler port 5432)");
  if (!cfg.storageUrl) need("CLARA_BACKUP_STORAGE_URL");
  if (!cfg.r2Bucket) need("CLARA_BACKUP_R2_BUCKET");
  if (!cfg.ageRecipientsFile) need("CLARA_BACKUP_AGE_RECIPIENTS_FILE");
  if (!cfg.stagingDir) need("CLARA_BACKUP_STAGING_DIR");

  if (missing.length) {
    const msg = `backup: missing required configuration:\n  - ${missing.join("\n  - ")}\n` +
      `See packages/backup/.env.example and docs/ops/DR.md §9. (Secrets never go in argv or code.)`;
    if (dryRun) {
      // In dry-run we REPORT but do not abort on missing values — the point is to prove
      // the wiring resolves given a full env; the caller decides.
      return { ...cfg, missing };
    }
    throw new Error(msg);
  }
  return { ...cfg, missing: [] };
}

/**
 * A pg-FREE host:port/db label of the DB target (parsed from DATABASE_URL or PG*),
 * for the dry-run plan — so `--dry-run` validates wiring with ZERO install (it must
 * not pull in packages/db/lib/pg.mjs, which imports the `pg` module).
 */
export function dbTargetLabel() {
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  try {
    if (url) {
      const u = new URL(url);
      const db = decodeURIComponent((u.pathname || "").replace(/^\//, "")) || "postgres";
      return `${(u.hostname || "").toLowerCase()}:${u.port || "5432"}/${db}`;
    }
  } catch {
    return "(unparseable DATABASE_URL)";
  }
  const host = (process.env.PGHOST || "localhost").toLowerCase();
  return `${host}:${process.env.PGPORT || "5432"}/${process.env.PGDATABASE || "postgres"}`;
}

/** Redact a URL/path so it is safe to log (host + last segment only). */
export function redactUrl(u) {
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}/…`;
  } catch {
    return "(unparseable)";
  }
}
