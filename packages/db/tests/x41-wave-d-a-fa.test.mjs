// 0041 Wave D-a — the FA REGISTER battery, part 1: SCHEMA MARKERS · ACQUISITION
// FROM CODING (WD-R1) · THE BELT (design §2.4).
//
// CONTRACT-BLIND: authored from docs/plan/completed/wave-d-a-fa-design.md v2.1 (+ -part2.md),
// docs/plan/completed/wave-d-contract.md (WD-R1..R15) and the orchestrator's pinned 0041
// interface ONLY — this lane NEVER reads 0041's SQL. Every verb is called by its
// PINNED name with NAMED args; every new refusal is asserted by its pinned REASON
// TOKEN (contract §4), never by a bare new SQLSTATE (the CLR block is claimed by the
// migration lane at assembly). A 42883 / param-name / token divergence at integration
// is a FINDING for orchestrator adjudication, never a silent test edit.
//
// WHAT THIS FILE CANNOT REACH. It runs against a database where 0041 was applied to a
// schema carrying only what its OWN cells build afterwards — so deploy-onto-existing
// risk (a populated pre-0041 book, the enrolment watermark over real history, the K
// register at apply time) is structurally out of reach here. That lives in
// x41-0041-upgrade.test.mjs.
//
// Siblings (all `x41-*.test.mjs`, auto-discovered by `node --test tests/`; split only
// because the repo enforces a 500-line file ceiling):
//   x41-wave-d-a-fa.test.mjs   markers · acquisition · belt b1..b5     (this file)
//   x41-belt.test.mjs          enrolment/belt b6..b9
//   x41-depreciation.test.mjs  particulars · due-ness · SL · draft-N · ramp · stale
//   x41-reducing-balance.test.mjs  the RB battery · annual cadence at a non-Dec FYE
//   x41-disposal.test.mjs      disposal · the partial cost-portion split
//   x41-reversal.test.mjs      the reversal matrix (§2.4)
//   x41-surface.test.mjs       AF-1 · MYT · censuses · grants · reads · queue · races
//   x41-0041-upgrade.test.mjs  the reset-gated deploy-onto-existing drill

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, withActor, opk, ROLES, roleCanExecute, fnSource, checkDefs, idOf, noteLane, endPool,
  printLaneNotes, printSkipCount, reverseEntry, freshResolution, x41EnsureReady, skip41,
  refuses, caught, reasonToken, T, COST, ACCUM, EXPENSE, BANK, OTHER, SHARE, mon, dayIn,
  uniqTag, upsertFaProfile, listFixedAssets, disposeAsset, faWorld, faRows, faRow, profileRows,
  entryRowOf, entryLinesOf, openingItemRowsOf, eventCount, tableExists, fnExists, columnExists,
  freshFaClient, approvedEntry, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
  kSeededFaClient, buildFaChart, wb,
} from "./x41-fa-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-wave-d-a-fa");
  printSkipCount("x41-wave-d-a-fa");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a acquisition/belt battery");

// ===========================================================================
// x41.meta — the migration row + every marker object. A partial apply can never
// green this suite silently.
// ===========================================================================

const NEW_TABLES = ["fa_account_profiles", "fa_depreciation", "fa_depreciation_authorities", "fa_depreciation_runs"];
const NEW_FNS = [
  "upsert_fa_account_profile", "retire_fa_account_profile",
  "complete_fixed_asset_particulars", "revise_fixed_asset_particulars",
  "propose_depreciation_authority", "sign_depreciation_authority", "retire_depreciation_authority",
  "run_depreciation_period", "run_depreciation_manual", "depreciation_run_due",
  "dispose_fixed_asset", "set_client_fy_end",
  "list_fixed_assets", "get_fixed_asset", "list_depreciation_runs", "get_depreciation_run",
  "get_depreciation_authority", "fa_register_tie", "_fa_on_approve",
];
const NEW_FA_COLUMNS = [
  "depreciation_rate_bps", "acquisition_line_id", "disposal_entry_id",
  "superseded_at", "effective_from", "ca_class", "is_commercial_vehicle", "is_new",
];

test("x41.meta 0041 applied: one 0041_* row, every marker table/fn/column, the widened CHECKs, and depreciation_method NULLABLE with NO default", async (t) => {
  if (skipHere(t)) return;

  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0041_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0041_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  for (const tbl of NEW_TABLES) assert.ok(await tableExists(tbl), `clara.${tbl} exists (design §1)`);
  for (const fn of NEW_FNS) assert.ok(await fnExists(fn), `clara.${fn} exists (contract §2/§3)`);
  for (const col of NEW_FA_COLUMNS) assert.ok(await columnExists("fixed_assets", col), `clara.fixed_assets.${col} exists (design §1.1)`);
  for (const col of ["fy_end_month", "fy_end_day"]) {
    assert.ok(await columnExists("clients", col), `clara.clients.${col} exists (design §1.6)`);
  }
  for (const col of ["period_start", "period_end", "amount_cents", "effective_date", "entry_id", "run_id", "unwind_of", "is_live"]) {
    assert.ok(await columnExists("fa_depreciation", col), `clara.fa_depreciation.${col} exists (design §1.3)`);
  }
  for (const col of ["authority_id", "period_start", "period_end", "mode", "entries", "charged_cents", "skipped", "entry_id", "op_key"]) {
    assert.ok(await columnExists("fa_depreciation_runs", col), `clara.fa_depreciation_runs.${col} exists (design §1.5)`);
  }
  assert.ok(await columnExists("fa_account_profiles", "enrolled_at"), "clara.fa_account_profiles.enrolled_at exists — the belt watermark (design §1.2)");

  const defs = await checkDefs("fixed_assets");
  for (const method of ["straight_line", "reducing_balance", "none"]) {
    assert.ok(defs.includes(method), `the depreciation_method CHECK admits '${method}' (WD-R3) — defs: ${defs.slice(0, 400)}`);
  }
  assert.ok(defs.includes("unwound"), "the fixed_assets status CHECK admits 'unwound' (design §1.1)");
  assert.ok(/rate_bps/.test(defs), `a depreciation_rate_bps CHECK exists (bounded 1..10000) — defs: ${defs.slice(0, 600)}`);

  const attr = (await rootQuery(
    `select a.atthasdef, a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='fixed_assets' and a.attname='depreciation_method'`,
  )).rows[0];
  assert.equal(attr?.atthasdef, false, "depreciation_method DROPped its DEFAULT (design §1.1; the postverify probes atthasdef=false)");
  assert.equal(attr?.attnotnull, false, "depreciation_method is NULLABLE — a soft-born row has no method yet");

  const originDefs = await checkDefs("journal_entries");
  assert.ok(originDefs.includes("scheduled_run"), "the journal_entries.origin CHECK admits 'scheduled_run' (design §1.6)");

  const idx = (await rootQuery(
    `select string_agg(pg_get_indexdef(ix.indexrelid),' ~~ ') as d from pg_index ix
       join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='fa_depreciation' and ix.indisunique`,
  )).rows[0].d ?? "";
  assert.ok(/asset_id.*period_start.*period_end/s.test(idx) && /is_live/.test(idx),
    `fa_depreciation carries the (asset, period) unique WHERE is_live (design §1.3) — got: ${idx}`);
  assert.ok(/unwind_of/.test(idx), `…and the unique on unwind_of — got: ${idx}`);
});

// ===========================================================================
// x41.a — ACQUISITION FROM CODING (WD-R1, design §2).
// ===========================================================================

test("x41.a1 soft-birth: an approved NON-settlement entry debiting an enrolled cost account births ONE pending-particulars row keyed to the LINE, and emits asset.acquired", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("a1");
  const m = mon(-2);
  const before = await eventCount(client, "asset.acquired");
  const { entry, asset } = await buyAsset({ client, cents: 120_000, postingDate: dayIn(m, 10) });

  assert.equal(asset.client_id, client, "the born row is attributed to the entry's OWN client (tenant congruence by construction)");
  assert.equal(Number(asset.cost_cents), 120_000, "cost = the debit leg amount");
  assert.equal(asset.acquired_date, dayIn(m, 10), "acquired_date = the entry's posting_date (an ACCOUNTING date, never transaction time)");
  assert.equal(asset.status, "active", "the row births visible and honestly incomplete (WD-R1)");
  assert.equal(asset.depreciation_method, null, "method stays NULL until a human completes the particulars");
  assert.equal(asset.asset_account_code, COST, "the accounts come from the enrolment profile");
  assert.equal(asset.accum_depr_account_code, ACCUM, "…accum from the profile");
  assert.equal(asset.depr_expense_account_code, EXPENSE, "…expense from the profile");
  assert.equal(asset.acquisition_entry_id, entry, "acquisition_entry_id links the approving entry");
  const costLine = (await entryLinesOf(entry)).find((l) => l.account_code === COST);
  assert.equal(asset.acquisition_line_id, costLine.id, "acquisition_line_id names THE debit LINE — the birth identity (design §1.1)");
  assert.equal(await eventCount(client, "asset.acquired"), before + 1, "asset.acquired emitted exactly once");

  const listed = await listFixedAssets(w.users.alice, client);
  assert.equal(listed.assets.length, 1, "list_fixed_assets shows the one register row");
  assert.equal(listed.assets[0].particulars_complete, false, "particulars_complete is DERIVED false (start date + driver trio unset)");
  assert.equal(Number(listed.incomplete_count), 1, "incomplete_count counts it — visibility, never blocking");
});

test("x41.a2 the machine arm: the hook fires on the SHARED approve core, not the human verb — a core-driven approval births too", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("a2");
  const firm = w.firms.A;
  const m = mon(-2);

  // No audited verb builds a rule-driven ACQUISITION draft (the autopost lane is
  // document+corroboration bound), so the DRAFT is raw — the x37.q precedent — while
  // the APPROVAL goes through the real shared core, which is the surface under test.
  const draft = await withActor({ transaction: true }, async (c) => {
    const e = await c.query(
      `insert into clara.journal_entries(firm_id,client_id,status,posting_date,memo,origin,maker_actor)
       values($1,$2,'draft',$3,'x41 core-arm acquisition','manual',$4) returning id`,
      [firm, client, dayIn(m, 12), w.users.alice],
    );
    const id = e.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id,line_no,account_code,debit_cents,credit_cents,description)
       values($1,1,$2,50000,0,'asset cost'),($1,2,$3,0,50000,'paid')`,
      [id, COST, BANK],
    );
    return id;
  });
  const rev = (await entryRowOf(draft)).revision_token;
  const ctx = JSON.stringify({ actor: w.users.hana, firm });
  await rootQuery("select clara._approve_entry_core($1::jsonb,$2,$3,null,$4) as r", [ctx, draft, rev, opk("x41core")]);

  const rows = await faRows(client);
  assert.equal(rows.length, 1, "the core-driven approval soft-birthed the register row — the hook is not human-lane-only");
  assert.equal(Number(rows[0].cost_cents), 50000, "…with the leg's cost");
});

test("x41.a3 splice census: _fa_on_approve lives INSIDE the shared _subledger_on_approve, whose caller set is still exactly four — so every approve path reaches it; the hook is ungranted", async (t) => {
  if (skipHere(t)) return;
  const callers = (await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prosrc like '%_subledger_on_approve%' and p.proname <> '_subledger_on_approve'
      order by 1`,
  )).rows.map((x) => x.proname);
  // [0056 β] finalize_close = the FIFTH caller (its census-visible flip calls the shared
  // hook; the x56 battery proves it zero-op on the closing entry). Frontier-gated.
  const n56 = (await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0056_%'")).rows[0].n;
  assert.equal(callers.length, n56 === 1 ? 5 : 4, `the caller census holds post-splice (got ${callers.length}: ${callers.join(", ")})`);

  const shared = await fnSource("_subledger_on_approve");
  assert.ok(shared.includes("_fa_on_approve"), "the FA hook is spliced into the SHARED _subledger_on_approve (ONE CoR splice, design §2.1)");
  for (const marker of ["payment_terms_days", "effective_date", "cross_domain_control_entry", "allocation_stale"]) {
    assert.ok(shared.includes(marker), `the pre-existing marker '${marker}' survived the splice (the five-marker prestate census)`);
  }
  assert.ok(shared.includes("'invoice','bill'"), "the item_kind in ('invoice','bill') marker survived the splice");

  for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleCanExecute(role, "_fa_on_approve"), false, `${role} must NOT execute clara._fa_on_approve — it is an internal hook`);
  }
});

test("x41.a4 K5 births nothing extra: a K-seeded fixed asset carries its OWN register row through approve_opening_seed and the hook adds none", async (t) => {
  if (skipHere(t)) return;
  const k = await kSeededFaClient("a4");
  const rows = await faRows(k.client);
  assert.equal(rows.length, 1, `the K-seeded client has EXACTLY one register row — the hook did not double-birth on the OB entry (got ${rows.length})`);
  assert.equal(rows[0].id, k.assetId, "…and it is the carry-down's own row");
  const e = await entryRowOf(rows[0].acquisition_entry_id);
  assert.equal(e.is_opening_balance, true, "the K acquisition entry is opening-flagged — the hook's exclusion key (K owns its rows)");
  assert.equal(Number(rows[0].accumulated_depreciation_cents), k.accum, "the carried accumulated depreciation survives as the BASELINE");
  assert.ok(rows[0].baseline_as_of, "baseline_as_of is stamped — the carry-down lower bound for due-ness");
});

test("x41.a5 K6 hand-off: a correction of the SAME item whose D-a lifecycle has advanced is refused by NAME; an UNRELATED item's correction never carries that refusal", async (t) => {
  if (skipHere(t)) return;
  // [ASSEMBLY] A carry-down states method/life/start at seed time, so the K-seeded row is
  // ALREADY complete — completing it again is the complete-once refusal (x41.c1 pins that).
  const k = await kSeededFaClient("a5");
  await disposeAsset(w.users.alice, {
    client: k.client, asset: k.assetId, disposalDate: mon(-1).end, proceedsCents: 0,
    proceedsAccount: null, memo: "x41 K6 scrap",
  });
  assert.equal((await faRow(k.assetId)).status, "disposed", "the K-seeded asset is disposed — its D-a lifecycle has advanced");

  const items = await openingItemRowsOf(k.seed);
  const faItem = items.find((i) => i.item_kind === "fixed_asset");
  const otherItem = items.find((i) => i.item_kind === "gl_balance");
  assert.ok(faItem && otherItem, "the seed carries both a fixed_asset item and an ordinary gl_balance item");

  // [ASSEMBLY] TWO integration facts the contract-blind draft could not know. (1) The
  // replacement carries the FULL books-grade FA baseline BESIDE `item` — the K lane validates
  // the payload shape first (CLR10 "books-grade baseline is incomplete"), so a stub payload
  // never reaches the D-a guard. (2) K6 is TWO-STEP: supersede DRAFTS the correction, and the
  // guard lives in the baseline assertion that runs at approve_opening_correction — which is
  // the only moment the register would actually be switched.
  const superseded = await wb.supersedeOpeningItem(w.users.bob, {
      item: faItem.id,
      replacement: {
        item: { item_kind: "fixed_asset", item_key: `${faItem.item_key}:v2` },
        // the K6 envelope keeps the books-grade FA baseline BESIDE `item` (wb-calls' shape)
        asset: {
          // cost + carried accumulated are UNCHANGED so the seed still ties to its parsed
          // targets — the correction is to the LIFE, which leaves the lifecycle guard as the
          // only thing standing between this correction and the register.
          description: "Delivery van (x41 K6 correction)", acquired_date: mon(-24).start,
          cost_cents: k.cost, useful_life_months: 72, depreciation_method: "straight_line",
          asset_account_code: COST, accum_depr_account_code: ACCUM, depr_expense_account_code: EXPENSE,
          accumulated_depreciation_cents: k.accum, depreciation_start_date: mon(-24).start,
          residual_cents: 0, item_key: `${faItem.item_key}:v2`,
        },
      },
      opKey: opk("x41k6same"),
  });
  assert.ok(superseded?.replacement_entry_id, "the supersede DRAFTED a replacement (the K6 two-step)");
  const revs = await wb.revMapOf([
    { entry_id: superseded.reversal_entry_id, revision_token: superseded.reversal_revision_token },
    { entry_id: superseded.replacement_entry_id, revision_token: (await entryRowOf(superseded.replacement_entry_id)).revision_token },
  ]);
  await refuses(
    () => wb.approveOpeningCorrection(w.users.hana, {
      seed: k.seed, entryRevisions: revs, opKey: opk("x41k6apr"),
    }),
    T.lifecycleAdvanced,
    "K6 approve of a correction to the SAME fixed-asset item after a D-a disposal",
  );

  const err = await caught(() => wb.supersedeOpeningItem(w.users.bob, {
    item: otherItem.id,
    replacement: {
      item: { item_kind: "gl_balance", item_key: `${otherItem.item_key}:v2` },
      lines: [{ account_code: SHARE, debit_cents: 0, credit_cents: Number(otherItem.amount_cents) }],
    },
    opKey: opk("x41k6other"),
  }));
  if (err) {
    assert.notEqual(reasonToken(err), T.lifecycleAdvanced,
      `a correction of an UNRELATED item must never carry ${T.lifecycleAdvanced} — got ${err.message}`);
    noteLane(`x41.a5 the other-item K6 supersede refused for an unrelated reason (${reasonToken(err) ?? err.code}) — recorded, not the FA guard`);
  }
});

test("x41.a6 birth identity: TWO identical debit legs birth TWO rows (one per LINE, no merge door); re-driving the hook mints NO duplicates", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("a6");
  const m = mon(-2);
  const entry = await approvedEntry(w.users.alice, {
    client, memo: "x41 two identical machines", postingDate: dayIn(m, 5),
    lines: [
      { account_code: COST, debit_cents: 30_000, credit_cents: 0, description: "machine 1" },
      { account_code: COST, debit_cents: 30_000, credit_cents: 0, description: "machine 2" },
      { account_code: BANK, debit_cents: 0, credit_cents: 60_000, description: "paid" },
    ],
  });
  const rows = await faRows(client);
  assert.equal(rows.length, 2, "one row per LINE — two identical legs birth TWO assets (design convention 4: no merge door)");
  assert.notEqual(rows[0].acquisition_line_id, rows[1].acquisition_line_id, "each row keys to its OWN line");

  await rootQuery("select clara._fa_on_approve($1)", [entry]);
  assert.equal((await faRows(client)).length, 2, "a re-drive of the hook mints NO duplicates (on conflict (acquisition_line_id) do nothing)");

  const idx = (await rootQuery(
    `select string_agg(pg_get_indexdef(ix.indexrelid),' ~~ ') as d from pg_index ix
       join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='fixed_assets' and ix.indisunique`,
  )).rows[0].d ?? "";
  assert.ok(idx.includes("acquisition_line_id"), `a UNIQUE index covers acquisition_line_id (got: ${idx})`);
});

test("x41.a7 placeholder description: the soft-born row carries the stable pending-particulars placeholder naming its account and RM amount; completion replaces it", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("a7");
  const { asset } = await buyAsset({ client, cents: 456_789, postingDate: dayIn(mon(-2), 3) });
  assert.ok(asset.description, "description is NOT NULL on birth (the column forbids NULL; lawful document-backed entries carry NULL memos)");
  assert.match(asset.description, /particulars pending/i, `the placeholder names the pending state (got '${asset.description}')`);
  assert.ok(asset.description.includes(COST), `the placeholder names the account (got '${asset.description}')`);
  assert.match(asset.description, /4,?567\.89/, `the placeholder names the amount in RM (got '${asset.description}')`);

  await completeSL(client, asset.id, { life: 36, start: mon(-2).start, description: "Compressor unit 7" });
  assert.equal((await faRow(asset.id)).description, "Compressor unit 7", "completion replaces the placeholder with the human's description");
});

// ===========================================================================
// x41.b — THE BELT (design §2.4): a deferred constraint trigger on
// journal_entries @approved, ALL THREE enrolled roles, scoped to the profile's
// enrolled_at watermark, with five named doors.
// ===========================================================================

test("x41.b1 the belt refuses an unregistered movement on ALL THREE enrolled roles, by name, naming the role and the account", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b1");
  const m = mon(-1);
  // [ASSEMBLY · adjudication A2] All three enrolled roles are covered by a NAMED refusal,
  // but the COST role's own named door is the more specific one: a credit on an enrolled cost
  // account is the supplier credit/rebate class, which design §2.4 gives its own token and
  // remedy (`fa_cost_adjustment_deferred`). A debit on the cost account is the acquisition
  // itself (door (a)), so `fa_belt_unregistered_movement` is by construction the accum/expense
  // token. The cell pins each role's ACTUAL token positively rather than a disjunction.
  const cases = [
    ["cost", COST, T.costAdjDeferred, [
      { account_code: BANK, debit_cents: 10000, credit_cents: 0, description: "bank" },
      { account_code: COST, debit_cents: 0, credit_cents: 10000, description: "hand disposal" }]],
    ["accum", ACCUM, T.beltUnregistered, [
      { account_code: ACCUM, debit_cents: 7000, credit_cents: 0, description: "hand write-back" },
      { account_code: OTHER, debit_cents: 0, credit_cents: 7000, description: "sundry" }]],
    // The contra leg is the UN-enrolled bank: an entry touching two enrolled roles is refused
    // by whichever line the belt's row loop meets first, which would make the role assertion
    // order-dependent. One enrolled role per case.
    ["expense", EXPENSE, T.beltUnregistered, [
      { account_code: EXPENSE, debit_cents: 5000, credit_cents: 0, description: "hand depreciation" },
      { account_code: BANK, debit_cents: 0, credit_cents: 5000, description: "paid" }]],
  ];
  for (const [role, code, token, lines] of cases) {
    const err = await refuses(
      () => approvedEntry(w.users.alice, { client, memo: `x41 hand ${role} journal`, postingDate: dayIn(m, 9), lines }),
      token,
      `a hand journal moving the enrolled ${role} account (${code})`,
    );
    const blob = `${err.detail ?? ""} ${err.message ?? ""}`;
    assert.ok(blob.includes(role), `the ${role} refusal names its role (got ${blob})`);
    assert.ok(blob.includes(code), `the ${role} refusal names the account code ${code} (got ${blob})`);
  }
  assert.equal((await faRows(client)).length, 0, "no register row was born by any refused hand journal");
});

test("x41.b2 the five doors: (a) the birth's own row · (b) an fa_disposal proposal · (c) a scheduled_run depreciation proposal · (d) a reversal mirror · (e) a K entry tying to its own opening_items.fixed_asset row", async (t) => {
  if (skipHere(t)) return;
  // (a) + (d)
  const client = await freshFaClient("b2");
  const { entry, asset } = await buyAsset({ client, cents: 90_000, postingDate: dayIn(mon(-2), 4) });
  assert.ok(asset.id, "door (a): the acquisition was admitted — a register row keyed to the line exists in the SAME transaction");
  await reverseEntry(w.users.alice, { entry, reason: "x41 door (d)", opKey: opk("x41revdoor") });
  assert.equal((await faRow(asset.id)).status, "unwound", "door (d): the reversal mirror was admitted and the row unwound");

  // (b) + (c)
  const c2 = await freshFaClient("b2c");
  const start = mon(-3);
  const { asset: a2 } = await buyAsset({ client: c2, cents: 360_000, postingDate: dayIn(start, 2) });
  await completeSL(c2, a2.id, { life: 36, start: start.start, description: "x41 door asset" });
  await liveAuthority(c2);
  await earnRamp(c2, start);
  const posted = await runAndSettle(c2, mon(-2));
  assert.notEqual(posted.mode, "noop", "door (c): the scheduled_run depreciation entry was admitted by the belt");
  const runEntry = await entryRowOf(posted.entryId);
  assert.equal(runEntry.origin, "scheduled_run", "…and it carries origin='scheduled_run'");
  assert.ok(runEntry.flags?.depreciation_charges, "…and the depreciation_charges proposal (contract §5)");

  const disp = await disposeAsset(w.users.alice, {
    client: c2, asset: a2.id, disposalDate: mon(-1).end, proceedsCents: 250_000, proceedsAccount: BANK,
  });
  const dispEntry = idOf(disp, "entry_id", "id");
  assert.ok(dispEntry, `door (b): dispose_fixed_asset names its entry (got ${JSON.stringify(disp)})`);
  assert.ok((await entryRowOf(dispEntry)).flags?.fa_disposal, "…and the entry carries the fa_disposal proposal");

  // (e)
  const k = await kSeededFaClient("b2e");
  const kEntry = await entryRowOf((await faRow(k.assetId)).acquisition_entry_id);
  assert.equal(kEntry.status, "approved", "door (e): the K opening entry was ADMITTED at approve on an ALREADY-enrolled account");
});

test("x41.b3 the enrolled_at watermark: enrolling an account that already has history neither blocks that history's reversal nor births retroactively", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b3", { enrol: false });
  const historic = await approvedEntry(w.users.alice, {
    client, memo: "x41 pre-enrolment purchase", postingDate: dayIn(mon(-3), 8),
    lines: [
      { account_code: COST, debit_cents: 77_000, credit_cents: 0, description: "old machine" },
      { account_code: BANK, debit_cents: 0, credit_cents: 77_000, description: "paid" },
    ],
  });
  assert.equal((await faRows(client)).length, 0, "no register row exists before enrolment");

  await upsertFaProfile(w.users.alice, { client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  assert.equal((await faRows(client)).length, 0, "enrolling an account WITH history births NOTHING retroactively (design §1.2)");
  const prof = (await profileRows(client)).find((p) => p.asset_account_code === COST && p.active);
  assert.ok(prof?.enrolled_at, "the profile carries enrolled_at — the belt watermark");

  // Round-2 fold 5: the reversed_by UPDATE re-fires the belt on the ORIGINAL entry,
  // which has no openable door — the watermark is what keeps it reversible.
  await reverseEntry(w.users.alice, { entry: historic, reason: "x41 watermark", opKey: opk("x41water") });
  // [ASSEMBLY] The house law (reverse_entry, pre-0041): "a reversed original STAYS approved"
  // — reversal is recorded by `reversed_by`, never by a status flip. Nothing in D-a changes
  // it; the lane guessed a 'reversed' status that no migration in the chain ever writes.
  const rev = await entryRowOf(historic);
  assert.ok(rev.reversed_by, "a PRE-ENROLMENT entry on a now-enrolled account is still reversible");
  assert.equal(rev.status, "approved", "…and the reversed ORIGINAL stays 'approved' (the house reversal law)");
});

test("x41.b4 door (a) is status-blind: the acquisition reversal that flips the row to 'unwound' does not trip the belt on the original entry's own reversed_by update", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("b4");
  const { entry, asset } = await buyAsset({ client, cents: 44_000, postingDate: dayIn(mon(-2), 6) });
  await reverseEntry(w.users.alice, { entry, reason: "x41 status-blind door", opKey: opk("x41sb") });
  const row = await faRow(asset.id);
  assert.equal(row.status, "unwound", "the row is 'unwound' — a status door (a) must NOT filter on");
  assert.equal(row.superseded_by_asset_id, null, "an unwound row keeps superseded_by_asset_id NULL (ck_fixed_assets_superseded_state_0017 stays safe)");
  // [ASSEMBLY] The house reversal law again: the original keeps status 'approved' and gains
  // reversed_by. What this cell actually proves is that the UPDATE re-fired the belt and the
  // belt let it through — visible in the reversed_by write having landed at all.
  assert.ok((await entryRowOf(entry)).reversed_by, "the ORIGINAL entry's own reversed_by update passed the re-fired belt");
});

test("x41.b5 a K gl_balance leg on an ENROLLED account is refused by name — enrolment is the commitment to an itemised register", async (t) => {
  if (skipHere(t)) return;
  const o = await wb.onboardingClient(w.users.hana, `x41kgl_${uniqTag()}`);
  await wb.seedOpeningCoa(w.users.alice, o.client);
  await buildFaChart(w.users.alice, o.client);
  await upsertFaProfile(w.users.alice, { client: o.client, assetAccount: COST, accumAccount: ACCUM, expenseAccount: EXPENSE });
  const doc = await wb.openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await wb.createOpeningSeed(w.users.bob, {
    client: o.client, plan: o.plan, asOf: mon(-6).end, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  const seed = sr.seed_id ?? sr.id;

  // [ASSEMBLY] Door (e) is a BELT door (design §2.4) and the belt is a DEFERRED constraint
  // trigger on journal_entries WHEN (new.status='approved') — so the refusal lands at the K
  // seed's APPROVE, not at draft. The cell drafts the concentrated gl_balance leg lawfully,
  // then drives the seed to approve and asserts the named refusal there.
  const AMT = 900_000;
  await wb.recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: COST, source_label: "fa cost", debit_cents: AMT, credit_cents: 0 },
    { line_key: "cap", account_code: SHARE, source_label: "share capital", debit_cents: 0, credit_cents: AMT },
  ] });
  const glLeg = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:faconcentrate" },
    lines: [{ account_code: COST, debit_cents: AMT, credit_cents: 0 }],
    opKey: opk("x41kgl"),
  });
  const cap = await wb.draftOpeningItem(w.users.bob, {
    client: o.client, seed,
    resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: SHARE, debit_cents: 0, credit_cents: AMT }],
    opKey: opk("x41kglcap"),
  });

  const planRev = await wb.planRevision(o.plan);
  await refuses(
    () => wb.approveOpeningSeed(w.users.hana, {
      seed, planRevision: planRev, tieSha256: doc.sha256,
      entryRevisions: wb.revMapOf([glLeg, cap]), opKey: opk("x41kglapr"),
    }),
    T.kGlBalance,
    "a K gl_balance item landing on an ENROLLED FA cost account",
  );
});

