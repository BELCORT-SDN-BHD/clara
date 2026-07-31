// Owner ruling B (2026-07-31): reader-2's completion pass extends from the header to the
// TRANSACTION LINES — Azure's typed Transactions field wins wherever it spoke; when it is
// empty but the response's own recognized content carries a ledger table (the real Maybank
// trilingual layout), the same deterministic grammar parses THIS response's regions.
// Two independent recognitions, one shared grammar, chain+totals as the independent floor.

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureBankStatement } from "../workflows/statementFacts.v1.engine.mjs";

const cell = (row, col, text, x, y) => ({
  rowIndex: row, columnIndex: col, content: text,
  boundingRegions: [{ pageNumber: 1, polygon: [x, y, x + 18, y] }],
});

function azureResponse({ typedTransactions }) {
  return {
    analyzeResult: {
      documents: [{
        fields: {
          AccountNumber: { valueString: "514400990011" },
          StatementDate: { valueDate: "2025-06-30" },
          BeginningBalance: { content: "0.00" },
          EndingBalance: { content: "150.00" },
          Transactions: { valueArray: typedTransactions },
        },
      }],
      pages: [{
        pageNumber: 1,
        lines: [
          { content: "Maybank", polygon: [0, 0, 30, 0] },
          { content: "TOTAL DEBIT : 50.00", polygon: [0, 5, 40, 5] },
          { content: "TOTAL CREDIT : 200.00", polygon: [0, 6, 40, 6] },
        ],
      }],
      tables: [{
        cells: [
          cell(0, 0, "TARIKH MASUK 進支日期 ENTRY DATE", 0, 20),
          cell(0, 1, "BUTIR URUSNIAGA 進支項說明 TRANSACTION DESCRIPTION", 20, 20),
          cell(0, 2, "JUMLAH URUSNIAGA 银码 TRANSACTION AMOUNT", 40, 20),
          cell(0, 3, "BAKI PENYATA 結單存餘 STATEMENT BALANCE", 60, 20),
          cell(1, 0, "10/06/25", 0, 30), cell(1, 1, "CLEARING CHQ DEP", 20, 30),
          cell(1, 2, "200.00+", 40, 30), cell(1, 3, "200.00", 60, 30),
          cell(2, 0, "17/06/25", 0, 40), cell(2, 1, "DUITNOW DR", 20, 40),
          cell(2, 2, "50.00-", 40, 40), cell(2, 3, "150.00", 60, 40),
        ],
      }],
    },
  };
}

test("empty typed Transactions complete from the response's own ledger table, receipted", () => {
  const read = normalizeAzureBankStatement(azureResponse({ typedTransactions: [] }));
  assert.equal(read.lines.length, 2, "both rows parse from the response's own recognition");
  assert.equal(read.lines[0].amount_cents, 20000);
  assert.equal(read.lines[1].amount_cents, -5000);
  assert.equal(read.lines[1].running_balance_cents, 15000);
  assert.equal(read.receipt.lines_completed_from_content, 2, "the completion is receipted, never silent");
  assert.equal(read.header.line_count, 2);
});

test("typed Transactions WIN when they spoke — the completion never runs beside them", () => {
  const typed = [{
    valueObject: {
      Date: { valueDate: "2025-06-10" },
      Description: { valueString: "TYPED ROW" },
      DepositAmount: { content: "200.00" },
      Balance: { content: "200.00" },
    },
  }];
  const read = normalizeAzureBankStatement(azureResponse({ typedTransactions: typed }));
  assert.equal(read.lines.length, 1, "the typed row alone");
  assert.equal(read.lines[0].description, "TYPED ROW");
  assert.equal(read.receipt.lines_completed_from_content, undefined, "no completion when typed spoke");
});

test("the REAL prebuilt-bankStatement schema: per-account nesting reads (probed live 2026-07-31)", () => {
  const read = normalizeAzureBankStatement({
    analyzeResult: {
      documents: [{
        fields: {
          BankName: { valueString: "Maybank" },
          Accounts: { type: "array", valueArray: [{
            valueObject: {
              AccountNumber: { valueString: "514400990011" },
              BeginningBalance: { content: "0.00" },
              EndingBalance: { content: "150.00" },
              Transactions: { valueArray: [
                { valueObject: { Description: { valueString: "BALANCE B/F" } } },
                { valueObject: {
                  Date: { valueDate: "2025-06-10" },
                  Description: { valueString: "CLEARING CHQ DEP" },
                  DepositAmount: { content: "150.00" },
                  Balance: { content: "150.00" },
                } },
              ] },
            },
          }] },
        },
      }],
      pages: [{ pageNumber: 1, lines: [
        { content: "TARIKH PENYATA / STATEMENT DATE : 30/06/2025", polygon: [0, 2, 40, 2] },
        { content: "TOTAL DEBIT : .00", polygon: [0, 5, 40, 5] },
        { content: "TOTAL CREDIT : 150.00", polygon: [0, 6, 40, 6] },
      ] }],
    },
  });
  assert.equal(read.header.account_number_normalized, "514400990011", "the account reads from Accounts[0]");
  assert.equal(read.header.opening_cents, 0);
  assert.equal(read.header.closing_cents, 15000);
  assert.equal(read.lines.length, 1, "the dated row parses; the dateless BALANCE B/F row is skipped-and-counted");
  assert.equal(read.receipt.rows_skipped, 1);
  assert.equal(read.header.period_start, "2025-06-01", "period derives from the label-completed statement date");
  assert.equal(read.receipt.lines_completed_from_content, undefined, "typed spoke — no completion");
});

test("a one-sided null running balance defers to the chain; a bilateral numeric conflict still refuses", async () => {
  const { corroborateTwoReaders } = await import("../lib/statement-corroboration.mjs");
  const header = {
    institution_code: "MBB", institution_name: "Malayan Banking Berhad",
    account_number: "514400990011", account_number_normalized: "514400990011",
    currency: "MYR", period_start: "2025-06-01", period_end: "2025-06-30",
    statement_date: "2025-06-30", opening_cents: 0, closing_cents: 15000,
    total_debit_cents: 5000, total_credit_cents: 20000, line_count: 2,
  };
  const line = (amount, run) => ({ line_no: run === undefined ? 1 : undefined, entry_date: "2025-06-10", value_date: null, description: "X", amount_cents: amount, running_balance_cents: run });
  const r1 = { header, lines: [ { ...line(20000), line_no: 1, running_balance_cents: 20000 }, { ...line(-5000), line_no: 2, running_balance_cents: 15000 } ] };
  const r2null = { header, lines: [ { ...line(20000), line_no: 1, running_balance_cents: null }, { ...line(-5000), line_no: 2, running_balance_cents: null } ] };
  const agreed = corroborateTwoReaders(r1, r2null);
  assert.equal(agreed.lines.length, 2, "schema-absent balances agree; the chain witnesses the steps");
  const r2wrong = { header, lines: [ { ...line(20000), line_no: 1, running_balance_cents: 99999 }, { ...line(-5000), line_no: 2, running_balance_cents: 15000 } ] };
  assert.throws(() => corroborateTwoReaders(r1, r2wrong), (e) => e.code === "readers_disagree",
    "two NUMBERS that differ still refuse — only absence defers");
});
