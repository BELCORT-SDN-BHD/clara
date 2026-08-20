// @frozen
//
// Behavioral closure for witnessFacts_v2 (F-A2 openers ①②). BYTE-FOR-BYTE the witnessFacts_v1
// behaviour apart from three things, and nothing else in this file moved:
//
//   1. The PROMPT closure it imports is witnessFacts.v2.prompts.mjs (the type_code
//      classification rule + the `invoice.sst_registration` question).
//   2. The wire->writer normalization moved to witnessFacts.v2.envelope.mjs, and
//      `toWriterEnvelope` now takes a third argument: THE COVERAGE RECEIPT.
//   3. Each channel read ASSEMBLES that receipt from facts it already had and v1 discarded —
//      the text channel's `{shown, truncated, pages}` (computed by the prompt builder and thrown
//      away at witnessFacts.v1.behavior.mjs:296) and the input pin each channel already names.
//
// THE DISPATCH FILE IS REUSED, NOT COPIED. `./witnessFacts.v1.dispatch.mjs` is imported unchanged:
// nothing in this window touches authorization, the pinned reads, the reading-order citation
// reader, metering or the terminal settle. This is the SAME-FAMILY, CROSS-VERSION reuse
// statementFacts.v2.impl.ts makes of statementFacts.v1.impl.ts (and chatTurn.v11.impl.ts of
// chatTurn.v10.impl.ts): freeze-lint's import-closure discovery hash-locks whatever a frozen file
// imports regardless of the version number in its filename, so the v1 dispatch is a member of
// BOTH closures and cannot drift under either. Copying it would have created a second body to
// keep in step by review rather than by construction. (The cross-FAMILY case is the opposite call
// — statementFacts.v2.dispatch.mjs duplicates rather than imports witnessFacts.v1's, because
// coupling two workflow FAMILIES through one frozen file is the chatTurn_v8 law's own prohibition.)
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
// model already paid for. The envelopes here are therefore small JSON receipts — thirteen
// answers, at most eighteen citations, one coverage object. Bytes, credentials, the raw region
// text and the provider payload never cross a step boundary (the AB-16 / PIN-AB-6 law every
// sibling obeys).
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
// A TERMINAL OUTCOME SETTLES THE TASK (review B1). A refusal or a permanent fault calls
// `clara.fail_witness_facts(task, code)` — the sibling of `fail_statement_facts` (0038:2046) and
// `fail_invoice_facts` (0009:2152) — so the task ends DEAD rather than holding one of the lane's
// two concurrency slots until a sweep re-drives it.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY (the chatTurn_v8 law): `interpretClaimReceipt` /
// `docFromReceipt` are DUPLICATED here rather than imported from the frozen invoiceFacts or
// statementFacts closure. Kept in step by review, never by import.

import { FatalError } from "workflow";
import {
  buildWitnessTextPrompt,
  buildWitnessVisionPrompt,
  witnessPromptHash,
  witnessTextSchema,
  witnessVisionSchema,
  WITNESS_TEXT_SYSTEM_PROMPT,
  WITNESS_VISION_SYSTEM_PROMPT,
} from "./witnessFacts.v2.prompts.mjs";
import {
  toWriterCitations,
  toWriterEnvelope,
  witnessTextCoverage,
  witnessVisionCoverage,
} from "./witnessFacts.v2.envelope.mjs";
import {
  callWriter,
  consumeWitnessDispatch,
  hasWitnessSurface,
  prepareWitnessDispatch,
  readCitationRegions,
  readPinnedOcrExtraction,
  readTaskStatus,
  readWitnessContext,
  recordUsage,
  settleWitnessFailure,
  waitBudgetExhausted,
  WITNESS_EVENT_TYPE,
  WITNESS_MAX_VISION_BYTES,
  WITNESS_PURPOSE,
  WITNESS_WAIT_BUDGET_MS,
  WITNESS_WAIT_EXHAUSTED,
} from "./witnessFacts.v1.dispatch.mjs";

export {
  WITNESS_EVENT_TYPE, WITNESS_MAX_VISION_BYTES, WITNESS_PURPOSE,
  WITNESS_WAIT_BUDGET_MS, WITNESS_WAIT_EXHAUSTED,
};

/** Copied VERBATIM from invoiceFacts.v1.behavior.mjs / statementFacts.v1.behavior.mjs. One
 *  ratified set, not reinvented: `internal` is deliberately NOT retryable — fail closed on the
 *  unknown. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The two named witness refusal codes the DB admits (0090 §8's widened CHECKs). */
export const WITNESS_REFUSAL_CODES = Object.freeze(["witness_consent_inactive", "witness_multi_client"]);

/** A refusal: terminal by nature (consent is a decision, not a fault), so it must never be
 *  retried into a second egress attempt. FatalError is the engine's own non-retryable marker. */
function witnessRefusal(code, message) {
  return Object.assign(new FatalError(`witness read refused (${code}): ${message}`), { code, witnessRefusal: true });
}

/**
 * A WAIT: neither a vendor fault nor a fact about this document — a deployment window, a filing
 * correction in flight, an OCR substrate that has not landed, a task the DB has parked. Rethrown
 * so the step retries. A WAIT never meters (nothing was dispatched, nothing was spent) and never
 * settles — UNTIL its budget is spent.
 *
 * IT IS NOT THE ATTEMPT CAP THAT BOUNDS THIS, and the first cut said it was. The cap lives in
 * `claim_document_processing_task`, which only ever re-admits the SAME workflow_run_id; every
 * other run meets `if t.status<>'queued' then raise CLR16` (0090 §5). Once a task is `running` it
 * can never be re-claimed, so `attempt_count` never moves again and the cap never fires. The real
 * bound is `WITNESS_WAIT_BUDGET_MS` measured from the task's own `started_at` — see that constant
 * for the rolling-deploy scenario it closes and why a memoized counter could not.
 */
function witnessWait(message) {
  return Object.assign(new Error(message), { code: "internal", claraRetry: true });
}

/** A WAIT whose budget is spent: terminal, settled, and it says what it had been waiting for. */
function witnessWaitExhausted(cause, waitedSeconds) {
  return Object.assign(
    new FatalError(
      `witness task waited ${Math.round(waitedSeconds)}s past its budget without progressing`
      + ` — last reason: ${cause instanceof Error ? cause.message : String(cause)}`,
    ),
    { code: WITNESS_WAIT_EXHAUSTED, witnessRefusal: true, cause },
  );
}

function witnessFailureCode(err) {
  const code = String(err?.code || "internal");
  return ["engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
    "bad_type", "limit", "internal"].includes(code) ? code : "internal";
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
 * the right image or CLARA_WITNESS_MODEL_ID makes the SAME task succeed unchanged.
 *
 * F-A2: THIS IS THE GUARD THAT MAKES THE DEPLOY ORDER SAFE IN BOTH DIRECTIONS. witnessFacts.v2's
 * services bundle stamps `:v2`, and the DB router's literal moves to `:v2` in the same window's
 * migration. Whichever half lands first, the other half's tasks WAIT here rather than egressing
 * under a receipt naming a prompt closure that did not read the document.
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

/** Shared per-channel preamble over an ALREADY-READ context: engine-stamp agreement, a FRESH
 *  task-status read, surface, consent dispatch. The context is read by the caller and not here,
 *  so a refusal raised inside this function still leaves the caller holding the task's engine
 *  stamp — otherwise the metering row for that refusal could not name an engine. */
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
  // M5: the LAST-MOMENT status read. The two channels are separate steps minutes apart, and the
  // kill switch can park a claimed task between them (`claim_document_processing_task`'s hold
  // branch sets held_egress). Egressing on a task the DB has since parked would spend a client's
  // bytes under a switch that is off — so the fact is re-read, never carried.
  const status = await withRuntime((client) => readTaskStatus(client, taskId));
  if (status !== "running") {
    throw witnessWait(`witness task ${taskId} is '${status ?? "gone"}', not running — refusing to dispatch`);
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
    if (err?.claraRetry === true) throw err;
    const outcome = err?.witnessRefusal === true
      ? "refused"
      : (witnessFailureCode(err) === "timeout" ? "timeout" : "error");
    await recordUsage(withRuntime, {
      doc, taskId, channel, engineId: ctx.engineId, promptHash,
      usage: { duration_ms: Date.now() - startedAt }, outcome,
    });
    throw err;
  }
}

/**
 * TERMINAL OUTCOMES SETTLE THE TASK (review B1); a WAIT settles only once its budget is spent (D1).
 *
 * Wraps a whole channel read, INCLUDING the pre-egress refusals that happen before any metering
 * (an unreadable media type, an oversized payload) — those are facts about the document, so they
 * must end the task just as a consent refusal does. It also wraps the PERSIST (D2): a terminal
 * raise out of the writer is just as capable of wedging a slot as a refused dispatch.
 *
 * `classifyWitnessFailure` owns the terminal/retryable split; the settle is best-effort and never
 * masks the error the caller is about to see.
 */
async function withTerminalSettle(services, withRuntime, taskId, run) {
  const log = services?.log ?? console.error;
  try {
    return await run();
  } catch (err) {
    const verdict = classifyWitnessFailure(err);
    if (verdict.retry) {
      // A WAIT is still a wait — unless it has been one for too long. The budget is read from the
      // DB (its clock, its `started_at`) rather than counted in this process, because nothing a
      // failing step computes survives its own retry.
      let budget = { spent: false, waitedSeconds: 0 };
      try {
        budget = await withRuntime((client) => waitBudgetExhausted(client, taskId));
      } catch {
        // Fail toward CONTINUING to wait: a failed budget read must not kill a live task.
        budget = { spent: false, waitedSeconds: 0 };
      }
      if (!budget.spent) throw err;
      const exhausted = witnessWaitExhausted(err, budget.waitedSeconds);
      log(`[witness] task ${taskId} settling '${WITNESS_WAIT_EXHAUSTED}': ${exhausted.message}`);
      await settleWitnessFailure(withRuntime, taskId, WITNESS_WAIT_EXHAUSTED, log);
      throw exhausted;
    }
    await settleWitnessFailure(withRuntime, taskId, verdict.code, log);
    throw err;
  }
}

/**
 * THE TEXT CHANNEL. Reads the pinned OCR extraction and its published citation numbering, sends
 * the numbered regions, and returns the writer's `p_text` call blob plus the pair's page count.
 *
 * F-A2 ①: THE COVERAGE RECEIPT IS ASSEMBLED FROM THE READ THAT ACTUALLY HAPPENED — the pinned
 * extraction id this step resolved (never re-derived later, when a newer OCR generation could win
 * the `version_n desc, id desc` race), the region count it was handed, and the `{shown,
 * truncated, pages}` the builder measured. v1 computed the last three and dropped them.
 */
export async function runWitnessTextRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("text");
  return withTerminalSettle(services, withRuntime, taskId, async () => {
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
    const coverage = witnessTextCoverage({
      ocrExtractionId: pinned.id,
      regionsTotal: regions.length,
      shown: built.shown,
      truncated: built.truncated,
      pages: built.pages,
    });
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
      envelope: toWriterEnvelope("text", out.object, coverage),
      citations: toWriterCitations(out.object),
      usage: out.usage,
      pages_used: pinned.pageCount,
    };
  });
}

/**
 * THE VISION CHANNEL. Downloads the canonical bytes (hash-verified), sends the ORIGINAL file,
 * and returns the writer's `p_vision` call blob — which carries NO citations, because this
 * channel never sees regions (design §3.1).
 *
 * F-A2 ①: its coverage receipt names THE SAME STRING as the input pin, computed once below —
 * the writer refuses any persist whose vision pin is not `documents.sha256`, so the receipt makes
 * that existing wall readable rather than asserting a second, independently-derivable fact.
 */
export async function runWitnessVisionRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("vision");
  return withTerminalSettle(services, withRuntime, taskId, async () => {
    // M4/N5: BOTH pre-egress refusals happen HERE — before the temp file, before the context
    // read, and above all before `prepare` mints an authorization. A document whose bytes can
    // never leave must not consume a single-use authorization on the way to finding that out.
    // Both are facts about the document, so both are terminal and both settle the task.
    if (!services.witnessMediaType || !services.witnessMediaType(doc.mime_type)) {
      throw Object.assign(
        new Error(`witness vision channel cannot read media type '${doc.mime_type}'`),
        { code: "bad_type" },
      );
    }
    if (Number(doc.byte_size) > WITNESS_MAX_VISION_BYTES) {
      throw Object.assign(
        new Error(`witness vision payload is ${doc.byte_size} bytes, over the ${WITNESS_MAX_VISION_BYTES} pre-egress cap`),
        { code: "limit" },
      );
    }
    const inputPin = String(doc.sha256);
    const tempPath = services.taskTempPath(taskId);
    try {
      // Storage is not egress, and downloading BEFORE `prepare` means a storage fault never
      // burns an authorization. `downloadCanonical` re-verifies the sha against the document
      // row, so the bytes that reach the model are provably the filed bytes the pin names.
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
        input_pin: inputPin,
        prompt_hash: promptHash,
        envelope: toWriterEnvelope("vision", out.object, witnessVisionCoverage({ inputSha256: inputPin })),
        usage: out.usage,
      };
    } finally {
      await services.removeTempFile(tempPath).catch(() => {});
    }
  });
}

/**
 * THE ONE PERSIST. `clara.persist_witness_facts` inserts BOTH extraction rows, writes the text
 * row's server-verified fact regions and SETTLES the task done — all in one transaction. This
 * step never settles anything itself: the writer owns the transition, so a replay returns the
 * writer's own stored receipt (`replayed: true`) instead of a second pair.
 */
export async function persistWitnessPair(services, withRuntime, taskId, textRead, visionRead) {
  // The two call blobs are ASSEMBLED HERE by picking exactly the keys 0095's header locks —
  // never by handing the writer whatever a step happened to return.
  //
  // `usage` is DELIBERATELY NOT PASSED (review M2). The writer accepts an optional inline usage
  // blob and forwards it to `clara.record_llm_usage_event`, but this lane already records one row
  // per call AT CALL TIME — which is the only place that can meter a call that never reached a
  // persist. Passing it here too would write the successful pair's rows TWICE and quietly double
  // every token count in the firm's spend trail. One record, at the moment of spending.
  const textCall = {
    input_pin: textRead.input_pin,
    prompt_hash: textRead.prompt_hash,
    envelope: textRead.envelope,
    citations: textRead.citations ?? [],
  };
  const visionCall = {
    input_pin: visionRead.input_pin,
    prompt_hash: visionRead.prompt_hash,
    envelope: visionRead.envelope,
  };
  const pagesUsed = Number.isInteger(textRead.pages_used) && textRead.pages_used >= 0 ? textRead.pages_used : null;
  // D2: the writer's own structural refusals (equal prompt hashes, a malformed vocabulary, a task
  // in the wrong state) raise CLR10/CLR16 — terminal by nature, and until now they left the task
  // `running` with nothing to re-claim it. A raise out of the persist wedges a concurrency slot
  // exactly as a refused dispatch does, so it settles through the same door.
  const out = await withTerminalSettle(services, withRuntime, taskId, () => callWriter(
    withRuntime,
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as receipt",
    [taskId, JSON.stringify(textCall), JSON.stringify(visionCall), pagesUsed],
  ));
  return { taskId, status: "done", receipt: out };
}

/** Terminal-vs-retryable. A refusal is already a FatalError and passes through unchanged; a
 *  transient fault rethrows so the step retries; anything else is terminal. */
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
