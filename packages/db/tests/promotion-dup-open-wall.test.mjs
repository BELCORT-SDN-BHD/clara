// MBB-7(a) -- the STRUCTURAL duplicate-open wall on the two agent proposal doors.
// Design of record: the migration's own header (packages/db/migrations/
// 0148_promotion_dup_open_wall.sql, the number claimed at merge prep; rig-replayed as 0153).
//
// WHAT IS UNDER TEST, and what each part discriminates:
//   PART A -- Door 1 (clara.wake_propose_identifier_promotion): the partial unique index
//     uq_client_identifier_promotions_open_subject and the wrapper-level unique_violation ->
//     CLR10/already_open map. Before this migration BOTH duplicate proposals were admitted.
//   PART B -- Door 2's invariant (one OPEN onboarding_proposed question per document): the
//     partial unique index uq_firm_open_questions_onboarding_open and the map in the SHARED
//     core clara._firm_question_core. The interesting cell here is NOT Door 2's own second
//     call -- 0142's `select ... from clara.documents ... for update` already serialized that,
//     and the race cell below PROVES that rather than assuming it -- but
//     clara.wake_open_firm_question, a SECOND writer of the same kind that holds no document
//     lock and runs no duplicate check, which the body check can never see.
//   PART C -- the two indexes read BY PROPERTY at the rig layer. A migration-time fact that no
//     test ever re-asserts is treated as permanent by assumption, not by proof (rev-pb A5's
//     own lesson, applied here).
//   PART D -- the handlers are NARROW: an unrelated unique_violation on the same table is
//     re-raised as a raw 23505, never relabelled as already_open. Proven BEHAVIOURALLY with a
//     throwaway probe index, not by reading the body text.
//
// Serial discipline: --test-concurrency=1 (shared rig convention). The two race cells take two
// DEDICATED pooled connections each and PROVE the interleave with pg_blocking_pids
// (.claude/rules/db-tests.md: "never a sleep, which proves nothing about whether the block
// actually happened").

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, PG, ROLES, assertRaises, opk, rootQuery, roleQuery, humanQuery,
  wakeActor, runAs, namedCall, ensureReady, buildWorld, mintWake, endPool, getPool,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument, ensureFirmNarrowAttribution, seedExtraction, seedRegion } from "./rig-docs-fixtures.mjs";

let world;
let ready = false;

const D1_INDEX = "uq_client_identifier_promotions_open_subject";
const D2_INDEX = "uq_firm_open_questions_onboarding_open";

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select to_regclass('clara.${D1_INDEX}') is not null as d1,
            to_regclass('clara.${D2_INDEX}') is not null as d2`,
  );
  const row = catalog.rows[0];
  if (!row.d1 || !row.d2) {
    if (process.env.CLARA_ALLOW_MISSING_PROMOTION_DUP_WALL !== "1") {
      throw new Error(
        `promotion-dup-open-wall premise missing (${D1_INDEX}=${row.d1}, ${D2_INDEX}=${row.d2}) and ` +
        "CLARA_ALLOW_MISSING_PROMOTION_DUP_WALL is unset -- this is a FOCUSED run and must fail loudly, " +
        "not skip. Preload ./tests/promotion-dup-open-wall-preintegration-gate.mjs for an estate-sweep " +
        "run against a pre-migration chain.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: either ensureReady() found no draft_entry, or MBB-7(a)'s catalog gate found one of the two partial unique indexes absent");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING on a lock held by `blockerPid`.
 *  Local copy of the convention p4t1/p4t2 also keep locally (db-tests.md). */
async function waitBlockedByOrThrow(pid, blockerPid, what, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(25);
  }
  throw new Error(`waitBlockedByOrThrow: backend ${pid} never observably blocked on ${blockerPid} within ${timeoutMs}ms (${what})`);
}

const mintFiling = () => mintWake({ kind: "filing", firm: world.firms.A });
const freshDoc = (firm = world.firms.A) => seedVerifiedDocument({ firm, kind: "invoice" });

/** One done/ocr extraction + one region on `documentId`; returns a ready `{region_id}`. */
async function seedOneRegion(documentId, firm = world.firms.A) {
  const extraction = await seedExtraction({ firm, document: documentId });
  const region = await seedRegion({ firm, extraction });
  return { extraction, region, citation: { region_id: region } };
}

const D1_SPECS = [
  { name: "p_client" }, { name: "p_document" }, { name: "p_kind" }, { name: "p_value" },
  { name: "p_sightings", cast: "int" }, { name: "p_citations", cast: "jsonb" },
  { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
];
const d1Vals = (o) => [
  o.client, o.document, o.kind ?? "ssm", o.value,
  o.sightings ?? 1, JSON.stringify(o.citations),
  o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("mbb7d1"),
];
/** Door 1 through a real filing wake credential. */
const proposeIdentifier = (secret, o) =>
  runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_identifier_promotion", D1_SPECS), d1Vals(o));

const OFQ_SPECS = [
  { name: "p_document" }, { name: "p_kind" }, { name: "p_question" },
  { name: "p_candidates", cast: "jsonb" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
  { name: "p_op_key" },
];
const ofqVals = (o) => [
  o.document, o.kind ?? "onboarding_proposed", o.question ?? "Rig: is this a new client?",
  JSON.stringify(o.candidates ?? []), o.rationale ?? "rig rationale",
  JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("mbb7ofq"),
];
/** The SECOND writer of kind='onboarding_proposed' -- caller-supplied kind, no document lock,
 *  no duplicate-open check of its own. This is the path Door 2's body check cannot see. */
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
    o.document, o.proposedName ?? `Mbb7 ${Math.random().toString(36).slice(2, 10)} Sdn Bhd`,
    JSON.stringify(o.basis), o.rationale ?? "rig rationale",
    JSON.stringify(o.model ?? validModel()), o.authorization, o.opKey ?? opk("mbb7d2"),
  ]);

const detailReason = (err) => JSON.parse(err.detail ?? "{}").reason;
const detailClass = (err) => JSON.parse(err.detail ?? "{}").class;

const openCards = async (client, kind, value) => (await rootQuery(
  `select count(*)::int as n from clara.client_identifier_promotions
    where client_id=$1 and kind=$2 and value_normalized=$3 and status='proposed'`,
  [client, kind, value])).rows[0].n;

const openOnboardingQuestions = async (documentId) => (await rootQuery(
  `select count(*)::int as n from clara.firm_open_questions
    where document_id=$1 and kind='onboarding_proposed' and status='open'`, [documentId])).rows[0].n;

/** One connection impersonating clara_wake_filing inside an OPEN transaction with the wake
 *  secret set txn-locally (exactly asWake's own shape, but held open by the caller). */
async function openWakeSession(secret) {
  const c = await getPool().connect();
  // ROLES (rig-helpers) predates clara_wake_filing and has no key for it; the literal is the
  // same one wakeActor("clara_wake_filing", ...) uses everywhere else in the F-A7 batteries.
  await c.query("set role clara_wake_filing");
  await c.query("begin");
  await c.query("select set_config('clara.wake_secret', $1, true)", [secret]);
  const pid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
  return { c, pid };
}
async function closeWakeSession(s) {
  if (!s) return;
  await s.c.query("rollback").catch(() => {});
  await s.c.query("reset role").catch(() => {});
  await s.c.query("reset all").catch(() => {});
  s.c.release();
}

// ===========================================================================
// PART A -- Door 1: clara.wake_propose_identifier_promotion
// ===========================================================================

test("MBB-7(a) D1: a SECOND open proposal for the same (client, kind, value) under a DIFFERENT op_key refuses CLR10/already_open, and writes no second card", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const value = `SSM7A${Date.now()}`;
  const first = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, value, citations: [citation],
  });
  assert.ok(first.rows[0].result.promotion_id, "the first proposal is admitted");

  const err = await assertRaises(CLR.badRequest,
    () => proposeIdentifier(secret, {
      client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey: opk("mbb7d1-second"),
    }),
    "second open proposal, same subject, DIFFERENT op_key");
  assert.equal(detailReason(err), "already_open", "the refusal names the already-open reason");
  assert.equal(detailClass(err), "identifier_promotion", "...and the identifier-promotion class");
  assert.equal(await openCards(world.clients.A1, "ssm", value.toLowerCase()), 1,
    "exactly ONE open card survives -- before MBB-7(a) BOTH were admitted");
});

test("MBB-7(a) D1: a DIFFERENT value, and the SAME value under a different KIND, are both still admitted -- the wall is keyed on the subject, not on the client", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const base = `${Date.now()}`;
  const a = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, kind: "ssm", value: `SSM7B1${base}`, citations: [citation],
  });
  const b = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, kind: "ssm", value: `SSM7B2${base}`, citations: [citation],
  });
  // The SAME literal value under a different kind: proves `kind` really is part of the key.
  const c = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, kind: "tin", value: `SSM7B1${base}`, citations: [citation],
  });
  for (const [label, r] of [["a different value", b], ["the same value under a different kind", c]]) {
    assert.ok(r.rows[0].result.promotion_id, `${label} is admitted`);
  }
  assert.notEqual(a.rows[0].result.promotion_id, b.rows[0].result.promotion_id);
});

test("MBB-7(a) D1: the wall is keyed on the NORMALISED value -- ' AB 12 34 x ' collides with 'ab1234x', because that is the identifier the door would actually write", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const raw = `SSM7C${Date.now()}`;
  await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, value: raw, citations: [citation],
  });
  // MUTANT this discriminates: an index keyed on a raw `value` column (there is none) or on a
  // case-sensitive/whitespace-sensitive spelling would admit this second card.
  const err = await assertRaises(CLR.badRequest,
    () => proposeIdentifier(secret, {
      client: world.clients.A1, document: doc.documentId, value: `  ${raw.toUpperCase()}  `,
      citations: [citation], opKey: opk("mbb7d1-norm"),
    }),
    "the same identifier spelled with different case and padding");
  assert.equal(detailReason(err), "already_open");
  assert.equal(await openCards(world.clients.A1, "ssm", raw.toLowerCase()), 1);
});

test("MBB-7(a) D1: settling the card FREES the slot -- the same value may be re-proposed after a DECLINE and again after a CONFIRM", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const value = `SSM7D${Date.now()}`;
  const mk = (tag) => proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey: opk(tag),
  });

  const p1 = (await mk("mbb7d1-p1")).rows[0].result.promotion_id;
  await humanQuery(world.users.bob, "select clara.decline_identifier_promotion($1,'rig: not stable',$2)", [p1, opk("dip")]);
  const p2 = (await mk("mbb7d1-p2")).rows[0].result.promotion_id;
  assert.notEqual(p2, p1, "a declined card frees the slot for an honest re-proposal");

  await humanQuery(world.users.bob, "select clara.confirm_identifier_promotion($1,$2)", [p2, opk("cip")]);
  const p3 = (await mk("mbb7d1-p3")).rows[0].result.promotion_id;
  assert.notEqual(p3, p2, "a confirmed card also leaves the predicate and frees the slot");
  assert.equal(await openCards(world.clients.A1, "ssm", value.toLowerCase()), 1,
    "only the newest card is open; the settled two are out of the partial index");
});

test("MBB-7(a) D1: an IDENTICAL replay on the same op_key is still served from the reservation cache -- the new wall never turns a legitimate retry into a refusal", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const value = `SSM7E${Date.now()}`;
  const opKey = opk("mbb7d1-replay");
  const first = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey,
  });
  const second = await proposeIdentifier(secret, {
    client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey,
  });
  assert.deepEqual(second.rows[0].result, first.rows[0].result,
    "the replay returns the identical receipt -- _reserve_op answers before the index is ever reached");
  assert.equal(await openCards(world.clients.A1, "ssm", value.toLowerCase()), 1, "exactly one card, not two");
});

test("MBB-7(a) D1 RACE: two sessions proposing the SAME subject under DIFFERENT op_keys -- the loser is observably BLOCKED on the winner (never a sleep), then refuses CLR10/already_open once the winner commits; exactly one card survives", async (t) => {
  if (unready(t)) return;
  // TWO credentials, not one: a shared credential row could itself be the thing the loser
  // blocks on, which would make "blocked" prove the wrong lock.
  const { secret: s1 } = await mintFiling();
  const { secret: s2 } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const value = `SSM7F${Date.now()}`;
  const call = namedCall("wake_propose_identifier_promotion", D1_SPECS);

  let t1 = null; let t2 = null; let blocked = false; let loser;
  try {
    t1 = await openWakeSession(s1);
    await t1.c.query(call, d1Vals({
      client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey: opk("mbb7race-a"),
    }));

    t2 = await openWakeSession(s2);
    const t2p = t2.c
      .query(call, d1Vals({
        client: world.clients.A1, document: doc.documentId, value, citations: [citation], opKey: opk("mbb7race-b"),
      }))
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    // THE MUTANT THIS DISCRIMINATES: drop uq_client_identifier_promotions_open_subject and T2
    // never blocks at all -- this line throws and the cell goes RED, rather than quietly
    // "passing" on a wall that is not there.
    blocked = await waitBlockedByOrThrow(t2.pid, t1.pid, `the ${D1_INDEX} insert conflict`);
    await t1.c.query("commit");
    loser = await t2p;
  } finally {
    await closeWakeSession(t1);
    await closeWakeSession(t2);
  }

  assert.ok(blocked, "T2 must be observably blocked on T1's uncommitted insert");
  assert.equal(loser.ok, false, "the loser of the race must REFUSE, not write a second card");
  assert.equal(loser.e.code, CLR.badRequest, `the loser refuses typed CLR10, not a raw ${PG.uniqueViolation}`);
  assert.equal(detailReason(loser.e), "already_open");
  assert.equal(detailClass(loser.e), "identifier_promotion");
  assert.equal(await openCards(world.clients.A1, "ssm", value.toLowerCase()), 1, "exactly one card survives the race");
});

// ===========================================================================
// PART B -- Door 2's invariant: one OPEN onboarding_proposed question per document
// ===========================================================================

test("MBB-7(a) D2: a second wake_propose_client_onboarding on the same document still refuses already_open -- through its OWN body check, which this migration deliberately left in place", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const basis = { sightings: 1, citations: [citation] };
  await proposeOnboarding(secret, { document: doc.documentId, basis, authorization: await freshAuthorization(doc.sha256) });
  const second = await freshAuthorization(doc.sha256);
  const err = await assertRaises(CLR.badRequest,
    () => proposeOnboarding(secret, {
      document: doc.documentId, basis, authorization: second, opKey: opk("mbb7d2-second"),
    }),
    "second onboarding proposal, same document, different op_key");
  assert.equal(detailReason(err), "already_open");
  assert.equal(detailClass(err), "onboarding_proposed");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
});

test("MBB-7(a) D2 THE SECOND WRITER: wake_open_firm_question(kind='onboarding_proposed') on a document that already has one now refuses CLR10/already_open -- the path Door 2's body check can never see", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  await proposeOnboarding(secret, {
    document: doc.documentId, basis: { sightings: 1, citations: [citation] },
    authorization: await freshAuthorization(doc.sha256),
  });
  // BEFORE MBB-7(a) this call was ADMITTED: wake_open_firm_question takes a caller-supplied
  // kind, holds no document lock, runs no duplicate-open check and demands no egress
  // authorization. The ONLY thing that refuses it is the new index.
  // MUTANT this discriminates: drop uq_firm_open_questions_onboarding_open -> this call
  // succeeds and the cell goes RED.
  const err = await assertRaises(CLR.badRequest,
    () => openFirmQuestion(secret, { document: doc.documentId }),
    "wake_open_firm_question opening a SECOND onboarding_proposed question on the same document");
  assert.equal(detailReason(err), "already_open");
  assert.equal(detailClass(err), "onboarding_proposed",
    "the shared core gives the index's 23505 the SAME typed name Door 2's own body check uses");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
});

test("MBB-7(a) D2: the wall is KIND-scoped -- a second open question of a different kind on the same document is still admitted, and settling the onboarding one frees its slot", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const first = await openFirmQuestion(secret, { document: doc.documentId });
  const other = await openFirmQuestion(secret, { document: doc.documentId, kind: "unattributed", opKey: opk("mbb7d2-other") });
  assert.ok(other.rows[0].result.question_id, "a DIFFERENT kind on the same document is untouched by the wall");

  await humanQuery(world.users.bob,
    "select clara.dismiss_firm_question($1,'rig: settled',$2)",
    [first.rows[0].result.question_id, opk("dfq")]);
  const again = await openFirmQuestion(secret, { document: doc.documentId, opKey: opk("mbb7d2-again") });
  assert.ok(again.rows[0].result.question_id, "dismissing leaves the predicate and frees the slot");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
});

test("MBB-7(a) D2 RACE: two sessions opening the same onboarding_proposed question through the UNLOCKED writer -- the loser is observably BLOCKED on the index (never a sleep), then refuses CLR10/already_open; exactly one question survives", async (t) => {
  if (unready(t)) return;
  const { secret: s1 } = await mintFiling();
  const { secret: s2 } = await mintFiling();
  const doc = await freshDoc();
  const call = namedCall("wake_open_firm_question", OFQ_SPECS);

  // wake_open_firm_question is deliberately the racer here, NOT wake_propose_client_onboarding:
  // Door 2 already serializes its own two callers on `clara.documents ... for update` (the
  // separate cell below proves that lock is real), so racing Door 2 against itself would
  // measure the LOCK, not the index. This path holds no such lock, so the index is the only
  // thing standing between the two sessions.
  let t1 = null; let t2 = null; let blocked = false; let loser;
  try {
    t1 = await openWakeSession(s1);
    await t1.c.query(call, ofqVals({ document: doc.documentId, opKey: opk("mbb7d2race-a") }));

    t2 = await openWakeSession(s2);
    const t2p = t2.c
      .query(call, ofqVals({ document: doc.documentId, opKey: opk("mbb7d2race-b") }))
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    blocked = await waitBlockedByOrThrow(t2.pid, t1.pid, `the ${D2_INDEX} insert conflict`);
    await t1.c.query("commit");
    loser = await t2p;
  } finally {
    await closeWakeSession(t1);
    await closeWakeSession(t2);
  }

  assert.ok(blocked, "T2 must be observably blocked on T1's uncommitted insert");
  assert.equal(loser.ok, false, "the loser must REFUSE, not open a second onboarding question");
  assert.equal(loser.e.code, CLR.badRequest, `the loser refuses typed CLR10, not a raw ${PG.uniqueViolation}`);
  assert.equal(detailReason(loser.e), "already_open");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
});

test("MBB-7(a) D2: Door 2's own two callers serialize on the document row lock -- measured, not taken from 0142's comment; the loser blocks and then refuses through the BODY check", async (t) => {
  if (unready(t)) return;
  const { secret: s1 } = await mintFiling();
  const { secret: s2 } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const basis = { sightings: 1, citations: [citation] };
  const authA = await freshAuthorization(doc.sha256);
  const authB = await freshAuthorization(doc.sha256);
  const call = namedCall("wake_propose_client_onboarding", D2_SPECS);
  const vals = (auth, tag) => [
    doc.documentId, `Mbb7Race ${tag} Sdn Bhd`, JSON.stringify(basis), "rig rationale",
    JSON.stringify(validModel()), auth, opk(tag),
  ];

  let t1 = null; let t2 = null; let blocked = false; let loser;
  try {
    t1 = await openWakeSession(s1);
    await t1.c.query(call, vals(authA, "mbb7d2lock-a"));
    t2 = await openWakeSession(s2);
    const t2p = t2.c.query(call, vals(authB, "mbb7d2lock-b"))
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));
    blocked = await waitBlockedByOrThrow(t2.pid, t1.pid, "the clara.documents FOR UPDATE lock");
    await t1.c.query("commit");
    loser = await t2p;
  } finally {
    await closeWakeSession(t1);
    await closeWakeSession(t2);
  }

  assert.ok(blocked, "T2 must be observably blocked -- 0142's claim that the document lock serializes both callers");
  assert.equal(loser.ok, false, "exactly one of the two racers wins");
  assert.equal(loser.e.code, CLR.badRequest);
  assert.equal(detailReason(loser.e), "already_open");
  assert.equal(await openOnboardingQuestions(doc.documentId), 1);
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authB]);
  assert.equal(auth.rows[0].consumed_at, null, "the loser's one-time-use authorization is NOT burned by a refusal");
});

// ===========================================================================
// PART C -- the two indexes, read BY PROPERTY at the rig layer
// ===========================================================================

test("MBB-7(a): both walls are real UNIQUE, VALID, READY, LIVE partial indexes with the exact key columns and predicate -- read from pg_index, never from a name", async (t) => {
  if (unready(t)) return;
  const expected = {
    [D1_INDEX]: {
      rel: "clara.client_identifier_promotions",
      cols: "firm_id,client_id,kind,value_normalized",
      pred: "(status = 'proposed'::text)",
    },
    [D2_INDEX]: {
      rel: "clara.firm_open_questions",
      cols: "document_id",
      pred: "((kind = 'onboarding_proposed'::text) AND (status = 'open'::text))",
    },
  };
  for (const [name, want] of Object.entries(expected)) {
    const r = await rootQuery(
      `select i.indisunique, i.indisvalid, i.indisready, i.indislive,
              i.indrelid::regclass::text as rel,
              pg_get_expr(i.indpred, i.indrelid) as pred,
              (select string_agg(a.attname, ',' order by k.ord)
                 from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
                 join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att) as cols
         from pg_index i where i.indexrelid = $1::regclass`, [`clara.${name}`]);
    const row = r.rows[0];
    assert.ok(row, `${name} resolves`);
    assert.equal(row.indisunique, true, `${name} is UNIQUE -- a uq_-named index that is not unique is exactly what this cell exists to catch`);
    assert.equal(row.indisvalid, true, `${name} is valid`);
    assert.equal(row.indisready, true, `${name} is ready`);
    assert.equal(row.indislive, true, `${name} is live`);
    assert.equal(row.rel, want.rel);
    assert.equal(row.cols, want.cols, `${name} key columns`);
    assert.equal(row.pred, want.pred, `${name} predicate`);
  }
});

test("MBB-7(a): the pre-existing ix_client_identifier_promotions_open is UNTOUCHED and still NON-unique -- the new wall was ADDED, not grafted onto the ordering index", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select i.indisunique, pg_get_expr(i.indpred, i.indrelid) as pred,
            (select string_agg(a.attname, ',' order by k.ord)
               from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att) as cols
       from pg_index i where i.indexrelid = 'clara.ix_client_identifier_promotions_open'::regclass`);
  assert.equal(r.rows[0].indisunique, false, "0103's ordering index must stay non-unique");
  assert.equal(r.rows[0].cols, "firm_id,proposed_at");
  assert.equal(r.rows[0].pred, "(status = 'proposed'::text)");
});

// ===========================================================================
// PART D -- the two handlers are NARROW, proven BEHAVIOURALLY
// ===========================================================================
// Each cell installs a THROWAWAY partial unique index on the same table, drives a real
// collision against IT through the real door, and asserts the caller sees a RAW 23505 -- never
// this migration's already_open label. A body-text check could not tell a narrow handler from
// one that relabels every unique_violation on the table; this can. The probe index is dropped
// in a finally, so a failing assertion cannot leave it behind for the next file.

test("MBB-7(a) D1 NARROWNESS: an UNRELATED unique_violation on client_identifier_promotions surfaces as a raw 23505, never relabelled already_open", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const probe = "uq_rig_mbb7_probe_promotions";
  const rationale = `rig probe ${Date.now()}`;
  // The probe's predicate is pinned to THIS run's unique rationale, so the index covers only
  // the two rows this cell writes -- a bare `where status='proposed'` cannot even be built on
  // a rig where earlier cells already share a rationale.
  await rootQuery(
    `create unique index ${probe} on clara.client_identifier_promotions (rationale)
       where status = 'proposed' and rationale = '${rationale}'`);
  try {
    await proposeIdentifier(secret, {
      client: world.clients.A1, document: doc.documentId, value: `SSM7G1${Date.now()}`,
      citations: [citation], rationale,
    });
    // Different subject (so THIS migration's index is not involved), same rationale (so the
    // probe index is). MUTANT this discriminates: a handler that relabelled every
    // unique_violation would answer CLR10/already_open here.
    const err = await assertRaises(PG.uniqueViolation,
      () => proposeIdentifier(secret, {
        client: world.clients.A1, document: doc.documentId, value: `SSM7G2${Date.now()}`,
        citations: [citation], rationale, opKey: opk("mbb7d1-narrow"),
      }),
      "a collision on an UNRELATED unique index");
    assert.equal(err.constraint, probe, "the raw error still names the index that actually refused");
  } finally {
    await rootQuery(`drop index if exists clara.${probe}`);
  }
});

test("MBB-7(a) D2 NARROWNESS: an UNRELATED unique_violation on firm_open_questions surfaces as a raw 23505, never relabelled already_open", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const probe = "uq_rig_mbb7_probe_questions";
  const text = `rig probe question ${Date.now()}`;
  // Predicate pinned to THIS run's question text, for the same reason as the D1 twin above.
  await rootQuery(
    `create unique index ${probe} on clara.firm_open_questions (question_text)
       where status = 'open' and question_text = '${text}'`);
  try {
    await openFirmQuestion(secret, { document: doc.documentId, kind: "unattributed", question: text });
    const other = await freshDoc();
    const err = await assertRaises(PG.uniqueViolation,
      () => openFirmQuestion(secret, {
        document: other.documentId, kind: "unattributed", question: text, opKey: opk("mbb7d2-narrow"),
      }),
      "a collision on an UNRELATED unique index");
    assert.equal(err.constraint, probe, "the raw error still names the index that actually refused");
  } finally {
    await rootQuery(`drop index if exists clara.${probe}`);
  }
});
