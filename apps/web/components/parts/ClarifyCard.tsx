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
// NO OPTION CHIPS, deliberately (honest-note law): the frozen `clarifyTool`
// inputSchema declares `{ question, context? }` and nothing else
// (packages/runtime/workflows/chatTurn.v10.prompt.ts:213-216), and
// `openInterruptionStep` persists `{ type, question, context, framing }`
// (chatTurn.impl.ts:262-267). Neither path can carry a suggested-answer list, so a chip
// row here would be a control for data that never arrives — apps/web/AGENTS.md's "never
// a fake control". It becomes a real feature the day the declarer emits one.

import { useCallback, useId, useRef, useState, type FormEvent } from "react";
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

      {active && state.loading && row === null ? <LoadingState>{t("loading")}</LoadingState> : null}
      {active && state.err ? (
        <StateBanner tone="error" title={t("readError")} code={state.clr?.code ?? undefined}>
          {state.err}
        </StateBanner>
      ) : null}
      {active && !state.loading && !state.err && row === null ? <EmptyState>{t("empty")}</EmptyState> : null}

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
