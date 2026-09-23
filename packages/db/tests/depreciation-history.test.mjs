// #651 [0227] — 按明确政策执行折旧并保留估计变更历史.
//
// THE CELL THAT DEFINES THE TICKET IS `p651.period.closed_refused`, AND WHAT IT MEASURES IS NOT
// WHAT THE SPEC EXPECTED. Below 0227, a run into a CLOSED fiscal year does not draft and die at
// approve: `clara._tf_period_wall_lines` — a BEFORE trigger on `clara.journal_lines` — refuses the
// LINE insert with CLR19 `write_into_closed_period` naming an entry id, the whole transaction rolls
// back, and NOTHING is left behind. The real defect is one step further on: the due oracle then
// keeps advertising that same period, once per sweep, FOREVER (measured — `p651.period.closed_belt_skips`
// re-measures it), which is exactly the failure 0042:4441 names in its own words and which
// `reconciler-fa.mjs:108-157` records as one `faFailed` per client per cycle and nothing louder.
// 0227 therefore moves the refusal to the RUNNING DOOR, typed (CLR38 axis `period_closed`, naming
// the fiscal year and the reopen path), AND teaches the oracle to skip what the door would refuse.
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA — `humanQuery` at its least-privileged floor,
// or `roleQuery(ROLES.runtime)` for the machine lane. `rootQuery` appears only as a READBACK, or as
// LABELLED fixture DML where no audited verb reaches the shape (a fiscal year's lifecycle; an
// authority signed in a PAST month), and each such site says why in `depreciation-history-fixtures.mjs`.
//
// FRONTIER-GATED on the `depreciation_history$` stem, never on a number. A FOCUSED invocation
// (without `--import ./tests/depreciation-history-preintegration-gate.mjs`) FAILS LOUDLY when 0227
// is absent, because a skip is not evidence.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate651, p651Client, fiscalYear, liveAuthorityWithRef, signWithRef, previewRun, runPeriodFor,
  proposeAuthority, retireAuthority, authorityEnvelope,
  reviseClassified, completeWith, completeForWith, withdrawDraftAs, backdateAuthorityFloor,
  functionDef, regprocedureExists, roleHasExecute, draftDepreciationEntries,
  depreciationEntries, mintChatTaskRef,
  faWorld, buyAsset, completeSL, runManual, runPeriod, runDue, runDueAsHuman, entryRowOf,
  approveEntry, disposeAsset, faRow, faRows, clientCharges, authorityRows, runRows, entryLinesOf,
  getFixedAsset,
  namedCall, humanQuery, rootQuery, roleQuery, ROLES, opk, idOf,
  mon, dayIn, caught, refuses, reasonToken, noteLane, printLaneNotes, printSkipCount, endPool,
  x41EnsureReady, BANK,
} from "./depreciation-history-fixtures.mjs";

let live = false;
before(async () => { live = await x41EnsureReady(); });
after(async () => {
  printLaneNotes("p651 depreciation history");
  printSkipCount("p651 depreciation history");
  await endPool();
});

/** Every cell needs 0041 (the register) and 0227 (this slice). */
async function gate(t) {
  if (!live) {
    t.skip("0041 is not applied — the #651 battery is dormant");
    return true;
  }
  return gate651(t);
}

const SL = (start) => ({ method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: start });

/** A client with ONE chargeable straight-line asset in service from month −3, particulars
 *  complete and a live authority carrying a resolved instruction. */
async function armed(label, { cents = 360_000, life = 36, from = -3, floorFrom = null } = {}) {
  const w = await faWorld();
  const client = await p651Client(label);
  const start = mon(from);
  const { asset } = await buyAsset({ client, cents, postingDate: dayIn(start, 1) });
  await completeSL(client, asset.id, { life, start: start.start, description: `p651 ${label}` });
  const au = await liveAuthorityWithRef(client);
  if (floorFrom !== null) await backdateAuthorityFloor(au.id, mon(floorFrom).start);
  return { w, client, asset, start, au };
}

/** Run a period through the HUMAN door and settle the draft it leaves, so the next period is
 *  reachable. The first run under a fresh authority always DRAFTS (WD-R5's one-time ramp). */
async function runManualAndSettle(client, period, { as = null, approveAs = null } = {}) {
  const w = await faWorld();
  const receipt = await runManual(as ?? w.users.bob,
    { client, periodStart: period.start, periodEnd: period.end });
  if (receipt.status === "noop") return { receipt, entryId: null };
  const e = await entryRowOf(receipt.entry_id);
  if (e.status === "draft") {
    await approveEntry(approveAs ?? w.users.alice,
      { entry: receipt.entry_id, expectedRevision: e.revision_token, opKey: opk("p651apr") });
  }
  return { receipt, entryId: receipt.entry_id };
}

// ===========================================================================================
// 1 · THE CHANGE CLASSIFICATION (AC1, D10).
// ===========================================================================================

test("p651.class.required a revision with no change class is refused BY NAME; an `estimate` revision supersedes forward and stamps the class and the reason on the SUCCESSOR row", async (t) => {
  if (await gate(t)) return;
  const { w, client, asset, start } = await armed("class_required");
  const eff = mon(0).start;

  const noClass = await refuses(() => reviseClassified(w.users.bob, {
    client, asset: asset.id, particulars: SL(start.start), effectiveFrom: eff,
    changeClass: null, changeReason: null,
  }), "fa_change_class_required", "class.required.missing");
  assert.equal(noClass.code, "CLR37", "the classification refusal rides the particulars SQLSTATE");
  assert.equal(JSON.parse(String(noClass.detail)).axis, "change_class");
  assert.deepEqual(JSON.parse(String(noClass.detail)).implemented, ["estimate"],
    "…and the refusal says which of the three classes is actually implemented today");

  const blankReason = await refuses(() => reviseClassified(w.users.bob, {
    client, asset: asset.id, particulars: SL(start.start), effectiveFrom: eff,
    changeClass: "estimate", changeReason: "   ",
  }), "fa_change_class_required", "class.required.blank_reason");
  assert.equal(JSON.parse(String(blankReason.detail)).axis, "change_reason",
    "a blank reason is named as its own axis, not folded into the class");

  const before = (await faRows(client)).length;
  const ok = await reviseClassified(w.users.bob, {
    client, asset: asset.id, particulars: { ...SL(start.start), useful_life_months: 48 },
    effectiveFrom: eff, changeClass: "estimate", changeReason: "the plant survey revised the life to 48 months",
  });
  assert.ok(ok.successor_asset_id, "the revision names its successor");
  assert.equal(ok.change_class, "estimate", "…and the RECEIPT carries the class, so a surface needs no second read");
  assert.equal(ok.change_reason, "the plant survey revised the life to 48 months");
  assert.equal((await faRows(client)).length, before + 1, "exactly ONE successor row");

  const succ = await faRow(ok.successor_asset_id);
  assert.equal(succ.change_class, "estimate", "the SUCCESSOR carries the class");
  assert.equal(succ.change_reason, "the plant survey revised the life to 48 months");
  assert.equal(succ.supersedes_asset_id, asset.id);
  const pred = await faRow(asset.id);
  assert.equal(pred.change_class, null, "…and the PREDECESSOR is untouched — a class describes the change that SUPERSEDED a generation");
  assert.equal(pred.status, "superseded");

  // The production read projects it on every generation, which is what the revision timeline reads.
  const read = await getFixedAsset(w.users.carol, ok.successor_asset_id);
  assert.equal(read.asset.change_class, "estimate", "clara.get_fixed_asset projects the class");
  assert.ok(Array.isArray(read.lineage) && read.lineage.length >= 1, "…and the lineage carries a generation per ancestor");
  assert.ok(read.lineage.every((g) => "change_class" in g),
    "every lineage generation carries the key, so an un-classified ancestor reads as NOT RECORDED rather than missing");
});

test("p651.class.policy_refused / p651.class.error_refused both refuse CLR37 fa_change_class_unsupported, the detail names #680 and #679, and NO row is written", async (t) => {
  if (await gate(t)) return;
  const { w, client, asset, start } = await armed("class_refused");
  const eff = mon(0).start;
  for (const cls of ["policy", "error"]) {
    const before = (await faRows(client)).length;
    const err = await refuses(() => reviseClassified(w.users.bob, {
      client, asset: asset.id, particulars: { ...SL(start.start), useful_life_months: 48 },
      effectiveFrom: eff, changeClass: cls, changeReason: `a ${cls} change`,
    }), "fa_change_class_unsupported", `class.${cls}_refused`);
    assert.equal(err.code, "CLR37");
    const d = JSON.parse(String(err.detail));
    assert.equal(d.change_class, cls);
    assert.equal(d.owning_ticket, "#680",
      "the refusal hands the work to #680 (锁期后的迟到资料与重开决定) — NOT #676, which governs allocated-entry corrections and has nothing to do with fixed assets");
    assert.equal(d.lock_law, "#679", "…under #679's lock law");
    assert.equal((await faRows(client)).length, before,
      "ASSERT THE ROW COUNT, NOT THE MESSAGE: a refusal that still minted a successor would be worse than no refusal");
  }
  // …and a class outside the three recorded values is a malformed VALUE, on the particulars axis.
  const bad = await refuses(() => reviseClassified(w.users.bob, {
    client, asset: asset.id, particulars: SL(start.start), effectiveFrom: eff,
    changeClass: "reclassification", changeReason: "invented",
  }), "fa_particulars_invalid", "class.unknown_value");
  assert.equal(JSON.parse(String(bad.detail)).axis, "change_class");
});

test("p651.class.prior_untouched an `estimate` revision leaves every pre-existing fa_depreciation row byte-identical and the live-range uniqueness intact", async (t) => {
  if (await gate(t)) return;
  const { w, client, asset, start } = await armed("class_prior", { floorFrom: -12 });
  await runManualAndSettle(client, start);
  const before = await clientCharges(client);
  assert.ok(before.length >= 1, "mandatory setup: month −3 really charged");

  await reviseClassified(w.users.bob, {
    client, asset: asset.id, particulars: { ...SL(start.start), useful_life_months: 48 },
    effectiveFrom: mon(0).start, changeClass: "estimate", changeReason: "life revised prospectively",
  });

  const after = await clientCharges(client);
  assert.deepEqual(after, before,
    "a future estimate change does not silently regenerate prior charges — every stored row is byte-identical");
  const live = after.filter((r) => !r.unwind_of);
  const keys = live.map((r) => `${r.asset_id}|${r.period_start}|${r.period_end}`);
  assert.equal(new Set(keys).size, keys.length,
    "uq_fa_depreciation_live_range still holds across the supersede hop");
});

test("p651.class.completion_refused a FIRST completion carrying a change class is refused by name through BOTH completion doors", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("class_completion");
  const start = mon(-3);

  const a = await buyAsset({ client, cents: 120_000, postingDate: dayIn(start, 1) });
  const humanErr = await refuses(() => completeWith(w.users.bob, {
    client, asset: a.asset.id,
    particulars: { ...SL(start.start), change_class: "estimate", change_reason: "not a change" },
  }), "fa_change_class_on_completion", "completion.human");
  assert.equal(humanErr.code, "CLR37");
  assert.equal(JSON.parse(String(humanErr.detail)).remedy, "revise_fixed_asset_particulars",
    "…and it names the door that DOES take a class");
  assert.equal((await faRow(a.asset.id)).depreciation_method, null,
    "nothing was written by the refused completion");

  const b = await buyAsset({ client, cents: 130_000, postingDate: dayIn(start, 2) });
  const forErr = await caught(() => completeForWith({
    client, asset: b.asset.id, obo: w.users.bob,
    particulars: { ...SL(start.start), change_reason: "not a change either" },
  }));
  assert.ok(forErr, "completion.for: the runtime twin refuses too");
  assert.equal(reasonToken(forErr), "fa_change_class_on_completion",
    `completion.for: 0216's shared core carries the SAME wall (got ${forErr.code}: ${forErr.message})`);

  // …and a completion WITHOUT a class still works through both, so the wall is not a blanket refusal.
  await completeWith(w.users.bob, { client, asset: a.asset.id, particulars: SL(start.start) });
  assert.equal((await faRow(a.asset.id)).depreciation_method, "straight_line");
  await completeForWith({ client, asset: b.asset.id, obo: w.users.bob, particulars: SL(start.start) });
  assert.equal((await faRow(b.asset.id)).depreciation_method, "straight_line");
});

// ===========================================================================================
// 2 · THE LOCKED-PERIOD LAW (AC2, D9).
// ===========================================================================================

test("p651.period.closed_refused a run into a CLOSED fiscal year is refused AT THE DOOR with CLR38 axis period_closed, no draft exists, and the queue is not poisoned", async (t) => {
  if (await gate(t)) return;
  const { w, client, start } = await armed("period_closed", { floorFrom: -12 });
  // The fiscal year is closed AFTER the acquisition posted into it — the ordinary order of events.
  const fy = await fiscalYear(w.firms.A, client, {
    startsOn: mon(-6).start, endsOn: mon(-2).end, owner: w.users.alice, status: "closed",
  });

  const err = await refuses(() => runManual(w.users.bob,
    { client, periodStart: start.start, periodEnd: start.end }),
  "period_request_invalid", "period.closed_refused");
  assert.equal(err.code, "CLR38", "the locked period rides the FA family's own CLR38 axis, not CLR19");
  const d = JSON.parse(String(err.detail));
  assert.equal(d.axis, "period_closed", "…on a NEW axis of the existing reason, so the surface's CLR38 rendering holds");
  assert.equal(d.fiscal_year_id, fy, "the refusal NAMES the fiscal year");
  assert.equal(d.fy_status, "closed");
  assert.equal(d.remedy, "reopen_fiscal_year", "…and the one way back in");
  assert.match(String(err.message), /reopen_fiscal_year|reopen/i,
    "the human sentence names the reopen path too, not only the detail json");

  assert.deepEqual(await draftDepreciationEntries(client), [],
    "NOT ONE DRAFT IS CREATED — the wall sits before the first write, so a refused run leaves nothing to withdraw");
  assert.deepEqual(await depreciationEntries(client), [],
    "…and no entry of any status survived the refusal");

  const due = await runDue(client);
  assert.notEqual(due.reason, "period_draft_outstanding",
    "the queue is not pointing at a dead draft — that is the trap this wall exists to remove");
  noteLane(`p651.period.closed_refused: after the refusal the oracle answers ${JSON.stringify(due)}`);
});

test("p651.period.closed_belt_skips the oracle SKIPS a closed period, names it in skipped_closed and offers the next OPEN one — and the skipped month is never run in its own right", async (t) => {
  if (await gate(t)) return;
  const { w, client, start } = await armed("period_skip", { floorFrom: -12 });
  const fy = await fiscalYear(w.firms.A, client, {
    startsOn: mon(-6).start, endsOn: start.end, owner: w.users.alice, status: "closed",
  });

  const due = await runDue(client);
  assert.equal(due.due, true, "the oracle still has something to offer");
  assert.equal(due.period_start, mon(-2).start,
    `the oracle offers the next OPEN period, not the closed one (got ${JSON.stringify(due)})`);
  assert.ok(Array.isArray(due.skipped_closed) && due.skipped_closed.length >= 1,
    "…and it SAYS what it skipped: a skip nobody can see is the same defect as a silent post");
  const skipped = due.skipped_closed.find((s) => s.period_start === start.start);
  assert.ok(skipped, `the skipped list names month −3 (got ${JSON.stringify(due.skipped_closed)})`);
  assert.equal(skipped.fiscal_year_id, fy);
  assert.equal(skipped.fy_status, "closed");

  // The viewer-facing probe surfaces it unchanged — the surface reads the same answer the belt does.
  const asHuman = await runDueAsHuman(w.users.carol, client);
  assert.deepEqual(asHuman.skipped_closed, due.skipped_closed,
    "clara.depreciation_run_due surfaces skipped_closed verbatim");

  // THE SKIPPED PERIOD IS NEVER RUN IN ITS OWN RIGHT. Running the offered OPEN period charges the
  // arrears — the charge ROWS keep their own months, the journal ENTRY is dated in the open period,
  // so the closed year's reported figures never move. That is the measured truth and it is visible.
  const { receipt, entryId } = await runManualAndSettle(client, mon(-2));
  assert.notEqual(receipt.status, "noop");
  const entry = await entryRowOf(entryId);
  assert.equal(entry.posting_date, mon(-2).end,
    "the ENTRY is dated in the OPEN period — 0056's walls are satisfied without a permit");
  const charges = await clientCharges(client);
  assert.ok(charges.some((c) => c.period_start === start.start),
    "…while the CHARGE rows still carry the months they belong to, including the skipped one");
  const runsInClosed = (await runRows(client)).filter((r) => r.period_end <= start.end);
  assert.deepEqual(runsInClosed, [],
    "no RUN receipt was ever written for a period inside the closed year");
  assert.deepEqual(await depreciationEntries(client).then((es) => es.filter((e) => e.posting_date <= start.end)), [],
    "…and no journal entry is dated inside it");
});

test("p651.period.blocked_draft_recovery an outstanding depreciation draft blocks the client's WHOLE queue, withdraw_draft clears it, and the next probe is due again", async (t) => {
  if (await gate(t)) return;
  const { w, client, start } = await armed("period_recovery", { floorFrom: -12 });

  const run = await runManual(w.users.bob, { client, periodStart: start.start, periodEnd: start.end });
  assert.equal(run.status, "drafted", "WD-R5: the FIRST run under a fresh authority DRAFTS");
  assert.equal((await runDue(client)).reason, "period_draft_outstanding",
    "…and one outstanding draft blocks EVERY later period for this client");

  // THE ONE REAL RECOVERY THIS JOURNEY HAS — and no cell in the estate exercised it on a
  // depreciation draft before this one (inferred from 0041:5217, never driven).
  const wd = await withdrawDraftAs(w.users.bob, { entry: run.entry_id, reason: "p651 recovery" });
  assert.equal(wd.status, "withdrawn", "clara.withdraw_draft accepts a depreciation draft");
  assert.equal((await entryRowOf(run.entry_id)).status, "withdrawn");

  const after = await runDue(client);
  assert.equal(after.due, true, "the queue REOPENS: the period is due again once the draft is gone");
  assert.equal(after.period_start, start.start, "…and it is the same oldest unmet period, not a later one");
});

// ===========================================================================================
// 3 · THE AUTHORITY'S EXPLICIT INSTRUCTION AND ITS WINDOW (AC5, D7 + D8).
// ===========================================================================================

test("p651.authority.ref_resolves signing needs an instruction that RESOLVES in the same firm AND client; every other shape is refused by name and NOTHING is signed", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("auth_ref");
  const other = await p651Client("auth_ref_other");

  const propose = async (c) => {
    const r = await humanQuery(w.users.bob,
      "select clara.propose_depreciation_authority(p_client => $1, p_cadence => 'monthly', p_op_key => $2) as r",
      [c, opk("p651prop")]);
    return idOf(r.rows[0].r, "authority_id", "id");
  };
  const auth = await propose(client);
  const stillProposed = async () => {
    const rows = (await authorityRows(client)).filter((a) => a.id === auth);
    assert.equal(rows[0].status, "proposed", "…and NOTHING is signed");
    assert.equal(rows[0].authority_from, null, "…and no window floor was stamped");
  };

  for (const [ref, token, constraint, label] of [
    [null, "authority_ref_invalid", "object", "null"],
    ["not-an-object", "authority_ref_invalid", "object", "scalar"],
    [{ kind: "knowledge_record", id: "00000000-0000-4000-8000-000000000001" }, "authority_ref_invalid", "kind", "knowledge"],
    [{ kind: "chat_task", id: "not-a-uuid" }, "authority_ref_invalid", "id", "bad id"],
  ]) {
    const err = await refuses(() => signWithRef(w.users.hana, { client, authority: auth, ref }),
      token, `auth.ref.${label}`);
    assert.equal(err.code, "CLR38", `auth.ref.${label}: on the FA family's CLR38 axis`);
    assert.equal(JSON.parse(String(err.detail)).constraint, constraint);
    await stillProposed();
  }

  const nonexistent = { kind: "chat_task", id: "00000000-0000-4000-8000-0000000000ff" };
  let err = await refuses(() => signWithRef(w.users.hana, { client, authority: auth, ref: nonexistent }),
    "authority_ref_unresolved", "auth.ref.nonexistent");
  assert.equal(JSON.parse(String(err.detail)).kind, "chat_task");
  await stillProposed();

  // ANOTHER CLIENT'S row resolves to nothing HERE — the ladder is firm AND client.
  const foreign = await mintChatTaskRef(other);
  err = await refuses(() => signWithRef(w.users.hana, { client, authority: auth, ref: foreign }),
    "authority_ref_unresolved", "auth.ref.other_client");
  await stillProposed();

  // …and the resolving one signs, stamps the ref and stamps the window floor.
  const ok = await mintChatTaskRef(client);
  const signed = await signWithRef(w.users.hana, { client, authority: auth, ref: ok });
  assert.equal(signed.status, "live");
  assert.deepEqual(signed.authority_ref, ok, "the receipt carries the instruction it resolved");
  const row = (await authorityRows(client)).find((a) => a.id === auth);
  assert.deepEqual(row.authority_ref, ok, "…and so does the row");
  assert.equal(row.authority_kind, "explicit_instruction");
  assert.equal(row.authority_from, mon(0).start,
    "D8: the window floor is the first day of the SIGNING month, in the book's Asia/Kuala_Lumpur calendar");
});

test("p651.authority.floor an authority signed today makes the belt run FORWARD ONLY; the human catch-up door still reaches an earlier month; and the agent catch-up lane's only period source answers not-due for every pre-floor month", async (t) => {
  if (await gate(t)) return;
  // Two YEARS of uncharged asset, and an authority signed TODAY.
  const { w, client, start } = await armed("auth_floor", { from: -24, life: 60 });
  const row = (await authorityRows(client)).find((a) => a.status === "live");
  assert.equal(row.authority_from, mon(0).start, "mandatory setup: the floor is this month");

  const due = await runDue(client);
  assert.equal(due.due, false,
    `the belt is offered NOTHING pre-floor (got ${JSON.stringify(due)}) — a signature is not permission to charge every past period`);
  assert.equal(due.reason, "period_not_ended",
    "…and the honest reason is that the first period at or after the floor has not ended yet");

  // THE MEASURED LOSS, asserted as a loss rather than as a passing behaviour: the parked agent
  // catch-up lane derives EVERY period it runs from this one body (0138:1130-1138 -> :2392), so it
  // can never again propose a pre-floor month. A future closePrep_v2 inherits that.
  const core = await rootQuery(
    "select clara._depreciation_run_due_core($1::uuid, (select firm_id from clara.clients where id=$1)) as r",
    [client]);
  assert.equal(core.rows[0].r.due, false,
    "the agent catch-up lane's ONLY period source is floored too — this is the reach the lane LOSES");

  // …and the human catch-up door still reaches an earlier month, because the poster reads the
  // oracle only for SEQUENCING and a caller-named period is admitted past it (0041:3479-3494).
  const manual = await runManual(w.users.bob, { client, periodStart: start.start, periodEnd: start.end });
  assert.notEqual(manual.status, "noop",
    "run_depreciation_manual IS the explicit human catch-up door D8 names — no new door is owed");
  assert.ok(manual.entry_id, "…and it really posted or drafted a period below the floor");
});

test("p651.authority.floor_sequencing RESIDUAL, PINNED: below the floor period_earlier_unmet no longer binds, and the out-of-order run is a NOOP that charges nothing twice", async (t) => {
  if (await gate(t)) return;
  const { w, client } = await armed("auth_floor_seq", { from: -6, life: 60 });

  // Month −2 first, month −5 second — deliberately OUT OF ORDER, both below the floor.
  const later = await runManualAndSettle(client, mon(-2));
  assert.notEqual(later.receipt.status, "noop", "the LATER period ran first");

  const chargesBefore = await clientCharges(client);
  const runsBefore = await runRows(client);
  assert.ok(chargesBefore.length > 0, "mandatory setup: the later run really charged the arrears");

  let earlierErr = null;
  let earlierReceipt = null;
  try {
    earlierReceipt = await runManual(w.users.bob,
      { client, periodStart: mon(-5).start, periodEnd: mon(-5).end });
  } catch (error) {
    earlierErr = error;
  }

  // THE SLICE TOOK THE SECOND OF THE BRIEF'S TWO ANSWERS (§3 item 3(a)): the oldest-unmet bound is
  // NOT re-derived unfloored for the caller-named path, because the only instruments that could do
  // it are the ONE 1-arg oracle (whose consumer set is deepEqual-pinned by two live CI batteries)
  // and a bypass parameter on it (a DROP + CREATE re-patching four call sites plus a rig-meta row,
  // against §2.2 rule 4). So the `period_earlier_unmet` guarantee — the thing that pins the
  // reducing-balance arithmetic so a run can never read around an unapproved period — STOPS
  // BINDING BELOW THE FLOOR.
  //
  // THIS CELL PINS THE EXPOSURE AS MEASURED FACT RATHER THAN LOGGING IT (adversarial review
  // ADV-651-4: an assertion that holds in both branches pins nothing and occupies the slot of the
  // one that would). Both halves are asserted, so a later change in EITHER direction reds here:
  // if the guard ever binds again this cell fails on the first assertion and the residual is
  // closed; if the exposure ever turns into a DOUBLE CHARGE it fails on the last two.
  assert.equal(earlierErr, null,
    "RESIDUAL, MEASURED: an out-of-order PRE-FLOOR period is admitted with no period_earlier_unmet "
    + `refusal (got ${earlierErr ? `${reasonToken(earlierErr)} / ${earlierErr.code}` : "none"}) — below `
    + "authority_from the sequencing guarantee does not hold");
  assert.equal(earlierReceipt.status, "noop",
    "…and what saves the arithmetic is that it is a NOOP: clara._fa_asset_charges already charged "
    + "every uncharged month up to the LATER period's end, so the earlier run finds nothing left "
    + "to charge. The exposure is real; the damage today is nil, and that is the whole finding");
  assert.equal(earlierReceipt.entry_id ?? null, null, "…a noop persists nothing — no entry");
  assert.deepEqual(await clientCharges(client), chargesBefore,
    "…not one charge row moved, was added or was re-dated by the out-of-order run");
  assert.deepEqual((await runRows(client)).map((r) => r.id), runsBefore.map((r) => r.id),
    "…and no run row was written either");
  noteLane("p651.authority.floor_sequencing RESIDUAL CONFIRMED AND PINNED: two pre-floor months ran "
    + "OUT OF ORDER through run_depreciation_manual with no period_earlier_unmet refusal; the second "
    + "run was a noop with the charge set and the run rows unchanged. Follow-up filed.");
});

test("p651.authority.retire_unsigned a NEVER-SIGNED authority can still be WITHDRAWN through the real admin door, and the lane reopens", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("auth_retire_unsigned");

  // THE ACT: a firm proposes the wrong cadence and withdraws it before anyone signs. 0041 wrote
  // `retire_depreciation_authority` for exactly this — it coalesces the signature stamps
  // (0041:3393-3394) instead of demanding them, so `proposed -> retired` is a lawful edge and
  // `clara._tf_fa_authority_transition` admits it by name. 0227 adds a WINDOW COLUMN and a CHECK
  // over it; if the retire door does not stamp the floor the way it already stamps the signature,
  // this lawful act dies on a raw 23514 check violation with no CLR code, no reason token and no
  // remedy — in a dialog the admin is looking at (fa-authority-ceremony.tsx renders Retire for a
  // PROPOSED authority too, only Sign is gated). Adversarial review ADV-651-1.
  const auth = await proposeAuthority(w.users.bob, { client });
  const before = (await authorityRows(client)).find((a) => a.id === auth);
  assert.equal(before.status, "proposed", "mandatory setup: it is proposed and NEVER signed");
  assert.equal(before.authority_from, null, "…and a proposed authority carries no window floor");
  assert.equal(before.signed_at, null, "…nor a signature");

  const receipt = await retireAuthority(w.users.hana,
    { client, authority: auth, reason: "p651 wrong cadence, withdrawn before signature" });
  assert.equal(receipt.status, "retired", "the admin door accepts the withdrawal and says so");

  const after = (await authorityRows(client)).find((a) => a.id === auth);
  assert.equal(after.status, "retired");
  assert.equal(after.authority_from, mon(0).start,
    "…and it leaves with a window floor stamped the same way the door already stamps the signature "
    + "(coalesce), so ck_fa_authorities_window reads true of every non-proposed row forever");
  assert.ok(after.signed_at, "…exactly as 0041's own coalesce already invents a signature stamp");

  // …and the READ tells this apart from "never had one" (#979, 0251). Until 0251 this cell
  // pinned the OPPOSITE: `env.authority === null`, a retired-only client sharing the
  // 'none proposed' state with a fresh one. The owner's 2026-09-20 ruling on #979 reversed that
  // deliberately — a bookkeeper deciding whether to propose a new authority needs to see that a
  // prior one existed and was withdrawn — so the read now answers THREE states, and this cell
  // pins the third one on the very row this cell withdrew.
  const env = await authorityEnvelope(w.users.bob, client);
  assert.ok(env.authority,
    "the READ is honest about a withdrawal: a retired-only client no longer shares the "
    + "'none proposed' state with a fresh one (#979 / 0251)");
  assert.equal(env.authority.id, auth, "…and it is THIS authority, the one just withdrawn");
  assert.equal(env.authority.status, "retired", "…reported as retired, not as absent");
  assert.equal(env.authority.retired_reason, "p651 wrong cadence, withdrawn before signature",
    "…carrying the reason the admin gave at the door");
  assert.equal(env.authority.retired_by, after.retired_by,
    "…and the retiring author the table itself recorded");
  assert.equal(env.authority.authority_from, mon(0).start,
    "…and the window floor the retire door coalesced in, the same value the table carries");

  const again = await proposeAuthority(w.users.bob, { client, cadence: "annual" });
  assert.ok(again && again !== auth,
    "THE RECOVERY, which is what this cell has always been about: the lane REOPENS — the "
    + "corrected cadence can be proposed once the wrong one is gone. #979 changed what the READ "
    + "says about the withdrawn row; it changed nothing about whether the lane reopens");
  const reopened = await authorityEnvelope(w.users.bob, client);
  assert.equal(reopened.authority.id, again,
    "…and the read now prefers the freshly PROPOSED authority over the retired one (0041's "
    + "live-or-proposed preference is what 0251 falls back FROM, never past)");
  assert.equal(reopened.authority.status, "proposed");
});

test("p651.authority.floor_frozen once stamped, the window floor and the instruction reference never move again — not on the retire transition, not by a direct UPDATE", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("auth_frozen");
  const au = await liveAuthorityWithRef(client);
  const stamped = (await authorityRows(client)).find((a) => a.id === au.id);
  assert.equal(stamped.authority_from, mon(0).start, "mandatory setup: the floor is stamped");
  assert.ok(stamped.authority_ref, "…and so is the instruction it was signed under");

  // (a) THE TRIGGER LAW ITSELF. D8's words are "written once at sign time and frozen", and 0227
  // adds both columns to `v_frozen` — which is the allowlist of columns a LAWFUL TRANSITION may
  // write, and says nothing about writing them TWICE. NO audited verb can attempt a second write,
  // so the attempt is a LABELLED root UPDATE: the same instrument accounting-plans.test.mjs:450-456
  // uses on the same law for clara.accounting_plans.authority_from, whose own comment is the
  // argument — "a frozen column nobody tests is a promise". Adversarial review ADV-651-6.
  for (const [col, value] of [
    ["authority_from", "date '2020-01-01'"],
    ["authority_ref", `'{"kind":"chat_task","id":"00000000-0000-4000-8000-0000000000ff"}'::jsonb`],
  ]) {
    const err = await refuses(
      () => rootQuery(`update clara.fa_depreciation_authorities set ${col}=${value} where id=$1`, [au.id]),
      "authority_immutable", `p651.frozen.${col}`);
    assert.equal(err.code, "CLR38", `${col}: on the FA family's CLR38 axis`);
    assert.equal(JSON.parse(String(err.detail)).column, col, "…and the refusal NAMES the column that moved");
  }
  const unmoved = (await authorityRows(client)).find((a) => a.id === au.id);
  assert.equal(unmoved.authority_from, stamped.authority_from, "…nothing moved");
  assert.deepEqual(unmoved.authority_ref, stamped.authority_ref);

  // (b) THE AUDITED PATH: retiring a SIGNED authority carries both values through untouched — the
  // door's coalesce writes the floor only when there is none.
  await retireAuthority(w.users.hana, { client, authority: au.id, reason: "p651 retire after sign" });
  const retired = (await authorityRows(client)).find((a) => a.id === au.id);
  assert.equal(retired.status, "retired");
  assert.equal(retired.authority_from, stamped.authority_from,
    "the floor a signature stamped survives the retirement unchanged");
  assert.deepEqual(retired.authority_ref, stamped.authority_ref,
    "…and so does the instruction it was signed under");
});

// ===========================================================================================
// 4 · THE CENSUSES THE TWO SPLICES COULD BREAK.
// ===========================================================================================

test("p651.census.rerun_gate after both splices the shared re-run gate still has exactly four consumers, origin='scheduled_run' still has exactly three writers, and 0042 S5.15c's ordering law still reads true", async (t) => {
  if (await gate(t)) return;
  const consumers = (await rootQuery(
    `select proname from pg_proc where pronamespace='clara'::regnamespace
       and prosrc like '%clara._wdb_rerun_breach(%' order by proname`)).rows.map((r) => r.proname);
  assert.deepEqual(consumers,
    ["_adj_oldest_unmet_period", "_adj_run_occurrence_core", "_fa_oldest_unmet_period", "_fa_run_period_core"],
    "BOTH posters and BOTH due oracles still consult the ONE re-run gate — a splice that dropped 0042's call would red two live CI batteries");

  const writers = (await rootQuery(
    `select x.n from (select proname as n, regexp_replace(prosrc, '--[^\\n]*', '', 'g') as b
                        from pg_proc where pronamespace='clara'::regnamespace) x
      where x.b like '%insert into clara.journal_entries%' and x.b like '%scheduled_run%'
      order by x.n`)).rows.map((r) => r.n);
  assert.deepEqual(writers, ["_adj_on_approve", "_adj_run_occurrence_core", "_fa_run_period_core"],
    "the OBO run door DELEGATES and never inserts — the machine-origin writer set is unmoved");

  const def = await functionDef("clara._fa_oldest_unmet_period(uuid)");
  const at = (s) => def.indexOf(s);
  assert.ok(at("period_draft_outstanding") < at("clara._wdb_rerun_breach(p_client")
    && at("clara._wdb_rerun_breach(p_client") < at("for fa in select f.id as id from clara.fixed_assets f"),
  "0042 S5.15c's ordering law still reads true of the recut oracle: the gate sits after the draft freeze and strictly before the asset walk");
  assert.ok(/STABLE/i.test(def), "…and the oracle is still STABLE — it must ANSWER, never raise");
  assert.equal(def.includes("begin\n    v_fy_id"), false,
    "…and it asks the fiscal-year question INLINE, never through a begin/exception around the assert");
});

test("p651.census.callers_four clara._fa_run_period_core's caller set is now exactly the four named bodies", async (t) => {
  if (await gate(t)) return;
  const callers = (await rootQuery(
    `select proname from pg_proc where pronamespace='clara'::regnamespace
       and proname <> '_fa_run_period_core'
       and prosrc like '%clara._fa_run_period_core(%' order by proname`)).rows.map((r) => r.proname);
  assert.deepEqual(callers,
    ["_agent_depreciation_catchup_core", "run_depreciation_manual", "run_depreciation_period", "run_depreciation_period_for"],
    "THREE before 0227 and FOUR after — a tail written for three passes while the new door sits outside the set");
  assert.equal(await regprocedureExists("clara._fa_period_open(uuid,date)"), false,
    "…and the roster is ONE new helper: no second period predicate was minted");
  assert.equal(await regprocedureExists("clara._fa_assert_period_open(uuid,date)"), true);
  assert.equal(await regprocedureExists("clara.sign_depreciation_authority(uuid,uuid,text)"), false,
    "the three-argument sign door is GONE — one pg_proc row per name, never an overload");
  assert.equal(await regprocedureExists("clara.revise_fixed_asset_particulars(uuid,uuid,jsonb,date,text)"), true,
    "…and the revise door kept its five-argument signature (it is granted BY SIGNATURE at 0041:4414)");
});

// ===========================================================================================
// 5 · THE PREVIEW (AC5, I6).
// ===========================================================================================

test("p651.preview.matches_run the preview and the run that follows it agree EXACTLY on the period, the per-asset amounts, the skipped set and the two legs — and the preview writes nothing", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();
  const client = await p651Client("preview_match");
  const start = mon(-3);

  // A chargeable asset, an INCOMPLETE one, and one frozen by an outstanding DISPOSAL DRAFT — the
  // fifth skip reason, which the per-asset function can never return (it is written by
  // clara._fa_compute_charges itself). M7 measured the vocabulary at exactly five names.
  const good = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1) });
  await completeSL(client, good.asset.id, { life: 36, start: start.start, description: "p651 chargeable" });
  // An asset with NO particulars — the `incomplete` skip the preview must name. It is never
  // referred to again by id: what the cell asserts is that its REASON reaches the receipt.
  await buyAsset({ client, cents: 90_000, postingDate: dayIn(start, 2) });
  const frozen = await buyAsset({ client, cents: 24_000_000, postingDate: dayIn(start, 3) });
  await completeSL(client, frozen.asset.id, { life: 12, start: start.start, description: "p651 frozen" });

  const au = await liveAuthorityWithRef(client);
  await backdateAuthorityFloor(au.id, mon(-12).start);

  // Earn the ramp and clear month −3 so the disposal's own precondition is met, then leave a
  // high-stakes disposal DRAFT outstanding for month −2.
  await runManualAndSettle(client, start);
  const disposal = await disposeAsset(w.users.alice, {
    client, asset: frozen.asset.id, disposalDate: mon(-2).end, proceedsCents: 30_000_000,
    proceedsAccount: BANK, memo: "p651 pending disposal",
  });
  assert.equal((await entryRowOf(idOf(disposal, "entry_id", "id"))).status, "draft",
    "mandatory setup: the high-stakes disposal DRAFTS, so the freeze is really outstanding");

  const receiptsBefore = (await runRows(client)).length;
  const entriesBefore = (await depreciationEntries(client)).length;
  const chargesBefore = (await clientCharges(client)).length;

  const pv = await previewRun(w.users.carol, client); // VIEWER — the preview is viewer-floored
  assert.equal(pv.due, true, `the preview says a period is due (got ${JSON.stringify(pv)})`);
  assert.equal(pv.period_start, mon(-2).start, "…and it is the period the DATABASE chose, never the caller's");
  assert.equal(pv.period_end, mon(-2).end);
  assert.equal(pv.cadence, "monthly");
  assert.equal(pv.authority_from, mon(-12).start, "…and the preview shows the window floor in force");
  const skipReasons = (pv.skipped ?? []).map((s) => s.reason).sort();
  assert.ok(skipReasons.includes("incomplete"), `the preview names the incomplete asset (got ${JSON.stringify(pv.skipped)})`);
  assert.ok(skipReasons.includes("disposal_draft_outstanding"),
    "…and the fifth reason, which only clara._fa_compute_charges can emit");
  assert.ok(pv.legs.length === 2, `two GL legs, one pair (got ${JSON.stringify(pv.legs)})`);
  assert.equal(pv.legs[0].debit_cents + pv.legs[1].debit_cents,
    pv.legs[0].credit_cents + pv.legs[1].credit_cents, "…and they balance exactly");

  // THE PREVIEW WROTE NOTHING. It is `stable`, so the language itself refuses — assert it anyway.
  assert.equal((await runRows(client)).length, receiptsBefore, "no run receipt");
  assert.equal((await depreciationEntries(client)).length, entriesBefore, "no journal entry");
  assert.equal((await clientCharges(client)).length, chargesBefore, "no charge row");

  const { receipt, entryId } = await runManualAndSettle(client, mon(-2));
  assert.equal(receipt.charged_cents, pv.charged_cents,
    "the RUN charges exactly what the preview showed — a projection presented as a posted figure is the one thing this read must never be");
  assert.equal(receipt.entries, pv.entries);
  assert.deepEqual((receipt.skipped ?? []).map((s) => s.reason).sort(), skipReasons,
    "…and the skipped set is identical, reason for reason");
  const lines = await entryLinesOf(entryId);
  assert.deepEqual(
    lines.map((l) => ({ account_code: l.account_code, debit_cents: Number(l.debit_cents), credit_cents: Number(l.credit_cents) })),
    pv.legs.map((l) => ({ account_code: l.account_code, debit_cents: Number(l.debit_cents), credit_cents: Number(l.credit_cents) })),
    "…and the two legs are the entry's own lines, in the same order and to the sen");
});

test("p651.preview.grants the preview is offered to a viewer, refused to clara_runtime, refuses another firm's client with CLR11 — and clara._fa_compute_charges still holds no EXECUTE for any application role", async (t) => {
  if (await gate(t)) return;
  const { w, client } = await armed("preview_grants", { floorFrom: -12 });

  const asViewer = await previewRun(w.users.carol, client);
  assert.ok(asViewer.client_id === client, "a VIEWER may preview — it writes nothing");

  const asRuntime = await caught(() => roleQuery(ROLES.runtime,
    "select clara.preview_depreciation_run(p_client => $1) as r", [client]));
  assert.ok(asRuntime, "clara_runtime may NOT preview — the human read stays human");
  assert.match(String(asRuntime.message), /permission denied/i);

  // Another FIRM's client: CLR11, the estate's no-existence-oracle answer for a human read.
  const foreignErr = await caught(() => humanQuery(w.users.carol,
    "select clara.preview_depreciation_run(p_client => $1) as r",
    ["00000000-0000-4000-8000-0000000000aa"]));
  assert.ok(foreignErr);
  assert.equal(foreignErr.code, "CLR11");

  for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
    assert.equal(await roleHasExecute(role, "clara._fa_compute_charges(uuid,date,date)"), false,
      `${role} must NOT execute the ungranted arithmetic core — the WRAPPER is granted, never the core`);
  }
  assert.equal(await roleHasExecute(ROLES.authenticated, "clara.preview_depreciation_run(uuid)"), true);
  for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleHasExecute(role, "clara.preview_depreciation_run(uuid)"), false,
      `${role} must NOT reach the preview — no agent lane reads the register this way`);
  }
});

// ===========================================================================================
// 6 · THE OBO RUN DOOR (AC5, the successor contract's door) AND C86.2's RE-DERIVED PIN.
// ===========================================================================================

test("p651.obo.run_for the machine door runs on behalf of an active bookkeeper, refuses a demoted or removed initiator BY NAME, replays identically, and its mechanics are identical to the other two writer variants", async (t) => {
  if (await gate(t)) return;
  const w = await faWorld();

  const build = async (label) => {
    const a = await armed(label, { floorFrom: -12 });
    return a;
  };
  const a = await build("obo_run");
  const key = opk("p651obo");
  const out = await runPeriodFor({ client: a.client, through: mon(-1).end, opKey: key, obo: w.users.bob });
  assert.ok(out.periods_run >= 1, `the OBO door cleared at least one period (got ${JSON.stringify(out)})`);
  assert.equal(out.client_id, a.client);

  // REPLAY: the same op key returns the IDENTICAL receipt rather than running again.
  const replay = await runPeriodFor({ client: a.client, through: mon(-1).end, opKey: key, obo: w.users.bob });
  assert.deepEqual(replay, out, "a replay on the same op key returns the identical receipt");
  // …and the same key with DIFFERENT arguments is refused, because the key IS the identity.
  const clash = await caught(() => runPeriodFor({ client: a.client, through: mon(0).start, opKey: key, obo: w.users.bob }));
  assert.ok(clash, "the same key with different arguments is refused");
  assert.equal(clash.code, "CLR10");

  // A REMOVED initiator: CLR04 obo_not_active, by name.
  const b = await build("obo_removed");
  const noSuchHuman = "00000000-0000-4000-8000-0000000000bb";
  const removed = await caught(() => runPeriodFor({ client: b.client, obo: noSuchHuman }));
  assert.ok(removed);
  assert.equal(removed.code, "CLR04");
  assert.equal(reasonToken(removed), "obo_not_active",
    "a human who is not an active member of the client's firm cannot lend authority to a run");
  // …and a null initiator is the same refusal, never an anonymous run.
  const anon = await caught(() => runPeriodFor({ client: b.client, obo: null }));
  assert.equal(reasonToken(anon), "obo_not_active");
  // …and a member BELOW the bookkeeper floor is a DIFFERENT, named refusal.
  const viewerRun = await caught(() => runPeriodFor({ client: b.client, obo: w.users.carol }));
  assert.ok(viewerRun, "a viewer cannot lend authority to a depreciation run");
  assert.equal(reasonToken(viewerRun), "insufficient_role",
    "…and the two failures are told apart, exactly as 0216:761-812's ladder tells them apart");

  // C86.2, RE-DERIVED FOR THREE VARIANTS IN ONE ASSERTION. The equal-behaviour pin used to cover
  // run_depreciation_period and run_depreciation_manual as thin wrappers over ONE core; this
  // migration adds a THIRD writer variant, so the pin is re-derived to cover all three: each names
  // clara._fa_run_period_core exactly once, and NONE of them writes a journal entry itself.
  for (const fn of ["run_depreciation_period", "run_depreciation_manual", "run_depreciation_period_for"]) {
    const src = (await rootQuery("select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname=$1", [fn])).rows[0].prosrc;
    const calls = src.split("clara._fa_run_period_core(").length - 1;
    assert.equal(calls, 1, `${fn} reaches the ONE core exactly once (got ${calls})`);
    assert.equal(src.includes("insert into clara.journal_entries"), false,
      `${fn} writes no entry of its own — every one of the three is a thin wrapper over the same body`);
  }

  // …and the three really do produce the same figures on identically-built clients.
  const c = await build("obo_variant_machine");
  const d = await build("obo_variant_human");
  const viaMachine = await runPeriod({ client: c.client, periodStart: c.start.start, periodEnd: c.start.end });
  const viaHuman = await runManual(w.users.bob, { client: d.client, periodStart: d.start.start, periodEnd: d.start.end });
  const e = await build("obo_variant_obo");
  const viaObo = await runPeriodFor({ client: e.client, through: e.start.end, obo: w.users.bob });
  const oboFirst = viaObo.periods[0].result;
  for (const [name, r] of [["machine", viaMachine], ["human", viaHuman], ["obo", oboFirst]]) {
    assert.equal(r.status, "drafted", `${name}: the first run under a fresh authority DRAFTS`);
    assert.equal(r.charged_cents, viaMachine.charged_cents, `${name}: the same figure, to the sen`);
    assert.equal(r.entries, viaMachine.entries, `${name}: the same entry count`);
  }
});

test("p651.obo.manual_still_human clara.run_depreciation_manual holds no grant for any machine role, proven by calling it AS clara_runtime and reading the refusal", async (t) => {
  if (await gate(t)) return;
  const { client, start } = await armed("obo_manual", { floorFrom: -12 });
  const err = await caught(() => roleQuery(ROLES.runtime,
    namedCall("run_depreciation_manual", [
      { name: "p_client" }, { name: "p_period_start", cast: "date" },
      { name: "p_period_end", cast: "date" }, { name: "p_op_key" }]),
    [client, start.start, start.end, opk("p651manualruntime")]));
  assert.ok(err, "clara_runtime must NOT execute the manual verb — rig-meta.mjs:691-693's own law");
  assert.match(String(err.message), /permission denied/i);
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await roleHasExecute(role, "clara.run_depreciation_manual(uuid,date,date,text)"), false,
      `${role} holds no EXECUTE on the manual verb — or the maker-checker ladder would have a bypass`);
  }
  assert.equal(await roleHasExecute(ROLES.runtime, "clara.run_depreciation_period_for(uuid,date,text,uuid)"), true,
    "…which is exactly why the OBO door carries a NEW name");
  assert.equal(await roleHasExecute(ROLES.authenticated, "clara.run_depreciation_period_for(uuid,date,text,uuid)"), false,
    "…and why the new name never reaches a browser");
});

// ===========================================================================================
// 7 · THE REPLAY CENSUS (AC7).
// ===========================================================================================

test("p651.census.replay the estate's own censuses still read true at 0227: single-row names, both FA cohorts whole, the ungranted internals ungranted, and close_prep still disabled", async (t) => {
  if (await gate(t)) return;
  // (a) SINGLE pg_proc ROW per name this migration installs or recuts. The estate holds exactly
  // two such censuses (0103:1055-1070 and 0126:2129-2139) and NEITHER reaches these names.
  const dupes = (await rootQuery(
    `select proname, count(*)::int as n from pg_proc
      where pronamespace='clara'::regnamespace
        and proname = any($1) group by proname having count(*) <> 1 order by proname`,
    [["_fa_assert_period_open", "preview_depreciation_run", "run_depreciation_period_for",
      "sign_depreciation_authority", "revise_fixed_asset_particulars", "complete_fixed_asset_particulars",
      "_fa_complete_particulars_core", "_fa_validate_particulars", "_fa_asset_json",
      "_fa_oldest_unmet_period", "_fa_run_period_core", "_tf_fa_authority_transition"]])).rows;
  assert.deepEqual(dupes, [], "every name this migration touches resolves to exactly ONE pg_proc row");

  // (b) BOTH FA COHORTS RESOLVE WHOLE (rig-meta.mjs's own "wholly present or wholly absent" law),
  // plus 0227's three new names.
  const want = [
    "_fa_on_approve", "_fa_run_period_core", "_fa_compute_charges", "_fa_asset_charges", "_fa_asset_json",
    "_fa_validate_particulars", "_fa_oldest_unmet_period", "run_depreciation_period", "run_depreciation_manual",
    "depreciation_run_due", "sign_depreciation_authority", "revise_fixed_asset_particulars",
    "complete_fixed_asset_particulars", "get_fixed_asset", "list_depreciation_runs",
    "_tf_fa_acquisition_birth", "_fa_acquisition_json", "_fa_acquisition_history",
    "_fa_complete_particulars_core", "complete_fixed_asset_particulars_for",
    "_fa_assert_period_open", "preview_depreciation_run", "run_depreciation_period_for",
  ];
  const present = (await rootQuery(
    "select proname from pg_proc where pronamespace='clara'::regnamespace and proname = any($1)", [want]))
    .rows.map((r) => r.proname);
  assert.deepEqual(want.filter((n) => !present.includes(n)), [],
    "both FA cohorts and 0227's own are wholly present");

  // (c) THE UNGRANTED INTERNALS ARE STILL UNGRANTED — a grant appearing on any of them fails
  // rig-meta's main sweep, and `_fa_assert_period_open` joins that list.
  for (const sig of ["clara._fa_assert_period_open(uuid,date)", "clara._fa_compute_charges(uuid,date,date)",
    "clara._fa_asset_json(uuid,date)", "clara._fa_validate_particulars(jsonb)",
    "clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)",
    "clara._fa_oldest_unmet_period(uuid)"]) {
    for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
      assert.equal(await roleHasExecute(role, sig), false, `${sig} must hold no grant for ${role}`);
    }
  }

  // (d) THE `close_prep` WAKE SOURCE IS STILL DISABLED. 0227 must never be readable as having
  // unparked an agent close lane.
  const wake = await rootQuery("select enabled from clara.wake_engine_sources where source_key='close_prep'");
  assert.equal(wake.rows[0].enabled, false, "close_prep is still registered-and-disabled");

  // (e) …and the DROP + CREATE re-stated the grant it killed (the 0018:188 scar).
  assert.equal(await roleHasExecute(ROLES.authenticated, "clara.sign_depreciation_authority(uuid,uuid,text,jsonb)"), true,
    "the four-argument sign door is executable by clara_authenticated — the DROP killed the old arity's grant and this file re-stated it");
  for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime]) {
    assert.equal(await roleHasExecute(role, "clara.sign_depreciation_authority(uuid,uuid,text,jsonb)"), false,
      `${role} must NOT sign a depreciation authority — the signature is where the autonomy comes from`);
  }
});
