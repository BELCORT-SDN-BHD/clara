// FS-8 PR-2 (裁-97) — the firm-settings surface: `clara.firms.
// high_stakes_amount_cents` (read) + `clara.set_firm_high_stakes_threshold`
// (write). Grounded against the LIVE migration body (0022_extraction_slice_
// x1.sql §B) rather than description alone:
//
//   clara.set_firm_high_stakes_threshold(p_cents bigint, p_op_key text
//   default null) returns jsonb — OWNER floor (`_human_ctx(role_rank(
//   'owner'))`, raises `insufficient role`/CLR04 for anyone below owner);
//   `p_op_key` required, non-blank (CLR10); `p_cents` must be > 0, mirroring
//   the column's own CHECK so a malformed amount gets a Clara refusal rather
//   than a raw 23514 (CLR10); IDEMPOTENT-WITH-RECEIPT — setting the SAME
//   value again under a NEW op_key still writes a fresh audit row (an
//   owner's re-affirmation is a receipt worth having). Returns `{firm_id,
//   old_cents, new_cents}`. Granted to `clara_authenticated` (every role may
//   CALL it; the owner floor is enforced INSIDE the function, not by the
//   grant) — so this module and its UI never pre-hide the control on a
//   client-side role guess; a sub-owner caller reaches the same door and
//   gets the DB's own CLR04 "insufficient role" refusal, verbatim.
//
// The READ side needs no separate door or `_visible` view: `clara.firms`
// already carries a direct `select` grant to `clara_authenticated`
// (0002_foundation.sql:534-536), RLS-scoped to the caller's own firm
// (`p_firms_human`, `id = clara.jwt_firm()`) — that predicate is an equality
// against a single scalar, so it can structurally never return more than one
// row (unlike `caller_context`'s own defensive `limit: 2`, which guards a
// uniqueness INDEX rather than an equality predicate).

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";

export type FirmSettingsRow = {
  id: string;
  high_stakes_amount_cents: number;
};

export function loadFirmSettings(session: SessionTokenAccessor): Promise<FirmSettingsRow[]> {
  return getRows<FirmSettingsRow>("firms", {
    select: "id,high_stakes_amount_cents",
    limit: 1,
    session,
  });
}

export function setFirmHighStakesThreshold(session: SessionTokenAccessor, cents: number): Promise<unknown> {
  return callDoor("set_firm_high_stakes_threshold", { p_cents: cents, p_op_key: crypto.randomUUID() }, { session });
}

/** A human-typed decimal RM amount -> integer cents, for the threshold
 *  dialog's own input. `./money.ts`'s own header states it "renders ONLY…
 *  never computes one" — this domain's first WRITE surface needs the
 *  opposite direction, so the parser lives here rather than breaking that
 *  file's stated contract. Same string-based BigInt algorithm as
 *  `lib/registers/money.ts`'s `parseAmountToCents` (never
 *  `Math.round(x * 100)` — floating point on a monetary figure), ported
 *  rather than cross-imported per the file-disjointness convention
 *  `./money.ts`'s own header names. `null` for anything that is not a valid
 *  non-negative decimal amount — the caller must treat `null` as "not a
 *  number yet", never coerce it to 0. Negative amounts are rejected here
 *  (not merely stripped) because a negative threshold is nonsensical, not a
 *  sanitizable typo — the DB's own `p_cents > 0` check (0022 §B) agrees.
 *
 *  FINDING 1 (raised by pr489-codex-leg, law-28 leg): the pre-fix body
 *  blanket-stripped every comma (`input.replace(/,/g, "")`) BEFORE
 *  validating, so a European-style decimal-comma amount like "1234,56"
 *  (meant as RM1,234.56) silently parsed as RM123,456.00 — a 100x error on
 *  a DB-owned governance number, accepted with no rejection and no echo of
 *  the interpreted amount. Fix shape: REFUSE ambiguity rather than guess. A
 *  comma is accepted ONLY as a thousands separator in a strictly valid
 *  position — groups of exactly three digits, and never the decimal mark;
 *  any other placement (wrong grouping, leading, trailing, adjacent to the
 *  decimal point) fails the match and returns `null`. Convention checked
 *  first, per the mandate: `./money.ts` here is a formatter with no parser
 *  of its own; the two ACTUAL sibling parsers this file's own header names —
 *  `lib/registers/money.ts`'s `parseAmountToCents` and
 *  `lib/bank/money.ts`'s `parseAmountToCents` — do NOT refuse commas
 *  entirely; both still blanket-strip them (`input.replace(/,/g, "")`)
 *  exactly as this function did before this fix, so they carry the SAME
 *  latent 100x-on-decimal-comma bug. There is therefore no
 *  "refuses-commas-entirely" convention to match on this codebase today, so
 *  this function instead implements the strict-grouping rule the finding
 *  mandates, scoped to this one governance-critical write surface — the
 *  siblings are out of scope for this fix round. */
export function parseThresholdAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const m = /^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!m) return null;
  const [, wholeRaw = "0", frac = ""] = m;
  const whole = wholeRaw.replace(/,/g, "");
  const fracPadded = (frac + "00").slice(0, 2);
  const cents = BigInt(whole) * 100n + BigInt(fracPadded);
  if (cents <= 0n) return null;
  return Number(cents);
}
