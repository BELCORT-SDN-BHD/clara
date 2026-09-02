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
import type { ClaraThreadUiState } from "./threadStore";
import type { MessageRow } from "./api";

type GateState = Pick<
  ClaraThreadUiState,
  "messages" | "messagesLoaded" | "loadError" | "pendingUserText" | "sendStatus"
>;

/** A genuinely empty, genuinely settled transcript — the one case that paints. */
const settledEmpty: GateState = {
  messages: [],
  messagesLoaded: true,
  loadError: null,
  pendingUserText: null,
  sendStatus: "idle",
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
    "between submit and stream-open the transcript is empty AND pendingUserText is still null (threadStore's own contract) — only sendStatus tells the two apart",
  );
});

test("a pending user bubble is a transcript, even before the DB row exists", () => {
  assert.equal(gate({ pendingUserText: "what is the May balance?" }), false);
});

test("a transcript with any message is not empty", () => {
  assert.equal(gate({ messages: [aMessage] }), false);
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

test("the gate reads only the five fields it names — an unrelated store field cannot flip it", () => {
  // Guards against a future conjunct being added against a field the caller
  // does not actually pass: `ClaraThreadView` hands the gate its whole `state`,
  // so a widened Pick<> would compile while this cell keeps the CONTRACT — the
  // five fields — honest and visible.
  const wider = { ...settledEmpty, sendError: "boom", activeTaskId: "task-1" } as GateState;
  assert.equal(claraWelcomeVisible({ threadId: "t1", notSignedIn: false, state: wider }), true);
});
