"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useClientIdentity } from "@/components/app-shell/scope-context";
import { useFirmScope } from "@/components/firm-scope-provider";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { breadcrumbFor, type Crumb } from "@/lib/navigation/tree";

/**
 * WHERE AM I — the shell's answer, in one line (#614).
 *
 * WHAT IT REPLACED: an `<h1>` reading "Client: Rome Properties" pinned to the
 * top of every client route, plus a horizontal nine-tab strip, plus the page's
 * OWN `<h1>` underneath both. Two level-1 headings per client page
 * (`components/shell-responsive.test.tsx` pinned the number at two and the old
 * client layout's header explained at length why neither alternative was
 * cheaper). The ancestry now lives here, in a landmark built for it, and each
 * page keeps its single `PageHeader` heading.
 *
 * THE ORDER AND THE LINKS COME FROM `breadcrumbFor` (lib/navigation/tree.ts) —
 * the same registry the sidebar renders — so the trail can never name a
 * destination the menu does not have, and the current page is never a link.
 *
 * THE NARROW ARM, AND THE ONE THING IT MAY NOT DO. Below `sm` the trail keeps
 * exactly two crumbs visible: the SCOPE (the client's name inside a client, the
 * firm's name outside one) and the CURRENT PAGE. Identity is the crumb a human
 * cannot afford to lose — at 320px, and at 640 CSS px which is a 1280px window
 * at 200% zoom, "which client's books am I looking at" must still be on screen.
 *
 * COLLAPSED, NOT DELETED. The hidden crumbs are `sr-only`, not `hidden`:
 * `display: none` would take them out of the ACCESSIBILITY tree as well as the
 * layout, so a screen-reader user on a narrow viewport would lose the ancestry
 * links entirely — a worse trade than the pixels it saves. `sr-only` is
 * `position: absolute`, so a collapsed crumb costs no layout at all while
 * remaining reachable, and `sm:not-sr-only` restores it. The ellipsis that
 * stands in for them is `role="presentation" aria-hidden` (the primitive's own
 * choice) and narrow-only, so nothing is announced twice.
 */

export function AppBreadcrumb() {
  const scope = useFirmScope();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const identity = useClientIdentity();
  const tBrand = useTranslations("Brand");
  return (
    <AppBreadcrumbView
      pathname={pathname}
      searchParams={searchParams}
      firmName={scope.firm_name ?? tBrand("productName")}
      clientName={identity.name}
    />
  );
}

/** Exported for the a11y/structure cells; production uses `AppBreadcrumb`. */
export function AppBreadcrumbView({
  pathname,
  searchParams,
  firmName,
  clientName,
}: {
  pathname: string;
  searchParams: { get(name: string): string | null };
  firmName: string;
  clientName: string | null;
}) {
  const tShell = useTranslations("AppShell");
  const tSettings = useTranslations("Settings");
  const crumbs = breadcrumbFor(pathname, searchParams, { firmName, clientName });

  const label = (crumb: Crumb): string =>
    crumb.kind === "text" ? crumb.text : crumb.ns === "Settings" ? tSettings(crumb.key) : tShell(crumb.key);

  // THE SCOPE CRUMB is the last literal NAME in the trail: the client's name
  // inside a client, the firm's name outside one. Derived rather than passed,
  // so a future trail shape cannot forget to say which crumb is the identity.
  const lastIndex = crumbs.length - 1;
  let scopeIndex = 0;
  crumbs.forEach((crumb, i) => {
    if (crumb.kind === "text") scopeIndex = i;
  });

  const keep = (i: number) => i === scopeIndex || i === lastIndex;
  const collapsedBefore = crumbs.some((_, i) => i < scopeIndex && !keep(i));
  const collapsedAfter = crumbs.some((_, i) => i > scopeIndex && i < lastIndex && !keep(i));

  /**
   * ONE SEPARATOR PER CRUMB, and each one has to read correctly in BOTH arms —
   * the narrow-only ellipses sit beside separators that are shared with the wide
   * arm rather than duplicated. A separator is always visible when the crumb it
   * precedes survives the collapse, and also when it is the separator the
   * after-ellipsis leans on; otherwise it hides with the crumb it introduces.
   */
  const separatorClass = (i: number): string | undefined => {
    if (keep(i)) return undefined;
    if (i === scopeIndex + 1 && collapsedAfter) return undefined;
    return "hidden sm:inline-flex";
  };

  const ellipsis = (
    <BreadcrumbItem className="sm:hidden">
      <BreadcrumbEllipsis />
    </BreadcrumbItem>
  );

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <React.Fragment key={`${i}-${crumb.kind === "text" ? crumb.text : crumb.key}`}>
            {i === scopeIndex && collapsedBefore ? ellipsis : null}
            {i > 0 ? <BreadcrumbSeparator className={separatorClass(i)} /> : null}
            {i === scopeIndex + 1 && collapsedAfter ? ellipsis : null}
            <BreadcrumbItem className={keep(i) ? undefined : "sr-only sm:not-sr-only"}>
              {crumb.href === undefined ? (
                <BreadcrumbPage>{label(crumb)}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />}>{label(crumb)}</BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
