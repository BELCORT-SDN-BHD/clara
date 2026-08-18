// F-A1 witness-pair — shared rig fixtures (NOT a test file: the name does not end in
// `.test.mjs`, so `node --test` ignores it; the battery is f-a1-predicate.test.mjs).
//
// WHAT IS CONTRACT-BLIND HERE, and it is most of it. `clara.persist_witness_facts` is a SIBLING
// LANE's PR-1 deliverable and does not exist yet, so these fixtures write the two extraction rows
// and the text row's fact regions DIRECTLY as root. That is deliberate and it is the point: the
// predicate is being tested against the ENVELOPE CONTRACT the writer must satisfy, written from
// the design (f-a1-witness-pair-design.md §3.1/§3.3/§3.4) rather than from the writer's code.
// When the writer lands, a divergence between it and this module is a real FINDING on one side or
// the other — which is the mutual blindness the repo's contract-blind lanes exist to buy.
//
// THE ENVELOPE CONTRACT, WRITTEN OUT (this is the interface the writer lane builds against):
//
//   envelope = {
//     "witness": {
//       "channel": "text" | "vision",
//       "contest": <bool, optional>,              -- a witness-reported identity contest marker
//       "answers": {                              -- REQUIRED for all 11 belt fields, both rows
//         "<field_path>": { "state": "value", "raw": "<the document's exact rendering>" }
//                       | { "state": "not_printed" },
//         -- OPTIONAL, and ONLY these two beyond the eleven (M3, the reference-value contract):
//         "invoice.invoice_id"|"invoice.invoice_date":
//                         { "state": "value", "raw": "<rendering>", "value"?: "<normalized>" }
//       }
//     },
//     "corroboration_ineligible": <text|null, optional>
//   }
//
// The TEXT row additionally carries clara.document_regions rows (server-verified citations); the
// VISION row carries NO regions (design §3.1) and its cents are re-derived by the predicate from
// `raw` with clara._normalize_invoice_cents — a model-asserted integer is never read.
//
// THE THREE FIELD CLASSES (adjudicated review B1), because the fixtures have to be able to build
// all three: the NINE MONETARY belt members carry one verified region with real page_polygon
// geometry (C2); `invoice.currency` and `invoice.type_code` are TOKENS whose citation is
// OPTIONAL and which carry no geometry conjunct at all. `noRegions` below is how a cell builds
// the token-without-a-citation shape — the honest Malaysian invoice that prints "RM 103.75" and
// never a standalone MYR string anywhere a witness could cite.

import { randomUUID } from "node:crypto";
import { rootQuery } from "./rig-helpers.mjs";

export * from "./x1-helpers.mjs";

/** The eleven belt fields whose answer is REQUIRED in BOTH schemas (design §3.3, PR-0 B1). */
export const BELT = [
  "invoice.total", "invoice.total_excl_tax", "invoice.tax_total", "invoice.rounding",
  "invoice.service_charge", "invoice.discount", "invoice.delivery",
  "invoice.amount_due", "invoice.deposit", "invoice.currency", "invoice.type_code",
];

/** The nine monetary belt members — the ones C2 anchors to a page_polygon region. */
export const MONEY = BELT.slice(0, 9);

export const money = (cents) =>
  `RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** A page_polygon locator for a rectangle given in page units. */
export const box = (x0, y0, x1, y1, page = 1) => ({ page, polygon: [x0, y0, x1, y1] });

/**
 * Readiness. THREE distinguishable states, and only one of them is "skip":
 *   - predicate absent            -> genuinely dormant (this migration is not applied); skip.
 *   - predicate present, kinds not widened -> DRIFT; throw. A battery that reported itself
 *     dormant there would hide exactly the half-applied state it exists to catch (the x1-helpers
 *     `requireRecoveryDoor` idiom, one wave up).
 *   - both present                -> live; run.
 */
export async function witnessReady() {
  const r = await rootQuery(`
    select to_regprocedure('clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)') is not null as predicate,
           to_regprocedure('clara.evaluate_witness_identity_v1(uuid,uuid,boolean)') is not null as identity,
           exists(select 1 from pg_constraint
                   where conname = 'ck_document_extractions_engine_kind_f_a1'
                     and pg_get_constraintdef(oid) like '%llm\\_text\\_facts%') as kinds,
           exists(select 1 from pg_constraint
                   where conname = 'ck_processing_task_lane_f_a1'
                     and pg_get_constraintdef(oid) like '%llm\\_witness%') as lane,
           position('evaluate_witness_fact_state_v1' in
             (select p.prosrc from pg_proc p
               where p.oid = 'clara._invoice_fact_state_at(uuid,uuid)'::regprocedure)) > 0 as dispatch`);
  const s = r.rows[0];
  if (!s.predicate && !s.identity && !s.dispatch) return false;
  if (!s.predicate || !s.identity) {
    throw new Error("F-A1 DRIFT: the dispatch or the identity leaf is present but clara.evaluate_witness_fact_state_v1 is not — a half-applied predicate lane, not a dormant one");
  }
  if (!s.dispatch) {
    throw new Error("F-A1 DRIFT: clara.evaluate_witness_fact_state_v1 exists but clara._invoice_fact_state_at does not dispatch to it — part 2 of the pair was not applied");
  }
  if (!s.kinds || !s.lane) {
    throw new Error("F-A1 DRIFT: the predicate is applied but the witness engine_kind / lane CHECKs are NOT widened (ck_*_f_a1 absent). This battery cannot insert a witness row. Apply 0090_f_a1_walls.sql first — it renames the 0038-suffixed CHECKs to the _f_a1 suffix this probe reads. (The authoring-era rig scaffold kept the old names; it was deleted at PR-1 assembly.)");
  }
  return true;
}

/**
 * Build the two witness envelopes plus the TEXT row's region set from one declarative shape.
 *
 * `fields` maps a belt field_path to either a cents integer (monetary), a string (currency /
 * type_code), or null meaning NOT PRINTED. Anything omitted is `not_printed` — which is an
 * ANSWER, not silence: the roster is always complete unless a cell deliberately drops one.
 *
 * `visionOverride` lets a cell make the vision channel say something DIFFERENT (the one-sen
 * disagreement, the transposition, the foreign currency) without touching the text side.
 * `dropAnswers` removes a field from a roster entirely — the missing-answer refusal.
 * `noRegions` answers a field but writes NO region for it — the optional-citation shape the two
 * token fields are allowed to take (B1), and the not-corroborated shape a monetary field takes.
 * `rawOverride` replaces the rendered `raw` on the TEXT side (and, unless visionOverride says
 * otherwise, on the vision side too) — how a cell says "RM 103.75" where the fixture would
 * otherwise render a bare "MYR", or hands the predicate an absurd 30-digit magnitude.
 * `refAnswers` adds the two OPTIONAL M3 reference answers to one or both channels:
 *   { text: { "invoice.invoice_id": { raw, value } }, vision: { ... } }
 */
export function witnessShape({
  fields = {}, visionOverride = {}, dropAnswers = { text: [], vision: [] },
  geometry = {}, extraRegions = [], contest = false, ineligible = null,
  noRegions = [], rawOverride = {}, refAnswers = { text: {}, vision: {} },
} = {}) {
  const textAnswers = {}; const visionAnswers = {}; const regions = [];
  const rendered = (path, v) =>
    v === null || v === undefined ? null : (MONEY.includes(path) ? money(v) : String(v));
  for (const path of BELT) {
    const base = rendered(path, Object.prototype.hasOwnProperty.call(fields, path) ? fields[path] : null);
    const raw = base !== null && Object.prototype.hasOwnProperty.call(rawOverride, path)
      ? rawOverride[path] : base;
    textAnswers[path] = raw === null ? { state: "not_printed" } : { state: "value", raw };
    const vRaw = Object.prototype.hasOwnProperty.call(visionOverride, path)
      ? rendered(path, visionOverride[path])
      : raw;
    visionAnswers[path] = vRaw === null ? { state: "not_printed" } : { state: "value", raw: vRaw };
    if (raw !== null && !noRegions.includes(path)) {
      regions.push({
        field_path: path, text_content: raw,
        monetary_raw: MONEY.includes(path) ? raw : null,
        monetary_cents: MONEY.includes(path) ? fields[path] : null,
        locator_kind: "page_polygon",
        locator: geometry[path] ?? box(0, 0, 1, 1),
      });
    }
  }
  for (const p of dropAnswers.text ?? []) delete textAnswers[p];
  for (const p of dropAnswers.vision ?? []) delete visionAnswers[p];
  for (const [p, a] of Object.entries(refAnswers.text ?? {})) textAnswers[p] = { state: "value", ...a };
  for (const [p, a] of Object.entries(refAnswers.vision ?? {})) visionAnswers[p] = { state: "value", ...a };
  for (const r of extraRegions) regions.push(r);
  const env = (channel, answers) => {
    const e = { witness: { channel, answers } };
    if (contest) e.witness.contest = true;
    if (ineligible) e.corroboration_ineligible = ineligible;
    return e;
  };
  return { textEnvelope: env("text", textAnswers), visionEnvelope: env("vision", visionAnswers), regions };
}

/**
 * Land a witness PAIR on a document: one llm_witness task plus two done extractions sharing
 * (engine_id, version_n) and distinguished by engine_kind, with the TEXT row carrying the regions.
 *
 * VISION FIRST, TEXT LAST, each with its own clock_timestamp() — design §3.9 note 4's writer
 * discipline, so the document-wide pointer lands on the TEXT row rather than on a uuid coin flip.
 * TWO SEPARATE INSERT STATEMENTS, for the same design's note 3 reason (AFTER-INSERT-FOR-EACH-ROW
 * triggers fire at end of STATEMENT, so a one-statement pair supersedes BOTH rows).
 */
export async function landWitnessPair(document, {
  engineId = null, versionN = 1, textEnvelope = {}, visionEnvelope = {}, regions = [],
  visionRegions = [], textStatus = "done", visionStatus = "done", visionKind = "llm_vision_facts",
  withTask = true,
} = {}) {
  const eid = engineId ?? `llm-openai:gpt-witness:${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("select firm_id from clara.documents where id=$1", [document])).rows[0].firm_id;
  if (withTask) {
    await rootQuery(
      `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,version_n,lane,
         status,workflow_run_id,started_at,finished_at)
       values($1,$2,$3,$4,'llm_witness','done',$5,now(),now())`,
      [firm, document, eid, versionN, `rig-witness-${randomUUID().slice(0, 8)}`]);
  }
  const ins = async (kind, envelope, status) => (await rootQuery(
    `insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,
       status,page_count,envelope,extracted_at)
     values($1,$2,$3,$4,$5,$6,1,$7::jsonb,clock_timestamp()) returning id`,
    [firm, document, eid, kind, versionN, status, JSON.stringify(envelope)])).rows[0].id;
  const visionId = await ins(visionKind, visionEnvelope, visionStatus);
  const textId = await ins("llm_text_facts", textEnvelope, textStatus);
  const addRegions = async (extraction, rows) => {
    for (const r of rows) {
      await rootQuery(
        `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,
           text_content,engine_confidence,monetary_raw,monetary_cents)
         values($1,$2,$3,$4::jsonb,$5,$6,null,$7,$8)`,
        [firm, extraction, r.locator_kind ?? "page_polygon", JSON.stringify(r.locator ?? box(0, 0, 1, 1)),
          r.field_path, r.text_content, r.monetary_raw ?? null, r.monetary_cents ?? null]);
    }
  };
  await addRegions(textId, regions);
  await addRegions(visionId, visionRegions);
  return { engineId: eid, versionN, textId, visionId, firm };
}

/** clara.evaluate_witness_fact_state_v1 called directly on a pinned pair. */
export async function evaluatePair(document, textId, visionId) {
  return (await rootQuery(
    "select clara.evaluate_witness_fact_state_v1($1,$2,$3) as s", [document, textId, visionId])).rows[0].s;
}

/** The 1-arg cross-regime dispatcher and the 2-arg pinned overload. */
export const factState = async (document) =>
  (await rootQuery("select clara._invoice_fact_state($1) as s", [document])).rows[0].s;
export const factStateAt = async (document, extraction) =>
  (await rootQuery("select clara._invoice_fact_state_at($1,$2) as s", [document, extraction])).rows[0].s;
/** …and their exact TEXT, for the byte-identity cells (the 0023:357 exact-diff idiom). */
export const factStateText = async (document) =>
  (await rootQuery("select clara._invoice_fact_state($1)::text as s", [document])).rows[0].s;
export const factStateAtText = async (document, extraction) =>
  (await rootQuery("select clara._invoice_fact_state_at($1,$2)::text as s", [document, extraction])).rows[0].s;

/**
 * The LEGACY regime's winner, recomputed in the test from 0016:2263-2270 VERBATIM.
 *
 * This is what makes the continuity cell a diff rather than an assertion about the present: the
 * dispatcher must resolve exactly this extraction on a document with no witness pair, and return
 * exactly the bytes the pinned overload returns for it.
 */
export async function legacyPick(document) {
  const r = await rootQuery(
    `select e.id
       from clara.document_processing_tasks t
       join clara.document_extractions e
         on e.document_id = t.document_id and e.engine_id = t.engine_id
        and e.version_n = t.version_n and e.engine_kind = 'invoice_facts'
        and e.status = 'done'
      where t.document_id = $1 and t.lane in ('invoice_facts','local_facts') and t.status = 'done'
      order by t.version_n desc, t.id desc limit 1`, [document]);
  return r.rows[0]?.id ?? null;
}

/** Add a tin/ssm identifier to a client — the self-referential withdrawal's DB-owned input. */
export async function addIdentifier(client, value, kind = "ssm") {
  const row = (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0];
  const user = (await rootQuery(
    "select user_id from clara.firm_memberships where firm_id=$1 order by user_id limit 1", [row.firm_id])).rows[0];
  await rootQuery(
    `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
     values($1,$2,$3,$4,$5)`,
    [row.firm_id, client, kind, value.toLowerCase().replace(/[^a-z0-9]/g, ""), user.user_id]);
}
