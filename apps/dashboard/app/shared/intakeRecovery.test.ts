// 0051 §2 — the recovery door's answer must reach the person who uploaded the file.
//
// THE DEFECT THESE CELLS CLOSE. clara.finalize_document_intake answers HTTP 202 with
// `status:'adopted'` whether it retried the document or refused to, and it puts the WHY and the
// what-to-do-instead in a `recovery_refused` fragment on that same receipt. The client threw
// the body away (`Promise<void>`) and the upload queue rendered every adopted row as
// "Stored — matched an existing document". So a bookkeeper re-uploading a corrupt file — the
// exact action the door exists to serve — was told it worked, and nothing happened.
//
// These are PURE cells over the copy helper. The receipt shapes are the ones migration 0051 §2
// actually emits (mint · echo · the four named refusals · an ordinary adoption with neither
// key), and the door's own remedy text is preferred wherever it is present because that
// wording is deliberately careful never to assert the file is bad.

import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryCopy } from "./intake";

test("an ordinary adoption produces no recovery copy at all", () => {
  assert.equal(recoveryCopy({ status: "adopted", document_id: "d1" }), null,
    "a duplicate upload of a healthy document is unchanged — no new copy, no new state");
  assert.equal(recoveryCopy({ status: "finalized", document_id: "d1" }), null, "…and neither is a fresh one");
  assert.equal(recoveryCopy(null), null, "…nor a missing receipt");
  assert.equal(recoveryCopy(undefined), null, "…nor an absent one");
});

test("a MINT tells the uploader the document is being re-read", () => {
  const copy = recoveryCopy({ status: "adopted", recovery: { mode: "mint", lane: "ocr", task_id: "t1" } });
  assert.ok(copy, "a minted recovery produces copy");
  assert.match(copy.label, /re-reading/i, "…saying the document is being read again, not merely 'stored'");
  assert.equal(copy.detail, null, "…with no remedy to offer: nothing is wrong");
});

test("an ECHO reads the same as a mint — the person does not need to know which mode fired", () => {
  const copy = recoveryCopy({ status: "adopted", recovery: { mode: "echo", lane: "ocr", task_id: "t1" } });
  assert.ok(copy, "an echo produces copy too");
  assert.match(copy.label, /re-reading/i, "…the same promise, because the same thing happens next");
});

test("a REFUSAL surfaces its named reason and the door's own remedy", () => {
  const remedy = "this document could not be read in its current form. That can mean the file itself, "
    + "or that the reading service refused the request.";
  const copy = recoveryCopy({
    status: "adopted",
    recovery_refused: { reason: "not_retryable", error_code: "corrupt", remedy },
  });
  assert.ok(copy, "a refusal produces copy");
  assert.match(copy.label, /not re-read/i, "…the label says plainly that nothing was retried");
  assert.equal(copy.detail, remedy,
    "…and the DETAIL is the DB's own remedy verbatim — that wording is the authoritative one and "
    + "is written never to assert the file is bad, because a read can also fail when the reading "
    + "service refuses the request (egress.mjs classifies 401/403 as bad_type)");
  assert.doesNotMatch(copy.detail, /corrupt|invalid file/i,
    "…so the copy never tells someone their good file is broken");
});

test("a MIME mismatch names both types so the remedy is actionable", () => {
  // The CSV/TSV case: identical bytes, same hash, different extension. Without both types on
  // screen the instruction "re-upload it in its original form" is unfollowable.
  const copy = recoveryCopy({
    status: "adopted",
    recovery_refused: { reason: "mime_mismatch", document_mime: "text/csv", upload_mime: "text/tab-separated-values" },
  });
  assert.ok(copy, "a mime mismatch produces copy");
  assert.match(copy.label, /different file type/i, "…the label names the cause");
  assert.match(copy.detail ?? "", /text\/csv/, "…the detail names what the document IS");
  assert.match(copy.detail ?? "", /text\/tab-separated-values/, "…and what was sent");
  assert.match(copy.detail ?? "", /original form/i, "…and what to do about it");
});

test("the remaining refusals each say why, and none of them reads as success", () => {
  for (const [reason, pattern] of [
    ["attempt_cap", /attempts/i],
    ["lane_busy", /already in progress/i],
  ] as const) {
    const copy = recoveryCopy({ status: "adopted", recovery_refused: { reason } });
    assert.ok(copy, `${reason} produces copy`);
    assert.match(copy.label, pattern, `${reason} names its own cause`);
    assert.doesNotMatch(copy.label, /^Stored$|matched an existing document/i,
      `${reason} must never render as the plain adoption message — that is the defect`);
  }
  // An unrecognised reason still refuses out loud rather than falling back to silence.
  const unknown = recoveryCopy({ status: "adopted", recovery_refused: { reason: "something_new" } });
  assert.ok(unknown, "an unknown reason still produces copy");
  assert.match(unknown.label, /not re-read/i, "…fail-closed: say nothing happened rather than imply it did");
});
