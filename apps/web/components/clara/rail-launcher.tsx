"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { claraThreadStore } from "@/lib/clara/threadStore";

/**
 * The collapsed Clara rail — the tab on the right edge that opens it.
 *
 * CB-AE2E-019 lifted this OUT of `ClaraRail.tsx`'s early-return branch, verbatim
 * except for the `data-clara-rail-launcher` hook. Two reasons, and the second is
 * the load-bearing one:
 *
 *  1. `ClaraRail` now has three presence states, not two (see
 *     `lib/clara/useRailPresence.ts`), and the branch that used to read
 *     `if (!open)` reads `if (presence === "closed")`. Keeping the launcher's
 *     markup inline would have made that branch two screens tall.
 *  2. `rail-chrome.tsx` returns focus HERE when the overlay closes, and it finds
 *     this control by the attribute below. A query on a class or on the
 *     translated label would be reading a projection of the thing rather than the
 *     thing (apps/web AGENTS.md: spelling is not identity); the data attribute IS
 *     the contract, and `responsive-shell-walk.spec.ts` asserts the focus lands
 *     on it.
 *
 * It stays `fixed` to the VIEWPORT in both arms — the launcher is not a row
 * participant in either, so nothing about it needed a breakpoint.
 */
export function ClaraRailLauncher() {
  const t = useTranslations("Clara.rail");
  return (
    <div className="fixed top-1/2 right-0 z-40 -translate-y-1/2">
      <Button
        data-clara-rail-launcher
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
