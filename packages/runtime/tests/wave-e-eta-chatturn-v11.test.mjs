// Wave E lane eta — the v11 authoring closure's REFUSAL MAPPING, unit-tested.
//
// WHY THIS FILE EXISTS. The mapping from a database refusal to what the model actually receives is
// judgement logic, and until this file it shipped with no test at all. The db-side battery asserts
// the DATABASE's payload — that the deferred preview names its three blocked verbs, that a blank
// op key refuses with class op_key — and never once asserts the TypeScript that carries any of it
// to the model. An edit that stopped forwarding blocked_on would have stayed green everywhere:
// the SQL still emits it, the cell still passes, and the model quietly stops being told.
//
// Every cell here drives the exported authoringRefusal directly. No database, no network.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const { authoringRefusal, stableOpKey, canonicalJson } = await import("../workflows/chatTurn.v11.tools.ts");

const asErr = (code, message, detail) => ({ code, message, detail });

test("a named reason and fix are surfaced as fields, and not duplicated into details", () => {
  const r = authoringRefusal(asErr("CLR10", "malformed", JSON.stringify({
    reason: "invalid_request", fix: "supply the key", class: "op_key",
  })));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid_request");
  assert.equal(r.fix, "supply the key");
  assert.equal(r.details.class, "op_key", "the unnamed keys still reach the model");
  assert.equal("reason" in r.details, false, "a CAPTURED reason is not repeated in details");
  assert.equal("fix" in r.details, false, "a CAPTURED fix is not repeated in details");
});

// THE REGRESSION CELL for the drop this mapping used to reintroduce one level down. reason/fix are
// only captured as NAMED fields when they are strings; an earlier cut excluded them from details
// unconditionally, so a non-string one reached the model NOWHERE.
test("a NON-string reason or fix is kept in details rather than vanishing", () => {
  const r = authoringRefusal(asErr("CLR10", "malformed", JSON.stringify({
    reason: ["scope_mismatch", "stale_snapshot"], fix: { do: "re-mint" }, class: "context",
  })));
  assert.equal(r.reason, null, "a non-string reason cannot be the named string field");
  assert.equal(r.fix, null, "nor a non-string fix");
  assert.deepEqual(r.details.reason, ["scope_mismatch", "stale_snapshot"],
    "but it survives in details — the database said it, so the model hears it");
  assert.deepEqual(r.details.fix, { do: "re-mint" }, "and so does a structured fix");
  assert.equal(r.details.class, "context");
});

test("the deferred-preview payload reaches the model whole", () => {
  const r = authoringRefusal(asErr("CLR10", "an agent cannot request a report preview in this version",
    JSON.stringify({
      reason: "report_preview_deferred", class: "render_preview_chain",
      requested_kind: "draft_watermarked",
      blocked_on: ["clara.open_report_run", "clara.evaluate_fs_pack_v1", "clara.seal_report_dataset"],
      why: "every verb in the chain resolves a human JWT context", fix: "run the chain on the HUMAN lane",
    })));
  assert.equal(r.reason, "report_preview_deferred");
  assert.equal(r.details.requested_kind, "draft_watermarked");
  assert.deepEqual(r.details.blocked_on,
    ["clara.open_report_run", "clara.evaluate_fs_pack_v1", "clara.seal_report_dataset"],
    "the three blocked verbs are the actionable half of this refusal");
  assert.equal(r.details.class, "render_preview_chain");
  assert.ok(typeof r.details.why === "string" && r.details.why.length > 0);
});

test("an ARRAY detail is carried under a name, never spread as positional keys", () => {
  const r = authoringRefusal(asErr("CLR10", "odd", JSON.stringify(["a", "b"])));
  assert.deepEqual(r.details.detail_items, ["a", "b"]);
  assert.equal("0" in r.details, false, "an array never reaches the model as {0:…,1:…}");
});

// The THIRD shape this one function used to drop silently, after a non-string reason/fix and an
// array: a JSON SCALAR parses cleanly and is not an object, so a typeof test written for the
// expected case returned {} and the database's words vanished.
test("a SCALAR detail is carried too, and a literal null contributes nothing", () => {
  for (const [label, raw, expected] of [
    ["number", "42", 42],
    ["boolean", "true", true],
    ["string", JSON.stringify("stale_snapshot"), "stale_snapshot"],
  ]) {
    const r = authoringRefusal(asErr("CLR10", "odd", raw));
    assert.equal(r.details.detail_value, expected, `a bare JSON ${label} reaches the model`);
  }
  const nul = authoringRefusal(asErr("CLR10", "odd", "null"));
  assert.deepEqual(nul.details, {}, "a literal JSON null carries nothing, so it contributes nothing");
});

test("a NON-JSON detail yields nothing rather than leaking postgres's own text", () => {
  // PostgreSQL authors plain-text details on its built-in errors; a unique violation's carries the
  // failing row's values. Those must not become model-visible fields.
  const r = authoringRefusal(asErr("23505", "duplicate key value violates unique constraint",
    "Key (firm_id, op_key)=(9f1c, eta-1) already exists."));
  assert.deepEqual(r.details, {}, "unparseable detail contributes no keys at all");
  assert.equal(r.reason, null);
  assert.equal(r.message, "duplicate key value violates unique constraint");
});

test("a refusal with no detail at all is still a well-formed result", () => {
  const r = authoringRefusal(asErr("CLR11", "client not found in your firm", undefined));
  assert.equal(r.ok, false);
  assert.equal(r.code, "CLR11");
  assert.equal(r.reason, null);
  assert.equal(r.fix, null);
  assert.deepEqual(r.details, {});
  assert.equal(r.message, "client not found in your firm");
});

test("CLR03 is re-worded for the human, and never echoes the raw credential error", () => {
  const r = authoringRefusal(asErr("CLR03", "no valid wake credential", undefined));
  assert.equal(r.code, "CLR03");
  assert.equal(r.message, "That authoring action is not permitted in this session.");
  assert.doesNotMatch(r.message, /credential/i, "the session wording does not surface the mechanism");
});

test("a refusal with no code at all is labelled internal rather than undefined", () => {
  const r = authoringRefusal({});
  assert.equal(r.code, "internal");
  assert.equal(r.message, "That authoring action could not be completed.");
});

// The op key is the other half of this file's judgement logic: a replayed WDK step must produce a
// byte-identical key or it mints a second draft.
test("the op key is deterministic for equal input and distinct for different input", () => {
  const input = { b: 2, a: [1, { z: 1, y: 2 }] };
  const same = { a: [1, { y: 2, z: 1 }], b: 2 };
  assert.equal(stableOpKey("task-1", "draft_report_spec", input),
    stableOpKey("task-1", "draft_report_spec", same),
    "key order in the input cannot change the key — canonicalJson sorts it");
  assert.notEqual(stableOpKey("task-1", "draft_report_spec", input),
    stableOpKey("task-2", "draft_report_spec", input), "a different task is a different operation");
  assert.notEqual(stableOpKey("task-1", "draft_report_spec", input),
    stableOpKey("task-1", "save_metric_definition_draft", input), "so is a different tool");
  assert.notEqual(stableOpKey("task-1", "draft_report_spec", input),
    stableOpKey("task-1", "draft_report_spec", { ...input, b: 3 }), "so is a changed argument");
});

test("the op-key separator cannot be forged from field values", () => {
  // The separator is U+0000, which canonicalJson can never emit unescaped — so no combination of
  // taskId and toolName can produce the material of a different call.
  assert.notEqual(stableOpKey("a", "b-c", {}), stableOpKey("a-b", "c", {}));
  assert.equal(canonicalJson({ s: "\u0000" }), '{"s":"\\u0000"}',
    "a NUL inside a value is escaped by JSON.stringify, so it cannot impersonate the separator");
});
