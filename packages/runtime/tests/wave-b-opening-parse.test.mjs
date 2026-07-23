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
  mapOpeningDbError,
  parseOpeningTargets,
} from "../lib/opening-parse.mjs";
import { AuthError } from "../lib/authz.mjs";
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
async function buildOpeningFixture(label, { tie = true, regionTexts = null } = {}) {
  const { owner, firm } = await rig.buildFirm(label);
  const onb = await rig.asHuman(owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`${label}_onb_${randomUUID().slice(0, 6)}`, rig.opk("onb")]));
  const { client_id: client, plan_id: plan } = onb.rows[0].r;
  for (const [code, name, type] of [["1000", "Cash", "asset"], ["900-RE", "Retained earnings", "equity"], ["910-000", "Share capital", "equity"]]) {
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
