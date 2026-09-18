"use client";

// B3 — ONE durable Work, reread from the database on every visit.
//
// This is the page the composer sends a human to and the page a chat card links
// to, and its whole job is to be TRUE rather than reassuring. Three rules from
// the refresh spec shape everything below:
//
//   §3 "Accepted long operation": show a persistent Work link and the OBSERVED
//   state. So there is no progress bar, no percentage and no elapsed-time
//   estimate anywhere on this page — the states are the database's own status
//   words, and a queued Work says it is queued for as long as it is.
//
//   §3 "Business refusal": an inline Alert describing the concrete constraint
//   and the available next action — never a toast. A refused Work renders the
//   DB's typed reason verbatim, beside the two things a human can actually do:
//   run it again unchanged, or edit the figures into a new intent.
//
//   §3 "Refresh with known data" / "Permission change": a transient read failure
//   keeps the last DATED value with a Retry; an authority failure CLEARS the
//   protected data. Both live in `useWorkDetail`; this file renders them.
//
// WHAT THE RETRY ACTUALLY IS, since the word is doing two jobs on this screen
// and conflating them would be a real defect. RETRY THE READ re-asks the
// database and changes nothing. RETRY THE WORK asks the runtime for a NEW RUN of
// the SAME Work — same `logical_op_id`, so a replayed commit resolves the
// ORIGINAL receipt instead of posting a second entry. They are different
// controls with different words, and only the second is a write.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { AttachEvidenceDialog } from "@/components/work/attach-evidence-dialog";
import { DocumentStatePanel } from "@/components/documents/document-state-panel";
import { WorkDiagnostics } from "@/components/work/work-diagnostics";
import {
  CancelOutcome,
  CancelWorkDialog,
  TakeOverOutcome,
  TakeOverWorkAction,
} from "@/components/work/work-cancel-dialog";
import { PostedLinesTable, WorkBasisTable } from "@/components/work/work-tables";
import { StateBanner } from "@/components/common/state";
// #812
import { EgressReactivateAction } from "@/components/work/egress-reactivate-action";
// #812
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { SectionHeader } from "@/components/common/section-header";
import { MemberName } from "@/components/common/member-name";
import { useFirmScope } from "@/components/firm-scope-provider";
import { WorkPlanOriginRow } from "@/components/plans/work-plan-origin";
import { WorkAssetRow } from "@/components/registers/work-asset-row";
import { fieldForAdjustmentLineOrdinal } from "@/lib/work/periodic-adjustment";
import { roleRankOf } from "@/lib/identity/caller-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { businessDateTime } from "@/lib/business-date";
import { isUuidShape } from "@/lib/client-id";
import { readClarifyQuestion } from "@/lib/journals/governance-doors";
import { useMemberNames, type MemberNameResolver } from "@/lib/members/use-member-names";
import { WORK_NEEDS_YOU_HREF, clientBase, journalComposerHref, workDetailHref } from "@/lib/navigation/tree";
// #721 — the shortened-id treatment the product already uses for ids.
import { shortId } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  cancelWork,
  retryWork,
  takeOverWork,
  type CancelWorkResult,
  type RetryWorkResult,
  type TakeOverWorkResult,
} from "@/lib/work/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkActivityView } from "@/components/work/work-activity-view";
import { accountNames, type WorkDetailData } from "@/lib/work/reads";
import { purposeLabel } from "@/lib/work/purpose-label";
import { getWorkClaimOrigin, type WorkClaimOrigin } from "@/lib/work/staff-expense-claim-reads";
// #636 — the reverse row. NO `list_accounting_work` recut (that body is #905's and the Work-list
// projection is frozen this wave): the LIST says nothing about batches; DETAIL gets ONE line.
import { getWorkBatchOrigin, type WorkBatchOrigin } from "@/lib/documents/intake-batch";
import { listEntryLinks, type EntryLinkRow } from "@/lib/work/evidence";
import type { JournalEntryRow, JournalLineRow } from "@/lib/journals/types";
import type { OperationReceiptRow } from "@/lib/work/types";
import { useWorkDetail } from "@/lib/work/use-work-detail";
import {
  defaultDraftStorage,
  draftFromBasis,
  writeJournalDraft,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import {
  enteredBy,
  isCancellableWorkStatus,
  isRetryableWorkStatus,
  isTakeOverable,
  wasTakenOver,
  type AccountingWorkRow,
  type WorkTaskRow,
} from "@/lib/work/types";
// #721
import { RestateWorkPanel } from "@/components/work/work-restate";
// #721
import type { AgentInterruptionRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { WORK_HEADING_ID } from "@/lib/navigation/heading-ids";

/** Declared in a plain module (#733's sweep) and re-exported here: the server page renders this
 *  id and this client component focuses it, so a plain value must not cross the boundary above.
 *  See `lib/navigation/heading-ids.ts`. */
export { WORK_HEADING_ID } from "@/lib/navigation/heading-ids";

/** The status words `clara.accounting_work.status` commits to. A checked lookup,
 *  never an interpolated `t()` key: a status outside this set renders through the
 *  unknown arm with its RAW value, which is honest, rather than crashing on a
 *  missing message. Same posture V16ActCards.tsx takes for its own column. */
const KNOWN_STATUSES = [
  "queued", "running", "awaiting_input", "stopping",
  "completed", "refused", "failed", "cancelled", "expired",
] as const;

function isKnownStatus(status: string): status is (typeof KNOWN_STATUSES)[number] {
  return (KNOWN_STATUSES as readonly string[]).includes(status);
}

/** Colour is NEVER the only cue (Appendix D, Badge: "a label, never the sole
 *  action affordance or sole color cue"): every badge below carries the status
 *  WORD, and the variant only reinforces what the word already says. */
function variantForStatus(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "refused" || status === "failed") return "destructive";
  if (status === "queued" || status === "running" || status === "stopping" || status === "awaiting_input") {
    return "secondary";
  }
  return "outline";
}

export function WorkStatusBadge({ status }: { status: string }) {
  const t = useTranslations("WorkDetail");
  return <Badge variant={variantForStatus(status)}>{isKnownStatus(status) ? t(`status.${status}`) : status}</Badge>;
}

export function WorkDetail({ clientId, workId }: { clientId: string; workId: string }) {
  // THE SCOPE IS READ HERE AND NOWHERE BELOW, for the reason `JournalComposer`
  // states about `useRouter`: `useFirmScope` THROWS outside the firm layout's
  // provider, so a View that called it could not be mounted by a node cell at
  // all. The wrapper owns the context read; the View takes a plain value.
  const scope = useFirmScope();
  return (
    <WorkDetailView
      clientId={clientId}
      workId={workId}
      scope={{ firmId: scope.firm_id, userId: scope.user_id, roleRank: scope.role_rank }}
    />
  );
}

/** Exported with its seams open for the cells: `load` replaces the RLS reader,
 *  `now` the staleness clock, `retry` the runtime write, `storage` the
 *  composer's draft store. Production passes none of them. */
export function WorkDetailView({
  clientId,
  workId,
  load,
  now,
  retry = retryWork,
  cancel = cancelWork,
  takeOver = takeOverWork,
  session = sessionTokenAccessor,
  scope,
  storage,
  loadLinks = listEntryLinks,
  loadClaimOrigin = getWorkClaimOrigin,
  loadBatchOrigin = getWorkBatchOrigin, // #636
}: {
  clientId: string;
  workId: string;
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  now?: () => number;
  retry?: typeof retryWork;
  /** #630 — the two runtime writes this page adds, open as seams for the same reason `retry` is:
   *  a cell must be able to drive the DECISION without a socket. */
  cancel?: typeof cancelWork;
  takeOver?: typeof takeOverWork;
  session?: SessionTokenAccessor;
  /** #634 — the entry's CURRENT source, Work, receipt and correction chain, read
   *  through `clara.list_entry_links`. Separate from `load` because it is read
   *  again after every late attachment (hydrate-never-trust) while the Work
   *  itself has not moved. */
  loadLinks?: typeof listEntryLinks;
  /** #638 — WHAT THIS WORK ACTUALLY IS, when its purpose cannot say. A staff expense claim is
   *  admitted with purpose `journal_entry` (the vocabulary is deliberately unwidened — migration
   *  0221's header states why a fourth purpose cannot post), so labelling by purpose alone would
   *  call a claim "Journal entry" and stop. `clara.get_work_claim_origin` answers NULL for every
   *  Work that is not a claim, so this read costs one round trip and never invents an origin. */
  loadClaimOrigin?: typeof getWorkClaimOrigin;
  loadBatchOrigin?: typeof getWorkBatchOrigin; // #636
  /** WHO is reading, for the composer draft "Edit as a new draft" seeds. Both
   *  halves are optional and a MISSING half means no seeding at all — a draft
   *  filed under a guessed scope is worse than a draft that was never saved
   *  (lib/work/journal-draft.ts's own rule). */
  scope?: {
    firmId?: string;
    userId?: string;
    /**
     * #630 (review) — THE READER'S RANK, from `clara.caller_context`'s own `role_rank` (the
     * DATABASE's answer, never re-derived from the role's spelling). Both new controls are
     * DESTRUCTIVE or authority-moving and both doors floor at bookkeeper, so a viewer or clerk is
     * offered neither: the press could only land on a 403. Absent rank fails closed.
     */
    roleRank?: number | null;
  };
  storage?: DraftStorage | null;
}) {
  const t = useTranslations("WorkDetail");
  // #641 — #634's `ManualJournal` copy moved down into `PostedEntrySection` with the markup that
  // uses it, now that the posted block lives inside the Results tab panel rather than in this
  // render body.
  // A MALFORMED WORK ID IS A NOT-FOUND QUESTION, NOT A DATABASE ONE — the same
  // rule lib/client-id.ts states for the client segment, applied to this one.
  // Checked HERE as well as inside the reader: this is what stops the hook from
  // even being armed for an address that cannot name a Work.
  const addressable = isUuidShape(workId);
  const state = useWorkDetail({
    clientId,
    workId,
    now,
    load: addressable ? load : async () => null,
  });
  const [retryState, setRetryState] = useState<RetryWorkResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  /** #630 — THE CANCEL'S ANSWER LIVES HERE, not inside the dialog, because the dialog's own
   *  trigger unmounts the moment the Work leaves a cancellable status — which is exactly when the
   *  answer matters most (the `already_completed` arm carries the receipt and the entry link). */
  const [cancelState, setCancelState] = useState<CancelWorkResult | null>(null);
  /** #630 (review) — see the action bar below: an open decision outlives a status change the
   *  three-second poll observes, so the dialog is not unmounted while a person is inside it. */
  const [cancelOpen, setCancelOpen] = useState(false);
  /** #630 — and the takeover's, for the same reason: an accepted takeover makes the Work `queued`
   *  and the offer that produced the answer unmounts with it. */
  const [takeOverState, setTakeOverState] = useState<TakeOverWorkResult | null>(null);
  /** #634 — the posted entry's links row, or null while unread / unreadable. A
   *  failed links read NEVER blocks the page: the entry, its lines and its
   *  receipt are the database's own and stay on screen; only the source line
   *  degrades to "we could not read it". */
  const [links, setLinks] = useState<EntryLinkRow | null>(null);
  /** THE THIRD STATE, and it is an ACCOUNTING fact that needs it. Without this,
   *  a links read that FAILED rendered exactly like one that succeeded and found
   *  nothing — the page said "No document" about an entry whose source it had
   *  simply been unable to read, and offered "Attach evidence" on the strength of
   *  that guess. The journals workbench already carries this distinction
   *  (`journals-workbench.tsx`'s own `linksUnavailable`); this page now does too. */
  const [linksUnavailable, setLinksUnavailable] = useState(false);
  /** #638 — the claim this Work carries, or null. A FAILED read is indistinguishable from "not a
   *  claim" on purpose: both leave the line absent, and the page never says a Work is NOT a claim,
   *  only that it IS one. Nothing on this page is blocked by it. */
  const [claimOrigin, setClaimOrigin] = useState<WorkClaimOrigin | null>(null);
  useEffect(() => {
    if (!addressable) return;
    let live = true;
    void (async () => {
      const origin = await loadClaimOrigin(workId, { session }).catch(() => null);
      if (live) setClaimOrigin(origin);
    })();
    return () => {
      live = false;
    };
  }, [addressable, workId, loadClaimOrigin, session]);
  /** #636 — the batch this Work belongs to, or null. Read under the caller's OWN JWT through the
   *  relation's FORCE-RLS grant, the same shape `entry_evidence_links` is read with. A FAILED read
   *  is indistinguishable from "not in a batch" on purpose: both leave the row absent, and the page
   *  never says a Work is NOT in a batch, only that it IS in one. Nothing here is blocked by it. */
  const [batchOrigin, setBatchOrigin] = useState<WorkBatchOrigin | null>(null);
  useEffect(() => {
    if (!addressable) return;
    let live = true;
    void (async () => {
      const origin = await loadBatchOrigin(workId, { session }).catch(() => null);
      if (live) setBatchOrigin(origin);
    })();
    return () => { live = false; };
  }, [addressable, workId, loadBatchOrigin, session]);

  const postedEntryId = state.data?.entry?.id ?? null;
  const reloadLinks = useCallback(async () => {
    if (postedEntryId === null) return;
    try {
      const rows = await loadLinks(clientId, [postedEntryId], { session });
      setLinks(rows.find((row) => row.entry_id === postedEntryId) ?? null);
      setLinksUnavailable(false);
    } catch {
      // The LAST KNOWN row is kept (§3's "refresh with known data"), and the
      // flag is what stops the page asserting an absence it did not read.
      setLinksUnavailable(true);
    }
  }, [clientId, postedEntryId, loadLinks, session]);
  useEffect(() => {
    void reloadLinks();
  }, [reloadLinks]);
  // ONE ROSTER READ PER MOUNT, held at the page level exactly as
  // lib/members/use-member-names.ts asks: this page names one actor, and a
  // failed read falls through to the shortened raw id rather than to a guess.
  const memberNames = useMemberNames(session);

  // FOCUS THE HEADING ON ARRIVAL (§4). Once, on mount — a background poll that
  // changes the status must never steal focus from whatever the human is
  // reading, which is why this effect has no dependency on the data.
  //
  // A LOOKUP AND NOT A REF, uniquely on this page: the `<h1>` is rendered by the
  // SERVER component above (`PageHeader`, so the product keeps one page-title
  // treatment), and a client component cannot hold a ref to an element it does
  // not render. The id is exported from this module so the two sides cannot
  // drift. Both the presence of `document` and of `getElementById` are checked,
  // because a component must not crash where either is absent.
  useEffect(() => {
    const doc: { getElementById?: (id: string) => { focus?: () => void } | null } | undefined =
      typeof document === "undefined" ? undefined : document;
    if (typeof doc?.getElementById !== "function") return;
    doc.getElementById(WORK_HEADING_ID)?.focus?.();
  }, []);

  if (!addressable || state.notFound) {
    return (
      <StateBanner tone="neutral" title={t("notFound.title")}>
        {t("notFound.body")}
      </StateBanner>
    );
  }

  const denied = state.failure !== null && (state.failure.kind === "forbidden" || state.failure.kind === "no_session");
  if (denied) {
    return (
      <StateBanner tone="warning" title={t("denied.title")}>
        {t("denied.body")}
      </StateBanner>
    );
  }

  if (state.data === null) {
    if (state.failure !== null) {
      return (
        <StateBanner
          tone="error"
          title={t("readFailed.title")}
          code={state.failure.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void state.reload()}>
              {t("retryRead")}
            </Button>
          }
        >
          {t("readFailed.body")}
        </StateBanner>
      );
    }
    // The one place a Skeleton is right (Appendix D): the final layout IS known
    // — a facts block over a four-column money grid — and no prior data can
    // remain on screen, because there is none yet.
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">
          {t("loading")}
        </span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { work, task, entry, lines, receipts, accounts, interruption } = state.data;
  const names = accountNames(accounts);
  const committed = receipts.find((r) => r.outcome === "committed") ?? null;
  const canRetry = isRetryableWorkStatus(work.status);
  // #630 — the two acts this ticket adds. Both are OFFERS, not judgements: the doors recheck the
  // caller's live role and the Work's own state and refuse verbatim when they disagree (the same
  // posture `canRetry` states above). `stopping` is deliberately NOT cancellable — an admitted
  // operation is settling and a second press could only answer `already_stopping`.
  const bookkeeperPlus = typeof scope?.roleRank === "number" && scope.roleRank >= roleRankOf("bookkeeper");
  // #812 — the recovery action on the egress face is an OWNER act, and the rank is the
  // DATABASE's own `role_rank` (never re-derived from the role's spelling). Absent rank fails
  // closed, exactly as `bookkeeperPlus` does.
  const ownerHere = typeof scope?.roleRank === "number" && scope.roleRank >= roleRankOf("owner");
  const canCancel = bookkeeperPlus && isCancellableWorkStatus(work.status);
  const canTakeOver = bookkeeperPlus && isTakeOverable(work);

  // THE DRAFT SCOPE, or null — the same three-part key the composer files under,
  // built from the same two context fields. Null when either is missing, which
  // is what makes "Edit as a new draft" fall back to an ordinary link to an
  // empty form rather than promising a seeding it cannot deliver.
  const draftScope: JournalDraftScope | null =
    scope?.firmId && scope?.userId ? { userId: scope.userId, firmId: scope.firmId, clientId } : null;
  const store = storage === undefined ? defaultDraftStorage() : storage;

  /**
   * SEEDS THE COMPOSER FROM THIS WORK'S OWN BASIS, and it is a WRITE to another
   * surface's persistence rather than a navigation trick — which is why it is
   * here, next to the row it copies, rather than in the composer, which would
   * otherwise have to learn how to read a Work.
   *
   * IT MINTS A NEW `intentKey` (`draftFromBasis` does, and its header says why):
   * running the SAME figures again is `/retry` on this Work, and editing them
   * into different ones is a DIFFERENT economic intent. Carrying the old key
   * would make the database answer `intent_payload_conflict` to a human who did
   * exactly what the link told them to.
   *
   * IT RUNS BEFORE THE NAVIGATION, on the click, because the composer restores
   * its draft in a lazy `useState` initialiser — i.e. before its first paint. A
   * write that happened after the route change would arrive too late to be read.
   */
  const seedDraft = () => {
    if (draftScope === null || work.basis === null) return;
    writeJournalDraft(draftScope, draftFromBasis(work.basis), store);
  };

  const runRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryState(null);
    // A FRESH op key per press: two presses must not queue two runs, and a
    // genuine second attempt after a failure must not be swallowed as a
    // duplicate of the first.
    const result = await retry(session, { workId: work.id, opKey: crypto.randomUUID() });
    setRetryState(result);
    setRetrying(false);
    if (result.kind === "accepted") await state.reload();
  };

  // #641 — the Results panel's content, built HERE so the posted section keeps reading the same
  // page-level state it always did (`state.reload`, `session`, the links pair) while living
  // inside a Tabs panel. `null` when the Work has posted nothing yet, which the panel says in
  // words rather than rendering an empty region.
  const renderPosted =
    entry === null ? null : (
      <PostedEntrySection
        clientId={clientId}
        entry={entry}
        lines={lines}
        names={names}
        links={links}
        linksUnavailable={linksUnavailable}
        committed={committed}
        reloadLinks={reloadLinks}
        claimOrigin={claimOrigin}
        batchOrigin={batchOrigin}
        reloadWork={() => state.reload()}
        session={session}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <WorkFacts work={work} taskStatus={task?.status ?? null} members={memberNames} clientId={clientId} />

      {/* DELAYED IS ABOUT THE READ, not about the Work. It says the page has not
          managed a successful read since a named time, which is a fact about the
          connection — never "the Work is slow", which would be a fabricated
          judgement about a run that may be perfectly healthy. */}
      {state.delayed && state.readAt !== null ? (
        <StateBanner
          tone="warning"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void state.reload()}>
              {t("retryRead")}
            </Button>
          }
        >
          {t("delayedSince", { at: businessDateTime(new Date(state.readAt)) })}
        </StateBanner>
      ) : null}

      {/* A read failure over KNOWN data keeps the data and dates it. */}
      {state.failure !== null ? (
        <StateBanner
          tone="error"
          code={state.failure.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void state.reload()}>
              {t("retryRead")}
            </Button>
          }
        >
          {state.readAt === null
            ? t("readFailed.body")
            : t("readFailedWithData", { at: businessDateTime(new Date(state.readAt)) })}
        </StateBanner>
      ) : null}

      <WorkOutcome
        work={work}
        // #750 — the run row and the roster, so the Cancelled banner can NAME who pressed Cancel.
        task={task}
        members={memberNames}
        clientId={clientId}
        canRetry={canRetry}
        canTakeOver={canTakeOver}
        canReactivateEgress={ownerHere} /* #812 */
        retrying={retrying}
        retryState={retryState}
        onRetry={() => void runRetry()}
        onConverge={() => state.reload()}
        takeOver={takeOver}
        onTakeOverAnswer={setTakeOverState}
        session={session}
        interruption={interruption}
        accountNames={names}
        onEditAsNewDraft={seedDraft}
      />

      {/* #630 (review) — THE DESTRUCTIVE ACTION LIVES OUTSIDE EVERY STATUS ARM, at ONE fixed
          position in this tree, and that is load-bearing rather than tidy.
          MEASURED: `CancelWorkDialog` used to be handed to whichever `StateBanner` the current
          status rendered. Matching the two wrappers' tag and class was not enough — the parked arm
          passes TWO children to that slot (the Needs-you link, then the dialog) and the running arm
          passes ONE, and React reconciles a single-child slot against the FIRST existing child. The
          types differ, so the whole subtree was deleted and a fresh, CLOSED dialog mounted: the open
          modal a bookkeeper was reading vanished with no dismissal on the three-second poll's
          `awaiting_input ⇄ running` flip, focus fell to `<body>`, and a submit in flight lost its
          op key — after which `clara._reserve_op` could no longer connect the two attempts.
          Here the dialog's position among its siblings never changes, so its fiber survives every
          status the poll can report; only `canCancel` going false (a Work that genuinely settled)
          takes it away. */}
      <div key="work-action-bar" className="flex flex-wrap items-center gap-3 empty:hidden">
        {canCancel || cancelOpen ? (
          <CancelWorkDialog
            workId={work.id}
            clientId={clientId}
            onCancelled={() => state.reload()}
            onAnswer={setCancelState}
            onOpenChange={setCancelOpen}
            returnFocusTo={WORK_HEADING_ID}
            cancel={cancel}
            session={session}
          />
        ) : null}
      </div>

      {/* #630 — THE CANCEL'S OWN ANSWER, outside every status arm so it survives the status change
          that produced it. `null` renders nothing. */}
      <CancelOutcome result={cancelState} clientId={clientId} />
      <TakeOverOutcome result={takeOverState} />

      {/*
        THE BASIS STAYS OUTSIDE THE TABS, and #641 deliberately left it there rather than filing it
        under "Sources". It is the REQUEST — what this Work was admitted with, frozen, the thing a
        refusal has to be read against — so it belongs with the Work's identity rather than being
        one of three alternative views of its outcome. Four walks already read it that way
        (`journal-work-walk` alone asserts the exact cents in it on a queued Work, on a replayed
        intent, on a rotated one and at both 320 px and 200 % zoom on a COMPLETED one), and putting
        it behind a tab would have made every one of those readings conditional on opening a tab.
      */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("basisHeading")}</SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("basisNote")}</p>
        {work.basis === null ? (
          <p className="text-sm text-muted-foreground">{t("basisUnreadable")}</p>
        ) : (
          <WorkBasisTable basis={work.basis} names={names} />
        )}
      </section>

      {/*
        #641 (journey B3) — THE THREE RELATED VIEWS OF THIS ONE WORK, and they sit HERE, BELOW
        everything above, for the acceptance criterion's own reason: "Work detail keeps the current
        question above Results/Sources/Activity views". The parked question is rendered by
        `WorkOutcome` (its `awaiting_input` arm mounts `WorkQuestionPanel`), which is a sibling
        ABOVE this element in DOM order — so a person reading down the page, and a screen reader
        walking it, both meet the thing that is waiting BEFORE the three views of what has already
        happened. A Tabs strip placed above the outcome band would bury a live question behind a tab
        a person might never open.

        TABS AND NOT ROUTES (appendix C §4, appendix D row 58): these are adjacent views of ONE
        object at ONE address, not destinations. The state is LOCAL — a tab is not a filter, it
        does not change what the page is about, and writing it to the URL would put a display
        preference in the address people share. Switching a tab invokes NO WRITE.

        TWO PANELS ARE `keepMounted`, THE THIRD IS NOT, AND THE SPLIT IS THE CONTRACT'S OWN.
        Appendix C §3's draft rule: "Tabs and an explanatory Popover do not submit or discard it."
        Results holds `AttachEvidenceDialog`, whose form a person can be part-way through; Sources
        renders data this page has ALREADY loaded. Unmounting either on a tab press would throw
        away an unsent draft and re-run nothing useful, so both stay in the DOM (hidden, and
        therefore out of the accessibility tree) while they are not the current view. ACTIVITY is
        the exception: it owns its OWN paged read, and mounting it eagerly would spend a request on
        a panel nobody opened — so it mounts when it is first shown, which is what makes "opening
        Results costs nothing" true.
      */}
      <Tabs defaultValue="results" className="gap-3">
        <TabsList variant="line" aria-label={t("tabsLabel")}>
          <TabsTrigger value="results">{t("tabResults")}</TabsTrigger>
          <TabsTrigger value="sources">{t("tabSources")}</TabsTrigger>
          <TabsTrigger value="activity">{t("tabActivity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="results" keepMounted className="flex flex-col gap-6">
          {entry === null ? (
            <p className="max-w-prose text-sm text-muted-foreground">{t("noResultYet")}</p>
          ) : null}
          {renderPosted}
        </TabsContent>

        <TabsContent value="sources" keepMounted className="flex flex-col gap-2">
          {/* THE SOURCES THEMSELVES, ENUMERATED — not the one-line "is there a source at all"
              summary the identity block above already carries. `source_refs` is an ARRAY and an
              EMPTY one is the documentless case this journey is largely about, so it says so in
              words: a Work admitted on a person's own figures is a legitimate state, not a gap. */}
          <SectionHeader level={2}>{t("sourcesHeading")}</SectionHeader>
          <p className="max-w-prose text-sm text-muted-foreground">{t("sourcesNote")}</p>
          {/* ITS OWN WORDS, never the identity block's. Reusing `noSourceDocument` here printed the
              SAME sentence twice on one page — a second place to read the same fact, and a strict
              locator collision that a walk caught within the hour. The block above answers
              "is there a source"; this answers "what is in this view, and why is that all right". */}
          {work.source_refs === null || work.source_refs.length === 0 ? (
            <p className="max-w-prose text-sm text-muted-foreground">{t("sourcesEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-4 text-sm">
              {work.source_refs.map((ref, i) => {
                // #624 AC4 — "Documents AND Work show the four states". A source document named
                // here is the SAME document the Documents workbench shows, so it gets the SAME
                // four named states from the SAME read: `DocumentStatePanel` over
                // `clara.get_document_state` (lib/documents/reads.ts). NO NEW DOOR and no second
                // vocabulary — a Work that cites a document Clara derived nothing from must not
                // read differently here from how it reads on the Documents tab.
                //
                // THE ID IS SHAPE-CHECKED FIRST, the same guard this page already applies to its
                // own `workId`: `p_document` is a `uuid` parameter, so a malformed value is a
                // PostgREST 400/22P02 that throws out of the loader rather than an honest state.
                // A `document` ref that names nothing usable therefore says so in words.
                const documentId = ref.kind === "document" ? (ref.document_id ?? null) : null;
                const readable = documentId !== null && isUuidShape(documentId);
                return (
                  <li key={`${ref.kind}-${i}`} className="flex flex-col gap-2 text-foreground wrap-anywhere">
                    {/* ONE LINE PER REF, in its OWN words — again not the identity block's. The
                        summary above answers "was there a source"; this names WHAT each one is, and
                        the unknown arm prints the database's own `kind` token rather than inventing
                        a label for a vocabulary this build has not learned. */}
                    <span>
                      {ref.kind === "chat_task" || ref.kind === "clara_chat"
                        ? t("sourceRefChat")
                        : ref.kind === "document"
                          ? t("sourceRefDocument")
                          : t("sourceRefUnknown", { kind: ref.kind })}
                    </span>
                    {ref.kind !== "document" ? null : readable ? (
                      <DocumentStatePanel documentId={documentId!} clientId={clientId} session={session} />
                    ) : (
                      <p className="max-w-prose text-sm text-muted-foreground">{t("sourceDocumentUnidentified")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity" className="flex flex-col gap-6">
          <WorkActivityView clientId={clientId} workId={work.id} />
          {/* #631 — THE DIAGNOSTICS SECTION, mounted in ONE line. Everything it does lives in
              components/work/work-diagnostics.tsx; #631 wrote the mount beneath the identity block
              because #641 was restructuring this file into Tabs on another branch at the same time,
              and said in that comment that integration moves it inside the Activity tab. This is
              that move: "what actually ran" belongs beside the Work's own activity log, not above
              the outcome band. The tab is NOT `keepMounted`, so the trace read fires when a reader
              opens Activity and not on every Work detail visit — and a tab switch is still a READ,
              never a write. */}
          <WorkDiagnostics workId={work.id} session={session} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** #641 — the posted-entry section, lifted out of the render body UNCHANGED so it can live inside
 *  the Results tab panel without the tab strip's markup swallowing its own `<section>`. */
function PostedEntrySection({
  clientId,
  entry,
  lines,
  names,
  links,
  linksUnavailable,
  committed,
  reloadLinks,
  claimOrigin,
  batchOrigin,
  reloadWork,
  session,
}: {
  clientId: string;
  entry: JournalEntryRow;
  lines: JournalLineRow[];
  names: ReadonlyMap<string, string>;
  links: EntryLinkRow | null;
  linksUnavailable: boolean;
  committed: OperationReceiptRow | null;
  reloadLinks: () => Promise<unknown>;
  claimOrigin: WorkClaimOrigin | null;
  batchOrigin: WorkBatchOrigin | null;
  reloadWork: () => Promise<unknown>;
  session: SessionTokenAccessor;
}) {
  const t = useTranslations("WorkDetail");
  const tm = useTranslations("ManualJournal");
  /** #638's own copy, for the one line that names a claim. */
  const tsec = useTranslations("StaffExpenseClaim");
  return (
        <section className="flex flex-col gap-2">
          <SectionHeader
            level={2}
            action={
              <Link
                href={`/clients/${encodeURIComponent(clientId)}/journals`}
                className="text-sm font-medium text-primary underline underline-offset-2"
              >
                {t("viewInJournals")}
              </Link>
            }
          >
            {t("postedHeading")}
          </SectionHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t("entryStatus")}</dt>
            <dd className="text-foreground">{entry.status}</dd>
            {/* #634 — THE ENTRY'S SOURCE, read back from the database rather than
                inferred from what was submitted: a document may have been
                attached LATE, after this Work finished, and the honest answer to
                "what backs this entry" is whatever the link relation says NOW.
                "No document" is written in words rather than left as an empty
                slot — an entry recorded without evidence is a legitimate state
                of this journey, not a gap. */}
            <dt className="text-muted-foreground">{tm("links.source")}</dt>
            <dd className="wrap-anywhere text-foreground">
              {linksUnavailable && links === null
                ? tm("links.unavailable")
                : (links?.document_id ?? tm("links.noSource"))}
            </dd>
            {/* #634 — WHAT KIND OF WORK THIS WAS. `accounting_work.purpose` is
                read on every one of this journey's surfaces and was rendered on
                none of them. #643 widened the vocabulary to three, so the
                mapping moved into `lib/work/purpose-label.ts` and is shared with
                the journals row; an unknown one still renders VERBATIM rather
                than crashing on a missing message key, exactly as `basis_origin`
                does above. */}
            {links?.purpose == null ? null : (
              <>
                <dt className="text-muted-foreground">{tm("links.purpose")}</dt>
                <dd className="text-foreground">{purposeLabel(links.purpose, tm, "links.purpose")}</dd>
              </>
            )}
            {/* #638 — WHAT THIS WORK IS, when the purpose cannot say it. A staff expense claim is
                a `journal_entry` Work by design, so the line above correctly reads "Journal entry"
                and this one names the claim: whose it is, how it was settled, and how much. The
                door answers NULL for every Work that is not a claim, so the line is simply absent
                rather than empty. */}
            {claimOrigin === null ? null : (
              <>
                <dt className="text-muted-foreground">{tsec("origin.label")}</dt>
                <dd className="text-foreground" data-testid="work-claim-origin">
                  {tsec("origin.value", {
                    claimant: claimOrigin.claimant_label,
                    settlement: tsec(`settlement.options.${claimOrigin.settlement}`),
                  })}
                </dd>
              </>
            )}
            {/* #636 — ONE row, and the started-vs-posted divergence is STATED rather than fixed.
                The batch card's `admitted` facet counts Work that has been ADMITTED; its `settled`
                facet counts Work that holds a COMMITTED receipt. Those are different numbers on
                purpose, and #905 (not this ticket) owns the Work-list projection that would
                otherwise have to agree with them. */}
            {batchOrigin === null ? null : (
              <>
                <dt className="text-muted-foreground">{t("batchOrigin.label")}</dt>
                <dd className="text-foreground" data-testid="work-batch-origin">
                  <Link href={`${clientBase(clientId)}/documents?batch=${batchOrigin.batchId}`} className="underline">
                    {t("batchOrigin.value", { label: batchOrigin.label ?? batchOrigin.batchId })}
                  </Link>
                </dd>
              </>
            )}
            {committed === null ? null : (
              <>
                <dt className="text-muted-foreground">{t("receiptId")}</dt>
                <dd className="wrap-anywhere text-foreground">{committed.id}</dd>
                <dt className="text-muted-foreground">{t("receiptVia")}</dt>
                <dd className="text-foreground">{committed.via_wake_kind}</dd>
              </>
            )}
          </dl>
          {/* THE LATE DOOR, offered only where it can actually do something: a
              POSTED entry, not yet reversed, whose links we SUCCESSFULLY READ and
              which carries no source. It is an act on the ENTRY, so it lives
              beside the entry rather than in the Work's identity block, and it
              has NO financial effect — see the dialog's header.
              GATED ON A SUCCESSFUL READ. Offering it because a read FAILED would
              be inviting a human into a door that answers
              `evidence_already_attached` — the affordance asserting an absence
              nobody established. A reversed entry is excluded for the database's
              own reason (0182 refuses `entry_reversed`): the source belongs on
              the entry that replaced this one. */}
          {entry.status === "approved" && !linksUnavailable && links !== null
            && links.document_id === null && links.reversed_by === null ? (
            <div>
              <AttachEvidenceDialog
                clientId={clientId}
                entryId={entry.id}
                expectedRevision={entry.revision_token ?? ""}
                onAttached={async () => {
                  await Promise.all([reloadLinks(), reloadWork()]);
                }}
                session={session}
              />
            </div>
          ) : null}
          <PostedLinesTable lines={lines} names={names} />
        </section>
  );
}


/** #639 — the Work's own posted entry, read from `result` without trusting its shape. The column
 *  is jsonb and a Work that has not posted carries none, so this narrows rather than casts. */
function workResultEntryId(work: AccountingWorkRow): string | null {
  const result = work.result as { entry_id?: unknown } | null | undefined;
  const id = result?.entry_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** The identity block: what this Work IS, who asked for it, on what basis, and
 *  which frozen bundle ran it. Every value is a column; nothing is derived. */
function WorkFacts({
  work,
  taskStatus,
  members,
  clientId,
}: {
  work: AccountingWorkRow;
  taskStatus: string | null;
  members: MemberNameResolver;
  /** #721 — the scope both supersession links are built in. */
  clientId: string;
}) {
  const t = useTranslations("WorkDetail");
  /** #630 — the handover row's own word. */
  const tc = useTranslations("WorkCancel");
  /** #721 — the restatement's own words, in the namespace the panel reads them from. */
  const tr = useTranslations("WorkRestate");
  /** #643 — the purpose's own noun, read from the SAME namespace the result block reads it from
   *  so one page cannot label one row two ways. */
  const tm = useTranslations("ManualJournal");
  const documentless = Array.isArray(work.source_refs) && work.source_refs.length === 0;
  const chatRef = (work.source_refs ?? []).find((ref) => ref.kind === "chat_task") ?? null;
  const bundleId = work.bundle?.id ?? null;
  const bundleDigest = work.bundle?.digest ?? null;
  // `basis_origin` IS A CHECKED LOOKUP, never an interpolated `t()` key: 0178's
  // CHECK admits two values today and later purposes may widen it, and a value
  // outside the pair renders VERBATIM rather than crashing on a missing message.
  const knownOrigin = work.basis_origin === "user_direct" || work.basis_origin === "clara_interpreted";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <WorkStatusBadge status={work.status} />
        {/* The RUN's own status, when it differs from the Work's. Two records,
            two truths: the Work is the durable object, the task is the attempt.
            Shown side by side rather than merged, so "the Work is queued but its
            task already failed" is legible instead of contradictory. */}
        {taskStatus !== null && taskStatus !== work.status ? (
          <span className="text-xs text-muted-foreground">{t("runStatus", { status: taskStatus })}</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("purpose")}</dt>
        {/* #643 — THE SAME LABEL THE RESULT BLOCK SHOWS. It rendered the raw column value, so one
            page said "Periodic stock adjustment" in one place and `periodic_stock_adjustment` in
            another about the same row. */}
        <dd className="text-foreground">{purposeLabel(work.purpose, tm, "links.purpose")}</dd>
        {/* #640 — "From plan <purpose>", and ONLY when this Work was initiated by an accounting
            plan's due event. The component renders nothing otherwise; see its own header. */}
        <WorkPlanOriginRow clientId={work.client_id} workId={work.id} />
        {/* #639 — the fixed asset this Work registered, and ONLY when it registered one. Derived
            from the posted entry through the register's own viewer-floored read; the component
            renders nothing otherwise. See its own header. */}
        <WorkAssetRow clientId={work.client_id} entryId={workResultEntryId(work)} />
        <dt className="text-muted-foreground">{t("submittedAt")}</dt>
        <dd className="text-foreground">{work.created_at === null ? "—" : businessDateTime(work.created_at)}</dd>
        <dt className="text-muted-foreground">{t("initiatorRole")}</dt>
        {/* The role AT ADMISSION, labelled as a snapshot. The commit rechecks the
            initiator's LIVE membership, so this is history and must never read
            as a current permission. */}
        <dd className="text-foreground">{t("roleAtAdmission", { role: work.initiator_role })}</dd>
        {/* #630 — WHO IS ANSWERABLE NOW, and it appears ONLY when it has moved. A row that always
            said "responsible: <the person who asked>" would be noise on every Work; a row that
            appears the moment the two diverge is the fact a reader actually needs, and it is the
            only place the handover is visible on this page. `initiator_role` above stays an
            ADMISSION snapshot and therefore still describes the person who asked. */}
        {wasTakenOver(work) ? (
          <>
            <dt className="text-muted-foreground">{tc("responsibleNow")}</dt>
            <dd className="text-foreground">
              <MemberName userId={work.initiator} resolver={members} showRole={false} />
            </dd>
          </>
        ) : null}
        {/* #721 — BOTH WAYS, and only when there is something to point at. A restatement makes two
            Works one story: the retired instruction and the one that replaced it. A reader who
            lands on either half must be able to reach the other, because a refusal or a receipt is
            only readable against the basis that was actually admitted. */}
        {typeof work.supersedes === "string" && work.supersedes !== "" ? (
          <>
            <dt className="text-muted-foreground">{tr("supersedesLabel")}</dt>
            <dd className="text-foreground">
              <Link href={workDetailHref(clientId, work.supersedes)}
                    className="font-medium text-primary underline underline-offset-2">
                {tr("supersedesLink", { id: shortId(work.supersedes) })}
              </Link>
            </dd>
          </>
        ) : null}
        {typeof work.superseded_by === "string" && work.superseded_by !== "" ? (
          <>
            <dt className="text-muted-foreground">{tr("supersededByLabel")}</dt>
            <dd className="text-foreground">
              <Link href={workDetailHref(clientId, work.superseded_by)}
                    className="font-medium text-primary underline underline-offset-2">
                {tr("supersededByLink", { id: shortId(work.superseded_by) })}
              </Link>
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t("source")}</dt>
        <dd className="text-foreground">
          {documentless
            ? t("noSourceDocument")
            : chatRef !== null
              ? t("fromClaraConversation")
              : t("sourceOther")}
        </dd>
        {/* WHERE THE FIGURES CAME FROM — a column of the row, and a different
            question from "was there a document". `source_refs` says what this
            Work points at; `basis_origin` says who composed the numbers, and the
            two can disagree (a documentless chat-interpreted basis carries a
            chat ref and no document at all). A professional reading a posted
            entry needs to know whether a human typed these cents or a model
            interpreted them from a sentence, so the row is rendered rather than
            left in the database. */}
        <dt className="text-muted-foreground">{t("basisOriginLabel")}</dt>
        <dd className="text-foreground">
          {!knownOrigin ? (
            work.basis_origin
          ) : work.basis_origin === "user_direct" ? (
            // NAMED, not role-shaped: `initiator_role` is already its own row
            // above and is an authority SNAPSHOT. This says WHO, through the one
            // resolver the estate uses for a user id — which falls back to the
            // shortened raw id rather than guessing a name.
            <span className="inline-flex flex-wrap items-baseline gap-1">
              <span>{t("basisOrigin.userDirect")}</span>
              {/* #630 — WHO ENTERED THE FIGURES, which after a takeover is NOT who the Work now
                  runs as. `initiator` moves when a colleague takes responsibility (it is the column
                  the deploy-locked closure mints credentials on behalf of); `initiated_by` is the
                  immutable record of who asked, and it is what this line must name. */}
              <MemberName userId={enteredBy(work)} resolver={members} showRole={false} />
            </span>
          ) : (
            <span className="inline-flex flex-wrap items-baseline gap-2">
              <span>{t("basisOrigin.claraInterpreted")}</span>
              {/* THE CONVERSATION, when the row names one. There is no per-thread
                  route in this product — the rail resolves this client's own
                  thread on the client workspace — so the link goes to the
                  workspace that opens it, which is a REAL in-app path. A
                  `/threads/<id>` address would be invented. */}
              {chatRef === null ? null : (
                <Link
                  href={clientBase(encodeURIComponent(work.client_id))}
                  className="text-sm font-medium text-primary underline underline-offset-2"
                >
                  {t("basisOrigin.openConversation")}
                </Link>
              )}
            </span>
          )}
        </dd>
        {bundleId === null ? null : (
          <>
            <dt className="text-muted-foreground">{t("runVersion")}</dt>
            <dd className="wrap-anywhere text-foreground">
              {bundleDigest === null ? bundleId : `${bundleId} · ${bundleDigest.slice(0, 12)}`}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

/** #799 — THE COMMIT-TIME `unknown_account` REFUSAL'S SENTENCE SHAPE, as one exported constant.
 *
 *  THE COUPLING THIS NAMES. The refusal's payload is frozen (`detail` carries the reason and the
 *  account code, never the line ordinal), so the ordinal exists only inside the database's own
 *  English prose. That is a design decision, not an oversight — but it makes this regex a SECOND
 *  place a rule lives, and the first place is SQL: `_record_journal_entry_core` step 6,
 *  `raise exception 'line % codes to an account this client does not have active: %'`
 *  (`packages/db/migrations/0204_record_journal_entry_core_reversal_liveness.sql:545`, carried
 *  verbatim from 0178/0182/0184/0194/0195).
 *
 *  SO THE TWO ARE PINNED TOGETHER RATHER THAN LEFT TO AGREE BY LUCK. The db cell
 *  `w799.post.unknown-account-sentence` (`packages/db/tests/work-journal-post.test.mjs`) reads the
 *  INSTALLED body out of `pg_proc` and asserts it still raises exactly this prefix. A future
 *  migration that rewords the sentence therefore REDS THAT CELL instead of silently turning this
 *  affordance off with every web test still green — which is the failure mode the review named.
 *  Exported so the web tests spell it once, here, rather than re-typing the prose a third time. */
export const UNKNOWN_ACCOUNT_LINE_SENTENCE = /^line\s+(\d+)\s+codes to an account/i;

/** The ordinal itself. `fieldForAdjustmentLineOrdinal` takes it from here, together with the
 *  Work's own `purpose`/`basis.lines`, and resolves the leg; the sentence is never rewritten,
 *  reordered or replaced by this parse — the database's words are always rendered whole. `null`
 *  for anything that does not open with "line N codes to an account". */
function unknownAccountLineOrdinal(message: string | null | undefined): number | null {
  if (typeof message !== "string") return null;
  const match = UNKNOWN_ACCOUNT_LINE_SENTENCE.exec(message.trim());
  if (!match) return null;
  const ordinal = Number(match[1]);
  return Number.isInteger(ordinal) && ordinal >= 1 ? ordinal : null;
}

/** The state-specific band: what is happening, and what a human may do next. */
function WorkOutcome({
  work,
  clientId,
  canRetry,
  canTakeOver,
  // #812
  canReactivateEgress,
  // #812
  retrying,
  retryState,
  onRetry,
  onConverge,
  takeOver,
  onTakeOverAnswer,
  session,
  interruption,
  accountNames,
  onEditAsNewDraft,
  task,
  members,
}: {
  work: AccountingWorkRow;
  clientId: string;
  canRetry: boolean;
  /** #630 — whether "Take responsibility" is worth offering for this refusal. */
  canTakeOver: boolean;
  // #812
  /** #812 — whether the OWNER-only "Re-activate AI processing for this client" action is offered
   *  on the `egress_not_authorized` face. The door floors at owner; anyone else would only ever
   *  read its CLR04. */
  canReactivateEgress: boolean;
  // #812
  retrying: boolean;
  retryState: RetryWorkResult | null;
  onRetry: () => void;
  /** RE-READ THE WORK. Called after every completed cancel or takeover attempt, refusal included:
   *  this component paints nothing it was not told by a fresh read, and the 3-second poll keeps
   *  converging on `stopping` → terminal afterwards. */
  onConverge: () => void | Promise<void>;
  takeOver: typeof takeOverWork;
  onTakeOverAnswer: (result: TakeOverWorkResult) => void;
  session: SessionTokenAccessor;
  /** The row this Work is parked on, when it is parked and visible. */
  interruption: AgentInterruptionRow | null;
  /** #630 — account code → name, so the takeover's confirm step can render the BASIS it asks a
   *  colleague to take responsibility for rather than a digest of it. */
  accountNames: ReadonlyMap<string, string>;
  /** Writes the composer's draft from this basis, before the link navigates. */
  onEditAsNewDraft: () => void;
  // #750 — THE CANCELLING AUTHOR REACHES THIS COMPONENT THROUGH THE RUN, and no further. The
  // database records the press on `clara.agent_tasks.cancelled_by/cancelled_at` (0184 §G), which
  // the masked view this page already reads republishes; the Work row carries no such column. So
  // the banner names the person from the row the page HAD, rather than through a new door.
  task: WorkTaskRow | null;
  members: MemberNameResolver;
}) {
  const t = useTranslations("WorkDetail");
  const tc = useTranslations("WorkCancel");
  const tAdj = useTranslations("PeriodicAdjustment");

  // #630 (review) — "Cancel Work" IS NOT RENDERED HERE, deliberately. It lives in the detail view's
  // own action bar, at one position that no status change moves, because a control mounted inside a
  // status arm is a control the next poll can destroy mid-decision. This component renders what the
  // status MEANS; the act belongs to the page.

  const retryButton = canRetry ? (
    <Button type="button" variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
      {retrying ? t("retryingWork") : t("retryWork")}
    </Button>
  ) : undefined;

  // "EDIT AS A NEW DRAFT" IS STILL A LINK, and it now SEEDS the form it opens.
  //
  // A LINK RATHER THAN A BUTTON because the destination is a page: the address
  // bar, the middle click and the back button all have to keep working, and a
  // `router.push` behind a button takes all three away. The seeding rides the
  // click handler, which fires before the navigation — see `seedDraft` at the
  // call site for why the ORDER is the whole mechanism.
  //
  // WHAT IT MEANS WHEN THERE IS NO SCOPE OR NO BASIS: the handler writes nothing
  // and the human lands on an empty composer, which is the behaviour this control
  // had before it could seed at all. Never a half-copied basis.
  const editLink = (
    <Link
      href={journalComposerHref(clientId)}
      onClick={onEditAsNewDraft}
      className="text-sm font-medium text-primary underline underline-offset-2"
    >
      {t("editAsNewDraft")}
    </Link>
  );

  const retryNotice =
    retryState === null || retryState.kind === "accepted" ? null : (
      <StateBanner tone="error" code={retryState.kind === "not_retryable" ? (retryState.status ?? undefined) : undefined}>
        {retryState.kind === "not_retryable"
          ? t("retryRefused")
          : retryState.kind === "denied"
            ? t("denied.body")
            : retryState.kind === "not_found"
              ? t("notFound.body")
              : t("retryUnavailable")}
      </StateBanner>
    );

  if (work.status === "refused") {
    const error = work.error ?? {};
    // #631 — THE ONE REFUSAL WITH ITS OWN FACE, and the reason it has one is that the database's
    // own sentence is addressed to the wrong person. Every other refusal on this screen names a
    // constraint a PREPARER can act on (a closed period, an absent account, a control leg). This
    // one names a firm-level authority: Clara is not currently authorised to use a model on this
    // client's books, and only an OWNER can restore it — by accepting the current Terms and Data
    // Processing Agreement, and by making sure the client is active.
    //
    // IT NAMES NO PROVIDER, and that is the acceptance line rather than a style choice: "revoked,
    // exhausted or wrong-purpose authorization yields a typed non-retryable Work state WITHOUT
    // provider disclosure". No vendor, no model id, no internal token beyond the typed reason the
    // banner already shows as its `code`.
    //
    // THE DATABASE'S MESSAGE IS STILL SHOWN, underneath, because a refusal is a receipt and this
    // lane never replaces one with a paraphrase. What the face adds is WHO can fix it.
    const egressRefused = error.reason === "egress_not_authorized";
    // #799 — A COMMIT-TIME `unknown_account` REFUSAL NAMES ONLY A BARE LINE ORDINAL
    // ("line 2 codes to an account…"), because the chart-of-accounts check that raises it runs
    // against the Work's already-admitted `basis.lines`, not against the periodic-adjustment
    // form. `fieldForAdjustmentLineOrdinal` resolves that ordinal, together with this Work's own
    // `purpose` and `basis.lines`, back to the adjustment field that produced it — `null` for a
    // `journal_entry` Work, a different refusal reason, an ordinal past the basis, or any other
    // shape, in which case the generic line reference stays the whole, honest disclosure.
    const unknownAccountField =
      error.reason === "unknown_account"
        ? fieldForAdjustmentLineOrdinal(
            unknownAccountLineOrdinal(error.message) ?? -1,
            work.purpose,
            work.basis?.lines ?? null,
          )
        : null;
    return (
      <div className="flex flex-col gap-2">
        {/* #630 — THE ONE REFUSAL A COLLEAGUE CAN RESCUE. Above the refusal rather than inside it:
            the refusal is the database's own words about what happened, and this is a different
            thing entirely — an offer to somebody else. */}
        {canTakeOver ? (
          <TakeOverWorkAction
            workId={work.id}
            basisOrigin={work.basis_origin}
            basisDigest={work.basis_digest}
            basis={work.basis}
            accountNames={accountNames}
            onTakenOver={onConverge}
            onAnswer={onTakeOverAnswer}
            returnFocusTo={WORK_HEADING_ID}
            takeOver={takeOver}
            session={session}
          />
        ) : null}
        <StateBanner
          tone="error"
          title={egressRefused ? t("egressNotAuthorized.title") : t("refused.title")}
          code={[error.code, error.reason].filter((v): v is string => typeof v === "string" && v !== "").join(" · ") || undefined}
          action={
            <div className="flex flex-wrap items-center gap-3">
              {retryButton}
              {editLink}
            </div>
          }
        >
          {/* #631 · WHO CAN FIX IT, first, for the one refusal whose audience is not the person
              reading the page. Then the DATABASE'S OWN words, verbatim: a refusal is a receipt; it
              is never re-worded, and the fallback sentence appears only when the row genuinely
              carries no message. */}
          {egressRefused ? (
            <span className="block">{t("egressNotAuthorized.body")}</span>
          ) : null}
          {error.message ?? t("refused.body")}
          {/* #799 — the resolved field's own form label, BESIDE the database's sentence, never
              instead of it: the sentence above is unchanged, and this only adds who can act on
              it. */}
          {unknownAccountField ? (
            <span className="block text-muted-foreground">{tAdj(unknownAccountField)}</span>
          ) : null}
          {/* #812 — …and for an OWNER, the one recovery the sentence above could not offer before:
              a paused (DEACTIVATED) purpose activation, re-activated through
              clara.reactivate_client_egress_purpose. It restores FUTURE dispatches; "Try again"
              above is what starts the new run. */}
          {egressRefused && canReactivateEgress ? (
            <EgressReactivateAction clientId={clientId} onReactivated={onConverge} />
          ) : null}
        </StateBanner>
        {retryNotice}
      </div>
    );
  }

  if (work.status === "failed" || work.status === "expired") {
    const error = work.error ?? {};
    const exhausted = error.code === "budget_exhausted";
    return (
      <div className="flex flex-col gap-2">
        <StateBanner
          tone="error"
          title={exhausted ? t("budget.title") : t("failed.title")}
          code={typeof error.code === "string" ? error.code : undefined}
          action={retryButton}
        >
          {exhausted ? t("budget.body") : (error.message ?? t("failed.body"))}
        </StateBanner>
        {retryNotice}
      </div>
    );
  }

  if (work.status === "awaiting_input") {
    // THE QUESTION ITSELF, not a sentence about there being one.
    //
    // "This work asked a question and is parked until someone answers it" tells
    // a human that something is waiting and then makes them go somewhere else to
    // find out WHAT — on a page that has already read the row. The question is
    // one RLS read away (lib/work/reads.ts), so it is rendered here, above the
    // link to the inbox that can answer it, and the link stays because answering
    // is #629's surface rather than this one's.
    //
    // NULL IS STILL A STATE. A payload neither `question` nor `text` parses, a
    // row this caller cannot see, a second pending row — all three fall back to
    // the original sentence rather than to a placeholder over a shape this page
    // cannot prove (lib/journals/governance-doors.ts's `readClarifyQuestion`).
    const clarify = interruption === null ? null : readClarifyQuestion(interruption.question);
    return (
      <div className="flex flex-col gap-3">
        <StateBanner
          tone="warning"
          title={t("awaiting.title")}
          action={
            <div className="flex flex-wrap items-center gap-3">
              <Link href={WORK_NEEDS_YOU_HREF} className="text-sm font-medium text-primary underline underline-offset-2">
                {t("awaiting.link")}
              </Link>
            </div>
          }
        >
          {/* ONE OWNER FOR THE QUESTION TEXT (reviewed finding). This banner used to render the
              run's own words AND the panel below rendered them again from the shared record — the
              same sentence twice, a screen reader reading it twice, and two places to disagree the
              moment the question is re-asked. The banner now says only WHAT STATE the Work is in;
              the question itself belongs to the thing that can be answered. The table read is not
              discarded — it rides into the panel as the FALLBACK the door-unreachable arm renders,
              so the run's own words still appear when `clara.get_work_question` cannot be read. */}
          {t("awaiting.body")}
        </StateBanner>
        {/* #629 — THE ANSWER, HERE. This renders the SAME form Needs-you and the Clara rail render,
            so a person who is already looking at the Work does not have to go anywhere to answer one
            date. `key` is the WORK, so the detail's 3-second poll never re-mounts it and never
            steals focus mid-sentence. */}
        <WorkQuestionPanel
          // KEYED ON THE PENDING QUESTION'S OWN ROW, not on the Work. A re-asked question is a NEW
          // interruption row with the next version (0180), and a Work can go
          // awaiting_input -> running -> awaiting_input between two three-second polls, so a
          // Work-keyed panel kept showing question 1's accepted record while question 2 waited.
          // `useHydratedPart` does not re-run on a loader change and the form seeds its state once,
          // so the remount is the reload.
          key={interruption?.id ?? work.id}
          workId={work.id}
          fallbackQuestion={clarify === null ? null : { question: clarify.question, context: clarify.context }}
        />
        {/* #721 — AND THE OTHER ANSWER. A reply that CHANGES the instruction is not an answer to
            this question (the door refuses it `basis_change_not_allowed`); it is a new Work. The
            control sits beside the answer form because that is where a person discovers they
            disagree with the basis rather than merely lacking a fact. */}
        <RestateWorkPanel work={work} clientId={clientId} session={session} onRestated={onConverge} />
      </div>
    );
  }

  if (work.status === "cancelled") {
    // #630 — THE SUPERSEDED OUTCOME, when there is one. `clara.settle_work_run` translates a run
    // that asked for `failed`/`refused`/`expired` over a cancellation into `cancelled` and keeps
    // what it asked for under `error.superseded`, so nothing the run believed is lost. Shown as a
    // CODE rather than prose: it is the run's own vocabulary, not a sentence for a human.
    const superseded = supersededOutcome(work.error);
    // #750 — AND WHO PRESSED IT. Until this, the page was the only place that said a Work had been
    // cancelled and it did not say by whom: `cancel_accounting_work` records the author on the RUN
    // (`cancelled_by`/`cancelled_at`), and nothing rendered it. Both halves must be present — a
    // "Cancelled by" line with no name, or a name with no time, is worse than the plain banner.
    const cancelledBy = task?.cancelled_by ?? null;
    const cancelledAt = task?.cancelled_at ?? null;
    return (
      <StateBanner
        tone="neutral"
        title={t("cancelled.title")}
        code={superseded === null ? undefined : tc("cancelledSuperseded", { outcome: superseded })}
      >
        <span className="flex flex-col gap-1">
          <span>{t("cancelled.body")}</span>
          {cancelledBy !== null && cancelledAt !== null ? (
            <span className="inline-flex flex-wrap items-baseline gap-1">
              <span>{tc("cancelledByLabel")}</span>
              <MemberName userId={cancelledBy} resolver={members} showRole={false} />
              <span>{tc("cancelledAt", { at: businessDateTime(new Date(cancelledAt)) })}</span>
            </span>
          ) : null}
        </span>
      </StateBanner>
    );
  }

  if (work.status === "completed") {
    return (
      <StateBanner tone="info" title={t("completed.title")}>
        {t("completed.body")}
      </StateBanner>
    );
  }

  // #630 — STOPPING IS ITS OWN ARM NOW, and it says WHY it is not a terminal yet: an operation
  // that was already admitted may still be settling, and showing "cancelled" before that boundary
  // is known would be reporting an outcome the database has not decided. The 3-second poll on this
  // page is what converges it.
  if (work.status === "stopping") {
    return (
      <StateBanner tone="warning" title={tc("stoppingTitle")}>
        {tc("stoppingBody")}
      </StateBanner>
    );
  }

  // queued / running, and any status this build does not know. An OBSERVED state and nothing else:
  // no percentage, no estimate, no animation standing in for progress.
  return (
    <div className="flex flex-col gap-2">
      <StateBanner tone="info">{t("running.body")}</StateBanner>
    </div>
  );
}

/** The outcome a cancellation SUPERSEDED, or null. `clara.accounting_work.error.superseded` is
 *  written by `clara.settle_work_run` (0184) and is the run's own requested outcome; a row without
 *  one was cancelled before any run had an opinion. Read defensively — the column is jsonb and a
 *  shape this build has not seen renders as nothing rather than as `[object Object]`. */
function supersededOutcome(error: AccountingWorkRow["error"]): string | null {
  const raw = (error as { superseded?: unknown } | null)?.superseded;
  if (raw === null || typeof raw !== "object") return null;
  const outcome = (raw as { outcome?: unknown }).outcome;
  return typeof outcome === "string" && outcome !== "" ? outcome : null;
}
