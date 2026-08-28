// 裁-22 (docs/plan/active/mohe-grill-rulings-2026-08-28.md) -- agent proposal bases become
// DB-RESOLVED citations. Design of record: the migration's own header
// (packages/db/migrations/UNNUMBERED_proposal_basis_resolved.sql, claimed as 0143 on this rig).
//
// PART A exercises clara._resolve_proposal_basis DIRECTLY (root bypasses its ACL, same idiom
// pi's own tests use for _identifier_promotion_core) -- every refusal class, the document-SET
// widening (裁-18b), the kind discriminator (裁-21), dedup and current-generation resolution,
// independent of either door's own plumbing. PART B proves the two DOORS actually call it and
// persist the RESOLVED basis, never the caller's raw one -- judgement logic (review law 1),
// exercised through the real doors.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, ROLES, assertRaises, opk, rootQuery, roleQuery,
  wakeActor, runAs, namedCall, ensureReady, buildWorld, mintWake, endPool,
} from "./rig-fixtures.mjs";
import { seedVerifiedDocument, ensureFirmNarrowAttribution, seedExtraction, seedRegion } from "./rig-docs-fixtures.mjs";

let world;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select
       to_regprocedure('clara._resolve_proposal_basis(uuid[],uuid,jsonb)') is not null as resolver,
       to_regprocedure('clara.wake_propose_identifier_promotion(uuid,uuid,text,text,int,jsonb,text,jsonb,text)') is not null as d1,
       to_regprocedure('clara.wake_propose_client_onboarding(uuid,text,jsonb,text,jsonb,uuid,text)') is not null as d2`,
  );
  const row = catalog.rows[0];
  if (!row.resolver || !row.d1 || !row.d2) {
    if (process.env.CLARA_ALLOW_MISSING_PROPOSAL_BASIS !== "1") {
      throw new Error(
        `proposal-basis-resolved premise missing (resolver=${row.resolver}, d1=${row.d1}, d2=${row.d2}) and ` +
        "CLARA_ALLOW_MISSING_PROPOSAL_BASIS is unset -- this is a FOCUSED run and must fail loudly, not skip.",
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
    t.skip("rig not ready: either ensureReady() found no draft_entry, or 裁-22's own catalog gate found _resolve_proposal_basis / the two doors absent");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const validModel = () => ({ provider: "openai", model: "gpt-5.6-terra", version: "2026-08-01" });

async function mintFiling(onBehalfOf = null) {
  return mintWake({ kind: "filing", firm: world.firms.A, onBehalfOf });
}

async function freshDoc(firm = world.firms.A) {
  return seedVerifiedDocument({ firm, kind: "invoice" });
}

/** One extraction (done, ocr) + one region for `documentId`. Returns both ids plus a
 *  ready-to-use `{region_id}` citation element. */
async function seedOneRegion(documentId, firm = world.firms.A, extra = {}) {
  const extraction = await seedExtraction({ firm, document: documentId, ...extra.extraction });
  const region = await seedRegion({ firm, extraction, ...extra.region });
  return { extraction, region, citation: { region_id: region } };
}

/** TWO regions on the SAME extraction of `documentId` (the (document,engine_id,version_n)
 *  uniqueness a second seedOneRegion call would collide on -- one extraction, two field
 *  paths). */
async function seedTwoRegionsOneExtraction(documentId, firm = world.firms.A) {
  const extraction = await seedExtraction({ firm, document: documentId });
  const a = await seedRegion({ firm, extraction, fieldPath: "invoice.total" });
  const b = await seedRegion({ firm, extraction, fieldPath: "invoice.customer_name" });
  return { extraction, a, b, citationA: { region_id: a }, citationB: { region_id: b } };
}

/** clara._resolve_proposal_basis(...) called directly as root (its ACL is irrelevant to a
 *  superuser -- the same idiom f-a7-pi.test.mjs's own proposeCard() uses for
 *  _identifier_promotion_core, also ungranted). */
async function resolveBasis(documents, firm, basis) {
  return rootQuery(
    "select clara._resolve_proposal_basis(p_documents => $1::uuid[], p_firm => $2, p_basis => $3::jsonb) as result",
    [documents, firm, JSON.stringify(basis)],
  );
}
async function resolveBasisRaises(documents, firm, basis, label) {
  const err = await assertRaises(CLR.badRequest, () => resolveBasis(documents, firm, basis), label);
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "basis_unresolved", `${label}: refuses with the named reason`);
  return err;
}

/** clara.wake_propose_identifier_promotion(...) via a filing wake credential -- the 9-arg,
 *  裁-22 signature (p_document is the 2nd positional). */
function wakeProposeIdentifierPromotion(secret, o) {
  const specs = [
    { name: "p_client" }, { name: "p_document" }, { name: "p_kind" }, { name: "p_value" },
    { name: "p_sightings", cast: "int" }, { name: "p_citations", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const vals = [
    o.client, o.document ?? null, o.kind ?? "ssm", o.value,
    "sightings" in o ? o.sightings : 1, JSON.stringify(o.citations ?? [{ region_id: null }]),
    o.rationale ?? "rig rationale", JSON.stringify(o.model ?? validModel()), o.opKey ?? opk("wpip22"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_identifier_promotion", specs), vals);
}

let _firmNarrowArmed = false;
async function ensureFirmNarrowActivated() {
  if (_firmNarrowArmed) return;
  await ensureFirmNarrowAttribution({ firm: world.firms.A });
  _firmNarrowArmed = true;
}
/** Local copy of f-a7b-pr-a.test.mjs's own freshAuthorization -- not exported there. */
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

function wakeProposeClientOnboarding(secret, o) {
  const specs = [
    { name: "p_document" }, { name: "p_proposed_name" }, { name: "p_basis", cast: "jsonb" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_authorization" },
    { name: "p_op_key" },
  ];
  const vals = [
    o.document ?? null,
    o.proposedName ?? `Northgate22 ${Math.random().toString(36).slice(2, 10)} Sdn Bhd`,
    JSON.stringify("basis" in o ? o.basis : { sightings: 1, citations: [{ region_id: null }] }),
    o.rationale ?? "rig rationale: printed party name matches no known client",
    JSON.stringify(o.model ?? validModel()),
    o.authorization ?? null,
    o.opKey ?? opk("wpco22"),
  ];
  return runAs(wakeActor("clara_wake_filing", secret), namedCall("wake_propose_client_onboarding", specs), vals);
}

// ===========================================================================
// PART A -- clara._resolve_proposal_basis, direct
// ===========================================================================

test("resolver: a valid single citation resolves -- region ids + DB-derived sightings=1", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const { region, extraction, citation } = await seedOneRegion(doc.documentId);
  const r = await resolveBasis([doc.documentId], world.firms.A, { sightings: 99, citations: [citation] });
  const out = r.rows[0].result;
  assert.equal(out.sightings, 1, "sightings is DERIVED (1 distinct region), never the caller's 99");
  assert.equal(out.citations.length, 1);
  assert.equal(out.citations[0].region_id, region);
  assert.equal(out.citations[0].extraction_id, extraction);
  assert.equal(out.citations[0].document_id, doc.documentId);
});

test("resolver: the SAME region cited twice dedupes -- one resolved citation, sightings=1", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const { citation } = await seedOneRegion(doc.documentId);
  const r = await resolveBasis([doc.documentId], world.firms.A, { sightings: 1, citations: [citation, citation] });
  const out = r.rows[0].result;
  assert.equal(out.citations.length, 1, "deduped to one resolved region");
  assert.equal(out.sightings, 1);
});

test("resolver: two DISTINCT regions -> sightings=2, both resolved, first-seen order", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const { a, b, citationA, citationB } = await seedTwoRegionsOneExtraction(doc.documentId);
  const r = await resolveBasis([doc.documentId], world.firms.A,
    { sightings: 1, citations: [citationB, citationA] });
  const out = r.rows[0].result;
  assert.equal(out.sightings, 2);
  assert.deepEqual(out.citations.map((c) => c.region_id), [b, a], "first-seen order preserved");
});

test("resolver: [null] refuses named basis_unresolved, naming the offending element", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A, { sightings: 1, citations: [null] }, "[null] citation");
});

test("resolver: [\"\"] refuses named basis_unresolved", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A, { sightings: 1, citations: [""] }, "[\"\"] citation");
});

test("resolver: a region_id that does not exist refuses", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A,
    { sightings: 1, citations: [{ region_id: "00000000-0000-4000-8000-000000000000" }] },
    "nonexistent region_id");
});

test("resolver: a region belonging to a document NOT in the document set refuses (foreign-document)", async (t) => {
  if (unready(t)) return;
  const docA = await freshDoc();
  const docOther = await freshDoc();
  const { citation } = await seedOneRegion(docOther.documentId); // region belongs to docOther
  await resolveBasisRaises([docA.documentId], world.firms.A, { sightings: 1, citations: [citation] },
    "region of a document outside the set");
});

test("resolver: a region belonging to a FIRM-B document refuses (foreign-firm), even if the same id happened to be named", async (t) => {
  if (unready(t)) return;
  const docB = await freshDoc(world.firms.B);
  const { citation } = await seedOneRegion(docB.documentId, world.firms.B);
  await resolveBasisRaises([docB.documentId], world.firms.A, { sightings: 1, citations: [citation] },
    "firm-B region resolved against firm A");
});

test("resolver: a document in p_documents that is not in this firm refuses the WHOLE call, even unused", async (t) => {
  if (unready(t)) return;
  const docA = await freshDoc();
  const docB = await freshDoc(world.firms.B);
  const { citation } = await seedOneRegion(docA.documentId);
  await resolveBasisRaises([docA.documentId, docB.documentId], world.firms.A,
    { sightings: 1, citations: [citation] }, "a foreign-firm document sitting unused in the set");
});

test("resolver: a citation on a SUPERSEDED extraction generation refuses; the newer generation resolves", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const oldExtraction = await seedExtraction({ firm: world.firms.A, document: doc.documentId, versionN: 1 });
  const oldRegion = await seedRegion({ firm: world.firms.A, extraction: oldExtraction, fieldPath: "invoice.total" });
  const newExtraction = await seedExtraction({ firm: world.firms.A, document: doc.documentId, versionN: 2 });
  const newRegion = await seedRegion({ firm: world.firms.A, extraction: newExtraction, fieldPath: "invoice.total" });
  // Both extractions now exist -- version_n=2 is CURRENT, version_n=1 is superseded.
  await resolveBasisRaises([doc.documentId], world.firms.A,
    { sightings: 1, citations: [{ region_id: oldRegion }] }, "citation on the SUPERSEDED (version_n=1) generation");
  const r = await resolveBasis([doc.documentId], world.firms.A, { sightings: 1, citations: [{ region_id: newRegion }] });
  assert.equal(r.rows[0].result.citations[0].region_id, newRegion, "the CURRENT (version_n=2) generation resolves");
});

test("resolver: an extraction that never completed (status='failed') is never CURRENT -- its region refuses", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const failed = await seedExtraction({ firm: world.firms.A, document: doc.documentId, versionN: 1, status: "failed" });
  const region = await seedRegion({ firm: world.firms.A, extraction: failed });
  await resolveBasisRaises([doc.documentId], world.firms.A, { sightings: 1, citations: [{ region_id: region }] },
    "region of a failed (never-done) extraction");
});

test("resolver: kind='region' (explicit) resolves identically to an absent kind", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  const { region, citation } = await seedOneRegion(doc.documentId);
  const r = await resolveBasis([doc.documentId], world.firms.A,
    { sightings: 1, citations: [{ kind: "region", ...citation }] });
  assert.equal(r.rows[0].result.citations[0].region_id, region);
});

test("resolver: 裁-21's reserved kind='fact' refuses fail-closed (the arm is not built)", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A,
    { sightings: 1, citations: [{ kind: "fact", client_fact: "msic" }] }, "kind='fact', reserved but unbuilt");
});

test("resolver: an unknown kind refuses fail-closed", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A,
    { sightings: 1, citations: [{ kind: "bogus", region_id: "00000000-0000-4000-8000-000000000000" }] },
    "an unrecognised kind");
});

test("resolver: a TWO-document set resolves citations spanning both documents; sightings counts across the whole set", async (t) => {
  if (unready(t)) return;
  const docX = await freshDoc();
  const docY = await freshDoc();
  const x = await seedOneRegion(docX.documentId);
  const y = await seedOneRegion(docY.documentId);
  const r = await resolveBasis([docX.documentId, docY.documentId], world.firms.A,
    { sightings: 1, citations: [x.citation, y.citation] });
  const out = r.rows[0].result;
  assert.equal(out.sightings, 2);
  const byDoc = Object.fromEntries(out.citations.map((c) => [c.region_id, c.document_id]));
  assert.equal(byDoc[x.region], docX.documentId, "x's region resolves against docX");
  assert.equal(byDoc[y.region], docY.documentId, "y's region resolves against docY");
});

test("resolver: a null / empty document set refuses", async (t) => {
  if (unready(t)) return;
  await resolveBasisRaises(null, world.firms.A, { sightings: 1, citations: [{ region_id: null }] }, "null document set");
  await resolveBasisRaises([], world.firms.A, { sightings: 1, citations: [{ region_id: null }] }, "empty document set");
});

test("resolver: a non-object basis, a missing citations array, and an empty citations array all refuse (the pre-existing shape floor, re-proven inside the resolver)", async (t) => {
  if (unready(t)) return;
  const doc = await freshDoc();
  await resolveBasisRaises([doc.documentId], world.firms.A, [], "array basis, not an object");
  await resolveBasisRaises([doc.documentId], world.firms.A, { sightings: 1 }, "no citations key at all");
  await resolveBasisRaises([doc.documentId], world.firms.A, { sightings: 1, citations: [] }, "empty citations array");
});

// ===========================================================================
// PART B -- the two doors: they call the resolver, and persist the RESOLVED basis
// ===========================================================================

test("wake_propose_identifier_promotion: persists the RESOLVED region + DB-derived sightings; the model's claimed sightings survives ONLY as the honest sightings_claimed annotation", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { region } = await seedOneRegion(doc.documentId);
  const r = await wakeProposeIdentifierPromotion(secret, {
    client: world.clients.A1, document: doc.documentId, kind: "ssm", value: `SSM22${Date.now()}`,
    sightings: 7, // deliberately WRONG -- only one distinct region is cited
    citations: [{ region_id: region }],
  });
  const card = await rootQuery(
    "select sightings, sightings_claimed, citations from clara.client_identifier_promotions where id=$1",
    [r.rows[0].result.promotion_id]);
  assert.equal(card.rows[0].sightings, 1, "sightings is DB-DERIVED (one distinct resolved region), never the model's 7");
  assert.equal(card.rows[0].sightings_claimed, 7, "the model's original claim survives as a pure annotation");
  assert.equal(card.rows[0].citations.length, 1);
  assert.equal(card.rows[0].citations[0].region_id, region, "the persisted citation is the RESOLVED region, not the caller's raw element");
});

test("wake_propose_identifier_promotion: refuses on an unresolvable citation (typed, named reason), and writes NO promotion row", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const before = await rootQuery("select count(*)::int n from clara.client_identifier_promotions where client_id=$1", [world.clients.A1]);
  const err = await assertRaises(CLR.badRequest,
    () => wakeProposeIdentifierPromotion(secret, {
      client: world.clients.A1, document: doc.documentId, value: `SSM22b${Date.now()}`, citations: [null],
    }),
    "unresolvable [null] citation through the door");
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "basis_unresolved");
  const after = await rootQuery("select count(*)::int n from clara.client_identifier_promotions where client_id=$1", [world.clients.A1]);
  assert.equal(after.rows[0].n, before.rows[0].n, "a refused resolution writes no card");
});

test("wake_propose_identifier_promotion: requires the triggering document (null document refuses)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  await assertRaises(CLR.badRequest,
    () => wakeProposeIdentifierPromotion(secret, { client: world.clients.A1, document: null, value: `SSM22c${Date.now()}` }),
    "null document");
});

test("wake_propose_identifier_promotion: a citation from ANOTHER document (not the one named as p_document) refuses -- the door is genuinely document-bound, not merely shape-checked", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const docNamed = await freshDoc();
  const docOther = await freshDoc();
  const { citation } = await seedOneRegion(docOther.documentId);
  await assertRaises(CLR.badRequest,
    () => wakeProposeIdentifierPromotion(secret, {
      client: world.clients.A1, document: docNamed.documentId, value: `SSM22d${Date.now()}`, citations: [citation],
    }),
    "citation belongs to a document other than the one named");
});

test("wake_propose_client_onboarding: persists the RESOLVED basis in BOTH the receipt.verdict AND the firm_open_questions candidate, with sightings DERIVED and the model's claim kept as sightings_model", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { region, extraction } = await seedOneRegion(doc.documentId);
  const authorization = await freshAuthorization(doc.sha256);
  const r = await wakeProposeClientOnboarding(secret, {
    document: doc.documentId, authorization,
    basis: { sightings: 3, citations: [{ region_id: region }] }, // model claims 3, only 1 distinct region
  });
  const result = r.rows[0].result;

  const receipt = await rootQuery("select verdict from clara.onboarding_agent_receipts where id=$1", [result.receipt_id]);
  const rv = receipt.rows[0].verdict;
  assert.equal(rv.basis.sightings, 1, "receipt.verdict.basis.sightings is DB-derived");
  assert.equal(rv.basis.sightings_model, 3, "the model's raw claim rides as an honest annotation");
  assert.equal(rv.basis.citations.length, 1);
  assert.equal(rv.basis.citations[0].region_id, region);
  assert.equal(rv.basis.citations[0].extraction_id, extraction);

  const q = await rootQuery("select candidates from clara.firm_open_questions where id=$1", [result.question_id]);
  const cb = q.rows[0].candidates[0].basis;
  assert.equal(cb.sightings, 1, "the needs-you candidate carries the SAME resolved basis as the receipt");
  assert.equal(cb.sightings_model, 3);
  assert.equal(cb.citations[0].region_id, region);
});

test("wake_propose_client_onboarding: an unresolvable citation refuses (typed, named reason) and does NOT consume the authorization -- the same authorization then succeeds with a corrected basis", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const authorization = await freshAuthorization(doc.sha256);
  const err = await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, {
      document: doc.documentId, authorization, basis: { sightings: 1, citations: [null] },
    }),
    "unresolvable basis through the onboarding door");
  assert.equal(JSON.parse(err.detail ?? "{}").reason, "basis_unresolved");
  const authRow = await rootQuery("select consumed_at from clara.firm_egress_dispatch_authorizations where id=$1", [authorization]);
  assert.equal(authRow.rows[0].consumed_at, null, "a basis that fails to resolve must NOT burn the one-time-use authorization");

  const { region } = await seedOneRegion(doc.documentId);
  const r = await wakeProposeClientOnboarding(secret, {
    document: doc.documentId, authorization, basis: { sightings: 1, citations: [{ region_id: region }] },
  });
  assert.ok(r.rows[0].result.question_id, "the preserved authorization still succeeds with a corrected, resolvable basis");
});

test("wake_propose_client_onboarding: an identical replay on the same op_key is served from the reservation cache -- no re-resolution needed, identical result, exactly one receipt", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { region } = await seedOneRegion(doc.documentId);
  const authorization = await freshAuthorization(doc.sha256);
  const opKey = opk("wpco22-replay");
  const basis = { sightings: 1, citations: [{ region_id: region }] };
  const proposedName = `Northgate22 ${Math.random().toString(36).slice(2, 10)} Sdn Bhd`;
  const first = await wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization, basis, opKey, proposedName });
  const second = await wakeProposeClientOnboarding(secret, { document: doc.documentId, authorization, basis, opKey, proposedName });
  assert.deepEqual(second.rows[0].result, first.rows[0].result, "replay returns the identical result");
  const n = await rootQuery("select count(*)::int n from clara.onboarding_agent_receipts where document_id=$1", [doc.documentId]);
  assert.equal(n.rows[0].n, 1, "exactly one receipt, not two");
});

test("wake_propose_client_onboarding: a CHANGED basis under the SAME op_key refuses through the pre-existing op-key-reused wall (never silently re-resolves to a different card)", async (t) => {
  if (unready(t)) return;
  const { secret } = await mintFiling();
  const doc = await freshDoc();
  const { a, b, citationA, citationB } = await seedTwoRegionsOneExtraction(doc.documentId);
  const authorization = await freshAuthorization(doc.sha256);
  const opKey = opk("wpco22-changed");
  const proposedName = `Northgate22 ${Math.random().toString(36).slice(2, 10)} Sdn Bhd`;
  await wakeProposeClientOnboarding(secret, {
    document: doc.documentId, authorization, opKey, proposedName, basis: { sightings: 1, citations: [citationA] },
  });
  await assertRaises(CLR.badRequest,
    () => wakeProposeClientOnboarding(secret, {
      document: doc.documentId, authorization, opKey, proposedName, basis: { sightings: 1, citations: [citationB] },
    }),
    "same op_key, a genuinely different basis");
  assert.notEqual(a, b, "sanity: the two regions really are distinct");
});
