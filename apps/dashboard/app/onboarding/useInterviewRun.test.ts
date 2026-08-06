// The interview run controller's ERROR LIFETIME (the §3.1 poller vs. a surfaced refusal).
//
// PR #191 stopped `answerInterview` reading a lossy 409 as delivery, so a genuinely dropped
// answer finally reaches this hook as a throw. It then lived for about three seconds: the poll's
// success path ended in an unconditional clear, and the poller ticks every 3s. These cells pin
// the fix — a refusal outlives the poller, a poll can still retire an error it can honestly
// disprove, and the human's own next action clears the board.
//
// AND "DISPROVE" MEANS POSITIVE EVIDENCE, NOT MERE DIFFERENCE (the ADR-059 armour law). The first
// cut of the guard cleared whenever the read's park index differed from the held one — which an
// ABSENT park satisfies, so the between-parks window, a cancelled run and an unreadable marker all
// wiped the banner. Only two facts retire a park-bound refusal now, and they are the wire client's
// own delivered arms: a COMPLETE-class terminal, or a strictly higher park index.
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
import { COMPLETE_OUTCOMES, normalizeInterviewState, type InterviewTerminal, type PendingPark } from "../shared/interviewApi";

const POLL_MS = 3000;
const PARK: PendingPark = { parkIndex: 3, seg: "tin", phase: "q", question: "TIN?" };

// --- the rule, stated purely -----------------------------------------------------

function err(p: Partial<RunError> = {}): RunError {
  return { message: "refused", gen: 1, kind: "action", heldAtPark: 3, ...p };
}
/** The slice of /state the predicate reads: a park (null = none) and a terminal (null = none). */
const parkedAt = (parkIndex: number | null, terminal: InterviewTerminal | null = null) =>
  ({ pendingPark: parkIndex === null ? null : { ...PARK, parkIndex }, terminal });

test("readClearsError: a poll may never clear an error raised AFTER its read began", () => {
  // The generation guard. The read left at gen 0 knowing of no error; the refusal is gen 1.
  assert.equal(readClearsError(err({ gen: 1, kind: "read" }), 0, parkedAt(3)), false);
  assert.equal(readClearsError(err({ gen: 1, heldAtPark: null }), 0, parkedAt(null)), false);
  assert.equal(readClearsError(null, 0, parkedAt(3)), false, "nothing to clear");
});

test("readClearsError: a successful read retires a READ error — a transport blip never sticks", () => {
  assert.equal(readClearsError(err({ kind: "read", heldAtPark: null }), 1, parkedAt(3)), true);
});

test("readClearsError: an ACTION refusal is retired only by POSITIVE evidence it was resolved", () => {
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(3)), false, "still parked where the answer was aimed");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(4)), true, "a STRICTLY higher park — classifyDeliveryBody's own 'it landed' arm");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(2)), false, "a LOWER park is a different or restarted run, not our evidence");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(null)), false, "ABSENCE IS NOT EVIDENCE — a park-less read proves nothing");
  assert.equal(readClearsError(err({ heldAtPark: null }), 1, parkedAt(3)), false, "a page-raised refusal: no read speaks to it");
});

test("readClearsError: a terminal clears only when its outcome is COMPLETE-class", () => {
  // Parity with the wire client, by construction: the predicate reads the SAME shared set the
  // answer verb's delivery test reads, so the two cannot drift into different opinions.
  for (const outcome of COMPLETE_OUTCOMES) {
    assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(null, { outcome })), true, `${outcome} is an intended end`);
  }
  for (const outcome of ["cancelled", "canceled", "expired", "plan_gone", "superseded_by_existing_run", ""]) {
    assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(null, { outcome })), false, `${outcome} is a STOP, not a delivery`);
  }
  // The terminal is authoritative and read FIRST, so a stale park cannot outvote a run that has
  // actually been cancelled — the same ordering `classifyDeliveryBody` uses.
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, parkedAt(4, { outcome: "cancelled" })), false, "a cancelled run outranks a stale higher park");
});

test("readClearsError: a park marker the normalizer could not read is not evidence", () => {
  // Measured with the instrument production uses: `toPendingPark` drops a non-integer parkIndex
  // outright, so the hook is handed NO park — and no park is no proof.
  const s = normalizeInterviewState({ run_id: "r1", scope: "client", status: "running", pending_park: { parkIndex: "4" } });
  assert.equal(s.pendingPark, null, "the normalizer really did drop it");
  assert.equal(readClearsError(err({ heldAtPark: 3 }), 1, s), false);
});

// --- the world the mounted cells run in ------------------------------------------

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type World = {
  /** What /state reports right now (null = no open park). */
  park: number | null;
  /** What /state reports as `terminal` (null = the run is still live). */
  terminal: { outcome: string } | null;
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
  return { park: 3, terminal: null, answer: () => jsonRes({ ok: true }), gate: null, stateFails: false, stateReads: 0, ...p };
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
        terminal: w.terminal,
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

test("a park-LESS read does not clear the refusal — the between-parks window is not evidence", async (t) => {
  // The window every confirmed segment passes through: the runtime has taken the last answer off
  // the hook and not yet announced the next question, so /state reports no park at all. The old
  // "any index that differs" test read that silence as proof of delivery and wiped the banner —
  // which is the three-second swallow again, arriving on a normal segment boundary.
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    w.park = null;
    const readsBefore = w.stateReads;
    for (let i = 0; i < 3; i++) await h.act(async () => { t.mock.timers.tick(POLL_MS); await Promise.resolve(); });
    await h.settle();
    assert.ok(w.stateReads > readsBefore, "the poller really did run (guard against a dead-clock pass)");
    assert.equal(h.current.state?.chip, "working", "the fixture really is the park-less, non-terminal window");
    assert.match(h.current.error ?? "", /dropped/, "and the refusal is still on screen");
  } finally { await h.unmount(); }
});

test("a CANCELLED terminal does not clear the refusal — a stop is not a delivery", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    // The run ends without ever reaching its intended end. Nothing here says our answer landed —
    // if anything the cancel is why it did not.
    w.park = null; w.terminal = { outcome: "cancelled" };
    for (let i = 0; i < 2; i++) await h.act(async () => { t.mock.timers.tick(POLL_MS); await Promise.resolve(); });
    await h.settle();
    assert.equal(h.current.state?.chip, "cancelled", "the fixture really is a terminal cancel");
    assert.match(h.current.error ?? "", /dropped/, "the undelivered answer is still surfaced");
  } finally { await h.unmount(); }
});

test("a COMPLETE-class terminal DOES clear the refusal — the run reached its intended end", async (t) => {
  // The arm that keeps the rule from being a one-way ratchet: a completed run reports no pending
  // park forever and the poller stops on the terminal chip, so without this a park-held refusal
  // could never be retired by any read at all.
  t.mock.timers.enable({ apis: ["setInterval"] });
  const w = mkWorld({ answer: REFUSAL });
  const h = await mountRun(t, w);
  try {
    await h.act(async () => { await h.current.submitAnswer(PARK, "C1234567890"); });
    assert.match(h.current.error ?? "", /dropped/);

    w.park = null; w.terminal = { outcome: "interview_complete" };
    await h.act(async () => { t.mock.timers.tick(POLL_MS); await Promise.resolve(); });
    await h.settle();
    assert.equal(h.current.state?.chip, "complete", "the fixture really is a complete-class terminal");
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
  // Both pages raise their CANCEL failures through `setError` (firm/page.tsx, client/page.tsx),
  // and the client page also raises its "a reason is required" refusal there. Those are
  // human-verb refusals with no park to aim at — no read disproves them, so only the human can
  // clear them, which is why each page clears the board itself before it re-attempts.
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
