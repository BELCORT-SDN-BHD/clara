// @frozen
//
// Behavioral closure for witnessFacts_v1 (F-A1 — `docs/plan/active/f-a1-witness-pair-design.md`
// §3.1, §3.4, §3.5, §3.6; annexes Annex A/C). ONE lane (`llm_witness`), ONE claim, TWO reads of
// the same document through TWO channels of the SAME provider, ONE atomic idempotent persist.
//
//   * TEXT channel   — the model reads the stored OCR text as NUMBERED REGIONS and must CITE
//                      the region it read each fact from. The numbering is the DB's own
//                      (`clara.witness_citation_regions`), never this file's.
//   * VISION channel — the model reads the ORIGINAL filed bytes. It sees no regions, cites
//                      nothing, and contributes the VALUE only (design §3.4).
//
// THE INDEPENDENCE AXIS IS THE CHANNEL, not the vendor (G1.1). So the receipt that makes
// independence CHECKABLE is not a model stamp — it is the input pins (the text read names the
// pinned OCR extraction id; the vision read names `documents.sha256`) plus two DISTINCT prompt
// hashes, all of which `clara.persist_witness_facts` verifies and refuses.
//
// EACH MODEL CALL IS ITS OWN MEMOIZED STEP (design §3.1). A step's return value is memoized by
// the durable engine, so a later failure REPLAYS the stored envelope instead of re-calling a
// model already paid for. The envelopes here are therefore small JSON receipts — eleven answers,
// at most eighteen citations, a usage blob. Bytes, credentials, the raw region text and the
// provider payload never cross a step boundary (the AB-16 / PIN-AB-6 law every sibling obeys).
//
// WHY THE DOWNLOAD LIVES INSIDE THE VISION STEP rather than in a step of its own — a stated
// deviation from design §3.1's four-step sketch, for the reason above: a download step could
// only hand the next step a temp-file PATH, and a path is exactly the receipt that survives
// memoization while the thing it names does not. After a cross-process replay the file is gone
// and the stored path is a lie. Downloading inside the step that consumes the bytes makes it
// self-sufficient on every retry, and storage is not egress, so a re-read spends nothing.
//
// EGRESS, TWICE, ONE PURPOSE (design §3.5). Both channels dispatch under the typed purpose
// `witness_extraction`: the vision channel sends the client's original document, and the text
// channel RE-SENDS OCR-derived client content to the vendor — an egress event under law 58's
// plain reading, not a local read. `prepare`/`consume` wrap EACH model call, `consume` in its
// OWN committed transaction immediately before the call, so a deactivation that committed since
// prepare refuses HERE and the bytes never leave. The typed CONSENT question was already asked
// at ENQUEUE (`_enqueue_invoice_facts_core`'s llm_witness gate, 0090 §7e) — this is the
// dispatch linearization point, not a second policy decision.
//
// AUDIT-TRAIL HONESTY, inherited from the statement lane and not to be softened: the typed
// authorization covers THESE two witness reads and nothing earlier. The kind-blind intake OCR
// pass that produced the very regions the text channel reads egressed under the GLOBAL switch
// and the engagement-letter consent, before any typed gate could see the document's kind.
// Nothing here may assert otherwise.
//
// THERE IS NO `fail_witness_facts` VERB IN THE MERGED ESTATE — checked at the bytes across
// 0089-0095, where the statement lane has `clara.fail_statement_facts` (0038:2046) and the
// invoice lane `clara.fail_invoice_facts` (0009:2152). A refusal here therefore CANNOT settle
// the task the way its siblings do, and this file does not pretend otherwise: inventing a direct
// UPDATE is forbidden (book writes go through named audited functions, and `clara_runtime` holds
// SELECT only on that table anyway). Instead it records the refusal as an `llm_usage_events` row
// with outcome='refused' — append-only, RLS-scoped, naming firm/document/task/channel/engine —
// and throws a FatalError so the run ends visibly rather than looping. The task then waits for
// the reconciler's re-drive, and the DB's per-lane attempt cap settles it `attempt_cap` with
// `document.llm_witness_failed` (0090 §5). Bounded and auditable — but the NAMED reason lives in
// the usage row, not the task row. Reported as an F-A1 gap, not papered over.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY (the chatTurn_v8 law): `interpretClaimReceipt` /
// `docFromReceipt` are DUPLICATED here rather than imported from the frozen invoiceFacts or
// statementFacts closure. Kept in step by review, never by import.

import { FatalError } from "workflow";
import {
  buildWitnessTextPrompt,
  buildWitnessVisionPrompt,
  toWriterCitations,
  toWriterEnvelope,
  witnessPromptHash,
  witnessTextSchema,
  witnessVisionSchema,
  WITNESS_TEXT_SYSTEM_PROMPT,
  WITNESS_VISION_SYSTEM_PROMPT,
} from "./witnessFacts.v1.prompts.mjs";

/** The typed governed-egress purpose BOTH channels dispatch under (design §3.5, OQ-2). */
export const WITNESS_PURPOSE = "witness_extraction";
/** The dispatch intent's event type. This lane is TASK-driven, so the "event" is the task's own
 *  version_n — stated here rather than borrowed silently from the wiki or statement lane. */
export const WITNESS_EVENT_TYPE = "witness.extraction";

/** Copied VERBATIM from invoiceFacts.v1.behavior.mjs / statementFacts.v1.behavior.mjs. One
 *  ratified set, not reinvented: `internal` is deliberately NOT retryable — fail closed on the
 *  unknown. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The two named witness refusal codes the DB admits (0090 §8's widened CHECKs) — recorded on
 *  the usage row; see the header for why they cannot currently reach the task row. */
export const WITNESS_REFUSAL_CODES = Object.freeze(["witness_consent_inactive", "witness_multi_client"]);

function receipt(row) {
  return row?.receipt ?? row?.result ?? row ?? {};
}

/** A refusal: terminal by nature (consent is a decision, not a fault), so it must never be
 *  retried into a second egress attempt. FatalError is the engine's own non-retryable marker. */
function witnessRefusal(code, message) {
  return Object.assign(new FatalError(`witness read refused (${code}): ${message}`), { code, witnessRefusal: true });
}

/** A WAIT: neither a vendor fault nor a fact about this document — a deployment window, a filing
 *  correction in flight, an OCR substrate that has not landed. Rethrown so the step retries; the
 *  DB's per-document attempt cap bounds the total, never an unbounded loop. */
function witnessWait(message) {
  return Object.assign(new Error(message), { code: "internal", claraRetry: true });
}

function witnessFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
    "bad_type", "limit", "internal"].includes(code) ? code : "internal";
}

async function callWriter(withRuntime, sql, params) {
  return withRuntime(async (client) => {
    const out = await client.query(sql, params);
    return receipt(out.rows[0]);
  });
}

/** PER-TASK SURFACE GUARD, evaluated per call and never cached (the wiki-projection §10.2
 *  idiom). EXACT signatures via `to_regprocedure` — an overloaded-name `to_regproc` check cannot
 *  tell one arity from another. Deploy order is runtime-image-FIRST, so this image can
 *  legitimately meet a database without the witness surface; in that window the model is NEVER
 *  called. Degrading to a narrower arity would spend an authorization carrying no document
 *  binding at all — the substitution the sha binding exists to stop. */
async function hasWitnessSurface(client) {
  const r = await client.query(
    "select to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)') is not null"
    + " and to_regprocedure('clara.witness_citation_regions(uuid)') is not null"
    + " and to_regprocedure('clara.persist_witness_facts(uuid,jsonb,jsonb,int)') is not null"
    + " and to_regprocedure('clara.record_llm_usage_event(uuid,uuid,uuid,text,text,text,int,int,int,text)') is not null"
    + " as surface",
  );
  return r.rows[0]?.surface === true;
}

/** PLAN-TIME verdict, sha-bound. Returns the DB's payload verbatim; a 42501 here is a GRANT GAP
 *  in the deployment, never bad data, and propagates. */
async function prepareWitnessDispatch(client, { firmId, clientId, eventSeq, documentSha256 }) {
  const r = await client.query("select clara.prepare_egress_dispatch($1,$2,$3,$4,$5,$6) as v", [
    firmId, clientId, WITNESS_PURPOSE, eventSeq, WITNESS_EVENT_TYPE, documentSha256,
  ]);
  return r.rows[0]?.v ?? { verdict: "unknown", authorization_id: null };
}

/** THE DISPATCH LINEARIZATION POINT, in its OWN committed transaction. A PostgreSQL function
 *  cannot commit its caller's transaction, so on a pooled connection `granted` could come back
 *  from an UNCOMMITTED consume — the model would then be called on an authorization a revoker
 *  still sees as unspent, and a rollback would erase the record that the bytes left. The
 *  explicit begin/commit makes `granted` MEAN committed. The full intent, sha included, is
 *  presented again so an authorization minted for document A cannot be spent on document B. */
async function consumeWitnessDispatch(client, { firmId, authorizationId, clientId, eventSeq, documentSha256 }) {
  await client.query("begin");
  let r;
  try {
    r = await client.query("select clara.consume_egress_dispatch($1,$2,$3,$4,$5,$6,$7) as v", [
      firmId, authorizationId, clientId, WITNESS_PURPOSE, eventSeq, WITNESS_EVENT_TYPE, documentSha256,
    ]);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
  return r.rows[0]?.v ?? { verdict: "unknown" };
}

/**
 * The task's own `version_n` and `engine_id` (both DB-owned: `persist_witness_facts` reads them
 * off the same row, so nothing here may invent either), plus the document's single active-filing
 * client. `document_processing_tasks` carries no client binding, so consent resolves through the
 * document's filings — and that resolution belongs to the serialized DB verb
 * (`clara.resolve_document_client`, 0020 §5), never to a read this file assembles for itself.
 */
async function readWitnessContext(client, taskId, doc) {
  const t = await client.query(
    "select version_n, engine_id, status from clara.document_processing_tasks where id=$1", [taskId]);
  const row = t.rows[0] ?? {};
  const r = await client.query("select clara.resolve_document_client($1,$2) as r", [doc.firm_id, doc.document_id]);
  const resolved = r.rows[0]?.r ?? { status: "unresolved" };
  return {
    versionN: Number(row.version_n ?? 0),
    engineId: row.engine_id == null ? null : String(row.engine_id),
    taskStatus: String(row.status ?? ""),
    clientStatus: String(resolved.status ?? "unresolved"),
    clientId: resolved.client_id ?? null,
  };
}

/** The PINNED OCR extraction the text channel reads and pins itself to: the newest DONE
 *  `engine_kind='ocr'` extraction of this document, by the live generation order
 *  (`version_n desc, id desc` — 0054:242-245's own distinct-on ordering, so the pin names the
 *  same generation every other reader would resolve). Its `page_count` rides along as the
 *  pair's honest page count: `clara_runtime` holds no SELECT on `clara.documents`, and the
 *  pages the OCR pass actually read is a measured number rather than a guessed one. Null when
 *  there is no done OCR extraction. */
async function readPinnedOcrExtraction(client, doc) {
  const r = await client.query(
    "select id, page_count from clara.document_extractions"
    + " where document_id=$1 and firm_id=$2 and engine_kind='ocr' and status='done'"
    + " order by version_n desc, id desc limit 1",
    [doc.document_id, doc.firm_id],
  );
  const row = r.rows[0];
  if (!row) return null;
  return { id: String(row.id), pageCount: Number.isInteger(row.page_count) ? row.page_count : null };
}

/** THE ONE CITATION NUMBERING (0095 §1, review M5). `clara.witness_citation_regions` publishes
 *  the writer resolver's OWN ordinal; `clara.get_document_extract`'s `idx` is a DIFFERENT
 *  ordinal and must never be used here — it is dense across every chosen extraction (0054:32-42),
 *  so a prompt built from it would resolve a citation to the wrong region the moment the
 *  document carries a second done extraction, which is precisely the state a witness document
 *  is in. Rows come back in the function's own `order by idx` and are NOT re-sorted here. */
async function readCitationRegions(client, ocrExtractionId) {
  const r = await client.query(
    "select idx, page, text_content from clara.witness_citation_regions($1)", [ocrExtractionId]);
  return r.rows.map((row) => ({
    idx: Number(row.idx),
    page: row.page == null ? null : Number(row.page),
    text_content: String(row.text_content ?? ""),
  }));
}

/**
 * ONE metering row per model call — including a call that FAILED or was REFUSED (design §3.6,
 * law 76: this records spend, it never gates it). Best-effort by construction: a metering write
 * must never be the thing that loses a read the firm already paid for, so a failure here is
 * swallowed. `engine_id` is the TASK's own stamp, never a literal from this file.
 */
async function recordUsage(withRuntime, { doc, taskId, channel, engineId, promptHash, usage, outcome }) {
  if (!engineId) return null;
  try {
    return await withRuntime(async (client) => {
      const r = await client.query(
        "select clara.record_llm_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as id",
        [
          doc.firm_id, doc.document_id, taskId, channel, engineId, promptHash ?? null,
          Number.isInteger(usage?.input_tokens) ? usage.input_tokens : null,
          Number.isInteger(usage?.output_tokens) ? usage.output_tokens : null,
          Number.isInteger(usage?.duration_ms) ? usage.duration_ms : null,
          outcome,
        ],
      );
      return r.rows[0]?.id ?? null;
    });
  } catch {
    return null;
  }
}

/**
 * THE PROVENANCE STAMP MUST NAME THE MODEL THAT IS ABOUT TO BE CALLED.
 *
 * `clara.persist_witness_facts` reads `engine_id` OFF THE TASK ROW (0095 §2) and stamps it on
 * BOTH extraction rows — so the ROUTER's literal, not anything this image knows, is the pair's
 * provenance. If the two ever disagree, every pair carries a receipt naming a model that never
 * saw the document: the shape the statement lane's MAJOR-2 finding was minted about, and what
 * PRD invariant 2(b) forbids inventing. They are compared BEFORE any dispatch, and a mismatch
 * WAITS rather than egressing — a DEPLOYMENT fact of the same family as the surface guard, where
 * the right image or CLARA_WITNESS_MODEL_ID makes the SAME task succeed unchanged. The DB's
 * per-lane attempt cap bounds the wait, as it does every other retry here.
 */
function assertEngineStamp(services, ctx, taskId) {
  const expected = services?.engineSnapshot?.engineId;
  if (!expected) {
    // Read POSITIVELY: an ABSENT snapshot is a wiring fault, never a pass. Skipping the check
    // when the thing that answers it is missing is precisely the fail-open-by-omission shape.
    throw witnessWait(`witness services carry no engine snapshot; refusing to egress without a provenance stamp to check (task ${taskId})`);
  }
  if (ctx.engineId !== expected) {
    throw witnessWait(
      `witness task ${taskId} is stamped engine_id '${ctx.engineId}' but this image calls '${expected}'`
      + " — refusing to egress under a provenance receipt naming a model it did not call",
    );
  }
}

/** Shared per-channel preamble over an ALREADY-READ context: engine-stamp agreement, surface,
 *  consent dispatch. The context is read by the caller and not here, so a refusal raised inside
 *  this function still leaves the caller holding the task's engine stamp — otherwise the
 *  metering row for that refusal could not name an engine, and the refusal receipt this lane
 *  depends on (there is no fail_witness_facts) would be the weaker for it. */
async function authorizeChannel(services, withRuntime, taskId, doc, ctx) {
  assertEngineStamp(services, ctx, taskId);
  if (ctx.clientStatus === "ambiguous") {
    // More than one live filing: no single client could have authorized this read, and the
    // enqueue gate mints exactly this verdict for the same shape (0090 §7e).
    throw witnessRefusal("witness_multi_client", `document ${doc.document_id} resolves more than one active filing client`);
  }
  if (ctx.clientStatus !== "unique" || !ctx.clientId) {
    // ZERO active filings for a task enqueued with exactly one. A filing correction in flight is
    // the realistic cause and it may well land, so this WAITS rather than settling a verdict
    // that would misdescribe it.
    throw witnessWait(`witness task ${taskId} resolves no active filing client`);
  }
  const surface = await withRuntime((client) => hasWitnessSurface(client));
  if (!surface) {
    throw witnessWait("the witness egress/persist surface is absent; refusing to call the model unauthorized");
  }
  const prepared = await withRuntime((client) => prepareWitnessDispatch(client, {
    firmId: doc.firm_id, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  const authorizationId = prepared?.authorization_id ?? null;
  if (prepared?.verdict !== "granted" || !authorizationId) {
    // `unknown` covers every non-granted state without distinction and this lane must not try to
    // tell them apart — there is nothing in the payload that would let it, and guessing would
    // leak the consent state into a diagnostic.
    throw witnessRefusal("witness_consent_inactive", "no live typed consent + activation for witness_extraction");
  }
  const consumed = await withRuntime((client) => consumeWitnessDispatch(client, {
    firmId: doc.firm_id, authorizationId, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  if (consumed?.verdict !== "granted") {
    throw witnessRefusal("witness_consent_inactive", "the dispatch authorization was not consumable at dispatch time");
  }
}

/** Wrap one channel: read the context, authorize, call, meter — a row on EVERY outcome but a
 *  WAIT. The context read is FIRST and outside the try so its own failure is not metered as a
 *  model call, and so the engine stamp is in hand for every later outcome. */
async function withMeteredChannel(services, withRuntime, taskId, doc, channel, promptHash, run) {
  const ctx = await withRuntime((client) => readWitnessContext(client, taskId, doc));
  const startedAt = Date.now();
  try {
    await authorizeChannel(services, withRuntime, taskId, doc, ctx);
    const out = await run(ctx);
    const usage = { ...(out.usage ?? {}), duration_ms: Date.now() - startedAt };
    await recordUsage(withRuntime, { doc, taskId, channel, engineId: ctx.engineId, promptHash, usage, outcome: "success" });
    return { ...out, usage, engineId: ctx.engineId };
  } catch (err) {
    // A WAIT is not a call: nothing was dispatched and nothing was spent, so metering it would
    // put a phantom model call in the firm's spend trail. Everything else DID reach the point
    // where a call was authorized or attempted, and is metered.
    if (err?.claraRetry === true) throw err;
    const outcome = err?.witnessRefusal === true
      ? "refused"
      : (witnessFailureCode(err) === "timeout" ? "timeout" : "error");
    // `engineId` is the TASK's own stamp; `recordUsage` writes nothing when it is null rather
    // than inventing one — a metering row is a claim about which engine was involved.
    await recordUsage(withRuntime, {
      doc, taskId, channel, engineId: ctx.engineId, promptHash,
      usage: { duration_ms: Date.now() - startedAt }, outcome,
    });
    throw err;
  }
}

/**
 * THE TEXT CHANNEL. Reads the pinned OCR extraction and its published citation numbering, sends
 * the numbered regions, and returns the writer's `p_text` call blob plus the pair's page count.
 * @returns {Promise<{input_pin: string, prompt_hash: string, envelope: object, citations: object[], usage: object, pages_used: number|null}>}
 */
export async function runWitnessTextRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("text");
  const pinned = await withRuntime((client) => readPinnedOcrExtraction(client, doc));
  if (!pinned) {
    // NO OCR extraction at all — not an unreadable document, an ABSENT SUBSTRATE (the intake
    // pass has not landed, or its extraction was superseded). It waits; refusing here would
    // blame the page for the pipeline.
    throw witnessWait(`witness task ${taskId} has no done OCR extraction to read`);
  }
  const regions = await withRuntime((client) => readCitationRegions(client, pinned.id));
  if (regions.length === 0) {
    throw witnessWait(`witness task ${taskId}'s pinned OCR extraction carries no regions`);
  }
  const built = buildWitnessTextPrompt({ regions });
  const out = await withMeteredChannel(services, withRuntime, taskId, doc, "text", promptHash, async () =>
    services.callWitnessModel({
      channel: "text",
      system: WITNESS_TEXT_SYSTEM_PROMPT,
      prompt: built.prompt,
      schema: witnessTextSchema,
    }));
  return {
    input_pin: pinned.id,
    prompt_hash: promptHash,
    envelope: toWriterEnvelope("text", out.object),
    citations: toWriterCitations(out.object),
    usage: out.usage,
    pages_used: pinned.pageCount,
  };
}

/**
 * THE VISION CHANNEL. Downloads the canonical bytes (hash-verified), sends the ORIGINAL file,
 * and returns the writer's `p_vision` call blob — which carries NO citations, because this
 * channel never sees regions (design §3.1).
 * @returns {Promise<{input_pin: string, prompt_hash: string, envelope: object, usage: object}>}
 */
export async function runWitnessVisionRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("vision");
  const tempPath = services.taskTempPath(taskId);
  try {
    // Storage is not egress, and downloading BEFORE `prepare` means a storage fault never burns
    // an authorization. `downloadCanonical` re-verifies the sha against the document row, so the
    // bytes that reach the model are provably the filed bytes the vision pin names.
    await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
    const out = await withMeteredChannel(services, withRuntime, taskId, doc, "vision", promptHash, async () =>
      services.callWitnessModel({
        channel: "vision",
        system: WITNESS_VISION_SYSTEM_PROMPT,
        prompt: buildWitnessVisionPrompt(),
        schema: witnessVisionSchema,
        file: { path: tempPath, mime: doc.mime_type },
      }));
    return {
      input_pin: String(doc.sha256),
      prompt_hash: promptHash,
      envelope: toWriterEnvelope("vision", out.object),
      usage: out.usage,
    };
  } finally {
    await services.removeTempFile(tempPath).catch(() => {});
  }
}

/**
 * THE ONE PERSIST. `clara.persist_witness_facts` inserts BOTH extraction rows, writes the text
 * row's server-verified fact regions, records any inline usage, and SETTLES the task done — all
 * in one transaction. This step never settles anything itself: the writer owns the transition,
 * so a replay of this step returns the writer's own stored receipt (`replayed: true`) instead of
 * a second pair.
 */
export async function persistWitnessPair(services, withRuntime, taskId, textRead, visionRead) {
  // The two call blobs are ASSEMBLED HERE by picking exactly the keys 0095's header locks —
  // never by handing the writer whatever a step happened to return. A step result also carries
  // `pages_used`, which is the writer's own fourth ARGUMENT and not part of either blob; letting
  // it ride inside the jsonb would put a key in the call the contract does not name.
  const textCall = {
    input_pin: textRead.input_pin,
    prompt_hash: textRead.prompt_hash,
    envelope: textRead.envelope,
    citations: textRead.citations ?? [],
    usage: textRead.usage ?? {},
  };
  const visionCall = {
    input_pin: visionRead.input_pin,
    prompt_hash: visionRead.prompt_hash,
    envelope: visionRead.envelope,
    usage: visionRead.usage ?? {},
  };
  const pagesUsed = Number.isInteger(textRead.pages_used) && textRead.pages_used >= 0 ? textRead.pages_used : null;
  const out = await callWriter(
    withRuntime,
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as receipt",
    [taskId, JSON.stringify(textCall), JSON.stringify(visionCall), pagesUsed],
  );
  return { taskId, status: "done", receipt: out };
}

/** Terminal-vs-retryable, applied at the step boundary. A refusal is already a FatalError and
 *  passes through unchanged; a transient fault rethrows so the step retries; anything else is
 *  wrapped FatalError so a permanently-broken read ends the run visibly instead of burning the
 *  attempt cap in silence. */
export function classifyWitnessFailure(err) {
  if (err?.witnessRefusal === true || err instanceof FatalError) return { retry: false, code: String(err?.code ?? "internal") };
  const code = witnessFailureCode(err);
  if (err?.claraRetry === true || RETRYABLE.has(code)) return { retry: true, code };
  return { retry: false, code };
}

/** Pull the flat document metadata off a claim receipt (present only on the 'running'/'replayed'
 *  branch, PIN-AB-6); null when the claim carried none. Duplicated by design — see the header. */
export function docFromReceipt(r) {
  if (!r || r.storage_path == null || r.sha256 == null) return null;
  return {
    document_id: String(r.document_id ?? ""),
    firm_id: String(r.firm_id ?? ""),
    lane: String(r.lane ?? ""),
    storage_path: String(r.storage_path),
    sha256: String(r.sha256),
    mime_type: String(r.mime_type ?? ""),
    byte_size: Number(r.byte_size ?? 0),
  };
}

/**
 * Interpret a claim receipt (pure). Only a 'running' claim — including the same-run 'replayed'
 * branch, where the DB neither increments nor re-checks the attempt cap on a reattach — is
 * claimed and proceeds. 'held_egress' parks (the kill switch); a terminal 'failed' outcome (the
 * DB's attempt cap ALREADY failed + refunded + evented the task) is NOT claimed: the workflow
 * simply ends with that status, never re-failing or error-looping.
 */
export function interpretClaimReceipt(r) {
  const status = String(r?.status ?? "held_egress");
  const claimed = status === "running";
  return { claimed, status, doc: claimed ? docFromReceipt(r) : null };
}

/**
 * A lane this workflow does not own must never be driven here: silently running a witness pass
 * over, say, an ocr task would spend real model egress on the wrong lane under an authorization
 * minted for a different purpose.
 */
export function ownsWitnessLane(doc) {
  return !!doc && doc.lane === "llm_witness" && !!doc.storage_path && !!doc.sha256;
}
