// F-A2 opener (6) — THE WITNESS-FIRST READER ESTATE, battery for
// migrations/UNNUMBERED_f_a2_witness_readers.sql (number claimed at merge; this file gates on
// the stable name suffix, never on a number).
//
// WHAT IS BEING PROVEN. After the 0097 cutover every new invoice-shaped document is born as a
// witness PAIR, but fourteen reader bodies still selected the document's governing extraction
// with a hardcoded legacy engine kind — so they read nothing. The fix lifts the 0093 resolver's
// RULED cross-regime pick into one shared selector and routes the reader estate through it —
// twelve recut bodies, the twelfth being the task-transition wall this battery's own cell 13
// discovered was needed, plus ONE new function.
//
// TWO FUNCTIONS, TWO QUESTIONS (migration §1b, and the rig is what separated them):
//   clara._document_facts_extraction — WHICH GENERATION GOVERNS. The ruled 0093 pick, task-
//     joined. The direction chain and the coding lane's own guard ask exactly this.
//   clara._document_facts_regions    — WHERE THE REGIONS COME FROM. The ruled pick, or, when it
//     has nothing to say at all, the legacy row no processing task ever attributed. Strictly
//     wider, defined in terms of the ruled pick, and its wider arm is UNREACHABLE once any
//     witness generation exists — cell 14b proves that on the shape that would break it.
//
// The design centre is not "the readers see more rows"; it is that the coin flip between the
// two halves of a pair, and the mixing of two GENERATIONS on one document, become structurally
// impossible. So the battery's spine is three measured populations, not one happy path:
//
//   witness-born      -> the lane reaches ready, deterministically, 20/20
//   legacy-only       -> byte-identical to the PRE-FIX lane, proven as an exact diff in-DB
//   both regimes      -> one generation governs everything, 12/12, zero splits
//
// ON CONTRACT-BLINDNESS, STATED HONESTLY. This lane authored the migration, so the blindness
// here is PROCEDURAL, not structural: every outcome marked ▣ below is the outcome the F-A2-R1
// sizing report measured on a SHADOW body built before this migration existed (its prove2 /
// prove4 / prove6 runs), transcribed as an expectation rather than derived by reading the
// installed body. The cells that read catalog text are marked as structural and say so.
//
// THE PRE-FIX SHADOW. Several cells compare against `clara._o6_prefix_lane`, a reconstruction of
// the coding lane AS IT WAS: the installed body with its four region reads put back to the
// inline legacy sub-select and its guard pointed at a legacy-only selector shadow. It is built
// from the LIVE body by string surgery in `before`, so it tracks whatever is actually installed
// rather than a copy of the source that could rot. Both shadows are dropped in `after`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, firmOf, grantConsent, seedCitedDocument,
  witnessShape, landWitnessPair, box, legacyPick, factState, setDocumentKind,
} from "./f-a1-fixtures.mjs";

const SHADOW_SEL = "_o6_prefix_sel";
const SHADOW_LANE = "_o6_prefix_lane";

/** The twelve bodies this migration recuts, by exact identity. */
const ESTATE = [
  "clara._tf_processing_task_update()",
  "clara._document_facts_extraction(uuid)",
  "clara._document_direction_at(uuid,uuid,uuid)",
  "clara._coding_lane_core(uuid,uuid)",
  "clara.list_autodraft_candidates()",
  "clara._resolve_vendor_binding(uuid,uuid,uuid)",
  "clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)",
  "clara.revise_entry(uuid,jsonb,jsonb,jsonb,uuid,text,jsonb,jsonb)",
  "clara.get_doc_entry_diff(uuid,uuid)",
  "clara.get_draft_review(uuid,uuid)",
  "clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)",
  "clara.set_document_kind(uuid,text,text,text)",
];

const BASE = {
  "invoice.total": 10375, "invoice.total_excl_tax": 9430, "invoice.tax_total": 566,
  "invoice.rounding": 2, "invoice.service_charge": 377,
  "invoice.currency": "MYR", "invoice.type_code": "01",
};
const fold = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const region = (path, value) => ({
  field_path: path, text_content: value, monetary_raw: value, monetary_cents: null,
  locator_kind: "page_polygon", locator: box(0, 0, 1, 1),
});

let world = null;
let live = false;
let ctx = null;

/**
 * THE CAPABILITY, read from the catalog — the instrument production itself uses. THREE
 * independently-checked facts, because a half-applied window must fail LOUDLY rather than skip:
 * the selector reading the witness regime at all, the coding lane no longer carrying a legacy
 * kind filter of its own, and the sweep gate admitting the witness lane. Those three land in
 * three different sections of one migration, so any disagreement between them is drift.
 */
async function readerEstateReady() {
  const r = await rootQuery(`
    select position('llm_text_facts' in
             (select p.prosrc from pg_proc p
               where p.oid='clara._document_facts_extraction(uuid)'::regprocedure)) > 0 as selector,
           (select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') from pg_proc p
              where p.oid='clara._coding_lane_core(uuid,uuid)'::regprocedure)
             !~ 'engine_kind\\s*=\\s*''invoice_facts''' as lane,
           position('llm_witness' in
             (select p.prosrc from pg_proc p
               where p.oid='clara.list_autodraft_candidates()'::regprocedure)) > 0 as sweep,
           position('''statement_parse'',''llm_witness''' in
             (select p.prosrc from pg_proc p
               where p.oid='clara._tf_processing_task_update()'::regprocedure)) > 0 as wall`);
  const s = r.rows[0];
  if (!s.selector && !s.lane && !s.sweep && !s.wall) return false;
  if (!s.selector || !s.lane || !s.sweep || !s.wall) {
    throw new Error(`F-A2 opener 6 DRIFT: a half-applied reader estate — selector=${s.selector} lane=${s.lane} sweep=${s.sweep} wall=${s.wall} — apply UNNUMBERED_f_a2_witness_readers.sql as a whole`);
  }
  return true;
}

/** Rebuild the PRE-FIX coding lane from the LIVE body, plus the pre-fix legacy-only selector. */
async function installPreFixShadow() {
  await rootQuery(`
    create or replace function clara.${SHADOW_SEL}(p_document uuid) returns uuid
      language sql stable security definer set search_path=clara,pg_temp as $$
      select e.id
      from clara.document_processing_tasks t
      join clara.document_extractions e on e.document_id=t.document_id and e.engine_id=t.engine_id
        and e.version_n=t.version_n and e.engine_kind='invoice_facts' and e.status='done'
      where t.document_id=p_document and t.lane in ('invoice_facts','local_facts') and t.status='done'
      order by t.version_n desc, t.id desc limit 1;
    $$`);
  const def = (await rootQuery(
    "select pg_get_functiondef('clara._coding_lane_core(uuid,uuid)'::regprocedure) d")).rows[0].d;
  const GUARD = "if clara._document_facts_extraction(f.document_id) is null then";
  const CALL = "clara._document_facts_regions(f.document_id)";
  const INLINE = `(
        select e.id from clara.document_extractions e
        where e.document_id=f.document_id and e.engine_kind='invoice_facts' and e.status='done'
        order by e.version_n desc,e.id desc limit 1)`;
  assert.equal(def.split(GUARD).length - 1, 1, "the live lane must carry exactly one guard on the RULED pick");
  assert.equal(def.split(CALL).length - 1, 4, "the live lane must reach the REGION SOURCE 4× (the four counterparty region reads)");
  const body = def
    .split(GUARD).join("if @@GUARD@@ is null then")
    .split(CALL).join(INLINE)
    .split("if @@GUARD@@ is null then").join(`if clara.${SHADOW_SEL}(f.document_id) is null then`)
    .replace("FUNCTION clara._coding_lane_core(", `FUNCTION clara.${SHADOW_LANE}(`);
  assert.equal(body.split(INLINE).length - 1, 4, "the shadow must restore exactly four inline region sub-selects");
  await rootQuery(body);
}

/** Land a LEGACY generation on a document: one done invoice_facts task + extraction + regions. */
async function landLegacy(firm, document, regions, { versionN = 1 } = {}) {
  const eid = `azure-di:prebuilt-invoice:v1:${randomUUID().slice(0, 8)}`;
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
       status,workflow_run_id,started_at,finished_at)
     values($1,$2,$3,$4,'invoice_facts','done',$5,now(),now())`,
    [firm, document, eid, versionN, `rig-o6-${randomUUID().slice(0, 8)}`]);
  const xid = (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
       status,page_count,envelope,extracted_at)
     values($1,$2,$3,'invoice_facts',$4,'done',1,'{}'::jsonb,clock_timestamp()) returning id`,
    [firm, document, eid, versionN])).rows[0].id;
  for (const r of regions) {
    await rootQuery(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
         text_content,engine_confidence,monetary_raw,monetary_cents)
       values($1,$2,'page_polygon',$3::jsonb,$4,$5,null,$6,$7)`,
      [firm, xid, JSON.stringify(r.locator ?? box(0, 0, 1, 1)), r.field_path, r.text_content,
        r.monetary_raw ?? null, r.monetary_cents ?? null]);
  }
  return xid;
}

async function liveCounterparty(firm, client, sub, name, kind = "vendor") {
  await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values($1,$2,$3,$4,$5,$6)`, [firm, client, kind, name, fold(name), sub]);
  return name;
}

const laneOf = async (fn, client, filing) =>
  (await rootQuery(`select lane, reasons from clara.${fn}($1,$2)`, [client, filing])).rows[0];
/** The RULED pick — which generation governs. The direction chain and the lane's guard ask this. */
const selectorOf = async (document) =>
  (await rootQuery("select clara._document_facts_extraction($1) x", [document])).rows[0].x;
/** The REGION SOURCE — the ruled pick, or the legacy row no task attributed (migration §1b). */
const regionsOf = async (document) =>
  (await rootQuery("select clara._document_facts_regions($1) x", [document])).rows[0].x;

before(async () => {
  live = await readerEstateReady();
  if (!live) return;
  world = await buildWorld();
  const client = world.clients.A2;
  const sub = world.users.alice;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  ctx = { client, sub, firm };
  await installPreFixShadow();
});

after(async () => {
  if (live) {
    await rootQuery(`drop function if exists clara.${SHADOW_LANE}(uuid,uuid)`).catch(() => {});
    await rootQuery(`drop function if exists clara.${SHADOW_SEL}(uuid)`).catch(() => {});
  }
  await endPool();
});

function mustBeLive() {
  assert.ok(live, "UNNUMBERED_f_a2_witness_readers.sql is not applied on this database — this battery must FAIL, not skip, against a pre-opener-6 chain");
}

/** One witness-born filing whose cited vendor is already a live counterparty. */
async function witnessDoc({ vendor = null, extra = [], fields = BASE, shapeArgs = {} } = {}) {
  const { client, sub, firm } = ctx;
  const name = vendor ?? `ACME SUPPLIES SDN BHD ${randomUUID().slice(0, 6)}`;
  if (vendor === null) await liveCounterparty(firm, client, sub, name);
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const shape = witnessShape({
    fields, extraRegions: [region("invoice.vendor_name", name), ...extra], ...shapeArgs,
  });
  const pair = await landWitnessPair(doc.documentId, shape);
  return { ...doc, pair, vendorName: name };
}

// ---------------------------------------------------------------------------------------
// CELL 1 ▣ — THE HEADLINE. A witness-born, corroborated purchase invoice reaches `ready`,
// and it does so on EVERY fixture, not on a lucky one. The sizing report measured the live
// lane at needs_review["vendor_unresolved"] 20/20 and the resolver-shaped lane at ready 20/20;
// this is the second half of that table, now on the installed body.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.witness-born corroborated purchase invoice reaches ready, 20/20", async () => {
  mustBeLive();
  const verdicts = [];
  for (let i = 0; i < 20; i++) {
    const d = await witnessDoc();
    verdicts.push(await laneOf("_coding_lane_core", ctx.client, d.filingId));
  }
  const ready = verdicts.filter((v) => v.lane === "ready").length;
  assert.equal(ready, 20, `expected ready 20/20, got ${ready}/20 — sample reasons ${JSON.stringify(verdicts.find((v) => v.lane !== "ready")?.reasons ?? [])}`);
});

// ---------------------------------------------------------------------------------------
// CELL 2 — THE SAME FIXTURES THROUGH THE PRE-FIX SHADOW STILL STARVE. Cell 1 without this is
// an assertion about the present, not about the change: a fixture that would have passed
// before proves nothing about the fix. This is the control that makes cell 1 a delta.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the pre-fix lane starves on the very same witness fixture", async () => {
  mustBeLive();
  const d = await witnessDoc();
  const after_ = await laneOf("_coding_lane_core", ctx.client, d.filingId);
  const before_ = await laneOf(SHADOW_LANE, ctx.client, d.filingId);
  assert.equal(after_.lane, "ready");
  assert.equal(before_.lane, "needs_review");
  assert.deepEqual(before_.reasons, ["vendor_unresolved"]);
});

// ---------------------------------------------------------------------------------------
// CELL 3 — LEGACY CONTINUITY, AS AN EXACT DIFF. A pre-cutover document still resolves through
// the fallback arm, and the whole lane verdict is BYTE-IDENTICAL to the pre-fix body's. Both
// halves are asserted: the selector returns exactly the legacy pick recomputed independently
// in the test, and the two lane bodies agree on lane AND on the reason array's exact bytes.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.legacy-only documents: selector = the legacy pick, and the lane verdict is byte-identical to the pre-fix body", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const shapes = [
    { label: "known vendor", vendor: true, reg: false },
    { label: "unknown vendor (birth)", vendor: false, reg: false },
    { label: "no name cited at all", vendor: null, reg: false },
    { label: "known vendor + registration", vendor: true, reg: true },
  ];
  for (const s of shapes) {
    const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
    const regions = [];
    if (s.vendor !== null) {
      const name = `LEGACY CO ${randomUUID().slice(0, 6)}`;
      if (s.vendor) await liveCounterparty(firm, client, sub, name);
      regions.push(region("invoice.vendor_name", name));
      if (s.reg) regions.push(region("invoice.vendor_registration", `2026${randomUUID().slice(0, 6)}`));
    }
    const xid = await landLegacy(firm, doc.documentId, regions);

    assert.equal(await selectorOf(doc.documentId), xid, `${s.label}: the selector must return the legacy extraction`);
    assert.equal(await selectorOf(doc.documentId), await legacyPick(doc.documentId),
      `${s.label}: the selector must equal the independently recomputed legacy pick`);

    const after_ = await laneOf("_coding_lane_core", client, doc.filingId);
    const before_ = await laneOf(SHADOW_LANE, client, doc.filingId);
    assert.equal(after_.lane, before_.lane, `${s.label}: lane moved`);
    assert.equal(JSON.stringify(after_.reasons), JSON.stringify(before_.reasons),
      `${s.label}: reasons moved — ${JSON.stringify(before_.reasons)} -> ${JSON.stringify(after_.reasons)}`);
  }
});

// ---------------------------------------------------------------------------------------
// CELL 4 ▣ — THE SPLIT-GENERATION HAZARD, CLOSED. Twelve documents carrying BOTH regimes,
// each naming a DIFFERENT vendor in each generation. The sizing report measured a naive kind
// widening at 9/12 ready with 5/12 split picks, two of which went ready with amounts from one
// generation and a party from the other. The installed selector must be 12/12 ready with ZERO
// splits — and the party read must be the WITNESS generation's name, checked by identity.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.both regimes on one document: 12/12 ready, 0 split generations, the party comes from the governing one", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  let ready = 0; let splits = 0;
  for (let i = 0; i < 12; i++) {
    const legacyVendor = `LEGACY CO ${randomUUID().slice(0, 6)}`;
    const witnessVendor = `WITNESS CO ${randomUUID().slice(0, 6)}`;
    await liveCounterparty(firm, client, sub, legacyVendor);
    await liveCounterparty(firm, client, sub, witnessVendor);

    const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
    await landLegacy(firm, doc.documentId, [region("invoice.vendor_name", legacyVendor)]);
    const pair = await landWitnessPair(doc.documentId, witnessShape({
      fields: BASE, extraRegions: [region("invoice.vendor_name", witnessVendor)],
    }));

    // The lane and the corroboration resolver must resolve the SAME generation. The resolver
    // does not expose its pick, so the identity is checked where it is observable: the selector
    // agrees with the witness half, and the name the lane resolved is that half's name.
    const pick = await selectorOf(doc.documentId);
    if (pick !== pair.textId) splits++;
    const v = await laneOf("_coding_lane_core", client, doc.filingId);
    if (v.lane === "ready") ready++;

    const seen = (await rootQuery(
      `select nullif(btrim(min(r.text_content)),'') n from clara.document_regions r
        where r.extraction_id=clara._document_facts_regions($1)
          and r.field_path='invoice.vendor_name'`, [doc.documentId])).rows[0].n;
    assert.equal(seen, witnessVendor, "the governing generation's vendor name must be the witness one (its clock is newer)");
  }
  assert.equal(splits, 0, `expected 0 split generations, got ${splits}/12`);
  assert.equal(ready, 12, `expected ready 12/12, got ${ready}/12`);
});

// ---------------------------------------------------------------------------------------
// CELL 5 — THE PRECEDENCE RUNS BOTH WAYS. A document whose LEGACY generation is strictly
// newer resolves to the legacy arm in the selector, and the corroboration resolver agrees.
// Without this cell "witness-first" would be indistinguishable from "witness-only", and the
// fallback arm's stated reach would be untested in the one case that is not simply absence.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.a strictly newer legacy generation wins, in the selector and in the resolver alike", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const legacyVendor = `LEGACY LATER ${randomUUID().slice(0, 6)}`;
  await liveCounterparty(firm, client, sub, legacyVendor);
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  // witness FIRST (older clock), legacy SECOND (newer clock) — the reverse of cell 4.
  const pair = await landWitnessPair(doc.documentId, witnessShape({
    fields: BASE, extraRegions: [region("invoice.vendor_name", `WITNESS EARLIER ${randomUUID().slice(0, 6)}`)],
  }));
  const xid = await landLegacy(firm, doc.documentId, [region("invoice.vendor_name", legacyVendor)]);

  assert.equal(await selectorOf(doc.documentId), xid, "the newer legacy generation must govern");
  assert.notEqual(await selectorOf(doc.documentId), pair.textId);
  const seen = (await rootQuery(
    `select nullif(btrim(min(r.text_content)),'') n from clara.document_regions r
      where r.extraction_id=clara._document_facts_regions($1)
        and r.field_path='invoice.vendor_name'`, [doc.documentId])).rows[0].n;
  assert.equal(seen, legacyVendor);
});

// ---------------------------------------------------------------------------------------
// CELL 6 ▣ — THE COIN FLIP IS STRUCTURALLY IMPOSSIBLE. Both halves of a pair share version_n,
// so any selector that could return either is decided by uuid comparison — and the vision half
// carries no regions, so when it wins the read is empty. Twenty pairs, including the ones where
// the vision row's uuid sorts ABOVE the text row's: the selector must return the TEXT half
// every time, and the count of vision-sorts-higher pairs is asserted non-zero so the cell
// cannot pass by never meeting the hazard.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the vision half is never selected, including when its uuid sorts higher", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  let visionHigher = 0;
  for (let i = 0; i < 20; i++) {
    const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
    const pair = await landWitnessPair(doc.documentId, witnessShape({ fields: BASE }));
    if (pair.visionId > pair.textId) visionHigher++;
    assert.equal(await selectorOf(doc.documentId), pair.textId,
      "the selector must return the region-bearing TEXT half of the pair");
  }
  assert.ok(visionHigher > 0, `the hazard was never met: 0/20 pairs had the vision uuid sorting above the text uuid`);
});

// ---------------------------------------------------------------------------------------
// CELL 7 ▣ — THE SALES BRANCH. The sizing report's finding 2: a REGION-ONLY widening leaves the
// direction guard starved, so a witness-born SALES invoice is read down the PURCHASE branch and
// resolves the ISSUER. With the selector lifted, the direction resolves and the lane reads
// `invoice.customer_name`. Both parties are printed and both are live counterparties, so the
// cell can tell WHICH one was read rather than inferring it from a refusal.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.a witness-born sales invoice resolves its direction and reads the CUSTOMER", async () => {
  mustBeLive();
  const client = world.clients.S1;
  const sub = world.users.erin;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  await rootQuery(
    `insert into clara.firm_limits(firm_id,sales_lane_active) values($1,true)
     on conflict (firm_id) do update set sales_lane_active=true`, [firm]);

  const ssm = `2026${randomUUID().replace(/\D/g, "").slice(0, 8).padEnd(8, "1")}`;
  await rootQuery(
    `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
     values($1,$2,'ssm',$3,(select user_id from clara.firm_memberships where firm_id=$1 and status='active' limit 1))`,
    [firm, client, ssm]).catch(() => {});
  const selfName = (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
  const customer = `PELANGGAN UTAMA SDN BHD ${randomUUID().slice(0, 6)}`;
  await liveCounterparty(firm, client, sub, customer, "customer");
  await liveCounterparty(firm, client, sub, selfName, "vendor");

  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await landWitnessPair(doc.documentId, witnessShape({
    fields: BASE,
    extraRegions: [
      region("invoice.vendor_name", selfName),
      region("invoice.vendor_registration", ssm),
      region("invoice.customer_name", customer),
    ],
  }));

  const dir = (await rootQuery("select clara._document_direction($1,$2) d", [doc.documentId, client])).rows[0].d;
  assert.equal(dir, "sales", "the direction decision must resolve for a witness-born sales invoice");
  const tri = (await rootQuery("select clara._autodraft_direction_tri($1,$2) d", [doc.documentId, client])).rows[0].d;
  assert.equal(tri, "sales");

  // The pre-fix lane cannot even ask the question: its guard's selector answers null.
  assert.equal(await rootQuery("select clara._o6_prefix_sel($1) x", [doc.documentId])
    .then((r) => r.rows[0].x), null);
  const v = await laneOf("_coding_lane_core", client, doc.filingId);
  assert.ok(!v.reasons.includes("customer_name_missing"),
    `the sales branch must find the customer region — got ${JSON.stringify(v.reasons)}`);
  assert.ok(!v.reasons.includes("direction_unresolved"), JSON.stringify(v.reasons));
});

// ---------------------------------------------------------------------------------------
// CELL 8 — THE CATCH-UP SWEEP. The event-driven path was already regime-agnostic; this gate is
// what catches a filing whose completion event was missed, and a witness-born filing was
// permanently invisible to it. Both directions are asserted on the same run: the witness filing
// appears, and a legacy filing still does.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the catch-up sweep lists witness-born filings, and still lists legacy ones", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const w = await witnessDoc();
  const l = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await landLegacy(firm, l.documentId, [region("invoice.vendor_name", `LEGACY SWEEP ${randomUUID().slice(0, 6)}`)]);

  const seen = (await rootQuery("select filing_id from clara.list_autodraft_candidates()")).rows.map((r) => r.filing_id);
  assert.ok(seen.includes(w.filingId), "the witness-born filing must be visible to the catch-up sweep");
  assert.ok(seen.includes(l.filingId), "the legacy filing must still be visible to the catch-up sweep");
});

// ---------------------------------------------------------------------------------------
// CELL 9 — THE TWO DISPLAY BODIES. Both are granted to clara_authenticated and clara_agent_ro:
// this is what a human reviewer actually sees, and it rendered blank for exactly the documents
// F-A1 was built to read. Measured through the region read each body performs, on a witness-born
// document and on a legacy one.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the display bodies read the governing generation's regions for both regimes", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const w = await witnessDoc({ extra: [region("invoice.invoice_date", "2026-03-15")] });
  const l = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await landLegacy(firm, l.documentId, [
    region("invoice.vendor_name", `LEGACY DISPLAY ${randomUUID().slice(0, 6)}`),
    region("invoice.invoice_date", "2026-03-15"),
  ]);

  for (const [label, doc] of [["witness-born", w], ["legacy", l]]) {
    const n = (await rootQuery(
      `select count(*)::int c from clara.document_regions r
        where r.extraction_id=clara._document_facts_regions($1)`, [doc.documentId])).rows[0].c;
    assert.ok(n > 0, `${label}: the display bodies' shared region read returned 0 rows`);
  }
  // …and both display bodies actually reach that selector rather than a lookalike of it.
  for (const sig of ["clara.get_doc_entry_diff(uuid,uuid)", "clara.get_draft_review(uuid,uuid)"]) {
    const src = (await rootQuery(
      `select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') s
         from pg_proc p where p.oid=$1::regprocedure`, [sig])).rows[0].s;
    assert.ok(src.includes("clara._document_facts_regions"), `${sig} does not reach the shared region source`);
    assert.ok(!/engine_kind\s*=\s*'invoice_facts'/.test(src), `${sig} still filters on the legacy kind`);
  }
});

// ---------------------------------------------------------------------------------------
// CELL 10 — THE PINNED-EXTRACTION DIRECTION. The autopost executor reads the document's ONE
// bound extraction. A witness TEXT pin must be honoured; the region-free VISION half must not
// be, because a pin whose regions cannot be read is a read that did not happen.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the pinned-extraction direction honours a witness TEXT pin and refuses the vision half", async () => {
  mustBeLive();
  const client = world.clients.S1;
  const sub = world.users.erin;
  const firm = await firmOf(client);
  const selfName = (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const pair = await landWitnessPair(doc.documentId, witnessShape({
    fields: BASE,
    extraRegions: [region("invoice.vendor_name", selfName),
      region("invoice.customer_name", `PELANGGAN ${randomUUID().slice(0, 6)}`)],
  }));
  const at = async (pin) => {
    try {
      return (await rootQuery("select clara._document_direction_at($1,$2,$3) d",
        [doc.documentId, client, pin])).rows[0].d;
    } catch (e) { return `RAISED ${e.code}`; }
  };
  assert.equal(await at(pair.textId), "sales", "a witness TEXT pin must be honourable");
  assert.equal(await at(pair.visionId), "RAISED CLR30", "a vision pin must fall through to the core's refusal");
});

// ---------------------------------------------------------------------------------------
// CELL 11 — THE REFUSALS THAT MUST STILL FIRE. Widening a reader is exactly where a refusal
// quietly stops firing, so the three that guard an unattended post are re-asserted on
// witness-born documents: uncorroborated is still tier_a_fails and never ready; a document with
// no counterparty name cited is still vendor_unresolved; a non-MYR document is still a hard stop.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the lane's refusals still fire on witness-born documents", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;

  // (a) uncorroborated — the vision channel disagrees on the total by one sen.
  const a = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const vendorA = `ACME DISAGREE ${randomUUID().slice(0, 6)}`;
  await liveCounterparty(firm, client, sub, vendorA);
  await landWitnessPair(a.documentId, witnessShape({
    fields: BASE, visionOverride: { "invoice.total": 10376 },
    extraRegions: [region("invoice.vendor_name", vendorA)],
  }));
  const va = await laneOf("_coding_lane_core", client, a.filingId);
  assert.ok(va.reasons.includes("tier_a_fails"), JSON.stringify(va.reasons));
  assert.notEqual(va.lane, "ready");

  // (b) a corroborating witness pair that cites NO counterparty name at all. The amounts are
  // read, so this is not the starvation case — it is the case where the read succeeded and
  // found nothing, which must still refuse.
  const bDoc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await landWitnessPair(bDoc.documentId, witnessShape({ fields: BASE }));
  const vb = await laneOf("_coding_lane_core", client, bDoc.filingId);
  assert.ok(vb.reasons.includes("vendor_unresolved"), JSON.stringify(vb.reasons));
  assert.notEqual(vb.lane, "ready");

  // (c) an explicitly non-MYR document is still a HARD stop.
  const c = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const vendorC = `ACME FOREIGN ${randomUUID().slice(0, 6)}`;
  await liveCounterparty(firm, client, sub, vendorC);
  await landWitnessPair(c.documentId, witnessShape({
    fields: { ...BASE, "invoice.currency": "SGD" },
    extraRegions: [region("invoice.vendor_name", vendorC)],
  }));
  const vc = await laneOf("_coding_lane_core", client, c.filingId);
  assert.ok(vc.reasons.includes("non_myr"), JSON.stringify(vc.reasons));
  assert.equal(vc.lane, "needs_you");
});

// ---------------------------------------------------------------------------------------
// CELL 12 — THE RESTORED 0049 PREMISE, AS AN IDENTITY. The guard's null branch appends no
// reason of its own; before this change a witness-born document could reach it with a fully
// corroborated state, so `facts_pending` never fired. Now the selector answers null exactly
// when the corroboration resolver answers its empty state — measured across a mixed population
// including a document with NO extraction of any regime.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.selector-null and resolver-empty are the same condition, across a mixed population", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const bare = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const w = await witnessDoc();
  const l = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  await landLegacy(firm, l.documentId, [region("invoice.vendor_name", `LEGACY PREMISE ${randomUUID().slice(0, 6)}`)]);

  for (const [label, doc, wantNull] of [
    ["no extraction of any regime", bare, true],
    ["witness-born", w, false],
    ["legacy-only", l, false],
  ]) {
    const pick = await selectorOf(doc.documentId);
    const state = await factState(doc.documentId);
    assert.equal(pick === null, wantNull, `${label}: selector null-ness`);
    assert.equal(pick === null, Object.keys(state).length === 0,
      `${label}: the selector's null and the resolver's empty state must be the same condition`);
  }
  const v = await laneOf("_coding_lane_core", client, bare.filingId);
  assert.ok(v.reasons.includes("facts_pending"),
    `a document with no generation must still be named facts_pending — got ${JSON.stringify(v.reasons)}`);
  assert.notEqual(v.lane, "ready");
});

// ---------------------------------------------------------------------------------------
// CELL 13 — RE-KIND TASK HYGIENE. A queued llm_witness task survived a re-kind and kept blocking
// the document. The HUMAN door is exercised behaviourally here, end to end and as a human; the
// MACHINE door carries the byte-identical clause and is asserted structurally in cell 18 (it is
// runtime-only and reaching it needs a claim/settle flow that proves nothing extra about this
// clause). The statement lanes' arm is asserted UNCHANGED in the same breath, because a widening
// that also loosened something adjacent is the failure mode worth catching.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.a re-kind retires a queued witness task at the human door, and spares the statement lanes", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  // CONTEXT FIRST, so the cell is not a tautology about a row the test invented: filing an
  // invoice-kind document DOES mint on the witness lane since the cutover. On this rig it lands
  // already settled by the typed-consent gate (this world grants no witness_extraction purpose),
  // so the queued row under test is written directly, on its own engine id. What is being
  // exercised is the retirement clause's LANE SCOPE, which keys on lane and status alone and is
  // indifferent to which enqueue path wrote the row.
  const routed = (await rootQuery(
    `select status, error_code from clara.document_processing_tasks
      where document_id=$1 and lane='llm_witness'`, [doc.documentId])).rows;
  assert.equal(routed.length, 1, "the post-cutover router must mint on the witness lane at filing");
  const witnessTask = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,$3,1,'llm_witness','queued') returning id`,
    [firm, doc.documentId, `llm-openai:rig-witness:${randomUUID().slice(0, 8)}`])).rows[0].id;
  const statementTask = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,$3,1,'statement_facts','queued') returning id`,
    [firm, doc.documentId, `azure-di:statement:${randomUUID().slice(0, 8)}`])).rows[0].id;

  // The PRE-FIX scope is reconstructed and shown to miss the same row, so "it now retires" is a
  // delta rather than an assertion about the present.
  const preFixScope = (await rootQuery(
    `select count(*)::int c from clara.document_processing_tasks
      where document_id=$1 and status='queued' and lane='invoice_facts'`, [doc.documentId])).rows[0].c;
  assert.equal(preFixScope, 0, "the pre-fix clause scoped to lane='invoice_facts' and would have matched nothing here");

  // Through the HUMAN door, as a human: this verb is granted to clara_authenticated and refuses
  // an unauthenticated caller, so calling it as root would be testing a different door.
  await setDocumentKind(sub, {
    document: doc.documentId, kind: "bank_statement", reason: "rig opener-6 re-kind",
    opKey: `o6-rekind-${randomUUID().slice(0, 8)}`,
  });

  const st = async (id) => (await rootQuery(
    "select status, error_code from clara.document_processing_tasks where id=$1", [id])).rows[0];
  assert.deepEqual(await st(witnessTask), { status: "failed", error_code: "skipped_kind" },
    "a queued witness task must be retired by a re-kind that no longer admits it");
  assert.equal((await st(statementTask)).status, "queued",
    "the statement lane still serves bank_statement — its queued task must be spared");
});

// ---------------------------------------------------------------------------------------
// CELL 14 — THE BINDING LANE READS THE GOVERNING GENERATION, and its registered residual is
// asserted rather than left implicit. On a split-generation document the binding resolver must
// no longer be able to read the non-governing generation's regions at all; on a witness-born
// document it still answers `unresolved`, because its next gate reads an envelope shape the
// witness regime does not produce. That limitation is named in the migration header and is
// pinned here so it cannot silently become something else.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the binding resolver reads the governing generation, and its witness residual is unresolved", async () => {
  mustBeLive();
  const { client } = ctx;
  const w = await witnessDoc();
  const out = (await rootQuery(
    "select clara._resolve_vendor_binding($1,$2,null) o", [client, w.documentId])).rows[0].o;
  assert.equal(out.outcome, "unresolved",
    "REGISTERED RESIDUAL: the F1/LCP binding lane does not yet serve witness-born documents");

  const src = (await rootQuery(
    `select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') s from pg_proc p
      where p.oid='clara._resolve_vendor_binding(uuid,uuid,uuid)'::regprocedure`)).rows[0].s;
  assert.ok(src.includes("clara._document_facts_regions"), "the binding resolver must reach the shared region source");
  // It also keeps a CONTINUITY arm (see migration section 5) — and the ruled pick must come
  // first, with the continuity arm behind a not-found guard. An order inversion would make the
  // continuity arm the primary and hand the split hazard straight back.
  const ruled = src.indexOf("e.id=clara._document_facts_regions(p_document)");
  assert.ok(ruled >= 0, "the ruled pick must be present");
  assert.ok(src.indexOf("if not found then") > ruled,
    "the continuity arm must sit BEHIND the ruled pick, not in front of it");
});

// ---------------------------------------------------------------------------------------
// CELL 14b — THE CONTINUITY ARM IS STRUCTURALLY UNREACHABLE ONCE A WITNESS GENERATION EXISTS.
// This is the property that lets section 5 keep a second pick at all: the selector answers
// non-null whenever ANY witness pair is present (its witness arm needs no legacy task), so the
// arm can only ever fire for a document that has no witness generation AND no task-attributed
// legacy one. Proven on the shape that would break it — a document carrying a task-LESS legacy
// extraction (the arm's whole reason to exist) PLUS a witness pair. The arm must not fire, and
// the binding resolver must therefore see the witness generation, not the legacy one.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the binding resolver's continuity arm cannot fire once a witness generation exists", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });

  // A task-LESS legacy extraction: exactly what the continuity arm exists to keep reachable.
  const orphan = (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
       status,page_count,envelope,extracted_at)
     values($1,$2,$3,'invoice_facts',1,'done',1,'{}'::jsonb,clock_timestamp()) returning id`,
    [firm, doc.documentId, `azure-di:orphan:${randomUUID().slice(0, 8)}`])).rows[0].id;

  // With no witness generation the wider arm IS reachable — the ruled pick says nothing and the
  // orphan is the only thing there. Asserting BOTH halves first is what stops the cell passing
  // vacuously: a region source that always answered null would satisfy the second half alone.
  assert.equal(await selectorOf(doc.documentId), null,
    "the ruled pick must ignore a task-less legacy extraction");
  assert.equal(await regionsOf(doc.documentId), orphan,
    "the region source's wider arm must still reach it — that is the continuity this arm exists for");

  const pair = await landWitnessPair(doc.documentId, witnessShape({ fields: BASE }));
  assert.equal(await selectorOf(doc.documentId), pair.textId,
    "once a witness pair exists the ruled pick answers");
  assert.equal(await regionsOf(doc.documentId), pair.textId,
    "…so the region source returns the SAME governing generation, and its wider arm is unreachable");
  assert.notEqual(await regionsOf(doc.documentId), orphan);
});

// ---------------------------------------------------------------------------------------
// CELL 15 — THE THREE DELIBERATE EXCLUSIONS. `execute_rule_post` retires in F-A2 main and must
// not have been taught anything here; `persist_invoice_facts` is the legacy regime's own writer
// and its literals are its identity; `_derive_vendor_binding_proposal` was BUILT onto the shared
// selector and then WITHDRAWN when the rig measured 34 vendor-binding cells regressing — its
// window lateral reconstructs what was read at approval time, which is not the question the
// selector answers (migration section 6 carries the reasoning). All three are asserted
// STRUCTURALLY: none reaches the shared selector and none names a witness kind. Pinning the
// withdrawn one here is what stops it drifting back in unnoticed. (The byte-level proof that
// this file did not touch them is the migration's own whole-schema change census.)
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the three named exclusions were not taught the witness regime", async () => {
  mustBeLive();
  for (const sig of ["clara.execute_rule_post(uuid,text)",
    "clara.persist_invoice_facts(uuid,jsonb,text,text,integer,jsonb)",
    "clara._derive_vendor_binding_proposal(uuid,uuid,uuid)"]) {
    const src = (await rootQuery(
      `select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') s
         from pg_proc p where p.oid=$1::regprocedure`, [sig])).rows[0].s;
    assert.ok(!src.includes("clara._document_facts_extraction") && !src.includes("clara._document_facts_regions"), `${sig} was routed through the selector or the region source`);
    assert.ok(!src.includes("llm_witness") && !src.includes("llm_text_facts"), `${sig} was taught a witness kind`);
    assert.ok(/engine_kind\s*=\s*'invoice_facts'|lane\s*=\s*'invoice_facts'|lane in \('invoice_facts'/.test(src),
      `${sig} no longer carries the legacy scope this file deliberately left in place`);
  }
});

// ---------------------------------------------------------------------------------------
// CELL 16 — THE FROZEN EVALUATOR CLOSURE. The report says none of these twelve is a closure
// member. That is PROVEN here rather than assumed: the roster is read and intersected, and the
// closure's own verifier is run.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.no recut body is a frozen-evaluator closure member, and the closure still verifies", async () => {
  mustBeLive();
  const members = (await rootQuery(
    "select distinct member_signature s from clara.evaluator_version_members order by 1")).rows.map((r) => r.s);
  assert.ok(members.length > 0, "the closure roster is empty — this cell would pass vacuously");
  const overlap = ESTATE.filter((e) => members.includes(e));
  assert.deepEqual(overlap, [], `this migration recut frozen closure member(s): ${overlap.join(", ")}`);
  await rootQuery("select clara.verify_evaluator_freeze()");
});

// ---------------------------------------------------------------------------------------
// CELL 17 — THE GRANT SURFACE. A CREATE OR REPLACE preserves ACLs, owner, definer-ness and the
// pinned search_path — preserves, not "should preserve". The two display bodies' human grants
// are named explicitly because they are the ones a reviewer depends on, and the selector's
// volatility is checked because its LANGUAGE changed in this migration.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.every recut body keeps its owner, definer-ness, pinned search_path and grants", async () => {
  mustBeLive();
  for (const sig of ESTATE) {
    const r = (await rootQuery(
      `select r.rolname owner, p.prosecdef, p.provolatile,
              coalesce(array_to_string(p.proconfig,' | '),'(null)') cfg,
              coalesce(array_to_string(p.proacl::text[],' | '),'(null)') acl
         from pg_proc p join pg_roles r on r.oid=p.proowner where p.oid=$1::regprocedure`, [sig])).rows[0];
    assert.equal(r.owner, "clara_fn_owner", `${sig} owner`);
    assert.equal(r.prosecdef, true, `${sig} must stay SECURITY DEFINER`);
    assert.equal(r.cfg, "search_path=clara, pg_temp", `${sig} pinned search_path`);
    assert.ok(!r.acl.includes("=X/") || !r.acl.includes("PUBLIC"), `${sig} must not grant EXECUTE to PUBLIC`);
  }
  const acl = async (sig) => (await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[],' | '),'(null)') a from pg_proc p where p.oid=$1::regprocedure`,
    [sig])).rows[0].a;
  for (const sig of ["clara.get_doc_entry_diff(uuid,uuid)", "clara.get_draft_review(uuid,uuid)"]) {
    const a = await acl(sig);
    assert.ok(a.includes("clara_authenticated=X/"), `${sig} lost its human grant`);
    assert.ok(a.includes("clara_agent_ro=X/"), `${sig} lost its agent read grant`);
  }
  assert.ok((await acl("clara.list_autodraft_candidates()")).includes("clara_runtime=X/"),
    "the sweep gate lost its runtime grant");
  const sel = (await rootQuery(
    `select p.provolatile v, p.prolang::regproc::text l from pg_proc p
      where p.oid='clara._document_facts_extraction(uuid)'::regprocedure`)).rows[0];
  assert.equal(sel.v, "s", "the selector must stay STABLE — a definer body that became VOLATILE changes every caller's plan");

  // THE NEW FUNCTION IS THE ONE PLACE THE OWNER IS NOT INHERITED, so it is read back explicitly.
  // A migration runs as the deploying superuser: created without SET ROLE this lands owned by
  // that role while every caller is a definer body owned by clara_fn_owner, and with EXECUTE
  // revoked from PUBLIC every caller then gets 42501. That is not hypothetical — it is what the
  // rig measured before the migration grew its SET ROLE (1 failure became 163).
  const reg = (await rootQuery(
    `select r.rolname owner, p.prosecdef, p.provolatile,
            coalesce(array_to_string(p.proconfig,' | '),'(null)') cfg,
            coalesce(array_to_string(p.proacl::text[],' | '),'(null)') acl
       from pg_proc p join pg_roles r on r.oid=p.proowner
      where p.oid='clara._document_facts_regions(uuid)'::regprocedure`)).rows[0];
  assert.equal(reg.owner, "clara_fn_owner", "the region source must be owned by clara_fn_owner");
  assert.equal(reg.prosecdef, true, "the region source must be SECURITY DEFINER");
  assert.equal(reg.provolatile, "s", "the region source must be STABLE");
  assert.equal(reg.cfg, "search_path=clara, pg_temp", "the region source must pin its search_path");
  assert.equal(reg.acl, "clara_fn_owner=X/clara_fn_owner",
    "the region source must grant EXECUTE to nobody but its owner — the definer callers reach it as the owner");
});

// ---------------------------------------------------------------------------------------
// CELL 18 — THE ESTATE ROSTER, CLOSED. Every body this migration claims to have taught must
// reach the shared selector or admit the witness lane, and none may keep a legacy pick of its
// own. This is the structural counterpart to the migration's tail: the tail proved it at apply
// time on one database; this proves it on whatever chain the suite runs against.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the twelve-body roster is closed: selector reach or lane admission, no residual legacy pick", async () => {
  mustBeLive();
  const readers = ESTATE.filter((s) => !/list_autodraft_candidates|classify_document|set_document_kind|_document_direction_at|_document_facts_extraction|_tf_processing_task_update/.test(s));
  for (const sig of readers) {
    const src = (await rootQuery(
      `select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') s
         from pg_proc p where p.oid=$1::regprocedure`, [sig])).rows[0].s;
    assert.ok(src.includes("clara._document_facts_regions"), `${sig} does not reach the shared region source`);
    // ONE body legitimately keeps a legacy literal and is exempted BY NAME: the binding
    // resolver's CONTINUITY arm (migration section 5), whose ordering and unreachability are
    // proven in cells 14 and 14b. Naming it beats a blanket allowance — any OTHER body that
    // grew a legacy pick back is still a failure here.
    if (sig !== "clara._resolve_vendor_binding(uuid,uuid,uuid)") {
      assert.ok(!/engine_kind\s*=\s*'invoice_facts'/.test(src), `${sig} keeps a legacy pick of its own`);
    }
  }
  for (const sig of ["clara.list_autodraft_candidates()",
    "clara.classify_document(uuid,text,numeric,text,text,uuid,text,text)",
    "clara.set_document_kind(uuid,text,text,text)"]) {
    const src = (await rootQuery(
      `select regexp_replace(p.prosrc,'--[^' || chr(10) || ']*','','g') s
         from pg_proc p where p.oid=$1::regprocedure`, [sig])).rows[0].s;
    assert.ok(src.includes("llm_witness"), `${sig} does not admit the witness lane`);
    assert.ok(!/lane\s*=\s*'invoice_facts'/.test(src), `${sig} keeps a single-lane legacy equality`);
  }
  // The live-selection direction entry point inherits with a zero-byte diff: it must still be
  // one delegating line into the shared selector, never a second lookalike pick.
  const dir = (await rootQuery(
    `select p.prosrc s from pg_proc p where p.oid='clara._document_direction(uuid,uuid)'::regprocedure`)).rows[0].s;
  assert.ok(dir.includes("clara._document_facts_extraction"));
  assert.ok(!/engine_kind/.test(dir), "the direction entry point must carry no kind literal of its own");
});

// ---------------------------------------------------------------------------------------
// CELL 19 — THE TRANSITION WALL EXTENDS, IT DOES NOT WEAKEN. The re-kind retirement above only
// works because one lane joined one never-claimed receipt's set in the queued->failed arm. That
// is a security-relevant closed-world set, so the cell that widens it also re-proves the arms it
// did NOT widen — behaviourally, by attempting each refused transition and reading the refusal.
// Cell 13 is the positive half; this is the negative half, and neither is evidence alone.
// ---------------------------------------------------------------------------------------
test("f-a2.o6.the transition wall extends by exactly one lane: every other refusal still fires", async () => {
  mustBeLive();
  const { client, sub, firm } = ctx;
  const doc = await seedCitedDocument(sub, { firm, client, kind: "invoice" });
  const mk = async (lane, engine, status = "queued") => (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,status)
     values($1,$2,$3,1,$4,$5) returning id`, [firm, doc.documentId, engine, lane, status])).rows[0].id;
  const flip = async (id, code) => {
    try {
      await rootQuery(
        "update clara.document_processing_tasks set status='failed', error_code=$2, finished_at=now() where id=$1",
        [id, code]);
      return "ALLOWED";
    } catch (e) { return e.code; }
  };

  // The one widening: a queued WITNESS task may now be retired with the re-kind receipt.
  assert.equal(await flip(await mk("llm_witness", `llm-openai:rig-w:${randomUUID().slice(0, 8)}`), "skipped_kind"),
    "ALLOWED", "the witness lane must accept the re-kind retirement receipt");

  // …and nothing else moved. The kind-INDEPENDENT classify lane stays unretirable; a statement
  // lane still cannot be flipped to a WITNESS verdict; and an unrelated engine code is still
  // refused on the queued->failed arm for every lane.
  assert.equal(await flip(await mk("classify", `clara-classify-rig:${randomUUID().slice(0, 8)}`), "skipped_kind"),
    "CLR16", "the classify lane must stay unretirable by a re-kind");
  assert.equal(await flip(await mk("statement_facts", `azure-di:stmt:${randomUUID().slice(0, 8)}`), "witness_consent_inactive"),
    "CLR16", "a statement task must not be flippable to a WITNESS verdict");
  assert.equal(await flip(await mk("llm_witness", `llm-openai:rig-w2:${randomUUID().slice(0, 8)}`), "internal"),
    "CLR16", "a queued task still cannot be failed with an engine code — only a claimed one settles that way");
});
