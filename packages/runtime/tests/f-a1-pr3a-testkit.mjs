// F-A1 PR-3a — shared rig fixtures for the autoDraft_v8 / chatTurn_v12 consumer-widening
// battery (NOT a test file: the name does not end in `.test.mjs`).
//
// Builds a REAL document via `clara._seed_verified_document` (the same helper
// matcher-testkit.mjs uses), then lands a legacy `invoice_facts` extraction and/or a witness
// pair (`llm_text_facts` + `llm_vision_facts`) with PLAIN inserts — mirroring
// packages/db/tests/f-a1-fixtures.mjs's `landWitnessPair` shape, but kept local to this
// package rather than importing across packages (matcher-testkit.mjs's own convention).
// The point of going through the REAL `clara.get_document_extract` RPC (not a hand-typed JS
// fixture) is that the toolface's cross-regime resolution reads `extracted_at` off whatever
// string Postgres actually serializes a `timestamptz` to inside `jsonb_build_object` — a
// hand-typed fixture could not catch a `Date.parse` mismatch against the REAL format.

import * as fx from "./relay-fixtures.mjs";

/** Same readiness probe as packages/db/tests/f-a1-fixtures.mjs's witnessReady — reads the
 *  same three markers (kinds/lane/dispatch) so a half-applied PR-1 fails loudly rather than
 *  this battery silently skipping the way it would on a genuinely pre-PR-1 database. */
export async function witnessReady() {
  const r = await fx.rootQuery(`
    select to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is not null as predicate,
           exists(select 1 from pg_constraint
                   where conname = 'ck_document_extractions_engine_kind_f_a1'
                     and pg_get_constraintdef(oid) like '%llm\\_text\\_facts%') as kinds,
           -- VERSION-BLIND, exactly as the db-package twin is. The marker this probe needs is
           -- that the resolver dispatches to the witness predicate AT ALL; WHICH version it
           -- names belongs to the successor. F-A2 opener ① repoints it to _v2, and a probe
           -- pinned to _v1 would read a successfully-applied later window as a half-applied
           -- earlier one and throw DRIFT across a whole battery for the wrong reason.
           position('evaluate_witness_fact_state_v' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure)) > 0 as dispatch`);
  const s = r.rows[0];
  if (!s.predicate && !s.kinds) return false;
  if (!s.predicate || !s.kinds || !s.dispatch) {
    throw new Error("F-A1 PR-3a rig: a half-applied F-A1 PR-1 chain (predicate/kinds/dispatch disagree) — apply through 0095 cleanly.");
  }
  return true;
}

/** A verified, CLIENT-FILED document (get_document_extract needs a filing, or unassigned). */
export async function seedFiledDocument({ firm, uploadedBy, client }) {
  const s = fx.sha(`doc_${fx.opk("d")}`);
  const r = await fx.rootQuery(
    "select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,1) as r",
    [firm, client, s, "fa1-pr3a-rig.pdf", "application/pdf", 2048, `firms/${firm}/docs/${s}.pdf`, uploadedBy],
  );
  return r.rows[0].r.document_id;
}

/** Header + regions in ONE transaction — the shape every in-repo writer produces. Each of
 *  `clara.persist_document_extraction`, `clara.persist_invoice_facts` and
 *  `clara.persist_witness_facts` inserts the extraction AND its regions inside one function
 *  body, so both land in one transaction; there is no in-repo writer that lands a region in a
 *  LATER transaction than its header (censused #624, re-censused at wave-2 integration: outside
 *  packages/db/migrations the only `insert into clara.document_regions` sites in the repo are
 *  test fixtures).
 *
 *  This is load-bearing rather than tidy. 0191's region-side belt
 *  (`clara._tf_document_region_fact_validate`) REFUSES a region carrying one of the seven
 *  identity terms when it arrives after the extraction's own COMMIT, with CLR10
 *  `fact_validation_would_go_stale`: the invoice-identity verdict is recorded at the header's
 *  COMMIT and the validation row is append-only, so a later region would leave the record
 *  describing regions that are no longer the regions on file. Seeding through three separate
 *  `fx.rootQuery` autocommits made this rig a writer path the product does not have, and the
 *  belt was right to refuse it. Inside one transaction both triggers are queued together and
 *  see the identical region set, so the belt is inert either way round (0191:930-975).
 *
 *  `withActor`'s finally rolls back when anything throws before COMMIT; its `rollback` after a
 *  successful COMMIT finds no open transaction and is a no-op. `clock_timestamp()` still
 *  advances statement by statement inside a transaction (unlike `now()`), so the vision/text
 *  pair below keeps the distinct `extracted_at` the cross-regime cells read. */
async function rootTx(fn) {
  return fx.asRoot(async (c) => {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  });
}

/** A legacy `invoice_facts` generation: one extraction + an `invoice.total` region (real
 *  geometry + confidence) + an `invoice.currency` region — the shape autoDraft.v7/chatTurn.v10
 *  already read, unwidened. `extractedAt` lets a cell pin the cross-regime clock explicitly. */
export async function seedLegacyInvoiceFacts({ firm, document, versionN = 3, totalCents = 100000, confidence = 0.99, extractedAt = null }) {
  const total = `RM ${(totalCents / 100).toFixed(2)}`;
  return rootTx(async (c) => {
    const extraction = (await c.query(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,extracted_at)
         values($1,$2,'azure-di:prebuilt-invoice:4.0','invoice_facts',$3,'done',1,coalesce($4::timestamptz,clock_timestamp()))
         returning id`,
      [firm, document, versionN, extractedAt],
    )).rows[0].id;
    await c.query(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
         values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}','invoice.total',$3,$4,$3,$5)`,
      [firm, extraction, total, confidence, totalCents],
    );
    await c.query(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
         values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}','invoice.currency','MYR',$3)`,
      [firm, extraction, confidence],
    );
    return extraction;
  });
}

/** A witness PAIR: `llm_vision_facts` (no regions, §3.1) + `llm_text_facts` (carries the
 *  region set) sharing ONE engine_id + version_n, vision inserted first / text last (the
 *  writer's own pointer discipline, §3.9 note 4) so the document-wide pointer lands on the
 *  text row. `extractedAt` lets a cell pin the clock explicitly for the cross-regime cells. */
export async function seedWitnessPair({ firm, document, versionN = 1, totalCents = 100000, extractedAt = null }) {
  const eid = `llm-openai:gpt-witness:${fx.opk("w")}`;
  const total = `RM ${(totalCents / 100).toFixed(2)}`;
  return rootTx(async (c) => {
    const visionId = (await c.query(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
         values($1,$2,$3,'llm_vision_facts',$4,'done',1,'{"witness":{"channel":"vision","answers":{}}}'::jsonb,coalesce($5::timestamptz,clock_timestamp()))
         returning id`,
      [firm, document, eid, versionN, extractedAt],
    )).rows[0].id;
    const textId = (await c.query(
      `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count,envelope,extracted_at)
         values($1,$2,$3,'llm_text_facts',$4,'done',1,'{"witness":{"channel":"text","answers":{}}}'::jsonb,coalesce($5::timestamptz,clock_timestamp()))
         returning id`,
      [firm, document, eid, versionN, extractedAt],
    )).rows[0].id;
    // engine_confidence = NULL by design (§3.4) — never set on a witness region.
    await c.query(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence,monetary_raw,monetary_cents)
         values($1,$2,'page_polygon','{"page":1,"polygon":[10,10,50,20]}','invoice.total',$3,null,$3,$4)`,
      [firm, textId, total, totalCents],
    );
    await c.query(
      `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
         values($1,$2,'page_polygon','{"page":1,"polygon":[1,1,2,2]}','invoice.currency','MYR',null)`,
      [firm, textId],
    );
    return { textId, visionId, engineId: eid };
  });
}

/** The REAL clara.get_document_extract(document, client) RPC — called on the HUMAN lane (a
 *  firm member's own JWT sub) rather than root, because the function's non-wake branch reads
 *  `_human_ctx()`, which needs real JWT claims. Same envelope shape the agent lane's
 *  `readScoped` reads; only the caller identity differs (§4.1's PIN-AB pattern). */
export async function realExtract(sub, document, client) {
  const r = await fx.asHuman(sub, (c) => c.query("select clara.get_document_extract($1::uuid,$2::uuid) as x", [document, client]));
  return r.rows[0].x;
}
