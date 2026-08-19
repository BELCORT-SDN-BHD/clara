// F-A1 witnessFacts_v1 — shared runtime-rig fixtures (NOT a test file: no `.test.` segment, so
// `node --test` ignores it).
//
// Builds a REAL witness situation on a REAL Postgres migrated 0001→0095: a firm, a client, a
// filed document with a done OCR extraction and numbered regions, a claimed `llm_witness` task,
// and (optionally) a live typed `witness_extraction` consent + activation minted through the
// AUDITED owner verbs — never a hand-inserted consent row, because the consent surface is
// exactly the thing the egress cells are testing.
//
// Documents / extractions / regions / filings / tasks ARE seeded as root. They are not books
// rows, no audited writer exists for the shapes a witness task needs mid-pipeline, and the
// sibling DB battery (packages/db/tests/f-a1-writer.test.mjs) seeds the same way — mirroring it
// keeps a divergence between the two lanes visible as a finding rather than as two different
// fixtures quietly testing two different things.

import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";

import * as fx from "./relay-fixtures.mjs";
import { normalizeAzureLayout } from "../lib/egress.mjs";
import { callWitnessModel, witnessMediaType, WITNESS_ENGINE_SNAPSHOT } from "../workflows/witnessFacts.v1.services.mjs";

export const WITNESS_PURPOSE = "witness_extraction";

/** Canonical bytes for the vision channel — a real (tiny) PDF, so the file content part the AI
 *  SDK builds is a genuine `application/pdf` part rather than a placeholder. */
export const PDF_BYTES = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Page >> endobj\nstartxref\n0\n%%EOF\n");

/**
 * A scripted witness model, armed through `globalThis.__claraModelForTest` — the same override
 * every other model lane in this runtime uses, so no key is needed and nothing reaches the
 * network. Returns the CALL LOG: every "no model call was made" assertion in these batteries
 * counts entries here rather than reading a log line.
 *
 * The channel is told apart by the PRESENCE OF A FILE PART in the converted prompt — the
 * structural difference between the two channels, not a string sniff.
 */
export function witnessMock({ text, vision, throwOn = null }) {
  const calls = [];
  globalThis.__claraModelForTest = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const parts = (options?.prompt ?? []).flatMap((m) => (Array.isArray(m?.content) ? m.content : []));
      const channel = parts.some((p) => p?.type === "file") ? "vision" : "text";
      calls.push({
        channel,
        parts: parts.map((p) => p?.type),
        // The USER text exactly as the provider would have received it — the only honest way to
        // assert what the model was shown.
        text: parts.filter((p) => p?.type === "text").map((p) => String(p.text ?? "")).join("\n"),
        system: (options?.prompt ?? []).filter((m) => m?.role === "system")
          .map((m) => (typeof m.content === "string" ? m.content : "")).join("\n"),
      });
      if (throwOn === channel) throw Object.assign(new Error("mock witness model failure"), { code: "engine_error" });
      return {
        content: [{ type: "text", text: JSON.stringify(channel === "vision" ? vision : text) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1200, noCache: 1200 }, outputTokens: { total: 340 } },
        warnings: [],
      };
    },
  });
  return calls;
}

/** The injected bundle: the REAL model adapter and the REAL engine snapshot (so the AI SDK path,
 *  the file content part and the engine-stamp guard are all genuinely exercised), real temp-file
 *  lifecycle, and a storage stub that writes the canonical bytes. */
export function witnessServices(tmpRoot) {
  return {
    taskTempPath: (taskId) => join(tmpRoot, `witness-${taskId}.pdf`),
    removeTempFile: (p) => rm(p, { force: true }),
    downloadCanonical: async (_key, destination, sha256) => {
      await writeFile(destination, PDF_BYTES);
      return { path: destination, sha256 };
    },
    callWitnessModel,
    witnessMediaType,
    engineSnapshot: WITNESS_ENGINE_SNAPSHOT,
    log: (m) => logLines.push(String(m)),
  };
}

/** Every line the lane's settle path shouted, so a cell can assert the LOUD fallback actually
 *  spoke rather than trusting that it would. Cleared per cell by `resetWitnessLog`. */
export const logLines = [];
export const resetWitnessLog = () => { logLines.length = 0; };

/**
 * A RIG STAND-IN for `clara.fail_witness_facts`, which does NOT exist in the merged estate — it
 * ships in F-A1 PR-3's migration (see witnessFacts.v1.dispatch.mjs's ordering argument).
 *
 * READ THIS BEFORE TRUSTING A CELL THAT USES IT. This function exists ONLY to prove the runtime
 * makes the right CALL: the name, the two-argument shape, and that a terminal outcome reaches it
 * with the right code. It is deliberately minimal and it is NOT a prediction of PR-3's body —
 * that verb will also refund, audit and emit `document.llm_witness_failed`, none of which is
 * asserted here. The PR-1 assembly lesson is exactly this hazard (a scaffold the real dependency
 * later diverges from), so the stand-in's whole contract is stated in one line: task -> failed,
 * error_code = the code the runtime passed. When PR-3 lands, these cells run against the real
 * verb and any divergence in the CALL SHAPE is a finding on one side or the other.
 */
/** The marker the stand-in carries in its own body, so `drop` can tell OUR substitute from the
 *  real verb by reading it rather than by assuming which one is installed (review D3). */
const STAND_IN_MARKER = "F-A1 PR-2 RIG STAND-IN -- not PR-3's body";
/** The refusal codes PR-3's migration must add to ck_processing_task_error_code_f_a1 beside the
 *  two witness consent codes. `wait_exhausted` is D1's; the CHECK does not admit it today. */
const STAND_IN_CODES = ["wait_exhausted"];
let widenedCheck = null;   // the constraint definition we replaced, for exact restoration

export async function installFailWitnessFactsStandIn() {
  // EXISTENCE-GATED (D3): once PR-3 lands, the REAL verb is present and these cells must run
  // against it — installing over it would replace the thing under test with a scaffold, which is
  // precisely the PR-1 assembly defect. Nothing is installed and nothing is later dropped.
  if (await failWitnessFactsExists()) return { installed: false, reason: "real verb present" };

  // The error-code CHECK does not admit `wait_exhausted` yet, so the stand-in could not store it.
  // Widened here, captured EXACTLY so `drop` can put it back. PR-3 owes the same widening.
  const con = await fx.rootQuery(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname='ck_processing_task_error_code_f_a1'");
  const def = con.rows[0]?.def ?? null;
  // ABSENT IS A DEFECT, NOT A REASON TO CARRY ON. The first cut treated a missing constraint as
  // "nothing to widen" and proceeded — so after an earlier run crashed between this widening's
  // DROP and its ADD, every later run found no constraint, skipped silently, and went GREEN with
  // the table's error-code wall simply gone. A battery that passes because the thing it would
  // have violated no longer exists is the purest form of a probe that cannot say no.
  if (!def) {
    throw new Error(
      "F-A1 rig: ck_processing_task_error_code_f_a1 is ABSENT from clara.document_processing_tasks."
      + " The database is not in its 0090 §8 shape — most likely a previous run died between this"
      + " fixture's DROP and ADD. Re-migrate the test database; do not run the battery against it.");
  }
  if (!STAND_IN_CODES.every((c) => def.includes(`'${c}'`))) {
    // REBUILT FROM THE CATALOG'S OWN LITERALS, not by string surgery on the rendered definition —
    // pg_get_constraintdef emits a parenthesized `= ANY (ARRAY[...::text])` form, and patching
    // that text produced `argument of CHECK must be type boolean, not type record`. The admitted
    // set is read out, the new codes appended, the constraint written fresh. Restoration replays
    // the ORIGINAL rendered definition verbatim, which is valid SQL after `add constraint <name>`.
    widenedCheck = def;
    const all = [...new Set([...admittedCodes(def), ...STAND_IN_CODES])];
    // ATOMIC. Postgres makes DDL transactional, so drop+add in ONE transaction can never leave
    // the table without its error-code wall — which is exactly what the non-atomic first cut did
    // when its ADD raised 23514.
    await withConstraintSwap(
      "ck_processing_task_error_code_f_a1",
      `check (error_code is null or error_code in (${all.map((c) => `'${c}'`).join(",")}))`);
  }

  await fx.rootQuery(`
    create function clara.fail_witness_facts(p_task uuid, p_reason text) returns jsonb
      language plpgsql security definer set search_path = clara, pg_temp as $fn$
    declare t record;
    begin
      -- ${STAND_IN_MARKER}
      select * into t from clara.document_processing_tasks where id = p_task for update;
      if not found or t.lane <> 'llm_witness' then
        raise exception 'llm-witness task not found' using errcode='CLR16';
      end if;
      if t.status = 'failed' then
        return jsonb_build_object('task_id', p_task, 'status', 'failed',
          'reason', coalesce(t.error_code, p_reason), 'replayed', true);
      end if;
      update clara.document_processing_tasks
        set status='failed', error_code=p_reason, finished_at=now() where id = p_task;
      return jsonb_build_object('task_id', p_task, 'status', 'failed', 'reason', p_reason);
    end $fn$`);
  await fx.rootQuery("grant execute on function clara.fail_witness_facts(uuid,text) to clara_runtime");
  return { installed: true };
}

/** The `error_code` literals a constraint definition admits. */
const admittedCodes = (def) => [...String(def ?? "").matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);

/** Replace one CHECK in a SINGLE transaction. Postgres makes DDL transactional, so a failure
 *  rolls the drop back with it and the table is never left unconstrained — the defect that let a
 *  crashed run leave `ck_processing_task_error_code_f_a1` missing and every later run pass
 *  vacuously. */
async function withConstraintSwap(name, definition) {
  return fx.asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query(`alter table clara.document_processing_tasks drop constraint ${name}`);
      await c.query(`alter table clara.document_processing_tasks add constraint ${name} ${definition}`);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    }
  });
}

/**
 * Remove ONLY what this file installed (D3), decided by READING the committed body for our
 * marker. A `drop function if exists` would happily delete PR-3's real verb off a rig that had it
 * — a fixture quietly destroying the estate it was supposed to be testing against.
 *
 * THE RESIDUE MUST GO BEFORE THE NARROWER CHECK COMES BACK, and CI is what taught us. Re-adding
 * a CHECK VALIDATES it against every existing row, so any task this battery settled with a
 * not-yet-live code (`wait_exhausted`) makes the restore raise 23514 — "is violated by some
 * row". A per-battery throwaway database hides it completely: the rows and the restore live in
 * one short-lived DB and the residue is usually gone with it. CI runs every package against ONE
 * SHARED database, so the residue is still there at restore time and the after-hook dies.
 *
 * The codes to neutralize are DERIVED by diffing the definition we captured at install against
 * the one live now — never a hardcoded list, which would silently stop covering a code a future
 * pass adds to STAND_IN_CODES. Rows are rewritten to 'internal' (admitted by the original CHECK)
 * rather than deleted: llm_usage_events carries FKs onto these tasks, and a fixture that deletes
 * rows to tidy up a constraint is a fixture that can destroy evidence.
 *
 * `session_replication_role = replica` is what makes the rewrite possible at all — `failed` is a
 * TERMINAL state and `clara._tf_processing_task_update` raises CLR16 on any update to one. This
 * is a root-only, transaction-local cleanup of a fixture's own residue on a test database; it
 * suppresses no product behaviour under test.
 */
export async function dropFailWitnessFactsStandIn() {
  const r = await fx.rootQuery(
    "select position($1 in prosrc) > 0 as ours from pg_proc"
    + " where oid = to_regprocedure('clara.fail_witness_facts(uuid,text)')", [STAND_IN_MARKER]);
  if (r.rows[0]?.ours !== true) return { dropped: false, reason: "absent, or not ours" };
  await fx.rootQuery("drop function clara.fail_witness_facts(uuid,text)");
  if (!widenedCheck) return { dropped: true, restored: false };

  const live = await fx.rootQuery(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname='ck_processing_task_error_code_f_a1'");
  const original = admittedCodes(widenedCheck);
  const extra = admittedCodes(live.rows[0]?.def).filter((c) => !original.includes(c));
  let neutralized = 0;
  if (extra.length > 0) {
    neutralized = await fx.asRoot(async (c) => {
      await c.query("begin");
      try {
        await c.query("set local session_replication_role = replica");
        const up = await c.query(
          "update clara.document_processing_tasks set error_code='internal' where error_code = any($1)", [extra]);
        await c.query("commit");
        return up.rowCount ?? 0;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      }
    });
  }

  await withConstraintSwap("ck_processing_task_error_code_f_a1", widenedCheck);
  // SELF-ASSERTED, so a future edit to the widening cannot leave the estate subtly re-shaped and
  // green: the restored definition must be byte-for-byte the one captured at install.
  const after = await fx.rootQuery(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname='ck_processing_task_error_code_f_a1'");
  if (after.rows[0]?.def !== widenedCheck) {
    throw new Error(
      "F-A1 rig: the restored error-code CHECK is not byte-identical to the captured original\n"
      + `  captured: ${widenedCheck}\n  restored: ${after.rows[0]?.def}`);
  }
  const restoredDef = widenedCheck;
  widenedCheck = null;
  return { dropped: true, restored: true, neutralized, neutralizedCodes: extra, restoredDef };
}

export const failWitnessFactsExists = () =>
  fx.rootQuery("select to_regprocedure('clara.fail_witness_facts(uuid,text)') is not null as ok")
    .then((r) => r.rows[0].ok === true);

/** One channel's wire object: the ELEVEN belt answers plus the two optional reference answers,
 *  in the flat shape the prompt closure's schema asks the model for. */
export const witnessAnswer = (raw) => (raw == null ? { state: "not_printed", raw: null } : { state: "value", raw });
export function witnessWire(fields = {}) {
  const answers = {
    "invoice.total": witnessAnswer("RM 103.75"),
    "invoice.total_excl_tax": witnessAnswer("RM 94.30"),
    "invoice.tax_total": witnessAnswer("RM 5.66"),
    "invoice.service_charge": witnessAnswer("RM 3.77"),
    "invoice.rounding": witnessAnswer("RM 0.02"),
    "invoice.discount": witnessAnswer(null),
    "invoice.delivery": witnessAnswer(null),
    "invoice.amount_due": witnessAnswer(null),
    "invoice.deposit": witnessAnswer(null),
    "invoice.currency": witnessAnswer("MYR"),
    "invoice.type_code": witnessAnswer("01"),
    "invoice.invoice_id": { state: "not_printed", raw: null, value: null },
    "invoice.invoice_date": { state: "not_printed", raw: null, value: null },
    ...fields,
  };
  return { answers, contest: false };
}

/** THE ENGINE ID THE ROUTER MUST STAMP — the real snapshot constant, not a rig invention. The
 *  behaviour refuses to egress when the task's stamp and this image's model disagree, so using
 *  the true value here is what makes these cells test the CONTRACT rather than a stand-in (the
 *  PR-1 assembly lesson: a scaffold the real dependency later diverges from). It carries the
 *  `llm-` prefix the lane↔engine CHECK (0090 §3) demands; the 4-column unique is per-DOCUMENT,
 *  so every cell may share it. */
export const rigEngineId = () => WITNESS_ENGINE_SNAPSHOT.engineId;

/** A live-shaped `clara.documents` row. `storage_path` must satisfy ck_documents_storage_path_v2
 *  (`^firms/<firm>/docs/<sha>.<ext>$`), so it is built from the sha rather than invented. */
export async function seedDocument({ firm, kind = "invoice", mime = "application/pdf", pageCount = 1 }) {
  const sha = fx.sha(`witness-${randomUUID()}`);
  const ext = mime === "application/pdf" ? "pdf" : (mime.split("/")[1] ?? "bin");
  const r = await fx.rootQuery(
    `insert into clara.documents
       (firm_id, sha256, original_filename, mime_type, byte_size, storage_path, status,
        bytes_verified_at, page_count, document_kind)
     values ($1,$2,$3,$4,$5,$6,'ingested', now(), $7, $8) returning id`,
    [firm, sha, `witness.${ext}`, mime, 4096, `firms/${firm}/docs/${sha}.${ext}`, pageCount, kind],
  );
  return { documentId: r.rows[0].id, sha256: sha, mime, storagePath: `firms/${firm}/docs/${sha}.${ext}` };
}

/** File the document to ONE client (basis 'legacy-0007' — the only basis that takes a null
 *  resolution, per ck_document_filings_resolution). */
export async function fileTo({ firm, documentId, client }) {
  const r = await fx.rootQuery(
    `insert into clara.document_filings (firm_id, document_id, client_id, basis)
     values ($1,$2,$3,'legacy-0007') returning id`,
    [firm, documentId, client],
  );
  return r.rows[0].id;
}

export async function seedOcrExtraction({ firm, documentId, pageCount = 1, versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_extractions
       (firm_id, document_id, engine_id, engine_kind, version_n, status, page_count, envelope)
     values ($1,$2,'azure-di:prebuilt-layout:2024-11-30','ocr',$3,'done',$4,'{}'::jsonb)
     returning id`,
    [firm, documentId, versionN, pageCount],
  );
  return r.rows[0].id;
}

export async function seedOcrRegion({ firm, extraction, fieldPath, textContent, locator = { page: 1, polygon: [0, 0, 5, 0, 5, 5, 0, 5] } }) {
  const r = await fx.rootQuery(
    `insert into clara.document_regions
       (firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence)
     values ($1,$2,'page_polygon',$3::jsonb,$4,$5,0.97) returning id`,
    [firm, extraction, JSON.stringify(locator), fieldPath, textContent],
  );
  return r.rows[0].id;
}

/**
 * Seed OCR regions THROUGH THE REAL PRODUCER — `normalizeAzureLayout`, called on an Azure-shaped
 * payload, with its output rows inserted verbatim. Nothing here hand-writes a locator, so the
 * cells that read a page back are measuring what the production pipeline actually commits rather
 * than what a fixture author believed it commits (the PR-1 assembly lesson: a scaffold the real
 * dependency later diverges from).
 *
 * `lines` is [{ text, box: [x0,y0,x1,y1], page? }] — a rectangle, expanded to the four-corner
 * polygon Azure emits.
 */
export async function seedAzureRegions({ firm, extraction, lines }) {
  const payload = {
    analyzeResult: {
      content: lines.map((l) => l.text).join("\n"),
      pages: [{
        pageNumber: 1,
        lines: lines.map((l) => {
          const [x0, y0, x1, y1] = l.box;
          return {
            content: l.text,
            boundingRegions: [{ pageNumber: l.page ?? 1, polygon: [x0, y0, x1, y0, x1, y1, x0, y1] }],
          };
        }),
      }],
    },
  };
  const normalized = normalizeAzureLayout(payload, { engineId: "azure-di:prebuilt-layout:2024-11-30", versionN: 1 });
  const ids = [];
  for (const r of normalized.regions) {
    const row = await fx.rootQuery(
      `insert into clara.document_regions
         (firm_id, extraction_id, locator_kind, locator, field_path, text_content, engine_confidence,
          monetary_raw, monetary_cents)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) returning id`,
      [firm, extraction, r.locator_kind, JSON.stringify(r.locator), r.field_path, r.text_content,
        r.engine_confidence, r.monetary_raw, r.monetary_cents],
    );
    ids.push(row.rows[0].id);
  }
  return { regions: normalized.regions, ids };
}

/** A CLAIMED (`running`) llm_witness task — the state `persist_witness_facts` requires. Built
 *  directly rather than through `claim_document_processing_task` because nothing mints an
 *  llm_witness task at this frontier (PR-3's router does); the claim body's own witness arms are
 *  proven in packages/db/tests/f-a1-walls.test.mjs. */
export async function runningWitnessTask({ firm, documentId, engineId = rigEngineId(), versionN = 1 }) {
  const r = await fx.rootQuery(
    `insert into clara.document_processing_tasks
       (firm_id, document_id, engine_id, version_n, lane, status, workflow_run_id, started_at)
     values ($1,$2,$3,$4,'llm_witness','running',$5, now()) returning id`,
    [firm, documentId, engineId, versionN, `rig-witness-${randomUUID().slice(0, 8)}`],
  );
  return { taskId: r.rows[0].id, engineId, versionN };
}

/** A live typed `witness_extraction` consent + activation through the AUDITED owner verbs
 *  (0090 §7c widened their in-body allowlists — this is what proves the widening reaches the
 *  runtime). The evidence document is a verified consent-evidence artifact, which
 *  `grant_client_egress_purpose` refuses to proceed without. */
export async function liveWitnessConsent(ownerSub, { firm, client }) {
  const evidence = await seedDocument({ firm, kind: "consent_evidence" });
  const granted = await fx.humanQuery(
    ownerSub,
    `select clara.grant_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_evidence_document => $3, p_scope_note => $4, p_op_key => $5) as r`,
    [client, WITNESS_PURPOSE, evidence.documentId, "runtime rig witness consent", fx.opk("gwc")],
  );
  const consentId = granted.rows[0].r.consent_id;
  const activated = await fx.humanQuery(
    ownerSub,
    `select clara.activate_client_egress_purpose(p_client => $1, p_purpose => $2,
       p_consent => $3, p_op_key => $4) as r`,
    [client, WITNESS_PURPOSE, consentId, fx.opk("awa")],
  );
  return { evidence, consentId, activation: activated.rows[0].r };
}

/** The whole situation in one call. `regions` is a list of {label, text} — the labels become
 *  `ocr_<label>` field paths so a cell can look an idx up by name. */
export async function buildWitnessSituation(label, {
  consent = true, mime = "application/pdf", pageCount = 1,
  regions = [], ocr = true, engineId = rigEngineId(),
} = {}) {
  const { owner, firm, client } = await fx.buildFirm(label);
  const doc = await seedDocument({ firm, mime, pageCount });
  await fileTo({ firm, documentId: doc.documentId, client });
  // `ocr: false` seeds NO extraction at all — the absent-substrate shape. It cannot be produced
  // by deleting one afterwards: clara.document_extractions is append-only (CLR08 'document
  // extractions are historical'), which is itself worth knowing about this rig.
  const ocrId = ocr ? await seedOcrExtraction({ firm, documentId: doc.documentId, pageCount }) : null;
  const ids = {};
  const spatialOrder = [];
  for (const [i, r] of regions.entries()) {
    // STACKED DOWN THE PAGE, one band per region, in the order the caller listed them. The
    // citation ordinal is `row_number() over (order by id)` over UUIDs, so it is effectively
    // random with respect to this layout — which is the whole point: a cell can then tell
    // READING ORDER (this) apart from IDX ORDER (the DB's) instead of watching them coincide.
    ids[r.label] = await seedOcrRegion({
      firm, extraction: ocrId, fieldPath: `ocr_${r.label}`, textContent: r.text,
      locator: { page: 1, polygon: [0, i * 10, 5, i * 10, 5, i * 10 + 5, 0, i * 10 + 5] },
    });
    spatialOrder.push(r.label);
  }
  // The citation ordinal is `row_number() over (order by id)` over uuids, so it is NOT insertion
  // order — read the published numbering back rather than assuming it (the whole point of M5).
  const numbered = ocrId
    ? (await fx.rootQuery(
      "select idx, region_id, text_content from clara.witness_citation_regions($1) order by idx", [ocrId])).rows
    : [];
  const idxOf = {};
  for (const [name, id] of Object.entries(ids)) {
    idxOf[name] = numbered.find((row) => row.region_id === id)?.idx;
  }
  const task = await runningWitnessTask({ firm, documentId: doc.documentId, engineId });
  const consentRecord = consent ? await liveWitnessConsent(owner, { firm, client }) : null;
  return {
    owner, firm, client,
    documentId: doc.documentId, sha256: doc.sha256, mime, storagePath: doc.storagePath,
    ocrId, regionIds: ids, idxOf, numbered, spatialOrder,
    taskId: task.taskId, engineId: task.engineId, versionN: task.versionN,
    consent: consentRecord,
    /** The claim-receipt-shaped `doc` the frozen behaviour consumes. */
    claimDoc: {
      document_id: doc.documentId, firm_id: firm, lane: "llm_witness",
      storage_path: doc.storagePath, sha256: doc.sha256, mime_type: mime, byte_size: 4096,
    },
  };
}

/** Root reads for assertions (bypass RLS so a cell sees every firm). */
export const readTask = (id) =>
  fx.rootQuery("select * from clara.document_processing_tasks where id=$1", [id]).then((r) => r.rows[0] ?? null);
export const readUsageRows = (taskId) =>
  fx.rootQuery("select * from clara.llm_usage_events where task_id=$1 order by created_at, id", [taskId]).then((r) => r.rows);
export const readExtractions = (documentId) =>
  fx.rootQuery(
    "select id, engine_kind, engine_id, version_n, status, envelope, superseded_by, extracted_at, page_count"
    + " from clara.document_extractions where document_id=$1 order by extracted_at", [documentId],
  ).then((r) => r.rows);
export const readFactRegions = (extractionId) =>
  fx.rootQuery(
    "select field_path, text_content, monetary_raw, monetary_cents, engine_confidence, locator"
    + " from clara.document_regions where extraction_id=$1 order by field_path", [extractionId],
  ).then((r) => r.rows);
export const readDispatchAuthorizations = (firm) =>
  fx.rootQuery(
    "select purpose, event_type, event_seq, document_sha256, consumed_at from clara.egress_dispatch_authorizations"
    + " where firm_id=$1 order by issued_at", [firm],
  ).then((r) => r.rows);
export const readWitnessState = (documentId, textId, visionId) =>
  fx.rootQuery("select clara.evaluate_witness_fact_state_v1($1,$2,$3) as v", [documentId, textId, visionId])
    .then((r) => r.rows[0].v);
/** The identity leaf, called directly so a cell can see whether its GEOMETRY path was reached
 *  rather than only whether the amount verdict came out. */
export const readWitnessIdentity = (documentId, textId, contest = false) =>
  fx.rootQuery("select clara.evaluate_witness_identity_v1($1,$2,$3) as v", [documentId, textId, contest])
    .then((r) => r.rows[0].v);
