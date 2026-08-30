import { SignupAccountForm } from "./signup-account-form";
import { SignupFirmForm } from "./signup-firm-form";

import type { ServerSession } from "@/lib/supabase/server-session";

/** Pure rendering fork kept outside the App Router page so its two outcomes can
 * be pinned without exporting a non-route symbol from `page.tsx`. */
export function SignupStep({ session }: { session: ServerSession | null }) {
  return session === null ? <SignupAccountForm /> : <SignupFirmForm />;
}
