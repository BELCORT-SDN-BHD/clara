import { ClaraFullScreenThread } from "@/components/clara/ClaraFullScreenThread";

/**
 * Firm-altitude Clara thread escalation ("/clara/:threadId") — P2-RAIL. Lives in the
 * `(full)` route group (P2 fold round 3), not `(firm)` — same URL, no firm sidebar/rail
 * chrome (the whole point: this page owns the viewport).
 *
 * The rail's expand control lands here with `?from=<originating pathname>`; the
 * collapse control reads it back so escalation is a round trip, never a dead end
 * (Q2: "collapsible back to the rail"). No `from` (a bookmarked/shared URL) falls back
 * to firm home.
 */
export default async function FirmClaraThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { threadId } = await params;
  const { from } = await searchParams;

  return <ClaraFullScreenThread threadId={threadId} returnHref={from || "/"} />;
}
