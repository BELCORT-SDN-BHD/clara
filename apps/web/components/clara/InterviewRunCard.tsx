"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";
import { cn } from "@/lib/utils";
import { cancelClientOnboarding } from "@/lib/onboarding/api";
import { formatPlanItemAnswer, type AnswerTranslator } from "@/lib/onboarding/answer-format";
import type { AnswerEcho } from "@/lib/interview/thread";
import { queueStateLabelKey } from "@/lib/documents/copy";
import {
  useUploadQueue,
  type QueueItem,
  type QueueRejection,
} from "@/lib/documents/useUploadQueue";
import {
  startClientInterview,
  type InterviewChip,
} from "@/lib/interview/api";
import {
  TERMINAL_CHIPS,
  useInterviewRun,
} from "@/lib/interview/useInterviewRun";
import type { SessionTokenAccessor } from "@/lib/session";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";

export function InterviewRunCard({
  clientId,
  planId,
  session,
  onActiveChange,
  onPlanChanged,
}: {
  clientId: string;
  planId: string;
  session: SessionTokenAccessor;
  /** Lets the parent suppress its DB-only cancel door while this card owns an
   *  active runtime run. */
  onActiveChange?: (active: boolean) => void;
  /** Re-hydrates the parent checklist after cancellation and at terminal, so
   *  its DB-owned commit gate sees the interview's persisted items. */
  onPlanChanged?: () => Promise<void>;
}) {
  const t = useTranslations("Interview");
  const tCard = useTranslations("ClientOnboarding.card");
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const syncedTerminalRef = useRef<string | null>(null);
  // H-28 — the last park index this card has already told the checklist about. `null` is "no
  // park observed yet on this run", which is a DIFFERENT fact from park 0 and is why the very
  // first observation does not fire a reload (see the effect below).
  const syncedParkRef = useRef<number | null>(null);

  // H-27 — the thread's "you" bubbles read as prose rather than as the raw jsonb the plan
  // stores. `useTranslations` returns a stable function for a given namespace, and the
  // formatter is read through a ref inside the hook, so this closure's identity cannot re-arm
  // the poll even if it changed.
  const tAnswer = useTranslations("ClientOnboarding.answer") as unknown as AnswerTranslator;
  const echoAnswer = useCallback<AnswerEcho>(
    (itemKey, answer) => formatPlanItemAnswer(itemKey, answer, tAnswer).text,
    [tAnswer],
  );

  const run = useInterviewRun({ session, scope: "client", runId, planId, echoAnswer });
  const active = Boolean(runId && (!run.state || !TERMINAL_CHIPS.has(run.state.chip)));

  // NIT-2 (review round 2, RULED SKIPPED — known and accepted, no product
  // risk): a plain `useEffect` here (not `useLayoutEffect`) means the
  // parent's `interviewRunActive` — and therefore whether its own standalone
  // Cancel door is suppressed — updates one PAINTED FRAME after `active`
  // itself flips, not synchronously in the same commit. The self-correcting
  // window is at most one frame wide and resolves itself on the very next
  // render; nothing user-observable can act inside it (no click can land in
  // a single un-rendered frame), and it never produces the two-doors-at-once
  // state this component exists to prevent — only, transiently, zero or one.
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);
  useEffect(() => {
    const outcome = run.state?.terminal?.outcome;
    if (!runId || !outcome || !onPlanChanged) return;
    const terminalKey = `${runId}:${outcome}`;
    if (syncedTerminalRef.current === terminalKey) return;
    syncedTerminalRef.current = terminalKey;
    void onPlanChanged();
  }, [run.state?.terminal?.outcome, runId, onPlanChanged]);

  // A new run starts from no observed park — otherwise the previous run's index would decide
  // whether this run's first answer counts as progress.
  useEffect(() => {
    syncedParkRef.current = null;
  }, [runId]);

  // ============================================================================
  // H-28 — THE CHECKLIST FOLLOWS THE INTERVIEW, off the poll that already exists.
  // ============================================================================
  // TWO CLOCKS, and only one of them was ticking. This card polls `/state` every POLL_MS and
  // rebuilds its thread; the checklist reads through `useHydratedPart`, whose mount effect is
  // stable by construction, so its item list — and therefore the N/N header — was whatever the
  // database held when the card mounted. Meanwhile `clientOnboarding_v4` writes one plan CAS
  // per confirmed segment across ~18 segments. `onPlanChanged` existed but fired in exactly
  // two places: the run's TERMINAL, and the two-step cancel. Nothing fired per answered
  // segment, so the header sat at its mount snapshot for the whole interview.
  //
  // THE SIGNAL IS NOT A NEW ONE. `pendingPark.parkIndex` advances exactly once per answered
  // park, and `classifyDeliveryBody` (lib/interview/api.ts) already treats a STRICTLY HIGHER
  // index as the estate's proof that an answer landed. This reads the same fact the same way.
  //
  // WHY NOT MAKE `useHydratedPart` POLL. Its own header is explicit that its dependency shape
  // exists to prevent exactly the busy-poll class. This adds AT MOST one plan read per
  // existing 3s poll, and only while a park is actually moving.
  //
  // THE FIRST OBSERVATION DOES NOT FIRE. On mount both halves read the same database at the
  // same moment, so the first park index is not news — reloading on it would be one wasted
  // read per run. Only a STRICTLY HIGHER index than one already seen counts, which also means
  // a re-render, an unchanged park across polls, and a park index that goes backwards (a
  // resumed run re-reporting an earlier park) all fire nothing.
  useEffect(() => {
    const parkIndex = run.state?.pendingPark?.parkIndex;
    if (!runId || typeof parkIndex !== "number" || !onPlanChanged) return;
    const seen = syncedParkRef.current;
    // BELT, AND LABELLED AS ONE (the `toggle` / `isDoActionPermitted` precedent in this repo:
    // a non-discriminating mutant is said out loud rather than dressed up as a cell). The
    // EQUAL half of `<=` cannot be reached today — this effect's dependency array already ends
    // at `parkIndex`, so React does not re-run it for an unchanged index at all, and the fold
    // round's mutant panel measured exactly that: relaxing `<=` to `<` left every cell green.
    // What the comparison DOES discriminate is a park index that goes BACKWARDS (a resumed run
    // re-reporting an earlier park), which does change the dependency and is guarded by both
    // halves — that arm has its own cell. The `<=` stays for the day this effect gains a
    // dependency that can re-fire it at the same park.
    if (seen !== null && parkIndex <= seen) return;
    syncedParkRef.current = parkIndex;
    if (seen === null) return;
    void onPlanChanged();
  }, [run.state?.pendingPark?.parkIndex, runId, onPlanChanged]);

  async function startOrContinue() {
    setStarting(true);
    setStartError(null);
    try {
      const result = await startClientInterview({ clientId, planId }, { session });
      setRunId(result.runId);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const park = run.state?.pendingPark;
    const answer = draft.trim();
    if (!park || run.busy || !answer) return;
    if (await run.submitAnswer(park, answer)) setDraft("");
  }

  async function cancel() {
    const reason = cancelReason.trim();
    if (!reason) return;
    run.setBusy(true);
    run.setError(null);
    try {
      const park = run.state?.pendingPark;
      if (park) await run.runtimeCancel(park);
      await cancelClientOnboarding({ clientId, planId, reason }, { session });
      setCancelReason("");
      await onPlanChanged?.();
      await run.refresh();
    } catch (e) {
      run.setError(e instanceof Error ? e.message : String(e));
    } finally {
      run.setBusy(false);
    }
  }

  const state = run.state;
  const terminalMessage = state?.terminal
    ? state.terminal.outcome === "interview_complete"
      ? t("terminal.interview_complete")
      : state.terminal.outcome === "cancelled"
        ? t("terminal.cancelled")
        : state.terminal.outcome === "expired"
          ? t("terminal.expired")
          : state.terminal.outcome === "plan_gone"
            ? t("terminal.plan_gone")
            : state.terminal.outcome === "superseded_by_existing_run"
              ? t("terminal.superseded_by_existing_run")
              : t("terminal.fallback", { outcome: state.terminal.outcome })
    : null;

  return (
    <Card size="sm" aria-label={t("cardLabel")}>
      <CardHeader>
        <CardTitle>
          <SectionHeader level={3}>{t("heading")}</SectionHeader>
        </CardTitle>
        {state?.progress ? (
          <CardDescription>{t("progress", { index: state.progress.index, seg: state.progress.seg })}</CardDescription>
        ) : !runId ? (
          <CardDescription>{tCard("interviewStartDescription")}</CardDescription>
        ) : null}
        {state ? (
          <CardAction>
            <Badge variant={chipVariant(state.chip)}>{t(`chip.${state.chip}`)}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {startError ? <StateBanner tone="error">{startError}</StateBanner> : null}
        {run.error ? <StateBanner tone="error">{run.error}</StateBanner> : null}

        {!runId ? (
          <Button type="button" size="sm" onClick={() => void startOrContinue()} disabled={starting}>
            {starting ? tCard("interviewStarting") : tCard("interviewStartTrigger")}
          </Button>
        ) : (
          // DS-03 (P6-3): the loading sentence moved INSIDE the thread log
          // rather than standing beside it, so the log is one PERSISTENT region
          // that is busy and then not — which is what lets `aria-busy` do its
          // job (a placeholder that is swapped for a sibling can never flip the
          // flag false). Visual output is unchanged in both states.
          <InterviewThread thread={run.thread} loading={!state} />
        )}

        {state?.pendingPark?.seg === "sample_invoices" ? (
          <InterviewAttachmentSlot clientId={clientId} session={session} />
        ) : null}
      </CardContent>

      {state || active ? (
        <CardFooter className="flex-col items-stretch gap-2">
          {/* MATERIAL-1 fix (review round 1): this block used to live inside
              the OUTER `{state ? … : null}` guard, so `runId && state ===
              null` (start succeeded, then the runtime never answers /state —
              down, or a session-expired redirect) rendered NEITHER this
              card's own cancel door NOR the checklist's standalone one (that
              door is suppressed by `onActiveChange` for as long as `active`
              is true, per R1). The human was left with an error banner and
              no way to reach `cancel_client_onboarding` — the one door in
              the whole two-step cancel that does NOT need the runtime. The
              footer now mounts on `state || active`, and the cancel dialog
              below is independent of `state` entirely — `cancel()` already
              runtime-cancels only when `run.state?.pendingPark` exists,
              so no other change was needed. Proven RED against the
              pre-fix shape by interview-run-keyboard.test.tsx's MATERIAL-1
              cell before this fix was restored. */}
          {state ? (
            state.pendingPark ? (
              <form className="flex flex-col gap-2" onSubmit={(e) => void submit(e)}>
                <Textarea
                  aria-label={t("answer.label")}
                  placeholder={state.pendingPark.phase === "c" ? t("answer.confirmPlaceholder") : t("answer.placeholder")}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                  disabled={run.busy}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={run.busy || draft.trim().length === 0}>
                    {run.busy ? t("answer.sending") : t("answer.send")}
                  </Button>
                </div>
              </form>
            ) : terminalMessage ? (
              <p className="text-sm text-muted-foreground">{terminalMessage}</p>
            ) : state.chip === "working" ? (
              <p className="text-sm text-muted-foreground">{t("working")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noOpenQuestion")}</p>
            )
          ) : null}
          {active ? (
            <OnboardingDoorDialog
              triggerLabel={t("cancel.trigger")}
              triggerVariant="destructive"
              title={t("cancel.title")}
              description={t("cancel.description")}
              confirmLabel={t("cancel.confirm")}
              busy={run.busy}
              confirmDisabled={cancelReason.trim().length === 0}
              onConfirm={cancel}
            >
              <Textarea
                aria-label={t("cancel.reasonLabel")}
                placeholder={t("cancel.reasonPlaceholder")}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </OnboardingDoorDialog>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

/**
 * DS-04 (FS-9 §3, P6-3) — this log is no longer NESTED inside another one.
 * Nothing changed here to achieve it: ClaraThreadView's own scroll region used
 * to carry `role="log" aria-live="polite"`, and this card reaches that region
 * through OnboardingChecklistCard, so this element was a `log` inside a `log`.
 * That outer live region has been narrowed to wrap only its transcript, which
 * makes this card a SIBLING of it. This log keeps its role and its label: it is
 * a genuine, separately-announced conversation and it is the correct owner of
 * that role — the defect was the containment, not this declaration.
 *
 * DS-03: `aria-busy` is real here because the region persists across the read
 * (see the call site's comment).
 */
function InterviewThread({
  thread,
  loading,
}: {
  thread: ReturnType<typeof useInterviewRun>["thread"];
  loading: boolean;
}) {
  const t = useTranslations("Interview");
  return (
    <div
      className="flex flex-col gap-2"
      role="log"
      aria-label={t("threadLabel")}
      aria-live="polite"
      aria-busy={loading}
    >
      {loading ? (
        // Deliberately a plain <p>, not the LoadingState primitive: that
        // primitive computes `role="status"`, and a status inside this log
        // would re-create exactly the nested-live-region defect DS-04 exists to
        // remove. The log's own `aria-busy` is what carries the loading
        // semantics; the sentence only has to be visible.
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : thread.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("threadEmpty")}</p>
      ) : thread.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            "rounded-lg p-2 text-sm",
            entry.role === "you" ? "bg-muted" : "bg-clara-muted",
          )}
        >
          {/* Fix round (裁-86 axe catch, live-stack walk): text-muted-foreground
              on bg-clara-muted measures 4.49:1 — short of the 4.5:1 AA floor
              (muted-foreground/#687171 is the design system's own known
              tightest-margin token, globals.css's :root comment; clara-muted
              is a marginally lighter/more-saturated ground than the ones it
              was tuned against). text-secondary-ink (#4b5353, an existing,
              already-cataloged "secondary prose role" token — globals.css,
              PAIR_SPECS's secondary-ink-on-identity-canvas) is strictly
              darker on every channel, so it clears clara-muted at 7.08:1
              while only ever IMPROVING the "you" bubble's existing
              muted-foreground-on-muted margin — conditioned per role anyway,
              to touch only the pairing that actually broke. */}
          <p className={cn("mb-1 text-xs font-medium", entry.role === "you" ? "text-muted-foreground" : "text-secondary-ink")}>
            {t(`role.${entry.role}`)}{entry.seg ? ` · ${entry.seg}` : ""}
          </p>
          <p className="whitespace-pre-wrap">{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

function InterviewAttachmentSlot({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("Interview.attach");
  const [rejection, setRejection] = useState<QueueRejection | null>(null);
  const onFiled = useCallback(() => {}, []);
  const onRejected = useCallback((next: QueueRejection) => setRejection(next), []);
  const queue = useUploadQueue(clientId, session, onFiled, onRejected);

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <SectionHeader level={4}>{t("heading")}</SectionHeader>
      <input
        type="file"
        multiple
        aria-label={t("inputLabel")}
        className="text-sm"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) queue.add(files);
          e.target.value = "";
        }}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      {rejection ? (
        <p className="text-xs text-warning">
          {rejection.reason === "too_large"
            ? t("tooLarge", { filename: rejection.filename, limitMb: Math.round(rejection.limitBytes / (1024 * 1024)) })
            : t("duplicate", { filename: rejection.filename })}
        </p>
      ) : null}
      {queue.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {queue.items.map((item) => (
            <AttachmentQueueRow key={item.localId} item={item} onRetry={queue.retry} onRemove={queue.remove} />
          ))}
          <li>
            <Button type="button" size="xs" variant="ghost" onClick={queue.clearDone}>{t("clear")}</Button>
          </li>
        </ul>
      ) : null}
    </section>
  );
}

function AttachmentQueueRow({
  item,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("Interview.attach");
  const stateKey = queueStateLabelKey(item);
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 text-sm">
      <span className="max-w-40 truncate font-medium" title={item.name}>{item.name}</span>
      <span className="flex-1 text-xs text-muted-foreground">
        {t(stateKey)}{item.failureCode ? ` · ${item.failureCode}` : ""}
      </span>
      {item.state === "error" || item.state === "failed" ? (
        <Button type="button" size="xs" variant="outline" onClick={() => onRetry(item.localId)}>{t("retry")}</Button>
      ) : null}
      <Button type="button" size="xs" variant="ghost" onClick={() => onRemove(item.localId)}>{t("remove")}</Button>
      {item.error ? <span className="w-full text-xs text-error wrap-anywhere">{item.error}</span> : null}
      {item.recoveryRemedy ? <span className="w-full text-xs text-muted-foreground wrap-anywhere">{item.recoveryRemedy}</span> : null}
    </li>
  );
}

function chipVariant(chip: InterviewChip): "default" | "secondary" | "destructive" | "outline" {
  if (chip === "awaiting_you" || chip === "complete") return "default";
  if (chip === "cancelled" || chip === "expired" || chip === "ended") return "destructive";
  if (chip === "working") return "secondary";
  return "outline";
}
