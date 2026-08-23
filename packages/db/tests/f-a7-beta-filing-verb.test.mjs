// F-A7 PR-4 (train beta) — the filing verb + the `filing` wake kind. Design of record:
// docs/plan/active/filing-and-interview-design.md v2 SS3.1-SS3.4 + annexes-1.md Annex A/B.
//
// Trains alpha (the constitutional recut) and gamma (the egress purposes) are now staged in
// this train's rig chain (conductor ruling 2026-08-24) -- the write branch, the full Tier-B
// ladder, and wake_reattribute_document's actual refile are all REACHABLE and exercised below.
// STILL NOT built here, and not this file's to build: Annex B cell 6's true "a live gamma table
// with a genuinely foreign authorization id" branch is covered; a handful of Tier-B twins
// (the exhaustive B1..B9 pair matrix) are represented by ONE end-to-end success cell plus the
// specific rungs an independent review flagged, not every cell in Annex B 8-21 individually --
// named, not silently short. B6 (attribution_cross_firm) stays a named, counted skip: it is
// PROVABLY UNREACHABLE on the live schema regardless of alpha/gamma (see the migration's own
// B6 comment, M-2 on independent review) and Annex A.2's own law 31 says an unreachable rung is
// not force-tested, its argument lives in the decision register.
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
  roleQuery,
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
  // A REAL catalog gate for THIS train's own objects, not just the estate-wide draft_entry
  // check ensureReady() already did. This file's migration is UNNUMBERED (packages/db/README.md
  // "Migration numbers are claimed at MERGE time") and depends on train pi's objects too (not
  // yet on `main` as of this authoring session) -- on any chain where either has not landed,
  // fail LOUDLY and NAME what is missing, rather than let 22 cells hard-fail one-by-one on
  // "bad wake_kind" / "function does not exist" with no single diagnosis.
  const catalog = await rootQuery(
    `select
       to_regprocedure('clara.wake_file_document(uuid,uuid,jsonb,text,jsonb,uuid,text)') is not null as beta,
       to_regprocedure('clara._firm_question_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,text)') is not null as pi`,
  );
  if (!catalog.rows[0].beta || !catalog.rows[0].pi) {
    ready = false;
    return;
  }
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a7-beta");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: either ensureReady() found no draft_entry (estate-wide), or this train's own catalog gate found wake_file_document / train pi's _firm_question_core absent -- this file's migration and/or train pi have not been staged on this chain");
    return true;
  }
  return false;
}

/** Mint a `filing` wake credential for firm A and return { credentialId, secret }. */
async function mintFiling(onBehalfOf = null) {
  return mintWake({ kind: "filing", firm: world.firms.A, onBehalfOf });
}

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });

let firmNarrowActivated = false;
/** One-time, per-firm: grant + activate the firm-narrow `attribution` moment for firm A as its
 *  owner (alice). `uq_firm_egress_purpose_consents_one_live` means this can only happen ONCE
 *  per (firm, purpose, moment) -- callers share this activation and mint their own fresh
 *  dispatch authorization via freshAuthorization() below. */
async function ensureFirmNarrowActivated() {
  if (firmNarrowActivated) return;
  const evidence = await seedVerifiedDocument({ firm: world.firms.A, kind: "consent_evidence" });
  const grant = await runAs(
    human(world.users.alice),
    namedCall("grant_firm_egress_purpose", [
      { name: "p_purpose" }, { name: "p_moment" }, { name: "p_evidence_document" },
      { name: "p_scope_note" }, { name: "p_op_key" },
    ]),
    ["firm_narrow_intake", "attribution", evidence.documentId, "rig test consent", opk("gfep")],
  );
  const consentId = grant.rows[0].result.consent_id;
  await runAs(
    human(world.users.alice),
    namedCall("activate_firm_egress_purpose", [
      { name: "p_purpose" }, { name: "p_moment" }, { name: "p_consent" }, { name: "p_op_key" },
    ]),
    ["firm_narrow_intake", "attribution", consentId, opk("afep")],
  );
  firmNarrowActivated = true;
}

/** Mint a fresh, live firm-narrow dispatch authorization tied to `documentSha256`, via the
 *  clara_runtime lane (prepare_firm_egress_dispatch's only grantee). */
async function freshAuthorization(documentSha256) {
  await ensureFirmNarrowActivated();
  const r = await roleQuery(
    ROLES.runtime,
    namedCall("prepare_firm_egress_dispatch", [
      { name: "p_firm" }, { name: "p_purpose" }, { name: "p_moment" }, { name: "p_event_seq", cast: "bigint" },
      { name: "p_event_type" }, { name: "p_document_sha256" },
    ]),
    [world.firms.A, "firm_narrow_intake", "attribution", 1, "document.ingested", documentSha256],
  );
  const result = r.rows[0].result;
  assert.equal(result.verdict, "granted", `prepare_firm_egress_dispatch did not grant: ${JSON.stringify(result)}`);
  return result.authorization_id;
}

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

test("wake_file_document Tier A rung A9 / Annex B cell 6: a foreign/nonexistent authorization -> CLR28, gamma's real branch this time", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  // Gamma is now staged: a randomUUID() authorization resolves NO row in the real
  // firm_egress_dispatch_authorizations table, so this now exercises cell 6's OWN branch
  // (`v_auth.id is null`), not the gamma-not-installed guard -- detail.class is absent (that
  // field only appears on the gamma_not_installed / gamma_shape_mismatch branches).
  const err = await assertRaisesOneOf(
    ["CLR28"],
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, authorization: randomUUID() }),
    "foreign authorization",
  );
  const detail = JSON.parse(err.detail);
  assert.equal(detail.reason, "no_live_egress_authorization");
  assert.equal(detail.class, undefined, "cell 6's own branch, not the gamma-not-installed guard");
});

test("wake_file_document: FULL END-TO-END SUCCESS -- a live authorization + a well-cited verdict files, mints a judgement resolution, and consumes the authorization", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const region = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'test:engine','llm_text_facts',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  const extractionId = region.rows[0].id;
  const regionRow = await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,'party_name','ROME PROPERTIES',0.97) returning id`,
    [world.firms.A, extractionId],
  );
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { matched_name: "ROME PROPERTIES", citations: [{ region_id: regionRow.rows[0].id }] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, true, `expected filed=true, got ${JSON.stringify(result)}`);
  assert.ok(result.filing_id, "filing_id returned");
  const filing = await rootQuery("select basis, resolution_id from clara.document_filings where id=$1", [result.filing_id]);
  assert.equal(filing.rows[0].basis, "judgement");
  const resolution = await rootQuery("select method, confidence from clara.client_resolutions where id=$1", [filing.rows[0].resolution_id]);
  assert.equal(resolution.rows[0].method, "judgement");
  assert.equal(Number(resolution.rows[0].confidence), 1.0, "D-2: confidence pinned 1.0 regardless of the model's own stated number");
  const receipt = await rootQuery("select filing_id, failing_rungs, authorization_id from clara.agent_filing_receipts where id=$1", [result.receipt_id]);
  assert.equal(receipt.rows[0].filing_id, result.filing_id);
  assert.deepEqual(receipt.rows[0].failing_rungs, []);
  assert.equal(receipt.rows[0].authorization_id, authorization);
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.ok(auth.rows[0].consumed_at, "the authorization was consumed");
});

test("wake_file_document Tier B: a verdict citing zero identifiers/name-family/regions refuses attribution_no_basis (B3), and the authorization is STILL consumed", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_no_basis"), JSON.stringify(result.failing_rungs));
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.ok(auth.rows[0].consumed_at, "consumed even on refusal -- the authorization produced this verdict either way");
});

test("wake_file_document Tier B: an identity_document is refused with attribution_identity_document (B8, now reachable -- gamma landed)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "identity_document" });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  assert.ok(r.rows[0].result.failing_rungs.includes("attribution_identity_document"), JSON.stringify(r.rows[0].result.failing_rungs));
});

test("wake_file_document Tier B7: an authorization minted for a DIFFERENT document refuses attribution_purpose_mismatch, AND -- the B-1 fix, proven -- the authorization stays LIVE (not consumed)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const docA = await seedVerifiedDocument({ firm: world.firms.A });
  const docB = await seedVerifiedDocument({ firm: world.firms.A });
  const authorization = await freshAuthorization(docA.sha256); // minted for A...
  const r = await wakeFileDocument(secret, {
    document: docB.documentId, client: world.clients.A1, authorization, // ...presented for B
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.ok(result.failing_rungs.includes("attribution_purpose_mismatch"), JSON.stringify(result.failing_rungs));
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.equal(auth.rows[0].consumed_at, null, "B-1 on independent review: a mis-bound authorization is NOT consumed and stays live for its real dispatch (docA)");
  // Proof it really is still live: the SAME authorization now files docA correctly.
  const r2 = await wakeFileDocument(secret, {
    document: docA.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  assert.ok(r2.rows[0].result.failing_rungs.includes("attribution_no_basis"), "the authorization was still live and usable for its real document");
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

test("wake_reattribute_document: no live citation -> FULL SUCCESS -- retires the old filing and refiles to the new client under a fresh judgement resolution", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  const filingRow = (await activeFilings(doc.documentId))[0];
  const r = await wakeReattributeDocument(secret, {
    filing: filingRow.id, expectedRevision: filingRow.revision_token, toClient: world.clients.A2,
  });
  const result = r.rows[0].result;
  assert.equal(result.retired_filing_id, filingRow.id);
  assert.ok(result.filing_id, "a new filing was minted");
  assert.notEqual(result.filing_id, filingRow.id);

  const oldFilingRow = await rootQuery("select retired_at from clara.document_filings where id=$1", [filingRow.id]);
  assert.ok(oldFilingRow.rows[0].retired_at, "the old filing is retired");
  const newFiling = await rootQuery("select client_id, basis, resolution_id from clara.document_filings where id=$1", [result.filing_id]);
  assert.equal(newFiling.rows[0].client_id, world.clients.A2);
  assert.equal(newFiling.rows[0].basis, "judgement");
  const activeNow = await activeFilings(doc.documentId);
  assert.equal(activeNow.length, 1, "exactly one ACTIVE filing after the reattribution");
  assert.equal(activeNow[0].id, result.filing_id);

  const receipt = await rootQuery("select filing_id, authorization_id from clara.agent_filing_receipts where id=$1", [result.receipt_id]);
  assert.equal(receipt.rows[0].filing_id, result.filing_id);
  assert.equal(receipt.rows[0].authorization_id, null, "wake_reattribute_document carries no p_authorization param -- honestly NULL, not gamma-gated");
  const misrouted = await rootQuery(
    "select 1 from clara.domain_events where firm_id=$1 and event_type='egress.misrouted' and document_id=$2",
    [world.firms.A, doc.documentId],
  );
  assert.equal(misrouted.rowCount, 1, "M-8 on independent review: the unposted arm now emits egress.misrouted too");
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

  // A human-attributed destination approves fine (the CURRENT, and now the alpha-extended,
  // predicate both admit method='human') -- proving the wake sibling's proposal is fully
  // compatible with a human-only approval chain.
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
});

test("wake_propose_filing_correction: cell 61's ACTUAL gap -- a JUDGED destination resolution now proposes AND approves cleanly (alpha2's live extension of approve_wrong_client_correction at 0027:268)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1 });
  // The destination's ONLY authoritative resolution is method='judgement' -- unbuildable before
  // alpha landed; this is the fixture cell 61 could not construct until now.
  await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'judgement','{}'::jsonb)`,
    [world.firms.A, world.clients.A2, doc.documentId],
  );
  const r = await wakeProposeFilingCorrection(secret, {
    document: doc.documentId, fromClient: world.clients.A1, toClient: world.clients.A2,
  });
  const result = r.rows[0].result;
  assert.equal(result.status, "proposed", "the proposal itself succeeds -- its own duplicated check now admits judgement too");
  const preview = await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [result.correction_id]);
  const approved = await runAs(
    human(world.users.alice),
    namedCall("approve_wrong_client_correction", [
      { name: "p_correction" }, { name: "p_plan_hash" }, { name: "p_attestation" }, { name: "p_op_key" },
    ]),
    [result.correction_id, preview.rows[0].plan_hash, null, opk("approve")],
  );
  assert.ok(approved.rows[0].result, "human approval succeeds against a JUDGED destination resolution -- cell 61, proven for real");
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
// 7 — Tier C triggers: shape proven independently of the migration's own tail, AND their
//     FIRING behavior (cells 58/59), now buildable since alpha's CHECK extension landed.
// ===========================================================================
test("Tier C: both triggers exist on document_filings, DEFERRABLE INITIALLY DEFERRED", async (t) => {
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
});

test("Tier C cell 58 twin / receipt-existence trigger: a RAW judged filing with NO agent_filing_receipts row refuses at COMMIT", async (t) => {
  if (unready(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const res = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'judgement','{}'::jsonb) returning id`,
    [world.firms.A, world.clients.A1, doc.documentId],
  );
  // A raw, single-statement probe (bypassing every wake wrapper): rootQuery's implicit
  // autocommit fires the DEFERRABLE INITIALLY DEFERRED trigger right after this one INSERT,
  // which is the same "COMMIT is the judge" property the design names. No agent_filing_receipts
  // row exists for this filing -- the receipt-existence trigger must refuse. Message asserted,
  // not just SQLSTATE (M-2 on independent review): three different raisers in this file's reach
  // share CLR01, so the code alone cannot distinguish which one actually fired.
  const err = await assertRaises(
    CLR.client,
    () => rootQuery(
      `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
         values ($1,$2,$3,$4,$5,'judgement')`,
      [world.firms.A, doc.documentId, world.clients.A1, "00000000-0000-4000-8000-000000c1a7a0", res.rows[0].id],
    ),
    "a judged filing with no receipt refuses at (implicit) COMMIT",
  );
  assert.match(err.message, /clean agent_filing_receipts row/, "the RECEIPT trigger specifically fired");
});

test("document_filings INSERT congruence: a judged filing whose resolution names a DIFFERENT client refuses BEFORE INSERT (the PRE-EXISTING stamp trigger, alpha2's own CoR -- this train's own t_document_filings_agent_congruence is a defense-in-depth twin, see its migration comment for why it cannot itself be reached on the live schema)", async (t) => {
  if (unready(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  // CORRECTED BY INDEPENDENT REVIEW: this does NOT isolate `_tf_document_filings_agent_
  // congruence` -- `t_document_filings_stamp` (BEFORE INSERT, PRE-EXISTING, alpha2's CoR) is a
  // STRICT SUPERSET check and refuses first, every time, on INSERT. This train's own congruence
  // trigger is provably unreachable on the live schema (INSERT subsumed here; UPDATE forbidden
  // from touching resolution_id/client_id by the pre-existing t_document_filings_update) -- see
  // the migration's own comment on _tf_document_filings_agent_congruence for the full argument,
  // the same "unreachable, kept as defense in depth" class as rung B6. This cell honestly tests
  // the ESTATE'S existing wall, which is what actually protects this train's own write path.
  const res = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'judgement','{}'::jsonb) returning id`,
    [world.firms.A, world.clients.A2, doc.documentId],
  );
  const err = await assertRaises(
    CLR.client,
    () => rootQuery(
      `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
         values ($1,$2,$3,$4,$5,'judgement')`,
      [world.firms.A, doc.documentId, world.clients.A1, "00000000-0000-4000-8000-000000c1a7a0", res.rows[0].id],
    ),
    "a judged filing whose resolution names a different client refuses on INSERT",
  );
  assert.match(err.message, /not authoritative for this document\/client/, "the PRE-EXISTING stamp trigger fired, not this train's own congruence trigger");
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
