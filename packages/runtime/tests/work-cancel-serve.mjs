// CHILD BOOTSTRAP for tests/work-cancel-e2e.mjs (#630). The work-journal-serve.mjs shape —
// install a scripted model on `globalThis`, then hand over to the real supervisor
// (scripts/serve.mjs) — with ONE addition: the script can be made to HOLD before it calls
// `record_journal_entry`, until a gate file appears.
//
// WHY A GATE FILE AND NOT A TEST FAULT. The deterministic windows this e2e needs are
// BEFORE-ADMISSION ones: the human presses Cancel while the model is still deciding. The existing
// `CLARA_WORK_TEST_FAULT` hooks (`exit_after_commit`, `exit_before_deliver`, `stall_deliver`) all
// live in FROZEN files (claraWork.v2.tools.ts, and lib/control.mjs's own delivery path) and
// `claraWork_v2` is deploy-locked — a new fault there would mean a whole new version file set for a
// test affordance, which is exactly what the estate's freeze policy exists to prevent. This file is
// a TEST file and is not frozen, so the hold lives here, in the model, where the window actually is.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT, NEVER BY A CALL COUNTER — the discipline the two sibling serve
// files state, and this lane needs it for the same reason: a WDK step re-executes after a crash, and
// a counter would make the resumed attempt take a different branch from the original.
//
// THE HOLD IS BOUNDED. A gate that never opens releases after `CLARA_WORK_CANCEL_HOLD_MS` (default
// 20s) rather than hanging the engine for ever: a hung run would make every downstream assertion a
// timeout instead of a measurement, and a test that can only fail by timing out says nothing about
// what it was testing.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

const GATE = process.env.CLARA_WORK_CANCEL_GATE || null;
const HELD_MARKER = process.env.CLARA_WORK_CANCEL_HELD || null;
const HOLD_MS = Number(process.env.CLARA_WORK_CANCEL_HOLD_MS || 20000);
const POLL_MS = 50;

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

/** The tool names this conversation has ALREADY used, read off the STRUCTURED parts rather than by
 *  scanning the prompt text: the bundle's instructions NAME all three tools, so a substring probe
 *  is true on the very first turn and the script never calls anything. */
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Announce that the model has reached the hold, then wait for the gate. The marker is written
 *  BEFORE the first poll so a cell can wait for "the model is now inside the window" rather than
 *  sleeping a guessed number of milliseconds. */
async function waitForGate() {
  if (GATE === null) return "no_gate";
  if (HELD_MARKER !== null) {
    try {
      mkdirSync(dirname(HELD_MARKER), { recursive: true });
      writeFileSync(HELD_MARKER, String(Date.now()));
    } catch {
      /* a marker we cannot write is not worth failing the run over */
    }
  }
  const deadline = Date.now() + HOLD_MS;
  while (Date.now() < deadline) {
    if (existsSync(GATE)) return "opened";
    await sleep(POLL_MS);
  }
  return "timed_out";
}

const model = new MockLanguageModelV4({
  // THE CHAT HALF NARRATES AND STOPS. This e2e drives one chat turn (the "Stop reply is not Cancel
  // Work" leg) and a shared database can carry other lanes' leftover `chat_turn` tasks, so the
  // streaming half must answer rather than throw.
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: "This process is running the work-cancel e2e." },
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
    // THE LAST TOOL RESULT, echoed to stderr. The e2e's legs are about WHICH refusal reached the
    // model, and a branch trace that does not carry the refusal makes a diagnosis impossible.
    for (const message of prompt ?? []) {
      if (typeof message?.content === "string") continue;
      for (const part of message?.content ?? []) {
        if (part?.type === "tool-result") {
          console.error(`[wc-serve] tool-result ${part.toolName}: ${JSON.stringify(part.output ?? part.result ?? null).slice(0, 400)}`);
        }
      }
    }

    if (!used.has("list_accounts")) {
      console.error("[wc-serve] branch: list_accounts");
      return {
        content: [{ type: "tool-call", toolCallId: "wc-accounts", toolName: "list_accounts", input: "{}" }],
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
      // THE WINDOW. Everything the cancel legs need happens while this await is pending: the Work
      // is `running`, the run holds the task, and NOTHING has been admitted.
      console.error("[wc-serve] branch: record_journal_entry (entering hold)");
      const gate = await waitForGate();
      console.error(`[wc-serve] hold released: ${gate}`);
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: "wc-record",
            toolName: "record_journal_entry",
            input: JSON.stringify({ basis, rationale: "the human supplied this basis directly" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    // THE SECOND ATTEMPT. A refused `record_journal_entry` classified `state_changed` hands the
    // model a repair turn, and what it does with it is exactly what "admit no new business action
    // after cancellation" has to survive: it tries the SAME admitted basis again, and the boundary
    // refuses it again. Trying is legal; succeeding is not.
    const basis = admittedBasis(text);
    if (basis !== null && !text.includes("wc-record-2")) {
      console.error("[wc-serve] branch: record_journal_entry retry");
      return {
        content: [
          {
            type: "tool-call",
            toolCallId: "wc-record-2",
            toolName: "record_journal_entry",
            input: JSON.stringify({ basis, rationale: "retrying the admitted basis" }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "tool_use" },
        usage: usage(),
        warnings: [],
      };
    }

    console.error("[wc-serve] branch: done");
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
