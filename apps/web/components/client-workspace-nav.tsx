"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const CLIENT_TABS = [
  { segment: "", messageKey: "home" },
  { segment: "journals", messageKey: "journals" },
  { segment: "documents", messageKey: "documents" },
  { segment: "bank", messageKey: "bank" },
  { segment: "close", messageKey: "close" },
  { segment: "tax", messageKey: "tax" },
  { segment: "reports", messageKey: "reports" },
  { segment: "registers", messageKey: "registers" },
  { segment: "knowledge", messageKey: "knowledge" },
] as const;

/**
 * Client-workspace tab nav (owner ruling Q3 — ONE workspace, accounting
 * objects as tabs, not separate per-surface routes). URL-as-truth: every
 * tab is `/clients/:clientId/:tab`, addressable and bookmarkable on its own.
 */
export function ClientWorkspaceNav({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspaceNav");
  const pathname = usePathname();
  const base = `/clients/${clientId}`;

  return (
    <nav aria-label={t("ariaLabel")}>
      <ul className="flex flex-wrap gap-1">
        {CLIENT_TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const isActive = pathname === href;

          return (
            <li key={tab.segment || "home"}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground",
                )}
              >
                {t(tab.messageKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
