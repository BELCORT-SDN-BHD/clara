// The Home boards' pure derivations, each pinned with a DISCRIMINATING assertion — a cell that
// would still pass against a stubbed implementation proves nothing, so every case below fails
// for a DIFFERENT reason if the rule it covers is removed.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ageInDays, clientStatusTally, groupByBusinessDay, oldestWaiting } from "./home-facts";
import type { ReviewQueueRow } from "./needs-you";
import type { ClientRow } from "./reads";

const NOW = new Date("2026-09-04T10:00:00Z");

function row(id: string, agedSince: string | null): ReviewQueueRow {
  return {
    row_kind: "draft", section: "needs_you", client_id: "c1", counterparty_id: null,
    filing_id: null, entry_id: null, question_id: null, task_id: null, document_id: null,
    lane: null, auto: false, rule_backed: false, high_stakes: false, aged_since: agedSince,
    amount_cents: null, period: null, question_text: null, created_at: "2026-01-01T00:00:00Z",
    id, coding_kind: null, watch_id: null, tier: null, finding_id: null, asset_id: null,
    advance_id: null, client_name: null, batch_ids: null, open_proposal_count: null,
  };
}

test("ageInDays: FLOORS whole days — 29 hours is 1 day, never 1.2 and never 2", () => {
  assert.equal(ageInDays("2026-09-03T05:00:00Z", NOW), 1);
  // The discriminator against a rounding implementation: 47h59m must still be 1, not 2.
  assert.equal(ageInDays("2026-09-02T10:01:00Z", NOW), 1);
  assert.equal(ageInDays("2026-09-02T09:59:00Z", NOW), 2);
});

test("ageInDays: a FUTURE instant is 0, never a negative count — 'waiting -1 days' is not a sentence", () => {
  assert.equal(ageInDays("2026-09-05T10:00:00Z", NOW), 0);
});

test("ageInDays: absent and unparseable are BOTH null — the caller renders the instant instead, never a fabricated 0", () => {
  assert.equal(ageInDays(null, NOW), null);
  assert.equal(ageInDays(undefined, NOW), null);
  assert.equal(ageInDays("not-a-date", NOW), null);
  // The control: a real value is NOT null, so the three above are a measurement, not a
  // function that always returns null.
  assert.equal(ageInDays("2026-09-01T10:00:00Z", NOW), 3);
});

test("oldestWaiting: oldest FIRST, and a row with no aged_since sorts LAST rather than to either extreme", () => {
  const rows = [
    row("new", "2026-09-03T00:00:00Z"),
    row("unknown", null),
    row("old", "2026-06-01T00:00:00Z"),
    row("middle", "2026-08-01T00:00:00Z"),
  ];
  assert.deepEqual(oldestWaiting(rows, 4).map((r) => r.id), ["old", "middle", "new", "unknown"]);
  // The discriminator against "unknown sorts first": if a null were treated as epoch 0 it
  // would lead this list, and the oldest REAL row would be pushed off a top-3 cut.
  assert.deepEqual(oldestWaiting(rows, 3).map((r) => r.id), ["old", "middle", "new"]);
});

test("oldestWaiting: ties break on the queue's own stable key, so two reads of one dataset agree", () => {
  const a = row("bbb", "2026-08-01T00:00:00Z");
  const b = row("aaa", "2026-08-01T00:00:00Z");
  assert.deepEqual(oldestWaiting([a, b], 2).map((r) => r.id), ["aaa", "bbb"]);
  assert.deepEqual(oldestWaiting([b, a], 2).map((r) => r.id), ["aaa", "bbb"]);
});

test("oldestWaiting: does not mutate its input — the board renders the same rows elsewhere", () => {
  const rows = [row("b", "2026-09-03T00:00:00Z"), row("a", "2026-06-01T00:00:00Z")];
  oldestWaiting(rows, 2);
  assert.deepEqual(rows.map((r) => r.id), ["b", "a"]);
});

function client(id: string, status: string): ClientRow {
  return { id, name: id, status, created_at: "2026-01-01T00:00:00Z" };
}

test("clientStatusTally: the three known statuses are counted separately and total is every row", () => {
  const tally = clientStatusTally([
    client("1", "active"), client("2", "active"), client("3", "onboarding"), client("4", "archived"),
  ]);
  assert.deepEqual(tally, { active: 2, onboarding: 1, archived: 1, other: 0, total: 4 });
});

test("clientStatusTally: a FOURTH status the DB adds later is counted as `other`, never dropped", () => {
  const tally = clientStatusTally([client("1", "active"), client("2", "suspended")]);
  // The discriminator: total must still equal the row count, so a status nobody has taught
  // this function about cannot silently vanish from a line that claims to cover the register.
  assert.equal(tally.other, 1);
  assert.equal(tally.total, 2);
  assert.equal(tally.active + tally.onboarding + tally.archived + tally.other, tally.total);
});

test("groupByBusinessDay: buckets in Asia/Kuala_Lumpur, so a 00:00-08:00 MYT instant files under the MYT day", () => {
  // 2026-09-03T17:30:00Z is 2026-09-04 01:30 in MYT. A UTC-derived header would say Sep 3.
  const groups = groupByBusinessDay(
    [{ at: "2026-09-03T17:30:00Z" }, { at: "2026-09-03T10:00:00Z" }],
    (item) => item.at,
  );
  assert.deepEqual(groups.map((g) => g.day), ["2026-09-04", "2026-09-03"]);
  assert.equal(groups[0]?.items.length, 1);
  assert.equal(groups[1]?.items.length, 1);
});

test("groupByBusinessDay: preserves the order it was given and does not re-sort within a day", () => {
  const groups = groupByBusinessDay(
    [{ at: "2026-09-03T02:00:00Z", n: 1 }, { at: "2026-09-03T09:00:00Z", n: 2 }],
    (item) => item.at,
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]?.items.map((i) => i.n), [1, 2]);
});

test("groupByBusinessDay: an unparseable instant is DROPPED, never filed under a guessed day", () => {
  const groups = groupByBusinessDay(
    [{ at: "2026-09-03T02:00:00Z" }, { at: "" }, { at: "nonsense" }],
    (item) => item.at,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.items.length, 1);
});

test("groupByBusinessDay: an empty input yields no groups — never one empty day header", () => {
  assert.deepEqual(groupByBusinessDay([], (i: { at: string }) => i.at), []);
});
