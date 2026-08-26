import type { ReactNode } from "react";

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
 */
export default function FullLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
