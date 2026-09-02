// FS-4 C-5 item 1 — THE STRIPE WEBHOOK ROUTER (design part 3 §1; 裁-91 · 裁-73 · A-M5).
//
// MOUNTED BEFORE `express.json()`, AND THAT IS MECHANICAL, NOT STYLISTIC. `src/index.ts` mounts
// this router immediately beside `intakeRoutes()` and before `app.use(express.json(…))`, for the
// reason the comment there already gives for intake: no middleware may consume the body. A
// signature is computed over the RAW BYTES; a body parser that re-serialises them — whitespace,
// key order, encoding — changes the bytes and verification fails for every legitimate event,
// silently, with the source reading correctly. Cell W-C pins it: a real signed payload through
// a router mounted AFTER the parser does not verify, and the positive control is the whole cell
// because the refuse arm and the mutant are the same edit.
//
// TWO PATHS, ONE HANDLER, AND THE PR BODY SAYS WHY. Design part 3 §1 names the endpoint
// `POST /webhooks/stripe`; the work order names it `POST /api/stripe/webhook` (twice, including
// in the URL the owner must register in the sandbox dashboard). A path name is not an
// accounting-correctness question, so escalating it under hard constraint 1 would cost more than
// it buys — but shipping only one of the two names risks the owner registering the other and the
// endpoint 404ing every delivery, which is exactly the "silently broken webhook" failure this
// train exists to avoid. Both paths reach the same handler; the deploy notes name
// `/api/stripe/webhook` as the one to register.
//
// THE RESPONSE CONTRACT (design part 3 §1 steps 3-6, reconciled with the work order's
// "never 200-and-drop"):
//   * 400 — bad or absent signature, malformed JSON, a malformed envelope. NO door is called.
//   * 403 — the livemode gate refused (A-M5). NO door is called.
//   * 413 — over the 1 MB raw-body limit.
//   * 503 — the webhook lane has no credential yet (the ceremony follows the migration), or the
//           deployment has not stated its Stripe mode. NO door is called.
//   * 500 — the door itself failed. Stripe retries; nothing was recorded.
//   * 200 — and ONLY 200 — once `record_stripe_event` has returned. Every non-2xx above means
//           the event was NOT recorded, so Stripe's retry is the recovery path and answering
//           2xx would drop it for good.
// An event whose TYPE this route does not recognise is RECORDED (envelope only) and answered
// 200, per design part 3 §1's "every other type is still recorded — the store is the record".
// It is logged loudly by id and type so an unrecognised type is visible rather than inferred.
//
// NOTHING CONTAINING THE PAYLOAD IS EVER LOGGED. Every log line here carries the event id, the
// type, and a short reason token. The raw body goes out of scope with the request (裁-91:
// "verify → project → discard"), and the projection that reaches the database has already had
// every customer-bearing field stripped by the allow-list in `lib/stripe-projection.mjs`.

import express from "express";
import { recordStripeEvent, applyStripeEvents, stripeWebhookLaneConfigured } from "../lib/checkout-pools.mjs";
import { verifyStripeSignature, StripeSignatureError } from "../lib/stripe-signature.mjs";
import { projectStripeEvent, StripeProjectionError, APPLIED_EVENT_TYPE } from "../lib/stripe-projection.mjs";
import { assertLivemodeMatches, StripeLivemodeError } from "../lib/stripe-livemode.mjs";

/** The two paths (see the header). `/api/stripe/webhook` is the registered one. Typed as a
 *  plain `string[]` rather than `as const` so the router can take it without a spread —
 *  `scripts/check-parts-parity.mjs` refuses spreads under `packages/runtime`, and an array one
 *  here would sit two characters away from an object one nobody re-reads. */
export const STRIPE_WEBHOOK_PATHS: string[] = ["/api/stripe/webhook", "/webhooks/stripe"];

/** Stripe's largest events sit well under this; design part 3 §1 step 1 names the limit. */
const RAW_BODY_LIMIT = process.env.CLARA_STRIPE_WEBHOOK_BODY_LIMIT || "1mb";

/**
 * `express.raw({ type: 'application/json', limit })`, with the options assembled by KEY
 * ASSIGNMENT rather than as an object literal.
 *
 * The reason is a fail-closed gate, and it is worth a sentence rather than a shrug:
 * `scripts/check-parts-parity.mjs` walks every object literal under `packages/runtime` and
 * treats a `type:` string as a claimed `parts[]` kind, so `{ type: "application/json" }` reads
 * to it as an undeclared part kind. That census is what keeps a runtime-emittable part from
 * shipping with no reader, and teaching it an exemption for a MIME type would blunt it for the
 * next reader. Two lines here cost nothing.
 */
function rawJsonBodyParser(): express.RequestHandler {
  const options: { limit: string; type?: string } = { limit: RAW_BODY_LIMIT };
  options.type = "application/json";
  return express.raw(options);
}

type WebhookOutcome = { status: number; body: Record<string, unknown> };

/**
 * The refusal map, exported so a cell can drive it without a server — the `turnLimitPayload` /
 * `documentRouteStatus` precedent. It maps a THROWN error to its status; an unmapped throw is a
 * 500, which is correct for "we do not know what happened" and is still a Stripe retry.
 */
export function webhookRefusal(err: unknown): WebhookOutcome {
  if (err instanceof StripeSignatureError) {
    // `signing_secret_absent` is OUR misconfiguration, not a forged request: 503 so an operator
    // reading the logs is not hunting a phantom attacker, and so Stripe's retry outlives the
    // window in which the secret gets set.
    if (err.code === "signing_secret_absent") {
      return { status: 503, body: { error: "webhook_not_configured", message: "the endpoint signing secret is not set" } };
    }
    return { status: 400, body: { error: "signature_invalid" } };
  }
  if (err instanceof StripeProjectionError) return { status: 400, body: { error: "event_malformed" } };
  if (err instanceof StripeLivemodeError) {
    return err.code === "livemode_not_configured"
      ? { status: 503, body: { error: "livemode_not_configured" } }
      : { status: 403, body: { error: "livemode_mismatch" } };
  }
  return { status: 500, body: { error: "internal" } };
}

export function stripeWebhookRoutes(): express.Router {
  const router = express.Router();

  // The raw parser is scoped to THESE PATHS ONLY — a global `express.raw()` would break every
  // other JSON route in the process.
  router.post(
    STRIPE_WEBHOOK_PATHS,
    rawJsonBodyParser(),
    async (req, res) => {
      // A dormant lane answers 503 BEFORE any verification work, and says so plainly. Stripe
      // retries for days, so an endpoint registered before the role ceremony recovers on its own
      // once the DSN lands.
      if (!stripeWebhookLaneConfigured()) {
        console.error("[clara-runtime] stripe webhook REFUSED: the webhook-lane DSN is not configured");
        res.status(503).json({ error: "webhook_lane_unconfigured" });
        return;
      }

      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody)) {
        // Not a Buffer means something upstream consumed or replaced the body — the W-C failure
        // in its live form. Named, never a silent verification failure.
        console.error("[clara-runtime] stripe webhook REFUSED: the request body is not raw bytes (a parser ran first)");
        res.status(400).json({ error: "raw_body_required" });
        return;
      }

      let eventId = "(unparsed)";
      let type = "(unparsed)";
      try {
        // 1. THE SIGNATURE, over the raw bytes, before anything else is read. A failure here
        //    calls NO door — cell W-A2's whole subject.
        verifyStripeSignature({
          rawBody,
          header: req.header("stripe-signature"),
          secret: process.env.STRIPE_WEBHOOK_SECRET,
        });

        // 2. Parse. Only now, and only because the bytes are proven to be Stripe's.
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
        } catch {
          throw new StripeProjectionError("event_not_json", "the verified body is not JSON");
        }

        // Name the event for the log BEFORE the next two gates can refuse it. These two reads
        // are UNVALIDATED — the projector is what decides whether they are well formed — and
        // they exist so a livemode refusal says WHICH event it refused rather than
        // "(unparsed)". They are clamped and never used for anything but the log line.
        const rawId = (event as { id?: unknown }).id;
        const rawType = (event as { type?: unknown }).type;
        if (typeof rawId === "string") eventId = rawId.slice(0, 255);
        if (typeof rawType === "string") type = rawType.slice(0, 255);

        // 3. THE LIVEMODE GATE (A-M5) — before the projector and before the door, so a
        //    mode-mismatched event never reaches the store.
        assertLivemodeMatches((event as { livemode?: unknown }).livemode);

        // 4. Project to the redacted shape. The raw event is not referenced after this line.
        const projected = projectStripeEvent(event);
        eventId = projected.eventId;
        type = projected.eventType;
        if (!projected.recognised) {
          console.warn(
            `[clara-runtime] stripe webhook: UNRECOGNISED type ${type} (${eventId}) — recorded as envelope only, applied by nothing`,
          );
        }
        if (projected.dropped.length > 0) {
          // The nested-PII strip wall fired. Field NAMES only — never a value.
          console.warn(
            `[clara-runtime] stripe webhook: ${eventId} (${type}) had non-scalar field(s) stripped: ${projected.dropped.join(", ")}`,
          );
        }

        // 5. The door. Replay is idempotent inside it (`on conflict (event_id) do nothing`), so
        //    `recorded:false` is a REPLAY, not a failure — cell W-B asserts on this value and
        //    not only on row counts.
        const receipt = await recordStripeEvent(projected);

        // 6. Answer as soon as the door returns (design step 4) — whatever happens next.
        res.status(200).json({ received: true, recorded: receipt?.recorded === true });

        // 7. Best-effort, OUTSIDE the response path (design step 5). Its failure is logged and
        //    swallowed BECAUSE the periodic sweep is the real guarantee (step 6), not because
        //    the error does not matter.
        if (projected.eventType === APPLIED_EVENT_TYPE) {
          applyStripeEvents(100).catch((err: unknown) => {
            console.error(
              `[clara-runtime] stripe applier (post-webhook, best effort) failed for ${eventId}: ${(err as Error)?.message ?? err} — the periodic sweep will retry`,
            );
          });
        }
        return;
      } catch (err) {
        const outcome = webhookRefusal(err);
        const code = (err as { code?: string })?.code ?? "unknown";
        // LOUD, with the id and the reason, and never 200-and-drop.
        console.error(
          `[clara-runtime] stripe webhook REFUSED ${outcome.status} (${code}) for ${eventId} type=${type}: ${(err as Error)?.message ?? err}`,
        );
        res.status(outcome.status).json(outcome.body);
        return;
      }
    },
  );

  return router;
}
