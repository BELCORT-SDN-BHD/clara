// #643 — the periodic-adjustment draft's storage contract, under test.
//
// THE TWO CLAIMS THAT MATTER, and both are about DATA LOSS rather than about storage:
//
//   THE SCOPE KEY IS THE WHOLE SCOPE RULE. A draft filed under another user, firm or client is at
//   another key and is simply never found — there is no runtime "is this mine" comparison to get
//   wrong. And the journal lane's draft and this one are at DIFFERENT keys, so opening one form can
//   never seed it with the other's figures.
//
//   EVERY READ IS UNTRUSTED. What comes back is a string a previous build wrote, that a human could
//   have edited. Anything not fully recognised returns null, because a half-understood draft would
//   seed a form with figures nobody typed — and cents in particular must be safe integers even
//   coming out of storage.

import assert from "node:assert/strict";
import { test } from "node:test";

import { journalDraftKey, type DraftStorage, type JournalDraftScope } from "./journal-draft";
import { emptyAdjustmentDraft } from "./periodic-adjustment";
import {
  adjustmentDraftKey,
  clearAdjustmentDraft,
  readAdjustmentDraft,
  writeAdjustmentDraft,
  type StoredAdjustmentDraft,
} from "./periodic-adjustment-draft";

const SCOPE: JournalDraftScope = { userId: "u-1", firmId: "f-1", clientId: "c-1" };

function memoryStorage(seed: Record<string, string> = {}): DraftStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function stored(over: Partial<StoredAdjustmentDraft> = {}): StoredAdjustmentDraft {
  return {
    intentKey: "intent-1",
    draft: {
      ...emptyAdjustmentDraft(),
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      instruction: "the 2026 stocktake",
      openingCents: 400_000,
      closingCents: 650_000,
      inventoryAccountCode: "1200",
      costAccountCode: "5040",
    },
    postingDate: "2026-12-31",
    memo: "Periodic stock adjustment 2026-01-01 to 2026-12-31",
    /** #643 fix round — the OPTIONAL cited document, part of the same intent as the figures. */
    documentId: null,
    ...over,
  };
}

test("643.draft: the key is scoped to user+firm+client and is NOT the journal lane's", () => {
  assert.equal(adjustmentDraftKey(SCOPE), "clara:periodic-adjustment-draft:u-1:f-1:c-1");
  assert.notEqual(adjustmentDraftKey(SCOPE), journalDraftKey(SCOPE));
  // The SCOPE half is derived from the journal key, so the encoding rule has one definition.
  assert.equal(
    adjustmentDraftKey({ userId: "a:b", firmId: "f", clientId: "c" }).endsWith(":a%3Ab:f:c"), true,
    "every part is percent-encoded: a value containing the separator must not merge two scopes");
});

test("643.draft: a round trip restores BOTH halves and the overridden basis fields", () => {
  const storage = memoryStorage();
  const draft = stored();
  assert.equal(writeAdjustmentDraft(SCOPE, draft, storage), true);
  const back = readAdjustmentDraft(SCOPE, storage);
  assert.deepEqual(back, draft);
  // …and it is not visible under another scope.
  assert.equal(readAdjustmentDraft({ ...SCOPE, clientId: "c-2" }, storage), null,
    "a scope change cannot carry a draft into another client's books");
});

test("643.draft: the CITED DOCUMENT rides the draft, and an unreadable one is dropped, not fatal", () => {
  // THE CITATION IS PART OF THE SAME INTENT as the figures — `clara._admit_accounting_work_core`
  // compares the canonical source refs alongside the basis and particulars digests, so one intent
  // key re-sent with a DIFFERENT document is a typed conflict rather than a replay. It therefore
  // travels under the SAME key, and a reload carries the same claim.
  const storage = memoryStorage();
  const cited = stored({ documentId: "d-1" });
  assert.equal(writeAdjustmentDraft(SCOPE, cited, storage), true);
  assert.deepEqual(readAdjustmentDraft(SCOPE, storage), cited);

  // UNTRUSTED INPUT, like every other field here: a stored id that is not a non-empty string is
  // DROPPED and the FIGURES SURVIVE — evidence is optional on this door, so absence is a valid
  // state and never a reason to discard a draft somebody typed.
  for (const bad of [42, "", "   ", null, undefined, { id: "d-1" }]) {
    const raw = JSON.stringify({ ...stored(), documentId: bad });
    const one = memoryStorage({ [adjustmentDraftKey(SCOPE)]: raw });
    const back = readAdjustmentDraft(SCOPE, one);
    assert.ok(back, `a malformed documentId must not discard the draft: ${JSON.stringify(bad)}`);
    assert.equal(back.documentId, null);
    assert.equal(back.draft.closingCents, 650_000, "…and every figure is still there");
  }

  // A DRAFT WRITTEN BEFORE THIS FIELD EXISTED reads as "no document", not as unreadable.
  const legacy = JSON.stringify({ intentKey: "intent-1", draft: stored().draft, postingDate: "2026-12-31", memo: "m" });
  const old = readAdjustmentDraft(SCOPE, memoryStorage({ [adjustmentDraftKey(SCOPE)]: legacy }));
  assert.ok(old);
  assert.equal(old.documentId, null);
});

test("643.draft: an unrecognised payload returns null rather than a partial form seed", () => {
  const bad = [
    "{",
    "null",
    JSON.stringify({ draft: stored().draft }),
    JSON.stringify({ intentKey: "  ", draft: stored().draft }),
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, purpose: "journal_entry" } }),
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, method: "guessing" } }),
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, obligationKind: "evasion" } }),
    // CENTS MUST BE SAFE INTEGERS EVEN COMING OUT OF STORAGE.
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, openingCents: 12.5 } }),
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, openingCents: "400000" } }),
    JSON.stringify({ intentKey: "i", draft: { ...stored().draft, periodStart: 20260101 } }),
  ];
  for (const raw of bad) {
    const storage = memoryStorage({ [adjustmentDraftKey(SCOPE)]: raw });
    assert.equal(readAdjustmentDraft(SCOPE, storage), null, `must refuse: ${raw.slice(0, 60)}`);
  }
});

test("643.draft: a storage that refuses is the same answer as an empty one, never a throw", () => {
  const hostile: DraftStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.equal(readAdjustmentDraft(SCOPE, hostile), null);
  assert.equal(writeAdjustmentDraft(SCOPE, stored(), hostile), false,
    "the caller needs to know it was not kept, so it can say so rather than promise a recovery");
  assert.doesNotThrow(() => clearAdjustmentDraft(SCOPE, hostile));
  assert.equal(readAdjustmentDraft(SCOPE, null), null);
  assert.equal(writeAdjustmentDraft(SCOPE, stored(), null), false);
});

test("643.draft: clearing retires only this scope's draft", () => {
  const storage = memoryStorage();
  writeAdjustmentDraft(SCOPE, stored(), storage);
  writeAdjustmentDraft({ ...SCOPE, clientId: "c-2" }, stored({ intentKey: "intent-2" }), storage);
  clearAdjustmentDraft(SCOPE, storage);
  assert.equal(readAdjustmentDraft(SCOPE, storage), null);
  assert.equal(readAdjustmentDraft({ ...SCOPE, clientId: "c-2" }, storage)?.intentKey, "intent-2");
});
