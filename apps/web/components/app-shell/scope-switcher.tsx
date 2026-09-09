"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { StateBanner } from "@/components/common/state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { switchClientDestination } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/**
 * THE SCOPE SWITCHER — "whose books am I in, and take me to the same place in
 * someone else's" (#614).
 *
 * WHAT IT REPLACED: nothing, which was the problem. Moving from client A to
 * client B meant Clients → find the row → open the workspace → navigate back to
 * whichever workbench you had been in, four steps to answer one question that a
 * firm asks fifty times a day. ⌘K's client search (C-43, GAP B) shortened it to
 * two but always lands on the client's HOME.
 *
 * WHAT TRAVELS IS THE DESTINATION KIND, and `switchClientDestination`
 * (lib/navigation/tree.ts) owns that judgement — including the three things that
 * deliberately do NOT travel: a Clara thread, an arbitrary query parameter, and a
 * firm-altitude path. Read that function's own note before changing what a row
 * points at.
 *
 * EVERY ROW IS A LINK, not an onSelect that pushes. The destination is a real
 * URL known at render time, so it should behave like one: middle-click opens a
 * tab, the status bar shows where it goes, and the keyboard activation is the
 * browser's own. Base UI's Menu supplies the arrow-key roving focus and returns
 * focus to the trigger on close, which is why this file has no key handler and no
 * `finalFocus` of its own (`components/firm-nav-drawer.tsx` needed one because a
 * Dialog does not do it for you; a Menu does).
 *
 * THE READ RUNS ON OPEN, NOT ON MOUNT. This component is mounted on every firm
 * page; reading the register on mount would put a client-list request on every
 * navigation for a menu most of them never open. Opening it is the moment the
 * question is asked, and the read is RLS-scoped (`getRows`), so it returns only
 * clients this session may see — no new authority is created here.
 *
 * THE THREE READ STATES ARE KEPT APART, the instrument law
 * (`components/command/command-palette.tsx`'s own Do/Go note): in flight,
 * landed-and-empty, and failed are three different sentences, and a failed read
 * must never render as "you have no clients".
 */

/** The ceiling on rendered rows. A firm with 400 clients gets a menu it can
 *  read plus a route to all of them, never a silently truncated list. */
export const SCOPE_SWITCHER_CAP = 12;

type RegisterState =
  | { phase: "loading" }
  | { phase: "ready"; rows: ClientRow[] }
  | { phase: "error" };

export function ScopeSwitcher({
  pathname,
  searchParams,
  clientId,
  clientName,
  firmName,
  session = sessionTokenAccessor,
  open: openProp,
  onOpenChange,
}: {
  pathname: string;
  searchParams: { get(name: string): string | null };
  /** The client the URL is on, or null at firm altitude. */
  clientId: string | null;
  /** Null until the client layout has published it — the id stands in. */
  clientName: string | null;
  firmName: string;
  /** The blessed singleton by default (apps/web/AGENTS.md's session-accessor
   *  law); a cell may inject its own. Never a per-render object literal. */
  session?: SessionTokenAccessor;
  /**
   * OPTIONALLY CONTROLLED, the same shape `components/ui/sidebar.tsx`'s own
   * provider offers. Production leaves it uncontrolled. A cell uses it because
   * the menu's contents are portalled by Base UI and only exist while it is
   * open, and driving a real pointer sequence to get there would be asserting
   * the harness rather than this component.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("AppShell.scope");
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (onOpenChange) onOpenChange(next);
      if (openProp === undefined) setUncontrolledOpen(next);
    },
    [onOpenChange, openProp],
  );
  const [register, setRegister] = React.useState<RegisterState>({ phase: "loading" });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRegister({ phase: "loading" });
    loadClientRegister(session)
      .then((rows) => {
        if (!cancelled) setRegister({ phase: "ready", rows });
      })
      .catch(() => {
        if (!cancelled) setRegister({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  const inClient = clientId !== null;
  // Before the client layout has published the name, the label is the neutral
  // placeholder — never the raw id (#614 A7).
  const currentLabel = inClient ? (clientName ?? t("clientPlaceholder")) : firmName;
  const caption = inClient ? t("clientCaption") : t("firmCaption");

  const rows = register.phase === "ready" ? register.rows : [];
  const shown = rows.slice(0, SCOPE_SWITCHER_CAP);
  const truncated = rows.length > shown.length;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" data-scope-switcher />}
          >
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-medium">{currentLabel}</span>
              <span className="truncate text-xs text-muted-foreground">{caption}</span>
            </span>
            <ChevronsUpDownIcon aria-hidden="true" className="ml-auto shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" align="start" side="bottom">
            <DropdownMenuItem render={<Link href="/" />}>
              {t("firmHome")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* A real `Menu.Group`, not a bare label: Base UI throws
                "MenuGroupContext is missing" if a group label has no group, and
                a labelled group is what makes the client rows one announced set
                rather than a run of items with a stray heading above them. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("clientsHeading")}</DropdownMenuLabel>

              {register.phase === "loading" ? (
                <div role="status" className="px-1.5 py-1 text-xs text-muted-foreground">
                  {t("clientsLoading")}
                </div>
              ) : null}
              {register.phase === "error" ? (
                <div className="px-1.5 py-1">
                  <StateBanner tone="error" className="text-xs">
                    {t("clientsReadError")}
                  </StateBanner>
                </div>
              ) : null}
              {register.phase === "ready" && rows.length === 0 ? (
                <div role="status" className="px-1.5 py-1 text-xs text-muted-foreground">
                  {t("clientsEmpty")}
                </div>
              ) : null}

              {shown.map((row) => {
                const current = row.id === clientId;
                return (
                  <DropdownMenuItem
                    key={row.id}
                    render={
                      <Link
                        href={switchClientDestination(pathname, searchParams, row.id)}
                        aria-current={current ? "true" : undefined}
                      />
                    }
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className={current ? "shrink-0" : "shrink-0 opacity-0"}
                    />
                    <span className="truncate">{row.name}</span>
                    {current ? <span className="sr-only">{t("currentClient")}</span> : null}
                  </DropdownMenuItem>
                );
              })}

              {truncated ? (
                <div role="status" className="px-1.5 py-1 text-xs text-muted-foreground">
                  {t("searchHint")}
                </div>
              ) : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/clients" />}>
              {t("allClients")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
