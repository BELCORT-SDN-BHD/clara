import { test } from "node:test";
import assert from "node:assert/strict";

import {
  activityThread,
  appendUnique,
  echoAnswer,
  foldActivityThread,
  promptEntry,
  seedThread,
  type ThreadEntry,
} from "./thread";

test("echoAnswer renders only the confirmed value it is given", () => {
  assert.equal(echoAnswer(null), "—");
  assert.equal(echoAnswer("Rome"), "Rome");
  assert.equal(echoAnswer(12), "12");
  assert.equal(echoAnswer(false), "false");
  assert.equal(echoAnswer({ currency: "MYR" }), '{"currency":"MYR"}');
});

test("seedThread emits durable answered/resolved pairs and skips the internal interview_run item", () => {
  const entries = seedThread([
    { item_key: "interview_run", item_kind: "internal", state: "answered", required_for_commit: false, question: "Never show", answer: "run-1" },
    { item_key: "legal_name", item_kind: "must_ask", state: "answered", required_for_commit: true, question: "Legal name?", answer: "Rome Public Advisory" },
    { item_key: "fye", item_kind: "must_ask", state: "resolved", required_for_commit: true, question: "Financial year end?", answer: "31 December" },
    { item_key: "tin", item_kind: "must_ask", state: "pending", required_for_commit: true, question: "TIN?", answer: null },
  ]);
  assert.deepEqual(entries, [
    { id: "iq:legal_name", role: "clara", seg: "legal_name", text: "Legal name?" },
    { id: "ia:legal_name", role: "you", seg: "legal_name", text: "Rome Public Advisory" },
    { id: "iq:fye", role: "clara", seg: "fye", text: "Financial year end?" },
    { id: "ia:fye", role: "you", seg: "fye", text: "31 December" },
  ]);
});

test("activityThread maps sanitized confirmed activity in stream order", () => {
  assert.deepEqual(activityThread([
    { kind: "answered", seg: "legal_name", phase: "q", echo: "Rome", at: "2026-09-01" },
    { kind: "answered", seg: "entity_type", echo: "company" },
  ]), [
    { id: "act:legal_name:0", role: "you", seg: "legal_name", text: "Rome", at: "2026-09-01" },
    { id: "act:entity_type:1", role: "you", seg: "entity_type", text: "company", at: undefined },
  ]);
});

test("foldActivityThread is idempotent across repeated polls and never duplicates a matching confirmed answer", () => {
  const log: ThreadEntry[] = [{ id: "p:1:q", role: "clara", seg: "legal_name", phase: "q", text: "Name?" }];
  const activity = [{ kind: "answered" as const, seg: "legal_name", echo: "Rome" }];
  const once = foldActivityThread(log, activity);
  const twice = foldActivityThread(once, activity);
  assert.deepEqual(twice, once);
  assert.equal(twice.filter((entry) => entry.role === "you").length, 1);
});

test("promptEntry uses a stable park+phase id", () => {
  assert.deepEqual(promptEntry({ parkIndex: 7, seg: "tin", phase: "c", question: "Confirm TIN?" }), {
    id: "p:7:c", role: "clara", seg: "tin", phase: "c", text: "Confirm TIN?",
  });
});

test("appendUnique appends once by id and never mutates the input", () => {
  const original: ThreadEntry[] = [{ id: "one", role: "clara", text: "Question" }];
  const added = appendUnique(original, { id: "two", role: "you", text: "Answer" });
  assert.equal(original.length, 1);
  assert.equal(added.length, 2);
  const duplicate = appendUnique(added, { id: "two", role: "you", text: "Different copy" });
  assert.deepEqual(duplicate, added);
  assert.notEqual(duplicate, added, "the helper always returns a new array");
});
