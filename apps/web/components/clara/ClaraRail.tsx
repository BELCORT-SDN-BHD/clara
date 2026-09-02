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

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ClaraThreadView } from "@/components/clara/ClaraThreadView";
import { useActiveThreadId } from "@/lib/clara/useActiveThread";
import type { SessionTokenAccessor } from "@/lib/session";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { useClaraRailOpen, useFocusRailSubscription } from "@/lib/clara/useClaraThread";
import { claraThreadStore } from "@/lib/clara/threadStore";

export function ClaraRail({ auth = sessionTokenAccessor, clientId }: { auth?: SessionTokenAccessor; clientId?: string }) {
  const t = useTranslations("Clara.rail");
  const open = useClaraRailOpen();
  const pathname = usePathname();
  const { threadId, error } = useActiveThreadId(auth, clientId);
  useFocusRailSubscription(); // P2 FOLD SEAM C: ⌘K "Ask" -> this rail's composer

  const escalateBase = clientId ? `/clients/${clientId}/clara/${threadId}` : `/clara/${threadId}`;
  const escalateHref = `${escalateBase}?from=${encodeURIComponent(pathname)}`;

  if (!open) {
    return (
      <div className="fixed top-1/2 right-0 z-40 -translate-y-1/2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => claraThreadStore.setRailOpen(true)}
          aria-label={t("expand")}
        >
          {t("title")}
        </Button>
      </div>
    );
  }

  return (
    // Motion: `enter-panel` slides the rail in from the right edge it docks
    // to. The contract names this exact case — §7's `--duration-panel` tier is
    // "Dialog, sheet, Clara dock reflow" (200ms, `--ease-out`). It explains
    // WHERE the panel lives, which a hard appear does not, and under reduced
    // motion the slide becomes a fade (§7: position removed, opacity kept).
    // It is an ENTER only: an exit transition needs the aside to stay mounted
    // while it animates, which is a structural change to this component's
    // open/closed branch, not a polish edit — noted rather than half-built.
    <aside
      data-clara-rail
      className="enter-panel sticky top-0 flex h-dvh w-80 shrink-0 flex-col border-l border-border bg-card shadow-lg"
      aria-label={t("title")}
    >
      <header className="flex items-center justify-between border-b border-border p-2">
        <span className="text-sm font-semibold text-clara">{t("title")}</span>
        <div className="flex gap-1">
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
      <div className="min-h-0 flex-1">
        {/* P6-5: the `key={clientId ?? "firm"}` #507 put HERE moved up to `RailMount`, which
            is the one mount point for this whole subtree — see that file's own note. Same
            law, one level higher, so it now covers the composer, the attachment tray and
            everything a later feature adds, not just this view. A key here as well would be
            a second copy of the same boundary with nothing extra to fence. */}
        <ClaraThreadView auth={auth} threadId={threadId} resolveError={error} variant="rail" clientId={clientId} />
      </div>
    </aside>
  );
}
