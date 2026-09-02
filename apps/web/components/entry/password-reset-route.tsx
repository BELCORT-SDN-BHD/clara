import { PasswordRecoveryForm } from "./password-recovery-form";
import { PasswordResetForm } from "./password-reset-form";

import {
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

export type ResolvePasswordResetSession = () => Promise<ServerSession | null>;

/** Request-time route fork, extracted so both session arms are directly testable. */
export async function renderPasswordResetRoute(
  resolveSession: ResolvePasswordResetSession = resolveServerSession,
) {
  const session = await resolveSession();
  if (session === null) return <PasswordRecoveryForm invalidLink />;
  return <PasswordResetForm />;
}
