// #986 — ONE REAL `opening_tb.line` PRODUCER RUN, through `clara.persist_document_extraction`.
//
// WHY THIS IS ITS OWN MODULE. `packages/db/tests/opening-ledger-source.test.mjs` (#656's battery)
// grew the same helper inline, and a test file cannot be imported by another test file without
// running its cells. #986 needs the SAME fixture — a genuine second reading of one document, with
// the supersession and the authoritative pointer moving exactly as production moves them — so the
// helper lives here and both batteries can stand on one geometry.
//
// A RAW INSERT IS NOT ADMITTED, and that rule is #656's own (its fix-round adversarial A5 found
// the first cut of the re-read cell building its second extraction by hand, which skips
// `clara._derive_opening_region_fact`'s monetary corroboration, the
// `ck_document_regions_opening_fact_0017` CHECK and `_tf_set_authoritative_extraction_0017`'s
// ordering — so it could not tell anybody which refusal a genuine re-OCR actually produces).
// Every region here is persisted by the real writer, as the real producer would.

import assert from "node:assert/strict";

import { ROLES, opk, rootQuery, roleQuery } from "../rig-fixtures.mjs";
import { tbRegionText } from "./wb-fixtures.mjs";

/** A `running` OCR task on `document` — the shape `clara.persist_document_extraction` settles.
 *  The binding CHECK wants a workflow_run_id and a started_at; 0038's settle path wants a
 *  reservation. rootQuery: this is the runtime's own plumbing, arranged as a fixture. */
async function runningOcrTask(firm, document, engineId) {
  const id = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane='ocr'),
       'ocr','running',$4,now()) returning id`,
    [firm, document, engineId, `p986-${opk("run")}`])).rows[0].id;
  await rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [firm, id]);
  return id;
}

/**
 * ONE producer run: persist `lines` as `opening_tb.line` regions through the real writer, in
 * exactly the element shape `packages/runtime/lib/opening-tb-cells.mjs`'s `toRegion` emits.
 *
 * THIS IS A MIRROR, AND THE MIRROR IS PINNED NEXT DOOR (#656 fix-round, adversarial A8):
 * packages/db has no dependency on packages/runtime, so the element below is hand-built.
 * `packages/runtime/tests/opening-tb-produce.test.mjs`'s last cell states this exact key set and
 * value grammar; if that pin reds, this literal is stale and must move with it.
 *
 * Returns `{ extractionId, refs }` where `refs[line_key]` is the `{extraction_id, region_id}` an
 * opening target must cite. Calling it TWICE on one document is a genuine RE-READ: the newest
 * done extraction supersedes the older one and takes `documents.authoritative_extraction_id`
 * (`_tf_set_authoritative_extraction_0017`, kind-blind).
 */
export async function produceTbRegions({ firm, doc, lines, engineId = null }) {
  // `ck_processing_task_lane_engine_f_a1_stmt` admits an `ocr` task's engine only when it reads
  // `azure-%` or `clara-fixture:%`. A rig run is not Azure, so it takes the estate's own fixture
  // escape hatch — the same one `document-regions-unique-field-path.test.mjs` uses.
  const engine = engineId ?? `clara-fixture:p986-producer-${opk("e")}`;
  const task = await runningOcrTask(firm, doc.documentId, engine);
  const regions = lines.map((l) => ({
    locator_kind: "page_polygon",
    locator: { page_number: 1, polygon: [0.45, 1.43, 0.95, 1.43, 0.95, 1.53, 0.45, 1.53] },
    field_path: "opening_tb.line",
    text_content: tbRegionText(l),
    engine_confidence: null,
    monetary_raw: ((l.debit_cents || l.credit_cents) / 100).toFixed(2),
    monetary_cents: String(l.debit_cents || l.credit_cents),
  }));
  await roleQuery(ROLES.runtime,
    "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,$2::jsonb,null,null,$3) as r",
    [task, JSON.stringify(regions), opk("p986-pde")]);
  const extractionId = (await rootQuery(
    "select id from clara.document_extractions where document_id=$1 and engine_id=$2 and engine_kind='ocr'",
    [doc.documentId, engine])).rows[0].id;
  const rows = (await rootQuery(
    `select id, text_content from clara.document_regions
      where extraction_id=$1 and field_path='opening_tb.line' order by created_at, id`, [extractionId])).rows;
  const refs = {};
  for (const l of lines) {
    const want = tbRegionText(l);
    const hit = rows.find((r) => r.text_content === want);
    assert.ok(hit, `the producer run did not persist a region for ${l.line_key} (${want})`);
    refs[l.line_key] = { extraction_id: extractionId, region_id: hit.id };
  }
  return { extractionId, refs };
}

/** `lines` with their `extraction_ref`s bound — the payload the runtime writers take. */
export const withRefs = (lines, refs) => lines.map((l) => ({ ...l, extraction_ref: refs[l.line_key] }));
