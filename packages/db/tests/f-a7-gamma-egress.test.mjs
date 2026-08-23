// F-A7 gamma battery — Wave-F Track A, PR-gamma (the egress train, window D1-gamma).
//
// Proves the behaviors UNNUMBERED_f_a7_gamma_egress.sql adds: the 5th client purpose
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
import { buildWorld, freshResolution } from "./rig-fixtures.mjs";
import { seedVerifiedDocument, fileDocument } from "./rig-docs-fixtures.mjs";
import { classifyDocument, setDocumentKind } from "./a21-helpers.mjs";

let live = false;
let world = null;

/** Gamma-specific readiness: the 5-value purpose CHECK + the firm_egress_purpose_consents
 *  table, both live only once UNNUMBERED_f_a7_gamma_egress.sql has applied. */
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
  const seed = await seedVerifiedDocument({ firm, kind: "consent_evidence" });
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
// ===========================================================================

test("classify enqueue, FILED document, no document_processing consent: holds — no queued task, a terminal never-claimed failed receipt, code document_processing_consent_inactive", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A2;
  const seed = await seedVerifiedDocument({ firm: world.firms.A }); // document_kind NULL
  await fileDocument(world.users.alice, {
    document: seed.documentId, client,
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

test("classify enqueue, FILED document, WITH document_processing consent: proceeds — a queued classify task", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.A;
  const client = world.clients.A1; // already document_processing-enabled by the earlier test, but re-enable is idempotent-refused; use a fresh doc instead
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(world.users.alice, {
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

test("classify enqueue, UNFILED document, no firm-narrow attribution activation: holds — code firm_narrow_consent_inactive", async (t) => {
  if (gate(t)) return;
  // A fresh firm with NO firm-narrow consent granted yet, so the negative is real.
  const seed = await seedVerifiedDocument({ firm: world.firms.B }); // client=null: unfiled
  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "failed", `holds (got ${JSON.stringify(r)})`);
  assert.equal(r.reason, "firm_narrow_consent_inactive");
  const rows = await taskRows(seed.documentId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].error_code, "firm_narrow_consent_inactive");
});

test("classify enqueue, UNFILED document, WITH the firm-narrow ATTRIBUTION moment activated: proceeds — a queued classify task; the ONBOARDING_INTERVIEW moment alone does not cover it", async (t) => {
  if (gate(t)) return;
  const firm = world.firms.S;
  await enableFirmNarrow(world.users.erin, { firm, moment: "onboarding_interview" });
  const seedWrongMoment = await seedVerifiedDocument({ firm });
  const rWrong = await enqueue(seedWrongMoment.documentId);
  assert.equal(rWrong.status, "failed",
    "the onboarding_interview moment alone does NOT authorize the attribution-moment classify gate");
  assert.equal(rWrong.reason, "firm_narrow_consent_inactive");

  await enableFirmNarrow(world.users.erin, { firm, moment: "attribution" });
  const seed = await seedVerifiedDocument({ firm });
  const r = await enqueue(seed.documentId);
  assert.equal(r.status, "queued", `proceeds once the attribution moment is activated (got ${JSON.stringify(r)})`);
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
