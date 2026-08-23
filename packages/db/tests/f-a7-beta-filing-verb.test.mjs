// F-A7 PR-4 (train beta) — the filing verb + the `filing` wake kind. Design of record:
// docs/plan/active/filing-and-interview-design.md v2 SS3.1-SS3.4 + annexes-1.md Annex A/B.
//
// HONEST SCOPE, narrower than annexes-1 Annex B's full cell list — read the migration file's
// own header (UNNUMBERED_f_a7_beta_filing_verb.sql) before assuming a missing cell is an
// oversight. Two trains this item's own design gates beta on (annexes-2 SSI.1: "gated on alpha
// and gamma merged") carry ZERO migration content anywhere as of this authoring session:
//   - TRAIN GAMMA (the egress purposes) is why Tier A rung A9 (the authorization admissibility
//     raise, CLR28) can NEVER pass here -- and because A9 sits in Tier A, ahead of Tier B, the
//     WHOLE Tier-B ladder (B1-B9, cells 8-21) is unreachable, not only the terminal write.
//   - TRAIN ALPHA (the constitutional recut) is why the ladder's write branch, and
//     wake_reattribute_document's actual retire-then-refile, both refuse with a typed
//     filing_write_not_installed CLR10 once every earlier rung has passed.
// Every cell below either proves something true regardless of both gaps, or is a named,
// counted `t.skip(...)` citing exactly which gap blocks it. No cell fakes a pass.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  ROLES,
  assertRaises,
  assertRaisesOneOf,
  opk,
  balanced,
  ROUTINE_CENTS,
  rootQuery,
  humanQuery,
  human,
  wakeActor,
  runAs,
  namedCall,
  ensureReady,
  buildWorld,
  mintWake,
  draftEntry,
  approveEntry,
  freshResolution,
  endPool,
} from "./rig-fixtures.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { seedVerifiedDocument, activeFilings } from "./rig-docs-fixtures.mjs";

let world;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a7-beta");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready (ensureReady() found no draft_entry) -- not this train's concern");
    return true;
  }
  return false;
}

/** Mint a `filing` wake credential for firm A and return { credentialId, secret }. */
async function mintFiling(onBehalfOf = null) {
  return mintWake({ kind: "filing", firm: world.firms.A, onBehalfOf });
}

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });

/** clara.wake_file_document(...) via a filing wake credential. */
async function wakeFileDocument(secret, o) {
  const specs = [
    { name: "p_document" }, { name: "p_client" }, { name: "p_verdict", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" },
    { name: "p_op_key" },
  ];
  const vals = [
    o.document, o.client ?? null, JSON.stringify(o.verdict ?? { citations: [] }),
    o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()),
    o.authorization ?? null, o.opKey ?? opk("wfd"),
  ];
  return runAs(wakeActor(ROLES.wakeFiling ?? "clara_wake_filing", secret), namedCall("wake_file_document", specs), vals);
}

async function wakeOpenFirmQuestion(secret, o) {
  const specs = [
    { name: "p_document" }, { name: "p_kind" }, { name: "p_question" },
    { name: "p_candidates", cast: "jsonb" }, { name: "p_rationale" },
    { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [
    o.document, o.kind ?? "unattributed", o.question ?? "rig question",
    JSON.stringify(o.candidates ?? []), o.rationale ?? "rig rationale",
    JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("wofq"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_open_firm_question", specs), vals);
}

async function wakeProposeIdentifierPromotion(secret, o) {
  const specs = [
    { name: "p_client" }, { name: "p_kind" }, { name: "p_value" }, { name: "p_sightings", cast: "int" },
    { name: "p_citations", cast: "jsonb" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_op_key" },
  ];
  const vals = [
    o.client, o.kind ?? "ssm", o.value, o.sightings ?? 1, JSON.stringify(o.citations ?? [{ note: "rig" }]),
    o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("wpip"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_identifier_promotion", specs), vals);
}

async function wakeReattributeDocument(secret, o) {
  const specs = [
    { name: "p_filing" }, { name: "p_expected_revision" }, { name: "p_to_client" },
    { name: "p_reason" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [
    o.filing, o.expectedRevision, o.toClient, o.reason ?? "rig reattribution",
    o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("wrd"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_reattribute_document", specs), vals);
}

async function wakeProposeFilingCorrection(secret, o) {
  const specs = [
    { name: "p_document" }, { name: "p_from_client" }, { name: "p_to_client" }, { name: "p_reason" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [
    o.document, o.fromClient, o.toClient, o.reason ?? "rig correction",
    o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("wpfc"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_filing_correction", specs), vals);
}

// ===========================================================================
// 1 — the `filing` wake kind and its allowlist
// ===========================================================================
test("filing kind: mints with client_id NULL; refuses with a client", async (t) => {
  if (unready(t)) return;
  const { credentialId } = await mintFiling();
  assert.ok(credentialId, "filing credential mints with no client");
  await assertRaises(
    CLR.badRequest,
    () => rootQuery(
      "select * from clara.mint_wake_credential(p_wake_kind => 'filing', p_firm => $1, p_client => $2)",
      [world.firms.A, world.clients.A1],
    ),
    "filing mint with a client",
  );
});

test("filing allowlist: closed world holds exactly the six provable rows (cell 40, corrected scope)", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery("select function_name from clara.wake_fn_allowlist where wake_kind='filing' order by 1");
  const got = r.rows.map((x) => x.function_name).sort();
  const expected = [
    "get_document_extract", "wake_file_document", "wake_open_firm_question",
    "wake_propose_filing_correction", "wake_propose_identifier_promotion", "wake_reattribute_document",
  ].sort();
  assert.deepEqual(got, expected, "filing allowlist rows 1-6 (row 7, wake_begin_client_onboarding, is F-A7b's)");
});

test("filing allowlist twin: a filing credential cannot call wake_draft_entry", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  // clara_wake_filing was never GRANTed EXECUTE on wake_draft_entry at all (SS9's ACL is
  // exhaustive), so Postgres refuses at the GRANT layer (42501) before wake_draft_entry's own
  // body-level assert_wake_allowed (CLR03) ever runs -- a STRONGER wall than the allowlist
  // alone, and the one actually in force here.
  await assertRaises(
    PG.insufficientPrivilege,
    () => runAs(
      wakeActor("clara_wake_filing", secret),
      namedCall("wake_draft_entry", [
        { name: "p_client" }, { name: "p_resolution" }, { name: "p_posting_date", cast: "date" },
        { name: "p_memo" }, { name: "p_lines", cast: "jsonb" }, { name: "p_books_version", cast: "bigint" },
        { name: "p_op_key" },
      ]),
      [world.clients.A1, null, "2026-01-15", "x", JSON.stringify([]), 0, opk("x")],
    ),
    "filing credential calling wake_draft_entry",
  );
});

test("grant census: wake_file_document reachable by clara_wake_filing + clara_wake_interactive only; the core is ungranted", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select g.grantee from information_schema.role_routine_grants g
      where g.routine_schema='clara' and g.specific_name like 'wake_file_document%' and g.privilege_type='EXECUTE'
        and g.grantee <> 'clara_fn_owner'
      order by 1`,
  );
  assert.deepEqual(r.rows.map((x) => x.grantee).sort(), ["clara_wake_filing", "clara_wake_interactive"].sort());
  const core = await rootQuery(
    `select count(*)::int as n from information_schema.role_routine_grants g
      where g.specific_name like '_agent_file_document_core%' and g.grantee <> 'clara_fn_owner'`,
  );
  assert.equal(core.rows[0].n, 0, "_agent_file_document_core holds zero APP-ROLE grants (the owner's implicit grant is not one)");
});

// ===========================================================================
// 2 — wake_file_document, Tier A (the rungs ahead of A9 -- everything past A9,
//     including the entire Tier-B ladder, is UNREACHABLE without train gamma; see header)
// ===========================================================================
test("wake_file_document Tier A: no wake credential -> CLR03", async (t) => {
  if (unready(t)) return;
  await assertRaises(
    CLR.wake,
    () => runAs(
      wakeActor("clara_wake_filing", "not-a-real-secret"),
      namedCall("wake_file_document", [
        { name: "p_document" }, { name: "p_client" }, { name: "p_verdict", cast: "jsonb" },
        { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" }, { name: "p_op_key" },
      ]),
      [randomUUID(), null, JSON.stringify({ citations: [] }), "r", JSON.stringify(validModel()), null, opk("x")],
    ),
    "no valid wake credential",
  );
});

test("wake_file_document Tier A: a credential of a kind with no allowlist row -> CLR03 (CB)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintWake({ kind: "proactive", firm: world.firms.A });
  await assertRaises(
    CLR.wake,
    () => wakeFileDocument(secret, { document: randomUUID() }),
    "proactive credential calling wake_file_document",
  );
});

test("wake_file_document Tier A: document in another firm -> CLR11 (CB)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.B });
  await assertRaises(
    CLR.notFound,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1 }),
    "cross-firm document",
  );
});

test("wake_file_document Tier A: target client not in the credential's firm -> CLR11", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  await assertRaises(
    CLR.notFound,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.B1 }),
    "cross-firm client",
  );
});

test("wake_file_document Tier A: document already actively filed to the target client -> CLR10, no second filing row", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  const before = await activeFilings(doc.documentId);
  await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1 }),
    "already actively filed",
  );
  const after2 = await activeFilings(doc.documentId);
  assert.equal(after2.length, before.length, "no second filing row was created");
});

test("wake_file_document Tier A: blank rationale / incomplete model -> CLR10, and op_receipts gained no row", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const key1 = opk("blank-rationale");
  await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, rationale: "", opKey: key1 }),
    "blank rationale",
  );
  let n = await rootQuery("select count(*)::int as n from clara.op_receipts where op_key=$1", [key1]);
  assert.equal(n.rows[0].n, 0, "no op_receipts row for the blank-rationale attempt");

  const key2 = opk("incomplete-model");
  await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, {
      document: doc.documentId, client: world.clients.A1, model: { provider: "openai" }, opKey: key2,
    }),
    "incomplete model",
  );
  n = await rootQuery("select count(*)::int as n from clara.op_receipts where op_key=$1", [key2]);
  assert.equal(n.rows[0].n, 0, "no op_receipts row for the incomplete-model attempt");
});

test("wake_file_document Tier A: a verdict with no citations ARRAY key is malformed shape -> CLR10", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, verdict: { note: "no citations key at all" } }),
    "verdict missing citations array",
  );
});

test("wake_file_document Tier A rung A9: null authorization -> CLR28 (CB)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const err = await assertRaisesOneOf(
    ["CLR28"],
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, authorization: null }),
    "null authorization",
  );
  assert.ok(err, "CLR28 raised");
});

test("wake_file_document Tier A rung A9: a foreign/nonexistent authorization -> CLR28 (CB); train gamma's absence makes this HONESTLY unsatisfiable in the positive direction", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  await assertRaisesOneOf(
    ["CLR28"],
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, authorization: randomUUID() }),
    "foreign authorization",
  );
  // Named, counted skip -- the entire Tier-B ladder (cells 8-21) and the write branch cannot
  // be exercised on this rig: rung A9 always raises CLR28 because
  // clara.firm_egress_dispatch_authorizations does not exist (train gamma has not landed).
  t.skip("Tier B (B1-B9, cells 8-21) and the write branch: BLOCKED, train gamma absent (Tier A rung A9 raises CLR28 before Tier B ever evaluates) and train alpha absent (the write delegate). Re-run once both land.");
});

// ===========================================================================
// 3 — wake_open_firm_question (no authorization param; not gated by gamma at all)
// ===========================================================================
test("wake_open_firm_question: full success -- receipt + firm_open_questions row exist", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const r = await wakeOpenFirmQuestion(secret, { document: doc.documentId, kind: "unattributed", question: "who owns this?" });
  const result = r.rows[0].result;
  assert.ok(result.question_id, "question_id returned");
  assert.ok(result.receipt_id, "receipt_id returned");
  const q = await rootQuery("select kind, status, document_id, receipt_id from clara.firm_open_questions where id=$1", [result.question_id]);
  assert.equal(q.rows[0].kind, "unattributed");
  assert.equal(q.rows[0].status, "open");
  assert.equal(q.rows[0].document_id, doc.documentId);
  // The link is the OTHER direction (agent_filing_receipts stays purely insert-only, no
  // question_id column to update -- this file's header explains why): the question names its
  // receipt, not the reverse.
  assert.equal(q.rows[0].receipt_id, result.receipt_id.toString());
  const rec = await rootQuery("select via_wake_kind, trigger_kind from clara.agent_filing_receipts where id=$1", [result.receipt_id]);
  assert.equal(rec.rows[0].via_wake_kind, "filing");
  assert.equal(rec.rows[0].trigger_kind, "wake_task");
});

test("wake_open_firm_question: blank rationale -> CLR10", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  await assertRaises(
    CLR.badRequest,
    () => wakeOpenFirmQuestion(secret, { document: doc.documentId, rationale: "" }),
    "blank rationale",
  );
});

// ===========================================================================
// 4 — wake_propose_identifier_promotion (no authorization param)
// ===========================================================================
test("wake_propose_identifier_promotion: writes a promotion card, zero client_identifiers rows (B9's spirit)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const before = await rootQuery("select count(*)::int as n from clara.client_identifiers where client_id=$1", [world.clients.A1]);
  const r = await wakeProposeIdentifierPromotion(secret, { client: world.clients.A1, kind: "ssm", value: `SSM${Date.now()}` });
  assert.ok(r.rows[0].result.promotion_id, "promotion_id returned");
  const after2 = await rootQuery("select count(*)::int as n from clara.client_identifiers where client_id=$1", [world.clients.A1]);
  assert.equal(after2.rows[0].n, before.rows[0].n, "no client_identifiers row written by the proposal itself");
  const card = await rootQuery("select status from clara.client_identifier_promotions where id=$1", [r.rows[0].result.promotion_id]);
  assert.equal(card.rows[0].status, "proposed");
});

// ===========================================================================
// 5 — wake_reattribute_document (no authorization param; refusal path fully provable,
//     the actual retire+refile is alpha-gated -- see header)
// ===========================================================================
test("wake_reattribute_document: a live (approved, unreversed) citation refuses BEFORE any retire is visible -- reattribution_blocked_by_citation", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  const filingRow = (await activeFilings(doc.documentId))[0];
  assert.ok(filingRow, "filing exists");
  const lines = balanced(world.coa.A1, ROUTINE_CENTS);
  const res = await freshResolution(world.users.bob, world.clients.A1, { subjectKind: "document", subjectId: doc.documentId });
  const entry = await draftEntry(human(world.users.bob), {
    client: world.clients.A1, resolution: res, document: doc.documentId, sha256: doc.sha256, lines, opKey: opk("de"),
  });
  await approveEntry(world.users.bob, { entry: entry.entry_id, expectedRevision: entry.revision_token, opKey: opk("ae") });

  const revRow = await rootQuery("select revision_token from clara.document_filings where id=$1", [filingRow.id]);
  const err = await assertRaises(
    CLR.badRequest,
    () => wakeReattributeDocument(secret, {
      filing: filingRow.id, expectedRevision: revRow.rows[0].revision_token, toClient: world.clients.A2,
    }),
    "posted citation blocks unposted reattribution",
  );
  assert.equal(err.detail && JSON.parse(err.detail).reason, "reattribution_blocked_by_citation");
  const stillActive = await activeFilings(doc.documentId);
  assert.equal(stillActive.length, 1, "the filing was NOT retired -- the refusal precedes any write");
});

test("wake_reattribute_document: no live citation -> passes the citation guard, then refuses at the alpha-gated refile (retire rolls back too)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  const filingRow = (await activeFilings(doc.documentId))[0];
  const err = await assertRaises(
    CLR.badRequest,
    () => wakeReattributeDocument(secret, {
      filing: filingRow.id, expectedRevision: filingRow.revision_token, toClient: world.clients.A2,
    }),
    "no citation, but alpha's write delegate is absent",
  );
  assert.equal(err.detail && JSON.parse(err.detail).reason, "filing_write_not_installed");
  const stillActive = await activeFilings(doc.documentId);
  assert.equal(stillActive.length, 1, "the retire rolled back with the rest of the transaction -- no half-corrected filing");
});

// ===========================================================================
// 6 — wake_propose_filing_correction (no authorization param; the propose half is fully
//     provable; the human-approval side is provable only for a human-attributed destination --
//     see the named skip below for the judged-destination gap alpha alone unblocks)
// ===========================================================================
test("wake_propose_filing_correction: full propose -- filing_corrections + receipt + firm question + egress.misrouted event", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  // The destination client needs its OWN human/rule attribution on THIS document for the
  // two-value destination-authority check (duplicated from propose_wrong_client_correction's
  // live predicate) to admit the proposal.
  await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'human','{}'::jsonb)`,
    [world.firms.A, world.clients.A2, doc.documentId],
  );
  const r = await wakeProposeFilingCorrection(secret, {
    document: doc.documentId, fromClient: world.clients.A1, toClient: world.clients.A2,
  });
  const result = r.rows[0].result;
  assert.ok(result.correction_id, "correction_id returned");
  assert.equal(result.status, "proposed");
  const c = await rootQuery("select maker, status, from_client, to_client from clara.filing_corrections where id=$1", [result.correction_id]);
  assert.equal(c.rows[0].maker, "00000000-0000-4000-8000-000000c1a7a0", "maker = agent_user_id()");
  assert.equal(c.rows[0].status, "proposed");
  const q = await rootQuery("select kind from clara.firm_open_questions where id=$1", [result.question_id]);
  assert.equal(q.rows[0].kind, "correction_proposed");
  const ev = await rootQuery(
    "select 1 from clara.domain_events where firm_id=$1 and event_type='egress.misrouted' and document_id=$2",
    [world.firms.A, doc.documentId],
  );
  assert.equal(ev.rowCount, 1, "egress.misrouted event exists");

  // CORRECTED FROM A FIRST-DRAFT ASSUMPTION, measured on this train's own rig: cell 61's
  // inverted twin (approve_wrong_client_correction's two-value predicate at 0027:268 raising
  // CLR01 pre-alpha) needs the DESTINATION client's authoritative resolution to be a JUDGED one
  // -- the exact thing that cannot exist without train alpha's fourth method value. THIS
  // fixture's destination resolution is 'human' (line above), which the CURRENT, unextended
  // predicate already admits fine, so the human approval below correctly SUCCEEDS -- proving
  // the wake sibling's proposal is fully compatible with a human-only approval chain when the
  // destination is human-attributed. Cell 61's actual gap (a judged destination) is a named,
  // counted skip: it cannot be constructed on this rig without alpha.
  const preview = await rootQuery(
    "select plan_hash from clara.filing_corrections where id=$1",
    [result.correction_id],
  );
  const approved = await runAs(
    human(world.users.alice),
    namedCall("approve_wrong_client_correction", [
      { name: "p_correction" }, { name: "p_plan_hash" }, { name: "p_attestation" }, { name: "p_op_key" },
    ]),
    [result.correction_id, preview.rows[0].plan_hash, null, opk("approve")],
  );
  assert.ok(approved.rows[0].result, "human approval succeeds when the destination resolution is human-attributed");
  t.skip("cell 61's actual gap (approve_wrong_client_correction raising CLR01 pre-alpha because the DESTINATION resolution is judged): BLOCKED, train alpha absent -- a judged resolution cannot be constructed without alpha's fourth method value, so this specific fixture cannot exist yet. Re-run once alpha lands.");
});

test("wake_propose_filing_correction: destination client with no authoritative attribution -> CLR01", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  await assertRaises(
    CLR.client,
    () => wakeProposeFilingCorrection(secret, { document: doc.documentId, fromClient: world.clients.A1, toClient: world.clients.A2 }),
    "destination client attribution is not authoritative",
  );
});

// ===========================================================================
// 7 — Tier C triggers: existence + shape proven (re-derived independently of the migration's
//     own tail); their FIRING behavior needs train alpha's CHECK extension (cell 58/59, named skip)
// ===========================================================================
test("Tier C: both triggers exist on document_filings, DEFERRABLE INITIALLY DEFERRED, and their negative-set scope is currently vacuous", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    `select t.tgname, t.tgdeferrable, t.tginitdeferred from pg_trigger t
      where t.tgrelid = 'clara.document_filings'::regclass
        and t.tgname in ('t_document_filings_agent_congruence','t_document_filings_agent_receipt')
      order by 1`,
  );
  assert.equal(r.rowCount, 2);
  for (const row of r.rows) {
    assert.equal(row.tgdeferrable, true, `${row.tgname} is deferrable`);
    assert.equal(row.tginitdeferred, true, `${row.tgname} is initially deferred`);
  }
  const vacuous = await rootQuery(
    "select count(*)::int as n from clara.document_filings where basis <> all (array['legacy-0007','human','rule','correction','seed-0007'])",
  );
  assert.equal(vacuous.rows[0].n, 0, "no document_filings row carries a basis outside the five known values yet");
  t.skip("cells 58/59 (the triggers actually admitting a fourth-method row / refusing method=agent at the trigger): BLOCKED, train alpha absent -- document_filings_basis_check itself only admits the five known values today, so no row outside them can even be INSERTED to exercise the trigger's firing behavior. Re-run once alpha's CHECK extension lands.");
});

// ===========================================================================
// 8 — receipts view integration (pi's contract)
// ===========================================================================
test("agent_receipts_visible: a firm-question receipt is visible to a bookkeeper of the SAME firm, invisible to another firm's", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const r = await wakeOpenFirmQuestion(secret, { document: doc.documentId });
  const receiptId = r.rows[0].result.receipt_id;
  const own = await humanQuery(world.users.bob, "select count(*)::int as n from clara.agent_receipts_visible where receipt_id=$1", [receiptId]);
  assert.equal(own.rows[0].n, 1, "firm A's bookkeeper sees the receipt");
  const other = await humanQuery(world.users.dave, "select count(*)::int as n from clara.agent_receipts_visible where receipt_id=$1", [receiptId]);
  assert.equal(other.rows[0].n, 0, "firm B's owner does not see firm A's receipt");
});
