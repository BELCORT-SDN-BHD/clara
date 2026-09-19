import { ClaraFullScreenThread } from "@/components/clara/ClaraFullScreenThread";
import { notFound } from "next/navigation";

import { loadChatSession } from "@/lib/firm-admin/chat-sharing";
import { sessionBelongsToClient } from "@/lib/clara/thread-scope";
import { loadCallerContext } from "@/lib/identity/caller-context";
import { loadClientById } from "@/lib/firm/reads";
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
  const token = fixedTokenAccessor(caller.accessToken);
  const session = await loadChatSession(token, threadId);
  if (!sessionBelongsToClient(session, clientId)) notFound();

  // #642 AC1 — BOTH SCOPE NAMES, measured on the token this page ALREADY resolved to
  // guard the route (no second session resolution, no new authority). The reads are the
  // ordinary self-scoped ones — `clara.caller_context` for the firm and `loadClientById`
  // for the client — never the scope spine, whose four entrances are pinned both ways by
  // `tests/firm-scope-surfaces.test.ts` and whose layout entrance already ran above this
  // page. Both degrade to `null`, which the band renders as its neutral placeholder: a
  // name that could not be read is never guessed, and never blocks the composer.
  const [context, client] = await Promise.all([
    loadCallerContext(token).catch(() => null),
    loadClientById(token, clientId).catch(() => null),
  ]);

  return (
    <ClaraFullScreenThread
      threadId={threadId}
      returnHref={from || `/clients/${clientId}`}
      clientId={clientId}
      firmName={context?.firm_name ?? null}
      clientName={client?.name ?? null}
    />
  );
}
