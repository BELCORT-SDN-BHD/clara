// CHILD BOOTSTRAP for tests/chat-turn-v19-e2e.mjs. Installs a scripted model on `globalThis`, then
// hands over to the real supervisor (scripts/serve.mjs) — the same process the production image
// runs, with the same world, the same pools and the same frozen workflow bodies.
//
// A SEPARATE FILE FROM `work-journal-serve.mjs` ON PURPOSE, and the reason is not tidiness. That
// bootstrap is #623's, its chat half is hard-coded to `start_journal_work`, and three other lanes
// spawn it (`work-journal-e2e`, `work-cancel-e2e`, `periodic-adjustment-e2e`). Widening it would
// have put v19's script in the path of every one of them for no benefit; this file leaves all
// three byte-untouched.
//
// ONE MODEL, TWO HALVES, BECAUSE ONE PROCESS RUNS BOTH LANES — `work-journal-serve.mjs`'s own
// note, and it is just as true here. `resolveModel` reads the same `globalThis.__claraModelForTest`
// for every closure in the image: a chatTurn_v19 turn calls `streamText` -> `doStream`, and the
// `claraWork_v2` run that its admitted Work then produces calls `generate()` -> `doGenerate`.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT, NEVER BY A CALL COUNTER (tests/mockModel.mjs's discipline,
// which this lane needs twice over): a WDK step can RE-EXECUTE after a crash or a replay, and a
// counter would make the resumed attempt behave differently from the original.
//
// THE PARTICULARS PROBE IS THE POINT OF THE `doGenerate` HALF HERE. #643's whole design claim is
// that a periodic-adjustment Work runs the EXISTING frozen `clara-work/v2` body byte for byte,
// because the typed particulars live on `clara.accounting_work.adjustment_basis` — a column the
// run never reads and never echoes. That is a claim about what the MODEL WAS SHOWN, and the only
// place it can be measured is inside the model. So this script scans every run prompt for the
// particulars' own field names and prints ONE line if it ever finds them; the e2e asserts that
// line never appeared, beside a positive control that the admitted BASIS did.

import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

function usage() {
  return {
    inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 9, text: 9, reasoning: undefined },
    raw: undefined,
  };
}

function chatUsage() {
  return {
    inputTokens: { total: 4, noCache: 4, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 6, reasoning: undefined, audio: undefined },
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
 *  tool-result parts. NOT a substring scan of the prompt: both system prompts NAME their tools, so
 *  a text probe is true on the very first turn (work-journal-serve.mjs measured that). */
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

/** 0194's own particulars field names — the ones that exist ONLY on `adjustment_basis` and appear
 *  in no journal basis. `instruction` and `period_start` are deliberately absent from this list:
 *  the first could legitimately reach a memo and the second is a date shape, so either could raise
 *  a false alarm. These four cannot. */
const PARTICULAR_MARKERS = ["adjustment_basis", "particulars_source", "count_reference", "inventory_account_code", "obligation_kind"];
const PARTICULARS_LEAK_LINE = "[v19-serve] ADJUSTMENT PARTICULARS REACHED THE RUN PROMPT";
let leakReported = false;

const ADJUSTMENT_INPUT = (() => {
  const raw = process.env.CLARA_V19_ADJUSTMENT;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
})();

const KNOWLEDGE_INPUT = (() => {
  const raw = process.env.CLARA_V19_KNOWLEDGE;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
})();

function textChunks(text) {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    ...text.split(" ").map((w) => ({ type: "text-delta", id: "t1", delta: `${w} ` })),
    { type: "text-end", id: "t1" },
    { type: "finish", usage: chatUsage(), finishReason: { unified: "stop", raw: "stop" } },
  ];
}

function toolChunks(id, toolName, input) {
  const payload = JSON.stringify(input);
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: payload },
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName, input: payload },
    { type: "finish", usage: chatUsage(), finishReason: { unified: "tool-calls", raw: "tool_use" } },
  ];
}

const model = new MockLanguageModelV4({
  // THE CHAT HALF. One turn, up to two acts, in the order a human would ask for them: queue the
  // adjustment, then remember the fact. Input-driven, so a re-executed segment takes the same
  // branch and the tools' own deterministic keys make the replay idempotent rather than doubled.
  doStream: async (options) => {
    const used = toolsUsed(options?.prompt ?? []);
    if (ADJUSTMENT_INPUT !== null && !used.has("start_periodic_adjustment_work")) {
      return { stream: simulateReadableStream({ chunks: toolChunks("v19a", "start_periodic_adjustment_work", ADJUSTMENT_INPUT), chunkDelayInMs: 2 }) };
    }
    if (KNOWLEDGE_INPUT !== null && !used.has("remember_client_information")) {
      return { stream: simulateReadableStream({ chunks: toolChunks("v19k", "remember_client_information", KNOWLEDGE_INPUT), chunkDelayInMs: 2 }) };
    }
    return { stream: simulateReadableStream({ chunks: textChunks("I have queued that and noted the fact."), chunkDelayInMs: 2 }) };
  },

  // THE RUN HALF — `work-journal-serve.mjs`'s `post` script, carried, plus the particulars probe.
  doGenerate: async (options) => {
    const prompt = options?.prompt ?? [];
    const text = promptText(prompt);
    const used = toolsUsed(prompt);

    if (!leakReported) {
      const found = PARTICULAR_MARKERS.filter((marker) => text.includes(marker));
      if (found.length > 0) {
        leakReported = true;
        console.log(`${PARTICULARS_LEAK_LINE} (${found.join(",")})`);
      }
    }

    if (!used.has("list_accounts")) {
      return {
        content: [{ type: "tool-call", toolCallId: "v19-accounts", toolName: "list_accounts", input: "{}" }],
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
            toolCallId: "v19-record",
            toolName: "record_journal_entry",
            input: JSON.stringify({ basis, rationale: "the human supplied these particulars in conversation" }),
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
