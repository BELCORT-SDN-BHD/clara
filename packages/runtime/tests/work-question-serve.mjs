// CHILD BOOTSTRAP for tests/work-question-e2e.mjs (#629). The same shape work-journal-serve.mjs
// carries — install a scripted model on `globalThis`, then hand over to the real supervisor
// (scripts/serve.mjs) — with ONE difference: the script ASKS A TYPED QUESTION between reading the
// chart and recording the entry, which is what `claraWork_v2` exists to do.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT, NEVER BY A CALL COUNTER. That discipline matters more here
// than anywhere else in this repo: a WDK step re-executes after a crash AND after a park/resume,
// and a counter would make the resumed attempt take a different branch from the original — which
// is exactly the property the crash legs exist to measure. Every branch below is chosen by reading
// the STRUCTURED tool-call/tool-result parts of the prompt the model was handed.
//
// THE RECORDED BASIS IS THE ADMITTED ONE, VERBATIM, AND THAT IS A CONSTRAINT RATHER THAN A CHOICE.
// `clara.admit_journal_work` digests the basis BEFORE the run exists and
// `clara._record_journal_entry_core` refuses any echo that does not hash to it (`basis_mismatch`).
// So an answered value cannot CHANGE what is posted in this lane; what the answer does is unblock
// the model, and the e2e asserts that the accepted answer's values are the ones the posted entry
// carries. A question whose answer COMPLETES an incomplete basis would need an admission path that
// admits one — a real finding for a later ticket, recorded here rather than faked.

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

function usage() {
  return {
    inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 9, text: 9, reasoning: undefined },
    raw: undefined,
  };
}

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

/** The tool names this conversation has ALREADY used, read off the STRUCTURED parts rather than
 *  by scanning the prompt text: the bundle's instructions NAME all three tools, so a substring
 *  probe is true on the very first turn and the script never calls anything. */
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

/** TRUE once the human's ANSWER has come back as this tool's result — the workflow feeds it in as
 *  a `tool-result` for `ask_question`, so its presence is the resume, structurally. */
function answerArrived(prompt) {
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part?.type === "tool-result" && part.toolName === "ask_question") return true;
    }
  }
  return false;
}

const BASIS_MARKER = "The admitted basis, to be echoed verbatim:";

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

/** THE TWO-FIELD QUESTION this lane asks: a date and an amount in integer cents — the exact pair
 *  the browser's bounded stepper renders and the exact pair `clara._assert_work_answer` validates
 *  by kind. */
const ASK_INPUT = {
  question: "Which date should this be posted on, and for how much?",
  reason: "The instruction named a payment but I have not been told which day it cleared or the exact amount.",
  fields: [
    { key: "posting_date", label: "Posting date", kind: "date", required: true },
    { key: "amount_cents", label: "Amount", kind: "money", required: true, unit: "MYR cents" },
  ],
};

const model = new MockLanguageModelV4({
  // THE CHAT HALF NARRATES AND STOPS. This e2e drives no chat turn — but a shared CI database
  // carries OTHER lanes' leftover `chat_turn` tasks, and a world that boots here will pick them
  // up. A throwing model would turn somebody else's leftover into a failure this file did not
  // cause, so the honest stub is a plain sentence.
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "This process is running the work-question e2e." },
        { type: "text-end", id: "t1" },
        {
          type: "finish",
          usage: { inputTokens: { total: 4, noCache: 4 }, outputTokens: { total: 6 }, raw: undefined },
          finishReason: { unified: "stop", raw: "stop" },
        },
      ],
      chunkDelayInMs: 2,
    }),
  }),
  doGenerate: async (options) => {
    const prompt = options?.prompt ?? [];
    const text = promptText(prompt);
    const used = toolsUsed(prompt);

    if (!used.has("list_accounts")) {
      return {
        content: [{ type: "tool-call", toolCallId: "wq-accounts", toolName: "list_accounts", input: "{}" }],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!used.has("ask_question")) {
      return {
        content: [{ type: "tool-call", toolCallId: "wq-ask", toolName: "ask_question", input: JSON.stringify(ASK_INPUT) }],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!answerArrived(prompt)) {
      // The question is on the wire but no answer has come back. Saying anything here would settle
      // the Work `no_effect` over a question a human is still holding — so this branch exists only
      // to be LOUD if the park ever fails to park.
      return {
        content: [{ type: "text", text: "I am waiting on the answer to my question." }],
        finishReason: { unified: "stop", raw: "stop" },
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
            toolCallId: "wq-record",
            toolName: "record_journal_entry",
            input: JSON.stringify({ basis, rationale: "the human answered the date and the amount" }),
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
