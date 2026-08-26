import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * "/logout" — POST only. Sign-out is a mutation, not a GET-navigable page:
 * a GET route is link-prefetchable and crawlable, which would make visiting
 * a page with a stray logout link enough to end a session by accident.
 * `components/logout-button.tsx` is the one caller.
 *
 * The session cookie is cleared server-side (lib/supabase/server.ts writes
 * through `cookieStore.set`, invoked here by `signOut()`), so the response
 * carries the cleared cookie regardless of the browser client's own cookie
 * access.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
