"use client";

// THE OPERATOR SUPPORT DESTINATION (#615, refresh spec #612 journey D3) — an explicitly authorised
// destination of its own, NOT a section of a firm's settings.
//
// WHY IT MOVED OUT OF `/settings/registrations`. An operator's queue is not a property of the firm
// they happen to be a member of: it is estate-wide work about OTHER people's admission, and
// #614 left a comment on the registry row saying #615 would relocate it. It is relocated here, and
// journey D3's own line — "Do not merge operator controls into normal client navigation" — is why
// it is a firm-altitude destination with its own address rather than a settings child.
//
// THREE THINGS THIS COMPONENT OWNS, and nothing else:
//   1. THE AFFORDANCE GATE. `clara.caller_context` is read once, and only an operator-firm OWNER is
//      offered the console. This is an AFFORDANCE, never the wall — both doors carry
//      `clara.approve_firm_registration`'s own predicate, re-derived at call time, so a caller who
//      types `/operator` still meets CLR04. Getting this gate wrong in either direction costs
//      nothing real; getting the DB's wrong would. The judgement is the ONE capability object
//      (`lib/firm/capabilities.ts`), not a fourth private copy of the same predicate.
//   2. THE URL. `?kind=`, `?settled=` and `?case=` are the address: a filtered queue and an open
//      case are both shareable and both survive Back. Opening a case is a `router.push` (a real
//      history entry) so Back closes it; a page LOADED at `?case=` has no such entry to pop, so
//      closing THAT one rewrites the URL with `router.replace` instead — the same split
//      `components/firm/activity/activity-feed.tsx` established, and the reason Back never leaves
//      the app from a deep link.
//   3. ONE ANNOUNCEMENT OWNER for the list's status (spec appendix C §4): exactly one
//      `role="status"` element is mounted at a time, and while the case Sheet is open it owns the
//      live region instead of competing with it.
//
// EVERY OTHER JUDGEMENT IS SOMEBODY ELSE'S: which of the six read states this is
// (`lib/operator/reads.ts`'s `operatorQueueOutcome`, separately tested without React), which act is
// permitted (`supportedActionFor`), and what a failure means (`classifySupportFailure`).

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableCard } from "@/components/common/data-table-card";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { isCallerContextRow, loadCallerContext } from "@/lib/firm/caller-context";
import { firmCapabilitiesFromRows } from "@/lib/firm/capabilities";
import { businessDateTime } from "@/lib/business-date";
import { shortId } from "@/lib/firm-admin/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  SUPPORT_CASE_KINDS,
  applyOperatorUrlState,
  classifySupportFailure,
  formatCaseParam,
  parseOperatorUrlState,
  supportCaseState,
  supportedActionFor,
  type SupportQueueRow,
} from "@/lib/operator/reads";
import { AdmissionCapacityPanel } from "./admission-capacity-panel";
import { IsolationBanner } from "./isolation-banner";
import { SupportCaseSheet } from "./support-case-sheet";
import { useOperatorQueue } from "./use-operator-queue";

/** The `<h1>` id `app/(firm)/operator/page.tsx` renders — the focus fallback when the row a Sheet
 *  was opened from is gone by the time it closes (the `WORK_HEADING_ID`/`ACTIVITY_HEADING_ID`
 *  idiom, read by id because the heading belongs to the server component above this one). */
export const OPERATOR_HEADING_ID = "operator-support-heading";

export function OperatorSupportConsole() {
  const t = useTranslations("Operator");
  const ctxState = useHydratedPart(sessionTokenAccessor, (session) => loadCallerContext(session));

  if (!ctxState.data) {
    return ctxState.err ? (
      <StateBanner
        tone="error"
        code={ctxState.clr ? `${ctxState.clr.code}${ctxState.clr.reason ? ` · ${ctxState.clr.reason}` : ""}` : undefined}
      >
        {ctxState.err}
      </StateBanner>
    ) : (
      <LoadingState>{t("loading")}</LoadingState>
    );
  }

  // FAIL CLOSED on zero rows, more than one row, and a single malformed row alike — the same
  // four-way guard `lib/require-firm-scope.ts`'s `resolveFirmScope` applies, rather than a fourth
  // copy of the same judgement. `isCallerContextRow` stays its own conjunct because it proves the
  // row's SHAPE before `row.user_id` is threaded into a deterministic op key, which is a different
  // question from what the caller may do.
  const row = ctxState.data[0];
  const capabilities = firmCapabilitiesFromRows(ctxState.data);
  if (!row || !isCallerContextRow(row) || ctxState.data.length > 1 || !capabilities.canDecideFirmRegistrations) {
    // ONE honest refusal line, and ZERO action controls — #615 AC1's own sentence.
    return (
      <div data-operator-region="refusal">
        <StateBanner tone="warning">{t("notOperator")}</StateBanner>
      </div>
    );
  }

  return <Console callerId={row.user_id} />;
}

function Console({ callerId }: { callerId: string }) {
  const t = useTranslations("Operator");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseOperatorUrlState(searchParams), [searchParams]);
  const queue = useOperatorQueue({ kind: state.kind, settled: state.settled });

  const openedViaPushRef = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastCaseKeyRef = useRef<string | null>(null);

  const setUrl = useCallback(
    (patch: Parameters<typeof applyOperatorUrlState>[1], push: boolean) => {
      const next = applyOperatorUrlState(searchParams, patch);
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (push) router.push(href);
      else router.replace(href);
    },
    [router, pathname, searchParams],
  );

  const openCase = useCallback(
    (row: SupportQueueRow) => {
      openedViaPushRef.current = true;
      setUrl({ caseRef: { kind: row.case_kind, id: row.case_id } }, true);
    },
    [setUrl],
  );

  const closeCase = useCallback(
    (open: boolean) => {
      if (open) return;
      if (openedViaPushRef.current) {
        openedViaPushRef.current = false;
        router.back();
        return;
      }
      // Opened by a DIRECT LINK: there is no history entry of ours to pop, and `router.back()`
      // would leave the app entirely. Rewrite instead — the queue underneath is untouched.
      setUrl({ caseRef: null }, false);
    },
    [router, setUrl],
  );

  // FOCUS RETURN after the Sheet closes. The in-page Escape/Close path already leaves focus
  // somewhere real; the PHYSICAL Back button never held DOM focus at all, so an SPA re-render
  // after a pop leaves it on <body>. This effect fires on exactly ONE transition — `?case=` going
  // from set to unset — and only acts when focus is genuinely nowhere.
  useEffect(() => {
    const key = state.caseRef ? formatCaseParam(state.caseRef.kind, state.caseRef.id) : null;
    const prevKey = lastCaseKeyRef.current;
    lastCaseKeyRef.current = key;
    if (prevKey === null || key !== null) return;
    if (typeof document === "undefined") return;
    const active = document.activeElement;
    const activeIsUseless = active === null || active === document.body || active === document.documentElement;
    if (!activeIsUseless) return;
    const target = rowRefs.current.get(prevKey);
    if (target && typeof target.focus === "function") {
      target.focus();
      return;
    }
    // The row is gone (a filter changed, or the case was decided and left the queue) — the page's
    // own heading landmark, the same fallback `components/work/work-detail.tsx` uses. Both the
    // method and its answer are checked: a test DOM need not implement `getElementById` at all.
    const doc = document as unknown as { getElementById?: (id: string) => HTMLElement | null };
    if (typeof doc.getElementById !== "function") return;
    const heading = doc.getElementById(OPERATOR_HEADING_ID);
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus();
    }
  }, [state.caseRef]);

  const outcome = queue.outcome;
  const sheetOpen = state.caseRef !== null;

  return (
    <div className="flex flex-col gap-4">
      <IsolationBanner />
      <AdmissionCapacityPanel callerId={callerId} />

      <section aria-label={t("filtersLabel")} className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={state.kind === null ? "default" : "outline"}
          aria-pressed={state.kind === null}
          onClick={() => setUrl({ kind: null }, false)}
        >
          {t("filterAll")}
        </Button>
        {SUPPORT_CASE_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            size="sm"
            variant={state.kind === kind ? "default" : "outline"}
            aria-pressed={state.kind === kind}
            onClick={() => setUrl({ kind: state.kind === kind ? null : kind }, false)}
          >
            {t(`kind.${kind}`)}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant={state.settled ? "default" : "outline"}
          aria-pressed={state.settled}
          onClick={() => setUrl({ settled: !state.settled }, false)}
        >
          {t("filterSettled")}
        </Button>
      </section>

      {outcome.kind === "loading" ? <LoadingState>{t("queueLoading")}</LoadingState> : null}

      {outcome.kind === "denied" ? (
        <div data-operator-region="denied">
          <StateBanner
            tone="warning"
            title={t("deniedTitle")}
            code={classifySupportFailure(outcome.error).code ?? undefined}
            action={
              <Button type="button" variant="outline" size="sm" onClick={queue.reload}>
                {t("retry")}
              </Button>
            }
          >
            {t("deniedBody")}
          </StateBanner>
        </div>
      ) : null}

      {outcome.kind === "failedFirstRead" ? (
        <div data-operator-region="failed">
          <StateBanner
            tone="error"
            title={t("failedReadTitle")}
            action={
              <Button type="button" variant="outline" size="sm" onClick={queue.reload}>
                {t("retry")}
              </Button>
            }
          >
            {t("failedReadBody")}
          </StateBanner>
        </div>
      ) : null}

      {outcome.kind === "stale" ? (
        <div data-operator-region="stale">
          <StateBanner
            tone="warning"
            action={
              <Button type="button" variant="outline" size="sm" onClick={queue.reload}>
                {t("retry")}
              </Button>
            }
          >
            {t("staleNote")}
          </StateBanner>
        </div>
      ) : null}

      {outcome.kind === "empty" ? (
        <div data-operator-region="empty">
          <EmptyState>{outcome.filtered ? t("emptyFiltered") : t("emptyFirstUse")}</EmptyState>
        </div>
      ) : null}

      {outcome.kind === "ready" || outcome.kind === "stale" ? (
        <>
          {/* The ONE status announcement once rows are on screen — and the only one: while the case
              Sheet is open it owns the live region instead, so a screen reader is never told two
              competing things about the same list. */}
          <p role={sheetOpen ? undefined : "status"} aria-live={sheetOpen ? undefined : "polite"} className="sr-only">
            {queue.refreshing ? t("refreshing") : t("rowCount", { count: outcome.rows.length })}
          </p>
          <QueueTable rows={outcome.rows} onOpen={openCase} rowRefs={rowRefs} />
        </>
      ) : null}

      <SupportCaseSheet
        caseRef={state.caseRef}
        callerId={callerId}
        onOpenChange={closeCase}
        onActed={queue.reload}
      />
    </div>
  );
}

function QueueTable({
  rows,
  onOpen,
  rowRefs,
}: {
  rows: SupportQueueRow[];
  onOpen: (row: SupportQueueRow) => void;
  rowRefs: React.RefObject<Map<string, HTMLButtonElement>>;
}) {
  const t = useTranslations("Operator");
  return (
    <DataTableCard label={t("queueLabel")}>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnCase")}</TableHead>
          <TableHead>{t("columnFirm")}</TableHead>
          <TableHead>{t("columnApplicant")}</TableHead>
          <TableHead>{t("columnState")}</TableHead>
          <TableHead>{t("columnOccurred")}</TableHead>
          <TableHead className="text-right">{t("columnActions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const key = formatCaseParam(row.case_kind, row.case_id);
          const action = supportedActionFor(row);
          return (
            <TableRow key={key}>
              <TableCell>
                <Badge variant="secondary">{t(`kind.${row.case_kind}`)}</Badge>
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {row.firm_name ?? t("unavailable")}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {shortId(row.applicant)}
              </TableCell>
              <TableCell className="text-muted-foreground">{t(`state.${supportCaseState(row)}`)}</TableCell>
              <TableCell className="text-muted-foreground">{businessDateTime(row.occurred_at)}</TableCell>
              <TableCell className="text-right">
                {/* ONE control per row, and it opens the DETAIL — journey D3's own shape. The act
                    itself lives in the Sheet, beside the state it acts on, so a person never
                    decides a registration from a row that does not show them why. */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  ref={(el: HTMLButtonElement | null) => {
                    if (el) rowRefs.current.set(key, el);
                    else rowRefs.current.delete(key);
                  }}
                  onClick={() => onOpen(row)}
                >
                  {action === "none" ? t("openTrigger") : t("reviewTrigger")}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTableCard>
  );
}
