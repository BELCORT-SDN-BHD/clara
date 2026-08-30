// IDENTITY — the doors that mint a person into the estate, plus the ONE read
// that proves they landed. P4-1 creates this module with `accept_invite` only;
// P4-3 extends it with `claim_identity` and `request_firm_registration`
// (fe-train-plan-2026-08-30-orders-p4.md, P4-3's file list names this path).
//
// WHY THIS MODULE EXISTS AT ALL — the defect P4-1 repairs. Before this train,
// `components/invite-accept-form.tsx` verified the Supabase OTP, set a
// password, and redirected. It never called a Clara door. But
// `clara.accept_invite` (live body `0145:694`) is the ONLY caller of
// `_claim_identity_core` and `_add_member_core` — the only path in the estate
// that mints a `clara.users` row and a `firm_memberships` row for a real
// person. So an invitee got a valid Supabase session, no user row, no
// membership, an invite still `pending`, `clara.jwt_firm()` NULL — and a
// success redirect. Every RLS read then returned zero rows and every governed
// write raised CLR04. The UI reported success for a journey that completed
// nothing.
//
// THE DOOR, censused at its LIVE body (rung 0, never a migration's first
// CREATE). `clara.accept_invite(p_token text, p_display_name text, p_op_key
// text) returns jsonb`. First created `0141:407`; CREATE OR REPLACE'd at
// `0145:694`, which is the live body. `0147` mentions it in four comments
// (`:27`, `:59`, `:108`, `:466`) and replaces NEITHER — it replaced
// `invite_member` (`0147:372`) and `create_firm` (`0147:497`) only, so this
// door's live body is `0145`'s.
//
// Its refusals, in the order the body raises them, each rendered VERBATIM by
// the caller (never re-worded, never retried — lib/doors.ts's contract):
//   CLR04  'no authenticated actor'                                  (:699)
//   CLR10  'op_key is required'                                      (:700)
//   CLR10  'a token is required'                                     (:701)
//   CLR10  'invalid invite token'                                    (:704)
//   CLR04  'the signed-in email does not match this invite'          (:708)
//   CLR04  'invite exceeds the issuer''s rank -- re-issue by an owner' (:719)
//   CLR09  'this invite is no longer open (status: %)'               (:741)
//   CLR09  'this invite has expired'                                 (:749)
// plus whatever `_reserve_op` (`0004:56-58`, 'op_key reused with different
// args'), `_claim_identity_core` and `_add_member_core` raise beneath it.
//
// *** SCOPE NOTE, reported to the lead rather than worked around (order §0.2).
// The `:719` issuer-rank refusal is a FIFTH real branch the order's own list
// does not name — it was added by 0145's F2 round-2 fix. It is listed here
// because the census governs, and the surface renders it like any other: the
// DB's own message, verbatim. No client-side copy of any refusal exists. ***
//
// THE EMAIL IS NEVER AN ARGUMENT. `accept_invite` reads it from the verified
// JWT claim inside the door (`clara._jwt_email()`, `0141:152`) and walls the
// acceptance on it equalling the invite's own email (`:707-709`). That is the
// second, independent wall on top of Supabase's `verifyOtp` binding, and it is
// the reason a leaked token cannot be bound to another account. Nothing in
// this module accepts, forwards or even names an email.

import { callDoor, type CallDoorOptions } from "../doors";
import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

/** What `accept_invite` resolves to — `_finish_op`'s persisted receipt
 *  (`0145:757-758`): `{user_id, firm_id, membership_id}`. Every field is
 *  optional here on purpose: this is a REPORT of what the DB did, and
 *  hydrate-never-trust (apps/web/AGENTS.md) forbids painting it as state. The
 *  caller re-reads `callerContext()` below to learn whether a membership
 *  actually exists — it never trusts these ids for that. */
export type AcceptInviteReceipt = {
  user_id?: string;
  firm_id?: string;
  membership_id?: string;
};

export type AcceptInviteArgs = {
  /** CLARA's own invite token — the 64-hex-char secret `invite_member` mints
   *  at `0147:404` and hands to its caller exactly once, above persistence.
   *  This is NOT the Supabase `token_hash` in the `/invite/[token]` path
   *  segment: that one is Supabase's, consumed by `verifyOtp`, and
   *  `sha256()`-ing it would never match `firm_invites.token_hash`. The two
   *  secrets are independent and both are required to complete an
   *  acceptance — see components/invite-accept-form.tsx's own header for the
   *  open question about how they travel together in one URL. */
  token: string;
  displayName: string;
  /** Minted by the CALLER and held stable across a retry of the SAME attempt,
   *  so a transport failure after the DB already committed replays the cached
   *  receipt (`_reserve_op`'s dedupe branch) instead of hitting the CLR09
   *  "no longer open (status: accepted)" dead end that a fresh key would
   *  produce for someone who IS by then a member. The door's request hash
   *  binds token + display name + actor (`0145:730-731`), so a retry that
   *  changed the display name must carry a FRESH key — the caller re-mints on
   *  exactly that change. */
  opKey: string;
};

/** `clara.accept_invite` — ONE transaction through both cores: it mints the
 *  `clara.users` row, mints the `firm_memberships` row, and consumes the
 *  invite. A governed act: its `DoorRefusal` propagates untouched for the
 *  caller to render verbatim, and this module offers no retry of its own. */
export async function acceptInvite(
  args: AcceptInviteArgs,
  opts: CallDoorOptions = {},
): Promise<AcceptInviteReceipt> {
  const out = await callDoor(
    "accept_invite",
    { p_token: args.token, p_display_name: args.displayName, p_op_key: args.opKey },
    opts,
  );
  return (out ?? {}) as AcceptInviteReceipt;
}

// ---------------------------------------------------------------------------
// A READ, NOT A DOOR — labelled as such at its definition, per apps/web/AGENTS.md.
//
// *** P4-2 OWNS THE CANONICAL HOME. Its order creates
// `apps/web/lib/firm/caller-context.ts` as "the typed read + its wire-shape
// pin", and `lib/require-firm-scope.ts` as THE one check over it. P4-1 merges
// FIRST and needs this read to prove its own post-condition, so the minimal
// projection lives here for now. P4-2 should FOLD this into its module and
// repoint this import — one implementation, not two. Named loudly so the fold
// is a deliberate step rather than a duplicate nobody notices. ***
// ---------------------------------------------------------------------------

/** `clara.caller_context` (`0141:544`) — a `security_barrier` view over
 *  `firm_memberships`, scoped by `m.user_id = clara.jwt_sub() and m.status =
 *  'active'`, granted SELECT to `clara_authenticated` (`0141:597`).
 *
 *  SCOPED BY `jwt_sub()`, NOT `jwt_firm()` — and that is what makes it usable
 *  here. A person who has just accepted an invite still holds the access token
 *  they arrived with, minted BEFORE any membership existed, so its firm claim
 *  is empty and every `jwt_firm()`-scoped relation returns zero rows for them.
 *  This view does not read that claim at all, so it reports the freshly-minted
 *  membership on the very same token. `uq_membership_active_user` is what makes
 *  "at most one row" a DB guarantee rather than an observation. */
export type CallerContext = {
  user_id: string;
  firm_id: string;
  firm_name: string;
  role: string;
  role_rank: number;
  is_operator: boolean;
};

const CALLER_CONTEXT_COLUMNS = "user_id,firm_id,firm_name,role,role_rank,is_operator";

/** Reads the caller's own membership context. Resolves the single row when one
 *  exists and `null` when none does — zero rows is a legitimate state (no
 *  membership yet), never an error to invent a request around. A FAILED read
 *  throws: the caller decides, and every caller here takes the fail-closed
 *  branch, because absence is not evidence (review law 2). */
export async function callerContext(
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<CallerContext | null> {
  const rows = await getRows<CallerContext>("caller_context", {
    select: CALLER_CONTEXT_COLUMNS,
    limit: 1,
    session: opts.session,
    signal: opts.signal,
  });
  return rows[0] ?? null;
}
