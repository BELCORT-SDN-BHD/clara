// CHILD BOOTSTRAP for tests/chat-turn-v22-e2e.mjs. Installs a scripted model on `globalThis`, then
// hands over to the real supervisor (scripts/serve.mjs) — the same process the production image
// runs, with the same world, the same pools and the same frozen workflow bodies.
//
// A SEPARATE FILE FROM `chat-turn-v21-serve.mjs` ON PURPOSE, for the reason that file gives for not
// widening v20's: that bootstrap is #655/#651/#658's, its chat half is hard-coded to
// `start_trade_invoice_work` and `run_depreciation_period_for_client`, and widening it would put
// this cut's script in the path of a lane that has nothing to do with it. Every predecessor stays
// byte-untouched and all of them still run, on this same image, in the battery beside this leg.
//
// THE SCRIPT IS DRIVEN BY ITS INPUT AND BY THE TOOL RESULTS IT HAS ALREADY SEEN, never by a call
// counter (tests/mockModel.mjs's discipline): a WDK step can RE-EXECUTE after a crash or a replay,
// and a counter would make the resumed attempt behave differently from the original.
//
// THE ONE THING THIS SCRIPT DOES THAT NO PREDECESSOR'S DOES: it READS A TOOL RESULT AND CHANGES ITS
// MIND. #1007's whole contract is that a look-alike comes back as a QUESTION rather than a refusal,
// so the model must be able to see `status: "duplicates_found"` and decide to go ahead. A script
// that called the tool twice unconditionally would prove nothing about that branch — it would
// prove the tool can be called twice, which nobody doubted.
//
// AND THE IDENTIFIER REACHES THE MODEL THROUGH ITS OWN TOOL RESULT, which is v21's ADV-S-1 lesson
// applied rather than restated: the acknowledgement's shown ids come from the probe the TOOL ran,
// never from this script's environment, so no leg here can "work" because the harness knew an id.

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
/**
 * THE PERSON'S OWN WORDS, and only those. `promptText` below reads EVERY message, the SYSTEM one
 * included — and the system message carries the client context pack, which names this client's
 * counterparties. So a cue like "Alpha Supplies" matched on the claim turn too, and the scripted
 * model recorded an invoice on a turn that asked for a claim. Measured on this rig: the claim leg
 * entered the invoice branch with `invoice_answers=0` and the turn stopped on a look-alike question
 * that nobody had asked for.
 *
 * ONE ACT PER TURN IS SELECTED BY THE TURN'S OWN WORDS, which is what the parent's comment has
 * always claimed; this is the function that makes it true.
 */
function userText(prompt) {
  let out = "";
  for (const message of prompt ?? []) {
    if (message?.role !== "user") continue;
    if (typeof message.content === "string") { out += `${message.content}
`; continue; }
    for (const part of message.content ?? []) {
      if (part?.type === "text" && typeof part.text === "string") out += `${part.text}
`;
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

/** EVERY result a named tool has produced in this conversation, oldest first. The duplicate branch
 *  needs the list rather than the first: the second call's answer is its whole subject.
 *
 *  THE NAME IS RESOLVED THROUGH THE CALL, NOT READ OFF THE RESULT, and that is a measurement
 *  rather than caution: on the STREAMING lane a `tool-result` part carries its `toolCallId` but
 *  not always its `toolName`, so a filter on the name alone silently matches nothing and the
 *  script falls through to a branch it was never meant to take. The run lane's own reader
 *  (`chat-turn-v21-serve.mjs`) gets away with the simpler form because `doGenerate`'s prompt does
 *  carry it. */
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

/** THE PROBES. Each one answers a question only the model can answer, and each is printed as ONE
 *  line the parent parses — the two files cannot import each other (this one boots a server on
 *  import), so the literals are duplicated and asserted in both. */
const SPLIT_REFUSED_LINE = "[v22-serve] THE UNCONFIRMED SPLIT WAS REFUSED";
const CLAIM_ACCEPTED_LINE = "[v22-serve] THE CONFIRMED SPLIT WAS ACCEPTED";
let splitRefusalReported = false;
let claimAcceptedReported = false;

function envJson(name) {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const INVOICE_INPUT = envJson("CLARA_V22_INVOICE");
const CLAIM_INPUT = envJson("CLARA_V22_CLAIM");
/** ONE ACT PER TURN, SELECTED BY THE TURN'S OWN WORDS. A script that did everything it could on
 *  every turn is not what a model does, and it would make "the claim landed on turn three" a claim
 *  the parent could not support. The cues are the caller's, so this file invents no phrasing. */
const INVOICE_CUE = process.env.CLARA_V22_INVOICE_CUE || null;
const CLAIM_CUE = process.env.CLARA_V22_CLAIM_CUE || null;
/** THE PERSON'S ANSWER TO THE LOOK-ALIKE QUESTION, in their own words. The cut's fix round made
 *  `duplicates_found` a STOP (`stoppedOnDuplicateQuestionV22`), so the answer cannot come from the
 *  same segment: the turn ends with the question on screen and the person answers in a later turn.
 *  The script therefore keys on what the PERSON said, which is what the real model keys on too —
 *  the conversation's history is text, never tool results (`messageFromParts_v10`), so the question
 *  reaches the next turn as the sentence `withDuplicateQuestionTextV22` appended. */
const GO_AHEAD_CUE = process.env.CLARA_V22_GO_AHEAD_CUE || null;
/** This leg's own client. Every run-lane probe is gated on it, for the reason v21's own bootstrap
 *  writes out: these legs share throwaway databases carrying every earlier run's Works, a fresh
 *  engine's reconciler will dispatch one, and a probe that spoke for a stranger's run would report
 *  somebody else's refusal as this cut's tool failing — intermittently, which is the worst way to
 *  be wrong. */
const CLIENT_ID = process.env.CLARA_V22_CLIENT_ID || null;

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

/** The claim input with the split CONFIRMED. `allocations_confirmed` is tool-local and never
 *  reaches the wire, which is the property the parent measures on the durable row. */
function confirmedClaim(claim) {
  const out = {};
  for (const [key, value] of Object.entries(claim)) out[key] = value;
  out.allocations_confirmed = true;
  return out;
}

/** The invoice input with the person's "record it anyway". Same discipline: one tool-local flag,
 *  no invented uuid, and the shown ids are the TOOL's own measurement. */
function recordAnyway(invoice) {
  const out = {};
  for (const [key, value] of Object.entries(invoice)) out[key] = value;
  out.record_anyway = true;
  return out;
}

const model = new MockLanguageModelV4({
  // THE CHAT HALF. Two acts, and the FIRST one has two branches that depend on what came back.
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
  const wantsInvoice = INVOICE_CUE === null || asked.includes(INVOICE_CUE);
  const wantsClaim = CLAIM_CUE === null || asked.includes(CLAIM_CUE);

  // THE PERSON CAME BACK AND SAID GO AHEAD. A turn of its own, after a human message — which is
  // the only way `record_anyway` can now be set, and the reason the acknowledgement row means
  // something when a reviewer reads it months later.
  //
  // CHECKED BEFORE THE INVOICE CUE, and the order is load-bearing rather than tidy: the go-ahead
  // turn runs in the SAME session, so the person's own words still include the earlier turn's
  // "Record Alpha Supplies' March bill" — and without this order the turn would re-enter the plain
  // recording branch and be asked the same question again forever. Measured: that is exactly what
  // the first run of this reshaped leg did.
  if (INVOICE_INPUT !== null && GO_AHEAD_CUE !== null && asked.includes(GO_AHEAD_CUE)
      && toolOutputs(prompt, "start_trade_invoice_work").length === 0) {
    console.log("[v22-serve] chat call: the person said go ahead; recording with record_anyway");
    return {
      stream: simulateReadableStream({
        chunks: toolChunks("v22i1", "start_trade_invoice_work", recordAnyway(INVOICE_INPUT)),
        chunkDelayInMs: 2,
      }),
    };
  }

  if (INVOICE_INPUT !== null && wantsInvoice) {
    const invoiceAnswers = toolOutputs(prompt, "start_trade_invoice_work");
    // ONE LINE PER CHAT MODEL CALL, NAMING WHAT THE SCRIPT ACTUALLY SAW. It is evidence rather
    // than debugging: "the model changed its mind" is the claim this leg makes, and a run where
    // the script saw no result at all would otherwise look identical to one where it saw a
    // success. The parent does not parse it; a human reading a failure does.
    console.log(`[v22-serve] chat call: invoice_answers=${invoiceAnswers.length} last=${JSON.stringify(
      invoiceAnswers.length === 0 ? null : {
        ok: invoiceAnswers[invoiceAnswers.length - 1]?.ok ?? null,
        status: invoiceAnswers[invoiceAnswers.length - 1]?.status ?? null,
        code: invoiceAnswers[invoiceAnswers.length - 1]?.code ?? null,
        reason: invoiceAnswers[invoiceAnswers.length - 1]?.reason ?? null,
        message: invoiceAnswers[invoiceAnswers.length - 1]?.message ?? null,
      },
    )}`);
    if (invoiceAnswers.length === 0) {
      return {
        stream: simulateReadableStream({
          chunks: toolChunks("v22i0", "start_trade_invoice_work", INVOICE_INPUT),
          chunkDelayInMs: 2,
        }),
      };
    }
    const last = invoiceAnswers[invoiceAnswers.length - 1];
    // A LOOK-ALIKE RESULT CAN NO LONGER REACH THIS SCRIPT AT ALL, and that absence is the control
    // (ADV-C1-02). `stoppedOnDuplicateQuestionV22` ends the segment ON that tool result, so the
    // model is not called again in the turn that asked — which is why the parent reads the question
    // off the TRANSCRIPT (`clara.chat_messages`, the sentence
    // `withDuplicateQuestionTextV22` appended) rather than off a line this file printed. The arm is
    // kept as a wall: if it ever fires, the stop has stopped working, and saying so loudly beats a
    // silent pass.
    if (last && last.ok === true && last.status === "duplicates_found") {
      console.error(
        "[v22-serve] FAULT — the model was asked again AFTER a duplicates_found result, so the "
        + "segment did not stop on it. One segment could then answer its own question.",
      );
      process.exit(97);
    }
  }

  if (CLAIM_INPUT !== null && wantsClaim) {
    const claimAnswers = toolOutputs(prompt, "start_staff_expense_claim_work");
    if (claimAnswers.length === 0) {
      // THE UNCONFIRMED SPLIT FIRST, deliberately. #931's rule is that the register records the
      // list a PERSON confirmed, and the only way to show the tool actually holds that line is to
      // send a split nobody has confirmed and watch it refuse before any round trip.
      return {
        stream: simulateReadableStream({
          chunks: toolChunks("v22c0", "start_staff_expense_claim_work", CLAIM_INPUT),
          chunkDelayInMs: 2,
        }),
      };
    }
    const last = claimAnswers[claimAnswers.length - 1];
    if (last && last.ok === false && last.reason === "advance_split_unconfirmed") {
      if (!splitRefusalReported) {
        splitRefusalReported = true;
        console.log(`${SPLIT_REFUSED_LINE} ${JSON.stringify({
          reason: last.reason,
          constraint: last.details?.constraint ?? null,
          proposed: last.details?.proposed_allocations ?? null,
        })}`);
      }
      // THE MODEL READ THE SPLIT BACK AND THE PERSON AGREED. The list it confirms is the one the
      // refusal handed it, which is why the refusal carries it at all.
      return {
        stream: simulateReadableStream({
          chunks: toolChunks("v22c1", "start_staff_expense_claim_work", confirmedClaim(CLAIM_INPUT)),
          chunkDelayInMs: 2,
        }),
      };
    }
    if (last && last.ok === true && !claimAcceptedReported) {
      claimAcceptedReported = true;
      console.log(`${CLAIM_ACCEPTED_LINE} ${JSON.stringify({ claim_id: last.claim_id ?? null })}`);
    }
  }

  if (used.size === 0) {
    return { stream: simulateReadableStream({ chunks: textChunks("Nothing to record."), chunkDelayInMs: 2 }) };
  }
  return {
    stream: simulateReadableStream({
      chunks: textChunks("I have queued it and kept the choice with the recording."),
      chunkDelayInMs: 2,
    }),
  };
};

// THE RUN HALF — v21's `post` script, carried: read the chart, then record the admitted basis
// VERBATIM. It is deliberately the same script, because the point of this leg's run half is that
// claraWork_v6 serves these Works exactly as v5 served v21's, with a different bundle digest on
// the receipt and one more stanza in its instructions.
model.doGenerate = async (options) => {
  const prompt = options?.prompt ?? [];
  const text = promptText(prompt);
  const used = toolsUsed(prompt);
  const mine = CLIENT_ID === null || text.includes(CLIENT_ID);

  if (!used.has("list_accounts")) {
    return {
      content: [{ type: "tool-call", toolCallId: "v22-accounts", toolName: "list_accounts", input: "{}" }],
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
        toolCallId: "v22-record",
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
