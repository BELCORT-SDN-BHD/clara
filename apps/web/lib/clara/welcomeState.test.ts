// The Clara welcome gate's own branches (裁-14: "empty states and rare welcome
// moments only, NEVER a loader").
//
// Every cell below names the ONE conjunct it removes from the visible case, so
// a deleted conjunct in `welcomeState.ts` reds exactly one line and says which.
// The `visible` cell is the MUST-NOT-RED control: without it, deleting the
// whole function body and returning `false` would satisfy every negative cell
// here and the mascot would simply never paint.

import { test } from "node:test";
import assert from "node:assert/strict";

import { claraWelcomeVisible } from "./welcomeState";
import { initialClaraStreamState } from "./stream";
import type { ClaraThreadUiState } from "./threadStore";
import type { MessageRow } from "./api";

type GateState = Pick<
  ClaraThreadUiState,
  | "messages" | "messagesLoaded" | "loadError" | "pendingUserParts" | "sendStatus" | "stream"
  | "parkedClarify" | "turnStartedAt"
>;

/** A genuinely empty, genuinely settled transcript — the one case that paints. */
const settledEmpty: GateState = {
  messages: [],
  messagesLoaded: true,
  loadError: null,
  pendingUserParts: null,
  sendStatus: "idle",
  stream: initialClaraStreamState,
  parkedClarify: null,
  turnStartedAt: null,
};

const aMessage = { id: "m1", role: "assistant", parts: [] } as unknown as MessageRow;

function gate(state: Partial<GateState>, over: { threadId?: string | null; notSignedIn?: boolean } = {}): boolean {
  return claraWelcomeVisible({
    threadId: over.threadId === undefined ? "t1" : over.threadId,
    notSignedIn: over.notSignedIn ?? false,
    state: { ...settledEmpty, ...state },
  });
}

test("MUST NOT RED: a resolved thread with a loaded, empty transcript IS the welcome moment", () => {
  assert.equal(gate({}), true);
});

test("NEVER A LOADER (1): the first read has not landed — an unloaded transcript is ALSO an empty array", () => {
  assert.equal(
    gate({ messagesLoaded: false }),
    false,
    "dropping the messagesLoaded conjunct paints the mascot over the 'Loading the conversation…' state, which is the one thing 裁-14 forbids by name",
  );
});

test("NEVER A LOADER (2): a turn is in flight before the stream has opened", () => {
  assert.equal(
    gate({ sendStatus: "sending" }),
    false,
    "between submit and stream-open the transcript is empty AND pendingUserParts is still null (threadStore's own contract) — only sendStatus tells the two apart",
  );
});

test("a pending user bubble is a transcript, even before the DB row exists", () => {
  assert.equal(gate({ pendingUserParts: [{ type: "text", text: "what is the May balance?" }] }), false);
});

test("a pending turn that is ONLY an attachment still suppresses the welcome", () => {
  // #508 made a pending turn carry PARTS, so a person can send a document with
  // no prose at all. Testing presence rather than emptiness is what keeps that
  // case covered — an `.length > 0` conjunct would have been correct on the day
  // and wrong the moment an attachment-only turn existed.
  assert.equal(
    gate({ pendingUserParts: [{ type: "attachment", document_id: "d1", intake_id: "i1" }] }),
    false,
  );
});

test("a transcript with any message is not empty", () => {
  assert.equal(gate({ messages: [aMessage] }), false);
});

test("NEVER MID-CONVERSATION: a live stream chunk is visible assistant content, even with an empty transcript", () => {
  // The conjunct #508 made necessary. That train renders a clarify card folded
  // out of `stream.provisionalChunks` — content the reader SEES that is not in
  // `messages` — so `messages.length === 0` stopped being the whole answer to
  // "is this conversation empty". Without this the mascot could greet someone
  // underneath a live clarify question.
  assert.equal(
    gate({ stream: { ...initialClaraStreamState, status: "streaming", provisionalChunks: ["{\"type\":\"clarify\"}"] } }),
    false,
  );
});

test("an idle stream with no chunks is still the welcome moment — the conjunct is not over-broad", () => {
  // The counter-cell: `stream` present and empty must NOT suppress the welcome,
  // or the conjunct above would have silently deleted the whole feature.
  assert.equal(gate({ stream: { ...initialClaraStreamState, reconnectAttempt: 0 } }), true);
});

// ---------------------------------------------------------------------------
// THE TWO CONJUNCTS THE P6-5 MERGE ADDED. Neither branch could reach these
// states alone: #514 built the welcome against a transcript that is empty
// because nothing has happened, and P6-5 made a transcript that is empty
// because the turn that will fill it is still IN FLIGHT — read from the
// database at mount, so it is visible on a page reload with no stream and no
// persisted row. The combination is the defect, and these are its cells.
// ---------------------------------------------------------------------------

test("a REHYDRATED parked question suppresses the welcome — the mascot never greets someone mid-question", () => {
  assert.equal(
    gate({ parkedClarify: { type: "clarify", tool_call_id: "interruption:i1", question: "Which client owns this invoice?", context: null, framing: "" } }),
    false,
  );
});

test("a RUNNING turn found at mount suppresses the welcome — 裁-132's own line contradicts it", () => {
  assert.equal(gate({ turnStartedAt: "2026-09-02T10:00:00.000Z" }), false);
});

test("neither new conjunct is over-broad: null on both is still the welcome moment", () => {
  // The counter-cells. Without these, either conjunct could have been written
  // against the wrong nullish reading and silently deleted the whole feature.
  assert.equal(gate({ parkedClarify: null, turnStartedAt: null }), true);
});

test("a failed read is a STATE the thread already spells out — never a welcome under an error banner", () => {
  assert.equal(gate({ loadError: "load messages failed (503): " }), false);
});

test("signed out is a state, not an empty conversation", () => {
  assert.equal(gate({}, { notSignedIn: true }), false);
});

test("no thread could be resolved at all — there is nothing to be empty", () => {
  assert.equal(gate({}, { threadId: null }), false);
});

test("the gate reads only the eight fields it names — an unrelated store field cannot flip it", () => {
  // Guards against a future conjunct being added against a field the caller
  // does not actually pass: `ClaraThreadView` hands the gate its whole `state`,
  // so a widened Pick<> would compile while this cell keeps the CONTRACT — the
  // EIGHT fields — honest and visible. (Six after #508 merged in `stream`; eight
  // after the P6-5 merge added `parkedClarify` and `turnStartedAt`. The count in
  // this comment is part of the contract, so widening it silently means editing
  // this line and being seen to do it. `activeTaskId` left this probe when it
  // stopped being unrelated: a task id now travels with a run the gate DOES read.)
  const wider = { ...settledEmpty, sendError: "boom", turnStatus: "queued" } as GateState;
  assert.equal(claraWelcomeVisible({ threadId: "t1", notSignedIn: false, state: wider }), true);
});
