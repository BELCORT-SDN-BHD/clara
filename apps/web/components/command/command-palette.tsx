"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { focusRail } from "@/lib/command/bus";
import {
  CLIENT_ROUTES,
  FIRM_ROUTES,
  resolveClientIdFromPathname,
} from "@/lib/command/routes";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every whitespace-split term in the query must appear as a substring
 * somewhere across the given haystack strings (case-insensitive). Deliberately
 * simple and predictable over "clever" fuzzy scoring — a command palette's
 * search has to be legible, not impressive.
 */
function matchesQuery(haystacks: string[], rawQuery: string): boolean {
  const query = normalize(rawQuery);
  if (!query) {
    return true;
  }
  const terms = query.split(/\s+/).filter(Boolean);
  const corpus = haystacks.map(normalize).join(" ");
  return terms.every((term) => corpus.includes(term));
}

export interface CommandPaletteProps {
  /** Called once a Go navigation or an Ask hand-off completes — closes the palette. */
  onNavigate: () => void;
}

/**
 * The ⌘K palette body: three sections, Go / Ask / Do.
 *
 * - **Go** is real navigation now — every row is a genuine `router.push`.
 *   Rows whose target has no page yet (see lib/command/routes.ts `status`)
 *   are labelled, never hidden or faked; selecting one is a real client-side
 *   navigation that lands on Next's own not-found rendering, which is an
 *   honest "nothing here yet" rather than a fabricated success.
 * - **Ask** never converses — it hands the typed text to the Clara rail via
 *   `lib/command/bus.ts` and closes. No model call happens in this file.
 * - **Do** is a fixed, disabled, single row. It names the shape ("dispatch a
 *   run") without listing any verb, and cannot be selected — `disabled` on a
 *   cmdk Item blocks `onSelect` from firing at all, so this is not styling
 *   theatre, it is an inert control (frontend-handoff-2026-08-23.md §5's
 *   "if an action has no named backend verb, the UI does not offer it").
 *
 * Filtering is done by hand (`Command shouldFilter={false}`) rather than via
 * cmdk's default matcher, for two reasons: (1) Ask and Do must stay visible
 * regardless of the typed query — Ask is the universal fallback ("one way
 * in, from anywhere", PRD §5a) and Do exists to teach its own shape even
 * when it can't act; cmdk's default filter would hide either whenever the
 * query didn't textually match its label. (2) it lets the Go section render
 * an honest, reachable empty message ("no matching pages for …") instead of
 * a dead `<CommandEmpty>` that the always-present Ask/Do rows would make
 * unreachable.
 *
 * No loading state is rendered: nothing here is asynchronous yet (Go reads a
 * static local manifest, Ask synchronously dispatches one DOM event, Do is
 * statically disabled) — a spinner with nothing behind it would be exactly
 * the kind of dishonest affordance this surface exists to avoid. When P3
 * wires a live data source (e.g. a server-backed search, or real client
 * names), add a loading branch here rather than fabricating one now.
 */
export function CommandPalette({ onNavigate }: CommandPaletteProps) {
  const t = useTranslations("CommandPalette");
  const tGoRoutes = useTranslations("CommandPalette.go.routes");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");

  const clientId = resolveClientIdFromPathname(pathname ?? "");

  const firmMatches = React.useMemo(
    () =>
      FIRM_ROUTES.filter((route) =>
        matchesQuery([tGoRoutes(route.id), ...(route.keywords ?? [])], query),
      ),
    [query, tGoRoutes],
  );

  const clientMatches = React.useMemo(
    () =>
      clientId
        ? CLIENT_ROUTES.filter((route) =>
            matchesQuery([tGoRoutes(route.id), ...(route.keywords ?? [])], query),
          )
        : [],
    [clientId, query, tGoRoutes],
  );

  const hasGoMatches = firmMatches.length > 0 || clientMatches.length > 0;

  function goTo(href: string) {
    router.push(href);
    onNavigate();
  }

  function handleAsk() {
    focusRail({ query, source: "cmdk" });
    onNavigate();
  }

  return (
    <Command shouldFilter={false} className="max-h-[70vh]">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("inputPlaceholder")}
      />
      <CommandList>
        {firmMatches.length > 0 && (
          <CommandGroup heading={t("go.heading")}>
            {firmMatches.map((route) => (
              <CommandItem
                key={route.id}
                value={route.id}
                onSelect={() => goTo(route.href)}
              >
                <span>{tGoRoutes(route.id)}</span>
                {route.status === "planned" && (
                  <Badge variant="outline" className="ml-auto">
                    {t("go.plannedBadge")}
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {clientMatches.length > 0 && clientId && (
          <CommandGroup heading={t("go.clientHeading")}>
            {clientMatches.map((route) => (
              <CommandItem
                key={route.id}
                value={route.id}
                onSelect={() => goTo(route.href(clientId))}
              >
                <span>{tGoRoutes(route.id)}</span>
                {route.status === "planned" && (
                  <Badge variant="outline" className="ml-auto">
                    {t("go.plannedBadge")}
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!hasGoMatches && (
          <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
            {t("go.empty", { query })}
          </div>
        )}

        <CommandSeparator />

        <CommandGroup heading={t("ask.heading")}>
          <CommandItem value="ask-clara" onSelect={handleAsk}>
            <span>{query ? t("ask.withQuery", { query }) : t("ask.withoutQuery")}</span>
            <span className="ml-auto text-xs text-muted-foreground">{t("ask.hint")}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={t("do.heading")}>
          <CommandItem value="do-dispatch" disabled>
            <span className="text-muted-foreground">{t("do.disabledLabel")}</span>
            <Badge variant="outline" className="ml-auto">
              {t("do.hint")}
            </Badge>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
