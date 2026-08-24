// F-A2 PR-1 — Annex C.3's rung B8, `facts_moved`, as a FIVE-CELL SET.
//
// CONTRACT-BLIND, frontier-gated on `f_a2_posting_core$`. Split out of f-a2-ladder-3.test.mjs
// because B8 needs a two-generation fixture that no other rung does, and because one cell could
// not carry the rung's scope, its negative twin, its dead-lane guard and its ARM-0 arm at once.
//
// THE CONTRACT, WRITTEN OUT, because every assertion below is a reading of it:
//
//   B8 PASSES iff every `entry_evidence` row whose extraction is a FACT GENERATION —
//   `engine_kind in ('invoice_facts','llm_text_facts','llm_vision_facts')` — cites the SAME
//   extraction the fact state itself names (`v_state->>'extraction_id'`).
//   OCR and `structured_parse` citations are OUT OF SCOPE (law 72): they are not fact
//   generations, and reading one as stale would refuse a draft for citing a page image.
//   `not_evaluable` on three inputs the rung cannot judge: no `document_id`, a `'{}'` fact
//   state, or a witness pair whose TEXT row is unresolved (`0092:210-217` returns a real
//   envelope with `corroborated:false` and a `pair_refusal` rather than a state to compare).
//
// SCOPE IS α — ALL fact-generation citations, not just the money one. A MIXED-generation draft
// therefore fails, and cell 3 is what makes that a decision on the record rather than an
// accident of which citation the implementation happened to read first.
//
// WHY B8 EXISTS AT ALL, given A5. It is deliberately redundant, and law 31 says a redundant wall
// must be forced NON-VACUOUSLY or dropped. A5 covers the common case only because `0096:245-278`
// rotates an open draft's `revision_token` when facts settle — ONE migration old. Cell 1 forces
// B8 with that rotation LIVE (the real shape: the caller simply re-reads the current token, as
// the runtime would), and cell 2 forces it with the rotation neutralised, which is where A5
// cannot see the movement at all. Both must fail at B8; only the second proves A5 is not what is
// doing the work.
//
// FIXTURES GO THROUGH THE ESTATE'S REAL DOORS. `request_reextraction` is human-invoked-only and
// `persist_witness_facts` is the writer; the second generation here is landed as a witness pair
// exactly as the writer produces one, and the cells assert the preconditions they depend on
// (the verified tier, the clean B5) rather than assuming them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane,
  booksVersion, entryRow, postingCoreReady, seedRegion, claimTask, withdrawDraft, opk,
  gateCore, wakePostEntry, agentDraft, autodraftCred, ensureChart, witnessedFiling, unwitnessedFiling,
  genericLines,
  witnessRegion, witnessShape, landWitnessPair, withWitnessV2, textCoverage, visionCoverage,
  documentSha, reviseAgentDraft, supplierLines, ev, admits, nonAdmitting, SUPPLIER_NAME,
  assertVectorShape, assertNonAdmitting, entryEvents, EVENT_POST_REFUSED, RUNG_TOKEN,
} from "./f-a2-post-world.mjs";

let world = null;
before(async () => { if (await postingCoreReady()) world = await buildWorld(); });
after(async () => {
  printLaneNotes("f-a2-b8");
  printSkipCount("f-a2-b8");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const GROSS = 100000; // RM 1,000.00

/** The fact state the ladder reads, and the generation it names. */
async function factExtraction(document) {
  const r = await rootQuery("select clara._invoice_fact_state($1) as s", [document]);
  return { state: r.rows[0].s, extractionId: r.rows[0].s?.extraction_id ?? null };
}

/** Land a SECOND witness pair (G2) on a document: same total, different invoice_id. Same total
 *  is load-bearing — it is what keeps `0096`'s rotation from stamping an `amount_exception`, so
 *  B5 stays clean and B8 is the only rung with anything to say. */
async function landG2(document, {
  total = GROSS, invoiceId = null, versionN = 2, ocrExtraction = null, throughWriter = false,
} = {}) {
  const sha = await documentSha(document);
  const silent = { state: "not_printed" };
  // THE SUCCESSOR CARRIES THE SAME IDENTITY EVIDENCE, and this is a correctness point rather
  // than fixture tidiness: a re-extraction reads the SAME page, so it states the same supplier.
  // A G2 that dropped `invoice.vendor_name` would make the document's direction resolve to
  // `unresolved` under `_direction_from_extraction`, and the very next agent draft would be
  // refused CLR21 `direction_family_mismatch` — a pre-existing wall firing because the FIXTURE
  // lost evidence, which is a finding about the test and not about B8. Measured on the rig.
  const base = witnessShape({
    fields: { "invoice.total": total, "invoice.currency": "RM", "invoice.type_code": "01" },
    // MEASURED: `invoice.vendor_name` is NOT in the writer's accepted answer vocabulary — adding
    // it makes `_witness_answers_ok` reject the whole envelope. Only the two M3 reference fields
    // (`invoice.invoice_id` / `invoice.invoice_date`) may join the eleven. The identity therefore
    // rides `extraRegions`, which the DIRECT-INSERT path preserves faithfully.
    refAnswers: { text: { "invoice.invoice_id": { raw: invoiceId ?? `INV-${randomUUID().slice(0, 8)}` } }, vision: {} },
    extraRegions: [{
      field_path: "invoice.vendor_name", text_content: SUPPLIER_NAME,
      locator_kind: "page_polygon", locator: { page: 1, polygon: [0, 0, 1, 1] },
    }],
  });
  const shape = withWitnessV2(base, {
    coverage: { text: textCoverage({ ocrExtractionId: ocrExtraction }), vision: visionCoverage({ inputSha256: sha }) },
    sst: { text: silent, vision: silent },
  });
  // VERSION 2, and it is load-bearing. `clara._document_facts_extraction` resolves the winner by
  // the llm_witness TASK's `version_n desc, id desc`, so a successor landed at version 1 does NOT
  // move the fact state — the two-generation premise silently collapses and every B8 cell here
  // would be asserting against ONE generation while claiming two. Measured on the rig.
  if (!throughWriter) return landWitnessPair(document, { ...shape, versionN });

  // THROUGH THE REAL WRITER, because cell 1's whole claim is about the LIVE shape. Only
  // `persist_witness_facts` runs `0096`'s rotation loop; `landWitnessPair` inserts the rows
  // directly and therefore produces the rotation-SUPPRESSED shape, which is cell 2's fixture and
  // would make cell 1 assert the opposite of what it says. The wrapper shape is the writer's
  // own: `{envelope, input_pin, prompt_hash, regions}`, with the TEXT pin resolving to a done
  // OCR extraction of this document and the VISION pin equal to `documents.sha256`.
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [document])).rows[0].firm_id;
  const ocr = ocrExtraction ?? (await rootQuery(
    `select id from clara.document_extractions where document_id=$1 and engine_kind='ocr' and status='done'
      order by version_n desc limit 1`, [document])).rows[0]?.id;
  assert.ok(ocr, "B8 fixture: the document carries a done OCR extraction for the text input pin");
  const task = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,'llm-openai:gpt-5.6-terra:v2',$3,'llm_witness','queued') returning id`,
    [firm, document, versionN])).rows[0].id;
  await claimTask(task, { egressApproved: true });
  // THE WRAPPER KEY IS `citations`, AND IT IS LOAD-BEARING RATHER THAN COSMETIC. Measured at
  // integration: `persist_witness_facts` does not take region ROWS at all -- it takes
  // `[{field_path, region_idx}]` citations onto the document's OCR regions and BUILDS each fact
  // region's geometry from the OCR region it verified against (`page` + `polygon` +
  // `source_region_id`). An uncited answer persists with `locator = {"polygon": []}`, and an
  // EMPTY polygon fails the corroboration belt's W3 term (0023:305) -- so a pair landed through
  // the writer with a `regions` key the writer never reads is a real pair carrying no geometry,
  // and it reads `corroborated:false` however well-formed its envelope is. That is exactly what
  // made this cell see B2 fail beside B8. The OCR region seeded by `seedCitedDocument` carries
  // the printed total and a real polygon, and `region_idx` is `row_number() over (order by id)`
  // across that extraction's regions -- resolved from the catalog here rather than assumed.
  const idx = (await rootQuery(
    `select (row_number() over (order by id))::int as idx, field_path
       from clara.document_regions where extraction_id=$1`, [ocr])).rows;
  const totalIdx = idx.find((r) => r.field_path === "invoice.total")?.idx;
  assert.ok(totalIdx,
    `B8 fixture: the document's OCR extraction carries an invoice.total region to cite (got ${JSON.stringify(idx.map((r) => r.field_path))}) -- without a verified citation the writer persists the fact geometry-less and G2 can never corroborate`);
  const citations = [{ field_path: "invoice.total", region_idx: totalIdx }];
  const wrap = (envelope, pin, tag, cite) => ({
    envelope, input_pin: pin, prompt_hash: createHash("sha256").update(`${tag}:${document}:${versionN}`).digest("hex"),
    ...(cite ? { citations } : {}),
  });
  const out = await rootQuery(
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as s",
    [task, JSON.stringify(wrap(shape.textEnvelope, ocr, "text", true)),
      JSON.stringify(wrap(shape.visionEnvelope, sha, "vision", false)), 1]);
  return out.rows[0].s;
}

/** An agent draft citing G1's own `invoice.total` region, with the verified tier ASSERTED. */
async function draftOnG1(client, cited) {
  const total = await witnessRegion(cited.documentId, "invoice.total");
  assert.ok(total?.id, "B8 fixture: G1's witness text row carries an invoice.total region to cite");
  const cred = await autodraftCred(client);
  const d = await agentDraft(OWNER(), cred, {
    client, cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [ev(total.id, total.text_content, "invoice.total")],
  });
  const tier = await rootQuery(
    "select provenance_tier, extraction_id from clara.entry_evidence where entry_id=$1", [d.entry_id]);
  assert.ok(tier.rows.some((x) => x.provenance_tier === "verified"),
    `B8 fixture: the money citation binds at the VERIFIED tier (got ${JSON.stringify(tier.rows.map((x) => x.provenance_tier))}) — a model_read citation would refuse at B7 and B8 would prove nothing`);
  return { cred, draft: d, boundExtraction: tier.rows[0].extraction_id };
}

/** The entry's CURRENT token — what a runtime caller would re-read after the rotation. */
const currentToken = async (entry) => (await entryRow(entry))?.revision_token;

// ===========================================================================
// 1 · B8-PRIMARY — the live shape, rotation NOT suppressed.
// ===========================================================================

test("f-a2.c3.B8-primary a SUPERSEDED fact generation refuses facts_moved, with A5/B2/B3/B5/B7 all clean", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const g1 = await factExtraction(cited.documentId);
  assert.equal(g1.state?.corroborated, true, "c3.B8-primary: G1 corroborates at RM1,000.00");
  const { cred, draft, boundExtraction } = await draftOnG1(A1(), cited);
  assert.equal(boundExtraction, g1.extractionId, "c3.B8-primary: the draft is bound to G1");

  // THE ONLY CELL THAT GOES THROUGH THE WRITER, because it is the only one whose claim is about
  // the rotation. `persist_witness_facts` runs `0096`'s loop; the other four use the direct
  // insert, which is both the rotation-suppressed shape cell 2 needs and the only way to carry
  // `invoice.vendor_name` onto the successor (the writer builds regions from its own answer
  // roster, and that field is not in it).
  await landG2(cited.documentId, { throughWriter: true, ocrExtraction: cited.extractionId });
  const g2 = await factExtraction(cited.documentId);
  assert.notEqual(g2.extractionId, g1.extractionId,
    "c3.B8-primary: the fact state now names G2 — the generation MOVED under the draft");
  assert.equal(g2.state?.total_cents, GROSS,
    "c3.B8-primary: …at the SAME total, which is what keeps 0096's rotation from stamping an amount_exception");
  // AND G2 ITSELF CORROBORATES. Stated as a premise rather than left to surface as a B2 failure:
  // this cell's claim is that B8 is the ONLY non-admitting rung, which is a claim about a
  // successor generation that is every bit as good as the one it replaced. A G2 that did not
  // corroborate would fail B2 as well and the cell would be measuring the fixture.
  assert.equal(g2.state?.corroborated, true,
    `c3.B8-primary: the successor generation corroborates too (state ${JSON.stringify(g2.state)})`);

  // The rotation is LIVE: the caller re-reads the current token, exactly as the runtime would.
  const token = await currentToken(draft.entry_id);
  assert.notEqual(token, draft.revision_token,
    "c3.B8-primary: 0096:245-278 rotated the open draft's token when the facts settled — the cell uses the CURRENT one so A5 passes and B8 is reached");
  const flags = (await entryRow(draft.entry_id))?.flags ?? {};
  assert.ok(!("amount_exception" in flags),
    `c3.B8-primary: no amount_exception was stamped, so B5 is clean (flags ${JSON.stringify(flags)})`);

  const r = await wakePostEntry(cred, {
    entry: draft.entry_id, expectedRevision: token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assertVectorShape(assert, r?.rung_vector, "c3.B8-primary");
  assertNonAdmitting(assert, r, "B8", "c3.B8-primary");
  assert.deepEqual(nonAdmitting(r.rung_vector), ["B8"],
    `c3.B8-primary: B8 is the ONLY non-admitting rung — A5 passed on the fresh token, B2/B3/B7 on the verified G1 citation, B5 on the unstamped flags (non-admitting: ${nonAdmitting(r.rung_vector).join(",")})`);
  assert.equal(r.refusal.reason, RUNG_TOKEN.B8, "c3.B8-primary: the receipt names facts_moved");
  assert.equal((await entryRow(draft.entry_id))?.status, "draft", "c3.B8-primary: nothing posted");
  const events = await entryEvents(draft.entry_id, [EVENT_POST_REFUSED]);
  assert.equal(events.length, 1,
    "c3.B8-primary: the refusal COMMITTED — one entry.post_refused event, because a Tier-B reason has to be durable");
});

test("f-a2.c3.B8-primary-twin re-citing the CURRENT generation posts clean — the rung-was-the-reason proof", async (t) => {
  if (await gateCore(t)) return;
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const { draft, cred } = await draftOnG1(A1(), cited);
  await landG2(cited.documentId);
  const g2 = await factExtraction(cited.documentId);

  // REVISE onto G2's own total region — the ordinary human remedy for a moved generation.
  const g2Total = await witnessRegion(cited.documentId, "invoice.total");
  assert.equal(
    (await rootQuery("select extraction_id from clara.document_regions where id=$1", [g2Total.id])).rows[0].extraction_id,
    g2.extractionId, "c3.B8-primary-twin: the re-citation really names G2");
  await reviseAgentDraft(OWNER(), {
    entry: draft.entry_id, lines: supplierLines(GROSS), expectedRevision: await currentToken(draft.entry_id),
  });
  // A human revision sets `last_human_editor`, which A8 refuses — so the agent RE-DERIVES on the
  // current generation instead, which is OQ-4 exit 2's shape and the only lawful way back. The
  // WITHDRAWAL is not optional and not tidiness: the double-coding wall refuses a second coded
  // entry against the same filing ("active filing already has an open draft"), which is exactly
  // why §3.3.3 makes exit 2 available only once the human's draft is withdrawn.
  await withdrawDraft(OWNER(), {
    entry: draft.entry_id, reason: "c3.B8-primary-twin: make room for the re-derivation",
    expectedRevision: await currentToken(draft.entry_id), opKey: opk("b8twinwd"),
  });
  const own = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [ev(g2Total.id, g2Total.text_content, "invoice.total")],
    opKey: `f-a2-b8-twin:${randomUUID().slice(0, 8)}`,
  }).catch((e) => ({ error: e }));
  // FORCED. A `noteLane` + `return` is not a skip — node counts the cell PASSED — so this arm
  // used to green the twin whenever the re-derivation could not be built, which is precisely
  // when the twin proves nothing. The withdrawal above is what makes exit 2 available, so if the
  // draft is still refused that is a finding about the door, not a fixture excuse.
  assert.ok(!own?.error,
    `c3.B8-primary-twin: the re-derivation drafts after the withdrawal (got ${own?.error?.code}: ${own?.error?.message}) — exit 2 is OQ-4's own remedy and this twin is what proves B8 was the reason the primary refused`);
  const r = await wakePostEntry(cred, {
    entry: own.entry_id, expectedRevision: own.revision_token, client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.ok(admits(r?.rung_vector, "B8"),
    `c3.B8-primary-twin: citing the CURRENT generation ADMITS at B8 (got ${JSON.stringify(r?.rung_vector?.B8)})`);
  assert.equal(r?.posted, true,
    `c3.B8-primary-twin: …and it posts. Without this twin, B8's cell could be green for any other reason (${JSON.stringify(r?.refusal)})`);
});

// ===========================================================================
// 2 · B8-TWIN — the design's original cell, with the rotation NEUTRALISED.
// ===========================================================================

test("f-a2.c3.B8-suppressed B8 still fails where the token did NOT rotate — the non-vacuous half A5 cannot cover", async (t) => {
  if (await gateCore(t)) return;
  // `landWitnessPair` writes the extraction rows DIRECTLY, bypassing `persist_witness_facts` and
  // therefore bypassing `0096`'s rotation loop. That is the rotation-suppressed shape, and it is
  // the whole reason B8 is not redundant-and-droppable: with the token unmoved, A5 sees nothing
  // and only B8 stands between the agent and a post against a superseded generation.
  await ensureChart(OWNER(), A2());
  const cited = await witnessedFiling(OWNER(), { client: A2(), gross: GROSS });
  const g1 = await factExtraction(cited.documentId);
  const { cred, draft } = await draftOnG1(A2(), cited);
  const before = draft.revision_token;

  await landWitnessPair(cited.documentId, {
    ...withWitnessV2(
      witnessShape({ fields: { "invoice.total": GROSS, "invoice.currency": "RM", "invoice.type_code": "01" } }),
      {
        coverage: { text: textCoverage(), vision: visionCoverage({ inputSha256: await documentSha(cited.documentId) }) },
        sst: { text: { state: "not_printed" }, vision: { state: "not_printed" } },
      }),
    versionN: 2,
  });
  const after = await currentToken(draft.entry_id);
  assert.equal(after, before,
    "c3.B8-suppressed precondition: the token did NOT rotate — otherwise A5 fires first and this cell is vacuous");
  const g2 = await factExtraction(cited.documentId);
  assert.notEqual(g2.extractionId, g1.extractionId, "c3.B8-suppressed precondition: the generation still moved");

  const r = await wakePostEntry(cred, {
    entry: draft.entry_id, expectedRevision: before, client: A2(), booksVersion: await booksVersion(A2()),
  });
  assert.ok(admits(r?.rung_vector, "A5") || r?.refusal?.tier === "B",
    "c3.B8-suppressed: the post reached Tier B at all — a Tier-A raise here would mean A5 saw the movement after all");
  assertNonAdmitting(assert, r, "B8", "c3.B8-suppressed");
  assert.equal(r.refusal.reason, RUNG_TOKEN.B8, "c3.B8-suppressed: …naming facts_moved");
});

// ===========================================================================
// 3 · B8-MIXED — the α-scoping cell.
// ===========================================================================

test("f-a2.c3.B8-mixed a MIXED-generation draft fails — scope is ALL fact-generation citations, not just the money one", async (t) => {
  if (await gateCore(t)) return;
  // The scope decision made forceable. One citation on the CURRENT generation's `invoice.total`,
  // one on the SUPERSEDED generation's `invoice.invoice_id`. A rung scoped to the money citation
  // alone would ADMIT this; scope α refuses it, and this cell is what makes that a decision on
  // the record instead of an artefact of which row the implementation read first.
  await ensureChart(OWNER(), A2());
  // G1 is seeded WITH an `invoice.invoice_id` region, because that is the exact pair v6.1's
  // manifest names: "the total off G2 and `invoice_id` off G1". Falling back to some other
  // non-money field would still exercise scope α, but it would not be the cell on the record.
  const cited = await witnessedFiling(OWNER(), {
    client: A2(), gross: GROSS, invoiceId: `INV-G1-${randomUUID().slice(0, 8)}`,
  });
  const g1Invoice = await witnessRegion(cited.documentId, "invoice.invoice_id");
  assert.ok(g1Invoice?.id,
    "c3.B8-mixed precondition: G1 carries the `invoice.invoice_id` region the manifest's pair names");
  const g1 = await factExtraction(cited.documentId);

  await landG2(cited.documentId);
  const g2 = await factExtraction(cited.documentId);
  const g2Total = await witnessRegion(cited.documentId, "invoice.total");
  assert.notEqual(g2.extractionId, g1.extractionId, "c3.B8-mixed precondition: two generations exist");

  const cred = await autodraftCred(A2());
  const d = await agentDraft(OWNER(), cred, {
    client: A2(), cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [
      ev(g2Total.id, g2Total.text_content, "invoice.total"),
      ev(g1Invoice.id, g1Invoice.text_content, g1Invoice.field_path),
    ],
  }).catch((e) => ({ error: e }));
  // FORCED. The old arm greened the cell whenever the draft floor refused the mixed citation
  // set — which is exactly the case where scope α goes untested. If a stronger wall really does
  // stand in front of B8 here, that is a finding to adjudicate, not a pass to record.
  assert.ok(!d?.error,
    `c3.B8-mixed: the mixed-generation draft is accepted by the draft floor (got ${d?.error?.code}: ${d?.error?.message}) — scope α is only a decision on the record if this citation set can reach B8`);
  const gens = await rootQuery(
    "select distinct extraction_id from clara.entry_evidence where entry_id=$1", [d.entry_id]);
  assert.equal(gens.rows.length, 2,
    `c3.B8-mixed precondition: the entry really cites TWO generations (got ${gens.rows.length}) — one generation would make this cell a duplicate of the primary`);
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: await currentToken(d.entry_id), client: A2(), booksVersion: await booksVersion(A2()),
  });
  assertNonAdmitting(assert, r, "B8", "c3.B8-mixed");
  assert.equal(r.refusal.reason, RUNG_TOKEN.B8,
    "c3.B8-mixed: scope α — a stale NON-money citation is enough to move the facts");
});

// ===========================================================================
// 4 · B8-MUST-NOT-REFUSE — the dead-lane guard.
// ===========================================================================

test("f-a2.c3.B8-ocr an ORDINARY OCR citation is never read as stale — B8 reads fact generations only (law 72)", async (t) => {
  if (await gateCore(t)) return;
  // The guard against the reading that would make B8 refuse a draft for citing a page image.
  // `ocr` and `structured_parse` are NOT fact generations; a rung that compared them against the
  // fact state's `extraction_id` would refuse every draft that ever cited a line of raw text —
  // and it would do so with a token that says the FACTS moved, which is not what happened.
  //
  // ONE DIVERGENCE FROM THE MANIFEST, stated rather than quietly taken. v6.1 words this cell as a
  // draft citing "only OCR `pages.*` regions". Measured on the rig, that entry cannot post at
  // all — and not because of B8: `_bind_evidence` stamps `verified` ONLY on a corroborated
  // `invoice.total` citation whose cents match the anchor (`0009:462-466`), so an OCR-only draft
  // has no verified row, and B3 (`_corroboration_bound`) and B7 both refuse it before B8 is even
  // asked. A cell built that way would be green on the wrong rungs. So the fixture cites the
  // verified total AND an OCR `pages.*` region: the OCR citation is present, B8 must still admit,
  // and "posts clean" stays a real claim instead of an unreachable one.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const total = await witnessRegion(cited.documentId, "invoice.total");
  const ocrLine = await seedRegion({
    firm: cited.firm, extraction: cited.extractionId, fieldPath: "pages.1.lines.3",
    textContent: "TOTAL DUE RM 1,000.00", locator: { page: 1, polygon: [0, 0, 1, 1] },
  }).catch((e) => ({ error: e }));
  assert.ok(ocrLine && !ocrLine.error,
    `c3.B8-ocr: the OCR line region seeds (got ${ocrLine?.error?.code}: ${ocrLine?.error?.message}) — without it the dead-lane guard has no out-of-scope citation to guard`);
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [
      ev(total.id, total.text_content, "invoice.total"),
      ev(ocrLine, "TOTAL DUE RM 1,000.00", "pages.1.lines.3"),
    ],
  }).catch((e) => ({ error: e }));
  // FORCED. "The dead-lane half is unbuildable, so the scoping stays a contract claim" was a
  // green recorded for the one outcome that leaves law 72's scoping untested end to end.
  assert.ok(!d?.error,
    `c3.B8-ocr: a draft citing the verified total AND an OCR page region is accepted (got ${d?.error?.code}: ${d?.error?.message}) — B8's OCR scoping is only proven if such a draft can reach the rung`);
  const kinds = await rootQuery(
    `select distinct ex.engine_kind from clara.entry_evidence e
       join clara.document_extractions ex on ex.id=e.extraction_id where e.entry_id=$1 order by 1`,
    [d.entry_id]);
  assert.ok(kinds.rows.some((x) => x.engine_kind === "ocr"),
    `c3.B8-ocr precondition: the entry really cites an OCR extraction (kinds: ${kinds.rows.map((x) => x.engine_kind).join(",")})`);
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: await currentToken(d.entry_id), client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.ok(admits(r?.rung_vector, "B8"),
    `c3.B8-ocr: B8 ADMITS — an OCR citation is out of scope and is not a moved fact (got ${JSON.stringify(r?.rung_vector?.B8)}; non-admitting ${nonAdmitting(r?.rung_vector).join(",")})`);
  assert.equal(r?.posted, true, `c3.B8-ocr: …and the entry posts (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.B8-ocr-only an OCR-ONLY draft is REFUSED upstream — the annex's \"posts clean\" was false (R-L20/D44)", async (t) => {
  if (await gateCore(t)) return;
  // THE CLAIM THE ANNEX GOT BACKWARDS, NOW FORCED INSTEAD OF DESCRIBED. v6.1 listed a
  // "must-not-refuse" case: a draft citing only OCR `pages.*` regions "posts clean". The cell
  // above states in prose that this is unbuildable and cites the reason — but a comment is not a
  // proof, and the annex's sentence stood unchallenged in the record because nothing executed
  // against it. Codex read that sentence and proposed an OCR disjunct in B8 to satisfy it, which
  // would have been fail-open on the one rung whose job is to prove the anchor is CURRENT.
  //
  // The truth is upstream of B8 and it is law 2: an OCR region is a READ OF A PAGE, not a
  // verified fact. `_bind_evidence` stamps `verified` only on a corroborated `invoice.total`
  // citation whose cents match the anchor (0009:462-466), so a draft citing nothing else has no
  // verified amount anchor at all — and the DRAFT DOOR refuses it before B8 is ever asked.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const ocrLine = await seedRegion({
    firm: cited.firm, extraction: cited.extractionId, fieldPath: "pages.1.lines.7",
    textContent: "TOTAL DUE RM 1,000.00", locator: { page: 1, polygon: [0, 0, 1, 1] },
  }).catch((e) => ({ error: e }));
  assert.ok(ocrLine && !ocrLine.error,
    `c3.B8-ocr-only: the OCR line region seeds (got ${ocrLine?.error?.code}: ${ocrLine?.error?.message})`);
  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [ev(ocrLine, "TOTAL DUE RM 1,000.00", "pages.1.lines.7")],
  }).catch((e) => ({ error: e }));

  // FORCED BOTH WAYS. If the draft is refused, the refusal must be the ANCHOR one and not some
  // other wall; if it is somehow accepted, the post must still refuse at B3 or B7 — and it must
  // never be B8 admitting an unanchored entry, which is the outcome the rejected disjunct would
  // have produced.
  if (d?.error) {
    assert.match(`${d.error.code} ${d.error.detail ?? ""} ${d.error.message ?? ""}`,
      /anchor_unbound|unverified_evidence|evidence_invalid|verified/i,
      `c3.B8-ocr-only: the refusal names the missing VERIFIED ANCHOR, not some unrelated wall (got ${d.error.code}: ${d.error.message} ${d.error.detail ?? ""})`);
    return;
  }
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: await currentToken(d.entry_id),
    client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.equal(r?.posted, false,
    `c3.B8-ocr-only: an OCR-only draft NEVER posts — "posts clean" is the annex's error, not the estate's behaviour (${JSON.stringify(r?.refusal)})`);
  const failed = nonAdmitting(r?.rung_vector);
  assert.ok(failed.includes("B3") || failed.includes("B7"),
    `c3.B8-ocr-only: …and it is B3 (anchor unbound) or B7 (unverified evidence) that refuses — the rungs that read the ANCHOR (non-admitting: ${failed.join(",")})`);
});

// ===========================================================================
// 4b · B8-OCR-ANCHOR — C2's pair: the ZERO-IN-SCOPE hole, and its positive twin.
// ===========================================================================

test("f-a2.c3.B8-ocr-anchor an entry anchored ONLY on an OCR invoice.total does not ADMIT at B8 — zero in-scope citations is not a pass", async (t) => {
  if (await gateCore(t)) return;
  // C2. The old rung counted only citations that MOVED, over a POSITIVE kind list. An entry
  // whose every citation was dropped by that filter counted zero moved and read `pass` —
  // admission on absence, on the rung whose whole job is to prove the anchor is CURRENT.
  //
  // AND THE SHAPE IS NOT HYPOTHETICAL, which is the part the old comment got wrong. Nothing in
  // this database stops an `ocr` extraction carrying `field_path='invoice.total'`:
  // `document_regions.field_path` is plain text (0007:210) and the structured_parse guard
  // (0026:559-569) refuses only tin/ssm/brn/account paths. The estate's OWN standard fixture
  // creates exactly that region — asserted below, from the catalog, not assumed —
  // `_write_entry_evidence` stamps `verified` with no engine term (0009:462-466), and
  // `_corroboration_bound` keys on tier + field + cents + hash (0009:211-224). So the entry
  // sails through B3 and B7 and arrives at B8 with nothing the old filter could see.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const ocrKind = await rootQuery(
    "select engine_kind from clara.document_extractions where id=$1", [cited.extractionId]);
  assert.equal(ocrKind.rows[0]?.engine_kind, "ocr",
    "c3.B8-ocr-anchor precondition: the seeded citation region really belongs to an OCR extraction");
  const ocrTotal = await rootQuery(
    `select id, text_content from clara.document_regions
      where extraction_id=$1 and field_path='invoice.total' limit 1`, [cited.extractionId]);
  assert.ok(ocrTotal.rows[0]?.id,
    "c3.B8-ocr-anchor precondition: …and it carries an `invoice.total` field_path — the shape the old comment said the DB prevents");

  const cred = await autodraftCred(A1());
  const d = await agentDraft(OWNER(), cred, {
    client: A1(), cited, codingKind: "supplier_bill", lines: supplierLines(GROSS),
    evidence: [ev(ocrTotal.rows[0].id, ocrTotal.rows[0].text_content, "invoice.total")],
  });
  const tiers = await rootQuery(
    `select ev.provenance_tier, x.engine_kind from clara.entry_evidence ev
       join clara.document_extractions x on x.id=ev.extraction_id where ev.entry_id=$1`, [d.entry_id]);
  assert.ok(tiers.rows.some((r) => r.provenance_tier === "verified" && r.engine_kind === "ocr"),
    `c3.B8-ocr-anchor precondition: the OCR citation really binds at the VERIFIED tier (got ${JSON.stringify(tiers.rows)}) — that is what carries it past B3 and B7`);
  assert.ok(!tiers.rows.some((r) => ["invoice_facts", "llm_text_facts", "llm_vision_facts"].includes(r.engine_kind)),
    "c3.B8-ocr-anchor precondition: …and the entry cites NO fact generation at all, which is the zero-in-scope shape");

  // The generation then MOVES under it: same total, different stated identity.
  await landG2(cited.documentId, { total: GROSS });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: await currentToken(d.entry_id),
    client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.ok(!admits(r?.rung_vector, "B8"),
    `c3.B8-ocr-anchor: B8 does NOT admit — zero in-scope citations is not evidence that the anchor is current (vector ${JSON.stringify(r?.rung_vector)})`);
  assert.equal(r?.rung_vector?.B8, "not_evaluable",
    `c3.B8-ocr-anchor: …and it says so DISTINCTLY rather than failing for a reason it cannot support (got ${JSON.stringify(r?.rung_vector?.B8)})`);
  assert.equal(r?.posted, false,
    `c3.B8-ocr-anchor: and nothing posts — a stale-identity post whose receipt stamps the NEW generation is exactly what this closes (${JSON.stringify(r?.refusal)})`);
});

test("f-a2.c3.B8-current-anchor citing the CURRENT generation's verified total still POSTS — the rung was the reason", async (t) => {
  if (await gateCore(t)) return;
  // Without this twin, "zero in-scope does not admit" is indistinguishable from "B8 stopped
  // admitting anything". The ordinary shape — one citation, on the generation the state names —
  // must still be a pass.
  await ensureChart(OWNER(), A1());
  const cited = await witnessedFiling(OWNER(), { client: A1(), gross: GROSS });
  const { cred, draft } = await draftOnG1(A1(), cited);
  const r = await wakePostEntry(cred, {
    entry: draft.entry_id, expectedRevision: await currentToken(draft.entry_id),
    client: A1(), booksVersion: await booksVersion(A1()),
  });
  assert.ok(admits(r?.rung_vector, "B8"),
    `c3.B8-current-anchor: B8 ADMITS a citation on the CURRENT generation (got ${JSON.stringify(r?.rung_vector?.B8)}; non-admitting ${nonAdmitting(r?.rung_vector).join(",")})`);
  assert.equal(r?.posted, true, `c3.B8-current-anchor: …and it posts (${JSON.stringify(r?.refusal)})`);
});

// ===========================================================================
// 5 · B8-NOT_EVALUABLE — the ARM-0 arm, FORCED on the reachable input and DECLARED
//     UNREACHABLE on the third one, with the ground.
// ===========================================================================

test("f-a2.c3.B8-not_evaluable an UNJUDGEABLE generation reports not_evaluable, never pass — and the unresolved-TEXT input is DECLARED UNREACHABLE", async (t) => {
  if (await gateCore(t)) return;
  // THE RUNG'S CONTRACT HAS THREE ARM-0 INPUTS (Annex E.2): no `document_id`, a `'{}'` fact
  // state, and a witness pair whose TEXT row resolves to no generation (`0092:210-217`). The
  // load-bearing claim is one claim over all three — B8 is NEVER a pass on an input it cannot
  // judge — and it is forced below on an input that a real door produces.
  //
  // THE THIRD INPUT IS UNREACHABLE FROM THIS LANE, and it is DECLARED rather than faked
  // (law 31; the manifest's own wording asked for the unresolved-TEXT shape, and the honest
  // answer is that no door on this lane can produce it).
  //
  //   THE GROUND, asserted positively from the live catalog below rather than argued.
  //   `_agent_post_entry_core` reads its state through the ONE-ARITY `clara._invoice_fact_state
  //   (uuid)`, whose witness arm selects a TEXT row with `engine_kind='llm_text_facts' AND
  //   status='done'` and hands THAT id to `_invoice_fact_state_at`, which re-resolves both
  //   halves of the pair with `status='done'` again. `witness_text_row_unresolved` — the ONLY
  //   arm of `0092:210-217` that emits a NULL `extraction_id`, and therefore the only one that
  //   makes B8 unjudgeable — requires the pinned TEXT row NOT to be a done text row, which that
  //   pair of filters forbids by construction. It is reachable only through the TWO-ARITY pinned
  //   overload called with a VISION id, and no call on this lane makes one.
  //
  //   MEASURED, so the record says what the estate does instead of what it cannot do:
  //     · a successor pair whose TEXT row is `failed`, over a good G1 -> the resolver FALLS
  //       BACK to G1 and answers a corroborated state (asserted below);
  //     · a document whose ONLY pair has a `failed` TEXT row -> `'{}'`, which is ARM-0's
  //       SECOND input, not the refusal envelope (asserted below);
  //     · a pair whose VISION row is `failed` -> a real `pair_refusal` envelope, but with
  //       `extraction_id` PRESENT, so B8 is evaluable and correctly judges it.
  await ensureChart(OWNER(), A2());

  // (1) THE GROUND, from the catalog.
  const one = (await rootQuery(
    `select prosrc from pg_proc where proname='_invoice_fact_state' and pronargs=1
       and pronamespace='clara'::regnamespace`)).rows[0]?.prosrc ?? "";
  assert.ok(one.includes("engine_kind = 'llm_text_facts'") && one.includes("tx.status = 'done'"),
    "c3.B8-not_evaluable ground: the 1-arity resolver the ladder calls pins a DONE llm_text_facts row");
  const at = (await rootQuery(
    `select prosrc from pg_proc where proname='_invoice_fact_state_at'
       and pronamespace='clara'::regnamespace`)).rows[0]?.prosrc ?? "";
  assert.ok((at.match(/status\s*=\s*'done'/g) ?? []).length >= 3,
    "c3.B8-not_evaluable ground: the pinned overload re-resolves both halves of the pair with status='done'");

  // (2) THE TWO FALL-THROUGHS, measured rather than assumed.
  const withG1 = await witnessedFiling(OWNER(), { client: A2(), gross: GROSS });
  await landWitnessPair(withG1.documentId, {
    ...witnessShape({ fields: { "invoice.total": GROSS, "invoice.currency": "RM", "invoice.type_code": "01" } }),
    textStatus: "failed", versionN: 2,
  });
  const fellBack = await factExtraction(withG1.documentId);
  assert.equal(fellBack.state?.pair_refusal ?? null, null,
    `c3.B8-not_evaluable: a failed-TEXT successor produces NO pair refusal — the resolver simply falls back (got ${JSON.stringify(fellBack.state)})`);
  assert.equal(fellBack.extractionId, (await rootQuery(
    `select id from clara.document_extractions where document_id=$1 and engine_kind='llm_text_facts'
       and status='done' order by version_n desc limit 1`, [withG1.documentId])).rows[0].id,
  "…to the newest DONE text generation, which is G1");

  const onlyFailed = await unwitnessedFiling(OWNER(), { client: A2(), gross: GROSS });
  await landWitnessPair(onlyFailed.documentId, {
    ...witnessShape({ fields: { "invoice.total": GROSS, "invoice.currency": "RM", "invoice.type_code": "01" } }),
    textStatus: "failed", versionN: 1,
  });
  assert.deepEqual(await (async () => (await factExtraction(onlyFailed.documentId)).state)(), {},
    "c3.B8-not_evaluable: a document whose ONLY pair has a failed TEXT row answers '{}' — ARM-0's SECOND input, not 0092:210-217's refusal envelope");

  // (3) THE RUNG IS STILL FORCED, on the input a real door produces. A GENERIC entry, because
  // that is the lawful coding kind for a document with no fact generation: the draft core's
  // direction-family arm binds every agent-lane DIRECTIONAL kind (D11), and a document with no
  // facts resolves `unresolved`. B14/B15 both admit this shape, so B8 is measured, not masked.
  // Its OWN document, with no extraction rows but the seeded OCR one: citing a region that
  // belongs to a FAILED text row is refused by the evidence wall (CLR21), which would mask the
  // rung under a fixture defect. The fact state is the same `'{}'`.
  const bare = await unwitnessedFiling(OWNER(), { client: A2(), gross: GROSS });
  assert.deepEqual((await factExtraction(bare.documentId)).state, {},
    "c3.B8-not_evaluable: the forcing fixture's fact state really is '{}'");
  const cred = await autodraftCred(A2());
  const d = await agentDraft(OWNER(), cred, {
    client: A2(), cited: bare, codingKind: null, lines: genericLines(GROSS),
  });
  const r = await wakePostEntry(cred, {
    entry: d.entry_id, expectedRevision: d.revision_token, client: A2(), booksVersion: await booksVersion(A2()),
  });
  assertVectorShape(assert, r?.rung_vector, "c3.B8-not_evaluable");
  assert.notEqual(r?.rung_vector?.B8, "pass",
    `c3.B8-not_evaluable: B8 is NEVER a pass on an unjudgeable input (vector ${JSON.stringify(r?.rung_vector)})`);
  assert.equal(r?.rung_vector?.B8, "not_evaluable",
    `c3.B8-not_evaluable: …and it is reported DISTINCTLY as not_evaluable rather than lumped into fail (vector ${JSON.stringify(r?.rung_vector)})`);
  assert.equal(r?.posted, false, "c3.B8-not_evaluable: and nothing posts on an unjudgeable generation");
  noteLane("c3.B8-not_evaluable: the unresolved-TEXT input (0092:210-217's `witness_text_row_unresolved`) is a DECLARED-UNREACHABLE row, not a forced cell — ground: the 1-arity resolver the ladder calls pins a DONE llm_text_facts row and the pinned overload re-resolves both halves done-filtered, so the only arm that emits a NULL extraction_id cannot be produced from this lane. Measured fall-throughs: failed-TEXT successor -> falls back to G1; only-failed-TEXT pair -> '{}' (ARM-0 input 2); failed-VISION pair -> a pair_refusal envelope whose extraction_id is PRESENT and therefore judgeable.");
});
