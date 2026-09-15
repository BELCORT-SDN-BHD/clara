"use client";

// THE DURABLE WORK LIST — journey B3's list half, on BOTH surfaces (#641).
//
// ONE COMPONENT, TWO SCOPES. `/work` renders it firm-wide (with a Client column and a client
// filter) and `/clients/:id/work` renders it pinned to one client. They are the same list of the
// same records answered by the same door; two components would be two renderings of one queue,
// the exact defect `components/work/client-work-queue.tsx`'s own header records for the review
// queue.
//
// EVERY `clara.accounting_work` ROW IS LISTED, whatever started it. #629's own finding is that a
// Work admitted from a Clara conversation has no chat message to hydrate and is therefore
// reachable from nowhere else; this list is where it becomes reachable, and the Origin column
// says where each row came from rather than hiding the difference.
//
// WHY IT SITS ABOVE THE REVIEW QUEUE RATHER THAN INSIDE IT (unchanged from the first cut). They
// answer two different questions. The review queue is "what is waiting on a PERSON"; this is
// "what has been ASKED OF the agent, and how did it end". A refused Work is waiting on nobody
// until a human retries it, and a completed one on nobody at all — yet both must stay findable,
// because they are the record of an operation against a client's books.
//
// NO FIGURE IS RENDERED HERE, and the door agrees (0189 projects no money). A list of operations
// is not a ledger, and a total computed over a basis, sitting in a list row, is a number this UI
// derived where a reader would take it for a posted amount. The detail page renders the money,
// once, with its own labels. The memo and the posting date ARE rendered: both are literal values
// the admitted basis holds.
//
// THE FIVE LIST STATES ARE TOLD APART BY WHAT THE READ ACTUALLY ANSWERED, never by a caught error
// mapped to an empty array (appendix C §3's Empty rule, appendix D's own taxonomy):
//
//   Skeleton          the FIRST read of this mount — a known layout, so the shape stands in for
//                     itself; an sr-only `role="status"` sentence says what is loading, because a
//                     skeleton cannot say it.
//   denied            a permission loss — the rows are CLEARED, the access state is explained,
//                     and no create/retry affordance is offered that could only refuse.
//   failed first read an Alert plus Retry. NOT an Empty: a read that did not answer proves
//                     nothing about whether this firm has Work.
//   Empty, first use  a successful read, no filters, zero rows — what will appear here, and the
//                     permitted first action.
//   Empty, no results a successful read, filters active, zero rows — the filters are PRESERVED
//                     and "Clear filters" is offered right there.
//
// NARROW WIDTHS KEEP THE MEANING. Below `md` the Client/Origin/Entered-by/Submitted columns are
// withdrawn from the table and re-expressed in the row's own primary cell, so nothing is clipped
// silently; the table primitive's OWN focusable `overflow-x-auto` region (components/ui/table.tsx)
// is what keeps the PAGE from scrolling horizontally at 320px. Status and the row's own link stay
// visible at every width.

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoreHorizontalIcon } from "lucide-react";

import { MemberName } from "@/components/common/member-name";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessDateTime } from "@/lib/business-date";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { loadClientRegister, type ClientRow } from "@/lib/firm/reads";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { useMemberNames } from "@/lib/members/use-member-names";
import { workDetailHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  workStateLabel,
  workStateTone,
  type WorkListFilters,
  type WorkListRow,
} from "@/lib/work/work-list";
import {
  applyWorkListUrlState,
  hasWorkListFilters,
  parseWorkListUrlState,
  EMPTY_WORK_LIST_FILTERS,
  type WorkListUrlState,
} from "@/lib/work/work-list-url-state";
import { WorkListFilterBar } from "./work-list-filters";
import { WorkSavedViews } from "./work-saved-views";
import { useAddressedWork, type AddressedWorkState } from "./use-addressed-work";
import { useWorkList, type WorkListState } from "./use-work-list";

export type WorkListScope = { kind: "firm" } | { kind: "client"; clientId: string };

/** The vocabularies this build ships a WORD for. A value outside either set renders VERBATIM:
 *  `clara.accounting_work.purpose` is a CHECK the database owns and concurrent lanes (#643, #631)
 *  are widening, and `basis_origin` could grow the same way, so a missing message key must degrade
 *  to the database's own token rather than crash a `t()` lookup — the same posture
 *  `lib/work/types.ts` takes for an unenumerated status. */
const KNOWN_PURPOSE_LABELS = new Set(["journal_entry"]);
const KNOWN_ORIGIN_LABELS = new Set(["user_direct", "clara_interpreted"]);

export function AccountingWorkList({
  scope,
  /** Injected by the cells; production reads the door. */
  load,
  /** The ADDRESSED-row door, injected the same way (`clara.get_accounting_work_row`). */
  loadRow,
  clientsOverride,
}: {
  scope: WorkListScope;
  load?: React.ComponentProps<typeof WorkListTable>["load"];
  loadRow?: React.ComponentProps<typeof WorkListTable>["loadRow"];
  clientsOverride?: readonly ClientRow[];
}) {
  const t = useTranslations("WorkList");
  const searchParams = useSearchParams();
  const state = useMemo(() => parseWorkListUrlState(searchParams), [searchParams]);

  // FIRM SURFACE ONLY. The client register is what turns the Client filter into names; on the
  // client surface the route already pins the client, so the read is never made.
  const clientsRead = useAsyncRead<ClientRow[]>(() =>
    scope.kind === "firm" ? loadClientRegister(sessionTokenAccessor) : Promise.resolve([]),
  );
  const clients = clientsOverride ?? clientsRead.data ?? [];
  const memberNames = useMemberNames(sessionTokenAccessor);

  const memberOptions = useMemo(() => {
    const out = new Map<string, string>();
    for (const m of memberNames.members) out.set(m.user_id, m.display_name);
    return out;
  }, [memberNames.members]);

  // THE CLIENT SCOPE IS THE ROUTE'S, NOT THE URL'S. On `/clients/:id/work` a hand-edited
  // `?client=` must not be able to point the list at another client's books under this client's
  // heading — the route's own id wins, always.
  const filters: WorkListFilters = {
    client: scope.kind === "client" ? scope.clientId : state.client,
    status: state.status,
    purpose: state.purpose,
    initiator: state.initiator,
    since: state.since,
    until: state.until,
    q: state.q,
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      <WorkSavedViews state={state} />
      <WorkListFilterBar
        state={state}
        clients={clients}
        showClient={scope.kind === "firm"}
        members={memberOptions}
      />
      <WorkListTable
        scope={scope}
        state={state}
        filters={filters}
        memberNames={memberNames}
        load={load}
        loadRow={loadRow}
      />
    </section>
  );
}

function WorkListTable({
  scope,
  state,
  filters,
  memberNames,
  load,
  loadRow,
}: {
  scope: WorkListScope;
  state: WorkListUrlState;
  filters: WorkListFilters;
  memberNames: ReturnType<typeof useMemberNames>;
  load?: Parameters<typeof useWorkList>[0]["load"];
  loadRow?: Parameters<typeof useAddressedWork>[0]["load"];
}) {
  const t = useTranslations("WorkList");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const list: WorkListState = useWorkList({ filters, cursor: state.cursor, load });

  // THE ADDRESSED ROW (#719). `?work=<id>` names a Work the caller arrived pointing at, which may
  // sit outside this page entirely — three pages down, or excluded by the filters the same URL
  // carries. When it IS on this page the row itself carries the treatment and nothing is read;
  // otherwise the addressed-row door answers it beside the page. A DENIED list asks nothing: that
  // door would refuse identically and the surface would carry two banners saying one thing.
  const addressedInPage =
    state.work !== null && list.rows.some((row) => row.id === state.work);
  const addressed = useAddressedWork({
    workId: state.work,
    skip: addressedInPage || list.loading || list.denied !== null,
    load: loadRow,
  });

  // PAGING IS A `push`, unlike a filter change's `replace` — page 3's Back goes to page 2, which
  // is what a person means by Back inside a paged list.
  const goToPage = (cursor: string | null) => {
    const next = applyWorkListUrlState(searchParams, { cursor });
    const query = next.toString();
    router.push(query === "" ? pathname : `${pathname}?${query}`);
  };

  // ONE definition of "clear everything", shared with the filter bar's own Clear button
  // (`lib/work/work-list-url-state.ts`): two hand-written copies of the same seven-axis literal
  // were one axis away from disagreeing about what a cleared list is.
  const clearFilters = () => {
    const next = applyWorkListUrlState(searchParams, EMPTY_WORK_LIST_FILTERS);
    const query = next.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`);
  };

  // Rendered ABOVE whatever the page itself has to say, in every state except a permission loss —
  // including over an Empty, which is exactly the case a `?work=` link into a filtered list hits.
  const addressedBlock =
    state.work === null || list.denied !== null || addressedInPage ? null : (
      <AddressedWorkCallout
        addressed={addressed}
        scope={scope}
        memberNames={memberNames}
      />
    );

  if (list.loading) {
    return (
      <div className="flex flex-col gap-2">
        {/* A Skeleton cannot say WHAT is loading; this sentence can, and it is the one
            announcement owner while it is mounted. */}
        <p role="status" className="sr-only">
          {t("loading")}
        </p>
        <WorkListSkeleton showClient={scope.kind === "firm"} />
      </div>
    );
  }

  if (list.denied !== null) {
    return <DeniedBanner error={list.denied} retry={list.reload} />;
  }

  if (list.failedFirstRead) {
    return (
      <div className="flex flex-col gap-3">
        {addressedBlock}
        <StateBanner
          tone="error"
          title={t("failedReadTitle")}
          action={
            <Button type="button" variant="outline" size="sm" onClick={list.reload}>
              {t("retry")}
            </Button>
          }
        >
          {t("failedReadBody")}
        </StateBanner>
      </div>
    );
  }

  const filtered = hasWorkListFilters(state) || state.cursor !== null;

  if (list.rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {addressedBlock}
        {list.staleError !== null ? <StaleBanner retry={list.reload} /> : null}
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{filtered ? t("emptyFilteredTitle") : t("emptyFirstUseTitle")}</EmptyTitle>
            <EmptyDescription>
              {filtered ? t("emptyFilteredBody") : t("emptyFirstUseBody")}
            </EmptyDescription>
          </EmptyHeader>
          {filtered ? (
            <EmptyContent>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {addressedBlock}
      {list.staleError !== null ? <StaleBanner retry={list.reload} /> : null}

      {/* THE ONE STATUS ANNOUNCEMENT once rows are on screen: refreshing, or a plain count of what
          is on THIS page. Never a total — a page is not a total, and AC1 says so in those words. */}
      <p role="status" aria-live="polite" className="sr-only">
        {list.refreshing ? t("refreshing") : t("rowCount", { count: list.rows.length })}
      </p>

      {/* NO EXTRA `overflow-x-auto` WRAPPER HERE, deliberately: `components/ui/table.tsx` already
          renders one, and it is the one that carries `tabIndex={0}` + `role="region"` + the
          `aria-label` this call passes (that file's own provenance note, and
          `table-scroll-region.test.tsx`'s cells). A second scroll container around it would be a
          scrollable region with NO tab stop of its own — axe `scrollable-region-focusable`,
          SERIOUS — which is the exact defect the primitive was changed to fix. The table's own
          labelled viewport is what keeps the PAGE from scrolling sideways at 320px and at 200%
          zoom (appendix C §4). */}
      <Table aria-label={t("tableLabel")}>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columnWork")}</TableHead>
            {scope.kind === "firm" ? (
              <TableHead className="hidden md:table-cell">{t("columnClient")}</TableHead>
            ) : null}
            <TableHead>{t("columnStatus")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columnOrigin")}</TableHead>
            <TableHead className="hidden lg:table-cell">{t("columnEnteredBy")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columnSubmitted")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("columnActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.rows.map((row) => (
            <WorkRow
              key={row.id}
              row={row}
              scope={scope}
              memberNames={memberNames}
              addressed={row.id === state.work}
            />
          ))}
        </TableBody>
      </Table>

      <WorkListPager
        hasPrevious={state.cursor !== null}
        nextCursor={list.nextCursor}
        onPage={goToPage}
      />
    </div>
  );
}

/**
 * MOVE FOCUS TO THE THING THE URL ASKED FOR, ONCE.
 *
 * A `?work=<id>` link is a request to be taken to one row, so landing the caret on that row's own
 * link is what makes the request true for a keyboard or screen-reader user rather than only for a
 * sighted one scanning for a highlight. Guarded by the id it last focused, so a re-render, a poll
 * or a filter change never yanks focus back from wherever the person has since moved it; and
 * feature-detected, because this app's unit harness mounts through a DOM shim whose nodes carry no
 * `focus` at all (`apps/web/test/hookHarness.ts`) — the e2e walk is where real focus is measured.
 */
function useFocusAddressed(active: boolean, workId: string | null) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || workId === null || focusedRef.current === workId) return;
    const node = ref.current;
    if (node && typeof node.focus === "function") {
      focusedRef.current = workId;
      node.focus();
    }
  }, [active, workId]);
  return ref;
}

function WorkRow({
  row,
  scope,
  memberNames,
  addressed,
}: {
  row: WorkListRow;
  scope: WorkListScope;
  memberNames: ReturnType<typeof useMemberNames>;
  /** TRUE when `?work=` names THIS row and it happens to be on the page being shown. */
  addressed: boolean;
}) {
  const t = useTranslations("WorkList");
  const label = workStateLabel(row);
  const href = workDetailHref(row.client_id, row.id);
  const focusRef = useFocusAddressed(addressed, addressed ? row.id : null);

  return (
    // `aria-current="true"` rather than a colour alone: the addressed row is a FACT about this
    // list ("this is the one you asked for"), and a tinted background is not a fact anybody can
    // hear. The tint is the same `accent` the rest of the app uses for a current row.
    <TableRow
      aria-current={addressed ? true : undefined}
      data-addressed={addressed ? "true" : undefined}
      className={addressed ? "bg-accent/60" : undefined}
    >
      <TableCell className="align-top">
        <div className="flex flex-col gap-0.5">
          {addressed ? (
            <p role="status" className="sr-only">
              {t("addressedOnThisPage")}
            </p>
          ) : null}
          {/* THE PRIMARY ACTION IS A VISIBLE LINK ON THE ROW, never only inside the overflow menu
              (appendix C §3's "Important pending questions and primary next actions stay outside
              overflow menus"). It is a real route, so Back from the detail restores this list's
              own URL — filters, page and all. */}
          <Link
            ref={focusRef}
            href={href}
            className="text-sm font-medium text-primary underline underline-offset-2 wrap-anywhere"
          >
            {row.memo && row.memo.trim() !== "" ? row.memo : t("untitledWork")}
          </Link>
          {/* THE COLUMNS THE NARROW TABLE WITHDRAWS, re-expressed here so nothing is clipped
              silently. Hidden at `md` and up, where they have their own columns. */}
          <p className="text-xs text-muted-foreground md:hidden">
            {[
              scope.kind === "firm" ? (row.client_name ?? t("unknownClient")) : null,
              KNOWN_PURPOSE_LABELS.has(row.purpose) ? t(`purposeLabels.${row.purpose}`) : row.purpose,
              row.created_at === null ? null : businessDateTime(row.created_at),
            ]
              .filter((part): part is string => typeof part === "string" && part !== "")
              .join(" · ")}
          </p>
          <p className="hidden text-xs text-muted-foreground md:block">
            {row.posting_date ? t("postingDate", { date: row.posting_date }) : t("noPostingDate")}
          </p>
        </div>
      </TableCell>

      {scope.kind === "firm" ? (
        <TableCell className="hidden align-top md:table-cell">
          {row.client_name ?? t("unknownClient")}
        </TableCell>
      ) : null}

      <TableCell className="align-top">
        <div className="flex flex-col items-start gap-1">
          {/* THE BADGE CARRIES THE WORD (C08.6) — colour is never the only cue. */}
          <Badge variant={workStateTone(label)}>
            {label === "unknown" ? row.status : t(`stateLabels.${label}`)}
          </Badge>
          {/* WHY, where the database said why. A refusal reason is the DB's own token; it is
              rendered verbatim rather than re-worded into something friendlier that would be a
              second, drifting vocabulary. */}
          {row.error_reason !== null ? (
            <span className="text-xs text-muted-foreground wrap-anywhere">{row.error_reason}</span>
          ) : null}
        </div>
      </TableCell>

      <TableCell className="hidden align-top md:table-cell">
        {KNOWN_ORIGIN_LABELS.has(row.basis_origin) ? t(`originLabels.${row.basis_origin}`) : row.basis_origin}
      </TableCell>

      <TableCell className="hidden align-top lg:table-cell">
        <MemberName userId={row.initiated_by ?? row.initiator} resolver={memberNames} showRole={false} />
      </TableCell>

      <TableCell className="hidden align-top md:table-cell">
        {row.created_at === null ? "—" : businessDateTime(row.created_at)}
      </TableCell>

      <TableCell className="align-top">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={t("rowMenuLabel")} />}
          >
            <MoreHorizontalIcon aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={href} />}>{t("openWork")}</DropdownMenuItem>
            {row.pending_question_id !== null ? (
              <DropdownMenuItem render={<Link href={href} />}>{t("answerQuestion")}</DropdownMenuItem>
            ) : null}
            {row.entry_id !== null ? (
              <DropdownMenuItem
                render={<Link href={`/clients/${encodeURIComponent(row.client_id)}/journals`} />}
              >
                {t("viewInJournals")}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/**
 * THE ADDRESSED ROW, WHEN IT IS NOT ON THIS PAGE — #719's own lesson, rendered.
 *
 * A `?work=<id>` link names one Work. If it is three pages down, or excluded by the filters the
 * same URL carries, a surface that could only see its current page would show the person NOTHING
 * and say nothing about it: the row they were sent a link to, silently absent from a list that
 * looks complete. So it is fetched by id from `clara.get_accounting_work_row` and rendered HERE,
 * above the page, saying plainly that it is not on it.
 *
 * IT IS NOT A ROW OF THE TABLE, and that is deliberate rather than cosmetic. Splicing it into the
 * table body would put a record in an ordered, paged list at a position the ordering never gave
 * it — the reader would have no way to know which rows are the page and which one is the visitor.
 * A labelled region above the table is the honest shape: appendix D row 33's Item anatomy is what
 * this would be composed from, and that primitive is not installed (and this ticket installs only
 * `pagination` and `empty`), so it is composed from the same Badge/Link vocabulary the rows use.
 *
 * NOT-FOUND IS SAID OUT LOUD. The door answers the SAME CLR11 for an id that never existed, one
 * belonging to another firm, and one this caller may not read — it gives no oracle, so neither
 * does this. What it must never do is drop the request silently, which is indistinguishable from
 * "your link worked and there was nothing interesting there".
 */
function AddressedWorkCallout({
  addressed,
  scope,
  memberNames,
}: {
  addressed: AddressedWorkState;
  scope: WorkListScope;
  memberNames: ReturnType<typeof useMemberNames>;
}) {
  const t = useTranslations("WorkList");
  const row = addressed.row;
  const focusRef = useFocusAddressed(row !== null, row?.id ?? null);

  if (addressed.loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("addressedLoading")}
      </p>
    );
  }

  if (addressed.notFound) {
    return (
      <StateBanner tone="warning" title={t("addressedNotFoundTitle")} code="CLR11">
        {t("addressedNotFoundBody")}
      </StateBanner>
    );
  }

  if (addressed.error !== null) {
    return (
      <StateBanner
        tone="error"
        title={t("addressedFailedTitle")}
        action={
          <Button type="button" variant="outline" size="sm" onClick={addressed.reload}>
            {t("retry")}
          </Button>
        }
      >
        {t("addressedFailedBody")}
      </StateBanner>
    );
  }

  if (row === null) return null;

  const label = workStateLabel(row);
  const href = workDetailHref(row.client_id, row.id);

  return (
    <section
      aria-label={t("addressedLabel")}
      data-slot="addressed-work"
      className="flex flex-col gap-1.5 rounded-lg border border-primary/40 bg-accent/40 p-3"
    >
      <p role="status" className="text-xs font-medium text-muted-foreground">
        {t("addressedOutsidePage")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          ref={focusRef}
          href={href}
          className="text-sm font-medium text-primary underline underline-offset-2 wrap-anywhere"
        >
          {row.memo && row.memo.trim() !== "" ? row.memo : t("untitledWork")}
        </Link>
        <Badge variant={workStateTone(label)}>
          {label === "unknown" ? row.status : t(`stateLabels.${label}`)}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {[
          scope.kind === "firm" ? (row.client_name ?? t("unknownClient")) : null,
          KNOWN_ORIGIN_LABELS.has(row.basis_origin)
            ? t(`originLabels.${row.basis_origin}`)
            : row.basis_origin,
          row.created_at === null ? null : businessDateTime(row.created_at),
        ]
          .filter((part): part is string => typeof part === "string" && part !== "")
          .join(" · ")}
      </p>
      <p className="text-xs text-muted-foreground">
        <MemberName
          userId={row.initiated_by ?? row.initiator}
          resolver={memberNames}
          showRole={false}
        />
      </p>
    </section>
  );
}

/** Previous/Next over the door's keyset. THERE IS NO PAGE NUMBER AND NO "of N", deliberately:
 *  a keyset pager knows whether there is a next page and nothing about how many there are, and
 *  appendix D row 42 is explicit — "Never infer a total from the current page".
 *
 *  CORRECTED SEMANTICS (#771): `PaginationLink` (components/ui/pagination.tsx) now branches on
 *  `href` — with one it renders a plain `<a href>` (no `role`, no `type`, no Base UI keyboard
 *  layer), so these controls are real links: middle-click and open-in-new-tab work, Enter
 *  activates them the way a browser activates a link, and `onClick`'s `preventDefault` upgrades
 *  an ordinary click to a client-side push. Assistive tech announces them as links, matching how
 *  they behave. `e2e/work-list-walk.spec.ts` asserts the link role directly. */
function WorkListPager({
  hasPrevious,
  nextCursor,
  onPage,
}: {
  hasPrevious: boolean;
  nextCursor: string | null;
  onPage: (cursor: string | null) => void;
}) {
  const t = useTranslations("WorkList");
  if (!hasPrevious && nextCursor === null) return null;

  return (
    <Pagination aria-label={t("paginationLabel")} className="justify-start">
      <PaginationContent>
        {hasPrevious ? (
          <PaginationItem>
            {/* A REAL `<a href>` with a client-side intercept: right-click/open-in-new-tab and the
                screen-reader link role both survive, and an ordinary click does not reload the
                document. `href="#"` would be a lie about where it goes, so the FIRST page's own
                address is what it points at. */}
            <PaginationPrevious
              href="?"
              text={t("previousPage")}
              aria-label={t("previousPage")}
              onClick={(e) => {
                e.preventDefault();
                onPage(null);
              }}
            />
          </PaginationItem>
        ) : null}
        {nextCursor !== null ? (
          <PaginationItem>
            <PaginationNext
              href={`?cursor=${encodeURIComponent(nextCursor)}`}
              text={t("nextPage")}
              aria-label={t("nextPage")}
              onClick={(e) => {
                e.preventDefault();
                onPage(nextCursor);
              }}
            />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  );
}

/** A table-shaped stand-in for a KNOWN layout (appendix D row 53). Five rows, because five is what
 *  a short page looks like; it stops the instant the read settles in either direction. */
function WorkListSkeleton({ showClient }: { showClient: boolean }) {
  return (
    <div aria-hidden className="flex flex-col gap-2 rounded-lg border border-border p-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 flex-1" />
          {showClient ? <Skeleton className="hidden h-4 w-28 md:block" /> : null}
          <Skeleton className="h-5 w-20" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

function StaleBanner({ retry }: { retry: () => void }) {
  const t = useTranslations("WorkList");
  return (
    <StateBanner
      tone="warning"
      action={
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t("retry")}
        </Button>
      }
    >
      {t("staleNote")}
    </StateBanner>
  );
}

/** A permission loss names the RESTRICTION and offers no create/retry affordance that could only
 *  refuse — the governed code goes in the banner's own `code` slot, the split
 *  `components/firm/data-state.tsx` already uses for a DoorRefusal. */
function DeniedBanner({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("WorkList");
  let code: string | null = null;
  if (isDoorRefusal(error)) code = error.reason ? `${error.code} · ${error.reason}` : error.code;
  else if (isDoorError(error)) code = error.kind;
  return (
    <StateBanner
      tone="warning"
      title={t("deniedTitle")}
      code={code}
      action={
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          {t("retry")}
        </Button>
      }
    >
      {t("deniedBody")}
    </StateBanner>
  );
}
