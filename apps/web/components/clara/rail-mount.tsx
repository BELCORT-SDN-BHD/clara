"use client";

import { useParams, usePathname } from "next/navigation";

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
// SUPPRESSED on a Clara escalation route ("/clara/:threadId" or
// "/clients/:clientId/clara/:threadId"). This is required by the standing ruling
// (mohe-grill-rulings-2026-08-27.md Q2: "full-screen is the rail conversation
// enlarged, never a separate universe... the remove-the-rail acceptance test binds
// every workbench screen regardless") — both escalation pages
// (`app/(firm)/clara/[threadId]/page.tsx` and
// `app/(firm)/clients/[clientId]/clara/[threadId]/page.tsx`) render as `children` of
// this SAME (firm) layout, so an unconditional mount here would show the docked rail
// beside the full-screen thread, which the ruling forbids. No prior mechanism existed
// for this suppression (checked: neither `ClaraRail` nor either full-screen page
// carried one) — this pathname check is the minimal implementation of the
// already-ruled behaviour, not a new decision.
export function RailMount() {
  const pathname = usePathname();
  const params = useParams();
  const clientId = typeof params.clientId === "string" ? params.clientId : undefined;

  const onClaraEscalation = /(?:^|\/)clara\/[^/]+$/.test(pathname);
  if (onClaraEscalation) return null;

  return <ClaraRail clientId={clientId} />;
}
