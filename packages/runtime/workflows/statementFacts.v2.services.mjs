// The injected service bundle for statementFacts_v2's `statement_facts` WITNESS PAIR (F-A1
// PR-4, design §3.7). INFRASTRUCTURE — NOT frozen; assembled here and injected into
// globalThis.__claraStatementWitnessServices by the supervisor (plugins/startWorld.ts), exactly
// as makeWitnessFactsServices() is for the invoice witness pair.
//
// WHERE THE FREEZE LINE SITS. The frozen closure (statementFacts.v2.ts / .impl.ts /
// .behavior.mjs / .prompts.mjs / .dispatch.mjs) owns ORCHESTRATION, AUTHORIZATION and THE
// PROMPTS. Out here lives everything VENDOR-SHAPED — model resolution, the timeout, the
// provider content parts, the file read — the AB-16 precedent every sibling lane follows: a
// model id or timeout change is config, never a workflow-version change.
//
// A SEPARATE GLOBAL FROM `__claraStatementFactsServices` (statementFacts.v1.services.mjs), ON
// PURPOSE. That bundle stays exactly as it is and keeps serving the `statement_parse` lane
// UNCHANGED via the imported v1 step (statementFacts.v2.impl.ts) — this bundle is additive, the
// witness pair's own infra, never a replacement for it.
//
// THE ENGINE SNAPSHOT LIVES HERE, NOT IN THE FROZEN CLOSURE — the same AZURE_ENGINE_SNAPSHOT /
// WITNESS_ENGINE_SNAPSHOT pattern every lane with a provenance stamp uses. It is the value
// whatever admits/routes a `statement_facts` task must stamp on `document_processing_tasks.
// engine_id` for `persist_statement_facts_v2` to read back — this constant is what makes that
// stamp TRUE, and the frozen behaviour refuses to egress (WAIT, not terminal) when the task's
// own stamp disagrees with it. **CROSS-PR DEPENDENCY, NAMED HERE FOR THE RECORD**: the DB-side
// admission/router logic that stamps NEW `statement_facts` tasks with this engine id has not
// been authored in this branch (packages/db is out of scope for this PR) — coordinate the
// literal below with whoever ships `persist_statement_facts_v2` and the admission path.

import { readFile } from "node:fs/promises";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

import { makeDocumentServices } from "../lib/intake.mjs";

/**
 * The statement-witness model. Defaults to the SAME `gpt-5.6-terra` default the invoice witness
 * pair uses (witnessFacts.v1.services.mjs's own three grounds apply unchanged here: it is
 * already this deployment's OpenAI-direct model, it is a gpt-5.6-family Responses-API model —
 * the only OpenAI surface accepting PDF file parts — and it is distinct from the Codex lane's
 * `gpt-5.6-sol`). Overridable per deployment via CLARA_STATEMENT_WITNESS_MODEL_ID, independent
 * of CLARA_WITNESS_MODEL_ID so the two witness pairs can be corpus-tuned separately.
 */
export const STATEMENT_WITNESS_MODEL_ID = process.env.CLARA_STATEMENT_WITNESS_MODEL_ID || "gpt-5.6-terra";

/** The statement-witness contract version inside the engine id. Moves with the WORKFLOW class
 *  (a statementFacts.v3 witness-arm change would stamp a new version here), never with the
 *  model. `stmt-witness` distinguishes this engine identity from BOTH the invoice witness pair
 *  (`llm-openai:{model}:v1`) and statementFacts.v1's own reader-2 (`azure-di:...`) — three
 *  engines, three distinct id shapes, none of them collide. */
export const STATEMENT_WITNESS_ENGINE_VERSION = "stmt-witness-v1";

export const STATEMENT_WITNESS_ENGINE_SNAPSHOT = Object.freeze({
  engineId: `llm-openai:${STATEMENT_WITNESS_MODEL_ID}:${STATEMENT_WITNESS_ENGINE_VERSION}`,
  engineConfig: Object.freeze({ provider: "openai", model: STATEMENT_WITNESS_MODEL_ID, contract: STATEMENT_WITNESS_ENGINE_VERSION }),
  versionN: 1,
});

// Bounded provider call — same reasoning and same default as witnessFacts.v1.services.mjs's own
// timeout: a finite-guarded env override, falling back rather than allowing a NaN (= no
// timeout) to hold a concurrency slot indefinitely on a large statement PDF.
const TIMEOUT_MS_ENV = Number(process.env.CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(TIMEOUT_MS_ENV) && TIMEOUT_MS_ENV > 0 ? TIMEOUT_MS_ENV : 180_000;

/** The SAME globalThis override name every model lane uses (classify-llm.mjs, autoDraft.v7.infra.ts,
 *  wiki-projection.mjs, witnessFacts.v1.services.mjs) so ONE mock arms every lane and tests
 *  never reach the network. */
function resolveModel(modelId) {
  const override = globalThis.__claraModelForTest;
  return override ?? openai(modelId);
}

/** The media types the VISION channel may send — IDENTICAL allowlist and IDENTICAL reasoning
 *  to witnessFacts.v1.services.mjs's own `witnessMediaType`: @ai-sdk/openai@4.0.16's Responses
 *  conversion accepts only `application/pdf` and the listed image types, and throws
 *  UnsupportedFunctionality on anything else — so this is the provider's own contract, not a
 *  policy choice, and is duplicated (never imported cross-family) for the same reason every
 *  other piece of this closure is. */
const VISION_MEDIA_TYPES = new Map([
  ["application/pdf", "application/pdf"],
  ["image/png", "image/png"],
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/webp", "image/webp"],
  ["image/gif", "image/gif"],
]);

export function statementWitnessMediaType(mime) {
  return VISION_MEDIA_TYPES.get(String(mime ?? "").trim().toLowerCase()) ?? null;
}

/**
 * ONE channel's model call — the same `generateObject({model, schema, system, messages,
 * abortSignal})` surface and the same `file` content-part shape witnessFacts.v1.services.mjs
 * uses (grounded on @ai-sdk/openai@4.0.16 + ai@7.0.31 as installed). `result.usage` fields are
 * stored as null rather than a coerced zero when absent — a zero token count is a claim, an
 * absent one is not.
 *
 * @param {{channel: "text"|"vision", system: string, prompt: string, schema: unknown,
 *          file?: {path: string, mime: string}, timeoutMs?: number, abortSignal?: AbortSignal}} call
 */
export async function callStatementWitnessModel({ channel, system, prompt, schema, file, timeoutMs, abortSignal }) {
  /** @type {Array<Record<string, unknown>>} */
  const content = [{ type: "text", text: prompt }];
  if (file) {
    const mediaType = statementWitnessMediaType(file.mime);
    if (!mediaType) {
      // Defence in depth only — the authoritative refusal is upstream in the frozen behaviour,
      // which checks `statementWitnessMediaType` BEFORE minting an authorization.
      throw Object.assign(new Error(`statement witness vision channel cannot read media type '${file.mime}'`), { code: "bad_type" });
    }
    const bytes = await readFile(file.path);
    content.push({ type: "file", mediaType, data: bytes, filename: `statement.${mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1]}` });
  }
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : TIMEOUT_MS;
  const timer = AbortSignal.timeout(budget);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timer]) : timer;
  const result = await generateObject({
    model: resolveModel(STATEMENT_WITNESS_MODEL_ID),
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

export function makeStatementWitnessServices() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    // Hash-verified canonical bytes — the vision channel's read must provably be the bytes
    // `documents.sha256` names.
    downloadCanonical: base.downloadCanonical,
    // The ONLY line in this bundle that sends anything anywhere.
    callStatementWitnessModel,
    // The frozen behaviour asks this BEFORE minting an authorization, so the provider's own
    // media-type contract has to be readable from outside the adapter.
    statementWitnessMediaType,
    engineSnapshot: STATEMENT_WITNESS_ENGINE_SNAPSHOT,
    log: (message) => console.error(message),
  });
}
