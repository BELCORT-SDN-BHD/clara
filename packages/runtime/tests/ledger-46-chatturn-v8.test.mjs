// chatTurn v7 -> v8 (owner-approved closing batch, 2026-07-29). THREE functional
// changes, everything else an unmodified version-rename:
//   #46a (the diagnostic twin) — chatTurn.v8.impl.ts's consumeChatTurnModelResult
//   (a duplicated, cross-referenced port of autoDraft.v4.impl.ts's ledger #44 fix)
//   captures a genuine fullStream `error` part instead of letting it be swallowed
//   into ai@7's generic NoOutputGeneratedError; chatTurn.v8.ts's
//   errorCodeFromCaughtError parses the tag back out of the caught error's message
//   into a specific settle errorCode STRING (unlike autoDraft's jsonb refusal, only
//   the code half is forwarded — settle_chat_turn's errorCode column is a plain
//   string).
//   #46b (the tax-rule propagation, RULED: propagate) — chatTurn.v8.prompt.ts's
//   SYSTEM_PROMPT + schema .describe()s (+ the DRAFT_TOOL description echo in
//   chatTurn.v8.tools.ts) adopt the SAME SST-zero precedent as autoDraft_v5: a
//   STATED NONZERO tax keeps the three-leg sst_purchase_cost split; a STATED ZERO
//   or absent tax takes the two-leg shape.
//   #35 (bind-existing counterparty) — the same three echo sites gain guidance to
//   prefer an existing counterparty_id (discoverable via list_journal_entries /
//   get_journal_entry) over proposing a new name when the vendor/customer is
//   already established. The DB write floor already accepted `{existing_id}`
//   unconditionally — this is prompt/schema-describe() guidance only; the wrapper
//   (runDraftJournalEntry) is byte-unchanged.
//
// THIS FILE covers #46a (consumeChatTurnModelResult's boundary cells, mirroring
// ledger-44's own R-round F1 convention exactly) and the STRUCTURAL regression for
// errors.ts/infra.ts (unmodified version-renames) + impl.ts/the workflow entry
// (confined to the diagnostic-port change). The companion file
// ledger-46-chatturn-v8-prompt.test.mjs covers #46b + #35 (prompt.ts/tools.ts,
// confined to the SST-rule + counterparty-guidance text, + their contract cells) —
// split to hold the family's own 500-line file-cap discipline (the same cap
// chatTurn.v7.tools.ts's own header cites for splitting workflow files).
// Historical self-referential version markers inside carried-forward prose (e.g. a
// JSDoc reading "v7: the pack fetch runs purpose...", correctly UNCHANGED since v8
// carries that behavior forward unmodified) are handled by TARGETED identifier
// renaming rather than a blanket vN-substring replace, so they never manufacture a
// false structural diff. No live model call anywhere in this file — every
// assertion is on static text/schema shape or pure functions.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const impl = await import("../workflows/chatTurn.v8.impl.ts");
const entry = await import("../workflows/chatTurn.v8.ts");

const { consumeChatTurnModelResult } = impl;
const { errorCodeFromCaughtError } = entry;

const errOf = (name, message) => Object.assign(new Error(message), { name });

// ===========================================================================
// WDK directive-survival guard (found live during THIS batch's own construction,
// fixed before it ever shipped): @workflow/builders' fast-discovery build step
// detects "use workflow"/"use step" by regex-blanking template literals THEN
// line/block comments out of the raw source before searching — but the
// template-literal blanker runs FIRST and treats ANY backtick pair anywhere in
// the file, INCLUDING markdown-style inline-code backticks inside a /** */ prose
// comment, as if it were real JS. An ODD number of backticks in one comment
// paragraph (e.g. a comment reading "...retry`/`retries`: `" — three backtick
// PAIRS where the third is unpaired) leaves the regex hunting for a partner and
// can walk forward past unrelated comments and even swallow the real
// "use workflow"/"use step" directive it eventually reaches — with ZERO build
// error: the file compiles, typechecks, and lints clean; only the WDK step
// registration silently drops the function. This is exactly what happened to
// the first draft of chatTurn.v8.ts here (confirmed via a clean rebuild:
// "20 workflows" instead of the expected 21, and the bundle's own
// __private_workflows.set(...) call for chatTurn_v8 genuinely absent) before the
// offending JSDoc paragraph was rewritten without backticks. This cell replicates
// the SAME regex family's file-name-agnostic core (dropped from
// @workflow/builders' fast-discovery.js) against every file in this closure, so
// a FUTURE edit that reintroduces an odd-backtick comment fails FAST here rather
// than silently shipping a workflow/step nothing ever dispatches.
// ===========================================================================

// Faithful port of @workflow/builders' fast-discovery.js + transform-utils.js (v4.1.2,
// read directly from node_modules to confirm these four regexes/the algorithm below
// match byte-for-byte) — NOT a simplified substring-count proxy (a prior draft of this
// guard only checked literal '"use workflow";' survival, which a single-quoted or
// semicolonless real directive could still slip past while reporting a false pass; a
// Codex confirmation pass on this exact PR caught the gap before merge).
const wdkTemplateLiteralPattern = /`(?:\\[\s\S]|[^`\\])*`/g;
const wdkCommentPattern = /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g;
const wdkDirectiveLinePattern = /^\s*(['"])(use workflow|use step)\1;?\s*$/;
const wdkStringDirectiveLinePattern = /^\s*(['"])[^'"]+\1;?\s*$/;

/** Mirrors transform-utils.js's hasDirective(source, directive) exactly: a directive
 *  only counts on its OWN line, immediately after either the start of a function body
 *  (the previous meaningful line ends with "{") or another string-directive line
 *  (directive-stacking, e.g. "use strict"; "use step";). */
function wdkHasDirective(source, directive) {
  let previousMeaningfulLine;
  for (const line of source.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine === "") continue;
    const directiveMatch = wdkDirectiveLinePattern.exec(trimmedLine);
    if (directiveMatch) {
      if (
        directiveMatch[2] === directive &&
        (previousMeaningfulLine === undefined || previousMeaningfulLine.endsWith("{") || wdkStringDirectiveLinePattern.test(previousMeaningfulLine))
      ) {
        return true;
      }
      previousMeaningfulLine = trimmedLine;
      continue;
    }
    previousMeaningfulLine = trimmedLine;
  }
  return false;
}

/** Mirrors fast-discovery.js's processFile: mask template literals THEN comments, then
 *  run the REAL hasDirective (not a substring check) against the masked source — the
 *  exact two-stage pipeline @workflow/builders actually runs at build time. */
function wdkDetectsDirective(source, directive) {
  const hasSubstring = source.includes(directive);
  if (!hasSubstring) return false;
  const masked =
    source.includes("`") || source.includes("/")
      ? source.replace(wdkTemplateLiteralPattern, (m) => m.replace(/[^\r\n]/g, " ")).replace(wdkCommentPattern, (m) => m.replace(/[^\r\n]/g, " "))
      : source;
  return wdkHasDirective(masked, directive);
}

test("every real \"use workflow\"/\"use step\" directive in the chatTurn v8 closure is detected by the REAL @workflow/builders algorithm (template-literal mask, then comment mask, then the line-position hasDirective check) — no odd-backtick comment sequence has silently swallowed a directive", () => {
  const expectedWorkflow = { "chatTurn.v8.ts": true };
  const expectedStep = { "chatTurn.v8.impl.ts": true };
  for (const file of ["chatTurn.v8.ts", "chatTurn.v8.impl.ts", "chatTurn.v8.infra.ts", "chatTurn.v8.errors.ts", "chatTurn.v8.prompt.ts", "chatTurn.v8.tools.ts"]) {
    const source = readFileSync(new URL(`../workflows/${file}`, import.meta.url), "utf8");
    assert.equal(
      wdkDetectsDirective(source, "use workflow"),
      Boolean(expectedWorkflow[file]),
      `${file}: the REAL @workflow/builders algorithm must ${expectedWorkflow[file] ? "" : "NOT "}detect a "use workflow" directive here`,
    );
    assert.equal(
      wdkDetectsDirective(source, "use step"),
      Boolean(expectedStep[file]),
      `${file}: the REAL @workflow/builders algorithm must ${expectedStep[file] ? "" : "NOT "}detect a "use step" directive here`,
    );
  }
});

test("the real hasDirective port itself recognises both accepted quote styles and the optional trailing semicolon — the exact forms a future edit to this closure might use", () => {
  const cases = [
    ['function f() {\n  "use workflow";\n  return 1;\n}', true],
    ["function f() {\n  'use workflow';\n  return 1;\n}", true],
    ['function f() {\n  "use workflow"\n  return 1;\n}', true], // no trailing semicolon
    ['function f() {\n  const x = 1;\n  "use workflow";\n  return x;\n}', false], // not the FIRST statement
    ['const s = "use workflow";', false], // an assignment, not a directive line
  ];
  for (const [source, expected] of cases) {
    assert.equal(wdkHasDirective(source, "use workflow"), expected, `hasDirective mismatch for: ${JSON.stringify(source)}`);
  }
});

// ===========================================================================
// consumeChatTurnModelResult — the fullStream honesty fix (ledger #46a).
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
 *  is still returned, so a LATER `await` on it (inside consumeChatTurnModelResult, one
 *  microtask tick later than construction) still rejects and is still caught there as
 *  normal. Test-only plumbing: production code always awaits the real streamText() result
 *  promises directly, never a pre-touched one. */
function rejectedSilently(err) {
  const p = Promise.reject(err);
  p.catch(() => {});
  return p;
}

test("chatTurn v8 — a clean stream (no error part) resolves normally: content/usage pass through, every part is still written", async () => {
  const { written, write } = collectingWriter();
  const parts = [{ type: "text-delta", text: "hi" }, { type: "finish" }];
  const result = {
    fullStream: streamOf(parts),
    content: Promise.resolve([{ type: "text", text: "hi" }]),
    totalUsage: Promise.resolve({ totalTokens: 5 }),
  };
  const { content, usage } = await consumeChatTurnModelResult(result, write);
  assert.deepEqual(content, [{ type: "text", text: "hi" }]);
  assert.deepEqual(usage, { totalTokens: 5 });
  assert.deepEqual(written, parts);
});

test("chatTurn v8 — a REAL fullStream error part is captured; when content/totalUsage THEN reject, the thrown error carries the CAPTURED cause, not a guess", async () => {
  const { write } = collectingWriter();
  const upstream = errOf("AI_APICallError", "The requested model 'openai/gpt-5-mini' does not exist.");
  const parts = [{ type: "error", error: upstream }];
  const result = {
    fullStream: streamOf(parts),
    content: rejectedSilently(new Error("No output generated. Check the stream for errors.")),
    totalUsage: Promise.resolve({ totalTokens: 0 }),
  };
  await assert.rejects(consumeChatTurnModelResult(result, write), (err) => {
    assert.match(err.message, /^\[chatturn_model:model_stream_error\] model stream reported an error: The requested model/);
    assert.equal(err.code, "model_stream_error");
    assert.equal(err.cause, upstream);
    return true;
  });
});

test("chatTurn v8 — the error part is captured even though the loop keeps consuming (writer still sees it) — the FIRST error part wins if more than one appears", async () => {
  const { written, write } = collectingWriter();
  const first = errOf("AI_APICallError", "first upstream error");
  const second = errOf("AI_APICallError", "second upstream error");
  const parts = [{ type: "error", error: first }, { type: "text-delta", text: "ignored" }, { type: "error", error: second }];
  const result = {
    fullStream: streamOf(parts),
    content: rejectedSilently(new Error("No output generated. Check the stream for errors.")),
    totalUsage: Promise.resolve({}),
  };
  await assert.rejects(consumeChatTurnModelResult(result, write), (err) => {
    assert.match(err.message, /first upstream error/);
    assert.doesNotMatch(err.message, /second upstream error/);
    return true;
  });
  assert.deepEqual(written, parts);
});

test("chatTurn v8 — if content/totalUsage reject WITHOUT any fullStream error part having been seen, the ORIGINAL rejection propagates untouched (never a guessed cause)", async () => {
  const { write } = collectingWriter();
  const original = new Error("No output generated. Check the stream for errors.");
  const result = {
    fullStream: streamOf([{ type: "text-delta", text: "partial" }]),
    content: rejectedSilently(original),
    totalUsage: Promise.resolve({}),
  };
  await assert.rejects(consumeChatTurnModelResult(result, write), (err) => {
    assert.equal(err, original);
    assert.doesNotMatch(err.message, /chatturn_model/);
    return true;
  });
});

test("chatTurn v8 — an error part whose own `error` field is itself falsy/absent still marks a captured error (the raw part is used as the cause)", async () => {
  const { write } = collectingWriter();
  const bareErrorPart = { type: "error" }; // no .error field at all
  const result = {
    fullStream: streamOf([bareErrorPart]),
    content: rejectedSilently(new Error("No output generated. Check the stream for errors.")),
    totalUsage: Promise.resolve({}),
  };
  await assert.rejects(consumeChatTurnModelResult(result, write), (err) => {
    assert.match(err.message, /\[chatturn_model:model_stream_error\]/);
    assert.equal(err.cause, bareErrorPart);
    return true;
  });
});

// ===========================================================================
// errorCodeFromCaughtError — the WDK two-stage boundary (ledger #46a, replicating
// autoDraft.v4.ts's ledger #44 R-round F1 exactly, adapted to a STRING return).
// ===========================================================================

test("chatTurn v8 (R-round F1) — a REAL WDK step-boundary crossing, BOTH stages replicated (the retry-exhaustion prefix, then FatalError): consumeChatTurnModelResult's tagged message survives, and errorCodeFromCaughtError maps it to the one ADMITTED bucket ('model_error') — never the raw tag code, which agent_tasks.error_code's CHECK constraint (0006_runtime_core.sql:153) does not admit", async () => {
  // Stage 1: step-handler.js's retry-exhaustion branch prepends its own literal
  // prefix to the thrown error's .message, discarding every other property.
  const original = Object.assign(
    new Error(`[chatturn_model:model_stream_error] model stream reported an error: upstream vendor fault`),
    { code: "model_stream_error" },
  );
  const stage1Message = `Step "step//./workflows/chatTurn.v8.impl//runModelSegmentStepV8" failed after 3 retries: ${original.message}`;
  // Stage 2: step.js's step_failed consumer reconstructs a bare FatalError from the
  // stored string, copying ONLY .message — no .code, no .cause.
  class FatalError extends Error {}
  const reconstructed = new FatalError(stage1Message);
  assert.equal(errorCodeFromCaughtError(reconstructed), "model_error");
});

test("chatTurn v8 (R-round F1) — the SAME tag, at message START with no WDK prefix at all (a direct/non-terminal catch, the OTHER of the two permitted anchors), still parses correctly and still maps to the one ADMITTED bucket", () => {
  const err = new Error("[chatturn_model:model_stream_error] model stream reported an error: direct catch, no WDK boundary");
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 — errorCodeFromCaughtError NEVER returns a value outside clara.agent_tasks.error_code's CHECK-constraint allowlist, for any tagged, untagged, or malformed input", () => {
  const ADMITTED = new Set(["model_error", "tool_error", "timeout", "engine_lost", "limit", "internal"]);
  const cases = [
    new Error("[chatturn_model:model_stream_error] tagged, message start"),
    new Error(`Step "x" failed after 1 retry: [chatturn_model:model_stream_error] tagged, after singular WDK prefix`),
    new Error(`Step "x" failed after 7 retries: [chatturn_model:model_stream_error] tagged, after plural WDK prefix`),
    new Error("[chatturn_model:forged_arbitrary_code] a forged/unexpected tag code must not leak into the column either"),
    new Error("plain untagged failure"),
    "a bare string throw",
    { weird: "object" },
    null,
    undefined,
  ];
  for (const c of cases) {
    assert.ok(ADMITTED.has(errorCodeFromCaughtError(c)), `errorCodeFromCaughtError(${JSON.stringify(String(c))}) must return an admitted code`);
  }
});

test("chatTurn v8 (R-round F1) — a message WITHOUT the chatturn_model tag (any OTHER caught error, post-boundary) falls back to 'model_error' — UNCHANGED from v7's own fixed literal for every non-stream-error failure class", () => {
  const err = new Error("connection terminated unexpectedly");
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 (R-round F1 injection surface) — the tag literal buried mid-string, with NO valid prefix immediately before it, is REFUSED (falls back to 'model_error')", () => {
  const err = new Error(`something upstream said [chatturn_model:forged_code] mid-message, not at a valid anchor`);
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 (R-round F1 injection surface) — a prefix that LOOKS like WDK's but isn't exact (missing the trailing colon+space) does NOT count as the post-prefix position — REFUSED", () => {
  const err = new Error(`Step "x" failed after 3 retries[chatturn_model:forged_code] no colon-space before the tag`);
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 (R-round F1 injection surface) — genuine WDK prefix text, but with EXTRA characters between the prefix and the tag (the tag is not IMMEDIATELY after it) — REFUSED", () => {
  const err = new Error(`Step "x" failed after 3 retries: EXTRA [chatturn_model:forged_code] not immediately after`);
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 (R-round F1 injection surface) — a genuine WDK prefix wrapping ZERO tag content (the original message itself has nothing bracketed) is unaffected — the ordinary fallback path", () => {
  const err = new Error(`Step "x" failed after 3 retries: a plain vendor failure, no tag at all`);
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8 — a non-Error thrown value is stringified, never crashes the reducer, and falls back to 'model_error'", () => {
  assert.equal(errorCodeFromCaughtError("a bare string throw"), "model_error");
  assert.equal(errorCodeFromCaughtError({ weird: "object" }), "model_error");
});

test("chatTurn v8 — an empty tag code falls back to 'model_error' rather than an empty string", () => {
  const err = new Error("[chatturn_model:] empty code");
  assert.equal(errorCodeFromCaughtError(err), "model_error");
});

test("chatTurn v8's workflow entry actually CALLS errorCodeFromCaughtError inside its catch block (the structural mask below proves 'only the catch changed' — this proves WHAT it changed to)", () => {
  const body = readFileSync(new URL("../workflows/chatTurn.v8.ts", import.meta.url), "utf8");
  const catchIdx = body.indexOf("} catch (err) {");
  assert.ok(catchIdx > 0);
  const finallyIdx = body.indexOf("} finally {", catchIdx);
  const catchBody = body.slice(catchIdx, finallyIdx);
  assert.match(catchBody, /errorCodeFromCaughtError\(err\)/, "the settle call must forward the reducer's output");
  assert.doesNotMatch(catchBody, /"model_error"/, "the fixed literal must not be hardcoded directly in the catch body anymore — only inside the reducer's own fallback");
});

// ===========================================================================
// Structural regression: errors.ts, infra.ts are UNMODIFIED version-renamed
// copies of v7; impl.ts and the workflow entry are confined to the ledger #46a
// diagnostic-port change. Mirrors ledger-44-autodraft-v4.test.mjs's own
// convention. Historical self-referential version markers inside CARRIED-FORWARD
// prose (e.g. "v7: the pack fetch runs purpose...") are correctly left untouched
// by targeted identifier renaming (rather than a blanket vN-substring replace,
// which would incorrectly rewrite that historical marker and manufacture a false
// diff — confirmed against the real files during this fix's own construction).
// ===========================================================================

const src = (name) => readFileSync(new URL(`../workflows/${name}`, import.meta.url), "utf8");
/** Drop the top-of-file block comment: it legitimately narrates each version's delta so it
 *  is EXPECTED to diverge; only the code from the first REAL import statement onward is
 *  compared. Line-anchored (mirrors the family's own dropHeader). */
function dropHeader(text) {
  const m = /^import /m.exec(text);
  assert.ok(m, "a real import statement must be present");
  return text.slice(m.index);
}

/** The KNOWN identifier/import-path renames between v7 and v8 — targeted, not a
 *  blanket "v7"->"vN" substring replace (which would also rewrite legitimate
 *  historical version markers inside carried-forward prose, e.g. a JSDoc reading
 *  "v7: the pack fetch runs purpose..." that v8 correctly preserves unchanged). */
const V7_TO_V8_RENAMES = [
  ["loadTaskStepV7", "loadTaskStepV8"],
  ["loadContextStepV7", "loadContextStepV8"],
  ["runModelSegmentStepV7", "runModelSegmentStepV8"],
  ["messageFromParts_v7", "messageFromParts_v8"],
  ["toTypedParts_v7", "toTypedParts_v8"],
  ["buildToolsV7", "buildToolsV8"],
  ["SYSTEM_PROMPT_V7", "SYSTEM_PROMPT_V8"],
  ["chatTurn_v7", "chatTurn_v8"],
  ["chatTurn.v7.impl.ts", "chatTurn.v8.impl.ts"],
  ["chatTurn.v7.impl.js", "chatTurn.v8.impl.js"],
  ["chatTurn.v7.prompt.ts", "chatTurn.v8.prompt.ts"],
  ["chatTurn.v7.prompt.js", "chatTurn.v8.prompt.js"],
  ["chatTurn.v7.tools.ts", "chatTurn.v8.tools.ts"],
  ["chatTurn.v7.tools.js", "chatTurn.v8.tools.js"],
  ["chatTurn.v7.errors.ts", "chatTurn.v8.errors.ts"],
  ["chatTurn.v7.errors.js", "chatTurn.v8.errors.js"],
  ["chatTurn.v7.infra.ts", "chatTurn.v8.infra.ts"],
  ["chatTurn.v7.infra.js", "chatTurn.v8.infra.js"],
  ["chatTurn.v7.ts", "chatTurn.v8.ts"],
];
function upgradeV7(text) {
  let t = text;
  for (const [from, to] of V7_TO_V8_RENAMES) t = t.split(from).join(to);
  return t;
}

test("v8 errors.ts + infra.ts are token-for-token identical to v7 (version-renamed only, header narrative aside) — this batch's three functional changes touch ONLY impl.ts, the workflow entry, prompt.ts, and tools.ts", () => {
  for (const part of ["errors", "infra"]) {
    assert.equal(
      dropHeader(upgradeV7(src(`chatTurn.v7.${part}.ts`))),
      dropHeader(src(`chatTurn.v8.${part}.ts`)),
      `chatTurn.v8.${part}.ts must be a version-renamed copy of v7 — no behavioural change in this batch`,
    );
  }
});

/** Mask from recoverCodingAttempt's own closing (identical, byte-for-byte, in both v7
 *  and v8 — its own anchor text never changed) up to mintHookTokenStep's own JSDoc —
 *  spanning the model step's JSDoc, the NEW consumeChatTurnModelResult export v8 alone
 *  has, and runModelSegmentStepV8's own body (the ONE place impl.ts actually changed).
 *  Everything OUTSIDE this span is compared token-for-token against v7. */
function maskModelStepChange(text) {
  const anchor = "// get_coding_attempt absent (pre-0009) or transient — no recovery; the model";
  const start = text.indexOf(anchor);
  assert.ok(start > 0, "recoverCodingAttempt's own closing comment must be present, unchanged, in both versions");
  const from = text.indexOf("}\n}\n", start) + 4;
  const end = text.indexOf("/** Mint a RANDOM hook token", from);
  assert.ok(end > from, "mintHookTokenStep follows the model step");
  return `${text.slice(0, from)}\n<the ledger #46a model-step fix — compared separately>\n${text.slice(end)}`;
}

test("v8 impl.ts differs from v7 ONLY inside the model-step's own stream-consumption logic (header narrative aside) — claim/load/checkpoint/settle/close are unchanged", () => {
  assert.equal(
    maskModelStepChange(dropHeader(src("chatTurn.v8.impl.ts"))),
    maskModelStepChange(dropHeader(upgradeV7(src("chatTurn.v7.impl.ts")))),
    "outside the model step, v8 impl.ts must be a version-renamed copy of v7",
  );
});

// ===========================================================================
// The workflow ENTRY file (chatTurn.vN.ts): the happy path (claim -> load -> loop
// segments -> settle) is untouched; the ONLY change is the new tag-parser +
// errorCodeFromCaughtError helper, and the catch block now delegating to it
// instead of the fixed "model_error" literal.
// ===========================================================================

/** v8 alone imports CHATTURN_MODEL_ERROR_TAG from the impl module; strip that ONE
 *  named import back out so the import block otherwise compares identically to v7's.
 *  A no-op on v7's text, which never imports it. */
function stripModelErrorTagImport(text) {
  return text.replace(/\s*CHATTURN_MODEL_ERROR_TAG,\n/, "\n");
}

/** v8 alone declares WDK_RETRY_PREFIX_SOURCE + CHATTURN_MODEL_ERROR_PATTERN +
 *  errorCodeFromCaughtError, ahead of the workflow entry function; strip ALL THREE
 *  out entirely (JSDoc included) before the catch mask below runs. A no-op on v7's
 *  text, which has none of them. */
function stripV8HelperIfPresent(text) {
  const markers = ["const WDK_RETRY_PREFIX_SOURCE", "const CHATTURN_MODEL_ERROR_PATTERN", "export function errorCodeFromCaughtError"]
    .map((m) => text.indexOf(m))
    .filter((i) => i >= 0);
  if (markers.length === 0) return text;
  const start = Math.min(...markers);
  const docStart = text.lastIndexOf("/**", start);
  const anchorStart = docStart >= 0 ? docStart : start;
  const end = text.indexOf("/** Accumulate a part", anchorStart);
  assert.ok(end > anchorStart, "pushPart's own JSDoc must follow the helper(s)");
  return text.slice(0, anchorStart) + text.slice(end);
}

/** Mask from the try block's own start through the catch block's opening `catch (err) {`
 *  line (both anchors present, byte-identical, in v7 and v8) — everything OUTSIDE that
 *  span (imports, the function signature, and critically the `finally` block + its
 *  closing) is compared token-for-token. Call stripV8HelperIfPresent FIRST. */
function maskEntryTryCatch(text) {
  const start = text.indexOf("  try {\n    const claim = await claimRunStep(taskId);");
  assert.ok(start > 0, "the try block's own start must be present, unchanged, in both versions");
  const anchor = "} catch (err) {\n";
  const catchIdx = text.indexOf(anchor, start);
  assert.ok(catchIdx > start, "the catch block must follow the try block");
  const from = catchIdx + anchor.length;
  const end = text.indexOf("  } finally {", from);
  assert.ok(end > from, "the finally block must follow the catch body");
  return `${text.slice(0, start)}\n<the try block — compared separately, byte-identical to v7>\n${text.slice(catchIdx, from)}<the ledger #46a catch-body fix — compared separately>\n${text.slice(end)}`;
}

test("v8's workflow entry (chatTurn.v8.ts) differs from v7's ONLY in the new CHATTURN_MODEL_ERROR_TAG import, the new errorCodeFromCaughtError helper (+ its own pattern constant), and the catch block's errorCode derivation — the happy path and the finally block are unchanged", () => {
  assert.equal(
    maskEntryTryCatch(stripV8HelperIfPresent(stripModelErrorTagImport(dropHeader(src("chatTurn.v8.ts"))))),
    maskEntryTryCatch(stripV8HelperIfPresent(stripModelErrorTagImport(dropHeader(upgradeV7(src("chatTurn.v7.ts")))))),
    "outside the catch block (and the two known, named v8-only additions above), chatTurn.v8.ts must be a version-renamed copy of v7",
  );
});
