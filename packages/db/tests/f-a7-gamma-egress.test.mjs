// F-A7 gamma battery — Wave-F Track A, PR-gamma (the egress train, window D1-gamma).
//
// Proves the behaviors 0123_f_a7_gamma_egress.sql adds: the 5th client purpose
// 'document_processing' (document-tied); the firm-narrow family (one purpose,
// firm_narrow_intake, two moments: attribution / onboarding_interview); the classify
// consent gate AT ENQUEUE in _enqueue_invoice_facts_core (filed -> client document_processing,
// unfiled -> firm-narrow attribution); the identity_document kind vocabulary widening; and the
// non-regression wall on claim_document_processing_task (AB-4). Design of record:
// docs/plan/active/filing-and-interview-design.md v2 SS3.5 + annexes-1/annexes-2.
//
// Own readiness gate (not wave-b's): checks for the firm_egress_purpose_consents table and the
// 5-value purpose CHECK, so this file SKIPS loudly below the gamma frontier rather than failing.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, rootQuery, roleQuery, humanQuery, opk, endPool, ensureReady,
} from "./rig-helpers.mjs";
import { buildWorld, freshResolution, createClient } from "./rig-fixtures.mjs";
import { seedVerifiedDocument, fileDocument } from "./rig-docs-fixtures.mjs";
import { classifyDocument, setDocumentKind } from "./a21-helpers.mjs";

let live = false;
let world = null;

/** Gamma-specific readiness: the 5-value purpose CHECK + the firm_egress_purpose_consents
 *  table, both live only once 0123_f_a7_gamma_egress.sql has applied. */
async function gammaReady() {
  const r = await rootQuery(`
    select
      (select pg_get_constraintdef(con.oid)
         from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relname='client_egress_purpose_consents' and con.contype='c'
          and con.conname='ck_client_egress_purpose_consents_purpose_f_a1') as purpose_check,
      (select 1 from information_schema.tables
        where table_schema='clara' and table_name='firm_egress_purpose_consents') as firm_table
  `);
  const row = r.rows[0];
  return Boolean(row.purpose_check && /document_processing/.test(row.purpose_check) && row.firm_table);
}

const gate = (t) => {
  if (!live) { t.skip("F-A7 gamma migration not applied"); return true; }
  return false;
};

before(async () => {
  await ensureReady();
  world = await buildWorld();
  live = await gammaReady();
});
after(async () => { await endPool(); });

// ---------------------------------------------------------------------------
// Local wrappers — the client-scoped document_processing purpose (mirrors the wb-0020
// wrappers' shape exactly, purpose defaulted to document_processing).
// ---------------------------------------------------------------------------

async function classifyEvidenceDoc(sub, { firm }) {
  // grantClassifyConsent: false — an evidence document must never itself trigger the fixture
  // convenience's firm-narrow auto-grant as a side effect (this file's own negative cells,
  // e.g. the "onboarding_interview alone" test, depend on that NOT happening here).
  const seed = await seedVerifiedDocument({ firm, kind: "consent_evidence", grantClassifyConsent: false });
  await rootQuery(
    "update clara.documents set bytes_verified_at = coalesce(bytes_verified_at, now()) where id=$1",
    [seed.documentId]);
  return seed;
}

async function grantDP(sub, { client, evidenceDocument, scopeNote = "rig classify consent" }) {
  const r = await humanQuery(sub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r`,
    [client, evidenceDocument, scopeNote, opk("gdp")]);
  return r.rows[0].r;
}
async function activateDP(sub, { client, consent }) {
  const r = await humanQuery(sub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_consent => $2, p_op_key => $3) as r`,
    [client, consent, opk("adp")]);
  return r.rows[0].r;
}
async function liveDPConsent(client) {
  const r = await rootQuery(
    `select id from clara.client_egress_purpose_consents
      where client_id=$1 and purpose='document_processing' and revoked_at is null
      order by granted_at desc limit 1`, [client]);
  return r.rows[0]?.id ?? null;
}
/** Grant + activate document_processing for a client in one call. */
async function enableDP(sub, { firm, client }) {
  const evidence = await classifyEvidenceDoc(sub, { firm });
  await grantDP(sub, { client, evidenceDocument: evidence.documentId });
  const consent = await liveDPConsent(client);
  await activateDP(sub, { client, consent });
  return { consent, evidence };
}

// ---------------------------------------------------------------------------
// Local wrappers — the firm-narrow family.
// ---------------------------------------------------------------------------

async function grantFirmNarrow(sub, { moment, evidenceDocument, scopeNote = "rig firm-narrow consent" }) {
  const r = await humanQuery(sub,
    `select clara.grant_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => $1,
       p_evidence_document => $2, p_scope_note => $3, p_op_key => $4) as r`,
    [moment, evidenceDocument, scopeNote, opk("gfn")]);
  return r.rows[0].r;
}
async function activateFirmNarrow(sub, { moment, consent }) {
  const r = await humanQuery(sub,
    `select clara.activate_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => $1,
       p_consent => $2, p_op_key => $3) as r`,
    [moment, consent, opk("afn")]);
  return r.rows[0].r;
}
async function liveFirmNarrowConsent(firm, moment) {
  const r = await rootQuery(
    `select id from clara.firm_egress_purpose_consents
      where firm_id=$1 and purpose='firm_narrow_intake' and moment=$2 and revoked_at is null
      order by granted_at desc limit 1`, [firm, moment]);
  return r.rows[0]?.id ?? null;
}
async function enableFirmNarrow(sub, { firm, moment }) {
  const evidence = await classifyEvidenceDoc(sub, { firm });
  await grantFirmNarrow(sub, { moment, evidenceDocument: evidence.documentId });
  const consent = await liveFirmNarrowConsent(firm, moment);
  await activateFirmNarrow(sub, { moment, consent });
  return { consent, evidence };
}
async function prepareFirmNarrowDispatch({ firm, moment, sha, eventSeq = 1, eventType = "entry.approved" }) {
  const r = await roleQuery(ROLES.runtime,
    `select clara.prepare_firm_egress_dispatch(p_firm => $1, p_purpose => 'firm_narrow_intake',
       p_moment => $2, p_event_seq => $3::bigint, p_event_type => $4, p_document_sha256 => $5) as r`,
    [firm, moment, eventSeq, eventType, sha]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Enqueue driver: mirrors the runtime's own call shape (a PDF/image document with
// document_kind = null routes to the classify lane at enqueue).
// ---------------------------------------------------------------------------

async function enqueue(document) {
  const r = await rootQuery(
    "select clara._enqueue_invoice_facts_core(p_document => $1) as r", [document]);
  return r.rows[0].r;
}
async function taskRows(document, lane = "classify") {
  const r = await rootQuery(
    `select id, status, error_code, version_n from clara.document_processing_tasks
      where document_id=$1 and lane=$2 order by version_n`, [document, lane]);
  return r.rows;
}

// ===========================================================================
// META
// ===========================================================================

test("META: F-A7 gamma applied — the 5-value purpose CHECK, its own doc-sha conjunct, and the firm-narrow family are live", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(`
    select pg_get_constraintdef(con.oid) as def
      from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='clara' and c.relname='egress_dispatch_authorizations' and con.contype='c'
       and con.conname='ck_egress_dispatch_authorizations_doc_sha'`);
  assert.match(r.rows[0].def, /document_processing/, "the doc-sha CHECK names document_processing");
  for (const table of ["firm_egress_purpose_consents", "firm_egress_purpose_activations", "firm_egress_dispatch_authorizations"]) {
    const t2 = await rootQuery(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid=$1::regclass", [`clara.${table}`]);
    assert.equal(t2.rows[0].relrowsecurity, true, `${table} has RLS enabled`);
    assert.equal(t2.rows[0].relforcerowsecurity, true, `${table} FORCES RLS`);
  }
});

test("NON-REGRESSION (AB-4/cell 65): claim_document_processing_task carries NO typed-consent call edge, client OR firm-narrow", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    "select prosrc from pg_proc where oid='clara.claim_document_processing_task(uuid,text,boolean)'::regprocedure");
  const src = r.rows[0].prosrc;
  for (const needle of ["client_egress_purpose", "prepare_egress_dispatch", "consume_egress_dispatch",
    "firm_egress_purpose", "prepare_firm_egress_dispatch"]) {
    assert.ok(!src.includes(needle), `claim_document_processing_task must not reference ${needle}`);
  }
});

// ===========================================================================
// document_processing — client-scoped, document-tied.
// ===========================================================================

test("document_processing joins the purpose vocabulary: grant+activate succeeds, and prepare_egress_dispatch requires a hash (statement/witness shape, not wiki's)", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A1;
  const firm = world.firms.A;
  // [B/F4 review fold] PREMISE, so "grant+activate succeeds" is a real state change, not a
  // no-op reflecting a pre-existing (fixture-convenience-granted) consent this cell never
  // proved it needed.
  const before = await liveDPConsent(client);
  assert.equal(before, null, "PREMISE: client A1 holds no live document_processing consent yet");
  const { consent } = await enableDP(world.users.alice, { firm, client });
  assert.ok(consent, "a live document_processing consent exists");

  const ev = (await rootQuery(
    "select seq::bigint as seq, event_type from clara.domain_events where firm_id=$1 order by seq desc limit 1",
    [firm])).rows[0];

  const noSha = await roleQuery(ROLES.runtime,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => 'document_processing',
       p_event_seq => $3::bigint, p_event_type => $4, p_document_sha256 => null) as r`,
    [firm, client, ev.seq, ev.event_type]);
  assert.deepEqual(noSha.rows[0].r, { verdict: "unknown", authorization_id: null },
    "document_processing WITHOUT a hash is refused uniformly (document-tied, mirrors statement/witness)");

  const sha = "a".repeat(64);
  const withSha = await roleQuery(ROLES.runtime,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => 'document_processing',
       p_event_seq => $3::bigint, p_event_type => $4, p_document_sha256 => $5) as r`,
    [firm, client, ev.seq, ev.event_type, sha]);
  assert.equal(withSha.rows[0].r.verdict, "granted", "document_processing WITH a hash is granted");
  const authRow = (await rootQuery(
    "select document_sha256 from clara.egress_dispatch_authorizations where id=$1",
    [withSha.rows[0].r.authorization_id])).rows[0];
  assert.equal(authRow.document_sha256, sha, "the authorization row carries the hash");
});

// ===========================================================================
// The classify consent gate, AT ENQUEUE (D-18/AB-4) — the two populations.
//
// [Conductor ruling, F-A7 gamma fixture-convenience] `fileDocument`/`seedVerifiedDocument`
// grant classify consent by DEFAULT now (rig-docs-fixtures.mjs — every test firm is a
// CONSENTED fixture, ADR-0075's own framing), through the real governed verbs, with a
// `grantClassifyConsent: false` opt-out. The two DIFFERENTIAL PAIRS below are that ruling's
// mandatory condition (3): the opt-out on each side proves the gate genuinely still refuses an
// UNCONSENTED firm/client, and the DEFAULT (no flag at all) proves the convenience itself
// actually grants — both polarities, both populations, forced, not assumed from either alone.
// ===========================================================================

test("[fixture-convenience differential, CLIENT-scoped] FILED document, grantClassifyConsent:false: holds — no queued task, a terminal never-claimed failed receipt, code document_processing_consent_inactive", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A2;
  const seed = await seedVerifiedDocument({ firm: world.firms.A }); // document_kind NULL
  await fileDocument(world.users.alice, {
    document: seed.documentId, client, grantClassifyConsent: false,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: seed.documentId }),
  });

  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "failed", `holds (got ${JSON.stringify(r)})`);
  assert.equal(r.reason, "document_processing_consent_inactive");

  const rows = await taskRows(seed.documentId);
  assert.equal(rows.length, 1, "exactly one classify task row exists");
  assert.equal(rows[0].status, "failed");
  assert.equal(rows[0].error_code, "document_processing_consent_inactive");

  // Re-fire: idempotent re-read, same row, no duplicate.
  const r2 = await enqueue(seed.documentId);
  assert.equal(r2.task_id, r.task_id, "a re-fire re-reads the SAME terminal receipt, no duplicate row");
  const rows2 = await taskRows(seed.documentId);
  assert.equal(rows2.length, 1, "still exactly one row after the re-fire");
});

test("[fixture-convenience differential, CLIENT-scoped] FILED document, DEFAULT fileDocument (no flag): proceeds — the convenience itself grants document_processing, a queued classify task", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const client = world.clients.A1;
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(world.users.alice, { // no grantClassifyConsent flag — the DEFAULT path
    document: seed.documentId, client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: seed.documentId }),
  });

  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "queued", `proceeds to a queued classify task (got ${JSON.stringify(r)})`);
  const rows = await taskRows(seed.documentId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "queued");
  assert.equal(rows[0].error_code, null);
});

test("[fixture-convenience differential, FIRM-narrow] UNFILED document, grantClassifyConsent:false: holds — code firm_narrow_consent_inactive", async (t) => {
  if (gate(t)) return;
  // A fresh firm with NO firm-narrow consent granted yet — the opt-out keeps the negative real.
  const seed = await seedVerifiedDocument({ firm: world.firms.B, grantClassifyConsent: false }); // client=null: unfiled
  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "failed", `holds (got ${JSON.stringify(r)})`);
  assert.equal(r.reason, "firm_narrow_consent_inactive");
  const rows = await taskRows(seed.documentId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].error_code, "firm_narrow_consent_inactive");
});

test("[fixture-convenience differential, FIRM-narrow] UNFILED document, DEFAULT seedVerifiedDocument (no flag): proceeds — the convenience itself grants the attribution moment; the ONBOARDING_INTERVIEW moment alone does not cover it", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.S;
  await enableFirmNarrow(world.users.erin, { firm, moment: "onboarding_interview" });
  // Opt out here deliberately: this document must prove onboarding_interview ALONE does not
  // cover attribution, and the DEFAULT convenience would otherwise auto-grant attribution too,
  // making that assertion vacuous.
  const seedWrongMoment = await seedVerifiedDocument({ firm, grantClassifyConsent: false });
  const rWrong = await enqueue(seedWrongMoment.documentId);
  assert.equal(rWrong.status, "failed",
    "the onboarding_interview moment alone does NOT authorize the attribution-moment classify gate");
  assert.equal(rWrong.reason, "firm_narrow_consent_inactive");

  const seed = await seedVerifiedDocument({ firm }); // no flag — the DEFAULT path grants attribution
  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "queued", `proceeds once the DEFAULT convenience grants the attribution moment (got ${JSON.stringify(r)})`);
});

test("prepare_firm_egress_dispatch: moment-scoped — an activation for one moment refuses uniformly 'unknown' for the OTHER moment, and requires a hash", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.B;
  await enableFirmNarrow(world.users.dave, { firm, moment: "attribution" });
  const sha = "b".repeat(64);

  const wrongMoment = await prepareFirmNarrowDispatch({ firm, moment: "onboarding_interview", sha });
  assert.deepEqual(wrongMoment, { verdict: "unknown", authorization_id: null },
    "the OTHER moment (not activated) is refused uniformly");

  const noSha = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha: null });
  assert.deepEqual(noSha, { verdict: "unknown", authorization_id: null },
    "firm-narrow is always document-tied: no hash refuses uniformly too");

  const granted = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha });
  assert.equal(granted.verdict, "granted");
  const row = (await rootQuery(
    "select purpose, moment, document_sha256 from clara.firm_egress_dispatch_authorizations where id=$1",
    [granted.authorization_id])).rows[0];
  assert.equal(row.purpose, "firm_narrow_intake");
  assert.equal(row.moment, "attribution");
  assert.equal(row.document_sha256, sha);
});

// ===========================================================================
// Kind vocabulary (AB-5/D-9): identity_document, settleable, not a refusal member.
// ===========================================================================

test("identity_document is a settleable kind: classify_document (>=0.8 confidence) and set_document_kind both accept it", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const seedC = await seedVerifiedDocument({ firm });
  const rC = await classifyDocument({ document: seedC.documentId, kind: "identity_document", confidence: 0.95 });
  assert.equal(rC.kind_set, true, `classify_document accepts identity_document (got ${JSON.stringify(rC)})`);
  assert.equal(rC.document_kind, "identity_document");

  const seedH = await seedVerifiedDocument({ firm });
  const rH = await setDocumentKind(world.users.alice, { document: seedH.documentId, kind: "identity_document" });
  assert.equal(rH.document_kind, "identity_document", `set_document_kind accepts identity_document (got ${JSON.stringify(rH)})`);

  const colCheck = await rootQuery(
    "select document_kind = 'identity_document' as ok from clara.documents where id=$1", [seedH.documentId]);
  assert.equal(colCheck.rows[0].ok, true, "documents.document_kind (CHECK-constrained) holds the value");
});

test("identity_document is NOT a DB_REFUSED_KINDS member on this frontier: the DB half is silent on refusal (runtime, PR-rho's job) — this cell proves only that the DB never blocks the kind itself", async (t) => {
  if (gate(t)) return;
  // Negative control: an off-vocabulary kind is still refused (CLR10), so the widening did not
  // accidentally open the CHECK/list beyond the one new value.
  const seed = await seedVerifiedDocument({ firm: world.firms.A });
  await assert.rejects(
    classifyDocument({ document: seed.documentId, kind: "not_a_real_kind", confidence: 0.95 }),
    /CLR10|unsupported document kind/,
    "an off-vocabulary kind is still refused");
});

// ===========================================================================
// firm_egress_dispatch_authorizations: THE UPDATE-GUARD TRIGGER PAIR (beta lane finding,
// conductor relay). Both polarities: an arbitrary UPDATE refuses; the lawful terminal
// transition (the one consume_egress_dispatch-shaped write) still succeeds.
// ===========================================================================

test("firm_egress_dispatch_authorizations update-guard: an arbitrary UPDATE (e.g. re-dating expires_at) on a LIVE authorization refuses CLR08", async (t) => {
  if (gate(t)) return;
  // firms.S already carries a live attribution activation from the earlier "DEFAULT
  // seedVerifiedDocument" differential-pair cell — reused here rather than re-granting
  // (grant is one-live-per-firm-purpose-moment, so a second grant call would duplicate_live).
  const firm = world.firms.S;
  const sha = "c".repeat(64);
  const granted = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha });
  assert.equal(granted.verdict, "granted");

  await assert.rejects(
    rootQuery("update clara.firm_egress_dispatch_authorizations set expires_at = expires_at + interval '1 hour' where id=$1", [granted.authorization_id]),
    /CLR08|exactly one terminal transition/,
    "an arbitrary UPDATE on a live (non-terminal) authorization is refused");

  await assert.rejects(
    rootQuery("delete from clara.firm_egress_dispatch_authorizations where id=$1", [granted.authorization_id]),
    /CLR08|historical/,
    "DELETE is refused — dispatch authorizations are historical");

  await assert.rejects(
    rootQuery("truncate clara.firm_egress_dispatch_authorizations"),
    /cannot be truncated/,
    "TRUNCATE is refused");
});

test("firm_egress_dispatch_authorizations update-guard: the LAWFUL terminal transition (consumed_at set, nothing else touched) still succeeds; a second terminal transition on the same row then refuses", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.S;
  const sha = "d".repeat(64);
  const granted = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha });
  assert.equal(granted.verdict, "granted");

  const consumed = await rootQuery(
    "update clara.firm_egress_dispatch_authorizations set consumed_at = now() where id=$1 returning consumed_at",
    [granted.authorization_id]);
  assert.ok(consumed.rows[0].consumed_at, "the lawful one-column terminal UPDATE (consumed_at) succeeds");

  await assert.rejects(
    rootQuery("update clara.firm_egress_dispatch_authorizations set invalidated_at = now(), invalidated_reason = 'double-terminal probe' where id=$1", [granted.authorization_id]),
    /CLR08|exactly one terminal transition/,
    "a SECOND terminal transition on an already-consumed row is refused — one terminal, once");
});

// ===========================================================================
// [Wave-F Track A, F-A7 gamma — independent γ review fold, 2026-08-25]
// F1/F2/F3/F4: the firm-narrow output wall's purpose constraint, its cell-36 negative twin,
// the multi-client/deactivate-revoke/owner-floor/evidence-doc adversarial surface the review's
// own zz-review-fa7gamma-adversarial.test.mjs battery forced (adopted here, adapted to this
// file's own fixture-convenience opt-out so a cell's PREMISE is never contaminated by the
// convenience's own default grant — the collision class the review's raw probes hit on C1/C2/
// F3/H2, none of which is a product defect: it is ADR-0075's fixture convenience firing as
// designed on a null-kind seed/file, exactly as the differential-pair cells above already prove).
// ===========================================================================

test("[cell 36, POSITIVE] persist_document_extraction's fact-generation branch is UNREACHABLE at this frontier: v_ekind is a two-valued (ocr|structured_parse) assignment, assigned exactly once", async (t) => {
  if (gate(t)) return;
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure"
  )).rows[0].prosrc;
  assert.match(src, /v_ekind:=case when t\.lane='ocr' then 'ocr' else 'structured_parse' end;/,
    "v_ekind is a two-valued assignment (ocr | structured_parse)");
  assert.equal(src.split("v_ekind:=").length - 1, 1, "v_ekind is assigned exactly once — no other value can reach the wall");
});

test("[cell 36, NEGATIVE TWIN — B/F1/F2 review fold] the wall's client-scoped predicate is FORCED (its exact live SQL, run standalone since v_ekind cannot reach a fact kind through the real call): a client with ONLY a live wiki_synthesis activation does NOT satisfy it; the same client WITH document_processing DOES", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const client = await createClient(world.users.alice, { name: `${world.prefix}_cell36neg`, opKey: opk("cli") });
  const wikiEv = await classifyEvidenceDoc(world.users.alice, { firm });
  await humanQuery(world.users.alice,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => 'wiki_synthesis',
       p_evidence_document => $2, p_scope_note => 'cell36 wiki', p_op_key => $3) as r`,
    [client, wikiEv.documentId, opk("gw")]);
  const wikiConsent = (await rootQuery(
    "select id from clara.client_egress_purpose_consents where client_id=$1 and purpose='wiki_synthesis' and revoked_at is null",
    [client])).rows[0].id;
  await humanQuery(world.users.alice,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => 'wiki_synthesis',
       p_consent => $2, p_op_key => $3)`, [client, wikiConsent, opk("aw")]);

  const doc = await seedVerifiedDocument({ firm, grantClassifyConsent: false });
  await fileDocument(world.users.alice, {
    document: doc.documentId, client,
    resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: doc.documentId }),
    grantClassifyConsent: false,
  });

  // [B/F1/fold-A review fold] the wall's predicate, READ OUT OF THE LIVE BODY every call
  // (not transcribed) so a live-body deletion of the purpose conjunct goes RED here: the
  // earlier transcribed version stayed green when the reviewer deleted
  // `and a.purpose='document_processing'` from the live persist_document_extraction, because
  // this cell's own copy of the SQL never re-read the body it claims to prove.
  const wallSatisfied = async () => {
    const src = (await rootQuery(
      "select prosrc from pg_proc where oid='clara.persist_document_extraction(uuid,text,integer,jsonb,jsonb,text,text,text)'::regprocedure"
    )).rows[0].prosrc;
    const start = src.indexOf("v_client_scoped := exists(");
    assert.ok(start > 0, "the wall's v_client_scoped assignment is present in the live body");
    const openParen = src.indexOf("(", start + "v_client_scoped := exists".length);
    const closeMarker = src.indexOf(");", openParen);
    assert.ok(closeMarker > openParen, "the exists(...) block closes with the expected ');' marker");
    const inner = src.slice(openParen + 1, closeMarker)
      .replace(/t\.document_id/g, "$1::uuid"); // t is the function-local task row; parameterize it
    const r = await rootQuery(`select exists(${inner}) as ok`, [doc.documentId]);
    return r.rows[0].ok;
  };

  assert.equal(await wallSatisfied(), false,
    "NEGATIVE: a live wiki_synthesis-only activation does not satisfy the document_processing wall");

  const dpEv = await classifyEvidenceDoc(world.users.alice, { firm });
  await humanQuery(world.users.alice,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_evidence_document => $2, p_scope_note => 'cell36 dp', p_op_key => $3) as r`,
    [client, dpEv.documentId, opk("gd")]);
  const dpConsent = (await rootQuery(
    "select id from clara.client_egress_purpose_consents where client_id=$1 and purpose='document_processing' and revoked_at is null",
    [client])).rows[0].id;
  await humanQuery(world.users.alice,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => 'document_processing',
       p_consent => $2, p_op_key => $3)`, [client, dpConsent, opk("ad")]);

  assert.equal(await wallSatisfied(), true,
    "POSITIVE CONTROL: the SAME client now holding document_processing DOES satisfy the wall — the predicate discriminates on purpose, not merely on liveness");
});

test("[F4-A multi-client fresh-insert] classify gate: a document filed to TWO clients holds with document_processing_multi_client, even when BOTH hold live document_processing consent", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const c1 = await createClient(world.users.alice, { name: `${world.prefix}_mcA`, opKey: opk("cli") });
  const c2 = await createClient(world.users.alice, { name: `${world.prefix}_mcB`, opKey: opk("cli") });
  await enableDP(world.users.alice, { firm, client: c1 });
  await enableDP(world.users.alice, { firm, client: c2 });
  const doc = await seedVerifiedDocument({ firm, grantClassifyConsent: false });
  // Raw-inserted filings (never through file_document/its convenience) so the gate's FRESH-
  // INSERT branch (v_flip = 0) is what is exercised, not a flip of an already-queued task.
  for (const cl of [c1, c2]) {
    await rootQuery(
      `insert into clara.document_filings(firm_id,document_id,client_id,basis,resolution_id,filed_by)
       values($1,$2,$3,'legacy-0007',null,null)`, [firm, doc.documentId, cl]);
  }
  const n = (await rootQuery(
    "select count(*)::int n from clara.document_filings where document_id=$1 and retired_at is null",
    [doc.documentId])).rows[0].n;
  assert.equal(n, 2, "PREMISE: two live filings exist");
  const r = await enqueue(doc.documentId);
  assert.equal(r.status, "failed", `multi-client must hold (got ${JSON.stringify(r)})`);
  assert.equal(r.reason, "document_processing_multi_client");
});

test("[F4-B deactivate/revoke invalidation UPDATEs] deactivate_firm_egress_purpose and revoke_firm_egress_purpose stamp their own historical row — deactivated_at/deactivated_by/deactivation_reason and revoked_at/revoked_by/revoke_reason respectively", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.B;
  const { consent } = await enableFirmNarrow(world.users.dave, { firm, moment: "onboarding_interview" });

  await humanQuery(world.users.dave,
    `select clara.deactivate_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'onboarding_interview',
       p_reason => 'F4-B probe', p_op_key => $1)`, [opk("dfn")]);
  const act = (await rootQuery(
    `select deactivated_at, deactivated_by, deactivation_reason from clara.firm_egress_purpose_activations
      where consent_id=$1 order by activated_at desc limit 1`, [consent])).rows[0];
  assert.ok(act.deactivated_at && act.deactivated_by && act.deactivation_reason,
    "deactivate_firm_egress_purpose stamps all three deactivation columns on the activation row");

  await humanQuery(world.users.dave,
    `select clara.revoke_firm_egress_purpose(p_purpose => 'firm_narrow_intake', p_moment => 'onboarding_interview',
       p_reason => 'F4-B probe', p_op_key => $1)`, [opk("rfn")]);
  const con = (await rootQuery(
    "select revoked_at, revoked_by, revoke_reason from clara.firm_egress_purpose_consents where id=$1",
    [consent])).rows[0];
  assert.ok(con.revoked_at && con.revoked_by && con.revoke_reason,
    "revoke_firm_egress_purpose stamps all three revocation columns on the consent row");
});

test("[F4-C owner floor] grant/activate/deactivate/revoke_firm_egress_purpose all refuse a BOOKKEEPER (body-enforced, CLR04)", async (t) => {
  if (gate(t)) return;
  // moment: onboarding_interview, not attribution — firm A's attribution moment is already
  // live by this point (an EARLIER differential-pair cell's DEFAULT seedVerifiedDocument call
  // lets the fixture convenience auto-grant it, ADR-0075's own framing); a distinct untouched
  // moment keeps this cell's refusals independent of that pre-existing, unrelated grant.
  const ev = await classifyEvidenceDoc(world.users.alice, { firm: world.firms.A });
  const isCLR04 = (e) => e.code === "CLR04";
  await assert.rejects(humanQuery(world.users.bob,
    `select clara.grant_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_evidence_document=>$1,p_scope_note=>'x',p_op_key=>$2)`, [ev.documentId, opk("x1")]),
    isCLR04, "grant by bookkeeper refuses");
  await assert.rejects(humanQuery(world.users.bob,
    `select clara.activate_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_consent=>gen_random_uuid(),p_op_key=>$1)`, [opk("x2")]),
    isCLR04, "activate by bookkeeper refuses");
  await assert.rejects(humanQuery(world.users.bob,
    `select clara.deactivate_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_reason=>'x',p_op_key=>$1)`, [opk("x3")]),
    isCLR04, "deactivate by bookkeeper refuses");
  await assert.rejects(humanQuery(world.users.bob,
    `select clara.revoke_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_reason=>'x',p_op_key=>$1)`, [opk("x4")]),
    isCLR04, "revoke by bookkeeper refuses");
});

test("[F4-D evidence-doc wall] grant_firm_egress_purpose refuses a NULL evidence doc, a non-consent_evidence doc, and a FOREIGN-firm consent_evidence doc; the same call with a live same-firm consent_evidence doc SUCCEEDS", async (t) => {
  if (gate(t)) return;
  // moment: onboarding_interview — see F4-C's own note; the positive-control grant below needs
  // a moment genuinely free of any prior live grant.
  const owner = world.users.alice, firm = world.firms.A;
  const isCLR28 = (e) => e.code === "CLR28";
  await assert.rejects(humanQuery(owner,
    `select clara.grant_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_evidence_document=>null,p_scope_note=>'x',p_op_key=>$1)`, [opk("e1")]),
    isCLR28, "null evidence refuses");

  const plain = await seedVerifiedDocument({ firm, grantClassifyConsent: false }); // kind NULL, not consent_evidence
  await assert.rejects(humanQuery(owner,
    `select clara.grant_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_evidence_document=>$1,p_scope_note=>'x',p_op_key=>$2)`, [plain.documentId, opk("e2")]),
    isCLR28, "wrong-kind evidence refuses");

  const foreign = await classifyEvidenceDoc(world.users.dave, { firm: world.firms.B });
  await assert.rejects(humanQuery(owner,
    `select clara.grant_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_evidence_document=>$1,p_scope_note=>'x',p_op_key=>$2)`, [foreign.documentId, opk("e3")]),
    isCLR28, "foreign-firm evidence refuses");

  const ev = await classifyEvidenceDoc(owner, { firm });
  const r = (await humanQuery(owner,
    `select clara.grant_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'onboarding_interview',
       p_evidence_document=>$1,p_scope_note=>'x',p_op_key=>$2) as r`, [ev.documentId, opk("e4")])).rows[0].r;
  assert.equal(r.status, "live", "POSITIVE CONTROL: a live, verified, same-firm consent_evidence doc succeeds");
});

// ===========================================================================
// [Wave-F Track A, F-A7 gamma — independent γ delta-probe fold, 2026-08-25]
// fold C (D4/D5): S12's new guard vs the REAL verbs it now sits under — deactivate/revoke's
// own invalidation UPDATE on a live dispatch authorization must still succeed through the
// guard, not just count triggers. fold B (D6): the two F3 tables' triggers FORCED in both
// polarities, not merely counted (a no-op trigger body would still count 2).
// ===========================================================================

test("[D4 fold-C] deactivate_firm_egress_purpose's invalidation UPDATE on a LIVE dispatch authorization still succeeds through S12's new guard", async (t) => {
  if (gate(t)) return;
  // firm S's attribution moment is already live by this point — an EARLIER differential-pair
  // cell's DEFAULT seedVerifiedDocument call lets the fixture convenience auto-grant it
  // (ADR-0075's own framing) — reused here rather than re-granting (one-live-per-firm-purpose-
  // moment), mirroring the update-guard cells above.
  const firm = world.firms.S;
  const preLive = await liveFirmNarrowConsent(firm, "attribution");
  assert.ok(preLive, "PREMISE: firm S's attribution moment is already live");
  const auth = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha: "f".repeat(64) });
  assert.equal(auth.verdict, "granted", "PREMISE: a live open authorization exists");

  await humanQuery(world.users.erin,
    `select clara.deactivate_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'attribution',
       p_reason=>'rev',p_op_key=>$1)`, [opk("dfn")]);
  const row = (await rootQuery(
    "select invalidated_at, invalidated_reason, consumed_at from clara.firm_egress_dispatch_authorizations where id=$1",
    [auth.authorization_id])).rows[0];
  assert.ok(row.invalidated_at, "the authorization WAS invalidated through the new guard");
  assert.equal(row.invalidated_reason, "activation_deactivated");
  assert.equal(row.consumed_at, null, "exactly one terminal");
});

test("[D5 fold-C] revoke_firm_egress_purpose's invalidation UPDATE on a LIVE dispatch authorization also succeeds through the same guard", async (t) => {
  if (gate(t)) return;
  // firm B's attribution moment is already live from the "prepare_firm_egress_dispatch:
  // moment-scoped" cell above (its OTHER moment, onboarding_interview, was the one F4-B
  // deactivated+revoked) — reused rather than re-granting.
  const firm = world.firms.B;
  const preLive = await liveFirmNarrowConsent(firm, "attribution");
  assert.ok(preLive, "PREMISE: firm B's attribution moment is already live");
  const auth = await prepareFirmNarrowDispatch({ firm, moment: "attribution", sha: "e".repeat(64) });
  assert.equal(auth.verdict, "granted", "PREMISE: a live open authorization exists");

  await humanQuery(world.users.dave,
    `select clara.revoke_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'attribution',
       p_reason=>'rev',p_op_key=>$1)`, [opk("rfn")]);
  const row = (await rootQuery(
    "select invalidated_at, invalidated_reason from clara.firm_egress_dispatch_authorizations where id=$1",
    [auth.authorization_id])).rows[0];
  assert.ok(row.invalidated_at, "the authorization WAS invalidated through the new guard");
  assert.equal(row.invalidated_reason, "consent_revoked");
});

test("[D6 fold-B] all three firm_egress_* tables carry the update-guard + no-truncate pair FORCED in both polarities, not merely trigger-counted", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const trg = (await rootQuery(
    `select c.relname, count(*)::int n from pg_class c join pg_namespace ns on ns.oid=c.relnamespace and ns.nspname='clara'
       join pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
      where c.relname like 'firm_egress%' group by c.relname order by c.relname`)).rows;
  assert.deepEqual(trg.map((r) => [r.relname, r.n]), [
    ["firm_egress_dispatch_authorizations", 2],
    ["firm_egress_purpose_activations", 2],
    ["firm_egress_purpose_consents", 2],
  ], "two triggers on each of the three tables");

  // REUSE, not fresh-grant: firm A's attribution moment is already live+ACTIVE by this point
  // (an early differential-pair cell's fixture-convenience side effect grants AND activates it,
  // ensureFirmNarrowAttribution's own shape) — a fresh grant_firm_egress_purpose call would
  // collide (one-live-per-firm-purpose-moment). onboarding_interview is NOT reusable here: F4-D
  // above only GRANTS it (its own cell never activates), so it carries no live activation row
  // for this cell's DELETE/UPDATE/TRUNCATE-on-the-activation-table probes to exercise.
  const consentId = await liveFirmNarrowConsent(firm, "attribution");
  assert.ok(consentId, "PREMISE: firm A's attribution moment is already live+active (the early fixture-convenience grant)");
  const actId = (await rootQuery(
    "select id from clara.firm_egress_purpose_activations where consent_id=$1 and deactivated_at is null", [consentId])).rows[0].id;

  await assert.rejects(rootQuery("delete from clara.firm_egress_purpose_consents where id=$1", [consentId]),
    /typed egress consents are historical/, "consent DELETE refused");
  await assert.rejects(rootQuery("update clara.firm_egress_purpose_consents set scope_note='tampered' where id=$1", [consentId]),
    /permits only one revocation/, "arbitrary consent UPDATE refused");
  await assert.rejects(rootQuery("truncate clara.firm_egress_purpose_consents"),
    /truncate/i, "consent TRUNCATE refused");

  await assert.rejects(rootQuery("delete from clara.firm_egress_purpose_activations where id=$1", [actId]),
    /typed egress activations are historical/, "activation DELETE refused");
  await assert.rejects(rootQuery("update clara.firm_egress_purpose_activations set purpose='firm_narrow_intake', activated_at=now() where id=$1", [actId]),
    /permits only one deactivation/, "arbitrary activation UPDATE refused");
  await assert.rejects(rootQuery("truncate clara.firm_egress_purpose_activations"),
    /truncate/i, "activation TRUNCATE refused");

  // dispatch authorizations: TRUNCATE refused here (UPDATE polarity already covered by the
  // two update-guard cells above + D4/D5's own invalidation-path proof).
  await assert.rejects(rootQuery("truncate clara.firm_egress_dispatch_authorizations"),
    /truncate/i, "dispatch-authorization TRUNCATE refused");

  await humanQuery(world.users.alice,
    `select clara.deactivate_firm_egress_purpose(p_purpose=>'firm_narrow_intake',p_moment=>'attribution',
       p_reason=>'lawful',p_op_key=>$1)`, [opk("d6")]);
  assert.ok((await rootQuery("select deactivated_at from clara.firm_egress_purpose_activations where id=$1", [actId]))
    .rows[0].deactivated_at, "POSITIVE CONTROL: the lawful deactivation went through the guard");
  await assert.rejects(rootQuery(
    "update clara.firm_egress_purpose_activations set deactivated_at=now(), deactivated_by=deactivated_by, deactivation_reason='again' where id=$1", [actId]),
    /permits only one deactivation/, "a SECOND deactivation is refused");
});
