// Pure tests for the interview thread model (settled dashboard plan §3.1).

import { test } from "node:test";
import assert from "node:assert/strict";
import type { StatePlanItem, PendingPark, ActivityEntry } from "../shared/interviewApi";
import { seedThread, activityThread, foldActivityThread, promptEntry, answerEntry, appendUnique, echoAnswer } from "./thread";

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
  const optimistic = answerEntry({ parkIndex: 0, seg: "legal_name", phase: "q", question: "Name?" }, "ACME");
  const activity: ActivityEntry[] = [{ kind: "answered", seg: "legal_name", echo: "ACME", at: "t0" }];
  const folded = foldActivityThread([optimistic], activity);
  assert.equal(folded.length, 1, "the confirmed echo does not duplicate the optimistic bubble");
});

test("promptEntry + answerEntry produce stable ids per park+phase", () => {
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  assert.deepEqual(promptEntry(park), { id: "p:4:q", role: "clara", seg: "tin", phase: "q", text: "TIN?" });
  assert.deepEqual(answerEntry(park, "IG123"), { id: "a:4:q", role: "you", seg: "tin", phase: "q", text: "IG123" });
});

test("appendUnique is idempotent by id", () => {
  const park: PendingPark = { parkIndex: 4, seg: "tin", phase: "q", question: "TIN?" };
  let log = appendUnique([], promptEntry(park));
  log = appendUnique(log, promptEntry(park)); // same id → no dup
  assert.equal(log.length, 1);
  log = appendUnique(log, answerEntry(park, "IG123"));
  assert.equal(log.length, 2);
});
