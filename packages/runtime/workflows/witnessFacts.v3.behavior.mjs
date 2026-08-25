// @frozen
//
// Behavioral closure for witnessFacts_v3 (the NEXT-ROUND QUEUE fold). BYTE-FOR-BYTE the
// witnessFacts_v2 behaviour apart from two things, and nothing else in this file moved:
//
//   1. The PROMPT closure it imports is witnessFacts.v3.prompts.mjs (the discount-no-net rule,
//      the dash-is-not-a-value rule, the currency-code carve-out, and the vision-only SST-shape
//      reinforcement — see that file's header for the full fold).
//   2. The wire->writer normalization moved to witnessFacts.v3.envelope.mjs, whose
//      `witnessTextCoverage` no longer accepts a `pages` argument (the fifth fix) — so
//      `runWitnessTextRead` below no longer passes `pages: built.pages` into it. `built.pages` is
//      still computed by the prompt builder (harmless) and simply goes unused here now.
//
// NO ENGINE-ID BUMP. Unlike v1->v2, this version adds no answer key and widens no wire schema —
// every belt/reference/citation field name is byte-identical to v2's roster, so
// `clara._witness_answers_ok` needs no change and there is no DB-first/runtime-first ordering
// obligation to state. `witnessFacts.v3.impl.ts` therefore reads infrastructure from the SAME
// injected global v2 uses (`__claraWitnessFactsServicesV2`) rather than minting its own — see that
// file's header for the full reasoning. The PROMPT HASH still moves (witnessFacts.v3.prompts.mjs's
// `witnessPromptHash` embeds "witnessFacts.v3"), which is what makes a v3-produced read
// distinguishable from a v2-produced one in `llm_usage_events.prompt_hash` — that is the receipt
// this version's identity travels on, not `engine_id`.
//
// THE DISPATCH FILE IS REUSED, NOT COPIED, exactly as v2 reused it from v1.
// `./witnessFacts.v1.dispatch.mjs` is imported unchanged: nothing in this fold touches
// authorization, the pinned reads, the reading-order citation reader, metering or the terminal
// settle. freeze-lint's import-closure discovery hash-locks whatever a frozen file imports
// regardless of the version number in its filename, so the v1 dispatch is a member of the v1, v2
// AND v3 closures simultaneously and cannot drift under any of them.
//
//   * TEXT channel   — the model reads the stored OCR text as NUMBERED REGIONS and must CITE
//                      the region it read each fact from. The numbering is the DB's own
//                      (`clara.witness_citation_regions`), never this file's.
//   * VISION channel — the model reads the ORIGINAL filed bytes. It sees no regions, cites
//                      nothing, and contributes the VALUE only (design §3.4).
//
// THE INDEPENDENCE AXIS IS THE CHANNEL, not the vendor (G1.1) — unchanged from v1/v2.
//
// EACH MODEL CALL IS ITS OWN MEMOIZED STEP (design §3.1) — unchanged from v1/v2.
//
// EGRESS, TWICE, ONE PURPOSE (design §3.5) — unchanged from v1/v2.
//
// AUDIT-TRAIL HONESTY, inherited unchanged.
//
// A TERMINAL OUTCOME SETTLES THE TASK (review B1) — unchanged.
//
// NO SHAPE COUPLING TO ANOTHER WORKFLOW FAMILY (the chatTurn_v8 law): `interpretClaimReceipt` /
// `docFromReceipt` are DUPLICATED here rather than imported from the frozen invoiceFacts or
// statementFacts closure, exactly as in v1/v2.

import { FatalError } from "workflow";
import {
  buildWitnessTextPrompt,
  buildWitnessVisionPrompt,
  witnessPromptHash,
  witnessTextSchema,
  witnessVisionSchema,
  WITNESS_TEXT_SYSTEM_PROMPT,
  WITNESS_VISION_SYSTEM_PROMPT,
} from "./witnessFacts.v3.prompts.mjs";
import {
  toWriterCitations,
  toWriterEnvelope,
  witnessTextCoverage,
  witnessVisionCoverage,
} from "./witnessFacts.v3.envelope.mjs";
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

/** Copied VERBATIM from witnessFacts.v2.behavior.mjs, itself copied from v1. One ratified set,
 *  not reinvented: `internal` is deliberately NOT retryable — fail closed on the unknown. */
const RETRYABLE = new Set(["engine_error", "timeout", "engine_lost", "storage_error"]);

/** The two named witness refusal codes the DB admits (0090 §8's widened CHECKs). BYTE-UNCHANGED. */
export const WITNESS_REFUSAL_CODES = Object.freeze(["witness_consent_inactive", "witness_multi_client"]);

/** A refusal: terminal by nature (consent is a decision, not a fault), so it must never be
 *  retried into a second egress attempt. FatalError is the engine's own non-retryable marker. */
function witnessRefusal(code, message) {
  return Object.assign(new FatalError(`witness read refused (${code}): ${message}`), { code, witnessRefusal: true });
}

/**
 * A WAIT: neither a vendor fault nor a fact about this document. Rethrown so the step retries.
 * BYTE-UNCHANGED FROM v2 — see witnessFacts.v2.behavior.mjs for the full rationale.
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
 * THE PROVENANCE STAMP MUST NAME THE MODEL THAT IS ABOUT TO BE CALLED. BYTE-UNCHANGED FROM v2 —
 * see that file for the full rationale. Since this version's engine snapshot is v2's own
 * (unbumped, this file's header), a v3 task's DB-stamped engine_id (still `:v2`, minted by the
 * SAME router literal v2 tasks get) matches this image's snapshot unconditionally — there is no
 * deploy-order WAIT window this version introduces.
 */
function assertEngineStamp(services, ctx, taskId) {
  const expected = services?.engineSnapshot?.engineId;
  if (!expected) {
    throw witnessWait(`witness services carry no engine snapshot; refusing to egress without a provenance stamp to check (task ${taskId})`);
  }
  if (ctx.engineId !== expected) {
    throw witnessWait(
      `witness task ${taskId} is stamped engine_id '${ctx.engineId}' but this image calls '${expected}'`
      + " — refusing to egress under a provenance receipt naming a model it did not call",
    );
  }
}

/** Shared per-channel preamble over an ALREADY-READ context. BYTE-UNCHANGED FROM v2. */
async function authorizeChannel(services, withRuntime, taskId, doc, ctx) {
  assertEngineStamp(services, ctx, taskId);
  if (ctx.clientStatus === "ambiguous") {
    throw witnessRefusal("witness_multi_client", `document ${doc.document_id} resolves more than one active filing client`);
  }
  if (ctx.clientStatus !== "unique" || !ctx.clientId) {
    throw witnessWait(`witness task ${taskId} resolves no active filing client`);
  }
  const surface = await withRuntime((client) => hasWitnessSurface(client));
  if (!surface) {
    throw witnessWait("the witness egress/persist surface is absent; refusing to call the model unauthorized");
  }
  const status = await withRuntime((client) => readTaskStatus(client, taskId));
  if (status !== "running") {
    throw witnessWait(`witness task ${taskId} is '${status ?? "gone"}', not running — refusing to dispatch`);
  }
  const prepared = await withRuntime((client) => prepareWitnessDispatch(client, {
    firmId: doc.firm_id, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  const authorizationId = prepared?.authorization_id ?? null;
  if (prepared?.verdict !== "granted" || !authorizationId) {
    throw witnessRefusal("witness_consent_inactive", "no live typed consent + activation for witness_extraction");
  }
  const consumed = await withRuntime((client) => consumeWitnessDispatch(client, {
    firmId: doc.firm_id, authorizationId, clientId: ctx.clientId, eventSeq: ctx.versionN, documentSha256: doc.sha256,
  }));
  if (consumed?.verdict !== "granted") {
    throw witnessRefusal("witness_consent_inactive", "the dispatch authorization was not consumable at dispatch time");
  }
}

/** Wrap one channel: read the context, authorize, call, meter. BYTE-UNCHANGED FROM v2. */
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
 * TERMINAL OUTCOMES SETTLE THE TASK (review B1); a WAIT settles only once its budget is spent
 * (D1). BYTE-UNCHANGED FROM v2.
 */
async function withTerminalSettle(services, withRuntime, taskId, run) {
  const log = services?.log ?? console.error;
  try {
    return await run();
  } catch (err) {
    const verdict = classifyWitnessFailure(err);
    if (verdict.retry) {
      let budget = { spent: false, waitedSeconds: 0 };
      try {
        budget = await withRuntime((client) => waitBudgetExhausted(client, taskId));
      } catch {
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
 * THE ONE LINE THAT MOVED FROM v2: `witnessTextCoverage` is no longer handed `pages` (the fifth
 * fix, witnessFacts.v3.envelope.mjs's header) — `built.pages` is still computed by the prompt
 * builder but goes unused here now.
 */
export async function runWitnessTextRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("text");
  return withTerminalSettle(services, withRuntime, taskId, async () => {
    const pinned = await withRuntime((client) => readPinnedOcrExtraction(client, doc));
    if (!pinned) {
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
 * THE VISION CHANNEL. BYTE-UNCHANGED FROM v2 — the vision receipt never carried `pages`.
 */
export async function runWitnessVisionRead(services, withRuntime, taskId, doc) {
  const promptHash = witnessPromptHash("vision");
  return withTerminalSettle(services, withRuntime, taskId, async () => {
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
 * THE ONE PERSIST. BYTE-UNCHANGED FROM v2.
 */
export async function persistWitnessPair(services, withRuntime, taskId, textRead, visionRead) {
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
  const out = await withTerminalSettle(services, withRuntime, taskId, () => callWriter(
    withRuntime,
    "select clara.persist_witness_facts($1,$2::jsonb,$3::jsonb,$4) as receipt",
    [taskId, JSON.stringify(textCall), JSON.stringify(visionCall), pagesUsed],
  ));
  return { taskId, status: "done", receipt: out };
}

/** Terminal-vs-retryable. BYTE-UNCHANGED FROM v2. */
export function classifyWitnessFailure(err) {
  if (err?.witnessRefusal === true || err instanceof FatalError) return { retry: false, code: String(err?.code ?? "internal") };
  const code = witnessFailureCode(err);
  if (err?.claraRetry === true || RETRYABLE.has(code)) return { retry: true, code };
  return { retry: false, code };
}

/** Pull the flat document metadata off a claim receipt. BYTE-UNCHANGED FROM v2. */
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

/** Interpret a claim receipt (pure). BYTE-UNCHANGED FROM v2. */
export function interpretClaimReceipt(r) {
  const status = String(r?.status ?? "held_egress");
  const claimed = status === "running";
  return { claimed, status, doc: claimed ? docFromReceipt(r) : null };
}

/** A lane this workflow does not own must never be driven here. BYTE-UNCHANGED FROM v2. */
export function ownsWitnessLane(doc) {
  return !!doc && doc.lane === "llm_witness" && !!doc.storage_path && !!doc.sha256;
}
