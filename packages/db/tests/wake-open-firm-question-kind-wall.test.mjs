// PROGRESS.md "Known issues" (3a) -- clara.wake_open_firm_question could mint the FIRST
// 'onboarding_proposed' question with a caller-supplied kind and candidates, bypassing DOOR 2's
// own protections (clara.wake_propose_client_onboarding's A14 name-family wall and firm-narrow
// CLR28 egress authorization). Design of record: the migration's own header
// (packages/db/migrations/UNNUMBERED_wake_open_firm_question_kind_wall.sql -- the number is
// claimed at merge, packages/db/README.md "Migration numbers are claimed at MERGE time").
//
// WHAT IS UNDER TEST: an AUTHORITY wall, not a duplicate-open wall (0148's
// uq_firm_open_questions_onboarding_open already ships that, structurally, for every writer
// including this one -- see promotion-dup-open-wall.test.mjs). This file's wall does not ask
// "does one already exist" -- it asks "is this the right door", and refuses UNCONDITIONALLY,
// whether or not a question is already open.
//   PART A -- the refusal itself: unconditional, typed CLR10/door_owned_kind, settles no
//     op-key receipt and writes no row.
//   PART B -- NARROWNESS, proven positively: every OTHER kind in the live vocabulary is still
//     admitted through this verb -- the wall targets exactly one kind, not a blanket lockdown
//     of the verb's own documented ad hoc purpose ("triage could not even produce a
//     candidate", 0126's own header).
//   PART C -- the honest recourse: wake_propose_client_onboarding (Door 2), the door this
//     refusal's own message points a caller toward, still genuinely works.
//
// UNLIKE 0148's sibling batteries (promotion-dup-open-wall.test.mjs and its
// -preintegration-gate.mjs companion), this file ships in the SAME PR as its own migration --
// there is no multi-PR staging window where main could carry one without the other, so there is
// no cross-chain mismatch for a preintegration gate to paper over. The catalog gate below still
// fails LOUDLY (never skips) if the premise is missing, matching the estate's fail-never-skip
// convention; it simply has no allow-missing companion because none is needed here.
//
// SUPERSESSION, trued in THIS PR per .claude/rules/db-tests.md ("A PR retiring or moving a
// catalog object pinned by a closed-wave floor trues that floor IN THE SAME PR"): this
// migration makes THREE cells in promotion-dup-open-wall.test.mjs describe a path that no
// longer exists (wake_open_firm_question minting or racing on kind='onboarding_proposed' at
// all) -- those three cells are updated in this same PR, not left to red the next sweep.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, PG, ROLES, assertRaises, opk, rootQuery, roleQuery, humanQuery,
  wakeActor, runAs, namedCall, ensureReady, buildWorld, mintWake, endPool,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument, ensureFirmNarrowAttribution, seedExtraction, seedRegion } from "./rig-docs-fixtures.mjs";

let world;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  // The catalog gate names the WALL's own marker text, not just the function's existence --
  // wake_open_firm_question has resolved since 0126, so a bare to_regprocedure check would
  // pass on a pre-migration chain and this file's cells would then hard-fail one-by-one on
  // "expected CLR10, got success" with no single diagnosis of WHY.
  const catalog = await rootQuery(
    `select position('door_owned_kind' in p.prosrc) <> 0 as walled
       from pg_proc p
      where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure`,
  );
  if (!catalog.rows[0]?.walled) {
    throw new Error(
      "wake-open-firm-question-kind-wall premise missing: clara.wake_open_firm_question does not " +
      "carry the door_owned_kind marker -- this migration and this test file ship in the SAME PR " +
      "(packages/db/migrations/UNNUMBERED_wake_open_firm_question_kind_wall.sql), so a chain " +
      "carrying this file but not the migration is a broken checkout, not a legitimate pre-wave " +
      "state -- failing loudly rather than skipping.",
    );
  }
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or the door_owned_kind catalog gate found the wall absent");
    return true;
  }
  return false;
}

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });
const mintFiling = () => mintWake({ kind: "filing", firm: world.firms.A });
const freshDoc = (firm = world.firms.A) => seedVerifiedDocument({ firm, kind: "invoice" });

/** One done/ocr extraction + one region on `documentId`, so Door 2's own basis floor
 *  (>=1 sighting, >=1 citation) is satisfiable -- same shape promotion-dup-open-wall.test.mjs
 *  uses for the identical reason. */
async function seedOneRegion(documentId, firm = world.firms.A) {
  const extraction = await seedExtraction({ firm, document: documentId });
  const region = await seedRegion({ firm, extraction });
  return { citation: { region_id: region } };
}

const OFQ_SPECS = [
  { name: "p_document" }, { name: "p_kind" }, { name: "p_question" },
  { name: "p_candidates", cast: "jsonb" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
  { name: "p_op_key" },
];
const ofqVals = (o) => [
  o.document, o.kind, o.question ?? "Rig: kind-wall probe",
  JSON.stringify(o.candidates ?? []), o.rationale ?? "rig rationale",
  JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("kw"),
];
const openFirmQuestion = (secret, o) =>
  runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_open_firm_question", OFQ_SPECS), ofqVals(o));

const D2_SPECS = [
  { name: "p_document" }, { name: "p_proposed_name" }, { name: "p_basis", cast: "jsonb" },
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" },
  { name: "p_op_key" },
];
let _firmNarrowArmed = false;
async function freshAuthorization(documentSha256) {
  if (!_firmNarrowArmed) {
    await ensureFirmNarrowAttribution({ firm: world.firms.A });
    _firmNarrowArmed = true;
  }
  const r = await roleQuery(
    ROLES.runtime,
    namedCall("prepare_firm_egress_dispatch", [
      { name: "p_firm" }, { name: "p_purpose" }, { name: "p_moment" }, { name: "p_event_seq", cast: "bigint" },
      { name: "p_event_type" }, { name: "p_document_sha256" },
    ]),
    [world.firms.A, "firm_narrow_intake", "attribution", 1, "document.ingested", documentSha256],
  );
  assert.equal(r.rows[0].result.verdict, "granted", "setup: prepare_firm_egress_dispatch must grant");
  return r.rows[0].result.authorization_id;
}
const proposeOnboarding = (secret, o) =>
  runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_client_onboarding", D2_SPECS), [
    o.document, o.proposedName ?? `Kw ${Math.random().toString(36).slice(2, 10)} Sdn Bhd`,
    JSON.stringify(o.basis ?? { sightings: 0, citations: [] }), o.rationale ?? "rig rationale",
    JSON.stringify(o.model ?? validModel()), o.authorization, o.opKey ?? opk("kw-d2"),
  ]);

const detailReason = (err) => JSON.parse(err.detail ?? "{}").reason;
const detailClass = (err) => JSON.parse(err.detail ?? "{}").class;
const detailKind = (err) => JSON.parse(err.detail ?? "{}").kind;

const openOnboardingQuestions = async (documentId) => (await rootQuery(
  `select count(*)::int as n from clara.firm_open_questions
    where document_id=$1 and kind='onboarding_proposed' and status='open'`, [documentId])).rows[0].n;
const receiptCount = async (documentId) => (await rootQuery(
  "select count(*)::int as n from clara.agent_filing_receipts where document_id=$1", [documentId])).rows[0].n;

// ===========================================================================
// PART A -- the refusal itself: unconditional, typed, no side effect
// ===========================================================================

test("kind wall: p_kind='onboarding_proposed' refuses CLR10/door_owned_kind on a document with NO existing open question -- the FIRST attempt is refused, not just a duplicate", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  assert.equal(await openOnboardingQuestions(doc.documentId), 0, "setup: no onboarding_proposed question exists yet");
  const before0 = await receiptCount(doc.documentId);
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: "onboarding_proposed" }),
    "wake_open_firm_question(kind='onboarding_proposed') on a document with no existing question");
  assert.equal(detailReason(err), "door_owned_kind");
  assert.equal(detailClass(err), "kind");
  assert.equal(detailKind(err), "onboarding_proposed");
  assert.equal(await openOnboardingQuestions(doc.documentId), 0, "the refusal writes no firm_open_questions row");
  assert.equal(await receiptCount(doc.documentId), before0, "the refusal settles no agent_filing_receipts row -- it precedes the op-key reservation");
});

test("kind wall: p_kind='onboarding_proposed' ALSO refuses when a Door-2 question is already open -- the same refusal, not a different one, so a caller cannot distinguish the two cases", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  await proposeOnboarding(secret, {
    document: doc.documentId, basis: { sightings: 1, citations: [citation] },
    authorization: await freshAuthorization(doc.sha256),
  });
  assert.equal(await openOnboardingQuestions(doc.documentId), 1, "setup: Door 2 opened one");
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: "onboarding_proposed", opKey: opk("kw-dup") }),
    "wake_open_firm_question(kind='onboarding_proposed') on a document that already has one open");
  assert.equal(detailReason(err), "door_owned_kind", "the verb-level wall fires first -- 0148's duplicate-open index is never even reached");
  assert.equal(detailClass(err), "kind");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1, "still exactly the one Door 2 opened -- unchanged");
});

test("kind wall: the refusal fires even on a REPLAY of the same op_key -- there is no cached success to replay, because nothing was ever reserved", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const opKey = opk("kw-replay");
  const first = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: "onboarding_proposed", opKey }),
    "first attempt");
  const second = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: "onboarding_proposed", opKey }),
    "replay of the same op_key");
  assert.equal(detailReason(first), "door_owned_kind");
  assert.equal(detailReason(second), "door_owned_kind");
  assert.equal(await openOnboardingQuestions(doc.documentId), 0);
});

// ===========================================================================
// PART B -- NARROWNESS, proven positively: every OTHER kind is still admitted
// ===========================================================================

for (const kind of ["unattributed", "collision", "contradiction", "identity_document", "correction_proposed"]) {
  test(`kind wall NARROWNESS: p_kind='${kind}' is still fully admitted through wake_open_firm_question -- the wall targets exactly onboarding_proposed`, async (t) => {
    if (unready(t)) return;
    const { secret } = await mintFiling();
    const doc = await freshDoc();
    const r = await openFirmQuestion(secret, { document: doc.documentId, kind, opKey: opk(`kw-narrow-${kind}`) });
    const result = r.rows[0].result;
    assert.ok(result.question_id, `kind='${kind}' is admitted -- question_id returned`);
    assert.ok(result.receipt_id, `kind='${kind}' is admitted -- receipt_id returned`);
    const q = await rootQuery("select kind, status from clara.firm_open_questions where id=$1", [result.question_id]);
    assert.equal(q.rows[0].kind, kind);
    assert.equal(q.rows[0].status, "open");
  });
}

test("kind wall NARROWNESS: 'promotion_proposed' -- a live CHECK vocabulary member with no writer at all today -- is still ADMITTED through this verb (deliberately left unwalled; no door to protect exists yet)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const r = await openFirmQuestion(secret, { document: doc.documentId, kind: "promotion_proposed", opKey: opk("kw-narrow-promo") });
  assert.ok(r.rows[0].result.question_id, "promotion_proposed is admitted -- this migration walls onboarding_proposed only");
});

// ===========================================================================
// PART C -- the honest recourse: Door 2 still genuinely works
// ===========================================================================

test("kind wall: the refusal's own recourse, wake_propose_client_onboarding, still succeeds for the same document -- the wall closes a side door, not the front door", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: "onboarding_proposed" }),
    "the side door refuses first");
  const r = await proposeOnboarding(secret, {
    document: doc.documentId, basis: { sightings: 1, citations: [citation] },
    authorization: await freshAuthorization(doc.sha256), opKey: opk("kw-recourse"),
  });
  assert.ok(r.rows[0].result.question_id, "Door 2 mints the question the side door refused to");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
});
