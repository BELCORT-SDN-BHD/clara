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
