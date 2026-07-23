// Wave-B battery — K4/K5 the WB-R4 batch approval (ONE serializable txn) +
// receipt replay + the two-session race + K13 sighting quarantine + the solo
// attestation + K11 SST-watch interplay. CONTRACT-BLIND; FAILS below 0017.
// [AMB-14] K5 pins the batch event LAST; the per-entry approved emissions ride
// "the as-built convention" — encoded: batch event carries the HIGHEST seq of a
// consecutive tail emission. Adjudication if as-built orders differently.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR30, opk,
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
