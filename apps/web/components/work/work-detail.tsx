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
import {
  CancelOutcome,
  CancelWorkDialog,
  TakeOverOutcome,
  TakeOverWorkAction,
} from "@/components/work/work-cancel-dialog";
import { PostedLinesTable, WorkBasisTable } from "@/components/work/work-tables";
import { StateBanner } from "@/components/common/state";
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { SectionHeader } from "@/components/common/section-header";
import { MemberName } from "@/components/common/member-name";
import { useFirmScope } from "@/components/firm-scope-provider";
import { roleRankOf } from "@/lib/identity/caller-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { businessDateTime } from "@/lib/business-date";
import { isUuidShape } from "@/lib/client-id";
import { readClarifyQuestion } from "@/lib/journals/governance-doors";
import { useMemberNames, type MemberNameResolver } from "@/lib/members/use-member-names";
import { WORK_NEEDS_YOU_HREF, clientBase, journalComposerHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  cancelWork,
  retryWork,
  takeOverWork,
  type CancelWorkResult,
  type RetryWorkResult,
  type TakeOverWorkResult,
} from "@/lib/work/api";
import { accountNames, type WorkDetailData } from "@/lib/work/reads";
import { listEntryLinks, type EntryLinkRow } from "@/lib/work/evidence";
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
} from "@/lib/work/types";
import type { AgentInterruptionRow } from "@/lib/journals/types";
import type { SessionTokenAccessor } from "@/lib/session";

export const WORK_HEADING_ID = "work-detail-heading";

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
  /** #634's copy lives with the rest of the manual-JV journey's words. */
  const tm = useTranslations("ManualJournal");
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

  return (
    <div className="flex flex-col gap-6">
      <WorkFacts work={work} taskStatus={task?.status ?? null} members={memberNames} />

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
        clientId={clientId}
        canRetry={canRetry}
        canCancel={canCancel}
        canTakeOver={canTakeOver}
        retrying={retrying}
        retryState={retryState}
        onRetry={() => void runRetry()}
        onConverge={() => state.reload()}
        cancel={cancel}
        takeOver={takeOver}
        onCancelAnswer={setCancelState}
        onTakeOverAnswer={setTakeOverState}
        session={session}
        interruption={interruption}
        accountNames={names}
        onEditAsNewDraft={seedDraft}
      />

      {/* #630 — THE CANCEL'S OWN ANSWER, outside every status arm so it survives the status change
          that produced it. `null` renders nothing. */}
      <CancelOutcome result={cancelState} clientId={clientId} />
      <TakeOverOutcome result={takeOverState} />

      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("basisHeading")}</SectionHeader>
        <p className="max-w-prose text-sm text-muted-foreground">{t("basisNote")}</p>
        {work.basis === null ? (
          <p className="text-sm text-muted-foreground">{t("basisUnreadable")}</p>
        ) : (
          <WorkBasisTable basis={work.basis} names={names} />
        )}
      </section>

      {entry !== null ? (
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
                none of them; the vocabulary is one value today (`journal_entry`)
                and an unknown one renders VERBATIM rather than crashing on a
                missing message key, exactly as `basis_origin` does above. */}
            {links?.purpose == null ? null : (
              <>
                <dt className="text-muted-foreground">{tm("links.purpose")}</dt>
                <dd className="text-foreground">
                  {links.purpose === "journal_entry" ? tm("links.purposeJournalEntry") : links.purpose}
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
                  await Promise.all([reloadLinks(), state.reload()]);
                }}
                session={session}
              />
            </div>
          ) : null}
          <PostedLinesTable lines={lines} names={names} />
        </section>
      ) : null}
    </div>
  );
}

/** The identity block: what this Work IS, who asked for it, on what basis, and
 *  which frozen bundle ran it. Every value is a column; nothing is derived. */
function WorkFacts({
  work,
  taskStatus,
  members,
}: {
  work: AccountingWorkRow;
  taskStatus: string | null;
  members: MemberNameResolver;
}) {
  const t = useTranslations("WorkDetail");
  /** #630 — the handover row's own word. */
  const tc = useTranslations("WorkCancel");
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
        <dd className="text-foreground">{work.purpose}</dd>
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

/** The state-specific band: what is happening, and what a human may do next. */
function WorkOutcome({
  work,
  clientId,
  canRetry,
  canCancel,
  canTakeOver,
  retrying,
  retryState,
  onRetry,
  onConverge,
  cancel,
  takeOver,
  onCancelAnswer,
  onTakeOverAnswer,
  session,
  interruption,
  accountNames,
  onEditAsNewDraft,
}: {
  work: AccountingWorkRow;
  clientId: string;
  canRetry: boolean;
  /** #630 — whether "Cancel Work" is worth offering from this status. */
  canCancel: boolean;
  /** #630 — whether "Take responsibility" is worth offering for this refusal. */
  canTakeOver: boolean;
  retrying: boolean;
  retryState: RetryWorkResult | null;
  onRetry: () => void;
  /** RE-READ THE WORK. Called after every completed cancel or takeover attempt, refusal included:
   *  this component paints nothing it was not told by a fresh read, and the 3-second poll keeps
   *  converging on `stopping` → terminal afterwards. */
  onConverge: () => void | Promise<void>;
  cancel: typeof cancelWork;
  takeOver: typeof takeOverWork;
  /** Hands the cancel's answer to the page, which renders it outside every status arm. */
  onCancelAnswer: (result: CancelWorkResult) => void;
  onTakeOverAnswer: (result: TakeOverWorkResult) => void;
  session: SessionTokenAccessor;
  /** The row this Work is parked on, when it is parked and visible. */
  interruption: AgentInterruptionRow | null;
  /** #630 — account code → name, so the takeover's confirm step can render the BASIS it asks a
   *  colleague to take responsibility for rather than a digest of it. */
  accountNames: ReadonlyMap<string, string>;
  /** Writes the composer's draft from this basis, before the link navigates. */
  onEditAsNewDraft: () => void;
}) {
  const t = useTranslations("WorkDetail");
  const tc = useTranslations("WorkCancel");

  /** #630 — ONE instance, rendered into whichever arm is live. Mounting it twice would give the
   *  page two dialogs with the same Title and two op-key decisions for one intent. */
  const cancelAction = canCancel ? (
    <CancelWorkDialog
      workId={work.id}
      clientId={clientId}
      onCancelled={onConverge}
      onAnswer={onCancelAnswer}
      returnFocusTo={WORK_HEADING_ID}
      cancel={cancel}
      session={session}
    />
  ) : null;

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
            takeOver={takeOver}
            session={session}
          />
        ) : null}
        <StateBanner
          tone="error"
          title={t("refused.title")}
          code={[error.code, error.reason].filter((v): v is string => typeof v === "string" && v !== "").join(" · ") || undefined}
          action={
            <div className="flex flex-wrap items-center gap-3">
              {retryButton}
              {editLink}
            </div>
          }
        >
          {/* The DATABASE'S OWN words, verbatim. A refusal is a receipt; it is
              never re-worded, and the fallback sentence appears only when the
              row genuinely carries no message. */}
          {error.message ?? t("refused.body")}
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
              {/* #630 — a parked Work is still cancellable: nobody has to answer a question just
                  to stop something they no longer want. THE WRAPPER IS THE SAME ELEMENT the
                  queued/running arm uses; see `cancelSlot` below for why that matters. */}
              {cancelAction}
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
      </div>
    );
  }

  if (work.status === "cancelled") {
    // #630 — THE SUPERSEDED OUTCOME, when there is one. `clara.settle_work_run` translates a run
    // that asked for `failed`/`refused`/`expired` over a cancellation into `cancelled` and keeps
    // what it asked for under `error.superseded`, so nothing the run believed is lost. Shown as a
    // CODE rather than prose: it is the run's own vocabulary, not a sentence for a human.
    const superseded = supersededOutcome(work.error);
    return (
      <StateBanner
        tone="neutral"
        title={t("cancelled.title")}
        code={superseded === null ? undefined : tc("cancelledSuperseded", { outcome: superseded })}
      >
        {t("cancelled.body")}
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
  //
  // #630 (review) — THE ACTION SLOT IS THE SAME ELEMENT IN BOTH ARMS, and that is load-bearing
  // rather than cosmetic. React reconciles a slot by ELEMENT TYPE: this arm used to pass
  // `cancelAction` (a `CancelWorkDialog`) straight into `action` while the awaiting_input arm
  // passed a wrapping `div`, so the 3-second poll flipping `running ⇄ awaiting_input` — which this
  // file's own comment records happening between two polls — destroyed the open modal, took focus
  // to `<body>` with no dismissal, and threw away the decision's op key mid-submit. One wrapper in
  // both arms keeps ONE dialog mounted across the transition.
  return (
    <div className="flex flex-col gap-2">
      <StateBanner
        tone="info"
        action={cancelAction === null ? undefined : (
          <div className="flex flex-wrap items-center gap-3">{cancelAction}</div>
        )}
      >
        {t("running.body")}
      </StateBanner>
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
