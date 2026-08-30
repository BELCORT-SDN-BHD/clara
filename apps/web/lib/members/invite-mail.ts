// THE INVITE MAIL TRANSPORT — the only module in this app that reads a
// service-role key, and the only one that ever holds Clara's plaintext invite
// token. SERVER ONLY: nothing here is importable from a Client Component, and
// none of its environment variables is `NEXT_PUBLIC_`-prefixed.
//
// WHY THE COURIER COMPOSES THE MAIL RATHER THAN LETTING SUPABASE SEND IT.
// Design §4 C says the handler "uses the service key to send the Supabase
// invite". That was written on 2026-08-27, BEFORE the 2026-08-30 ruling (option
// (a)) put a SECOND secret in the link: the invite URL is now
// `/invite/<supabase_token_hash>?ct=<clara_token>`
// (`lib/identity/doors.ts`'s `INVITE_CLARA_TOKEN_PARAM`, P4-1). Supabase's
// `inviteUserByEmail` renders the project's own email template, and no template
// variable carries Clara's token — the only way to smuggle it in would be through
// `data`/`user_metadata`, which PERSISTS the plaintext in `auth.users`, exactly
// what 裁-16a spent a migration removing from `op_receipts`.
//
// So the courier uses `generateLink` — Supabase's documented path "to be sent via
// a custom email provider", which mints the same `hashed_token` the template's
// `{{ .TokenHash }}` would have rendered and sends nothing — builds the two-secret
// URL itself, and posts the mail. The service key is still what sends: it is what
// mints the Supabase half of the link. The scope note is reported to the lead
// rather than worked around (order §0.2), because it is a real divergence from a
// sentence in the design of record, forced by a ruling that came after it.
//
// THE PROVIDER IS RESEND, by the ClaraBook handoff's own choice
// (`docs/plan/active/frontend-handoff-2026-08-23.md:33` — "Email. Resend, and an
// email NEVER carries client data — notification + deep link only"). Called over
// its plain HTTPS API (`POST https://api.resend.com/emails`, `Authorization:
// Bearer …`, verified against Resend's own API reference via context7 on
// 2026-08-30) rather than through the `resend` npm package: one `fetch`, zero new
// dependencies, and it runs unchanged on Cloudflare Workers where this app
// deploys.
//
// THE MAIL CARRIES NO CLIENT DATA — the handoff's rule, kept literally. It names
// the firm the invitee is joining, the role they are being given, the link, and
// when it expires. Nothing about any client, any ledger, any number.

import { createClient } from "@supabase/supabase-js";

import { INVITE_CLARA_TOKEN_PARAM } from "@/lib/identity/doors";

/** The four server-only variables this transport reads. Named as data so
 *  `inviteMailCapability` can report exactly which are missing and the courier's
 *  refusal can say so without printing a value. */
export const INVITE_MAIL_ENV_NAMES = {
  supabaseUrl: "NEXT_PUBLIC_SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  resendApiKey: "RESEND_API_KEY",
  from: "INVITE_MAIL_FROM",
} as const;

export type InviteMailConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  resendApiKey: string;
  from: string;
};

export type InviteMailCapability =
  | { ok: true; config: InviteMailConfig }
  | { ok: false; missing: string[] };

/**
 * Is this deployment able to send an invite at all?
 *
 * READ THE ORDERING NOTE IN `lib/members/courier.ts` BEFORE MOVING THIS CALL.
 * The courier checks this BEFORE it calls `invite_member`, and that is not the
 * courier pretending to be a guard: it reads no caller input, decides nothing
 * about authority, and answers 503 rather than 401/403. It exists because an
 * invite whose mail cannot go out is WORSE than no invite — `invite_member`
 * hands its plaintext token to its caller exactly once (`0147:418-423`), so an
 * unmailable invite is permanently unusable AND blocks that email for seven days
 * behind CLR10 'an invite is already pending for this email' until someone
 * revokes it.
 *
 * Fail-closed: every variable must be POSITIVELY present and non-blank.
 */
export function inviteMailCapability(env: Record<string, string | undefined>): InviteMailCapability {
  const missing: string[] = [];
  const read = (name: string): string => {
    const v = env[name];
    if (typeof v !== "string" || v.trim() === "") {
      missing.push(name);
      return "";
    }
    return v.trim();
  };
  const supabaseUrl = read(INVITE_MAIL_ENV_NAMES.supabaseUrl);
  const serviceRoleKey = read(INVITE_MAIL_ENV_NAMES.serviceRoleKey);
  const resendApiKey = read(INVITE_MAIL_ENV_NAMES.resendApiKey);
  const from = read(INVITE_MAIL_ENV_NAMES.from);
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true, config: { supabaseUrl, serviceRoleKey, resendApiKey, from } };
}

/**
 * THE TWO-SECRET INVITE URL — `/invite/<supabase_token_hash>?ct=<clara_token>`.
 *
 * The path segment is Supabase's `hashed_token`, consumed by `verifyOtp` (P2's
 * shipped contract, byte-untouched). The query parameter is CLARA's own token,
 * which `clara.accept_invite` sha256's and looks the invite up by (`0145:702`).
 * They are not interchangeable — the path segment fed to the door refuses
 * CLR10 'invalid invite token' every time.
 *
 * The parameter NAME is imported from `lib/identity/doors.ts`, never retyped: the
 * reading end (`app/invite/[token]/page.tsx`) imports the same constant, so a
 * courier that spelled it `?token=` cannot exist. That was P4-1's stated reason
 * for declaring it in one file, and this is the other end it named.
 *
 * `origin` is the request's OWN proven origin (see the courier), so the link
 * lands on the same deployment the admin is looking at. Both secrets are
 * percent-encoded; `URL`/`searchParams` does that for us rather than by hand.
 */
export function buildInviteUrl(origin: string, supabaseTokenHash: string, claraToken: string): string {
  const url = new URL(`/invite/${encodeURIComponent(supabaseTokenHash)}`, origin);
  url.searchParams.set(INVITE_CLARA_TOKEN_PARAM, claraToken);
  return url.toString();
}

/** Minimal HTML escaping for the three values that reach the body — a firm name
 *  is free text a person typed, and an email is free text too. Neither is
 *  trusted into markup unescaped. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type InviteMailContent = { subject: string; html: string };

/**
 * The mail body. English only and deliberately NOT routed through next-intl:
 * this string is composed on the server for a recipient who has no session, no
 * locale cookie and — by definition — no account yet, so there is no locale to
 * read. next-intl binds the app's rendered UI (apps/web/AGENTS.md); it is not a
 * mail templating system, and pretending the courier can pick the invitee's
 * language would be inventing a fact. Recorded here so a later i18n sweep reads
 * this as a known, reasoned boundary rather than a miss.
 *
 * `firmName` is null when the courier could not read it — the sentence then
 * simply omits it rather than guessing one.
 */
export function renderInviteEmail(args: {
  firmName: string | null;
  role: string;
  inviteUrl: string;
  expiresAt: string;
}): InviteMailContent {
  const firm = args.firmName ? escapeHtml(args.firmName) : null;
  const subject = firm ? `You have been invited to ${args.firmName} on Clara` : "You have been invited to Clara";
  const where = firm ? `<strong>${firm}</strong>` : "a firm";
  const html = [
    `<p>You have been invited to join ${where} on Clara as <strong>${escapeHtml(args.role)}</strong>.</p>`,
    `<p><a href="${escapeHtml(args.inviteUrl)}">Accept the invitation</a></p>`,
    `<p>This link works once and expires on ${escapeHtml(args.expiresAt)}. If you were not expecting it, ignore this email — nothing happens until you open the link and set a password.</p>`,
  ].join("\n");
  return { subject, html };
}

/**
 * The transport, as an interface so `tests/invite-courier.test.ts` can drive the
 * courier's ordering with an OBSERVER instead of a network. The negative the
 * order names as the one worth writing — "the courier sends NO mail when the door
 * refused" — is only evidence if a send would otherwise have been observed, so
 * the same fake proves both directions.
 */
export type InviteMailer = {
  /**
   * CAN AN INVITE FOR THIS ADDRESS BE MINTED AT ALL? Asked BEFORE the door, and
   * the reason is FIND-1 (independent review of #455, HIGH).
   *
   * `generateLink({type:"invite"})` REJECTS an address that already belongs to a
   * CONFIRMED Supabase user — Supabase's own words, re-read via context7 on
   * 2026-08-30: *"Inviting an email that already belongs to a confirmed user will
   * return an error."* That is not an edge case here. `uq_membership_active_user`
   * (`0002:221`) allows ONE active membership per user across the whole estate,
   * and `lib/members/doors.ts` records that re-inviting a removed person mints a
   * FRESH membership row — so **every move-between-firms invite** takes that
   * path. Without this check the sequence was: `invite_member` succeeds → the row
   * is minted → `generateLink` throws → 502 `mail_failed` → the plaintext is
   * unrecoverable → and the address is blocked in that firm for SEVEN DAYS behind
   * CLR10 'an invite is already pending for this email' until an admin notices
   * and revokes it. The old test pinned the SHAPE of that failure; it never
   * proved the flow worked.
   *
   * Resolves `{ok:false, reason:"already_registered"}` when the address is
   * positively found. THROWS when it cannot answer — never `{ok:true}` on a
   * doubt. The courier treats both non-ok outcomes the same way: refuse BEFORE
   * the door, mint nothing.
   */
  canMintFor(email: string): Promise<{ ok: true } | { ok: false; reason: "already_registered" }>;
  /** Mints (and, for a new address, creates) the Supabase auth user's invite OTP
   *  and returns its `hashed_token` — the value `{{ .TokenHash }}` would have
   *  rendered, and the value `verifyOtp` consumes. Sends no email. */
  mintSupabaseTokenHash(email: string): Promise<string>;
  /** Delivers one message. Throws on any non-2xx or transport failure — the
   *  courier reports `mail_failed` and never claims a send it did not see. */
  send(message: { to: string; subject: string; html: string }): Promise<void>;
};

/** Everything Resend returned that is safe to relay to an admin: its own error
 *  text, never a key, never a body. */
function resendFailureDetail(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === "string" && m !== "") return `${status}: ${m}`;
  }
  return `the mail provider answered ${status}`;
}

/**
 * The production transport. Built per request from the config — never hoisted to
 * module scope, so a key rotated in the environment takes effect without a
 * redeploy and no client outlives the request that made it.
 */
/**
 * How far `canMintFor` will page before it gives up and REFUSES TO ANSWER.
 *
 * `supabase-js`'s admin API has no lookup-by-email: `listUsers(params?)` takes
 * `PageParams` — `{page, perPage}` and NOTHING else — and there is no
 * `getUserByEmail` (verified twice on 2026-08-30: the installed
 * `@supabase/auth-js@2.112.4` typings, and the current Supabase reference via
 * context7, which spells out "The only parameter type for listUsers is PageParams
 * … No email or filter field exists"). GoTrue's REST endpoint does accept a
 * `filter` query parameter, but it is undocumented in that reference, and a
 * filter that were silently IGNORED would hand back page 1 of every user, find no
 * match, and answer "not registered" — re-opening the exact bug this check
 * closes, invisibly. So this pages the documented, typed API instead.
 *
 * 20 × 1000 covers 20,000 accounts, which is orders of magnitude beyond an
 * accounting firm's staff roster. Past that the answer is an EXCEPTION, never an
 * optimistic `{ok:true}`: "I did not find it in the pages I read" is not "it does
 * not exist" (review law 2), and the courier turns that into a refusal before the
 * door rather than a dead invite.
 */
export const CAN_MINT_PAGE_SIZE = 1000;
export const CAN_MINT_MAX_PAGES = 20;

/** Case-insensitive, whitespace-trimmed address equality — the same normalisation
 *  `clara.invite_member` applies (`0147:379`: `lower(btrim(p_email))`), so this
 *  check and the door agree on what "the same address" means. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function productionInviteMailer(config: InviteMailConfig): InviteMailer {
  return {
    async canMintFor(email: string): Promise<{ ok: true } | { ok: false; reason: "already_registered" }> {
      const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      for (let page = 1; page <= CAN_MINT_MAX_PAGES; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: CAN_MINT_PAGE_SIZE });
        if (error) throw new Error(error.message);
        const users = data?.users ?? [];
        for (const user of users) {
          const found = (user as { email?: string | null }).email;
          if (typeof found === "string" && sameAddress(found, email)) {
            return { ok: false, reason: "already_registered" };
          }
        }
        // A SHORT PAGE IS THE END OF THE LIST — and it is the only thing that
        // licenses `{ok:true}`, because only then has this function actually SEEN
        // every account rather than merely not-seen one.
        if (users.length < CAN_MINT_PAGE_SIZE) return { ok: true };
      }
      throw new Error(
        `the account directory exceeds ${CAN_MINT_MAX_PAGES * CAN_MINT_PAGE_SIZE} entries — this check cannot confirm the address is free`,
      );
    },
    async mintSupabaseTokenHash(email: string): Promise<string> {
      const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email });
      if (error) throw new Error(error.message);
      const hashed = data?.properties?.hashed_token;
      if (typeof hashed !== "string" || hashed === "") {
        // Absence is not evidence of anything except absence: refuse rather than
        // build a link with an empty path segment.
        throw new Error("the auth provider returned no invite token hash");
      }
      return hashed;
    },
    async send(message): Promise<void> {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.resendApiKey}`,
        },
        body: JSON.stringify({
          from: config.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
        }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        throw new Error(resendFailureDetail(res.status, body));
      }
    },
  };
}
