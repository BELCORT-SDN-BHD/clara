// FS-4 C-6 Lane B — THE STRIPE CHECKOUT SESSION, created by the server-only
// `POST /checkout` route (checkout-gate-design part 3 §2 / §3).
//
// NO SDK, BY NECESSITY AND BY PREFERENCE. `stripe` is not a dependency of this
// app and this lane may not add one (`pnpm install` rewrites the shared store
// every other lane's worktree junctions). The Checkout Sessions endpoint is a
// form-encoded POST with a bearer key, so `fetch` is the whole client — and
// `apps/web` builds for Cloudflare Workers, where a `fetch`-based client is
// the shape the SDK itself would have to be configured into anyway.
//
// THE SECRET NEVER LEAVES THIS MODULE. `STRIPE_SECRET_KEY` is read here, sent
// in one `Authorization` header, and never logged, never returned, never put
// in a URL and never handed to a caller. 裁-114 makes `apps/web`'s server-only
// Route Handlers a lawful second holder of a service credential, and design
// part 3 §3 assigns this key to "`apps/web` (the checkout route) and the
// runtime". Absent key ⇒ this module refuses; it never falls back to an
// unauthenticated call that would 401 with the request body in the log.
//
// EVERY VALUE IN THE SESSION COMES FROM THE DATABASE.
//   · `line_items[0].price` — `open_checkout_intent`'s own `stripe_price_id`,
//     which the door read from `clara.stripe_object_map`. NEVER a literal
//     (裁-42, billing design §3.11: the lane's code reads the ids and never
//     authors them).
//   · `payment_method_collection` — `get_current_checkout_plan()`'s value,
//     derived in the DB from `amount_cents`/`amounts_ruled` (G13 / 裁-88).
//   · `mode` — `subscription`, per part 3 §2. This is the only structural
//     constant, and it is a shape, not a number.
//   · `metadata` — the three ids the applier cross-checks (part 3 §2:
//     `{clara_registration_id, clara_applicant, clara_intent_id}`). C-5's
//     applier refuses and writes a `stripe_event_problems` row when they name
//     nothing or disagree (cells W-M / W-N), so a typo here strands nobody —
//     it is loudly refused.
// NO AMOUNT IS SENT AND NONE IS READ BACK. Stripe must never originate an
// authoritative number (design §6's named non-goals, billing Annex A D12).

export const STRIPE_SECRET_KEY_VAR = "STRIPE_SECRET_KEY";
/**
 * THE ONE BASE, AND IT IS NOT OVERRIDABLE — a decision this lane made,
 * reversed, and is recording because the reversal is the interesting part.
 *
 * An earlier cut added a `CLARA_E2E_STRIPE_API_BASE` override so 裁-86's
 * browser leg could walk the Stripe hop (the call is server-side, so
 * Playwright's `page.route` cannot see it), fenced behind the estate's own
 * dev/loopback carve-out. The fence worked exactly as written, and that is
 * what killed the idea: `next start` sets `NODE_ENV=production`, so the
 * browser leg runs against a build where the override is — correctly —
 * ignored.
 *
 * The only way to make the walk reach the stand-in would have been to loosen
 * the fence, and hard constraint 14's operative clause forbids exactly that:
 * "the product's security mechanisms are the thing under test and are NEVER
 * weakened or bypassed for testing convenience". So the override is GONE
 * rather than relaxed. The walk covers ⑤'s refusal arm and the return leg for
 * real, and the Stripe request's own wire shape is pinned field by field in
 * `./stripe-session.test.ts` against the shipped body. The PR body says
 * which is which.
 */
export const STRIPE_API_BASE = "https://api.stripe.com/v1";

/**
 * Pinned so a change to the ACCOUNT's default version cannot silently move the
 * response shape under a route that reads `id` and `url` out of it.
 *
 * MEASURED, NOT REMEMBERED: `2026-08-26.dahlia` is the current version per
 * Stripe's own versioning page (docs.stripe.com/sdks/versioning, read through
 * the Stripe docs MCP on 2026-09-02 — "The current version of the API is
 * 2026-08-26.dahlia"). The first cut of this file pinned a plausible-looking
 * string from memory; that is the model-as-oracle class, and a wrong version
 * header is a 400 on the money surface. Bumping this is a deliberate act with
 * a changelog read, never a drive-by.
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia";

export type CheckoutSessionRequest = {
  readonly stripePriceId: string;
  readonly paymentMethodCollection: "if_required" | "always";
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly registrationId: string;
  readonly applicant: string;
  readonly intentId: string;
  /**
   * Stripe's own `Idempotency-Key`, built by `checkoutIdempotencyKey()` from
   * the DURABLE retry identity rather than from a per-request value.
   *
   * WHY IT IS NOT AN OP KEY, and this comment used to say the opposite of what
   * the code did. `0161`'s own comment makes the durable identity "the
   * applicant's one locked, unstamped CURRENT-plan intent" — an op key minted
   * per POST is a fresh value on every retry, so two POSTs landing on the SAME
   * intent would mint TWO Sessions, and `record_checkout_session` refuses the
   * second with `CLR09 checkout session already recorded`
   * (`uq_checkout_intents_session_id`). That is the exact stranding the old
   * comment claimed was prevented. Keying on the intent makes a retry replay
   * the SAME Session, so the second stamp takes its `replay:true` branch.
   */
  readonly idempotencyKey: string;
};

/**
 * The Idempotency-Key: the intent id, with the collection mode folded in.
 *
 * THE MODE IS IN THE KEY because Stripe answers a same-key request that
 * carries DIFFERENT parameters with a 400. A plan whose
 * `payment_method_collection` flipped without its `local_key` changing slips
 * past the route's rotation guard (which compares keys, not modes), so the
 * mode has to be part of the identity or that flip becomes a hard 400 on the
 * money surface. A mode change now yields a fresh key and a fresh Session.
 *
 * THE ONE EDGE, MEASURED RATHER THAN GUESSED: Stripe's idempotency window is
 * 24 hours and a Checkout Session expires after 24 hours, so a retry near that
 * boundary can replay a Session that has since expired. Reachable only when a
 * checkout died BETWEEN Stripe returning and `record_checkout_session`
 * stamping, and was retried a day later — because once the intent is stamped,
 * `open_checkout_intent` opens a NEW intent and the key changes with it.
 * `clara.checkout_intents` carries no `expires_at` and `0161` rotates nothing
 * on expiry (measured: no `expires_at`, `expiry` or `expire` anywhere in that
 * migration), so nothing here can rotate it either. Filed as a Wave-G item in
 * the PR body rather than answered with a rotation this lane would be
 * inventing.
 */
export function checkoutIdempotencyKey(
  intentId: string,
  paymentMethodCollection: CheckoutSessionRequest["paymentMethodCollection"],
): string {
  return `${intentId}:${paymentMethodCollection}`;
}

export type CheckoutSessionCreated = {
  readonly id: string;
  readonly url: string;
};

export class StripeSessionError extends Error {
  readonly reason: "unconfigured" | "refused" | "malformed" | "transport";
  readonly status: number | null;
  constructor(reason: StripeSessionError["reason"], message: string, status: number | null = null) {
    super(message);
    this.name = "StripeSessionError";
    this.reason = reason;
    this.status = status;
  }
}

export type StripeSessionDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
};

/** The form body, built by key so every field is legible and nothing is
 *  interpolated into a URL. Exported for the cell that pins the exact wire
 *  shape — a test that re-typed these keys would be asserting its own
 *  spelling, not this function's (review law 3). */
export function checkoutSessionForm(request: CheckoutSessionRequest): URLSearchParams {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", request.stripePriceId);
  form.set("line_items[0][quantity]", "1");
  form.set("payment_method_collection", request.paymentMethodCollection);
  form.set("success_url", request.successUrl);
  form.set("cancel_url", request.cancelUrl);
  form.set("metadata[clara_registration_id]", request.registrationId);
  form.set("metadata[clara_applicant]", request.applicant);
  form.set("metadata[clara_intent_id]", request.intentId);
  // The same three on the Subscription the Session creates, so an operator
  // reading the subscription alone can still trace it back to a registration.
  form.set("subscription_data[metadata][clara_registration_id]", request.registrationId);
  form.set("subscription_data[metadata][clara_applicant]", request.applicant);
  form.set("subscription_data[metadata][clara_intent_id]", request.intentId);
  return form;
}

/**
 * Create the Checkout Session. Throws `StripeSessionError` for every failure
 * class, each distinguishable, so the route can render an honest card instead
 * of a spinner; it never resolves with a partial or invented Session.
 */
export async function createCheckoutSession(
  request: CheckoutSessionRequest,
  deps: StripeSessionDeps = {},
): Promise<CheckoutSessionCreated> {
  const env = deps.env ?? process.env;
  const doFetch = deps.fetchImpl ?? fetch;
  const key = env[STRIPE_SECRET_KEY_VAR];
  if (typeof key !== "string" || key.trim() === "") {
    throw new StripeSessionError(
      "unconfigured",
      `${STRIPE_SECRET_KEY_VAR} is not configured — checkout refuses rather than calling Stripe unauthenticated`,
    );
  }

  let response: Response;
  try {
    response = await doFetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.trim()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
        "Idempotency-Key": request.idempotencyKey,
      },
      body: checkoutSessionForm(request).toString(),
      redirect: "manual",
      cache: "no-store",
    });
  } catch (err) {
    throw new StripeSessionError(
      "transport",
      `the Stripe Checkout Sessions call did not complete: ${(err as Error)?.name ?? "fetch_failed"}`,
    );
  }

  if (!response.ok) {
    // The status only. Stripe's error body can echo request parameters, and
    // nothing that could carry the key or the applicant's data is logged.
    throw new StripeSessionError(
      "refused",
      `Stripe refused the Checkout Session with status ${response.status}`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new StripeSessionError("malformed", "Stripe's response was not JSON", response.status);
  }
  const session = body as { id?: unknown; url?: unknown } | null;
  const id = session?.id;
  const url = session?.url;
  // POSITIVELY checked, both of them: a 200 with no `url` is not a Session the
  // applicant can be sent to, and recording an id whose Session cannot be
  // reached would stamp the intent unusably (it is stampable exactly once).
  if (typeof id !== "string" || id === "" || typeof url !== "string" || url === "") {
    throw new StripeSessionError(
      "malformed",
      "Stripe returned 200 without both a session id and a hosted url",
      response.status,
    );
  }
  return { id, url };
}
