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
import { visibleAdminNavigation, visibleFirmNavigation } from "@/lib/firm/navigation";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/** C-43 — the ceiling on the rendered Clients group. See `clientRegisterState`. */
export const GO_CLIENTS_RENDER_CAP = 50;

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
 * C-43 CHANGED WHAT "GO" IS. This header used to say "Go and Ask stay
 * synchronous (a static local manifest; one DOM event)" and treated that as a
 * feature. It was also the defect: a static manifest cannot know the caller's
 * rank, so ⌘K offered Activity, Members and Firm registrations to a viewer whose
 * sidebar correctly hid all three. Go is now asynchronous, on the SAME read Do
 * already makes (`loadDoEnv`, once per open), plus one register read for the
 * Clients group. Ask stays synchronous and unconditional — it is the universal
 * fallback ("one way in, from anywhere", PRD §5a) and must never wait on a read.
 *
 * The cost is real and was weighed: ⌘K is a 100+/day shortcut and Go now has a
 * brief loading line where it used to paint instantly. The alternative —
 * rendering the full list optimistically and filtering when the read lands —
 * FLASHES rows the caller may not open, which is a worse thing to do in front of
 * a client than to wait one round trip. Neither arm renders an unfiltered list.
 */
export function CommandPalette({ onNavigate, session = sessionTokenAccessor }: CommandPaletteProps) {
  const t = useTranslations("CommandPalette");
  const tGoRoutes = useTranslations("CommandPalette.go.routes");
  const tDo = useTranslations("CommandPalette.do.actions");
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");

  const clientId = resolveClientIdFromPathname(pathname ?? "");

  const clientMatches = React.useMemo(
    () =>
      clientId
        ? CLIENT_ROUTES.filter((route) =>
            matchesQuery([tGoRoutes(route.id), ...(route.keywords ?? [])], query),
          )
        : [],
    [clientId, query, tGoRoutes],
  );

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

  // ── C-43, GAP A: THE GO SECTION IS RANK-SHAPED ─────────────────────────────
  //
  // It rides the read that ALREADY RUNS. `loadDoEnv` above returns the live
  // `CallerContextRow` carrying `role_rank` and `is_operator` — exactly the
  // `NavigationScope` shape `lib/firm/navigation.ts` declares — so shaping Go
  // costs zero extra requests and cannot disagree with Do about who the caller
  // is. The predicate is `hasNavigationAccess`, CALLED, not copied: it is the
  // same function `components/firm-nav.tsx` applies to the sidebar, so a ⌘K row
  // and a sidebar row for one href can no longer disagree (裁-107a).
  //
  // THIS MAKES GO ASYNCHRONOUS for the first time, and the three states are kept
  // apart on purpose — the same distinction do-dispatch.ts draws for Do:
  //
  //   loading  the read is in flight. A spinner-free honest line, not an empty
  //            list: "nothing here for you" is a claim, and we have not looked.
  //   error    the read THREW. The banner says so. Rendering the unfiltered list
  //            here would be the whole defect back again, on the failure path.
  //   ready + ctx === null
  //            the read landed and there is no caller_context row. That is not
  //            "no matching pages" either — it is "we could not find out what you
  //            may open", and it renders as such, with NO rows. Fail closed.
  //
  // HIDING A ROW GRANTS NOTHING. navigation.ts's own note is the law here: this
  // is legibility, and the destination's RLS policy or governed door remains the
  // wall. A caller who types the URL still meets it.
  const goScope = doState.phase === "ready" ? doState.env.ctx : null;

  // THE SIDEBAR'S OWN OUTPUT, not a parallel computation over the same inputs.
  // `visibleFirmNavigation`/`visibleAdminNavigation` are the functions
  // `components/firm-nav.tsx` renders from, so what they return IS the sidebar —
  // filtered by `hasNavigationAccess` inside, and RANK-SHAPED on the way out
  // (裁-187 rewrites the Admin entry's `messageKey` to "firm" for a caller who
  // administers nothing). Calling them instead of re-applying the predicate here
  // buys the second half for free: the ⌘K row and the sidebar row for one href
  // cannot disagree about whether it is offered OR about what it is called.
  const navByHref = React.useMemo(() => {
    if (goScope === null) return null;
    return new Map(
      [...visibleFirmNavigation(goScope), ...visibleAdminNavigation(goScope)].map((entry) => [
        entry.href,
        "messageKey" in entry ? entry.messageKey : entry.navMessageKey,
      ]),
    );
  }, [goScope]);

  /** The ⌘K label id for a row, following the sidebar's rank-shaped rename. */
  const labelIdFor = React.useCallback(
    (route: (typeof FIRM_ROUTES)[number]) => {
      const navKey = navByHref?.get(route.href);
      return (navKey && route.rankLabels?.[navKey]) ?? route.id;
    },
    [navByHref],
  );

  const firmMatches = React.useMemo(
    () =>
      navByHref === null
        ? []
        : FIRM_ROUTES.filter(
            (route) =>
              navByHref.has(route.href) &&
              matchesQuery([tGoRoutes(labelIdFor(route)), ...(route.keywords ?? [])], query),
          ),
    [navByHref, labelIdFor, query, tGoRoutes],
  );

  // ── C-43, GAP B: A CLIENT IS REACHABLE BY NAME ─────────────────────────────
  //
  // `CLIENT_ROUTES` are all `href(clientId)` and render only once the URL is
  // ALREADY under `/clients/:id`, so from firm altitude ⌘K offered the register
  // and nothing else: typing a client's name matched that one row's keywords.
  // `loadClientRegister` existed with zero callers here.
  //
  // ONE READ PER OPEN, exactly like Do's — the palette is mounted by the dialog
  // portal on open and unmounted on close, so this effect IS "every time" and
  // there is no per-keystroke query. The read is RLS-scoped through `getRows`, so
  // it returns only clients this session may see: no new authority is created
  // here, and no rank field is owed (navigation.ts records the clients read as
  // viewer-floor with no rank).
  //
  // A FAILED READ IS A NOTE, NEVER A SILENT FALLBACK to the register row — the
  // register row is a different answer to a different question, and offering it
  // in place of a failed name search would look like "no such client".
  const [clientRegister, setClientRegister] = React.useState<
    { phase: "loading" } | { phase: "ready"; rows: ClientRow[] } | { phase: "error" }
  >({ phase: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    setClientRegister({ phase: "loading" });
    loadClientRegister(session)
      .then((rows) => {
        if (!cancelled) setClientRegister({ phase: "ready", rows });
      })
      .catch(() => {
        if (!cancelled) setClientRegister({ phase: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Matched over NAME and ID both: a colleague pasting an id from a ticket and a
  // human typing half a name are the same journey.
  const clientNameMatches =
    clientRegister.phase === "ready"
      ? clientRegister.rows.filter((row) => matchesQuery([row.name, row.id], query))
      : [];
  // THE CAP IS ON WHAT IS RENDERED, not on what was read. A firm with 400 clients
  // gets 50 rows and a line telling it to type — which is true and actionable —
  // rather than a silently truncated list that looks complete.
  const clientNameRows = clientNameMatches.slice(0, GO_CLIENTS_RENDER_CAP);
  const clientNameTruncated = clientNameMatches.length > clientNameRows.length;

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
        {/* C-43: Go's own three states, before any row is rendered. Each is a
            DIFFERENT SENTENCE, and none of them is "no matching pages". */}
        {doState.phase === "loading" && (
          <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
            {t("go.loading")}
          </div>
        )}
        {doState.phase === "error" && (
          <div className="px-3 py-2">
            <StateBanner tone="error">{t("go.readError", { message: doState.message })}</StateBanner>
          </div>
        )}
        {doState.phase === "ready" && goScope === null && (
          <div className="px-3 py-2">
            <StateBanner tone="error">{t("go.noAccessContext")}</StateBanner>
          </div>
        )}

        {firmMatches.length > 0 && (
          <CommandGroup heading={t("go.heading")}>
            {firmMatches.map((route) => (
              <CommandItem
                key={route.id}
                value={route.id}
                onSelect={() => goTo(route.href)}
              >
                <span>{tGoRoutes(labelIdFor(route))}</span>
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

        {/* C-43 GAP B — clients BY NAME, at both altitudes. From inside client A,
            jumping to client B by name is the same need it is from firm home. */}
        {clientRegister.phase === "loading" && (
          <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
            {t("go.clientsLoading")}
          </div>
        )}
        {clientRegister.phase === "error" && (
          <div className="px-3 py-2">
            <StateBanner tone="error">{t("go.clientsReadError")}</StateBanner>
          </div>
        )}
        {clientNameRows.length > 0 && (
          <CommandGroup heading={t("go.clientsHeading")}>
            {clientNameRows.map((row) => (
              <CommandItem
                key={row.id}
                value={`client-${row.id}`}
                onSelect={() => goTo(`/clients/${row.id}`)}
              >
                <span>{row.name}</span>
              </CommandItem>
            ))}
            {clientNameTruncated && (
              <div role="status" className="px-3 py-2 text-xs text-muted-foreground">
                {t("go.clientsTruncated", {
                  shown: clientNameRows.length,
                  total: clientNameMatches.length,
                })}
              </div>
            )}
          </CommandGroup>
        )}

        {/* "No matching pages" is now reachable ONLY when Go actually looked and
            found nothing — every not-looked-yet and could-not-look state is
            rendered above, so this line can no longer stand in for them. */}
        {doState.phase === "ready" &&
          goScope !== null &&
          clientRegister.phase !== "loading" &&
          firmMatches.length === 0 &&
          clientMatches.length === 0 &&
          clientNameRows.length === 0 && (
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
