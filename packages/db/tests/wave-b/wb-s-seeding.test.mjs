// Wave-B battery — Block S bulk seeding (S1 proposal batches · S2 the prior_gl
// kind · S3 mass birthing order · S4 the tick ceremony · S5 structural
// negatives · S6 wiki hookup · S7 events) + O8 row 13. CONTRACT-BLIND; FAILS
// below 0017. Classifier-writer machinery is probed via prosrc in wb-g-tail;
// here the HUMAN stamp path is behavioral.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR28, CLR33, PG, ROLES, rootQuery, roleQuery, opk,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, checkDefs, fnSource, detailReason,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, WB_COA,
  filedDocument, setDocumentKind, docTasks, sightingRows, codingRuleRows,
  createSeedingBatch, tickProposal, declineProposal, completeSeedingBatch,
  batchRow, proposalRows, eventsOf,
  recordWikiIngest, setWikiHold, wikiLogRows,
  listDocumentAutodraftCandidates,
} from "./wb-fixtures.mjs";
// proposeCodingRule/signCodingRule/ruleRowById RETIRED-from-use with F-A2 PR-3 (Annex
// B.1/OQ-3/D36): the first two wrap dropped verbs; ruleRowById has no more caller since no
// coding_rules row is minted by this file's ticks anymore.

let live = false;
let w = null;
let onb = null;
let glDoc = null; // the prior_gl-stamped document, filed to the onboarding client
let batch = null;
let props = null; // proposal rows keyed by proposal_key

const P = {
  vendor: { proposal_kind: "vendor_account_rule", proposal_key: "var:acme",
    payload: { name: "ACME TRADING SDN BHD", account_code: WB_COA.expense },
    evidence: { occurrence_count: 14, date_span: ["2025-01-05", "2025-12-28"], prior_gl_lines: [3, 87, 122] } },
  birth: { proposal_kind: "counterparty_birth", proposal_key: "birth:beta",
    payload: { name: "BETA SUPPLIES SDN BHD", kind: "vendor" },
    evidence: { occurrence_count: 4, prior_gl_lines: [12] } },
  wiki: { proposal_kind: "wiki_fact", proposal_key: "wf:profile",
    payload: { slug: "profile", fact: "Client trades as a hardware wholesaler." },
    evidence: { prior_gl_lines: [1] } },
  control: { proposal_kind: "vendor_account_rule", proposal_key: "var:ctl",
    payload: { name: "CTRL TARGET SDN BHD", account_code: WB_COA.apCtl },
    evidence: { occurrence_count: 2, prior_gl_lines: [9] } },
};

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  glDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: null });
  await setDocumentKind(w.users.alice, {
    document: glDoc.documentId, kind: "prior_gl", reason: "spreadsheet prior GL — human stamp (S2)",
  });
});
after(async () => { printLaneNotes("wb-s-seeding"); await endPool(); });

test("META/S2: 0017 applied — documents kind CHECK carries 'prior_gl' (18→19); the human stamp path works", async () => {
  fail0017(live);
  const def = await checkDefs("documents");
  assert.ok(def.includes("'prior_gl'"), "documents_document_kind_check admits 'prior_gl' [FORK-4]");
  const kind = (await rootQuery("select document_kind from clara.documents where id=$1", [glDoc.documentId])).rows[0].document_kind;
  assert.equal(kind, "prior_gl", "set_document_kind stamped the spreadsheet prior GL");
});

test("S2: the facts gate is NOT widened — a prior_gl document never runs invoice_facts; consent_evidence stays CLR28-locked", async () => {
  fail0017(live);
  const tasks = await docTasks(glDoc.documentId);
  const facts = tasks.filter((t) => t.lane === "invoice_facts" && !["done", "failed", "skipped"].includes(t.status));
  assert.equal(facts.length, 0, "no live invoice_facts lane for prior_gl (skipped_kind is the terminal)");
  await assertRaises(CLR28, () => setDocumentKind(w.users.alice, {
    document: glDoc.documentId, kind: "consent_evidence", reason: "probe",
  }), "consent_evidence stays CLR28-protected");
});

test("S1: create_seeding_batch is runtime-ONLY, lands typed proposals, and REFUSES control targets AT PARSE", async () => {
  fail0017(live);
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
    "select clara.create_seeding_batch(p_client => $1, p_document => $2, p_proposals => '[]'::jsonb, p_op_key => $3)",
    [onb.client, glDoc.documentId, opk("nb")]), "authenticated caller");
  const r = await createSeedingBatch({
    client: onb.client, document: glDoc.documentId,
    proposals: [P.vendor, P.birth, P.wiki, P.control],
  });
  batch = r.batch_id ?? r.id;
  assert.ok(batch, `batch receipt (got ${JSON.stringify(r)})`);
  const b = await batchRow(batch);
  assert.equal(b.state, "open", "batch open");
  assert.equal(b.source_sha256, glDoc.sha256, "source sha bound");
  const rows = await proposalRows(batch);
  props = Object.fromEntries(rows.map((p) => [p.proposal_key, p]));
  assert.equal(rows.length, 4, "every proposal landed as a row (the proposal object IS the landing state)");
  assert.equal(props["var:ctl"].state, "refused", "the control-account mapping is REFUSED at batch creation");
  assert.equal(props["var:ctl"].refuse_reason, "control_account", "typed refuse_reason");
  for (const k of ["var:acme", "birth:beta", "wf:profile"]) {
    assert.equal(props[k].state, "proposed", `${k} lands proposed (open proposals are the WB-R2 landing state)`);
  }
  assert.equal((await eventsOf(w.firms.A, "seeding.batch_created", batch)).length, 1, "seeding.batch_created emitted");
});

test("S1/S2: guards — a non-prior_gl source refuses; a duplicate OPEN batch refuses; same-op replays", async () => {
  fail0017(live);
  const inv = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: "invoice" });
  const e1 = await assertRaises(CLR33, () => createSeedingBatch({
    client: onb.client, document: inv.documentId, proposals: [P.vendor],
  }), "invoice as the seeding source");
  if (detailReason(e1)) assert.equal(detailReason(e1), "not_prior_gl");
  const e2 = await assertRaises(CLR33, () => createSeedingBatch({
    client: onb.client, document: glDoc.documentId, proposals: [P.vendor], opKey: opk("dup"),
  }), "second open batch for the same (client, sha)");
  if (detailReason(e2)) assert.equal(detailReason(e2), "duplicate_batch");
});

// REBUILT (F-A2 PR-3, OQ-3/D36): the original claim was "an admin tick births the vendor
// FIRST, then signs ONE live rule" — no rule is ever signed now (tick_seeding_proposal
// stopped minting a coding_rules row for vendor_account_rule ticks). The birth-first
// order-of-operations law survives untouched; the "one live rule" half is replaced by its
// designed successor: the tick stages a deterministic wiki payload instead, re-pointed onto
// the SAME lane a wiki_fact tick already uses (packages/runtime/lib/wiki-projection.mjs).
test("S3/S4: an admin tick births the UNBIRTHED vendor FIRST, then re-points to a knowledge-layer wiki payload (floors + lineage)", async () => {
  fail0017(live);
  assert.equal((await sightingRows(onb.client)).length, 0, "sighting pool EMPTY before the cycle");
  await assertRaises(CLR.authz, () => tickProposal(w.users.bob, { proposal: props["var:acme"].id }),
    "the WB-R2 tick floor is admin+ (deliberately above the bookkeeper sign floor)");
  const r = await tickProposal(w.users.hana, { proposal: props["var:acme"].id, opKey: opk("t1") });
  assert.ok(r, "tick receipt");
  assert.equal(r.wiki_dispatch_required, true,
    "OQ-3/D36: a vendor_account_rule tick now dispatches to the wiki, same as a wiki_fact tick");
  assert.ok(r.wiki_payload?.payload?.wiki, "the tick receipt itself carries the staged wiki payload");
  const p = (await proposalRows(batch)).find((x) => x.proposal_key === "var:acme");
  assert.equal(p.state, "ticked", "proposal ticked");
  assert.equal(p.resulting_rule_id, null,
    "OQ-3/D36: no more signed coding_rules row — resulting_rule_id stays NULL, same shape counterparty_birth already returned");
  assert.ok(p.resulting_counterparty_id, "the vendor was BIRTHED first (order-of-operations law, UNCHANGED)");
  const cp = (await rootQuery("select to_jsonb(c) as r from clara.counterparties c where c.id=$1", [p.resulting_counterparty_id])).rows[0].r;
  assert.equal(cp.kind, "vendor", "born as a canonical VENDOR");
  assert.equal(cp.merged_into ?? null, null, "live canonical (the 0016 trigger floor's demand)");
  // The knowledge-layer artifact: the proposal's OWN payload now carries the deterministic
  // wiki object tick_seeding_proposal staged (extend-only — payload || v_wiki_patch).
  const wiki = p.payload?.wiki;
  assert.ok(wiki, "the proposal's payload was extended with a wiki object");
  assert.match(wiki.slug, /^vendor-account\//, "the slug is deterministic and keyed on the counterparty");
  assert.equal(wiki.page_kind, "treatment", "the page_kind is one already admitted by WIKI_FACT_PAGE_KINDS — no new kind added");
  assert.match(wiki.content, /ACME TRADING SDN BHD/, "the content transcribes the admin's own decision, no interpretation");
  assert.match(wiki.content, new RegExp(WB_COA.expense), "the content names the account the admin coded");
  // NO coding_rules row was minted (OQ-3/D36's "no more signed-coding_rules minting").
  const rules = (await codingRuleRows(onb.client)).filter((x) => x.counterparty_id === p.resulting_counterparty_id);
  assert.equal(rules.length, 0, "zero coding_rules rows for this vendor — the write genuinely stopped, not merely unread");
  const evs = await eventsOf(w.firms.A, "seeding.proposal_decided", p.id);
  assert.equal(evs.length, 1, "seeding.proposal_decided emitted exactly once");
  assert.equal(evs[0].payload.wiki_dispatch_required, true, "the durable event ALSO carries wiki_dispatch_required=true");
  assert.equal(evs[0].payload.resulting_rule_id, null, "the durable event's resulting_rule_id is NULL");
});

// INVERTED (F-A2 PR-3, OQ-3/D36): CLR27 duplicate_live fired against the
// uq_coding_rules_one_live_vendor unique index, which only ever mattered because a SECOND
// signed rule for the same vendor was a data-integrity hazard for the (now-retired)
// execution tier. Since no coding_rules row is minted at all anymore, there is nothing left
// for a uniqueness constraint to protect — a second vendor_account_rule tick for the SAME
// canonical vendor (a different account this time) now SUCCEEDS. The forced-cell law wants
// both polarities named: this is the positive twin the retirement requires, not a silently
// dropped assertion.
test("S4: a SECOND vendor_account_rule tick for the same canonical vendor now SUCCEEDS — no more uq_coding_rules_one_live_vendor to collide with", async () => {
  fail0017(live);
  const r = await createSeedingBatch({
    client: onb.client, document: glDoc.documentId,
    proposals: [{ ...P.vendor, proposal_key: "var:acme2", payload: { name: "ACME TRADING SDN BHD", account_code: WB_COA.cash } }],
    opKey: opk("b2"),
  }).catch((e) => e);
  if (r instanceof Error) {
    // one-open-batch may bind — complete the first batch and retry (state machine, not the pin under test)
    await completeSeedingBatch(w.users.hana, { batch });
    const r2 = await createSeedingBatch({
      client: onb.client, document: glDoc.documentId,
      proposals: [{ ...P.vendor, proposal_key: "var:acme2", payload: { name: "ACME TRADING SDN BHD", account_code: WB_COA.cash } }],
      opKey: opk("b3"),
    });
    w._b2 = r2.batch_id ?? r2.id;
  } else { w._b2 = r.batch_id ?? r.id; }
  const dup = (await proposalRows(w._b2)).find((x) => x.proposal_key === "var:acme2");
  const r2 = await tickProposal(w.users.hana, { proposal: dup.id, opKey: opk("t2") });
  assert.ok(r2, "the second tick for the same vendor is admitted, not refused");
  assert.equal(r2.wiki_dispatch_required, true, "it ALSO dispatches to the wiki — the same lane, every time");
  const p2 = (await proposalRows(w._b2)).find((x) => x.proposal_key === "var:acme2");
  assert.equal(p2.state, "ticked", "the second proposal ticked cleanly — no CLR27, no duplicate_live");
  assert.equal(p2.resulting_rule_id, null, "still no coding_rules row minted");
  assert.match(p2.payload.wiki.content, new RegExp(WB_COA.cash),
    "the SECOND tick's content names the NEW account — the latest tick's judgement, not the first's");
});

test("S4: tick replay is byte-identical (one rule); decline + batch state machine; unticked STAYS proposed", async () => {
  fail0017(live);
  // RECONCILE AUDIT (2026-07-23, finding W-1): the impl lane gated the replay /
  // decline / proposal_not_open probes behind the MAIN batch still being open —
  // dead code on the guaranteed duplicate-refusal path. RESTORED on a DEDICATED
  // batch so every pin behavior always executes.
  if ((await batchRow(batch)).state === "open") await completeSeedingBatch(w.users.hana, { batch });
  assert.equal((await batchRow(batch)).state, "completed", "batch completed");
  assert.equal((await eventsOf(w.firms.A, "seeding.batch_completed", batch)).length, 1, "seeding.batch_completed emitted");
  if (w._b2 && (await batchRow(w._b2)).state === "open") {
    await completeSeedingBatch(w.users.hana, { batch: w._b2, opKey: opk("cb2") });
  }
  const b3r = await createSeedingBatch({
    client: onb.client, document: glDoc.documentId,
    proposals: [
      { ...P.birth, proposal_key: "birth:gamma", payload: { name: "GAMMA LOGISTICS SDN BHD", kind: "vendor" } },
      { ...P.wiki, proposal_key: "wf:profile2" },
      { ...P.vendor, proposal_key: "var:keep" }, // deliberately never ticked
    ],
    opKey: opk("b3"),
  });
  const b3 = b3r.batch_id ?? b3r.id;
  w._b3 = b3; // the Gate-R2 comparator cell reads the ticked gamma birth from here
  const rows3 = await proposalRows(b3);
  const birth = rows3.find((x) => x.proposal_key === "birth:gamma");
  const wiki = rows3.find((x) => x.proposal_key === "wf:profile2");
  const key = opk("trep");
  const rulesBefore = (await codingRuleRows(onb.client)).length;
  const r1 = await tickProposal(w.users.hana, { proposal: birth.id, opKey: key });
  const r2 = await tickProposal(w.users.hana, { proposal: birth.id, opKey: key });
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "tick replays byte-identically");
  const after = (await codingRuleRows(onb.client)).length;
  assert.ok(after - rulesBefore <= 1, "a counterparty_birth tick mints AT MOST one rule (birth is not a rule)");
  await declineProposal(w.users.hana, { proposal: wiki.id, reason: "not narrative-worthy" });
  assert.equal((await proposalRows(b3)).find((x) => x.id === wiki.id).state, "declined", "declined");
  await assertRaises(CLR33, () => tickProposal(w.users.hana, { proposal: wiki.id, opKey: opk("t3") }),
    "tick on a decided proposal (proposal_not_open)");
  await completeSeedingBatch(w.users.hana, { batch: b3, opKey: opk("cb3") });
  const still = (await proposalRows(b3)).filter((x) => x.state === "proposed");
  assert.equal(still.length, 1, "unticked proposals STAY 'proposed' after completion (the WB-R2 landing state)");
});

test("S5: structural negatives — ZERO sightings, ZERO autopost, ZERO new metric columns, NO candidate tier", async () => {
  fail0017(live);
  assert.equal((await sightingRows(onb.client)).length, 0,
    "the full parse→batch→tick cycle left rule_sightings UNCHANGED (no sightings from prior GL ever)");
  const tickSrc = await fnSource("tick_seeding_proposal");
  assert.ok(!tickSrc.includes("autopost"), "the tick fn prosrc contains no 'autopost' literal");
  const pdef = await checkDefs("seeding_proposals");
  assert.ok(!/'autopost/.test(pdef), "proposal_kind has NO autopost value");
  const cols = (await rootQuery(
    "select column_name from information_schema.columns where table_schema='clara' and table_name='coding_rules'",
  )).rows.map((r) => r.column_name);
  const offenders = cols.filter((c) => /confidence|sighting|occurrence|score/i.test(c));
  assert.equal(offenders.length, 0, `coding_rules gains ZERO metric columns (got ${offenders.join(",")})`);
  const sdef = await checkDefs("coding_rules");
  assert.ok(!sdef.includes("'candidate'"), "the C-11 candidate tier stays dead (status CHECK not swapped)");
});

// REBUILT (F-A2 PR-3, OQ-3/D36 — the N-2 adjudication this cell's own [R1-F13d] comment
// forced). The original comparator proved a ticked rule INDISTINGUISHABLE from a hand-signed
// one on the coding_rules row — propose_coding_rule/sign_coding_rule are both dropped, so
// there is no hand-signed rule row left to compare against, and no ticked rule row either
// (D36: no more signed-coding_rules minting). D36 settles what the right comparator IS: not
// a rule row, but the deterministic wiki artifact tick_seeding_proposal now stages. The
// re-derived claim is the same shape, one level down — STRUCTURAL UNIFORMITY, not ad-hoc
// content: every vendor_account_rule tick's staged wiki payload carries the identical KEY
// SET, whichever vendor or account it names, so no marker on the payload distinguishes one
// tick's judgement from another's — they differ only in content, never in shape.
test("S5/Gate R2 (rebuilt, D36's N-2 adjudication): every vendor_account_rule tick's staged wiki payload carries the SAME key set — shape is structural, content is not", async () => {
  fail0017(live);
  const rows = await proposalRows(batch);
  const ticked = rows.find((x) => x.proposal_key === "var:acme")?.payload?.wiki;
  assert.ok(ticked, "var:acme's staged wiki payload exists (from the S3/S4 cell)");
  const rows2 = await proposalRows(w._b2);
  const second = rows2.find((x) => x.proposal_key === "var:acme2")?.payload?.wiki;
  assert.ok(second, "var:acme2's staged wiki payload exists (from the duplicate-vendor cell)");
  assert.equal(JSON.stringify(Object.keys(ticked).sort()), JSON.stringify(Object.keys(second).sort()),
    "identical key sets across two independent ticks — the shape is structural, never ad-hoc per tick");
  assert.deepEqual(Object.keys(ticked).sort(), ["content", "page_kind", "slug", "title"],
    "the exact shape planSeedingWikiFact (packages/runtime/lib/wiki-projection.mjs) reads");
  assert.notEqual(ticked.content, second.content,
    "the two ticks' CONTENT differs (different account codes) — only the shape is uniform, never the judgement");
});

test("S6: deterministic wiki ingest of the prior_gl source works EVEN UNDER a synthesis hold", async () => {
  fail0017(live);
  await setWikiHold({ client: onb.client, reason: "no consent yet" });
  const r = await recordWikiIngest({ client: onb.client, document: glDoc.documentId });
  assert.ok(r, "ingest receipt (WB-R10: NO model call, NO consent required)");
  const log = await wikiLogRows(onb.client);
  assert.ok(log.some((l) => l.action === "ingest"), "wiki_log('ingest') appended");
  assert.equal((await eventsOf(w.firms.A, "wiki.source_ingested", onb.client)).length >= 1, true, "wiki.source_ingested emitted");
});

test("O8 row 13: a rule live PRE-activation drives ZERO autodraft activity until commit", async () => {
  fail0017(live);
  const filing = await filedDocument(w.users.alice, { firm: w.firms.A, client: onb.client, kind: "invoice" });
  const rows = await listDocumentAutodraftCandidates({ document: filing.documentId });
  assert.equal(rows.length, 0, "the live seeded rule cannot surface an onboarding client to the sweep (rides O8 row 2)");
});

// ===========================================================================
// GATE 2 memo (docs/plan/research/wave-b/0017-asbuilt-reference.md:207,241) —
// Option 1 (ratify-as-is): tick_seeding_proposal is an INDEPENDENT
// per-item-transaction ceremony (0017_wave_b.sql:4407-4543); the dashboard
// caller already re-queries proposal/batch state after every action
// (seedingApi.ts / SeedingBatchView.tsx) rather than trusting an in-memory
// resume token. This proves the "abandon-resume" shape end-to-end.
// ===========================================================================

test("S4 GATE-2 (0017-asbuilt-reference.md:207,241, Option 1): abandon-resume — tick K of N proposals, simulate a crash/abandon, reload via the normal readers, resume the remaining N-K with FRESH op_keys; no double-tick, no lost proposal, the batch completes", async () => {
  fail0017(live);
  const b4r = await createSeedingBatch({
    client: onb.client, document: glDoc.documentId,
    proposals: [
      { ...P.vendor, proposal_key: "gate2:v1", payload: { name: "GATE2 VENDOR ONE SDN BHD", account_code: WB_COA.expense } },
      { ...P.birth, proposal_key: "gate2:b1", payload: { name: "GATE2 BIRTH ONE SDN BHD", kind: "vendor" } },
      { ...P.wiki, proposal_key: "gate2:w1" },
      { ...P.birth, proposal_key: "gate2:b2", payload: { name: "GATE2 BIRTH TWO SDN BHD", kind: "vendor" } },
    ],
    opKey: opk("gate2batch"),
  });
  const batch4 = b4r.batch_id ?? b4r.id;
  const rows0 = await proposalRows(batch4);
  assert.equal(rows0.length, 4, "N=4 proposals landed");
  const byKey = Object.fromEntries(rows0.map((p) => [p.proposal_key, p]));

  // Tick K=2 of N=4, each its OWN transaction with its OWN op_key (S4's
  // per-item ceremony) — THEN simulate a crash/abandon: just stop. There is
  // no in-flight parent reservation to leak (S1/S3's per-item shape).
  const keyA = opk("gate2tickA");
  const keyB = opk("gate2tickB");
  const r1a = await tickProposal(w.users.hana, { proposal: byKey["gate2:v1"].id, opKey: keyA });
  await tickProposal(w.users.hana, { proposal: byKey["gate2:b1"].id, opKey: keyB });

  // Reload via the NORMAL readers — the abandon-resume contract: no special
  // resume state, the caller just re-queries what's still open (the exact
  // SeedingBatchView.tsx self-hydrating idiom).
  const midRows = await proposalRows(batch4);
  const alreadyTicked = midRows.filter((p) => p.state === "ticked");
  const stillOpen = midRows.filter((p) => p.state === "proposed");
  assert.equal(alreadyTicked.length, 2, "K=2 already ticked, durably (survives the simulated abandon)");
  assert.equal(stillOpen.length, 2, "N-K=2 remain 'proposed' for the resume to pick up");

  // Resume: tick the remaining N-K with FRESH op_keys — never reusing the
  // abandoned run's keys (a genuine resume, not a same-op replay).
  for (const p of stillOpen) {
    await tickProposal(w.users.hana, { proposal: p.id, opKey: opk("gate2resume") });
  }

  const finalRows = await proposalRows(batch4);
  assert.equal(finalRows.filter((p) => p.state === "ticked").length, 4,
    "all N=4 proposals ticked exactly once — no lost proposal");
  assert.ok(finalRows.every((p) => p.state === "ticked"), "no proposal stuck 'proposed' after the resume");
  for (const key of ["gate2:v1", "gate2:b1"]) {
    const mid = midRows.find((p) => p.proposal_key === key);
    const final = finalRows.find((p) => p.proposal_key === key);
    assert.equal(final.decided_at, mid.decided_at, `${key} was NOT re-ticked by the resume (decided_at unchanged — no double-tick)`);
    assert.equal(final.resulting_rule_id ?? null, mid.resulting_rule_id ?? null, `${key}'s lineage is untouched by the resume`);
  }

  // WB-R19 lost-ACK pair (ruling-batch-adr-037.md WB-R19) — both probed while
  // batch4 is STILL open, so each hits the PROPOSAL guard specifically
  // (0017_wave_b.sql:4428-4435 checks batch state THEN proposal state;
  // completing the batch first would collapse (ii) onto batch_not_open
  // instead of proving the proposal_not_open guard on its own).

  // (i) same-key replay of an ALREADY-COMPLETED tick (gate2:v1, ticked above
  // with keyA) — _reserve_op's dedupe short-circuits BEFORE any state check
  // (4425-4427), returning the stored result byte-identically; ticked exactly
  // once, no double side effects (no extra coding_rules row minted).
  const rulesBeforeReplay = (await codingRuleRows(onb.client)).length;
  const replayA = await tickProposal(w.users.hana, { proposal: byKey["gate2:v1"].id, opKey: keyA });
  assert.equal(JSON.stringify(replayA), JSON.stringify(r1a),
    "same-key replay of an ALREADY-COMPLETED tick is byte-identical to the original receipt");
  assert.equal((await codingRuleRows(onb.client)).length, rulesBeforeReplay,
    "the replay mints ZERO additional coding_rules rows (no double side effects)");
  assert.equal((await proposalRows(batch4)).find((p) => p.proposal_key === "gate2:v1").state, "ticked",
    "gate2:v1 remains ticked exactly once after the same-key replay");

  // (ii) premature fresh-key retry against an already-ticked proposal → a
  // TYPED refusal: CLR34 (exported here as CLR33 — the as-built code shift),
  // detail reason proposal_not_open (0017_wave_b.sql:4432-4435) — NOT a
  // silent success, NOT a same-op replay (this op_key was never used before).
  const beforeRetry = (await proposalRows(batch4)).find((p) => p.proposal_key === "gate2:v1");
  const retryErr = await assertRaises(CLR33, () => tickProposal(w.users.hana,
    { proposal: byKey["gate2:v1"].id, opKey: opk("gate2premature") }),
    "a fresh op_key retry against an already-ticked proposal");
  assert.equal(detailReason(retryErr), "proposal_not_open",
    "typed detail reason: proposal_not_open (batch4 is still open here, so this is the PROPOSAL guard, not batch_not_open)");
  const afterRetry = (await proposalRows(batch4)).find((p) => p.proposal_key === "gate2:v1");
  assert.equal(afterRetry.decided_at, beforeRetry.decided_at, "the refused fresh-key retry leaves gate2:v1's decided_at unchanged");
  assert.equal(afterRetry.resulting_rule_id ?? null, beforeRetry.resulting_rule_id ?? null, "lineage unchanged by the refused retry");
  assert.equal(afterRetry.state, "ticked", "gate2:v1's state is unchanged (still ticked) by the refused retry");

  await completeSeedingBatch(w.users.hana, { batch: batch4, opKey: opk("gate2done") });
  assert.equal((await batchRow(batch4)).state, "completed", "the batch completes cleanly after the abandon-resume");
});
