// @frozen
//
// FROZEN — part of the autoDraft_v10 closure (H-17). NEW IN v10, and the only file in the
// closure that carries new behaviour: the EXACT constraint-name map for a native 23505 reaching
// `refusalFromDbError`. It lives beside autoDraft.v10.errors.ts rather than inside it for the
// same reason autoDraft.v9.toolset.ts was split out of v9's tools — that file is at the repo's
// 500-line ceiling — and the seam is a real one: this module is a pure, DB-shaped lookup table
// with no dependency on the CLR vocabulary above it, so it imports nothing from errors.ts and
// cannot be part of a cycle.
//
// ============================================================================================
// WHAT WAS WRONG (autoDraft.v9.errors.ts:150-155)
// ============================================================================================
// The 23505 arm tested the constraint name by SUBSTRING: any name containing "counterpart" or
// "alias" became an untokened CLR23 — "The counterparty could not be resolved as proposed." —
// and everything else became CLR21 `double_coded`. Both halves are over-broad, and each is
// over-broad in the direction that costs money:
//
//   * "counterpart" is a substring of THREE live index names — `uq_counterparties_client_
//     registration` and `uq_counterparties_client_unregistered_name` (0015:187-192), and
//     `uq_counterparty_aliases_live_name` (0011:669-670). A registration collision, an
//     unregistered-name collision and an alias collision therefore all reached the bookkeeper as
//     the SAME sentence, naming neither which identity collided nor which of the three walls
//     fired. CLR23 is question-shaped (autoDraft.v9.prompt.ts:466-477), so each of them opened a
//     durable human question phrased so that no answer settles it. That is the H-17 row.
//   * the else-arm called EVERY OTHER unique violation `double_coded`, and `double_coded` is
//     SUCCESS-SHAPED: autoDraft.v9.prompt.ts:367 maps it to the `noop_existing` outcome, and the
//     workflow entry settles that as "the bill is already coded" (autoDraft.v9.ts:148-152). An
//     unrecognised uniqueness wall was therefore recorded as a completed no-op. That is the more
//     expensive half of the two, and nothing in the walk would have shown it.
//
// ============================================================================================
// WHAT v10 DOES
// ============================================================================================
//   uq_counterparty_aliases_live_name          -> transient/alias_collision        RETRYABLE
//   uq_counterparties_client_unregistered_name -> transient/name_collision         RETRYABLE
//   uq_counterparties_client_registration      -> CLR23/registration_collision     human
//   uq_journal_entries_one_open_draft_filing   -> CLR21/double_coded               success-shaped
//   (any other 23505)                          -> internal/unnamed_unique          fail-closed
//
// The map is CLOSED, and the closed-ness is the point: a 23505 whose constraint is not one of
// these four is an UNKNOWN wall, and an unknown wall is reported as unknown rather than renamed
// to the nearest thing this closure happens to know.
//
// THE NAMES ARE PROVEN, NOT SPELLED (law 3, "spelling is not identity"). PostgreSQL reports the
// INDEX name in the error's `constraint` field for a unique-index violation, and which string
// that actually is for these four is MEASURED rather than assumed:
// `packages/db/tests/counterparty-alias-kind.test.mjs` provokes each of the four uniques on a
// live rig and asserts the emitted `constraint` equals the exact key held here. A map keyed on a
// name nothing emits is a map that never fires, which is the failure the substring test hid.
//
// WHY THE TOKENS ARE NOT THE DB'S OWN. `clara._resolve_counterparty` already raises CLR23 with
// `registration_conflict` (0015:1200-1202) and `clara.rename_counterparty` raises CLR23 with
// `alias_collision` (0011:1804-1805). Those are the RESOLVER's verdicts — a wall that looked and
// decided. What lands HERE is the opposite: a raw unique violation that got PAST the resolver,
// which is a race or a resolver gap, and that is a different fact about the world. Giving the
// two the same token would make "the resolver refused you" and "the resolver said yes and the
// index said no" indistinguishable on a receipt. `alias_collision` is the one shared spelling,
// shared deliberately: the DB and the runtime mean the same thing by it, and the CODE (CLR23 vs
// `transient`) is what separates the verdict from the race.
//
// WHAT AUTODRAFT ITSELF CAN REACH TODAY, stated because the H-17 handover row reads otherwise.
// The DRAFT path writes no alias and no counterparty: `clara.wake_draft_entry` ->
// `_draft_entry_core` calls `clara._resolve_counterparty` (live body 0015:1128-1235), which only
// READS, and the counterparty BIRTH happens later, on APPROVE (`_approve_entry_core`,
// 0037:1866-1878). So on today's schema `uq_counterparty_aliases_live_name` is reached from the
// human rename / merge / seeding lanes (0011:1807, 0015:2295, 0118:315-323), not from this
// closure's own draft call. This arm is a BELT — v9's own comment used that word — and it is
// worth carrying anyway for two reasons: it fires the moment any birth-with-aliases path lands,
// and until then its real work is taking the alias name OUT of the substring bucket that was
// making the other three unreadable.

import type { RefusalPart } from "./autoDraft.v9.prompt.js";

/** The one CLR23 native-belt reason, and it stays QUESTION-SHAPED on purpose (`isQuestionShaped`
 *  returns true for every CLR23). A registration collision is the one arm of the four a human
 *  genuinely has to settle: the registration number on this document already belongs to a
 *  DIFFERENT record for this client and kind, and only a person knows whether the two are the
 *  same party. The v9 defect was never that CLR23 opens a question — it is that it opened the
 *  SAME question for three different walls, with a sentence that named none of them. */
export type Clr23Reason = "registration_collision";

/** The two RETRYABLE reasons. Neither is a question: both are the world telling this run that
 *  the identity it tried to mint ALREADY EXISTS, which is an instruction to re-resolve against
 *  the existing row and draft against that counterparty. */
export type CounterpartyRetryReason = "alias_collision" | "name_collision";

/** The retryable arms ride the SAME code the evidence-system refusals ride
 *  (`EVIDENCE_SYSTEM_CODE` in autoDraft.v10.errors.ts), and a cell asserts the two strings are
 *  equal rather than trusting this comment. That sharing is what keeps them out of
 *  `isQuestionShaped`: it tests CLR23 and a closed list of CLR21 reasons, and `transient` is in
 *  neither, so a retry can never become a durable human question by accident. */
export const COUNTERPARTY_RETRY_CODE = "transient";

export const CLR23_REASON_MESSAGES: Record<Clr23Reason, string> = {
  registration_collision:
    "The registration number on this document is already recorded for a different counterparty of this client. A person must decide whether these are the same party.",
};

/** In-run instructions, not apologies — the same shape the evidence-system messages use: say
 *  what the world holds, then say what to do about it. */
export const COUNTERPARTY_RETRY_MESSAGES: Record<CounterpartyRetryReason, string> = {
  alias_collision:
    "A live alias already records this trade name for this client, so a second identity cannot be created under it. Re-resolve the counterparty against the existing record that owns the alias, and draft against that one.",
  name_collision:
    "An unregistered counterparty of this kind already exists under this name for this client. Re-resolve the counterparty and draft against the existing record rather than creating a second one.",
};

/** A DESCRIPTOR, not an assembled refusal. The arm names WHICH vocabulary answers, and
 *  autoDraft.v10.errors.ts does the one lookup — which is what lets this module stay free of any
 *  import from errors.ts, and what makes the mutant panel meaningful (flipping an arm's `kind`
 *  or `reason` is a one-token edit that must red exactly one cell). */
export type NativeUniqueArm =
  | { kind: "retry"; reason: CounterpartyRetryReason }
  | { kind: "clr23"; reason: Clr23Reason }
  | { kind: "clr21"; reason: "double_coded" };

/** THE MAP. Keys are the LIVE index names.
 *
 *  `uq_journal_entries_one_open_draft_filing` (created 0009:1033, re-cut 0017:799, byte-pinned by
 *  0053:501-506) is the one arm that keeps v9's success-shaped `double_coded`, and it is the ONLY
 *  name that may have it: 0009:20 is the DB's own written mapping for exactly this index, and
 *  "one open draft per filing" is precisely the fact `noop_existing` records. v9 handed that
 *  outcome to every unique it did not recognise. */
const NATIVE_UNIQUE_ARMS: Record<string, NativeUniqueArm> = {
  uq_counterparty_aliases_live_name: { kind: "retry", reason: "alias_collision" },
  uq_counterparties_client_unregistered_name: { kind: "retry", reason: "name_collision" },
  uq_counterparties_client_registration: { kind: "clr23", reason: "registration_collision" },
  uq_journal_entries_one_open_draft_filing: { kind: "clr21", reason: "double_coded" },
};

/** The four names this closure claims to recognise, sorted, exported so a cell can assert the
 *  recognised set is EXACTLY this one instead of reading the map's own keys back to itself. */
export const NATIVE_UNIQUE_CONSTRAINTS: readonly string[] = Object.keys(NATIVE_UNIQUE_ARMS).sort();

/** Look an emitted constraint name up. Trimmed and lower-cased because that is what v9 did and
 *  identifiers reach here folded already; the folding cannot make two of these four collide,
 *  since they are distinct under it. `hasOwnProperty` rather than a bare index so a name like
 *  "constructor" or "__proto__" can never resolve to an inherited Object member and be treated
 *  as a recognised arm. */
export function nativeUniqueArm(constraint: string | undefined): NativeUniqueArm | undefined {
  const c = String(constraint ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(NATIVE_UNIQUE_ARMS, c) ? NATIVE_UNIQUE_ARMS[c] : undefined;
}

/** The refusal an UNRECOGNISED 23505 gets. Deliberately not CLR23 (that would invent a
 *  counterparty story for a wall nobody identified, and open a human question with it) and
 *  deliberately not CLR21 `double_coded` (that would record a FALSE success). `unnamed_unique` is
 *  the same discipline `tierDCapture` applies to an unrecognised belt: absence recorded as
 *  absence, which is what makes it findable in the settle records rather than silently plausible. */
export function unnamedUniqueRefusal(): RefusalPart {
  return {
    type: "refusal",
    code: "internal",
    reason: "unnamed_unique",
    message: "A uniqueness wall this lane does not name refused the write; nothing was drafted.",
  };
}
