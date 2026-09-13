import { PasswordRecoveryForm } from "./password-recovery-form";
import { PasswordResetForm } from "./password-reset-form";

import {
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

export type ResolvePasswordResetSession = () => Promise<ServerSession | null>;

/**
 * Request-time route fork, extracted so both session arms are directly
 * testable. `next` (#622 review round) is the RAW, still-unvalidated return
 * target `/auth/recover/handler.ts` forwarded as this route's own `?next=`
 * after reading and clearing the recovery-next cookie — plainly passed
 * through to `PasswordResetForm`, which is the ONE place it is actually
 * resolved (`resolveSameOriginPath`, the same wall `login-form.tsx` itself
 * reads `?next=` through). Defaults to `null` for a plain
 * `/auth/recover/password` visit with nothing to carry.
 */
export async function renderPasswordResetRoute(
  resolveSession: ResolvePasswordResetSession = resolveServerSession,
  next: string | null = null,
) {
  const session = await resolveSession();
  if (session === null) return <PasswordRecoveryForm invalidLink />;
  return <PasswordResetForm next={next} />;
}
