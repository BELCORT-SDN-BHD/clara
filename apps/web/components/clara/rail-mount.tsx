"use client";

import { useParams } from "next/navigation";

import { ClaraRail } from "@/components/clara/ClaraRail";
import { ClaraRailChrome } from "@/components/clara/rail-chrome";
import { useSidebarOptional } from "@/components/ui/sidebar";
import { isClientIdShape } from "@/lib/client-id";
import { FIRM_ALTITUDE } from "@/lib/clara/useActiveThread";

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
// THE FIRM ALTITUDE IS A SCOPE LIKE ANY OTHER. `clientId ?? FIRM_ALTITUDE` keys it
// too, so A -> firm is as clean a boundary as A -> B, and the firm thread's own
// store entry survives the trip in exactly the same way a client thread's does.
// `FIRM_ALTITUDE` is `useActiveThread.ts`'s own name for this store key, imported
// rather than re-spelled as a bare "firm" literal (#614 code review).
//
// CB-AE2E-019 — `<ClaraRailChrome>` WRAPS the rail here rather than the rail
// growing viewport arms of its own. Two reasons. (1) The key: `key` must stay on
// `<ClaraRail>` and not migrate to a wrapper, or a client switch would rebuild
// the chrome (and its focus and presence state) instead of the subtree the P6-5
// boundary above is about — the chrome is app-wide and client-agnostic, so it
// sits OUTSIDE the key deliberately. (2) The split: above `lg` the chrome is
// `display: contents` and the rail's `<aside>` is a direct flex child of the
// shell row exactly as before, so this wrapper adds nothing to the arm that
// already worked. See `rail-chrome.tsx`.
export function RailMount() {
  const params = useParams();
  // #614 — A MALFORMED SEGMENT MOUNTS THE FIRM-ALTITUDE RAIL, NEVER A
  // client_id=eq.<garbage> REQUEST. `params.clientId` is the raw URL segment,
  // unchecked by anything upstream by the time it reaches a client component
  // — the layout's own `notFound()` guard (app/(firm)/clients/[clientId]/
  // layout.tsx) runs in a DIFFERENT React subtree (this mount is a sibling of
  // `{children}` in app/(firm)/layout.tsx, see this file's own header) and
  // never protects this read. Before this gate, a segment like
  // "not-a-client" reached `OnboardingChecklistCard` -> `getOnboardingClient`
  // (lib/onboarding/api.ts) as an id=eq. filter that real PostgREST answers
  // with HTTP 400 `22P02`, and that raw code leaked straight into the rail's
  // error banner (CB-AE2E-022). Falling back to `undefined` here is exactly
  // the firm altitude this component already has a name for.
  const rawClientId = typeof params.clientId === "string" ? params.clientId : undefined;
  const clientId = rawClientId !== undefined && isClientIdShape(rawClientId) ? rawClientId : undefined;
  // ONE OVERLAY STACK (#614, AC6). Below `md` the navigation Sheet is a modal;
  // Base UI hides the sidebar inset behind it but its hide-others sweep does
  // not reach this sibling (measured in the browser leg), so the rail stayed
  // live — focusable and announced — behind a true modal. While the mobile
  // Sheet is open the rail is `inert`: not focusable, not in the accessibility
  // tree, and it never intercepts a pointer. Nothing about the rail's own
  // state changes; closing the Sheet restores it exactly as it was.
  const sidebar = useSidebarOptional();
  const behindNavSheet = sidebar?.isMobile === true && sidebar.openMobile;

  return (
    <ClaraRailChrome inert={behindNavSheet}>
      <ClaraRail key={clientId ?? FIRM_ALTITUDE} clientId={clientId} />
    </ClaraRailChrome>
  );
}
