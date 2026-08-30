import { SignupAccountForm } from "./signup-account-form";
import { SignupFirmForm } from "./signup-firm-form";

import { isConfirmedUser } from "@/lib/auth/confirmed-user";
import type { ServerSession } from "@/lib/supabase/server-session";

/** Pure rendering fork kept outside the App Router page so its two outcomes can
 * be pinned without exporting a non-route symbol from `page.tsx`. */
export function SignupStep({
  session,
  user,
}: {
  session: ServerSession | null;
  user: unknown;
}) {
  if (session === null || typeof user !== "object" || user === null) {
    return <SignupAccountForm />;
  }

  const userId = (user as Record<string, unknown>).id;
  if (userId !== session.subject) return <SignupAccountForm />;

  try {
    return isConfirmedUser(user) ? <SignupFirmForm /> : <SignupAccountForm />;
  } catch {
    // A malformed present confirmation value is not evidence of confirmation.
    return <SignupAccountForm />;
  }
}
