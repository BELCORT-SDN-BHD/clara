// §7-A THE UNATTENDED SALES DRAFTER — CONTRACT-BLIND unit tests (PR #203 test lane,
// test-7a-rt-blind). Written FROM docs/plan/wave-7a-contract.md (7A-R2, 7A-R7) and
// docs/plan/wave-7a-design-skeleton.md §2a, WITHOUT reading autoDraft.v6.impl.ts's
// step bodies or any review report — the lane's own blindness rule. Drives ONLY the
// EXPORTED schema (autoDraft.v6.prompt.ts) and kind-derivation function
// (autoDraft.v6.tools.ts) surfaces. No DB, no network, no live model call.
//
// 7A-R7 — "the unattended lane's coding-kind menu. sales_invoice + sales_credit_note
// only ... No journal_entry in the unattended lane — free-form entries have no shape
// for walls and stay with the human-present lanes."
//
// 7A-R2 / skeleton §2a — "THE COUNTERPARTY CONTRACT ... Three-layer fix: 1. Tool
// derives kind from coding_kind; the model never chooses it independently. 2. Zod
// schema rejects a mismatched pair outright. 3. DB rejects a contradictory
// coding-kind/counterparty-kind pair in the draft writer — the only layer that is
// authority."

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const prompt = await import("../workflows/autoDraft.v6.prompt.ts");
const tools = await import("../workflows/autoDraft.v6.tools.ts");

const { draftJournalEntryInputSchema } = prompt;
const { deriveCounterpartyKind } = tools;

function baseInput(codingKind, overrides = {}) {
  return {
    coding_kind: codingKind,
    posting_date: "2025-04-30",
    lines: [
      { account_code: "300-000", debit_cents: 100, credit_cents: 0 },
      { account_code: "500-000", debit_cents: 0, credit_cents: 100 },
    ],
    document_id: "11111111-1111-4111-8111-111111111111",
    counterparty: { new: { name: "SOME COUNTERPARTY SDN BHD" } },
    evidence: [{ region_id: "22222222-2222-4222-8222-222222222222", quote: "1.00" }],
    ...overrides,
  };
}

// ===========================================================================
// 7A-R7 — the coding-kind menu.
// ===========================================================================

test("draft schema ACCEPTS supplier_bill, sales_invoice, and sales_credit_note (7A-R7's exact menu)", () => {
  for (const kind of ["supplier_bill", "sales_invoice", "sales_credit_note"]) {
    const r = draftJournalEntryInputSchema.safeParse(baseInput(kind));
    assert.equal(r.success, true, `${kind} must be accepted — issues: ${r.success ? "" : JSON.stringify(r.error?.issues)}`);
  }
});

test("draft schema REJECTS journal_entry — 7A-R7: 'No journal_entry in the unattended lane'", () => {
  const r = draftJournalEntryInputSchema.safeParse(baseInput("journal_entry"));
  assert.equal(r.success, false, "journal_entry must be refused by the unattended-lane (autoDraft_v6) schema");
});

test("draft schema REJECTS an unknown/nonsense coding_kind", () => {
  const r = draftJournalEntryInputSchema.safeParse(baseInput("nonsense_kind"));
  assert.equal(r.success, false, "an unrecognised coding_kind must be refused");
});

test("draft schema REJECTS coding_kind entirely missing", () => {
  const withoutKind = baseInput("sales_invoice");
  delete withoutKind.coding_kind;
  const r = draftJournalEntryInputSchema.safeParse(withoutKind);
  assert.equal(r.success, false, "coding_kind is a required field");
});

// ===========================================================================
// 7A-R2 / skeleton §2a layer 2 — the zod schema rejects a counterparty.kind that
// CONTRADICTS coding_kind, in both directions, and accepts an omitted kind.
// ===========================================================================

test("schema REJECTS counterparty.kind='vendor' on a sales_invoice (contradiction, direction 1)", () => {
  const r = draftJournalEntryInputSchema.safeParse(
    baseInput("sales_invoice", { counterparty: { kind: "vendor", new: { name: "X SDN BHD" } } }),
  );
  assert.equal(r.success, false, "sales_invoice + counterparty.kind=vendor must be rejected outright");
});

test("schema REJECTS counterparty.kind='customer' on a supplier_bill (contradiction, direction 2)", () => {
  const r = draftJournalEntryInputSchema.safeParse(
    baseInput("supplier_bill", { counterparty: { kind: "customer", new: { name: "X SDN BHD" } } }),
  );
  assert.equal(r.success, false, "supplier_bill + counterparty.kind=customer must be rejected outright");
});

test("schema REJECTS counterparty.kind='vendor' on a sales_credit_note (the third coding_kind, same 'customer' family as sales_invoice)", () => {
  const r = draftJournalEntryInputSchema.safeParse(
    baseInput("sales_credit_note", { counterparty: { kind: "vendor", new: { name: "X SDN BHD" } } }),
  );
  assert.equal(r.success, false, "sales_credit_note + counterparty.kind=vendor must be rejected outright");
});

test("schema ACCEPTS an AGREEING counterparty.kind on all three coding kinds", () => {
  assert.equal(
    draftJournalEntryInputSchema.safeParse(baseInput("sales_invoice", { counterparty: { kind: "customer", new: { name: "X" } } })).success,
    true,
    "sales_invoice + kind=customer must parse",
  );
  assert.equal(
    draftJournalEntryInputSchema.safeParse(baseInput("supplier_bill", { counterparty: { kind: "vendor", new: { name: "X" } } })).success,
    true,
    "supplier_bill + kind=vendor must parse",
  );
  assert.equal(
    draftJournalEntryInputSchema.safeParse(baseInput("sales_credit_note", { counterparty: { kind: "customer", new: { name: "X" } } }))
      .success,
    true,
    "sales_credit_note + kind=customer must parse",
  );
});

test("schema ACCEPTS an OMITTED counterparty.kind on all three coding kinds — omission is not a contradiction", () => {
  for (const kind of ["supplier_bill", "sales_invoice", "sales_credit_note"]) {
    const r = draftJournalEntryInputSchema.safeParse(baseInput(kind, { counterparty: { new: { name: "X" } } }));
    assert.equal(r.success, true, `${kind} with no counterparty.kind supplied must still parse`);
  }
});

test("schema ACCEPTS an omitted counterparty.kind on the existing_id union branch too (both counterparty shapes carry the same optional kind field)", () => {
  const r = draftJournalEntryInputSchema.safeParse(
    baseInput("sales_invoice", { counterparty: { existing_id: "33333333-3333-4333-8333-333333333333" } }),
  );
  assert.equal(r.success, true, `expected ok — issues: ${r.success ? "" : JSON.stringify(r.error?.issues)}`);
});

test("schema REJECTS a contradicting kind on the existing_id union branch too (the contradiction guard covers both counterparty shapes)", () => {
  const r = draftJournalEntryInputSchema.safeParse(
    baseInput("supplier_bill", { counterparty: { kind: "customer", existing_id: "33333333-3333-4333-8333-333333333333" } }),
  );
  assert.equal(r.success, false, "supplier_bill + existing_id counterparty with kind=customer must still be rejected");
});

// ===========================================================================
// 7A-R7 / skeleton §2a layer 1 — the exported kind-derivation function. "the tool
// derives `kind` from `coding_kind`; the model never chooses it independently."
// ===========================================================================

test("deriveCounterpartyKind maps supplier_bill -> vendor, sales_invoice -> customer, sales_credit_note -> customer", () => {
  assert.equal(deriveCounterpartyKind("supplier_bill"), "vendor");
  assert.equal(deriveCounterpartyKind("sales_invoice"), "customer");
  assert.equal(deriveCounterpartyKind("sales_credit_note"), "customer");
});
