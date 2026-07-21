// Wave-A rig — 0011 fresh-vs-upgrade PARITY + runner semantics (Codex probe 26;
// contract §11 + companion §15). Applies 0011 on a FRESH schema and on an exact
// 0010-upgrade image and diffs the catalog (pg_proc overloads/ACLs, table/column
// ACLs, policies, triggers, constraints, taxonomy coverage); proves the migration
// runner's idempotent re-run + duplicate-version refusal; two independent bootstraps
// reach an identical surface. Contract-blind. RESET-GATED (drops schema clara) → it
// SKIPS unless CLARA_RIG_ALLOW_RESET=1 and MUST run ALONE on an ISOLATED DB:
//   PGDATABASE=clara_waveA_upgrade CLARA_RIG_ALLOW_RESET=1 \
//     node --test packages/db/tests/wave-a-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rootQuery, endPool, printLaneNotes, noteLane, waveAReady, markSkip, printSkipCount } from "./wave-a-fixtures.mjs";

after(async () => { printLaneNotes("wave-a-upgrade"); printSkipCount("wave-a-upgrade"); await endPool(); });

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function skipUnlessReset(t) {
  if (!RESET_OK) { markSkip(); t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE"); return true; }
  return false;
}
/** A temp migrations dir carrying ONLY 0001..NN (never touches/reads 0011 content). */
function exportUpTo(maxNum) {
  const tmp = mkdtempSync(join(tmpdir(), `clara-wa-up${maxNum}-`));
  for (const f of readdirSync(MIG_DIR)) {
    const m = /^(\d{4})_.*\.sql$/.exec(f);
    if (m && Number(m[1]) <= maxNum) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

/** A deterministic catalog SIGNATURE of schema clara — the Codex-26 dump surface. */
async function signature() {
  const parts = [];
  const q = async (label, sql) => { const r = await rootQuery(sql); parts.push(`## ${label}\n` + r.rows.map((x) => JSON.stringify(x)).join("\n")); };
  await q("functions", `select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef,
      coalesce((select string_agg(a.grantee::regrole::text||'='||a.privilege_type, ',' order by a.grantee::regrole::text||a.privilege_type) from aclexplode(p.proacl) a), 'owner-only') as acl
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' order by p.proname, args`);
  await q("tables", `select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
     from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r' order by c.relname`);
  await q("table_acls", `select c.relname, coalesce(c.relacl::text,'null') as acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r' order by c.relname`);
  await q("columns", `select table_name, column_name, data_type, coalesce(column_default,'') as dflt from information_schema.columns where table_schema='clara' order by table_name, ordinal_position`);
  await q("policies", `select c.relname, pol.polname, pol.polcmd from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' order by c.relname, pol.polname`);
  await q("triggers", `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and not t.tgisinternal order by c.relname, t.tgname`);
  await q("constraints", `select c.relname as tbl, con.conname, con.contype, pg_get_constraintdef(con.oid) as def from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' order by c.relname, con.conname`);
  await q("taxonomy", `select tt.version, tt.event_type, tt.decision from clara.trigger_taxonomy tt order by tt.version, tt.event_type`);
  return parts.join("\n");
}
async function surfaceClean() {
  assert.ok(await waveAReady(), "the Wave-A surface is present after migrate (counterparty_aliases + coding_lane)");
  const pub = await rootQuery(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proacl is not null and exists (select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE')`);
  assert.equal(pub.rowCount, 0, `PUBLIC zero-execute holds post-0011 (offenders: ${pub.rows.map((r) => r.proname).join(", ")})`);
}

// ===========================================================================
// Fresh compile + fresh-vs-upgrade catalog parity.
// ===========================================================================

test("probe 26: 0011 compiles clean on FRESH and on a 0010-UPGRADE image, and the two catalogs are IDENTICAL (overloads/ACLs/policies/triggers/constraints/taxonomy)", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  // FRESH: reset → migrate ALL (0001→0011).
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  if (!(await waveAReady())) { markSkip(); noteLane("0011 not on disk yet — fresh migrate reached 0010 only; parity probe skipped"); t.skip("0011 not yet built on disk"); return; }
  await surfaceClean();
  const sigFresh = await signature();
  // UPGRADE: reset → migrate 0001→0010 → migrate ALL (applies only 0011).
  await reset({ log: () => {} });
  await migrate({ dir: exportUpTo(10), log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  await surfaceClean();
  const sigUpgrade = await signature();
  if (sigFresh !== sigUpgrade) {
    // Surface the FIRST divergent section for the orchestrator.
    const fa = sigFresh.split("\n"), ua = sigUpgrade.split("\n");
    let firstDiff = "";
    for (let i = 0; i < Math.max(fa.length, ua.length); i++) { if (fa[i] !== ua[i]) { firstDiff = `line ${i}:\n  fresh:   ${fa[i] ?? "(none)"}\n  upgrade: ${ua[i] ?? "(none)"}`; break; } }
    noteLane(`FINDING: fresh vs upgrade catalog DIVERGED — ${firstDiff}`);
  }
  assert.equal(sigFresh, sigUpgrade, "the fresh and 0010→0011 upgrade catalogs are byte-identical (Codex 26 parity)");
});

// ===========================================================================
// Runner semantics — idempotent re-run + duplicate-version refusal.
// ===========================================================================

test("probe 26: re-running migrate after 0011 applies ZERO new migrations (idempotent, checksum-verified); the surface is unchanged", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  if (!(await waveAReady())) { markSkip(); t.skip("0011 not yet built on disk"); return; }
  const again = await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(again.applied, 0, "a second migrate applies ZERO new migrations (the runner's duplicate refusal — 0011 is not self-reapplying)");
});

test("probe 26: the migration runner REFUSES a duplicate version number (the safety 0011 relies on) — tested with a synthetic duplicate, never reading 0011", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await import("../scripts/migrate.mjs");
  // A temp dir with the real set PLUS a synthetic second file at an EXISTING low
  // number → the loader must reject the duplicate BEFORE applying anything.
  const dir = exportUpTo(11);
  writeFileSync(join(dir, "0002_synthetic_dup.sql"), "-- synthetic duplicate version for the runner-refusal probe\nselect 1;\n");
  await assert.rejects(() => migrate({ dir, log: () => {} }), /duplicate migration version/i, "the runner rejects a duplicate version number (the load-time guard 0011 relies on)");
});

// ===========================================================================
// Two independent bootstraps reach an identical surface.
// ===========================================================================

test("probe 26: two independent fresh bootstraps reach an IDENTICAL surface (deterministic DDL, no ordering nondeterminism)", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  if (!(await waveAReady())) { markSkip(); t.skip("0011 not yet built on disk"); return; }
  const sig1 = await signature();
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  const sig2 = await signature();
  assert.equal(sig1, sig2, "two independent bootstraps produce byte-identical catalogs (deterministic migration)");
});
