import { ClaraFullScreenThread } from "@/components/clara/ClaraFullScreenThread";

/**
 * Client-workspace Clara thread escalation ("/clients/:clientId/clara/:threadId") —
 * P2-RAIL, the client-altitude twin of `(firm)/clara/[threadId]`.
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

  return <ClaraFullScreenThread threadId={threadId} returnHref={from || `/clients/${clientId}`} />;
}
