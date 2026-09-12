// THE RESEND WALL — `POST {CLARA_RUNTIME_URL}/api/auth-wall/resend`, the
// server-to-server hop behind the confirmation card's "send me a new code"
// control (#621).
//
// WHY THIS EXISTS AT ALL, AND WHY IT IS NOT A BROWSER CALL. The card used to
// hold a seam whose production default answered `{kind:"unavailable"}` on
// every call, and its module header recorded the ruling that put it there: an
// earlier cut called `supabase.auth.resend({type:"signup", email})` DIRECTLY
// from the browser, with a user-typed address, reachable by an unauthenticated
// visitor — no session, no C1/C2 wall, no rate limit of any kind, against a
// provider whose email sending sits under a PROJECT-WIDE hourly budget shared
// with every legitimate signup. That seam's completion contract named exactly
// two obligations, and this module is the first of them:
//
//   (1) run the SAME C1/C2 attempt wall the verify path runs, keyed on the
//       SAME email + origin digest, so a resend spree counts against the
//       identical budget a guess spree would;
//   (2) only then ask the provider to send.
//
// Both now happen INSIDE one runtime request, for the reason
// `../verify/confirmation-wall.ts` records at length: a caller that can settle
// an attempt — or that merely holds its id — can zero the rate wall out, so
// the claim, the send and the settle never cross this boundary separately.
//
// THIS APP STILL OWES THE WALL THE ADDRESS, exactly as the confirm limb does:
// C2 keys on `sha256(pepper ‖ proxy-observed client IP)`, one value PER
// ADDRESS, and never on the browser's `Origin` header (identical for every
// visitor to one deployment — five refused attempts from anyone would lock out
// every applicant). `apps/web` sits between the browser and the runtime, so it
// forwards the address ITS edge observed and the runtime computes the digest.
// A missing address fails CLOSED here rather than travelling as a placeholder.
//
// FIVE OUTCOMES, AND TWO OF THEM WAIT FOR DIFFERENT REASONS. `locked` is the
// C1/C2 attempt budget; `rate_limited` is the provider's own per-address send
// cooldown. Folding them together would tell somebody who has typed nothing
// wrong that they had used up their attempts. Everything this build cannot act
// on — an unconfigured variable, a 500, a timeout, a network fault, a body in
// a shape this build does not recognise — lands on `unavailable`, which is
// never a claim that anything was sent.
//
// A WAIT LONGER THAN THIS CARD WILL PRINT IS STILL A WAIT. `../wait-seconds.ts`'s
// `WAIT_SECONDS_CEILING` is a DISPLAY bound; the runtime's
// `providerRetryAfterSeconds` is uncapped, so an hour-long cooldown is an
// ordinary answer. It is clamped and flagged (`atLeast`, which the copy
// renders as "at least"), never turned into `unavailable` — "we couldn't
// send" would be a plain falsehood about a wall that answered perfectly, and
// it would invite a retry that spends another attempt. Only a 429 carrying NO
// usable number falls back to a default.

import { AUTH_WALL_CLIENT_IP_HEADER } from "@/lib/rate-wall-courier";
import { waitSeconds } from "../wait-seconds";

export type ResendOutcome =
  /** The provider accepted the send. Never inferred from a 2xx alone. */
  | { readonly kind: "sent" }
  /** The C1/C2 attempt wall refused — the same budget a wrong guess spends.
   *  `atLeast` is set when the answer's own wait exceeded the shared
   *  `WAIT_SECONDS_CEILING` (`../wait-seconds.ts`) and was CLAMPED to it: the
   *  card must then say "at least", because the number it prints is a floor
   *  this app chose, not the wait the wall named. */
  | { readonly kind: "locked"; readonly retryAfterSeconds: number; readonly atLeast?: boolean }
  /** The provider's own per-address send cooldown. Same `atLeast` contract. */
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number; readonly atLeast?: boolean }
  /** The address is not one the provider will accept. */
  | { readonly kind: "invalid_email" }
  /** The wall could not be reached, is not configured, or answered something
   *  this build will not act on. Never a claim that a code was sent. */
  | { readonly kind: "unavailable" };

export type ResendConfirmationCodeParams = {
  readonly email: string;
  /** The proxy-observed client address this app's OWN edge saw. `null` when the
   *  courier could not produce one — see the fail-closed arm below. */
  readonly clientIp: string | null;
};

export type ResendConfirmationCode = (
  params: ResendConfirmationCodeParams,
) => Promise<ResendOutcome>;

export const RESEND_ENDPOINT_PATH = "/api/auth-wall/resend";
export const RUNTIME_URL_VAR = "CLARA_RUNTIME_URL";
export const SERVICE_TOKEN_VAR = "CLARA_AUTH_WALL_SERVICE_TOKEN";
/** The runtime's own timeout is its business; this is the wall this app puts on
 *  a hop a person is waiting behind. Exceeded ⇒ `unavailable`, never a hang and
 *  never a fabricated send. */
export const RESEND_TIMEOUT_MS = 10_000;

export type ResendConfirmationCodeDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
};

/** What a MISSING or unusable wait falls back to, per outcome. Different
 *  numbers because they are different mechanisms: `rate_limited` is a
 *  per-address send cooldown measured in tens of seconds, `locked` is the
 *  C1/C2 attempt window, which is 15 minutes wide.
 *
 *  The CLAMP-AND-FLAG rule itself — the correction this file was carrying a
 *  lie about (the previous `boundedInt` refused anything above the display
 *  ceiling, and the caller turned a `null` into `{kind:"unavailable"}`, whose
 *  card reads "we couldn't send a new code": FALSE for the case it actually
 *  fires on, an hour-long wait from a wall that answered perfectly) — now
 *  lives in `../wait-seconds.ts`, shared with the verify wall so the ceiling
 *  and the rule have one owner. */
const DEFAULT_LOCKED_SECONDS = 900;
const DEFAULT_RATE_LIMITED_SECONDS = 60;

export const resendConfirmationCode: ResendConfirmationCode = async (params) =>
  resendConfirmationCodeWith(params, {});

export async function resendConfirmationCodeWith(
  params: ResendConfirmationCodeParams,
  deps: ResendConfirmationCodeDeps,
): Promise<ResendOutcome> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const base = env[RUNTIME_URL_VAR];
  const serviceToken = env[SERVICE_TOKEN_VAR];
  if (typeof base !== "string" || base.trim() === "") return { kind: "unavailable" };
  if (typeof serviceToken !== "string" || serviceToken.trim() === "") return { kind: "unavailable" };
  // FAIL CLOSED ON A MISSING ADDRESS, HERE RATHER THAN THERE: with no client IP
  // the runtime cannot key C2 at all, and proceeding with a placeholder would
  // key it on ONE value for the whole deployment.
  if (params.clientIp === null) return { kind: "unavailable" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let response: Response;
  try {
    response = await doFetch(`${base.replace(/\/+$/, "")}${RESEND_ENDPOINT_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceToken.trim()}`,
        "Content-Type": "application/json",
        [AUTH_WALL_CLIENT_IP_HEADER]: params.clientIp,
      },
      // EXACTLY ONE FIELD. The outcome is the runtime's to derive from its own
      // wall and its own provider call, never from anything a client sent.
      body: JSON.stringify({ email: params.email }),
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    return { kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "unavailable" };
  }
  if (typeof body !== "object" || body === null) return { kind: "unavailable" };
  const answer = body as Record<string, unknown>;

  if (response.status === 200) {
    // POSITIVELY CHECKED: a 200 whose body does not SAY `sent` is not evidence
    // that a code went out, and telling somebody to watch their inbox for mail
    // nobody sent is the fake receipt this app forbids.
    return answer.outcome === "sent" ? { kind: "sent" } : { kind: "unavailable" };
  }
  if (response.status === 429) {
    // THE OUTCOME IS DECIDED BY THE OUTCOME FIELD, never by whether the wait
    // parsed. A 429 whose `outcome` this build does not recognise is still
    // `unavailable` — that is a shape refusal, which is a different thing from
    // a wait it could not read.
    if (answer.outcome === "locked") {
      const wait = waitSeconds(answer.retryAfterSeconds, DEFAULT_LOCKED_SECONDS);
      return { kind: "locked", retryAfterSeconds: wait.seconds, atLeast: wait.atLeast };
    }
    if (answer.outcome === "rate_limited") {
      const wait = waitSeconds(answer.retryAfterSeconds, DEFAULT_RATE_LIMITED_SECONDS);
      return { kind: "rate_limited", retryAfterSeconds: wait.seconds, atLeast: wait.atLeast };
    }
    return { kind: "unavailable" };
  }
  if (response.status === 400 && answer.outcome === "invalid_email") {
    return { kind: "invalid_email" };
  }
  return { kind: "unavailable" };
}
