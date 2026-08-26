import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { CommandKProvider } from "@/components/command";
import { FirmNav } from "@/components/firm-nav";
import { LogoutButton } from "@/components/logout-button";
import { RailMount } from "@/components/clara/rail-mount";

/**
 * The firm-altitude shell — every route in this app lives under this route
 * group (Next.js route groups add no URL segment). `proxy.ts` is the ONLY
 * auth gate (redirects an unauthenticated request to /login before this
 * layout ever renders); this layout does not re-check auth — one authority,
 * one place.
 *
 * Two-level IA (owner ruling Q3): this is the firm level — sidebar nav
 * (Home · Needs you · Clients · Activity · Admin). The client level nests
 * inside at app/(firm)/clients/[clientId]/layout.tsx.
 *
 * P2 FOLD SEAM H: mounts the two app-wide shell affordances here, ONCE —
 * `<CommandKProvider>` (⌘K, per its own header's integration note) and
 * `<RailMount>` (the docked Clara rail). The Clara full-screen escalation
 * routes live in the sibling `app/(full)/` group, which this layout never
 * wraps — that structure, not a runtime check, is what keeps the rail off
 * the escalated thread (Q2; P2 fold round 3).
 */
export default async function FirmLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("FirmShell");

  return (
    <CommandKProvider>
      <div className="flex min-h-dvh bg-shell">
        <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar p-4">
          <span className="px-2.5 text-sm font-semibold text-sidebar-foreground">
            {t("productName")}
          </span>
          <FirmNav />
          <div className="mt-auto">
            <LogoutButton />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <RailMount />
    </CommandKProvider>
  );
}
