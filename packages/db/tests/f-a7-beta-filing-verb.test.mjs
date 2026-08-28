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
// THE OWNER-RULING DELTA (2026-08-24): B2 is now the "union of cautions" (a SERVER-DERIVED
// tokenization floor over this document's own ocr/structured_parse party-name regions, PLUS the
// model's own optional `candidates` array -- either arm alone can refuse) and B3 is now "the
// corroborated-anchor floor" (a hard-identifier match OR a witness-corroborated region; a bare
// name-only sighting now refuses where the prior form admitted it). B3 arm (b) is a NAMED,
// MEASURED SKIP below (provably unreachable via wake_file_document today -- see that cell and
// the migration's own SS5 comment); every other required battery cell for both rungs is real.
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
import { seedVerifiedDocument, activeFilings, ensureFirmNarrowAttribution } from "./rig-docs-fixtures.mjs";

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
    // Review finding 6a, FIXED: a first draft silently t.skip()'d all 33 cells to a green exit
    // here regardless of context. CLARA_ALLOW_MISSING_F_A7_BETA (set only by this file's own
    // preintegration gate, preloaded in the package-wide sweep) is the SAME allow-missing idiom
    // the estate's other waves already use (delta/epsilon/eta/etc.) -- a FOCUSED run of this
    // file alone leaves the variable unset and must FAIL LOUDLY on a missing premise, not skip.
    if (process.env.CLARA_ALLOW_MISSING_F_A7_BETA !== "1") {
      throw new Error(
        `f-a7-beta premise missing (beta=${catalog.rows[0].beta}, pi=${catalog.rows[0].pi}) and ` +
        "CLARA_ALLOW_MISSING_F_A7_BETA is unset -- this is a FOCUSED run and must fail loudly, " +
        "not skip. Preload ./tests/f-a7-beta-preintegration-gate.mjs for an estate-sweep run " +
        "against a pre-train chain.",
      );
    }
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

/** One-time, per-firm: grant + activate the firm-narrow `attribution` moment for firm A as its
 *  owner (alice). `uq_firm_egress_purpose_consents_one_live` means this can only happen ONCE
 *  per (firm, purpose, moment) -- callers share this activation and mint their own fresh
 *  dispatch authorization via freshAuthorization() below.
 *  CI-red diagnosis (2026-08-25, class 3): this file used to hand-roll its own grant+activate
 *  sequence here, written before gamma's `seedVerifiedDocument` grew its own default-on
 *  `ensureFirmNarrowAttribution` side effect (rig-docs-fixtures.mjs: any call that leaves
 *  `client` at its default null -- which is how every seed call in THIS file reads -- now
 *  auto-grants the same consent as a side effect). On the real merged chain the auto-grant fires
 *  on this file's very FIRST document seed, so the hand-rolled call below raced a consent that
 *  already existed and lost to CLR28 "firm already has a live typed egress consent". Fixed by
 *  delegating to the shared, idempotent helper directly instead of maintaining a competing copy
 *  -- it dedupes on its own (a Set plus a live-DB check), so calling it here is a no-op on the
 *  common path where seedVerifiedDocument already granted it, and the one real grant on a path
 *  that never seeds a document first. */
async function ensureFirmNarrowActivated() {
  await ensureFirmNarrowAttribution({ firm: world.firms.A });
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

/** Seeds a hard-identifier region (kind ssm/tin/bank_account) on `doc`, sourced like B1
 *  (engine_kind ocr/structured_parse -- the AB-3 discipline), matching a FRESH client_
 *  identifiers row for `client`. Gives v_confirms_client = true for (doc, client) -- the owner
 *  ruling's B3 arm (a), "a hard-identifier match". */
async function seedHardIdentifierAnchor(doc, client, { kind = "ssm", fieldPath = "invoice.customer_ssm" } = {}) {
  const value = randomUUID().replace(/-/g, "").slice(0, 12); // already lowercase hex, no whitespace
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,$3,$4,$5)`,
    [world.firms.A, client, kind, value, world.users.alice],
  );
  const ext = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'test:ocr','ocr',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,$3,$4,0.97)`,
    [world.firms.A, ext.rows[0].id, fieldPath, value],
  );
  return value;
}

/** Seeds a customer/vendor NAME region on `doc`, sourced like B1 (engine_kind ocr/structured_
 *  parse, field_path invoice.customer_name / invoice.vendor_name -- 0009/0015/0016's own
 *  convention). This is the document's OWN extracted evidence, independent of anything the
 *  model verdict supplies -- B2 arm (a)'s "deterministic floor, cannot be starved". */
async function seedPartyNameRegion(doc, name, { role = "customer" } = {}) {
  const ext = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'test:ocr','structured_parse',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,$3,$4,0.97)`,
    [world.firms.A, ext.rows[0].id, `invoice.${role}_name`, name],
  );
}

/** Review finding 1 (independent native review, 2026-08-24): the REAL production shape a
 *  party-name region is actually written under -- clara.persist_invoice_facts's live tip
 *  writes invoice.customer_name / invoice.vendor_name ONLY under engine_kind='invoice_facts'
 *  (0015:106-118's own S0.c assertion), never 'ocr'/'structured_parse'. seedPartyNameRegion
 *  above is the FIXTURE shape B2 arm (a) was first authored against; this is the shape that
 *  actually reaches production. */
async function seedRealInvoiceFactsPartyNameRegion(doc, name, { role = "customer" } = {}) {
  const ext = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'test:invoice_facts','invoice_facts',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,$3,$4,0.97)`,
    [world.firms.A, ext.rows[0].id, `invoice.${role}_name`, name],
  );
}

/** Review finding 1: the REAL production shape a MyInvois identity-pass identifier is written
 *  under -- engine_kind='structured_parse', field_path in ('myinvois.supplier_tin',
 *  'myinvois.supplier_brn') (0015:106-118's own S0.c assertion: "the identity pass
 *  (structured_parse) intentionally carries EXACTLY two matching keys"). */
async function seedMyinvoisIdentifierRegion(doc, fieldPath, value) {
  const ext = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'test:myinvois','structured_parse',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon','{"page":1}'::jsonb,$3,$4,0.97)`,
    [world.firms.A, ext.rows[0].id, fieldPath, value],
  );
}

/** Seeds two live counterparties -- one bound to A1, one to A2 -- sharing a name-family TOKEN
 *  (clara.name_family_token's first-word rule), so clara.name_family_is_ambiguous(firm, family)
 *  is TRUE. Returns the A1-bound counterparty's full name, suitable to feed either a document's
 *  own extracted party-name region (B2 arm a) or a model verdict's matched_name (arm c). */
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

/** Seeds a full witness-regime pair (a document_processing_tasks row, lane='llm_witness',
 *  status='done' + a matching document_extractions row, engine_kind='llm_text_facts') plus
 *  vendor/customer registration+name regions whose GEOMETRY makes clara.evaluate_witness_
 *  identity_v1 resolve 'corroborated' for BOTH sides -- the vendor_registration box sits right
 *  next to vendor_name, and customer_registration sits right next to customer_name, far away
 *  from the vendor pair. Review finding 1's reproduction fixture, kept as a named test helper:
 *  this verdict is a pure document-LAYOUT-sanity check, not bound to any particular client. */
async function seedWitnessCorroborationPair(doc) {
  const task = await rootQuery(
    `insert into clara.document_processing_tasks(firm_id, document_id, lane, status, engine_id, version_n,
        workflow_run_id, started_at, finished_at)
       values ($1,$2,'llm_witness','done','clara-fixture:witness',1,'test-run',now(),now()) returning id`,
    [world.firms.A, doc.documentId],
  );
  const extW = await rootQuery(
    `insert into clara.document_extractions(firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
       values ($1,$2,'clara-fixture:witness','llm_text_facts',1,'done',1,'{}'::jsonb) returning id`,
    [world.firms.A, doc.documentId],
  );
  const wExtId = extW.rows[0].id;
  const region = (fieldPath, text, box) => rootQuery(
    `insert into clara.document_regions(firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
       values ($1,$2,'page_polygon',$3::jsonb,$4,$5,0.9)`,
    [world.firms.A, wExtId, JSON.stringify({ page: 1, polygon: box }), fieldPath, text],
  );
  await region("invoice.vendor_registration", "VENDOR-REG-XYZ-999", [0, 0, 10, 0, 10, 10, 0, 10]);
  await region("invoice.vendor_name", "Some Vendor Sdn Bhd", [1, 1, 11, 1, 11, 11, 1, 11]);
  await region("invoice.customer_registration", "CUST-REG-ABC-111", [500, 500, 510, 500, 510, 510, 500, 510]);
  await region("invoice.customer_name", "Some Customer Sdn Bhd", [501, 501, 511, 501, 511, 511, 501, 511]);
  return { taskId: task.rows[0].id, extractionId: wExtId };
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

test("filing allowlist: closed world holds exactly the six train-beta rows plus F-A7b PR-a's own (cell 40, corrected scope, widened by F-A7b PR-a)", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery("select function_name from clara.wake_fn_allowlist where wake_kind='filing' order by 1");
  const got = r.rows.map((x) => x.function_name).sort();
  // Rows 1-6 are train beta's (this file). Row 7, wake_begin_client_onboarding, is F-A7b PR-b's
  // still-unclaimed reservation. Row 8, wake_propose_client_onboarding, is F-A7b PR-a's own --
  // this cell is the closed-world floor PR-a's own migration widens, trued here in the same PR
  // (db-tests.md's succession rule: a PR that widens a registered closed world trues the floor
  // that pins it, in the same PR, rather than leaving the next sweep to find it red).
  const expected = [
    "get_document_extract", "wake_file_document", "wake_open_firm_question",
    "wake_propose_filing_correction", "wake_propose_identifier_promotion", "wake_reattribute_document",
    "wake_propose_client_onboarding",
  ].sort();
  assert.deepEqual(got, expected, "filing allowlist rows 1-6 (train beta) + row 8 (F-A7b PR-a); row 7 (wake_begin_client_onboarding) is F-A7b PR-b's, still unclaimed");
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
  // Review finding 6b, FIXED: information_schema.role_routine_grants reads NOTHING for a role
  // when a function's proacl is NULL (the Postgres DEFAULT ACL -- EXECUTE granted to PUBLIC by
  // default) -- a row-count/row-list check against that view is BLIND to exactly that leak class
  // (the fleet-wide lesson that found a real PUBLIC-EXECUTE leak on clara._file_document_write).
  // has_function_privilege resolves the ACTUAL EFFECTIVE privilege regardless of whether proacl
  // is NULL or customized -- the migration's own tail (SS10 item 6b) already does this correctly;
  // this test now mirrors it rather than trusting the blind view.
  const roster = ["public", "clara_authenticated", "clara_agent_ro", "clara_wake_interactive",
    "clara_wake_proactive", "clara_wake_bank", "clara_runtime", "clara_wake_filing"];
  const wfdSig = "clara.wake_file_document(uuid,uuid,jsonb,text,jsonb,uuid,text)";
  const coreSig = "clara._agent_file_document_core(uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,text,jsonb,uuid,text)";
  for (const role of roster) {
    const rr = await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, wfdSig]);
    const expected = role === "clara_wake_filing" || role === "clara_wake_interactive";
    assert.equal(rr.rows[0].ok, expected, `wake_file_document EXECUTE for role ${role}: expected ${expected}`);
    const rc = await rootQuery("select has_function_privilege($1, $2, 'EXECUTE') as ok", [role, coreSig]);
    assert.equal(rc.rows[0].ok, false, `_agent_file_document_core EXECUTE for role ${role}: must be false`);
  }
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  await assertRaises(
    CLR.notFound,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.B1 }),
    "cross-firm client",
  );
});

test("wake_file_document Tier A: document already actively filed to the target client -> CLR10, no second filing row", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, { document: doc.documentId, client: world.clients.A1, verdict: { note: "no citations key at all" } }),
    "verdict missing citations array",
  );
});

test("wake_file_document Tier A rung A9: null authorization -> CLR28 (CB)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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

test("wake_file_document: FULL END-TO-END SUCCESS -- a live authorization + a well-cited verdict files, mints a judgement resolution, and consumes the authorization (also B3 cell 1: a hard-identifier match admits)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  // B3, the owner-ruling delta (2026-08-24): unattended filing now requires a corroborated
  // anchor. This test's OWN citation region (below, field_path='party_name') is deliberately
  // NOT one of B1/B3's allowlisted identifier field_paths, so it does not confirm the client by
  // itself -- the hard-identifier anchor is seeded explicitly, exactly like a real filing would
  // carry one, making v_confirms_client true and satisfying B3 arm (a).
  await seedHardIdentifierAnchor(doc, world.clients.A1);
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

test("wake_file_document Tier B3 cell 3+4: a BARE NAME-ONLY sighting -- no hard-id match, no witness corroboration -- refuses attribution_no_basis (the corroborated-anchor floor) and opens the ask path; the authorization is STILL consumed", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const authorization = await freshAuthorization(doc.sha256);
  // A genuine "bare name-only sighting" (owner ruling's own words): the model names a party but
  // supplies no citation, and no hard-identifier region exists anywhere on this document. A
  // deliberately non-colliding name so this cell isolates B3 from B2.
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { matched_name: `Solo Sighting ${randomUUID()}`, citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_no_basis"),
    `expected attribution_no_basis (B3, the owner-ruling delta): ${JSON.stringify(result.failing_rungs)}`);
  const auth = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.ok(auth.rows[0].consumed_at, "consumed even on refusal -- the authorization produced this verdict either way");
  // Cell 4: the refusal opens the ask path -- already structurally satisfied by the shared
  // Tier-B refusal branch (a non-empty failing_rungs vector always opens a firm question), proved
  // here for a B3-specific refusal rather than asserted from another rung's cell.
  assert.ok(result.question_id, "a Tier-B refusal must open a firm question (the ask path)");
  const q = await rootQuery(
    "select status, document_id, receipt_id from clara.firm_open_questions where id=$1",
    [result.question_id],
  );
  assert.equal(q.rows[0].status, "open");
  assert.equal(q.rows[0].document_id, doc.documentId);
  assert.equal(q.rows[0].receipt_id, result.receipt_id.toString());
});

// ---------------------------------------------------------------------------
// B2/B3 DELTA -- owner ruling, 2026-08-24, F-A7 gate-record card dispositions.
// ---------------------------------------------------------------------------
test("wake_file_document Tier B2 cell 1: the SERVER-DERIVED tokenization floor fires with NO model candidate list -- 'a deterministic floor, cannot be starved'", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const familyName = await seedNameFamilyCollision();
  // This document's OWN extracted customer-name region is the colliding family's name --
  // sourced from an ocr/structured_parse engine, exactly B1's own AB-3 discipline.
  await seedPartyNameRegion(doc, familyName, { role: "customer" });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    // An EMPTY/ABSENT model verdict on purpose -- no matched_name, no candidates -- proving the
    // asymmetry: absence of the model's own list can never open a gate the server floor closed.
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_name_family_collision"),
    `server-derived floor did not fire with an absent model verdict: ${JSON.stringify(result.failing_rungs)}`);
});

// ---------------------------------------------------------------------------
// Review finding 1 (independent native review, opus, 2026-08-24): the cell above proves the
// MECHANISM over a manufactured (engine_kind, field_path) shape no live producer writes. These
// three cells prove it over the REAL production shapes, rig-replayed before this train wrote
// them: clara.persist_invoice_facts (engine_kind='invoice_facts') for party names, and the
// myinvois identity pass (engine_kind='structured_parse', field_path in
// ('myinvois.supplier_tin','myinvois.supplier_brn')) for the identifier-family signal.
// ---------------------------------------------------------------------------
test("wake_file_document Tier B2 review finding 1, ASSESSED cell (i): a REAL myinvois.supplier_tin ambiguous across two clients is rig-proven REDUNDANT with B1 -- documented, not shipped as a new B2 signal", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  // A genuinely ambiguous printed TIN: the SAME normalized value registered to BOTH A1 and A2
  // (a data-quality edge case -- two clients sharing one identifier by mistake), sourced under
  // the REAL myinvois identity-pass shape (engine_kind='structured_parse',
  // field_path='myinvois.supplier_tin').
  const value = randomUUID().replace(/-/g, "").slice(0, 12);
  await rootQuery(
    `insert into clara.client_identifiers(firm_id, client_id, kind, value_normalized, added_by)
       values ($1,$2,'tin',$3,$4), ($1,$5,'tin',$3,$4)`,
    [world.firms.A, world.clients.A1, value, world.users.alice, world.clients.A2],
  );
  await seedMyinvoisIdentifierRegion(doc, "myinvois.supplier_tin", value);
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false, "still refuses -- B1's own wall alone is sufficient");
  // THE FINDING: B1 alone carries this refusal. A1's own matching row ALSO makes
  // v_confirms_client true, which suppresses B2's flag via cell 12's hard case -- so a
  // dedicated "identifier-family ambiguity" signal in B2 would never be the deciding factor
  // here (or in any reachable case: whenever such a signal could fire, either B1 already
  // refuses independently, or v_confirms_client's carve-out suppresses B2 regardless). This is
  // the migration's own SS5 comment, proven here rather than merely asserted.
  assert.deepEqual(result.failing_rungs, ["attribution_contradicted"],
    `expected B1 alone (redundancy proof): ${JSON.stringify(result.failing_rungs)}`);
});

test("wake_file_document Tier B2 review finding 1, FIXED, cell (real-ii): a REAL invoice_facts party-name row (the actual production writer) fires -- the manufactured fixture shape is no longer the only proof", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const familyName = await seedNameFamilyCollision();
  await seedRealInvoiceFactsPartyNameRegion(doc, familyName, { role: "customer" });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_name_family_collision"),
    `the real invoice_facts party-name row did not fire: ${JSON.stringify(result.failing_rungs)}`);
});

test("wake_file_document Tier B2 review finding 1, FIXED, cell (real, cannot-be-starved): the REAL invoice_facts shape fires with NO model candidate list either -- the asymmetry proof holds against production data, not only the fixture shape", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const familyName = await seedNameFamilyCollision();
  await seedRealInvoiceFactsPartyNameRegion(doc, familyName, { role: "vendor" });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    // Absent model verdict, exactly like the fixture-shape cell above.
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_name_family_collision"),
    `production shape did not fire with an absent model verdict: ${JSON.stringify(result.failing_rungs)}`);
});

test("wake_file_document Tier B2 cell 2: the MODEL'S candidate list adds a refusal the server-derived floor alone would have missed", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  // NO ocr/structured_parse customer/vendor-name region on this document at all: the
  // server-derived floor (v_server_names) is empty and therefore cannot be ambiguous on its own
  // -- an otherwise-clean document, isolating the model-candidates arm.
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [], candidates: ["Client Alpha Sdn Bhd", "Client Beta Sdn Bhd"] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false);
  assert.ok(result.failing_rungs.includes("attribution_name_family_collision"),
    `the model's own candidate list did not add a refusal on otherwise-clean tokens: ${JSON.stringify(result.failing_rungs)}`);
});

// Review finding 6d: adversarial cells for the model's `candidates` field -- non-array, JSON
// null, empty-string elements, duplicate names, a large array. Deliberately NO hard-identifier
// anchor here: cell 12's hard case (v_confirms_client) suppresses B2's flag REGARDLESS of why
// v_ambiguous became true, so an anchor would mask exactly the arm-(b) behaviour under test (a
// first draft of these cells seeded one and could never observe B2 actually fire). Without an
// anchor, B3 always refuses too (attribution_no_basis, no citations either) -- so `filed` is
// false in every cell here regardless of B2; the assertions target `failing_rungs` membership
// specifically, which isolates B2's own reaction cleanly either way.
async function b2AdversarialAttempt(t, candidates) {
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const authorization = await freshAuthorization(doc.sha256);
  return wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [], candidates },
  });
}

test("wake_file_document Tier B2 adversarial: candidates is a NON-ARRAY (a string) -- degrades to no extra refusal, never raises", async (t) => {
  if (unready(t)) return;
  const r = await b2AdversarialAttempt(t, "not an array at all");
  assert.equal(r.rows[0].result.filed, false, "no corroborated anchor either way -- B3 refuses regardless of B2");
  assert.ok(!r.rows[0].result.failing_rungs.includes("attribution_name_family_collision"),
    `a non-array candidates must not add a B2 refusal: ${JSON.stringify(r.rows[0].result.failing_rungs)}`);
});

test("wake_file_document Tier B2 adversarial: candidates is JSON null -- degrades to no extra refusal, never raises", async (t) => {
  if (unready(t)) return;
  const r = await b2AdversarialAttempt(t, null);
  assert.equal(r.rows[0].result.filed, false);
  assert.ok(!r.rows[0].result.failing_rungs.includes("attribution_name_family_collision"),
    `a JSON-null candidates must not add a B2 refusal: ${JSON.stringify(r.rows[0].result.failing_rungs)}`);
});

test("wake_file_document Tier B2 adversarial: candidates has empty-string elements ([\"\",\"\"]) -- still fires (raw array length, more cautious not less)", async (t) => {
  if (unready(t)) return;
  const r = await b2AdversarialAttempt(t, ["", ""]);
  assert.equal(r.rows[0].result.filed, false);
  assert.ok(r.rows[0].result.failing_rungs.includes("attribution_name_family_collision"), JSON.stringify(r.rows[0].result.failing_rungs));
});

test("wake_file_document Tier B2 adversarial: candidates has DUPLICATE names ([\"A\",\"A\"]) -- still fires (raw array length is the deliberate, documented choice, SS0's own §7 note)", async (t) => {
  if (unready(t)) return;
  const r = await b2AdversarialAttempt(t, ["A", "A"]);
  assert.equal(r.rows[0].result.filed, false);
  assert.ok(r.rows[0].result.failing_rungs.includes("attribution_name_family_collision"), JSON.stringify(r.rows[0].result.failing_rungs));
});

test("wake_file_document Tier B2 adversarial: a LARGE candidates array (1000 elements) evaluates correctly, no crash/timeout", async (t) => {
  if (unready(t)) return;
  const many = Array.from({ length: 1000 }, (_, i) => `Candidate ${i}`);
  const r = await b2AdversarialAttempt(t, many);
  assert.equal(r.rows[0].result.filed, false);
  assert.ok(r.rows[0].result.failing_rungs.includes("attribution_name_family_collision"), JSON.stringify(r.rows[0].result.failing_rungs));
});

test("wake_file_document Tier B2 cell 3: clean server tokens + a single-candidate model list admits (both arms clean)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  await seedHardIdentifierAnchor(doc, world.clients.A1); // B3's floor -- isolates this cell to B2
  // Review finding 6c, FIXED: a first draft seeded NO party-name region at all, so v_server_names
  // was empty and v_server_ambiguous was trivially false regardless of whether the ambiguity
  // check itself had a bug -- the cell could never catch a FALSE refusal on genuinely clean
  // evidence. A real, unambiguous name (its own token, sharing no family with any seeded client
  // or counterparty) now flows through the SAME server-derived path cell 1 exercises.
  await seedPartyNameRegion(doc, `Unambiguous Party ${randomUUID()}`, { role: "customer" });
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [], candidates: ["Only One Candidate"] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, true, `expected the gate to admit with both arms clean: ${JSON.stringify(result)}`);
});

test("wake_file_document Tier B3 cell 2: witness-corroborated region admits -- NAMED, MEASURED SKIP (not faked)", (t) => {
  // MEASURED (rig-replayed, not guessed), this train's own authoring session, 2026-08-24:
  // clara.evaluate_witness_identity_v1 (the estate's one existing frozen evaluator computing
  // this verdict) self-derives its candidate client from LIVE clara.document_filings rows for
  // the document -- it takes no explicit candidate-client parameter. _agent_file_document_core's
  // own Tier A already raises CLR10 "document is already actively filed to this client"
  // whenever a live filing to p_client exists, which is the ONE case in which the evaluator
  // could ever resolve its internal candidate to p_client. Arm (b) is therefore PROVABLY
  // UNREACHABLE via any live call path in wake_file_document today -- the same unreachability
  // class as B6 and the SS7 congruence trigger (both already a named, counted skip in this same
  // file, above). Full argument: the migration's own B3 comment (SS5). Making this cell pass for
  // real needs either a candidate-parameterized evaluator variant (pi/F-A1-successor scope) or a
  // SAVEPOINT-based ladder restructure (assessed and NOT attempted unilaterally: clara.
  // _append_event's event_seq does not roll back with a SAVEPOINT, so a trial write through the
  // real delegate would leave a permanent gap in the firm's event spine -- a correctness risk
  // this train will not introduce into judgement logic without its own independent review).
  // Carried to the conductor in this train's settle report rather than faked or silently dropped.
  t.skip("B3 arm (b) is provably unreachable via wake_file_document today -- see the migration's own SS5 comment and this train's settle report");
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

test("wake_file_document Tier B8 review finding 2, FIXED: an UNCLASSIFIED document (document_kind IS NULL) refuses attribution_identity_document too -- absence of classification is not evidence of safety (review law 2)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  // document_kind explicitly OMITTED -- documents_document_kind_check admits NULL, and this is
  // exactly the state a document is in before classify_document ever runs. Pre-fix, coalesce
  // read this NULL as "safely not an identity document" and B8 never fired.
  const doc = await seedVerifiedDocument({ firm: world.firms.A });
  const row = await rootQuery("select document_kind from clara.documents where id=$1", [doc.documentId]);
  assert.equal(row.rows[0].document_kind, null, "setup: this document is genuinely unclassified");
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  assert.equal(r.rows[0].result.filed, false, `an unclassified document must not file unattended: ${JSON.stringify(r.rows[0].result)}`);
  assert.ok(r.rows[0].result.failing_rungs.includes("attribution_identity_document"),
    `expected attribution_identity_document on a NULL-kind document: ${JSON.stringify(r.rows[0].result.failing_rungs)}`);
});

test("wake_file_document review finding 1, CRITICAL, FIXED: a live filing to ANOTHER client no longer lets a bare, evidence-free wake for a DIFFERENT client inherit its witness-corroboration verdict", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });

  // STEP 1 -- an ACTIVE filing to A1 already exists, via a DIRECT write (root), deliberately
  // leaving NO document_regions/client_identifiers evidence on this document at all -- so
  // nothing here can trip B1's own contradiction wall for the later attempt at a DIFFERENT
  // client. This isolates B3 arm (b) specifically.
  const resA1 = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence, resolved_by)
       values ($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [world.firms.A, world.clients.A1, doc.documentId, world.users.alice],
  );
  await rootQuery(
    "select clara._file_document_write($1::jsonb, $2, $3, $4, $5)",
    [JSON.stringify({ firm: world.firms.A, actor: world.users.alice }), doc.documentId, world.clients.A1, resA1.rows[0].id, opk("f1-setup")],
  );
  const activeBefore = await activeFilings(doc.documentId);
  assert.equal(activeBefore.length, 1);
  assert.equal(activeBefore[0].client_id, world.clients.A1);

  // STEP 2 -- seed the witness pair. Pre-fix, evaluate_witness_identity_v1's verdict (a pure
  // layout-sanity check, not bound to A1's identity in any way) would have been read directly
  // and trusted for WHOEVER the wake requests -- proven by direct call below.
  const { extractionId } = await seedWitnessCorroborationPair(doc);
  const ident = await rootQuery(
    "select clara.evaluate_witness_identity_v1($1, $2, false) as v",
    [doc.documentId, extractionId],
  );
  assert.equal(ident.rows[0].v.vendor_registration_verdict, "corroborated",
    "setup: the raw evaluator DOES say corroborated (the verdict itself is document-layout-based, unchanged by the fix)");

  // STEP 3 -- the exploit attempt: wake_file_document for A2 (a DIFFERENT client), ZERO
  // evidence connecting the document to A2 at all.
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A2, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false, `A2's request must refuse -- zero evidence for A2 specifically: ${JSON.stringify(result)}`);
  assert.ok(result.failing_rungs.includes("attribution_no_basis"), JSON.stringify(result.failing_rungs));
  const activeAfter = await activeFilings(doc.documentId);
  assert.equal(activeAfter.length, 1, "still exactly ONE active filing -- no cross-client double-file");
  assert.equal(activeAfter[0].client_id, world.clients.A1);
});

// ---------------------------------------------------------------------------
// B10 -- OTHER-CLIENT ACTIVE FILING (owner ruling, 2026-08-24, the compound-case sitting).
// Finding 1's residual question, closed. Cell (a) is the EXACT scenario the conductor asked
// for: pre-fix (commit 2f831ac) this scenario ADMITTED, rig-verified by direct execution
// before the ruling was sought (filed=true, a second active filing minted with zero awareness
// of the first). Cells (b)/(c) prove the new rung is SCOPED, not a blanket wall.
// ---------------------------------------------------------------------------
test("wake_file_document B10 cell (a), FIXED: a live filing to ANOTHER client refuses a GENUINE hard-identifier match for a DIFFERENT client -- routes to the ask path instead of admitting (pre-fix 2f831ac: this ADMITTED, rig-verified)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });

  // STEP 1 -- A1's filing exists via a DIRECT write (root), leaving NO document_regions/
  // client_identifiers evidence on this document -- isolates the scenario: nothing here can
  // trip B1's contradiction wall against A2 later.
  const resA1 = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence, resolved_by)
       values ($1,$2,'document',$3,1.0,'human','{}'::jsonb,$4) returning id`,
    [world.firms.A, world.clients.A1, doc.documentId, world.users.alice],
  );
  await rootQuery(
    "select clara._file_document_write($1::jsonb, $2, $3, $4, $5)",
    [JSON.stringify({ firm: world.firms.A, actor: world.users.alice }), doc.documentId, world.clients.A1, resA1.rows[0].id, opk("b10a-setup")],
  );
  const activeBefore = await activeFilings(doc.documentId);
  assert.equal(activeBefore.length, 1);
  assert.equal(activeBefore[0].client_id, world.clients.A1);

  // STEP 2 -- a GENUINE, independently-verified hard-identifier match for A2 (a real, distinct
  // SSM number really registered to A2's own client_identifiers row).
  const value = await seedHardIdentifierAnchor(doc, world.clients.A2);

  // STEP 3 -- wake for A2, citing nothing beyond the document's own printed identifier.
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A2, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, false, `must refuse -- another client already holds an active filing: ${JSON.stringify(result)}`);
  assert.ok(result.failing_rungs.includes("attribution_other_client_active_filing"), JSON.stringify(result.failing_rungs));
  assert.ok(result.question_id, "the refusal must open the ask path");

  const q = await rootQuery(
    "select kind, status, candidates from clara.firm_open_questions where id=$1",
    [result.question_id],
  );
  assert.equal(q.rows[0].kind, "collision");
  assert.equal(q.rows[0].status, "open");
  const ctx = q.rows[0].candidates[0];
  assert.equal(ctx.client_id, world.clients.A2, "the REQUESTING client is on record");
  assert.equal(ctx.existing_filing_client_id, world.clients.A1, "the EXISTING filing's client is on record");
  assert.equal(ctx.anchoring_identifier_kind, "ssm");
  assert.equal(ctx.anchoring_identifier_value, value, "the ANCHORING identifier that made A2's own case is on record");

  const activeAfter = await activeFilings(doc.documentId);
  assert.equal(activeAfter.length, 1, "still exactly ONE active filing -- B10 closed the residual leak");
  assert.equal(activeAfter[0].client_id, world.clients.A1);

  // The human door stays open and unchanged: resolve_firm_question names the client the
  // question answers to, per the owner's own ruled scope ("the HUMAN verb stays exactly as-is").
  const resolved = await runAs(
    human(world.users.alice),
    namedCall("resolve_firm_question", [
      { name: "p_question" }, { name: "p_resolution" }, { name: "p_client" }, { name: "p_op_key" },
    ]),
    [result.question_id, "confirmed: a genuine second-client transaction", world.clients.A2, opk("b10a-resolve")],
  );
  assert.equal(resolved.rows[0].result.status, "resolved");
  assert.equal(resolved.rows[0].result.named_client, world.clients.A2);
});

test("wake_file_document B10 cell (b): the SAME-client Tier-A CLR10 raise stays unchanged (B10 is a Tier-B rung, never reached)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  await seedHardIdentifierAnchor(doc, world.clients.A1);
  const authorization = await freshAuthorization(doc.sha256);
  await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  const auth2 = await freshAuthorization(doc.sha256);
  const err = await assertRaises(
    CLR.badRequest,
    () => wakeFileDocument(secret, {
      document: doc.documentId, client: world.clients.A1, authorization: auth2,
      verdict: { citations: [] },
    }),
    "a second wake for the SAME already-filed client",
  );
  assert.equal(JSON.parse(err.detail).reason, "already_filed");
});

test("wake_file_document B10 cell (c): a hard-id admit with NO other client's active filing is unaffected -- B10 is scoped, not a blanket wall", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  await seedHardIdentifierAnchor(doc, world.clients.A1);
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeFileDocument(secret, {
    document: doc.documentId, client: world.clients.A1, authorization,
    verdict: { citations: [] },
  });
  const result = r.rows[0].result;
  assert.equal(result.filed, true, `expected admit -- no other client holds an active filing: ${JSON.stringify(result)}`);
  assert.ok(!result.failing_rungs || result.failing_rungs.length === 0);
});

test("wake_file_document Tier B7: an authorization minted for a DIFFERENT document refuses attribution_purpose_mismatch, AND -- the B-1 fix, proven -- the authorization stays LIVE (not consumed)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const docA = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const docB = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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

test("wake_reattribute_document review finding 3, FIXED: a NULL p_expected_revision no longer bypasses the optimistic-concurrency guard", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
  const filingRow = (await activeFilings(doc.documentId))[0];
  assert.ok(filingRow, "filing exists");
  // Pre-fix, `revision_token <> NULL` evaluated to NULL and the raise never fired -- a caller
  // that never actually observed the current revision (NULL, whether deliberate or by
  // omission) could retire-and-refile blind. IS DISTINCT FROM now catches this.
  await assertRaisesOneOf(
    ["CLR17"],
    () => wakeReattributeDocument(secret, { filing: filingRow.id, expectedRevision: null, toClient: world.clients.A2 }),
    "NULL p_expected_revision",
  );
  const stillActive = await activeFilings(doc.documentId);
  assert.equal(stillActive.length, 1, "the filing was NOT retired -- the NULL revision was refused before any write");
  assert.equal(stillActive[0].id, filingRow.id);
});

test("wake_reattribute_document: no live citation -> FULL SUCCESS -- retires the old filing and refiles to the new client under a fresh judgement resolution", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, client: world.clients.A1, kind: "invoice" });
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

// CI-red diagnosis, round 2 (2026-08-25, reviewer-corrected): the receipt-existence trigger is
// now SCOPED to agent-sourced filings (client_resolutions.evidence->>'source' IN
// ('agent_file_document','wake_reattribute_document')) rather than a universal judgement-basis
// mandate -- see the migration's own SS0 round-1/round-2 record and SS7 comment on
// _tf_document_filings_agent_receipt for the full argument (a universal mandate over-reached
// Annex H rows 4/5 plus finalize_document_intake's MF-2 arm; a congruence-only rewrite was tried
// first and rejected as vacuous against ck_agent_filing_receipts_filed_iff_clean). The two cells
// below prove the scope BOTH ways -- an admitting twin beside the refusal, per this file's own
// established law (review finding 6a's own lesson: an untested admit path is a claim, not a wall).
test("Tier C cell 58 twin / receipt-existence trigger: a RAW AGENT-SOURCED judged filing with NO agent_filing_receipts row refuses at COMMIT", async (t) => {
  if (unready(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const res = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'judgement',$4::jsonb) returning id`,
    [world.firms.A, world.clients.A1, doc.documentId, JSON.stringify({ source: "agent_file_document" })],
  );
  // A raw, single-statement probe (bypassing every wake wrapper): rootQuery's implicit
  // autocommit fires the DEFERRABLE INITIALLY DEFERRED trigger right after this one INSERT,
  // which is the same "COMMIT is the judge" property the design names. The resolution carries the
  // exact `source` string _agent_file_document_core stamps, so the SCOPED mandate reaches it --
  // and no agent_filing_receipts row exists for this filing, so the trigger must refuse. Message
  // asserted, not just SQLSTATE (M-2 on independent review): three different raisers in this
  // file's reach share CLR01, so the code alone cannot distinguish which one actually fired.
  const err = await assertRaises(
    CLR.client,
    () => rootQuery(
      `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
         values ($1,$2,$3,$4,$5,'judgement')`,
      [world.firms.A, doc.documentId, world.clients.A1, "00000000-0000-4000-8000-000000c1a7a0", res.rows[0].id],
    ),
    "an agent-sourced judged filing with no receipt refuses at (implicit) COMMIT",
  );
  assert.match(err.message, /clean agent_filing_receipts row/, "the RECEIPT trigger specifically fired");
});

test("Tier C cell 58 admitting twin: a RAW NON-AGENT judged filing (no source stamp) with NO agent_filing_receipts row ADMITS -- the scoped mandate does not reach it", async (t) => {
  if (unready(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const res = await rootQuery(
    `insert into clara.client_resolutions(firm_id, client_id, subject_kind, subject_id, confidence, method, evidence)
     values ($1,$2,'document',$3,1.0,'judgement','{}'::jsonb) returning id`,
    [world.firms.A, world.clients.A1, doc.documentId],
  );
  // Byte-identical to the refusal twin above except the resolution's evidence carries no
  // `source` key at all -- the exact shape the human door / seed-fixture path / finalize_
  // document_intake's MF-2 arm produce. No agent_filing_receipts row exists for this filing
  // either, and this ADMITS: the receipt-existence mandate never reaches a non-agent source, by
  // design (Annex H rows 4/5, MF-2), so there is nothing here for it to refuse.
  await rootQuery(
    `insert into clara.document_filings(firm_id, document_id, client_id, filed_by, resolution_id, basis)
       values ($1,$2,$3,$4,$5,'judgement')`,
    [world.firms.A, doc.documentId, world.clients.A1, "00000000-0000-4000-8000-000000c1a7a0", res.rows[0].id],
  );
});

test("document_filings INSERT congruence: a judged filing whose resolution names a DIFFERENT client refuses BEFORE INSERT (the PRE-EXISTING stamp trigger, alpha2's own CoR -- this train's own t_document_filings_agent_congruence is a defense-in-depth twin, see its migration comment for why it cannot itself be reached on the live schema)", async (t) => {
  if (unready(t)) return;
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
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
  const doc = await seedVerifiedDocument({ firm: world.firms.A, kind: "invoice" });
  const r = await wakeOpenFirmQuestion(secret, { document: doc.documentId });
  const receiptId = r.rows[0].result.receipt_id;
  const own = await humanQuery(world.users.bob, "select count(*)::int as n from clara.agent_receipts_visible where receipt_id=$1", [receiptId]);
  assert.equal(own.rows[0].n, 1, "firm A's bookkeeper sees the receipt");
  const other = await humanQuery(world.users.dave, "select count(*)::int as n from clara.agent_receipts_visible where receipt_id=$1", [receiptId]);
  assert.equal(other.rows[0].n, 0, "firm B's owner does not see firm A's receipt");
});
