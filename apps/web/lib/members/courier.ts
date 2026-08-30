// THE MAIL COURIER'S BODY — judgement logic, and the whole train's most
// order-sensitive file. `app/api/invite/route.ts` is a four-line wrapper around
// `handleInviteRequest` because a Next.js route file may only export the route
// contract itself; `lib/same-origin.ts`'s own header records the same reason.
//
// SERVER ONLY. This module holds Clara's PLAINTEXT invite token and reaches the
// service-role transport, so nothing importable from a Client Component may
// value-import it. The `server-only` package is not installed in this workspace,
// so the wall is the estate's own import-closure walk — the instrument P4-5
// minted in `tests/firm-scope-db-pins.test.ts` — re-pointed at this module and
// at `lib/members/invite-mail.ts` in `tests/invite-mail-transport.test.ts`. It
// names the offending edge in `pnpm test` rather than at bundle time; that
// file's header records the trade and the follow-up.
//
// THE ORDERING IS THE POINT (design §4 C, plan §6 OQ-4):
//
//   1. PROVE SAME ORIGIN.        A cross-origin POST that both mints an invite and
//                                sends mail is exactly what CSRF wants.
//   2. PARSE THE BODY.           Structure only — never business judgement.
//   3. REQUIRE A SESSION.        There is no door call to make without a token.
//   4. REQUIRE A MAIL TRANSPORT. See the long note below. NOTHING is minted yet.
//   5. CALL invite_member AS THE CALLER. THE DB PERFORMS THE AUTHORITY CHECK.
//   6. ONLY ON A SUCCESSFUL RETURN, SEND.
//
// THE COURIER IS NOT A GUARD. `clara.invite_member`'s own
// `_human_ctx(role_rank('admin'))` (`0147:376`) raises CLR04 for any caller
// without an active admin+ membership, and its role-ceiling wall (`0147:386`)
// raises CLR04 for a caller inviting above their own rank. THE DB IS THE WALL.
// This route deliberately does NOT call `requireFirmScope()` — it is registered
// in `lib/require-firm-scope.ts`'s `SCOPE_EXEMPT_SURFACES` as EXEMPT ON
// PRINCIPLE, and `tests/firm-scope-surfaces.test.ts` goes red if it starts
// calling the spine. Adding a scope check here would put a second, drifting copy
// of an authority decision in front of the real one.
//
// STEPS 1 AND 3 ARE NOT AUTHORITY CHECKS EITHER, and the distinction matters.
// Same-origin is a CSRF wall on this app's own endpoint (`app/logout/route.ts`
// carries the identical one for the identical reason). "Is there a token" is the
// precondition for making a door call at all — with none, `callDoor` would throw
// `no_session` anyway; asking first only makes the answer legible. Neither reads
// a ROLE, neither consults a membership, and neither can grant anything.
//
// STEP 4 IS A CAPABILITY PRECONDITION, NOT A WALL — the one ordering decision in
// this file that is not the design's own words, so here is the reasoning in full.
// `invite_member` hands its PLAINTEXT token to its caller exactly once, above
// persistence (`0147:418-423`); 裁-16a put only the sha256 in
// `op_receipts.result`, and a replay short-circuits at `_reserve_op` and never
// re-mints it. So an invite minted when no mail can go out is not merely
// undelivered, it is PERMANENTLY UNUSABLE — and it also blocks that email for
// seven days behind CLR10 'an invite is already pending for this email'
// (`0147:399`) until an admin notices and revokes it. Checking a SERVER-CONFIG
// fact before minting an unrecoverable row is the same instinct as not opening a
// transaction you cannot commit. It reads no caller input, it answers 503 (never
// 401/403), and it sits AFTER the session check so an unauthenticated prober
// learns nothing about this deployment's configuration.
//
// THE PLAINTEXT TOKEN GOES INTO THE MAIL BODY AND NOWHERE ELSE. It is read out of
// the door's return, passed to `buildInviteUrl`, and dropped. It is never
// returned to the browser, never logged, never persisted, and never included in
// any error this file constructs.
//
// NO UPSTREAM TEXT EVER LEAVES THIS FILE — independent review of #455, MEDIUM-3.
// The previous version relayed `e.message` from the mint/send step to the browser
// as `detail`. That message came from Supabase or from Resend, and RESEND WAS
// HANDED THE FULL SECRET URL — both bearer factors — so an upstream string is a
// string that has been in the same process as the secrets, with wording this app
// does not control and cannot audit. What the browser gets now is a CODE from a
// closed set, a sentence Clara wrote, and a CORRELATION ID. What the server log
// gets is that same id, the transport's own classified failure code, and the
// provider's HTTP STATUS as a number — never a message, a body, a URL, a header,
// an address or a token. The log is a seam (`deps.logFailure`) so a test can
// capture the exact line and assert what is NOT in it; its default writes exactly
// one `console.error`, whose payload is the four allowlisted fields and nothing
// that a caller's data can reach.

import { callDoor as realCallDoor, DoorRefusal } from "../doors";
import { proveSameOrigin } from "../same-origin";
import {
  fixedTokenAccessor,
  resolveServerSession,
  type ServerSession,
} from "../supabase/server-session";
import { loadCallerContext } from "../firm/caller-context";
import type { SessionTokenAccessor } from "@/lib/session";
import type { InviteCourierCode } from "./doors";
import {
  buildInviteUrl,
  inviteMailCapability,
  isInviteMailFailure,
  productionInviteMailer,
  renderInviteEmail,
  type InviteMailer,
  type MailFailureCode,
} from "./invite-mail";

/** Every seam this handler talks to, injectable so `tests/invite-courier.test.ts`
 *  can drive each branch — above all the NEGATIVE (a refused door sends no mail)
 *  with a POSITIVE CONTROL proving the same observer would have fired. */
export type CourierDeps = {
  env?: Record<string, string | undefined>;
  /** Resolves THIS request's caller once — the raw token plus the subject verified
   *  from that same token (P4-2's fold, `lib/supabase/server-session.ts`). */
  resolveSession?: () => Promise<ServerSession | null>;
  callDoor?: <T>(fn: string, args: Record<string, unknown>, opts: { session: SessionTokenAccessor }) => Promise<T>;
  /** Built from the resolved config, once, per request. */
  mailerFor?: (config: Parameters<typeof productionInviteMailer>[0]) => InviteMailer;
  /** The caller's firm AND its id, for the mail's subject line. The id is the
   *  point: the name is a courtesy that must belong to the firm the door acted
   *  IN, and this read cannot be trusted to be that firm on its own (LOW-8).
   *  Returns null when it cannot be read — the sentence then omits the name
   *  rather than guessing one. */
  readFirmContext?: (session: SessionTokenAccessor) => Promise<{ firm_id: string; firm_name: string } | null>;
  /** The op_key `invite_member` requires. Injectable only so a test can pin it. */
  newOpKey?: () => string;
  /** One id per request, printed to the admin and to the log so a support
   *  conversation can join the two WITHOUT the response carrying any detail. */
  newCorrelationId?: () => string;
  /** THE SERVER LOG SEAM (MEDIUM-3). Receives the closed record below and
   *  nothing else. Default: exactly one `console.error` of that record. */
  logFailure?: (entry: InviteCourierLogEntry) => void;
};

/**
 * THE ONLY THING THIS COURIER EVER LOGS, and it is a closed record of four
 * allowlisted fields. There is no `message`, no `detail`, no `url`, no `email`
 * and no free-text field on this type AT ALL — which is what makes "the log
 * cannot leak the provider's words" a property of the shape rather than of the
 * care taken at each call site.
 */
export type InviteCourierLogEntry = {
  event: "invite_courier_failure";
  /** What the browser was told. */
  code: InviteCourierCode;
  /** The transport's OWN classified code, when it threw one this file
   *  recognises; `"unclassified"` when it threw something else. */
  failure: MailFailureCode | "unclassified";
  /** The provider's HTTP status as a NUMBER, when there was one. */
  providerStatus: number | null;
  correlationId: string;
};

/** The default log sink: one line, the closed record, nothing else. This is the
 *  only `console.*` in this file, and its argument is a value whose type cannot
 *  hold a caller-supplied string. */
function defaultLogFailure(entry: InviteCourierLogEntry): void {
  console.error(JSON.stringify(entry));
}

/** Split an unknown thrown value into the two loggable facts, and DISCARD the
 *  rest. Nothing that reaches here is ever put in a response or a log line. */
function classifyThrown(e: unknown): { failure: MailFailureCode | "unclassified"; providerStatus: number | null } {
  return isInviteMailFailure(e)
    ? { failure: e.code, providerStatus: e.providerStatus }
    : { failure: "unclassified", providerStatus: null };
}

/**
 * The courier's own failure envelope.
 *
 * `detail` IS CLARA'S OWN TEXT OR NOTHING (MEDIUM-3). The one thing that ever
 * travels in it is the list of UNSET ENVIRONMENT VARIABLE NAMES on the
 * mail-not-configured branch — a fact about this deployment's configuration that
 * an admin cannot act on without being told, and a variable NAME is not a secret.
 * No upstream string reaches this parameter; the call sites that used to relay one
 * now pass a correlation id instead.
 */
function courierError(
  status: number,
  code: InviteCourierCode,
  message: string,
  extra: {
    invite?: { invite_id: string; expires_at: string } | null;
    detail?: string | null;
    correlationId?: string | null;
  } = {},
): Response {
  return Response.json(
    {
      ok: false,
      kind: "courier",
      code,
      message,
      invite: extra.invite ?? null,
      detail: extra.detail ?? null,
      correlation_id: extra.correlationId ?? null,
    },
    { status },
  );
}

/** The governed refusal, relayed as `RefusalError`'s OWN FIELDS so the browser
 *  reconstructs the same class rather than re-parsing a PostgREST body.
 *  `lib/members/doors.ts`'s `errorFromCourierBody` is the only reader. The HTTP
 *  status is a fixed 400 — "the DB refused what you asked" — while the DB's own
 *  status travels inside `refusal.status`, so the two can never be confused. */
function refusalResponse(e: DoorRefusal): Response {
  return Response.json(
    {
      ok: false,
      kind: "refusal",
      refusal: {
        code: e.code,
        message: e.message,
        reason: e.reason,
        status: e.status,
        pgCode: e.pgCode,
        codeSource: e.codeSource,
      },
    },
    { status: 400 },
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** `invite_member`'s own return, as far as this file reads it. `token_hash` is in
 *  the receipt and is deliberately NOT typed here: nothing in this app has a use
 *  for it, and a field that is never read cannot be leaked by a careless spread. */
type InviteMemberReceipt = {
  invite_id?: unknown;
  expires_at?: unknown;
  token?: unknown;
  /** NOT in today's receipt — `_finish_op` (`0004:62`) returns its `p_result`
   *  verbatim and `invite_member` (`0147:421`) builds that from
   *  `{invite_id, token_hash, expires_at}` only. Typed anyway, because the
   *  courtesy-name branch below is written to USE it the moment the door starts
   *  carrying it, rather than to be rewritten then. */
  firm_id?: unknown;
};

export async function handleInviteRequest(request: Request, deps: CourierDeps = {}): Promise<Response> {
  const correlationId = (deps.newCorrelationId ?? (() => crypto.randomUUID()))();
  const logFailure = deps.logFailure ?? defaultLogFailure;

  // ---- 1. Same origin, or nothing. Both signals fail-closed. ----------------
  // THE PROOF CARRIES THE ORIGIN (MEDIUM-2). What comes back is the validated
  // `Origin` header's own origin — scheme included, so this file inherits
  // `lib/same-origin.ts`'s https/loopback ruling — and it is the ONLY authority
  // the invitation link is ever built from. `request.url`'s authority is NOT
  // interchangeable with it: this wall deliberately accepts a match against
  // `x-forwarded-host`, so behind a proxy `request.url` can legitimately read
  // `http://internal.worker.local/...` on a request that passes.
  const proof = proveSameOrigin(request.headers, request.url);
  if (!proof.ok) {
    return courierError(403, "cross_origin", "this endpoint accepts same-origin requests only");
  }

  // ---- 2. Structure only. -------------------------------------------------
  // NOT a business check: an empty email and an unknown role are passed STRAIGHT
  // THROUGH to the door, which answers CLR10 'a valid email is required'
  // (`0147:380`) and CLR10 'bad role' (`0147:382`) in its own words. Validating
  // them here would be the UI guessing the DB's answer — plan §2 rule (b).
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.email !== "string" || typeof body.role !== "string") {
    return courierError(400, "invalid_request", 'expected a JSON body of {"email": string, "role": string}');
  }
  const email = body.email;
  const role = body.role;

  // ---- 3. A session to call the door WITH. --------------------------------
  // RESOLVED ONCE, AND THE DOOR IS CALLED WITH THOSE EXACT BYTES. Before P4-2's
  // fold this read an accessor that would re-read the cookie inside `pgrestRpc`,
  // so the token this branch checked and the token the door received were two
  // reads that could, in principle, differ. `fixedTokenAccessor` pins them to one
  // — the same "bind the guard to the request it authorises" reasoning the spine's
  // own fold applied, and it matters more here, because what follows this check is
  // a governed write and an irreversible email.
  const serverSession = await (deps.resolveSession ?? resolveServerSession)();
  if (serverSession === null) {
    return courierError(401, "no_session", "no live session — sign in and try again");
  }
  const session = fixedTokenAccessor(serverSession.accessToken);

  // ---- 4. Can this deployment deliver at all? (see the header) -------------
  const capability = inviteMailCapability(deps.env ?? process.env);
  if (!capability.ok) {
    return courierError(
      503,
      "mail_not_configured",
      "no invite mail transport is configured on this deployment — nothing was created",
      // The NAMES of the unset variables, never a value. An admin cannot fix a
      // misconfiguration they are told nothing about, and a variable name is not
      // a secret.
      { detail: `unset: ${capability.missing.join(", ")}` },
    );
  }

  // ---- 4b. CAN AN INVITE FOR THIS ADDRESS EXIST AT ALL? (FIND-1) ----------
  // Still a CAPABILITY question, not an authority one — it asks whether this
  // courier can finish the job, reads no role and grants nothing — but unlike
  // step 4 it depends on the recipient, so it needs its own branch.
  //
  // `generateLink({type:"invite"})` refuses an address that already belongs to a
  // confirmed Supabase account, and `uq_membership_active_user` makes that the
  // NORMAL case for anyone moving between firms. Asking after the door minted the
  // row is how a person's address gets blocked for seven days behind an invite
  // whose plaintext no longer exists. So it is asked here, and BOTH non-ok
  // outcomes refuse before the door: a positive "already registered", and a check
  // that could not answer at all.
  // ONE mailer per request, built here and reused at step 6 — the same instance
  // answers "can this be minted" and then does the minting, so the two can never
  // be talking to two differently-configured providers.
  const mailer = (deps.mailerFor ?? productionInviteMailer)(capability.config);
  let mintable: { ok: true } | { ok: false; reason: "already_registered" };
  try {
    mintable = await mailer.canMintFor(email);
  } catch (e) {
    const { failure, providerStatus } = classifyThrown(e);
    logFailure({ event: "invite_courier_failure", code: "mail_unavailable", failure, providerStatus, correlationId });
    return courierError(
      503,
      "mail_unavailable",
      "the invitation service could not be reached — nothing was created",
      { correlationId },
    );
  }
  if (!mintable.ok) {
    // A FIXED SENTENCE CLARA OWNS, never the provider's text. Two reasons: the
    // provider's wording is not ours to put in front of a person, and this
    // response is the one place where the answer is ABOUT a third party's
    // account. Enumeration is bounded to admin+ callers of a governed, audited
    // door — `_human_ctx` has not run yet at this point, but `invite_member`'s
    // own CLR10 'that email already belongs to a member of this firm' already
    // leaks the same class of fact to the same audience, so this widens nothing.
    // Recorded rather than assumed, and the owner is told (PR body OQ).
    return courierError(
      409,
      "recipient_has_account",
      "This address already has a Clara account — ask them to sign in with it.",
    );
  }

  // ---- 5. THE DOOR. The DB performs the authority check. ------------------
  const call = deps.callDoor ?? realCallDoor;
  const opKey = (deps.newOpKey ?? (() => crypto.randomUUID()))();
  let receipt: InviteMemberReceipt;
  try {
    receipt = await call<InviteMemberReceipt>(
      "invite_member",
      { p_email: email, p_role: role, p_op_key: opKey },
      { session },
    );
  } catch (e) {
    // A governed refusal is relayed verbatim and NO MAIL IS SENT — the single
    // most important behaviour in this file, and `tests/invite-courier.test.ts`
    // asserts it with a send-observer that a positive control proves would have
    // fired.
    if (e instanceof DoorRefusal) return refusalResponse(e);
    // NOT the thrown message (MEDIUM-3, applied to this branch too): a wire
    // failure's text carries the PostgREST URL it was talking to, project ref and
    // all. A governed REFUSAL is a different thing entirely and is relayed
    // verbatim above — that is the DB's own sentence, written to be read.
    const { failure, providerStatus } = classifyThrown(e);
    logFailure({ event: "invite_courier_failure", code: "transport", failure, providerStatus, correlationId });
    return courierError(502, "transport", "the invite door could not be reached — nothing was created", {
      correlationId,
    });
  }

  // ---- 6. Only now, send. -------------------------------------------------
  const inviteId = typeof receipt?.invite_id === "string" ? receipt.invite_id : null;
  const expiresAt = typeof receipt?.expires_at === "string" ? receipt.expires_at : null;
  const plaintext = typeof receipt?.token === "string" && receipt.token !== "" ? receipt.token : null;

  if (inviteId === null || expiresAt === null) {
    // The door returned a shape this courier does not recognise. It may or may
    // not have created something, so this reports a failure rather than telling
    // an admin an email went out (review law 2). No `invite` is carried, because
    // this branch does not know one.
    return courierError(502, "mail_failed", "the invite door returned a shape this courier does not recognise", {
      detail: "no invite_id/expires_at in the receipt",
      correlationId,
    });
  }

  if (plaintext === null) {
    // A REPLAY of the same op_key returns the PERSISTED receipt, which carries
    // only the sha256 — the plaintext is minted once and never re-surfaced
    // (`0147:420-422`'s own note). This courier mints a fresh op_key per request
    // so it should be unreachable; it is handled anyway because the alternative
    // is mailing a link with `?ct=undefined`. The invite genuinely exists, so it
    // is named: the only remedy is to revoke it and invite again.
    return courierError(502, "mail_failed", "this invite carries no usable token — revoke it and invite again", {
      invite: { invite_id: inviteId, expires_at: expiresAt },
      detail: "the door returned a receipt with no plaintext token (an op_key replay)",
      correlationId,
    });
  }

  const readFirmContext = deps.readFirmContext ?? (async (s: SessionTokenAccessor) => {
    const rows = await loadCallerContext(s);
    const only = rows.length === 1 ? rows[0] : undefined;
    return typeof only?.firm_name === "string" && typeof only?.firm_id === "string"
      ? { firm_id: only.firm_id, firm_name: only.firm_name }
      : null;
  });
  // BEST EFFORT, AND FAIL-OPEN BY DESIGN: the firm name is a courtesy in a
  // subject line, not a fact the invite depends on. A failed read must not turn a
  // successful invite into an error — `renderInviteEmail` omits the name instead.
  const firmContext = await readFirmContext(session).catch(() => null);
  // BOUND TO THE FIRM THE DOOR ACTED IN, OR OMITTED (LOW-8). `caller_context` is
  // a SECOND read, taken after the write, on a session that may hold more than
  // one membership; the name it returns is not by construction the name of the
  // firm `invite_member` minted the invite in. So it is used only when the
  // RECEIPT names a firm and that firm is this one. Today the receipt names none
  // (`_finish_op` returns `{invite_id, token_hash, expires_at}` verbatim), so the
  // honest answer is no name at all — an invitation that says "a firm" is worse
  // for nobody, while one that names the WRONG firm is a disclosure about a firm
  // the invitee has nothing to do with.
  const receiptFirmId = typeof receipt?.firm_id === "string" ? receipt.firm_id : null;
  const firmName =
    receiptFirmId !== null && firmContext !== null && firmContext.firm_id === receiptFirmId
      ? firmContext.firm_name
      : null;

  try {
    const hashedToken = await mailer.mintSupabaseTokenHash(email);
    // THE ORIGIN STEP 1 PROVED — never `new URL(request.url).origin`, which
    // behind a proxy is a different, possibly internal and plain-HTTP authority
    // (MEDIUM-2). So the link lands on the deployment the admin is actually
    // looking at, with no extra variable to misconfigure and no second
    // derivation to diverge.
    const content = renderInviteEmail({
      firmName,
      role,
      inviteUrl: buildInviteUrl(proof.origin, hashedToken, plaintext),
      expiresAt,
    });
    await mailer.send({ to: email, subject: content.subject, html: content.html });
  } catch (e) {
    // THE DOOR SUCCEEDED AND THE MAIL DID NOT GO. The invite exists, its
    // plaintext is now unrecoverable, and the only remedy is revoke-and-retry —
    // so the invite is named in the response and the surface says exactly that.
    // WHAT IS *NOT* IN THE RESPONSE: the thrown value, in any form. It came from
    // Supabase or from Resend, and Resend was handed the full secret URL. The
    // browser gets the correlation id; the log gets the classified code and the
    // provider's status number under that same id.
    const { failure, providerStatus } = classifyThrown(e);
    logFailure({ event: "invite_courier_failure", code: "mail_failed", failure, providerStatus, correlationId });
    return courierError(502, "mail_failed", "the invite was created but the email could not be sent", {
      invite: { invite_id: inviteId, expires_at: expiresAt },
      correlationId,
    });
  }

  // The plaintext is not here, and neither is the hash. Only what the browser
  // needs to re-read the invite list and tell the admin what happened.
  return Response.json({ ok: true, invite_id: inviteId, expires_at: expiresAt });
}
