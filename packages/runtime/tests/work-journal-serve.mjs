// CHILD BOOTSTRAP for tests/work-journal-e2e.mjs. Installs a scripted model on `globalThis`, then
// hands over to the real supervisor (scripts/serve.mjs) — the same process the production image
// runs, with the same world, the same pools and the same frozen workflow bodies.
//
// WHY A BOOTSTRAP EXISTS AT ALL. `globalThis.__claraModelForTest` is per-PROCESS, so
// tests/world-e2e.mjs's in-process boot can just assign it. This e2e must SPAWN and KILL the
// engine (that is the whole point of the crash scenario), and a spawned child inherits ENV, not
// globals. This file is the smallest thing that turns one env var into one global.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT, NEVER BY A CALL COUNTER — the discipline tests/mockModel.mjs
// states and this lane needs even more: a WDK step can RE-EXECUTE after a crash, and a counter
// would make the resumed attempt behave differently from the original, which is exactly the
// property the crash scenario exists to measure.
//
// TWO SCRIPTS, selected by CLARA_WORK_TEST_SCRIPT:
//   post     (default) read the chart, then record the admitted basis verbatim.
//   narrate            answer in prose without calling a tool at all — the "the model said it
//                      did something and did nothing" case, which must settle the Work `failed`
//                      with `no_effect` rather than `completed`.

import { MockLanguageModelV4 } from "ai/test";

const SCRIPT = process.env.CLARA_WORK_TEST_SCRIPT || "post";

function usage() {
  return {
    inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 9, text: 9, reasoning: undefined },
    raw: undefined,
  };
}

/** Every text fragment of a prompt, concatenated — the run envelope lives in here verbatim. */
function promptText(prompt) {
  let out = "";
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") {
      out += `${message.content}\n`;
      continue;
    }
    for (const part of message?.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string") out += `${part.text}\n`;
    }
  }
  return out;
}

/** The tool names this conversation has ALREADY used, read off the prompt's own tool-call and
 *  tool-result parts.
 *
 *  IT MUST NOT BE A SUBSTRING SCAN OF THE WHOLE PROMPT, and that is a measured fact rather than
 *  a preference: the bundle's system instructions NAME both tools ("Call list_accounts FIRST…",
 *  "…never call record_journal_entry again with different figures"), so a `JSON.stringify(prompt)
 *  .includes("list_accounts")` test is TRUE on the very first turn and the script falls straight
 *  through to prose — the Work then settles `failed`/`no_effect` and the e2e reds for a reason
 *  that has nothing to do with the code under test. Reading the structured parts asks the only
 *  question that matters: has this tool actually run yet?
 *
 *  Still INPUT-DRIVEN, never a call counter (tests/mockModel.mjs's discipline): a WDK step that
 *  re-executes after a crash replays the same conversation and therefore takes the same branch. */
function toolsUsed(prompt) {
  const names = new Set();
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part && typeof part === "object" && (part.type === "tool-call" || part.type === "tool-result")) {
        if (typeof part.toolName === "string") names.add(part.toolName);
      }
    }
  }
  return names;
}

/** The envelope line claraWork.v1.impl's `workEnvelopeMessage` writes immediately above the
 *  admitted basis. Anchoring on it is the only stable way in: the basis is read back out of
 *  `jsonb`, and jsonb REORDERS object keys by (length, byte order) — so the serialised envelope
 *  begins `{"memo":…`, never `{"posting_date":…`, and a probe for a leading key name silently
 *  finds nothing and turns this script into the `narrate` one. */
const BASIS_MARKER = "The admitted basis, to be echoed verbatim:";

/** Pull the admitted basis object out of the envelope by BRACE MATCHING from that marker, so the
 *  model echoes the exact bytes it was given rather than a re-serialisation of a parsed copy. */
function admittedBasis(text) {
  const marker = text.lastIndexOf(BASIS_MARKER);
  if (marker < 0) return null;
  const start = text.indexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const model = new MockLanguageModelV4({
  doGenerate: async (options) => {
    const prompt = options?.prompt ?? [];
    const text = promptText(prompt);
    const used = toolsUsed(prompt);

    if (SCRIPT === "narrate") {
      return {
        content: [{ type: "text", text: "I have taken care of the entry." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!used.has("list_accounts")) {
      return {
        content: [{ type: "tool-call", toolCallId: "e2e-accounts", toolName: "list_accounts", input: "{}" }],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!used.has("record_journal_entry")) {
      const basis = admittedBasis(text);
      if (basis === null) {
        return {
          content: [{ type: "text", text: "I could not read the admitted basis from this Work." }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: usage(),
          warnings: [],
        };
      }
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: "e2e-record",
            toolName: "record_journal_entry",
            input: JSON.stringify({ basis, rationale: "the human supplied this basis directly" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    return {
      content: [{ type: "text", text: "Done." }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: usage(),
      warnings: [],
    };
  },
});

globalThis.__claraModelForTest = model;

await import("../scripts/serve.mjs");
