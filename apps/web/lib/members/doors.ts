// MEMBERS — the five governed doors behind /admin/members.
//
// RUNG-0 CENSUS, every one at its LIVE body (apps/web/AGENTS.md; the P4 order's
// §0.2: "census your doors at the LIVE body, never at a migration's first
// CREATE"). Censused 2026-08-30 by reading every `create [or replace] function
// clara.<name>` across `packages/db/migrations/`, then checking that no later
// migration replaces the body by a DYNAMIC splice (`0119`'s nine
// `execute replace(v_head, …)` blocks name nine BANK/ACCOUNT verbs and none of
// these five; `0129`'s two splice `book_staff_advance_application` and six
// `_agent_*_core` bodies). `lib/members/members-doors.test.ts` mechanises the
// plain-CREATE half of that census so it re-runs on every `pnpm test`.
//
//   clara.invite_member(text,text,text)         LIVE 0147:372  (NOT 0141:348, NOT 0145:622)
//   clara.revoke_invite(uuid,text)              LIVE 0141:466  (created once)
//   clara.set_member_role(uuid,text,text)       LIVE 0145:592  (over 0004:428, 0005:707)
//   clara.remove_member(uuid,text)              LIVE 0005:732  (over 0004:457)
//   clara.add_member(uuid,uuid,text,text)       LIVE 0145:671  (over 0004:400, 0005:677, 0141:325)
//
// ALL FIVE FLOOR AT admin+ through `clara._human_ctx(clara.role_rank('admin'))`,
// which raises CLR04 for a caller with no active membership or a rank below
// admin. THAT is the wall. Nothing in this module, and nothing in
// components/admin/, re-implements it: the surface shows the control, the caller
// clicks, and the DB's own refusal renders verbatim (plan §2 rule (b) — no wall is
// pre-empted; components/firm-admin/vendor-bindings-panel.tsx's Sign trigger is
// the same precedent).
//
// THE THREE WALLS THE SURFACE RENDERS AND NEVER PRE-EMPTS
// -------------------------------------------------------
// 1. THE LAST-OWNER WALL — `clara._tf_guard_last_owner` (`0003:415`, created
//    once, never replaced), a row trigger on `firm_memberships`. It raises
//    **CLR09 'cannot demote/remove the last active owner'** when the row being
//    demoted or removed is the last ACTIVE NON-AGENT owner (`u.is_agent = false`
//    in its own count — HIGH-11, so the global agent identity can never be left
//    as a firm's sole owner). It backstops BOTH `set_member_role` (`0145:612`'s
//    own trailing comment: "guard_last_owner backstops CLR09") and
//    `remove_member` (`0005:745`, the same comment). The UI lets the click happen.
// 2. THE ROLE CEILING (裁-22's in-tranche ruling, the F2 fix rounds). Checked at
//    FOUR entrances against the caller's OWN rank via `clara.actor_role_rank()`:
//      set_member_role `0145:603` → CLR04 'cannot assign a role above your own rank'
//      invite_member   `0147:386` → CLR04 'cannot invite to a role above your own rank'
//      add_member      `0145:683` → CLR04 'cannot assign a role above your own rank'
//      accept_invite   `0145:719` → CLR04 (the issuer-rank re-check, P4-1's surface)
//    The role menu offers all four ladder roles and filters NONE of them: a
//    client-side filter would hide the ceiling instead of teaching it.
// 3. THE FIRM WALL — CLR11 'membership not in your firm' / 'invite not in your
//    firm' (`0145:610`, `0005:742`, `0141:475`), plus CLR11 'membership is not
//    active' on both membership doors.
//
// EVERY ACT RE-READS. `lib/parts/hooks.ts`'s `act()` reloads unconditionally after
// every call, success or failure. No optimistic update, ever (apps/web/AGENTS.md).

import { callDoor, DoorRefusal } from "../doors";
import { RefusalError } from "../wire";
import type { SessionTokenAccessor } from "@/lib/session";

/** A fresh idempotency key per ATTEMPT. Every one of these doors requires a
 *  non-empty `p_op_key` (CLR10 'op_key is required') and hashes the request's own
 *  arguments into `_reserve_op`, so a replay of the SAME key with DIFFERENT
 *  arguments refuses rather than silently doing the second thing. A new key per
 *  click is the honest default here: unlike P4-1's acceptance (where a retry must
 *  replay the cached receipt), these acts are cheap to re-attempt and a stale key
 *  would return a stale receipt for an act the human has since changed. */
function opKey(): string {
  return crypto.randomUUID();
}

/**
 * `clara.set_member_role` — LIVE BODY `0145:592`. admin+.
 *
 * Refusals, in the order the body raises them:
 *   CLR04  `_human_ctx` — no active membership, or below admin        (:596)
 *   CLR10  'op_key is required'                                       (:597)
 *   CLR10  'bad role'                                                 (:598)
 *   CLR04  'cannot assign a role above your own rank'                 (:603)
 *   CLR11  'membership not in your firm'                              (:610)
 *   CLR11  'membership is not active'                                 (:611)
 *   CLR09  'cannot demote/remove the last active owner'  (the trigger, 0003:423)
 *
 * SIDE EFFECT WORTH KNOWING AT THE SURFACE (`0145:613-616`): demoting a member
 * BELOW bookkeeper also revokes every `wake_credentials` row they hold on behalf
 * of this firm. The receipt does not report it, so the UI does not claim it — it
 * is recorded here so nobody later reads the door as role-only.
 *
 * Resolves `_finish_op`'s receipt `{membership_id, role}` — a REPORT of what the
 * DB did, never state to paint (hydrate-never-trust). The caller re-reads.
 */
export function setMemberRole(
  session: SessionTokenAccessor,
  membershipId: string,
  role: string,
): Promise<unknown> {
  return callDoor(
    "set_member_role",
    { p_membership: membershipId, p_role: role, p_op_key: opKey() },
    { session },
  );
}

/**
 * `clara.remove_member` — LIVE BODY `0005:732`. admin+.
 *
 * Refusals:
 *   CLR04  `_human_ctx`                                               (:736)
 *   CLR10  'op_key is required'                                       (:737)
 *   CLR11  'membership not in your firm'                              (:742)
 *   CLR11  'membership is not active'                                 (:743)
 *   CLR09  'cannot demote/remove the last active owner'  (the trigger, 0003:423)
 *
 * NOT A DELETE, and NOT REVERSIBLE BY A COUNTERPART VERB. It sets
 * `status='removed'` + `removed_at` and revokes the person's wake credentials for
 * this firm (`0005:746-747`). There is no re-activation door and P4 does not ask
 * for one (design §4 D): re-inviting a removed person mints a FRESH membership
 * row, which `uq_membership_active_user`'s partial index permits.
 */
export function removeMember(
  session: SessionTokenAccessor,
  membershipId: string,
): Promise<unknown> {
  return callDoor(
    "remove_member",
    { p_membership: membershipId, p_op_key: opKey() },
    { session },
  );
}

/**
 * `clara.revoke_invite` — LIVE BODY `0141:466`. admin+.
 *
 * Refusals:
 *   CLR04  `_human_ctx`                                               (:470)
 *   CLR10  'op_key is required'                                       (:471)
 *   CLR11  'invite not in your firm'                                  (:475)
 *   CLR09  'this invite is no longer open (status: %)'                (:477)
 *
 * THE CLR09 IS WHY THE SURFACE OFFERS REVOKE ON EVERY ROW, not only pending ones.
 * The view's `status` is EFFECTIVE — an invite past `expires_at` reads `expired`
 * while the ROW is still `pending`, so revoking it genuinely succeeds and is the
 * only way to free that email for a fresh invite before the 7 days elapse
 * (`invite_member` `0147:399` refuses CLR10 'an invite is already pending for this
 * email' on the row's REAL status). Hiding the control on an `expired` row would
 * hide the only exit from that state.
 */
export function revokeInvite(
  session: SessionTokenAccessor,
  inviteId: string,
): Promise<unknown> {
  return callDoor(
    "revoke_invite",
    { p_invite: inviteId, p_op_key: opKey() },
    { session },
  );
}

/**
 * `clara.add_member` — LIVE BODY `0145:671`. admin+, role-ceilinged at the
 * entrance (`:681`, the F2 round-2 fix: without it an admin could add someone
 * straight in as `owner`, bypassing `set_member_role`).
 *
 * *** THIS DOOR HAS NO CONTROL ON THIS SURFACE, AND THAT IS DELIBERATE. ***
 * `p_user` is a `clara.users.id` for a person who is NOT yet a member of this
 * firm. NO read available to `clara_authenticated` publishes such an id:
 * `firm_members_visible` is the caller's own firm only, and `users_visible` is
 * firm-scoped for the same reason. So a working "add an existing user" control
 * would need a user picker over people outside the firm, and no relation offers
 * one. Shipping the control anyway — a uuid text box, or a picker over the people
 * who are ALREADY members — would be a fake control, which
 * `apps/web/AGENTS.md` forbids outright. The honest path into a firm is the
 * invite journey (`invite_member` → `accept_invite`), which is what this surface
 * ships.
 *
 * The typed wrapper exists because the order censused this door as one of the
 * five and because the seam should be one line when the read that drives it
 * lands. It is exercised by `lib/members/members-doors.test.ts` (argument names
 * and shape), and it is called by no component. That is stated here rather than
 * discovered: reported to the lead as an open question with a recommendation.
 *
 * Refusals:
 *   CLR04  `_human_ctx`                                               (:675)
 *   CLR11  'not your firm'                                            (:676)
 *   CLR04  'cannot assign a role above your own rank'                 (:683)
 *   CLR10  'op_key is required'                                       (:685)
 *   plus whatever `_add_member_core` raises beneath it — the agent-identity
 *   refusal (`is_agent` → CLR10, its own HIGH-11 wall) and the already-belongs
 *   check against `uq_membership_active_user`.
 */
export function addMember(
  session: SessionTokenAccessor,
  firmId: string,
  userId: string,
  role: string,
): Promise<unknown> {
  return callDoor(
    "add_member",
    { p_firm: firmId, p_user: userId, p_role: role, p_op_key: opKey() },
    { session },
  );
}

// ---------------------------------------------------------------------------
// clara.invite_member — LIVE BODY 0147:372 — REACHED THROUGH THE COURIER, NOT
// THROUGH callDoor. This is the one deliberate exception in this module, and the
// reason is a secret, not a convenience.
// ---------------------------------------------------------------------------
//
// `invite_member` returns `{invite_id, token_hash, expires_at}` from `_finish_op`
// PLUS a `token` key merged in one layer ABOVE persistence (`0147:418-423`):
//
//     return v_receipt || jsonb_build_object('token', v_token);
//
// That `token` is the PLAINTEXT invite secret. 裁-16a put only its sha256 in
// `op_receipts.result`, and a replay of the same op_key short-circuits at
// `_reserve_op` and never re-mints it — so the plaintext is handed to its caller
// EXACTLY ONCE, ever. If the browser were that caller, the plaintext would be in
// a fetch response, in devtools, in any error reporter, and one `console.log`
// from being in a log aggregator.
//
// So the CALLER is a server-only Route Handler (`app/api/invite/route.ts`), and
// this function talks to that handler instead. The handler calls `invite_member`
// AS THE CALLER — the caller's own session token, so `_human_ctx` performs the
// authority check against the real person — and the plaintext goes into the mail
// body and nowhere else. Design §4 C; the ordering is the whole point.
//
// The response carries `invite_id` and `expires_at` and NEVER the token or its
// hash. A governed refusal comes back as the RefusalError's own fields and is
// re-thrown here as the SAME `DoorRefusal` class every other door throws — the
// class imported from lib/wire.ts, not a structurally-similar lookalike minted
// here, so `lib/parts/hooks.ts`'s `applyFailure` recognises it by `instanceof`
// and renders the CLR code and message verbatim (review law 3: spelling is not
// identity).

/** Where the courier lives. One constant, imported by both ends, so the client
 *  and the route cannot drift to two different paths. */
export const INVITE_COURIER_PATH = "/api/invite";

/** Why the COURIER itself failed — never a governed refusal (those arrive as
 *  `DoorRefusal`), always a fact about this app's own server layer.
 *
 *   no_session          the request carried no usable session
 *   cross_origin        the same-origin proof failed
 *   invalid_request     the body was not `{email, role}` with non-empty strings
 *   not_authorised      the caller is not positively an admin+ of exactly one
 *                       firm (Codex round 2, N1). This is the courier's own
 *                       fail-closed PREFLIGHT, not the wall: `_human_ctx` still
 *                       judges the request at the door. It exists because the
 *                       account-existence check below is an ORACLE, and the
 *                       owner's acceptance of that enumeration was bounded to
 *                       admin+ — a bound that has to be enforced BEFORE the
 *                       oracle runs, not by the door after it. One fixed body
 *                       for every failure shape and every address.
 *   mail_not_configured no mail transport is configured — NOTHING was minted
 *   recipient_has_account the address already belongs to a Clara account, so an
 *                       invite for it can never be minted (FIND-1). Refused
 *                       BEFORE the door — NOTHING was minted, and the address is
 *                       not blocked for seven days behind a dead invite.
 *   mail_unavailable    the mail transport is configured but could not be
 *                       reached to answer that question. Also refused BEFORE the
 *                       door: a check that cannot answer must not be read as a
 *                       yes (review law 2). NOTHING was minted.
 *   mail_failed         the DOOR SUCCEEDED and the mail did not go out. The
 *                       invite EXISTS and its plaintext token is now
 *                       unrecoverable, so the only remedy is to revoke it and
 *                       invite again — which is why `invite` is carried.
 *   transport           the courier could not be reached, or answered a shape
 *                       this client does not recognise
 */
export type InviteCourierCode =
  | "no_session"
  | "cross_origin"
  | "invalid_request"
  | "unsupported_address"
  | "not_authorised"
  | "mail_not_configured"
  | "recipient_has_account"
  | "mail_unavailable"
  | "mail_failed"
  | "transport";

/** The closed set, as DATA — `errorFromCourierBody` matches against this rather
 *  than a second hand-typed list, so a code added above cannot be silently
 *  unrecognised on the client and folded into `transport`. */
export const INVITE_COURIER_CODES: readonly InviteCourierCode[] = [
  "no_session",
  "cross_origin",
  "invalid_request",
  "unsupported_address",
  "not_authorised",
  "mail_not_configured",
  "recipient_has_account",
  "mail_unavailable",
  "mail_failed",
  "transport",
];

export class InviteCourierError extends Error {
  readonly code: InviteCourierCode;
  /** Present ONLY on `mail_failed`: the invite the door really did create. */
  readonly invite: { invite_id: string; expires_at: string } | null;
  /** CLARA'S OWN English detail, when it had one worth showing — today only the
   *  list of unset environment variable NAMES on `mail_not_configured`. It is no
   *  longer a mail provider's error text: the courier stopped relaying upstream
   *  strings entirely (independent review of #455, MEDIUM-3). Rendered ALONGSIDE
   *  the localised sentence, never instead of it. */
  readonly detail: string | null;
  /** The id the server logged the real failure under. It is what turns "the
   *  invitation server could not be reached" into something supportable without
   *  putting a provider's words — or a URL that carried both invite secrets — in
   *  front of a browser. */
  readonly correlationId: string | null;
  constructor(
    code: InviteCourierCode,
    message: string,
    opts: {
      invite?: { invite_id: string; expires_at: string } | null;
      detail?: string | null;
      correlationId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "InviteCourierError";
    this.code = code;
    this.invite = opts.invite ?? null;
    this.detail = opts.detail ?? null;
    this.correlationId = opts.correlationId ?? null;
  }
}

export function isInviteCourierError(e: unknown): e is InviteCourierError {
  return e instanceof InviteCourierError;
}

/** What a successful courier round trip reports. Deliberately NOT the token and
 *  NOT the token_hash: neither has any use in a browser, and a field that is
 *  never sent cannot be logged by accident. */
export type InviteIssued = {
  invite_id: string;
  expires_at: string;
};

/** The courier's refusal envelope — `RefusalError`'s own fields, so the client
 *  reconstructs the SAME class rather than re-parsing a PostgREST body. */
type CourierRefusalBody = {
  ok: false;
  kind: "refusal";
  refusal: {
    code: string;
    message: string;
    reason: string | null;
    status: number;
    pgCode: string | null;
    codeSource: "sqlstate" | "message";
  };
};

type CourierErrorBody = {
  ok: false;
  kind: "courier";
  code: InviteCourierCode;
  message: string;
  invite?: { invite_id: string; expires_at: string } | null;
  detail?: string | null;
  correlation_id?: string | null;
};

type CourierOkBody = { ok: true } & InviteIssued;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Rebuild the thrown error from the courier's body. Fail-closed by construction:
 * ANY body this function does not positively recognise becomes a `transport`
 * error, never a silent success and never a fabricated refusal (review law 2 —
 * absence is not evidence).
 *
 * Exported so `tests/invite-courier.test.ts` can drive every branch without a
 * server.
 */
export function errorFromCourierBody(status: number, body: unknown): Error {
  if (isRecord(body) && body.kind === "refusal" && isRecord(body.refusal)) {
    const r = body.refusal as CourierRefusalBody["refusal"];
    if (typeof r.code === "string" && typeof r.message === "string") {
      // THE SAME CLASS, not a lookalike: `DoorRefusal` is lib/doors.ts's
      // re-export of this very `RefusalError`, which is what
      // lib/parts/hooks.ts classifies by `instanceof`.
      return new RefusalError(r.code, r.message, {
        reason: typeof r.reason === "string" ? r.reason : null,
        status: typeof r.status === "number" ? r.status : status,
        pgCode: typeof r.pgCode === "string" ? r.pgCode : null,
        codeSource: r.codeSource === "message" ? "message" : "sqlstate",
      });
    }
  }
  if (isRecord(body) && body.kind === "courier" && typeof body.code === "string") {
    const b = body as CourierErrorBody;
    // The ONE list, imported rather than retyped (FIND-1's fold): a second
    // hand-kept copy is how a new code ships on the server and silently degrades
    // to `transport` on the client.
    if ((INVITE_COURIER_CODES as readonly string[]).includes(b.code)) {
      return new InviteCourierError(b.code, typeof b.message === "string" && b.message !== "" ? b.message : b.code, {
        invite: isRecord(b.invite) && typeof b.invite.invite_id === "string" && typeof b.invite.expires_at === "string"
          ? { invite_id: b.invite.invite_id, expires_at: b.invite.expires_at }
          : null,
        detail: typeof b.detail === "string" ? b.detail : null,
        correlationId: typeof b.correlation_id === "string" ? b.correlation_id : null,
      });
    }
  }
  return new InviteCourierError("transport", `the invite courier answered ${status} with a shape this client does not recognise`);
}

/**
 * Issue an invite. POSTs `{email, role}` to the courier; the DB performs every
 * authority check, and the mail goes out only if it said yes.
 *
 * `credentials: "same-origin"` sends the session cookie and nothing else; the
 * WALL is entirely server-side — `lib/same-origin.ts`'s `isSameOriginRequest`
 * (an exact `Origin` match plus `Sec-Fetch-Site`, both fail-closed), the same one
 * `app/logout/route.ts` uses. `fetch` sends `Origin` on every non-GET request by
 * the Fetch standard, so this client needs no header of its own — and a header
 * this client CHOSE to send would be a wall the attacker also gets to choose.
 *
 * Throws `DoorRefusal` for a governed refusal (rendered verbatim by the caller,
 * never retried) and `InviteCourierError` for anything else.
 */
export async function inviteMember(email: string, role: string): Promise<InviteIssued> {
  let res: Response;
  try {
    res = await fetch(INVITE_COURIER_PATH, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
  } catch (e) {
    throw new InviteCourierError("transport", e instanceof Error ? e.message : String(e));
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && isRecord(body) && body.ok === true) {
    const ok = body as CourierOkBody;
    if (typeof ok.invite_id === "string" && typeof ok.expires_at === "string") {
      return { invite_id: ok.invite_id, expires_at: ok.expires_at };
    }
    // A 2xx whose body is not the success shape is NOT a success. Absence is not
    // evidence: the invite may or may not exist, so this reports a failure rather
    // than telling the admin an email went out.
    throw new InviteCourierError("transport", "the invite courier answered OK with no invite in the body");
  }
  throw errorFromCourierBody(res.status, body);
}

/** Re-exported so a caller renders a governed refusal with the one class the rest
 *  of the app already classifies by. */
export { DoorRefusal };
