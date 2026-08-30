// 裁-44 — WHAT THE MODEL MAY WRITE: the prose caps every model-authored durable field carries,
// and the floors an identifier must clear before it can be counted.
//
// Split from g1-wake-allocation.test.mjs for the 500-line module budget. Both cells are about the
// same question from two sides — what a model is allowed to put into a durable row — which is a
// different subject from how the allocation derives its amounts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { register } = await import("tsx/esm/api");
register();

const pack = {
  ...(await import("../workflows/bankAgent.v1.pack.ts")),
  ...(await import("../workflows/bankAgent.v1.identity.ts")),
  ...(await import("../workflows/bankAgent.v1.alloc.ts")),
};
const tools = await import("../workflows/bankAgent.v1.tools.ts");
const closeTools = await import("../workflows/closePrep.v1.tools.ts");
const closePrompt = await import("../workflows/closePrep.v1.prompt.ts");

test("G1B-PROSE-1 裁-44 FOLD-7 — every prose field the model writes is CAPPED, and a fiscal-year label is a name rather than an essay", async () => {
  // THE FINDING: model prose reaches durable columns with only a non-blank guard. The receipt
  // rationale on both lanes IS capped by the database (0121:4375, 0138:362, both `length(...)
  // <= 4000`), but clara.bank_agent_proposals.rationale (0121:4425), the proposal payload's reason
  // and identifier value, clara.close_proposals.narrative and .drafted[].text, and
  // clara.close_runs.end_reason all take whatever they are given. clara.fiscal_years.label is the
  // sharpest of them (0056:236, display-only, non-blank) because every human surface renders it
  // inline. These are not new numeric-book paths, but they permit persistent injected content —
  // and for an abandonment, the prose ACCOMPANIES a state-changing act.
  //
  // The cap is the client-side half this PR can ship without a migration; the DB-side CHECKs and a
  // structured abandonment-code roster are booked as G1 PR-2 / the 裁-44 DB pass.
  const uuid = () => randomUUID();
  const bank = tools.buildBankAgentTools(
    { taskId: uuid(), firmId: uuid(), clientId: uuid(), bankAccountId: uuid(), dueReason: null },
    "gpt-5.6-terra",
    pack.newBankRunRecord("cell"),
  );
  const close = closeTools.buildClosePrepTools({ taskId: uuid(), firmId: uuid(), clientId: uuid() }, "gpt-5.6-terra", closeTools.newCloseRunRecord());

  const PROSE = tools.BANK_PROSE_MAX;
  assert.equal(PROSE, closePrompt.CLOSE_PROSE_MAX, "both lanes carry the SAME house limit — one number, stated once per closure");
  assert.equal(PROSE, 4000, "and it is the database's own number where one exists (0121:4375 / 0138:362)");
  const LABEL = closePrompt.CLOSE_FY_LABEL_MAX;

  const drafted = [{ check_key: "unposted_entries", item_key: "je-1", text: "attested" }];
  const cases = [
    [bank.get_bank_pack, { rationale: "r" }, "rationale", PROSE],
    [bank.match_bank_line, { lines: [uuid()], entries: [uuid()], rationale: "r" }, "rationale", PROSE],
    [bank.propose_line_exception, { line_id: uuid(), kind: "bank_error", reason: "r", rationale: "r" }, "reason", PROSE],
    [bank.propose_line_exception, { line_id: uuid(), kind: "bank_error", reason: "r", rationale: "r" }, "rationale", PROSE],
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", rationale: "r" }, "identifier_value", PROSE],
    // 裁-44 R2 / FOLD-11 — this rationale's cap is the house cap MINUS the budget reserved for
    // the derived-sightings note the tool appends, so the composed string can never exceed the
    // database's own 4000. Asserted at its real value rather than the shared one.
    [bank.propose_identifier_promotion, { counterparty_id: uuid(), identifier_kind: "tin", identifier_value: "v", rationale: "r" }, "rationale", PROSE - 64],
    [close.list_fiscal_years, { rationale: "r" }, "rationale", PROSE],
    [close.get_close_plan, { fiscal_year_id: uuid(), rationale: "r" }, "rationale", PROSE],
    [close.begin_close, { fiscal_year_id: uuid(), rationale: "r" }, "rationale", PROSE],
    [close.abandon_close, { close_run_id: uuid(), reason: "r", rationale: "r" }, "reason", PROSE],
    [close.propose_close, { close_run_id: uuid(), drafted, narrative: "n", rationale: "r" }, "narrative", PROSE],
    [close.open_fiscal_year, { label: "FY2026", starts_on: "2026-01-01", rationale: "r" }, "label", LABEL],
    [close.open_fiscal_year, { label: "FY2026", starts_on: "2026-01-01", rationale: "r" }, "rationale", PROSE],
    [close.run_depreciation_catchup, { through: "2026-01-31", rationale: "r" }, "rationale", PROSE],
    [close.mint_month_snapshot, { month_start: "2026-01-01", rationale: "r" }, "rationale", PROSE],
  ];

  for (const [tool, base, field, max] of cases) {
    // AT the cap parses; ONE over does not. Both directions, because a cell that only proved the
    // refusal would pass just as happily against a schema that refused everything.
    const at = tool.inputSchema.safeParse({ ...base, [field]: "x".repeat(max) });
    assert.equal(at.success, true, `${field} at ${max} must parse — ${JSON.stringify(at.error?.issues)?.slice(0, 200)}`);
    const over = tool.inputSchema.safeParse({ ...base, [field]: "x".repeat(max + 1) });
    assert.equal(over.success, false, `${field} at ${max + 1} must be REFUSED — it reaches a durable column with no length guard of its own`);
  }

  // THE FY LABEL IS THE ONE WORTH ASSERTING SEPARATELY: it is capped an order of magnitude tighter
  // than prose, because it is a NAME. A 4,000-character label would parse under the house limit.
  assert.equal(LABEL, 120);
  assert.equal(close.open_fiscal_year.inputSchema.safeParse({ label: "x".repeat(PROSE), starts_on: "2026-01-01", rationale: "r" }).success, false,
    "a prose-length label is refused — the label cap is not merely the house cap by another name");

  // The drafted[] elements carry their own caps: the two KEYS are identifiers echoed back from
  // get_close_readiness, the attestation TEXT is prose.
  const longKey = [{ check_key: "x".repeat(LABEL + 1), item_key: "je-1", text: "t" }];
  const longText = [{ check_key: "k", item_key: "je-1", text: "x".repeat(PROSE + 1) }];
  const proposeBase = { close_run_id: uuid(), narrative: "n", rationale: "r" };
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted: longKey }).success, false, "an over-long check_key is refused");
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted: longText }).success, false, "and so is an over-long attestation");
  assert.equal(close.propose_close.inputSchema.safeParse({ ...proposeBase, drafted }).success, true, "the positive control: a real attestation still parses");
});

test("G1B-ALLOC-7 裁-44 R3 / FOLD-15 — an identifier too short to be specific is refused BEFORE it is counted", async () => {
  // The floor is not a formatting nicety: it is what stops the model choosing a needle that
  // matches everything, which would put the derived count back in its hands.
  for (const [kind, value] of [["tin", "12345"], ["ssm", "abc"], ["bank_account", "8899041"], ["bank_account", "1"]]) {
    assert.ok(pack.identifierTooShort(kind, value), `${kind} "${value}" must be refused`);
  }
  // Separators do not count toward the floor — the length is measured AFTER canonicalisation, so
  // "1-2-3-4-5-6" is six characters, not eleven.
  assert.ok(pack.identifierTooShort("tin", "1-2-3-4-5"), "five digits dressed up with separators is still five");
  assert.equal(pack.identifierTooShort("tin", "1-2-3-4-5-6"), null, "six is six however it is printed");

  // bank_account carries the higher, DIGIT-AWARE bar: prose can clear a bare character count, and
  // "g1 bank line" is exactly the value G1B-BANK-E2 used to admit as an account number.
  assert.ok(pack.identifierTooShort("bank_account", "g1 bank line"), "prose is not an account number");
  assert.ok(pack.identifierTooShort("bank_account", "abcdefghij"), "ten letters are not eight digits");
  assert.equal(pack.identifierTooShort("bank_account", "8899041722"), null, "a real ten-digit account passes");
  assert.equal(pack.identifierTooShort("bank_account", "mbb-88990417"), null, "and a bank prefix in front of eight digits is fine");

  // The positive controls, so the four refusals above are the floor speaking and not a predicate
  // that refuses everything.
  assert.equal(pack.identifierTooShort("tin", "C12345678"), null);
  assert.equal(pack.identifierTooShort("ssm", "202301012345"), null);
  // 裁-44 R4 (LOW) — THE EXACT BOUNDARY, both sides. A floor asserted only well inside its range
  // is a floor whose value nobody has actually checked.
  assert.ok(pack.identifierTooShort("ssm", "12345"), "five canonical characters is below the ssm floor");
  assert.equal(pack.identifierTooShort("ssm", "123456"), null, "six is exactly at it, and accepted");
  assert.ok(pack.identifierTooShort("tin", "12345"), "the tin floor is the same six");
  assert.equal(pack.identifierTooShort("tin", "123456"), null);
  assert.ok(pack.identifierTooShort("bank_account", "1234567"), "seven digits is below the bank_account floor");
  assert.equal(pack.identifierTooShort("bank_account", "12345678"), null, "eight is exactly at it");
  assert.equal(pack.canonicalIdentifier("8899-041722"), "8899041722", "canonicalisation is [a-z0-9] after lowercasing");
  assert.equal(pack.canonicalIdentifier("MBB/514 202"), "mbb514202");
});

