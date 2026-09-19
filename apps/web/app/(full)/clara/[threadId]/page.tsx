import { ClaraFullScreenThread } from "@/components/clara/ClaraFullScreenThread";

import { loadCallerContext } from "@/lib/identity/caller-context";
import { fixedTokenAccessor, resolveServerSession } from "@/lib/supabase/server-session";

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

  // #642 AC1 — THE FIRM NAME, MEASURED HERE. This route group's layout is a bare
  // passthrough that never mounts `FirmScopeProvider`, so the client band has no context
  // to read on the escalated route and would name nothing exactly where the conversation
  // fills the viewport. This is the ORDINARY self-scoped `clara.caller_context` read
  // (`lib/identity/caller-context.ts`), NOT a second scope-spine entrance: `(full)`'s own
  // layout already ran `requireFirmScope()` above this page, and the spine has exactly
  // four registered entrances that `tests/firm-scope-surfaces.test.ts` pins both ways.
  // It DEGRADES rather than blocking — a name this page could not read renders as the
  // band's neutral placeholder, and the person can still send.
  const firmName = await readFirmName();

  return <ClaraFullScreenThread threadId={threadId} returnHref={from || "/"} firmName={firmName} />;
}

/** Fail-quiet by construction: every failure mode — no session, a read that threw, an
 *  ambiguous context — resolves to `null`, which the band renders as its placeholder. A
 *  scope label is context, never authority, and it must never be the thing that keeps a
 *  conversation from opening. */
async function readFirmName(): Promise<string | null> {
  try {
    const caller = await resolveServerSession();
    if (caller === null) return null;
    const context = await loadCallerContext(fixedTokenAccessor(caller.accessToken));
    return context?.firm_name ?? null;
  } catch {
    return null;
  }
}
