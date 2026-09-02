// PROGRESS.md "Known issues" (3a) -- clara.wake_open_firm_question could mint the FIRST
// 'onboarding_proposed' question with a caller-supplied kind and candidates, bypassing DOOR 2's
// own protections (clara.wake_propose_client_onboarding's A14 name-family wall, firm-narrow
// CLR28 egress authorization, and 裁-22's own DB-resolved basis). Design of record: the
// migration's own header (packages/db/migrations/UNNUMBERED_wake_open_firm_question_kind_wall
// .sql -- the number is claimed at merge, packages/db/README.md "Migration numbers are claimed
// at MERGE time").
//
// WHAT IS UNDER TEST: an AUTHORITY wall, not a duplicate-open wall (0148's
// uq_firm_open_questions_onboarding_open already ships that, structurally, for every writer
// including this one -- see promotion-dup-open-wall.test.mjs). This file's wall does not ask
// "does one already exist" -- it asks "is this the right door", and refuses UNCONDITIONALLY,
// whether or not a question is already open. TRUED (fold review round 2, native+Codex): the
// wall is a POSITIVE ROSTER, not a single-name deny -- it admits EXACTLY the four ladder-derived
// kinds and refuses the other THREE (onboarding_proposed, correction_proposed,
// promotion_proposed) as door-owned, never "every other kind".
//   PART A -- the refusal itself: unconditional, typed CLR10/door_owned_kind, settles no
//     op-key receipt and writes no row.
//   PART B -- the POSITIVE ROSTER, proven positively over the exact live vocabulary: EXACTLY
//     the four ladder-derived kinds are admitted, and EXACTLY the three door-owned kinds refuse
//     -- including the two spoofing attacks and the NULL/unknown/whitespace/case-variant sweep
//     -- with a standing closed-set tripwire pinning the split itself.
//   PART C -- the honest recourse: wake_propose_client_onboarding (Door 2), the door this
//     refusal's own message points a caller toward, still genuinely works.
//
// PRE-INTEGRATION: CI replays numbered migrations only, so this PR's UNNUMBERED migration is
// absent from the package-wide estate sweep. The preload is only one arm: this file skips only
// after a positive read of the exact known old prosrc SHA. The reviewed body and every unknown
// future body execute every behavioural cell; a focused old-body run fails loudly.
//
// SUPERSESSION, trued in THIS PR per .claude/rules/db-tests.md ("A PR retiring or moving a
// catalog object pinned by a closed-wave floor trues that floor IN THE SAME PR"): this
// migration makes THREE cells in promotion-dup-open-wall.test.mjs describe a path that no
// longer exists (wake_open_firm_question minting or racing on kind='onboarding_proposed' at
// all) -- those three cells are updated in this same PR, not left to red the next sweep.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test as nodeTest, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  CLR, ROLES, assertRaises, opk, rootQuery, roleQuery,
  wakeActor, runAs, namedCall, ensureReady, buildWorld, mintWake, endPool,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument, ensureFirmNarrowAttribution, seedExtraction, seedRegion } from "./rig-docs-fixtures.mjs";
import {
  prefixWakeOpenFirmQuestionKindWallFailure,
  readWakeOpenFirmQuestionKindWallState,
} from "./wake-open-firm-question-kind-wall-gate-state.mjs";

let world;
let ready = false;
let missingReason = null;
let gateDiagnosticPrefix = null;

// Unknown and absent identities still execute the behavioural battery. Prefix any resulting
// assertion with the classifier's exact diagnosis so a future recut cannot produce 17 generic,
// context-free failures that look as though the reviewed post-image were under test.
const test = (name, fn) => nodeTest(name, async (t) => {
  try {
    return await fn(t);
  } catch (error) {
    throw prefixWakeOpenFirmQuestionKindWallFailure(error, gateDiagnosticPrefix);
  }
});

before(async () => {
  const gateState = await readWakeOpenFirmQuestionKindWallState(rootQuery);
  gateDiagnosticPrefix = gateState.diagnostic;
  if (gateState.oldBody) {
    missingReason = gateState.skipReason;
    return;
  }
  ready = await ensureReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (missingReason) {
    console.warn(`SKIP wake-open-firm-question-kind-wall: ${missingReason}`);
    t.skip(`${missingReason}. Explicit package-wide preintegration run.`);
    return true;
  }
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry");
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
// PART B -- the POSITIVE ROSTER, proven over the EXACT seven-value live vocabulary
// (Codex FIX-REQUIRED HIGH on #447, ruled 2026-08-30 and reaffirmed by the native review's
// FIND-3, same ruling: replace the single-name deny with a positive generic-kind roster;
// admit exactly the four ladder-derived kinds, refuse the three proposal kinds as
// door-owned; a future CHECK value fails closed by default).
// ===========================================================================

const ADMITTED_KINDS = ["unattributed", "collision", "contradiction", "identity_document"];
const DOOR_OWNED_KINDS = ["onboarding_proposed", "correction_proposed", "promotion_proposed"];

// THE STANDING CLOSED-SET TRIPWIRE (native #447 review: an 8th CHECK value, e.g. a
// hypothetical `engagement_proposed`, reds ZERO of the estate's 76 relevant cells today --
// this migration's own roster wall would fail-closed on it AT RUNTIME, correctly, but
// nothing at CI time forces a human to make the classify-it-or-not decision on purpose.
// THIS cell is that forcing function: the moment `firm_open_questions_kind_check` gains
// or loses a member, the list below stops matching the live CHECK and this cell reds --
// on a genuinely new kind, PostgreSQL's own catalog moved by design (a real migration did
// its job); this test's job is only to make that landing IMPOSSIBLE to merge silently.
test("kind wall ROSTER (standing closed-set tripwire): the live seven-value vocabulary is EXACTLY these 4 admitted + 3 door-owned kinds -- if this reds, a migration widened firm_open_questions_kind_check and the NEXT AUTHOR must classify the new kind (add it to ADMITTED_KINDS only if it is a DERIVED ladder verdict with no dedicated proposal door of its own; otherwise add it to DOOR_OWNED_KINDS and this test's own admit/refuse batteries) before merging -- the wall's own default for an unclassified kind is already the SAFE direction (`p_kind not in (...)` refuses it), so silence here would not open a hole; it would silently BREAK a legitimate new ladder-derived kind that needed adding to ADMITTED_KINDS, with no one noticing why it started refusing", async (t) => {
  if (unready(t)) return;
  const def = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.firm_open_questions'::regclass and conname='firm_open_questions_kind_check'`);
  // Round-2 fold NEW-1: [a-z_]+ misses any kind spelling with a digit or uppercase letter
  // (e.g. a hypothetical engagement2_proposed would not match, and this tripwire would
  // read 0/8 members instead of reporting the real gap) -- match anything between the
  // literal quotes the ARRAY[...] rendering actually uses, not a guessed character class.
  const live = [...def.rows[0].def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
  assert.deepEqual([...live].sort(), [...ADMITTED_KINDS, ...DOOR_OWNED_KINDS].sort(),
    "the live CHECK vocabulary no longer matches this file's own closed-set roster -- " +
    "STOP: classify the new/removed kind in ADMITTED_KINDS or DOOR_OWNED_KINDS above " +
    "(and extend wake_open_firm_question's own roster check in the migration if it is " +
    "newly admitted) before merging; do not widen this assertion to silence it without " +
    "making that classification decision explicitly, in the same PR");
});

for (const kind of ADMITTED_KINDS) {
  test(`kind wall NARROWNESS: p_kind='${kind}' (ladder-derived, admitted) is still fully admitted through wake_open_firm_question`, async (t) => {
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

for (const kind of DOOR_OWNED_KINDS) {
  test(`kind wall: p_kind='${kind}' (door-owned) refuses CLR10/door_owned_kind, settles no receipt, writes no row`, async (t) => {
    if (unready(t)) return;
    const { secret } = await mintFiling();
    const doc = await freshDoc();
    const beforeReceipts = await receiptCount(doc.documentId);
    const opKey = opk(`kw-doorowned-${kind}`);
    const err = await assertRaises(CLR.badRequest,
      () => openFirmQuestion(secret, { document: doc.documentId, kind, opKey }),
      `wake_open_firm_question(kind='${kind}')`);
    assert.equal(detailReason(err), "door_owned_kind");
    assert.equal(detailClass(err), "kind");
    assert.equal(detailKind(err), kind);
    const q = await rootQuery("select count(*)::int as n from clara.firm_open_questions where document_id=$1 and kind=$2", [doc.documentId, kind]);
    assert.equal(q.rows[0].n, 0, `no firm_open_questions row of kind='${kind}' was written`);
    assert.equal(await receiptCount(doc.documentId), beforeReceipts, "no agent_filing_receipts row was written");
    const opr = await rootQuery("select count(*)::int as n from clara.op_receipts where firm_id=$1 and fn='wake_open_firm_question' and op_key=$2", [world.firms.A, opKey]);
    assert.equal(opr.rows[0].n, 0, "no op_receipts row was written -- the refusal precedes _reserve_op");
  });
}

// THE SPOOFING ATTACK the review named directly: a candidates payload SHAPED like a real
// proposal, minted under a door-owned kind this verb has no business writing. Both must
// refuse identically to any other door-owned kind, leaving zero rows anywhere -- proving
// the wall does not inspect candidate SHAPE (which a spoofed payload could imitate) but
// the KIND itself, which is exactly what closes the spoofing hole.
test("kind wall SPOOFING: an onboarding-SHAPED candidates payload (proposed_name + basis) under p_kind='promotion_proposed' still refuses door_owned_kind -- the wall reads the kind, never the candidate shape", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const beforeReceipts = await receiptCount(doc.documentId);
  const opKey = opk("kw-spoof-onboarding-under-promo");
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, {
      document: doc.documentId, kind: "promotion_proposed", opKey,
      candidates: [{ proposed_name: "Spoofed Onboarding Sdn Bhd", basis: { sightings: 3, citations: [] } }],
    }),
    "onboarding-shaped candidates under promotion_proposed");
  assert.equal(detailReason(err), "door_owned_kind");
  assert.equal(detailKind(err), "promotion_proposed");
  const q = await rootQuery("select count(*)::int as n from clara.firm_open_questions where document_id=$1", [doc.documentId]);
  assert.equal(q.rows[0].n, 0, "zero firm_open_questions rows -- the spoofed candidates never landed");
  assert.equal(await receiptCount(doc.documentId), beforeReceipts, "zero agent_filing_receipts rows");
  const opr = await rootQuery("select count(*)::int as n from clara.op_receipts where firm_id=$1 and fn='wake_open_firm_question' and op_key=$2", [world.firms.A, opKey]);
  assert.equal(opr.rows[0].n, 0, "zero op_receipts rows");
});

test("kind wall SPOOFING: a fake from/to-client correction payload under p_kind='correction_proposed' still refuses door_owned_kind -- the wall reads the kind, never the candidate shape", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const beforeReceipts = await receiptCount(doc.documentId);
  const opKey = opk("kw-spoof-correction");
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, {
      document: doc.documentId, kind: "correction_proposed", opKey,
      candidates: [{ from_client: world.clients.A1, to_client: world.clients.A2, reason: "spoofed correction" }],
    }),
    "fake correction candidates under correction_proposed");
  assert.equal(detailReason(err), "door_owned_kind");
  assert.equal(detailKind(err), "correction_proposed");
  const q = await rootQuery("select count(*)::int as n from clara.firm_open_questions where document_id=$1", [doc.documentId]);
  assert.equal(q.rows[0].n, 0, "zero firm_open_questions rows -- the spoofed candidates never landed");
  assert.equal(await receiptCount(doc.documentId), beforeReceipts, "zero agent_filing_receipts rows");
  const opr = await rootQuery("select count(*)::int as n from clara.op_receipts where firm_id=$1 and fn='wake_open_firm_question' and op_key=$2", [world.firms.A, opKey]);
  assert.equal(opr.rows[0].n, 0, "zero op_receipts rows");
});

test("kind wall: NULL, an unknown spelling, a whitespace variant and a wrong-case admitted kind all refuse door_owned_kind -- the same one exact-membership test catches all four shapes", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const cases = [
    ["NULL", null],
    ["an unknown spelling", "not_a_real_kind"],
    ["a whitespace variant of an admitted kind", "collision "],
    ["a wrong-case admitted kind", "Collision"],
  ];
  for (const [label, kind] of cases) {
    const err = await assertRaises(CLR.badRequest,
      () => openFirmQuestion(secret, { document: doc.documentId, kind, opKey: opk(`kw-variant-${Math.random().toString(36).slice(2, 8)}`) }),
      label);
    assert.equal(detailReason(err), "door_owned_kind", `${label} refuses door_owned_kind`);
  }
  const q = await rootQuery("select count(*)::int as n from clara.firm_open_questions where document_id=$1", [doc.documentId]);
  assert.equal(q.rows[0].n, 0, "none of the four variant shapes wrote a row");
});

test("kind wall BOUNDED ECHO (fold review round 2, NEW-2): an oversized p_kind is truncated to 64 chars in the refusal's own detail JSON, not echoed unbounded", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const huge = "x".repeat(500);
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId, kind: huge, opKey: opk("kw-bounded-echo") }),
    "a 500-char p_kind");
  assert.equal(detailReason(err), "door_owned_kind");
  const echoed = detailKind(err);
  assert.equal(echoed.length, 64, "the echoed kind is capped at 64 characters, not the full 500");
  assert.equal(echoed, huge.slice(0, 64), "the echo is a left-truncation of the real value, not garbled or replaced");
});

// ===========================================================================
// PART D -- SOURCE-ORDER, permanently pinned (Codex FIX-REQUIRED MEDIUM finding 2 on
// #447, ruled 2026-08-30; round 2 NOT-CLOSED finding on the SAME cell, ruled 2026-08-30).
// A ROLLED-BACK transaction cannot behaviourally distinguish "the guard ran BEFORE
// _reserve_op" from "the guard ran after _reserve_op but the whole call then rolled back
// anyway" -- every PART A/B/spoofing cell above proves the SECOND (no receipt, no row, no
// op_receipts row survive a refusal), which is necessary but not sufficient. This cell
// reads the live prosrc BY POSITION -- a fact no rollback can mask -- so a future recut
// that moves the guard AFTER _reserve_op (still refusing, still leaving no row, because
// the whole call still rolls back) reds this cell even though every behavioural cell
// above would keep passing.
//
// ROUND 2: `indexOf()` on marker strings alone is itself spoofable -- a future recut
// could plant the exact guard marker text inside an EARLY COMMENT, move the real
// executable guard after _reserve_op, and still pass every position assertion below (the
// FIRST occurrence of the marker is the comment, not the code). Closed by ALSO pinning
// the live prosrc's sha256 to the exact reviewed postimage -- any recut, marker-preserving
// or not, changes the body's bytes, and a later LEGITIMATE recut must deliberately update
// this pin (the same discipline the migration's own tail already carries at deploy time;
// this is that same fact, permanent, at CI time).
// ===========================================================================

test("kind wall SOURCE ORDER (permanent catalog pin): the roster guard's own source position is strictly BEFORE _reserve_op, the agent_filing_receipts INSERT, and the _firm_question_core call -- read from live prosrc, a fact no rollback can mask; AND the live prosrc sha256 equals the exact reviewed postimage, so a marker planted in an early comment (which indexOf() alone cannot see through) cannot pass this cell silently", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select p.prosrc as src from pg_proc p
      where p.oid = 'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)'::regprocedure`);
  const src = r.rows[0].src;
  const liveSha = createHash("sha256").update(src, "utf8").digest("hex");
  assert.equal(liveSha, "779ac164ae985e39ad0c8457be2e8b1768fb306888ed0bdec336924765078635",
    "the live prosrc no longer matches the exact reviewed postimage -- a later LEGITIMATE " +
    "recut must deliberately update this pin, in the same PR that changes the body, so a " +
    "reviewer sees the sha move rather than trusting a marker-string position check alone");
  const guardPos = src.indexOf("if p_kind is null or p_kind not in (");
  const reserveOpPos = src.indexOf("v_dedupe := clara._reserve_op(w.firm_id,'wake_open_firm_question'");
  const receiptInsertPos = src.indexOf("insert into clara.agent_filing_receipts(");
  const corePos = src.indexOf("clara._firm_question_core(clara.agent_user_id()");
  assert.ok(guardPos > -1, "the guard is present in the live body");
  assert.ok(reserveOpPos > -1 && receiptInsertPos > -1 && corePos > -1, "all three downstream anchors are present");
  assert.ok(guardPos < reserveOpPos, "the guard precedes _reserve_op");
  assert.ok(guardPos < receiptInsertPos, "the guard precedes the agent_filing_receipts INSERT");
  assert.ok(guardPos < corePos, "the guard precedes the _firm_question_core call");
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
