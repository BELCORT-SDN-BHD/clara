// Wave B — R2 opening-targets parse lane. PURE unit tests for the deterministic
// grammar + line mapping + error mapping (no DB), and a DB-backed FEASIBILITY test
// that proves the as-built extraction surface (document_regions `opening_tb.line`)
// yields real TB lines the audited `record_opening_targets_parsed` writer accepts —
// the F12 verdict (document-primary vs the keyed 422 fallback). The DB tests skip
// cleanly when the 0017 surface is absent. Serial, RELAY_TEST_MODE.

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  parseOpeningTbLine,
  mapRegionsToLines,
  openingOpKey,
  openingRefreshOpKey,
  mapOpeningDbError,
  mapOpeningFkError,
  parseOpeningTargets,
  refreshOpeningTargets,
} from "../lib/opening-parse.mjs";
import { AuthError } from "../lib/authz.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { OPENING_TB_FIELD_PATH, disagreeingOpeningRegion } from "../lib/opening-tb-produce.mjs";
import { ACCOUNTS, BALANCED, HEADER, tbRow } from "./kdoc-opening-tb-testkit.mjs";
import * as rig from "./rig.mjs";

// ---------------------------------------------------------------------------
// PURE unit tests — the grammar + mapping + error mapping.
// ---------------------------------------------------------------------------

test("parseOpeningTbLine derives the canonical triple from anchored evidence", () => {
  assert.deepEqual(parseOpeningTbLine("1000 Cash and bank RM 105,000.00 DR"),
    { accountCode: "1000", label: "Cash and bank", amountCents: 10_500_000, side: "debit" });
  assert.deepEqual(parseOpeningTbLine("900-RE Retained earnings RM 65,747.97 CR"),
    { accountCode: "900-RE", label: "Retained earnings", amountCents: 6_574_797, side: "credit" });
  // Plain (ungrouped) amount.
  assert.deepEqual(parseOpeningTbLine("4000 Sales RM 500.00 DR"),
    { accountCode: "4000", label: "Sales", amountCents: 50_000, side: "debit" });
});

test("parseOpeningTbLine rejects non-TB text (no fabrication)", () => {
  for (const bad of [
    "not a tb line",
    "1000 Cash RM 100 DR",             // missing .sen
    "1000 Cash RM 100.00 XX",          // bad side
    "10 Cash RM 100.00 DR",            // account too short
    "1000 Cash USD 100.00 DR",         // wrong currency anchor
    "1000 RM 100.00 DR",               // missing label
    "",
    null,
    42,
  ]) {
    assert.equal(parseOpeningTbLine(bad), null, `must reject: ${String(bad)}`);
  }
});

test("mapRegionsToLines builds region-keyed p_lines; a BLANK region is skipped (not a failure)", () => {
  const rows = [
    { region_id: "reg-1", extraction_id: "ext-1", text_content: "1000 Cash RM 1,000.00 DR" },
    { region_id: "reg-2", extraction_id: "ext-1", text_content: "   " }, // blank → skipped silently
    { region_id: "reg-3", extraction_id: "ext-1", text_content: "900-RE Retained earnings RM 1,000.00 CR" },
  ];
  const { lines, parsedCount, failures } = mapRegionsToLines(rows);
  assert.equal(parsedCount, 2);
  assert.deepEqual(failures, [], "a whitespace-only region is not an authoritative row");
  assert.deepEqual(lines[0], {
    line_key: "r:reg-1", account_code: "1000", source_label: "Cash",
    debit_cents: 1_000_00, credit_cents: 0, extraction_ref: { extraction_id: "ext-1", region_id: "reg-1" },
  });
  assert.equal(lines[1].account_code, "900-RE");
  assert.equal(lines[1].credit_cents, 1_000_00);
  assert.equal(lines[1].debit_cents, 0);
});

test("mapRegionsToLines (F-H5): a NONBLANK non-TB region is a failure (never a silent skip)", () => {
  const rows = [
    { region_id: "reg-1", extraction_id: "ext-1", text_content: "1000 Cash RM 1,000.00 DR" },
    { region_id: "reg-2", extraction_id: "ext-1", text_content: "not a tb line" },
  ];
  const { lines, failures } = mapRegionsToLines(rows);
  assert.equal(lines.length, 1, "the survivor is NOT returned as a partial set on its own");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].region_id, "reg-2");
  assert.equal(failures[0].text, "not a tb line");
});

test("openingOpKey is the pinned, replay-stable shape", () => {
  assert.equal(openingOpKey("seed-1", "doc-1"), "openingparse:seed-1:doc-1");
});

test("mapOpeningDbError maps CLR refusals to the contract shapes", () => {
  assert.equal(mapOpeningDbError({ code: "CLR11" }).http, 404);
  assert.deepEqual(mapOpeningDbError({ code: "CLR31", detail: '{"reason":"registry_not_open"}' }),
    { http: 409, body: { status: "conflict", reason: "registry_not_open" } });
  assert.deepEqual(mapOpeningDbError({ code: "CLR31", detail: '{"reason":"tie_mismatch"}' }),
    { http: 409, body: { status: "refused", code: "CLR31", reason: "tie_mismatch" } });
  assert.equal(mapOpeningDbError({ code: "CLR10" }).http, 422);
  assert.equal(mapOpeningDbError(new Error("boom")), null, "a non-CLR error is not mapped (re-throws)");
});

// ---------------------------------------------------------------------------
// DB-backed FEASIBILITY (F12) — the extraction surface → record_opening_targets_parsed.
// ---------------------------------------------------------------------------

async function openingReady() {
  try {
    const r = await rig.rootQuery(
      `select to_regprocedure('clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)') is not null as parsed,
              to_regprocedure('clara.create_opening_seed(uuid,uuid,date,uuid,text,text)') is not null as seed,
              to_regprocedure('clara.begin_client_onboarding(text,text)') is not null as onb,
              to_regprocedure('clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)') is not null as doc`,
    );
    const o = r.rows[0];
    return o.parsed && o.seed && o.onb && o.doc;
  } catch {
    return false;
  }
}

const READY = await openingReady();
const skip = READY ? false : "Wave-B (0017) opening surface absent";

/** Build an onboarding client + plan + CoA + verified filed opening_balance_doc +
 *  opening seed. Optionally seed a done extraction with `opening_tb.line` regions. */
async function buildOpeningFixture(label, { tie = true, regionTexts = null, accounts = null } = {}) {
  const { owner, firm } = await rig.buildFirm(label);
  const onb = await rig.asHuman(owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`${label}_onb_${randomUUID().slice(0, 6)}`, rig.opk("onb")]));
  const { client_id: client, plan_id: plan } = onb.rows[0].r;
  // The chart the fixture seeds. The default is this file's Wave-B one; the cells that drive the
  // REAL producer pass the testkit's five measured codes, because a parsed target naming an
  // account the chart has not got is refused by `fk_opening_tb_targets_account` (#656 A5).
  for (const [code, name, type] of accounts ?? [["1000", "Cash", "asset"], ["900-RE", "Retained earnings", "equity"], ["910-000", "Share capital", "equity"]]) {
    await rig.asHuman(owner, (c) => c.query("select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r", [client, code, name, type, null, rig.opk("acct"), null]));
  }
  const sha = rig.sha(`${label}-${randomUUID()}`);
  const path = `firms/${firm}/docs/${sha}.pdf`;
  const doc = await rig.asRoot((c) =>
    c.query("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
      [firm, client, sha, "opening.pdf", "application/pdf", 2048, path, owner, 1, "opening_balance_doc", null, null]));
  const documentId = doc.rows[0].r.document_id;
  const seedRes = await rig.asHuman(owner, (c) =>
    c.query("select clara.create_opening_seed($1,$2,$3::date,$4,$5,$6) as r",
      [client, plan, "2026-01-01", tie ? documentId : null, tie ? sha : null, rig.opk("seed")]));
  const seed = seedRes.rows[0].r.seed_id;
  if (regionTexts) {
    const ext = await rig.asRoot((c) =>
      c.query("insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count) values ($1,$2,'rig-ocr:1','ocr',1,'done',1) returning id",
        [firm, documentId]));
    const extractionId = ext.rows[0].id;
    for (const text of regionTexts) {
      await rig.asRoot((c) =>
        c.query("insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content) values ($1,$2,'page_polygon','{\"page\":1}'::jsonb,'opening_tb.line',$3)",
          [firm, extractionId, text]));
    }
  }
  return { owner, firm, client, plan, seed, documentId, sha };
}

/**
 * #656 (fix-round, adversarial A5/A1) — ONE REAL OCR PASS, THROUGH THE REAL WRITER.
 *
 * `buildOpeningFixture` above hand-INSERTs its extraction and regions (a Wave-B fixture shape this
 * file has carried since R2). That is fine for the pure grammar cells, but it is NOT fine for any
 * cell that claims something about what production does, because a raw INSERT skips
 * `clara.persist_document_extraction` and with it `_derive_opening_region_fact`'s monetary
 * corroboration, `_assert_field_path`'s namespace grammar, and the authority trigger's whole
 * ordering. `packages/db/tests/README.md:313-314` states the rule this estate adopted from #857:
 * every `opening_tb.line` region fixture is created through the real writer.
 *
 * So this helper runs the REAL producer (`normalizeAzureLayout`, with the in-line
 * `opening_tb.line` reader inside it) over an Azure `prebuilt-layout` payload built from the
 * testkit's MEASURED geometry, and settles the result through the real writer on a real running
 * OCR task — envelope, regions and all. The route then reads exactly what production would leave.
 */
async function realOcrPass({ firm, documentId, cells, engineId = null }) {
  // `ck_processing_task_lane_engine_f_a1_stmt` admits an `ocr` task's engine only when it reads
  // `azure-%` or `clara-fixture:%` — the estate's own fixture escape hatch (the db battery's
  // `produceTbRegions` takes the same one).
  const engine = engineId ?? `clara-fixture:p656-runtime-${rig.opk("e")}`;
  const task = (await rig.rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane='ocr'),
       'ocr','running',$4,now()) returning id`,
    [firm, documentId, engine, `p656-${rig.opk("run")}`])).rows[0].id;
  await rig.rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [firm, task]);

  const out = normalizeAzureLayout(azurePayload(cells), { engineId: engine, versionN: 1 });
  await rig.asRuntime((c) => c.query(
    "select clara.persist_document_extraction($1,'done',$2,$3::jsonb,$4::jsonb,null,null,$5) as r",
    [task, out.pageCount, JSON.stringify(out.envelope), JSON.stringify(out.regions), rig.opk("p656-pde")]));
  const extractionId = (await rig.rootQuery(
    "select id from clara.document_extractions where document_id=$1 and engine_id=$2 and engine_kind='ocr'",
    [documentId, engine])).rows[0].id;
  return { extractionId, out, engine };
}

/** An Azure `prebuilt-layout` payload whose ONE table carries `cells` — the same shape
 *  `tests/opening-tb-produce.test.mjs` builds, so both batteries read one geometry. */
const azurePayload = (cells) => ({
  analyzeResult: {
    content: "synthetic",
    pages: [{ pageNumber: 1, width: 8.27, height: 11.69, unit: "inch", lines: [] }],
    tables: [{
      rowCount: cells.length,
      columnCount: 4,
      cells: cells.map((c) => ({
        content: c.text_content,
        confidence: 0.98,
        boundingRegions: [{ pageNumber: c.locator.page_number, polygon: c.locator.polygon }],
      })),
    }],
  },
});

after(() => rig.endPool());

test("FEASIBILITY (F12): the opening_tb.line surface yields document-primary targets", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-ok", {
    regionTexts: [
      "1000 Cash and bank RM 105,000.00 DR",
      "900-RE Retained earnings RM 65,747.97 CR",
      "910-000 Share capital RM 39,252.03 CR",
    ],
  });
  const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 202, JSON.stringify(out.body));
  assert.equal(out.body.status, "parsed");
  assert.equal(out.body.lines, 3, "all three anchored TB lines recorded");

  // Provenance is document-primary and bound to the extraction.
  const rows = await rig.rootQuery(
    "select account_code, provenance_kind, document_id, extraction_ref from clara.opening_tb_targets where seed_id=$1 order by account_code",
    [fx.seed]);
  assert.equal(rows.rowCount, 3);
  for (const r of rows.rows) {
    assert.equal(r.provenance_kind, "document");
    assert.equal(r.document_id, fx.documentId);
    assert.ok(r.extraction_ref && r.extraction_ref.region_id && r.extraction_ref.extraction_id, "cites its region");
  }

  // Idempotent replay (stable op_key) returns the same recorded count.
  const again = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(again.http, 202);
  assert.equal(again.body.lines, 3);
});

test("a seed with NO tie document → 422 no_tie_document", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-notie", { tie: false });
  const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 422);
  assert.deepEqual(out.body, { status: "unparseable", reason: "no_tie_document" });
});

test("a tie document with no opening_tb.line regions → 422 no_opening_tb_lines (the keyed-fallback signal)", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-nolines", {}); // tie doc, no extraction/regions
  const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 422);
  assert.deepEqual(out.body, { status: "unparseable", reason: "no_opening_tb_lines" });
});

test("a foreign-firm / missing seed is an indistinguishable 404", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-foreign", {
    regionTexts: ["1000 Cash RM 1,000.00 DR"],
  });
  const other = await rig.buildFirm("wb-r2-open-other");
  // Correct seed, WRONG firm → masked 404.
  const masked = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: other.firm }));
  assert.equal(masked.http, 404);
  // A random uuid → 404.
  const missing = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: randomUUID(), firmId: fx.firm }));
  assert.equal(missing.http, 404);
});

test("STRICT (F-H5): one malformed TB region fails the WHOLE parse — 422 naming it, NO partial targets", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-strict", {
    regionTexts: [
      "1000 Cash and bank RM 105,000.00 DR", // valid
      "this row is not a TB line at all",     // NONBLANK, unparseable
      "900-RE Retained earnings RM 65,747.97 CR", // valid
    ],
  });
  const out = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 422, JSON.stringify(out.body));
  assert.equal(out.body.status, "unparseable");
  assert.match(out.body.reason, /opening_tb\.line region\(s\) did not parse/);
  assert.match(out.body.reason, /^1 /, "exactly one region failed; named in the reason");
  // The all-or-nothing law: NOT ONE survivor target was authored.
  const rows = await rig.rootQuery("select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [fx.seed]);
  assert.equal(rows.rows[0].n, 0, "no partial target set from the survivors");
});

test("REVOCATION (F-H7): a reassert that no longer holds refuses BEFORE the write — no targets authored", { skip }, async () => {
  const fx = await buildOpeningFixture("wb-r2-open-revoke", {
    regionTexts: ["1000 Cash and bank RM 105,000.00 DR", "900-RE Retained earnings RM 65,747.97 CR"],
  });
  const reassert = async () => { throw new AuthError(403, "forbidden", "membership changed"); };
  await assert.rejects(
    () => rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm, reassert })),
    (e) => e instanceof AuthError && e.status === 403,
  );
  const rows = await rig.rootQuery("select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [fx.seed]);
  assert.equal(rows.rows[0].n, 0, "the audited write never ran once authz lapsed");
});

// ---------------------------------------------------------------------------
// #656 — the two arms the in-line producer makes reachable for the first time.
// ---------------------------------------------------------------------------

test("#656 mapOpeningFkError: the chart foreign key becomes a NAMED 422, never a 500", () => {
  // MEASURED shape (packages/db/tests/opening-ledger-source.test.mjs, p656.tie.unmapped_blocks):
  // clara.opening_tb_targets carries fk_opening_tb_targets_account -> clara.coa_accounts, so a
  // printed account this client's chart has not got is refused by the KEY — SQLSTATE 23503, no
  // CLR code, no detail.reason. Before this arm it fell through to `throw err` and the route
  // answered 500, which tells a professional nothing about a situation they can fix in a minute.
  const fk = Object.assign(new Error('insert or update on table "opening_tb_targets" violates foreign key constraint'), {
    code: "23503",
    constraint: "fk_opening_tb_targets_account",
    detail: 'Key (client_id, account_code)=(3f6e2a7c-0000-4000-8000-000000000001, 777-XYZ) is not present in table "coa_accounts".',
  });
  const out = mapOpeningFkError(fk);
  assert.equal(out.http, 422);
  assert.equal(out.body.status, "unparseable");
  assert.deepEqual(out.body.unmapped_accounts, ["777-XYZ"], "the failing account is NAMED (D13.2)");
  assert.match(out.body.reason, /777-XYZ/);

  // A detail that does not state a code the CHART'S OWN GRAMMAR admits is never quoted: the
  // answer degrades to the honest general sentence rather than echoing database text.
  const vague = { ...fk, detail: "Key (client_id, account_code)=(x, <script>alert(1)</script>) is not present" };
  const out2 = mapOpeningFkError(Object.assign(new Error("fk"), vague));
  assert.deepEqual(out2.body.unmapped_accounts, []);
  assert.doesNotMatch(out2.body.reason, /script/);

  // Every other foreign key, and every non-FK error, stays unclassified here — this arm must not
  // become a catch-all that swallows a genuine fault as a parse failure.
  assert.equal(mapOpeningFkError({ code: "23503", constraint: "fk_opening_tb_targets_document" }), null);
  assert.equal(mapOpeningFkError({ code: "42601" }), null);
  assert.equal(mapOpeningFkError(new Error("boom")), null);
});

test("#656 RE-READ: a second REAL OCR pass supersedes the cited run, and the re-parse refuses as a CONFLICT (not as malformed rows)", { skip }, async () => {
  // REBUILT ON THE REAL WRITER (#656 fix-round, adversarial A5). The first cut of this cell built
  // its second extraction and its `opening_tb.line` regions with raw INSERTs, which skips
  // `clara.persist_document_extraction` and therefore `_derive_opening_region_fact`'s monetary
  // corroboration and the authority trigger's ordering — so it could not tell us which refusal a
  // genuine re-OCR actually produces (the CLR10 op-key collision this module names, or a CLR31
  // staleness wall reached first). Both passes below are the REAL producer through the REAL
  // writer, and the answer is MEASURED rather than assumed.
  const fx = await buildOpeningFixture("p656-stale", { accounts: ACCOUNTS });
  const first = await realOcrPass({ firm: fx.firm, documentId: fx.documentId, cells: BALANCED() });
  const parsed = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(parsed.http, 202, JSON.stringify(parsed.body));
  assert.equal(parsed.body.lines, 5, "the producer's own five lines, through the real writer");

  // The document is READ AGAIN — the ordinary production event. `_tf_set_authoritative_extraction_0017`
  // hands the pointer to the newest done extraction, KIND-BLIND, so the first run's regions stop
  // being authoritative. The selector in this module deliberately takes the newest extraction that
  // CARRIES `opening_tb.line` rows, so a re-parse follows the document rather than starving.
  const second = await realOcrPass({ firm: fx.firm, documentId: fx.documentId, cells: BALANCED() });
  assert.notEqual(second.extractionId, first.extractionId);
  const pointer = (await rig.rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [fx.documentId])).rows[0];
  assert.equal(pointer.authoritative_extraction_id, second.extractionId,
    "the newest done extraction is authoritative, kind-blind (0017:1506-1546)");

  // AND THE RE-PARSE IS A DEAD END TODAY — measured, and this is the cell that says so. The op key
  // is stable per (seed, document) so a retried POST cannot double a basis, but the payload it
  // hashes is keyed by REGION ID, and the re-read minted new regions. `_reserve_op` therefore
  // refuses the same key with different args (CLR10, no detail.reason) BEFORE any staleness wall
  // is reached — which is why this arm is not dead code on the real path, and why the successor
  // contract's `source_reread_since_parse` mapping stands.
  const again = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(again.http, 409, JSON.stringify(again.body));
  assert.deepEqual(again.body, { status: "conflict", reason: "source_reread_since_parse" },
    "the human must learn that the SOURCE moved, not that its rows are malformed");

  // Nothing was written by the refused re-parse, and the basis still carries exactly the five
  // targets the first read authored — now citing a run that is no longer authoritative, which is
  // what `approve_opening_seed`'s own re-assertion refuses at approval
  // (packages/db/tests/opening-ledger-source.test.mjs, p656.tie.approve_rebinds).
  const rows = await rig.rootQuery(
    "select extraction_ref from clara.opening_tb_targets where seed_id=$1", [fx.seed]);
  assert.equal(rows.rowCount, 5, "the refused re-parse authored nothing and doubled nothing");
  for (const r of rows.rows) {
    assert.equal(r.extraction_ref.extraction_id, first.extractionId,
      "the refused re-parse leaves the basis exactly where it was -- on the reading it was parsed from");
  }
  // WHAT HAPPENS NEXT is #986's, not this cell's: `refreshOpeningTargets` below is the way forward
  // from this conflict. The refusal itself is unchanged, and this cell is what proves that.
});

// ---------------------------------------------------------------------------
// #656 (fix-round) — A REFUSED READ IS NOT "THERE ARE NO LINES HERE" (adversarial A1).
// ---------------------------------------------------------------------------

test("#656 A1: a REFUSED trial balance, an UNREADABLE row and a document that is not a trial balance are THREE different answers", { skip }, async () => {
  // Every leg below runs the REAL producer inside the REAL `normalizeAzureLayout` and settles it
  // through the REAL `clara.persist_document_extraction`, so what the route reads is what a
  // production OCR pass would have left on the document — not a hand-built fixture.
  //
  // BEFORE THIS FIX all three legs answered `no_opening_tb_lines`, which the face renders as an
  // INFORMATION banner offering to key the balances. A professional whose trial balance is short
  // by RM 1,000 was told their document has no trial-balance lines.
  const legA = await buildOpeningFixture("p656-a1-unbalanced", { accounts: ACCOUNTS });
  await realOcrPass({
    firm: legA.firm, documentId: legA.documentId,
    cells: [
      ...HEADER(),
      ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
      ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
    ],
  });
  const a = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: legA.seed, firmId: legA.firm }));
  assert.equal(a.http, 422, JSON.stringify(a.body));
  assert.equal(a.body.status, "unparseable");
  assert.match(a.body.reason, /does not balance/,
    "the professional must learn that the document's own figures disagree, in the reader's words");
  assert.match(a.body.reason, /105000|105,000/, "…with the two sums it measured");
  assert.equal(a.body.source_refusal, true);
  assert.notEqual(a.body.reason, "no_opening_tb_lines");

  const legB = await buildOpeningFixture("p656-a1-badrow", { accounts: ACCOUNTS });
  await realOcrPass({
    firm: legB.firm, documentId: legB.documentId,
    // `9OO.00` — the OCR-mangled figure the reader's header names as the silent killer.
    cells: [...BALANCED(), ...tbRow(2.83, { code: "920-000", label: "RESERVES", dr: "9OO.00" })],
  });
  const b = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: legB.seed, firmId: legB.firm }));
  assert.equal(b.http, 422, JSON.stringify(b.body));
  assert.match(b.body.reason, /unparseable_amount/, "the row-level refusal token travels verbatim");
  assert.ok(b.body.failing_rows.length >= 1, "…and the failing ROW KEYS travel with it");
  assert.notEqual(b.body.reason, a.body.reason, "the two refusals are not the same sentence");

  const legC = await buildOpeningFixture("p656-a1-ledger", { accounts: ACCOUNTS });
  await realOcrPass({
    firm: legC.firm, documentId: legC.documentId,
    cells: [
      ...HEADER(), // a printed GENERAL LEDGER: a Code: block header and a date column
      { region_id: "x1", text_content: "Code : 310-000 CASH AT BANK", locator: { polygon: [0.45, 1.35, 0.95, 1.35, 0.95, 1.45, 0.45, 1.45], page_number: 1 } },
      { region_id: "x2", text_content: "10/6/2025", locator: { polygon: [0.45, 1.51, 0.95, 1.51, 0.95, 1.61, 0.45, 1.61] , page_number: 1 } },
      { region_id: "x3", text_content: "D & DREAM PROPERTIES SDN BHD", locator: { polygon: [2.04, 1.51, 2.54, 1.51, 2.54, 1.61, 2.04, 1.61], page_number: 1 } },
    ],
  });
  const c = await rig.asRuntime((cx) => parseOpeningTargets(cx, { seedId: legC.seed, firmId: legC.firm }));
  assert.equal(c.http, 422, JSON.stringify(c.body));
  assert.deepEqual(c.body, { status: "unparseable", reason: "no_opening_tb_lines" },
    "a document nobody claims is a trial balance keeps the keyed-fallback signal, unchanged");
  assert.equal(c.body.source_refusal, undefined,
    "…and is never dressed up as a refusal of a document the reader never judged");
});

test("#656 A1: the refusal survives the REAL writer — the marker is on the stored envelope, and no opening region was persisted", { skip }, async () => {
  const fx = await buildOpeningFixture("p656-a1-stored", { accounts: ACCOUNTS });
  const { extractionId } = await realOcrPass({
    firm: fx.firm, documentId: fx.documentId,
    cells: [
      ...HEADER(),
      ...tbRow(1.43, { code: "310-000", label: "CASH AT BANK", dr: "105,000.00" }),
      ...tbRow(1.71, { code: "910-000", label: "SHARE CAPITAL", cr: "40,000.00" }),
    ],
  });
  const row = (await rig.rootQuery(
    `select e.envelope -> 'opening_tb_refusal' as refusal,
            (select count(*)::int from clara.document_regions r
              where r.extraction_id = e.id and r.field_path = $2) as opening_regions,
            (select count(*)::int from clara.document_regions r
              where r.extraction_id = e.id) as all_regions
       from clara.document_extractions e where e.id = $1`, [extractionId, OPENING_TB_FIELD_PATH])).rows[0];
  assert.equal(row.opening_regions, 0, "all-or-nothing: a refused read persists no opening line");
  assert.ok(row.all_regions > 0, "…while the document keeps the extraction it legitimately earned");
  assert.equal(row.refusal.status, "refused");
  assert.match(row.refusal.reason, /does not balance/,
    "`persist_document_extraction` stores the envelope verbatim — the reason is durable evidence, "
    + "not a log line");
});

test("#656 A6: ONE contradicting opening_tb.line region aborts the WHOLE persist — what a `toRegion` drift would cost a document", { skip }, async () => {
  // THE PRICE, MEASURED, so the next person to touch `toRegion` reads it here rather than in an
  // incident. The regions below are hand-built ON PURPOSE (the one place in this file that is
  // legitimate): the point is the DATABASE's refusal, and the producer's own emission guard
  // (`disagreeingOpeningRegion`) now makes this exact element unreachable from the real path.
  const fx = await buildOpeningFixture("p656-a6-abort", { accounts: ACCOUNTS });
  const engine = `clara-fixture:p656-a6-${rig.opk("e")}`;
  const task = (await rig.rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane='ocr'),
       'ocr','running',$4,now()) returning id`,
    [fx.firm, fx.documentId, engine, `p656-${rig.opk("run")}`])).rows[0].id;
  await rig.rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [fx.firm, task]);

  const innocent = {
    locator_kind: "page_polygon",
    locator: { page: 1, page_number: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] },
    field_path: "pages.1.lines.0",
    text_content: "AN ORDINARY LINE THIS DOCUMENT EARNED",
    engine_confidence: 0.9, monetary_raw: null, monetary_cents: null,
  };
  const contradicting = {
    locator_kind: "page_polygon",
    locator: { page: 1, page_number: 1, polygon: [0.45, 1.43, 0.95, 1.43, 0.95, 1.53, 0.45, 1.53] },
    field_path: OPENING_TB_FIELD_PATH,
    text_content: "310-000 CASH AT BANK RM 105,000.00 DR",
    engine_confidence: null, monetary_raw: "105,000.00", monetary_cents: "1",
  };
  await assert.rejects(
    () => rig.asRuntime((c) => c.query(
      "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,$2::jsonb,null,null,$3) as r",
      [task, JSON.stringify([innocent, contradicting]), rig.opk("p656-a6")])),
    (err) => {
      assert.equal(err.code, "CLR31");
      assert.match(String(err.message), /monetary|opening/i);
      return true;
    },
    "0017's `_derive_opening_region_fact` raises from inside the region loop (0017:1587)",
  );

  const rows = await rig.rootQuery(
    "select count(*)::int as n from clara.document_extractions where document_id=$1 and engine_id=$2",
    [fx.documentId, engine]);
  assert.equal(rows.rows[0].n, 0,
    "the WHOLE extraction is lost — including the innocent line the document legitimately earned; "
    + "that is the blast radius the producer's emission guard exists to keep unreachable");

  // …and the guard does keep it unreachable: the real producer refuses to emit the same drift.
  assert.equal(disagreeingOpeningRegion([contradicting])?.field_path, OPENING_TB_FIELD_PATH);
});

// ---------------------------------------------------------------------------
// #986 — THE RE-READ REMEDY. The conflict above keeps firing for the same condition; what changes
// is that a person now has somewhere to go from it.
// ---------------------------------------------------------------------------

test("#986 openingRefreshOpKey carries the READING, where openingOpKey deliberately does not", () => {
  assert.equal(openingRefreshOpKey("seed-1", "doc-1", "ext-9"), "openingreread:seed-1:doc-1:ext-9");
  // A LATER READING IS A DIFFERENT ACT, and that is the whole difference between the two keys:
  // the parse key is stable per (seed, document) so a retried POST cannot double a basis, and the
  // refresh key adds the extraction so a retried refresh replays while a NEW reading does not.
  assert.notEqual(openingRefreshOpKey("s", "d", "ext-9"), openingRefreshOpKey("s", "d", "ext-10"));
  // …and the pinned parse key did not move.
  assert.equal(openingOpKey("seed-1", "doc-1"), "openingparse:seed-1:doc-1");
});

test("#986 RE-READ REMEDY: after the conflict, the refresh core brings the basis onto the new reading and retires the old one", { skip }, async () => {
  const fx = await buildOpeningFixture("p986-refresh", { accounts: ACCOUNTS });
  const first = await realOcrPass({ firm: fx.firm, documentId: fx.documentId, cells: BALANCED() });
  const parsed = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(parsed.http, 202, JSON.stringify(parsed.body));
  assert.equal(parsed.body.lines, 5);

  // The document is READ AGAIN — the ordinary production event — and the parse door refuses,
  // exactly as it did before #986. THAT REFUSAL IS NOT WHAT CHANGED.
  const second = await realOcrPass({ firm: fx.firm, documentId: fx.documentId, cells: BALANCED() });
  assert.notEqual(second.extractionId, first.extractionId);
  const conflict = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.deepEqual(conflict.body, { status: "conflict", reason: "source_reread_since_parse" });

  // WHAT CHANGED: the conflict has a way forward.
  const out = await rig.asRuntime((c) => refreshOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 202, JSON.stringify(out.body));
  assert.equal(out.body.status, "refreshed", "a refresh is its own outcome, never a second 'parsed'");
  assert.equal(out.body.lines, 5, "the new reading's five lines");
  assert.equal(out.body.retired, 5, "…and the five that stood on the reading the document left");

  // RETIRED AND REPLACED, NEVER BESIDE: five targets, every one citing the authoritative run.
  const rows = await rig.rootQuery(
    "select extraction_ref from clara.opening_tb_targets where seed_id=$1", [fx.seed]);
  assert.equal(rows.rowCount, 5, "the basis was refreshed, not doubled");
  for (const r of rows.rows) assert.equal(r.extraction_ref.extraction_id, second.extractionId);

  // A RETRIED POST REPLAYS. The key carries the reading, so the same refresh is idempotent.
  const again = await rig.asRuntime((c) => refreshOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.deepEqual(again, out, "a retried refresh returns the same answer and retires nothing twice");
  assert.equal(
    (await rig.rootQuery("select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [fx.seed]))
      .rows[0].n, 5);
});

test("#986 the refresh is not a second parse: on a basis nobody re-read it refuses BY NAME", { skip }, async () => {
  const fx = await buildOpeningFixture("p986-noreread", { accounts: ACCOUNTS });
  await realOcrPass({ firm: fx.firm, documentId: fx.documentId, cells: BALANCED() });
  const parsed = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(parsed.http, 202, JSON.stringify(parsed.body));

  const out = await rig.asRuntime((c) => refreshOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(out.http, 409, JSON.stringify(out.body));
  assert.deepEqual(out.body, { status: "refused", code: "CLR31", reason: "no_reread_to_refresh" },
    "the surface must be able to tell 'there is nothing to refresh' from 'the refresh failed'");
  // Nothing moved.
  assert.equal(
    (await rig.rootQuery("select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [fx.seed]))
      .rows[0].n, 5);
});
