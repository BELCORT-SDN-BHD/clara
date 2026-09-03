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
// P6-5 — THE RAIL'S STRUCTURAL CLIENT BOUNDARY (apps/web/AGENTS.md's house law).
//
// THE PROBLEM THIS KEY IS. `<RailMount />` is a SIBLING of `{children}` in
// `app/(firm)/layout.tsx`, while `ClientScopeProvider` lives one layout down in
// `app/(firm)/clients/[clientId]/layout.tsx`. Nested layouts compose, so the rail is never
// inside the keyed subtree and never remounts on a client switch — every piece of
// client-owned React state in it therefore survives into the NEXT client unless something
// explicitly tears it down. #507 paid for that sentence with the thread, #508 with the
// attachment tray, and the house law says the next lane pays for it again for whatever it
// adds. This is the last one: the boundary is the mount itself.
//
// WHAT SURVIVES A SWITCH: nothing client-owned. `key` on the rail rebuilds the WHOLE
// subtree — composer draft, attachment tray and its upload queue, the interview card, an
// answer half-typed into a clarify, and every future piece of state anything under here
// ever adds — so a new feature cannot leak by forgetting its own reset, which is exactly
// the failure the per-feature discipline could only catch after the fact.
//
// WHAT MUST NOT BE TORN DOWN: a live turn. The SSE attachment is NOT React state — it is a
// promise loop writing into the module-level `claraThreadStore`, keyed by thread id
// (lib/clara/threadStore.ts) — so it keeps running across this remount, and the store
// entry it writes into is what a returning client (or the firm altitude) reads back. That
// is why `useActiveThreadId` no longer deletes the outgoing thread's store entry on an
// altitude change: the key already fences what renders, and deleting the entry was the one
// thing that could destroy a running turn's state on a switch away and back. A different
// client is a different thread id, so nothing crosses; see that file's own note.
//
// THE FIRM ALTITUDE IS A SCOPE LIKE ANY OTHER. `clientId ?? "firm"` keys it too, so
// A -> firm is as clean a boundary as A -> B, and the firm thread's own store entry
// survives the trip in exactly the same way a client thread's does.
export function RailMount() {
  const params = useParams();
  const clientId = typeof params.clientId === "string" ? params.clientId : undefined;

  return <ClaraRail key={clientId ?? "firm"} clientId={clientId} />;
}
