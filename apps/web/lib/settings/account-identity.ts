// #626 (refresh spec #612, journey D1) — the Account section's two read-only
// facts. Neither is a "preference": both already have an authoritative home
// that predates 0179_user_preferences.sql, so this module adds NO door and NO
// migration of its own.

import { createClient } from "@/lib/supabase/client";
import { getRows } from "@/lib/read";
import { sessionTokenAccessor } from "@/lib/session-accessor";

/**
 * The caller's own email, straight from the live Supabase session — never a DB
 * round trip. "Email read-only from the session" (the ticket's own inventory
 * line) is a deliberate design choice, not a shortcut: the session IS the
 * authority on which address this device is currently signed in as, exactly
 * the same source lib/session.ts's `getSessionToken` reads from.
 * CLIENT-SIDE ONLY, like that sibling function.
 */
export async function getSessionIdentity(): Promise<{ userId: string; email: string | null } | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return { userId: data.session.user.id, email: data.session.user.email ?? null };
}

/**
 * The caller's OWN `clara.users.display_name` — a plain read on a table whose
 * RLS already admits this exact query (`p_users_human`, 0002_foundation.sql:
 * 497-498, `id = jwt_sub() OR shares_my_firm_human(id)`), so no new door or
 * migration is needed to show it. Editing it is a DIFFERENT, not-yet-built
 * capability (Settings.account.sections.account.editNote) — this function
 * only ever reads.
 */
export async function getMyDisplayName(userId: string): Promise<string | null> {
  const rows = await getRows<{ display_name: string }>("users", {
    select: "display_name",
    filters: { id: `eq.${userId}` },
    session: sessionTokenAccessor,
  });
  return rows[0]?.display_name ?? null;
}
