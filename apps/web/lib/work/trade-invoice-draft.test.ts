// #655 — the unsent trade-invoice draft. `sessionStorage` is untrusted input like any other
// persisted payload, so every cell here is about what the parser REFUSES as much as what it reads.

import { test } from "node:test";
import assert from "node:assert/strict";

import { journalDraftKey, type DraftStorage, type JournalDraftScope } from "./journal-draft";
import { emptyTradeInvoiceDraft, type TradeInvoiceDraft } from "./trade-invoice";
import {
  clearTradeInvoiceDraft,
  newTradeInvoiceDraftBox,
  readTradeInvoiceDraft,
  tradeInvoiceDraftKey,
  writeTradeInvoiceDraft,
} from "./trade-invoice-draft";

const SCOPE: JournalDraftScope = {
  userId: "11111111-1111-4111-8111-111111111111",
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const OTHER_CLIENT: JournalDraftScope = { ...SCOPE, clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

function memory(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function filled(over: Partial<TradeInvoiceDraft> = {}): TradeInvoiceDraft {
  return {
    ...emptyTradeInvoiceDraft(),
    counterpartyId: "33333333-3333-4333-8333-333333333333",
    counterpartyQuery: "Alpha Supplies",
    documentDate: "2026-03-04",
    dueDate: "2026-04-15",
    reference: "ALPHA-2026-0042",
    totalCents: 106000,
    postingDate: "2026-03-31",
    memo: "Alpha Supplies bill",
    lines: [
      { account_code: "6300", debit_cents: 106000, credit_cents: 0, description: "supplies" },
      { account_code: "2000", debit_cents: 0, credit_cents: 106000, description: "payable" },
    ],
    ...over,
  };
}

test("the key is journal-draft's SCOPE RULE with only the prefix swapped", () => {
  const key = tradeInvoiceDraftKey(SCOPE);
  assert.ok(key.startsWith("clara:trade-invoice-draft"));
  assert.equal(key, journalDraftKey(SCOPE).replace(/^clara:journal-draft/, "clara:trade-invoice-draft"));
  // A trade invoice, a claim and a journal entry are DIFFERENT intents: filed under one key,
  // opening one form would seed it with another's draft.
  assert.notEqual(key, journalDraftKey(SCOPE));
  // …and a draft CANNOT cross into another client's books.
  assert.notEqual(tradeInvoiceDraftKey(OTHER_CLIENT), key);
});

test("a round trip returns exactly what was written, and a different scope reads nothing", () => {
  const store = memory();
  const box = { intentKey: "intent-1", draft: filled(), documentId: null };
  writeTradeInvoiceDraft(SCOPE, box, store);
  assert.deepEqual(readTradeInvoiceDraft(SCOPE, store), box);
  assert.equal(readTradeInvoiceDraft(OTHER_CLIENT, store), null);
  clearTradeInvoiceDraft(SCOPE, store);
  assert.equal(readTradeInvoiceDraft(SCOPE, store), null);
});

test("EVERY malformed shape reads as null — a half-understood draft is worse than none", () => {
  const store = memory();
  const key = tradeInvoiceDraftKey(SCOPE);
  const cases: Array<[string, string]> = [
    ["not json at all", "{{{"],
    ["not an object", '"a string"'],
    ["no intent key", JSON.stringify({ draft: filled() })],
    ["a blank intent key", JSON.stringify({ intentKey: "   ", draft: filled() })],
    ["no draft", JSON.stringify({ intentKey: "i" })],
    ["an unknown kind", JSON.stringify({ intentKey: "i", draft: { ...filled(), kind: "credit_note" } })],
    ["a numeric party id", JSON.stringify({ intentKey: "i", draft: { ...filled(), counterpartyId: 7 } })],
    ["a STRING total", JSON.stringify({ intentKey: "i", draft: { ...filled(), totalCents: "106000" } })],
    ["a FRACTIONAL total", JSON.stringify({ intentKey: "i", draft: { ...filled(), totalCents: 1060.5 } })],
    ["no lines", JSON.stringify({ intentKey: "i", draft: { ...filled(), lines: [] } })],
    ["a line with a string amount", JSON.stringify({
      intentKey: "i",
      draft: { ...filled(), lines: [{ account_code: "6300", debit_cents: "1", credit_cents: 0, description: "" }] },
    })],
    ["a non-string documentId", JSON.stringify({ intentKey: "i", draft: filled(), documentId: 7 })],
  ];
  for (const [label, raw] of cases) {
    store.map.set(key, raw);
    assert.equal(readTradeInvoiceDraft(SCOPE, store), null, label);
  }
});

test("a throwing or absent store is survivable, never a crash", () => {
  const throwing: DraftStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("full"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(readTradeInvoiceDraft(SCOPE, throwing), null);
  assert.doesNotThrow(() => writeTradeInvoiceDraft(SCOPE, newTradeInvoiceDraftBox("i"), throwing));
  assert.doesNotThrow(() => clearTradeInvoiceDraft(SCOPE, throwing));
  assert.equal(readTradeInvoiceDraft(SCOPE, null), null);
  assert.doesNotThrow(() => writeTradeInvoiceDraft(SCOPE, newTradeInvoiceDraftBox("i"), null));
});

test("a restored one-line draft is padded to two, so the grid is never unusable", () => {
  const store = memory();
  store.map.set(tradeInvoiceDraftKey(SCOPE), JSON.stringify({
    intentKey: "i",
    draft: {
      ...filled(),
      lines: [{ account_code: "6300", debit_cents: 106000, credit_cents: 0, description: "" }],
    },
  }));
  const box = readTradeInvoiceDraft(SCOPE, store);
  assert.ok(box);
  assert.equal(box.draft.lines.length, 2);
  assert.equal(box.draft.lines[1]?.account_code, "");
});

test("a draft written before `documentId` existed reads as null rather than being discarded", () => {
  const store = memory();
  store.map.set(tradeInvoiceDraftKey(SCOPE), JSON.stringify({ intentKey: "i", draft: filled() }));
  const box = readTradeInvoiceDraft(SCOPE, store);
  assert.ok(box, "the attachment is genuinely optional, so its absence is a valid state");
  assert.equal(box.documentId, null);
  assert.equal(box.draft.reference, "ALPHA-2026-0042", "…and the figures survive");
});
