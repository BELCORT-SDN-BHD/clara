// THE ONE `clara.caller_context` read, and the ONE shape guard over it.
//
// Extracted from lib/parts/thread-action-coordinator.tsx (which now imports it) so the
// ⌘K "Do" allowlist and the thread coordinator ask the SAME question of the SAME relation
// through the SAME predicate. Two independently-typed copies of an identity guard is
// exactly the "spelling is not identity" / no-second-implementation failure AGENTS.md's
// review laws exist to catch: one copy widens, the other does not, and the surface that
// widened is the one that grants an act.
//
// THE RELATION, at its live body. `clara.caller_context` is created at
// packages/db/migrations/0141_p4_tranche1_invite_rbac.sql:544 (`with (security_barrier)`;
// 0144 re-asserts the barrier, no body change) and granted SELECT to `clara_authenticated`
// at 0141:598. Its predicate is `m.user_id = clara.jwt_sub() and m.status = 'active'` —
// SELF-SCOPED with no argument, so no tenant probe is possible, and
// `uq_membership_active_user` is what makes "at most one row" a DB guarantee rather than
// an observation (0141:541-543's own comment).
//
// EXACT-ONE, NOT `rows[0]`. `limit=2` keeps an ambiguous context OBSERVABLE instead of
// truncating it into a false certainty; two rows resolve to `null` (no identity admitted),
// never to the first one. Zero rows is the holding state's own fail-closed default — a
// caller with no active membership holds no role, so every rank comparison built on this
// returns false.

import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";

export const CALLER_CONTEXT_SELECT = "user_id,firm_id,firm_name,role,role_rank,is_operator";

/** `clara.firm_memberships.role`'s own CHECK vocabulary, ascending by
 *  `clara.role_rank` (0002 foundation: viewer 0, bookkeeper 1, admin 2, owner 3). The
 *  ORDER is load-bearing — `roleRankOf` reads the index — so this is one array, not two. */
export const FIRM_ROLES = ["viewer", "bookkeeper", "admin", "owner"] as const;
export type FirmRole = (typeof FIRM_ROLES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CallerContextRow = {
  user_id: string;
  firm_id: string;
  firm_name: string;
  role: string;
  role_rank: number | null;
  is_operator: boolean;
};

export function isCallerContextRow(value: unknown): value is CallerContextRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.user_id === "string"
    && UUID_RE.test(v.user_id)
    && typeof v.firm_id === "string"
    && UUID_RE.test(v.firm_id)
    && typeof v.firm_name === "string"
    && v.firm_name.length > 0
    && typeof v.role === "string"
    && (FIRM_ROLES as readonly string[]).includes(v.role)
    && (v.role_rank === null || Number.isInteger(v.role_rank))
    && typeof v.is_operator === "boolean"
  );
}

/** The raw read. `limit: 2` is load-bearing — see this module's header. */
export function loadCallerContextRows(session: SessionTokenAccessor): Promise<CallerContextRow[]> {
  return getRows<CallerContextRow>("caller_context", {
    select: CALLER_CONTEXT_SELECT,
    limit: 2,
    session,
  });
}

/** Exactly one fully-shaped row, or `null`. Zero rows, two rows, or a row whose shape the
 *  guard does not admit all resolve to `null` — the fail-closed arm. */
export function exactlyOneCallerContext(rows: readonly unknown[]): CallerContextRow | null {
  if (rows.length !== 1) return null;
  const row = rows[0];
  return isCallerContextRow(row) ? row : null;
}

export async function loadCallerContext(session: SessionTokenAccessor): Promise<CallerContextRow | null> {
  return exactlyOneCallerContext(await loadCallerContextRows(session));
}

/** `clara.role_rank`'s own ladder, as an index into FIRM_ROLES. */
export function roleRankOf(role: FirmRole): number {
  return FIRM_ROLES.indexOf(role);
}

/**
 * Does this live context meet a floor?
 *
 * THE RANK COMES FROM THE DATABASE, NOT FROM THE ROLE NAME. `role_rank` is
 * `clara.role_rank(m.role)` computed inside the view (0141:549) — the DB's own answer.
 * `role` is only the projection of it; re-deriving a rank from the SPELLING here would be
 * a second, drifting copy of `clara.role_rank` (review law 3: spelling is not identity),
 * so a row whose `role_rank` is NULL meets NO floor even if its `role` reads "owner".
 */
export function meetsFloor(ctx: CallerContextRow | null, floor: FirmRole): boolean {
  if (ctx === null) return false;
  if (ctx.role_rank === null) return false;
  return ctx.role_rank >= roleRankOf(floor);
}
