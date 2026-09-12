import { handleConfirmationResendPost } from "./handler";

/**
 * `POST /auth/confirm/resend` — the confirmation card's "send me a new code"
 * control. POST only: there is no GET export here, so a prefetch, a mail
 * scanner or a pasted link can never ask the provider to send mail or spend a
 * C1/C2 attempt. The body lives in `./handler.ts` so every branch is driven
 * directly by cells rather than only through a live request scope.
 */
export async function POST(request: Request): Promise<Response> {
  return handleConfirmationResendPost(request);
}
