// Pure tests for the interview thread model (settled dashboard plan §3.1).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { StatePlanItem, PendingPark, ActivityEntry } from "../shared/interviewApi";
import { seedThread, activityThread, foldActivityThread, promptEntry, answerEntry, noteEntry, appendUnique, removeEntry, echoAnswer } from "./thread";

function mkItem(p: Partial<StatePlanItem>): StatePlanItem {
  return { item_key: "k", item_kind: "capture", state: "answered", required_for_commit: false, question: "Q?", answer: "A", ...p };
}

test("seedThread pairs each answered item into a clara-question + you-answer, skipping internals", () => {
  const items = [
    mkItem({ item_key: "legal_name", question: "Name?", answer: "ACME", state: "answered" }),
    mkItem({ item_key: "interview_run", question: null, answer: { run_id: "r1" }, state: "answered" }), // internal → skipped
    mkItem({ item_key: "fye", question: "FYE?", answer: 12, state: "pending" }), // not answered → skipped
  ];
  const t = seedThread(items);
  assert.deepEqual(t.map((e) => [e.role, e.text]), [["clara", "Name?"], ["you", "ACME"]]);
});

test("echoAnswer renders strings, scalars, and objects compactly", () => {
  assert.equal(echoAnswer("hi"), "hi");
  assert.equal(echoAnswer(12), "12");
  assert.equal(echoAnswer(true), "true");
  assert.equal(echoAnswer(null), "—");
  assert.equal(echoAnswer({ opening: "zero" }), '{"opening":"zero"}');
});

test("activityThread folds the pinned activity[] into your-side entries", () => {
  const activity: ActivityEntry[] = [{ kind: "answered", seg: "ssm", echo: "SSM 12345678", at: "t0" }];
  const t = activityThread(activity);
  assert.equal(t.length, 1);
  assert.equal(t[0]!.role, "you");
  assert.equal(t[0]!.text, "SSM 12345678");
});

test("foldActivityThread restores the confirmed-answer trail and is idempotent across polls (F-M11)", () => {
  const activity: ActivityEntry[] = [
    { kind: "answered", seg: "legal_name", echo: "ACME SDN BHD", at: "t0" },
    { kind: "answered", seg: "ssm", echo: "SSM 12345678", at: "t1" },
  ];
  const once = foldActivityThread([], activity);
  assert.deepEqual(once.map((e) => [e.role, e.text]), [["you", "ACME SDN BHD"], ["you", "SSM 12345678"]]);
  // A second poll with the same activity[] must not duplicate (idempotent by entry id).
  const twice = foldActivityThread(once, activity);
  assert.equal(twice.length, 2, "re-folding the same activity across polls never duplicates the trail");
});

test("foldActivityThread does not double an optimistic you-answer of the same seg+text (F-M11)", () => {
  const optimistic = answerEntry({ parkIndex: 0, seg: "legal_name", phase: "q", question: "Name?" }, "ACME", "s1");
  const activity: ActivityEntry[] = [{ kind: "answered", seg: "legal_name", echo: "ACME", at: "t0" }];
  const folded = foldActivityThread([optimistic], activity);
  assert.equal(folded.length, 1, "the confirmed echo does not duplicate the optimistic bubble");
});

test("promptEntry is stable per park+phase; answerEntry is keyed per SUBMIT", () => {
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  // The prompt is one fact about the run, so it keeps its per-park id — that is what makes the
  // poller's repeated appends idempotent.
  assert.deepEqual(promptEntry(park), { id: "p:4:q", role: "clara", seg: "tin", phase: "q", text: "TIN?" });
  assert.deepEqual(answerEntry(park, "IG123", "s1"), { id: "a:4:q:s1", role: "you", seg: "tin", phase: "q", text: "IG123" });
});

test("a SECOND, different answer at the same park is its own entry — the retype renders", () => {
  // The defect: the id used to be `a:<park>:<phase>`, one per PARK. A human who answered, was
  // refused, and retyped something different produced an entry that collided with the first by
  // id — so appendUnique dropped it and the retype rendered NOTHING AT ALL.
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  let log = appendUnique([], answerEntry(park, "IG123", "s1"));
  log = appendUnique(log, answerEntry(park, "IG999", "s2"));
  assert.deepEqual(log.map((e) => e.text), ["IG123", "IG999"], "both attempts at one park render");
  assert.equal(new Set(log.map((e) => e.id)).size, 2, "and they are distinct entries, not one overwritten");

  // The same holds when the human retypes the IDENTICAL text — a second submit is a second event.
  const same = appendUnique(log, answerEntry(park, "IG999", "s3"));
  assert.equal(same.length, 3);
});

test("noteEntry (the typed-delivery breadcrumb) is keyed per submit too", () => {
  const park: PendingPark = { parkIndex: 4, seg: "commit", phase: "q", question: "Commit?" };
  assert.deepEqual(noteEntry(park, "Delivered create_firm receipt", "s1"),
    { id: "sys:4:s1", role: "you", seg: "commit", text: "Delivered create_firm receipt" });
  const log = appendUnique(appendUnique([], noteEntry(park, "n", "s1")), noteEntry(park, "n", "s2"));
  assert.equal(log.length, 2, "a retried delivery renders its own breadcrumb");
});

test("appendUnique is idempotent by id", () => {
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  let log = appendUnique([], promptEntry(park));
  log = appendUnique(log, promptEntry(park)); // same id → no dup
  assert.equal(log.length, 1);
  log = appendUnique(log, answerEntry(park, "IG123", "s1"));
  assert.equal(log.length, 2);
});

test("removeEntry rolls exactly one entry back and leaves its neighbours alone", () => {
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  const first = answerEntry(park, "IG123", "s1");
  const second = answerEntry(park, "IG999", "s2");
  const log = [promptEntry(park), first, second];

  const rolledBack = removeEntry(log, second.id);
  assert.deepEqual(rolledBack.map((e) => e.id), ["p:4:q", first.id], "only the failed attempt goes");
  assert.equal(log.length, 3, "the input is never mutated");
  assert.deepEqual(removeEntry(log, "nope"), log, "an unknown id is a no-op, not a throw");
});
