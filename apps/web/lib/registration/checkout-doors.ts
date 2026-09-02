// FS-4 C-6 Lane B — THE FOUR CHECKOUT DOORS, called with the CALLER'S OWN
// session token (checkout-gate-design part 3 §2: "Doors are called with the
// caller's own session token over PostgREST RPC ... so every door sees
// `jwt_sub()` = the person — never a service identity").
//
// WHY THESE ARE SERVER-SIDE CALLS AND NOT CLIENT ONES, which is a departure
// from the work order's phrasing and is REPORTED in the PR body rather than
// decided quietly. Design part 1 §1.1's own step table puts ⑤ in a route
// handler, and part 3 §2's `/checkout` row spells the sequence out: "reads the
// trusted client-IP header → digest → `open_checkout_intent` → creates the
// Stripe Checkout Session ... → `record_checkout_session` → 303 to Stripe".
// The security reason is the one that decides it: `p_origin_digest` is the
// rate wall's whole key, and a digest that travelled to the browser to be
// posted back is a value the attacker fills in — design part 1 §4.1's own
// named trap ("A wall keyed on a client-settable header is not a wall; it is a
// form field the attacker fills in"). One forged digest per guess is the C2
// limb deleted. So the digest is computed in the same server request that
// calls the door, and never leaves it.
//
// ④'s `sign_dpa` IS the client call the design names (part 1 §1.1: "sign_dpa
// is called the same way ③ calls its doors — from the client, over PostgREST")
// and it lives in `./dpa-doors.ts`, not here. It carries no server-only value:
// its three arguments are the version, the hash of the bytes the person was
// shown, and the caller's own op key.
//
// NO REGISTRATION ID CROSSES THE WIRE. Each caller below is handed a
// registration the SERVER read from the caller's own session
// (`server-reads.ts`), never a form field. The doors would refuse a foreign
// one anyway (`CLR04 not your registration request`, `0161`) — the DB is the
// wall, as always — but a money surface that never accepts the identifier at
// all cannot be probed for which identifiers exist, and it matches NIT-6's
// discipline on the success page ("the registration is the authority, and no
// name crosses the wire at all").

import { callDoor } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

/** `clara.open_checkout_intent(uuid,bytea,text)`'s jsonb return (`0161`). */
export type OpenCheckoutIntentResult = {
  readonly intentId: string;
  readonly priceLocalKey: string;
  readonly stripePriceId: string;
};

/** `clara.get_current_checkout_plan()`'s row (this train's own migration). */
export type CurrentCheckoutPlan = {
  readonly localKey: string;
  readonly paymentMethodCollection: "if_required" | "always";
};

/** `clara.claim_paid_firm(uuid,text)`'s jsonb return (`0161`). */
export type ClaimPaidFirmResult = {
  readonly firmId: string;
  readonly planId: string;
  readonly registrationId: string;
  /** The door's own `replay` marker — present when the registration already
   *  carried a `firm_id`. Surfaced because the success page renders a
   *  different sentence for "we just opened it" and "it was already open",
   *  and because 裁-107(a)'s rule is that a dropped return field is a
   *  DECISION: this one is consumed, so it is not dropped. */
  readonly replay: boolean;
};

function requireString(value: unknown, field: string, fn: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${fn}: the door's response had no usable ${field}`);
  }
  return value;
}

/**
 * ⑤a — open (or replay) the applicant's checkout intent, and learn which
 * Stripe price the DB says this plan is. `originDigest` is the `\x`-prefixed
 * bytea spelling from `lib/rate-wall/courier.ts`; the door raises
 * `CLR10 an origin digest is required` for anything that is not 32 bytes, so
 * a mangled round trip refuses rather than keying the wall on a short value.
 *
 * `opKey` is validated by the door but is NOT the retry identity here: `0161`
 * makes the durable identity "the applicant's one locked, unstamped
 * current-plan intent", and its own comment says so. A retry therefore lands
 * on the same intent whatever key it carries.
 */
export async function openCheckoutIntent(
  args: { registration: string; originDigest: string; opKey: string },
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<OpenCheckoutIntentResult> {
  const out = await callDoor<Record<string, unknown>>(
    "open_checkout_intent",
    {
      p_registration: args.registration,
      p_origin_digest: args.originDigest,
      p_op_key: args.opKey,
    },
    { session, signal },
  );
  return {
    intentId: requireString(out?.intent_id, "intent_id", "open_checkout_intent"),
    priceLocalKey: requireString(out?.price_local_key, "price_local_key", "open_checkout_intent"),
    stripePriceId: requireString(out?.stripe_price_id, "stripe_price_id", "open_checkout_intent"),
  };
}

/**
 * The current plan's Checkout Session shape. `local_key` rides along so the
 * caller can prove this row and `open_checkout_intent`'s own
 * `price_local_key` name the SAME plan — see the door's comment for the
 * rotation window that makes the comparison load-bearing.
 */
export async function getCurrentCheckoutPlan(
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<CurrentCheckoutPlan> {
  const rows = await callDoor<unknown>("get_current_checkout_plan", {}, { session, signal });
  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  const localKey = requireString(row?.local_key, "local_key", "get_current_checkout_plan");
  const mode = row?.payment_method_collection;
  if (mode !== "if_required" && mode !== "always") {
    // The CHECK on the column admits exactly these two, so anything else means
    // the column was widened without this reader being trued. Refuse rather
    // than pass an unknown token to Stripe or silently fall back to a default.
    throw new Error(
      `get_current_checkout_plan: payment_method_collection is ${JSON.stringify(mode)}, ` +
        "which this build does not know how to send",
    );
  }
  return { localKey, paymentMethodCollection: mode };
}

/** ⑤b — stamp the intent with the Stripe Checkout Session that was created
 *  for it. `record_checkout_session` replays on the SAME session id and
 *  refuses `CLR09 checkout session already recorded` on a different one. */
export async function recordCheckoutSession(
  args: { intentId: string; sessionId: string; opKey: string },
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<void> {
  await callDoor(
    "record_checkout_session",
    { p_intent: args.intentId, p_session_id: args.sessionId, p_op_key: args.opKey },
    { session, signal },
  );
}

/** ⑧ — the folded door (裁-89): claim, create and close in one transaction. */
export async function claimPaidFirm(
  args: { registration: string; opKey: string },
  session: SessionTokenAccessor,
  signal?: AbortSignal,
): Promise<ClaimPaidFirmResult> {
  const out = await callDoor<Record<string, unknown>>(
    "claim_paid_firm",
    { p_registration: args.registration, p_op_key: args.opKey },
    { session, signal },
  );
  return {
    firmId: requireString(out?.firm_id, "firm_id", "claim_paid_firm"),
    planId: requireString(out?.plan_id, "plan_id", "claim_paid_firm"),
    registrationId: requireString(out?.registration_id, "registration_id", "claim_paid_firm"),
    replay: out?.replay === true,
  };
}
