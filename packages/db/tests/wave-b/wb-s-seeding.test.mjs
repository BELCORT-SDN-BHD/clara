// Wave-B battery — Block S, AFTER #1012 RETIRED THE PRIOR-GL SEEDING LANE
// (0288_seeding_lane_retired.sql, owner ruling 2026-09-20 on #983). CONTRACT-BLIND; FAILS below
// 0017. Classifier-writer machinery is probed via prosrc in wb-g-tail.
//
// WHAT THIS FILE STILL OWNS — everything about the prior-GL DOCUMENT that survives the lane's
// retirement, because a prior general ledger is still filed, still stamped, still read and still
// ingested into the wiki as a source:
//   · S2 — `prior_gl` is a real document kind (the CHECK admits it, the human stamp path works),
//     the facts gate is NOT widened for it, and `consent_evidence` stays CLR28-locked.
//   · S5 — the structural negatives: no rule sightings, no autopost value, no metric columns on
//     coding_rules, no candidate tier.
//   · S6 — the deterministic wiki ingest of the prior_gl source works even under a synthesis
//     hold (no model call, no consent).
//   · O8 row 13 — an onboarding client's live seeded rule drives zero autodraft activity.
//
// WHAT THIS FILE NO LONGER OWNS, named rather than silently dropped. Seven cells described the
// behaviour of three doors that now answer one typed refusal (CLR34 `seeding_lane_retired`):
//   · S1 "create_seeding_batch is runtime-ONLY, lands typed proposals, and REFUSES control
//     targets AT PARSE" and S1/S2 "guards — a non-prior_gl source refuses; a duplicate OPEN
//     batch refuses; same-op replays". Both described what `clara.create_seeding_batch` does
//     with an input it accepts; it accepts none. Its RETIREMENT — including that it still
//     belongs to the runtime lane alone, so a human caller still meets the privilege wall and
//     not the new body — is proven in `packages/db/tests/seeding-lane-retired.test.mjs`.
//   · S3/S4 (the admin tick's vendor birth + wiki re-point), S4 (a second vendor_account_rule
//     tick), S4 (tick replay / decline / batch state machine) and S5/Gate R2 (the staged wiki
//     payload's uniform key set). Every one of these drove `clara.tick_seeding_proposal` or
//     `clara.decline_seeding_proposal` to a SUCCESS. Neither can succeed again.
//   · S4 GATE-2 abandon-resume (tick K of N, reload, resume the rest). Same reason: the
//     ceremony it ratified cannot be started.
// What survives of all of them is the promise that HISTORY stays readable and closeable, and
// that is proven through the real doors in `seeding-lane-retired.test.mjs` (the three refusals
// write nothing, a batch left open is still cancellable and completable, and the review queue
// stops chasing) and in `ninth-rowkind-seeding-proposal.test.mjs` (no queue row for any client).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR28, rootQuery,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, checkDefs, fnSource,
  buildWaveBWorld, onboardingClient, seedOpeningCoa,
  filedDocument, setDocumentKind, docTasks, sightingRows,
  recordWikiIngest, setWikiHold, wikiLogRows, eventsOf,
  listDocumentAutodraftCandidates,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;
let onb = null;
let glDoc = null; // the prior_gl-stamped document, filed to the onboarding client

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

test("S5: structural negatives — ZERO sightings, ZERO autopost, ZERO new metric columns, NO candidate tier", async () => {
  fail0017(live);
  assert.equal((await sightingRows(onb.client)).length, 0,
    "a filed and stamped prior GL leaves rule_sightings UNCHANGED (no sightings from prior GL ever — and after #1012 no batch can be created from one at all)");
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
