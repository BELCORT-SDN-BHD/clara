// autoDraft v3 -> v4 (ledger #44 / GitHub #42) — the first-ever production one-click
// autodraft run died in its model step: FatalError "...runAutoDraftModelStep failed after
// 3 retries: No output generated. Check the stream for errors." Full diagnosis in
// autoDraft.v4.impl.ts's own header (a config default fix, migration 0033, ships
// alongside this). This file proves the TWO runtime-side honesty fixes:
//   - consumeAutoDraftModelResult (autoDraft.v4.impl.ts): a genuine fullStream `error`
//     part is captured locally and used as the thrown cause when content/totalUsage
//     reject, instead of trusting ai-sdk's own sometimes-generic, cause-less rejection.
//   - refusalFromCaughtError (autoDraft.v4.ts): the workflow's top-level catch forwards
//     the real caught error's own code/message into the settle record, instead of the
//     fixed literal "sweep draft failed" v3 always used.
// Both are PURE functions with no WDK-ambient call (getWritable()/getWorkflowMetadata()
// throw outside a real workflow/step execution — confirmed empirically; that is exactly
// why they were pulled out to plain, parameter-injected functions), so both are testable
// directly, unlike runAutoDraftModelStep/autoDraft_v4 themselves.
//
// Also proves the STRUCTURAL regression the family's own convention requires (mirrors
// wave-b-autodraft-v3.test.mjs's "token-for-token identical" cells): errors.ts, infra.ts,
// prompt.ts, and tools.ts are UNMODIFIED version-renamed copies of v3 — this wave's fix
// touches ONLY impl.ts (the new consumeAutoDraftModelResult + the getWritable() call site)
// and the workflow entry .ts (the new refusalFromCaughtError + the catch-block call site).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FatalError } from "workflow";

const { register } = await import("tsx/esm/api");
register();

const impl = await import("../workflows/autoDraft.v4.impl.ts");
const entry = await import("../workflows/autoDraft.v4.ts");

const { consumeAutoDraftModelResult } = impl;
const { refusalFromCaughtError } = entry;

const errOf = (name, message) => Object.assign(new Error(message), { name });

// ===========================================================================
// consumeAutoDraftModelResult — the fullStream honesty fix.
// ===========================================================================

async function* streamOf(parts) {
  for (const p of parts) yield p;
}

function collectingWriter() {
  const written = [];
  return { written, write: async (part) => { written.push(part); } };
}

/** A rejected promise, pre-marked "handled" for Node's unhandledRejection tracker (a
 *  throwaway .catch attached synchronously at construction) — the SAME promise reference
 *  is still returned, so a LATER `await` on it (inside consumeAutoDraftModelResult, one
 *  microtask tick later than construction) still rejects and is still caught there as
 *  normal. Test-only plumbing: production code always awaits the real streamText() result
 *  promises directly, never a pre-touched one. */
function rejectedSilently(err) {
  const p = Promise.reject(err);
  p.catch(() => {});
  return p;
}

test("ledger #44 — a clean stream (no error part) resolves normally: content/usage pass through, every part is still written", async () => {
  const { written, write } = collectingWriter();
  const result = {
    fullStream: streamOf([{ type: "text-delta", textDelta: "hi" }, { type: "finish", finishReason: "stop" }]),
    content: Promise.resolve([{ type: "text", text: "hi" }]),
    totalUsage: Promise.resolve({ totalTokens: 42 }),
  };
  const { content, usage } = await consumeAutoDraftModelResult(result, write);
  assert.deepEqual(content, [{ type: "text", text: "hi" }]);
  assert.deepEqual(usage, { totalTokens: 42 });
  assert.equal(written.length, 2, "every fullStream part is still forwarded to the writer, unchanged");
});

test("ledger #44 — a REAL fullStream error part is captured; when content/totalUsage THEN reject, the thrown error carries the CAPTURED cause, not a guess", async () => {
  const realError = errOf("AI_APICallError", "The requested model 'openai/gpt-5-mini' does not exist.");
  const { write } = collectingWriter();
  const result = {
    fullStream: streamOf([{ type: "error", error: realError }]),
    content: rejectedSilently(errOf("AI_NoOutputGeneratedError", "No output generated. Check the stream for errors.")),
    totalUsage: rejectedSilently(errOf("AI_NoOutputGeneratedError", "No output generated. Check the stream for errors.")),
  };
  await assert.rejects(
    consumeAutoDraftModelResult(result, write),
    (err) => {
      assert.equal(err.code, "model_stream_error");
      assert.match(err.message, /model stream reported an error/);
      assert.match(err.message, /openai\/gpt-5-mini/, "the REAL vendor rejection text survives into the thrown message, never the generic ai-sdk fallback");
      assert.equal(err.cause, realError, "the exact captured error object rides as .cause — nothing is summarised away");
      return true;
    },
  );
});

test("ledger #44 — the error part is captured even though the loop keeps consuming (writer still sees it) — the FIRST error part wins if more than one appears", async () => {
  const first = errOf("AI_APICallError", "first vendor rejection");
  const second = errOf("AI_APICallError", "second vendor rejection (should be ignored)");
  const { written, write } = collectingWriter();
  const result = {
    fullStream: streamOf([{ type: "error", error: first }, { type: "error", error: second }]),
    content: rejectedSilently(new Error("No output generated.")),
    totalUsage: rejectedSilently(new Error("No output generated.")),
  };
  await assert.rejects(
    consumeAutoDraftModelResult(result, write),
    (err) => { assert.match(err.message, /first vendor rejection/); assert.doesNotMatch(err.message, /second vendor rejection/); return true; },
  );
  assert.equal(written.length, 2, "both parts are still forwarded to the writer — capturing does not swallow the stream itself");
});

test("ledger #44 — if content/totalUsage reject WITHOUT any fullStream error part having been seen, the ORIGINAL rejection propagates untouched (never a guessed cause)", async () => {
  const { write } = collectingWriter();
  const original = errOf("SomeOtherError", "a genuinely different, unrelated failure");
  const result = {
    fullStream: streamOf([{ type: "text-delta", textDelta: "partial" }]),
    content: rejectedSilently(original),
    totalUsage: Promise.resolve({}),
  };
  await assert.rejects(consumeAutoDraftModelResult(result, write), (err) => {
    assert.equal(err, original, "no fullStream error part was ever seen — the original rejection is never re-wrapped or guessed at");
    return true;
  });
});

test("ledger #44 — an error part whose own `error` field is itself falsy/absent still marks a captured error (the raw part is used as the cause)", async () => {
  const { write } = collectingWriter();
  const result = {
    fullStream: streamOf([{ type: "error" }]), // no .error field at all — a malformed/minimal error part
    content: rejectedSilently(new Error("No output generated.")),
    totalUsage: rejectedSilently(new Error("No output generated.")),
  };
  await assert.rejects(consumeAutoDraftModelResult(result, write), (err) => {
    assert.equal(err.code, "model_stream_error");
    assert.deepEqual(err.cause, { type: "error" }, "with no .error field, the raw part itself becomes the cause — never silently dropped");
    return true;
  });
});

// ===========================================================================
// refusalFromCaughtError — the workflow-level settle-honesty fix (the third swallow),
// PLUS the R-round F1 finding: a caught error's `.code` property never survives a real
// WDK step boundary (@workflow/core@4.6.0's step.js reconstructs every terminal step
// failure as `new FatalError(errorMessage)` — message/stack only, confirmed by
// constructing the REAL, installed FatalError class below, not an assumption about it).
// consumeAutoDraftModelResult's own tests above prove it TAGS its thrown message with
// `[autodraft_model:<code>]`; these prove refusalFromCaughtError reads the code back OUT
// of that exact tag once the object crossing the boundary is a bare FatalError with
// nothing left but the tagged message — never bypassing the boundary the real bug lives
// in.
// ===========================================================================

test("ledger #44 (R-round F1) — a REAL WDK step-boundary crossing: consumeAutoDraftModelResult's tagged message survives WDK's own FatalError(err.message) reconstruction, and refusalFromCaughtError recovers the ORIGINAL code from the tag (never 'internal')", async () => {
  const realError = errOf("AI_APICallError", "The requested model 'openai/gpt-5-mini' does not exist.");
  const { write } = collectingWriter();
  const result = {
    fullStream: streamOf([{ type: "error", error: realError }]),
    content: rejectedSilently(errOf("AI_NoOutputGeneratedError", "No output generated. Check the stream for errors.")),
    totalUsage: rejectedSilently(errOf("AI_NoOutputGeneratedError", "No output generated. Check the stream for errors.")),
  };
  let thrown;
  try {
    await consumeAutoDraftModelResult(result, write);
    assert.fail("consumeAutoDraftModelResult must throw here");
  } catch (err) {
    thrown = err;
  }

  // WDK's OWN reconstruction (step.js's 'step_failed' event consumer, per its own dist
  // source): `new FatalError(errorMessage)`. Replicated here with the REAL, installed
  // FatalError class — not a hand-rolled stand-in — so this test proves the actual
  // boundary, never bypassing it the way the R-round flagged the original test did.
  const reconstructed = new FatalError(thrown.message);
  assert.equal(reconstructed.code, undefined, "precondition: the real FatalError class truly carries no .code — the boundary really does strip it");
  assert.equal(reconstructed.cause, undefined, "precondition: .cause is truly gone too");
  assert.ok(reconstructed instanceof Error, "precondition: still an Error for refusalFromCaughtError's own instanceof check");

  const refusal = refusalFromCaughtError(reconstructed);
  assert.equal(refusal.code, "model_stream_error", "the code survives via the MESSAGE tag, never the (stripped) .code property");
  assert.match(refusal.message, /openai\/gpt-5-mini/, "the real vendor rejection text still reaches the settle record after the boundary crossing");
  assert.doesNotMatch(refusal.message, /^\[autodraft_model:/, "the tag itself is stripped back out — never leaked into the human-facing settle message");
});

test("ledger #44 (R-round F1) — a message WITHOUT the autodraft_model tag (any OTHER caught error, post-boundary) falls back to 'internal' but still carries the real message — unchanged from the third-swallow fix", () => {
  const reconstructed = new FatalError("a DB connectivity blip mid-claim");
  assert.equal(reconstructed.code, undefined, "precondition: a generic step failure ALSO loses .code at the boundary — this is the common case, not a special one");
  assert.deepEqual(refusalFromCaughtError(reconstructed), { code: "internal", message: "a DB connectivity blip mid-claim" });
});

test("ledger #44 — a real Error WITH a string .code (a non-step-crossed error, the fallback path's own contract) forwards BOTH verbatim into the settle refusal", () => {
  const err = Object.assign(new Error("model stream reported an error: the vendor rejected the request"), { code: "model_stream_error" });
  assert.deepEqual(refusalFromCaughtError(err), {
    code: "model_stream_error",
    message: "model stream reported an error: the vendor rejected the request",
  });
});

test("ledger #44 — a real Error with NO .code and NO tag falls back to code:'internal' but STILL carries the real message (never the fixed literal)", () => {
  const err = new Error("a DB connectivity blip mid-claim");
  const r = refusalFromCaughtError(err);
  assert.equal(r.code, "internal");
  assert.equal(r.message, "a DB connectivity blip mid-claim", "the real message survives even without a code — 'sweep draft failed' must NOT appear here");
});

test("ledger #44 — a non-Error thrown value is stringified, never crashes the reducer", () => {
  assert.deepEqual(refusalFromCaughtError("a bare string throw"), { code: "internal", message: "a bare string throw" });
  assert.deepEqual(refusalFromCaughtError(null), { code: "internal", message: "null" });
});

test("ledger #44 — 'sweep draft failed' is the TRUE last resort ONLY: an error with a genuinely empty message still falls back to it, but never overrides a real one", () => {
  assert.deepEqual(refusalFromCaughtError(new Error("")), { code: "internal", message: "sweep draft failed" });
  assert.notEqual(refusalFromCaughtError(new Error("real diagnosis")).message, "sweep draft failed");
});

test("ledger #44 — a .code that is present but NOT a string is ignored (falls back to 'internal'), never coerced", () => {
  const err = Object.assign(new Error("weird"), { code: 42 });
  assert.equal(refusalFromCaughtError(err).code, "internal");
});

// ===========================================================================
// Structural regression: errors.ts, infra.ts, prompt.ts, tools.ts are UNMODIFIED
// version-renamed copies of v3 — mirrors wave-b-autodraft-v3.test.mjs's own convention.
// ===========================================================================

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
const asVN = (text, n) => text.replaceAll(`v${n}`, "vN").replaceAll(`V${n}`, "VN");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared. Line-anchored (`^import `) — a naive substring search for "import " would
 *  match prose like "the frozen import closure" inside the header comment itself (this
 *  file's own v4 headers say exactly that), truncating too early. */
function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

test("v4 errors.ts + infra.ts + prompt.ts + tools.ts are token-for-token identical to v3 (version-renamed only, header narrative aside) — this wave's fix touches ONLY impl.ts + the workflow entry", () => {
  for (const part of ["errors", "infra", "prompt", "tools"]) {
    assert.equal(
      dropHeader(asVN(src(`autoDraft.v4.${part}.ts`), 4)),
      dropHeader(asVN(src(`autoDraft.v3.${part}.ts`), 3)),
      `autoDraft.v4.${part}.ts must be a version-renamed copy of v3 — no behavioural change in this wave`,
    );
  }
});

/** Mask everything from just after recoverAutoDraftStep's own closing (identical, byte-
 *  for-byte, in both v3 and v4 — its own anchor text never changed) up to the settle
 *  step's start — spanning the model step's JSDoc, the NEW consumeAutoDraftModelResult
 *  export v4 alone has, and runAutoDraftModelStep's own body (the ONE place impl.ts
 *  actually changed). The anchor is deliberately NOT "consumeAutoDraftModelResult" itself
 *  — that string exists ONLY in v4's text, so using it as a shared anchor would always
 *  fail on v3's side. Everything OUTSIDE this span — every other step, the stop
 *  condition — is then compared token-for-token against v3. */
function maskModelStepChange(text) {
  const anchor = "op_key backstops.\n  }\n}";
  const start = text.indexOf(anchor);
  assert.ok(start > 0, "recoverAutoDraftStep's own closing must be present, unchanged, in both versions");
  const from = start + anchor.length;
  const end = text.indexOf("/** Settle the sweep task", from);
  assert.ok(end > from, "the settle step follows the model step");
  return `${text.slice(0, from)}\n\n<the ledger #44 model-step fix — compared separately>\n\n${text.slice(end)}`;
}

test("v4 impl.ts differs from v3 ONLY inside the model-step's own stream-consumption logic (header narrative aside) — claim/recover/settle/question/close are unchanged", () => {
  assert.equal(
    maskModelStepChange(dropHeader(asVN(src("autoDraft.v4.impl.ts"), 4))),
    maskModelStepChange(dropHeader(asVN(src("autoDraft.v3.impl.ts"), 3))),
    "outside the model step, v4 impl.ts must be a version-renamed copy of v3",
  );
});

// ===========================================================================
// The workflow ENTRY file (autoDraft.vN.ts): the happy path (claim -> recover ->
// model -> settle) is untouched; the ONLY change is the catch block now delegating to
// refusalFromCaughtError instead of a fixed literal.
// ===========================================================================

/** v4 alone imports AUTODRAFT_MODEL_ERROR_TAG from the impl module (the R-round F1 fix's
 *  own symbol) — strip that ONE named import back out so the import block otherwise
 *  compares identically to v3's. A no-op on v3's text, which never imports it. */
function stripModelErrorTagImport(text) {
  return text.replace(/\s*AUTODRAFT_MODEL_ERROR_TAG,\n/, "\n");
}

/** v4 alone declares AUTODRAFT_MODEL_ERROR_PATTERN + refusalFromCaughtError, ahead of the
 *  workflow entry function; strip BOTH out entirely (JSDoc included) before the try/catch
 *  mask below runs, so neither pollutes the "everything outside the catch body"
 *  comparison. Anchored on whichever of the two markers appears FIRST (their own relative
 *  order is an implementation detail, not something this structural check should assume).
 *  A no-op on v3's text, which has neither. */
function stripRefusalHelperIfPresent(text) {
  const markers = ["const AUTODRAFT_MODEL_ERROR_PATTERN", "export function refusalFromCaughtError"]
    .map((m) => text.indexOf(m))
    .filter((i) => i >= 0);
  if (markers.length === 0) return text;
  const start = Math.min(...markers);
  const docStart = text.lastIndexOf("/**", start);
  const anchorStart = docStart >= 0 ? docStart : start;
  const end = text.indexOf("\nexport async function autoDraft_", anchorStart);
  assert.ok(end > anchorStart, "the workflow entry function must follow the helper(s)");
  return text.slice(0, anchorStart) + text.slice(end + 1);
}

/** Mask from the try block's own start through the catch block's opening `catch (err) {`
 *  line (both anchors present, byte-identical, in v3 and v4) — everything OUTSIDE that
 *  span (imports, the function signature, and critically the `finally` block + its
 *  closing) is compared token-for-token. Call stripRefusalHelperIfPresent FIRST. */
function maskEntryTryCatch(text) {
  const start = text.indexOf("  try {\n    const claim = await claimAutoDraftStep(taskId);");
  assert.ok(start > 0, "the try block's own start must be present, unchanged, in both versions");
  const anchor = "} catch (err) {\n";
  const catchIdx = text.indexOf(anchor, start);
  assert.ok(catchIdx > start, "the catch block must follow the try block");
  const from = catchIdx + anchor.length;
  const end = text.indexOf("  } finally {", from);
  assert.ok(end > from, "the finally block must follow the catch body");
  return `${text.slice(0, start)}\n<the try block — compared separately, byte-identical to v3>\n${text.slice(catchIdx, from)}<the ledger #44 catch-body fix — compared separately>\n${text.slice(end)}`;
}

test("v4's workflow entry (autoDraft.v4.ts) differs from v3's ONLY in the new AUTODRAFT_MODEL_ERROR_TAG import, the new refusalFromCaughtError helper (+ its own pattern constant), and the catch block's refusal construction — the happy path and the finally block are unchanged", () => {
  assert.equal(
    maskEntryTryCatch(stripRefusalHelperIfPresent(stripModelErrorTagImport(dropHeader(asVN(src("autoDraft.v4.ts"), 4))))),
    maskEntryTryCatch(stripRefusalHelperIfPresent(stripModelErrorTagImport(dropHeader(asVN(src("autoDraft.v3.ts"), 3))))),
    "outside the catch block (and the two known, named v4-only additions above), autoDraft.v4.ts must be a version-renamed copy of v3",
  );
});

test("v4's workflow entry actually CALLS refusalFromCaughtError inside its catch block (the mask above proves 'only the catch changed' — this proves WHAT it changed to)", () => {
  const body = src("autoDraft.v4.ts");
  const catchIdx = body.indexOf("} catch (err) {");
  assert.ok(catchIdx > 0);
  const finallyIdx = body.indexOf("} finally {", catchIdx);
  const catchBody = body.slice(catchIdx, finallyIdx);
  assert.match(catchBody, /refusalFromCaughtError\(err\)/, "the settle call must forward the reducer's output");
  assert.doesNotMatch(catchBody, /"sweep draft failed"/, "the fixed literal must not be hardcoded directly in the catch body anymore — only inside the reducer's own true-last-resort fallback");
});
