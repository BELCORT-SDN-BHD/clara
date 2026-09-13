// #641 — the Work list's URL-state model, under test.
//
// THE URL IS USER-EDITABLE INPUT, and every cell below is about that: a stale bookmark, a
// hand-typed status, a `?client=` someone pasted from a chat message. None of them may throw, and
// none of them may reach the door as a value it would refuse. The sharpest cells are the ones
// that assert what is DROPPED.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyWorkListUrlState,
  hasWorkListFilters,
  parseWorkListUrlState,
  workListStateQuery,
  EMPTY_WORK_LIST_STATE,
} from "./work-list-url-state";

const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const parse = (search: string) => parseWorkListUrlState(new URLSearchParams(search));

test("a full query round-trips through parse and apply", () => {
  const search =
    `client=${CLIENT}&status=awaiting_input,failed&purpose=journal_entry&initiator=${USER}`
    + "&since=2026-09-01&until=2026-09-30&q=rent&cursor=abc123";
  const state = parse(search);

  assert.equal(state.client, CLIENT);
  assert.deepEqual(state.status, ["awaiting_input", "failed"]);
  assert.deepEqual(state.purpose, ["journal_entry"]);
  assert.equal(state.initiator, USER);
  assert.equal(state.since, "2026-09-01");
  assert.equal(state.until, "2026-09-30");
  assert.equal(state.q, "rent");
  assert.equal(state.cursor, "abc123");

  // Applied onto an EMPTY base, the same state comes back out.
  const rebuilt = applyWorkListUrlState(new URLSearchParams(), state);
  const reparsed = parseWorkListUrlState(rebuilt);
  assert.deepEqual(reparsed, { ...state, view: null });
});

test("unknown and malformed tokens are DROPPED, never thrown and never forwarded", () => {
  // A status this build does not know would be a CLR10 `invalid_status` at the door — a refusal a
  // person following a stale bookmark never asked for.
  assert.deepEqual(parse("status=awaiting_input,not_a_status,failed").status, ["awaiting_input", "failed"]);
  // A non-uuid client/initiator would be a raw PostgREST 400 `22P02` on a uuid parameter.
  assert.equal(parse("client=not-a-client").client, null);
  assert.equal(parse("initiator=nope").initiator, null);
  // A date that is not a real calendar day.
  assert.equal(parse("since=2026-02-30").since, null);
  assert.equal(parse("until=yesterday").until, null);
  // Blank values are absences, not empty filters.
  assert.equal(parse("q=&cursor=&view=").q, null);
  assert.deepEqual(parse("status=").status, []);
  // Duplicates collapse; blanks inside a list are stripped.
  assert.deepEqual(parse("status=failed,,failed").status, ["failed"]);
  // And an ENTIRELY unknown vocabulary on the purpose axis is PASSED THROUGH — 0178's CHECK owns
  // that roster and concurrent lanes are widening it, so this module does not keep a second one.
  assert.deepEqual(parse("purpose=some_future_purpose").purpose, ["some_future_purpose"]);
});

test("an empty query parses to the empty state", () => {
  assert.deepEqual(parse(""), EMPTY_WORK_LIST_STATE);
  assert.equal(hasWorkListFilters(parse("")), false);
  assert.equal(hasWorkListFilters(parse("cursor=abc")), false, "a cursor is a PAGE, not a filter");
  assert.equal(hasWorkListFilters(parse("q=rent")), true);
});

test("the built-in needs-you view contributes its status, and an explicit status overrides it", () => {
  assert.deepEqual(parse("view=needs-you").status, ["awaiting_input"]);
  assert.deepEqual(
    parse("view=needs-you&status=failed").status,
    ["failed"],
    "a person who narrowed the list by hand has said something more specific than the pill did",
  );
  assert.deepEqual(parse("view=some-saved-view").status, [], "an unknown view contributes nothing");
});

test("applying a filter DROPS the cursor; applying a cursor keeps the filters", () => {
  const base = new URLSearchParams(`status=failed&cursor=page2&client=${CLIENT}`);

  const afterFilter = applyWorkListUrlState(base, { status: ["completed"] });
  assert.equal(afterFilter.get("status"), "completed");
  assert.equal(afterFilter.get("cursor"), null, "a cursor fences ONE result set; a new filter is a new one");
  assert.equal(afterFilter.get("client"), CLIENT, "an untouched axis is left exactly as it was");

  const afterPage = applyWorkListUrlState(base, { cursor: "page3" });
  assert.equal(afterPage.get("cursor"), "page3");
  assert.equal(afterPage.get("status"), "failed");

  // A patch that names BOTH wins with the explicit cursor (that is what "go to this page of this
  // filtered list" means).
  const both = applyWorkListUrlState(base, { status: ["queued"], cursor: "page9" });
  assert.equal(both.get("cursor"), "page9");
  assert.equal(both.get("status"), "queued");
});

test("an emptied field DELETES its key rather than writing an empty one", () => {
  const base = new URLSearchParams("since=2026-09-01&until=2026-09-30&q=rent&status=failed");
  const cleared = applyWorkListUrlState(base, { since: null, until: null, q: null, status: [] });
  assert.equal(cleared.toString(), "", "no dead ?since=&until= noise accumulates");
});

test("the canonical query sorts list values and omits the cursor", () => {
  const a = parse("status=failed,awaiting_input&purpose=journal_entry");
  const b = parse("status=awaiting_input,failed&purpose=journal_entry&cursor=page7");
  assert.equal(
    workListStateQuery(a),
    workListStateQuery(b),
    "the same filter set chosen in two orders, on two pages, is ONE saved view",
  );
  assert.match(workListStateQuery(b), /status=awaiting_input%2Cfailed/);
  assert.doesNotMatch(workListStateQuery(b), /cursor/);
  assert.equal(workListStateQuery(parse("")), "");
});
