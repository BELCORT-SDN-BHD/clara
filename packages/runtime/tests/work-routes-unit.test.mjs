// #623 — THE ADMISSION DOOR'S OWN WIRE CONTRACT, driven as pure functions.
//
// `src/workRoutes.ts` exports the two decisions a cell can hold still — `toDbBasis` (the wire
// basis translated into the DATABASE's shape, with the database's own field paths) and
// `workErrorResponse` (one raised database error translated into one HTTP answer) — so this file
// drives THOSE functions rather than a copy of their predicates. That is the `turnErrorStatus`
// idiom the file's own header cites, and it is the only way to test a 409 BODY without standing up
// an HTTP server, a JWT and a database.
//
// WHAT THE REVIEWED FINDINGS ASKED FOR, AND WHERE EACH ONE IS PINNED:
//   R3  the 409 carries the EXISTING Work's id, which the database put in its detail and the
//       composer needs to offer a link instead of a dead end.
//   R4  the memo (4000, TRIMMED) and line-narration (2000, RAW) caps are refused HERE, before a
//       Work is admitted that the frozen tool schema could never let the run post.
//   R5  every field path this route emits is the DATABASE's spelling — snake_case, no `basis.`
//       prefix, 1-BASED line index — because `apps/web/lib/work/journal-basis.ts`'s
//       `fieldForServerPath` is ONE mapper written against that one vocabulary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const {
  LINE_DESCRIPTION_MAX_CHARS,
  MEMO_MAX_CHARS,
  detailField,
  reasonOf,
  toDbBasis,
  workErrorResponse,
  workErrorStatus,
} = await import("../src/workRoutes.ts");

/** A well-formed WIRE basis (camelCase — the shape the browser posts). */
function wire(overrides = {}) {
  return Object.assign(
    {
      postingDate: "2026-09-01",
      memo: "office rent paid from Maybank",
      currency: "MYR",
      lines: [
        { accountCode: "6100", debitCents: 120000, creditCents: 0, description: "office rent" },
        { accountCode: "1100", debitCents: 0, creditCents: 120000, description: "Maybank" },
      ],
    },
    overrides,
  );
}

const lines = (...ls) => ({ lines: ls });
const refusal = (basis) => {
  const out = toDbBasis(basis);
  assert.equal(out.ok, false, `expected a refusal, got ${JSON.stringify(out)}`);
  return out.error;
};

/** A raised database error, in the shape `pg` hands one back. */
const raised = (code, detail) => Object.assign(new Error("refused"), { code, detail: JSON.stringify(detail) });

// --- the happy path --------------------------------------------------------

test("623.route: a well-formed wire basis becomes the DATABASE's shape, cents untouched", () => {
  const out = toDbBasis(wire());
  assert.equal(out.ok, true);
  assert.deepEqual(out.basis, {
    posting_date: "2026-09-01",
    memo: "office rent paid from Maybank",
    currency: "MYR",
    lines: [
      { account_code: "6100", debit_cents: 120000, credit_cents: 0, description: "office rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120000, description: "Maybank" },
    ],
  });
  // A missing narration and an explicit null are ONE thing on the wire: `clara.accounting_work`
  // stores `"description": null`, and the frozen tool schema is `.nullish()` for that reason.
  const noDesc = toDbBasis(wire(lines({ accountCode: "6100", debitCents: 1, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 1, description: null })));
  assert.equal(noDesc.ok, true);
  assert.deepEqual(noDesc.basis.lines.map((l) => l.description), [null, null]);
});

// --- R5: ONE vocabulary, and it is the database's --------------------------

test("623.route: every field path is the DATABASE's spelling — snake_case, no prefix, 1-BASED", () => {
  assert.deepEqual(refusal(null), { error: "invalid_basis", field: "basis", reason: "object" });
  assert.deepEqual(refusal("a basis"), { error: "invalid_basis", field: "basis", reason: "object" });
  assert.deepEqual(refusal(wire({ postingDate: "  " })), { error: "invalid_basis", field: "posting_date", reason: "present" });
  assert.deepEqual(refusal(wire({ postingDate: "01/09/2026" })), { error: "invalid_basis", field: "posting_date", reason: "iso_date" });
  assert.deepEqual(refusal(wire({ memo: "   " })), { error: "invalid_basis", field: "memo", reason: "nonempty" });
  assert.deepEqual(refusal(wire({ currency: "USD" })), { error: "invalid_basis", field: "currency", reason: "myr" });
  assert.deepEqual(refusal(wire({ lines: "two" })), { error: "invalid_basis", field: "lines", reason: "array" });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 1, creditCents: 0 }))), {
    error: "invalid_basis",
    field: "lines",
    reason: "at_least_two",
  });

  // THE INDEX IS 1-BASED, matching SQL's `with ordinality`. The FIRST line is lines[1].
  assert.equal(refusal(wire(lines(null, { accountCode: "1100", debitCents: 0, creditCents: 1 }))).field, "lines[1]");
  assert.equal(refusal(wire(lines({ accountCode: "6100", debitCents: 1, creditCents: 0 }, "nope"))).field, "lines[2]");
  assert.deepEqual(refusal(wire(lines({ accountCode: "  ", debitCents: 1, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 1 }))), {
    error: "invalid_basis",
    field: "lines[1].account_code",
    reason: "nonempty",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 1.5, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 1 }))), {
    error: "invalid_basis",
    field: "lines[1].debit_cents",
    reason: "integer_cents",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 1, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: "1" }))), {
    error: "invalid_basis",
    field: "lines[2].credit_cents",
    reason: "integer_cents",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: -1, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 1 }))), {
    error: "invalid_basis",
    field: "lines[1].debit_cents",
    reason: "nonnegative_integer_cents",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 1, creditCents: 1 }, { accountCode: "1100", debitCents: 0, creditCents: 1 }))), {
    error: "invalid_basis",
    field: "lines[1]",
    reason: "exactly_one_side",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 120000, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 110000 }))), {
    error: "invalid_basis",
    field: "lines",
    reason: "balanced",
  });
  assert.deepEqual(refusal(wire(lines({ accountCode: "6100", debitCents: 0, creditCents: 0 }, { accountCode: "1100", debitCents: 0, creditCents: 0 }))), {
    error: "invalid_basis",
    field: "lines[1]",
    reason: "exactly_one_side",
  });

  // NOT the old camelCase / zero-based vocabulary, which `fieldForServerPath` cannot map at all.
  for (const bad of [wire({ postingDate: "01/09/2026" }), wire({ memo: "" }), wire({ lines: "x" })]) {
    const field = refusal(bad).field;
    assert.doesNotMatch(field, /^basis\./, `${field} carries no basis. prefix`);
    assert.doesNotMatch(field, /[A-Z]/, `${field} is snake_case`);
  }
  assert.equal(refusal(wire(lines(null, null))).field.includes("[0]"), false, "no zero-based index survives");
});

// --- R4: the frozen tool schema's caps, refused at the FIRST door -----------

test("623.route: an over-long memo is refused BEFORE a Work is admitted (max_length, TRIMMED)", () => {
  assert.equal(MEMO_MAX_CHARS, 4000, "the cap is claraWork.v1.tools.ts's own z.string().trim().min(1).max(4000)");
  const atCap = toDbBasis(wire({ memo: "m".repeat(MEMO_MAX_CHARS) }));
  assert.equal(atCap.ok, true, "the boundary ADMITS — 4000 is postable");
  assert.deepEqual(refusal(wire({ memo: "m".repeat(MEMO_MAX_CHARS + 1) })), {
    error: "invalid_basis",
    field: "memo",
    reason: "max_length",
  });
  // MEASURED ON THE TRIMMED STRING, because zod's .trim() transforms before .max() does. A memo
  // that is 4000 characters plus whitespace is one the run CAN post, so refusing it here would be
  // this door disagreeing with the schema it exists to protect.
  const padded = toDbBasis(wire({ memo: `   ${"m".repeat(MEMO_MAX_CHARS)}   ` }));
  assert.equal(padded.ok, true, "whitespace does not count against the memo cap");
  assert.deepEqual(refusal(wire({ memo: `  ${"m".repeat(MEMO_MAX_CHARS + 1)}  ` })).reason, "max_length");
});

test("623.route: an over-long line narration is refused too (max_length, RAW)", () => {
  assert.equal(LINE_DESCRIPTION_MAX_CHARS, 2000, "the cap is that same file's z.string().max(2000)");
  const long = (n) => wire(lines(
    { accountCode: "6100", debitCents: 1, creditCents: 0, description: "d".repeat(n) },
    { accountCode: "1100", debitCents: 0, creditCents: 1 },
  ));
  assert.equal(toDbBasis(long(LINE_DESCRIPTION_MAX_CHARS)).ok, true, "the boundary ADMITS — 2000 is postable");
  assert.deepEqual(refusal(long(LINE_DESCRIPTION_MAX_CHARS + 1)), {
    error: "invalid_basis",
    field: "lines[1].description",
    reason: "max_length",
  });
  // MEASURED RAW, because that schema carries no .trim(). Whitespace DOES count here, and the
  // difference from the memo above is the frozen schema's, not this route's.
  const padded = wire(lines(
    { accountCode: "6100", debitCents: 1, creditCents: 0, description: `  ${"d".repeat(LINE_DESCRIPTION_MAX_CHARS)}  ` },
    { accountCode: "1100", debitCents: 0, creditCents: 1 },
  ));
  assert.equal(refusal(padded).reason, "max_length", "the raw string is what the tool schema will measure");

  // A narration that is not text at all is refused by name rather than coerced: 0178 reads it
  // with `->>` and would admit it, and the frozen schema would then refuse the echo mid-run.
  const numeric = wire(lines(
    { accountCode: "6100", debitCents: 1, creditCents: 0, description: 42 },
    { accountCode: "1100", debitCents: 0, creditCents: 1 },
  ));
  assert.deepEqual(refusal(numeric), { error: "invalid_basis", field: "lines[1].description", reason: "text" });
});

// --- R3: the 409 says WHICH Work ------------------------------------------

test("623.route: an intent-payload conflict answers with the existing Work's id", () => {
  const err = raised("CLR10", { reason: "intent_payload_conflict", work_id: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(workErrorResponse(err), {
    status: 409,
    body: { error: "intent_payload_conflict", work_id: "11111111-1111-4111-8111-111111111111" },
  });
  // The link is never INVENTED: a conflict whose detail carries no id answers with null, and the
  // composer's Alert then shows the message without a link rather than a broken one.
  const bare = raised("CLR10", { reason: "intent_payload_conflict" });
  assert.deepEqual(workErrorResponse(bare), { status: 409, body: { error: "intent_payload_conflict", work_id: null } });
  assert.equal(detailField(err, "work_id"), "11111111-1111-4111-8111-111111111111");
  assert.equal(detailField(Object.assign(new Error("x"), { code: "CLR10", detail: "plain text" }), "work_id"), null);
});

test("623.route: the retry door's 409 still names the status that made the retry illegal", () => {
  const err = raised("CLR13", { reason: "not_retryable", status: "queued" });
  assert.deepEqual(workErrorResponse(err), { status: 409, body: { error: "not_retryable", status: "queued" } });
});

test("623.route: a database invalid_basis rides back with the CONSTRAINT as its reason", () => {
  // The route's own 400s and the database's must be indistinguishable to a client: same `field`
  // vocabulary, same `reason` vocabulary. `reason` on the wire IS the database's `constraint`.
  const err = raised("CLR10", { reason: "invalid_basis", field: "lines[2].debit_cents", constraint: "integer_cents" });
  assert.deepEqual(workErrorResponse(err), {
    status: 400,
    body: { error: "invalid_basis", field: "lines[2].debit_cents", reason: "integer_cents" },
  });
  const capped = raised("CLR10", { reason: "invalid_basis", field: "memo", constraint: "max_length", max: 4000, length: 4001 });
  assert.equal(workErrorResponse(capped).body.reason, "max_length", "the cap the DB refused is the cap the route refuses");

  // A CLR10 that is NOT an invalid_basis has no constraint and keeps its own typed reason.
  const key = raised("CLR10", { reason: "invalid_intent_key" });
  assert.deepEqual(workErrorResponse(key), { status: 400, body: { error: "invalid_basis", field: "basis", reason: "invalid_intent_key" } });
  assert.equal(reasonOf(key), "invalid_intent_key");
});

test("623.route: the other doors are unchanged, and an unmapped code is a 500 rather than a guess", () => {
  assert.deepEqual(workErrorResponse(raised("CLR11", { reason: "client_not_found" })), {
    status: 404,
    body: { error: "not_found", message: "not found" },
  });
  assert.deepEqual(workErrorResponse(raised("CLR04", { reason: "insufficient_role" })), {
    status: 403,
    body: { error: "forbidden", message: "not permitted" },
  });
  assert.equal(workErrorResponse(raised("CLR99", { reason: "who_knows" })), null, "an unclaimed code falls through to the 500");
  assert.equal(workErrorResponse(new Error("no code at all")), null);
  assert.equal(workErrorStatus("CLR10", "intent_payload_conflict"), 409, "the status map itself is untouched");
});
