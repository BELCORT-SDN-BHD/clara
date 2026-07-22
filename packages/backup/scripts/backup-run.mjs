// clara-backup — the scheduled off-site DR job (Wave A2 §8 / WA2-R6, docs/ops/DR.md §9).
//
// Pipeline (one run, exits 0 on success / non-zero on failure — a Fly SCHEDULED machine
// boots this to completion daily):
//   1. full-profile DB dump  (REUSES @clara/db backup.mjs --profile full: 4 authoritative
//      schemas WITH owners+ACLs; full-inventory assertion; v17 client required)
//   2. globals evidence dump (written beside it by the same tool)
//   3. auth data-only dump   (auth.users + auth.identities — PII → age encryption mandatory)
//   4. firm-docs byte mirror (Supabase Storage REST; incremental, individually age-encrypted)
//   5. migration-head fingerprint (the dr-verify completeness floor)
//   6. detailed bundle manifest → tar --zstd → age-encrypt → clara-dr-<ts>.tar.zst.age
//   7. plaintext freshness manifest.json (NO client-identifying paths)
//   8. rclone copy → R2 (incremental firm-docs mirror prefix + a dated 30-day DB snapshot)
//   9. success ping → the dead-man's-switch (healthchecks.io)
//
// SECRETS LAW: the DB connection is libpq PG*/DATABASE_URL only (packages/db/lib/pg.mjs);
// the service_role key + ping URL come from files/env (never argv, never logged); the R2
// token lives in rclone.conf/env; the age RECIPIENT (public) key is committed to the repo
// (encrypt needs no secret). This job is OWNER-DEPLOYED with those secrets set as Fly
// secrets on the clara-backup app ONLY — see docs/ops/DR.md §9. The FIRST live run is an
// owner-gated step; this file is validated locally by `--dry-run` + `node --check`.
// STATIC imports here are pg-FREE ON PURPOSE: `--dry-run` must validate the wiring
// with ZERO install. The DB/tool modules (dumps.mjs, storage-mirror.mjs, bundle.mjs,
// r2.mjs, ping.mjs, and packages/db/lib/pg.mjs which imports the `pg` package) are
// DYNAMICALLY imported only inside runReal(). In the image, `pg` is installed at the
// app root so both packages/backup and packages/db resolve it (see Dockerfile).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveConfig, readValueOrFile, redactUrl, dbTargetLabel } from "./lib/env.mjs";

const AGE = process.env.AGE_BIN || "age";
const TAR = process.env.TAR_BIN || "tar";
const RCLONE = process.env.RCLONE_BIN || "rclone";
const MIRROR_PREFIX = "firm-docs-mirror";

function tsStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Supabase project ref from the pooler username (postgres.<ref>); else host label. */
function sourceRef(resolveTarget) {
  try {
    const t = resolveTarget();
    if (t.user && t.user.includes(".")) return t.user.split(".").slice(1).join(".");
    return (t.host || "").split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

function printPlan(cfg, log) {
  log("clara-backup — DRY RUN (no DB, Storage, R2, or ping I/O performed)");
  log("");
  log("resolved configuration:");
  log(`  DB target present : ${cfg.dbTargetPresent} (${cfg.dbTargetPresent ? dbTargetLabel() : "—"})`);
  log(`  Storage URL       : ${cfg.storageUrl ? redactUrl(cfg.storageUrl) : "(missing)"}`);
  log(`  Storage key file  : $${cfg.storageKeyFileEnv} -> ${process.env[cfg.storageKeyFileEnv] || "(missing)"}`);
  log(`  Storage bucket    : ${cfg.storageBucket}`);
  log(`  R2 remote:bucket  : ${cfg.r2Remote}:${cfg.r2Bucket || "(missing)"}`);
  log(`  rclone config     : ${cfg.rcloneConfig || "(RCLONE_CONFIG unset — rclone default/env)"}`);
  log(`  age recipients    : ${cfg.ageRecipientsFile || "(missing)"}`);
  // NEVER print the ping URL verbatim — it carries a UUID token that would leak into
  // retained logs (Wave A2 FIX-14). Show configured/missing + a redacted host at most.
  const pingLabel = process.env.CLARA_BACKUP_PING_URL
    ? `configured (${redactUrl(process.env.CLARA_BACKUP_PING_URL)})`
    : process.env.CLARA_BACKUP_PING_URL_FILE
      ? `configured (file ${process.env.CLARA_BACKUP_PING_URL_FILE})`
      : "(missing — dead-man's-switch blind)";
  log(`  ping URL          : ${pingLabel}`);
  log(`  staging dir       : ${cfg.stagingDir || "(missing)"}`);
  log(`  retention (days)  : ${cfg.retentionDays} (R2 lifecycle prunes db-snapshots)`);
  log(`  pg_dump / v17      : ${cfg.pgDump}`);
  log("");
  log("planned steps:");
  log("  1. full-profile dump (backup.mjs --profile full) + 2. globals evidence");
  log("  3. auth data-only dump (auth.users + auth.identities)");
  log("  4. firm-docs byte mirror (Storage REST -> incremental age-encrypted)");
  log("  5. migration-head fingerprint (dr-verify completeness floor)");
  log("  6. bundle manifest -> tar --zstd -> age -> clara-dr-<ts>.tar.zst.age");
  log("  7. plaintext freshness manifest.json (no client paths)");
  log(`  8. rclone copy -> ${cfg.r2Remote}:${cfg.r2Bucket}/{${MIRROR_PREFIX}/, db-snapshots/<YYYY>/<ts>/}`);
  log("  9. success ping -> dead-man's-switch");
  if (cfg.missing && cfg.missing.length) {
    log("");
    log(`NOTE: ${cfg.missing.length} config value(s) still unset (a real run requires them):`);
    for (const m of cfg.missing) log(`  - ${m}`);
  }
  log("");
  log("dry-run: wiring OK.");
}

async function runReal(cfg, log) {
  // Dynamic imports (pg-dependent) — kept out of the dry-run path (see top-of-file note).
  const { fullProfileDump, authDataDump, migrationHead, fileDigest } = await import("./lib/dumps.mjs");
  const { mirrorFirmDocs, writeFirmDocsIndex } = await import("./lib/storage-mirror.mjs");
  const { readRecipients, tarZstdDir, ageEncryptFile } = await import("./lib/bundle.mjs");
  const { rcloneListKeys, rcloneCopyDir, rcloneCopyFile } = await import("./lib/r2.mjs");
  const { resolveTarget, targetLabel } = await import("../../db/lib/pg.mjs");

  const ts = tsStamp();
  const runDir = join(cfg.stagingDir, `run-${ts}`);
  const bundleDir = join(runDir, "bundle");
  mkdirSync(bundleDir, { recursive: true });
  try {
    const ref = sourceRef(resolveTarget);
    log(`clara-backup: run ${ts} · source ref ${ref} · target ${targetLabel()}`);

    // 1 + 2: full-profile dump + globals evidence (into the to-be-encrypted bundle dir).
    const { fullDump, globals } = fullProfileDump({ runDir: bundleDir, log });
    // 3: auth data-only (PII).
    const authDump = authDataDump({ runDir: bundleDir, pgDump: cfg.pgDump, log });

    // 4: firm-docs incremental encrypted mirror.
    const recipients = readRecipients(cfg.ageRecipientsFile);
    const existingKeys = rcloneListKeys({ remote: cfg.r2Remote, bucket: cfg.r2Bucket, prefix: MIRROR_PREFIX, rclone: RCLONE });
    const mirror = await mirrorFirmDocs({ cfg, runDir, recipients, existingKeys, ageBin: AGE, log });
    writeFirmDocsIndex({ bundleDir, index: mirror.index, log });

    // 5: migration-head fingerprint (completeness floor).
    const head = await migrationHead();
    log(`migration-head: ${head.rows.length} migration(s), head sha256 ${head.headSha256.slice(0, 16)}…`);

    // 5b: per-artifact digests for the detailed manifest.
    const artifacts = { "full-profile.sql": fullDump, "auth-data-only.sql": authDump };
    if (globals) artifacts["globals.sql"] = globals;
    const artifactDigests = {};
    for (const [name, path] of Object.entries(artifacts)) artifactDigests[name] = { path, ...(await fileDigest(path)) };

    // 6a: the DETAILED bundle manifest (goes inside the encrypted tar — may reference paths).
    const detailed = {
      schema: "clara-dr-bundle/1",
      generated_at: new Date().toISOString(),
      source_ref: ref,
      source_target: targetLabel(),
      migration_head: { count: head.rows.length, sha256: head.headSha256, rows: head.rows },
      artifacts: artifactDigests,
      firm_docs: { count: mirror.count, total_bytes: mirror.totalBytes, combined_sha256: mirror.combinedSha256, new_encrypted: mirror.newEncrypted, address_mismatches: mirror.addressMismatches },
      age_recipients: recipients.length,
    };
    writeFileSync(join(bundleDir, "bundle-manifest.json"), JSON.stringify(detailed, null, 2));

    // 6b: tar --zstd the bundle dir -> age-encrypt.
    const tarPath = join(runDir, `clara-dr-${ts}.tar.zst`);
    tarZstdDir({ srcDir: bundleDir, outPath: tarPath, tar: TAR, log });
    const bundleAge = `${tarPath}.age`;
    ageEncryptFile({ inPath: tarPath, outPath: bundleAge, recipients, age: AGE, log });
    const bundleDigest = await fileDigest(bundleAge);

    // 7: the PLAINTEXT freshness manifest — freshness + integrity checkable WITHOUT
    // decrypting, carrying NO client-identifying paths (only counts/bytes/fingerprints
    // + the migration head, which are migration-file hashes, not client data).
    const freshness = {
      schema: "clara-dr-manifest/1",
      generated_at: detailed.generated_at,
      run: ts,
      source_ref: ref,
      bundle: { object: `clara-dr-${ts}.tar.zst.age`, ...bundleDigest, encrypted: "age", compression: "zstd" },
      migration_head: { count: head.rows.length, sha256: head.headSha256, rows: head.rows },
      firm_docs: { count: mirror.count, total_bytes: mirror.totalBytes, combined_sha256: mirror.combinedSha256, new_encrypted: mirror.newEncrypted },
      age_recipients: recipients.length,
      retention_days: cfg.retentionDays,
    };
    const manifestPath = join(runDir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify(freshness, null, 2));

    // 8: upload. Incremental firm-docs mirror (additive, delete-never) + the dated DB snapshot.
    if (mirror.encStageDir && mirror.newEncrypted > 0) {
      rcloneCopyDir({ srcDir: mirror.encStageDir, remote: cfg.r2Remote, bucket: cfg.r2Bucket, destPrefix: MIRROR_PREFIX, rclone: RCLONE, log });
    } else {
      log(`r2: firm-docs mirror unchanged (${mirror.count} objects, 0 new) — nothing to upload.`);
    }
    const year = ts.slice(0, 4);
    const snapPrefix = `db-snapshots/${year}/${ts}`;
    rcloneCopyFile({ srcFile: bundleAge, remote: cfg.r2Remote, bucket: cfg.r2Bucket, destPrefix: snapPrefix, rclone: RCLONE, log });
    rcloneCopyFile({ srcFile: manifestPath, remote: cfg.r2Remote, bucket: cfg.r2Bucket, destPrefix: snapPrefix, rclone: RCLONE, log });

    log(`clara-backup: DONE — bundle ${bundleDigest.bytes} bytes -> ${cfg.r2Remote}:${cfg.r2Bucket}/${snapPrefix}/`);
    return { ts, ref, bundleBytes: bundleDigest.bytes, firmDocs: mirror.count, newEncrypted: mirror.newEncrypted };
  } finally {
    // SECURITY (Wave A2 FIX-15): the staging dir holds the PLAINTEXT full-DB dump + the
    // auth data-only dump (bcrypt hashes + PII) + the pre-age tarball. Purge it whether the
    // run succeeded or failed — the durable copy is the age-encrypted bundle already on R2;
    // nothing plaintext may linger on the Fly rootfs (that would defeat encrypt-at-rest).
    try {
      rmSync(runDir, { recursive: true, force: true });
      log(`clara-backup: purged plaintext staging ${runDir}`);
    } catch (e) {
      log(`clara-backup: WARN could not purge staging ${runDir} — ${e.message}`);
    }
  }
}

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  const log = console.log;
  const cfg = resolveConfig({ dryRun });

  if (dryRun) {
    printPlan(cfg, log);
    return 0;
  }

  const { pingStart, pingSuccess, pingFailure } = await import("./lib/ping.mjs");
  const pingUrl = readValueOrFile({ valueEnv: cfg.pingValueEnv, fileEnv: cfg.pingFileEnv, what: "the dead-man's-switch ping URL", optional: true });
  await pingStart(pingUrl, { log });
  try {
    const summary = await runReal(cfg, log);
    await pingSuccess(pingUrl, { body: `clara-backup ${summary.ts} ref=${summary.ref} bundle=${summary.bundleBytes}B docs=${summary.firmDocs}(+${summary.newEncrypted})`, log });
    return 0;
  } catch (err) {
    log(`clara-backup: FAIL — ${err.message}`);
    await pingFailure(pingUrl, { body: `clara-backup FAILED: ${err.message}`.slice(0, 400), log });
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`clara-backup: UNCAUGHT — ${err?.stack || err}`);
    process.exit(1);
  });
