"use client";

import { useParams } from "next/navigation";

import { ClaraRail } from "@/components/clara/ClaraRail";

// P2 FOLD SEAM H: the ONE Clara rail mount for the whole (firm) shell — mounted from
// `app/(firm)/layout.tsx`. `clientId` comes from the URL when the (firm) layout
// happens to be rendering a client-workspace route; `ClaraRail` resolves/creates the
// right thread for whichever altitude that implies (`auth` defaults to the blessed
// `sessionTokenAccessor` singleton — see `ClaraRail`'s own header). NEVER add a
// second mount in `app/(firm)/clients/[clientId]/layout.tsx` — nested layouts
// compose, so a second mount there would show two rails on every client-workspace
// route.
//
// P2 FOLD ROUND 3: no pathname suppression here anymore. Both Clara full-screen
// escalation routes ("/clara/:threadId", "/clients/:clientId/clara/:threadId") were
// MOVED out of `(firm)` into their own `app/(full)/` route group (same URLs — route
// groups add no URL segment), which does not nest under `app/(firm)/layout.tsx` at
// all. This layout genuinely never wraps an escalation route anymore, so there is
// nothing left for a pathname guard here to suppress (Q2's "remove-the-rail"
// requirement is now satisfied structurally, by which layout wraps which route, not
// by a runtime check — see `app/(full)/layout.tsx`'s own header for the mechanism).
export function RailMount() {
  const params = useParams();
  const clientId = typeof params.clientId === "string" ? params.clientId : undefined;

  return <ClaraRail clientId={clientId} />;
}
