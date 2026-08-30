// The operator approval queue's own doors and read — EXTENDS
// lib/registration/reads.ts (P4-2's SELF-scope module for the holding
// state): this file imports that module's relation name, column pin and row
// type rather than re-declaring them, and adds the two governed acts plus
// the OPERATOR-scope queue read design §4 B / §5 ask 8 describe. P4-2's file
// is not edited — its wire-shape pin stays that module's own to own.
//
// RUNG-0 CENSUS, at the LIVE bodies (apps/web/AGENTS.md: "a migration
// citation must chase the LIVE body"). Censused 2026-08-30 across every file
// in packages/db/migrations/: `approve_firm_registration`,
// `reject_firm_registration` and `firm_registration_requests_visible` are
// each declared exactly ONCE, all three in
// `0145_p4_tranche2_registration_operator_alias.sql`, and NO later migration
// (0146…0155, the repo frontier) carries a `create or replace` for any of
// them — 0144 and 0147 each name them only in prose comments (a negative
// search, recorded rather than assumed).
//
//   clara.approve_firm_registration(p_request uuid, p_op_key text) → jsonb
//     0145:766-830.
//   clara.reject_firm_registration(p_request uuid, p_reason text,
//     p_op_key text) → jsonb                                        0145:832-876.
//
// AUTHORITY (both doors, byte-identical fragment, 0145:782/839 — the SAME
// literal substring the view's own OPERATOR arm repeats, 0145:895-897):
// `_human_ctx(role_rank('owner'))` AND `exists(select 1 from clara.firms f
// where f.id = jwt_firm() and f.is_operator)` — copying
// `set_wake_source_enabled` (0133:288-291) exactly. `uq_firms_one_operator`
// (0133:274) makes this single-tenant by construction: at most one firm in
// the estate ever carries `is_operator`.
//
// REFUSALS, both doors, in the order the live body checks them:
//   - CLR04 "insufficient role" — the caller is not owner+ in an
//     `is_operator` firm. THE authority wall; never pre-empted here.
//   - CLR10 "op_key is required" — cannot fire in practice, the caller
//     (registrations-queue.tsx) always supplies one (its own per-request
//     cache, never blank — see the FOLD note on each wrapper below).
//   - CLR10 "unknown registration request" — `p_request` does not exist.
//   - CLR04 "cannot decide your own registration request" — the F7
//     self-decision wall (0145:794-801/856-860): an operator may never
//     approve OR reject a request THEY filed. Defensive-in-depth; the
//     ordinary operator console user never triggers it.
//   - CLR09 "this request is no longer open (status: %)" — a second
//     operator (or a second click) raced the row's own `FOR UPDATE` lock.
//   - reject ONLY: CLR10 "a rejection reason is required" — the DB is the
//     wall on CONTENT here (0145:843-848, adopted from the Mobbin
//     grounding's own §2 takeaway 3), never only this module's UI-side
//     `confirmDisabled` gate.
//   - approve ONLY, surfacing FROM `_create_firm_core` (0145:463, entered
//     with the REQUEST'S APPLICANT as the actor, never the operator —
//     0145:806-810): CLR04 "unknown actor" / CLR04 the agent-identity wall
//     (structurally unreachable — an applicant is never the fixed agent
//     identity) / CLR10 the already-active-membership wall (the applicant
//     joined a firm by some OTHER path since requesting) / CLR10 a blank
//     name. `callDoor` renders every one of these VERBATIM regardless of
//     which layer raised it — no special-casing needed here.
//
// RETURN SHAPES, read off `_finish_op` (0004:62-68 — returns its
// `p_result` argument VERBATIM, no envelope):
//   approve → { request_id: uuid, firm_id: uuid, plan_id: uuid }
//     (0145:828-829). `plan_id` is the onboarding plan `_create_firm_core`
//     opens alongside the firm (0145:445, "the core must preserve
//     everything the LIVE 0017 body does, including opening the
//     onboarding_plans firm-scope plan") — rendered as the approval
//     receipt below, never silently dropped.
//   reject → { request_id: uuid, status: "rejected" } (0145:874-875).
//
// THE OPERATOR QUEUE READ is NOT a second door — it is the SAME view P4-2
// already pinned (`firm_registration_requests_visible`, 0145:911-920),
// queried WITHOUT the `applicant` filter `loadRegistrationRequestsForApplicant`
// applies. That is deliberate, not an oversight: the view's own OPERATOR arm
// (0145:891-897, `actor_role_rank() >= role_rank('owner') AND <the caller's
// firm is_operator>`) is what turns an unfiltered read into "every open
// request in the estate" for an operator, and into "nothing new" for
// anyone else (a non-operator's own SELF-scope rows only, if any — never
// another applicant's row; the view's WHERE clause is the real wall, this
// module's own `isOperatorConsoleEligible` gate below is affordance, not
// the boundary). Filtered here to `status=eq.open` — the queue is WORK TO
// DO, not a history; a decided row still lives in the same relation but has
// nothing left for this screen to act on.
//
// A GENUINE GAP, reported rather than worked around (scope note, apps/web/
// AGENTS.md §0.2): there is no display-name resolution for `applicant` on
// this screen. `clara.users_visible` (0137:291-298) — the estate's one
// name-resolution view — requires the target share the CALLER'S OWN CURRENT
// firm (`fm.firm_id = jwt_firm()`); a pre-membership applicant has no
// membership row anywhere, let alone one in the operator's firm, so an
// operator's own `users_visible` read for that id returns ZERO rows by
// construction, not by a bug. The queue therefore renders the REQUESTED
// firm name (`firm_name` — the column an operator actually decides on) as
// the primary identifier, and the applicant's id via the same `shortId()`
// truncation `vendor-binding-ceremony.tsx` already uses for an unresolvable
// actor id — an honest absence, never a fabricated name.

import { getRows } from "../read";
import { callDoor } from "../doors";
import {
  REGISTRATION_REQUESTS_RELATION,
  REGISTRATION_REQUESTS_SELECT,
  type RegistrationRequestRow,
} from "./reads";
import type { CallerContextRow } from "@/lib/firm/caller-context";
import type { SessionTokenAccessor } from "@/lib/session";

// FOLD (P4-2's nit round, cc82d182): the relation name/select string used to
// be DUPLICATED here because value-importing anything from "./reads" used
// to drag `next/headers` into this "use client"-reachable module's bundle
// (that file's OWN `loadOwnRegistrationRequests` pulled it in transitively).
// P4-2 has since split the server-only half into `./server-reads.ts` and
// marked this module "ISOMORPHIC BY CONSTRUCTION" (its own header,
// `tests/firm-scope-db-pins.test.ts` walks the import graph and reds if
// `next/headers` ever reappears) — so the plain value-import above is safe
// again, and the duplicate-plus-cross-check this file used to carry is
// gone: one declaration, one owner (`./reads.ts`), exactly the DRY this
// workaround only ever gave up under duress. `doors.test.ts` no longer
// needs the byte-equality cross-check for the same reason.

/** The open queue, oldest first (FIFO — the operator works through it in the
 *  order applicants arrived), unfiltered by applicant so the view's own
 *  OPERATOR arm is what decides how much comes back. See this file's header
 *  for why "unfiltered" is the correct read here, the mirror image of
 *  `loadRegistrationRequestsForApplicant`'s own explicit self-filter. */
export function loadOperatorRegistrationQueue(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<RegistrationRequestRow[]> {
  return getRows<RegistrationRequestRow>(REGISTRATION_REQUESTS_RELATION, {
    select: REGISTRATION_REQUESTS_SELECT,
    filters: { status: "eq.open" },
    order: "created_at.asc",
    session,
    signal,
  });
}

/** `clara.approve_firm_registration` — the RPC's own verbatim return, per
 *  this file's header. `callDoor` throws `DoorRefusal` for every CLR
 *  refusal listed above; this module never inspects or narrows it.
 *
 *  FOLD (Codex HIGH-1, independent review on #453): `opKey` is now
 *  CALLER-OWNED, never minted in here. `_reserve_op`'s own replay contract
 *  (0004:46-60) is keyed on `(firm, fn, op_key)` and re-hashes `{request,
 *  actor}` (0145:788-789) — a FRESH random key on every call is exactly what
 *  defeats that contract: if the first attempt actually committed but its
 *  HTTP response was lost, a retry minting a NEW key never finds the old
 *  receipt; it re-enters the door body fresh, the request is no longer
 *  'open', and the retry gets a spurious CLR09 instead of the original
 *  `{firm_id, plan_id}` replaying. The caller (registrations-queue.tsx) now
 *  holds ONE key per request until the mandatory re-read proves the row
 *  left the open queue — see that file's own header. */
export function approveFirmRegistration(
  session: SessionTokenAccessor,
  requestId: string,
  opKey: string,
): Promise<{ request_id: string; firm_id: string; plan_id: string }> {
  return callDoor(
    "approve_firm_registration",
    { p_request: requestId, p_op_key: opKey },
    { session },
  );
}

/** `clara.reject_firm_registration` — `reason` is required by the DB
 *  (0145:843-848); this module's own dialog additionally disables its
 *  Confirm button on an empty reason (Mobbin grounding §2 takeaway 3), but
 *  that UI gate is a courtesy — the trimmed string still travels here
 *  untouched, and a caller that bypassed the dialog gets the SAME CLR10 the
 *  DB would give anyone else.
 *
 *  FOLD (Codex HIGH-1): `opKey` is CALLER-OWNED, same reasoning as
 *  `approveFirmRegistration` above — reject's own hash additionally binds
 *  `reason` (0145:850-851), so the caller keys its cache on `(request,
 *  normalized reason)`: the SAME key replays a retry of the SAME reason, and
 *  a genuinely EDITED reason correctly mints a fresh key rather than hitting
 *  `_reserve_op`'s "op_key reused with different args" CLR10. */
export function rejectFirmRegistration(
  session: SessionTokenAccessor,
  requestId: string,
  reason: string,
  opKey: string,
): Promise<{ request_id: string; status: string }> {
  return callDoor(
    "reject_firm_registration",
    { p_request: requestId, p_reason: reason, p_op_key: opKey },
    { session },
  );
}

/** The rank the doors themselves require (`clara.role_rank('owner')`,
 *  0002:326-331 — viewer 0 < bookkeeper 1 < admin 2 < owner 3). A named
 *  constant rather than a bare `3` so a reader can trace it back to the
 *  ladder without re-deriving it. */
const OWNER_RANK = 3;

/**
 * AFFORDANCE, NOT THE WALL (design §4 D: "Neither is a security boundary —
 * `_human_ctx` is"). This mirrors, client-side, the EXACT predicate
 * `approve_firm_registration`/`reject_firm_registration`/the view's own
 * OPERATOR arm enforce in the DB (0145:782/839/891-897) — owner rank AND
 * the caller's OWN firm carrying `is_operator`. Getting this wrong in
 * EITHER direction costs nothing real: a false "eligible" still meets the
 * DB's own CLR04 on the first click; a false "ineligible" only hides a
 * screen the DB would have refused anyway. Exported so a later surface
 * (P4-6's nav shaping) can reuse the identical predicate rather than grow a
 * second, driftable copy of it.
 */
export function isOperatorConsoleEligible(
  ctx: Pick<CallerContextRow, "is_operator" | "role_rank">,
): boolean {
  return ctx.is_operator === true && (ctx.role_rank ?? -1) >= OWNER_RANK;
}
