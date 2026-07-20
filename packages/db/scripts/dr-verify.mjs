// dr-verify — the FULL-profile DR verification battery (Lane A §4, hardened per the
// Codex review round). Orchestrator: distinctness/BYPASSRLS preflight, then the §4
// probes (dr-verify-checks.mjs), then a machine-checkable summary. Helpers +
// constants live in dr-verify-util.mjs (file-size cap).
//
// Connects to a restored TARGET and its SOURCE (both READ-ONLY) and proves the restore
// is byte-and-behaviour faithful across every fidelity category. Beyond parity it
// enforces a COMPLETENESS FLOOR (a self-comparison of an empty/half-built DB cannot
// pass) and, in STRICT/live-drill mode, makes the canary + AP gate mandatory. Each
// probe prints PASS / FAIL / SKIP / INFO; the process exits non-zero if ANY probe FAILs.
//
// Connections come from env (never printed — only host:port/db labels are logged):
//   CLARA_DR_SOURCE_URL   read-only DSN for the SOURCE (live / the dump's origin)
//   CLARA_DR_TARGET_URL   read-only DSN for the restored TARGET
// The verifying role MUST see all rows (superuser / BYPASSRLS) — clara tables are
// FORCE-RLS. Source and target MUST be DISTINCT physical databases (refused otherwise —
// Codex HIGH-3). Optional: CLARA_DR_STRICT=1 (live-drill: canary + AP REQUIRED),
// CLARA_DR_VERIFY_OUT (JSON out), CLARA_DR_AP_CLIENT_NAME_ILIKE + CLARA_DR_EXPECT_AP_CENTS
// (+ CLARA_DR_AP_ACCOUNT_CODE, default 400-000) — the AP measure is HARD-PINNED to net =
// credit - debit (the authoritative S6 definition, Codex HIGH-6). This script only READS.

import pg from "pg";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUTHORITATIVE_SCHEMAS } from "./backup.mjs";
import { labelFor, multisetDiff } from "./dr-verify-util.mjs";
import {
  checkSchemasAndJournals, checkTables, checkRoles, checkGrantsAndRls,
  checkConfinementSmoke, checkCanary, checkApGate, checkDocuments,
} from "./dr-verify-checks.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const SRC_URL = process.env.CLARA_DR_SOURCE_URL;
const TGT_URL = process.env.CLARA_DR_TARGET_URL;
const OUT = process.env.CLARA_DR_VERIFY_OUT;
const STRICT = process.env.CLARA_DR_STRICT === "1";

const results = [];
function record(section, name, status, detail = "") {
  results.push({ section, name, status, detail });
  console.log(`[${status.padEnd(4)}] ${section.padEnd(4)} ${name}${detail ? " — " + detail : ""}`);
}

let src, tgt;

async function bothRows(sql, params = []) {
  const [s, t] = await Promise.all([src.query(sql, params), tgt.query(sql, params)]);
  return { s: s.rows, t: t.rows };
}

/** Run the same query on both sides and assert row-MULTISET equality (order-insensitive). */
async function diffCheck(section, name, sql, params = [], { max = 5 } = {}) {
  const { s, t } = await bothRows(sql, params);
  const d = multisetDiff(s, t);
  if (d.equal) {
    record(section, name, "PASS", `${d.n} row(s) identical`);
  } else {
    const ex = [...d.onlyA.slice(0, max).map((x) => "src-only:" + x), ...d.onlyB.slice(0, max).map((x) => "tgt-only:" + x)];
    record(section, name, "FAIL", `source-only ${d.onlyA.length}, target-only ${d.onlyB.length} · ${ex.join(" · ")}`);
  }
  return d;
}

// PREFLIGHT — distinctness (HIGH-3a) + BYPASSRLS visibility.
async function preflight() {
  const idSql =
    "select current_database() db, (select oid from pg_database where datname=current_database()) oid, " +
    "(select system_identifier from pg_control_system()) sysid";
  let srcId, tgtId, sysidOk = true;
  try {
    srcId = (await src.query(idSql)).rows[0];
    tgtId = (await tgt.query(idSql)).rows[0];
  } catch {
    sysidOk = false; // pg_control_system() may be restricted; fall back to (db, oid).
    const fb = "select current_database() db, (select oid from pg_database where datname=current_database()) oid";
    srcId = (await src.query(fb)).rows[0];
    tgtId = (await tgt.query(fb)).rows[0];
  }
  const sameLabel = labelFor(SRC_URL) === labelFor(TGT_URL);
  const samePhysical =
    srcId.db === tgtId.db && String(srcId.oid) === String(tgtId.oid) && (!sysidOk || String(srcId.sysid) === String(tgtId.sysid));
  if (sameLabel || samePhysical) {
    throw new Error(
      `dr-verify REFUSED: source and target are the SAME database (label-equal=${sameLabel}, physical-equal=${samePhysical}${sysidOk ? "" : "; system_identifier unavailable, used db+oid"}). A self-comparison can false-certify an empty/half-built DB (Codex HIGH-3).`,
    );
  }
  record("pre", "source/target are distinct databases", "INFO", `${labelFor(SRC_URL)} vs ${labelFor(TGT_URL)}${sysidOk ? " (system_identifier checked)" : " (db+oid only — system_identifier unavailable)"}`);

  for (const [lbl, c] of [["source", src], ["target", tgt]]) {
    const r = await c.query("select current_user cu, (rolsuper or rolbypassrls) sees_all from pg_roles where rolname=current_user");
    const seesAll = r.rows[0].sees_all === true;
    record("pre", `${lbl} verifying role sees all rows (superuser/BYPASSRLS)`, seesAll ? "INFO" : "FAIL", `current_user=${r.rows[0].cu} sees_all=${seesAll}${seesAll ? "" : " — FORCE-RLS would under-count parity probes"}`);
  }
  record("pre", "mode", "INFO", STRICT ? "STRICT (live-drill: canary + AP gate REQUIRED)" : "normal (canary/AP auto-SKIP when absent)");
}

async function main() {
  if (!SRC_URL || !TGT_URL) {
    console.error("dr-verify: FAIL — CLARA_DR_SOURCE_URL and CLARA_DR_TARGET_URL are required (read-only DSNs)");
    process.exit(2);
  }
  src = new pg.Client({ connectionString: SRC_URL });
  tgt = new pg.Client({ connectionString: TGT_URL });
  await src.connect();
  await tgt.connect();
  const ctx = { src, tgt, STRICT, AUTHORITATIVE_SCHEMAS, MIGRATIONS_DIR, record, bothRows, diffCheck };
  try {
    await src.query("set default_transaction_read_only = on");
    await tgt.query("set default_transaction_read_only = on");
    console.log(`dr-verify · source ${labelFor(SRC_URL)}  →  target ${labelFor(TGT_URL)}${STRICT ? " · STRICT" : ""}\n`);

    await preflight();
    await checkSchemasAndJournals(ctx);
    await checkTables(ctx);
    await checkRoles(ctx);
    await checkGrantsAndRls(ctx);
    await checkConfinementSmoke(ctx);
    await checkCanary(ctx);
    await checkApGate(ctx);
    await checkDocuments(ctx);
  } finally {
    await src.end().catch(() => {});
    await tgt.end().catch(() => {});
  }

  const tally = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const fails = tally.FAIL || 0;
  console.log("\n===== DR-VERIFY SUMMARY =====");
  console.log(`source ${labelFor(SRC_URL)}  →  target ${labelFor(TGT_URL)}${STRICT ? " · STRICT" : ""}`);
  console.log(`PASS ${tally.PASS || 0}   FAIL ${fails}   SKIP ${tally.SKIP || 0}   INFO ${tally.INFO || 0}   (total ${results.length})`);
  if (fails) {
    console.log("FAILURES:");
    for (const r of results.filter((x) => x.status === "FAIL")) console.log(`  - [${r.section}] ${r.name} — ${r.detail}`);
  }
  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ source: labelFor(SRC_URL), target: labelFor(TGT_URL), strict: STRICT, ts: new Date().toISOString(), tally, results }, null, 2));
    console.log(`dr-verify: wrote JSON results -> ${OUT}`);
  }
  console.log(fails ? "\ndr-verify: FAIL" : "\ndr-verify: PASS — restore is faithful across every probed category.");
  process.exit(fails ? 1 : 0);
}

main().catch((err) => {
  console.error("dr-verify: FAIL —", err.message);
  process.exit(1);
});
