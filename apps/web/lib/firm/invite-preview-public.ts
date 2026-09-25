// #871 — THE SIGNED-OUT INVITE PREVIEW, read from `apps/web`'s SERVER before anyone signs in.
//
// Owner's ruling, 2026-09-23 (ticket #871): the invitee sees which firm and role an invite names
// "through a server-only read that no browser or client credential can reach", served by "the
// runtime, not by the browser or by the web app's PostgREST connection", and "the web app never
// holds the credential".
//
// SO THIS MODULE HOLDS NO DATABASE CREDENTIAL AND MAKES NO POSTGREST CALL. It is a courier to the
// runtime's `POST /api/invite-preview`, on exactly the shape
// `app/(entry)/auth/confirm/verify/confirmation-wall.ts` already uses for this estate's other
// pre-session hop: the shared `CLARA_AUTH_WALL_SERVICE_TOKEN` as a bearer, the address THIS app's
// own edge observed forwarded under `AUTH_WALL_CLIENT_IP_HEADER`, and nothing else. The runtime
// computes the rate-wall digest with its own copy of the pepper; this app never computes one for
// this limb and never sees the invite's real address.
//
// SERVER ONLY. The one caller is `app/(entry)/invite/[token]/page.tsx`, a server component. The
// service token is read from `process.env` at request time and never reaches a prop, a payload or
// a URL — it is an `Authorization` header on a server-to-server POST. `scripts/check-public-key.mjs`
// is what proves no `NEXT_PUBLIC_` sibling exists; nothing here creates one.
//
// THE INVITE TOKEN TRAVELS IN THE BODY. Never the path, never the query. A token in a URL lands in
// the runtime's access log, in every intermediary's, and in the `Referer` of anything the answer
// links to — which is the same reason the invite page sets `referrer: "no-referrer"` one hop
// earlier, and the reason the runtime route has no GET entrance at all.
//
// ============================================================================================
// DEFINITE vs INDEFINITE — the same distinction `./invite-preview.ts` draws, and for the same
// reason. A DEFINITE negative is the door's own answer (404: unknown, expired, revoked or already
// accepted — ONE answer for four facts, and this module offers no way to ask which, because there
// is nothing to ask). Everything else DEGRADES: unconfigured, unauthorised, a 5xx, a timeout, a
// rate refusal, a body this build will not act on. A reader that could not read is not a verdict,
// and `clara.accept_invite` remains the authority on whether this invitation can be accepted.
//
// #1095 — ONE INDEFINITE REASON CARRIES A PAYLOAD. `rate_limited` still degrades exactly like
// `transport` and `unreadable` (the page still renders the sign-in step; the invitation is still
// untouched) but it ALSO carries the wall's own `retryAfterSeconds`, clamped and flagged by the
// same `waitSeconds` rule every other pre-session wait on this app uses — so the page CAN tell a
// visitor how long to wait, where it could not before (the runtime already computed the number;
// this module used to throw it away at `indefinite("rate_limited")`).
//
// WHAT THE PAGE DOES WITH EACH, stated here because it is a product decision rather than a
// transport one: it renders the preview block when the answer is `ok`, and renders NOTHING extra
// otherwise — the person carries on to the existing sign-in flow either way. The signed-out
// surface never becomes a second place that BLOCKS an invitation: the post-verification preview
// (`./invite-preview.ts`, `clara.preview_invite`) already owns that, with a signed-in reader whose
// address the door has checked.

import {
  INVITE_PREVIEW_ROLES,
  INVITE_PREVIEW_STATUSES,
  type InvitePreviewRole,
  type InvitePreviewStatus,
} from "./invite-preview";
import { AUTH_WALL_CLIENT_IP_HEADER } from "@/lib/rate-wall-courier";
// #1095 -- THE ONE CLAMP-AND-FLAG OWNER for a wait this app measured across a process boundary,
// shared with the confirm lane's resend and verify walls and `password-recovery-form.tsx`'s own
// provider cooldown (see that module's header). This route's wall is the SAME shape
// (`0309_invite_preview_public_door.sql`: a 15-minute/5-reload window, `least(900, greatest(0,
// …))`), so it reuses the ceiling and the "clamp, never downgrade" rule rather than a second copy.
import { waitSeconds } from "@/app/(entry)/auth/confirm/wait-seconds";

/** The runtime route this module calls. Declared once, at this end; the runtime declares its own
 *  copy as `INVITE_PREVIEW_PATH` and `packages/runtime/tests/p871-invite-preview-db.test.mjs`
 *  drives THAT one, so a drift shows up as a 404 in a cell rather than in production. */
export const INVITE_PREVIEW_ENDPOINT_PATH = "/api/invite-preview";
export const RUNTIME_URL_VAR = "CLARA_RUNTIME_URL";
/** ONE pre-session server-to-server secret for the pre-session routes — the same variable the
 *  confirm wall uses, because the runtime gates both routes on it. */
export const SERVICE_TOKEN_VAR = "CLARA_AUTH_WALL_SERVICE_TOKEN";
/** The runtime's own timeout is its business; this is the wall this app puts on a hop a person is
 *  waiting behind while a page renders. Exceeded ⇒ indefinite, never a hang and never a verdict. */
export const INVITE_PREVIEW_TIMEOUT_MS = 4_000;

/** The four fields the door returns, and the only ones this app renders. */
export type PublicInvitePreviewRow = {
  firm_name: string;
  role: InvitePreviewRole;
  status: InvitePreviewStatus;
  /** A HINT, never an address: one leading character, three fixed stars, the domain. */
  masked_email: string;
};

export type PublicInvitePreviewOutcome =
  | { ok: true; preview: PublicInvitePreviewRow }
  /** The door's own single refusal: unknown, expired, revoked or already accepted, told apart by
   *  nothing, because that is the contract (no existence oracle). */
  | { ok: false; kind: "not_previewable" }
  | {
      ok: false;
      kind: "indefinite";
      /** `transport` — we never heard back, or the hop is not configured. `unreadable` — an answer
       *  that is not what the route returns. Neither carries a wait: there is nothing to count
       *  down to. */
      reason: "transport" | "unreadable";
    }
  | {
      ok: false;
      kind: "indefinite";
      /** The wall refused; the invitation is untouched (0309's own comment: "the refusal is soft
       *  by construction") and the page still offers the sign-in step. Unlike the two reasons
       *  above, THIS one carries a number, because the runtime already computed one (#1095). */
      reason: "rate_limited";
      /** The door's own wait, CLAMPED to `WAIT_SECONDS_CEILING` (`../../app/(entry)/auth/confirm/
       *  wait-seconds.ts`) and never downgraded to a shorter guess. */
      readonly retryAfterSeconds: number;
      /** Set only when the door's own wait exceeded the display ceiling and was clamped to it —
       *  see `waitSeconds`'s own doc for why that is flagged rather than silently understated. */
      readonly atLeast?: boolean;
    };

export type ReadPublicInvitePreviewParams = {
  /** Clara's own invite token, as the link's `ct` query parameter carries it. */
  readonly token: string;
  /** The proxy-observed client address this app's OWN edge saw, forwarded so the runtime can key
   *  its rate wall. `null` when the courier could not produce one — see the fail-closed arm. */
  readonly clientIp: string | null;
};

export type ReadPublicInvitePreviewDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
};

const NON_EMPTY = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/**
 * Does this value carry EVERY declared field, each of the type the route returns? All four are
 * checked, not the two a given face happens to render: a row is trusted downstream as a whole, so
 * a partial check hands a half-validated object onward wearing a fully-typed name. An unknown role
 * or status is a DB fact this build does not understand, and it denies rather than guessing —
 * `lib/firm/capabilities.ts` could not rank an unknown role, so no surface could say honestly what
 * it grants.
 */
export function isPublicInvitePreviewRow(value: unknown): value is PublicInvitePreviewRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (!NON_EMPTY(row.firm_name)) return false;
  if (typeof row.role !== "string" || !(INVITE_PREVIEW_ROLES as readonly string[]).includes(row.role)) return false;
  if (typeof row.status !== "string" || !(INVITE_PREVIEW_STATUSES as readonly string[]).includes(row.status)) return false;
  if (!NON_EMPTY(row.masked_email)) return false;
  return true;
}

const indefinite = (reason: "transport" | "unreadable"): PublicInvitePreviewOutcome => ({
  ok: false,
  kind: "indefinite",
  reason,
});

/** #1095 — the SAME wall shape as the confirm lane's C1/C2 lockout (0309's own header: "this file
 *  copies the SHAPE" of `clara.confirmation_attempts`'s wall), so a missing or unusable wait falls
 *  back to that wall's own ceiling — the honest worst case — rather than a shorter invented
 *  number. Mirrors `../../app/(entry)/auth/confirm/verify/confirmation-wall.ts`'s
 *  `DEFAULT_LOCKED_SECONDS`. */
const DEFAULT_RATE_LIMITED_SECONDS = 900;

/** Reads the door's own `retryAfterSeconds` off a 429 body and returns the RATE-LIMITED outcome.
 *  NEVER THROWS: an unparseable or shapeless body still yields a rate-limited outcome (the status
 *  code alone already proved that much) with the wall's own worst-case wait. */
async function rateLimitedOutcome(response: Response): Promise<PublicInvitePreviewOutcome> {
  let raw: unknown;
  try {
    const body: unknown = await response.json();
    raw = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).retryAfterSeconds
      : undefined;
  } catch {
    raw = undefined;
  }
  const wait = waitSeconds(raw, DEFAULT_RATE_LIMITED_SECONDS);
  return wait.atLeast
    ? { ok: false, kind: "indefinite", reason: "rate_limited", retryAfterSeconds: wait.seconds, atLeast: true }
    : { ok: false, kind: "indefinite", reason: "rate_limited", retryAfterSeconds: wait.seconds };
}

/**
 * Read the signed-out preview for ONE invite token. NEVER THROWS — every observation, including a
 * thrown transport, becomes one of the typed outcomes above, because this is a courtesy read taken
 * while a page renders and an exception here would replace the invite page with an error.
 */
export async function readPublicInvitePreview(
  params: ReadPublicInvitePreviewParams,
  deps: ReadPublicInvitePreviewDeps = {},
): Promise<PublicInvitePreviewOutcome> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = env[RUNTIME_URL_VAR];
  const serviceToken = env[SERVICE_TOKEN_VAR];
  // FAIL CLOSED BEFORE THE WIRE, in every half. A blank token identifies nothing; a missing
  // address means the runtime would answer 503 anyway (its wall cannot be keyed), and sending it
  // would spend a round trip a person is waiting behind to learn what is already known here.
  if (!NON_EMPTY(params.token)) return indefinite("transport");
  if (!NON_EMPTY(base)) return indefinite("transport");
  if (!NON_EMPTY(serviceToken)) return indefinite("transport");
  if (params.clientIp === null) return indefinite("transport");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INVITE_PREVIEW_TIMEOUT_MS);
  let response: Response;
  try {
    response = await doFetch(`${base.replace(/\/+$/, "")}${INVITE_PREVIEW_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken.trim()}`,
        "Content-Type": "application/json",
        [AUTH_WALL_CLIENT_IP_HEADER]: params.clientIp,
      },
      body: JSON.stringify({ token: params.token }),
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return indefinite("transport");
  } finally {
    clearTimeout(timer);
  }

  // THE ONE DEFINITE NEGATIVE, read off the status alone. Its body is a one-key constant and this
  // module does not inspect it: there is nothing in it to tell four facts apart, by design.
  if (response.status === 404) return { ok: false, kind: "not_previewable" };
  if (response.status === 429) return rateLimitedOutcome(response);
  if (response.status !== 200) return indefinite("transport");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return indefinite("unreadable");
  }
  if (typeof body !== "object" || body === null) return indefinite("unreadable");
  const answer = body as Record<string, unknown>;
  if (answer.outcome !== "preview") return indefinite("unreadable");
  if (!isPublicInvitePreviewRow(answer.preview)) return indefinite("unreadable");
  const { firm_name, role, status, masked_email } = answer.preview;
  return { ok: true, preview: { firm_name, role, status, masked_email } };
}
