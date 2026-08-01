// 0041 Wave D-a — the FA REGISTER battery, part 5: THE RIDE-ALONGS (AF-1's hard
// refuse · the reverse_entry MYT splice, WD-R13) · THE STRUCTURAL CENSUSES (design
// §9.5: exactly one 'scheduled_run' writer, exactly two proposal-key writers, the
// generic drafter's wall) · EVENTS + TAXONOMY · GRANTS · THE READ SURFACE · THE QUEUE
// KIND · run-vs-dispose SERIALIZATION under the 203005004 client rung.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs header).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, noteLane, getPool, ROLES, CLR, endPool, printLaneNotes,
  printSkipCount, reverseEntry, draftEntryV3, approveEntry, roleCanExecute, idOf,
  collectRowKind, listReviewQueue, human, counterpartyRows, normalize, x41EnsureReady, skip41,
  refuses, caught, T, ACCUM, EXPENSE, BANK, AR1, AP1, OTHER, mon, dayIn, disposeAsset,
  runPeriod, runDueAsHuman, listFixedAssets, getFixedAsset, listDepreciationRuns, getAuthority,
  faRegisterTie, faWorld, faRow, entryRowOf, manualRes, liveRanges, assertNoOverlaps,
  freshFaClient, buyAsset, approvedEntry, approvedControlEntry, completeSL, liveAuthority,
  earnRamp, runAndSettle,
} from "./x41-fa-world.mjs";
import { waitBlockedByOrThrow } from "./wave-b/wb-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-surface");
  printSkipCount("x41-surface");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a surface battery");

// ===========================================================================
// x41.j — THE RIDE-ALONGS (WD-R13).
// ===========================================================================

/** Birth a counterparty through draft+approve of a tiny NON-control entry. */
async function birth(sub, { client, name, kind = "vendor" }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x41 birth ${name}`,
    postingDate: dayIn(mon(-4), 2),
    lines: [
      { account_code: OTHER, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("x41birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x41birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

const allocatePayment = async (sub, o) => (await humanQuery(sub, namedCall("allocate_payment", [
  { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
  { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
  { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
]), [o.client, o.counterparty, o.postingDate, o.memo ?? "x41 payment", BANK, o.amountCents,
  JSON.stringify(o.allocations), o.opKey ?? opk("x41pay"), AP1])).rows[0].result;

const allocateReceipt = async (sub, o) => (await humanQuery(sub, namedCall("allocate_receipt", [
  { name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" },
  { name: "p_memo" }, { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" },
  { name: "p_allocations", cast: "jsonb" }, { name: "p_op_key" }, { name: "p_control_account" },
]), [o.client, o.counterparty, o.postingDate, o.memo ?? "x41 receipt", BANK, o.amountCents,
  JSON.stringify(o.allocations), o.opKey ?? opk("x41rcpt"), AR1])).rows[0].result;

const applyOpenItems = async (sub, o) => (await humanQuery(sub, namedCall("apply_open_items", [
  { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" },
]), [o.client, JSON.stringify(o.applications), o.reason ?? "x41 apply", o.opKey ?? opk("x41apply")])).rows[0].result;

const openItemsOf = async (entry) =>
  (await rootQuery("select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1", [entry])).rows.map((x) => x.row);

test("x41.j1 AF-1: BOTH allocation composites HARD-REFUSE an allocation dated before its target item was born, naming the deposit/advance remedy — and the deposit route stays green", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("j1");
  const sub = w.users.alice;
  const vendor = await birth(sub, { client, name: `X41 VENDOR ${opk("v").slice(-6)}` });
  const customer = await birth(sub, { client, name: `X41 CUSTOMER ${opk("c").slice(-6)}`, kind: "customer" });

  // A bill born in month −1, and a payment dated a month EARLIER — the unborn-item shape.
  // [ASSEMBLY] A control-class line carries a counterparty or CLR23 refuses it at approve
  // (the pre-0041 subledger law) — so the AF-1 fixture births its bill through the
  // control-entry helper, which stamps the counterparty the audited drafter cannot.
  const billEntry = await approvedControlEntry(sub, {
    client, memo: "x41 bill", postingDate: dayIn(mon(-1), 10), counterparty: vendor,
    lines: [
      { account_code: OTHER, debit_cents: 500_00, credit_cents: 0, description: "purchase" },
      { account_code: AP1, debit_cents: 0, credit_cents: 500_00, description: "creditor" },
    ],
  });
  const billItems = await openItemsOf(billEntry);
  assert.equal(billItems.length, 1, "the AP control entry minted exactly ONE open item (mandatory setup)");

  const err = await refuses(() => allocatePayment(sub, {
    client, counterparty: vendor, postingDate: dayIn(mon(-2), 5), amountCents: 500_00,
    allocations: [{ item_id: billItems[0].id, amount_cents: 500_00 }],
  }), T.allocationUnborn, "allocate_payment dated BEFORE the bill it targets was born (AF-1)");
  const blob = `${err.detail ?? ""} ${err.message ?? ""} ${err.hint ?? ""}`;
  assert.ok(/deposit|advance/i.test(blob), `the AF-1 refusal NAMES the deposit/advance remedy (got: ${blob})`);
  assert.ok(/apply_open_items/i.test(blob), `…and names apply_open_items as the route (got: ${blob})`);

  const invEntry = await approvedControlEntry(sub, {
    client, memo: "x41 invoice", postingDate: dayIn(mon(-1), 12), counterparty: customer,
    lines: [
      { account_code: AR1, debit_cents: 300_00, credit_cents: 0, description: "debtor" },
      { account_code: OTHER, debit_cents: 0, credit_cents: 300_00, description: "contra" },
    ],
  });
  const invItems = await openItemsOf(invEntry);
  await refuses(() => allocateReceipt(sub, {
    client, counterparty: customer, postingDate: dayIn(mon(-2), 6), amountCents: 300_00,
    allocations: [{ item_id: invItems[0].id, amount_cents: 300_00 }],
  }), T.allocationUnborn, "allocate_receipt dated BEFORE the invoice it targets was born (AF-1, the second composite)");

  // The DEPOSIT ROUTE: take the money in on its own date as an advance, then apply it
  // once the bill exists — act-dated and structurally immune (WD-R13's own remedy).
  const advance = await allocatePayment(sub, {
    client, counterparty: vendor, postingDate: dayIn(mon(-2), 5), amountCents: 500_00,
    allocations: [], memo: "x41 advance to supplier",
  });
  assert.ok(advance, "the deposit route (an unallocated advance on its own date) is admitted");
  const advItems = await openItemsOf(idOf(advance, "entry_id", "id"));
  assert.ok(advItems.length >= 1, "…minting a settlement item to apply later");
  const applied = await applyOpenItems(sub, {
    client,
    // [ASSEMBLY] the verb's pinned application keys are source_item_id / target_item_id.
    applications: [{ source_item_id: advItems[0].id, target_item_id: billItems[0].id, amount_cents: 500_00 }],
  });
  assert.ok(applied, "…and apply_open_items closes it against the now-born bill (zero GL movement, act-dated)");
});

test("x41.j2 the reverse_entry MYT splice: a reversal mirror is dated by the Asia/Kuala_Lumpur wall clock, never UTC", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("j2");
  const entry = await approvedEntry(w.users.alice, {
    client, memo: "x41 myt", postingDate: dayIn(mon(-1), 4),
    lines: [
      { account_code: OTHER, debit_cents: 1_000, credit_cents: 0, description: "dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 1_000, description: "cr" },
    ],
  });
  const receipt = await reverseEntry(w.users.alice, { entry, reason: "x41 myt splice", opKey: opk("x41myt") });
  const mirrorId = idOf(receipt, "reversal_entry_id", "entry_id", "id")
    ?? (await rootQuery("select id from clara.journal_entries where reversal_of=$1", [entry])).rows[0]?.id;
  assert.ok(mirrorId, "the reversal minted a mirror");
  const clocks = (await rootQuery(
    "select ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text as myt, ((now() at time zone 'UTC')::date)::text as utc",
  )).rows[0];
  const mirror = await entryRowOf(mirrorId);
  assert.equal(mirror.posting_date, clocks.myt,
    `the mirror is dated by the MYT wall clock (myt=${clocks.myt} utc=${clocks.utc}) — WD-R13's 00:00–08:00 MYT off-by-a-day`);
});

// ===========================================================================
// x41.k — THE STRUCTURAL CENSUSES (design §9.5). Proposal authenticity is
// structural, and these keep a later migration from silently re-opening it.
// ===========================================================================

async function bodiesNaming(fragment) {
  const r = await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prosrc like '%' || $1 || '%'
        and p.prosrc like '%insert into clara.journal_entries%' order by 1`,
    [fragment],
  );
  return r.rows.map((x) => x.proname);
}

test("x41.k1 single-writer censuses: exactly ONE function body inserts origin='scheduled_run', and exactly one each writes the depreciation_charges and fa_disposal proposal keys", async (t) => {
  if (skipHere(t)) return;
  const originWriters = await bodiesNaming("scheduled_run");
  assert.equal(originWriters.length, 1,
    `exactly ONE function inserts origin='scheduled_run' (the issuer-authenticity half, design §1.6) — got: ${originWriters.join(", ")}`);
  const chargeWriters = await bodiesNaming("depreciation_charges");
  assert.equal(chargeWriters.length, 1,
    `exactly ONE function writes the depreciation_charges proposal key (design §9.5) — got: ${chargeWriters.join(", ")}`);
  const disposalWriters = await bodiesNaming("fa_disposal");
  assert.equal(disposalWriters.length, 1,
    `exactly ONE function writes the fa_disposal proposal key (design §9.5) — got: ${disposalWriters.join(", ")}`);
  assert.notEqual(chargeWriters[0], disposalWriters[0], "…and they are TWO distinct audited verbs, not one widened door");

  const core = (await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_draft_entry_core'",
  )).rows.map((x) => x.prosrc).join(" ");
  assert.ok(!core.includes("depreciation_charges"), "_draft_entry_core does not name depreciation_charges — it is NEVER widened");
  assert.ok(!core.includes("fa_disposal"), "_draft_entry_core does not name fa_disposal either");

  // [ASSEMBLY] MEASURED against the shared 0040 rig: clara.journal_entries has carried the
  // same nine grants since long before D-a (clara_fn_owner holds the full owner set; the two
  // read roles hold SELECT), and 0041 adds none. The structural claim that actually holds —
  // and the one proposal forgery depends on — is that NO role but the function owner may
  // WRITE the table, so a proposal can only be minted from inside a definer verb.
  const writeGrants = (await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema='clara' and table_name='journal_entries'
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
        and grantee <> 'clara_fn_owner' order by 1, 2`,
  )).rows;
  assert.deepEqual(writeGrants, [],
    `NO role but clara_fn_owner may write clara.journal_entries — proposal forgery stays structurally impossible (got ${JSON.stringify(writeGrants)})`);
});

test("x41.k2 the generic drafter cannot persist EITHER proposal key: draft_entry(p_flags) drops both", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("k2");
  const d = await draftEntryV3(w.users.alice, {
    client, resolution: await manualRes(w.users.alice, client), memo: "x41 forged proposal",
    postingDate: dayIn(mon(-1), 8),
    flags: {
      depreciation_charges: { authority_id: null, op_key: "forged", charges: [] },
      fa_disposal: { asset_id: null, proceeds_cents: 0, op_key: "forged" },
    },
    lines: [
      { account_code: OTHER, debit_cents: 1_000, credit_cents: 0, description: "dr" },
      { account_code: BANK, debit_cents: 0, credit_cents: 1_000, description: "cr" },
    ],
    opKey: opk("x41forge"),
  });
  const e = await entryRowOf(d.entry_id);
  const flags = e.flags ?? {};
  assert.ok(!("depreciation_charges" in flags),
    `the generic drafter DROPPED the depreciation_charges key (got ${JSON.stringify(flags)})`);
  assert.ok(!("fa_disposal" in flags), `…and the fa_disposal key (got ${JSON.stringify(flags)})`);
});

test("x41.k3 revise_entry refuses a proposal-bearing entry BY NAME (the sixth recut)", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("k3");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 12, start: start.start, description: "x41 k3" });
  await liveAuthority(client);
  const drafted = await runPeriod({ client, periodStart: start.start, periodEnd: start.end });
  assert.equal(drafted.status, "drafted", "a high-stakes run leaves a proposal-bearing DRAFT");
  const e = await entryRowOf(drafted.entry_id);

  // [ASSEMBLY] revise_entry's live signature carries p_proposed_counterparty + p_evidence
  // between p_lines and p_expected_revision, neither defaulted — a 4-arg named call is 42883.
  const err = await caught(() => humanQuery(w.users.alice, namedCall("revise_entry", [
    { name: "p_entry" }, { name: "p_lines", cast: "jsonb" },
    { name: "p_proposed_counterparty", cast: "jsonb" }, { name: "p_evidence", cast: "jsonb" },
    { name: "p_expected_revision" }, { name: "p_op_key" },
  ]), [drafted.entry_id, JSON.stringify([
    { account_code: EXPENSE, debit_cents: 1, credit_cents: 0, description: "tamper" },
    { account_code: ACCUM, debit_cents: 0, credit_cents: 1, description: "tamper" },
  ]), null, null, e.revision_token, opk("x41revise")]));
  assert.ok(err, "revise_entry must REFUSE a proposal-bearing entry");
  const blob = `${err.message} ${err.detail ?? ""}`;
  assert.ok(/proposal|depreciation|fa_disposal|not revisable/i.test(blob),
    `…by a NAME that says why (got code=${err.code} — ${err.message})`);
});

// ===========================================================================
// x41.l — EVENTS · GRANTS · READS · QUEUE.
// ===========================================================================

test("x41.l1 events + taxonomy census ×3: asset.acquired / asset.depreciated / asset.disposed are registered at the ACTIVE taxonomy version with decision 'ignore', and each really fires", async (t) => {
  if (skipHere(t)) return;
  const types = ["asset.acquired", "asset.depreciated", "asset.disposed"];
  const active = (await rootQuery("select version from clara.taxonomy_active")).rows[0]?.version;
  assert.ok(active != null, "the active taxonomy version is readable");
  for (const type of types) {
    const et = await rootQuery("select 1 from clara.event_types where name=$1", [type]);
    assert.equal(et.rowCount, 1, `clara.event_types carries '${type}' (design §1.6 — event ROWS, not an enum)`);
    const tx = await rootQuery(
      "select decision from clara.trigger_taxonomy where event_type=$1 and version=$2", [type, active]);
    assert.equal(tx.rowCount, 1, `clara.trigger_taxonomy carries '${type}' at the ACTIVE version ${active}`);
    assert.equal(tx.rows[0].decision, "ignore", `…with decision 'ignore' (the /assets reads surface directly — the 0040 bank-kind reasoning)`);
  }

  // …and all three really fire on one asset's life.
  const client = await freshFaClient("l1");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 l1" });
  await liveAuthority(client);
  await earnRamp(client, start);
  // [ASSEMBLY] month −2 is settled first: design §4.1 refuses a disposal while an EARLIER due
  // period is uncharged (x41.g4 is that cell).
  await runAndSettle(client, mon(-2));
  await disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 6), proceedsCents: 100_000, proceedsAccount: BANK,
  });
  for (const type of types) {
    const n = (await rootQuery(
      "select count(*)::int as n from clara.domain_events where client_id=$1 and event_type=$2", [client, type])).rows[0].n;
    assert.ok(n >= 1, `'${type}' was actually emitted (got ${n})`);
  }
});

test("x41.l2 grants: the run verb is executable by clara_runtime and green under `set role`; the human verbs are authenticated-only; the reads are granted; the due probe is granted to BOTH lanes", async (t) => {
  if (skipHere(t)) return;
  for (const fn of ["run_depreciation_period", "depreciation_run_due"]) {
    assert.equal(await roleCanExecute(ROLES.runtime, fn), true, `clara_runtime may execute clara.${fn} (design §3.4 — the leader runs under SET ROLE)`);
  }
  assert.equal(await roleCanExecute(ROLES.authenticated, "depreciation_run_due"), true,
    "clara_authenticated may execute depreciation_run_due (the /assets advisory)");
  assert.equal(await roleCanExecute(ROLES.runtime, "run_depreciation_manual"), false,
    "clara_runtime may NOT execute the MANUAL verb — that lane is human-only");
  for (const fn of [
    "upsert_fa_account_profile", "retire_fa_account_profile", "complete_fixed_asset_particulars",
    "revise_fixed_asset_particulars", "propose_depreciation_authority", "sign_depreciation_authority",
    "retire_depreciation_authority", "dispose_fixed_asset", "set_client_fy_end", "run_depreciation_manual",
  ]) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute clara.${fn}`);
    for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(await roleCanExecute(role, fn), false, `${role} must NOT execute clara.${fn} — no agent lane moves the register`);
    }
  }
  for (const fn of ["list_fixed_assets", "get_fixed_asset", "list_depreciation_runs",
    "get_depreciation_run", "get_depreciation_authority", "fa_register_tie"]) {
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true, `clara_authenticated may execute the read RPC clara.${fn}`);
  }
  const wake = await rootQuery(
    "select count(*)::int as n from clara.wake_fn_allowlist where function_name = any($1)",
    [["run_depreciation_period", "run_depreciation_manual", "dispose_fixed_asset", "complete_fixed_asset_particulars"]],
  );
  assert.equal(wake.rows[0].n, 0, "ZERO wake_fn_allowlist entries name an FA verb — no wake authority exists for the register");

  // Green under an actual SET ROLE (the login-direct dance must NOT be required).
  const client = await freshFaClient("l2");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 l2" });
  await liveAuthority(client);
  const out = await runPeriod({ client, periodStart: start.start, periodEnd: start.end });
  assert.notEqual(out.status, "noop", "the sweep verb runs GREEN under `set role clara_runtime`");
  assert.equal((await runDueAsHuman(w.users.alice, client)).due != null, true, "the due probe answers on the human lane too");
});

test("x41.l3 the read surface is firm-scoped: another firm's human gets the not-found shape, never an existence oracle", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("l3");
  const { asset } = await buyAsset({ client, cents: 100_000, postingDate: dayIn(mon(-2), 3) });

  for (const [label, call] of [
    ["list_fixed_assets", () => listFixedAssets(w.users.dave, client)],
    ["get_fixed_asset", () => getFixedAsset(w.users.dave, asset.id)],
    ["list_depreciation_runs", () => listDepreciationRuns(w.users.dave, client)],
    ["get_depreciation_authority", () => getAuthority(w.users.dave, client)],
    ["fa_register_tie", () => faRegisterTie(w.users.dave, client, mon(-1).end)],
  ]) {
    const err = await caught(call);
    if (err) {
      assert.equal(err.code, CLR.notFound, `${label} answers a cross-firm caller with the not-found shape (got ${err.code} — ${err.message})`);
    } else {
      const payload = await call();
      const json = JSON.stringify(payload ?? {});
      assert.ok(!json.includes(asset.id),
        `${label} returned data to a cross-firm caller that names the asset — an existence oracle (got ${json.slice(0, 200)})`);
      noteLane(`x41.l3 ${label} answers a cross-firm caller with an EMPTY payload rather than CLR11 — recorded`);
    }
  }
});

test("x41.l4 the queue chases INCOMPLETE register rows only: row_kind='fixed_asset_incomplete' carries asset_id + the placeholder title, and disposed/superseded/unwound rows never chase", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("l4");
  const { asset } = await buyAsset({ client, cents: 250_000, postingDate: dayIn(mon(-2), 3) });
  const scope = { client_id: client };

  const q1 = await listReviewQueue(human(w.users.alice), { scope, limit: 100 });
  const hits = collectRowKind(q1, "fixed_asset_incomplete");
  const mine = hits.filter((h) => h.asset_id === asset.id);
  assert.equal(mine.length, 1, `the incomplete register row appears ONCE as row_kind='fixed_asset_incomplete' (got ${hits.length} rows of that kind)`);
  assert.ok(String(mine[0].title ?? "").includes("particulars pending") || /particulars pending/i.test(JSON.stringify(mine[0])),
    `…carrying the placeholder description as its title (got ${JSON.stringify(mine[0])})`);
  assert.equal(mine[0].client_id ?? client, client, "…and the client fields sibling kinds carry");

  await completeSL(client, asset.id, { life: 24, start: mon(-2).start, description: "x41 l4 complete" });
  const q2 = await listReviewQueue(human(w.users.alice), { scope, limit: 100 });
  assert.equal(collectRowKind(q2, "fixed_asset_incomplete").filter((h) => h.asset_id === asset.id).length, 0,
    "a COMPLETED row stops chasing");

  // A disposed/unwound row never chases even while incomplete.
  const { entry, asset: a2 } = await buyAsset({ client, cents: 90_000, postingDate: dayIn(mon(-2), 4) });
  await reverseEntry(w.users.alice, { entry, reason: "x41 l4 unwind", opKey: opk("x41l4") });
  assert.equal((await faRow(a2.id)).status, "unwound", "…the second row is unwound");
  const q3 = await listReviewQueue(human(w.users.alice), { scope, limit: 100 });
  assert.equal(collectRowKind(q3, "fixed_asset_incomplete").filter((h) => h.asset_id === a2.id).length, 0,
    "an UNWOUND row never chases (only 'pending' or 'active' rows do)");
});

// ===========================================================================
// x41.m — SERIALIZATION under the 203005004 client rung (design §3.2/§4.1).
// ===========================================================================

const DISPOSE_SQL = `select clara.dispose_fixed_asset(p_client => $1, p_asset => $2,
  p_disposal_date => $3::date, p_proceeds_cents => $4::bigint, p_proceeds_account => $5,
  p_gain_account => $6, p_loss_account => $7, p_memo => $8, p_op_key => $9) as r`;
const RUN_SQL = `select clara.run_depreciation_period(p_client => $1, p_period_start => $2::date,
  p_period_end => $3::date, p_op_key => $4) as r`;

/** Two sessions on the SAME client: A takes the rung and holds it; B contends and is
 *  PROVEN blocked before A commits. Returns {a, b, provedBlocked}. */
async function raceOnRung({ first, second }) {
  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const out = { a: null, b: null, provedBlocked: false };
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await first.begin(c1);
    await c1.query(first.sql, first.params);

    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await second.begin(c2);
    await c2.query("set statement_timeout = '20s'");
    const p2 = c2.query(second.sql, second.params)
      .then((r) => { out.b = { ok: true, result: r.rows[0].r }; })
      .catch((e) => { out.b = { ok: false, code: e.code, detail: e.detail, message: e.message }; });

    try {
      await waitBlockedByOrThrow(pid2, pid1, { what: "the 203005004 client advisory rung" });
      out.provedBlocked = true;
    } catch (e) {
      noteLane(`x41.m block not observed (${e.message}) — the rung placement is a FINDING`);
    }
    await c1.query("commit");
    out.a = { ok: true };
    await p2;
    if (out.b?.ok) await c2.query("commit").catch((e) => { out.b = { ok: false, code: e.code }; });
    else await c2.query("rollback").catch(() => {});
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  return out;
}

const beginHuman = (sub) => async (c) => {
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
};
const beginRuntime = async (c) => {
  await c.query(`set role ${ROLES.runtime}`);
  await c.query("begin");
};

async function rungFixture(label) {
  const client = await freshFaClient(label);
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: `x41 ${label}` });
  await liveAuthority(client);
  await earnRamp(client, start);
  return { client, asset: asset.id, next: mon(-2) };
}

test("x41.m1 run-then-dispose and dispose-then-run BOTH serialize on the client rung: the second session is PROVEN blocked, and the asset ends with no overlapping and no double charge", async (t) => {
  if (skipHere(t)) return;
  // Order 1 — the RUN takes the rung first, the DISPOSE contends.
  const f1 = await rungFixture("m1a");
  const r1 = await raceOnRung({
    first: { begin: beginRuntime, sql: RUN_SQL, params: [f1.client, f1.next.start, f1.next.end, opk("x41m1run")] },
    second: {
      begin: beginHuman(w.users.alice), sql: DISPOSE_SQL,
      params: [f1.client, f1.asset, f1.next.end, 100_000, BANK, "530-D41", "901-Y41", "x41 m1a dispose", opk("x41m1disp")],
    },
  });
  assert.ok(r1.provedBlocked, "the DISPOSE genuinely waited on the run's 203005004 rung (the §7 serialization cell is real, not luck)");
  const ranges1 = await liveRanges(f1.asset);
  assertNoOverlaps(ranges1, "run-then-dispose");
  if (!r1.b.ok) noteLane(`x41.m1 order RUN→DISPOSE: the loser is NAMED — code=${r1.b.code} detail=${r1.b.detail ?? ""}`);

  // Order 2 — the DISPOSE takes the rung first, the RUN contends.
  const f2 = await rungFixture("m1b");
  const r2 = await raceOnRung({
    first: {
      begin: beginHuman(w.users.alice), sql: DISPOSE_SQL,
      params: [f2.client, f2.asset, f2.next.end, 100_000, BANK, "530-D41", "901-Y41", "x41 m1b dispose", opk("x41m2disp")],
    },
    second: { begin: beginRuntime, sql: RUN_SQL, params: [f2.client, f2.next.start, f2.next.end, opk("x41m2run")] },
  });
  assert.ok(r2.provedBlocked, "…and the RUN genuinely waited on the disposal's rung in the reverse order");
  const ranges2 = await liveRanges(f2.asset);
  assertNoOverlaps(ranges2, "dispose-then-run");
  if (!r2.b.ok) {
    noteLane(`x41.m1 order DISPOSE→RUN: the loser is NAMED — code=${r2.b.code} detail=${r2.b.detail ?? ""}`);
    assert.ok(r2.b.code, "a losing contender always carries a SQLSTATE — never an unnamed crash");
  } else {
    const skipped = (r2.b.result?.skipped ?? []).map((s) => s.reason);
    noteLane(`x41.m1 order DISPOSE→RUN: the run completed, skipping ${JSON.stringify(skipped)}`);
  }
  // Whichever order, the disposal month is charged exactly ONCE across both acts.
  for (const [label, ranges] of [["run-then-dispose", ranges1], ["dispose-then-run", ranges2]]) {
    const covering = ranges.filter((r) => r.end.slice(0, 7) === mon(-2).key);
    assert.ok(covering.length <= 1, `${label}: the disposal month is charged at most ONCE (got ${covering.length} ranges)`);
  }
});
