// ONE DECISION, ONE KEY — the bank matching lane's operation key (#657, D15).
//
// THE RENEWAL RULE, VERBATIM, because a later change to WHEN a key renews has to find this
// sentence and nothing else:
//
//   The key renews only on an intentional human act that changes WHAT is being submitted —
//   the set of selected line ids, the set of selected entry ids, or a typed cents value; it
//   renews on nothing else: not on a failed or timed-out submit, not on the unconditional
//   `act()` reload (matching-section.tsx's post-act reload), not on a re-render, not on a tab
//   switch, not on a dismissed refusal.
//
// WHY THIS VERB DIFFERS FROM THE HOUSE POSTURE. `lib/members/doors.ts:58-66` mints a FRESH key
// per call ON PURPOSE, and `work-cancel-dialog.tsx`'s `useDecisionKey` mints one per OPEN
// DIALOG and renews it when the dialog reopens. Both are correct for a decision whose identity
// lives in a component's lifecycle. A bank match's identity does NOT: the same human, deciding
// the same thing, may submit it from a re-rendered list after a reload that the surface itself
// triggered. `lib/bank/match-doors.ts` used `crypto.randomUUID()` per call, so a lost response
// followed by an identical resubmit reached the database as a SECOND operation — and met
// `already_matched`, a refusal for a thing the human had in fact already succeeded at. That is
// exactly the defect AC4 and AC10 exist to close.
//
// SO THE KEY IS DERIVED FROM THE INTENT, NOT FROM A LIFECYCLE. The tuple is
// `{client, sorted line ids, sorted entry ids, cents per entry, ack flag}` — the SAME tuple
// `clara._reserve_op` hashes server-side (`_match_bank_line_core`'s request hash over
// `{client, lines, entries, adjustments, ack_period_exceptions}`), so "same intent ⇒ same key"
// is a property of the DATA rather than of a component's lifecycle. Nothing here needs to be
// remembered, reset, or renewed by hand; there is no state to get wrong.
//
// THE HASH IS SYNCHRONOUS AND DETERMINISTIC ON PURPOSE. `crypto.subtle.digest` is async, and an
// async key would put an await between the human's click and the request — a second click in
// that window is precisely the duplicate this module exists to collapse. FNV-1a over a
// canonical serialisation is not a cryptographic digest and does not need to be: the key is an
// idempotency token scoped to one firm and one verb, not a secret, and the database re-hashes
// the real arguments itself and refuses a key whose request hash disagrees.

/** The intent a match submission expresses. Adjustments are NOT part of it: #657 ships no
 *  adjustment control (a difference is #671's/#675's, never a silent plug), so the array the
 *  door receives is always null on this lane and a field that is always null cannot
 *  distinguish two intents. */
export type MatchIntent = {
  clientId: string;
  lineIds: readonly string[];
  entries: readonly { entry_id: string; matched_cents: number }[];
  ackPeriodExceptions: boolean;
};

/** The canonical serialisation the key hashes. Exported so a test can assert the ORDERING
 *  rules directly rather than inferring them from two hashes being equal. */
export function canonicalMatchIntent(intent: MatchIntent): string {
  const lines = [...intent.lineIds].sort();
  const entries = [...intent.entries]
    .map((e) => ({ entry_id: e.entry_id, matched_cents: Math.trunc(e.matched_cents) }))
    .sort((a, b) => (a.entry_id < b.entry_id ? -1 : a.entry_id > b.entry_id ? 1 : 0));
  return JSON.stringify({
    v: 1,
    client: intent.clientId,
    lines,
    entries,
    ack: Boolean(intent.ackPeriodExceptions),
  });
}

const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

function fnv1a64(input: string, offset: bigint): bigint {
  let hash = offset;
  for (let i = 0; i < input.length; i += 1) {
    // Hash the UTF-16 code unit as two bytes, so a surrogate pair and a BMP character with the
    // same low byte cannot collide by construction.
    const unit = input.charCodeAt(i);
    hash = ((hash ^ BigInt(unit & 0xff)) * FNV_PRIME) & MASK64;
    hash = ((hash ^ BigInt((unit >> 8) & 0xff)) * FNV_PRIME) & MASK64;
  }
  return hash;
}

/**
 * The operation key for ONE match decision.
 *
 * Shape: `match_bank_line:<32 lowercase hex>`. The prefix names the verb so a key is readable
 * in `clara.op_receipts` and in a refusal; the digest is two independently-seeded FNV-1a-64
 * passes over the canonical intent, concatenated.
 *
 * The second field of a colon-split bank key is, on the AGENT lane, the task id
 * (`chatTurn.v14.bank.ts`'s `bank-<verb>:<taskId>:<segment>:<stableJson>`). This human key's
 * second field is a hex digest, not a uuid — `clara._bank_op_key_task` is uuid-regex guarded
 * and TOTAL, so it answers NULL for this shape rather than raising. That is deliberate: the
 * human lane writes no `bank_agent_receipts` row and has no task to bind.
 */
export function matchOpKeyFor(intent: MatchIntent): string {
  const canonical = canonicalMatchIntent(intent);
  const a = fnv1a64(canonical, 0xcbf29ce484222325n);
  const b = fnv1a64(`${canonical}`, 0x84222325cbf29ce4n);
  return `match_bank_line:${a.toString(16).padStart(16, "0")}${b.toString(16).padStart(16, "0")}`;
}
