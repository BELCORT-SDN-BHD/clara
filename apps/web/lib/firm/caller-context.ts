// clara.caller_context — the typed read behind the scope spine, plus the
// wire-shape pin that keeps this projection tied to the DB's own declaration.
//
// RUNG-0 CENSUS, at the LIVE body (apps/web/AGENTS.md: "a migration citation must
// chase the LIVE body — never cite a migration's first CREATE without checking
// what superseded it"). Censused 2026-08-30 across every file in
// packages/db/migrations/: exactly ONE `create view clara.caller_context` exists,
// at `0141_p4_tranche1_invite_rbac.sql:544`, and NO later migration (0142…0155,
// the repo frontier) carries a `create or replace view` for it. `0144` names it
// only inside two census lists. So 0141:544 IS the live body:
//
//   create view clara.caller_context with (security_barrier) as
//     select m.user_id, m.firm_id, f.name as firm_name, m.role,
//            clara.role_rank(m.role) as role_rank, f.is_operator
//     from clara.firm_memberships m
//     join clara.firms f on f.id = m.firm_id
//     where m.user_id = clara.jwt_sub() and m.status = 'active';
//
//   - SCOPE: self only. The predicate takes no argument, so no tenant probe is
//     possible — a caller cannot ask about anyone else (0141:541-543).
//   - CARDINALITY: 0 or 1. `uq_membership_active_user` (0002:221-222 — a partial
//     unique index on `user_id` where `status = 'active'`) is what makes "at most
//     one" a DB GUARANTEE rather than an observation. Zero rows is the holding
//     state's own trigger and the design's fail-closed default (design §4 E).
//   - GRANT: `select` to `clara_authenticated` (0141:597). No door, no refusal
//     codes — this is a view, so a denied read surfaces as an HTTP failure through
//     lib/read.ts's `ReadError`, never as a `DoorRefusal`.
//   - COLUMN NULLABILITY, read off the base tables rather than assumed:
//       user_id     uuid    NOT NULL (0002:214)
//       firm_id     uuid    NOT NULL (0002:213)
//       firm_name   text    NOT NULL (clara.firms.name, 0002:201) — the join is
//                           inner, so a row here always has its firm
//       role        text    NOT NULL, CHECK in (viewer,bookkeeper,admin,owner)
//                           (0002:215)
//       role_rank   int     NULLABLE IN PRINCIPLE. `clara.role_rank` (0002:326-331)
//                           is `case ... else null end`, so an out-of-ladder role
//                           ranks NULL. Today's CHECK constraint makes that
//                           unreachable — but it is the DB's declared type, and
//                           typing it non-null here would be this module asserting
//                           a guarantee the DB does not give. Consumers compare
//                           fail-closed (`(rank ?? -1) >= n`), mirroring the SQL's
//                           own `coalesce(clara.actor_role_rank(), -1)` idiom.
//       is_operator boolean NOT NULL DEFAULT false (0133:273)

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

/** The relation name as PostgREST exposes it (schema `clara` comes from
 *  `Accept-Profile`, which lib/wire.ts sets — never spelled into the path). */
export const CALLER_CONTEXT_RELATION = "caller_context";

/**
 * THE WIRE-SHAPE PIN. Six columns, in the DB's own ordinal order.
 *
 * This is not a convenience list: `0141:658` registers the view's column contract
 * in the migration's own tail census as
 *
 *     ('caller_context', 6, 'user_id,firm_id,firm_name,role,role_rank,is_operator')
 *
 * and `CALLER_CONTEXT_SELECT` below is required by
 * `tests/firm-scope-db-pins.test.ts` to equal that declared string BYTE FOR BYTE,
 * parsed out of the migration file rather than retyped. Review law 3 — spelling is
 * not identity: a hand-copied column list that merely LOOKS right is a projection
 * of the contract, not the contract. If the DB's contract ever changes, that test
 * goes red here rather than the app silently selecting a column the view stopped
 * publishing (PostgREST answers an unknown column with a 400, which lib/read.ts
 * classifies `unexpected` — a failure the spine reads as "deny", so a drift would
 * otherwise present as every member being redirected to the holding page).
 */
export const CALLER_CONTEXT_COLUMNS = [
  "user_id",
  "firm_id",
  "firm_name",
  "role",
  "role_rank",
  "is_operator",
] as const;

export const CALLER_CONTEXT_SELECT = CALLER_CONTEXT_COLUMNS.join(",");

/** One row of `clara.caller_context`. Nullability copied from the base tables —
 *  see this file's header census for the per-column provenance. */
export type CallerContextRow = {
  user_id: string;
  firm_id: string;
  firm_name: string;
  role: string;
  role_rank: number | null;
  is_operator: boolean;
};

/**
 * The four roles `clara.firm_memberships.role` admits — its CHECK constraint,
 * verbatim and in ladder order (`0002:215`, `check (role in ('viewer',
 * 'bookkeeper','admin','owner'))`). `tests/firm-scope-db-pins.test.ts` parses
 * that constraint out of the migration and requires this list to match it as a
 * SET, so the wall below cannot drift from the DB's own vocabulary in silence.
 *
 * A role outside this list is refused rather than granted. That is deliberate and
 * it has a cost worth naming: if the estate ever adds a fifth role, every member
 * holding it is denied until this list moves. The cross-check is what makes that a
 * RED test in the same PR as the migration rather than a support ticket — and the
 * alternative (granting on an unknown role) would hand firm scope to a principal
 * whose rank `clara.role_rank` cannot even order (`0002:326-331` returns NULL for
 * anything off the ladder).
 */
export const FIRM_ROLES = ["viewer", "bookkeeper", "admin", "owner"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Does this value carry EVERY column of the pinned projection, each of the type
 * the view declares?
 *
 * All six are checked, not the four the scope spine happens to read (Codex review
 * of #451, MEDIUM-2). A row missing `firm_name` and `is_operator`, or carrying the
 * STRING `"true"` where a boolean belongs, used to pass validation and then be
 * handed onward as a trusted `CallerContextRow` — a lie the type system could not
 * see through, because the value was cast on the way in from the wire. A partial
 * validator is worse than none: it launders an unvalidated field behind a checked
 * one.
 *
 * `role_rank` admits `null` because the DB genuinely permits it (see the header
 * census); everything else is required. Integers only — `role_rank` is `int` in
 * Postgres, so a float or a NaN arriving here means the body is not what the view
 * returns.
 */
export function isCallerContextRow(row: unknown): row is CallerContextRow {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  if (typeof r.user_id !== "string" || !UUID_RE.test(r.user_id)) return false;
  if (typeof r.firm_id !== "string" || !UUID_RE.test(r.firm_id)) return false;
  if (typeof r.firm_name !== "string" || r.firm_name.length === 0) return false;
  if (typeof r.role !== "string") return false;
  if (!(FIRM_ROLES as readonly string[]).includes(r.role)) return false;
  if (r.role_rank !== null && !Number.isInteger(r.role_rank)) return false;
  if (typeof r.is_operator !== "boolean") return false;
  return true;
}

/**
 * Read the caller's own context. Returns the rows VERBATIM — zero, one, or (a
 * structural surprise the DB's unique index says cannot happen) more. This module
 * deliberately does NOT collapse that to `Row | null`: "zero rows" and "more than
 * one row" are different facts, and the scope spine renders them as different
 * denials. Folding them here would delete the distinction before the one caller
 * that cares ever sees it.
 *
 * `limit: 2` bounds the payload while still letting a >1 result be OBSERVED rather
 * than silently truncated to the first row — the fail-closed reading of
 * `uq_membership_active_user`: trust the index, but prove it on every read.
 */
export function loadCallerContext(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<CallerContextRow[]> {
  return getRows<CallerContextRow>(CALLER_CONTEXT_RELATION, {
    select: CALLER_CONTEXT_SELECT,
    limit: 2,
    session,
    signal,
  });
}
