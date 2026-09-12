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
    // #628's DB ROUND — the APPLIER's own token, not Stripe's: a `processing`
    // intent nobody answered for 24 hours is swept to `expired` with this
    // reason, and "the bank never came back" is not any of the sentences above.
    ["processing_timeout", "processing_timeout"],
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

test("#628 review — A PROTOTYPE KEY IS `unknown`, not whatever Object.prototype holds", () => {
  // THE DEFECT. The lookup was `BY_TOKEN[token] ?? "unknown"` on a plain object
  // literal, and `token` is a value a third party's error code supplies. Every
  // `Object.prototype` member answers that lookup with something TRUTHY, so
  // `??` never fired: `"constructor"` returned the `Object` constructor and
  // `"__proto__"` returned the prototype itself, and the card would have called
  // `t("paymentFailure." + String(aFunction))` — a missing-message throw on the
  // page somebody reaches after a failed payment, or worse, a rendered blob.
  //
  // Both are asserted, plus the three other members that are reachable the same
  // way, so the fix cannot regress to a `??` that happens to pass on one of
  // them. `Object.hasOwn` is what makes every one of these `unknown`.
  for (const token of [
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "valueOf",
    // And the same values however they are cased or padded — normalisation runs
    // BEFORE the lookup, so it must not reintroduce the hole.
    "  CONSTRUCTOR  ",
    "__PROTO__",
  ]) {
    assert.equal(paymentFailureKindFrom(token), "unknown", JSON.stringify(token));
  }
  // A CONTROL, so this cell cannot pass because the function returns `unknown`
  // for everything: a real token still resolves.
  assert.equal(paymentFailureKindFrom("card_declined"), "card_declined");
});

test("case and surrounding whitespace are normalised, and nothing else is", () => {
  assert.equal(paymentFailureKindFrom("  CARD_DECLINED  "), "card_declined");
  assert.equal(paymentFailureKindFrom("Expired_Card"), "expired_card");
  // A separator change is a DIFFERENT token, not a spelling of the same one:
  // guessing across it would be this module inventing a vocabulary.
  assert.equal(paymentFailureKindFrom("card declined"), "unknown");
  assert.equal(paymentFailureKindFrom("card-declined"), "unknown");
});

test("every kind has real copy in ONE namespace, and no two kinds share a sentence", () => {
  // #628 REVIEW — ONE TABLE, NOT TWO. These seven sentences existed TWICE, as
  // `Pending.paymentFailure` and `CheckoutSuccess.paymentFailure`, and this cell
  // walked both — which measured that the duplication was consistent TODAY, not
  // that it would stay so. A copy edit on one face was a silent divergence on
  // the other, and a kind added to one block was a render-time throw on the
  // other. The seven now live under `PaymentFailure` and both cards read them
  // from there (7.3), so the thing this cell walks is the only one there is.
  const block = messages.PaymentFailure as Record<string, string>;
  const sentences = PAYMENT_FAILURE_KINDS.map((kind) => {
    const text = block[kind];
    assert.equal(typeof text, "string", `PaymentFailure.${kind} is missing`);
    assert.ok((text as string).length > 20, `PaymentFailure.${kind} is too thin to be a sentence`);
    // NO JARGON REACHES A PERSON. The token itself, and the word the ticket
    // names explicitly, are both banned from the copy.
    assert.doesNotMatch(text as string, /webhook|payment_intent|decline_code|_/i, kind);
    return text as string;
  });
  assert.equal(new Set(sentences).size, PAYMENT_FAILURE_KINDS.length, "two causes share a sentence");
  // EVERY ONE OF THEM SAYS NOTHING WAS CHARGED, which is the single fact a
  // person in this state most needs and the one a partial rewrite would drop.
  for (const sentence of sentences) {
    assert.match(sentence, /Nothing was charged/i, 'a failure sentence omits "nothing was charged"');
  }
  // AND THE OLD COPIES ARE GONE. A namespace that still carried its own block
  // would let a face keep reading a stale table without anything going red.
  assert.equal("paymentFailure" in messages.CheckoutSuccess, false, "CheckoutSuccess still owns a copy table");
  assert.equal("paymentFailure" in messages.Pending, false, "Pending still owns a copy table");
});
