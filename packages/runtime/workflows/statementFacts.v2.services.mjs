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

/**
 * A BOUNDED PROVIDER CALL — the F-A2 opener ③ mechanism, brought to this lane at ACTIVATION.
 *
 * WHAT WAS ALREADY HERE AND WHAT WAS NOT, stated so the change is not read as bigger than it is.
 * This bundle always composed an `AbortSignal.timeout` into the call, so the lane was never
 * literally unbounded. What it lacked is everything opener ③ added to the invoice witness lane
 * after the 2026-08-20 corpus run: the RATIFIED knob name, a budget resolved at CALL time rather
 * than frozen at import, a knob that is PRESENT-but-unusable saying so instead of being silently
 * discarded, and — the load-bearing one — an EXPLICIT typed error for a spent budget instead of
 * letting the raw abort land on a terminal code by accident.
 *
 * DEFAULT 180_000, KEPT rather than loosened, for the invoice lane's own measured reason: the
 * corpus run made 69 real calls under this exact bound with zero model-call failures. Statements
 * are larger documents on a shared window, which argues for keeping the bound, not widening it.
 */
export const STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS = 180_000;

/**
 * The knob's names, newest first — and the FIRST one is deliberately NOT statement-specific.
 *
 * ONE KNOB GOVERNS WITNESS MODEL CALLS ON BOTH LANES. `CLARA_WITNESS_MODEL_TIMEOUT_MS` is the
 * name opener ③ ratified for the invoice witness pair, and this lane reads the SAME name rather
 * than minting a second one: the thing being bounded is identical (one witness channel's call to
 * the same provider), and two independently-set timeout knobs is the shape where an operator
 * tunes one, believes the fleet is bounded, and leaves the other at a default nobody re-checked.
 * The MODEL id stays per-lane (`CLARA_STATEMENT_WITNESS_MODEL_ID`) because the two pairs are
 * corpus-tuned separately; the TIMEOUT is a slot-protection bound, not a tuning surface.
 *
 * `CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS` is DEPRECATED but still accepted, for the same
 * factual reason opener ③ kept its own predecessor: it is the name THIS FILE READ in the image
 * shipped by F-A1 PR-4, so it is the name any already-deployed machine would have been
 * configured under. Dropping it would silently revert such a deployment to the default — a
 * config change nobody made and nobody would see. It is retired the honest way: still honoured,
 * and LOUD about being obsolete.
 *
 * NAMED RESIDUAL, not hidden: if BOTH names are set, the first wins and the second is never
 * reached, so it neither binds nor warns. That is the same shadowing the invoice lane's own
 * alias has; it is acceptable here because the deprecated name has never governed live traffic
 * (statementFacts_v2 shipped deployed-but-UNPOINTED, so no statement call has ever run through
 * this bundle), and it is written down so a future reader does not rediscover it as a surprise.
 */
export const STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES = Object.freeze([
  "CLARA_WITNESS_MODEL_TIMEOUT_MS",
  "CLARA_STATEMENT_WITNESS_LLM_TIMEOUT_MS",
]);

/** Warn-once state, per process. Once-per-process and not once-per-call: this is read on every
 *  model call, and a per-call line would be noise an operator learns to filter — which is how a
 *  misconfiguration survives. This lane keeps its OWN ledger rather than importing the invoice
 *  lane's (no cross-family shape coupling — the chatTurn_v8 law this bundle already follows for
 *  every other member), so a deployment still running the deprecated alias sees one line per
 *  lane. Two lines for two lanes is honest; one line that hid a lane would not be. */
const warnedTimeoutEnv = new Set();

/**
 * Resolve the budget from an environment. FINITE-GUARDED (the leader.mjs idiom) and read
 * POSITIVELY: only a finite, strictly-positive number is accepted, and anything else — absent,
 * empty, `abc`, `0`, `-1`, `Infinity` — falls through to the next name and finally to the
 * default. A NaN accepted here would mean NO timeout at all, i.e. exactly the unbounded call this
 * function exists to make impossible, so junk must never be able to switch the bound off.
 *
 * BUT SILENCE IS THE OTHER FAILURE. An operator who sets `CLARA_WITNESS_MODEL_TIMEOUT_MS=5m` has
 * done something deliberate, and falling back to the default without a word means their intent
 * is discarded invisibly — the same class of defect as a guard that cannot say NO. So a knob
 * that is PRESENT but unusable says so, once, naming what it saw and what is being used instead.
 * An ABSENT knob is not a mistake and stays quiet.
 *
 * A FUNCTION, not a module-level const, for two reasons: it is the only shape a battery can
 * exercise without mutating the real `process.env` mid-suite, and the budget is then read at CALL
 * time — so an operator who changes the knob does not have to reason about import order.
 *
 * @param {Record<string, string|undefined>} [env]
 * @param {(message: string) => void} [warn]
 * @param {Set<string>} [seen]  the warn-once ledger. INJECTABLE rather than reachable through a
 *   test-only reset export: "once per process" is itself behaviour worth asserting, and a battery
 *   that had to reach into module state to test it would be testing the reset, not the rule.
 */
export function statementWitnessModelTimeoutMs(env = process.env, warn = (m) => console.error(m), seen = warnedTimeoutEnv) {
  for (const name of STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES) {
    const raw = env?.[name];
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      if (name !== STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES[0] && !seen.has(`deprecated:${name}`)) {
        seen.add(`deprecated:${name}`);
        warn(`[statement-witness] ${name} is DEPRECATED — it still binds (${n}ms), but rename it to ${STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES[0]}, which governs BOTH witness lanes; the alias exists only so an already-deployed machine does not silently revert to the ${STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS}ms default.`);
      }
      return n;
    }
    // PRESENT but unusable. Absence is not a mistake and must not be warned about; a value that
    // was typed and cannot be honoured is.
    if (raw !== undefined && raw !== null && String(raw).trim() !== "" && !seen.has(`junk:${name}`)) {
      seen.add(`junk:${name}`);
      warn(`[statement-witness] ${name}=${JSON.stringify(String(raw))} is not a positive number of milliseconds and was IGNORED — the statement-witness model-call budget falls back to ${STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS}ms. A junk value must never mean "no timeout", so it is refused rather than coerced.`);
    }
  }
  return STATEMENT_WITNESS_MODEL_TIMEOUT_DEFAULT_MS;
}

/**
 * The typed error a spent budget raises.
 *
 * WHY `code: "internal"` AND NOT `"timeout"`, restated for THIS lane's own taxonomy rather than
 * borrowed. statementFacts.v2.behavior.mjs's RETRYABLE set is `engine_error, timeout,
 * engine_lost, storage_error` — so a call classified `"timeout"` would NOT settle: it would
 * retry, holding a slot on a window the statement lane SHARES with intake OCR, until the
 * per-document attempt cap ended it. A spent model budget is not a transient worth re-buying at
 * the same price; it must END the task. `"internal"` is in that file's own FAILURE_CODES and is
 * outside RETRYABLE, so it settles terminally through `clara.fail_statement_facts` — the audited
 * door this lane already uses. The cost, named and not hidden: the metering row records outcome
 * `"error"`, not `"timeout"` (the behaviour maps that outcome off the failure code), so the spend
 * trail cannot tell a spent budget from a vendor fault. Splitting "metered as a timeout" from
 * "retryable" is a taxonomy change and therefore a statementFacts.v3 + ceremony, not an adapter's
 * call to make.
 *
 * It is raised EXPLICITLY rather than letting the abort escape, because today the raw abort lands
 * on `internal` BY ACCIDENT: `AbortSignal.timeout` rejects with a DOMException whose legacy
 * `.code` is the NUMBER 23, which `statementWitnessFailureCode`'s allowlist does not recognise
 * and so defaults. An accident is not a contract — one provider or runtime change that gave the
 * abort a `.code` of `"timeout"` would silently convert every spent budget into a retry loop on
 * the shared window.
 *
 * `claraRetry` is deliberately NOT set: that flag is this lane's WAIT marker (a deployment fact
 * the same task could succeed under later), and a spent budget is not one.
 */
export function statementWitnessModelTimeoutError(budgetMs) {
  return Object.assign(
    new Error(
      `statement witness model call exceeded its ${budgetMs}ms budget and was aborted`
      + ` (raise ${STATEMENT_WITNESS_MODEL_TIMEOUT_ENV_NAMES[0]} if the corpus genuinely needs longer)`,
    ),
    { code: "internal", statementWitnessTimeout: true, budgetMs },
  );
}

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
  // The timeout aborts the provider REQUEST (not merely our await), and a caller-supplied signal
  // composes with it — so a shutdown cancels an in-flight call instead of waiting out the full
  // budget. `abortSignal` is the AI SDK's own native cancellation surface (ai@7.0.31 forwards it
  // to the provider fetch), not a race against a detached timer: an abandoned request that kept
  // streaming would still hold the slot.
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : statementWitnessModelTimeoutMs();
  const timer = AbortSignal.timeout(budget);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timer]) : timer;
  let result;
  try {
    result = await generateObject({
      model: resolveModel(STATEMENT_WITNESS_MODEL_ID),
      schema,
      system,
      messages: [{ role: "user", content }],
      abortSignal: signal,
    });
  } catch (err) {
    // WHICH SIGNAL FIRED, never what the error looks like. A caller-supplied abort (a shutdown)
    // composes into the SAME signal, and the two mean opposite things: a shutdown is the operator
    // reclaiming the process and must keep its own identity, while a spent budget is this lane's
    // own verdict on this call. Asked of the timer directly — `timer.aborted` is the only fact
    // that distinguishes them, and it is a POSITIVE read, not an inference from a message.
    if (timer.aborted && abortSignal?.aborted !== true) throw statementWitnessModelTimeoutError(budget);
    throw err;
  }
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
