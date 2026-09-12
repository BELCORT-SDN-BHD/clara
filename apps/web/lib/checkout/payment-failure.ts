// #628 — WHAT A FAILED PAYMENT IS TOLD TO A PERSON, AND WHAT IS NOT.
//
// `checkout_intents.status_reason` (migration 0186) is a MACHINE TOKEN the
// applier copies off the provider — `card_declined`, `insufficient_funds`,
// `payment_intent_authentication_failure`. It is exactly the kind of value that
// reaches a screen by accident: it is a string, it is about the thing that just
// went wrong, and printing it looks like honesty. It is not. "A required legal
// document is not accepted" is a sentence; `payment_intent_authentication_
// failure` is an identifier, and the ticket's own rule is that no jargon
// reaches a person (the word "webhook" never does either).
//
// SO THE TOKEN CHOOSES A SENTENCE, AND THE SENTENCE IS OURS. A CLOSED
// vocabulary, because the alternative — interpolating the token into a
// template — is the same defect wearing a sentence's clothes. A token outside
// the vocabulary maps to `unknown`, whose copy says plainly that the payment
// did not go through and that the applicant's bank can say why: true for every
// possible token, and it never invents a cause.
//
// THE TOKEN IS NOT DELETED, THOUGH. It is the one thing support needs off a
// screenshot, so the card renders it inside `TechnicalDetail` — the estate's
// one sanctioned place for an internal identifier to reach a human
// (`components/common/technical-detail.tsx`'s own header). The prose says what
// happened; the disclosure says what the provider called it.
//
// WHY NOT A DOOR REFUSAL RENDERED VERBATIM. `apps/web/AGENTS.md`'s verbatim law
// is about a `DoorRefusal` — a sentence the DATABASE composed for a person,
// under its own authority. This is not that: no door refused anything here, and
// `status_reason` is a column the applier filled from a third party's error
// code. Rendering it verbatim would be applying a law about the DB's own words
// to Stripe's.

/** The failure causes this build has copy for. `unknown` is a real member, not
 *  a fallback bolted on: it is what an honest reader says about a token it
 *  cannot name, and it is reached by every token outside this list. */
export const PAYMENT_FAILURE_KINDS = [
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "incorrect_details",
  "authentication_failed",
  "processing_error",
  /** #628's DB round — the applier sweeps a `processing` intent that has gone
   *  unanswered for 24 hours to `expired` with `status_reason =
   *  'processing_timeout'`. It is the DB's own token like every other member
   *  here, and it owes its own sentence: "the bank never came back" is a
   *  different fact from "the card was declined" and from an ordinary hosted-
   *  page expiry. */
  "processing_timeout",
  "unknown",
] as const;

export type PaymentFailureKind = (typeof PAYMENT_FAILURE_KINDS)[number];

/**
 * Stripe's documented decline/failure codes, grouped onto the copy each group
 * owes. MEASURED FROM THE PROVIDER'S OWN VOCABULARY, not invented: these are
 * `decline_code` and `code` values from Stripe's card-errors reference. A token
 * this table does not carry is `unknown` — deliberately, and the table is
 * widened only when a real token is observed, never on a guess about what the
 * applier might one day write.
 */
/**
 * PROTOTYPE-FREE BY CONSTRUCTION. This table is indexed with a value that came
 * off the wire, and a plain object literal answers `"constructor"`,
 * `"__proto__"`, `"toString"` and every other `Object.prototype` member with
 * something that is not a `PaymentFailureKind` at all — which `?? "unknown"`
 * does NOT catch, because those lookups are not nullish. `paymentFailureKindFrom`
 * therefore asks `Object.hasOwn` before it reads, so the only keys that can
 * answer are the ones written below.
 */
const BY_TOKEN: Readonly<Record<string, PaymentFailureKind>> = {
  card_declined: "card_declined",
  generic_decline: "card_declined",
  do_not_honor: "card_declined",
  transaction_not_allowed: "card_declined",
  card_not_supported: "card_declined",
  insufficient_funds: "insufficient_funds",
  withdrawal_count_limit_exceeded: "insufficient_funds",
  expired_card: "expired_card",
  incorrect_cvc: "incorrect_details",
  incorrect_number: "incorrect_details",
  invalid_cvc: "incorrect_details",
  invalid_expiry_month: "incorrect_details",
  invalid_expiry_year: "incorrect_details",
  invalid_number: "incorrect_details",
  authentication_required: "authentication_failed",
  payment_intent_authentication_failure: "authentication_failed",
  processing_error: "processing_error",
  try_again_later: "processing_error",
  // The APPLIER'S own token, not Stripe's — `0186`'s 24-hour sweep.
  processing_timeout: "processing_timeout",
};

/**
 * The token's copy key. `null` and every unrecognised token answer `unknown`,
 * which is the only answer that is true without knowing anything.
 *
 * CASE AND WHITESPACE ARE NORMALISED, and nothing else is. A token is matched
 * whole or not at all: a substring match would let `card_declined_do_not_honor`
 * (a value nobody has observed) silently borrow another cause's sentence.
 */
export function paymentFailureKindFrom(reason: string | null): PaymentFailureKind {
  if (typeof reason !== "string") return "unknown";
  const token = reason.trim().toLowerCase();
  // OWN KEYS ONLY. `BY_TOKEN["constructor"]` is a function and
  // `BY_TOKEN["__proto__"]` an object — both truthy, so `?? "unknown"` would
  // have let either straight through as if it were a copy key, and
  // `t("paymentFailure.function Object() ...")` is what the person would have
  // read. The reason is a value a third party's error code supplies; the table
  // answers for the tokens it declares and for nothing else.
  return Object.hasOwn(BY_TOKEN, token) ? BY_TOKEN[token] as PaymentFailureKind : "unknown";
}
