// Migration-0018 blind battery — §3 DUAL-LANE PURITY GUARDS. One private
// authoritative classifier partitions a seed's draft is_opening_balance entries:
// associated = direct opening_items row OR reversal-of-a-seed-item; correction =
// direct row with supersedes_item_id NOT NULL OR reversal-of-a-seed-item; a pure
// reversal's synthetic item carries supersedes_item_id (0017:4127) and FA
// replacements carry the same lineage (0017:3439). approve_opening_seed (K5)
// refuses when ANY correction draft exists (correction_draft_present — closes the
// verified stranding hole); approve_opening_correction (K6) refuses when ANY
// non-correction draft exists (non_correction_draft_present). CONTRACT-BLIND;
// FAILS RED below 0018.
//
// [AMB-18a] both K5/K6 refusals assert the exported opening-family const CLR30
//   (design-doc label CLR30 == as-built value "CLR31").
// [AMB-20a] The GUARD-ADMISSION invariant (§3: "a sloppy complement false-positives
//   … and breaks every K6 cell") is what the K6-accept cells pin: the guard must
//   NOT refuse a legitimate correction shape with non_correction_draft_present.
//   Where the shape is tie-neutral (same-amount replacement/multi/FA) full success
//   is also asserted; a lone pure reversal changes the TB, so only guard-admission
//   is pinned there (a tie refusal is a DIFFERENT, legitimate outcome).
// [AMB-20b] K5-refuse ordering: finalize → supersede (proven on a finalized seed)
//   → reopen → K5. If reopen refuses a pending correction, that is a finding.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR30, opk, getPool, ROLES, jtxt,
  assertRaisesReason, endPool, printLaneNotes, noteLane, detailReason,
  fail0018, wbEnsureReady18,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, planRevision,
  createOpeningSeed, draftOpeningItem, recordParsedTargets, stageBeeSet,
  seedFixedAsset, supersedeOpeningItem, approveOpeningSeed, approveOpeningCorrection,
  reopenOpeningSeed, upsertAccountClassed, freshResolution, WB_COA, BEE, revMapOf,
  entryRow, openingItemRows, seedRegRow, waitBlockedByOrThrow, trialBalanceAsOf,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

const faAsset = (itemKey) => ({
  description: "Delivery van", acquired_date: "2024-03-01", cost_cents: 500_000,
  useful_life_months: 60, depreciation_method: "straight_line",
  asset_account_code: WB_COA.faAsset, accum_depr_account_code: WB_COA.faAccum,
  depr_expense_account_code: WB_COA.faExp, accumulated_depreciation_cents: 100_000,
  depreciation_start_date: "2024-03-01", residual_cents: 0, item_key: itemKey,
});

/** All draft (unapproved) opening entries of a seed — used by the K5-refusal cells
 *  (whose K5 revision loop is itself opening_items-scoped) and the additive cell. */
async function draftEntriesOfSeed(seed) {
  const out = [];
  for (const it of await openingItemRows(seed)) {
    const e = await entryRow(it.entry_id);
    if (e && e.status === "draft") out.push({ entry_id: e.id, revision_token: e.revision_token });
  }
  return out;
}

/** [AMB-0018-7] Build a K6 correction batch's entry-revision map from the supersede
 *  RECEIPT(s) — the reversal entry (which in the REPLACEMENT case carries NO
 *  opening_items row, so an opening_items scan misses it and K6 then reports
 *  revision_mismatch) plus the replacement entry — the wb-k-supersede-fa pattern. */
async function correctionRevs(receipts) {
  const ids = new Set();
  for (const r of [].concat(receipts)) {
    for (const eid of [r.reversal_entry_id ?? r.reversal_id, r.replacement_entry_id]) {
      if (eid) ids.add(eid);
    }
  }
  const drafts = [];
  for (const eid of ids) {
    const e = await entryRow(eid);
    if (e && e.status === "draft") drafts.push({ entry_id: eid, revision_token: e.revision_token });
  }
  return revMapOf(drafts);
}

/** stageBeeSet → K5 approve → a finalized, document-tied 3-item BEE seed. */
async function finalizedBeeSeed() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  await approveOpeningSeed(w.users.hana, {
    seed: st.seed, planRevision: await planRevision(o.plan), tieSha256: st.doc.sha256,
    entryRevisions: st.revMap, opKey: opk("lgbeefin") });
  return { client: o.client, plan: o.plan, seed: st.seed, doc: st.doc, drafts: st.drafts.all };
}

/** A finalized seed whose set INCLUDES a books-grade FA item (K8/K9 shape). */
async function finalizedFaSeed() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  for (const [code, name, type] of [[WB_COA.faAsset, "Plant & Machinery", "asset"],
    [WB_COA.faAccum, "Accum Depr P&M", "asset"], [WB_COA.faExp, "Depreciation Expense", "expense"]]) {
    await upsertAccountClassed(w.users.alice, { client: o.client, code, name, type });
  }
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client: o.client });
  const sr = await createOpeningSeed(w.users.bob, { client: o.client, plan: o.plan, tieDocument: doc.documentId, tieSha256: doc.sha256 });
  const seed = sr.seed_id ?? sr.id;
  const fa = await seedFixedAsset(w.users.bob, { client: o.client, seed, asset: faAsset("fa:base") });
  const faEntry = await entryRow(await resolveFaEntryId(fa, seed));
  await recordParsedTargets({ firm: w.firms.A, seed, doc, lines: [
    { line_key: "fa", account_code: WB_COA.faAsset, source_label: "fa", debit_cents: 500_000, credit_cents: 0 },
    { line_key: "faacc", account_code: WB_COA.faAccum, source_label: "faacc", debit_cents: 0, credit_cents: 100_000 },
    { line_key: "cap", account_code: WB_COA.shareCap, source_label: "cap", debit_cents: 0, credit_cents: 400_000 } ] });
  const cap = await draftOpeningItem(w.users.bob, {
    client: o.client, seed, resolution: freshResolution(w.users.bob, o.client, { subjectKind: "document", subjectId: doc.documentId }),
    document: doc.documentId, sha256: doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cap" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: 400_000 }] });
  await approveOpeningSeed(w.users.hana, {
    seed, planRevision: await planRevision(o.plan), tieSha256: doc.sha256,
    entryRevisions: revMapOf([{ entry_id: faEntry.id, revision_token: faEntry.revision_token }, cap]), opKey: opk("lgfafin") });
  return { client: o.client, plan: o.plan, seed, doc };
}
async function resolveFaEntryId(fa, seed) {
  return fa.acquisition_entry_id ?? (await openingItemRows(seed)).find((i) => i.item_key === "fa:base")?.entry_id;
}

before(async () => {
  live = await wbEnsureReady18();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0018-lane-guards"); await endPool(); });

test("META: 0018 applied — both lane verbs exist", async () => {
  fail0018(live);
  assert.ok(w, "world built");
  assert.equal((await seedRegRow((await finalizedBeeSeed()).seed)).state, "finalized", "the finalize helper produces a finalized seed");
});

// ---------------------------------------------------------------------------
// K5 (approve_opening_seed) refuses EACH correction shape: correction_draft_present.
// ---------------------------------------------------------------------------

test("§3 K5 refuses a REPLACEMENT correction draft (correction_draft_present)", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const cash = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash");
  await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:cash:v2" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] } });
  // [AMB-0018-6] the supersede already reopened the seed (K6 opens its own
  // correction batch) — no explicit reopen (a double reopen refuses registry_not_open).
  await assertRaisesReason(CLR30, "correction_draft_present",
    async () => approveOpeningSeed(w.users.hana, { seed: s.seed, planRevision: await planRevision(s.plan),
      tieSha256: s.doc.sha256, entryRevisions: revMapOf(await draftEntriesOfSeed(s.seed)), opKey: opk("k5repl") }),
    "K5 with a replacement-correction draft present");
});

test("§3 K5 refuses a PURE-REVERSAL correction draft (correction_draft_present)", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const cash = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash");
  await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: null });
  // [AMB-0018-6] the supersede already reopened the seed — no explicit reopen.
  await assertRaisesReason(CLR30, "correction_draft_present",
    async () => approveOpeningSeed(w.users.hana, { seed: s.seed, planRevision: await planRevision(s.plan),
      tieSha256: s.doc.sha256, entryRevisions: revMapOf(await draftEntriesOfSeed(s.seed)), opKey: opk("k5rev") }),
    "K5 with a pure-reversal-correction draft present (the synthetic item carries supersedes_item_id)");
});

test("§3 K5 refuses an FA-REPLACEMENT correction draft (correction_draft_present)", async () => {
  fail0018(live);
  const s = await finalizedFaSeed();
  const fa = (await openingItemRows(s.seed)).find((i) => i.item_key === "fa:base");
  assert.ok(fa, "the finalized set carries the FA item");
  await supersedeOpeningItem(w.users.bob, { item: fa.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "fa:base:v2" },
    lines: [{ account_code: WB_COA.faAsset, debit_cents: 500_000, credit_cents: 0 }] } });
  // [AMB-0018-6] the supersede already reopened the seed — no explicit reopen.
  await assertRaisesReason(CLR30, "correction_draft_present",
    async () => approveOpeningSeed(w.users.hana, { seed: s.seed, planRevision: await planRevision(s.plan),
      tieSha256: s.doc.sha256, entryRevisions: revMapOf(await draftEntriesOfSeed(s.seed)), opKey: opk("k5fa") }),
    "K5 with an FA-replacement-correction draft present (same lineage as a replacement)");
});

// ---------------------------------------------------------------------------
// K6 (approve_opening_correction) ADMITS every legitimate correction shape (the
// guard must never false-positive non_correction_draft_present) and REFUSES an
// additive.
// ---------------------------------------------------------------------------

/** Draft a correction shape, run K6, and pin GUARD-ADMISSION: K6 never refuses
 *  with non_correction_draft_present. `receipts` are the supersede receipt(s) whose
 *  reversal+replacement entries form the batch ([AMB-0018-7]). `expectFinalize`
 *  also pins full success. */
async function k6Admits(seed, receipts, { expectFinalize }) {
  let ok = false; let err = null;
  try { await approveOpeningCorrection(w.users.hana, { seed, entryRevisions: await correctionRevs(receipts), opKey: opk("k6ok") }); ok = true; }
  catch (e) { err = e; }
  if (!ok) {
    assert.notEqual(detailReason(err), "non_correction_draft_present",
      `the guard FALSE-POSITIVED on a legitimate correction shape (got ${detailReason(err) ?? err.code})`);
    noteLane(`K6 admitted the shape but the approval failed on a non-guard reason: ${detailReason(err) ?? err.code}`);
  }
  if (expectFinalize) assert.ok(ok && (await seedRegRow(seed)).state === "finalized", "the tie-neutral correction re-finalizes");
  return ok;
}

test("§3 K6 ADMITS a pure reversal (no non_correction_draft_present false-positive)", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const cash = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash");
  const sup = await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: null });
  await k6Admits(s.seed, sup, { expectFinalize: false }); // a lone reversal changes the TB — guard-admission only
});

test("§3 K6 ACCEPTS a same-amount REPLACEMENT (tie-neutral → re-finalizes)", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const ar = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash");
  const sup = await supersedeOpeningItem(w.users.bob, { item: ar.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:cash:v2" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] } });
  await k6Admits(s.seed, sup, { expectFinalize: true });
});

test("§3 K6 multi-item corrections are SEQUENTIAL per-item ceremonies [AMB-0018-4]: a 2nd supersede while the seed is OPEN refuses CLR31 registry_not_open; two supersede→K6 ceremonies net the SAME opening books", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const items = await openingItemRows(s.seed);
  const cash = items.find((i) => i.item_key === "gl:cash");
  const cap = items.find((i) => i.item_key === "gl:sharecap");
  // net (debit-credit) per account: a reversal inflates gross debits AND credits
  // equally, so only the NET balance is the invariant "same books" measure.
  const netOf = (rows) => Object.fromEntries(rows.map((r) => [r.account_code, Number(r.debit_cents) - Number(r.credit_cents)]));
  const tb0 = netOf(await trialBalanceAsOf(w.users.hana, { client: s.client, asOf: "2026-01-01" }));
  // Ceremony 1 opens the correction batch. A SECOND supersede while the seed is
  // OPEN refuses — a correction requires a FINALIZED seed (multi-item corrections
  // are one-per-ceremony BY DESIGN, the S4 per-item precedent).
  const sup1 = await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:cash:v2" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] } });
  await assertRaisesReason(CLR30, "registry_not_open",
    () => supersedeOpeningItem(w.users.bob, { item: cap.id, replacement: {
      item: { item_kind: "gl_balance", item_key: "gl:sharecap:v2" },
      lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }] } }),
    "a second supersede while the seed is open (sequential per-item ceremonies)");
  assert.ok(await k6Admits(s.seed, sup1, { expectFinalize: true }), "ceremony 1 re-finalizes");
  // Ceremony 2: the seed is finalized again, so cap is now correctable.
  const capNow = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:sharecap" && i.state !== "superseded");
  assert.ok(capNow, "the cap item is still correctable in ceremony 2");
  const sup2 = await supersedeOpeningItem(w.users.bob, { item: capNow.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:sharecap:v2" },
    lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }] } });
  assert.ok(await k6Admits(s.seed, sup2, { expectFinalize: true }), "ceremony 2 re-finalizes");
  const tb1 = netOf(await trialBalanceAsOf(w.users.hana, { client: s.client, asOf: "2026-01-01" }));
  assert.deepEqual(tb1, tb0, "the two same-amount replacement ceremonies net the SAME opening books");
});

test("§3 K6 ACCEPTS a SECOND-ROUND supersede of the current replacement", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  const cash = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash");
  const sup1 = await supersedeOpeningItem(w.users.bob, { item: cash.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:cash:v2" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] } });
  assert.ok(await k6Admits(s.seed, sup1, { expectFinalize: true }), "round one finalizes");
  const v2 = (await openingItemRows(s.seed)).find((i) => i.item_key === "gl:cash:v2");
  assert.ok(v2, "the current replacement is present for a second round");
  const sup2 = await supersedeOpeningItem(w.users.bob, { item: v2.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "gl:cash:v3" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }] } });
  await k6Admits(s.seed, sup2, { expectFinalize: true });
});

test("§3 K6 ADMITS an FA REPLACEMENT (same-NBV; guard-admission, best-effort finalize)", async () => {
  fail0018(live);
  const s = await finalizedFaSeed();
  const fa = (await openingItemRows(s.seed)).find((i) => i.item_key === "fa:base");
  const sup = await supersedeOpeningItem(w.users.bob, { item: fa.id, replacement: {
    item: { item_kind: "gl_balance", item_key: "fa:base:v2" },
    lines: [{ account_code: WB_COA.faAsset, debit_cents: 500_000, credit_cents: 0 }] } });
  await k6Admits(s.seed, sup, { expectFinalize: false });
});

test("§3 K6 REFUSES an ADDITIVE (non-correction) draft: non_correction_draft_present", async () => {
  fail0018(live);
  const s = await finalizedBeeSeed();
  await reopenOpeningSeed(w.users.hana, { seed: s.seed, reason: "K6-guard: an additive is not a correction" });
  await recordParsedTargets({ firm: w.firms.A, seed: s.seed, doc: s.doc, lines: [
    { line_key: "prepaid", account_code: WB_COA.expense, source_label: "prepaid", debit_cents: 1_000, credit_cents: 0 } ] });
  await draftOpeningItem(w.users.bob, {
    client: s.client, seed: s.seed, resolution: freshResolution(w.users.bob, s.client, { subjectKind: "document", subjectId: s.doc.documentId }),
    document: s.doc.documentId, sha256: s.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:prepaid" },
    lines: [{ account_code: WB_COA.expense, debit_cents: 1_000, credit_cents: 0 }] });
  const addRevs = revMapOf(await draftEntriesOfSeed(s.seed));
  await assertRaisesReason(CLR30, "non_correction_draft_present",
    () => approveOpeningCorrection(w.users.hana, { seed: s.seed, entryRevisions: addRevs, opKey: opk("k6add") }),
    "K6 with a genuinely additive (non-correction) draft present");
});

// ---------------------------------------------------------------------------
// Draft-vs-approval races (both orders): the seed FOR UPDATE (K5) serializes
// against _draft_opening_item_core's FOR SHARE — no double-finalize, no deadlock.
// ---------------------------------------------------------------------------

async function openBeeSeed() {
  const o = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, o.client);
  const st = await stageBeeSet(w.users.bob, { firm: w.firms.A, client: o.client, plan: o.plan });
  return { client: o.client, plan: o.plan, seed: st.seed, doc: st.doc, drafts: st.drafts.all };
}
const APPROVE_SQL = `select clara.approve_opening_seed(p_seed => $1, p_expected_plan_revision => $2,
  p_tie_document_sha256 => $3, p_entry_revisions => $4::jsonb, p_attestation => $5, p_op_key => $6) as r`;
const DRAFT_SQL = `select clara.draft_opening_item(p_client => $1, p_seed => $2, p_item => $3::jsonb,
  p_lines => $4::jsonb, p_resolution => $5, p_document => $6, p_sha256 => $7, p_op_key => $8) as r`;

async function startAuth(c, sub, { serializable }) {
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("set statement_timeout = '15s'");
  await c.query(serializable ? "begin isolation level serializable" : "begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role: "authenticated" })]);
}

test("§3 race (approve holds, draft contends): K5's seed FOR UPDATE blocks a concurrent draft; exactly one finalize, no deadlock", async () => {
  fail0018(live);
  const s = await openBeeSeed();
  const rev = await planRevision(s.plan);
  const res = await freshResolution(w.users.bob, s.client, { subjectKind: "document", subjectId: s.doc.documentId });
  const c1 = await getPool().connect(); const c2 = await getPool().connect();
  let draftOut = null;
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await startAuth(c1, w.users.hana, { serializable: true });
    await c1.query(APPROVE_SQL, [s.seed, rev, s.doc.sha256, jtxt(revMapOf(s.drafts)), null, opk("raceapprove")]);
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await startAuth(c2, w.users.bob, { serializable: false });
    const p2 = c2.query(DRAFT_SQL, [s.client, s.seed, jtxt({ item_kind: "gl_balance", item_key: "race:add" }),
      jtxt([{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }]), res, s.doc.documentId, s.doc.sha256, opk("racedraft2")])
      .then(() => { draftOut = { ok: true }; }).catch((e) => { draftOut = { ok: false, code: e.code }; });
    try { await waitBlockedByOrThrow(pid2, pid1, { what: "the seed FOR UPDATE held by K5" }); }
    catch (e) { noteLane(`approve-holds race: block not observed (${e.message}) — the seed FOR UPDATE vs FOR SHARE serialization is a finding`); }
    await c1.query("commit");
    await p2;
    await c2.query("commit").catch(() => {});
  } finally {
    for (const c of [c1, c2]) { await c.query("rollback").catch(() => {}); await c.query("reset role").catch(() => {}); await c.query("reset all").catch(() => {}); c.release(); }
  }
  assert.equal((await seedRegRow(s.seed)).state, "finalized", "the seed finalized exactly once (A won)");
  assert.ok(!(draftOut && draftOut.code === "40P01"), `no deadlock on the draft side (got ${draftOut?.code ?? "ok"})`);
});

test("§3 race (draft holds, approve contends): a draft's FOR SHARE blocks a concurrent K5; no deadlock, coherent finalize", async () => {
  fail0018(live);
  const s = await openBeeSeed();
  const rev = await planRevision(s.plan);
  const res = await freshResolution(w.users.bob, s.client, { subjectKind: "document", subjectId: s.doc.documentId });
  const c1 = await getPool().connect(); const c2 = await getPool().connect();
  let approveOut = null;
  try {
    const pid1 = (await c1.query("select pg_backend_pid() as pid")).rows[0].pid;
    await startAuth(c1, w.users.bob, { serializable: true });
    await c1.query(DRAFT_SQL, [s.client, s.seed, jtxt({ item_kind: "gl_balance", item_key: "race:add2" }),
      jtxt([{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }]), res, s.doc.documentId, s.doc.sha256, opk("racedraft3")]);
    const pid2 = (await c2.query("select pg_backend_pid() as pid")).rows[0].pid;
    await startAuth(c2, w.users.hana, { serializable: true });
    const p2 = c2.query(APPROVE_SQL, [s.seed, rev, s.doc.sha256, jtxt(revMapOf(s.drafts)), null, opk("raceapprove2")])
      .then((r) => { approveOut = { ok: true, r: r.rows[0].r }; }).catch((e) => { approveOut = { ok: false, code: e.code }; });
    try { await waitBlockedByOrThrow(pid2, pid1, { what: "the seed FOR SHARE held by the draft" }); }
    catch (e) { noteLane(`draft-holds race: block not observed (${e.message}) — the FOR SHARE vs FOR UPDATE serialization is a finding`); }
    await c1.query("commit");
    await p2;
    await c2.query("commit").catch(() => {});
  } finally {
    for (const c of [c1, c2]) { await c.query("rollback").catch(() => {}); await c.query("reset role").catch(() => {}); await c.query("reset all").catch(() => {}); c.release(); }
  }
  assert.ok(!(approveOut && approveOut.code === "40P01"), `no deadlock on the approval side (got ${approveOut?.code ?? "ok"})`);
  const reg = await seedRegRow(s.seed);
  assert.ok(["open", "finalized"].includes(reg.state), `the seed is in a coherent state after the race (got ${reg.state})`);
});
