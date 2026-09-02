"use client";

// The clarify part's card — read-only everywhere, PLUS the inline answer control on
// the one clarify a human can actually answer (PRD §5a: Clara asks in the thread, the
// human answers in the thread). The old surface's shape
// (apps/dashboard/app/chat/parts.tsx:272-306 `ClarifyCard` + page.tsx:120-139
// `refreshClarify`) is the behavioural reference; ClaraBook is the visual law.
//
// WHICH CARD GETS THE CONTROL, and why it is not "every clarify part":
//   * `answerable` is set by the ONE caller that can know it — ClaraThreadView, for the
//     LAST clarify in the LIVE stream fold (the dashboard's own `lastClarifyIndex`
//     precedent, parts.tsx:146-148). An earlier clarify in the same run has already
//     been answered; a clarify in the PERSISTED transcript cannot be pending at all
//     (see lib/clara/liveClarify.ts's header for the settle_chat_turn measurement).
//   * even then the control renders only once a READ has SEEN a pending
//     `agent_interruptions` row for this task. The row is the authority on whether
//     there is anything to answer; this card never infers it from the part's presence.
//     Absence of the row is not evidence of pendingness — it falls through to the
//     honest "no longer awaiting an answer" empty state.
//
// THE DOOR IS THE JOURNALS PANE'S DOOR, byte for byte. `answerInterruption(id, { text })`
// is exactly what components/journals/interruptions-panel.tsx's `AnswerRow` sends
// (`onAnswer({ text: answer.trim() }, …)`), through the same
// lib/journals/governance-doors.ts wrapper, so both surfaces put the identical
// `{ p_id, p_answer: { text }, p_op_key }` on the wire. The pane is untouched and keeps
// working; this is a second caller of one door, never a second door.
//
// THE ROW LANDS AFTER THE CHUNK, so ONE read is not enough (fold round, review B1).
// In the live workflow the clarify tool-call chunk is written inside
// `runModelSegmentStepV16` and the `agent_interruptions` row is INSERTed three durable
// WDK step boundaries later — `chatTurn.v16.ts:104` (segment) → `:105` (`checkpointStep`)
// → `:127` (`mintHookTokenStep`) → `:129` (`openInterruptionStep`), each a `"use step"`
// persisted to the event log. The browser holds the chunk the moment `streamRoute.ts:117`
// forwards it, so a single mount-time read is always too early and the card would render
// "no open question" over a question Clara is actively parked on.
//
// `useHydratedPart` fires exactly once (its mount effect keys on `[reloadImpl,
// hasSession]`, and `reloadImpl` is deliberately identity-stable), so the re-read lives
// HERE rather than in the shared hook. It is the precedent's own answer:
// apps/dashboard/app/chat/page.tsx:118-119 says it in its own words — "Written slightly
// after the clarify chunk streams, so retry" — and `refreshClarify` retries 5×1s. Same
// cap, same interval, and MEASURED as the only mechanism available: there is no SSE event
// marking the insert (nothing writes to the run's writable between `openInterruptionStep`
// and the `await hook` park, chatTurn.v16.ts:129-131, and `streamRoute.ts` emits nothing
// for an `awaiting_input` status), so an event-driven re-read has no event to key on.
//
// The cap is not a dead end. Where the dashboard simply stopped, this falls through to an
// EMPTY state that reports what the read saw — not a settled state it never established —
// and offers a manual re-check, so a window wider than 5s degrades to one click rather
// than to a false sentence.
//
// NO OPTION CHIPS, deliberately (honest-note law): the frozen `clarifyTool`
// inputSchema declares `{ question, context? }` and nothing else
// (packages/runtime/workflows/chatTurn.v10.prompt.ts:213-216), and the LIVE
// `openInterruptionStep` persists `{ type, question, context, framing }`
// (chatTurn.v10.impl.ts:328 — the body `chatTurn.v16.impl.ts:41-53` re-exports and
// `chatTurn.v16.ts:39` imports; the v1-era `chatTurn.impl.ts` is NOT the live path).
// Neither path can carry a suggested-answer list, so a chip row here would be a control
// for data that never arrives — apps/web/AGENTS.md's "never a fake control". It becomes a
// real feature the day the declarer emits one.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { answerInterruption, getInterruptionById, getPendingInterruptionForTask } from "@/lib/journals/governance-doors";
import { useHydratedPart } from "@/lib/parts/hooks";
import type { AgentInterruptionRow } from "@/lib/journals/types";
import type { ClaraPart } from "@/lib/parts/types";
import type { SessionTokenAccessor } from "@/lib/session";

type ClarifyPart = Extract<ClaraPart, { type: "clarify" }>;

/** The precedent's own cap and interval (apps/dashboard/app/chat/page.tsx:124,106 —
 *  `for (let i = 0; i < 5; i++)` around a 1s sleep). Exported so a cell can assert the
 *  re-read is BOUNDED by reading the same number the code uses, rather than restating it. */
export const CLARIFY_ROW_ATTEMPTS = 5;
export const CLARIFY_ROW_INTERVAL_MS = 1_000;

/** The answer jsonb the pane writes is `{ text }`; this renders whatever the DB gives
 *  back, never a re-derivation of what we think we sent. */
function answeredText(answer: Record<string, unknown> | null): string | null {
  return typeof answer?.text === "string" && answer.text.trim() ? answer.text : null;
}

export function ClarifyCard({
  part,
  taskId,
  session,
  answerable = false,
}: {
  part: ClarifyPart;
  taskId?: string | null;
  session?: SessionTokenAccessor | null;
  answerable?: boolean;
}) {
  const t = useTranslations("Clara.parts.clarify");
  const inputId = useId();
  const [answer, setAnswer] = useState("");

  // Once this card has SENT an answer it owns an exact identity, so every later read
  // addresses THAT row by id rather than re-asking "what is pending on this task"
  // (which the answer itself just emptied). A ref, not state: lib/parts/hooks.ts reads
  // the loader through `loaderRef` at call time, so the post-act reload already picks
  // this up without the loader's identity having to churn.
  const answeredIdRef = useRef<string | null>(null);

  const active = Boolean(answerable && taskId && session);
  const loader = useCallback(
    (activeSession: SessionTokenAccessor): Promise<AgentInterruptionRow | null> => {
      const id = answeredIdRef.current;
      if (id) return getInterruptionById(id, { session: activeSession });
      if (!taskId) return Promise.resolve(null);
      return getPendingInterruptionForTask(taskId, { session: activeSession });
    },
    [taskId],
  );
  // `null` session ⇒ the hook never reads at all (its own documented no-op), which is
  // what keeps a settled transcript from firing one PostgREST read per clarify card.
  const state = useHydratedPart(active ? (session ?? null) : null, loader);
  // `active` is re-read HERE, not only where the hook is fed. A card that WAS the
  // answerable one and stops being it (the next clarify round opens while this card
  // stays mounted under its own React key) keeps the row it already hydrated —
  // `useHydratedPart` has no "forget what you loaded" transition, by design. Reading
  // the hydrated row through `active` is what retires the control with the card's
  // standing, instead of leaving a form behind that would answer the NEXT question.
  const row = active ? state.data : null;

  // The bounded, cancellable re-read (see this file's header for why one read loses the
  // race). It runs only while this card is the answerable one, has SEEN no row, has no
  // standing error to spin on, and has not itself answered. Each tick is one `setTimeout`
  // cleared on unmount and on every state change that ends the window, so nothing is left
  // running behind a card the transcript has moved past.
  const [attempt, setAttempt] = useState(0);
  const exhausted = attempt >= CLARIFY_ROW_ATTEMPTS;
  const searching = active && row === null && !state.err && answeredIdRef.current === null && !exhausted;
  const { reload } = state;
  useEffect(() => {
    if (!searching) return;
    const timer = setTimeout(() => {
      setAttempt((n) => n + 1);
      void reload();
    }, CLARIFY_ROW_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [searching, attempt, reload]);

  /** The manual re-check the cap falls through to — re-arms the window rather than
   *  leaving the human at a dead end when the runtime took longer than the precedent's
   *  five seconds. */
  const recheck = useCallback(() => {
    setAttempt(0);
    void reload();
  }, [reload]);

  async function submitAnswer(value: string): Promise<void> {
    const text = value.trim();
    if (!text || !row || row.status !== "pending" || !session || state.busy) return;
    answeredIdRef.current = row.id; // BEFORE the act: the mandatory re-read must land on this row whether the door accepts or refuses
    await state.act(
      () => answerInterruption(row.id, { text }, { session }),
      () => setAnswer(""),
    );
  }

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    void submitAnswer(answer);
  }

  return (
    <section className="enter-panel flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div><Badge tone="info">{t("firmVisible")}</Badge></div>
      <p className="text-card-foreground">{part.question}</p>
      {part.context ? <p className="text-xs text-muted-foreground">{part.context}</p> : null}
      {/* A persisted part carries the runtime's own framing sentence; a part folded live
          out of the stream has none, so the translated equivalent stands in. */}
      <p className="text-xs text-muted-foreground">{part.framing.trim() ? part.framing : t("framing")}</p>

      {/* THREE STATES, kept distinguishable across the re-read window. WAITING covers
          both the read in flight and the gap before the row is written — to the human
          those are one fact ("still looking"), and neither is a licence to claim the
          question is settled. GONE is only ever reached after the window closes, and it
          reports what the read SAW rather than asserting a state it never established.
          ERROR stays its own banner and stops the window rather than spinning on it. */}
      {searching ? <LoadingState>{t("loading")}</LoadingState> : null}
      {active && state.err ? (
        <StateBanner tone="error" title={t("readError")} code={state.clr?.code ?? undefined}>
          {state.err}
        </StateBanner>
      ) : null}
      {active && !state.err && row === null && exhausted ? (
        <div className="flex flex-wrap items-center gap-2">
          <EmptyState>{t("empty")}</EmptyState>
          <Button type="button" size="xs" variant="outline" disabled={state.loading} onClick={recheck}>
            {t("recheck")}
          </Button>
        </div>
      ) : null}

      {row?.status === "answered" ? (
        <div className="rounded-lg border border-success/30 bg-success-muted p-2" role="status">
          <p className="font-medium text-success">{t("answered")}</p>
          <p className="mt-1 text-card-foreground">{answeredText(row.answer) ?? t("answeredWithoutText")}</p>
        </div>
      ) : null}

      {row && row.status !== "pending" && row.status !== "answered" ? (
        <EmptyState>{t("closed", { status: row.status })}</EmptyState>
      ) : null}

      {row?.status === "pending" ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-xs font-medium text-card-foreground">{t("answerLabel")}</label>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={t("answerPlaceholder")}
              disabled={state.busy}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              size="sm"
              disabled={state.busy || !answer.trim()}
              onClick={() => void submitAnswer(answer)}
            >
              {state.busy ? t("answering") : t("answer")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
