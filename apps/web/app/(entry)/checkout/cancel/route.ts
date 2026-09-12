import { handleCheckoutCancelPost } from "./handler";

/**
 * `POST /checkout/cancel` — #628's fourth server entry, the one that ENDS a
 * checkout. POST only: there is no GET export here at all, so a prefetch, a
 * mail scanner, a restored tab or a pasted link can never cancel somebody's
 * payment. The body lives in `./handler.ts` so every branch — the refusals, the
 * replay, and the best-effort Stripe expiry's own failure — is driven directly
 * by cells rather than only through a live request scope.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCheckoutCancelPost(request);
}
