// The injected service bundle for witnessFacts_v2 (F-A2 openers ①②③).
// INFRASTRUCTURE — NOT frozen; assembled here and injected into
// globalThis.__claraWitnessFactsServicesV2 by the supervisor (plugins/startWorld.ts), exactly as
// makeWitnessFactsServices() is for witnessFacts_v1 and makeStatementWitnessServices() is for the
// statement witness pair.
//
// A SEPARATE FILE AND A SEPARATE GLOBAL FROM witnessFacts.v1.services.mjs, ON PURPOSE — this is
// the sharpest trap in the rotation and the statementFacts.v1/v2 precedent exists because of it.
// This bundle carries the ENGINE SNAPSHOT, and the witness contract version lives INSIDE the
// engine id ("it moves with the WORKFLOW class", witnessFacts.v1.services.mjs:50-52). Had the
// bump been an edit to v1's own constant — or had v2 read v1's global — a straggler v1 run
// resuming after this image deploys would stamp `:v2` provenance onto a read produced by the
// FROZEN v1 prompt body: a receipt naming a prompt closure that never saw the document. v1's
// bundle stays exactly as it is and keeps serving any in-flight v1 run at `:v1`; startWorld.ts
// injects BOTH slots simultaneously and neither replaces the other.
//
// WHERE THE FREEZE LINE SITS, and why it sits there. The frozen closure
// (witnessFacts.v2.ts / .impl.ts / .behavior.mjs / .prompts.mjs / .envelope.mjs, plus the REUSED
// witnessFacts.v1.dispatch.mjs) owns ORCHESTRATION, AUTHORIZATION, THE PROMPTS and the
// wire->writer normalization: which steps run, that a typed dispatch wraps each model call, what
// an answer means, what a citation must satisfy. Out here lives everything VENDOR-SHAPED — model
// resolution, the timeout, the provider content parts, the file read — because those are exactly
// the parts that get tuned against real invoices, and the AB-16 precedent is that vendor tuning
// must never be a workflow-version change. Prompts are the deliberate exception (design M8).
//
// THE ENGINE SNAPSHOT LIVES HERE, NOT IN THE FROZEN CLOSURE — the AZURE_ENGINE_SNAPSHOT pattern
// (lib/egress.mjs:171-175, itself a non-frozen module). It is the value the router stamps on the
// task it mints: `clara.persist_witness_facts` reads `engine_id` OFF THE TASK ROW (0095 §2), so
// the DB's stamp — not this constant — is what lands on both extraction rows, and this constant
// is what makes that stamp TRUE. The ①② window's DB migration moves both live router bodies'
// literal from `llm-openai:gpt-5.6-terra:v1` to `...:v2`; the two must STRING-EQUAL each other,
// and the frozen behaviour WAITS rather than egressing while they do not.

import { readFile } from "node:fs/promises";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

import { makeDocumentServices } from "../lib/intake.mjs";

/**
 * The witness model.
 *
 * DEFAULT `gpt-5.6-terra`, unchanged from v1 and for v1's own three reasons: it is the model this
 * deployment ALREADY egresses to (chatTurn, autoDraft, the classifier and the wiki lane all
 * default to it), it is in the gpt-5.6 family whose provider binding is the RESPONSES API — the
 * only OpenAI surface that accepts PDF file parts at all — and the sibling `gpt-5.6-sol` is this
 * repo's CODEX lane model (AGENTS.md constraint 5), which taking here would collide two unrelated
 * model policies in one account. Overridable per deployment with CLARA_WITNESS_MODEL_ID so a
 * corpus-tuning round can move the model without a workflow version — but NOT without moving the
 * engine id, which is derived from it below so provenance can never name a model nobody called.
 */
export const WITNESS_MODEL_ID = process.env.CLARA_WITNESS_MODEL_ID || "gpt-5.6-terra";

/** The witness contract version inside the engine id. It moves with the WORKFLOW class, not with
 *  the model (the model is the middle segment) — and witnessFacts.v2 is exactly the event that
 *  moves it. `:v1` stays stamped by witnessFacts.v1.services.mjs, which this file does not
 *  touch. */
export const WITNESS_ENGINE_VERSION = "v2";

/** engine_id `llm-{provider}:{model}:{version}` (design §3.2). The `llm-` prefix is not
 *  cosmetic: the lane<->engine prefix CHECK refuses an `llm_witness` task whose engine_id does
 *  not match `llm-%` (0090 §3), so a mis-stamped task cannot even be inserted. BOTH channels
 *  share this ONE engine id and are distinguished by engine_kind — the M15 inversion of the
 *  statement pair's discriminator. Under the default model this reads
 *  `llm-openai:gpt-5.6-terra:v2`, which is the literal the window's DB migration splices into
 *  `clara._enqueue_invoice_facts_core` and `clara.request_reextraction`. */
export const WITNESS_ENGINE_SNAPSHOT = Object.freeze({
  engineId: `llm-openai:${WITNESS_MODEL_ID}:${WITNESS_ENGINE_VERSION}`,
  engineConfig: Object.freeze({ provider: "openai", model: WITNESS_MODEL_ID, contract: WITNESS_ENGINE_VERSION }),
  versionN: 1,
});

/**
 * A BOUNDED PROVIDER CALL — the F-A2 opener ③ knob, CARRIED FORWARD INTO THIS BUNDLE.
 *
 * PROVENANCE OF THIS BLOCK, stated because a silent copy is how a fix gets lost: it is opener ③'s
 * implementation (PR #270, branch `f-a2/openers-345`), which lands on
 * `witnessFacts.v1.services.mjs`. The registry repoint in THIS window makes v2's bundle the one
 * every new witness task runs under, so the timeout has to exist HERE or opener ③ would be
 * repaired on a bundle nothing calls any more. Both bundles carry it; neither is a stub.
 *
 * The witness lane's own concurrency window (0090 §4's llm_witness_concurrency, default 2) bounds
 * how MANY calls run at once; this bounds how LONG one may hang. On a 2-slot lane an unbounded
 * call is not a slow document, it is half the lane's throughput held hostage — the shape the
 * 2026-08-20 corpus run recorded (`docs/plan/completed/f-a1-corpus-measurement.md`, "The incident
 * the run exposed").
 *
 * DEFAULT 180_000, KEPT rather than loosened. The corpus run made 69 real calls under this exact
 * bound with ZERO model-call failures, which is positive evidence that 180s clears the real
 * corpus with room; raising it would widen the very window this knob exists to close.
 */
export const WITNESS_MODEL_TIMEOUT_DEFAULT_MS = 180_000;

/**
 * The knob's names, newest first.
 *
 * `CLARA_WITNESS_MODEL_TIMEOUT_MS` is the name the F-A2 opener ratified.
 * `CLARA_WITNESS_LLM_TIMEOUT_MS` is DEPRECATED but still accepted, and the reason is a fact
 * rather than a preference: it is the name witnessFacts.v1.services.mjs read on `main` (shipped
 * by PR-2 / #265), so it is the name any already-deployed machine would have been configured
 * under. Dropping it would silently revert such a deployment to the default — a config change
 * nobody made and nobody would see. It is therefore retired the honest way: still honoured, and
 * LOUD about being obsolete (see the warn-once below) so the surface can be removed once a
 * deployment has actually moved.
 */
export const WITNESS_MODEL_TIMEOUT_ENV_NAMES = Object.freeze([
  "CLARA_WITNESS_MODEL_TIMEOUT_MS",
  "CLARA_WITNESS_LLM_TIMEOUT_MS",
]);

/** Warn-once state, per process. Once-per-process and not once-per-call: this is read on every
 *  model call, and a per-call line would be noise an operator learns to filter — which is how a
 *  misconfiguration survives. */
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
export function witnessModelTimeoutMs(env = process.env, warn = (m) => console.error(m), seen = warnedTimeoutEnv) {
  for (const name of WITNESS_MODEL_TIMEOUT_ENV_NAMES) {
    const raw = env?.[name];
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      if (name !== WITNESS_MODEL_TIMEOUT_ENV_NAMES[0] && !seen.has(`deprecated:${name}`)) {
        seen.add(`deprecated:${name}`);
        warn(`[witness] ${name} is DEPRECATED — it still binds (${n}ms), but rename it to ${WITNESS_MODEL_TIMEOUT_ENV_NAMES[0]}; the alias exists only so an already-deployed machine does not silently revert to the ${WITNESS_MODEL_TIMEOUT_DEFAULT_MS}ms default.`);
      }
      return n;
    }
    // PRESENT but unusable. Absence is not a mistake and must not be warned about; a value that
    // was typed and cannot be honoured is.
    if (raw !== undefined && raw !== null && String(raw).trim() !== "" && !seen.has(`junk:${name}`)) {
      seen.add(`junk:${name}`);
      warn(`[witness] ${name}=${JSON.stringify(String(raw))} is not a positive number of milliseconds and was IGNORED — the witness model-call budget falls back to ${WITNESS_MODEL_TIMEOUT_DEFAULT_MS}ms. A junk value must never mean "no timeout", so it is refused rather than coerced.`);
    }
  }
  return WITNESS_MODEL_TIMEOUT_DEFAULT_MS;
}

/**
 * The typed error a spent budget raises.
 *
 * WHY `code: "internal"` AND NOT `"timeout"`, stated plainly because it looks wrong at a glance.
 * The frozen behaviour's taxonomy couples two decisions to one code: `"timeout"` sits in its
 * RETRYABLE set (witnessFacts.v2.behavior.mjs's RETRYABLE, carried from v1), so a call classified
 * `"timeout"` does not settle — it retries, and keeps holding the slot until the 45-minute wait
 * budget spends. A spent model budget is not a transient the lane should re-buy at the same
 * price; it must END the task. `"internal"` is the code the frozen taxonomy settles TERMINALLY
 * through `clara.fail_witness_facts` — the same audited door the four live hangs went out of. The
 * cost, named and not hidden: the metering row records outcome `"error"`, not `"timeout"`, so the
 * spend trail cannot tell a spent budget from a vendor fault. Splitting "metered as a timeout"
 * from "retryable" is a taxonomy change and therefore a witnessFacts.v3 + ceremony, not an
 * adapter's call to make — and NOT something to fold silently into this window.
 *
 * It is raised EXPLICITLY rather than letting the abort escape, because the raw abort lands on
 * `internal` BY ACCIDENT: `AbortSignal.timeout` rejects with a DOMException whose legacy `.code`
 * is the NUMBER 23, which `witnessFailureCode`'s allowlist does not recognise and so defaults. An
 * accident is not a contract — one provider or runtime change that gave the abort a `.code` of
 * `"timeout"` would silently convert every spent budget into a retry loop.
 */
export function witnessModelTimeoutError(budgetMs) {
  return Object.assign(
    new Error(
      `witness model call exceeded its ${budgetMs}ms budget and was aborted`
      + ` (raise ${WITNESS_MODEL_TIMEOUT_ENV_NAMES[0]} if the corpus genuinely needs longer)`,
    ),
    { code: "internal", witnessTimeout: true, budgetMs },
  );
}

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
 * NAMED RESIDUAL, unchanged from v1: intake also admits image/tiff and image/heic (lib/intake.mjs's
 * MIME_ALIASES), which the OpenAI vision endpoint does not read. Those documents refuse the vision
 * channel rather than being silently converted — a re-encode would mean the vision witness read
 * bytes whose sha256 is NOT the one its input pin names, which is the independence receipt's whole
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
 * The AI SDK surface used here, grounded on @ai-sdk/openai@4.0.16 + ai@7.0.31 as installed:
 *   * `generateObject({ model, schema, system, messages, abortSignal })` — the classify-llm.mjs
 *     precedent, widened from `prompt` to `messages` because a file part can only ride in a
 *     structured message content array.
 *   * a `file` content part `{ type: "file", mediaType, data, filename }` where `data` is raw
 *     bytes (Uint8Array/Buffer), written from the installed provider's own conversion.
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
      throw Object.assign(new Error(`witness vision channel cannot read media type '${file.mime}'`), { code: "bad_type" });
    }
    const bytes = await readFile(file.path);
    content.push({ type: "file", mediaType, data: bytes, filename: `document.${mediaType === "application/pdf" ? "pdf" : mediaType.split("/")[1]}` });
  }
  // The timeout aborts the provider REQUEST (not merely our await), and a caller-supplied signal
  // composes with it — so a shutdown cancels an in-flight call instead of waiting out the full
  // budget. `abortSignal` is the AI SDK's own native cancellation surface (ai@7.0.31 forwards it
  // to the provider fetch), not a race against a detached timer: an abandoned request that kept
  // streaming would still hold the slot.
  const budget = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : witnessModelTimeoutMs();
  const timer = AbortSignal.timeout(budget);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timer]) : timer;
  let result;
  try {
    result = await generateObject({
      model: resolveModel(WITNESS_MODEL_ID),
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
    if (timer.aborted && abortSignal?.aborted !== true) throw witnessModelTimeoutError(budget);
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

export function makeWitnessFactsServicesV2() {
  const base = makeDocumentServices();
  return Object.freeze({
    taskTempPath: base.taskTempPath,
    removeTempFile: base.removeTempFile,
    // Hash-verified canonical bytes — the vision channel's input pin is `documents.sha256`, so
    // the bytes the model reads must provably be the bytes that pin names, and the coverage
    // receipt now names that same digest.
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
