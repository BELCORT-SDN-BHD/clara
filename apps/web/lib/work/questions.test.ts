// #629 — THE REFUSAL MAPPING AND THE OP KEY, under test.
//
// WHAT A GREEN HERE MEANS. Every refusal `clara.answer_work_question` can raise lands in the ONE
// of four outcomes that has the right next action for a person: fix a value, converge on the
// authoritative record, stop (denied), or retry the SAME key (transport). The pair (code, reason)
// is what decides it — never the code alone, because CLR10 carries both "your value is wrong" and
// "this browser already spent this key", and those are different sentences to different people.
//
// AND THE OP KEY IS THE WHOLE LOST-RESPONSE STORY. A retry after a lost acknowledgement must REPLAY
// (same key, same payload) and an edited draft must be a new intent (different key). Both are
// asserted, because a random-key implementation passes every other test in this file and turns
// every retry into an "already answered" refusal against the person's own answer.

import assert from "node:assert/strict";
import { test } from "node:test";

import { RefusalError } from "../wire";
import {
  answerOpKey,
  isConvergeReason,
  mapAnswerRefusal,
  workAnswerDraftKey,
  type AnswerRefusal,
} from "./questions";

function refusal(code: string, reason: string | null, detail: Record<string, unknown> | null = null): RefusalError {
  return new RefusalError(code, `${code} ${reason ?? ""}`, {
    reason,
    status: 400,
    pgCode: code,
    codeSource: "sqlstate",
    detail,
  });
}

test("an invalid value names the FIELD and the CONSTRAINT, so the form can focus the control", () => {
  const out = mapAnswerRefusal(
    refusal("CLR10", "invalid_answer", { reason: "invalid_answer", field: "amount_cents", constraint: "integer_cents" }),
  ) as Extract<AnswerRefusal, { kind: "invalid" }>;
  assert.equal(out.kind, "invalid");
  assert.equal(out.field, "amount_cents");
  assert.equal(out.constraint, "integer_cents");
});

test("an invalid answer with an unreadable detail is still INVALID — never a generic failure", () => {
  const out = mapAnswerRefusal(refusal("CLR10", "invalid_answer", null)) as Extract<AnswerRefusal, { kind: "invalid" }>;
  assert.equal(out.kind, "invalid");
  assert.equal(out.field, null, "no field to focus — the message still says what was wrong");
});

test("a reused op key is NOT a converge: nothing about the question moved", () => {
  const out = mapAnswerRefusal(refusal("CLR10", "op_key_conflict", { reason: "op_key_conflict" }));
  assert.equal(out.kind, "invalid");
  assert.equal(out.kind === "invalid" ? out.constraint : null, "op_key_conflict");
});

test("every CLR13 converges, and carries the AUTHORITATIVE current record when the door sent one", () => {
  const current = { status: "answered", question_version: 1, answered_by: "u-1", answered_at: "2026-09-10T00:00:00Z" };
  for (const reason of ["already_answered", "stale_question", "expired", "cancelled", "basis_changed", "state_changed"]) {
    const out = mapAnswerRefusal(refusal("CLR13", reason, { reason, current }));
    assert.equal(out.kind, "converge", `CLR13/${reason} must converge`);
    assert.equal(out.kind === "converge" ? out.reason : null, reason);
    assert.deepEqual(out.kind === "converge" ? out.current : null, current);
  }
});

test("a CLR13 this build has not met still CONVERGES rather than falling through to failure", () => {
  const out = mapAnswerRefusal(refusal("CLR13", "some_future_reason", null));
  assert.equal(out.kind, "converge");
  assert.equal(out.kind === "converge" ? out.current : "x", null);
});

test("an authority or not-found refusal is DENIED — never a validation problem to retype", () => {
  assert.equal(mapAnswerRefusal(refusal("CLR04", "client_inactive")).kind, "denied");
  assert.equal(mapAnswerRefusal(refusal("CLR11", "question_not_found")).kind, "denied");
});

test("an unrecognised CLR code is a FAILURE, and does not masquerade as a business refusal", () => {
  assert.equal(mapAnswerRefusal(refusal("CLR19", "write_into_closed_period")).kind, "failed");
});

test("isConvergeReason is the ONE list the mapper and the copy layer share", () => {
  assert.equal(isConvergeReason("already_answered"), true);
  assert.equal(isConvergeReason("invalid_answer"), false);
  assert.equal(isConvergeReason(null), false);
});

test("the op key REPLAYS an identical draft and CHANGES with an edited one", () => {
  const draft = { posting_date: "2026-09-05", amount_cents: "1200.00" };
  const again = { amount_cents: "1200.00", posting_date: "2026-09-05" }; // same values, other key order
  assert.equal(
    answerOpKey("q-1", 1, draft),
    answerOpKey("q-1", 1, again),
    "a retry after a lost response must REPLAY — key order is not intent",
  );
  assert.notEqual(
    answerOpKey("q-1", 1, draft),
    answerOpKey("q-1", 1, { ...draft, amount_cents: "1200.01" }),
    "an edited draft is a different intent and gets its own reservation",
  );
});

test("the op key is scoped to the QUESTION and its VERSION, so a re-ask cannot collide", () => {
  const draft = { posting_date: "2026-09-05" };
  assert.notEqual(answerOpKey("q-1", 1, draft), answerOpKey("q-1", 2, draft));
  assert.notEqual(answerOpKey("q-1", 1, draft), answerOpKey("q-2", 1, draft));
  assert.match(answerOpKey("q-1", 1, draft), /^wq:q-1:1:[0-9a-f]{16}$/);
});

test("the draft key carries ALL FIVE scopes — a change to any one of them is a different draft", () => {
  const base = { userId: "u", firmId: "f", clientId: "c", questionId: "q", version: 1 };
  const key = workAnswerDraftKey(base);
  for (const [field, value] of [["userId", "u2"], ["firmId", "f2"], ["clientId", "c2"], ["questionId", "q2"]] as const) {
    assert.notEqual(workAnswerDraftKey({ ...base, [field]: value }), key, `${field} must scope the draft`);
  }
  assert.notEqual(
    workAnswerDraftKey({ ...base, version: 2 }),
    key,
    "a re-asked question must never be offered the previous version's draft",
  );
});
