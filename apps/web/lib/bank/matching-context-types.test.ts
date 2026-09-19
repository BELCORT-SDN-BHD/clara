// lib/bank/matching-context-types.ts — the #657 row converters.
//
// A converter's whole job is to make a wire answer safe to render, so the cells below are about
// the SHAPES THE WIRE CAN ACTUALLY SEND rather than the happy one: a null answer (the honest
// not-found), a missing `tie`, a `booking_block` of null, remedy calls written as strings and as
// objects, and a `counterparty_match` value outside the three named rungs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toBankLineMatchingContext, toMatchHistory, remedyCallsOf } from "./matching-context-types";

test("toBankLineMatchingContext · a null answer stays null — the read is no existence oracle and the face must render 'not available', never guess", () => {
  assert.equal(toBankLineMatchingContext(null), null);
  assert.equal(toBankLineMatchingContext(undefined), null);
});

test("toBankLineMatchingContext · line, statement, coverage and basis all survive the wire, and absent facts stay null", () => {
  const ctx = toBankLineMatchingContext({
    schema: "clara.bank-line-matching-context/v1",
    line: { line_id: "l1", amount_cents: -1500, entry_date: "2026-04-05", description: "fee" },
    statement: { id: "s1", status: "live", source_doc_sha256: "abc", original_filename: "mbb.pdf" },
    coverage: { line_count: 12, total_debit_cents: 900, total_credit_cents: 0, tie: { gl_balance_cents: -1500, unmatched_cents: -100 } },
    exception: null,
    booking_block: null,
    candidate_basis: [{ entry_id: "e1", amount_exact: true, date_delta_days: -2, counterparty_match: "id", class_hint: "payroll" }],
  });
  assert.ok(ctx);
  assert.equal(ctx.line.line_id, "l1");
  assert.equal(ctx.line.amount_cents, -1500);
  assert.equal(ctx.line.value_date, null, "a field the wire omitted is null, never undefined — an undefined renders as nothing and reads as a bug");
  assert.equal(ctx.statement.original_filename, "mbb.pdf", "AC6's filename");
  assert.equal(ctx.statement.source_doc_sha256, "abc", "0038:375's digest, which no other read emits");
  assert.equal(ctx.coverage.tie?.gl_balance_cents, -1500);
  assert.equal(ctx.candidate_basis[0]?.counterparty_match, "id");
  assert.equal(ctx.exception, null);
  assert.equal(ctx.booking_block, null);
});

test("toBankLineMatchingContext · a missing tie is null rather than a zeroed object, and an unknown counterparty rung falls back to 'none'", () => {
  const ctx = toBankLineMatchingContext({
    line: { line_id: "l1" },
    statement: {},
    coverage: { line_count: 0 },
    candidate_basis: [{ entry_id: "e1", counterparty_match: "fuzzy-0.82" }],
  });
  assert.ok(ctx);
  assert.equal(ctx.coverage.tie, null, "a missing tie must NOT become {0,0} — a zero a human can read is a claim the DB never made");
  assert.equal(ctx.candidate_basis[0]?.counterparty_match, "none",
    "anything outside the three named rungs is 'none' — a score sneaking in through this field would be exactly what Q3/J2 forbids");
  assert.equal(ctx.candidate_basis[0]?.amount_exact, false);
});

test("remedyCallsOf · string and object remedy calls both render, and anything else is dropped rather than stringified", () => {
  assert.deepEqual(
    remedyCallsOf({ remedy_calls: ["clara.reverse_entry", { call: "clara.resolve_bank_line_exception" }, { name: "clara.unmatch_bank_match" }] }),
    ["clara.reverse_entry", "clara.resolve_bank_line_exception", "clara.unmatch_bank_match"],
  );
  assert.deepEqual(remedyCallsOf({ remedy_calls: [42, null, "", {}] }), [],
    "a shape this face does not understand is dropped — never rendered as '[object Object]' beside real remedies");
  assert.deepEqual(remedyCallsOf({}), [], "no remedy_calls at all is an empty list, not a throw");
});

test("toMatchHistory · a bounded history maps row for row and a non-array degrades to []", () => {
  assert.deepEqual(
    toMatchHistory([{ match_id: "m1", status: "live", matched_cents: -1500, acted_at: "2026-03-01T00:00:00.000Z" }]),
    [{ match_id: "m1", status: "live", matched_cents: -1500, acted_at: "2026-03-01T00:00:00.000Z" }],
  );
  assert.deepEqual(toMatchHistory(null), []);
  assert.deepEqual(toMatchHistory("nope"), []);
});
