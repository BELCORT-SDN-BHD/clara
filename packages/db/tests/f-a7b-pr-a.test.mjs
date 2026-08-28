// F-A7b PR-a -- the additive opener of the client-onboarding train. Design of record:
// docs/plan/active/fa7b-onboarding-design.md SS4 D-1/D-3/D-4, ruled at
// docs/plan/active/fa7b-gate-record.md (Q-D1 ALL-PROPOSE; Q-D4 ride firm_open_questions).
//
// Scope: D-1a (firm_open_questions.kind widened by 'onboarding_proposed'), D-1b
// (wake_propose_client_onboarding), D-3 (onboarding_plans' three provenance columns),
// D-4 (onboarding_agent_receipts + its shim, the eighth receipt-surface member).
//
// wake_propose_client_onboarding is JUDGEMENT LOGIC (review law 1): every refusal arm below is
// a wall the migration's own header names as built for adversarial probing, exercised through
// the real door, not asserted from outside.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, PG, ROLES, assertRaises, opk, rootQuery, roleQuery, human,
  wakeActor, runAs, namedCall, ensureReady, buildWorld, mintWake, endPool, getPool,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument, ensureFirmNarrowAttribution } from "./rig-docs-fixtures.mjs";

/** Run `fn` inside ONE transaction that is ALWAYS rolled back -- mirrors f-a7-pi.test.mjs's own
 *  helper of the same name. Used for adversarial probes that must leave no residue even if the
 *  wall under test is mutated away and the probe's INSERT unexpectedly succeeds (independent
 *  review F6 nit: a bare autocommitting rootQuery insert would otherwise persist the row and
 *  block restoring a tightened constraint later). */
async function inRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* the rollback is best-effort cleanup */ }
    client.release();
  }
}

let world;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select
       to_regprocedure('clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)') is not null as pra,
       to_regprocedure('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)') is not null as pi,
       to_regprocedure('clara.wake_file_document(uuid,uuid,jsonb,text,jsonb,uuid,text)') is not null as beta`,
  );
  const row = catalog.rows[0];
  if (!row.pra || !row.pi || !row.beta) {
    if (process.env.CLARA_ALLOW_MISSING_F_A7B_PR_A !== "1") {
      throw new Error(
        `f-a7b-pr-a premise missing (pra=${row.pra}, pi=${row.pi}, beta=${row.beta}) and ` +
        "CLARA_ALLOW_MISSING_F_A7B_PR_A is unset -- this is a FOCUSED run and must fail loudly, " +
        "not skip. Preload ./tests/f-a7b-pr-a-preintegration-gate.mjs for an estate-sweep run " +
        "against a pre-train chain.",
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
    t.skip("rig not ready: either ensureReady() found no draft_entry (estate-wide), or this PR's own catalog gate found wake_propose_client_onboarding / train pi / train beta absent");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });
const validBasis = (extra = {}) => ({
  sightings: 2,
  citations: [{ region: "invoice.customer_name", note: "printed party name" }],
  ...extra,
});

async function mintFiling(onBehalfOf = null) {
  return mintWake({ kind: "filing", firm: world.firms.A, onBehalfOf });
}

let _firmNarrowArmed = false;
async function ensureFirmNarrowActivated() {
  if (_firmNarrowArmed) return;
  await ensureFirmNarrowAttribution({ firm: world.firms.A });
  _firmNarrowArmed = true;
}

/** Mint a fresh, live firm-narrow dispatch authorization tied to `documentSha256`, moment
 *  'attribution', via the clara_runtime lane (prepare_firm_egress_dispatch's only grantee).
 *  Local copy of f-a7-beta-filing-verb.test.mjs's own private helper -- not exported there. */
async function freshAuthorization(documentSha256, moment = "attribution") {
  await ensureFirmNarrowActivated();
  const r = await roleQuery(
    ROLES.runtime,
    namedCall("prepare_firm_egress_dispatch", [
      { name: "p_firm" }, { name: "p_purpose" }, { name: "p_moment" }, { name: "p_event_seq", cast: "bigint" },
      { name: "p_event_type" }, { name: "p_document_sha256" },
    ]),
    [world.firms.A, "firm_narrow_intake", moment, 1, "document.ingested", documentSha256],
  );
  const result = r.rows[0].result;
  assert.equal(result.verdict, "granted", `prepare_firm_egress_dispatch did not grant: ${JSON.stringify(result)}`);
  return result.authorization_id;
}

/** Fabricate an ALREADY-EXPIRED but otherwise fully live/well-formed authorization for
 *  `documentSha256`, via a direct INSERT (root) rather than `prepare_firm_egress_dispatch`.
 *  Two reasons this can't go through the real mint path or a post-mint UPDATE: (1)
 *  prepare_firm_egress_dispatch's TTL is a hardcoded 120s constant, not caller-tunable, so
 *  nothing mints a short-lived one to wait out; (2) t_firm_egress_dispatch_authorizations_update
 *  (0123 S12) refuses ANY update that touches a column other than consumed_at/invalidated_at/
 *  invalidated_reason -- a first draft of this cell tried `update ... set expires_at = ...` and
 *  got the trigger's OWN CLR08 ("a dispatch authorization permits exactly one terminal
 *  transition"), not the conjunct under test. A direct INSERT is untouched by that guard (it
 *  only fires on UPDATE/DELETE) and lets every OTHER field -- firm, purpose, moment, the
 *  consent/activation FKs, the document's own sha256 -- be genuinely correct, isolating expiry
 *  as the one broken conjunct (independent review F6's own requirement: same document, so the
 *  sha-binding rung does not refuse first and mask it). */
async function mintExpiredAuthorization(documentSha256) {
  await ensureFirmNarrowActivated();
  const live = await rootQuery(
    `select a.id as activation_id, a.consent_id
       from clara.firm_egress_purpose_activations a
       join clara.firm_egress_purpose_consents c
         on c.id = a.consent_id and c.firm_id = a.firm_id and c.purpose = a.purpose and c.moment = a.moment
      where a.firm_id = $1 and a.purpose = 'firm_narrow_intake' and a.moment = 'attribution'
        and a.deactivated_at is null and c.revoked_at is null
      order by a.activated_at desc limit 1`,
    [world.firms.A]);
  assert.ok(live.rows[0], "setup: firm A holds a live firm-narrow 'attribution' activation");
  const { activation_id, consent_id } = live.rows[0];
  const r = await rootQuery(
    `insert into clara.firm_egress_dispatch_authorizations
       (firm_id, purpose, moment, consent_id, activation_id, event_seq, event_type,
        document_sha256, issued_at, expires_at)
       values ($1,'firm_narrow_intake','attribution',$2,$3,1,'document.ingested',$4,
               now() - interval '200 seconds', now() - interval '1 second')
       returning id`,
    [world.firms.A, consent_id, activation_id, documentSha256]);
  return r.rows[0].id;
}

/** Activate the firm-narrow 'onboarding_interview' moment too (for the wrong-moment adversarial
 *  cell) -- ONLY moment='attribution' is activated by the default fixture setup. */
let _interviewMomentArmed = false;
async function ensureOnboardingInterviewMomentActivated() {
  if (_interviewMomentArmed) return;
  const ownerRow = await rootQuery(
    `select user_id from clara.firm_memberships where firm_id=$1 and role='owner' and status='active' order by created_at limit 1`,
    [world.firms.A],
  );
  const owner = ownerRow.rows[0].user_id;
  const evidence = await seedVerifiedDocument({ firm: world.firms.A, grantClassifyConsent: false });
  await runAs(human(owner),
    "select clara.classify_consent_evidence_document(p_document => $1, p_reason => $2, p_op_key => $3) as r",
    [evidence.documentId, "rig fixture consent letter (F-A7b PR-a onboarding_interview moment)", opk("cce-oi")]);
  const grant = await runAs(human(owner),
    `select clara.grant_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'onboarding_interview',
       p_evidence_document => $1, p_scope_note => $2, p_op_key => $3) as r`,
    [evidence.documentId, "rig fixture onboarding_interview moment", opk("gfn-oi")]);
  const consentId = grant.rows[0].r.consent_id;
  await runAs(human(owner),
    `select clara.activate_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'onboarding_interview',
       p_consent => $1, p_op_key => $2) as r`,
    [consentId, opk("afn-oi")]);
  _interviewMomentArmed = true;
}
async function freshInterviewMomentAuthorization(documentSha256) {
  await ensureOnboardingInterviewMomentActivated();
  const r = await roleQuery(
    ROLES.runtime,
    namedCall("prepare_firm_egress_dispatch", [
      { name: "p_firm" }, { name: "p_purpose" }, { name: "p_moment" }, { name: "p_event_seq", cast: "bigint" },
      { name: "p_event_type" }, { name: "p_document_sha256" },
    ]),
    [world.firms.A, "firm_narrow_intake", "onboarding_interview", 1, "document.ingested", documentSha256],
  );
  const result = r.rows[0].result;
  assert.equal(result.verdict, "granted", `prepare_firm_egress_dispatch (onboarding_interview) did not grant: ${JSON.stringify(result)}`);
  return result.authorization_id;
}

/** Seeds two live counterparties sharing a name-family token, so clara.name_family_is_ambiguous
 *  is TRUE for the family name returned. Mirrors f-a7-beta-filing-verb.test.mjs's own
 *  seedNameFamilyCollision -- local copy, not exported there. */
async function seedNameFamilyCollision() {
  const family = `Acme${randomUUID().replace(/-/g, "").slice(0, 8)}`;
  await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
       values ($1,$2,'vendor',$3,$4,$5)`,
    [world.firms.A, world.clients.A1, `${family} Trading Sdn Bhd`, `${family.toLowerCase()}tradingsdnbhd`, world.users.alice],
  );
  await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
       values ($1,$2,'vendor',$3,$4,$5)`,
    [world.firms.A, world.clients.A2, `${family} Logistics Sdn Bhd`, `${family.toLowerCase()}logisticssdnbhd`, world.users.alice],
  );
  return `${family} Trading Sdn Bhd`;
}

/** clara.wake_propose_client_onboarding(...) via a filing wake credential. */
function wakeProposeClientOnboarding(secret, o) {
  const specs = [
    { name: "p_document" }, { name: "p_proposed_name" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" },
    { name: "p_op_key" },
  ];
  const vals = [
    o.document ?? null,
    // NOT "Rig ..." -- buildWorld() names every fixture client/firm with a shared "rig_..."
    // prefix (rig-fixtures.mjs), so a proposed name starting with that leading token collides
    // with world.clients.A1/A2 under clara.name_family_token and trips A14's own wall. A
    // genuinely distinct family avoids that false collision in every OTHER cell.
    "proposedName" in o ? o.proposedName : `Northgate ${randomUUID().slice(0, 8)} Sdn Bhd`,
    JSON.stringify("basis" in o ? o.basis : validBasis()),
    "rationale" in o ? o.rationale : "rig rationale: printed party name matches no known client",
    JSON.stringify("model" in o ? o.model : validModel()),
    o.authorization ?? null,
    o.opKey ?? opk("wpco"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_client_onboarding", specs), vals);
}

async function freshDoc() {
  return seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
}

// ===========================================================================
// 1 -- the happy path, end to end
// ===========================================================================
test("wake_propose_client_onboarding: happy path opens an 'onboarding_proposed' question with a receipt, surfaced via agent_receipts_visible", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const proposedName = `Newco ${randomUUID().slice(0, 8)} Sdn Bhd`;
  const r = await wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName, authorization });
  const result = r.rows[0].result;
  assert.ok(result.question_id, "returns a question_id");
  assert.ok(result.receipt_id, "returns a receipt_id");

  const q = await rootQuery("select * from clara.firm_open_questions where id=$1", [result.question_id]);
  assert.equal(q.rows[0].kind, "onboarding_proposed");
  assert.equal(q.rows[0].status, "open");
  assert.equal(q.rows[0].document_id, doc.documentId);
  assert.equal(q.rows[0].receipt_id, result.receipt_id);
  const candidates = q.rows[0].candidates;
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].proposed_name, proposedName);

  const receipt = await rootQuery("select * from clara.onboarding_agent_receipts where id=$1", [result.receipt_id]);
  assert.equal(receipt.rows[0].firm_id, world.firms.A);
  assert.equal(receipt.rows[0].document_id, doc.documentId);
  assert.equal(receipt.rows[0].client_id, null, "no client exists yet at proposal time");
  assert.equal(receipt.rows[0].via_wake_kind, "filing");
  assert.equal(receipt.rows[0].trigger_kind, "wake_task");
  assert.equal(receipt.rows[0].authorization_id, authorization);
  assert.deepEqual(receipt.rows[0].failing_rungs, [], "no ladder ran -- this verb never files");

  // The authorization was consumed by a genuinely fulfilled proposal.
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.ok(auth.rows[0].consumed_at, "authorization is consumed once genuinely fulfilled");

  // Surfaced through the one read surface, to a bookkeeper+ human, and nobody else.
  const visible = await runAs(human(world.users.alice),
    "select * from clara.agent_receipts_visible where receipt_id=$1", [String(result.receipt_id)]);
  assert.equal(visible.rowCount, 1, "the receipt is visible to a bookkeeper+ via agent_receipts_visible");
  assert.equal(visible.rows[0].receipt_kind, "onboarding_agent");
  assert.equal(visible.rows[0].scope, "firm");
  assert.equal(visible.rows[0].subject_id, doc.documentId);
});

test("wake_propose_client_onboarding: idempotent replay on the same op_key returns the same result, no duplicate rows", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const opKey = opk("wpco-idem");
  // A FIXED proposedName -- the helper's default randomizes a fresh name per call (so that
  // unrelated cells never collide on op_key), which would itself make two "replay" calls hash
  // differently. A genuine replay resends every hashed input, including the name, unchanged.
  const proposedName = `Northgate ${randomUUID().slice(0, 8)} Sdn Bhd`;
  const first = await wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName, authorization, opKey });
  const second = await wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName, authorization, opKey });
  assert.deepEqual(second.rows[0].result, first.rows[0].result, "replay returns the identical receipt");
  const n = await rootQuery("select count(*)::int n from clara.onboarding_agent_receipts where document_id=$1", [doc.documentId]);
  assert.equal(n.rows[0].n, 1, "exactly one receipt row, not two");
});

// ===========================================================================
// 2 -- Tier-A shape refusals
// ===========================================================================
test("wake_propose_client_onboarding: refuses a blank proposed_name", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName: "   ", authorization }),
    "blank proposed_name");
});

test("wake_propose_client_onboarding: refuses a proposed_name over 500 characters", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName: "X".repeat(501), authorization }),
    "over-long proposed_name");
});

test("wake_propose_client_onboarding: refuses a blank rationale", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, rationale: " ", authorization }),
    "blank rationale");
});

test("wake_propose_client_onboarding: refuses an incomplete model snapshot", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, model: { provider: "openai", model: "x" }, authorization }),
    "model missing version");
});

test("wake_propose_client_onboarding: refuses a document that does not exist", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: null, authorization: null }),
    "null document");
});

test("wake_propose_client_onboarding: refuses a document belonging to another firm (CLR11, no existence oracle)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const docB = await seedVerifiedDocument({ firm: world.firms.B, kind: "invoice" });
  await assertRaises(CLR.notFound,
    () => wakeProposeClientOnboarding(secret, { document: docB.documentId, authorization: null }),
    "cross-firm document");
});

// ===========================================================================
// 3 -- the evidentiary basis floor (review law 2: absence is not evidence)
// ===========================================================================
test("wake_propose_client_onboarding: refuses a non-object basis", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, basis: [], authorization }),
    "array basis, not an object");
});

test("wake_propose_client_onboarding: refuses a basis with zero citations", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, basis: { sightings: 2, citations: [] }, authorization }),
    "zero citations");
});

test("wake_propose_client_onboarding: refuses a basis with zero sightings", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, basis: { sightings: 0, citations: [{ note: "x" }] }, authorization }),
    "zero sightings");
});

test("wake_propose_client_onboarding: refuses a non-numeric sightings WITHOUT raising an untyped cast error (adversarial input)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const err = await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, basis: { sightings: "not-a-number", citations: [{ note: "x" }] }, authorization }),
    "non-numeric sightings");
  assert.notEqual(err.code, PG.invalidText, "must not surface as a raw 22P02 cast failure");
});

// ===========================================================================
// 4 -- A14, the negative acceptance step (name-family collision)
// ===========================================================================
test("wake_propose_client_onboarding: A14 -- refuses when the proposed name collides with an existing client/counterparty family", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const familyName = await seedNameFamilyCollision();
  const err = await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, proposedName: familyName, authorization }),
    "name-family collision");
  assert.match(err.detail ?? "", /name_family_collision/, "the refusal names the collision reason");
  const q = await rootQuery(
    "select count(*)::int n from clara.firm_open_questions where document_id=$1 and kind='onboarding_proposed'",
    [doc.documentId]);
  assert.equal(q.rows[0].n, 0, "no proposal question opens for a collided name");
});

// ===========================================================================
// 5 -- the duplicate-open-proposal wall
// ===========================================================================
test("wake_propose_client_onboarding: refuses a second open proposal on the same document (different op_key, different name)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const auth1 = await freshAuthorization(doc.sha256);
  await wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization: auth1 });
  const auth2 = await freshAuthorization(doc.sha256);
  const err = await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization: auth2 }),
    "second open proposal, same document");
  assert.match(err.detail ?? "", /already_open/, "the refusal names the already-open reason");
});

// ===========================================================================
// 6 -- the firm-narrow egress authorization wall
// ===========================================================================
test("wake_propose_client_onboarding: refuses with no authorization at all", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  await assertRaises("CLR28",
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization: null }),
    "no authorization");
});

test("wake_propose_client_onboarding: an authorization minted for a DIFFERENT document is refused and NOT consumed (stays live for its own document)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const docA = await freshDoc();
  const docB = await freshDoc();
  const authorization = await freshAuthorization(docA.sha256); // minted for A...
  await assertRaises("CLR28",
    () => wakeProposeClientOnboarding(secret, { document: docB.documentId, authorization }), // ...presented for B
    "wrong-document authorization");
  const row = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.equal(row.rows[0].consumed_at, null, "a mismatched authorization is NOT consumed, and stays live for its legitimate dispatch");
  // Proves it: the SAME authorization now succeeds against its real document.
  const r = await wakeProposeClientOnboarding(secret, { document: docA.documentId, authorization });
  assert.ok(r.rows[0].result.question_id, "the preserved authorization is still usable for its own document");
});

test("wake_propose_client_onboarding: refuses an already-consumed authorization (no double-spend)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  await wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization });
  const doc2 = await freshDoc();
  await assertRaises("CLR28",
    () => wakeProposeClientOnboarding(secret, { document: doc2.documentId, authorization }),
    "reused (already-consumed) authorization");
});

test("wake_propose_client_onboarding: refuses an authorization minted for the WRONG moment ('onboarding_interview', not 'attribution')", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshInterviewMomentAuthorization(doc.sha256);
  await assertRaises("CLR28",
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization }),
    "onboarding_interview-moment authorization presented to a proposal (which needs 'attribution')");
});

test("wake_propose_client_onboarding: refuses an authorization whose expires_at has genuinely passed -- the liveness conjunct is load-bearing, not `and true` (independent review F6)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  // A REAL, fabricated-expired authorization bound to THIS document's sha256 (mintExpiredAuthorization's
  // own header explains why a post-mint UPDATE cannot do this here) -- everything but expiry is
  // genuinely correct, so only the `expires_at > statement_timestamp()` conjunct can be what
  // refuses this call; mutating it into `and true` would flip this cell, and only this cell.
  const authorization = await mintExpiredAuthorization(doc.sha256);
  await assertRaises("CLR28",
    () => wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization }),
    "an authorization whose expiry has genuinely passed");
});

// ===========================================================================
// 7 -- ACL: clara_wake_filing only
// ===========================================================================
test("wake_propose_client_onboarding: refuses a non-filing wake credential at the GRANT layer (42501)", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  // 'proactive' is client-less (mintWake needs no active client for it) -- the point of this
  // cell is the GRANT layer, not any client-status fixture concern.
  const { secret } = await mintWake({ kind: "proactive", firm: world.firms.A });
  await assertRaises(PG.insufficientPrivilege,
    () => runAs(
      wakeActor("clara_wake_proactive", secret),
      namedCall("wake_propose_client_onboarding", [
        { name: "p_document" }, { name: "p_proposed_name" }, { name: "p_basis", cast: "jsonb" },
        { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" }, { name: "p_op_key" },
      ]),
      [doc.documentId, "Should Not Land Sdn Bhd", JSON.stringify(validBasis()), "x", JSON.stringify(validModel()), null, opk("x")],
    ),
    "proactive credential calling wake_propose_client_onboarding");
});

test("wake_propose_client_onboarding: a wrong-kind credential presented through the clara_wake_filing EXECUTOR role is refused by the BODY's own kind check (CLR03), not merely the grant layer (independent review F1)", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  // The cell above proves the ROLE-level wall (clara_wake_proactive holds no EXECUTE at all, so
  // Postgres refuses at 42501 before the function body ever runs -- it cannot tell "no grant"
  // apart from "grant exists but assert_wake_allowed refused"). This cell isolates the SECOND
  // wall: a 'proactive'-kind credential presented via clara_wake_filing (which DOES hold
  // EXECUTE). wake_context() resolves wake_kind from the CREDENTIAL's own secret, never from the
  // executing role, so the body must independently refuse this exact mismatch -- deleting the
  // `perform clara.assert_wake_allowed(...)` line would leave this cell (and only this cell)
  // green-to-red on a live rig, which is why it exists.
  const { secret } = await mintWake({ kind: "proactive", firm: world.firms.A });
  const err = await assertRaises("CLR03",
    () => runAs(
      wakeActor("clara_wake_filing", secret),
      namedCall("wake_propose_client_onboarding", [
        { name: "p_document" }, { name: "p_proposed_name" }, { name: "p_basis", cast: "jsonb" },
        { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" }, { name: "p_op_key" },
      ]),
      [doc.documentId, "Should Not Land Either Sdn Bhd", JSON.stringify(validBasis()), "x", JSON.stringify(validModel()), null, opk("x")],
    ),
    "a proactive-kind credential executed through clara_wake_filing's own grant");
  assert.match(err.message, /wake kind proactive may not call wake_propose_client_onboarding/,
    "the refusal is assert_wake_allowed's own message, naming the exact kind mismatch");
});

test("grant census: wake_propose_client_onboarding reachable by clara_wake_filing ONLY (not even clara_wake_interactive, unlike wake_file_document)", async (t) => {
  if (unready(t)) return;
  const sig = "clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)";
  const roles = ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive",
    "clara_wake_proactive", "clara_wake_bank", "clara_runtime", "clara_wake_filing"];
  for (const role of roles) {
    const r = await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, sig]);
    const expected = role === "clara_wake_filing";
    assert.equal(r.rows[0].ok, expected, `${role} EXECUTE on wake_propose_client_onboarding should be ${expected}`);
  }
});

// ===========================================================================
// 8 -- D-4 receipt-surface census (the eighth registered member)
// ===========================================================================
test("census: agent_receipt_surfaces carries the f_a7b row, shim_exists+wired+conforms+zero-dark", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery("select * from clara.agent_receipt_source_census() where item='f_a7b'");
  assert.equal(r.rowCount, 1);
  const row = r.rows[0];
  assert.equal(row.receipt_kind, "onboarding_agent");
  assert.equal(row.shim_relname, "_agent_receipt_src_f_a7b");
  assert.equal(row.shim_exists, true);
  assert.equal(row.wired, true);
  assert.equal(row.conforms, true);
  assert.equal(row.column_count, 19);
  assert.equal(Number(row.dark_rows), 0);
  const total = await rootQuery("select count(*)::int n from clara.agent_receipt_source_census()");
  assert.equal(total.rows[0].n, 8, "eight registered receipt-surface members after this PR");
});

test("census: onboarding_agent_receipts carries forced RLS, owner-only policy, zero app-role DML/table grants", async (t) => {
  if (unready(t)) return;
  const rls = await rootQuery(
    `select relrowsecurity, relforcerowsecurity from pg_class where oid='clara.onboarding_agent_receipts'::regclass`);
  assert.equal(rls.rows[0].relrowsecurity, true);
  assert.equal(rls.rows[0].relforcerowsecurity, true);
  const grants = await rootQuery(
    `select count(*)::int n from information_schema.role_table_grants
      where table_schema='clara' and table_name='onboarding_agent_receipts' and grantee<>'clara_fn_owner'`);
  assert.equal(grants.rows[0].n, 0, "no non-owner table grant on onboarding_agent_receipts");
});

test("census: onboarding_agent_receipts carries EXACTLY one RLS policy (owner-only) -- a pg_policy shape probe, distinct from the grant-count cell above (independent review F6)", async (t) => {
  if (unready(t)) return;
  const policies = await rootQuery(
    `select polname, polroles::regrole[]::text[] as roles, polcmd, polpermissive
       from pg_policy where polrelid='clara.onboarding_agent_receipts'::regclass`);
  // Zero non-owner GRANTs (the cell above) does not by itself prove there is no EXTRA permissive
  // policy sitting alongside the owner one -- a second policy naming clara_fn_owner again, or a
  // policy with a permissive USING(true) that some later grant could exploit, survives that
  // count untouched. This reads pg_policy directly.
  assert.equal(policies.rowCount, 1, "exactly one policy on onboarding_agent_receipts");
  const p = policies.rows[0];
  assert.equal(p.polname, "p_onboarding_agent_receipts_owner");
  assert.deepEqual(p.roles, ["clara_fn_owner"], "the sole policy's role is clara_fn_owner alone");
  assert.equal(p.polcmd, "*", "FOR ALL");
  assert.equal(p.polpermissive, true, "a permissive policy (the estate's universal owner-policy shape)");
});

// ===========================================================================
// 9 -- D-1a: the widened kind CHECK, both directions
// ===========================================================================
test("census: firm_open_questions.kind admits 'onboarding_proposed' and still refuses an unknown kind (both directions, live catalog)", async (t) => {
  if (unready(t)) return;
  const def = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.firm_open_questions'::regclass and conname='firm_open_questions_kind_check'`);
  assert.match(def.rows[0].def, /'onboarding_proposed'/, "the new value is admitted");
  for (const old of ["unattributed", "collision", "contradiction", "identity_document", "correction_proposed", "promotion_proposed"]) {
    assert.match(def.rows[0].def, new RegExp(`'${old}'`), `the pre-existing value ${old} still admitted`);
  }
  assert.doesNotMatch(def.rows[0].def, /'not_a_real_kind'/, "a garbage kind is not in the admitted set");
});

test("census: firm_open_questions.kind CHECK actually REFUSES a garbage value at INSERT time -- not merely absent from its printed text (independent review F6)", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  // The cell above only greps the constraint's own pg_get_constraintdef TEXT -- a definition
  // rewritten as `kind = ANY(ARRAY[...]) OR true` would still contain every expected substring
  // and still pass that cell while admitting anything. This is the behavioral companion: a real
  // INSERT attempt against the LIVE constraint. Run inside a rolled-back transaction
  // (independent review F6 nit): under a mutant that widens the CHECK away, this INSERT would
  // otherwise SUCCEED and COMMIT on a bare rootQuery call, leaving a permanent bad row that
  // could then block restoring the tightened constraint.
  await inRolledBackTx(async (client) => {
    await assert.rejects(
      () => client.query(
        `insert into clara.firm_open_questions(firm_id, document_id, kind, question_text, opened_by)
           values ($1,$2,'not_a_real_kind','rig bad-kind probe',$3)`,
        [world.firms.A, doc.documentId, world.users.alice]),
      (e) => e.code === PG.checkViolation,
      "a garbage kind value is refused by the live CHECK at insert time");
  });
});

// ===========================================================================
// 10 -- D-3: onboarding_plans' three provenance columns, shape + both honesty CHECKs
// ===========================================================================
test("census: onboarding_plans carries opened_by_agent/opener_model/opened_from_question with the right shape", async (t) => {
  if (unready(t)) return;
  const cols = await rootQuery(
    `select attname, format_type(atttypid, atttypmod) as type, attnotnull
       from pg_attribute where attrelid='clara.onboarding_plans'::regclass and attnum>0 and not attisdropped
       and attname in ('opened_by_agent','opener_model','opened_from_question') order by attname`);
  const byName = Object.fromEntries(cols.rows.map((r) => [r.attname, r]));
  assert.equal(byName.opened_by_agent.type, "boolean");
  assert.equal(byName.opened_by_agent.attnotnull, true);
  assert.equal(byName.opener_model.type, "text");
  assert.equal(byName.opener_model.attnotnull, false);
  assert.equal(byName.opened_from_question.type, "uuid");
  assert.equal(byName.opened_from_question.attnotnull, false);
});

test("census: onboarding_plans honesty CHECKs -- opened_from_question/opener_model may only be set when opened_by_agent is true (behavioral, direct catalog-level proof)", async (t) => {
  if (unready(t)) return;
  // No writer exists yet for these columns (D-2, PR-b, is not this PR's scope) -- proven
  // directly at the catalog, as root, mirroring this suite's own convention for pre-writer
  // shape proofs (e.g. seedHardIdentifierAnchor's raw inserts elsewhere in this package).
  const plan = await rootQuery(
    `select id from clara.onboarding_plans where firm_id=$1 and client_id=$2 limit 1`,
    [world.firms.A, world.clients.A1]);
  assert.ok(plan.rows[0], "setup: firm A / client A1 has an onboarding plan from buildWorld()");
  const planId = plan.rows[0].id;
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const { secret } = await mintFiling();
  const proposal = await wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization });
  const questionId = proposal.rows[0].result.question_id;

  await assert.rejects(
    () => rootQuery(`update clara.onboarding_plans set opened_from_question=$1 where id=$2`, [questionId, planId]),
    (e) => e.code === PG.checkViolation,
    "opened_from_question cannot be set while opened_by_agent stays false");
  await assert.rejects(
    () => rootQuery(`update clara.onboarding_plans set opener_model=$1 where id=$2`, ["gpt-5.6-terra", planId]),
    (e) => e.code === PG.checkViolation,
    "opener_model cannot be set while opened_by_agent stays false");
  // The honest combination succeeds.
  const ok = await rootQuery(
    `update clara.onboarding_plans set opened_by_agent=true, opener_model=$1, opened_from_question=$2 where id=$3 returning id`,
    ["gpt-5.6-terra", questionId, planId]);
  assert.equal(ok.rowCount, 1, "opened_by_agent=true with both provenance fields set succeeds");
  // Congruence FK: a question from a DIFFERENT firm is refused.
  const docB = await seedVerifiedDocument({ firm: world.firms.B });
  const otherFirmQ = await rootQuery(
    `insert into clara.firm_open_questions(firm_id, document_id, kind, question_text, opened_by)
       values ($1,$2,'unattributed','rig cross-firm probe',$3) returning id`,
    [world.firms.B, docB.documentId, world.users.dave]);
  await assert.rejects(
    () => rootQuery(`update clara.onboarding_plans set opened_from_question=$1 where id=$2`,
      [otherFirmQ.rows[0].id, planId]),
    (e) => e.code === PG.foreignKeyViolation,
    "a cross-firm question id is refused by the congruence FK");
});
