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

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { PostedLinesTable, WorkBasisTable } from "@/components/work/work-tables";
import { StateBanner } from "@/components/common/state";
import { WorkQuestionPanel } from "@/components/work/work-question-panel";
import { SectionHeader } from "@/components/common/section-header";
import { MemberName } from "@/components/common/member-name";
import { useFirmScope } from "@/components/firm-scope-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { businessDateTime } from "@/lib/business-date";
import { isUuidShape } from "@/lib/client-id";
import { readClarifyQuestion } from "@/lib/journals/governance-doors";
import { useMemberNames, type MemberNameResolver } from "@/lib/members/use-member-names";
import { WORK_NEEDS_YOU_HREF, clientBase, journalComposerHref } from "@/lib/navigation/tree";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { retryWork, type RetryWorkResult } from "@/lib/work/api";
import { accountNames, type WorkDetailData } from "@/lib/work/reads";
import { useWorkDetail } from "@/lib/work/use-work-detail";
import {
  defaultDraftStorage,
  draftFromBasis,
  writeJournalDraft,
  type DraftStorage,
  type JournalDraftScope,
} from "@/lib/work/journal-draft";
import { isRetryableWorkStatus, type AccountingWorkRow } from "@/lib/work/types";
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
      scope={{ firmId: scope.firm_id, userId: scope.user_id }}
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
  session = sessionTokenAccessor,
  scope,
  storage,
}: {
  clientId: string;
  workId: string;
  load?: (clientId: string, workId: string) => Promise<WorkDetailData | null>;
  now?: () => number;
  retry?: typeof retryWork;
  session?: SessionTokenAccessor;
  /** WHO is reading, for the composer draft "Edit as a new draft" seeds. Both
   *  halves are optional and a MISSING half means no seeding at all — a draft
   *  filed under a guessed scope is worse than a draft that was never saved
   *  (lib/work/journal-draft.ts's own rule). */
  scope?: { firmId?: string; userId?: string };
  storage?: DraftStorage | null;
}) {
  const t = useTranslations("WorkDetail");
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
        retrying={retrying}
        retryState={retryState}
        onRetry={() => void runRetry()}
        interruption={interruption}
        onEditAsNewDraft={seedDraft}
      />

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
            {committed === null ? null : (
              <>
                <dt className="text-muted-foreground">{t("receiptId")}</dt>
                <dd className="wrap-anywhere text-foreground">{committed.id}</dd>
                <dt className="text-muted-foreground">{t("receiptVia")}</dt>
                <dd className="text-foreground">{committed.via_wake_kind}</dd>
              </>
            )}
          </dl>
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
              <MemberName userId={work.initiator} resolver={members} showRole={false} />
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
  retrying,
  retryState,
  onRetry,
  interruption,
  onEditAsNewDraft,
}: {
  work: AccountingWorkRow;
  clientId: string;
  canRetry: boolean;
  retrying: boolean;
  retryState: RetryWorkResult | null;
  onRetry: () => void;
  /** The row this Work is parked on, when it is parked and visible. */
  interruption: AgentInterruptionRow | null;
  /** Writes the composer's draft from this basis, before the link navigates. */
  onEditAsNewDraft: () => void;
}) {
  const t = useTranslations("WorkDetail");

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
            <Link href={WORK_NEEDS_YOU_HREF} className="text-sm font-medium text-primary underline underline-offset-2">
              {t("awaiting.link")}
            </Link>
          }
        >
          {clarify === null ? (
            t("awaiting.body")
          ) : (
            <span className="flex flex-col gap-1">
              {/* The RUN'S OWN WORDS, verbatim — the same posture the refusal arm
                  takes about the database's. */}
              <span className="font-medium text-foreground">{clarify.question}</span>
              {clarify.context === null ? null : (
                <span className="text-xs text-muted-foreground">{clarify.context}</span>
              )}
            </span>
          )}
        </StateBanner>
        {/* #629 — THE ANSWER, HERE. The banner above still says WHAT is waiting (and still falls
            back to the table read when the door is unreachable); this renders the SAME form
            Needs-you and the Clara rail render, so a person who is already looking at the Work
            does not have to go anywhere to answer one date. `key` is the WORK, so the detail's
            3-second poll never re-mounts it and never steals focus mid-sentence. */}
        <WorkQuestionPanel key={work.id} workId={work.id} />
      </div>
    );
  }

  if (work.status === "cancelled") {
    return (
      <StateBanner tone="neutral" title={t("cancelled.title")}>
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

  // queued / running / stopping, and any status this build does not know. An
  // OBSERVED state and nothing else: no percentage, no estimate, no animation
  // standing in for progress.
  return (
    <StateBanner tone="info">
      {work.status === "stopping" ? t("stopping.body") : t("running.body")}
    </StateBanner>
  );
}
