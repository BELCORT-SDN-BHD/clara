// Wave D-a — the 0041 UPGRADE / DEPLOY-ONTO-EXISTING DRILL. The x37-0037-upgrade
// idiom (the canonical exemplar), applied to 0041's OWN deploy risk.
//
// WHY THIS FILE EXISTS AT ALL. The in-suite x41 battery applies 0041 to a schema that
// carries only what its own cells build AFTERWARDS. Every register-touching claim it
// makes is therefore a claim about rows 0041 has already seen. But 0041's real risk is
// the ceremony: a shared database with FOUR live firms, a K-seeded fixed-asset
// register, ordinary approved history on accounts that are about to be enrolled, and
// a `_draft_opening_item_core` / `_assert_fa_baseline` pair that must keep working
// afterwards. None of that is reachable from an empty-schema apply.
//
// This drill does what CI otherwise never does: applies 0001→0040, builds a REAL book
// through the audited verbs (a K-seeded straight-line fixed asset carried in with
// accumulated depreciation and its whole opening set approved · ordinary approved
// entries that DEBIT the account 0041 will later enrol · a reversal pair over one of
// them), and only then applies 0041 onto it.
//
// AND WHAT IT ASSERTS, post-apply:
//   1. NOTHING BIRTHS RETROACTIVELY — the register still holds exactly the K row; the
//      pre-0041 acquisitions on the soon-to-be-enrolled account minted nothing.
//   2. THE BASELINE + LEDGER TIE — the carried asset's baseline survives byte-exact,
//      the new fa_depreciation ledger is EMPTY, and the register still ties to the GL.
//   3. THE BELT HONOURS THE WATERMARK — after enrolment, a PRE-enrolment entry on the
//      newly enrolled account is still reversible (the round-2 fold-5 trap: enrolling
//      an account with history must not make its history un-reversible).
//   4. THE K6 DOOR STILL OPENS — a supersede/correction on an untouched opening item
//      is still admitted after the `_assert_fa_baseline` recut.
//   5. THE WIDENED METHOD CHECK + THE CARRY-DOWN RECUT accept `reducing_balance` and
//      `none` post-apply — the CLR31 sites really widened (WD-R3), on a database that
//      already carried a straight-line carry-down.
//
// RESET-GATED (it drops schema clara), so it SKIPS in the concurrent all-packages
// sweep — `node --test` runs files concurrently against one shared database and a
// mid-run schema drop would nuke the others — and it is wired as its OWN CI step
// against its OWN throwaway database. Run it ALONE:
//   PGDATABASE=clara_x41_upgrade_ci CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1 \
//     CLARA_RIG_DB=1 node --test tests/x41-0041-upgrade.test.mjs
//
// CONTRACT-BLIND: authored from the D-a design of record + the pinned 0041 interface,
// never from 0041's SQL.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rootQuery, humanQuery, namedCall, opk, noteLane,
  endPool, printLaneNotes, freshResolution, draftEntryV3, approveEntry, reverseEntry,
  createClient, upsertAccountClassed, grantConsent, firmOf,
} from "./a21-helpers.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

after(async () => {
  printLaneNotes("x41-0041-upgrade");
  await endPool();
});

const RESET_OK = process.env.CLARA_RIG_ALLOW_RESET === "1";
const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Copy 0001–0040 (NOT 0041) into a throwaway dir for the partial migrate. */
function exportPre0041() {
  const tmp = mkdtempSync(join(tmpdir(), "clara-pre0041-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^00(0[1-9]|[12][0-9]|3[0-9]|40)_.*\.sql$/.test(f)) copyFileSync(join(MIG_DIR, f), join(tmp, f));
  }
  return tmp;
}

function skipUnlessReset(t) {
  if (!RESET_OK) {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an ISOLATED DB to run ALONE");
    return true;
  }
  return false;
}

async function freshDb() {
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0041(), log: () => {} });
  return { migrate };
}

// The drill's own chart — grepped clean against every other battery's codes.
const U_COST = "200-U41";
const U_ACCUM = "210-U41";
const U_EXPN = "900-U41";
const U_BANK = "100-U41";
const U_OTHER = "600-U41";
const U_SHARE = "910-U41";

// ---------------------------------------------------------------------------
// DB-clock anchors. `migrate`/`reset` reconnect the same pool, so the anchor is read
// AFTER the pre-0041 chain lands. Pure integer month arithmetic thereafter — never a
// calendar literal (the a21-watch-anchors rot guard).
// ---------------------------------------------------------------------------

let ANCHOR = null;
const pad2 = (n) => String(n).padStart(2, "0");
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dstr = (y, m, d) => `${y}-${pad2(m)}-${pad2(Math.min(d, daysIn(y, m)))}`;
async function readAnchor() {
  const r = await rootQuery(
    "select extract(year from d)::int as y, extract(month from d)::int as m from (select (now() at time zone 'Asia/Kuala_Lumpur')::date as d) s",
  );
  ANCHOR = { y: r.rows[0].y, m: r.rows[0].m };
  return ANCHOR;
}
function mon(n) {
  const total = ANCHOR.y * 12 + (ANCHOR.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return { y, m, start: dstr(y, m, 1), end: dstr(y, m, daysIn(y, m)) };
}
const dayIn = (mm, d) => dstr(mm.y, mm.m, d);

// ---------------------------------------------------------------------------
// Small probes + readbacks.
// ---------------------------------------------------------------------------

const tableExists = async (name) =>
  (await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
    [name])).rowCount > 0;
const columnExists = async (table, column) =>
  (await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name=$2",
    [table, column])).rowCount > 0;
const faRows = async (client) =>
  (await rootQuery("select to_jsonb(f) as row from clara.fixed_assets f where f.client_id=$1 order by f.created_at, f.id", [client]))
    .rows.map((x) => x.row);
const entryRowOf = async (entry) =>
  (await rootQuery("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0]?.row ?? null;
const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const humanCall = async (sub, fn, specs, vals) =>
  (await humanQuery(sub, namedCall(fn, specs), vals)).rows[0].result;

const upsertFaProfile = (sub, { client, assetAccount, accumAccount = null, expenseAccount = null, opKey = null }) =>
  humanCall(sub, "upsert_fa_account_profile", [
    { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
    { name: "p_depr_expense_account" }, { name: "p_op_key" },
  ], [client, assetAccount, accumAccount, expenseAccount, opKey ?? opk("u41enrol")]);

const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

async function approvedEntry(sub, { client, lines, memo, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), lines, memo, postingDate, opKey: opk("u41draft"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("u41apr") });
  return d.entry_id;
}

async function buildChart(sub, client) {
  for (const [code, name, type] of [
    [U_COST, "Plant & Machinery (u41)", "asset"],
    [U_ACCUM, "Accum Depreciation (u41)", "asset"],
    [U_EXPN, "Depreciation Expense (u41)", "expense"],
    [U_BANK, "Bank (u41)", "asset"],
    [U_OTHER, "Sundry Expense (u41)", "expense"],
    [U_SHARE, "Share Capital (u41)", "equity"],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, opKey: opk("u41coa") });
  }
}

/** The K-seeded carry-down register row, built entirely through the audited K verbs
 *  on a database that has NEVER seen 0041. */
async function seedCarryDownAsset(w, {
  label, method = "straight_line", rateBps = null, accum = 100_000, land = false,
}) {
  const o = await wb.onboardingClient(w.users.hana, `u41k_${label}_${randomUUID().slice(0, 6)}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  await buildChart(w.users.alice, o.client);
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const asOf = mon(-6).end;
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, asOf, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = sr.seed_id ?? sr.id;
  const cost = 500_000;
  // [ASSEMBLY] The three carry-down shapes the migration lane flagged as UNEXERCISED are
  // parameters here, so the drill proves each one THROUGH the audited K verb rather than
  // through a raw CHECK probe: an RB rate (the shipped envelope key `depreciation_rate_bps`,
  // adjudication A5), a ZERO carried accumulation (no accum leg to write), and LAND (method
  // 'none' with NEITHER an accum nor an expense account, and therefore no accum leg).
  const asset = {
    description: `Delivery van (u41 ${label})`, acquired_date: mon(-24).start, cost_cents: cost,
    depreciation_method: method,
    asset_account_code: U_COST,
    accum_depr_account_code: land ? null : U_ACCUM,
    depr_expense_account_code: land ? null : U_EXPN,
    accumulated_depreciation_cents: accum, depreciation_start_date: mon(-24).start,
    residual_cents: 0, item_key: `fa:u41${label}`,
  };
  if (method !== "none") asset.useful_life_months = 60;
  if (rateBps != null) asset.depreciation_rate_bps = rateBps;
  const receipt = await wb.seedFixedAsset(w.users.bob, { client: o.client, seed, asset });
  const assetId = receipt.fixed_asset_id ?? receipt.asset_id ?? receipt.id;
  assert.ok(assetId, `seed_fixed_asset minted the pre-0041 register row (got ${JSON.stringify(receipt)})`);

  const nbv = cost - accum;
  await wb.recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: U_COST, source_label: "fa cost", debit_cents: cost, credit_cents: 0 },
    // a ZERO carried accumulation writes NO accum leg at all — the target set must match
    ...(accum > 0 ? [{ line_key: "faacc", account_code: U_ACCUM, source_label: "fa accum", debit_cents: 0, credit_cents: accum }] : []),
    { line_key: "cap", account_code: U_SHARE, source_label: "share capital", debit_cents: 0, credit_cents: nbv },
  ] });
  const cap = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: U_SHARE, debit_cents: 0, credit_cents: nbv }],
  });
  const faEntry = await entryRowOf((await faRows(o.client)).find((r) => r.id === assetId).acquisition_entry_id);
  await wb.approveOpeningSeed(w.users.hana, {
    seed, planRevision: await wb.planRevision(o.plan), tieSha256: doc.sha256,
    entryRevisions: wb.revMapOf([cap, { entry_id: faEntry.id, revision_token: faEntry.revision_token }]),
    opKey: opk("u41kapr"),
  });
  return { client: o.client, plan: o.plan, seed, doc, assetId, asOf, cost, accum };
}

/** The legs of a carry-down's own acquisition entry. */
async function faSeedLegs(client, assetId) {
  const row = (await faRows(client)).find((r) => r.id === assetId);
  return (await rootQuery(
    "select account_code, debit_cents, credit_cents from clara.journal_lines where entry_id=$1 order by line_no",
    [row.acquisition_entry_id])).rows;
}

// ===========================================================================
// THE DRILL.
// ===========================================================================

test("0041 upgrade drill: a populated pre-0041 book (a K-seeded register + ordinary history on a soon-to-be-enrolled account) survives the apply — nothing births retroactively, the baseline ties, the watermark holds, K6 still opens, and the widened method CHECK accepts RB and none", async (t) => {
  if (skipUnlessReset(t)) return;
  const { migrate } = await freshDb();
  await readAnchor();

  // ---- 1. THE PRE-STATE. -------------------------------------------------
  assert.equal(await tableExists("fa_depreciation"), false, "the drill really starts pre-0041 (clara.fa_depreciation absent)");
  assert.equal(await tableExists("fa_account_profiles"), false, "…and fa_account_profiles absent");
  assert.equal(await columnExists("fixed_assets", "acquisition_line_id"), false, "…and the birth-identity column absent");
  assert.equal(await columnExists("clients", "fy_end_month"), false, "…and the client FY columns absent");

  // ---- 2. A REAL BOOK, through the audited verbs. -------------------------
  const w = await wb.buildWaveBWorld();
  const sub = w.users.alice;
  const k = await seedCarryDownAsset(w, { label: "main" });
  const firm = await firmOf(k.client);
  await grantConsent(sub, { firm, client: k.client }).catch(() => {});
  // [ASSEMBLY] A K-seeded client stays 'onboarding' after approve_opening_seed, and the
  // operational drafter refuses a non-active client (WB-R1). No audited activation verb
  // exists, so the rig flips it the wb-0018-commit-reasons way — the established idiom for
  // "the takeover finished and the client went live", which is exactly the corpus this drill
  // needs: a POPULATED, operating book that 0041 then lands on.
  await rootQuery("update clara.clients set status='active' where id=$1", [k.client]);

  // Ordinary approved history that DEBITS the account 0041 will later enrol — the
  // exact corpus the enrolment watermark exists for.
  const hist1 = await approvedEntry(sub, {
    client: k.client, memo: "u41 pre-0041 machine purchase", postingDate: dayIn(mon(-4), 6),
    lines: [
      { account_code: U_COST, debit_cents: 220_000, credit_cents: 0, description: "machine" },
      { account_code: U_BANK, debit_cents: 0, credit_cents: 220_000, description: "paid" },
    ],
  });
  const hist2 = await approvedEntry(sub, {
    client: k.client, memo: "u41 pre-0041 second machine", postingDate: dayIn(mon(-3), 9),
    lines: [
      { account_code: U_COST, debit_cents: 130_000, credit_cents: 0, description: "machine 2" },
      { account_code: U_BANK, debit_cents: 0, credit_cents: 130_000, description: "paid" },
    ],
  });
  // …and a hand depreciation journal on the accum/expense pair (the roles the belt
  // will cover), plus an ordinary reversal pair, so the corpus is genuinely mixed.
  const hist3 = await approvedEntry(sub, {
    client: k.client, memo: "u41 pre-0041 hand depreciation", postingDate: dayIn(mon(-2), 28),
    lines: [
      { account_code: U_EXPN, debit_cents: 8_000, credit_cents: 0, description: "depreciation" },
      { account_code: U_ACCUM, debit_cents: 0, credit_cents: 8_000, description: "accum" },
    ],
  });
  const throwaway = await approvedEntry(sub, {
    client: k.client, memo: "u41 pre-0041 sundry", postingDate: dayIn(mon(-2), 3),
    lines: [
      { account_code: U_OTHER, debit_cents: 2_500, credit_cents: 0, description: "dr" },
      { account_code: U_BANK, debit_cents: 0, credit_cents: 2_500, description: "cr" },
    ],
  });
  await reverseEntry(sub, { entry: throwaway, reason: "u41 pre-0041 reversal", opKey: opk("u41rev") });

  // ---- 3. NON-TRIVIALITY BEFORE THE APPLY. -------------------------------
  const preAssets = await faRows(k.client);
  assert.equal(preAssets.length, 1, "the pre-0041 register holds exactly the K-seeded row");
  const preRow = preAssets[0];
  assert.equal(Number(preRow.accumulated_depreciation_cents), k.accum, "…carrying its carried accumulated depreciation");
  const preLines = (await rootQuery(
    "select count(*)::int as n from clara.journal_lines where client_id=$1 and account_code=any($2)",
    [k.client, [U_COST, U_ACCUM, U_EXPN]])).rows[0].n;
  assert.ok(preLines >= 6, `the corpus is NON-TRIVIAL: ${preLines} pre-0041 lines already sit on the three FA-role accounts`);
  const preGlCost = (await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n from clara.journal_lines l
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'`, [k.client, U_COST])).rows[0].n;
  assert.equal(Number(preGlCost), k.cost + 220_000 + 130_000, "…and the pre-apply GL cost balance is what the book says");

  // ---- 4. THE APPLY. -----------------------------------------------------
  await migrate({ dir: MIG_DIR, log: () => {} });
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.schema_migrations where version ~ '^0041_'")).rows[0].n,
    1, "0041 applied onto the populated book");

  // ---- 5. NOTHING BIRTHS RETROACTIVELY. ----------------------------------
  const postAssets = await faRows(k.client);
  assert.equal(postAssets.length, 1,
    `0041 births NOTHING retroactively — the register still holds exactly the K row (got ${postAssets.length})`);
  assert.equal(postAssets[0].id, preRow.id, "…and it is the same row");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.fa_depreciation")).rows[0].n, 0,
    "the new charge ledger is EMPTY — rows are minted ONLY by the approve-time hook, never by a backfill");
  assert.equal(
    (await rootQuery("select count(*)::int as n from clara.fa_account_profiles")).rows[0].n, 0,
    "no account is auto-enrolled — enrolment is an explicit human act (design §1.2)");

  // ---- 6. THE BASELINE + LEDGER TIE. -------------------------------------
  assert.equal(Number(postAssets[0].accumulated_depreciation_cents), k.accum, "the carried baseline survives byte-exact");
  assert.equal(postAssets[0].baseline_as_of, preRow.baseline_as_of, "…and baseline_as_of is untouched");
  assert.equal(postAssets[0].depreciation_method, "straight_line", "…and the carried method survives the CHECK widening");
  assert.equal(postAssets[0].acquisition_line_id ?? null, null,
    "the new birth-identity column lands NULL on pre-existing rows (no invented line identity)");
  assert.equal(postAssets[0].effective_from ?? null, null, "…and effective_from lands NULL (the as-of rule falls back to acquired_date)");
  const postGlCost = (await rootQuery(
    `select coalesce(sum(l.debit_cents - l.credit_cents),0)::bigint as n from clara.journal_lines l
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and l.account_code=$2 and e.status='approved'`, [k.client, U_COST])).rows[0].n;
  assert.equal(Number(postGlCost), Number(preGlCost), "the GL is untouched by the apply — 0041 moves no money");

  // ---- 7. THE ENROLMENT WATERMARK. ---------------------------------------
  await upsertFaProfile(sub, { client: k.client, assetAccount: U_COST, accumAccount: U_ACCUM, expenseAccount: U_EXPN });
  assert.equal((await faRows(k.client)).length, 1,
    "enrolling an account WITH pre-0041 history births nothing retroactively (design §1.2)");
  const prof = (await rootQuery(
    "select to_jsonb(p) as row from clara.fa_account_profiles p where p.client_id=$1 and p.active", [k.client])).rows[0].row;
  assert.ok(prof.enrolled_at, "the profile carries the enrolled_at watermark");

  // THE ROUND-2 FOLD-5 TRAP: a PRE-enrolment approved entry on the now-enrolled
  // account must still be reversible (its reversed_by UPDATE re-fires the belt).
  for (const [label, entry] of [["a cost-leg acquisition", hist1], ["a hand depreciation journal", hist3]]) {
    const err = await caught(() => reverseEntry(sub, { entry, reason: `u41 watermark ${label}`, opKey: opk("u41water") }));
    assert.equal(err, null,
      `${label} approved BEFORE enrolment is still reversible after it (got ${err?.code} — ${err?.message})`);
    // [ASSEMBLY] the house reversal law (reverse_entry, pre-0041): a reversed ORIGINAL stays
    // 'approved' and records the reversal in reversed_by — the reversed_by UPDATE is exactly
    // what re-fires the belt, so its landing at all is what this trap measures.
    assert.ok((await entryRowOf(entry)).reversed_by, `…and ${label} really recorded its reversal`);
  }
  // …while a POST-enrolment hand journal on the same account is now refused by name.
  const beltErr = await caught(() => approvedEntry(sub, {
    client: k.client, memo: "u41 post-enrolment hand journal", postingDate: dayIn(mon(-1), 7),
    lines: [
      { account_code: U_ACCUM, debit_cents: 1_000, credit_cents: 0, description: "hand write-back" },
      { account_code: U_OTHER, debit_cents: 0, credit_cents: 1_000, description: "sundry" },
    ],
  }));
  assert.ok(beltErr, "a POST-enrolment hand journal on the enrolled accum account is refused — the belt is live");
  assert.ok(`${beltErr.message} ${beltErr.detail ?? ""}`.includes("fa_belt_unregistered_movement"),
    `…by name (got code=${beltErr.code} detail=${beltErr.detail ?? ""} — ${beltErr.message})`);
  noteLane(`u41 watermark: hist2 (${hist2}) left approved deliberately — the corpus keeps a live pre-enrolment cost leg`);

  // ---- 8. THE K6 DOOR STILL OPENS. ---------------------------------------
  const items = (await rootQuery(
    "select to_jsonb(i) as row from clara.opening_items i where i.seed_id=$1", [k.seed])).rows.map((x) => x.row);
  const glItem = items.find((i) => i.item_kind === "gl_balance");
  assert.ok(glItem, "the opening set carries an ordinary gl_balance item to correct");
  const k6 = await caught(() => wb.supersedeOpeningItem(w.users.bob, {
    item: glItem.id,
    replacement: {
      item: { item_kind: "gl_balance", item_key: `${glItem.item_key}:v2` },
      lines: [{ account_code: U_SHARE, debit_cents: 0, credit_cents: Number(glItem.amount_cents) }],
    },
    opKey: opk("u41k6"),
  }));
  if (k6) {
    assert.ok(!`${k6.message} ${k6.detail ?? ""}`.includes("fixed_asset_lifecycle_advanced"),
      `the K6 door still opens for an UNTOUCHED item — it must not carry the FA lifecycle guard (got ${k6.message})`);
    noteLane(`u41 K6: the untouched-item supersede refused for an unrelated reason (${k6.code}) — recorded`);
  }

  // ---- 9. THE WIDENED METHOD CHECK + THE CARRY-DOWN RECUT. ---------------
  // (a) THE RB CARRY-DOWN, WITH A RATE — through the audited K verb, not a raw probe.
  const rb = await seedCarryDownAsset(w, { label: "rb", method: "reducing_balance", rateBps: 2000 });
  const rbRow = (await faRows(rb.client)).find((r) => r.id === rb.assetId);
  assert.equal(rbRow.depreciation_method, "reducing_balance",
    "the carry-down accepts reducing_balance post-apply — the CLR31 refusal sites really widened (WD-R3)");
  assert.equal(Number(rbRow.depreciation_rate_bps), 2000,
    "…carrying the annual rate the envelope stated (the RB driver trio: life AND rate)");
  assert.equal(Number(rbRow.accumulated_depreciation_cents), 100_000, "…and its carried baseline");
  noteLane("u41 carry-down shape (a): reducing_balance @ 2000bps accepted through seed_fixed_asset");

  // (b) A ZERO-ACCUMULATED CARRY-DOWN — an asset taken over at cost, whose opening entry
  // has NO accum leg to write.
  const zero = await seedCarryDownAsset(w, { label: "zero", accum: 0 });
  const zeroRow = (await faRows(zero.client)).find((r) => r.id === zero.assetId);
  assert.equal(Number(zeroRow.accumulated_depreciation_cents), 0, "a ZERO-accumulated carry-down survives the recut");
  const zeroLegs = await faSeedLegs(zero.client, zero.assetId);
  assert.ok(zeroLegs.some((l) => l.account_code === U_COST), "…its opening entry carries the cost leg");
  assert.ok(!zeroLegs.some((l) => l.account_code === U_ACCUM),
    `…and OMITS the accumulated leg entirely (zero-amount legs are never written) — got ${JSON.stringify(zeroLegs)}`);
  noteLane("u41 carry-down shape (b): zero-accumulated asset accepted, accum leg omitted");

  // (c) LAND — method 'none' with NEITHER an accum nor an expense account (design §1.2's
  // both-or-neither non-depreciable shape), so the opening entry again omits the accum leg.
  const none = await seedCarryDownAsset(w, { label: "none", method: "none", accum: 0, land: true });
  const noneRow = (await faRows(none.client)).find((r) => r.id === none.assetId);
  assert.equal(noneRow.depreciation_method, "none",
    "the carry-down accepts method 'none' post-apply (land / non-depreciables, MPERS 17.16)");
  assert.equal(noneRow.accum_depr_account_code, null, "…with NO accumulated account");
  assert.equal(noneRow.depr_expense_account_code, null, "…and NO expense account (both-or-neither)");
  assert.equal(noneRow.useful_life_months, null, "…and neither driver (method 'none' carries no life)");
  const landLegs = await faSeedLegs(none.client, none.assetId);
  assert.ok(!landLegs.some((l) => l.account_code === U_ACCUM),
    `…and the opening entry omits the accum leg — got ${JSON.stringify(landLegs)}`);
  noteLane("u41 carry-down shape (c): land (method 'none', NULL accum+expense) accepted, accum leg omitted");

  // ---- 10. THE LIVE SYSTEM STILL WORKS GOING FORWARD. --------------------
  const fresh = await createClient(sub, { name: `u41_post_${randomUUID().slice(0, 6)}`, opKey: opk("u41cli") });
  await buildChart(sub, fresh);
  await grantConsent(sub, { firm, client: fresh }).catch(() => {});
  await upsertFaProfile(sub, { client: fresh, assetAccount: U_COST, accumAccount: U_ACCUM, expenseAccount: U_EXPN });
  await approvedEntry(sub, {
    client: fresh, memo: "u41 post-apply acquisition", postingDate: dayIn(mon(-1), 14),
    lines: [
      { account_code: U_COST, debit_cents: 60_000, credit_cents: 0, description: "new machine" },
      { account_code: U_BANK, debit_cents: 0, credit_cents: 60_000, description: "paid" },
    ],
  });
  const born = await faRows(fresh);
  assert.equal(born.length, 1, "a POST-apply acquisition on a newly enrolled account soft-births normally");
  assert.ok(born[0].acquisition_line_id, "…with the birth identity set (the running verbs survive the new shape)");
  assert.match(born[0].description, /particulars pending/i, "…and the placeholder description");
});
