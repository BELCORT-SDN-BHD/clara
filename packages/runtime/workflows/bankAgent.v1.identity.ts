// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (identity) — everything about WHICH printed identifier a promotion may name, and how
// many times this run actually saw it. Split from bankAgent.v1.pack.ts for the 500-line module
// budget; it is one subject and reads as one.
//
// THE LAW IT KEEPS (裁-44 R2 / FOLD-11, hardened by R3 / FOLD-15): `times_seen` is a durable
// number in a proposal a human settles, so it is DERIVED from the pack this run read — and the
// derivation must be one the model cannot bend by choosing its input.

import type { BankPackView } from "./bankAgent.v1.pack.js";

/** Separators are noise on BOTH sides of an identifier comparison — "9988-776655" printed on a
 *  statement and "9988776655" typed by a model are the same account. Canonicalising to [a-z0-9]
 *  is what lets the token match below be exact without being brittle (裁-44 R3 / FOLD-15). */
export function canonicalIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The floor each identifier kind must clear AFTER canonicalisation (裁-44 R3 / FOLD-15).
 *  A bank account is a number and the longest of the three, so it carries the higher bar. */
const MIN_CANON_CHARS: Record<string, number> = { tin: 6, ssm: 6, bank_account: 8 };

/** Is this identifier long and specific enough to be COUNTABLE at all? Returns null when it is,
 *  otherwise the typed reason the caller refuses with. */
export function identifierTooShort(kind: string, value: string): string | null {
  const canon = canonicalIdentifier(value);
  const min = MIN_CANON_CHARS[kind] ?? 6;
  if (canon.length < min) {
    return `an identifier of kind ${kind} needs at least ${min} letters/digits once separators are removed; "${value}" has ${canon.length}`;
  }
  // A BANK ACCOUNT IS A NUMBER. A bank prefix may precede it, but eight digits must be there —
  // otherwise a phrase like "g1 bank line" clears a bare character count and is then matched
  // against every line that happens to print it.
  if (kind === "bank_account" && (canon.match(/\d/g) ?? []).length < 8) {
    return `a bank_account identifier needs at least 8 digits; "${value}" has ${(canon.match(/\d/g) ?? []).length}`;
  }
  return null;
}

/**
 * COUNT THE SIGHTINGS OF AN IDENTIFIER IN THE PACK THIS RUN READ — 裁-44 R2 / FOLD-11, hardened
 * against the model by 裁-44 R3 / FOLD-15.
 *
 * `times_seen` used to be the MODEL's number, and 0121:5634 stores it verbatim in the proposal
 * payload a human reads to decide. That is a model-generated numeral in a durable artifact with no
 * deterministic evaluator behind it — the pack's own `learned_payers` is explicitly
 * `{"not_implemented": true}` (0121:5781). Hard constraint 2, in the same shape FOLD-1 closed one
 * table over.
 *
 * THE FIRST DERIVATION WAS STILL THE MODEL'S TO GAME. A raw case-insensitive SUBSTRING search over
 * a one-character identifier counts every line with a "1" anywhere in it — so the model could not
 * choose the number directly, but it could choose an identifier that made the number whatever it
 * liked. Deriving from DB-owned inputs is not enough on its own: the QUESTION has to be one the
 * model cannot bend.
 *
 * SO THE MATCH IS TOKEN-BOUNDED, ON BOTH SIDES. The description is split on whitespace — the
 * boundaries the statement actually prints — and each token is canonicalised to [a-z0-9] alone.
 * The identifier is canonicalised the same way, and a sighting is a token that EQUALS it. Two
 * consequences worth naming:
 *   - "9988-776655" printed on the statement is found by an identifier written "9988776655", and
 *     vice versa: separators are noise on both sides, which is what canonicalisation is for.
 *   - "1" can never match "514202" — it is not a whole token — and the length floor refuses it
 *     before matching anyway.
 * A longer digit run therefore never contains a shorter identifier by accident.
 *
 * THERE IS NO FLOOR ON THE COUNT. Zero sightings is not "at least one", it is a proposal grounded
 * in nothing this run saw, and the caller REFUSES it — FOLD-4's rule one table over: propose only
 * what you actually read.
 */
export function countIdentifierSightings(pack: BankPackView, identifierValue: string): number {
  const needle = canonicalIdentifier(identifierValue);
  if (needle.length === 0) return 0;
  let seen = 0;
  for (const text of pack.lineText.values()) {
    const hit = text.split(/\s+/).some((token) => canonicalIdentifier(token) === needle);
    if (hit) seen += 1;
  }
  return seen;
}
