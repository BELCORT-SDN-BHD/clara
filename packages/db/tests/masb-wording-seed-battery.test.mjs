// masb-wording-seed-battery.test.mjs -- owner task #43. Proves the two numbered migration files
// (0087_masb_wording_seed.sql, 0088_masb_wording_seed_lexicon.sql) land the verified MASB
// wording packet byte-faithfully through the audited door.
//
// NOT WIRED INTO THE PACKAGE-WIDE SKIP GATE FAMILY (no package.json edit -- this lane touches no
// shared file). Instead this file self-gates: a `before` hook reads whether the seed has landed
// (clara.statutory_wording row count) and every test calls `t.skip(...)` with a stated reason if
// not, exactly the house "LOUD skip, never a silent one" idiom (delta/epsilon/zeta preintegration
// gates, same shape). Now that both files carry real numbers above the merged frontier, the
// standard runner applies them on every `pnpm db:migrate` and this gate should always read
// "landed" in any post-merge run -- it is kept anyway as a defensive, self-contained regression
// check (proven directly: see the `before` hook's own comment) rather than removed as dead code,
// since a focused invocation of this one file against an older database is still a real scenario.
//
// FIXTURES ARE HAND-TRANSCRIBED FROM THE PACKET, NOT FROM THE MIGRATION. Every expected string
// below was typed by re-reading masb-wording-dossier-v1.md / masb-dossier-amendment-1.md /
// masb-dossier-amendment-2.md directly (the scratchpad path in the build brief), independently of
// packages/db/migrations/0087_masb_wording_seed*.sql. A copy-paste slip in the migration
// would show up here as a mismatch; a slip made identically in BOTH places would not -- which is
// exactly why cell D below (the tamper control) exists: to prove the comparison mechanism itself
// discriminates a one-character difference, not merely that two independently-typed strings agree.
//
// CELLS:
//   A. Every seeded statutory_wording / claim_phrase_lexicon / claim_policy_versions row reads
//      back byte-identical to its packet source (positive read, per-row).
//   B. Every packet row this migration HELD BACK reads back absent (positive read, per-row) --
//      ms notes.title, ms compliance_sentence, v2 ms/zh, sole-prop ms/zh.
//   C. The audited door's audit trail: clara.schema_migrations carries both files with non-null
//      checksums (the ledger IS the audit record for a migration-only curator write), and a
//      time-windowed, tamper-arm-proven probe shows zero clara.audit_log rows were minted during
//      this migration's own application window -- a probe proven able to say NO, not merely one
//      that always reads 0 (0067's own precedent: 0066/0067 never call clara._audit for their
//      seeds either).
//   D. Re-apply semantics: running either file's raw text again against the already-seeded
//      database REFUSES (CLR10), never silently no-ops -- proven by executing the actual shipped
//      SQL text, not by re-describing the prestate in JS.
//   E. Tamper control: corrupting a FIXTURE (not an already-fetched value) and re-running the
//      exact loop cell A calls proves that loop -- not merely node:assert's own primitive -- is
//      discriminating and not vacuously true.
//   F. THE CENSUS HAND-OFF (from epsilon-build, 2026-08-16): epsilon-claim-phase.mjs:344's exact
//      per-locale claim_phrase_lexicon census belonged to THIS migration's data, not to epsilon's
//      law, and was vacated here rather than left to rot mid-move. deepEqual, not >=, so a phrase
//      added or dropped without intent is a red test, not a silent drift. THE WHY, carried
//      forward in epsilon-build's own words: a locale whose lexicon has no effective row must
//      read as a REFUSAL to lane zeta's gate-3 scan, never as a pass -- so an invented Malay or
//      Chinese compliance phrase shows up as a failing test rather than a shipped guess.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rootQuery, getPool, endPool } from "./rig-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "migrations");
const FILE1 = join(MIGRATIONS_DIR, "0087_masb_wording_seed.sql");
const FILE2 = join(MIGRATIONS_DIR, "0088_masb_wording_seed_lexicon.sql");

let SEED_LANDED = false;

before(async () => {
  // SCOPED to the two REAL profiles this migration writes -- an unscoped count is not a stable
  // gate once another suite has landed rig-only wording. On a database predating 0087/0088 (a
  // focused run of this file alone, seeded from an older snapshot), epsilon-claim-phase's tests
  // (sorting before this file) COMMIT rig wording via seedVerifiedWording under
  // withActor({transaction:true}) (rig-helpers.mjs:127-144 -- commits, does not roll back), so an
  // unscoped count would read >0 even with 0087/0088 unapplied, and A1 would fail with rowCount 0
  // instead of the file skipping cleanly. Found by independent review 2026-08-16;
  // regression-proven by planting exactly this rig row on an unseeded DB and confirming 15 skips.
  const r = await rootQuery(
    "select count(*)::int as n from clara.statutory_wording where profile_key in ('mpers_company','convention_sole_prop')",
  );
  SEED_LANDED = r.rows[0].n > 0;
});

after(async () => {
  await endPool();
});

function skipIfNotLanded(t) {
  if (!SEED_LANDED) {
    t.skip(
      "owner task #43 masb wording seed (0087/0088_masb_wording_seed*.sql) not applied on this " +
        "database -- expected on a database migrated from an older snapshot. Migrate to the " +
        "current frontier and re-run to exercise this battery.",
    );
    return true;
  }
  return false;
}

// =====================================================================================
// FIXTURES -- transcribed from the packet, independently of the migration.
// =====================================================================================

// masb-wording-dossier-v1.md §1, mpers_company v1 (2016-01-01..2026-12-31) en. official_masb.
const EN_V1 = {
  "sofp.title": "Statement of Financial Position",
  "soci.title": "Statement of Comprehensive Income",
  "soce.title": "Statement of Changes in Equity",
  "scf.title": "Statement of Cash Flows",
  "notes.title": "Notes to the Financial Statements",
};

// masb-dossier-amendment-1.md item 2: "the five statement titles are IDENTICAL to MPERS(2016)".
// mpers_company v2 (2027-01-01..null) en. official_masb.
const EN_V2 = { ...EN_V1 };

// masb-wording-dossier-v1.md §1, mpers_company v1 ms (2016-01-01..2026-12-31). official_masb.
// NOT notes.title -- amendment-2.md Issue 1 demoted it (see fixture HELD_BACK below).
const MS_V1 = {
  "sofp.title": "Penyata Kedudukan Kewangan",
  "soci.title": "Penyata Pendapatan Komprehensif",
  "soce.title": "Penyata Perubahan Ekuiti",
  "scf.title": "Penyata Aliran Tunai",
};

// masb-wording-dossier-v1.md §1, mpers_company v1 zh (2016-01-01..2026-12-31).
// best_practice_translation. sofp/soci CONFIRMED unchanged by amendment-2.md's adjudications.
const ZH_V1 = {
  "sofp.title": "财务状况表",
  "soci.title": "综合收益表",
  "soce.title": "权益变动表",
  "scf.title": "现金流量表",
  "notes.title": "财务报表附注",
};

// masb-wording-dossier-v1.md §1, convention_sole_prop en (2016-01-01..null).
const SOLE_PROP_EN = {
  "sp.pl.title": "Profit and Loss Account",
  "sp.sofp.title": "Balance Sheet",
  "sp.capital.title": "Capital Account",
};

// masb-wording-dossier-v1.md §2 (name token) + amendment-2.md Issue 2 (compliance_sentence/zh
// stands unchanged; compliance_sentence/ms held back -- see HELD_BACK).
const LEXICON_ADDITIONS = [
  { phrase_key: "standard_full_name", locale: "ms", phrase: "Malaysian Private Entities Reporting Standard (MPERS)" },
  { phrase_key: "standard_full_name", locale: "zh", phrase: "马来西亚私人实体报告准则 (MPERS)" },
  { phrase_key: "compliance_sentence", locale: "zh", phrase: "本财务报表已根据马来西亚私人实体报告准则（MPERS）编制，并公允列报其财务状况与经营成果。" },
];

// masb-wording-dossier-v1.md §3 (base) REDRAFTED per masb-dossier-amendment-2.md Issue 3:
// ms "dakwaan pematuhan" -> "kenyataan pematuhan" (BOTH occurrences -- this lane's disclosed
// judgment call, see the migration file 2 header); zh "列报概况" -> "列报配置" (eligible only).
const CLAIM_LABELS_MS = {
  eligible: "Semakan profil pembentangan telah lulus.",
  not_applicable: "Tiada kenyataan pematuhan terpakai bagi kelas laporan ini.",
  stripped: "Kenyataan pematuhan dialih keluar: pek ini menyimpang daripada struktur yang ditetapkan.",
  failed: "Penilaian pematuhan gagal; pek ini tidak boleh dikeluarkan.",
};
const CLAIM_LABELS_ZH = {
  eligible: "列报配置检查已通过。",
  not_applicable: "此报告类别不适用合规声明。",
  stripped: "合规声明已移除：此报表包偏离规定结构。",
  failed: "合规评估未通过；此报表包不可出具。",
};

// Every packet row this migration explicitly HELD BACK -- must read back ABSENT.
const HELD_BACK_WORDING = [
  { profile_key: "mpers_company", wording_key: "notes.title", locale: "ms", from: "2016-01-01" },
  { profile_key: "mpers_company", wording_key: "sofp.title", locale: "ms", from: "2027-01-01" },
  { profile_key: "mpers_company", wording_key: "sofp.title", locale: "zh", from: "2027-01-01" },
  { profile_key: "convention_sole_prop", wording_key: "sp.pl.title", locale: "ms", from: "2016-01-01" },
  { profile_key: "convention_sole_prop", wording_key: "sp.pl.title", locale: "zh", from: "2016-01-01" },
];

// =====================================================================================
// CELL A -- byte-identical read-back. ONE shared loop (assertWordingBytesMatch) so cell E can
// tamper a FIXTURE and re-run the SAME code path A relies on -- proving the loop itself
// discriminates, not merely that node:assert's own primitive does (independent review 2026-08-16).
// =====================================================================================

async function assertWordingBytesMatch(profileKey, fixtures, locale, from) {
  for (const [key, expected] of Object.entries(fixtures)) {
    const r = await rootQuery(
      "select wording_text from clara.statutory_wording where profile_key=$1 and wording_key=$2 and locale=$3 and applies_to_periods_beginning_from=$4",
      [profileKey, key, locale, from],
    );
    assert.equal(r.rowCount, 1, `${key}/${locale}/${from} row must exist exactly once`);
    assert.strictEqual(r.rows[0].wording_text, expected, `${key}/${locale}/${from} byte-mismatch`);
  }
}

test("A1: mpers_company v1 en titles read back byte-identical to the packet", async (t) => {
  if (skipIfNotLanded(t)) return;
  await assertWordingBytesMatch("mpers_company", EN_V1, "en", "2016-01-01");
});

test("A2: mpers_company v2 en titles read back byte-identical (title-identical to v1, amendment-1 item 2)", async (t) => {
  if (skipIfNotLanded(t)) return;
  await assertWordingBytesMatch("mpers_company", EN_V2, "en", "2027-01-01");
});

test("A3: mpers_company v1 ms titles read back byte-identical (MASB glossary)", async (t) => {
  if (skipIfNotLanded(t)) return;
  await assertWordingBytesMatch("mpers_company", MS_V1, "ms", "2016-01-01");
});

test("A4: mpers_company v1 zh titles read back byte-identical", async (t) => {
  if (skipIfNotLanded(t)) return;
  await assertWordingBytesMatch("mpers_company", ZH_V1, "zh", "2016-01-01");
});

test("A5: convention_sole_prop en titles read back byte-identical", async (t) => {
  if (skipIfNotLanded(t)) return;
  await assertWordingBytesMatch("convention_sole_prop", SOLE_PROP_EN, "en", "2016-01-01");
});

test("A6: claim_phrase_lexicon ms/zh additions read back byte-identical", async (t) => {
  if (skipIfNotLanded(t)) return;
  for (const row of LEXICON_ADDITIONS) {
    const r = await rootQuery(
      "select phrase from clara.claim_phrase_lexicon where phrase_key=$1 and locale=$2 and version=1",
      [row.phrase_key, row.locale],
    );
    assert.equal(r.rowCount, 1, `${row.phrase_key}/${row.locale} row must exist exactly once`);
    assert.strictEqual(r.rows[0].phrase, row.phrase, `${row.phrase_key}/${row.locale} byte-mismatch`);
  }
});

test("A7: claim_policy_versions ms/zh status_labels read back byte-identical (all four states)", async (t) => {
  if (skipIfNotLanded(t)) return;
  const ms = await rootQuery(
    "select status_labels from clara.claim_policy_versions where policy_key='fs_claim_policy' and version=1 and locale='ms'",
  );
  assert.equal(ms.rowCount, 1, "fs_claim_policy/ms row must exist exactly once");
  assert.deepStrictEqual(ms.rows[0].status_labels, CLAIM_LABELS_MS, "ms status_labels byte-mismatch");

  const zh = await rootQuery(
    "select status_labels from clara.claim_policy_versions where policy_key='fs_claim_policy' and version=1 and locale='zh'",
  );
  assert.equal(zh.rowCount, 1, "fs_claim_policy/zh row must exist exactly once");
  assert.deepStrictEqual(zh.rows[0].status_labels, CLAIM_LABELS_ZH, "zh status_labels byte-mismatch");
});

// =====================================================================================
// CELL B -- held-back rows read back ABSENT (positive read).
// =====================================================================================

test("B1: every packet row this migration held back is absent", async (t) => {
  if (skipIfNotLanded(t)) return;
  for (const row of HELD_BACK_WORDING) {
    const r = await rootQuery(
      "select 1 from clara.statutory_wording where profile_key=$1 and wording_key=$2 and locale=$3 and applies_to_periods_beginning_from=$4",
      [row.profile_key, row.wording_key, row.locale, row.from],
    );
    assert.equal(r.rowCount, 0, `${row.profile_key}/${row.wording_key}/${row.locale}/${row.from} must be absent`);
  }
  const compMs = await rootQuery(
    "select 1 from clara.claim_phrase_lexicon where phrase_key='compliance_sentence' and locale='ms'",
  );
  assert.equal(compMs.rowCount, 0, "compliance_sentence/ms must be absent (amendment-2 Issue 2, no verbatim rebuild given)");

  // true_and_fair/ms: OUT OF THIS FILE'S ENUMERATION SCOPE (dossier §4, not §2's seed table --
  // see file 2's header, added per independent review 2026-08-16), NOT a fabrication risk. Held
  // for the owner sitting even though "benar dan patut" (CA2016 s.249(1)) is itself already fully
  // verified -- true_and_fair/en (0067's baseline) must still exist, proving this is a scoped
  // omission and not evidence the whole phrase_key silently vanished.
  const trueFairMs = await rootQuery(
    "select 1 from clara.claim_phrase_lexicon where phrase_key='true_and_fair' and locale='ms'",
  );
  assert.equal(trueFairMs.rowCount, 0, "true_and_fair/ms must be absent -- out of this file's dossier-§2 enumeration scope, held for the owner sitting");
  const trueFairEn = await rootQuery(
    "select 1 from clara.claim_phrase_lexicon where phrase_key='true_and_fair' and locale='en'",
  );
  assert.equal(trueFairEn.rowCount, 1, "true_and_fair/en (0067's baseline) must still exist -- the ms absence is scoped, not a dropped phrase_key");
});

test("B2: three-way row-count reconciliation matches the packet's disposed set", async (t) => {
  if (skipIfNotLanded(t)) return;
  // Scoped to the two REAL profiles this migration writes -- other suites in the same package
  // (epsilon-world.mjs's seedVerifiedWording, zeta-fixtures.mjs's driftWording) legitimately
  // insert rig-only rows into this same table under distinctly-prefixed "epsilon_rig_*" profile
  // keys (never "mpers_company"/"convention_sole_prop" -- see epsilon-world.mjs:7-12), so an
  // UNSCOPED count is not a stable assertion once other test files in the suite have run.
  const total = await rootQuery(
    "select count(*)::int as n from clara.statutory_wording where profile_key in ('mpers_company','convention_sole_prop')",
  );
  assert.equal(total.rows[0].n, 22, "clara.statutory_wording total (this migration's two real profiles) must be exactly 22");

  const fixtureCount =
    Object.keys(EN_V1).length + Object.keys(EN_V2).length + Object.keys(MS_V1).length +
    Object.keys(ZH_V1).length + Object.keys(SOLE_PROP_EN).length;
  assert.equal(fixtureCount, 22, "this file's own fixture table must also total 22 -- a fixture-side slip would show here");

  const lexicon = await rootQuery(
    "select count(*)::int as n from clara.claim_phrase_lexicon where locale in ('ms','zh') and phrase_key in ('standard_full_name','compliance_sentence')",
  );
  assert.equal(lexicon.rows[0].n, 3, "new claim_phrase_lexicon rows must be exactly 3");
  assert.equal(LEXICON_ADDITIONS.length, 3, "fixture lexicon table must also total 3");

  const policies = await rootQuery(
    "select count(*)::int as n from clara.claim_policy_versions where locale in ('ms','zh')",
  );
  assert.equal(policies.rows[0].n, 2, "new claim_policy_versions rows must be exactly 2");
});

// =====================================================================================
// CELL C -- the audited door's audit trail.
// =====================================================================================

test("C1: clara.schema_migrations carries both files with real (non-null) checksums", async (t) => {
  if (skipIfNotLanded(t)) return;
  const r = await rootQuery(
    "select version, checksum from clara.schema_migrations where version ~ 'masb_wording_seed' order by version",
  );
  assert.ok(r.rowCount >= 2, `expected at least 2 masb_wording_seed ledger rows, found ${r.rowCount}`);
  for (const row of r.rows) {
    assert.ok(row.checksum && row.checksum.length > 0, `${row.version} must carry a non-empty checksum`);
  }
});

test("C2: zero clara.audit_log rows were minted during this migration's own application window (positive read, with a tamper arm proving the probe can say NO)", async (t) => {
  if (skipIfNotLanded(t)) return;
  // PRIOR VERSION OF THIS CELL COULD NOT FAIL (independent review 2026-08-16): clara.audit_log.fn
  // holds FUNCTION names (draft_entry, approve_metric_definition, ...), never table names, so an
  // `fn ilike '%statutory_wording%'` can never match anything any writer ever names -- the probe
  // read 0 unconditionally, whether or not the invariant it claimed to test actually held.
  //
  // THIS VERSION bounds the read by TIME instead of by guessing what a matching row would look
  // like: nothing else can write to clara.audit_log inside the exact [file1.applied_at,
  // file2.applied_at] window in a serial, one-migration-at-a-time runner, so a non-zero count in
  // that window is real evidence of a spine-audit row this migration minted. The TAMPER ARM
  // proves the query mechanism can actually detect one -- inserted and rolled back, so no
  // permanent side effect -- because a probe that always reads 0 would pass this cell identically
  // whether the invariant holds or not; only a probe proven to fire on a planted violation earns
  // the "positive read" label.
  const versions = (await rootQuery(
    "select version, applied_at from clara.schema_migrations where version ~ 'masb_wording_seed' order by version",
  )).rows;
  assert.ok(versions.length >= 2, `expected at least 2 masb_wording_seed ledger rows, found ${versions.length}`);
  const windowStart = versions[0].applied_at;
  const windowEnd = versions[versions.length - 1].applied_at;
  assert.ok(windowStart <= windowEnd, "the ledger's own two applied_at timestamps must be in file order");

  const probeCount = async (queryable) => {
    const r = await queryable.query(
      "select count(*)::int as n from clara.audit_log where at >= $1 and at <= $2",
      [windowStart, windowEnd],
    );
    return r.rows[0].n;
  };

  assert.equal(
    await probeCount({ query: (sql, params) => rootQuery(sql, params) }),
    0,
    "no audit_log row was minted inside this migration's own application window -- migration-only curator writes bypass the per-firm event spine (0067's own precedent: 0066/0067 never call clara._audit for their seeds either)",
  );

  // TAMPER ARM. A synthetic row, `at` set EXPLICITLY inside the window (a real clara._audit()
  // call stamps now(), which by test time is long past the window -- so this has to bypass
  // _audit() and insert directly to simulate "if a spine-audit row HAD landed here"). No FK binds
  // firm_id, so any uuid is a legal not-null value for this synthetic row.
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into clara.audit_log(firm_id, actor, fn, at)
         values (gen_random_uuid(), clara.agent_user_id(), 'tamper_probe_c2_never_real', $1)`,
      [windowStart],
    );
    assert.equal(
      await probeCount(client),
      1,
      "control FAILED: the probe must count a synthetic row planted inside its own window, or it cannot say NO -- a probe that cannot fail proves nothing",
    );
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }

  // And the real database, post-rollback, still reads 0 -- the tamper left no trace.
  assert.equal(await probeCount({ query: (sql, params) => rootQuery(sql, params) }), 0);
});

// =====================================================================================
// CELL D -- re-apply semantics: REFUSES (proven by executing the real shipped SQL text).
// =====================================================================================

test("D1: re-running file 1's raw SQL text against the seeded database REFUSES (CLR10)", async (t) => {
  if (skipIfNotLanded(t)) return;
  const sql = readFileSync(FILE1, "utf8");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    let caught = null;
    try {
      await client.query(sql);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "file 1 re-apply must throw, not silently no-op or succeed");
    assert.equal(caught.code, "CLR10", `expected CLR10, got ${caught.code ?? "(none)"} -- ${caught.message}`);
    assert.match(caught.message, /already carries/i, "refusal must be the idempotency-guard message, not an unrelated failure");
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
});

test("D2: re-running file 2's raw SQL text against the seeded database REFUSES (CLR10)", async (t) => {
  if (skipIfNotLanded(t)) return;
  const sql = readFileSync(FILE2, "utf8");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    let caught = null;
    try {
      await client.query(sql);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, "file 2 re-apply must throw, not silently no-op or succeed");
    assert.equal(caught.code, "CLR10", `expected CLR10, got ${caught.code ?? "(none)"} -- ${caught.message}`);
    // ANY of file 2's own three CLR10 guards is acceptable proof of refusal -- which one actually
    // fires depends on live, unscoped counts this test does not control: the ordering guard
    // ("clara.statutory_wording carries % rows, expected 22") if that count has moved off 22 for
    // any reason; the BASELINE guard ("clara.claim_phrase_lexicon has % rows (expected 6...")
    // fires immediately on a re-apply right after a real success, since file 2's own first run
    // already moved lexicon 6->9 and policies 1->3 -- the realistic firing order this cell hit in
    // practice; the idempotency guard ("already present"/"has run before") if somehow neither
    // earlier guard caught it. All three are genuine CLR10 refusals of a re-apply, never a silent
    // no-op or a success -- which is the property this cell proves, not which specific guard wins.
    assert.match(
      caught.message,
      /already present|has run before|requires file 1.*applied first|baseline mismatch/i,
      "refusal must be one of file 2's own CLR10 guard messages",
    );
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
});

// =====================================================================================
// CELL E -- tamper control: proves the A-LOOP ITSELF (assertWordingBytesMatch, the exact code
// path A1-A5 run) is discriminating -- not merely that node:assert's own strictEqual primitive
// is. Corrupting a value already fetched from the DB and then comparing it to itself (the
// original shape of this cell) proves nothing about OUR pipeline: it never touches a fixture, so
// a bug that made every fixture equal "" would still pass it. This version tampers a FIXTURE and
// re-runs the real loop against it (independent review 2026-08-16).
// =====================================================================================

test("E1: tampering a FIXTURE makes the A-loop itself go red (control cell)", async (t) => {
  if (skipIfNotLanded(t)) return;

  // Corrupt the LAST character of one fixture value, multi-byte-safe (code points, not UTF-16
  // code units, so this stays correct even though none of the packet's zh text needs it).
  const original = ZH_V1["sofp.title"];
  const chars = Array.from(original);
  const lastIdx = chars.length - 1;
  chars[lastIdx] = chars[lastIdx] === "X" ? "Y" : "X";
  const tamperedFixtures = { ...ZH_V1, "sofp.title": chars.join("") };
  assert.notStrictEqual(tamperedFixtures["sofp.title"], original, "the tamper must actually change the fixture, or this control proves nothing");

  await assert.rejects(
    () => assertWordingBytesMatch("mpers_company", tamperedFixtures, "zh", "2016-01-01"),
    assert.AssertionError,
    "control FAILED: assertWordingBytesMatch (the SAME function A1-A5 call) must reject a tampered fixture -- if this does not throw, cell A's byte-compare is not discriminating",
  );

  // And the REAL, untampered fixture still clears the identical loop -- proving the rejection
  // above was caused by the tamper, not by an unrelated break in the loop or the connection.
  await assertWordingBytesMatch("mpers_company", ZH_V1, "zh", "2016-01-01");
});

// =====================================================================================
// CELL F -- the census hand-off (epsilon-build vacated this from epsilon-claim-phase.mjs:344 on
// 2026-08-16: "an assertion about YOUR data... belongs beside it"). Exact per-locale
// claim_phrase_lexicon census, POST-seed. deepEqual, not >=: a phrase silently added or dropped
// is a red test, never a quiet drift.
// =====================================================================================

test("F1: exact per-locale claim_phrase_lexicon census, post-seed", async (t) => {
  if (skipIfNotLanded(t)) return;
  const lexicon = (await rootQuery(
    `select locale, count(*)::int n,
            coalesce(string_agg(distinct phrase_key, ',' order by phrase_key), '') keys
       from clara.claim_phrase_lexicon group by locale order by locale`,
  )).rows;
  assert.deepEqual(
    lexicon,
    [
      { locale: "en", n: 4, keys: "compliance_sentence,standard_full_name,standard_name_token,true_and_fair" },
      { locale: "ms", n: 2, keys: "standard_full_name,standard_name_token" },
      { locale: "zh", n: 3, keys: "compliance_sentence,standard_full_name,standard_name_token" },
    ],
    // WHY, carried forward verbatim from the cell's original author (epsilon-build): a locale
    // whose lexicon has no effective row must read as a REFUSAL to lane zeta's gate-3 scan, never
    // as a pass -- so an invented Malay or Chinese compliance phrase shows up as a failing test
    // here rather than as a shipped guess. ms still lacks compliance_sentence (held back, cell B)
    // -- that absence is exactly what keeps ms's gate-3 scan a refusal rather than a pass.
    "exact per-locale lexicon census must match -- a silent add/drop of a phrase_key is the failure this cell exists to catch",
  );
});
