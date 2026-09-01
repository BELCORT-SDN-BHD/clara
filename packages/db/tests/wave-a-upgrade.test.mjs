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

/** The max clara.taxonomy_versions.version right after a migrate() run returns — read as
 *  the VERY FIRST thing so the window it can race a concurrent writer in is one round-trip,
 *  not the seven-plus round-trips signature() itself takes before it reaches the taxonomy
 *  section. See the #485/#490 comment on the taxonomy query inside signature() below. */
async function taxonomyBaselineVersion() {
  return Number((await rootQuery("select coalesce(max(version), 0) as v from clara.taxonomy_versions")).rows[0].v);
}

/** A deterministic catalog SIGNATURE of schema clara — the Codex-26 dump surface.
 *  `baselineVersion` is the value `taxonomyBaselineVersion()` observed for THIS migrate
 *  run — required, never re-derived here (see the #485/#490 comment below). */
async function signature(baselineVersion) {
  const parts = [];
  const q = async (label, sql, params) => { const r = await rootQuery(sql, params); parts.push(`## ${label}\n` + r.rows.map((x) => JSON.stringify(x)).join("\n")); };
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
  // Scoped against the #485/#490 class (committed estate-global taxonomy writes vs
  // pointer-resolving/unscoped-roster reads under `pnpm -r` concurrency — both halves
  // must hold; packages/runtime/tests/relay-taxonomy.test.mjs's own private-database
  // hardening is the other half). An UNSCOPED `select * from clara.trigger_taxonomy`
  // reads every version ever inserted, so ANY concurrent writer minting a brand-new
  // version — exactly what relay-taxonomy's own (f) flip cell used to do against this
  // SAME shared database — makes the "fresh" and "upgrade" catalog captures diverge by
  // row count alone: a false red having nothing to do with the migration under test.
  // Hardened regardless of which writer it was, since any concurrent insert breaks an
  // unscoped snapshot the same way. The estate's own immune exemplars for a
  // scoped-vs-unscoped taxonomy read: Set-dedup (x38-wave-c-b-bank.test.mjs:2149 —
  // `event_type = any($1)` narrows to the exact types under test, then a `new
  // Set(...).size` dedups across versions) and highest-version + existence
  // (wave-b/wb-0020-events.test.mjs:63 — `order by version desc limit 1`, existence
  // only). Neither fits here unchanged: this cell needs the full (version, event_type,
  // decision) SHAPE compared across two independent migration paths, not a presence
  // check against a closed list of named types — weakening it to existence-only would
  // drop the very thing probe 26 exists to prove. So the third option: scope the
  // snapshot to the versions the migration run just under test actually established.
  //
  // A bound computed AS A LIVE SUBQUERY here (`<= (select max(version) from
  // taxonomy_versions)`) is NOT enough, despite running in the same statement/snapshot —
  // a concurrent writer's INSERT that already COMMITTED at any point since migrate()
  // returned (there are SEVEN other round-trips in this function before execution ever
  // reaches this line: functions/tables/table_acls/columns/policies/triggers/constraints)
  // is already visible to a live subquery too, so it would be counted right along with
  // the legitimate rows (measured empirically: a live-subquery bound still diverged
  // fresh-vs-upgrade under the RED-before repro, because the concurrent writer commits
  // BEFORE this statement even starts, not during it). The bound has to be a VALUE the
  // caller observed immediately after ITS OWN migrate() returned — `baselineVersion`,
  // threaded in as `$1` — so anything a concurrent writer commits AFTER that observation,
  // no matter how many round-trips later this query actually runs, is excluded.
  await q(
    "taxonomy",
    `select tt.version, tt.event_type, tt.decision from clara.trigger_taxonomy tt
       where tt.version <= $1
       order by tt.version, tt.event_type`,
    [baselineVersion],
  );
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
  const freshBaseline = await taxonomyBaselineVersion(); // observed FIRST — see signature()'s taxonomy comment
  await surfaceClean();
  const sigFresh = await signature(freshBaseline);
  // UPGRADE: reset → migrate 0001→0010 → migrate ALL (applies only 0011).
  await reset({ log: () => {} });
  await migrate({ dir: exportUpTo(10), log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  const upgradeBaseline = await taxonomyBaselineVersion();
  await surfaceClean();
  const sigUpgrade = await signature(upgradeBaseline);
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
  const baseline1 = await taxonomyBaselineVersion();
  const sig1 = await signature(baseline1);
  await reset({ log: () => {} });
  await migrate({ dir: MIG_DIR, log: () => {} });
  const baseline2 = await taxonomyBaselineVersion();
  const sig2 = await signature(baseline2);
  assert.equal(sig1, sig2, "two independent bootstraps produce byte-identical catalogs (deterministic migration)");
});
