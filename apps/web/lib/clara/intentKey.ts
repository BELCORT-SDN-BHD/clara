// #642 AC3 — ONE INTENT, ONE KEY: the composer's CONTENT-ADDRESSED identity for a
// single message intent, and the browser's half of `clara.begin_chat_turn`'s
// idempotency contract.
//
// THE DEFECT. `useClaraThread.sendMessage` minted `crypto.randomUUID()` on every press.
// A uuid per press is not idempotency — it is the opposite: it guarantees the database
// sees a NEW intent every time, so the one mechanism that exists to deduplicate a
// re-pressed Send (the door's `turn_key` replay lookup over
// `(session_id, turn_key, role='user')`, 0006_runtime_core.sql:954-960) could never
// fire from this surface. `uq_agent_task_one_live_turn` (0006:165-166) covered the
// common double-press and nothing else: it is PARTIAL on the four non-terminal
// statuses, so the moment the first turn settles it stops working, and a retry after a
// dropped ack was admitted as a second turn with a second bubble and a second run.
//
// WHY CONTENT ADDRESSING RATHER THAN A HANDED-OUT KEY, and both halves matter:
//
//   (a) A RETRY OF THE SAME INTENT REUSES THE KEY. A refused or lost send leaves the
//       text AND the files sitting in the composer — `ClaraThreadView` clears both only
//       `if (onRecord)` — so the retry is derived from exactly the same inputs and lands
//       on the door's replay branch. This is appendix C §3's "same operation identity
//       for retries" with no extra state to keep, and it survives a reload for free:
//       the same sentence with the same files retyped derives the same key.
//
//   (b) A CHANGED INTENT — INCLUDING A CHANGED ATTACHMENT SET — GETS A NEW KEY
//       AUTOMATICALLY, and that is the sharp half. `begin_chat_turn` returns at
//       :957-960 BEFORE the user-message insert at :995-996 and never reads
//       `p_user_parts`, so a same-key repost carrying invoice B after invoice A was
//       admitted would return the ORIGINAL task and DROP B in silence while the screen
//       said "already accepted". That is a wrong-books failure with no error anywhere,
//       not a UI annoyance, and it is designed out here rather than caught downstream:
//       nothing downstream can catch it.
//
//   (c) A REPEATED UTTERANCE IS A NEW INTENT, and this is the half the first cut missed
//       (fix round 1, review finding ADV-642-1 / STANDARDS F1). Addressed by content
//       ALONE, every repeat of a sentence in one session derived the FIRST one's key and
//       landed on the same replay branch — so the second "yes", "ok", "continue" or
//       "post it" was answered with the turn Clara had already run and dropped with no
//       bubble, no task and no error. The replay lookup has no time or state bound
//       (0006:955-960 is `limit 1` over `(session_id, turn_key, role='user')` on an
//       append-only table), so that collapse was PERMANENT: the person could never send
//       that sentence again in that conversation. The address therefore carries the
//       conversation's POSITION as well as its content — see `transcriptPosition` below.
//
// IT NEEDS NO NEW STATE. `AttachmentPart` is `{type, document_id, intake_id}`
// (lib/parts/types.ts) and `ComposerAttachmentControl` emits only READY items carrying a
// `documentId`, so the address is a pure function of what is already on screen.
//
// MEMORY-ONLY BY DESIGN, and that is a deliberate non-promise: appendix C §3 rules out
// promising reload recovery from memory-only state. Nothing persists this key; the door
// is the only durable record of it, on the user message's own `turn_key` column.

import type { AttachmentPart } from "@/lib/parts/types";

/** The inputs an intent is addressed by. `draft` is the RAW composer text — this module
 *  applies the same `trim()` the send path does, so a trailing space can never fork one
 *  intent into two keys. */
export interface IntentKeyInput {
  threadId: string;
  /** The draft store's scope half — `clientId ?? FIRM_ALTITUDE`. The same sentence typed
   *  into the same thread at two different altitudes is two intents, because the turn it
   *  admits carries a different client context. */
  altitude: string;
  draft: string;
  attachments: readonly AttachmentPart[];
  /** WHERE IN THE CONVERSATION this press was made, from `transcriptPosition` below.
   *
   *  It is what separates a RETRY from a REPEAT, and nothing else can: both carry the
   *  same text and the same files. A refused or lost send adds nothing to the persisted
   *  transcript, so a retry sees the same position and derives the same key — the door's
   *  replay branch still deduplicates it, which is the whole point of the key. A sentence
   *  re-typed after a turn has SETTLED sees a longer transcript and derives a new one, so
   *  it is admitted as the new instruction it is. */
  transcriptPosition: string;
}

/** The conversation's position, as the composer has seen it: how many rows are persisted
 *  and which one is last.
 *
 *  BOTH HALVES, deliberately. The count alone would collide across a transcript that was
 *  re-read into a different window; the last id alone would not move if a row were
 *  appended and another dropped in the same read. Neither is a hypothetical this surface
 *  can rule out, and the pair costs one string.
 *
 *  IT READS ONLY PERSISTED ROWS — never the provisional bubble, never the live chunk
 *  buffer. Those are this tab's own optimism about a turn that may not have been
 *  admitted, and addressing an intent by them would fork the key between a press and its
 *  own retry. */
export function transcriptPosition(messages: readonly { id: string }[]): string {
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  return last ? `${messages.length}@${last.id}` : "0@";
}

/** The canonical, unambiguous serialisation the hash is taken over. Exported for the
 *  cells: a key is only as good as the string underneath it, and a reader should be able
 *  to see WHY two presses agree or differ without reversing a hash.
 *
 *  UNAMBIGUOUS, not merely deterministic: every field is length-prefixed, so no
 *  concatenation of one set of inputs can ever equal a different set's (the classic
 *  `"ab"+"c"` vs `"a"+"bc"` collision). Attachment ids are SORTED, because attaching A
 *  then B and attaching B then A are the same intent. */
export function canonicalIntentAddress(input: IntentKeyInput): string {
  const documentIds = [...new Set(input.attachments.map((part) => part.document_id).filter((id) => typeof id === "string" && id.length > 0))].sort();
  const fields = [input.threadId, input.altitude, input.transcriptPosition, input.draft.trim(), ...documentIds];
  return fields.map((field) => `${field.length}:${field}`).join("|");
}

/** FNV-1a, 128-bit, over the UTF-16 code units of the canonical address.
 *
 *  WHY A HAND-ROLLED HASH RATHER THAN `crypto.subtle.digest`. This runs on the
 *  synchronous send path, inside the same tick that reads the draft; WebCrypto's digest
 *  is a Promise, and awaiting it between the press and the POST would open a window in
 *  which a second press can start its own send with the composer still full. A
 *  non-cryptographic hash is the right tool anyway: this value is never a secret and
 *  never an authorisation — it is an equality test, and the only thing a collision could
 *  do is make two DIFFERENT intents IN THE SAME SESSION look like one. 128 bits is
 *  enormous headroom against that for a surface where a session's turns are counted in
 *  hundreds. */
function fnv1a128(text: string): string {
  const PRIME = 0x0000000001000000000000000000013bn;
  const MASK = (1n << 128n) - 1n;
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    // Two byte-wide rounds per code unit — never one round over a 16-bit value, which
    // would let "Ā" and "\u0001\u0000" hash alike.
    hash = ((hash ^ BigInt(unit & 0xff)) * PRIME) & MASK;
    hash = ((hash ^ BigInt((unit >> 8) & 0xff)) * PRIME) & MASK;
  }
  return hash.toString(16).padStart(32, "0");
}

/** The `turn_key` this composer state addresses. Stable across presses, reloads and
 *  remounts for identical inputs; different for any changed input, including a changed
 *  attachment set.
 *
 *  The `intent-` prefix is not decoration: it makes a key readable in a `chat_messages`
 *  row, a runtime log or a network panel as "a content address this surface derived",
 *  distinguishable at a glance from the random uuids the same column carries from before
 *  this change and from other callers. */
export function deriveIntentKey(input: IntentKeyInput): string {
  return `intent-${fnv1a128(canonicalIntentAddress(input))}`;
}
