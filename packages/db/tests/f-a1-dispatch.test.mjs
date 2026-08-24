// F-A1 — the TWO dispatch recuts: cross-regime precedence, legacy CONTINUITY, and the
// end-to-end evidence chain. Annex C's "Continuity", "End-to-end evidence" and the resolver
// half of "Predicate". The predicate's own conjunct cells live in f-a1-predicate.test.mjs.
//
// THE CLAIM UNDER TEST IS A NEGATIVE ONE, and that is why the continuity cells are shaped as
// exact diffs: replacing clara._invoice_fact_state must not move ANY existing document's answer.
// A cell that only showed the witness path working would leave the expensive half unproven.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, firmOf, grantConsent, seedCitedDocument, opk,
  witnessReady, witnessShape, landWitnessPair, box, money,
  factState, factStateText, factStateAtText, legacyPick, agreedEnvelope, extractedDoc,
} from "./f-a1-fixtures.mjs";
import {
  upsertPayableAccount, upsertAccountClassed, ensureClientEgress, draftEntryV3,
  billLines, ev, FIELD, freshResolution, evidenceRows,
} from "./s6-fixtures.mjs";

let world = null;
let live = false;
const AP = "400-000";
const EXP = "500-A01";

before(async () => {
  world = await buildWorld();
  live = await witnessReady();
  if (live) {
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await ensureClientEgress(world.users.alice, { client: c }).catch(() => {});
    }
  }
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A1 dispatch lane not applied"); return true; }
  return false;
};

const BASE = {
  "invoice.total": 10375, "invoice.total_excl_tax": 9430, "invoice.tax_total": 566,
  "invoice.rounding": 2, "invoice.service_charge": 377,
  "invoice.currency": "MYR", "invoice.type_code": "01",
};
const INVOICE_ID = () => `WIT-${randomUUID().slice(0, 8)}`;

/** A filed invoice document with a corroborating witness pair (and an invoice_id fact). */
async function witnessedDoc({ client = null, invoiceId = null, extractedAtShift = null } = {}) {
  const c = client ?? world.clients.A1;
  const firm = await firmOf(c);
  await grantConsent(world.users.alice, { firm, client: c }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client: c, kind: "invoice" });
  const inv = invoiceId ?? INVOICE_ID();
  const shape = witnessShape({ fields: BASE, extraRegions: [
    { field_path: "invoice.invoice_id", text_content: inv, locator_kind: "page_polygon", locator: box(0, 20, 20, 25) },
  ] });
  const pair = await landWitnessPair(cited.documentId, shape);
  if (extractedAtShift) {
    await rootQuery("update clara.document_extractions set extracted_at = extracted_at + $2::interval where id in ($1,$3)",
      [pair.textId, extractedAtShift, pair.visionId]);
  }
  return { cited, pair, invoiceId: inv, client: c };
}

/** Land ONE additional legacy invoice_facts generation directly (the real writer only mints v1
 *  per document without the human re-extraction door, which is out of this lane's scope). */
async function landLegacyGeneration(document, { versionN, gross, engineId = null, extractedAt = null }) {
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [document])).rows[0].firm_id;
  const eid = engineId ?? `azure-di:prebuilt-invoice:${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,
       workflow_run_id,started_at,finished_at)
     values($1,$2,$3,$4,'invoice_facts','done',$5,now(),now())`,
    [firm, document, eid, versionN, `rig-legacy-${randomUUID().slice(0, 8)}`]);
  // extracted_at is set AT INSERT, never by a later UPDATE: 0007:663-676's supersede guard makes
  // clara.document_extractions append-only-except-one-supersede, so an UPDATE to move the clock
  // raises CLR08. The writer owns the stamp (design §3.9 note 4) and so does this fixture.
  const x = (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope,extracted_at)
     values($1,$2,$3,'invoice_facts',$4,'done',1,$5::jsonb,coalesce($6::timestamptz,clock_timestamp())) returning id`,
    [firm, document, eid, versionN, JSON.stringify(agreedEnvelope()), extractedAt])).rows[0].id;
  for (const [fp, cents] of [["invoice.total", gross], ["invoice.total_excl_tax", gross], ["invoice.tax_total", 0]]) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence,monetary_raw,monetary_cents)
       values($1,$2,'page_polygon',$3::jsonb,$4,$5,null,$5,$6)`,
      [firm, x, JSON.stringify(box(0, 0, 1, 1)), fp, money(cents), cents]);
  }
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content)
     values($1,$2,'page_polygon',$3::jsonb,'invoice.currency','MYR')`,
    [firm, x, JSON.stringify(box(0, 0, 1, 1))]);
  return { extractionId: x, engineId: eid, versionN };
}

// ===========================================================================
// Continuity — the expensive half.
// ===========================================================================

test("CONTINUITY: a MULTI-GENERATION legacy document resolves through the recut dispatcher to exactly the generation the 0016 ordering key picks, byte-identical", async (t) => {
  if (gate(t)) return;
  const doc = await extractedDoc(world.users.alice, { client: world.clients.A1, cents: 500000 });
  await landLegacyGeneration(doc.documentId, { versionN: 2, gross: 600000 });
  const g3 = await landLegacyGeneration(doc.documentId, { versionN: 3, gross: 700000 });
  // The 0016:2263-2270 select, recomputed IN THE TEST from the migration this file must not move.
  const pick = await legacyPick(doc.documentId);
  assert.equal(pick, g3.extractionId, "the within-regime key still picks the newest task generation");
  const viaResolver = await factStateText(doc.documentId);
  const viaPinned = await factStateAtText(doc.documentId, pick);
  assert.equal(viaResolver, viaPinned,
    "the dispatcher's legacy path returns the pinned overload's BYTES for the same extraction (the 0023:357 exact-diff idiom)");
  const s = JSON.parse(viaResolver);
  assert.equal(s.total_cents, 700000, "…and it is generation 3's number, not generation 1's");
  assert.equal(Object.prototype.hasOwnProperty.call(s, "regime"), false,
    "a legacy envelope carries NO witness-regime key (N5)");
  assert.equal(Object.prototype.hasOwnProperty.call(s, "vision_extraction_id"), false);
});

test("CONTINUITY: a document with NEITHER regime still returns '{}' — the live contract, unmoved", async (t) => {
  if (gate(t)) return;
  const firm = await firmOf(world.clients.A1);
  const bare = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  assert.equal(await factStateText(bare.documentId), "{}", "no fact-bearing generation resolves to the empty object");
});

test("CONTINUITY: the STRUCTURED (`clara-%`) branch is byte-unmoved — a structured extraction still takes it", async (t) => {
  if (gate(t)) return;
  // The structured branch is geometry-EXEMPT and requires a breakdown when tax > 0. A structured
  // row with no polygon at all therefore corroborates there and could not corroborate on the OCR
  // branch — which is what makes this cell prove WHICH branch ran.
  const firm = await firmOf(world.clients.A1);
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  const eid = `clara-structured:${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status,
       workflow_run_id,started_at,finished_at)
     values($1,$2,$3,1,'local_facts','done',$4,now(),now())`,
    [firm, cited.documentId, eid, `rig-struct-${randomUUID().slice(0, 8)}`]);
  const x = (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,
       page_count,envelope,extracted_at)
     values($1,$2,$3,'invoice_facts',1,'done',1,'{}'::jsonb,clock_timestamp()) returning id`,
    [firm, cited.documentId, eid])).rows[0].id;
  const put = async (fp, text, cents) => rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
       text_content,monetary_raw,monetary_cents)
     values($1,$2,'page_polygon','{"page":1,"polygon":[]}'::jsonb,$3,$4,$5,$6)`,
    [firm, x, fp, text, cents === null ? null : text, cents]);
  await put("invoice.total", money(10000), 10000);
  await put("invoice.total_excl_tax", money(10000), 10000);
  await put("invoice.tax_total", money(0), 0);
  await put("invoice.currency", "MYR", null);
  await put("invoice.type_code", "01", null);
  const s = await factState(cited.documentId);
  assert.equal(s.corroborated, true,
    "the structured branch corroborated WITHOUT geometry — i.e. the `clara-%` arm ran, not the OCR arm");
});

test("CONTINUITY: the inlined evidence digest (0009:456-459) and clara._fact_hash agree on a real input set", async (t) => {
  if (gate(t)) return;
  const d = await witnessedDoc();
  const r = await rootQuery(
    `select r.id,
            clara._fact_hash(r.extraction_id,r.id,r.field_path,r.text_content,r.monetary_cents) as fn,
            encode(sha256(convert_to(jsonb_build_object(
              'extraction_id', r.extraction_id, 'region_id', r.id,
              'field_path', r.field_path, 'quote', coalesce(r.text_content,''),
              'monetary_cents', r.monetary_cents)::text, 'UTF8')), 'hex') as inlined
       from clara.document_regions r where r.extraction_id=$1 order by r.id`, [d.pair.textId]);
  assert.ok(r.rows.length >= 5, "the pair wrote a real fact set");
  for (const row of r.rows) assert.equal(row.fn, row.inlined, `digests agree for region ${row.id}`);
  // SPELLING IS NOT IDENTITY: prove the transcription above IS the live writer's expression.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._write_entry_evidence(uuid,uuid,jsonb)'::regprocedure")).rows[0].prosrc;
  for (const frag of ["'extraction_id', x.extraction_id, 'region_id', x.id,",
    "'field_path', x.field_path, 'quote', coalesce(x.text_content,''),",
    "'monetary_cents', x.monetary_cents)::text, 'UTF8')), 'hex')"]) {
    assert.ok(src.includes(frag), `the live inline digest still carries: ${frag}`);
  }
});

// ===========================================================================
// Cross-regime precedence (M6) — both directions, plus the tie.
// ===========================================================================

test("CROSS-REGIME: a witness pair at version_n=1 minted AFTER a legacy v3 read WINS on extracted_at", async (t) => {
  if (gate(t)) return;
  const doc = await extractedDoc(world.users.alice, { client: world.clients.A1, cents: 500000 });
  await landLegacyGeneration(doc.documentId, { versionN: 2, gross: 600000 });
  await landLegacyGeneration(doc.documentId, { versionN: 3, gross: 700000 });
  const shape = witnessShape({ fields: BASE });
  const pair = await landWitnessPair(doc.documentId, shape);   // clock_timestamp() is later
  const s = await factState(doc.documentId);
  assert.equal(s.regime, "witness", "the newer generation governs even at version_n=1 (version_n is PER-LANE)");
  assert.equal(s.extraction_id, pair.textId);
  assert.equal(s.total_cents, 10375);
});

test("CROSS-REGIME: and the other direction — a legacy read minted AFTER a witness pair wins", async (t) => {
  if (gate(t)) return;
  const d = await witnessedDoc();
  const later = await landLegacyGeneration(d.cited.documentId, { versionN: 1, gross: 880000 });
  const s = await factState(d.cited.documentId);
  assert.equal(Object.prototype.hasOwnProperty.call(s, "regime"), false, "the legacy envelope governs");
  assert.equal(s.extraction_id, later.extractionId);
  assert.equal(s.total_cents, 880000);
});

test("CROSS-REGIME: a clock TIE prefers the witness pair (M6)", async (t) => {
  if (gate(t)) return;
  const d = await witnessedDoc();
  // The exact same instant on both regimes' winners, stamped at INSERT (see landLegacyGeneration).
  const at = (await rootQuery(
    "select extracted_at from clara.document_extractions where id=$1", [d.pair.textId])).rows[0].extracted_at;
  await landLegacyGeneration(d.cited.documentId, { versionN: 1, gross: 880000, extractedAt: at });
  const s = await factState(d.cited.documentId);
  assert.equal(s.regime, "witness", "a tie resolves toward the newer regime, never by coin flip");
  assert.equal(s.extraction_id, d.pair.textId);
});

test("the 2-arg overload dispatches from EITHER half of the pair and both return the same verdict", async (t) => {
  if (gate(t)) return;
  const d = await witnessedDoc();
  const fromText = await factStateAtText(d.cited.documentId, d.pair.textId);
  const fromVision = await factStateAtText(d.cited.documentId, d.pair.visionId);
  assert.equal(fromText, fromVision, "binding the vision row yields the pair verdict, canonicalised on the text row");
  assert.equal(JSON.parse(fromText).extraction_id, d.pair.textId);
});

// ===========================================================================
// The consumers that inherit the fix.
// ===========================================================================

test("the DUPLICATE-BILL wall's discriminant is LIVE for a witness-born document — before the recut it read '{}' and the comparison could never fire", async (t) => {
  if (gate(t)) return;
  const d = await witnessedDoc();
  // The wall's exact expression, 0015:1402.
  const seen = (await rootQuery(
    "select (clara._invoice_fact_state($1)->>'invoice_id') as v", [d.cited.documentId])).rows[0].v;
  assert.equal(seen, d.invoiceId, "the wall now SEES the witness-read invoice number");
  // The exact diff: this document has NO legacy generation, so the pre-recut resolver returned
  // '{}' and `('{}'::jsonb->>'invoice_id') = v_invoice_id` is NULL — never true, never a refusal.
  assert.equal(await legacyPick(d.cited.documentId), null, "there is no legacy generation to have seen it");
  const preRecut = (await rootQuery(
    "select ('{}'::jsonb->>'invoice_id') = $1 as fires", [d.invoiceId])).rows[0].fires;
  assert.notEqual(preRecut, true, "…and the pre-recut comparison could not fire (law 27(2)'s permissive branch)");
  // Two documents carrying the SAME supplier invoice number now compare EQUAL through the wall.
  const twin = await witnessedDoc({ invoiceId: d.invoiceId });
  const both = (await rootQuery(
    `select (clara._invoice_fact_state($1)->>'invoice_id')
            = (clara._invoice_fact_state($2)->>'invoice_id') as same`,
    [d.cited.documentId, twin.cited.documentId])).rows[0].same;
  assert.equal(both, true, "the duplicate discriminant matches across two witness-born documents");
});

test("END-TO-END: a corroborated witness pair mints provenance_tier='verified' through clara._write_entry_evidence — and its negative twin mints 'model_read'", async (t) => {
  if (gate(t)) return;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});

  const draftOn = async (fields) => {
    const cited = await seedCitedDocument(world.users.alice, { firm, client, kind: "invoice" });
    const pair = await landWitnessPair(cited.documentId, witnessShape({ fields }));
    const region = (await rootQuery(
      `select id, text_content, monetary_cents from clara.document_regions
        where extraction_id=$1 and field_path='invoice.total'`, [pair.textId])).rows[0];
    const state = await factState(cited.documentId);
    const draft = await draftEntryV3(world.users.alice, {
      client,
      resolution: await freshResolution(world.users.alice, client,
        { subjectKind: "document", subjectId: cited.documentId }),
      document: cited.documentId, sha256: cited.sha256,
      lines: billLines(EXP, AP, Number(region.monetary_cents)),
      vendor: { new: { name: "WITNESSCO SDN BHD", registration_no: "201801000888" } },
      evidence: [ev(region.id, region.text_content, FIELD.total)],
      opKey: opk("wit-draft"),
    });
    return { state, rows: await evidenceRows(draft.entry_id), region };
  };

  const good = await draftOn(BASE);
  assert.equal(good.state.corroborated, true, "the pair corroborates");
  const totalRow = good.rows.find((r) => r.field_path === "invoice.total");
  assert.equal(totalRow.provenance_tier, "verified",
    "the three-term conjunction (corroborated ∧ invoice.total ∧ cents-equal) reaches a WITNESS-born document");
  assert.equal(totalRow.region_id, good.region.id, "…bound to the cited witness fact region");

  // The negative twin: same shape, tax NOT stated — the nil-tax law refuses, so the tier drops.
  const bad = await draftOn({ ...BASE, "invoice.tax_total": null });
  assert.equal(bad.state.corroborated, false);
  assert.equal(bad.rows.find((r) => r.field_path === "invoice.total").provenance_tier, "model_read",
    "an uncorroborated pair mints model_read, never verified");
});

test("the CALLER CENSUS is non-vacuous: the resolver's consumers are the live bodies the design names", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select p.proname,
            (length(s.src) - length(replace(s.src,'clara._invoice_fact_state',''))) / length('clara._invoice_fact_state') as sites
       from pg_proc p
       cross join lateral (select regexp_replace(p.prosrc,'--[^` + String.fromCharCode(10) + `]*','','g') as src) s
      where p.pronamespace='clara'::regnamespace and p.prosrc is not null
        and p.proname not in ('_invoice_fact_state','_invoice_fact_state_at')
        and position('clara._invoice_fact_state' in s.src) > 0
      order by p.proname`);
  const names = r.rows.map((x) => x.proname);
  // F-A2 PR-1 (D31): the supplier floor's BODY moved into
  // clara._assert_supplier_bill_shape_at_projected and the 2-arity entry point became a thin
  // delegate passing NULL, so the name that reaches the resolver moves with the body. The census
  // still demands SEVEN bodies and still names each one — it is re-pointed, never shortened, and
  // the pre-F-A2 name is what a frontier database must show.
  const floorName = names.includes("_assert_supplier_bill_shape_at_projected")
    ? "_assert_supplier_bill_shape_at_projected" : "_assert_supplier_bill_shape_at";
  for (const must of ["_write_entry_evidence", "execute_rule_post", "_approve_entry_core",
    floorName, "_coding_lane_core", "_draft_entry_core", "revise_entry"]) {
    assert.ok(names.includes(must), `${must} reaches corroboration through the recut resolver`);
  }
  const sites = r.rows.reduce((a, x) => a + Number(x.sites), 0);
  assert.ok(sites >= names.length, `the census counts call SITES (${sites}) as well as bodies (${names.length})`);
});
