"use client";

// The Clara RAIL (P2-RAIL, build order item 1) — a dockable right-side panel present
// in every workspace, per the interaction law (Q2: "persistent rail in every
// workspace"). Self-contained: it resolves/creates its own active thread and reads the
// module-level thread store directly, so it needs no provider mounted above it.
//
// P2 FOLD SEAM H: mounted ONCE, app-wide, from `components/clara/rail-mount.tsx`
// (itself mounted in `app/(firm)/layout.tsx`). The full-screen escalation routes live
// in the `app/(full)/` route group, outside that layout, so no runtime suppression is
// needed (P2 fold round 3). `auth` defaults to the blessed `sessionTokenAccessor`
// singleton (`@/lib/session-accessor`); a caller (tests included) may still override it.

import { useCallback, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ClaraThreadView } from "@/components/clara/ClaraThreadView";
import { ClaraThreadMenu } from "@/components/clara/ClaraThreadMenu";
import { useActiveThreadId } from "@/lib/clara/useActiveThread";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useClaraRailOpen, useFocusRailSubscription } from "@/lib/clara/useClaraThread";
import { claraThreadStore } from "@/lib/clara/threadStore";
// CB-AE2E-019 — the rail's CHROME (presence, the collapsed launcher, the class
// string and the two viewport arms) lives in these three siblings; this file
// keeps the rail's CONTENT. See rail-chrome.tsx's header for the split.
import { useRailPresence } from "@/lib/clara/useRailPresence";
import { ClaraRailLauncher } from "@/components/clara/rail-launcher";
import { RAIL_PANEL_CLASS } from "@/components/clara/rail-chrome";

export function ClaraRail({ auth = sessionTokenAccessor, clientId }: { auth?: SessionTokenAccessor; clientId?: string }) {
  const t = useTranslations("Clara.rail");
  const open = useClaraRailOpen();
  const pathname = usePathname();
  const { threadId, error, resolving, threads, createThread, creating, canCreate, selectThread } = useActiveThreadId(auth, clientId);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  // FOCUS RETURNS TO THE CONTROL THAT OPENED THE PANEL. The ref lives here, not in the
  // menu, because the toggle is this component's element — the panel closing unmounts
  // itself and cannot hand focus anywhere from inside its own teardown.
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    menuToggleRef.current?.focus();
  }, []);
  useFocusRailSubscription(); // P2 FOLD SEAM C: ⌘K "Ask" -> this rail's composer

  const escalateBase = clientId ? `/clients/${clientId}/clara/${threadId}` : `/clara/${threadId}`;
  const escalateHref = `${escalateBase}?from=${encodeURIComponent(pathname)}`;
  const presence = useRailPresence(open);

  // CB-AE2E-019: THREE presence states, not two. `open` is the store's truth;
  // `presence` adds the "closing" window in which the panel is still mounted and
  // sliding out. The launcher's markup moved to `rail-launcher.tsx` verbatim; the
  // chrome (position, width, motion) moved to `rail-chrome.tsx`. See
  // `lib/clara/useRailPresence.ts` for why an exit needs this and a boolean
  // cannot express it — this is the structural change this file's own motion
  // note asked for and declined to half-build.
  if (presence === "closed") {
    return <ClaraRailLauncher />;
  }

  return (
    // Motion: `dock-panel` (app/globals.css) slides the rail in from the right
    // edge it docks to AND back out again. The contract names this exact case —
    // §7's `--duration-panel` tier is "Dialog, sheet, Clara dock reflow" (200ms,
    // `--ease-out`); under reduced motion the slide becomes a fade (§7: position
    // removed, opacity kept). The exit this file's previous note declined to
    // half-build is now real: `data-state` is what the closed arm keys on, and
    // `useRailPresence` is what keeps the aside mounted while it runs.
    // The class string and the two viewport arms live in `rail-chrome.tsx` — the
    // rail's CHROME is not its content, and this file owns the content.
    <aside
      ref={railRef}
      data-clara-rail
      data-state={presence === "open" ? "open" : "closed"}
      className={RAIL_PANEL_CLASS}
      aria-label={t("title")}
      // ESCAPE CLOSES THE THREAD MENU, FROM ANYWHERE INSIDE THE RAIL — and it has to be
      // here rather than on the panel, which is where the first cut put it. The toggle
      // lives in the `<header>` below and the panel is that header's SIBLING, so a
      // keydown on the toggle bubbles up through the header to this element and never
      // enters the panel: Escape did nothing in the commonest case of all (open the menu,
      // change your mind, press Escape without having moved focus). This root is the one
      // ancestor both the toggle and the panel bubble through.
      //
      // GUARDED TWICE, and the second guard is the one a DOM intuition gets wrong.
      //
      // `menuOpen` keeps the rail from swallowing an Escape it has no use for. The
      // CONTAINMENT check keeps it from swallowing one that belongs to a dialog. React
      // propagates synthetic events through the REACT tree, not the DOM tree, so a Base UI
      // dialog portalled into `document.body` still bubbles its keydown to this handler
      // whenever the component that rendered it is a descendant of this element — and
      // three are, all reached through `ClaraThreadView`: OnboardingChecklistCard's
      // bootstrap door, InterviewRunCard's cancel door and ApplyStandardChartControl's
      // apply door. Without this check, one Escape inside any of them closed the DIALOG
      // and the thread menu together and moved focus to the menu toggle — a control the
      // human was not using.
      //
      // `contains` is asked of the real DOM, which is where the portal genuinely is not.
      onKeyDown={(event) => {
        if (!menuOpen || event.key !== "Escape") return;
        if (!railRef.current?.contains(event.target as Node)) return;
        event.stopPropagation();
        closeMenu();
      }}
    >
      <header className="flex items-center justify-between border-b border-border p-2">
        <span className="text-sm font-semibold text-clara">{t("title")}</span>
        <div className="flex gap-1">
          {/* 裁-117 — the thread menu. A plain DISCLOSURE, not a portaled menu:
              the list is small by ruling (one thread per altitude is the beta
              shape, with a switcher rather than a sidebar), the rail is 320px
              wide, and an inline panel keeps the whole control inside
              `data-clara-rail` where the a11y scan and the keyboard walk already
              reach it. `aria-expanded`/`aria-controls` carry the state. */}
          <Button
            ref={menuToggleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("threads")}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
          >
            {t("threadsShort")}
          </Button>
          {threadId && (
            <Link
              href={escalateHref}
              aria-label={t("escalate")}
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              {t("escalateShort")}
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => claraThreadStore.setRailOpen(false)}
            aria-label={t("collapse")}
          >
            {t("collapseShort")}
          </Button>
        </div>
      </header>
      {menuOpen ? (
        <ClaraThreadMenu
          id={menuId}
          threads={threads}
          activeThreadId={threadId}
          creating={creating}
          canCreate={canCreate}
          onCreate={async () => {
            const created = await createThread();
            // The panel closes only on a thread this altitude actually got. A failed
            // create leaves it open with the rail's own error banner below it, rather
            // than dismissing the control that produced the failure.
            if (created) closeMenu();
          }}
          onSelect={(id) => {
            selectThread(id);
            closeMenu();
          }}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {/* P6-5: the `key={clientId ?? "firm"}` #507 put HERE moved up to `RailMount`, which
            is the one mount point for this whole subtree — see that file's own note. Same
            law, one level higher, so it now covers the composer, the attachment tray and
            everything a later feature adds, not just this view. A key here as well would be
            a second copy of the same boundary with nothing extra to fence. */}
        <ClaraThreadView
          auth={auth}
          threadId={threadId}
          resolveError={error}
          variant="rail"
          clientId={clientId}
          resolving={resolving}
          onCreateThread={createThread}
          creatingThread={creating}
          canCreateThread={canCreate}
        />
      </div>
    </aside>
  );
}
