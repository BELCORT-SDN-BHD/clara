// #638 — the unsent claim draft: the scope key, the untrusted parser, and the retirement moment.
//
// WHAT THESE CELLS PIN, and each one is a rule this lane cannot get wrong quietly:
//   key.*     the draft is filed under USER + FIRM + CLIENT, so it can never cross into another
//             client's books — the property `lib/work/journal-draft.ts` owns and this module reuses
//             rather than re-derives. Only the PREFIX differs, so a claim draft and a periodic
//             adjustment draft under one scope cannot collide.
//   parse.*   every field is validated field-by-field and anything not fully recognised returns
//             NULL. A half-understood draft is worse than none: it would seed a form with figures
//             nobody typed, and a money field seeded from `"1200"` or `12.5` is exactly the
//             floating-point coercion this lane forbids outright.
//   life.*    written on every edit, read before the first paint, and retired only when the runtime
//             has named the Work.

import assert from "node:assert/strict";
import { test } from "node:test";

import { journalDraftKey, type DraftStorage, type JournalDraftScope } from "./journal-draft";
import { adjustmentDraftKey } from "./periodic-adjustment-draft";
import { claimDraftKey, clearClaimDraft, readClaimDraft, writeClaimDraft } from "./staff-expense-claim-draft";
import { emptyClaimDraft, emptyClaimItem, type ClaimDraft } from "./staff-expense-claim";

const SCOPE: JournalDraftScope = {
  userId: "11111111-1111-4111-8111-111111111111",
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const OTHER: JournalDraftScope = { ...SCOPE, clientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

function memory(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function draft(over: Partial<ClaimDraft> = {}): ClaimDraft {
  return {
    ...emptyClaimDraft(),
    claimantAccountCode: "1190",
    incurredDate: "2026-03-04",
    postingDate: "2026-03-31",
    instruction: "Farah's March travel claim.",
    items: [{ ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000 }],
    ...over,
  };
}

test("key.scope: the key carries user + firm + client, and three lanes cannot collide", () => {
  const key = claimDraftKey(SCOPE);
  assert.ok(key.startsWith("clara:staff-expense-claim-draft"));
  assert.notEqual(key, claimDraftKey(OTHER), "a different client is a different draft, always");
  assert.notEqual(key, journalDraftKey(SCOPE));
  assert.notEqual(key, adjustmentDraftKey(SCOPE));
  // The SCOPE half is `journalDraftKey`'s, byte for byte — only the prefix is swapped, so the
  // percent-encoding rule that stops a crafted id forging another scope has ONE definition.
  assert.equal(key.slice("clara:staff-expense-claim-draft".length),
    journalDraftKey(SCOPE).slice("clara:journal-draft".length));
});

test("life.roundTrip: written, read back whole, retired only on demand", () => {
  const store = memory();
  assert.equal(readClaimDraft(SCOPE, store), null, "an empty storage is an honest absence");
  assert.equal(writeClaimDraft(SCOPE, { intentKey: "k1", draft: draft(), documentId: null }, store), true);

  const back = readClaimDraft(SCOPE, store);
  assert.ok(back);
  assert.equal(back.intentKey, "k1");
  assert.equal(back.draft.items[0]?.amountCents, 48000);
  assert.equal(back.draft.instruction, "Farah's March travel claim.");
  assert.equal(readClaimDraft(OTHER, store), null, "…and nothing under another client's scope");

  clearClaimDraft(SCOPE, store);
  assert.equal(readClaimDraft(SCOPE, store), null);
});

test("life.noStorage: a browser that refuses storage is reported, never promised", () => {
  assert.equal(writeClaimDraft(SCOPE, { intentKey: "k", draft: draft(), documentId: null }, null), false);
  assert.equal(readClaimDraft(SCOPE, null), null);
  const throwing: DraftStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(writeClaimDraft(SCOPE, { intentKey: "k", draft: draft(), documentId: null }, throwing), false);
  assert.equal(readClaimDraft(SCOPE, throwing), null);
  clearClaimDraft(SCOPE, throwing); // must not throw
});

test("parse.untrusted: anything not fully recognised returns NULL rather than a half-draft", () => {
  const store = memory();
  const key = claimDraftKey(SCOPE);
  const base = { intentKey: "k1", draft: draft(), documentId: null };
  const bad: Array<[string, unknown]> = [
    ["not json", "{"],
    ["no intent key", { ...base, intentKey: "" }],
    ["no draft", { intentKey: "k1" }],
    ["unknown settlement", { ...base, draft: { ...base.draft, settlement: "netted_off" } }],
    ["unknown source kind", { ...base, draft: { ...base.draft, sourceKind: "telepathy" } }],
    ["a text field that is not a string", { ...base, draft: { ...base.draft, instruction: 7 } }],
    ["confirmDedicated not a boolean", { ...base, draft: { ...base.draft, claimantConfirmDedicated: "yes" } }],
    ["no items at all", { ...base, draft: { ...base.draft, items: [] } }],
    ["items not an array", { ...base, draft: { ...base.draft, items: {} } }],
    ["a stringly amount", {
      ...base,
      draft: { ...base.draft, items: [{ ...base.draft.items[0], amountCents: "48000" }] },
    }],
    ["a fractional amount", {
      ...base,
      draft: { ...base.draft, items: [{ ...base.draft.items[0], amountCents: 480.5 }] },
    }],
  ];
  for (const [why, payload] of bad) {
    store.map.set(key, typeof payload === "string" ? payload : JSON.stringify(payload));
    assert.equal(readClaimDraft(SCOPE, store), null, `${why} must not seed a form`);
  }
});

test("parse.document: an unusable stored document id is DROPPED, and the figures survive it", () => {
  const store = memory();
  const key = claimDraftKey(SCOPE);
  for (const value of [7, "", "   ", null, undefined]) {
    store.map.set(key, JSON.stringify({ intentKey: "k1", draft: draft(), documentId: value }));
    const back = readClaimDraft(SCOPE, store);
    assert.ok(back, "the attachment is OPTIONAL: an unusable id costs the citation, never the claim");
    assert.equal(back.documentId, null);
    assert.equal(back.draft.items[0]?.amountCents, 48000);
  }
  store.map.set(key, JSON.stringify({
    intentKey: "k1", draft: draft(), documentId: "d1111111-1111-4111-8111-111111111111",
  }));
  assert.equal(readClaimDraft(SCOPE, store)?.documentId, "d1111111-1111-4111-8111-111111111111");
});

test("parse.pending: a waiting item round-trips with the fact it names", () => {
  const store = memory();
  const waiting = draft({
    items: [
      { ...emptyClaimItem(), description: "Flight", expenseAccountCode: "6200", amountCents: 48000 },
      { ...emptyClaimItem(), description: "Taxi", pendingFact: "incurred_date" },
    ],
  });
  writeClaimDraft(SCOPE, { intentKey: "k1", draft: waiting, documentId: null }, store);
  const back = readClaimDraft(SCOPE, store);
  assert.equal(back?.draft.items.length, 2);
  assert.equal(back?.draft.items[1]?.pendingFact, "incurred_date");
  assert.equal(back?.draft.items[1]?.amountCents, 0);
});

test("parse.allocations: #931 — a list round-trips, and a draft filed BEFORE this ticket restores as its one-line self", () => {
  const store = memory();
  const key = claimDraftKey(SCOPE);
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  // THE LIST ROUND-TRIPS, amounts and order intact — the record IS the confirmed list.
  const split = draft({
    settlement: "advance_application",
    advanceAccountCode: "1190",
    advanceAllocations: [{ advanceId: A, amountCents: 40000 }, { advanceId: B, amountCents: 8000 }],
  });
  writeClaimDraft(SCOPE, { intentKey: "k1", draft: split, documentId: null }, store);
  assert.deepEqual(readClaimDraft(SCOPE, store)?.draft.advanceAllocations,
    [{ advanceId: A, amountCents: 40000 }, { advanceId: B, amountCents: 8000 }]);

  // A DRAFT FILED BEFORE #931 carries a single `advanceId` and no list at all. It restores as the
  // one-line list that means the same claim: a preparer who left the page mid-claim comes back to
  // their claim, not to an empty settlement arm.
  const legacy = draft({ settlement: "advance_application", advanceAccountCode: "1190" }) as Record<string, unknown>;
  delete legacy.advanceAllocations;
  legacy.advanceId = A;
  store.map.set(key, JSON.stringify({ intentKey: "k1", draft: legacy, documentId: null }));
  assert.deepEqual(readClaimDraft(SCOPE, store)?.draft.advanceAllocations,
    [{ advanceId: A, amountCents: 0 }],
    "the stored advance becomes the head of a one-line list, whose amount is the whole claim");

  // UNTRUSTED INPUT, like every other field: a half-read allocation is a figure nobody typed, so
  // the whole draft is refused rather than restored with a number the preparer never saw.
  for (const bad of [[], [{ advanceId: A }], [{ advanceId: 7, amountCents: 1 }],
    [{ advanceId: A, amountCents: -1 }], [{ advanceId: A, amountCents: 1.5 }], "x", 3]) {
    store.map.set(key, JSON.stringify({
      intentKey: "k1",
      draft: { ...draft({ settlement: "advance_application", advanceAccountCode: "1190" }), advanceAllocations: bad },
      documentId: null,
    }));
    assert.equal(readClaimDraft(SCOPE, store), null, `${JSON.stringify(bad)} is not an allocation list`);
  }
});
