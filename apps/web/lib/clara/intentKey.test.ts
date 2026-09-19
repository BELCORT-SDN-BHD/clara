// #642 AC3 — the content-addressed intent key, at its own seam.
//
// These cells are the ALGEBRA; the integration cells in
// `components/clara/thread-intent-key.test.tsx` prove the composer actually posts what
// this derives. Both are needed: a key that is stable in isolation but re-derived from
// different inputs on the send path would pass one and fail the other.
//
// RED BEFORE: `lib/clara/intentKey.ts` did not exist — `useClaraThread` minted
// `crypto.randomUUID()` per press, so there was no function to test and, more to the
// point, no value that could ever repeat.

import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalIntentAddress, deriveIntentKey, transcriptPosition } from "./intentKey";
import type { AttachmentPart } from "@/lib/parts/types";

const THREAD = "66666666-6666-4666-8666-666666666666";
const CLIENT = "55555555-5555-4555-8555-555555555555";

const attach = (documentId: string, intakeId = `intake-${documentId}`): AttachmentPart => ({
  type: "attachment",
  document_id: documentId,
  intake_id: intakeId,
});

const key = (over: Partial<Parameters<typeof deriveIntentKey>[0]> = {}) =>
  deriveIntentKey({
    threadId: THREAD,
    altitude: CLIENT,
    draft: "book this invoice",
    attachments: [],
    // The conversation has not moved: every cell below that does not say otherwise is
    // about two presses made at the SAME point in the transcript, which is what a retry
    // is.
    transcriptPosition: "0@",
    ...over,
  });

test("p642.web.intent_key — the SAME intent derives the SAME key, press after press", () => {
  assert.equal(key(), key(), "two presses of one unchanged composer must agree");
  assert.equal(
    key({ attachments: [attach("doc-a")] }),
    key({ attachments: [attach("doc-a")] }),
    "…including when the same file is attached",
  );
});

test("p642.web.intent_key — a retry after a refusal reuses the key, because nothing in the composer changed", () => {
  // The composer keeps BOTH text and files on a refused send (`ClaraThreadView`'s
  // `submitDraft` clears them only `if (onRecord)`), so the retry's inputs are the
  // originals by construction. This cell pins that the DERIVATION does not add anything
  // of its own — a clock, a counter, a uuid — that would fork them.
  const first = key({ attachments: [attach("doc-a"), attach("doc-b")] });
  const retry = key({ attachments: [attach("doc-a"), attach("doc-b")] });
  assert.equal(retry, first);
});

test("p642.web.intent_key_and_changed_attachments — THE BLOCKER'S CELL: a swapped invoice derives a DIFFERENT key", () => {
  // THE HAZARD, and why it is a wrong-books failure rather than a UI annoyance.
  // `clara.begin_chat_turn` returns from its replay branch (0006:957-960) BEFORE the user
  // message is inserted (:995-996) and never reads `p_user_parts`. So a same-key repost
  // carrying invoice B after invoice A was admitted returns the ORIGINAL task and drops B
  // in SILENCE, with the screen saying "already accepted". Nothing downstream can catch
  // it; the only defence is that the key must change when the attachment set does.
  const withA = key({ draft: "book this invoice", attachments: [attach("invoice-a")] });
  const withB = key({ draft: "book this invoice", attachments: [attach("invoice-b")] });
  assert.notEqual(withB, withA, "the same sentence with a DIFFERENT file is a different intent");

  // THE CONTROL, which is what makes the assertion above mean something: identical text
  // AND identical ids must still agree, or the key would "differ" for every press and the
  // cell would pass for the wrong reason.
  assert.equal(
    key({ draft: "book this invoice", attachments: [attach("invoice-a")] }),
    withA,
    "identical text and identical ids derive the SAME key",
  );

  // Attaching A then B and attaching B then A are the same intent — ORDER is not identity.
  assert.equal(
    key({ attachments: [attach("invoice-a"), attach("invoice-b")] }),
    key({ attachments: [attach("invoice-b"), attach("invoice-a")] }),
    "attachment ORDER is not part of the address",
  );

  // Removing a file is a changed intent in the other direction.
  assert.notEqual(
    key({ attachments: [attach("invoice-a"), attach("invoice-b")] }),
    key({ attachments: [attach("invoice-a")] }),
    "removing a file is a changed intent",
  );
});

test("p642.web.intent_key — every input is part of the address, and whitespace is not", () => {
  assert.notEqual(key({ draft: "book this invoice" }), key({ draft: "book that invoice" }), "the text");
  assert.notEqual(key({ threadId: "other-thread" }), key(), "the thread");
  assert.notEqual(key({ altitude: "firm" }), key(), "the altitude");
  // The send path trims before it posts (`sendMessage`'s own `text.trim()`), so a
  // trailing space must not fork one intent into two keys.
  assert.equal(key({ draft: "  book this invoice \n" }), key(), "surrounding whitespace is not part of the intent");
});

test("p642.web.intent_key — the canonical address is UNAMBIGUOUS, not merely deterministic", () => {
  // The classic concatenation collision: without length prefixes, `("ab","c")` and
  // `("a","bc")` serialise alike. This is asserted on the ADDRESS rather than on the hash
  // because a hash collision would be indistinguishable from a serialisation bug, and
  // only one of those is a defect in this module.
  const at = { draft: "", attachments: [], transcriptPosition: "0@" } as const;
  const ab_c = canonicalIntentAddress({ threadId: "ab", altitude: "c", ...at });
  const a_bc = canonicalIntentAddress({ threadId: "a", altitude: "bc", ...at });
  assert.notEqual(ab_c, a_bc);
  assert.notEqual(deriveIntentKey({ threadId: "ab", altitude: "c", ...at }),
    deriveIntentKey({ threadId: "a", altitude: "bc", ...at }));
  // …and the position is inside the same fence: a two-row transcript ending on `a2` and a
  // 2-row-shaped id are not allowed to serialise alike either.
  assert.notEqual(
    canonicalIntentAddress({ threadId: "t", altitude: "f", draft: "", attachments: [], transcriptPosition: "2@a2" }),
    canonicalIntentAddress({ threadId: "t", altitude: "f", draft: "", attachments: [], transcriptPosition: "2@a" }),
  );
});

test("p642.web.intent_key — the key is a plain, legible token a database column can carry", () => {
  const k = key();
  assert.match(k, /^intent-[0-9a-f]{32}$/, `the key must be readable in a chat_messages row: ${k}`);
});

test("p642.web.intent_key — a two-byte character is not the same as its two bytes", () => {
  // A one-round-per-code-unit hash would let "Ā" and "\u0001\u0000" agree. Two
  // different sentences deriving one key inside a session is exactly the collision that
  // would make one of them vanish.
  assert.notEqual(key({ draft: "Ā" }), key({ draft: "\u0001\u0000" }));
});

test("p642.web.intent_key — a REPEATED utterance at a LATER point in the conversation is a different intent", () => {
  // Fix round 1, review finding ADV-642-1 / STANDARDS F1 (blocker). Addressed by content
  // alone, "yes" answered to a second question derived the key of the "yes" answered to
  // the first, and `begin_chat_turn`'s replay branch answered it with the turn it had
  // already run — no bubble, no task, no error, and permanently, because the lookup has
  // no time or state bound over an append-only table.
  const first = key({ draft: "yes", transcriptPosition: "0@" });
  const later = key({ draft: "yes", transcriptPosition: "2@a2" });
  assert.notEqual(later, first, "the same word at a later point in the conversation is a NEW instruction");

  // THE CONTROL, and it is the whole reason the key exists: two presses made at the SAME
  // point — which is every retry, because a refused or lost send adds nothing to the
  // transcript — must still agree.
  assert.equal(key({ draft: "yes", transcriptPosition: "2@a2" }), later, "a retry at the same position reuses the key");
});

test("p642.web.intent_key — `transcriptPosition` reads persisted rows only, and says both how many and which last", () => {
  assert.equal(transcriptPosition([]), "0@", "an empty transcript has a position too, and it is not a special case");
  assert.equal(transcriptPosition([{ id: "u1" }, { id: "a2" }]), "2@a2");
  // BOTH HALVES MATTER. Two transcripts of the same LENGTH whose last row differs are
  // different conversations; two that end on the same row with different lengths are the
  // same row read through different windows. Either one alone would collide.
  assert.notEqual(transcriptPosition([{ id: "u1" }, { id: "a2" }]), transcriptPosition([{ id: "u1" }, { id: "a9" }]));
  assert.notEqual(transcriptPosition([{ id: "a2" }]), transcriptPosition([{ id: "u1" }, { id: "a2" }]));
});
