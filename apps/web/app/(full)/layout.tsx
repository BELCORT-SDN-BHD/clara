import type { ReactNode } from "react";

import { requireFirmScope } from "@/lib/require-firm-scope";

/**
 * The (full) route group — Clara's ESCALATED full-screen surfaces
 * (`app/(full)/clara/[threadId]`, `app/(full)/clients/[clientId]/clara/
 * [threadId]`) own the whole viewport (P2 fold round 3; Q2: "full-screen is
 * the rail conversation enlarged, never a separate universe" — the
 * remove-the-rail acceptance test binds here). Route groups add no URL
 * segment, so both pages keep the exact same "/clara/:threadId" /
 * "/clients/:clientId/clara/:threadId" paths they had under `(firm)`.
 *
 * NO firm sidebar, NO `CommandKProvider`, NO `ClaraRail` — those belong to
 * `app/(firm)/layout.tsx` only, which this group does not nest under (route
 * groups are siblings, not parents of one another). The root layout
 * (`app/layout.tsx`) already supplies the html-level chrome
 * (`NextIntlClientProvider`, `SessionTokenBridge`) above every group, so this
 * one is a bare passthrough — `ClaraFullScreenThread` already sizes itself
 * with `h-dvh` and owns its own header, so nothing here needs to wrap it in
 * another container.
 *
 * P4-2, ENTRANCE 2 OF THE SCOPE SPINE — and the reason the spine is not simply
 * a check in `(firm)/layout.tsx`. Being a bare passthrough in MARKUP terms is
 * exactly what made this group a hole in AUTHORITY terms: route groups are
 * siblings, not parents of one another, so `(firm)`'s layout never wraps these
 * two escalated routes. Before this train, a session with no active membership
 * could reach /clara/:threadId and /clients/:clientId/clara/:threadId and land
 * in the NULL-`jwt_firm()` state — a full-screen Clara thread over an estate
 * that returns zero rows to every read. `requireFirmScope()` closes it here,
 * with the SAME implementation the firm shell calls (design §4 E).
 */
export default async function FullLayout({
  children,
}: {
  children: ReactNode;
}) {
  // No argument — see lib/require-firm-scope.ts's `CallerContextReader`, and the
  // suite that asserts all three entrances call it bare.
  await requireFirmScope();

  return <>{children}</>;
}
