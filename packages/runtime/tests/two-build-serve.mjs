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

// #794 — AND IT NOW DRIVES THE CHAT LANE TOO, under the SAME discipline. The drill's chatTurn leg
// needs a turn PARKED ON A CLARIFICATION (chatTurn has no Work row to resume through), so the chat
// half can no longer only narrate. It emits the frozen `clarify` tool call — the AI SDK
// human-in-the-loop stop primitive every chatTurn version from v1 on carries, with no `execute`, so
// the runtime parks the run on it.
//
// IT BRANCHES ON THE TURN'S OWN TEXT, never on a call counter, for the reason this file's header
// already gives — and here that choice buys a second thing: a shared rig carries OTHER lanes'
// leftover `chat_turn` tasks, and a chat half that clarified unconditionally would park somebody
// else's turn on a question no one will answer. Only a turn carrying this drill's own marker is
// clarified; every other turn gets the narration this file always sent.

// #1037 - AND IT NOW DRIVES THE statementFacts LANE TOO, under the same discipline and for the
// third leg's own reason. That lane's two channels are `generateObject` calls, not tool calls, so
// the branch below reads the RESPONSE SCHEMA the SDK is handed rather than any prompt text: a
// statement call is one whose schema declares a `lines` array of rows carrying
// `running_balance_cents`, and the VISION channel is the one whose converted prompt carries a
// file part. Neither probe names a version, so a v3 call and a v4 call are both recognised - which
// is exactly what a cutover drill needs, since the parked run keeps answering v3's five-key line
// schema inside an image that pins v4's six-key one.
//
// THE PARK IS THE HOLD, AND THE HOLD IS A FACT ABOUT THE WORLD, NOT A CALL COUNTER. statementFacts
// has no interruption point: its body is claim -> two reads -> one persist, with nothing a human
// answers. So the drill parks the run by holding this channel OPEN - the model call simply does
// not return - until the drill writes its answer file (`CLARA_STMT_DRILL_ANSWER`). That file does
// not exist while build A runs, so build A's run sits non-terminal on the predecessor body; the
// drill stops build A, writes the file, and build B's engine redelivers the same step to a child
// that now answers. A counter would make the resumed attempt take a different branch from the
// original, which is the one thing this file's header forbids; a file on disk is the same input on
// every attempt, and it is the drill that changes the world between them.
//
// A CALL WITH NO ANSWER FILE AND NO DRILL IS NOT HELD. `CLARA_STMT_DRILL_ANSWER` unset means no
// statementFacts leg is running in this process, and a shared rig's leftover statement tasks must
// not be parked on a file nobody will write: they get the loud refusal below instead, which the
// lane classifies and settles on its own terms.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

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

/** #794 — TRUE once the human's answer to the CHAT clarification has come back as a tool result.
 *  Structurally identical to `answerArrived` above and deliberately a separate function: the two
 *  lanes' doors are different tools, and one predicate serving both would make a Work answer look
 *  like a chat answer to a process running both lanes at once. Every chatTurn version feeds the
 *  answer back as a `tool-result` for `clarify` (chatTurn.vNN.ts's resume arm), so its presence IS
 *  the resume, structurally — the same property the Work half relies on. */
function clarifyAnswered(prompt) {
  for (const message of prompt ?? []) {
    if (typeof message?.content === "string") continue;
    for (const part of message?.content ?? []) {
      if (part?.type === "tool-result" && part.toolName === "clarify") return true;
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

/** #794 — THE MARKER THE DRILL'S OWN TURN CARRIES. Spelled here and in
 *  tests/two-build-cutover-e2e.mjs, never imported across: importing THIS file boots a server, so
 *  the two cannot share a module, and the duplicated literal is asserted from both sides (the
 *  chat-turn-v19-e2e/serve pair's own precedent for the same constraint). */
const CHAT_DRILL_MARKER = "TWO-BUILD CHAT CUTOVER DRILL";
const CHAT_QUESTION = "Which period should I book this against?";
const CHAT_CONTEXT = "The two-build cutover drill parks this turn on purpose.";

function chatUsage() {
  return { inputTokens: { total: 4, noCache: 4 }, outputTokens: { total: 6 }, raw: undefined };
}

function narrationChunks(text) {
  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish", usage: chatUsage(), finishReason: { unified: "stop", raw: "stop" } },
  ];
}

/** The frozen `clarify` call, in the streaming shape `streamText` consumes. `clarify` has NO
 *  `execute` in any chatTurn version, so `hasToolCall("clarify")` stops the segment and the body
 *  parks the run on `clara.open_interruption`. */
function clarifyChunks() {
  const input = JSON.stringify({ question: CHAT_QUESTION, context: CHAT_CONTEXT });
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id: "tb-clarify", toolName: "clarify" },
    { type: "tool-input-delta", id: "tb-clarify", delta: input },
    { type: "tool-input-end", id: "tb-clarify" },
    { type: "tool-call", toolCallId: "tb-clarify", toolName: "clarify", input },
    { type: "finish", usage: chatUsage(), finishReason: { unified: "tool-calls", raw: "tool_use" } },
  ];
}

/** #1037 - the path the drill writes its scripted statement answer to, once build A is stopped.
 *  Unset in every other run of this child, which is what keeps the hold below scoped to the leg. */
const STMT_ANSWER_PATH = process.env.CLARA_STMT_DRILL_ANSWER || null;
/** The marker this child touches the INSTANT it starts holding a statement channel. The drill
 *  waits for it rather than for a clock, so "the run is parked inside the read" is evidence the
 *  held process itself produced, not an inference from a row that merely says 'running'. */
const STMT_HELD_PATH = process.env.CLARA_STMT_DRILL_HELD || null;
/** How long a held channel waits before giving up. Generous against a scratch build plus a boot
 *  (the drill's own watchdog is 15 minutes), bounded so a broken leg fails loudly instead of
 *  hanging this child for the life of the drill. */
const STMT_HOLD_DEADLINE_MS = 10 * 60 * 1000;
const STMT_HOLD_POLL_MS = 200;

/** TRUE for a statement-witness `generateObject` call, read off the SCHEMA THE SDK IS HANDED - the
 *  structural fact, not a sentence. `running_balance_cents` is a statement row's own key and
 *  appears in no other schema this runtime sends (measured: it is declared in
 *  statementFacts.v2.prompts.mjs's line shape and in v4's, and nowhere else). */
function isStatementCall(options) {
  const schema = options?.responseFormat?.schema;
  const line = schema?.properties?.lines?.items?.properties;
  return Boolean(line && Object.prototype.hasOwnProperty.call(line, "running_balance_cents"));
}

/** The channel, told apart the way f-a1-witness-fixtures.mjs tells it apart: the VISION channel is
 *  the one whose converted prompt carries a file part. */
function statementChannel(options) {
  const parts = (options?.prompt ?? []).flatMap((m) => (Array.isArray(m?.content) ? m.content : []));
  return parts.some((p) => p?.type === "file") ? "vision" : "text";
}

/** TRUE when this call's schema is v4's - it declares the citation index. Read for the SAME reason
 *  `wantsTypedFields` reads the ask_question schema: the two bodies answer different vocabularies
 *  and a wrong shape must fail at the schema, loudly, rather than quietly take the other path. */
function wantsRegionIdx(options) {
  const line = options?.responseFormat?.schema?.properties?.lines?.items?.properties;
  return Boolean(line && Object.prototype.hasOwnProperty.call(line, "region_idx"));
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for the drill's answer file and return what it says. THE HOLD - see this file's header. */
async function awaitStatementAnswer() {
  if (!STMT_ANSWER_PATH) {
    throw Object.assign(
      new Error("no statementFacts drill is running in this process (CLARA_STMT_DRILL_ANSWER unset) - this child will not answer a statement channel it was not asked to drive"),
      { code: "internal" },
    );
  }
  // Read ONCE before announcing the hold: on the resume the answer is already there, and a child
  // that announced a hold it never took would tell the drill a park happened twice.
  if (!existsSync(STMT_ANSWER_PATH) && STMT_HELD_PATH) {
    try {
      writeFileSync(STMT_HELD_PATH, `${new Date().toISOString()} pid=${process.pid}\n`);
    } catch {
      /* the drill's own timeout is the backstop; a marker we cannot write is not worth failing a read for */
    }
  }
  const end = Date.now() + STMT_HOLD_DEADLINE_MS;
  for (;;) {
    if (existsSync(STMT_ANSWER_PATH)) {
      const raw = readFileSync(STMT_ANSWER_PATH, "utf8");
      if (raw.trim().length > 0) return JSON.parse(raw);
    }
    if (Date.now() >= end) {
      throw Object.assign(
        new Error(`the statementFacts drill answer file never appeared within ${STMT_HOLD_DEADLINE_MS}ms (${STMT_ANSWER_PATH})`),
        { code: "internal" },
      );
    }
    await sleepMs(STMT_HOLD_POLL_MS);
  }
}

/** One channel's answer, built from the drill's file. The VISION channel is handed the SAME rows
 *  with the citation index left off - its own schema carries none, and reader2 is the agreement
 *  check, so the two readers must agree on every field the writer reads. */
function statementAnswer(scripted, options) {
  const channel = statementChannel(options);
  const lines = (scripted.lines ?? []).map((line) => {
    const out = {
      entry_date: line.entry_date ?? null,
      value_date: line.value_date ?? null,
      description: line.description ?? null,
      amount_cents: line.amount_cents ?? null,
      running_balance_cents: line.running_balance_cents ?? null,
    };
    if (channel === "text" && wantsRegionIdx(options)) out.region_idx = line.region_idx ?? null;
    return out;
  });
  return { header: scripted.header, lines };
}

const model = new MockLanguageModelV4({
  // The CHAT half. A turn carrying this drill's marker and not yet answered gets the `clarify` call
  // the chatTurn leg parks on; a turn whose clarification HAS been answered gets the closing
  // narration, so the resumed segment settles the turn. EVERY OTHER TURN narrates and stops, which
  // is what this half always did and still has to do: a shared database carries other lanes'
  // leftover `chat_turn` tasks and a world that boots here will pick them up. A throwing — or
  // unconditionally clarifying — model would turn somebody else's leftover into a failure this
  // file did not cause.
  doStream: async (options) => {
    const prompt = options?.prompt ?? [];
    if (promptText(prompt).includes(CHAT_DRILL_MARKER)) {
      if (!clarifyAnswered(prompt)) return { stream: simulateReadableStream({ chunks: clarifyChunks(), chunkDelayInMs: 2 }) };
      return { stream: simulateReadableStream({ chunks: narrationChunks("Thank you — I have what I need for the two-build cutover drill."), chunkDelayInMs: 2 }) };
    }
    return { stream: simulateReadableStream({ chunks: narrationChunks("This process is running the two-build cutover e2e."), chunkDelayInMs: 2 }) };
  },
  doGenerate: async (options) => {
    // #1037 - THE statementFacts CHANNELS, decided FIRST and structurally: they are the only
    // `generateObject` calls this child sees, they carry no tools at all, and every branch below
    // reads a tool roster that a statement call does not have.
    if (isStatementCall(options)) {
      const scripted = await awaitStatementAnswer();
      return {
        content: [{ type: "text", text: JSON.stringify(statementAnswer(scripted, options)) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: usage(),
        warnings: [],
      };
    }

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
