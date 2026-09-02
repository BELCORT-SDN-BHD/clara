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
