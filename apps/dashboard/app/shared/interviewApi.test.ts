// Tests for the interview /state v2 client (settled dashboard plan §3.1). No DOM. The
// normalizer, chip law, segment progress and the commit-op_key seam are pure; the answer verb's
// LOSSY-409 recovery (GH #152, the client half of PR #186) is driven against a stubbed global
// fetch — the seedingApi.test.ts idiom.

import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInterviewState, deriveChip, segmentProgress, commitOpKeyFromPrompt, isNotPending,
  answerInterview, RuntimeApiError, FIRM_SEG_KEYS, CLIENT_SEG_KEYS,
  type PendingPark, type AnswerArgs,
} from "./interviewApi";

// --- normalizer: the AS-BUILT current_prompt shape (R1's route) -----------------

test("normalizes the as-built current_prompt=interview_prompt into a pending park", () => {
  const s = normalizeInterviewState({
    run_id: "r1", scope: "client", status: "running",
    current_prompt: { type: "interview_prompt", parkIndex: 3, seg: "tin", phase: "q", question: "TIN?" },
    plan: { id: "p1" }, items: [],
  });
  assert.equal(s.runId, "r1");
  assert.equal(s.scope, "client");
  assert.equal(s.chip, "awaiting_you");
  assert.deepEqual(s.pendingPark, { parkIndex: 3, seg: "tin", phase: "q", question: "TIN?", expects: undefined, opKey: undefined });
  assert.equal(s.terminal, null);
  // F-M15: progress carries the segment ordinal only — no fabricated total.
  assert.deepEqual(s.progress, { index: CLIENT_SEG_KEYS.indexOf("tin") + 1, seg: "tin" });
});

test("normalizes the as-built current_prompt=interview_terminal into a terminal + complete chip", () => {
  const s = normalizeInterviewState({
    run_id: "r1", scope: "client", status: "complete",
    current_prompt: { type: "interview_terminal", outcome: "interview_complete", answered: 12 },
    plan: null, items: [],
  });
  assert.equal(s.chip, "complete");
  assert.equal(s.pendingPark, null);
  assert.equal(s.terminal?.outcome, "interview_complete");
});

// --- normalizer: the PINNED shape (pending_park / terminal / activity) -----------

test("normalizes the pinned pending_park + activity shape", () => {
  const s = normalizeInterviewState({
    run_id: "r2", scope: "firm", status: "running",
    pending_park: { parkIndex: 0, seg: "legal_name", phase: "q", question: "Name?" },
    activity: [{ kind: "answered", seg: "legal_name", echo: "ACME SDN BHD", at: "t0" }],
    plan: null, items: [],
  });
  assert.equal(s.chip, "awaiting_you");
  assert.equal(s.pendingPark?.seg, "legal_name");
  assert.equal(s.activity.length, 1);
  assert.equal(s.activity[0]!.echo, "ACME SDN BHD");
});

test("working: running with no park and no terminal", () => {
  const s = normalizeInterviewState({ run_id: "r3", scope: "client", status: "running", current_prompt: null, plan: {}, items: [] });
  assert.equal(s.chip, "working");
  assert.equal(s.progress, null);
});

test("unknown: no runId, no status", () => {
  const s = normalizeInterviewState({ scope: "client" });
  assert.equal(s.runId, null);
  assert.equal(s.chip, "unknown");
});

test("items normalize defensively (bad rows dropped, required_for_commit coerced)", () => {
  const s = normalizeInterviewState({
    scope: "client", items: [
      { item_key: "tin", item_kind: "capture", state: "answered", required_for_commit: false, question: "TIN?", answer: "X" },
      { nope: true },
      null,
    ],
  });
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0]!.item_key, "tin");
});

// --- chip law ------------------------------------------------------------------

test("deriveChip covers the terminal outcomes + park + working", () => {
  const park: PendingPark = { parkIndex: 0, seg: "ssm", phase: "q", question: "?" };
  assert.equal(deriveChip(park, null, "running"), "awaiting_you");
  assert.equal(deriveChip(null, { outcome: "firm_created" }, "complete"), "complete");
  assert.equal(deriveChip(null, { outcome: "cancelled" }, null), "cancelled");
  assert.equal(deriveChip(null, { outcome: "expired" }, null), "expired");
  assert.equal(deriveChip(null, { outcome: "plan_gone" }, null), "ended");
  assert.equal(deriveChip(null, { outcome: "superseded_by_existing_run" }, null), "ended");
  assert.equal(deriveChip(null, null, "running"), "working");
  assert.equal(deriveChip(null, null, "weird"), "unknown");
});

// --- segment progress ----------------------------------------------------------

test("segmentProgress maps a known seg to its ordinal (no fabricated total); degrades to null", () => {
  // F-M15: the hard-coded seg-count total is a fabrication — emit only "step N".
  assert.deepEqual(segmentProgress("firm", "commit"), { index: FIRM_SEG_KEYS.length, seg: "commit" });
  assert.deepEqual(segmentProgress("client", "legal_name"), { index: 1, seg: "legal_name" });
  assert.equal(segmentProgress("client", "not_a_seg"), null);
  assert.equal(segmentProgress("client", null), null);
});

// --- commit op_key seam (typed field first, prose fallback) ---------------------

test("commitOpKeyFromPrompt prefers the TYPED op_key (the pin)", () => {
  const park: PendingPark = { parkIndex: 11, seg: "commit", phase: "q", question: "confirm?", expects: "create_firm_receipt", opKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
  assert.equal(commitOpKeyFromPrompt(park), "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
});

test("commitOpKeyFromPrompt is TYPED-ONLY — a prose op_key in the question is NOT parsed (F-M16)", () => {
  const uuid = "12345678-90ab-cdef-1234-567890abcdef";
  const park: PendingPark = {
    parkIndex: 11, seg: "commit", phase: "q", expects: "create_firm_receipt",
    question: `To create the firm, the dashboard calls create_firm with op_key=${uuid} and your admission token, then confirms here.`,
  };
  assert.equal(commitOpKeyFromPrompt(park), null, "a park with only a prose op_key is a runtime contract violation, never parsed");
});

test("commitOpKeyFromPrompt returns null when the typed field is absent", () => {
  assert.equal(commitOpKeyFromPrompt({ parkIndex: 0, seg: "commit", phase: "q", question: "no key here" }), null);
  assert.equal(commitOpKeyFromPrompt(null), null);
});

// --- error helper --------------------------------------------------------------

test("isNotPending matches the not_pending CODE exactly — not any bare 409", () => {
  assert.equal(isNotPending(new RuntimeApiError(409, "not_pending", "gone")), true);
  assert.equal(isNotPending(new RuntimeApiError(403, "forbidden", "no")), false);
  assert.equal(isNotPending(new Error("plain")), false);
  // A DIFFERENT 409 is a genuine conflict and must never reach the answer re-POST path.
  assert.equal(isNotPending(new RuntimeApiError(409, "conflict", "plan is not open")), false);
  assert.equal(isNotPending(new RuntimeApiError(409, "http_409", "bare")), false);
});

// --- answer: the LOSSY 409, disambiguated against /state then retried ONCE (GH #152) --------
//
// The route says 409 not_pending both when the park advanced (our answer landed) and when the
// hook was unarmed (our answer was DROPPED). PR #186 closed the runtime window; these cells pin
// the client half — the status is never read as delivery on its own.

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** /state v2 showing OUR run parked at `parkIndex` (the pinned shape). The identity fields are
 *  load-bearing: the delivery decoder requires run_id, scope and plan.id to match the answer. */
function parkedAt(parkIndex: number) {
  return {
    run_id: "r1", scope: "client", status: "running", items: [], plan: { id: "p1" },
    pending_park: { parkIndex, seg: "tin", phase: "q", question: "TIN?" },
  };
}

/** /state v2 showing OUR run ended with `outcome`. */
function endedWith(outcome: string, status = "complete") {
  return { run_id: "r1", scope: "client", status, items: [], plan: { id: "p1" }, terminal: { outcome } };
}

const ANSWER: AnswerArgs = { runId: "r1", scope: "client", parkIndex: 3, value: "C1234", planId: "p1" };

/** Stub global fetch with ONE scripted reply per call, recording what was sent. An unscripted
 *  call throws, so a cell that makes an extra round trip fails loudly instead of passing. */
function scriptFetch(t: TestContext, replies: Array<Response | Error>) {
  process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = "https://runtime.test";
  const calls: { url: string; method: string; body: Record<string, unknown> | null; signal: AbortSignal | null }[] = [];
  let i = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(init?.method ?? "GET"),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      signal: init?.signal ?? null,
    });
    const reply = replies[i++];
    if (!reply) throw new Error(`unscripted fetch #${i} to ${String(url)}`);
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return calls;
}

test("answer: a 200 delivers in ONE round trip — no /state re-read", async (t) => {
  const calls = scriptFetch(t, [jsonRes({ ok: true })]);
  await answerInterview("jwt", ANSWER);
  assert.equal(calls.length, 1, "the happy path never pays for the recovery");
  assert.match(calls[0]!.url, /\/api\/interview\/answer$/);
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.body?.parkIndex, 3);
});

test("answer: a lossy 409 with the SAME park still open re-reads once and RETRIES once", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending", message: "no open question at that park index" }, 409),
    jsonRes(parkedAt(3)), // the park did NOT advance ⇒ the answer was DROPPED
    jsonRes({ ok: true }), // the retry lands
  ]);
  await answerInterview("jwt", ANSWER); // resolves: delivered on the retry
  assert.equal(calls.length, 3);
  assert.match(calls[1]!.url, /\/api\/interview\/state\?/, "the 409 is disambiguated against /state");
  assert.match(calls[2]!.url, /\/api\/interview\/answer$/, "and the answer is re-POSTed");
  assert.deepEqual(calls[2]!.body, calls[0]!.body, "the retry re-sends the identical payload — same park, same value");
});

test("answer: a lossy 409 whose /state shows a HIGHER park is the benign half — no retry", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(parkedAt(4)), // the park moved PAST ours ⇒ our answer DID land
  ]);
  await answerInterview("jwt", ANSWER);
  assert.equal(calls.length, 2, "already-delivered costs the re-read and nothing more");
});

test("answer: a lossy 409 on a COMPLETE-class terminal is already-delivered", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(endedWith("interview_complete")),
  ]);
  await answerInterview("jwt", ANSWER);
  assert.equal(calls.length, 2);
});

// --- FAIL-CLOSED ON UNKNOWN: only positive evidence counts as delivery ----------------------
// Each of these once read as "delivered" under the first cut of this recovery, which would have
// walked the dropped-answer bug back in through the code meant to close it.

test("answer: a CANCELLED run is NOT delivery — the refusal is surfaced", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending", message: "no open question" }, 409),
    jsonRes(endedWith("cancelled", "cancelled")),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.code, "not_pending");
    return true;
  });
  assert.equal(calls.length, 2, "a dead run is not retried, and never reported as delivered");
});

test("answer: a CANCELLED run whose engine status reads 'completed' is NOT delivery", async (t) => {
  // A DERIVED STATE IS NOT EVIDENCE. A domain cancel returns NORMALLY from the workflow, so the
  // engine run row settles 'completed' (interview-e2e.mjs asserts this). With the terminal
  // marker not yet streamed, deriveChip's STATUS fallback calls that "complete" — so a delivery
  // test written against the chip would report a dropped answer as delivered. It reads the
  // terminal MARKER instead, and here there is none.
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ run_id: "r1", scope: "client", status: "completed", items: [], plan: { id: "p1" }, pending_park: null }),
  ]);
  assert.equal(deriveChip(null, null, "completed"), "complete", "the chip really does say complete here");
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2, "a status-derived 'complete' must never count as delivery");
});

test("answer: a park-less but still RUNNING state proves nothing — the refusal is surfaced", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ run_id: "r1", scope: "client", status: "running", items: [], plan: { id: "p1" }, pending_park: null }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

test("answer: an unparseable /state body ({}) is never read as delivery", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    new Response("not json at all", { status: 200, headers: { "content-type": "application/json" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2, "a {} body degrades to unknown, not to success");
});

test("answer: a LOWER park index (a different/restarted run) is surfaced, never retried", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(parkedAt(1)),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

// --- the evidence must be ABOUT OUR RUN --------------------------------------------------
// An advanced park in run B says nothing about our POST to run A. These are no-evidence, not
// weak evidence.

test("answer: a HIGHER park belonging to a DIFFERENT runId is not evidence", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ run_id: "r2", scope: "client", status: "running", items: [], pending_park: { parkIndex: 9, seg: "tin", phase: "q", question: "?" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

test("answer: a completion terminal for a DIFFERENT scope is not evidence", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ run_id: "r1", scope: "firm", status: "complete", items: [], terminal: { outcome: "interview_complete" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

test("answer: a completion terminal with NO identity at all is not evidence", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ status: "complete", items: [], terminal: { outcome: "interview_complete" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

test("answer: a plan-id mismatch is not evidence, even with a higher park", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ ...parkedAt(9), plan: { id: "p2" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

// --- CONTRADICTORY state: a present terminal outranks a stale park -------------------------
// The decoder reads the RAW body, not the tolerant UI normalizer, precisely so these cannot be
// smoothed away: the normalizer coerces an absent scope to "client" and DROPS a malformed
// terminal, both of which would turn a refusal into a false delivery.

test("answer: a higher park does NOT outvote a cancelled terminal", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ ...parkedAt(9), terminal: { outcome: "cancelled" } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2);
});

test("answer: a MALFORMED terminal outcome is refused, not discarded", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ ...parkedAt(9), terminal: { outcome: 7 } }),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => e.code === "not_pending");
  assert.equal(calls.length, 2, "the UI normalizer would have dropped this terminal and read the park as delivery");
});

test("answer: our OWN park plus a completion terminal resolves — the terminal is authoritative", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes({ ...parkedAt(3), terminal: { outcome: "interview_complete" } }),
  ]);
  await answerInterview("jwt", ANSWER);
  assert.equal(calls.length, 2, "no pointless retry against a run that has already ended");
});

// --- the LAGGING-MARKER case: a retry that 409s is not yet proof of failure -----------------

test("answer: a retry that 409s but whose SECOND read shows the park advanced is delivered", async (t) => {
  // The duplicate-submit-of-the-last-answer shape: the first answer DID land, but /state still
  // showed our park when we looked. Throwing here would be a false refusal at the natural end
  // of an interview, so one bounded second read decides.
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(parkedAt(3)),                      // markers lagging: our park still shown
    jsonRes({ error: "not_pending" }, 409),    // the retry is refused too
    jsonRes(parkedAt(4)),                      // now the truth: the park DID advance
  ]);
  await answerInterview("jwt", ANSWER);
  assert.equal(calls.length, 4, "bounded: two POSTs and two reads, never a loop");
});

test("answer: a retry that 409s with the park STILL ours surfaces the retry's refusal", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending", message: "first" }, 409),
    jsonRes(parkedAt(3)),
    jsonRes({ error: "not_pending", message: "still not pending" }, 409),
    jsonRes(parkedAt(3)),                      // no advance: genuinely undelivered
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.match(e.message, /still not pending/, "the RETRY's refusal is the one reported");
    return true;
  });
  assert.equal(calls.length, 4);
});

test("answer: a 409 with a DIFFERENT code is a genuine conflict — thrown at once, no re-read", async (t) => {
  const calls = scriptFetch(t, [jsonRes({ error: "conflict", message: "onboarding plan is not open" }, 409)]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.status, 409);
    assert.equal(e.code, "conflict");
    return true;
  });
  assert.equal(calls.length, 1, "only the documented lossy status earns a re-read");
});

test("answer: a retry that fails with a NON-conflict error is surfaced at once", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(parkedAt(3)),
    jsonRes({ error: "forbidden", message: "no longer your run" }, 403),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.status, 403);
    assert.equal(e.code, "forbidden");
    return true;
  });
  assert.equal(calls.length, 3, "a non-conflict retry failure needs no further reading");
});

test("answer: an unreadable /state keeps the ORIGINAL refusal (undiagnosable ⇒ never assume delivery)", async (t) => {
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending", message: "the original refusal" }, 409),
    new Error("network down"),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.code, "not_pending");
    assert.match(e.message, /the original refusal/, "the 409 is reported, not the re-read's own error");
    return true;
  });
  assert.equal(calls.length, 2, "no retry when delivery could not be established");
});

test("answer: a non-conflict refusal throws immediately — no re-read, no retry", async (t) => {
  const calls = scriptFetch(t, [jsonRes({ error: "forbidden", message: "not your run" }, 403)]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.status, 403);
    assert.equal(e.code, "forbidden");
    return true;
  });
  assert.equal(calls.length, 1);
});

// --- the recovery is TIME-bounded as well as round-trip bounded ------------------------------

test("answer: every leg of the recovery carries its OWN AbortSignal", async (t) => {
  // Four sequential round trips can happen here, and the caller's input is disabled on `busy` for
  // all of them — so an unbounded leg is an interview the human cannot get back into. One signal
  // PER LEG, not one budget shared across the recovery: a slow-but-progressing recovery must not
  // have its last read cancelled by time its first POST already spent.
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending" }, 409),
    jsonRes(parkedAt(3)),
    jsonRes({ ok: true }),
  ]);
  await answerInterview("jwt", ANSWER);

  assert.equal(calls.length, 3);
  for (const c of calls) assert.ok(c.signal instanceof AbortSignal, `${c.url} is bounded`);
  assert.equal(new Set(calls.map((c) => c.signal)).size, 3, "three legs, three signals");
  assert.ok(calls.every((c) => !c.signal!.aborted), "and none of them fired during a healthy run");
});

test("answer: an ABORTED /state read is UNKNOWN, never delivery — the bound is fail-closed", async (t) => {
  // What a timeout is allowed to cost, stated as a cell: a false refusal, never a false
  // confirmation. The aborted read reaches `readDelivery`'s catch, which is "unknown", and unknown
  // keeps the ORIGINAL 409 — the same arm an unreachable network takes.
  const calls = scriptFetch(t, [
    jsonRes({ error: "not_pending", message: "the original refusal" }, 409),
    new DOMException("The operation was aborted due to timeout", "TimeoutError"),
  ]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: RuntimeApiError) => {
    assert.equal(e.code, "not_pending");
    assert.match(e.message, /the original refusal/, "the 409 is reported, not the abort");
    return true;
  });
  assert.equal(calls.length, 2, "an abort ends the recovery — it never counts as evidence to retry on");
});

test("answer: an ABORTED POST throws, and the caller reads that as UNDELIVERED", async (t) => {
  // The other end: the POST's abort is not swallowed into a delivery. It propagates, which every
  // caller (submitAnswer / deliverValue) already treats as "your answer did not land".
  const abort = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  const calls = scriptFetch(t, [abort]);
  await assert.rejects(() => answerInterview("jwt", ANSWER), (e: Error) => {
    assert.equal(e.name, "TimeoutError");
    return true;
  });
  assert.equal(calls.length, 1);
});
