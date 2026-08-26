import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { FirmNav } from "@/components/firm-nav";
import { LogoutButton } from "@/components/logout-button";

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
 */
export default async function FirmLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations("FirmShell");

  return (
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
  );
}
