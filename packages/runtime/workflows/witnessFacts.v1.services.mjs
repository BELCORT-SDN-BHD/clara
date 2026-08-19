// The injected service bundle for witnessFacts_v1 (F-A1 design §3.1/§3.2).
// INFRASTRUCTURE — NOT frozen; assembled here and injected into
// globalThis.__claraWitnessFactsServices by the supervisor (plugins/startWorld.ts), exactly as
// makeInvoiceFactsServices() and makeStatementFactsServices() are for their lanes.
//
// WHERE THE FREEZE LINE SITS, and why it sits there. The frozen closure
// (witnessFacts.v1.ts / .impl.ts / .behavior.mjs / .prompts.mjs) owns ORCHESTRATION,
// AUTHORIZATION and THE PROMPTS: which steps run, that a typed dispatch wraps each model call,
// what an answer means, what a citation must satisfy. Out here lives everything that is
// VENDOR-SHAPED — model resolution, the timeout, the provider content parts, the file read —
// because those are exactly the parts that get tuned against real invoices, and the AB-16
// precedent is that vendor tuning must never be a workflow-version change. Prompts are the
// deliberate exception (design M8): they ARE frozen, because every belt in the DB predicate
// assumes their meanings.
//
// THE ENGINE SNAPSHOT LIVES HERE, NOT IN THE FROZEN CLOSURE — the AZURE_ENGINE_SNAPSHOT pattern
// (lib/egress.mjs:171-175, itself a non-frozen module). It is the value PR-3's router recut must
// stamp on the task it mints: `clara.persist_witness_facts` reads `engine_id` OFF THE TASK ROW
// (0095 §2), so the DB's stamp — not this constant — is what lands on both extraction rows, and
// this constant is what makes that stamp TRUE. If the two ever disagree the provenance is a
// false receipt; the battery pins the literal and the report names it as PR-3's contract.

import { readFile } from "node:fs/promises";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

import { makeDocumentServices } from "../lib/intake.mjs";

/**
 * The witness model.
 *
 * DEFAULT `gpt-5.6-terra`, and the choice is deliberate on three grounds rather than one:
 *   (1) it is the model this deployment ALREADY egresses to — chatTurn, autoDraft, the
 *       classifier and the wiki lane all default to it (lib/classify.mjs:40,
 *       lib/autodraft.mjs:37, lib/wiki-projection.mjs:133, autoDraft.v7.impl.ts:88), so the
 *       witness pair adds no second model identity to the vendor relationship the owner ruled
 *       on (OQ-1: OpenAI direct);
 *   (2) it is in the gpt-5.6 family, the newest generation @ai-sdk/openai@4.0.16 names, and the
 *       provider's default binding is the RESPONSES API — the only OpenAI surface that accepts
 *       PDF file parts at all (the provider's own conversion refuses any non-PDF, non-image file
 *       media type outright);
 *   (3) the sibling `gpt-5.6-sol` is this repo's CODEX lane model (AGENTS.md constraint 5) and
 *       taking it here would collide two unrelated model policies in one account.
 * Overridable per deployment with CLARA_WITNESS_MODEL_ID so a corpus-tuning round can move the
 * model without a workflow version — but NOT without moving the engine id, which is derived
 * from it below so provenance can never name a model nobody called.
 */
export const WITNESS_MODEL_ID = process.env.CLARA_WITNESS_MODEL_ID || "gpt-5.6-terra";

/** The witness contract version inside the engine id. It moves with the WORKFLOW class (a
 *  witnessFacts.v2 would stamp `:v2`), not with the model — the model is the middle segment. */
export const WITNESS_ENGINE_VERSION = "v1";

/** engine_id `llm-{provider}:{model}:{version}` (design §3.2). The `llm-` prefix is not
 *  cosmetic: the lane<->engine prefix CHECK refuses an `llm_witness` task whose engine_id does
 *  not match `llm-%` (0090 §3), so a mis-stamped task cannot even be inserted. BOTH channels
 *  share this ONE engine id and are distinguished by engine_kind — the M15 inversion of the
 *  statement pair's discriminator, written out in the design because it is the opposite of the
 *  precedent it is modelled on. */
export const WITNESS_ENGINE_SNAPSHOT = Object.freeze({
  engineId: `llm-openai:${WITNESS_MODEL_ID}:${WITNESS_ENGINE_VERSION}`,
  engineConfig: Object.freeze({ provider: "openai", model: WITNESS_MODEL_ID, contract: WITNESS_ENGINE_VERSION }),
  versionN: 1,
});

// A bounded provider call. The witness lane's own concurrency window (0090 §4's
// llm_witness_concurrency, default 2) bounds how many run at once; this bounds how long one may
// hang. Finite-guarded (the leader.mjs idiom): junk or non-positive falls back — a NaN here
// would mean no timeout at all, and an un-timed-out vision call on a big PDF would hold a
// concurrency slot indefinitely.
const TIMEOUT_MS_ENV = Number(process.env.CLARA_WITNESS_LLM_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(TIMEOUT_MS_ENV) && TIMEOUT_MS_ENV > 0 ? TIMEOUT_MS_ENV : 180_000;

/** The SAME globalThis override name every other model lane uses (classify-llm.mjs:115,
 *  autoDraft.v7.infra.ts:61-63, wiki-projection.mjs:352) so ONE mock arms every lane and the
 *  tests never reach the network. */
function resolveModel(modelId) {
  const override = globalThis.__claraModelForTest;
  return override ?? openai(modelId);
}

/**
 * The media types the VISION channel may send, mapped to what the provider accepts.
 *
 * READ POSITIVELY AND FAIL CLOSED. @ai-sdk/openai@4.0.16's Responses conversion turns a `file`
 * part into `input_image` for a top-level `image` media type and into `input_file` for
 * `application/pdf` — and throws UnsupportedFunctionality for ANYTHING ELSE. So an allowlist is
 * not a policy choice here, it is the provider's own contract; guessing past it would trade a
 * clean local refusal for an opaque provider error after the bytes were already assembled.
 *
 * NAMED RESIDUAL: intake also admits image/tiff and image/heic (lib/intake.mjs's MIME_ALIASES),
 * which the OpenAI vision endpoint does not read. Those documents refuse the vision channel
 * rather than being silently converted — a re-encode would mean the vision witness read bytes
 * whose sha256 is NOT the one its input pin names, which is the independence receipt's whole
 * point. Converting them is a product decision, not an adapter's.
 */
const VISION_MEDIA_TYPES = new Map([
  ["application/pdf", "application/pdf"],
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/webp", "image/webp"],
  ["image/gif", "image/gif"],
]);

export function witnessMediaType(mime) {
  return VISION_MEDIA_TYPES.get(String(mime ?? "").trim().toLowerCase()) ?? null;
}

/**
 * ONE channel's model call.
 *
 * The AI SDK surface used here, grounded on @ai-sdk/openai@4.0.16 + ai@7.0.31 as installed (and
 * on the current AI SDK docs for prompts / file parts):
 *   * `generateObject({ model, schema, system, messages, abortSignal })` — the classify-llm.mjs
 *     precedent, widened from `prompt` to `messages` because a file part can only ride in a
 *     structured message content array.
 *   * a `file` content part `{ type: "file", mediaType, data, filename }` where `data` is raw
 *     bytes (Uint8Array/Buffer). This is the FIRST use of file parts anywhere in Clara — the
 *     runtime has been text-only until now — so it is written from the installed provider's own
 *     conversion, not from memory.
 *   * `result.usage` is a LanguageModelUsage: `{ inputTokens, outputTokens, ... }`, either of
 *     which may be undefined; the metering row stores null rather than a coerced zero, because a
 *     zero token count is a claim and an absent one is not.
 *
 * @param {{channel: "text"|"vision", system: string, prompt: string, schema: unknown,
 *          file?: {path: string, mime: string}, timeoutMs?: number, abortSignal?: AbortSignal}} call
 */
export async function callWitnessModel({ channel, system, prompt, schema, file, timeoutMs, abortSignal }) {
  /** @type {Array<Record<string, unknown>>} */
  const content = [{ type: "text", text: prompt }];
  if (file) {
    const mediaType = witnessMediaType(file.mime);
    if (!mediaType) {
      // DEFENCE IN DEPTH ONLY. The authoritative refusal is upstream in the frozen behaviour,
      // which checks `witnessMediaType` BEFORE minting an authorization (review M4) — reaching
      // this line would mean an authorization was already consumed for bytes that cannot leave.
      // Kept because this adapter is callable on its own and must never hand the provider a
      // media type its conversion throws on.
      throw Object.assign(new Error(`witness vision channel cannot read media type '${file.mime}'`), { code: "bad_type" });
    }
    const bytes = await readFile(file.path);
    content.push({ type: "file", mediaType, data: bytes, filename: `document.${mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1]}` });
  }
  // The timeout aborts the provider REQUEST (not merely our await), and a caller-supplied signal
  // composes with it — so a shutdown cancels an in-flight call instead of waiting out the full
  // budget. Identical composition to classify-llm.mjs:140-142.
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_MS;
  const timer = AbortSignal.timeout(budget);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timer]) : timer;
  const result = await generateObject({
    model: resolveModel(WITNESS_MODEL_ID),
    schema,
    system,
    messages: [{ role: "user", content }],
    abortSignal: signal,
  });
  return {
    object: result.object,
    usage: {
      input_tokens: Number.isInteger(result.usage?.inputTokens) ? result.usage.inputTokens : null,
      output_tokens: Number.isInteger(result.usage?.outputTokens) ? result.usage.outputTokens : null,
    },
    channel,
  };
}

export function makeWitnessFactsServices() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    // Hash-verified canonical bytes — the vision channel's input pin is `documents.sha256`, so
    // the bytes the model reads must provably be the bytes that pin names.
    downloadCanonical: base.downloadCanonical,
    // The ONLY line in this lane that sends anything anywhere.
    callWitnessModel,
    // The frozen behaviour asks this BEFORE minting an authorization (review M4), so the
    // provider's own media-type contract has to be readable from outside the adapter.
    witnessMediaType,
    engineSnapshot: WITNESS_ENGINE_SNAPSHOT,
    log: (message) => console.error(message),
  });
}
