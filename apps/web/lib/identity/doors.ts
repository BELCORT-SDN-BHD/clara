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

/**
 * THE INVITE LINK'S SECOND SECRET — the query-parameter name Clara's own
 * invite token travels under. **Ruled 2026-08-30 (option (a)):** the invite
 * URL is `/invite/<supabase_token_hash>?ct=<clara_token>`.
 *
 * TWO SECRETS, ONE LINK. The PATH SEGMENT is Supabase's `token_hash`, consumed
 * by `verifyOtp` — P2's shipped contract, byte-untouched by the ruling. This
 * parameter carries CLARA's token: the 64-hex-char secret `clara.invite_member`
 * mints at `0147:404`, stores only as `sha256(token)` in
 * `firm_invites.token_hash`, and hands its caller exactly once above
 * persistence. `accept_invite` re-computes that sha256 over `p_token`
 * (`0145:702`). The two are NOT interchangeable — passing the path segment to
 * the door refuses `CLR10 "invalid invite token"` every time.
 *
 * **Declared here, in ONE file, so both ends import it rather than re-typing
 * the string.** The two ends are `app/invite/[token]/page.tsx` (reads it) and
 * P4-4's courier, `app/api/invite/route.ts` (builds the link). A courier that
 * spelled it `?token=` would ship an invite nobody can accept, and nothing
 * would fail until a real employee clicked a real link.
 *
 * THE COURIER'S OBLIGATION, restated at the shared seam: the plaintext token
 * goes into the mail body and NOWHERE else — never a log line, never a
 * response body, never a store. The DB keeps only the sha256.
 */
export const INVITE_CLARA_TOKEN_PARAM = "ct";

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

// ===========================================================================
// P4-3's TWO DOORS — the self-serve signup chain's second and third steps.
//
// RUNG-0 CENSUS, at the LIVE body (order §0.2 — never a migration's first
// CREATE). Censused 2026-08-30 across every file in packages/db/migrations/
// (0001 … 0155, the repo frontier): each of these two functions is created
// EXACTLY ONCE and no later migration CREATE-OR-REPLACEs either, so the first
// CREATE *is* the live body in both cases. That is a measured result, not an
// assumption — `accept_invite` above needed 0145's replacement, and
// `invite_member`/`create_firm` needed 0147's.
//
//   clara.claim_identity(p_display_name text, p_op_key text) -> jsonb
//     live body 0141:250 · returns {user_id, display_name} (0141:247, built by
//     _claim_identity_core) · security definer, search_path = clara, pg_temp
//
//   clara.request_firm_registration(p_firm_name text, p_note text,
//                                   p_op_key text) -> jsonb
//     live body 0145:370 · returns {request_id, status} (0145:402/424/428)
//
// ORDER IS LOAD-BEARING, and the DB is what makes it so.
// `request_firm_registration` raises **CLR04 'unknown actor'** (0145:376-378)
// for an actor with no `clara.users` row — and `claim_identity` is the only door
// that mints one for a real person outside an invite. So step 2 must complete
// before step 3 is attempted. This is not a UI convention that could be
// reordered for a nicer form; reversing it refuses every time.
//
// *** SCOPE NOTE, reported to the lead rather than worked around (order §0.2).
// The order's own refusal list for these two doors is INCOMPLETE — the census
// found five refusals it does not name. They are listed in full below because
// the census governs. No behaviour changes either way: every one of them is a
// `DoorRefusal` that this surface renders VERBATIM, so an unnamed refusal
// renders exactly as correctly as a named one. What would have been wrong is a
// client-side copy of the list used to pre-empt any of them. ***
//
// claim_identity's refusals, in the order the bodies raise them:
//   CLR04  'no authenticated actor'                                   (0141:255)
//   CLR10  'op_key is required'                                       (0141:260)  <- not in the order's list
//   CLR04  'a verified email claim is required'                       (0141:270)
//   ...then _claim_identity_core (0141:219), which it tail-calls:
//   CLR04  'the agent identity cannot claim a session'                (0141:224)
//   CLR10  'display name is required'                                 (0141:227)
//   CLR10  'identity already claimed with a different email'          (0141:237)
//   CLR10  'that email is already claimed by a different identity'    (0141:244)
//
// request_firm_registration's refusals:
//   CLR04  'no authenticated actor'                                   (0145:375)  <- not in the order's list
//   CLR04  'unknown actor'                                            (0145:377)  <- not in the order's list
//   CLR04  'the agent identity cannot request a firm registration'    (0145:384)  <- not in the order's list
//   CLR10  'op_key is required'                                       (0145:386)
//   CLR10  'firm name is required'                                    (0145:388)  <- not in the order's list
//   CLR09  'actor already belongs to a firm'                          (0145:392)
//   CLR10  'op_key reused with different args'                        (0145:400, 422)
//   CLR09  'an open registration request already exists'              (0145:406, 426)
//
// THE CLR09 PAIR IS THE ONE THE JOURNEY EXISTS TO SHOW HONESTLY. "I am already
// staff at another firm and want my own" (0145:391-393) and "you already have a
// request open" (0145:405-407) both refuse at REQUEST time with a legible
// message — never silently, and never discovered later. Design §4 A names this
// as the reason the chain calls the door at signup rather than deferring it.
//
// THE EMAIL IS NEVER AN ARGUMENT — the same wall accept_invite carries, one door
// over. `claim_identity` reads it from the verified JWT claim inside the door
// (`clara._jwt_email()`, 0141:152/261) and refuses CLR04 if the JWT carries no
// verified email at all (0141:270). Neither wrapper below accepts, forwards or
// names an email, and neither does the form that calls them. A signature that
// took one would let a caller claim another person's address.
//
// NO `_audit` AND NO DOMAIN EVENT ON EITHER DOOR, by structural necessity —
// `audit_log.firm_id` and `domain_events.firm_id` are both NOT NULL (0002:278,
// 0005:80) and these are the two doors that must work before any firm exists
// (0141:210-217, 0145:350-354). Each door's own receipt is its row. Recorded
// here so a later reader does not read the absence as an omission.
// ===========================================================================

/** What `claim_identity` resolves to — `_claim_identity_core`'s own return
 *  (0141:247). Optional for the same hydrate-never-trust reason
 *  `AcceptInviteReceipt` is: this is a REPORT of what the DB did, never state to
 *  paint. The signup chain uses it as a SEQUENCING signal only (the call
 *  resolved, so step 3 may run) and re-reads nothing from it. */
export type ClaimIdentityReceipt = {
  user_id?: string;
  display_name?: string;
};

export type ClaimIdentityArgs = {
  /** The person's own name, from the signup form. The ONLY thing this door
   *  takes from the client — the email comes from the JWT (see the header). */
  displayName: string;
  /** Minted by the CALLER and held stable across a retry of the SAME attempt.
   *  NOTE, from the body rather than from the estate's usual pattern: this
   *  door's idempotency is STRUCTURAL, not `op_receipts`-backed — 0141:256-259
   *  says so outright, because there is no firm to scope a receipt row under
   *  before this call succeeds. `p_op_key` is still mandatory (CLR10 at
   *  0141:260) and is validated for signature-shape consistency with every other
   *  door, but a replay is deduped by the core's own select-then-branch
   *  (0141:228-246), not by a stored key. So a retry with a DIFFERENT display
   *  name does not refuse the way `accept_invite`'s arg-complete hash would — it
   *  UPDATES the name (0141:239). That is the door's behaviour; the caller does
   *  not paper over it. */
  opKey: string;
};

/** `clara.claim_identity` — mints the caller's `clara.users` row from their own
 *  verified JWT, the step that closes design §3's identity gap for a self-serve
 *  applicant. A governed act: its `DoorRefusal` propagates untouched for the
 *  caller to render verbatim, and this module offers no retry of its own. */
export async function claimIdentity(
  args: ClaimIdentityArgs,
  opts: CallDoorOptions = {},
): Promise<ClaimIdentityReceipt> {
  const out = await callDoor(
    "claim_identity",
    { p_display_name: args.displayName, p_op_key: args.opKey },
    opts,
  );
  return (out ?? {}) as ClaimIdentityReceipt;
}

/** What `request_firm_registration` resolves to (0145:402/424/428).
 *
 *  `status` IS THE DB's OWN WORD — 'open' | 'approved' | 'rejected', the base
 *  table's CHECK (0145:330). It is NOT 'pending': that is the human name for the
 *  SCREEN, and `lib/registration/reads.ts`'s header records the same distinction
 *  from the read side. Nothing here translates it; the copy layer does.
 *
 *  A REPLAY RESOLVES HERE TOO, and can carry a status that is not 'open': an
 *  identical (applicant, op_key, firm_name, note) replays the ORIGINAL request's
 *  receipt whatever its current status (0145:396-403). So a caller must never
 *  read `status === "open"` off this receipt as proof a fresh request was just
 *  created — it may be reporting a request decided days ago. The holding page
 *  re-reads `firm_registration_requests_visible` for the truth, which is the
 *  same hydrate-never-trust rule every other door caller in this app obeys. */
export type RegistrationRequestReceipt = {
  request_id?: string;
  status?: string;
};

export type RequestFirmRegistrationArgs = {
  firmName: string;
  /** Optional free text the applicant may add. `null` and `""` are the SAME
   *  thing to the door — it `nullif(btrim(...), '')`s the argument (0145:389) —
   *  so the caller does not need to normalise, and must not invent a note. */
  note: string | null;
  /** Minted by the CALLER, and — unlike `claim_identity`'s — genuinely dedupe-
   *  bearing here: the door stores `op_key` ON the row (0145:329) and looks a
   *  replay up by (applicant, op_key) across ALL statuses (0145:396-397). The
   *  replay is ARG-COMPLETE: identical (firm_name, note) on the same key replays
   *  the original receipt; a DIFFERENT arg on the same key refuses CLR10
   *  'op_key reused with different args' rather than returning someone else's
   *  receipt. A caller that edits the firm name after a failure must therefore
   *  mint a FRESH key, and the form below does exactly that. */
  opKey: string;
};

/** `clara.request_firm_registration` — records the applicant's request to have a
 *  firm of their own. A governed act; refusals render verbatim.
 *
 *  REQUIRES `claimIdentity` TO HAVE SUCCEEDED FIRST (CLR04 'unknown actor',
 *  0145:376-378) — see this section's header. */
export async function requestFirmRegistration(
  args: RequestFirmRegistrationArgs,
  opts: CallDoorOptions = {},
): Promise<RegistrationRequestReceipt> {
  const out = await callDoor(
    "request_firm_registration",
    { p_firm_name: args.firmName, p_note: args.note, p_op_key: args.opKey },
    opts,
  );
  return (out ?? {}) as RegistrationRequestReceipt;
}

// ---------------------------------------------------------------------------
// A READ, NOT A DOOR — labelled as such at its definition, per apps/web/AGENTS.md.
//
// *** P4-2 OWNS THE CANONICAL HOME, AND THIS LAYER IS SHAPED FOR A 1:1 FOLD.
// Its `apps/web/lib/firm/caller-context.ts` is "the typed read + its wire-shape
// pin"; `lib/require-firm-scope.ts` is THE one check over it. P4-1 merges FIRST
// and needs this read to prove its own post-condition, so it lives here until
// that fold.
//
// The names below are deliberately P4-2's, so the fold is a DELETION plus an
// import rather than a reconciliation of two vocabularies:
//   CALLER_CONTEXT_RELATION · CALLER_CONTEXT_COLUMNS · CALLER_CONTEXT_SELECT ·
//   CallerContextRow · loadCallerContext  → replace with P4-2's, verbatim
//   readCallerContextForSubject           → keep, or move beside their check
// and the four denial reasons are P4-2's four:
//   no_membership | ambiguous | malformed | wrong_subject
//
// TWO THINGS THIS LAYER DOES THAT P4-2's DID NOT, both from the same Codex
// round — carry them across at the fold rather than losing them:
//   (1) it validates ALL SIX columns, not four (their MEDIUM-2);
//   (2) it binds the row to a KNOWN subject (`wrong_subject`), which their
//       spine has no equivalent of because it has no proven subject to bind to
//       at that point. Do not drop the binding when folding THIS caller. ***
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
export const CALLER_CONTEXT_RELATION = "caller_context";

export const CALLER_CONTEXT_COLUMNS = [
  "user_id",
  "firm_id",
  "firm_name",
  "role",
  "role_rank",
  "is_operator",
] as const;

export const CALLER_CONTEXT_SELECT = CALLER_CONTEXT_COLUMNS.join(",");

/** One row of the view. Nullability read off the BASE TABLES, not assumed —
 *  and `role_rank` is genuinely nullable: `clara.role_rank` (`0002:326-331`) is
 *  a `case … else null end`, so an out-of-ladder role ranks NULL. Today's CHECK
 *  on `firm_memberships.role` makes that unreachable, but typing it non-null
 *  here would be this module asserting a guarantee the DB does not give. */
export type CallerContextRow = {
  user_id: string;
  firm_id: string;
  firm_name: string;
  role: string;
  role_rank: number | null;
  is_operator: boolean;
};

/** Reads the caller's own context and returns the rows VERBATIM — zero, one, or
 *  (a structural surprise `uq_membership_active_user` says cannot happen) more.
 *
 *  `limit: 2`, NOT `limit: 1`: a cap of one silently TRUNCATES a broken >1-row
 *  invariant into a perfectly ordinary-looking single row, so the breakage
 *  becomes unobservable at exactly the moment it matters. Two lets the caller
 *  SEE it and deny (Codex MEDIUM-1). A FAILED read throws — it never degrades
 *  into the same empty array that "no membership" returns, because those are
 *  different facts and collapsing them would delete the distinction before the
 *  caller that cares ever sees it (review law 2). */
export function loadCallerContext(
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<CallerContextRow[]> {
  return getRows<CallerContextRow>(CALLER_CONTEXT_RELATION, {
    select: CALLER_CONTEXT_SELECT,
    limit: 2,
    session: opts.session,
    signal: opts.signal,
  });
}

/** Why a membership could NOT be positively confirmed. Every value denies.
 *
 *  These four names are DELIBERATELY the ones P4-2's `require-firm-scope`
 *  uses, so its fold replaces this layer 1:1 rather than re-deriving a second
 *  vocabulary for the same four facts. */
export type CallerContextDenial =
  /** The read succeeded and observed zero rows — the holding state's own
   *  trigger, and a legitimate answer, not an error. */
  | "no_membership"
  /** More than one active membership came back. `uq_membership_active_user`
   *  says this is impossible; if it happens the index is broken or the response
   *  is not the DB's, and either way nothing here may pick one. */
  | "ambiguous"
  /** One row, but it does not satisfy the view's own declared column contract —
   *  a missing field, a wrong type, an empty firm name, a role outside the
   *  CHECK. An HTTP 200 carrying `[{}]` lands here. */
  | "malformed"
  /** One well-formed row, for SOMEBODY ELSE. The view is `jwt_sub()`-scoped so
   *  this cannot happen against an honest DB — which is exactly why it must
   *  deny rather than be assumed away. */
  | "wrong_subject";

export type CallerContextOutcome =
  | { ok: true; context: CallerContextRow }
  | { ok: false; reason: CallerContextDenial };

/**
 * The four roles `clara.firm_memberships.role` admits. This is a COPY of the
 * DB's own CHECK constraint (`0002_foundation.sql:215`), and a copy of a
 * constraint is a projection of it, not the thing (review law 3) — it can
 * silently drift the day someone adds a fifth role in a migration.
 *
 * EXPORTED so `doors.test.ts` can parse that CHECK out of the migration text
 * and `deepEqual` it against this set. The test is the pin; this comment is
 * only the pointer to it.
 */
export const ALLOWED_ROLES = new Set(["viewer", "bookkeeper", "admin", "owner"]);

/**
 * LOWERCASE ONLY — deliberately not `/i`.
 *
 * Postgres renders `uuid` in canonical lowercase (`uuid_out`), and Supabase's
 * JWT `sub` is likewise lowercase, so every honest value on both sides of the
 * subject comparison is lowercase. The comparison
 * `row.user_id !== verifiedSubject` is case-SENSITIVE, so a case-insensitive
 * shape check here would have admitted an uppercase id as well-formed and then
 * denied it one line later as `wrong_subject` — the same refusal reported
 * under the wrong reason. One rule, applied consistently: a non-canonical id
 * is malformed, and it is named that.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validates ALL SIX declared columns — not the four a caller happens to read.
 *  A row is trusted downstream as a whole, so a partial check hands a
 *  half-validated object onward wearing a fully-typed name (the exact defect
 *  Codex found in P4-2's own validator). Every field is checked here. */
function isCallerContextRow(value: unknown): value is CallerContextRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || !UUID.test(row.user_id)) return false;
  if (typeof row.firm_id !== "string" || !UUID.test(row.firm_id)) return false;
  if (typeof row.firm_name !== "string" || row.firm_name.trim() === "") return false;
  if (typeof row.role !== "string" || !ALLOWED_ROLES.has(row.role)) return false;
  // Nullable BY THE DB's own declaration (see CallerContextRow), but never a
  // string, a float, or a NaN masquerading as a rank.
  if (row.role_rank !== null && !Number.isInteger(row.role_rank)) return false;
  // Strictly boolean — `"true"` is not true (Codex: a string here would grant).
  if (typeof row.is_operator !== "boolean") return false;
  return true;
}

/**
 * THE POSITIVE READ, and the only thing in this module that may authorise the
 * invite journey to leave the page. Returns `ok: true` for EXACTLY ONE row that
 * is fully well-formed AND belongs to the subject `verifyOtp` positively proved.
 * Every other observation denies with its reason.
 *
 * WHY THE SUBJECT COMPARISON EXISTS even though the view is `jwt_sub()`-scoped:
 * "the view filters by the caller" is a property of the DB, and this function's
 * job is to not *depend* on a property it cannot see. A 200 is supplied by
 * whatever answered the request — a proxy, a cache, a compromised edge — and
 * the whole point of the post-condition is that it is evidence rather than
 * trust. Binding the row to `verifiedSubject` costs one comparison and closes
 * the case where the response is well-formed but not ours.
 *
 * A FAILED read still THROWS (it does not become a denial): the caller must be
 * able to tell "the DB said no" from "we never heard back", and both take the
 * fail-closed branch for different displayed reasons.
 */
export async function readCallerContextForSubject(
  verifiedSubject: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<CallerContextOutcome> {
  const rows = await loadCallerContext(opts);
  if (rows.length === 0) return { ok: false, reason: "no_membership" };
  if (rows.length > 1) return { ok: false, reason: "ambiguous" };
  const row = rows[0];
  if (!isCallerContextRow(row)) return { ok: false, reason: "malformed" };
  if (row.user_id !== verifiedSubject) return { ok: false, reason: "wrong_subject" };
  return { ok: true, context: row };
}
