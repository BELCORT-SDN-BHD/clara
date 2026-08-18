// F-A1 — clara.evaluate_witness_fact_state_v1: THE PREDICATE BATTERY.
//
// Every cell in Annex C's "Predicate" block, plus the identity set. The companion file
// f-a1-dispatch.test.mjs carries the Continuity, end-to-end-evidence and wall cells.
//
// CONTRACT-BLIND WHERE IT MATTERS (▣ in Annex C): the writer (`clara.persist_witness_facts`) is a
// sibling lane's deliverable and does not exist. These cells are written from the DESIGN's
// envelope contract (f-a1-fixtures.mjs states it in full), never from the writer's code, so a
// later divergence between the two is a FINDING rather than a silently-agreeing pair.
//
// THE POSTING-AUTHORITY CLAIM THIS BATTERY EXISTS TO CHECK: `corroborated: true` is what makes a
// document's total postable unattended. So the cells are written as an EXACT DIFF around one
// corroborating base shape — each negative cell changes ONE thing and asserts the verdict flips
// to false. A cell that merely showed "false" without showing the corroborating twin would prove
// nothing about whether the term it names is the term doing the work.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, firmOf, grantConsent, seedCitedDocument,
  witnessReady, witnessShape, landWitnessPair, evaluatePair, addIdentifier, box, money, BELT,
} from "./f-a1-fixtures.mjs";

let world = null;
let live = false;

before(async () => {
  world = await buildWorld();
  live = await witnessReady();   // THROWS on a half-applied lane; false only when genuinely absent
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A1 predicate lane not applied — clara.evaluate_witness_fact_state_v1 absent"); return true; }
  return false;
};

// LAI LOU MEI, the real document from the refusal record: 94.30 + 3.77 + 5.66 + 0.02 = 103.75.
// The shape the pre-X3 identity gets WRONG and the six-term identity gets right — so a base case
// that ties here is exercising the corrected identity, not a trivially additive one.
const BASE = {
  "invoice.total": 10375, "invoice.total_excl_tax": 9430, "invoice.tax_total": 566,
  "invoice.rounding": 2, "invoice.service_charge": 377,
  "invoice.currency": "MYR", "invoice.type_code": "01",
};

/** Seed a filed invoice document and land one witness pair over `shape`. The subject follows the
 *  CLIENT's firm (A1/A2 -> alice, B1 -> dave, S1 -> erin): a cross-firm subject is refused by the
 *  governed door, which is the isolation working, not a fixture nicety. */
const subFor = (c) => (c === world.clients.B1 ? world.users.dave
  : c === world.clients.S1 ? world.users.erin : world.users.alice);

async function witnessDoc(shapeArgs = {}, { client = null } = {}) {
  const c = client ?? world.clients.A1;
  const sub = subFor(c);
  const firm = await firmOf(c);
  await grantConsent(sub, { firm, client: c }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client: c, kind: "invoice" });
  const shape = witnessShape({ fields: BASE, ...shapeArgs });
  const pair = await landWitnessPair(cited.documentId, shape);
  return { cited, pair, shape, client: c };
}

const verdict = async ({ cited, pair }) => evaluatePair(cited.documentId, pair.textId, pair.visionId);

// ===========================================================================
// The base case, and what "byte-compatible with the live key set" means here.
// ===========================================================================

test("sen-exact agreement corroborates, and the envelope carries the live key set under 0023's conditional-append RULES", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc();
  const s = await verdict(d);
  assert.equal(s.corroborated, true, "the base witness pair corroborates");
  // The eleven always-emitted keys (0023:348-356) plus the two witness-regime-only ones.
  for (const k of ["extraction_id", "version_n", "total_region_id", "total_cents", "total_fact_hash",
    "currency", "invoice_id", "invoice_date", "corroboration_ineligible", "corroborated",
    "explicit_non_myr", "regime", "vision_extraction_id"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(s, k), `envelope always carries ${k}`);
  }
  assert.equal(s.extraction_id, d.pair.textId, "the canonical extraction_id is the TEXT row (§3.1)");
  assert.equal(s.vision_extraction_id, d.pair.visionId);
  assert.equal(s.regime, "witness");
  assert.equal(s.total_cents, 10375);
  assert.equal(s.currency, "MYR");
  assert.equal(s.explicit_non_myr, false);
  assert.equal(s.total_excl_tax_cents, 9430);
  assert.equal(s.tax_total_cents, 566);
  assert.equal(s.rounding_cents, 2);
  assert.equal(s.type_code, "01");
  // CONDITIONAL APPEND, not always-emit-all: this document prints no customer block, so the two
  // identity keys are ABSENT rather than null (0023:357-364's exact-diff rule).
  assert.equal(Object.prototype.hasOwnProperty.call(s, "customer_name"), false,
    "customer_name is APPENDED only when non-null");
  assert.equal(Object.prototype.hasOwnProperty.call(s, "customer_registration"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(s, "vendor_registration_verdict"), false,
    "no identity verdict key when the witness cited no registration");
  // total_fact_hash is the DB's own equation over the cited region.
  const h = await rootQuery(
    `select clara._fact_hash(r.extraction_id,r.id,r.field_path,r.text_content,r.monetary_cents) as h
       from clara.document_regions r where r.id=$1`, [s.total_region_id]);
  assert.equal(s.total_fact_hash, h.rows[0].h, "total_fact_hash is clara._fact_hash of the cited region");
});

test("ONE SEN of disagreement between the channels refuses — the vision channel's cents are re-derived from its quoted rendering, never taken from the model", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc({ visionOverride: { "invoice.total": 10376 } });
  const s = await verdict(d);
  assert.equal(s.corroborated, false, "a one-sen split on the gross refuses");
  // …and the same document with the channels agreeing DOES corroborate: the term doing the work
  // is the agreement, not some other wall that happened to be failing too.
  assert.equal((await verdict(await witnessDoc())).corroborated, true);
});

test("a MODEL-ASSERTED cents field is ignored: the vision answer's own `cents` cannot override its rendering", async (t) => {
  if (gate(t)) return;
  const shape = witnessShape({ fields: BASE });
  // The vision witness claims 103.76 in prose while asserting 10375 as an integer. PRD §6: no
  // model-generated numeral enters the comparison — the DB normalizes the RENDERING.
  shape.visionEnvelope.witness.answers["invoice.total"] = { state: "value", raw: "RM 103.76", cents: 10375 };
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const pair = await landWitnessPair(cited.documentId, shape);
  const s = await evaluatePair(cited.documentId, pair.textId, pair.visionId);
  assert.equal(s.corroborated, false, "the asserted integer does not rescue a disagreeing rendering");
});

// ===========================================================================
// The 0023 belt set, carried in full.
// ===========================================================================

test("the TRANSPOSED net/tax counterexample refuses — arithmetic self-consistency is not agreement", async (t) => {
  if (gate(t)) return;
  // The executed counterexample from 0023:180-187: a real bill of net 94 / tax 6 / total 100,
  // mis-read with the components TRANSPOSED. The identity still ties (6 + 94 = 100) and the
  // supplier floor would tie its SST leg to the FALSE tax.
  const honest = { "invoice.total": 10000, "invoice.total_excl_tax": 9400, "invoice.tax_total": 600,
    "invoice.currency": "MYR", "invoice.type_code": "01" };
  const ok = await witnessDoc({ fields: honest });
  assert.equal((await verdict(ok)).corroborated, true, "the honest reading corroborates");
  // Now transpose on the VISION channel only: the identity still ties on each side alone, but the
  // per-field agreement does not hold — which is the whole point of two channels.
  const bad = await witnessDoc({ fields: honest, visionOverride: { "invoice.total_excl_tax": 600, "invoice.tax_total": 9400 } });
  assert.equal((await verdict(bad)).corroborated, false, "a transposed pair refuses");
});

test("the ROUNDING-FORGE counterexample refuses: |rounding| <= 99 is carried (0023:334-341)", async (t) => {
  if (gate(t)) return;
  // Executed forge: subtotal 200.00, zero tax, a parsed `Rounding -100.00` and a stated total of
  // 100.00 certifies 200 - 100 = 100. The entry would post with no rounding leg at all.
  const forge = { "invoice.total": 10000, "invoice.total_excl_tax": 20000, "invoice.tax_total": 0,
    "invoice.rounding": -10000, "invoice.currency": "MYR", "invoice.type_code": "01" };
  const s = await verdict(await witnessDoc({ fields: forge }));
  assert.equal(s.corroborated, false, "an unbounded negative rounding cannot balance a forged gross");
  // A LAWFUL rounding of the same sign passes, so the term under test is the BOUND, not the sign.
  const lawful = { "invoice.total": 9999, "invoice.total_excl_tax": 10000, "invoice.tax_total": 0,
    "invoice.rounding": -1, "invoice.currency": "MYR", "invoice.type_code": "01" };
  assert.equal((await verdict(await witnessDoc({ fields: lawful }))).corroborated, true,
    "a 1-sen rounding adjustment is exactly what the word can mean");
});

test("the SIGN BELT refuses a negative component (the discount SUBTRACTS, so a negative one forges a larger gross)", async (t) => {
  if (gate(t)) return;
  const forge = { "invoice.total": 20000, "invoice.total_excl_tax": 10000, "invoice.tax_total": 0,
    "invoice.discount": -10000, "invoice.currency": "MYR", "invoice.type_code": "01" };
  assert.equal((await verdict(await witnessDoc({ fields: forge }))).corroborated, false);
  const honest = { "invoice.total": 9000, "invoice.total_excl_tax": 10000, "invoice.tax_total": 0,
    "invoice.discount": 1000, "invoice.currency": "MYR", "invoice.type_code": "01" };
  assert.equal((await verdict(await witnessDoc({ fields: honest }))).corroborated, true,
    "a positive discount ties the six-term identity");
});

test("amount_due absent-or-equal, and deposit absent-or-zero (0023:307-308)", async (t) => {
  if (gate(t)) return;
  const due = (v) => ({ ...BASE, "invoice.amount_due": v });
  assert.equal((await verdict(await witnessDoc({ fields: due(10375) }))).corroborated, true,
    "amount_due EQUAL to the gross corroborates");
  assert.equal((await verdict(await witnessDoc({ fields: due(9000) }))).corroborated, false,
    "amount_due unequal to the gross refuses");
  assert.equal((await verdict(await witnessDoc({ fields: { ...BASE, "invoice.deposit": 0 } }))).corroborated, true,
    "an explicit ZERO deposit corroborates");
  assert.equal((await verdict(await witnessDoc({ fields: { ...BASE, "invoice.deposit": 5000 } }))).corroborated, false,
    "a non-zero deposit refuses");
});

test("THE NIL-TAX LAW: an unstated tax NEVER infers zero, and `not_printed` is the answer that says so", async (t) => {
  if (gate(t)) return;
  const noTax = { "invoice.total": 10000, "invoice.total_excl_tax": 10000, "invoice.currency": "MYR", "invoice.type_code": "01" };
  const s = await verdict(await witnessDoc({ fields: noTax }));
  assert.equal(s.corroborated, false, "tax not_printed refuses — a document that does not state its tax has proven nothing about it");
  assert.equal(Object.prototype.hasOwnProperty.call(s, "tax_total_cents"), false,
    "and no tax_total_cents key is manufactured");
  const zeroTax = { ...noTax, "invoice.tax_total": 0 };
  assert.equal((await verdict(await witnessDoc({ fields: zeroTax }))).corroborated, true,
    "an EXPLICIT zero tax corroborates — stating zero is a statement");
});

test("type_code MUST be an explicit '01' — CN/DN are corroboration-ineligible (M12)", async (t) => {
  if (gate(t)) return;
  for (const code of ["02", "03", "11"]) {
    const s = await verdict(await witnessDoc({ fields: { ...BASE, "invoice.type_code": code } }));
    assert.equal(s.corroborated, false, `type_code ${code} refuses`);
    assert.equal(s.type_code, code, "…while the read itself still persists whole (C4)");
  }
  const missing = await verdict(await witnessDoc({ fields: { ...BASE, "invoice.type_code": null } }));
  assert.equal(missing.corroborated, false, "a missing type never defaults to 01");
});

test("MYR asymmetry x3: both channels must cite explicit MYR; absence refuses; explicit foreign sets explicit_non_myr", async (t) => {
  if (gate(t)) return;
  const absent = await verdict(await witnessDoc({ fields: { ...BASE, "invoice.currency": null } }));
  assert.equal(absent.corroborated, false, "absence never manufactures MYR (the OPPOSITE of the statement posture, WC-R5)");
  assert.equal(absent.explicit_non_myr, false, "…and absence is not a foreign currency either");
  const split = await verdict(await witnessDoc({ visionOverride: { "invoice.currency": "USD" } }));
  assert.equal(split.corroborated, false, "a currency disagreement refuses");
  assert.equal(split.explicit_non_myr, true, "an EXPLICIT foreign reading on either channel trips explicit_non_myr → CLR21");
  const foreign = await verdict(await witnessDoc({ fields: { ...BASE, "invoice.currency": "USD" } }));
  assert.equal(foreign.corroborated, false);
  assert.equal(foreign.explicit_non_myr, true);
});

// ===========================================================================
// B1 — the required-answer rule, and the strict-reader half of C2.
// ===========================================================================

test("a MISSING belt answer refuses on EITHER channel — silence is a refusal, never a pass (B1)", async (t) => {
  if (gate(t)) return;
  for (const path of ["invoice.amount_due", "invoice.deposit", "invoice.discount", "invoice.tax_total"]) {
    const t1 = await verdict(await witnessDoc({ dropAnswers: { text: [path], vision: [] } }));
    assert.equal(t1.corroborated, false, `a text roster missing ${path} refuses`);
    const v1 = await verdict(await witnessDoc({ dropAnswers: { text: [], vision: [path] } }));
    assert.equal(v1.corroborated, false, `a vision roster missing ${path} refuses`);
  }
  // The roster's completeness is the term: the same document WITH every answer corroborates.
  assert.equal((await verdict(await witnessDoc())).corroborated, true);
});

test("`not_printed` takes the belt's ABSENCE arm — it is an answer, not silence (B1)", async (t) => {
  if (gate(t)) return;
  // amount_due / deposit / the three components are `not_printed` in BASE and the base corroborates,
  // which is the absence arm being taken. Prove the mechanism is the ANSWER by contradicting it:
  // an answer of `not_printed` beside a region that exists anyway is a witness contradicting itself.
  const shape = witnessShape({ fields: BASE });
  shape.regions.push({ field_path: "invoice.deposit", text_content: money(0),
    monetary_raw: money(0), monetary_cents: 0, locator_kind: "page_polygon", locator: box(0, 0, 1, 1) });
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const pair = await landWitnessPair(cited.documentId, shape);
  const s = await evaluatePair(cited.documentId, pair.textId, pair.visionId);
  assert.equal(s.corroborated, false,
    "an envelope answer of not_printed beside a server-verified region for the same field refuses");
});

test("C2: a value-answered belt field with NO region, or geometry-less geometry, refuses", async (t) => {
  if (gate(t)) return;
  // (a) the witness answers a value but cited nothing the server could verify.
  const shape = witnessShape({ fields: BASE });
  shape.regions = shape.regions.filter((r) => r.field_path !== "invoice.tax_total");
  const firm = await firmOf(world.clients.A1);
  const c1 = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const p1 = await landWitnessPair(c1.documentId, shape);
  assert.equal((await evaluatePair(c1.documentId, p1.textId, p1.visionId)).corroborated, false,
    "a value answer with no verified region refuses (the failed-citation shape)");
  // (b) the citation persisted GEOMETRY-LESS — the permissive writer's other half.
  const flat = await witnessDoc({ geometry: { "invoice.total": { page: 1, polygon: [] } } });
  assert.equal((await verdict(flat)).corroborated, false, "an empty polygon on the gross refuses (W3)");
  const flatComponent = await witnessDoc({ geometry: { "invoice.service_charge": { page: 1, polygon: [] } } });
  assert.equal((await verdict(flatComponent)).corroborated, false,
    "…and C2 binds EVERY witnessed amount, not only the gross");
});

test("cardinality: a conflicting DUPLICATE region refuses rather than being min()-selected away", async (t) => {
  if (gate(t)) return;
  const shape = witnessShape({ fields: BASE });
  shape.regions.push({ field_path: "invoice.total", text_content: money(9999),
    monetary_raw: money(9999), monetary_cents: 9999, locator_kind: "page_polygon", locator: box(2, 2, 3, 3) });
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const pair = await landWitnessPair(cited.documentId, shape);
  assert.equal((await evaluatePair(cited.documentId, pair.textId, pair.visionId)).corroborated, false);
});

test("the ineligibility envelope gate is decisive from EITHER row (0023:309)", async (t) => {
  if (gate(t)) return;
  for (const side of ["text", "vision"]) {
    const shape = witnessShape({ fields: BASE });
    (side === "text" ? shape.textEnvelope : shape.visionEnvelope).corroboration_ineligible = "self_billed";
    const firm = await firmOf(world.clients.A1);
    const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
    const pair = await landWitnessPair(cited.documentId, shape);
    const s = await evaluatePair(cited.documentId, pair.textId, pair.visionId);
    assert.equal(s.corroborated, false, `${side}-declared ineligibility refuses`);
    assert.equal(s.corroboration_ineligible, "self_billed");
  }
});

// ===========================================================================
// Pair resolution (M15) — and the refusal envelope that is never '{}'.
// ===========================================================================

test("a CROSS-GENERATION pair refuses, and `corroborated` is never NULL on any refusal path", async (t) => {
  if (gate(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const g1 = await landWitnessPair(cited.documentId, { ...witnessShape({ fields: BASE }), versionN: 1 });
  const g2 = await landWitnessPair(cited.documentId, { ...witnessShape({ fields: BASE }), versionN: 2 });
  const crossed = await evaluatePair(cited.documentId, g2.textId, g1.visionId);
  assert.equal(crossed.corroborated, false, "a v2 text read paired with a v1 vision read refuses");
  assert.equal(crossed.pair_refusal, "witness_pair_cross_generation");
  assert.notEqual(crossed.corroborated, null, "never-NULL corroborated");
  // Each generation, paired with ITSELF, still corroborates — so the refusal is the cross, not
  // some other breakage the fixture introduced.
  assert.equal((await evaluatePair(cited.documentId, g2.textId, g2.visionId)).corroborated, true);
  // An absent sibling REFUSES with an envelope, never with '{}' — the empty object is the central
  // hazard (every consumer's corroboration check passes silently on it).
  const orphan = await evaluatePair(cited.documentId, g1.textId, null);
  assert.equal(orphan.corroborated, false);
  assert.equal(orphan.pair_refusal, "witness_vision_row_unresolved");
  assert.deepEqual(Object.keys(orphan).length > 0, true, "the refusal is an envelope, not '{}'");
  // A wrong-document pin refuses too.
  const other = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  assert.equal((await evaluatePair(other.documentId, g1.textId, g1.visionId)).pair_refusal,
    "witness_text_row_unresolved");
});

test("a pair whose rows are not BOTH done refuses", async (t) => {
  if (gate(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const shape = witnessShape({ fields: BASE });
  const pair = await landWitnessPair(cited.documentId, { ...shape, visionStatus: "failed" });
  const s = await evaluatePair(cited.documentId, pair.textId, pair.visionId);
  assert.equal(s.corroborated, false);
  assert.equal(s.pair_refusal, "witness_vision_row_unresolved");
});

// ===========================================================================
// Identity — the wrong-party set (D12's gating cells).
// ===========================================================================

/** Geometry for a normal invoice: SELLER block top-left, BILL-TO block top-right. */
const SELLER_NAME = box(0, 0, 30, 5);
const SELLER_REG = box(0, 6, 30, 10);
const BUYER_NAME = box(60, 0, 90, 5);
const BUYER_REG = box(60, 6, 90, 10);

function identityRegions({ vendorName, vendorReg, customerName, customerReg,
  vnBox = SELLER_NAME, vrBox = SELLER_REG, cnBox = BUYER_NAME, crBox = BUYER_REG }) {
  const rows = [];
  const add = (fp, text, locator) => { if (text) rows.push({ field_path: fp, text_content: text, locator_kind: "page_polygon", locator }); };
  add("invoice.vendor_name", vendorName, vnBox);
  add("invoice.vendor_registration", vendorReg, vrBox);
  add("invoice.customer_name", customerName, cnBox);
  add("invoice.customer_registration", customerReg, crBox);
  return rows;
}

test("identity: a correctly-attributed counterparty registration corroborates GEOMETRICALLY, and the amount verdict carries no identity term", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "SUPPLIER SDN BHD", vendorReg: "201801000999",
    customerName: "THE CLIENT SDN BHD", customerReg: "202001001111" }) });
  const s = await verdict(d);
  assert.equal(s.vendor_registration_verdict, "corroborated", "the seller registration sits nearer the seller name");
  assert.equal(s.customer_registration_verdict, "corroborated");
  assert.equal(s.corroborated, true, "corroborated stays an AMOUNT verdict (N5) — identity did not change it");
  assert.equal(s.customer_registration, "202001001111", "…and the identity FACT still surfaces conditionally");
});

test("WRONG-PARTY (i): a buyer-registration-only document — the witness cites the CLIENT's own number as vendor_registration → WITHDRAWN, never corroborated", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A2;
  await addIdentifier(client, "202001002222", "ssm");
  const d = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "THE CLIENT SDN BHD", vendorReg: "202001002222", customerName: null, customerReg: null }) }, { client });
  const s = await verdict(d);
  assert.equal(s.vendor_registration_verdict, "withdrawn_self_referential",
    "a side that IS the filing client is not a counterparty — withdrawn, not an error (B3)");
  assert.notEqual(s.vendor_registration_verdict, "corroborated");
});

test("WRONG-PARTY (ii): the MISLABELLED-BLOCK shape — the distance test CONFIRMS the wrong pairing and only the self-referential withdrawal catches it", async (t) => {
  if (gate(t)) return;
  const client = world.clients.B1;
  await addIdentifier(client, "203001003333", "tin");
  // A compact invoice whose BILL-TO block sits above the seller block: the witness cites the
  // buyer's name as vendor_name AND the adjacent buyer registration as vendor_registration. The
  // two cited boxes really are adjacent, so geometry AGREES with the mislabelling.
  const d = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "THE OTHER CLIENT SDN BHD", vendorReg: "203001003333",
    customerName: "SUPPLIER SDN BHD", customerReg: "201801000999",
    vnBox: box(0, 0, 30, 5), vrBox: box(0, 6, 30, 10),
    cnBox: box(0, 40, 30, 45), crBox: box(0, 46, 30, 50) }) }, { client });
  const s = await verdict(d);
  assert.equal(s.vendor_registration_verdict, "withdrawn_self_referential",
    "the mislabelled block self-matches the filing client and is withdrawn — the named honest weakness, closed by the DB-owned term");
  assert.notEqual(s.vendor_registration_verdict, "corroborated");
});

test("a SALES document: vendor_reg == the client is WITHDRAWN while the counterparty side still corroborates (B3, polarity-free)", async (t) => {
  if (gate(t)) return;
  const client = world.clients.S1;
  await addIdentifier(client, "204001004444", "ssm");
  const d = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "SELLING CLIENT SDN BHD", vendorReg: "204001004444",
    customerName: "REAL CUSTOMER SDN BHD", customerReg: "205001005555" }) }, { client });
  const s = await verdict(d);
  assert.equal(s.vendor_registration_verdict, "withdrawn_self_referential");
  assert.equal(s.customer_registration_verdict, "corroborated",
    "the genuine counterparty side is untouched — withdrawal is not a document-wide refusal");
  assert.equal(Object.prototype.hasOwnProperty.call(s, "identity_contest"), false);
});

test("BOTH sides matching withdraws BOTH and flags contest; a witness-reported contest withdraws outright", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A2;                       // already carries 202001002222
  const both = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "THE CLIENT SDN BHD", vendorReg: "202001002222",
    customerName: "THE CLIENT SDN BHD", customerReg: "2020-01-00 2222" }) }, { client });
  const s = await verdict(both);
  assert.equal(s.vendor_registration_verdict, "withdrawn_self_referential");
  assert.equal(s.customer_registration_verdict, "withdrawn_self_referential");
  assert.equal(s.identity_contest, true, "both sides matching flags contest");
  const contested = await witnessDoc({ contest: true, extraRegions: identityRegions({
    vendorName: "SUPPLIER SDN BHD", vendorReg: "201801000999",
    customerName: "THE CLIENT SDN BHD", customerReg: "202001009999" }) });
  const c = await verdict(contested);
  assert.equal(c.vendor_registration_verdict, "withdrawn_contest");
  assert.equal(c.customer_registration_verdict, "withdrawn_contest");
  assert.equal(c.identity_contest, true);
});

test("identity: a TIE refuses, and a missing anchor refuses", async (t) => {
  if (gate(t)) return;
  // Equidistant: the registration box sits exactly between the two name boxes.
  const tie = await witnessDoc({ extraRegions: identityRegions({
    vendorName: "SUPPLIER SDN BHD", vendorReg: "201801000999",
    customerName: "BUYER SDN BHD", customerReg: null,
    vnBox: box(0, 0, 10, 5), vrBox: box(20, 0, 30, 5), cnBox: box(40, 0, 50, 5) }) });
  assert.equal((await verdict(tie)).vendor_registration_verdict, "not_corroborated", "a tie refuses");
  const noAnchor = await witnessDoc({ extraRegions: identityRegions({
    vendorName: null, vendorReg: "201801000999", customerName: "BUYER SDN BHD", customerReg: null }) });
  assert.equal((await verdict(noAnchor)).vendor_registration_verdict, "not_corroborated",
    "no vendor-name anchor refuses");
});

test("no CONFIDENCE token anywhere in the predicate closure (postverify — ADR-047 Q1)", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select string_agg(regexp_replace(p.prosrc,'--[^` + String.fromCharCode(10) + `]*','','g'), '|') as src
       from pg_proc p
      where p.oid in ('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure,
                      'clara.evaluate_witness_identity_v1(uuid,uuid,boolean)'::regprocedure)`);
  assert.equal(/engine_confidence|\bv_conf\b|0\.95/.test(r.rows[0].src), false,
    "the executable text of the closure reads no confidence signal");
});

// ===========================================================================
// B1 — the three field classes: C2 geometry binds the NINE AMOUNTS, and the two
// TOKEN fields are citation-optional. The review's failure scenario, as a GREEN cell.
// ===========================================================================

test("THE REAL MALAYSIAN INVOICE: OCR prints only 'RM 103.75' and no MYR token anywhere — no currency citation exists, and the pair still CORROBORATES (B1)", async (t) => {
  if (gate(t)) return;
  // The exact document the C2-everywhere rule would have refused: the currency evidence is the
  // "RM" inside the amount rendering, and there is no standalone currency string on the page for
  // a witness to cite. The nine amounts are clean and fully cited.
  const d = await witnessDoc({
    rawOverride: { "invoice.currency": "RM 103.75" },
    noRegions: ["invoice.currency"],
  });
  const s = await verdict(d);
  assert.equal(s.corroborated, true, "an uncited currency token does NOT refuse — the citation is optional for a token field");
  assert.equal(s.currency, "RM", "the emitted currency is the alphabetic reduction of what was actually read");
  assert.equal(s.explicit_non_myr, false, "'RM' is a Malaysian rendering, never a foreign one");
});

test("type_code corroborates with NO citation, and the value comes from the ANSWER (B1/M12)", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc({ noRegions: ["invoice.type_code"] });
  const s = await verdict(d);
  assert.equal(s.corroborated, true, "an uncited type_code does not refuse");
  assert.equal(s.type_code, "01", "…and the value is still published, read off the answer");
  // The VALUE rule is untouched by the citation becoming optional: a CN still refuses.
  const cn = await verdict(await witnessDoc({
    fields: { ...BASE, "invoice.type_code": "02" }, noRegions: ["invoice.type_code"],
  }));
  assert.equal(cn.corroborated, false, "an uncited CN is still corroboration-ineligible (M12)");
});

test("an uncited FOREIGN currency still sets explicit_non_myr, and channels disagreeing on currency still refuse (B1)", async (t) => {
  if (gate(t)) return;
  const usd = await verdict(await witnessDoc({
    fields: { ...BASE, "invoice.currency": "USD" }, noRegions: ["invoice.currency"],
  }));
  assert.equal(usd.corroborated, false, "USD never corroborates");
  assert.equal(usd.explicit_non_myr, true, "…and it is an EXPLICIT foreign reading -> CLR21");
  const split = await verdict(await witnessDoc({
    visionOverride: { "invoice.currency": "SGD" }, noRegions: ["invoice.currency"],
  }));
  assert.equal(split.corroborated, false, "one channel MYR and the other SGD refuses");
  assert.equal(split.explicit_non_myr, true);
  // …and a currency neither channel can name at all is NOT foreign — it is simply unconfirmed.
  const mush = await verdict(await witnessDoc({
    rawOverride: { "invoice.currency": "Amount payable" }, noRegions: ["invoice.currency"],
  }));
  assert.equal(mush.corroborated, false, "an unrecognisable currency token never manufactures MYR");
  assert.equal(mush.explicit_non_myr, false, "…and it is not a foreign reading either");
});

test("C2 still binds EVERY AMOUNT: an uncited monetary field refuses even though an uncited token does not (B1)", async (t) => {
  if (gate(t)) return;
  // The term under test is the FIELD CLASS, shown as an exact diff: the same document, the same
  // "answered but uncited" shape, refuses for a money field and passes for a token field.
  for (const path of ["invoice.total", "invoice.tax_total", "invoice.service_charge"]) {
    const s = await verdict(await witnessDoc({ noRegions: [path] }));
    assert.equal(s.corroborated, false, `an uncited ${path} refuses — C2 binds every witnessed AMOUNT`);
  }
  assert.equal((await verdict(await witnessDoc({ noRegions: ["invoice.currency", "invoice.type_code"] }))).corroborated,
    true, "…while both token fields uncited together still corroborate");
});

// ===========================================================================
// M3 — the reference-value contract (the cross-regime duplicate walls).
// ===========================================================================

test("M3: a quoted invoice_id with a normalized `value` emits the VALUE, and a date raw emits its ISO value", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc({ refAnswers: {
    text: {
      "invoice.invoice_id": { raw: "Invoice No.: INV-001", value: "INV-001" },
      "invoice.invoice_date": { raw: "15/01/2026", value: "2026-01-15" },
    },
    vision: {
      "invoice.invoice_id": { raw: "INV-001", value: "INV-001" },
      "invoice.invoice_date": { raw: "15 Jan 2026", value: "2026-01-15" },
    },
  } });
  const s = await verdict(d);
  assert.equal(s.invoice_id, "INV-001", "the envelope emits the normalized value, not the quoted rendering");
  assert.equal(s.invoice_date, "2026-01-15", "…and an ISO date the duplicate walls can compare across regimes");
  assert.equal(s.corroborated, true, "the reference contract never touches the amount verdict");
});

test("M3: when the two channels' values DISAGREE the key is DROPPED — and the amount verdict is untouched", async (t) => {
  if (gate(t)) return;
  const d = await witnessDoc({ refAnswers: {
    text: { "invoice.invoice_id": { raw: "INV-001", value: "INV-001" } },
    vision: { "invoice.invoice_id": { raw: "INV-002", value: "INV-002" } },
  } });
  const s = await verdict(d);
  assert.equal(s.invoice_id, null, "a cross-channel disagreement drops the reference key");
  assert.equal(s.corroborated, true,
    "…and DOES NOT block amount corroboration — absence-permissive, the legacy conditional-emission shape");
  // Only ONE channel answering is enough (absence-permissive), which is the term doing the work.
  const one = await verdict(await witnessDoc({ refAnswers: {
    text: { "invoice.invoice_id": { raw: "INV-777", value: "INV-777" } }, vision: {},
  } }));
  assert.equal(one.invoice_id, "INV-777");
});

// ===========================================================================
// M6 — an absurd magnitude is UNREADABLE, never an exception.
// ===========================================================================

test("M6: a 30-digit rendering makes the predicate REFUSE without raising 22003", async (t) => {
  if (gate(t)) return;
  const huge = "RM " + "1".repeat(30) + ".00";
  const d = await witnessDoc({ visionOverride: {}, rawOverride: { "invoice.total": huge } });
  // rawOverride carries to the vision channel too, so the vision answer is the absurd string and
  // the predicate's own clara._normalize_invoice_cents call is the one under test.
  const s = await verdict(d);
  assert.equal(s.corroborated, false, "present-but-unreadable is NOT corroboration");
  assert.equal(s.corroborated === null, false, "…and the read completed: no 22003 escaped the predicate");
});

test("the belt roster this predicate REQUIRES is exactly the eleven the fixtures state", async (t) => {
  if (gate(t)) return;
  // A contract-blind cross-check on the interface the writer lane must satisfy: every roster
  // member, dropped alone, must refuse. A field that could be dropped for free is not a belt.
  for (const path of BELT) {
    const s = await verdict(await witnessDoc({ dropAnswers: { text: [path], vision: [] } }));
    assert.equal(s.corroborated, false, `${path} is REQUIRED in the text roster`);
  }
});
