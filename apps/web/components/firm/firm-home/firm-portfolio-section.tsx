"use client";

// #659 (journey B1) — THE PORTFOLIO. Firm Home's first noun, and the thing the board was not.
//
// The dispatcher shipped in 裁-190 and it works: every tile links, no tile acts. What it never had
// was a PORTFOLIO — one row per client, with the Work waiting on each — so a principal could see
// where the firm's attention is owed without opening twenty client pages. That row is now a single
// DB-owned firm-wide aggregate (`clara.get_firm_portfolio_pack`, 0231), never the N x 2 browser
// fan-out `firm-home-board.tsx`'s own "WHAT IS DELIBERATELY ABSENT" list rules out.
//
// =============================================================================================
// EVERY TILE LINKS; NO TILE ACTS — AND THAT APPLIES HERE TOO (D18.d, 裁-190 decision 3). A count
// is a link into `/work` narrowed to exactly the population it counted. There is NO inline
// acknowledge, snooze or resolve on `/`: the compliance acts live on the surfaces that own them
// (`/work?view=needs-you` and `/clients/:id/tax`), both of which this board links to and neither of
// which it duplicates. A second call site for a governed door is how two surfaces start disagreeing
// about what happened.
//
// =============================================================================================
// NO MONEY, ANYWHERE. Wayfinder's ruling for Firm Home is 不汇总客户金额. This table is the easiest
// place in the product to `reduce` rows into a false cross-client figure — `ReviewQueueRow` carries
// a per-row amount one import away — so the prohibition is enforced three times: the door's own
// tail asserts it out of `prosrc`, `lib/firm/portfolio-pack.ts` has no field to put one in, and
// `firm-portfolio.test.tsx` asserts the rendered board contains none.
//
// =============================================================================================
// SEVEN STATES, SEVEN SENTENCES. `client-work-attention.tsx:23-29` named five; this surface needs
// two more because it is a PAGED REGISTER rather than a fixed band:
//
//   loading        a skeleton, never a zero.
//   zero clients   the first-use Empty — and the creation affordance is BESIDE it, never inside.
//   zero workload  every client is clear. A DIFFERENT sentence from "nothing is waiting": one is
//                  about Work, the other about the review queue, and they can disagree.
//   partial        the row (or the page) names which part of the answer it is not making.
//   stale          the read is dated, and past a minute the board says so instead of looking live.
//   denied         a permission, not a failure. The needs-you numbers above it still render,
//                  because they ship at VIEWER floor and this door floors at bookkeeper.
//   initial error  typed and retryable.
//
// `DataState` is NOT widened for this. It has exactly three branches (error -> loading -> empty)
// and no partial arm, and four other surfaces depend on that shape; this section owns its own
// branching the way `components/tax/SstWatchSection.tsx` already does for the same reason.
//
// =============================================================================================
// TWO FLOORS, ONE PAGE, AND THE ASYMMETRY IS THE DESIGN. The needs-you chips above this table come
// from `clara.list_review_queue` at VIEWER floor over ACTIVE clients only; this table comes from a
// BOOKKEEPER-floored door that counts every client the caller's RLS admits. A viewer therefore sees
// the chips and, here, a sentence saying Work records need a bookkeeper role — #650's own honest
// face (`client-work-attention.tsx:17-21`), not a blank page. And a row for a client the queue
// structurally excludes says so, rather than letting two populations sit silently side by side.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { SectionHeader } from "@/components/common/section-header";
import { DataTableCard } from "@/components/common/data-table-card";
import { Badge } from "@/components/parts/PartBadge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessDateTime } from "@/lib/business-date";
import {
  portfolioCountLinkId,
  rememberPortfolioReturnFocus,
  takePortfolioReturnFocus,
} from "@/lib/firm/portfolio-focus-return";
import {
  isPortfolioRowCoverageReason,
  portfolioCount,
  portfolioCountHref,
  portfolioWindowDates,
  type PortfolioCountKind,
  type PortfolioRow,
} from "@/lib/firm/portfolio-pack";
import {
  EMPTY_PORTFOLIO_FILTERS,
  applyPortfolioUrlState,
  hasPortfolioFilters,
  parsePortfolioUrlState,
  type PortfolioAttention,
  type PortfolioUrlState,
} from "@/lib/firm/portfolio-url-state";
import type { FirmPortfolioState } from "@/lib/firm/use-firm-portfolio";
import { ErrorMessage } from "../data-state";

const COUNT_KINDS: readonly PortfolioCountKind[] = ["active", "attention_failed", "recent_success"];

/** The tone a client status wears. The WORD is the state; the tone only agrees with it. */
const STATUS_TONE: Record<string, "neutral" | "info" | "warning"> = {
  active: "neutral",
  onboarding: "info",
  archived: "warning",
};

function rowMatchesAttention(
  row: PortfolioRow,
  attention: PortfolioAttention | null,
  needsYouClients: ReadonlySet<string>,
): boolean {
  if (attention === null) return true;
  if (attention === "needs_you") return needsYouClients.has(row.client_id);
  // UNKNOWN IS NOT ZERO, AND IT IS NOT A MATCH EITHER (fix round 1, finding A5). Each of the three
  // narrowings below asks a question about a NUMBER. A count the door could not read is not an
  // answer to any of them: `?? 0` would have made an unknown row disappear from `active`/`failed`
  // AND appear under `caught_up`, which is the exact inverse of the truth — that row is the one a
  // professional most needs to go and look at. `portfolio-pack.ts`'s header forbids the same `?? 0`
  // by name; this is that rule at the one place the rows are narrowed.
  if (attention === "active") return row.active !== null && row.active > 0;
  if (attention === "failed") return row.attentionFailed !== null && row.attentionFailed > 0;
  // `caught_up` is the DESIGNED zero, not a grid of them: no Work running, none needing attention,
  // and nothing waiting on a person for this client. A null on either count means this build cannot
  // say that, so the row is not offered as one that is clear.
  return row.active === 0
    && row.attentionFailed === 0
    && !needsYouClients.has(row.client_id);
}

/** The rows this board shows, after the browser-side narrowings the URL carries. The door takes NO
 *  filter argument, so every one of these is applied over the page it returned — which is why the
 *  Empty state can tell "nothing matches these filters" from "this firm has no clients". */
export function visiblePortfolioRows(
  rows: readonly PortfolioRow[],
  state: PortfolioUrlState,
  needsYouClients: ReadonlySet<string>,
): PortfolioRow[] {
  const q = state.q?.toLocaleLowerCase() ?? null;
  return rows.filter((row) => {
    if (state.status.length > 0 && !state.status.includes(row.status ?? "")) return false;
    if (q !== null && !(row.name ?? "").toLocaleLowerCase().includes(q)) return false;
    return rowMatchesAttention(row, state.attention, needsYouClients);
  });
}

export function FirmPortfolioSection({
  portfolio,
  needsYouClients,
  creationControl,
  registerEmpty,
}: {
  portfolio: FirmPortfolioState;
  /** Client ids the review queue has something waiting on. Derived by the board from the envelope
   *  it already read — this section never issues a second queue read. */
  needsYouClients: ReadonlySet<string>;
  /** THE CREATION AFFORDANCE, passed in and rendered BESIDE the state machine below, never inside
   *  one of its branches. Hanging it off the zero-client arm would let the first re-read that
   *  returns a row remount it and silently discard a typed name and an acknowledgement mid-edit
   *  (appendix C §3, "Draft across local view changes"); this page re-reads on four triggers, so
   *  that is not a hypothetical. */
  creationControl?: React.ReactNode;
  /** True when the client register itself came back empty — it changes the affordance's COPY, and
   *  nothing else. */
  registerEmpty: boolean;
}) {
  const t = useTranslations("FirmHome");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = parsePortfolioUrlState(searchParams ?? new URLSearchParams());

  const pack = portfolio.pack;
  const rows = visiblePortfolioRows(pack.rows, state, needsYouClients);

  // ----- focus return, after a drilldown and Back (fix round 1, finding A3) --------------------
  //
  // The marker is TAKEN ONCE, on the first render after this section mounts, and held in a ref
  // until a link with that id actually exists. It cannot be taken inside the effect below: that
  // effect re-runs on every re-read (four triggers, one of them a 30 s tick), and a marker read
  // fresh each time would move the caret long after the person had moved on. Taking it on mount and
  // clearing the store in the same breath means one marker can move focus exactly one time.
  const countLinks = useRef(new Map<string, HTMLAnchorElement | null>());
  const pendingFocus = useRef<string | null | undefined>(undefined);
  if (pendingFocus.current === undefined) pendingFocus.current = takePortfolioReturnFocus();
  useEffect(() => {
    const want = pendingFocus.current;
    if (want === null || want === undefined) return;
    const el = countLinks.current.get(want);
    // The rows arrive with the read, so the link is usually absent on the first pass. The ref is
    // kept until it appears; if the client has left the page (archived away, filtered out, on
    // another cursor) it never does, and focus simply stays where the browser put it.
    if (el === null || el === undefined) return;
    pendingFocus.current = null;
    el.focus();
  });
  const filtered = hasPortfolioFilters(state);
  const windowDates = portfolioWindowDates(pack);

  const push = (patch: Partial<PortfolioUrlState>) => {
    const next = applyPortfolioUrlState(searchParams ?? new URLSearchParams(), patch).toString();
    router.push(next === "" ? pathname : `${pathname}?${next}`);
  };

  const countCell = (row: PortfolioRow, kind: PortfolioCountKind) => {
    const n = portfolioCount(row, kind);
    if (n === null) {
      // NEVER A ZERO. "Nothing is running" and "I could not find out what is running" are different
      // next actions, and only one of them lets a person stop looking.
      return <span className="text-muted-foreground">{t("portfolio.countUnknown")}</span>;
    }
    if (n === 0) return <span className="text-muted-foreground">0</span>;
    const id = portfolioCountLinkId(row.client_id, kind);
    return (
      <Link
        id={id}
        // THE NODE FOCUS COMES BACK TO (fix round 1, finding A3). The ref map and the marker are
        // keyed by the SAME id, so what is remembered and what is focused cannot drift.
        ref={(el) => { countLinks.current.set(id, el); }}
        href={portfolioCountHref(kind, row.client_id)}
        // ENTER ON AN ANCHOR IS DISPATCHED AS A CLICK, so one handler covers pointer and keyboard.
        onClick={() => rememberPortfolioReturnFocus(row.client_id, kind)}
        // AN EXPLICIT ACCESSIBLE NAME. axe is a violation scan, not a name assertion: five links
        // reading "3" in a row pass every rule and tell a screen-reader user nothing.
        aria-label={t(`portfolio.countLabel.${kind}`, { count: n, client: row.name ?? row.client_id })}
        className="text-primary underline-offset-4 hover:underline"
      >
        {n}
      </Link>
    );
  };

  // THE ROW'S COVERAGE SENTENCES — PLURAL, and that is the fix (fix round 1, finding A6). The door
  // publishes ONE `coverage_reason` chosen by a strict precedence (0231), so a client that is both
  // archived AND carries a finished Work with no dated receipt publishes only the status token. The
  // undated completion is the reason `Recent success` reads 0 on that row, and rendering it off the
  // precedence winner meant that zero was shown with no explanation at all. `uncounted_completions`
  // is a COUNT on the row, not a token, so it is asked independently and the two sentences stack.
  const coverageWords = (row: PortfolioRow): string[] => {
    const out: string[] = [];
    const reason = row.coverageReason;
    if (reason !== null) {
      out.push(isPortfolioRowCoverageReason(reason)
        ? t(`portfolio.coverage.${reason}`, { count: row.uncountedCompletions ?? 0 })
        // A token this build has not enumerated is shown as itself rather than swallowed: the row
        // still says it is not whole, and the machine word is recoverable from the screen.
        : t("portfolio.coverage.unknownReason", { reason }));
    }
    // Never twice: when the precedence winner IS the undated-completion token, the sentence above
    // already carries the count.
    if ((row.uncountedCompletions ?? 0) > 0 && reason !== "completions_without_receipt") {
      out.push(t("portfolio.coverage.completions_without_receipt", { count: row.uncountedCompletions ?? 0 }));
    }
    return out;
  };

  // ----- the state machine. Seven arms, seven sentences; see this file's header. ---------------
  const body = (): React.ReactNode => {
    if (portfolio.denied !== null) {
      return (
        <p className="text-sm text-muted-foreground">
          {t("portfolio.denied")} {t("portfolio.deniedWhy")}
        </p>
      );
    }
    if (portfolio.failedFirstRead) {
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">{t("portfolio.error")}</p>
          <ErrorMessage error={portfolio.staleError} />
          <Button type="button" variant="outline" size="sm" onClick={() => portfolio.reload()}>
            {t("portfolio.retry")}
          </Button>
        </div>
      );
    }
    if (portfolio.loading) {
      // A TABLE-SHAPED STAND-IN for a KNOWN layout — five rows, because five is what a short page
      // looks like. It stops the instant the read settles in either direction.
      return (
        <div aria-hidden className="flex flex-col gap-2 rounded-lg border border-border p-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      );
    }
    if (pack.rows.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("portfolio.emptyRegisterTitle")}</EmptyTitle>
            <EmptyDescription>{t("portfolio.emptyRegisterBody")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    if (rows.length === 0 && filtered) {
      // A PAGE-LOCAL CLAIM, because a page-local filter is all this build has (fix round 1, finding
      // A4). `visiblePortfolioRows` narrows the CURRENT KEYSET PAGE — the door takes no filter
      // argument at all (`portfolio-url-state.ts`) — so on a firm with more than one page a client
      // that exists and matches is simply further along the register. The old sentence ("the firm
      // has clients — none of them matches") told a principal something the page never measured.
      return (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("portfolio.emptyFilteredTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("portfolio.emptyFilteredBody")}
              {pack.truncated ? ` ${t("portfolio.emptyFilteredMorePages")}` : ""}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" size="sm" onClick={() => push(EMPTY_PORTFOLIO_FILTERS)}>
              {t("portfolio.clearFilters")}
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return (
      <DataTableCard label={t("portfolio.tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("portfolio.columnClient")}</TableHead>
            <TableHead>{t("portfolio.columnStatus")}</TableHead>
            <TableHead>{t("portfolio.columnActive")}</TableHead>
            <TableHead>{t("portfolio.columnAttention")}</TableHead>
            <TableHead>{t("portfolio.columnRecent")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.client_id}>
              <TableCell>
                <Link
                  href={`/clients/${row.client_id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {row.name ?? t("clientUnnamed")}
                </Link>
                {coverageWords(row).map((text) => (
                  <div key={text} className="mt-0.5">
                    <span className="text-xs text-warning">{text}</span>
                  </div>
                ))}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <Badge tone={STATUS_TONE[row.status ?? ""] ?? "neutral"}>
                  {row.status ?? t("portfolio.statusUnknown")}
                </Badge>
              </TableCell>
              {COUNT_KINDS.map((kind) => (
                <TableCell key={kind}>{countCell(row, kind)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </DataTableCard>
    );
  };

  // EVERY CLIENT CLEAR is a DESIGNED state, not a grid of zeros (Xero/QuickBooks' own discipline),
  // and it is a different sentence from the queue's "nothing is waiting": one is about Work, the
  // other about the review queue, and they can legitimately disagree.
  //
  // AND IT REQUIRES A KNOWN ZERO (fix round 1, finding A5). `(r.active ?? 0) === 0` read "I could
  // not find out what is running" as "nothing is running" and printed the one sentence on this
  // board that tells a principal to stop looking — on the same screen as the count cell's own
  // "could not be read". One null anywhere on the page withholds the reassurance.
  const caughtUp = portfolio.denied === null
    && !portfolio.loading
    && pack.rows.length > 0
    && pack.rows.every((r) => r.active === 0 && r.attentionFailed === 0);

  return (
    <section aria-labelledby="firm-home-portfolio" className="flex flex-col gap-3">
      <SectionHeader
        level={2}
        action={
          <Link href="/clients" className="text-xs text-primary underline-offset-4 hover:underline">
            {t("portfolio.seeRegister")}
          </Link>
        }
      >
        <span id="firm-home-portfolio">{t("portfolio.heading")}</span>
      </SectionHeader>

      {/* THE DISCLOSURE, BEFORE ANY CLICK. Two sentences a professional needs in front of the
          numbers rather than after them: which clients the attention chips above do NOT cover, and
          what the "recent" column is dated by. #650's own honest practice, restated here because
          this board is where the two populations meet. */}
      <p className="max-w-prose text-xs text-muted-foreground">
        {pack.sources.reviewQueueExcludes.length > 0
          ? t("portfolio.queueExcludes", { statuses: pack.sources.reviewQueueExcludes.join(", ") })
          : null}{" "}
        {windowDates
          ? t("portfolio.recentDatedBy", { from: windowDates.from, to: windowDates.to })
          : t("portfolio.recentUndated")}
      </p>

      {/* THE CREATION AFFORDANCE, BESIDE the state machine. Its mount point never changes; only the
          sentence above it does. */}
      {creationControl ? (
        <div className="flex flex-col items-start gap-1">
          {registerEmpty ? (
            <p className="text-sm text-muted-foreground">{t("portfolio.firstClientPrompt")}</p>
          ) : null}
          {creationControl}
        </div>
      ) : null}

      {caughtUp ? <p className="text-sm text-muted-foreground">{t("portfolio.zeroWorkload")}</p> : null}

      {body()}

      {/* THE PAGE'S OWN COVERAGE — a truncated register is a page, not a portfolio. */}
      {pack.coverageReason !== null ? (
        <p className="text-xs text-warning">
          {t("portfolio.pageTruncated", { count: pack.rows.length })}
        </p>
      ) : null}

      {/* THE READ'S OWN DATE, and the delayed face past a minute. A transport failure KEEPS the
          numbers and stands beside them; it never blanks the board. */}
      <p className="text-xs text-muted-foreground">
        {portfolio.readAt === null
          ? t("portfolio.neverRead")
          : t("portfolio.readAt", { at: businessDateTime(new Date(portfolio.readAt).toISOString()) })}
        {portfolio.delayed ? ` ${t("portfolio.delayed")}` : null}
      </p>
      {portfolio.staleError !== null && !portfolio.failedFirstRead ? (
        <ErrorMessage error={portfolio.staleError} />
      ) : null}

      {/* PAGING. Real links, so middle-click and open-in-new-tab work and assistive tech announces
          them as links — `accounting-work-list.tsx`'s own pager shape. */}
      {state.cursor !== null || pack.nextCursor !== null ? (
        <Pagination aria-label={t("portfolio.paginationLabel")} className="justify-start">
          <PaginationContent>
            {state.cursor !== null ? (
              <PaginationItem>
                <PaginationPrevious
                  href={pathname}
                  text={t("portfolio.firstPage")}
                  aria-label={t("portfolio.firstPage")}
                  onClick={(e) => {
                    e.preventDefault();
                    push({ cursor: null });
                  }}
                />
              </PaginationItem>
            ) : null}
            {pack.nextCursor !== null ? (
              <PaginationItem>
                <PaginationNext
                  href={`?cursor=${encodeURIComponent(pack.nextCursor)}`}
                  text={t("portfolio.nextPage")}
                  aria-label={t("portfolio.nextPage")}
                  onClick={(e) => {
                    e.preventDefault();
                    push({ cursor: pack.nextCursor });
                  }}
                />
              </PaginationItem>
            ) : null}
          </PaginationContent>
        </Pagination>
      ) : null}
    </section>
  );
}
