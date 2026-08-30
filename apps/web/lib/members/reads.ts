// MEMBERS — the two masked read surfaces behind /admin/members, plus their
// wire-shape pins.
//
// RUNG-0 CENSUS, at the LIVE body (apps/web/AGENTS.md: "a migration citation
// must chase the LIVE body — never cite a migration's first CREATE without
// checking what superseded it"). Censused 2026-08-30 across every file in
// `packages/db/migrations/`: each of these two views is created EXACTLY ONCE,
// in `0141_p4_tranche1_invite_rbac.sql`, and NO later migration (0142…0155, the
// repo frontier) carries a `create or replace view` for either. `members-reads`
// mechanises that census in `lib/members/members-doors.test.ts` so it re-runs on
// every `pnpm test` rather than being a claim in a comment.
//
// Both are OWNER-EXECUTED views (`0141:490-494`'s own note — the `users_visible`
// idiom, deliberately NOT `security_invoker`, because the whole point is a floor
// and a mask the base table's grant does not carry). Both carry
// `with (security_barrier)`.
//
// ---------------------------------------------------------------------------
// clara.firm_members_visible — the roster (ask 5). LIVE BODY `0141:512`.
// ---------------------------------------------------------------------------
//
//   create view clara.firm_members_visible with (security_barrier) as
//     select m.id as membership_id, m.user_id, u.display_name,
//       case when coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('admin')
//            then u.email else null end as email,
//       m.role, clara.role_rank(m.role) as role_rank, m.status, m.created_at, m.removed_at
//     from clara.firm_memberships m join clara.users u on u.id = m.user_id
//     where m.firm_id = clara.jwt_firm()
//       and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('bookkeeper');
//
//   - FLOOR: bookkeeper+ for the roster itself. Below that the predicate excludes
//     every row, so the read returns ZERO ROWS rather than refusing — a view, not
//     a door, so there is no CLR code here at all.
//   - `email` IS A FLOORED COLUMN, NOT A SECOND VIEW (`0141:509-510`'s own note):
//     one view whose `email` is null-masked below admin+, "so a caller cannot
//     mistake which they hold".
//   - THE NULL EMAIL IS AMBIGUOUS, AND THIS MODULE REFUSES TO GUESS. `clara.users.email`
//     is NULLABLE (`0002:194` — `email text unique`, no NOT NULL), and the agent
//     identity is a real member row with no email. So `email === null` means
//     EITHER "masked below admin+" OR "this member genuinely has none on file",
//     and nothing on the wire distinguishes them. Review law 2: a derived state is
//     not evidence. The surface therefore renders the ABSENCE and names both
//     causes (`components/admin/members-panel.tsx`'s `RosterTable`, and the
//     `Members.roster.emailNote` sentence under it) — never a blank cell, and
//     never a claim about which cause applied. This citation used to name a
//     members-roster.tsx under components/admin, a file that has never existed
//     in this tree (independent review of #455, LOW-12): the roster table is a
//     module-level component INSIDE the panel, not a file of its own.
//     `lib/members/members-doors.test.ts` now walks every path these modules
//     cite and reds on one that does not resolve, so the class cannot recur.
//   - NO `firm_id` COLUMN, deliberately: the view is already scoped by
//     `clara.jwt_firm()`, so there is nothing for a caller to filter on and no
//     tenant probe to attempt.
//   - REMOVED MEMBERSHIPS ARE IN SCOPE. The predicate does not filter `m.status`,
//     so removed rows are published with their `removed_at`. This module does not
//     filter them out either: a client-side filter that hides rows the DB
//     published is the UI deciding what the roster is.
//
// ---------------------------------------------------------------------------
// clara.firm_invites_visible — the pending-invite list (ask 6, read half).
// LIVE BODY `0141:532`.
// ---------------------------------------------------------------------------
//
//   create view clara.firm_invites_visible with (security_barrier) as
//     select i.id, i.firm_id, i.email, i.role,
//       case when i.status = 'pending' and i.expires_at <= now() then 'expired' else i.status end as status,
//       i.invited_by, i.created_at, i.expires_at, i.accepted_at, i.revoked_at
//     from clara.firm_invites i
//     where i.firm_id = clara.jwt_firm()
//       and coalesce(clara.actor_role_rank(), -1) >= clara.role_rank('admin');
//
//   - FLOOR: admin+. Below admin the predicate excludes every row, so a
//     bookkeeper's read of this list returns ZERO ROWS — indistinguishable on the
//     wire from "this firm has no invites". The surface states the floor in the
//     section's own description, unconditionally, so an empty list is never read
//     as a claim that none exist.
//   - `token_hash` IS NEVER PUBLISHED. It is not in the projection and this module
//     never names it.
//   - `status` IS EFFECTIVE, COMPUTED LIVE off `expires_at` (`0141:526-529`'s own
//     note): `accept_invite` deliberately never persists a pending→expired
//     transition, because a write immediately before a refusal's RAISE would roll
//     back with it. So a dead invite reads `expired` here even though no row ever
//     transitioned, and the four values a reader can see are pending / expired /
//     accepted / revoked.

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

/** Relation names as PostgREST exposes them — schema `clara` arrives via
 *  `Accept-Profile`, which lib/wire.ts sets; it is never spelled into a path. */
export const FIRM_MEMBERS_RELATION = "firm_members_visible";
export const FIRM_INVITES_RELATION = "firm_invites_visible";

/**
 * THE WIRE-SHAPE PINS. Nine columns and ten, in the DB's own ordinal order.
 *
 * These are not convenience lists. `0141:656-657` registers both column
 * contracts in the migration's own tail census:
 *
 *   ('firm_members_visible', 9, 'membership_id,user_id,display_name,email,role,role_rank,status,created_at,removed_at'),
 *   ('firm_invites_visible', 10, 'id,firm_id,email,role,status,invited_by,created_at,expires_at,accepted_at,revoked_at'),
 *
 * and `lib/members/members-doors.test.ts` requires each `*_SELECT` below to equal
 * its declared string BYTE FOR BYTE, parsed out of the migration file rather than
 * retyped — the same instrument `tests/firm-scope-surfaces.test.ts` already uses
 * for `caller_context`. Review law 3, spelling is not identity: a hand-copied
 * column list that merely LOOKS right is a projection of the contract, not the
 * contract. If the DB's contract changes, that test goes red here rather than the
 * app silently selecting a column the view stopped publishing — PostgREST answers
 * an unknown column with a 400, which lib/read.ts classifies `unexpected`, and the
 * roster would then render an error where a drift belongs in CI.
 */
export const FIRM_MEMBERS_COLUMNS = [
  "membership_id",
  "user_id",
  "display_name",
  "email",
  "role",
  "role_rank",
  "status",
  "created_at",
  "removed_at",
] as const;

export const FIRM_MEMBERS_SELECT = FIRM_MEMBERS_COLUMNS.join(",");

export const FIRM_INVITES_COLUMNS = [
  "id",
  "firm_id",
  "email",
  "role",
  "status",
  "invited_by",
  "created_at",
  "expires_at",
  "accepted_at",
  "revoked_at",
] as const;

export const FIRM_INVITES_SELECT = FIRM_INVITES_COLUMNS.join(",");

/**
 * THE ROLE LADDER, as `clara.role_rank` declares it (`0002:326-331`):
 * `viewer 0 < bookkeeper 1 < admin 2 < owner 3`, and `else null` for anything
 * outside it.
 *
 * Named here because two surfaces need it — the role menu offers exactly these
 * four, and the affordance shaping compares against `admin`. It is NOT a wall:
 * `clara._human_ctx` and the role-ceiling checks inside `set_member_role` /
 * `invite_member` / `add_member` are, and this module never filters a role out of
 * the menu to pre-empt one (plan §2 rule (b): no wall is pre-empted).
 */
export const ROLE_LADDER = ["viewer", "bookkeeper", "admin", "owner"] as const;
export type MemberRole = (typeof ROLE_LADDER)[number];

/** `clara.role_rank`'s own mapping, transcribed from `0002:328-330`. Returns
 *  `null` for a role outside the ladder, exactly as the SQL's `else null` does —
 *  never a guess, and every consumer compares fail-closed (`(rank ?? -1) >= n`),
 *  mirroring the `coalesce(clara.actor_role_rank(), -1)` idiom the views use. */
export function roleRank(role: string): number | null {
  const i = (ROLE_LADDER as readonly string[]).indexOf(role);
  return i < 0 ? null : i;
}

/** The rank `firm_invites_visible`, `invite_member`, `revoke_invite`,
 *  `set_member_role`, `remove_member` and `add_member` all floor at. */
export const ADMIN_RANK = 2;

/**
 * One row of `clara.firm_members_visible`. Nullability read off the base tables,
 * never assumed:
 *   membership_id uuid        NOT NULL (`firm_memberships.id`, 0002:212 — pkey)
 *   user_id       uuid        NOT NULL (0002:214)
 *   display_name  text        NOT NULL (`clara.users.display_name`, 0002:193)
 *   email         text        NULLABLE — masked below admin+, AND nullable at the
 *                             base table (0002:194). See the header.
 *   role          text        NOT NULL, CHECK in (viewer,bookkeeper,admin,owner)
 *   role_rank     int         NULLABLE IN PRINCIPLE — `clara.role_rank` is
 *                             `case … else null end`, so an out-of-ladder role
 *                             ranks NULL. Today's CHECK makes that unreachable,
 *                             but typing it non-null here would be this module
 *                             asserting a guarantee the DB does not give.
 *   status        text        NOT NULL
 *   created_at    timestamptz NOT NULL
 *   removed_at    timestamptz NULLABLE (null while the membership is active)
 */
export type FirmMemberRow = {
  membership_id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  role: string;
  role_rank: number | null;
  status: string;
  created_at: string;
  removed_at: string | null;
};

/**
 * The roster, oldest membership first. Ordering is done by PostgREST, not
 * re-sorted here: a client-side re-order is one more place the rendered list can
 * disagree with what the DB returned.
 *
 * A read, not a door — no CLR refusal exists on this path. A failed read throws
 * `ReadError` (lib/read.ts) and the panel renders it as an error, distinct from
 * the empty state.
 */
export function loadFirmMembers(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<FirmMemberRow[]> {
  return getRows<FirmMemberRow>(FIRM_MEMBERS_RELATION, {
    select: FIRM_MEMBERS_SELECT,
    order: "created_at.asc",
    session,
    signal,
  });
}

/**
 * One row of `clara.firm_invites_visible`.
 *   id          uuid        NOT NULL (`firm_invites.id`, 0141:176)
 *   firm_id     uuid        NOT NULL (0141:177)
 *   email       text        NOT NULL (0141:178)
 *   role        text        NOT NULL, CHECK in the four ladder roles (0141:179)
 *   status      text        NOT NULL — the EFFECTIVE status (see the header):
 *                           pending / expired / accepted / revoked. The base
 *                           column's own CHECK (0141:181) carries the same four,
 *                           so the view's synthesised `expired` widens no domain.
 *   invited_by  uuid        NOT NULL (0141:182 — `not null references clara.users(id)`)
 *   created_at  timestamptz NOT NULL (0141:184)
 *   expires_at  timestamptz NOT NULL (0141:183)
 *   accepted_at timestamptz NULLABLE (0141:185)
 *   revoked_at  timestamptz NULLABLE (0141:186)
 */
export type FirmInviteRow = {
  id: string;
  firm_id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

/** The invite list, newest first — an invite list is read to answer "did the one
 *  I just sent land?", so the newest row is the one being looked for. */
export function loadFirmInvites(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<FirmInviteRow[]> {
  return getRows<FirmInviteRow>(FIRM_INVITES_RELATION, {
    select: FIRM_INVITES_SELECT,
    order: "created_at.desc",
    session,
    signal,
  });
}

/**
 * THE ONLY INVITE STATUS VALUES THE VIEW CAN PUBLISH, as a closed world — the
 * same lookup discipline components/firm-admin/compliance-register-panel.tsx
 * applies to `state` and `future_method_status`. `pending` and `revoked` and
 * `accepted` come from `firm_invites.status`; `expired` is synthesised by the
 * view's own CASE. Anything outside this set renders as the DB's own raw string
 * rather than being mapped to a label this app invented.
 */
export const INVITE_STATUSES = ["pending", "expired", "accepted", "revoked"] as const;
export type KnownInviteStatus = (typeof INVITE_STATUSES)[number];

export function isKnownInviteStatus(status: string): status is KnownInviteStatus {
  return (INVITE_STATUSES as readonly string[]).includes(status);
}

/** `firm_memberships.status`'s own two values (`0002:216`'s CHECK). Same closed-
 *  world discipline as the invite statuses above. */
export const MEMBERSHIP_STATUSES = ["active", "removed"] as const;
export type KnownMembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function isKnownMembershipStatus(status: string): status is KnownMembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(status);
}
