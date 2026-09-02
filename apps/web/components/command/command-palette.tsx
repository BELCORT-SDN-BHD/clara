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
import { StateBanner } from "@/components/common/state";
import { focusRail } from "@/lib/command/bus";
import {
  CLIENT_ROUTES,
  FIRM_ROUTES,
  resolveClientIdFromPathname,
} from "@/lib/command/routes";
import { DO_ACTIONS, permittedDoActions, type DoActionEnv, type DoActionSpec } from "@/lib/command/do-actions";
import { loadDoEnv, runDoAction } from "@/lib/command/do-dispatch";
import { isDoorRefusal } from "@/lib/doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Every whitespace-split term in the query must appear as a substring
 * somewhere across the given haystack strings (case-insensitive). Deliberately
 * simple and predictable over "clever" fuzzy scoring — a command palette's
 * search has to be legible, not impressive.
 */
export function matchesQuery(haystacks: string[], rawQuery: string): boolean {
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
  /** The blessed singleton by default (apps/web/AGENTS.md's session-accessor law); a caller
   *  — a cell — may inject its own. Never a per-render object literal. */
  session?: SessionTokenAccessor;
}

/** The Do section's own three states, kept distinguishable (the instrument law): the read is
 *  in flight, the read finished, or the read failed. A failed read is NOT an empty list —
 *  "nothing you can dispatch here" and "we could not find out" are different sentences. */
type DoState =
  | { phase: "loading" }
  | { phase: "ready"; env: Omit<DoActionEnv, "query"> }
  | { phase: "error"; message: string };

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
 * - **Do** dispatches a real run, and every row it offers was authorised by a
 *   READ that ran on THIS open (裁-37, P6-5). `lib/command/do-actions.ts` holds
 *   the catalog and the one permission predicate; `lib/command/do-dispatch.ts`
 *   holds the live read and the single dispatcher. A row appears only when the
 *   database's own `role_rank` for this caller meets the floor the door's live
 *   body enforces AND the action's own precondition read came back positive.
 *   Nothing is rendered disabled: an act this caller cannot perform is ABSENT,
 *   because a greyed row still asserts the act exists for someone here, and
 *   the honest empty note says what was actually looked for.
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
 * Go and Ask stay synchronous (a static local manifest; one DOM event). Do is
 * the one asynchronous section, and it has a REAL loading branch behind a real
 * read — the note the original version of this header left for whoever wired a
 * live data source, honoured rather than reinterpreted.
 */
export function CommandPalette({ onNavigate, session = sessionTokenAccessor }: CommandPaletteProps) {
  const t = useTranslations("CommandPalette");
  const tGoRoutes = useTranslations("CommandPalette.go.routes");
  const tDo = useTranslations("CommandPalette.do.actions");
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

  // THE LIVE ALLOWLIST READ. One per palette open: Base UI's Dialog portal mounts this
  // component when ⌘K opens and unmounts it on close, so this effect IS "every time" — no
  // module cache, nothing to invalidate when a grant changes elsewhere.
  const [doState, setDoState] = React.useState<DoState>({ phase: "loading" });
  const [doBusy, setDoBusy] = React.useState(false);
  const [doError, setDoError] = React.useState<{ message: string; code: string | null } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setDoState({ phase: "loading" });
    loadDoEnv(session, clientId)
      .then((env) => {
        if (!cancelled) setDoState({ phase: "ready", env });
      })
      .catch((err: unknown) => {
        if (!cancelled) setDoState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [session, clientId]);

  const doEnv: DoActionEnv | null =
    doState.phase === "ready" ? { ...doState.env, query } : null;
  // `permittedDoActions` is the SAME predicate `runDoAction` re-checks — one gate, read
  // twice, never copied (裁-107a).
  const doRows = doEnv ? permittedDoActions(doEnv, DO_ACTIONS) : [];

  async function handleDo(spec: DoActionSpec) {
    if (!doEnv || doBusy) return;
    setDoBusy(true);
    setDoError(null);
    try {
      const result = await runDoAction(spec, doEnv, session);
      if (result.kind === "refused") return;
      if (result.kind === "navigated") {
        router.push(result.href);
        onNavigate();
        return;
      }
      // A dispatched run renders itself in the rail — the one surface that shows a live
      // turn. No fabricated "started!" toast: the rail's own read is the receipt.
      focusRail({ query: "", source: "cmdk" });
      onNavigate();
    } catch (err) {
      // A DoorRefusal renders VERBATIM and is never retried (apps/web/AGENTS.md). The
      // palette stays OPEN on a refusal so the human reads what the database said.
      if (isDoorRefusal(err)) setDoError({ message: err.message, code: err.code });
      else setDoError({ message: err instanceof Error ? err.message : String(err), code: null });
    } finally {
      setDoBusy(false);
    }
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
          {doState.phase === "loading" && (
            <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
              {t("do.loading")}
            </div>
          )}
          {doState.phase === "error" && (
            <div className="px-3 py-2">
              <StateBanner tone="error">{t("do.readError", { message: doState.message })}</StateBanner>
            </div>
          )}
          {doState.phase === "ready" && doRows.length === 0 && (
            <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
              {t("do.empty")}
            </div>
          )}
          {doRows.map((spec) => (
            <CommandItem
              key={spec.id}
              value={`do-${spec.id}`}
              disabled={doBusy}
              onSelect={() => void handleDo(spec)}
            >
              <span>{tDo(`${spec.id}.label`, { query: query.trim() })}</span>
              <Badge variant="outline" className="ml-auto">
                {doBusy ? t("do.dispatching") : t("do.dispatchHint")}
              </Badge>
            </CommandItem>
          ))}
          {doError && (
            <div className="px-3 py-2">
              {/* VERBATIM: the door's own code and message, never re-worded, never retried. */}
              <StateBanner tone="error" code={doError.code ?? undefined}>{doError.message}</StateBanner>
            </div>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
