// #628 REVIEW — THE DEPLOYMENT'S DECLARED STRIPE MODE, RESOLVED IN ONE PLACE.
//
// The resolver lived inside `app/(entry)/pending/page.tsx`, and AC3's "visibly
// distinct" test/unconfigured deployment applied to `/pending` alone as a
// result. It applies at least as much to `/checkout/success` — the page a
// person lands on immediately AFTER paying, where "did that just take real
// money?" is the whole question. Two pages needing the same verdict is exactly
// the moment a private function in one of them becomes a shared source of
// truth (7.3) rather than a second copy in the other.
//
// `expectedStripeLivemode` IS THE PARSER, IMPORTED AND NEVER RE-DERIVED: the
// same closed vocabulary the key-class gate refuses on and the runtime's
// webhook gate reads, so the badge a person reads and the gate that would
// refuse their payment can never disagree about what "test" means. A typo in
// the variable is `null` here exactly as it is there — unconfigured, never
// "assume test", because `Boolean("false")` is true and a deployment meaning
// test mode would otherwise be badged live.
//
// THE ENVIRONMENT NEVER REACHES THE BROWSER. Only the three-valued verdict
// crosses into a component; the variable itself stays on the server.

import { expectedStripeLivemode } from "@/lib/checkout/stripe-session";

/** `"unconfigured"` is a real state, not an absence to paper over: checkout
 *  refuses in it, and both cards say so. */
export type PaymentsMode = "live" | "test" | "unconfigured";

export function paymentsModeFrom(env: Record<string, string | undefined>): PaymentsMode {
  const declared = expectedStripeLivemode(env);
  if (declared === null) return "unconfigured";
  return declared ? "live" : "test";
}
