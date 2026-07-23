// Pure tests for the interview /state v2 client (settled dashboard plan §3.1). No DOM, no
// network — the normalizer, chip law, segment progress, and the commit-op_key seam only.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInterviewState, deriveChip, segmentProgress, commitOpKeyFromPrompt, isNotPending,
  RuntimeApiError, FIRM_SEG_KEYS, CLIENT_SEG_KEYS,
  type PendingPark,
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

test("isNotPending detects the 409/not_pending branch", () => {
  assert.equal(isNotPending(new RuntimeApiError(409, "not_pending", "gone")), true);
  assert.equal(isNotPending(new RuntimeApiError(403, "forbidden", "no")), false);
  assert.equal(isNotPending(new Error("plain")), false);
});
