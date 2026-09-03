// FS-4 C-6 Lane B — THE CHECKOUT REFUSAL FLASH.
//
// The two new server entries are POSTs that end in a redirect, so a refusal
// has to survive one navigation to be rendered. This is the SAME mechanism
// `app/(entry)/auth/confirm/confirm-flash.ts` uses and for the same reason
// (its own N1/裁-109 header): the URL carries only an opaque marker, and every
// value the page renders comes from an `httpOnly`, `SameSite=Strict`,
// `__Host-`-prefixed cookie nobody but this server could have set for this
// browser. A refusal in a query string is a refusal an attacker can hand a
// victim by link — on a money surface that is a phishing primitive ("your
// payment failed, click here").
//
// WHY A SECOND MODULE RATHER THAN WIDENING THE CONFIRM ONE. Different cookie,
// different lifetime, different payload, different reader — and the confirm
// cookie is scoped to a PRE-session surface while this one is only ever set
// for a caller who already has a session. Sharing one cookie name across the
// two would let a confirm refusal render as a checkout refusal after a
// redirect. The dev/loopback carve-out below is deliberately the same three
// conditions as `lib/same-origin.ts`'s, copied for the reason confirm-flash
// records: `__Host-` and `Secure` are ONE decision, and a shared import that
// let them diverge would produce a cookie the browser silently drops.
//
// THE REFUSAL TEXT IS THE DOOR'S OWN. `message` is a `DoorRefusal`'s verbatim
// sentence and `code` its CLR SQLSTATE — never re-worded here and never
// re-worded by the renderer (apps/web/AGENTS.md: "a `DoorRefusal` renders
// VERBATIM (code + message), never retried"). The bounded `kind` set is what
// chooses the CARD; the door's sentence is what the person reads inside it.

const PROD_COOKIE_NAME = "__Host-clara-checkout-flash";
const DEV_COOKIE_NAME = "clara-checkout-flash";

const MAX_AGE_SECONDS = 180;
/** A refusal sentence longer than this is not a door sentence — the longest
 *  `0163` raises is well under it. Bounded so a cookie cannot be grown into a
 *  storage channel, and so a malformed payload fails closed rather than
 *  rendering an arbitrary blob. */
const MAX_MESSAGE_CHARS = 400;
const MAX_CODE_CHARS = 16;

export type CheckoutFlashOutcome =
  /** A governed refusal from one of the four doors — rendered verbatim. */
  | { readonly kind: "refused"; readonly code: string; readonly message: string }
  /** The rate-wall courier could not produce a digest: no configured header,
   *  no pepper, or an unparseable address. Design part 3 §3's "absent ⇒
   *  checkout refuses" — its own card, never folded into `refused`, because
   *  nothing was asked of the DB and no door said no. */
  | { readonly kind: "no_origin_digest" }
  /** Stripe could not be reached, refused the Session, or answered a shape
   *  this build will not act on. The intent is open and unstamped, so
   *  retrying is safe and the card says so. */
  | { readonly kind: "stripe_unavailable" }
  /** `open_checkout_intent`'s plan and `get_current_checkout_plan()`'s plan
   *  disagree — the plan rotated mid-request. Not a door refusal and not a
   *  transport failure: a retry lands wholly on the new plan. */
  | { readonly kind: "plan_rotated" }
  /** The caller has no OPEN registration to check out for. */
  | { readonly kind: "no_registration" }
  /**
   * The caller ALREADY BELONGS TO A FIRM, so `claim_paid_firm` could never
   * serve them — `_create_firm_core` refuses `CLR10 actor already belongs to a
   * firm`, and `uq_membership_active_user` makes one active membership a
   * database property. Design §5's law is that "no path may strand a paying
   * customer without a firm", so this refuses at ⑤ rather than taking the
   * money at ⑤ and discovering it at ⑧.
   */
  | { readonly kind: "already_member" }
  /** Anything else this route could not classify. Distinct from every arm
   *  above so a card never claims a cause that was not observed. */
  | { readonly kind: "unavailable" };

export type CheckoutFlashPayload = CheckoutFlashOutcome & { readonly nonce: string };

function insecureLoopbackAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.NODE_ENV !== "production" &&
    (env.NODE_ENV === "development" || env.CLARA_ALLOW_INSECURE_LOOPBACK === "1")
  );
}

/** The cookie name AND whether it may carry `Secure` are ONE decision —
 *  `__Host-` is rejected outright by the browser without `Secure` + HTTPS. */
export function checkoutFlashCookie(
  env: Record<string, string | undefined> = process.env,
): { readonly name: string; readonly secure: boolean } {
  if (insecureLoopbackAllowed(env)) return { name: DEV_COOKIE_NAME, secure: false };
  return { name: PROD_COOKIE_NAME, secure: true };
}

export function checkoutFlashMaxAgeSeconds(): number {
  return MAX_AGE_SECONDS;
}

function boundedText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
}

/**
 * The single validated read. `null` for anything malformed, over-long,
 * nonce-mismatched or absent — never a partial or best-guess result, and a
 * mismatched nonce is treated exactly like no cookie at all.
 */
export function parseCheckoutFlash(
  raw: string | undefined,
  marker: string | undefined,
): CheckoutFlashPayload | null {
  if (typeof marker !== "string" || marker.length === 0) return null;
  if (typeof raw !== "string" || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.nonce !== "string" || candidate.nonce.length === 0) return null;
  if (candidate.nonce !== marker) return null;
  const nonce = candidate.nonce;

  switch (candidate.kind) {
    case "refused": {
      const code = boundedText(candidate.code, MAX_CODE_CHARS);
      const message = boundedText(candidate.message, MAX_MESSAGE_CHARS);
      return code === null || message === null ? null : { nonce, kind: "refused", code, message };
    }
    case "no_origin_digest":
    case "stripe_unavailable":
    case "plan_rotated":
    case "no_registration":
    case "already_member":
    case "unavailable":
      return { nonce, kind: candidate.kind };
    default:
      return null;
  }
}
