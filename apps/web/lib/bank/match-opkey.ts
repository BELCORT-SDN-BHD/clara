// ONE DECISION, ONE KEY — the bank matching lane's operation key (#657, D15).
//
// THE RENEWAL RULE, VERBATIM, because a later change to WHEN a key renews has to find this
// sentence and nothing else:
//
//   The key renews only on an intentional human act that changes WHAT is being submitted —
//   the set of selected line ids, the set of selected entry ids, or a typed cents value —
//   OR on a change to the WORLD the submission is deciding about: a selected entry's own
//   match history moving on (a match landing on it, or an existing one being unmatched). It
//   renews on nothing else: not on a failed or timed-out submit, not on the unconditional
//   `act()` reload (matching-section.tsx's post-act reload), not on a re-render, not on a tab
//   switch, not on a dismissed refusal.
//
// THE SECOND CLAUSE IS THE FIX-ROUND AMENDMENT (review SP1 / A1) and it needs ratifying: the
// brief's D15 wrote the first clause verbatim and stopped there, which left `match -> unmatch ->
// resubmit the identical selection` replaying the dead match's receipt. See `entryGeneration`
// below for the measurement, the mechanism and the residual.
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
  entries: readonly { entry_id: string; matched_cents: number; generation?: string | null }[];
  ackPeriodExceptions: boolean;
};

/**
 * THE WORLD GENERATION of one candidate entry — the fix-round clause of the renewal rule.
 *
 * WHY IT EXISTS (review SP1 / A1, both measured on a live rig). `match -> unmatch -> resubmit
 * the identical selection` is an ordinary re-decision, and a key that is a pure function of the
 * selection cannot tell it from a lost-response retry. `clara._reserve_op` (0004:46-60) keys on
 * (firm, fn, op_key) and knows nothing about whether the match its stored result describes is
 * still live, so the second submission REPLAYED the dead match's receipt: the face rendered a
 * persistent "no new cash entry was created" block naming a match the database had already
 * recorded as `unmatched`, beside a line that visibly never left the unmatched report.
 *
 * WHAT IT IS. The shape of the entry's own `match_history` — the bounded array the recut
 * `list_bank_match_candidates` already puts on the wire (migration 0226 §3): how many groups it
 * has ridden on this bank account's COA, and the identity AND STATUS of the newest one. An
 * unmatch flips that newest row from `live` to `unmatched`; a new match prepends a row. A lost
 * response, a reload, a re-render and a dismissed refusal write nothing, so they leave the
 * string byte-identical.
 *
 * WHY IT KEEPS D15. The generation is read off the DATA, not off a component's lifecycle;
 * nothing has to be remembered, reset or renewed by hand. It is key material only: it is never
 * sent to the door, because `_reserve_op` re-hashes the real arguments and refuses a key whose
 * request hash disagrees.
 *
 * ITS RESIDUAL, STATED. The generation is only as fresh as the read it came from. If another
 * session unmatches this entry between this surface's last candidate read and this submit, the
 * key is computed against a stale world and the replay is still reachable. The surface re-reads
 * the candidates after EVERY act (success or refusal) and on every `?line=` change, which is a
 * mitigation and not a proof; the proof would have to live in the door, which #657 does not
 * open (`_match_bank_line_core` is recut for its receipt payload only).
 */
export function entryGeneration(
  candidate: { match_history?: readonly { match_id?: string; status?: string | null }[] | null } | null | undefined,
): string | null {
  const history = candidate?.match_history;
  if (!Array.isArray(history) || history.length === 0) return null;
  const head = history[0];
  return `${history.length}:${head?.match_id ?? ""}:${head?.status ?? ""}`;
}

/** The canonical serialisation the key hashes. Exported so a test can assert the ORDERING
 *  rules directly rather than inferring them from two hashes being equal. */
export function canonicalMatchIntent(intent: MatchIntent): string {
  const lines = [...intent.lineIds].sort();
  const entries = [...intent.entries]
    .map((e) => ({
      entry_id: e.entry_id,
      matched_cents: Math.trunc(e.matched_cents),
      // The world generation (see `entryGeneration`). `?? null` so an absent generation and an
      // explicit null are ONE value: a caller that cannot see the history must be stable.
      gen: e.generation ?? null,
    }))
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
