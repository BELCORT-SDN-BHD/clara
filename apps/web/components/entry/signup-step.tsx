import { SignupAccountForm } from "./signup-account-form";
import { SignupDpaForm } from "./signup-dpa-form";
import { SignupFirmForm } from "./signup-firm-form";

import { isConfirmedUser } from "@/lib/auth/confirmed-user";
import type { DpaDocumentState } from "@/lib/registration/dpa-server-reads";
import type { ServerSession } from "@/lib/supabase/server-session";

/**
 * THE ONE GUARD, shared by `SignupStep` below and `signup-route.tsx` (M5, fix
 * round 2026-09-01). It used to live only here, INSIDE `SignupStep`, while
 * `renderSignupRoute` gated its own two extra reads with a weaker check
 * (`typeof user === "object"` alone — no confirmed-email check, no subject
 * match) and CLAIMED in its own header comment that the reads ran "only once
 * a session and a positively confirmed email are in hand". That claim was
 * false: an authenticated-but-unconfirmed caller triggered both reads on
 * every render. Rendering stayed safe (this function still returned
 * `SignupAccountForm` regardless) and the reads are RLS-scoped under the
 * caller's own token, so it was never a data leak — but a false claim in an
 * auth-adjacent header is exactly the kind of drift review law 3 exists to
 * catch, and the wasted round-trips were real. One predicate, two call
 * sites, so the header and the gate can no longer say different things.
 */
export function isUsableConfirmedSession(
  session: ServerSession | null,
  user: unknown,
): boolean {
  if (session === null || typeof user !== "object" || user === null) return false;
  const userId = (user as Record<string, unknown>).id;
  if (userId !== session.subject) return false;
  try {
    return isConfirmedUser(user);
  } catch {
    // A malformed present confirmation value is not evidence of confirmation.
    return false;
  }
}

/**
 * Pure rendering fork kept outside the App Router page so its outcomes can be
 * pinned without exporting a non-route symbol from `page.tsx`.
 *
 * THE THIRD FORK (FS-4 C-6, checkout-gate-design.md §1.1 step ④). An open
 * registration means `claim_identity` + `request_firm_registration` already
 * ran — `SignupFirmForm` would re-attempt them with a fresh op_key and be
 * refused CLR09 "an open registration request already exists"
 * (`uq_firm_registration_requests_open_applicant`), a broken loop for a
 * person simply revisiting `/signup` (e.g. from `/pending`'s own
 * "continue to checkout" control). `hasOpenRegistration` is a POSITIVE read
 * result (`signup-route.tsx`), never inferred from the confirmed-user branch
 * alone, so a read failure falls back to the SAFE default — `SignupFirmForm`
 * — rather than silently hiding a step that genuinely needs running first.
 */
export function SignupStep({
  session,
  user,
  hasOpenRegistration = false,
  dpaDocument = { kind: "unavailable" },
}: {
  session: ServerSession | null;
  user: unknown;
  hasOpenRegistration?: boolean;
  dpaDocument?: DpaDocumentState;
}) {
  if (!isUsableConfirmedSession(session, user)) return <SignupAccountForm />;
  if (hasOpenRegistration) return <SignupDpaForm document={dpaDocument} />;
  return <SignupFirmForm />;
}
