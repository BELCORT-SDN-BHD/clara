"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useFirmScope } from "@/components/firm-scope-provider";
import {
  visibleAdminNavigation,
  visibleFirmNavigation,
  type NavigationScope,
} from "@/lib/firm/navigation";
import { cn } from "@/lib/utils";

function isActivePath(pathname: string, href: string): boolean {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Firm-altitude sidebar nav, shaped from the layout's positively-read scope. */
export function FirmNav() {
  return <FirmNavView scope={useFirmScope()} pathname={usePathname()} />;
}

/** Exported for rank/a11y tests; production uses `FirmNav` above. */
export function FirmNavView({
  scope,
  pathname,
}: {
  scope: NavigationScope;
  pathname: string;
}) {
  const t = useTranslations("FirmNav");
  const primary = visibleFirmNavigation(scope);
  const admin = visibleAdminNavigation(scope);
  const insideAdmin = isActivePath(pathname, "/admin");

  return (
    <nav aria-label={t("ariaLabel")}>
      <ul className="flex flex-col gap-1">
        {primary.map((item) => {
          const active = isActivePath(pathname, item.href);
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-2.5 py-1.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
              >
                {t(item.messageKey)}
              </Link>
              {item.id === "admin" && insideAdmin && admin.length > 0 ? (
                <ul
                  aria-label={t("adminSectionsLabel")}
                  className="mt-1 flex flex-col gap-1 border-l border-sidebar-border pl-2"
                >
                  {admin.map((section) => {
                    const sectionActive = isActivePath(pathname, section.href);
                    return (
                      <li key={section.href}>
                        <Link
                          href={section.href}
                          aria-current={sectionActive ? "page" : undefined}
                          className={cn(
                            "block rounded-lg px-2.5 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            sectionActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                          )}
                        >
                          {t(section.navMessageKey)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
