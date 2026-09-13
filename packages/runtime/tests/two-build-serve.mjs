// CHILD BOOTSTRAP for tests/two-build-cutover-e2e.mjs (#637). The work-question-serve.mjs shape —
// install a scripted model on `globalThis`, then hand over to the real supervisor — with ONE
// difference that is the whole point of this file: it hands over to whichever `scripts/serve.mjs`
// `CLARA_TWO_BUILD_SERVE` names, so the SAME child bootstrap boots build A (the scratch image,
// pinned one version back) and build B (this tree's own build).
//
// THE SCRIPT MUST DRIVE TWO DIFFERENT FROZEN BODIES, AND IT MAY NOT KNOW WHICH ONE IT IS IN.
// That is not a puzzle, it is the discipline every scripted model in this suite already follows:
// branch on the INPUT, never on a call counter (a counter makes a resumed attempt take a different
// branch from the original, which is exactly the property a cutover drill exists to measure).
// Here the input carries the answer structurally — the two bodies' `ask_question` schemas are both
// `.strict()` and materially different:
//
//   claraWork_v1  { question, context? }                       -> a BARE clarify
//   claraWork_v2  { question, reason, context?, source_ref?, fields[1..6] }  -> a typed Work question
//
// So the script reads the `ask_question` tool's OWN JSON schema out of the call options and emits
// the input that schema accepts. A strict schema would reject the other shape outright, so a wrong
// detection fails LOUDLY at the tool call rather than silently taking a different path.
//
// THE RECORDED BASIS IS THE ADMITTED ONE, VERBATIM. `clara.admit_journal_work` digests the basis
// before the run exists and `clara._record_journal_entry_core` refuses any echo that does not hash
// to it, so the answer cannot CHANGE what is posted in this lane — it unblocks the model. Same
// constraint work-question-serve.mjs states, unchanged.

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

const serveTarget = process.env.CLARA_TWO_BUILD_SERVE;
if (!serveTarget) throw new Error("two-build-serve needs CLARA_TWO_BUILD_SERVE to name the scripts/serve.mjs to boot");

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

/** Tool names this conversation has ALREADY used, read off the STRUCTURED parts rather than the
 *  prompt text: the bundle's instructions NAME all three tools, so a substring probe is true on
 *  the very first turn and the script would never call anything. */
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

/** TRUE once the human's ANSWER has come back as this tool's result — both bodies feed it in as a
 *  `tool-result` for `ask_question`, so its presence IS the resume, structurally. */
function answerArrived(prompt) {
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part?.type === "tool-result" && part.toolName === "ask_question") return true;
    }
  }
  return false;
}

/**
 * WHICH BODY AM I IN — answered from the `ask_question` tool's own declared schema, which the
 * provider is handed on every call. `fields` is required by v2's schema and absent from v1's, and
 * both are `.strict()`.
 *
 * The prose fallback exists because a provider-options shape is a library contract that can change
 * under us, and a silent mis-detection here would be a drill that passed while proving nothing.
 * `one to six TYPED fields` appears in the v2 instruction block and zero times in v1's (measured).
 */
function wantsTypedFields(options) {
  for (const t of options?.tools ?? []) {
    const name = t?.name ?? t?.function?.name;
    if (name !== "ask_question") continue;
    const schema = t?.inputSchema ?? t?.parameters ?? t?.function?.parameters ?? null;
    if (schema && typeof schema === "object") {
      const props = schema.properties ?? {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      return Object.prototype.hasOwnProperty.call(props, "fields") || required.includes("fields");
    }
  }
  return /one to six TYPED fields/.test(promptText(options?.prompt));
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

const QUESTION = "Which date should this be posted on, and for how much?";
const REASON = "The instruction named a payment but I have not been told which day it cleared or the exact amount.";

/** v2's typed pair — the exact pair the browser's bounded stepper renders and the exact pair
 *  `clara._assert_work_answer` validates by kind. */
const TYPED_FIELDS = [
  { key: "posting_date", label: "Posting date", kind: "date", required: true },
  { key: "amount_cents", label: "Amount", kind: "money", required: true, unit: "MYR cents" },
];

const model = new MockLanguageModelV4({
  // The CHAT half narrates and stops. This e2e drives no chat turn, but a shared database carries
  // other lanes' leftover `chat_turn` tasks and a world that boots here will pick them up. A
  // throwing model would turn somebody else's leftover into a failure this file did not cause.
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "This process is running the two-build cutover e2e." },
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
        content: [{ type: "tool-call", toolCallId: "tb-accounts", toolName: "list_accounts", input: "{}" }],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!used.has("ask_question")) {
      const input = wantsTypedFields(options)
        ? { question: QUESTION, reason: REASON, fields: TYPED_FIELDS }
        : { question: QUESTION };
      return {
        content: [{ type: "tool-call", toolCallId: "tb-ask", toolName: "ask_question", input: JSON.stringify(input) }],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    if (!answerArrived(prompt)) {
      // The question is on the wire and no answer has come back. Saying anything here would settle
      // the Work `no_effect` over a question a human is still holding — this branch exists only to
      // be LOUD if the park ever fails to park.
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
            toolCallId: "tb-record",
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

await import(new URL(`file://${serveTarget.replace(/\\/g, "/")}`).href);
