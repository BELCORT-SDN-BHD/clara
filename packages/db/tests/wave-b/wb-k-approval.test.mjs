// Wave-B battery — K4/K5 the WB-R4 batch approval (ONE serializable txn) +
// receipt replay + the two-session race + K13 sighting quarantine + the solo
// attestation + K11 SST-watch interplay. CONTRACT-BLIND; FAILS below 0017.
// [AMB-14] K5 pins the batch event LAST; the per-entry approved emissions ride
// "the as-built convention" — encoded: batch event carries the HIGHEST seq of a
// consecutive tail emission. Adjudication if as-built orders differently.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR30, opk, rootQuery,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists, detailReason,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc,
  createOpeningSeed, draftOpeningItem, recordOpeningTarget, recordParsedTargets,
  stageBeeSet, stageFullSet, BEE, WB_COA, revMapOf, planRevision,
  approveOpeningSeed, raceOpeningApproval,
  seedRegRow, openingApprovalRows, entryRow, sightingRows,
  freshResolution, commitOnboarding, updatePlan,
  freshWatchClient, approvedTurnoverEntry, evaluateSstWatch,
  setTurnoverClassification, openWatchRow,
} from "./wb-fixtures.mjs";
import { maxSeq, eventsSince } from "../rig-events-helpers.mjs";

let live = false;
let w = null;
let onb = null; // the MAIN staged client (5-item set: BEE + AR + reserves)
let doc = null;
let seed = null;
let drafts = []; // the five draft receipts

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const st = await stageFullSet(w.users.bob, { owner: w.users.alice, client: onb.client, plan: onb.plan, firm: w.firms.A });
  ({ seed, doc } = st);
  drafts = st.all;
});
after(async () => { printLaneNotes("wb-k-approval"); await endPool(); });

test("META: 0017 applied — the K5 family + internals exist", async () => {
  fail0017(live);
  for (const fn of ["approve_opening_seed", "_approve_opening_entry", "_assert_opening_tie", "supersede_opening_item", "approve_opening_correction"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
  }
});

test("K5: refuses outside SERIALIZABLE (the fn asserts transaction_isolation)", async () => {
  fail0017(live);
  const err = await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed, planRevision: onb.revision, tieSha256: doc.sha256,
    entryRevisions: revMapOf(drafts), serializable: false, opKey: opk("ns"),
  }), "non-serializable approval");
  const reason = detailReason(err);
  if (reason) assert.equal(reason, "not_serializable", "typed reason");
});

test("K5: a stale plan revision refuses (CLR30 stale_plan) and mutates nothing", async () => {
  fail0017(live);
  await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed, planRevision: "00000000-0000-4000-8000-000000000001", tieSha256: doc.sha256,
    entryRevisions: revMapOf(drafts), opKey: opk("sp"),
  }), "stale plan revision");
  assert.equal((await seedRegRow(seed)).state, "open", "registry untouched");
});

test("K5: an entry revision-token mismatch refuses (CLR30 revision_mismatch)", async () => {
  fail0017(live);
  const revs = revMapOf(drafts);
  revs[drafts[0].entry_id] = "00000000-0000-4000-8000-000000000002";
  await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(onb.plan), tieSha256: doc.sha256,
    entryRevisions: revs, opKey: opk("rm"),
  }), "entry revision mismatch");
  assert.equal((await entryRow(drafts[0].entry_id)).status, "draft", "entries stay draft");
});

test("K5: maker=checker is REFUSED per entry (OB is high-stakes; CLR05 semantics)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const r = await createOpeningSeed(w.users.hana, { client: o2.client, plan: o2.plan });
  const s2 = r.seed_id ?? r.id;
  const d = await draftOpeningItem(w.users.hana, {
    client: o2.client, seed: s2, resolution: freshResolution(w.users.hana, o2.client),
    item: { item_kind: "gl_balance", item_key: "mc:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }],
  });
  // ADJUDICATED AMB-16: the maker=checker refusal is exactly CLR05.
  await assertRaises(CLR.makerChecker, async () => approveOpeningSeed(w.users.hana, {
    seed: s2, planRevision: await planRevision(o2.plan), entryRevisions: revMapOf([d]), opKey: opk("mc"),
  }), "the maker approving their own OB entry");
});

test("K4/K5: a per-line tie MISMATCH refuses atomically (CLR30 tie_mismatch)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o2.client, plan: o2.plan });
  await recordParsedTargets({ firm: w.firms.A, seed: st.seed, doc: st.doc, lines: [{
    line_key: "ghost", account_code: WB_COA.expense, source_label: "Ghost line",
    debit_cents: 999, credit_cents: 0 }] });
  await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("tm"),
  }), "a non-zero mapped-line delta");
  for (const d of st.drafts.all) {
    assert.equal((await entryRow(d.entry_id)).status, "draft", "nothing approved on a broken tie");
  }
});

test("K4/K5: OBE not netting ZERO refuses (CLR30 obe_not_nil)", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const d2 = await openingDoc(w.users.alice, { firm: w.firms.A, client: o2.client });
  const r = await createOpeningSeed(w.users.bob, {
    client: o2.client, plan: o2.plan, tieDocument: d2.documentId, tieSha256: d2.sha256 });
  const s2 = r.seed_id ?? r.id;
  await recordParsedTargets({ firm: w.firms.A, seed: s2, doc: d2, lines: [
    { line_key: "cash", account_code: WB_COA.cash, source_label: "cash", debit_cents: BEE.cashDr, credit_cents: 0 },
    { line_key: "re", account_code: WB_COA.re, source_label: "re", debit_cents: BEE.reDr, credit_cents: 0 },
  ] });
  const c1 = await draftOpeningItem(w.users.bob, {
    client: o2.client, seed: s2, resolution: freshResolution(w.users.bob, o2.client, { subjectKind: "document", subjectId: d2.documentId }),
    document: d2.documentId, sha256: d2.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] });
  const c2 = await draftOpeningItem(w.users.bob, {
    client: o2.client, seed: s2, resolution: freshResolution(w.users.bob, o2.client, { subjectKind: "document", subjectId: d2.documentId }),
    document: d2.documentId, sha256: d2.sha256,
    item: { item_kind: "equity_net", item_key: "eq:net", amount_cents: -BEE.reDr } });
  await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed: s2, planRevision: await planRevision(o2.plan), tieSha256: d2.sha256,
    entryRevisions: revMapOf([c1, c2]), opKey: opk("obe"),
  }), "OBE marker not netting zero");
});

test("K5 HAPPY: the complete set approves in ONE txn — finalized, per-entry approvals, tie stamped, K13 zero sightings, events at the tail", async () => {
  fail0017(live);
  assert.equal((await sightingRows(onb.client)).length, 0, "the sighting pool starts EMPTY (prestate pin)");
  const seq0 = await maxSeq(w.firms.A);
  const receipt = await approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(onb.plan), tieSha256: doc.sha256,
    entryRevisions: revMapOf(drafts), opKey: opk("happy"),
  });
  assert.ok(receipt, "approval receipt returned");
  for (const d of drafts) {
    const e = await entryRow(d.entry_id);
    assert.equal(e.status, "approved", `entry ${d.entry_id} approved`);
    assert.equal(e.is_opening_balance, true, "still OB-flagged");
  }
  const reg = await seedRegRow(seed);
  assert.equal(reg.state, "finalized", "registry finalized");
  assert.ok(reg.finalized_at && reg.finalized_by, "finalized_at/by stamped");
  assert.ok(reg.tie_asserted_at, "tie_asserted_at stamped");
  assert.ok(reg.through_event_seq != null, "through_event_seq stamped");
  const approvals = await openingApprovalRows(seed);
  assert.equal(approvals.length, drafts.length, "one approval row per entry");
  assert.ok(approvals.every((a) => a.attestation_kind === "distinct_checker"), "distinct_checker ladder");
  assert.equal((await sightingRows(onb.client)).length, 0,
    "K13: the counterparty-stamped AR control leg minted ZERO sightings (WB-R2)");
  const evs = await eventsSince(w.firms.A, seq0);
  const batch = evs.filter((e) => e.event_type === "opening_seed.batch_approved");
  assert.equal(batch.length, 1, "exactly one opening_seed.batch_approved");
  const ours = evs.filter((e) => drafts.some((d) => d.entry_id === e.entry_id));
  assert.ok(ours.length >= drafts.length, `an approved-class event per entry (got ${ours.length})`);
  const seqs = evs.map((e) => e.seq);
  assert.equal(Math.max(...seqs) - Math.min(...seqs) + 1, evs.length, "the tail emission is CONSECUTIVE (held counter lock)");
  assert.equal(batch[0].seq, Math.max(...seqs), "[AMB-14] the batch event is emitted LAST");
});

test("K5: same-op retry replays the receipt BYTE-IDENTICALLY; a fresh op on the finalized registry refuses", async () => {
  fail0017(live);
  const key = opk("rep");
  // the registry is finalized by the happy cell — a NEW op_key must refuse…
  const err = await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(onb.plan), tieSha256: doc.sha256,
    entryRevisions: revMapOf(drafts), opKey: key,
  }), "approval on a non-open registry");
  const reason = detailReason(err);
  if (reason) assert.equal(reason, "registry_not_open", "typed reason");
  // …while the ORIGINAL receipt replay rides op_receipts on a fresh staged set:
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o2.client, plan: o2.plan });
  const key2 = opk("rep2");
  const args = { seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256, entryRevisions: st.revMap, opKey: key2 };
  const r1 = await approveOpeningSeed(w.users.hana, args);
  const r2 = await approveOpeningSeed(w.users.hana, args);
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "byte-identical replay");
  assert.equal((await openingApprovalRows(st.seed)).length, st.drafts.all.length, "no duplicate approval rows");
});

test("K5 RACE (two-session): concurrent approvals of one seed — exactly ONE wins", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o2.client, plan: o2.plan });
  const rev = await planRevision(o2.plan);
  const out = await raceOpeningApproval({
    seed: st.seed, planRevision: rev, tieSha256: st.doc.sha256,
    revsA: st.revMap, revsB: st.revMap, subA: w.users.hana, subB: w.users.alice,
  });
  assert.equal(out.a?.ok, true, "session A (first to lock) wins");
  assert.equal(out.b?.ok, false, "session B loses");
  assert.ok([CLR30, "40001"].includes(out.b.code),
    `the loser is a typed CLR30 or a serialization failure for same-op retry (got ${out.b.code})`);
  assert.equal((await seedRegRow(st.seed)).state, "finalized", "the seed finalized exactly once");
  assert.equal((await openingApprovalRows(st.seed)).length, st.drafts.all.length, "no double approval rows");
});

test("K5 SOLO (firm S): the sole approver needs the self-approval attestation; approvals record the kind", async () => {
  fail0017(live);
  const erin = w.users.erin;
  const o2 = await onboardingClient(erin);
  await seedOpeningCoa(erin, o2.client);
  const r = await createOpeningSeed(erin, { client: o2.client, plan: o2.plan });
  const s2 = r.seed_id ?? r.id;
  const mkT = (k, code, dr, cr) => recordOpeningTarget(erin, { seed: s2, line: {
    line_key: k, account_code: code, source_label: k, debit_cents: dr, credit_cents: cr,
    provenance_kind: "keyed", entered_by: erin } });
  await mkT("cash", WB_COA.cash, 1_000, 0);
  await mkT("cap", WB_COA.shareCap, 0, 1_000);
  const d1 = await draftOpeningItem(erin, {
    client: o2.client, seed: s2, resolution: freshResolution(erin, o2.client),
    item: { item_kind: "gl_balance", item_key: "solo:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }] });
  const d2 = await draftOpeningItem(erin, {
    client: o2.client, seed: s2, resolution: freshResolution(erin, o2.client),
    item: { item_kind: "gl_balance", item_key: "solo:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 1_000 }] });
  // ADJUDICATED AMB-16: the checker-family refusal (attestation_required) is CLR05.
  await assertRaises(CLR.makerChecker, async () => approveOpeningSeed(erin, {
    seed: s2, planRevision: await planRevision(o2.plan), entryRevisions: revMapOf([d1, d2]), opKey: opk("solo1"),
  }), "solo approval WITHOUT attestation");
  await approveOpeningSeed(erin, {
    seed: s2, planRevision: await planRevision(o2.plan), entryRevisions: revMapOf([d1, d2]),
    attestation: "I attest sole-approver review of the opening set (0004 variant)", opKey: opk("solo2"),
  });
  const approvals = await openingApprovalRows(s2);
  assert.ok(approvals.length === 2 && approvals.every((a) => a.attestation_kind === "self_approval_attestation"),
    "approval rows record self_approval_attestation");
});

test("K11: a carry-down leaves the SST watch figures BIT-UNCHANGED; the carried client's coverage flips", async () => {
  fail0017(live);
  // [R1-F13c] the NAMED SST figures are asserted UNCONDITIONALLY on the watch
  // ROWS (memo finding 13: no first-number regex, no conditional coverage).
  const namedFigures = (row) => JSON.stringify({
    confirmed_included_cents: row?.confirmed_included_cents ?? null,
    provisional_included_cents: row?.provisional_included_cents ?? null,
    provisional_month: row?.provisional_month ?? null,
    earliest_crossing_month: row?.earliest_crossing_month ?? null,
    state: row?.state ?? null,
  });
  const watchClient = await freshWatchClient(w.users.alice);
  await approvedTurnoverEntry({ maker: w.users.alice, checker: w.users.bob,
    client: watchClient, cents: 30_000_000, date: "2026-05-31" });
  await evaluateSstWatch(watchClient);
  const row1 = await openWatchRow(watchClient);
  assert.ok(row1, "the watch row exists for the control client");
  // the B-12 vehicle: onboard → commit (deferred) → classify + trade → carry down
  const b12 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, b12.client);
  await updatePlan({ plan: b12.plan, expectedRevision: b12.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
  await commitOnboarding(w.users.alice, { client: b12.client, plan: b12.plan, expectedPlanRevision: await planRevision(b12.plan) });
  await setTurnoverClassification(w.users.alice, { client: b12.client, accountCode: WB_COA.sales, classification: "included" });
  await approvedTurnoverEntry({ maker: w.users.alice, checker: w.users.bob,
    client: b12.client, cents: 10_000_000, date: "2026-05-31", account: WB_COA.sales, debit: WB_COA.cash });
  await evaluateSstWatch(b12.client);
  const before12 = await openWatchRow(b12.client);
  assert.ok(before12, "the carried client's watch row exists pre-carry-down");
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: b12.client, plan: b12.plan });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(b12.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("k11"),
  });
  await evaluateSstWatch(watchClient);
  const row2 = await openWatchRow(watchClient);
  assert.equal(namedFigures(row2), namedFigures(row1),
    "another client's carry-down never moves the NAMED watch figures (bit-unchanged)");
  await evaluateSstWatch(b12.client);
  const after12 = await openWatchRow(b12.client);
  assert.equal(String(after12.confirmed_included_cents), String(before12.confirmed_included_cents),
    "confirmed turnover ignores is_opening_balance entries (sen-exact)");
  assert.equal(String(after12.provisional_included_cents ?? ""), String(before12.provisional_included_cents ?? ""),
    "provisional turnover ignores is_opening_balance entries");
  assert.equal(after12.coverage_complete, false,
    "coverage_complete flipped FALSE on the carried client (missing history surfaced) — UNCONDITIONAL");
});

// ===========================================================================
// GATE 2 memo (docs/plan/research/wave-b/0017-asbuilt-reference.md:207,241) —
// Option 1 (ratify-as-is): approve_opening_seed is ONE bounded serializable
// transaction (0017_wave_b.sql:3825-4011); a mid-batch failure aborts the
// WHOLE txn — including its _reserve_op insert (0004_governed_fns.sql:46-60)
// — so {'pending':true} is structurally unreachable here.
//
// RULING WB-R19 (docs/plan/research/wave-b/ruling-batch-adr-037.md WB-R19,
// set AFTER these cells were first built) sharpened the proof bar: a stale
// revision on entry K+1 is caught by the CHECK loop (3913-3949) BEFORE the
// approval loop (3959-3964) ever runs for ANY item — that is a PREFLIGHT
// refusal, not a mid-mutation fault. The cell immediately below proves only
// that (honestly retitled — it no longer claims to prove the mid-mutation
// gate). The genuine mid-mutation case — a fault raised INSIDE the approval
// loop after some entries have already mutated in-txn — is proved separately
// by the RIG-ONLY trigger-fault cell that follows it.
// ===========================================================================

test("K5 GATE-2 PREFLIGHT (0017-asbuilt-reference.md:207,241, Option 1; WB-R19): a stale revision on one of five entries is refused by the CHECK loop BEFORE the approval loop ever runs for any item — zero approvals persist, the registry stays open, op_receipts holds no poisoned reservation, and a subsequent clean full retry succeeds end-to-end", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const st = await stageFullSet(w.users.bob, { owner: w.users.alice, client: o2.client, plan: o2.plan, firm: w.firms.A });
  assert.equal(st.all.length, 5, "N=5 draft entries staged (the full BEE + AR + reserves set)");
  const goodRevs = revMapOf(st.all);
  // Corrupt ONE entry's revision (item 3-of-5 by array position). The revision
  // check and the approval itself are TWO SEPARATE loops in the fn body — the
  // check-loop (3913-3949) raises on the FIRST mismatch it walks (in
  // oi.item_key order), BEFORE the approval-loop (3959-3964) ever runs for ANY
  // item — a PREFLIGHT refusal regardless of which array position actually
  // carries the corruption (this cell does NOT exercise the approval loop at
  // all; see the mid-mutation cell below for that).
  const badRevs = { ...goodRevs };
  badRevs[st.all[2].entry_id] = "00000000-0000-4000-8000-000000000099";
  const key = opk("gate2fail");
  const err = await assertRaises(CLR30, async () => approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256,
    entryRevisions: badRevs, opKey: key,
  }), "a stale revision on one of five entries aborts the WHOLE batch");
  if (detailReason(err)) assert.equal(detailReason(err), "revision_mismatch");

  assert.equal((await openingApprovalRows(st.seed)).length, 0,
    "ZERO approvals persisted — not even for entries that would have validated fine before the failure point");
  for (const d of st.all) {
    assert.equal((await entryRow(d.entry_id)).status, "draft", `entry ${d.entry_id} stays draft`);
  }
  assert.equal((await seedRegRow(st.seed)).state, "open", "the registry stays open — never partially finalized");

  const receipt = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn='approve_opening_seed' and op_key=$1", [key]);
  assert.equal(receipt.rows[0].n, 0,
    "no poisoned op_receipts row survives the abort — the _reserve_op insert rolled back WITH the aborting transaction");

  const retry = await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256,
    entryRevisions: goodRevs, opKey: opk("gate2retry"),
  });
  assert.ok(retry, "a subsequent CLEAN full retry (correct revisions, a FRESH op_key) succeeds");
  assert.equal((await seedRegRow(st.seed)).state, "finalized", "the retry finalizes the registry end-to-end");
  assert.equal((await openingApprovalRows(st.seed)).length, st.all.length, "every entry approved on the clean retry");
});

test("K5 GATE-2 MID-MUTATION (rig-only fault injection, WB-R19): a genuine fault raised DURING the approval loop — after 2-of-5 entries have already mutated inside the txn — rolls back the WHOLE transaction (the partial work is fully reverted, no per-entry side-effect table leaks a row), op_receipts holds no poisoned reservation, and a subsequent SAME-op_key retry with IDENTICAL good args then succeeds end-to-end", async () => {
  fail0017(live);
  const o2 = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o2.client);
  const st = await stageFullSet(w.users.bob, { owner: w.users.alice, client: o2.client, plan: o2.plan, firm: w.firms.A });
  assert.equal(st.all.length, 5, "N=5 draft entries staged (the full BEE + AR + reserves set)");
  const goodRevs = revMapOf(st.all);
  const key = opk("gate2mid");

  // RIG-ONLY fault: _approve_opening_entry's per-entry loop body
  // (0017_wave_b.sql:3809-3820) does exactly two writes per entry — an UPDATE
  // of clara.journal_entries.status and an INSERT into
  // clara.opening_seed_approvals (seed_id-scoped). No event/audit emission
  // happens per-entry: _audit (3994) and every _append_event (3997-4007) fire
  // ONCE, only AFTER the whole per-entry loop (3959-3964) has finished for
  // every item — so those tables are unreachable, not merely empty, when the
  // fault lands mid-loop. opening_seed_approvals is the cleanest seed-scoped
  // counter of "how many entries have been approved so far this txn"; a
  // BEFORE INSERT trigger there — scoped to THIS seed only, so no other test
  // in the (serial) battery can ever trip it — raises on the 3rd per-entry
  // insert, i.e. after items 1-2 have genuinely mutated and before item 3's
  // mutation completes.
  await rootQuery(`
    create or replace function clara._rig_k5_midmutation_fault() returns trigger
      language plpgsql as $fault$
    begin
      if new.seed_id = '${st.seed}'::uuid
         and (select count(*)::int from clara.opening_seed_approvals where seed_id = new.seed_id) >= 2
      then
        raise exception 'rig_fault_injection';
      end if;
      return new;
    end;
    $fault$;
  `);
  await rootQuery(`
    create trigger _rig_k5_midmutation_fault
      before insert on clara.opening_seed_approvals
      for each row execute function clara._rig_k5_midmutation_fault();
  `);

  const seq0 = await maxSeq(w.firms.A);
  const auditPre = await rootQuery(
    "select count(*)::int as n from clara.audit_log where fn='approve_opening_seed' and (args->>'seed')=$1", [st.seed]);
  assert.equal(auditPre.rows[0].n, 0, "prestate pin: no prior audit_log row for this fresh seed");

  try {
    let err = null;
    try {
      await approveOpeningSeed(w.users.hana, {
        seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256,
        entryRevisions: goodRevs, opKey: key,
      });
    } catch (e) { err = e; }
    assert.ok(err, "the mid-mutation fault raised — the call did not silently succeed");
    // Assert on the injected fault's OWN identity (message + SQLSTATE) — NOT a
    // CLR: plain plpgsql `raise exception '<msg>'` (no USING ERRCODE) carries
    // the standard raise_exception SQLSTATE P0001.
    assert.equal(err.code, "P0001", `the raised error is the rig's own raise_exception (P0001), not a CLR (got ${err.code})`);
    assert.match(err.message, /rig_fault_injection/, "the raised error IS the injected fault");

    assert.equal((await openingApprovalRows(st.seed)).length, 0,
      "ZERO approvals persisted — the 2 entries that mutated before the fault are rolled back WITH the aborting transaction");
    for (const d of st.all) {
      assert.equal((await entryRow(d.entry_id)).status, "draft",
        `entry ${d.entry_id} stays draft — any status='approved' mutation already applied before the fault is reverted`);
    }
    assert.equal((await seedRegRow(st.seed)).state, "open", "the registry stays open — never partially finalized");

    const receipt = await rootQuery(
      "select count(*)::int as n from clara.op_receipts where fn='approve_opening_seed' and op_key=$1", [key]);
    assert.equal(receipt.rows[0].n, 0,
      "no poisoned op_receipts row survives — the _reserve_op insert rolled back WITH the aborting transaction");

    const leaked = await eventsSince(w.firms.A, seq0);
    assert.equal(leaked.length, 0,
      "ZERO domain_events leaked — batch_approved/entry.approved are emitted only AFTER the full per-entry loop succeeds (3994-4007), never reached here");

    const auditPost = await rootQuery(
      "select count(*)::int as n from clara.audit_log where fn='approve_opening_seed' and (args->>'seed')=$1", [st.seed]);
    assert.equal(auditPost.rows[0].n, 0, "ZERO audit_log rows leaked — _audit() is called once, after the per-entry loop, never reached here");
  } finally {
    await rootQuery("drop trigger if exists _rig_k5_midmutation_fault on clara.opening_seed_approvals");
    await rootQuery("drop function if exists clara._rig_k5_midmutation_fault()");
  }

  // SAME op_key K, IDENTICAL args: the failed txn left no reservation to
  // collide with (_reserve_op's insert rolled back with it), so this is a
  // fresh attempt from the DB's perspective and must succeed end-to-end.
  const retry = await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o2.plan), tieSha256: st.doc.sha256,
    entryRevisions: goodRevs, opKey: key,
  });
  assert.ok(retry, "the SAME op_key K, IDENTICAL args, now succeeds");
  assert.equal((await seedRegRow(st.seed)).state, "finalized", "the retry finalizes the registry end-to-end");
  assert.equal((await openingApprovalRows(st.seed)).length, st.all.length, "every entry approved on the retry (approvals = 5)");
});
