// #628 — THE PROVIDER'S TOKEN, AND THE SENTENCE IT IS ALLOWED TO CHOOSE.
//
// WHAT THESE CELLS PROTECT. `checkout_intents.status_reason` is a machine
// token, and the defect class this module exists to prevent is the easiest one
// on the whole surface to commit by accident: interpolating it into a sentence.
// "Your payment failed: payment_intent_authentication_failure" looks like
// honesty and reads like a crash. The mapping below is therefore asserted to be
// TOTAL (every token answers something), CLOSED (an unknown token never borrows
// a known cause's copy) and WHOLE-STRING (no substring match quietly promotes a
// token nobody has observed into a specific claim about somebody's bank).

import assert from "node:assert/strict";
import { test } from "node:test";

import { PAYMENT_FAILURE_KINDS, paymentFailureKindFrom } from "./payment-failure";
import messages from "../../messages/en.json";

test("every known Stripe token reaches the cause it belongs to", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["card_declined", "card_declined"],
    ["generic_decline", "card_declined"],
    ["do_not_honor", "card_declined"],
    ["transaction_not_allowed", "card_declined"],
    ["card_not_supported", "card_declined"],
    ["insufficient_funds", "insufficient_funds"],
    ["withdrawal_count_limit_exceeded", "insufficient_funds"],
    ["expired_card", "expired_card"],
    ["incorrect_cvc", "incorrect_details"],
    ["incorrect_number", "incorrect_details"],
    ["invalid_cvc", "incorrect_details"],
    ["invalid_expiry_month", "incorrect_details"],
    ["invalid_expiry_year", "incorrect_details"],
    ["invalid_number", "incorrect_details"],
    ["authentication_required", "authentication_failed"],
    ["payment_intent_authentication_failure", "authentication_failed"],
    ["processing_error", "processing_error"],
    ["try_again_later", "processing_error"],
  ];
  for (const [token, expected] of cases) {
    assert.equal(paymentFailureKindFrom(token), expected, token);
  }
  // VACUITY CONTROL: the table above must exercise every kind but `unknown`,
  // or a kind could lose its only mapping without a cell noticing.
  assert.deepEqual(
    [...new Set(cases.map(([, kind]) => kind))].sort(),
    PAYMENT_FAILURE_KINDS.filter((k) => k !== "unknown").slice().sort(),
  );
});

test("AN UNKNOWN TOKEN IS `unknown`, never the nearest known cause", () => {
  // The failure mode a substring match would produce: a token that CONTAINS a
  // known one must not inherit its sentence. Telling somebody "there were not
  // enough funds" about a token nobody has ever seen is inventing a fact about
  // their bank account.
  for (const token of [
    "refunded",
    "card_declined_by_issuer",
    "insufficient_funds_maybe",
    "some_token_nobody_mapped",
    "",
    "   ",
  ]) {
    assert.equal(paymentFailureKindFrom(token), "unknown", JSON.stringify(token));
  }
  assert.equal(paymentFailureKindFrom(null), "unknown");
});

test("case and surrounding whitespace are normalised, and nothing else is", () => {
  assert.equal(paymentFailureKindFrom("  CARD_DECLINED  "), "card_declined");
  assert.equal(paymentFailureKindFrom("Expired_Card"), "expired_card");
  // A separator change is a DIFFERENT token, not a spelling of the same one:
  // guessing across it would be this module inventing a vocabulary.
  assert.equal(paymentFailureKindFrom("card declined"), "unknown");
  assert.equal(paymentFailureKindFrom("card-declined"), "unknown");
});

test("every kind has real copy on BOTH surfaces, and no two kinds share a sentence", () => {
  // The two faces — `/checkout/success` and `/pending` — each own a
  // `paymentFailure` block, and a missing key throws at render exactly as a
  // missing message does anywhere else. A SHARED sentence would be the same
  // defect in a quieter form: five causes rendering one line.
  for (const [surface, block] of [
    ["CheckoutSuccess", messages.CheckoutSuccess.paymentFailure],
    ["Pending", messages.Pending.paymentFailure],
  ] as const) {
    const sentences = PAYMENT_FAILURE_KINDS.map((kind) => {
      const text = (block as Record<string, string>)[kind];
      assert.equal(typeof text, "string", `${surface}.paymentFailure.${kind} is missing`);
      assert.ok((text as string).length > 20, `${surface}.paymentFailure.${kind} is too thin to be a sentence`);
      // NO JARGON REACHES A PERSON. The token itself, and the word the ticket
      // names explicitly, are both banned from the copy.
      assert.doesNotMatch(text as string, /webhook|payment_intent|decline_code|_/i, `${surface}.${kind}`);
      return text as string;
    });
    assert.equal(new Set(sentences).size, PAYMENT_FAILURE_KINDS.length, `${surface}: two causes share a sentence`);
    // EVERY ONE OF THEM SAYS NOTHING WAS CHARGED, which is the single fact a
    // person in this state most needs and the one a partial rewrite would drop.
    for (const sentence of sentences) {
      assert.match(sentence, /Nothing was charged/i, `${surface}: a failure sentence omits "nothing was charged"`);
    }
  }
});
