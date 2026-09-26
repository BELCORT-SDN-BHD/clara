// CHILD BOOTSTRAP for tests/chat-turn-v23-e2e.mjs. Installs a scripted model on `globalThis`, then
// hands over to the real supervisor (scripts/serve.mjs) — the same process the production image
// runs, with the same world, the same pools and the same frozen workflow bodies.
//
// A SEPARATE FILE FROM `chat-turn-v22-serve.mjs` ON PURPOSE, for the reason that file gives for not
// widening v21's: that bootstrap is #985/#1007/#931's, its chat half is hard-coded to the trade
// invoice and the claim allocation, and widening it would put this cut's script in the path of a
// lane that has nothing to do with it. Every predecessor stays byte-untouched and all of them still
// run, on this same image, in the battery beside this leg.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT AND BY THE TOOL RESULTS IT HAS ALREADY SEEN, never by a call
// counter (tests/mockModel.mjs's discipline): a WDK step can RE-EXECUTE after a crash or a replay,
// and a counter would make the resumed attempt behave differently from the original.
//
// EVERY IDENTIFIER THE NEW TOOLS TAKE REACHES THIS SCRIPT THROUGH THE PERSON'S OWN WORDS, and that
// is v21's ADV-S-1 lesson applied rather than restated. In that round three tools were "reachable"
// only because the harness supplied an id out of band, so a tool whose only identifier never
// appeared in the prompt still looked like it worked. Here the document and the client are parsed
// out of the USER's message and nowhere else — `process.env` carries the CUES, never an id.

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

/** THE PERSON'S OWN WORDS, and only those — v22's own reader, and for its measured reason: the
 *  SYSTEM message carries the client context pack, which names this client's counterparties, so a
 *  cue matched against the whole prompt fires on turns that never asked for it. */
function userText(prompt) {
  let out = "";
  for (const message of prompt ?? []) {
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") { out += `${message.content}\n`; continue; }
    for (const part of message.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string") out += `${part.text}\n`;
    }
  }
  return out;
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

/** The tool names this conversation has ALREADY used, read off its own tool-call and tool-result
 *  parts. NOT a substring scan: both system prompts NAME their tools, so a text probe is true on
 *  the very first turn. */
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

/** EVERY result a named tool has produced in this conversation, oldest first. THE NAME IS RESOLVED
 *  THROUGH THE CALL, NOT READ OFF THE RESULT — on the STREAMING lane a `tool-result` part carries
 *  its `toolCallId` but not always its `toolName`, so a filter on the name alone silently matches
 *  nothing and the script falls through to a branch it was never meant to take (v22's measurement). */
function toolOutputs(prompt, toolName) {
  const nameOfCall = new Map();
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part?.type === "tool-call" && typeof part.toolName === "string" && part.toolCallId !== undefined) {
        nameOfCall.set(String(part.toolCallId), part.toolName);
      }
    }
  }
  const out = [];
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part?.type !== "tool-result") continue;
      const named = typeof part.toolName === "string" ? part.toolName : nameOfCall.get(String(part.toolCallId));
      if (named !== toolName) continue;
      const raw = part.output;
      if (raw === null || raw === undefined) continue;
      if (typeof raw === "object" && raw.type === "json") out.push(raw.value ?? null);
      else if (typeof raw === "string") {
        try {
          out.push(JSON.parse(raw));
        } catch {
          /* a non-JSON result is not this script's business */
        }
      } else out.push(raw);
    }
  }
  return out;
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

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** THE IDENTIFIER, OUT OF THE PERSON'S OWN MESSAGE. If it is not there, this script has nothing to
 *  call the tool with — which is the honest failure and the one v21's ADV-S-1 asked for. */
function idFromWords(asked) {
  const m = UUID_RE.exec(asked);
  return m === null ? null : m[0];
}

/** THE PROBES. Each one answers a question only the model can answer, and each is printed as ONE
 *  line the parent parses — the two files cannot import each other (this one boots a server on
 *  import), so the literals are duplicated and asserted in both. */
const TENANCY_LINE = "[v23-serve] THE TENANCY READ ANSWERED";
const RENT_LINE = "[v23-serve] THE RENT CANDIDATE READ ANSWERED";
let tenancyReported = false;
let rentReported = false;

function envJson(name) {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const INVOICE_INPUT = envJson("CLARA_V23_INVOICE");
/** ONE ACT PER TURN, SELECTED BY THE TURN'S OWN WORDS. The cues are the caller's, so this file
 *  invents no phrasing; the IDENTIFIERS are never cues and never env. */
const INVOICE_CUE = process.env.CLARA_V23_INVOICE_CUE || null;
const TENANCY_CUE = process.env.CLARA_V23_TENANCY_CUE || null;
const RENT_CUE = process.env.CLARA_V23_RENT_CUE || null;
/** This leg's own client, for the RUN half only. Every run-lane probe is gated on it, for the
 *  reason v21's and v22's bootstraps write out: these legs share throwaway databases carrying
 *  every earlier run's Works, a fresh engine's reconciler will dispatch one, and a probe that
 *  spoke for a stranger's run would report somebody else's refusal as this cut's tool failing —
 *  intermittently, which is the worst way to be wrong. */
const CLIENT_ID = process.env.CLARA_V23_CLIENT_ID || null;

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
  doStream: async () => ({ stream: simulateReadableStream({ chunks: textChunks("Nothing to do."), chunkDelayInMs: 2 }) }),
  doGenerate: async () => ({
    content: [{ type: "text", text: "Done." }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: usage(),
    warnings: [],
  }),
});

model.doStream = async (options) => {
  const prompt = options?.prompt ?? [];
  const used = toolsUsed(prompt);
  // THE TURN'S OWN WORDS, never the system message's (see `userText`).
  const asked = userText(prompt);

  // ---- THE TENANCY READ (#949 item 1, `read_tenancy_terms`) ----------------------------------
  if (TENANCY_CUE !== null && asked.includes(TENANCY_CUE)) {
    const answers = toolOutputs(prompt, "read_tenancy_terms");
    if (answers.length === 0) {
      const documentId = idFromWords(asked);
      if (documentId === null) {
        console.error("[v23-serve] FAULT — the person named no document, so there is nothing to read.");
        return { stream: simulateReadableStream({ chunks: textChunks("You have not told me which agreement."), chunkDelayInMs: 2 }) };
      }
      console.log(`[v23-serve] chat call: reading the tenancy the person named (${documentId})`);
      return {
        stream: simulateReadableStream({
          chunks: toolChunks("v23t0", "read_tenancy_terms", { document_id: documentId }),
          chunkDelayInMs: 2,
        }),
      };
    }
    const last = answers[answers.length - 1];
    if (!tenancyReported) {
      tenancyReported = true;
      console.log(`${TENANCY_LINE} ${JSON.stringify({
        ok: last?.ok ?? null,
        code: last?.code ?? null,
        reason: last?.reason ?? null,
        message: last?.message ?? null,
      })}`);
    }
    return {
      stream: simulateReadableStream({
        chunks: textChunks("That is what the tenancy read came back with."),
        chunkDelayInMs: 2,
      }),
    };
  }

  // ---- THE RENT CANDIDATES READ (#949 item 4) ------------------------------------------------
  if (RENT_CUE !== null && asked.includes(RENT_CUE)) {
    const answers = toolOutputs(prompt, "read_rent_settlement_candidates");
    if (answers.length === 0) {
      const clientId = idFromWords(asked);
      if (clientId === null) {
        console.error("[v23-serve] FAULT — the person named no client, so there is nothing to read.");
        return { stream: simulateReadableStream({ chunks: textChunks("You have not told me whose rent."), chunkDelayInMs: 2 }) };
      }
      console.log(`[v23-serve] chat call: reading the rent months the person named (${clientId})`);
      return {
        stream: simulateReadableStream({
          chunks: toolChunks("v23r0", "read_rent_settlement_candidates", { client_id: clientId }),
          chunkDelayInMs: 2,
        }),
      };
    }
    const last = answers[answers.length - 1];
    if (!rentReported) {
      rentReported = true;
      console.log(`${RENT_LINE} ${JSON.stringify({
        ok: last?.ok ?? null,
        status: last?.status ?? null,
        months: Array.isArray(last?.months) ? last.months.length : null,
        deposits: Array.isArray(last?.deposits) ? last.deposits.length : null,
        empty_sentence: last?.empty_sentence ?? null,
        code: last?.code ?? null,
        reason: last?.reason ?? null,
      })}`);
    }
    return {
      stream: simulateReadableStream({
        chunks: textChunks("That is every month still waiting, and I have chosen none of them."),
        chunkDelayInMs: 2,
      }),
    };
  }

  // ---- THE WORK ADMISSION, so claraWork_v7 has a run to serve ---------------------------------
  if (INVOICE_INPUT !== null && INVOICE_CUE !== null && asked.includes(INVOICE_CUE)
      && toolOutputs(prompt, "start_trade_invoice_work").length === 0) {
    return {
      stream: simulateReadableStream({
        chunks: toolChunks("v23i0", "start_trade_invoice_work", INVOICE_INPUT),
        chunkDelayInMs: 2,
      }),
    };
  }

  if (used.size === 0) {
    return { stream: simulateReadableStream({ chunks: textChunks("Nothing to do."), chunkDelayInMs: 2 }) };
  }
  return {
    stream: simulateReadableStream({
      chunks: textChunks("I have queued it."),
      chunkDelayInMs: 2,
    }),
  };
};

// THE RUN HALF — v22's `post` script, carried: read the chart, then record the admitted basis
// VERBATIM. It is deliberately the same script, because the point of this leg's run half is that
// claraWork_v7 serves these Works exactly as v6 served v22's, with a different bundle digest on
// the receipt.
model.doGenerate = async (options) => {
  const prompt = options?.prompt ?? [];
  const text = promptText(prompt);
  const used = toolsUsed(prompt);
  const mine = CLIENT_ID === null || text.includes(CLIENT_ID);

  if (!used.has("list_accounts")) {
    return {
      content: [{ type: "tool-call", toolCallId: "v23-accounts", toolName: "list_accounts", input: "{}" }],
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
      content: [{
        type: "tool-call",
        toolCallId: "v23-record",
        toolName: "record_journal_entry",
        input: JSON.stringify({
          basis,
          rationale: mine
            ? "the human supplied these particulars in conversation"
            : "an earlier run of this rig; not this leg's Work",
        }),
      }],
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
};

globalThis.__claraModelForTest = model;

await import("../scripts/serve.mjs");
