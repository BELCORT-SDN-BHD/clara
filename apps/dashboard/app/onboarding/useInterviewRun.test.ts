// The interview run controller's ERROR LIFETIME (the §3.1 poller vs. a surfaced refusal).
//
// PR #191 stopped `answerInterview` reading a lossy 409 as delivery, so a genuinely dropped
// answer finally reaches this hook as a throw. It then lived for about three seconds: the poll's
// success path ended in an unconditional clear, and the poller ticks every 3s. These cells pin
// the fix — a refusal outlives the poller, a poll can still retire an error it can honestly
// disprove, and the human's own next action clears the board.
//
// Two instruments, deliberately. The pure `readClearsError` cells state the rule exhaustively and
// cost nothing; the mounted cells prove the rule is actually WIRED to the poller — measured with
// the instrument production uses (a real interval, a real await, the real wire client over a
// stubbed fetch), because a rule that is right in isolation and unreached in the hook is exactly
// the failure this bug was.
//
// Mocked-fetch idiom: interviewApi.test.ts's `scriptFetch`, adapted from a one-reply-per-call
// script to a ROUTE-dispatched world — a polled surface makes an unpredictable number of reads,
// so the fixture is "what /state says right now", not "the Nth reply". Only `setInterval` is
// mocked (the harness needs a real `setTimeout` to settle promise chains, and React's scheduler
// needs its own timers left alone).

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { renderHook } from "../../test/hookHarness";
import { useInterviewRun, readClearsError, type RunError } from "./useInterviewRun";
import type { PendingPark } from "../shared/interviewApi";

const POLL_MS = 3000;
const PARK: PendingPark = { parkIndex: 3, seg: "tin", phase: "q", question: "TIN?" };

// --- the rule, stated purely -----------------------------------------------------

function err(p: Partial<RunError> = {}): RunError {
  return { message: "refused", gen: 1, kind: "action", heldAtPark: 3, ...p };
}
const parkedAt = (parkIndex: number | null) =>
  ({ pendingPark: parkIndex === null ? null : { ...PARK, parkIndex } });

test("readClearsError: a poll may never clear an error raised AFTER its read began", () => {
  // The generation guard. The read left at gen 0 knowing of no error; the refusal is gen 1.
  assert.equal(readClearsError(err({ gen: 1, kind: "read" }), 0, parkedAt(3)), false);
  assert.equal(readClearsError(err({ gen: 1, heldAtPark: null }), 0, parkedAt(null)), false);
  assert.equal(readClearsError(null, 0, parkedAt(3)), false, "nothing to clear");
});

test("readClearsError: a successful read retires a READ error — a transport blip never sticks", () => {
  assert.equal(readClearsError(err({ kind: "read", heldAtPark: null }), 1, parkedAt(3)), true);
});

test("readClearsError: an ACTION refusal is retired only when the run has LEFT its park", () => {
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(3)), false, "still parked where the answer was aimed");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(4)), true, "the park advanced — answerInterview's own 'it landed' test");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(null)), true, "terminal / no open park counts as resolved");
  assert.equal(readClearsError(err({ heldAtPark: null }), 1, parkedAt(3)), false, "a page-raised refusal: no read speaks to it");
});

// --- the world the mounted cells run in ------------------------------------------

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type World = {
  /** What /state reports right now (null = no open park). */
  park: number | null;
  /** What POST /answer replies. A 500 keeps `answerInterview` from making its own /state
   *  re-read, which matters when a cell is counting reads. */
  answer: () => Response;
  /** When set, /state hangs on this promise — used to hold a read in flight across a refusal. */
  gate: Promise<void> | null;
  /** When true, /state itself fails (the transport-blip cell). */
  stateFails: boolean;
  stateReads: number;
};

function mkWorld(p: Partial<World> = {}): World {
  return { park: 3, answer: () => jsonRes({ ok: true }), gate: null, stateFails: false, stateReads: 0, ...p };
}

function installFetch(t: TestContext, w: World) {
  process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = "https://runtime.test";
  t.mock.method(globalThis, "fetch", async (url: string) => {
    const u = String(url);
    if (u.includes("/api/interview/state")) {
      if (w.gate) await w.gate;
      w.stateReads += 1;
      if (w.stateFails) throw new Error("network is down");
      return jsonRes({
        run_id: "r1", scope: "client", status: "running", items: [], activity: [],
        pending_park: w.park === null ? null : { parkIndex: w.park, seg: "tin", phase: "q", question: "TIN?" },
      });
    }
    if (u.includes("/api/interview/answer")) return w.answer();
    throw new Error(`unscripted fetch to ${u}`);
  });
}

const REFUSAL = () => jsonRes({ error: "park_closed", message: "the hook was not armed — your answer was dropped" }, 500);

async function mountRun(t: TestContext, w: World) {
  installFetch(t, w);
  const h = await renderHook(() => useInterviewRun({ token: "jwt", scope: "client", runId: "r1", planId: "p1" }));
  await h.settle(); // the mount read
  return h;
}

// --- the mounted cells ------------------------------------------------------------

test("a genuine refusal OUTLIVES the poller (the 3-second wipe)", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    assert.equal(h.current.error, null, "a healthy mount surfaces nothing");

    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/, "the undelivered answer is surfaced");

    // Four ticks — well past the ~3s in which the refusal used to vanish. The run is still
    // parked at 3 throughout, so nothing has disproved it.
    const readsBefore = w.stateReads;
    for (let i = 0; i < 4; i++) await h.act(async () => { t.mock.timers.tick(POLL_MS); await Promise.resolve(); });
    await h.settle();
    assert.ok(w.stateReads > readsBefore, "the poller really did run (guard against a dead-clock pass)");
    assert.match(h.current.error ?? "", /dropped/, "and the refusal is still on screen");
  } finally { await h.unmount(); }
});

test("a poll whose read STARTED before the refusal cannot clear it (the generation guard)", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    // Hold the next /state read open, tick the poller into it, then refuse an answer while that
    // read is still in flight. The read comes back knowing nothing of the refusal.
    let release!: () => void;
    w.gate = new Promise<void>((r) => { release = r; });
    await h.act(async () => { t.mock.timers.tick(POLL_MS); });

    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    w.gate = null;
    release();
    await h.settle();
    assert.match(h.current.error ?? "", /dropped/, "the in-flight read did not wipe a refusal it never saw");
  } finally { await h.unmount(); }
});

test("a poll DOES retire the refusal once the run leaves the park the answer was aimed at", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    w.park = 4; // the run moved on — by answerInterview's own predicate the answer landed
    await h.act(async () => { t.mock.timers.tick(POLL_MS); });
    await h.settle();
    assert.equal(h.current.error, null, "a read that PROVES resolution still clears");
  } finally { await h.unmount(); }
});

test("a transient READ failure is retired by the next good poll — it does not stick forever", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ stateFails: true });
  const h = await mountRun(t, w);
  try {
    assert.match(h.current.error ?? "", /network is down/, "the failed read is surfaced");
    w.stateFails = false;
    await h.act(async () => { t.mock.timers.tick(POLL_MS); });
    await h.settle();
    assert.equal(h.current.error, null, "the blip is gone the moment a read succeeds");
  } finally { await h.unmount(); }
});

test("the human acting again clears the board — a re-submit that lands leaves no refusal", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    // The retry lands, but /state has NOT caught up — it still reports park 3. Nothing a read
    // can see has changed, so the ONLY thing that may clear the board here is the human's own
    // action, which is exactly the claim.
    w.answer = () => jsonRes({ ok: true });
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    await h.settle();
    assert.equal(h.current.error, null, "the retry cleared it");
  } finally { await h.unmount(); }
});

test("a page-raised refusal (setError) also outlives the poller, and dismiss still works", async (t) => {
  // The firm page raises the create_firm failure through `setError`; the client page raises the
  // cancel failure the same way. Those are human-verb refusals too — no read disproves them.
  t.mock.timers.enable({ apis: ["setInterval"] });
  const h = await mountRun(t, mkWorld());
  try {
    await h.act(() => { h.current.setError("The firm was created, but confirming it failed."); });
    for (let i = 0; i < 2; i++) await h.act(async () => { t.mock.timers.tick(POLL_MS); await Promise.resolve(); });
    await h.settle();
    assert.match(h.current.error ?? "", /confirming it failed/, "the page's refusal survives too");

    await h.act(() => { h.current.setError(null); });
    assert.equal(h.current.error, null, "dismiss is still a plain setError(null)");
  } finally { await h.unmount(); }
});
