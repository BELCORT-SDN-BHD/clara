// F-A2 openers ①② — shared rig fixtures (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it; the battery is f-a2-nil-tax-arm.test.mjs).
//
// WHAT THIS MODULE ADDS OVER f-a1-fixtures.mjs, and why it is a NEW module rather than an edit
// to that one: f-a1-fixtures.mjs states the witnessFacts.v1 ENVELOPE CONTRACT and is the
// contract-blind evidence the F-A1 predicate lane was written against. Editing it would move a
// piece of that lane's evidence. This module builds ON it — every shape still comes out of
// `witnessShape`, and the v2 additions are applied as a pure transform afterwards.
//
// THE witnessFacts.v2 WIRE CONTRACT, WRITTEN OUT (this is the interface the runtime PR builds
// against, and the ONLY thing the v2 evaluator's three locks read that v1 did not):
//
//   envelope.witness.coverage = {                       -- TEXT channel
//     "ocr_extraction_id": "<uuid>",                    -- which OCR generation was read
//     "regions_total":  <int>,                          -- how many regions existed
//     "regions_shown":  <int>,                          -- how many made it into the prompt
//     "truncated":      <JSON boolean>,                 -- did the 60k budget cut the block
//     "pages":          [<int>, …],
//     "downgraded_fields": ["<field_path>", …]          -- [] when none
//   }
//   envelope.witness.coverage = {                       -- VISION channel
//     "input_sha256": "<64 lowercase hex>",             -- the filed file's own digest
//     "truncated":    <JSON boolean>,
//     "downgraded_fields": ["<field_path>", …]
//   }
//   envelope.witness.answers["invoice.sst_registration"] =
//        { "state": "value", "raw": "<the printed SST registration number>" }
//      | { "state": "not_printed" }                     -- "I read the WHOLE document and none
//                                                       --  is printed", not "I did not find one"
//
// WHY `downgraded_fields` IS NOT DECORATION. The runtime's answer normalizer emits a
// BYTE-IDENTICAL `{state:'not_printed'}` for an honest silence and for a DOWNGRADE — the model
// answered `value` and then failed to quote it. For a belt field the two are told apart
// downstream because a belt downgrade stamps `corroboration_ineligible`; for a REFERENCE ANSWER
// field it deliberately does not. So the persisted ANSWERS cannot distinguish them and the
// receipt has to. The battery's downgrade cell asserts that byte-identity explicitly, because
// a cell that did not would be proving something easier than the real hazard.

import { randomUUID } from "node:crypto";
import { rootQuery } from "./rig-helpers.mjs";

export * from "./f-a1-fixtures.mjs";

/** The party-blind SST presence answer opener ① adjudicated (spec §2.5.1). */
export const SST = "invoice.sst_registration";

/** The frozen v1 predicate's prosrc sha256 as 0092 committed it. The battery proves the freeze
 *  HELD rather than assuming it, so this constant is pinned here beside the migration's own
 *  prestate pin and compared against the live catalog. */
export const V1_PROSRC_SHA = "75c4ca06d012d1b315db9452e522b0bc9cdd4eed68038bd305ca84dba8cb9911";

/** The engine identity opener ② moves the two mint doors to. */
export const WITNESS_ENGINE_ID_V1 = "llm-openai:gpt-5.6-terra:v1";
export const WITNESS_ENGINE_ID_V2 = "llm-openai:gpt-5.6-terra:v2";

/**
 * Readiness. THREE distinguishable states, and only one of them is "skip" — the f-a1-fixtures
 * `witnessReady` idiom, carried:
 *   - nothing applied            -> genuinely dormant; skip.
 *   - some applied               -> DRIFT; throw. A battery that reported itself dormant on a
 *                                   half-applied window would hide exactly the state it exists
 *                                   to catch.
 *   - all applied                -> live; run.
 */
export async function a2Ready() {
  const r = await rootQuery(`
    select to_regprocedure('clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)') is not null as predicate,
           position('evaluate_witness_fact_state_v2' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure)) > 0 as repoint,
           position('invoice.sst_registration' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._witness_answers_ok(jsonb,text)'::regprocedure)) > 0 as vocabulary,
           position('llm-openai:gpt-5.6-terra:v2' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._enqueue_invoice_facts_core(uuid)'::regprocedure)) > 0 as router,
           position('llm-openai:gpt-5.6-terra:v2' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara.request_reextraction(uuid,text,text)'::regprocedure)) > 0 as reext`);
  const s = r.rows[0];
  const on = [s.predicate, s.repoint, s.vocabulary, s.router, s.reext];
  if (on.every((x) => !x)) return false;
  if (!on.every((x) => x)) {
    throw new Error(`F-A2 DRIFT: a half-applied window — predicate=${s.predicate} repoint=${s.repoint} vocabulary=${s.vocabulary} router=${s.router} reext=${s.reext}. Apply UNNUMBERED_f_a2_nil_tax_arm.sql and UNNUMBERED_f_a2_nil_tax_arm_part2.sql as a pair.`);
  }
  return true;
}

/** The TEXT channel's coverage receipt. Defaults are the COMPLETE shape; every field is
 *  overridable so a negative cell can break exactly one term. */
export const textCoverage = ({
  ocrExtractionId = null, regionsTotal = 7, regionsShown = undefined,
  truncated = false, pages = [1], downgraded = [],
} = {}) => ({
  ocr_extraction_id: ocrExtractionId ?? randomUUID(),
  regions_total: regionsTotal,
  regions_shown: regionsShown === undefined ? regionsTotal : regionsShown,
  truncated,
  pages,
  downgraded_fields: downgraded,
});

/** The VISION channel's coverage receipt. `inputSha256` should be the document's OWN sha256 —
 *  the writer refuses any persist whose vision input pin is not that value (0095:405-407), so a
 *  fixture that used a made-up digest would be building a shape the writer cannot produce. */
export const visionCoverage = ({ inputSha256, truncated = false, downgraded = [] } = {}) => ({
  input_sha256: inputSha256,
  truncated,
  downgraded_fields: downgraded,
});

/** The filed document's own digest — the vision channel's structural coverage receipt. */
export async function documentSha(document) {
  const r = await rootQuery("select sha256 from clara.documents where id=$1", [document]);
  return r.rows[0]?.sha256 ?? null;
}

/**
 * Apply the witnessFacts.v2 additions to a shape built by `witnessShape`. PURE — it clones the
 * envelopes rather than mutating the caller's, so a cell can derive several variants from one
 * base shape and be sure the base did not move under it.
 *
 *   coverage: { text: <object|null|undefined>, vision: <object|null|undefined> }
 *             an OBJECT installs it; `null` DELETES the key (the v1-era row shape); `undefined`
 *             leaves whatever was there. A non-object value is installed verbatim, which is how
 *             the malformed-receipt cells are built.
 *   sst:      { text: <answer|null|undefined>, vision: … } — same three-way rule.
 */
export function withWitnessV2(shape, { coverage = {}, sst = {} } = {}) {
  const out = {
    ...shape,
    textEnvelope: structuredClone(shape.textEnvelope),
    visionEnvelope: structuredClone(shape.visionEnvelope),
    regions: shape.regions.map((r) => ({ ...r })),
  };
  const put = (env, key, value) => {
    if (value === undefined) return;
    if (value === null) delete env.witness[key];
    else env.witness[key] = value;
  };
  const putAnswer = (env, path, value) => {
    if (value === undefined) return;
    if (value === null) delete env.witness.answers[path];
    else env.witness.answers[path] = value;
  };
  put(out.textEnvelope, "coverage", coverage.text);
  put(out.visionEnvelope, "coverage", coverage.vision);
  putAnswer(out.textEnvelope, SST, sst.text);
  putAnswer(out.visionEnvelope, SST, sst.vision);
  return out;
}

/** clara.evaluate_witness_fact_state_v2 called directly on a pinned pair. */
export async function evaluatePairV2(document, textId, visionId) {
  return (await rootQuery(
    "select clara.evaluate_witness_fact_state_v2($1,$2,$3) as s", [document, textId, visionId])).rows[0].s;
}

/** The write boundary's own answers validator — the instrument `clara.persist_witness_facts`
 *  uses (0095:379-380), called directly so a vocabulary cell measures the real gate rather than
 *  a re-implementation of it. */
export async function answersOk(envelope, channel) {
  return (await rootQuery(
    "select clara._witness_answers_ok($1::jsonb,$2) as ok", [JSON.stringify(envelope), channel])).rows[0].ok;
}

/** The witness engine literal each mint door actually carries, read from ITS OWN catalog body.
 *  Never re-derived from the other, and never re-typed in a test: the two doors must agree, and
 *  a shared hand-typed constant would prove only that the test file is self-consistent. */
export async function mintEngineId(which = "router") {
  const sig = which === "router"
    ? "clara._enqueue_invoice_facts_core(uuid)"
    : "clara.request_reextraction(uuid,text,text)";
  const r = await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [sig]);
  const m = /v_engine\s*:=\s*'(llm-openai:[^']+)'/.exec(r.rows[0]?.prosrc ?? "");
  if (!m) throw new Error(`F-A2: the witness engine literal is unreadable from ${sig}`);
  return m[1];
}
