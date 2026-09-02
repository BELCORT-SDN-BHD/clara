import { ClaraFullScreenThread } from "@/components/clara/ClaraFullScreenThread";
import { notFound } from "next/navigation";

import { loadChatSession } from "@/lib/firm-admin/chat-sharing";
import { sessionBelongsToClient } from "@/lib/clara/thread-scope";
import { fixedTokenAccessor, resolveServerSession } from "@/lib/supabase/server-session";

/**
 * Client-workspace Clara thread escalation ("/clients/:clientId/clara/:threadId") —
 * P2-RAIL, the client-altitude twin of `(full)/clara/[threadId]`. Lives in the `(full)`
 * route group (P2 fold round 3), not `(firm)` — same URL, no firm sidebar/rail chrome.
 *
 * The rail's expand control lands here with `?from=<originating pathname>`; the
 * collapse control reads it back (Q2: "collapsible back to the rail"). No `from`
 * falls back to the client workspace root.
 */
export default async function ClientClaraThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; threadId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { clientId, threadId } = await params;
  const { from } = await searchParams;
  const caller = await resolveServerSession();
  if (caller === null) notFound();
  const session = await loadChatSession(fixedTokenAccessor(caller.accessToken), threadId);
  if (!sessionBelongsToClient(session, clientId)) notFound();

  return <ClaraFullScreenThread threadId={threadId} returnHref={from || `/clients/${clientId}`} clientId={clientId} />;
}
