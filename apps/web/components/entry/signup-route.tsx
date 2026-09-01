import { SignupStep } from "./signup-step";

import { hasOpenRegistrationFor } from "@/lib/registration/holding-state";
import {
  loadOwnRegistrationRequests,
  type OwnRegistrationResult,
} from "@/lib/registration/server-reads";
import {
  loadCurrentDpaDocumentState,
  type DpaDocumentState,
} from "@/lib/registration/dpa-server-reads";
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
export type LoadSignupRegistration = () => Promise<OwnRegistrationResult>;
export type LoadSignupDpaDocument = () => Promise<DpaDocumentState>;

/**
 * The request-time `/signup` rendering root, kept outside `page.tsx` so the
 * complete cookie-session → confirmed-user → form fork can be driven without
 * exporting a non-route symbol from an App Router page.
 *
 * THE THIRD FORK'S TWO READS (FS-4 C-6) run ONLY once a session and a
 * positively confirmed email are in hand — an anonymous or unconfirmed
 * visitor never triggers either, matching `/signup`'s own "the fork chooses
 * which form to paint; every wall belongs to Supabase Auth and the doors"
 * posture (this file's original header, kept true below). Both reads are
 * independently fail-safe: `loadOwnRegistrationRequests`'s `!ok` branch and
 * `loadCurrentDpaDocumentState`'s own catch-all both degrade to the SAFE
 * default (`SignupFirmForm`, an "unavailable" document) rather than ever
 * throwing this page into the framework's error boundary.
 */
export async function renderSignupRoute(
  resolveSession: ResolveSignupSession = resolveServerSession,
  createSupabaseClient: CreateSignupServerAuthClient = createClient,
  loadRegistration: LoadSignupRegistration = loadOwnRegistrationRequests,
  loadDpaDocument: LoadSignupDpaDocument = loadCurrentDpaDocumentState,
) {
  const session = await resolveSession();
  if (session === null) return SignupStep({ session: null, user: null });

  // Re-read the user with the exact token whose claims yielded `subject`.
  // Browser persistence is never evidence that the email was confirmed.
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.auth.getUser(session.accessToken);
  const user = error === null ? data.user : null;

  // The two extra reads are POSITIVE evidence, never inferred from `user`
  // alone — a confirmed-but-unregistered caller must still reach
  // `SignupFirmForm`, and only a validated OPEN row (`hasOpenRegistrationFor`)
  // reroutes to the DPA step.
  let hasOpenRegistration = false;
  let dpaDocument: DpaDocumentState = { kind: "unavailable" };
  if (typeof user === "object" && user !== null) {
    // WRAPPED, deliberately (the same discipline `/pending`'s page.tsx
    // applies to this exact read): a transport failure here must fall back
    // to the SAFE default — `SignupFirmForm` — never throw `/signup` into
    // the framework's error boundary over a read this fork treats as
    // best-effort evidence, not a wall.
    try {
      const registration = await loadRegistration();
      hasOpenRegistration = hasOpenRegistrationFor(
        registration,
        registration.ok ? registration.subject : null,
      );
    } catch {
      hasOpenRegistration = false;
    }
    if (hasOpenRegistration) {
      try {
        dpaDocument = await loadDpaDocument();
      } catch {
        dpaDocument = { kind: "unavailable" };
      }
    }
  }

  return SignupStep({ session, user, hasOpenRegistration, dpaDocument });
}
