"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const FIRM_NAV_ITEMS = [
  { href: "/", messageKey: "home" },
  { href: "/needs-you", messageKey: "needsYou" },
  { href: "/clients", messageKey: "clients" },
  { href: "/activity", messageKey: "activity" },
  { href: "/admin", messageKey: "admin" },
] as const;

/**
 * Firm-altitude sidebar nav (owner ruling Q3 — the two-level IA's firm
 * level). URL-as-truth: every entry is a real route, active state is
 * derived from the URL via `usePathname`, never from client-only state.
 */
export function FirmNav() {
  const t = useTranslations("FirmNav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("ariaLabel")}>
      <ul className="flex flex-col gap-1">
        {FIRM_NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isActive &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                {t(item.messageKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
