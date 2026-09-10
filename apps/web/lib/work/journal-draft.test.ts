// The unsent draft and its intent identity, under test.
//
// THE THREE PROPERTIES THAT MATTER, each with its own cell, because each one is
// a rule from §3 rather than an implementation detail:
//   1. A refresh RESTORES the draft AND its intent key. The key is the whole
//      lost-response mechanism; a restore that minted a new one would admit a
//      second Work for the same figures.
//   2. A DIFFERENT SCOPE NEVER SEES IT. Not "is cleared on switch" — filed
//      under its own key, so client B finds nothing and client A still finds it.
//   3. AN UNTRUSTED PAYLOAD IS REFUSED WHOLE. What comes out of storage is a
//      string a human could have edited; a half-understood draft would seed a
//      money form with figures nobody typed.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearJournalDraft,
  draftFromBasis,
  emptyDraftLines,
  journalDraftKey,
  newIntentKey,
  readJournalDraft,
  writeJournalDraft,
  type DraftStorage,
  type JournalDraftScope,
  type StoredJournalDraft,
} from "./journal-draft";

/** A Map-backed `Storage`, so a cell can look at what was actually written. */
function memoryStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const USER = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";
const CLIENT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const scopeA: JournalDraftScope = { userId: USER, firmId: FIRM, clientId: CLIENT_A };
const scopeB: JournalDraftScope = { userId: USER, firmId: FIRM, clientId: CLIENT_B };

function draft(over: Partial<StoredJournalDraft> = {}): StoredJournalDraft {
  return {
    intentKey: "intent-1",
    postingDate: "2026-09-01",
    memo: "Office rent",
    lines: [
      { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: "" },
    ],
    ...over,
  };
}

test("the key names the user, the firm AND the client — all three, percent-encoded", () => {
  assert.equal(journalDraftKey(scopeA), `clara:journal-draft:${USER}:${FIRM}:${CLIENT_A}`);
  // A part carrying the separator must not merge two scopes.
  assert.equal(
    journalDraftKey({ userId: "a:b", firmId: FIRM, clientId: CLIENT_A }),
    `clara:journal-draft:a%3Ab:${FIRM}:${CLIENT_A}`,
  );
});

test("a draft round-trips WITH its intent key — the identity survives the reload", () => {
  const storage = memoryStorage();
  assert.equal(writeJournalDraft(scopeA, draft({ intentKey: "intent-keep" }), storage), true);
  const restored = readJournalDraft(scopeA, storage);
  assert.equal(restored?.intentKey, "intent-keep");
  assert.equal(restored?.memo, "Office rent");
  assert.equal(restored?.lines[0]?.debit_cents, 120_000);
});

test("A DRAFT NEVER CROSSES CLIENTS, and the one it belongs to still finds it", () => {
  const storage = memoryStorage();
  writeJournalDraft(scopeA, draft({ memo: "for A" }), storage);
  assert.equal(readJournalDraft(scopeB, storage), null, "client B must not see client A's draft");
  assert.equal(readJournalDraft(scopeA, storage)?.memo, "for A", "and A still has its own");

  // Nor across USERS on a shared machine, nor across firms.
  assert.equal(readJournalDraft({ ...scopeA, userId: "someone-else" }, storage), null);
  assert.equal(readJournalDraft({ ...scopeA, firmId: "another-firm" }, storage), null);
});

test("clearing retires ONLY this scope's draft", () => {
  const storage = memoryStorage();
  writeJournalDraft(scopeA, draft(), storage);
  writeJournalDraft(scopeB, draft({ memo: "for B" }), storage);
  clearJournalDraft(scopeA, storage);
  assert.equal(readJournalDraft(scopeA, storage), null);
  assert.equal(readJournalDraft(scopeB, storage)?.memo, "for B");
});

test("an UNTRUSTED payload is refused WHOLE rather than partially believed", () => {
  const storage = memoryStorage();
  const key = journalDraftKey(scopeA);
  const bad = [
    "not json at all",
    "null",
    '"a string"',
    JSON.stringify({ postingDate: "2026-09-01", memo: "m", lines: [] }), // no intentKey
    JSON.stringify({ ...draft(), intentKey: "  " }), // blank intentKey
    JSON.stringify({ ...draft(), lines: "not an array" }),
    // A FRACTIONAL amount out of storage. Seeding a money field from it is the
    // floating-point coercion hard constraint 2 forbids outright.
    JSON.stringify({ ...draft(), lines: [{ account_code: "6100", debit_cents: 1.5, credit_cents: 0 }] }),
    JSON.stringify({ ...draft(), lines: [{ account_code: "6100", debit_cents: "1200", credit_cents: 0 }] }),
    JSON.stringify({ ...draft(), postingDate: 20260901 }),
  ];
  for (const payload of bad) {
    storage.map.set(key, payload);
    assert.equal(readJournalDraft(scopeA, storage), null, `must refuse: ${payload.slice(0, 60)}`);
  }
});

test("storage that is absent or refuses is a state, never a crash", () => {
  assert.equal(readJournalDraft(scopeA, null), null);
  assert.equal(writeJournalDraft(scopeA, draft(), null), false, "the caller is told it was NOT kept");
  clearJournalDraft(scopeA, null); // must not throw

  const throwing: DraftStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(readJournalDraft(scopeA, throwing), null);
  assert.equal(writeJournalDraft(scopeA, draft(), throwing), false);
  clearJournalDraft(scopeA, throwing);
});

test("an intent key is a fresh uuid every time", () => {
  const a = newIntentKey();
  const b = newIntentKey();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test("a draft seeded from a refused basis gets a NEW identity — a new intent, not a retry", () => {
  const seeded = draftFromBasis({
    posting_date: "2026-09-01",
    memo: "Office rent",
    lines: [
      { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent" },
      { account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null },
    ],
  });
  assert.match(seeded.intentKey, /^[0-9a-f-]{36}$/i);
  assert.equal(seeded.postingDate, "2026-09-01");
  assert.equal(seeded.lines[0]?.description, "rent");
  assert.equal(seeded.lines[1]?.description, "", "a null description seeds an empty field, never the word null");
  // Two seedings of the SAME basis are two different intents: editing figures
  // twice must not collide on one identity.
  assert.notEqual(seeded.intentKey, draftFromBasis({ posting_date: "2026-09-01", memo: "m", lines: [] }).intentKey);
});

test("a seeded basis with a non-integer amount lands as zero rather than as a fractional cent", () => {
  const seeded = draftFromBasis({
    posting_date: "2026-09-01",
    memo: "m",
    lines: [{ account_code: "6100", debit_cents: 1.5, credit_cents: 0 }],
  });
  assert.equal(seeded.lines[0]?.debit_cents, 0);
});

test("a new draft opens with the two sides a balanced entry needs", () => {
  const lines = emptyDraftLines();
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.debit_cents, l.credit_cents]), [[0, 0], [0, 0]]);
});
