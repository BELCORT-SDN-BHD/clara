// @frozen
//
// Behavioral closure for statementFacts_v2's `statement_facts` WITNESS PAIR (F-A1 PR-4 —
// `docs/plan/active/f-a1-witness-pair-design.md` §3.7, §3.1, §3.4, §3.5). ONE document, TWO
// independent reads through TWO CHANNELS of the SAME provider, ONE persist:
//
//   * TEXT channel   — reads the pinned OCR extraction as NUMBERED REGIONS (the same substrate
//                      the invoice witness reads, and the same one statementFacts.v1's reader-1
//                      layout parse consumed).
//   * VISION channel — reads the ORIGINAL filed bytes. No regions, no citations.
//
// THE `statement_facts` LANE NAME DOES NOT CHANGE. This is not a new lane: `claim_document_
// processing_task`'s lane list and the global kill switch already bind on `statement_facts`
// (statementFacts.v1, Wave C-b), and `_invoice_fact_state`'s witness-regime resolver keys on
// `lane='llm_witness'` — a document sitting in `statement_facts` was NEVER at risk of being
// mis-resolved as an invoice, and moving it to `llm_witness` would put it at exactly that risk
// (witnessFacts.v1's `ownsWitnessLane` claims every `llm_witness` task by lane alone). So the
// witness pair is reached by REPOINTING the class (registry.ts: `statementFacts_v1` ->
// `statementFacts_v2`), not by relabelling the task.
//
// EACH MODEL CALL IS ITS OWN MEMOIZED STEP (witnessFacts.v1's own §3.1 reasoning, reapplied
// here): a step's return value is memoized by the durable engine, so a persist retry REPLAYS
// the stored text/vision envelopes instead of re-calling a model already paid for. The download
// lives INSIDE the vision step for the identical reason witnessFacts.v1 states it does — a
// download step could only hand the next step a temp-file PATH, and a path does not survive a
// cross-process replay; downloading inside the step that consumes the bytes makes it
// self-sufficient on every retry, and storage is not egress.
//
// EGRESS, TWICE, ONE PURPOSE (design §3.7, reusing witnessFacts.v1's OQ-2 answer:
// `witness_extraction`). The TEXT channel RE-SENDS OCR-derived client content to the vendor —
// an egress event under law 58's plain reading — and the VISION channel sends the original
// bytes. `prepare`/`consume` wrap EACH channel's model call, `consume` in its OWN committed
// transaction immediately before the call, so a deactivation that committed since prepare
// refuses HERE and the bytes never leave.
//
// AUDIT-TRAIL HONESTY, inherited from both statementFacts.v1 and witnessFacts.v1 and never to
// be softened: the typed authorization covers THESE two witness reads and nothing earlier. The
// kind-blind intake OCR pass that produced the very regions the text channel reads egressed
// under the GLOBAL switch and the engagement-letter consent, before any typed gate could see
// the document's kind. Nothing here may assert otherwise.
//
// A TERMINAL OUTCOME SETTLES THE TASK THROUGH `clara.fail_statement_facts` — the SAME writer
// statementFacts.v1's OCR lane already used, unchanged and already deployed (0038:2046). No new
// fail-path verb exists for this lane and none is needed.
//
// TWO POSTURES THAT ARE THE DELIBERATE OPPOSITE OF witnessFacts.v1's, restated here at the call
// site (the full reasoning lives in statementFacts.v2.prompts.mjs's header — read it before
// touching either currency or description handling):
//   * currency absence reads MYR (never a refusal);
//   * descriptions are never load-bearing and never enter a refusal or an agreement test.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY (the chatTurn_v8 law). `ownsStatementWitnessLane`
// is written locally rather than imported from witnessFacts.v1's `ownsWitnessLane` — the two
// happen to check a similar shape, but they check a DIFFERENT lane string and must be free to
// diverge without either family's freeze-lint hash moving the other.
//
// WHAT THIS FILE DOES NOT DO: compute a corroboration VERDICT. `clara._persist_statement_core`
// is repo law's "ONE CORE" for statement validation (0038 §B.2's own header: "the ONLY
// statement-validation and statement-insert logic in the system... there is deliberately no
// second implementation to drift") — re-implementing `statement-corroboration.mjs`'s two-reader
// agreement/chain check here would be exactly a second implementation, and it would do so
// against a DB verb (`persist_statement_facts_v2`) whose own internal corroboration contract
// this PR cannot see (it has not been authored yet — see this file's own header note on deploy
// order). So `buildStatementWitnessPersistPayload` ships a MINIMAL, NON-AUTHORITATIVE
// corroboration receipt (method + the two channel names) and nothing more; hard constraint 2
// forbids this runtime from asserting a number or a verdict the DB has not itself verified.
// **DESIGN SILENCE, FLAGGED FOR THE OWNER/REVIEWER**: the exact shape `persist_statement_facts_v2`
// expects under `corroboration` is unknown to this PR. If the DB verb's author needs richer
// evidence than `{method, channels}`, that is a contract to settle when the verb is authored —
// this file's payload builder is the one place to widen it, and it should stay evidence, never
// authority, exactly like `agreed.corroboration` in statementFacts.v1's own OCR-lane payload.

import { FatalError } from "workflow";
import {
  STATEMENT_HEADER_FIELDS,
  STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT,
  STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
  buildStatementWitnessTextPrompt,
  buildStatementWitnessVisionPrompt,
  statementWitnessPromptHash,
  statementWitnessSchema,
  toWriterHeader,
  toWriterLines,
} from "./statementFacts.v2.prompts.mjs";
import {
  callWriter,
  consumeStatementWitnessDispatch,
  hasStatementWitnessSurface,
  prepareStatementWitnessDispatch,
  readPinnedStatementOcrExtraction,
  readStatementWitnessCitationRegions,
  readStatementWitnessContext,
  readStatementWitnessTaskStatus,
  recordStatementWitnessUsage,
  settleStatementWitnessFailure,
  STATEMENT_WITNESS_EVENT_TYPE,
  STATEMENT_WITNESS_MAX_VISION_BYTES,
  STATEMENT_WITNESS_PURPOSE,
} from "./statementFacts.v2.dispatch.mjs";

export { STATEMENT_WITNESS_EVENT_TYPE, STATEMENT_WITNESS_MAX_VISION_BYTES, STATEMENT_WITNESS_PURPOSE };

/** Copied VERBATIM from witnessFacts.v1.behavior.mjs / statementFacts.v1.behavior.mjs's own
 *  RETRYABLE — one ratified set, not reinvented. `internal` stays deliberately NOT retryable. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The full set `clara.fail_statement_facts` admits (0038:2063-2071) that this file may hand
 *  it. A code outside this set is clamped to `engine_error` by the writer itself, so this list
 *  is a documentation aid, not a second gate — but a mapping function that emits something
 *  outside it would silently lose the real diagnosis into that clamp. */
const FAILURE_CODES = new Set([
  "engine_error", "timeout", "engine_lost", "storage_error", "corrupt", "encrypted",
  "bad_type", "limit", "budget", "attempt_cap", "internal",
  "header_unreadable", "totals_unreadable", "readers_disagree", "chain_broken",
  "continuity_mismatch", "duplicate_period", "overlapping_period", "non_myr_statement",
  "account_unregistered", "account_inactive", "statement_multi_client", "period_invalid",
  "line_date_out_of_period", "consent_inactive",
]);

/** A refusal: terminal by nature, never retried into a second egress attempt. */
function statementWitnessRefusal(code, message) {
  return Object.assign(new FatalError(`statement witness read refused (${code}): ${message}`), { code, statementWitnessRefusal: true });
}

/** A WAIT: neither a vendor fault nor a fact about the document — a deployment window, a filing
 *  correction in flight, an OCR substrate not yet landed, a task the DB has parked. Rethrown so
 *  the step retries; the DB's per-document attempt cap bounds the total. Never settles, never
 *  meters. */
function statementWitnessWait(message) {
  return Object.assign(new Error(message), { code: "internal", claraRetry: true });
}

function statementWitnessFailureCode(err) {
  const code = String(err?.code || "internal");
  return FAILURE_CODES.has(code) ? code : "internal";
}

/**
 * THE PROVENANCE STAMP MUST NAME THE MODEL THAT IS ABOUT TO BE CALLED — the same MAJOR-2 lesson
 * statementFacts.v1.behavior.mjs's own header cites, applied pre-egress rather than only at
 * persist time: `persist_statement_facts_v2` will read `engine_id` OFF THE TASK ROW (matching
 * `persist_statement_facts`'s existing `t.engine_id` read, 0038:1956) and stamp both readers
 * with it, so the ROUTER's literal — not anything this file assumes — is the pair's provenance.
 * Compared BEFORE any dispatch; a mismatch WAITS rather than egressing (a deployment fact, not a
 * document fact — the right image or CLARA_STATEMENT_WITNESS_MODEL_ID makes the SAME task
 * succeed unchanged).
 */
function assertStatementEngineStamp(services, ctx, taskId) {
  const expected = services?.engineSnapshot?.engineId;
  if (!expected) {
    throw statementWitnessWait(`statement witness services carry no engine snapshot; refusing to egress without a provenance stamp to check (task ${taskId})`);
  }
  if (ctx.engineId !== expected) {
    throw statementWitnessWait(
      `statement witness task ${taskId} is stamped engine_id '${ctx.engineId}' but this image calls '${expected}'`
      + " — refusing to egress under a provenance receipt naming a model it did not call",
    );
  }
}

/** Shared per-channel preamble over an ALREADY-READ context: engine-stamp agreement, a FRESH
 *  task-status read, surface, consent dispatch. Mirrors witnessFacts.v1.behavior.mjs's
 *  `authorizeChannel` mechanically; the refusal codes are drawn from `clara.fail_statement_facts`'s
 *  EXISTING taxonomy (`statement_multi_client` / `consent_inactive`) rather than minted anew,
 *  since that taxonomy already names exactly these two verdicts for this lane. */
async function authorizeStatementChannel(services, withRuntime, taskId, doc, ctx) {
  assertStatementEngineStamp(services, ctx, taskId);
  if (ctx.clientStatus === "ambiguous") {
    throw statementWitnessRefusal("statement_multi_client", `document ${doc.document_id} resolves more than one active filing client`);
  }
  if (ctx.clientStatus !== "unique" || !ctx.clientId) {
    // A filing correction in flight is the realistic cause and it may well land — WAIT, never
    // settle a verdict that would misdescribe it (the statementFacts.v1 OCR-lane precedent).
    throw statementWitnessWait(`statement witness task ${taskId} resolves no active filing client`);
  }
  const surface = await withRuntime((client) => hasStatementWitnessSurface(client));
  if (!surface) {
    throw statementWitnessWait("the statement-witness egress/persist surface is absent; refusing to call the model unauthorized");
  }
  // The LAST-MOMENT status read (witnessFacts.v1's M5): the two channels are separate steps
  // minutes apart, and the kill switch can park a claimed task between them.
  const status = await withRuntime((client) => readStatementWitnessTaskStatus(client, taskId));
  if (status !== "running") {
    throw statementWitnessWait(`statement witness task ${taskId} is '${status ?? "gone"}', not running — refusing to dispatch`);
  }
  const prepared = await withRuntime((client) => prepareStatementWitnessDispatch(client, {
    firmId: doc.firm_id, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  const authorizationId = prepared?.authorization_id ?? null;
  if (prepared?.verdict !== "granted" || !authorizationId) {
    throw statementWitnessRefusal("consent_inactive", "no live typed consent + activation for witness_extraction");
  }
  const consumed = await withRuntime((client) => consumeStatementWitnessDispatch(client, {
    firmId: doc.firm_id, authorizationId, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  if (consumed?.verdict !== "granted") {
    throw statementWitnessRefusal("consent_inactive", "the dispatch authorization was not consumable at dispatch time");
  }
}

/** Wrap one channel: read the context, authorize, call, meter — a row on EVERY outcome but a
 *  WAIT. The context read is FIRST and outside the try so its own failure is not metered as a
 *  model call, and so the engine stamp is in hand for every later outcome. */
async function withMeteredStatementChannel(services, withRuntime, taskId, doc, channel, promptHash, run) {
  const ctx = await withRuntime((client) => readStatementWitnessContext(client, taskId, doc));
  const startedAt = Date.now();
  try {
    await authorizeStatementChannel(services, withRuntime, taskId, doc, ctx);
    const out = await run(ctx);
    const usage = { ...(out.usage ?? {}), duration_ms: Date.now() - startedAt };
    await recordStatementWitnessUsage(withRuntime, { doc, taskId, channel, engineId: ctx.engineId, promptHash, usage, outcome: "success" });
    return { ...out, usage, engineId: ctx.engineId };
  } catch (err) {
    if (err?.claraRetry === true) throw err;
    const outcome = err?.statementWitnessRefusal === true
      ? "refused"
      : (statementWitnessFailureCode(err) === "timeout" ? "timeout" : "error");
    await recordStatementWitnessUsage(withRuntime, {
      doc, taskId, channel, engineId: ctx.engineId, promptHash,
      usage: { duration_ms: Date.now() - startedAt }, outcome,
    });
    throw err;
  }
}

/** TERMINAL OUTCOMES SETTLE THE TASK through `clara.fail_statement_facts`; WAITs and transient
 *  faults do not. Wraps a whole channel read, INCLUDING the pre-egress refusals that happen
 *  before any metering (an unreadable media type, an oversized payload, an absent OCR
 *  substrate) — those are facts about the document/deployment and must be classified the same
 *  way a consent refusal is. */
async function withStatementTerminalSettle(services, withRuntime, taskId, run) {
  try {
    return await run();
  } catch (err) {
    if (err?.claraRetry === true) throw err;
    const code = statementWitnessFailureCode(err);
    if (!RETRYABLE.has(code) || err?.statementWitnessRefusal === true) {
      await settleStatementWitnessFailure(withRuntime, taskId, code, services?.log ?? console.error);
    }
    throw err;
  }
}

/**
 * THE TEXT CHANNEL. Reads the pinned OCR extraction and its published citation numbering (the
 * same substrate statementFacts.v1's reader-1 consumed), sends the numbered regions, and
 * returns the writer's reader-1 blob: `{engine_id, header, lines}` plus the pair's page count.
 */
export async function runStatementWitnessTextRead(services, withRuntime, taskId, doc) {
  const promptHash = statementWitnessPromptHash("text");
  return withStatementTerminalSettle(services, withRuntime, taskId, async () => {
    const pinned = await withRuntime((client) => readPinnedStatementOcrExtraction(client, doc));
    if (!pinned) {
      // NO OCR extraction at all — an absent SUBSTRATE, not an unreadable statement. WAIT;
      // settling a code here would blame the page for the pipeline (witnessFacts.v1's own
      // reasoning for the identical check).
      throw statementWitnessWait(`statement witness task ${taskId} has no done OCR extraction to read`);
    }
    const regions = await withRuntime((client) => readStatementWitnessCitationRegions(client, pinned.id));
    if (regions.length === 0) {
      throw statementWitnessWait(`statement witness task ${taskId}'s pinned OCR extraction carries no regions`);
    }
    const built = buildStatementWitnessTextPrompt({ regions });
    const out = await withMeteredStatementChannel(services, withRuntime, taskId, doc, "text", promptHash, async () =>
      services.callStatementWitnessModel({
        channel: "text",
        system: STATEMENT_WITNESS_TEXT_SYSTEM_PROMPT,
        prompt: built.prompt,
        schema: statementWitnessSchema,
      }));
    return {
      header: toWriterHeader(out.object?.header),
      lines: toWriterLines(out.object),
      usage: out.usage,
      engineId: out.engineId,
      pages_used: pinned.pageCount,
    };
  });
}

/**
 * THE VISION CHANNEL. Downloads the canonical bytes (hash-verified), sends the ORIGINAL file,
 * and returns the writer's reader-2 blob: `{engine_id, header, lines}` — no citations, because
 * this channel never sees regions.
 */
export async function runStatementWitnessVisionRead(services, withRuntime, taskId, doc) {
  const promptHash = statementWitnessPromptHash("vision");
  return withStatementTerminalSettle(services, withRuntime, taskId, async () => {
    // Both pre-egress refusals happen HERE — before the temp file, before the context read, and
    // above all before `prepare` mints an authorization (witnessFacts.v1's M4/N5 reasoning: a
    // document whose bytes can never leave must not consume a single-use authorization on the
    // way to finding that out).
    if (!services.statementWitnessMediaType || !services.statementWitnessMediaType(doc.mime_type)) {
      throw Object.assign(
        new Error(`statement witness vision channel cannot read media type '${doc.mime_type}'`),
        { code: "bad_type" },
      );
    }
    if (Number(doc.byte_size) > STATEMENT_WITNESS_MAX_VISION_BYTES) {
      throw Object.assign(
        new Error(`statement witness vision payload is ${doc.byte_size} bytes, over the ${STATEMENT_WITNESS_MAX_VISION_BYTES} pre-egress cap`),
        { code: "limit" },
      );
    }
    const tempPath = services.taskTempPath(taskId);
    try {
      await services.downloadCanonical(doc.storage_path, tempPath, doc.sha256);
      const out = await withMeteredStatementChannel(services, withRuntime, taskId, doc, "vision", promptHash, async () =>
        services.callStatementWitnessModel({
          channel: "vision",
          system: STATEMENT_WITNESS_VISION_SYSTEM_PROMPT,
          prompt: buildStatementWitnessVisionPrompt(),
          schema: statementWitnessSchema,
          file: { path: tempPath, mime: doc.mime_type },
        }));
      return {
        header: toWriterHeader(out.object?.header),
        lines: toWriterLines(out.object),
        usage: out.usage,
        engineId: out.engineId,
      };
    } finally {
      await services.removeTempFile(tempPath).catch(() => {});
    }
  });
}

/**
 * THE ONE PERSIST. Builds the exact payload STEP 5 of this PR's work order specifies and calls
 * `clara.persist_statement_facts_v2($1,$2::jsonb)`. `engine_id` for BOTH readers is the SAME
 * value — the task's OWN stamp, read off `document_processing_tasks.engine_id` by
 * `readStatementWitnessContext` during EITHER channel's metered call (both channels read the
 * identical row; the text read's context is used here since it always runs first in the
 * workflow body) — never a literal this file invents (the MAJOR-2 lesson, restated).
 *
 * `corroboration` is MINIMAL and NON-AUTHORITATIVE by design — see this file's header for why a
 * real two-reader agreement check does not belong here.
 */
export async function persistStatementWitnessPair(services, withRuntime, taskId, textRead, visionRead) {
  const engineId = textRead?.engineId ?? visionRead?.engineId ?? null;
  const payload = {
    pages_used: Number.isInteger(textRead?.pages_used) && textRead.pages_used >= 0 ? textRead.pages_used : 0,
    readers: {
      reader1: { engine_id: engineId, header: textRead.header, lines: textRead.lines },
      reader2: { engine_id: engineId, header: visionRead.header, lines: visionRead.lines },
    },
    corroboration: {
      method: "witness_pair",
      header_fields: [...STATEMENT_HEADER_FIELDS],
      reader1_channel: "text",
      reader2_channel: "vision",
    },
  };
  const out = await callWriter(
    withRuntime,
    "select clara.persist_statement_facts_v2($1,$2::jsonb) as receipt",
    [taskId, JSON.stringify(payload)],
  );
  return { taskId, status: "done", receipt: out };
}

/** Terminal-vs-retryable, mirroring witnessFacts.v1's `classifyWitnessFailure`. A refusal is
 *  already a FatalError and passes through unchanged. */
export function classifyStatementWitnessFailure(err) {
  if (err?.statementWitnessRefusal === true || err instanceof FatalError) {
    return { retry: false, code: String(err?.code ?? "internal") };
  }
  const code = statementWitnessFailureCode(err);
  if (err?.claraRetry === true || RETRYABLE.has(code)) return { retry: true, code };
  return { retry: false, code };
}

/**
 * A lane this witness pair does not own must never be driven here — silently running a witness
 * pass over a `statement_parse` (or any other) task would spend real model egress on the wrong
 * lane under an authorization minted for a different purpose.
 */
export function ownsStatementWitnessLane(doc) {
  return !!doc && doc.lane === "statement_facts" && !!doc.storage_path && !!doc.sha256;
}
