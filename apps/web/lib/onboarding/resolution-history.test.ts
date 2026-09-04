// 裁-27 — the amend renders "the prior answer and its supersession, not a mutation".
//
// The cell this file exists for is the DE-DUPLICATION one. A revision snapshot is written on
// EVERY plan write, and most of them are about a different item — so the naive projection
// (one entry per snapshot) renders a dozen "earlier answers" that are all the same unchanged
// text, i.e. a correction trail claiming amendments that never happened. That is a fabricated
// history on a governed record, which is worse than no history at all.

import assert from "node:assert/strict";
import { test } from "node:test";

import { loadPlanRevisions, supersededResolutions, type PlanRevisionRow } from "./resolution-history";
import type { SessionTokenAccessor } from "@/lib/session";

const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

/** `clara._onboarding_plan_snapshot` (0017:1911-1918) builds `{plan, items:[to_jsonb(row)]}`. */
const snap = (items: { item_key: string; state: string; answer: unknown; answered_at: string | null }[]) => ({
  plan: { id: PLAN_ID },
  items,
});

const rev = (n: number, items: Parameters<typeof snap>[0], createdAt = `2026-09-0${n}T00:00:00Z`): PlanRevisionRow => ({
  revision_n: n,
  snapshot: snap(items),
  created_at: createdAt,
});

const OTHER = { item_key: "fye", state: "answered", answer: "31 December", answered_at: "2026-09-01T00:00:00Z" };

// ---------------------------------------------------------------------------
// H-26 — the trail agrees with the row: object answers read as text, not JSON.
// ---------------------------------------------------------------------------

test("an OBJECT answer on the trail renders as ordered key: value text, never JSON", () => {
  const revisions = [
    rev(1, [{ item_key: "coa_chart_apply", state: "deferred", answer: { chart: "firm_template", applied: false }, answered_at: "2026-09-01T00:00:00Z" }]),
    rev(2, [{ item_key: "coa_chart_apply", state: "answered", answer: { chart: "firm_template", applied: true }, answered_at: "2026-09-02T00:00:00Z" }]),
    rev(3, [{ item_key: "coa_chart_apply", state: "answered", answer: "hand-corrected", answered_at: "2026-09-03T00:00:00Z" }]),
  ];
  const chain = supersededResolutions(revisions, "coa_chart_apply");
  assert.equal(chain.length, 2, "two superseded answers, the standing one dropped");
  for (const entry of chain) {
    assert.doesNotMatch(entry.answerText, /[{}]/, `the trail must never render JSON; got: ${entry.answerText}`);
    assert.doesNotMatch(entry.answerText, /\[object Object\]/, `got: ${entry.answerText}`);
  }
  assert.equal(chain[0]!.answerText, "chart: firm_template · applied: false");
  assert.equal(chain[1]!.answerText, "chart: firm_template · applied: true");
});

test("TWO DIFFERENT objects still de-duplicate correctly — the change is detected on the rendered text", () => {
  // The de-dup compares rendered text, so this is the cell that proves the new renderer did
  // not collapse two genuinely different answers into one (which would DELETE a real
  // supersession from a governed trail) or split one unchanged answer into many (a fabricated
  // history — the defect this whole file exists for).
  const unchanged = { registration: "202401047756", form: "unified", format_verified: true };
  const revisions = [
    rev(1, [{ item_key: "ssm", state: "answered", answer: unchanged, answered_at: "2026-09-01T00:00:00Z" }, OTHER]),
    rev(2, [{ item_key: "ssm", state: "answered", answer: { ...unchanged }, answered_at: "2026-09-01T00:00:00Z" }, OTHER]),
    rev(3, [{ item_key: "ssm", state: "answered", answer: { registration: "1593602-X", form: "rob", format_verified: true }, answered_at: "2026-09-02T00:00:00Z" }, OTHER]),
    rev(4, [{ item_key: "ssm", state: "answered", answer: { registration: "202401047756 (1593602-X)", form: "combined", format_verified: true }, answered_at: "2026-09-03T00:00:00Z" }, OTHER]),
  ];
  const chain = supersededResolutions(revisions, "ssm");
  assert.deepEqual(
    chain.map((c) => c.answerText),
    [
      "registration: 202401047756 · form: unified · format_verified: true",
      "registration: 1593602-X · form: rob · format_verified: true",
    ],
    "two entries: the unchanged repeat collapsed, the two real changes kept, the standing answer dropped",
  );
});

test("the standing answer is not listed as its own supersession", () => {
  const revisions = [
    rev(1, [{ item_key: "banks", state: "pending", answer: null, answered_at: null }]),
    rev(2, [{ item_key: "banks", state: "resolved", answer: "Maybank only", answered_at: "2026-09-02T01:00:00Z" }]),
  ];
  assert.deepEqual(
    supersededResolutions(revisions, "banks"),
    [],
    "one answer has superseded nothing — the card already renders it as current",
  );
});

test("an amend chain lists every earlier answer, oldest first, with the DB's own answered_at", () => {
  const revisions = [
    rev(1, [{ item_key: "banks", state: "pending", answer: null, answered_at: null }]),
    rev(2, [{ item_key: "banks", state: "resolved", answer: "Maybank only", answered_at: "2026-09-02T01:00:00Z" }]),
    rev(3, [{ item_key: "banks", state: "resolved", answer: "Maybank and CIMB", answered_at: "2026-09-02T02:00:00Z" }]),
    rev(4, [{ item_key: "banks", state: "resolved", answer: "Maybank, CIMB and HSBC", answered_at: "2026-09-02T03:00:00Z" }]),
  ];
  assert.deepEqual(supersededResolutions(revisions, "banks"), [
    { revisionN: 2, at: "2026-09-02T01:00:00Z", state: "resolved", answerText: "Maybank only" },
    { revisionN: 3, at: "2026-09-02T02:00:00Z", state: "resolved", answerText: "Maybank and CIMB" },
  ]);
});

test("THE DEDUPE: revisions written for OTHER items add no phantom amendments", () => {
  // Six snapshots, one real amend. A per-snapshot projection would claim four supersessions.
  const banksA = { item_key: "banks", state: "resolved", answer: "Maybank only", answered_at: "2026-09-02T01:00:00Z" };
  const banksB = { item_key: "banks", state: "resolved", answer: "Maybank and CIMB", answered_at: "2026-09-02T05:00:00Z" };
  const revisions = [
    rev(1, [{ item_key: "banks", state: "pending", answer: null, answered_at: null }, OTHER]),
    rev(2, [banksA, OTHER]),
    rev(3, [banksA, OTHER]),
    rev(4, [banksA, OTHER]),
    rev(5, [banksB, OTHER]),
    rev(6, [banksB, OTHER]),
  ];
  const chain = supersededResolutions(revisions, "banks");
  assert.equal(chain.length, 1, "exactly one supersession happened, and exactly one is reported");
  assert.deepEqual(chain[0], { revisionN: 2, at: "2026-09-02T01:00:00Z", state: "resolved", answerText: "Maybank only" });
});

test("a re-opened item does not chain across the gap", () => {
  // If an item returns to `pending`, the answer before it is not superseded BY the next one
  // in a continuous chain — the run restarts, and the dedupe memory resets with it.
  const revisions = [
    rev(1, [{ item_key: "banks", state: "resolved", answer: "Maybank", answered_at: "2026-09-01T00:00:00Z" }]),
    rev(2, [{ item_key: "banks", state: "pending", answer: null, answered_at: null }]),
    rev(3, [{ item_key: "banks", state: "resolved", answer: "Maybank", answered_at: "2026-09-03T00:00:00Z" }]),
    rev(4, [{ item_key: "banks", state: "resolved", answer: "CIMB", answered_at: "2026-09-04T00:00:00Z" }]),
  ];
  const chain = supersededResolutions(revisions, "banks");
  assert.deepEqual(chain.map((c) => c.answerText), ["Maybank", "Maybank"], "the same text either side of a re-open is two distinct answers");
});

test("an interview-written object answer is rendered, not dropped, and never re-parsed into a shape", () => {
  const revisions = [
    rev(1, [{ item_key: "coa_chart_apply", state: "deferred", answer: { chart: "firm_template", applied: false }, answered_at: "2026-09-01T00:00:00Z" }]),
    rev(2, [{ item_key: "coa_chart_apply", state: "resolved", answer: "applied by hand", answered_at: "2026-09-02T00:00:00Z" }]),
  ];
  // H-26 — this line USED to pin `'{"chart":"firm_template","applied":false}'`, i.e. the
  // defect: the amend dialog's "earlier answers" list rendered raw JSON for exactly the
  // answers the row above it now renders in words. The pin moves to the new rendering; what it
  // is still pinning is the same two properties — the object is RENDERED rather than dropped,
  // and it is not re-parsed into a shape this module invents.
  assert.deepEqual(supersededResolutions(revisions, "coa_chart_apply"), [
    { revisionN: 1, at: "2026-09-01T00:00:00Z", state: "deferred", answerText: "chart: firm_template · applied: false" },
  ]);
});

test("a malformed snapshot contributes nothing rather than a guessed entry", () => {
  const revisions: PlanRevisionRow[] = [
    { revision_n: 1, snapshot: null, created_at: "2026-09-01T00:00:00Z" },
    { revision_n: 2, snapshot: { plan: {} }, created_at: "2026-09-01T00:00:00Z" },
    { revision_n: 3, snapshot: { items: "not an array" }, created_at: "2026-09-01T00:00:00Z" },
    rev(4, [{ item_key: "banks", state: "resolved", answer: "Maybank", answered_at: "2026-09-04T00:00:00Z" }]),
    rev(5, [{ item_key: "banks", state: "resolved", answer: "CIMB", answered_at: "2026-09-05T00:00:00Z" }]),
  ];
  assert.deepEqual(supersededResolutions(revisions, "banks"), [
    { revisionN: 4, at: "2026-09-04T00:00:00Z", state: "resolved", answerText: "Maybank" },
  ]);
});

test("the trail is read from the append-only revisions table, oldest first, scoped to this plan", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await loadPlanRevisions(PLAN_ID, { session });
    const url = calls[0]!;
    assert.match(url, /onboarding_plan_revisions/, "the append-only trail, not the item row (which holds only the latest answer)");
    assert.match(url, new RegExp(`plan_id=eq\\.${PLAN_ID}`));
    assert.match(url, /order=revision_n\.asc/, "oldest first — the order the supersessions happened in");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
