import { handleCheckoutPost } from "./handler";

/**
 * `POST /checkout` — server entry 2 of 3 (checkout-gate-design part 1 §1.1).
 * POST only: there is no GET here, so a mail scanner, a prefetch or a pasted
 * link can never open a Checkout Session or spend a rate-wall attempt. The
 * body lives in `./handler.ts` so every branch is driven directly by cells
 * rather than only through a live request scope.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCheckoutPost(request);
}
