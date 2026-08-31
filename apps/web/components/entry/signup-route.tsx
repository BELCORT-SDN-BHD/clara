import { SignupStep } from "./signup-step";

import { createClient } from "@/lib/supabase/server";
import {
  resolveServerSession,
  type ServerSession,
} from "@/lib/supabase/server-session";

export interface SignupServerAuthClient {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: unknown | null };
      error: unknown | null;
    }>;
  };
}

export type ResolveSignupSession = () => Promise<ServerSession | null>;
export type CreateSignupServerAuthClient = () => Promise<SignupServerAuthClient>;

/**
 * The request-time `/signup` rendering root, kept outside `page.tsx` so the
 * complete cookie-session → confirmed-user → form fork can be driven without
 * exporting a non-route symbol from an App Router page.
 */
export async function renderSignupRoute(
  resolveSession: ResolveSignupSession = resolveServerSession,
  createSupabaseClient: CreateSignupServerAuthClient = createClient,
) {
  const session = await resolveSession();
  if (session === null) return SignupStep({ session: null, user: null });

  // Re-read the user with the exact token whose claims yielded `subject`.
  // Browser persistence is never evidence that the email was confirmed.
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.auth.getUser(session.accessToken);
  return SignupStep({
    session,
    user: error === null ? data.user : null,
  });
}
