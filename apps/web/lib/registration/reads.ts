// clara.firm_registration_requests_visible — the SELF-scope read behind the
// holding state (design §4 E). P4-3 renders it on /pending; P4-5 extends this
// module with the operator queue's own doors.
//
// RUNG-0 CENSUS, at the LIVE body. Censused 2026-08-30 across every file in
// packages/db/migrations/: exactly ONE `create view
// clara.firm_registration_requests_visible` exists, at
// `0145_p4_tranche2_registration_operator_alias.sql:911`, and no later migration
// (0146…0155, the repo frontier) replaces it.
//
//   create view clara.firm_registration_requests_visible with (security_barrier) as
//     select r.id, r.applicant, r.firm_name, r.note, r.status,
//            case when <operator scope> then r.decided_by else null end as decided_by,
//            r.decided_at, r.reason, r.firm_id, r.created_at
//     from clara.firm_registration_requests r
//     where r.applicant = clara.jwt_sub()
//        or <operator scope>;
//
//   - TWO SCOPES IN ONE VIEW. `applicant = clara.jwt_sub()` (SELF) OR owner-rank
//     AND the caller's firm carrying `is_operator` (OPERATOR, 0145:919-920). That
//     disjunction is why the read below FILTERS BY APPLICANT rather than relying
//     on the view alone: for a holding-state caller the operator arm can never
//     fire (they hold no membership, so `actor_role_rank()` is null), but an
//     operator-firm owner calling an unfiltered "my requests" read would receive
//     THE WHOLE ESTATE'S QUEUE. A self read must be self-scoped by its own
//     construction, not by an accident of who happens to call it.
//   - `decided_by` IS NULL OUTSIDE THE OPERATOR SCOPE, BY DESIGN (F11, 0145:905-909
//     — "the SELF scope needs status/reason/timestamps to render §4 E's holding
//     state; it never needed the deciding operator's own identity"). Render its
//     absence honestly; NEVER infer an operator from it, and never read a
//     non-null `decided_by` as proof the caller is one.
//   - GRANT: `select` to `clara_authenticated` (0145:1004). A view, not a door —
//     a denied read surfaces as lib/read.ts's `ReadError`, never a `DoorRefusal`.
//   - STATUS VALUES ARE 'open' | 'approved' | 'rejected' (the base table's CHECK,
//     0145:330) — NOT 'pending'. The plan and design both call the holding state
//     "pending"; that is the human name for the SCREEN, and `open` is the DB's
//     name for the ROW. Reported to the lead as a scope note rather than
//     reconciled here: this module renders the DB's value, and the copy layer
//     (P4-3's) is where a human word belongs.
//   - CARDINALITY: at most one `open` row per applicant
//     (`uq_firm_registration_requests_open_applicant`, 0145:340-341), but decided
//     rows accumulate — a rejected applicant who requests again has two. So this
//     read returns a LIST, newest first, and never pretends there is exactly one.
//   - COLUMN NULLABILITY, off the base table (0145:324-336): `note`, `decided_by`,
//     `decided_at`, `reason` and `firm_id` are nullable; `id`, `applicant`,
//     `firm_name`, `status` and `created_at` are NOT NULL.

import { getRows } from "../read";
import {
  serverCallerSubject,
  serverSessionTokenAccessor,
} from "@/lib/supabase/server-session";
import type { SessionTokenAccessor } from "@/lib/session";

export const REGISTRATION_REQUESTS_RELATION =
  "firm_registration_requests_visible";

/**
 * THE WIRE-SHAPE PIN. Ten columns, in the DB's own ordinal order.
 *
 * `0145:1062` registers the view's column contract in the migration's own tail
 * census as
 *
 *     ('firm_registration_requests_visible', 10,
 *      'id,applicant,firm_name,note,status,decided_by,decided_at,reason,firm_id,created_at')
 *
 * and `tests/require-firm-scope.test.ts` requires `REGISTRATION_REQUESTS_SELECT`
 * to equal that declared string byte for byte, parsed out of the migration rather
 * than retyped (review law 3 — spelling is not identity).
 */
export const REGISTRATION_REQUEST_COLUMNS = [
  "id",
  "applicant",
  "firm_name",
  "note",
  "status",
  "decided_by",
  "decided_at",
  "reason",
  "firm_id",
  "created_at",
] as const;

export const REGISTRATION_REQUESTS_SELECT =
  REGISTRATION_REQUEST_COLUMNS.join(",");

/** The three statuses the base table's CHECK admits (0145:330). Widened to
 *  `string` so an added value renders as itself rather than crashing a consumer —
 *  the UI's job is to be honest about what the DB said, not to assume it knows
 *  every value. */
export type RegistrationRequestStatus =
  | "open"
  | "approved"
  | "rejected"
  | (string & {});

/** One row of `clara.firm_registration_requests_visible`. */
export type RegistrationRequestRow = {
  id: string;
  applicant: string;
  firm_name: string;
  note: string | null;
  status: RegistrationRequestStatus;
  /** NULL outside the operator scope BY DESIGN (F11). An absent value here means
   *  "you are not an operator", never "nobody decided". */
  decided_by: string | null;
  decided_at: string | null;
  reason: string | null;
  firm_id: string | null;
  created_at: string;
};

/**
 * The applicant's own requests, newest first — explicitly scoped to `applicant`.
 *
 * The filter is a SECOND expression of the view's own SELF predicate, not a
 * substitute for it: the view still enforces `applicant = clara.jwt_sub()`, so a
 * caller who passes someone else's id gets zero rows rather than their data. What
 * the filter buys is the operator case (see the header) — it keeps a "my
 * requests" read self-scoped even for the one caller the view would otherwise
 * hand the whole queue.
 */
export function loadRegistrationRequestsForApplicant(
  session: SessionTokenAccessor,
  applicant: string,
  signal?: AbortSignal,
): Promise<RegistrationRequestRow[]> {
  return getRows<RegistrationRequestRow>(REGISTRATION_REQUESTS_RELATION, {
    select: REGISTRATION_REQUESTS_SELECT,
    filters: { applicant: `eq.${applicant}` },
    order: "created_at.desc",
    session,
    signal,
  });
}

/** The two server seams `loadOwnRegistrationRequests` resolves the caller through,
 *  injectable so the fail-closed branch can be DRIVEN in a test rather than read
 *  off the source. Production passes nothing and takes both defaults. */
export type OwnRegistrationDeps = {
  readonly subject?: () => Promise<string | null>;
  readonly session?: SessionTokenAccessor;
  readonly signal?: AbortSignal;
};

/**
 * The server-side convenience the holding page uses: resolve the caller's own
 * verified subject, then read their requests.
 *
 * FAIL-CLOSED ON AN ABSENT SUBJECT: with no session — or a `sub` claim that is
 * absent or not a uuid — this returns an EMPTY LIST **without issuing any read at
 * all**. Review law 2: an absent identity is not a licence to widen the query, and
 * an unfiltered read here is precisely the operator-queue leak the header
 * describes. The suite asserts the stronger property — that `fetch` is never
 * reached on this branch — because "returned []" alone would also be true of a
 * request that went out and happened to come back empty.
 *
 * An empty list is NOT the same fact as "no requests" at the render layer — the
 * caller must distinguish loading, empty and error itself (§0.5's three
 * distinguishable states); this function reports only what a read returned.
 */
export async function loadOwnRegistrationRequests(
  deps: OwnRegistrationDeps = {},
): Promise<RegistrationRequestRow[]> {
  const resolveSubject = deps.subject ?? serverCallerSubject;
  const applicant = await resolveSubject();
  if (!applicant) return [];
  return loadRegistrationRequestsForApplicant(
    deps.session ?? serverSessionTokenAccessor,
    applicant,
    deps.signal,
  );
}
