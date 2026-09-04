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
 * THE DEPLOYMENT'S DECLARED STRIPE MODE (CB-AE2E-003).
 *
 * THE SAME NAME THE RUNTIME'S WEBHOOK ROUTE ALREADY GATES ON —
 * `packages/runtime/lib/stripe-livemode.mjs:28`. One deployment fact, one
 * variable name, set on both arms: apps/web refuses to CREATE a Session whose
 * key class disagrees with it, and the runtime refuses to ACCEPT an event whose
 * `livemode` disagrees with it. Two different halves of the same mistake.
 *
 * NOT AN IMPORT, and that is a measured limitation rather than a preference.
 * `apps/web` does not depend on `@clara/runtime` (it builds for Cloudflare
 * Workers off its own dependency set), so the vocabulary is re-expressed here
 * — and because "spelling is not identity", `stripe-session.test.ts` executes
 * the RUNTIME's own `expectedLivemode` against this module's parser over a
 * shared table of inputs. A vocabulary that drifts on either side reds there,
 * rather than leaving two gates that disagree about what "test" means.
 */
export const STRIPE_LIVEMODE_VAR = "CLARA_STRIPE_LIVEMODE";

/**
 * The mode this deployment believes it is in, or `null` when unconfigured.
 *
 * A CLOSED VOCABULARY, never `Boolean(raw)` — the runtime's own reasoning,
 * mirrored: `Boolean("false")` is `true`, so a deployment that wrote
 * `CLARA_STRIPE_LIVEMODE=false` meaning test mode would be read as LIVE. A
 * value outside the vocabulary is unconfigured, so a typo fails closed instead
 * of picking a mode for the operator.
 */
export function expectedStripeLivemode(
  env: Record<string, string | undefined>,
): boolean | null {
  const raw = env[STRIPE_LIVEMODE_VAR];
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "live") return true;
  if (v === "0" || v === "false" || v === "test") return false;
  return null;
}

/**
 * The class of a Stripe secret, read from its documented prefix: `sk_live_` /
 * `rk_live_` are live, `sk_test_` / `rk_test_` are test. `null` for anything
 * else — a restricted key with a different shape, a fixture, a truncated
 * paste. An unrecognised class is NOT a refusal: this gate exists to catch the
 * live/test mix-up, and refusing every key it cannot classify would turn a
 * vocabulary gap into an outage on the money surface. The key's own validity
 * is Stripe's answer to give, and it gives it as a 401 the `refused` arm
 * already reports.
 */
export function stripeKeyLivemode(key: string): boolean | null {
  const k = key.trim();
  if (k.startsWith("sk_live_") || k.startsWith("rk_live_")) return true;
  if (k.startsWith("sk_test_") || k.startsWith("rk_test_")) return false;
  return null;
}

/**
 * THE KEY-CLASS GATE. Returns a refusal SENTENCE when the configuration is
 * unsafe, `null` when it is safe to call Stripe.
 *
 * ============================================================================
 * WHY THIS EXISTS: A LIVE KEY WAS ACCEPTED SILENTLY
 * ============================================================================
 * Before this, the only validation on the secret was "is it a non-empty
 * string" — the value then went straight into an `Authorization` header. A
 * live key pasted into the beta deployment would have been used, and the first
 * evidence of the mistake would have been a real charge or a real Customer in
 * the live account. The module already pins `STRIPE_API_VERSION` precisely
 * because model-as-oracle on a money surface is expensive, and already deleted
 * its own API-base override rather than loosen a fence; the key CLASS was the
 * one input to this hop with no such discipline.
 *
 * IT REFUSES IN BOTH DIRECTIONS. A live key under a test deployment is the
 * expensive mistake; a test key under a live deployment is the one that quietly
 * takes no money and mints firms for free cards. Neither is a state a person
 * should discover from the outcome.
 *
 * UNSET IS A REFUSAL, NOT "ASSUME TEST". A deployment that has not stated its
 * mode has not been configured, and the one answer a money surface must never
 * give on a missing config is "accept anything" — the runtime's gate takes the
 * identical position, for the identical reason.
 *
 * IT RUNS BEFORE THE NETWORK CALL, always. The refusal reaches
 * `app/(entry)/checkout/handler.ts` as `StripeSessionError("unconfigured")`,
 * which maps to the existing `stripe_unavailable` card — an honest "we could
 * not reach the payment provider" with nothing charged, nothing recorded and a
 * retry that is safe because the intent is never stamped. No new UI.
 */
export function stripeKeyClassRefusal(
  key: string,
  env: Record<string, string | undefined>,
): string | null {
  const expected = expectedStripeLivemode(env);
  if (expected === null) {
    return `${STRIPE_LIVEMODE_VAR} is not set to one of 1/true/live/0/false/test — checkout refuses until this deployment states its Stripe mode`;
  }
  const actual = stripeKeyLivemode(key);
  // An unclassifiable key passes: see `stripeKeyLivemode`'s own note.
  if (actual === null) return null;
  if (actual !== expected) {
    // NEITHER THE KEY NOR ANY PART OF IT is in this sentence — only the two
    // booleans. The message reaches a server log and, in the `unconfigured`
    // arm, never the browser; that is not a reason to put key material in it.
    return `the configured ${STRIPE_SECRET_KEY_VAR} is a livemode=${actual} key but ${STRIPE_LIVEMODE_VAR} declares livemode=${expected} — checkout refuses rather than transacting in the wrong Stripe mode`;
  }
  return null;
}
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
   * the code did. `0163`'s own comment makes the durable identity "the
   * applicant's one locked, unstamped CURRENT-plan intent" — an op key minted
   * per POST is a fresh value on every retry, so two POSTs landing on the SAME
   * intent would mint TWO Sessions, and `record_checkout_session` refuses the
   * second with `CLR09 checkout session already recorded`
   * (`uq_checkout_intents_session_id`). That is the exact stranding the old
   * comment claimed was prevented. Keying on the intent makes a retry replay
   * the SAME Session, so the second stamp takes its `replay:true` branch.
   */
  readonly idempotencyKey: string;
  /**
   * The applicant's own address, from the VERIFIED JWT claim the route already
   * holds (`ServerSession.email`, the `email` claim of the same token every
   * door call on this request rides). H-38.
   *
   * NEVER FROM A FORM FIELD AND NEVER FROM A SECOND READ. `POST /checkout`
   * reads nothing from its request body by design, and a DB read would be a
   * second source that can disagree with the token the doors run under. Stripe
   * uses this to address the receipt and to prefill the Checkout page; binding
   * it to the verified claim means a receipt can only ever go to the address
   * the session itself proves.
   *
   * `null` when the token carries no usable `email` claim — a real shape, not
   * an error (see `emailFromClaims`). Absent ⇒ the field is OMITTED from the
   * form entirely; an empty string is a Stripe 400.
   */
  readonly customerEmail: string | null;
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
 * `clara.checkout_intents` carries no `expires_at` and `0163` rotates nothing
 * on expiry (measured: no `expires_at`, `expiry` or `expire` anywhere in that
 * migration), so nothing here can rotate it either. Filed as a Wave-G item in
 * the PR body rather than answered with a rotation this lane would be
 * inventing.
 *
 * ============================================================================
 * THE VERSION SUFFIX, AND WHY IT IS NOT COSMETIC (H-38)
 * ============================================================================
 * The paragraph above states the trap this key was built around: Stripe answers
 * a same-key request carrying DIFFERENT parameters with a 400. Adding
 * `customer_email` to the Session is exactly such a change. Without a new key
 * shape, an intent whose Session was created before this deploy and is retried
 * within Stripe's 24-hour idempotency window would send the old key with a new
 * parameter and take a hard 400 on the money surface — a real, if narrow,
 * stranding for anyone mid-checkout across the deploy.
 *
 * So the KEY MOVES WITH THE BODY. `PARAMETER_SHAPE` is bumped in the same
 * change that adds, removes or renames any field in `checkoutSessionForm`; a
 * bumped key makes an old intent's retry mint a FRESH Session instead of
 * replaying a stale one, which is the safe side of this trade. The cost is
 * paid once per shape change and only by requests inside the 24-hour window:
 * they get a new Session rather than the replayed one, and
 * `record_checkout_session` stamps whichever Session actually exists.
 *
 * It is deliberately NOT derived from the form itself (hashing the keys would
 * make every key opaque and would rotate on a reordering that changes nothing);
 * it is a written-down number a reader can see move in the diff.
 */
const PARAMETER_SHAPE = "v2";

export function checkoutIdempotencyKey(
  intentId: string,
  paymentMethodCollection: CheckoutSessionRequest["paymentMethodCollection"],
): string {
  return `${intentId}:${paymentMethodCollection}:${PARAMETER_SHAPE}`;
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

/**
 * THE MONEY HOP IS BOUNDED (#517 review r2, NIT 5).
 *
 * The review measured an asymmetry inside this one PR: `confirmation-wall.ts`
 * bounds its runtime call with `CONFIRM_TIMEOUT_MS` and an `AbortController`
 * ("exceeded means unavailable, never an acceptance and never a hang"), while
 * this module — the hop that touches MONEY — had no bound at all. A hanging
 * Stripe would have hung `POST /checkout` until the platform's own ceiling.
 *
 * It was a NIT rather than a blocker for a real reason worth keeping: no money
 * moves on that path. The Session is never created, so the intent stays
 * unstamped and the celled retry-is-safe property holds. But the stricter of
 * two disciplines in one PR belongs on the money hop, not the looser one.
 *
 * EXCEEDED MEANS UNAVAILABLE, NEVER AN ACCEPTANCE. An abort lands in the
 * `catch` around the fetch below as `StripeSessionError("transport", …)`, and
 * `app/(entry)/checkout/handler.ts` maps every `StripeSessionError` to the
 * `stripe_unavailable` card. So the honest refusal already existed; the bound
 * is what makes it reachable in finite time.
 */
export const CHECKOUT_TIMEOUT_MS = 10_000;

export type StripeSessionDeps = {
  readonly fetchImpl?: typeof fetch;
  readonly env?: Record<string, string | undefined>;
  /**
   * The bound, injectable so a cell can drive a never-resolving fetch to
   * `unavailable` on a REAL timer in milliseconds instead of faking the clock.
   * Defaults to the exported constant, so the shipped value is never the value
   * under test and no test can silently weaken it.
   */
  readonly timeoutMs?: number;
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
  // H-38 — SET ONLY WHEN PRESENT. Stripe rejects `customer_email=` (empty) with
  // a 400, so an absent address omits the parameter rather than sending a blank
  // one. The value is a verified JWT claim; see `CheckoutSessionRequest`.
  if (request.customerEmail !== null && request.customerEmail !== "") {
    form.set("customer_email", request.customerEmail);
  }
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

  // THE KEY-CLASS GATE, BEFORE THE NETWORK CALL AND BEFORE THE TIMER
  // (CB-AE2E-003). Request-time and not only at startup, because the
  // environment can change under a running worker — a secret rotated to the
  // wrong class between deploys must be caught by the next request, not by the
  // next cold start. See `stripeKeyClassRefusal`'s header.
  const classRefusal = stripeKeyClassRefusal(key, env);
  if (classRefusal !== null) {
    throw new StripeSessionError("unconfigured", classRefusal);
  }

  // The bound. `clearTimeout` in `finally` so a fast answer does not leave a
  // pending timer holding the request open — the same shape, deliberately,
  // that `confirmation-wall.ts` uses for the confirm hop.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? CHECKOUT_TIMEOUT_MS);
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
      signal: controller.signal,
    });
  } catch (err) {
    // An abort arrives here as `AbortError`, so the deadline produces the same
    // typed refusal as a dead socket — unavailable, never an acceptance.
    throw new StripeSessionError(
      "transport",
      `the Stripe Checkout Sessions call did not complete: ${(err as Error)?.name ?? "fetch_failed"}`,
    );
  } finally {
    clearTimeout(timer);
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

/**
 * THE STARTUP ARM of the key-class gate (CB-AE2E-003), so a mode mix-up is
 * visible at cold start rather than first met by an applicant at checkout.
 *
 * ============================================================================
 * IT REPORTS. IT DOES NOT THROW, AND THAT IS DELIBERATE.
 * ============================================================================
 * A module-scope `throw` here would be worse than the defect it guards:
 *
 *  · `next build` IMPORTS this module while collecting route data, in a shell
 *    that legitimately holds no Stripe configuration at all. A throw would turn
 *    every build on every machine and every CI leg into a failure, which is not
 *    a security property — it is an outage with a security-shaped comment.
 *  · On Cloudflare Workers the deployment's variables reach `process.env`
 *    through @opennextjs/cloudflare's per-request population, so module scope
 *    is not a reliable place to READ the configuration in the first place. A
 *    throw there would fire on a correctly configured deployment.
 *
 * THE WALL IS THE REQUEST-TIME GATE, which runs with the request's own `env`
 * and refuses before any network call. This arm exists to make the mistake
 * LOUD in a log at start, and it is deliberately silent when the module simply
 * has no configuration to judge — an absent key is the pre-existing
 * `unconfigured` refusal's business, not a mode mismatch.
 *
 * ONE LINE, NO KEY MATERIAL: the refusal sentence names the two booleans and
 * the two variable names, never the secret (see `stripeKeyClassRefusal`).
 */
export function reportStripeKeyClassAtStartup(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = console.error,
): string | null {
  const key = env[STRIPE_SECRET_KEY_VAR];
  // Nothing to judge: the request-time `unconfigured` arm already covers an
  // absent key, and shouting about it at import in every build shell would
  // train a reader to ignore this line.
  if (typeof key !== "string" || key.trim() === "") return null;
  const refusal = stripeKeyClassRefusal(key, env);
  if (refusal === null) return null;
  log(`[checkout] STRIPE CONFIGURATION REFUSED AT STARTUP: ${refusal}`);
  return refusal;
}

reportStripeKeyClassAtStartup();
