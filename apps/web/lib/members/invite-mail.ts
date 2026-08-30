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

/**
 * THE CLOSED SET OF FAILURE CODES THIS TRANSPORT MAY REPORT — independent review
 * of #455, MEDIUM-3.
 *
 * Every one of these is chosen BY THIS MODULE from an HTTP status or a structural
 * fact. None is ever derived from, or carries, a provider's own words. That is
 * the whole point: this transport hands Resend the FULL SECRET INVITE URL, so a
 * provider error string is a string that has been in the same process as both
 * bearer factors — and the previous version relayed `e.message` to the browser
 * and would have put it in any log line. A code from a fixed list cannot carry a
 * token, a key, a URL or an address, however the upstream error was worded.
 */
export type MailFailureCode =
  | "provider_unauthorized"
  | "provider_rejected"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_unreachable"
  | "no_token_returned"
  | "directory_unreadable"
  | "directory_too_large";

export const MAIL_FAILURE_CODES: readonly MailFailureCode[] = [
  "provider_unauthorized",
  "provider_rejected",
  "provider_rate_limited",
  "provider_unavailable",
  "provider_unreachable",
  "no_token_returned",
  "directory_unreadable",
  "directory_too_large",
];

/**
 * What this transport throws. `message` is COMPOSED from `code` and
 * `providerStatus` and from nothing else — deliberately, so that even a caller
 * that carelessly relays `e.message` cannot leak provider text, a key or a URL.
 * There is no field on this class that an upstream string reaches.
 */
export class InviteMailFailure extends Error {
  readonly code: MailFailureCode;
  /** The provider's HTTP status when there was one — a NUMBER, loggable as is. */
  readonly providerStatus: number | null;
  constructor(code: MailFailureCode, providerStatus: number | null = null) {
    super(providerStatus === null ? `invite mail: ${code}` : `invite mail: ${code} (${providerStatus})`);
    this.name = "InviteMailFailure";
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

export function isInviteMailFailure(e: unknown): e is InviteMailFailure {
  return e instanceof InviteMailFailure;
}

/**
 * A PROVIDER STATUS, OR NOTHING — native review M6.
 *
 * `error.status` on a Supabase `AuthError` is typed `number | undefined`, but it
 * arrives from the wire and this module's whole promise (MEDIUM-3) is that the
 * only things reaching a log line are a code from a closed set and a NUMBER. A
 * provider that answered `status: "429 Too Many Requests"`, or an object, would
 * otherwise ride that string straight into `InviteCourierLogEntry.providerStatus`
 * and into the message this class composes — the exact upstream-text leak the
 * closed record exists to make structurally impossible. Anything that is not an
 * integer is DISCARDED rather than coerced or stringified: a status this app
 * cannot read is no status.
 */
export function integerStatus(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

/** A provider HTTP status, classified into the closed set above. The BODY is
 *  never read: there is nothing in it this app is allowed to repeat. */
export function classifyProviderStatus(status: number): MailFailureCode {
  if (status === 401 || status === 403) return "provider_unauthorized";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

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
 * 40 pages covers 40,000 accounts at the requested page size — and 2,000 even if
 * the server clamps `per_page` to GoTrue's own 50 default — both orders of
 * magnitude beyond an accounting firm's staff roster. Past that the answer is an
 * EXCEPTION, never an optimistic `{ok:true}`: "I did not find it in the pages I
 * read" is not "it does not exist" (review law 2), and the courier turns that
 * into a refusal before the door rather than a dead invite.
 *
 * WHICH END-OF-LIST SIGNAL, AND WHY NOT THE OBVIOUS TWO. Read in the SHIPPED
 * client (`@supabase/auth-js@2.112.4`, `dist/module/GoTrueAdminApi.js`'s own
 * `listUsers`), because the choice of instrument is the whole soundness of this
 * check:
 *   · `data.nextPage === null` — REJECTED. It is parsed out of the `Link` header
 *     with `.substring(0, 1)`, so page 10 reads as page 1, and when the response
 *     carries no `Link` header at all the field simply stays `null` and `total`
 *     stays `0`. A "null" that means both "no more pages" and "I could not tell"
 *     is not a signal.
 *   · `users.length < perPage` — REJECTED. `perPage` is passed straight through
 *     to GoTrue's `per_page` query parameter, and a server that CLAMPS it would
 *     return a short page for every page — making page 1 look like the end of the
 *     list and answering "not registered" for an address on page 2. That is the
 *     exact bug this check exists to close, re-opened by the check itself.
 * So the signal is an EMPTY PAGE: a page that returns zero users is the end of
 * the list under any clamp, and it is the only thing that licenses `{ok:true}`.
 * The ceiling below is a refusal, never an optimistic answer.
 */
export const CAN_MINT_PAGE_SIZE = 1000;
export const CAN_MINT_MAX_PAGES = 40;

/**
 * THE ONE CANONICAL FORM — `clara.invite_member`'s own, transcribed exactly
 * (`0147:378-408`: `lower(btrim(p_email))`). Codex round 2, N2(2).
 *
 * FOUR SEAMS USED TO DISAGREE. The courier held the RAW address and gave it to
 * the door and to `generateLink`; this module trimmed-and-lowercased for the
 * directory scan; the DB stored `lower(btrim())`. So `" New@Example.test "`
 * could pass a scan that looked for the trimmed form, be stored by the door
 * under the trimmed form, and then be handed RAW to `generateLink` — after the
 * plaintext token had already been minted and could never be re-issued. The
 * courier now canonicalises ONCE at its boundary and passes the identical bytes
 * to scan, door, mint and send.
 *
 * `btrim(x)` WITH NO SECOND ARGUMENT TRIMS SPACES, NOT WHITESPACE. PostgreSQL's
 * default trim set is a single space (U+0020) — so a tab or a newline is NOT
 * removed by the DB, and `String.prototype.trim()` (which strips every Unicode
 * whitespace character) is the WRONG transcription: it would canonicalise
 * `"a@b\t"` to `"a@b"` while the DB stored `"a@b\t"`, putting the two back out
 * of step in exactly the way this function exists to prevent. Spaces only, both
 * ends, then `lower`.
 */
export function canonicalAddress(raw: string): string {
  return raw.replace(/^ +/, "").replace(/ +$/, "").toLowerCase();
}

/**
 * IS THIS ADDRESS ONE THIS APP CAN CANONICALISE THE SAME WAY THE PROVIDER WILL?
 *
 * Only for pure ASCII can it say yes. `String.prototype.toLowerCase()` follows
 * the Unicode default case-folding rules; PostgreSQL's `lower()` follows the
 * database collation; GoTrue is a Go program with its own. For ASCII all three
 * agree exactly. Outside it they demonstrably do not — U+0130 LATIN CAPITAL
 * LETTER I WITH DOT ABOVE lowercases to a TWO-code-point sequence in JavaScript
 * and to something else again elsewhere — and a canonical form that differs
 * between the scanner, the door and the mail provider is precisely the
 * dead-invite bug FIND-1 closes.
 *
 * So a non-ASCII address is REFUSED at the courier's boundary rather than
 * guessed at. That is a real, if narrow, product limitation: it is recorded as
 * an INFORM on the PR rather than hidden, and closing it properly means
 * implementing provider-equivalent normalisation, not relaxing this.
 */
export function isAsciiAddress(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value);
}

/** Address equality, on the canonical form both ends now share. */
export function sameAddress(a: string, b: string): boolean {
  return canonicalAddress(a) === canonicalAddress(b);
}

/**
 * IS THIS AUTH ROW A **CONFIRMED** USER? Codex round 2, N2(3).
 *
 * Supabase rejects `generateLink({type:"invite"})` for a CONFIRMED user and
 * permits it for an unconfirmed or nonexistent one. The scan used to treat the
 * mere EXISTENCE of a matching row as the refusal condition, which refused
 * perfectly inviteable unconfirmed accounts — a self-inflicted 409 on a flow
 * that would have worked.
 *
 * GoTrue's invite decision is EMAIL confirmation. `confirmed_at` is the legacy
 * aggregate of phone OR email confirmation, so reading it here wrongly refuses a
 * phone-only account that GoTrue can still invite by email.
 *
 * GoTrue serialises a nil `email_confirmed_at` with `omitempty`, making ABSENCE
 * the ordinary unconfirmed wire shape. Explicit null means the same. A present,
 * parseable ISO-8601 string is confirmed. A malformed string or a non-string is
 * not "unconfirmed" evidence: it is an unreadable directory row and throws
 * `directory_unreadable`, so it can never license the door to mint.
 */
export function isConfirmedUser(user: unknown): boolean {
  if (typeof user !== "object" || user === null) {
    throw new InviteMailFailure("directory_unreadable", null);
  }
  const u = user as Record<string, unknown>;
  if (!Object.hasOwn(u, "email_confirmed_at") || u.email_confirmed_at === null) return false;
  if (
    typeof u.email_confirmed_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(u.email_confirmed_at) &&
    Number.isFinite(Date.parse(u.email_confirmed_at))
  ) return true;
  throw new InviteMailFailure("directory_unreadable", null);
}

/**
 * The two outside worlds this transport touches, injectable — independent review
 * of #455, LOW-7. Not for convenience: it is what lets ONE test prove the two
 * claims this module's header makes and nothing else could check, namely that the
 * SERVICE-ROLE KEY is passed to the client constructor and to nothing else, and
 * that the only admin operations this app ever performs are `listUsers` (behind
 * `canMintFor`) and `generateLink`. Both defaults are the real thing.
 */
export type InviteMailTransportDeps = {
  createClient?: typeof createClient;
  fetch?: typeof fetch;
};

/** The single Resend endpoint this app posts to. Exported so a test pins the URL
 *  rather than re-typing it — and so a second endpoint cannot appear unnoticed. */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * The production transport. Built per request from the config — never hoisted to
 * module scope, so a key rotated in the environment takes effect without a
 * redeploy and no client outlives the request that made it.
 *
 * EVERY FAILURE PATH THROWS `InviteMailFailure` and nothing else, so the courier
 * has a CODE to log instead of an upstream sentence to relay (MEDIUM-3).
 */
export function productionInviteMailer(
  config: InviteMailConfig,
  deps: InviteMailTransportDeps = {},
): InviteMailer {
  const makeClient = deps.createClient ?? createClient;
  const doFetch = deps.fetch ?? fetch;
  const admin = () =>
    makeClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  return {
    async canMintFor(email: string): Promise<{ ok: true } | { ok: false; reason: "already_registered" }> {
      const client = admin();
      for (let page = 1; page <= CAN_MINT_MAX_PAGES; page += 1) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage: CAN_MINT_PAGE_SIZE });
        // A directory that could not be read is a question that was not
        // answered. It never becomes `{ok:true}`.
        //
        // AND `error` MUST BE TESTED FIRST, because the shipped client returns
        // `{ data: { users: [] }, error }` on an AuthError (`@supabase/auth-js`
        // 2.112.4, `GoTrueAdminApi.js`'s own `listUsers` catch) — an unreadable
        // directory arrives looking EXACTLY like the end of the list.
        if (error) throw new InviteMailFailure("directory_unreadable", integerStatus(error.status));
        // A POSITIVELY PRESENT ARRAY, or nothing (Codex round 2, N2(1)). The
        // previous `data?.users ?? []` turned a null payload — or a payload of
        // some shape this app has never seen — into an EMPTY PAGE, which the
        // end-of-list test below then read as "I have seen the whole directory
        // and the address is free". That is a derived state standing in as
        // positive evidence, which review law 2 forbids, and it licenses the
        // exact dead invite FIND-1 exists to prevent.
        const users: unknown = (data as { users?: unknown } | null)?.users;
        if (!Array.isArray(users)) throw new InviteMailFailure("directory_unreadable", null);
        for (const user of users) {
          const found = (user as { email?: string | null }).email;
          if (typeof found === "string" && sameAddress(found, email)) {
            // A ROW IS NOT EMAIL CONFIRMATION (Codex round 4, N2-2). Missing
            // `email_confirmed_at` is GoTrue's real serialised unconfirmed shape;
            // malformed present values throw `directory_unreadable` rather than
            // becoming a licence to mint.
            if (isConfirmedUser(user)) return { ok: false, reason: "already_registered" };
          }
        }
        // AN EMPTY PAGE IS THE END OF THE LIST, and it is the only thing that
        // licenses `{ok:true}` — see the ceiling's own note on why neither
        // `nextPage` nor a short page is a sound signal here. Only now has this
        // function actually SEEN every account rather than merely not-seen one.
        if (users.length === 0) return { ok: true };
      }
      throw new InviteMailFailure("directory_too_large");
    },
    async mintSupabaseTokenHash(email: string): Promise<string> {
      const { data, error } = await admin().auth.admin.generateLink({ type: "invite", email });
      if (error) throw new InviteMailFailure("provider_rejected", integerStatus(error.status));
      const hashed = data?.properties?.hashed_token;
      if (typeof hashed !== "string" || hashed === "") {
        // Absence is not evidence of anything except absence: refuse rather than
        // build a link with an empty path segment.
        throw new InviteMailFailure("no_token_returned");
      }
      return hashed;
    },
    async send(message): Promise<void> {
      let res: Response;
      try {
        res = await doFetch(RESEND_ENDPOINT, {
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
      } catch {
        // The thrown value is DROPPED, not wrapped: a network error's message can
        // carry the request URL, and this request's body carried both invite
        // secrets.
        throw new InviteMailFailure("provider_unreachable");
      }
      // The response BODY is never read. There is nothing in it this app is
      // allowed to repeat, and reading it only creates something to leak.
      if (!res.ok) throw new InviteMailFailure(classifyProviderStatus(res.status), res.status);
    },
  };
}
