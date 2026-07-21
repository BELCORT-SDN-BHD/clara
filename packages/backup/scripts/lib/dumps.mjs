// DB-side artifacts for the DR bundle: the full-profile dump (REUSED from
// @clara/db so the full-inventory assertion is never re-implemented or lost), the
// globals evidence dump (written beside it by the same tool), the auth data-only
// dump (PII → the bundle's age encryption is mandatory), and the migration-head
// fingerprint (the dr-verify completeness floor).
//
// Every dump targets the ONE canonical DB resolved by packages/db/lib/pg.mjs
// (libpq PG*/DATABASE_URL only; a URL-vs-PG* split is refused there). We never
// build a DSN or put a credential on the command line.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { childEnvForExternalTools, makeClient, targetLabel } from "../../../db/lib/pg.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PKG = join(HERE, "..", "..", "..", "db"); // packages/db
const BACKUP_MJS = join(DB_PKG, "scripts", "backup.mjs");

/**
 * Full-profile dump + globals evidence, by INVOKING @clara/db's backup.mjs
 * (`--profile full`). That tool asserts the full authoritative-schema inventory and
 * refuses a partial "full" — we reuse it verbatim rather than duplicate that safety.
 * CLARA_BACKUP_DIR pins BOTH artifacts (the schemas dump via --out, the globals dump
 * via the tool's default dir) into the run dir.
 * @returns {{ fullDump: string, globals: string | null }}
 */
export function fullProfileDump({ runDir, log = console.log }) {
  const fullDump = join(runDir, "full-profile.sql");
  const childEnv = { ...process.env, CLARA_BACKUP_DIR: runDir };
  log(`dump(full): node backup.mjs --profile full -> ${fullDump} · target ${targetLabel()}`);
  const r = spawnSync(process.execPath, [BACKUP_MJS, "--profile", "full", "--out", fullDump], {
    stdio: ["ignore", "inherit", "inherit"],
    env: childEnv,
  });
  if (r.error) throw new Error(`full dump failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`full dump (backup.mjs --profile full) exited ${r.status}`);
  if (!existsSync(fullDump)) throw new Error(`full dump did not produce ${fullDump}`);
  // backup.mjs wrote globals into CLARA_BACKUP_DIR as clara-globals-<ts>.sql.
  const globals = readdirSync(runDir)
    .filter((f) => /^clara-globals-.*\.sql$/.test(f))
    .map((f) => join(runDir, f))
    .sort()
    .at(-1) || null;
  log(globals ? `dump(full): globals evidence -> ${globals}` : `dump(full): globals SKIPPED (managed project may deny pg_dumpall --globals; evidence-only artifact)`);
  return { fullDump, globals };
}

/**
 * auth data-only dump (auth.users + auth.identities). Carries PII + bcrypt hashes —
 * the bundle's age encryption is MANDATORY. Re-implemented here (not imported from
 * the .tmp drill scratch, which is gitignored/dockerignored and absent in the image).
 * @returns {string} the dump path
 */
export function authDataDump({ runDir, pgDump = process.env.PG_DUMP || "pg_dump", log = console.log }) {
  const out = join(runDir, "auth-data-only.sql");
  const childEnv = childEnvForExternalTools();
  const args = [
    "--data-only",
    "--table=auth.users",
    "--table=auth.identities",
    "--format=plain",
    "--file", out,
    "--dbname", childEnv.PGDATABASE || "postgres",
  ];
  log(`dump(auth): ${pgDump} --data-only auth.users+auth.identities -> ${out} · target ${targetLabel()}`);
  const r = spawnSync(pgDump, args, { stdio: ["ignore", "inherit", "inherit"], env: childEnv });
  if (r.error) throw new Error(`auth dump failed to start: ${r.error.message} (is PG_DUMP a v17 binary?)`);
  if (r.status !== 0) throw new Error(`auth data-only dump exited ${r.status}`);
  return out;
}

/**
 * The migration-head fingerprint (the dr-verify §4.1 completeness floor): the
 * ordered (version, checksum) rows of clara.schema_migrations plus a combined
 * sha256 over them, computed the way migrate.mjs records checksums (CRLF→LF sha256
 * of the migration text). We only READ them here — this is the freshness/integrity
 * anchor the un-encrypted manifest carries so a restore can be proven complete
 * WITHOUT decrypting the bundle.
 * @returns {Promise<{ rows: {version:string,checksum:string}[], headSha256: string }>}
 */
export async function migrationHead() {
  const client = makeClient();
  await client.connect();
  try {
    const r = await client.query(
      "select version, checksum from clara.schema_migrations order by version",
    );
    const rows = r.rows.map((x) => ({ version: String(x.version), checksum: String(x.checksum) }));
    const canonical = rows.map((x) => `${x.version}\t${x.checksum}`).join("\n") + "\n";
    const headSha256 = createHash("sha256").update(canonical, "utf8").digest("hex");
    return { rows, headSha256 };
  } finally {
    await client.end();
  }
}

/** sha256 + byte size of a file (streamed — the full dump is ~52 MB). */
export function fileDigest(path) {
  const bytes = statSync(path).size;
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("error", reject)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve({ bytes, sha256: hash.digest("hex") }));
  });
}
