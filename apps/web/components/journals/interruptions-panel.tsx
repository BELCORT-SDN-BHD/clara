"use client";

// T6 (port-wave plan §4/§5) — the "Clarifications" tab: pending
// `agent_interruptions` (clara.answer_interruption's own target), rendered
// FIRM-WIDE and labeled honestly as such (lib/journals/types.ts's own header
// — the table carries no client_id column, so a per-client filter cannot
// exist on the human read side).
//
// H-32, THE SHAPE THIS PANEL READS. `question` is an untyped jsonb column
// (packages/db/migrations/0006_runtime_core.sql:198) whose shape belongs to
// the RUNTIME, not the schema. This file's previous header called
// `question.text` "the runtime's own clarify-hook convention". It is not, and
// the mistake bit on the FIRST row of every list: the live writer is
// `openInterruptionStep`, which builds `{ type: "clarify", question:
// clarify.question, context: clarify.context ?? null, framing:
// CLARIFY_FRAMING }` — packages/runtime/workflows/chatTurn.v10.impl.ts:328,
// re-exported by v16/v17 — and every one of the ten `open_interruption`
// callers in packages/runtime writes `question`, never `text`. So `.text` was
// null on 100% of rows and every card fell through to the raw-JSON dump.
//
// The reader below is transcribed from that literal, keeps `.text` as a
// COMPATIBILITY fallback (the column is untyped jsonb and the absence of a
// `.text` writer TODAY is not proof no row ever carried one), and keeps the
// `<pre>` dump as the fail-closed arm for a payload neither key parses. That
// arm was always right — it was just always taken.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, StateBanner } from "@/components/common/state";
import { FormattedDateTime } from "./formatted-date";
import { CodingDoorDialog } from "@/components/documents/CodingDoorDialog";
import type { AgentInterruptionRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

type ClarifyQuestion = { question: string; context: string | null; framing: string | null };

/** Returns null when NEITHER key parses — the caller then renders the raw
 *  payload rather than a placeholder over a shape it cannot prove. */
function readClarify(question: Record<string, unknown>): ClarifyQuestion | null {
  const text = str(question.question) ?? str(question.text);
  if (!text) return null;
  return { question: text, context: str(question.context), framing: str(question.framing) };
}

export function InterruptionsPanel({
  interruptions,
  busy,
  err,
  clr,
  actingId,
  onAnswer,
  clientIdByTaskId,
  onPromote,
}: {
  interruptions: AgentInterruptionRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  actingId: string | null;
  onAnswer: (interruptionId: string, answer: Record<string, unknown>, onOk: () => void) => void;
  /** T7 (port-wave plan §4) — each row's own task's client_id, keyed by
   *  task_id (lib/journals/types.ts's own header). */
  clientIdByTaskId: Record<string, string | null>;
  /** `undefined` disables promote entirely (a caller that has not wired it
   *  yet) — a real, present callback is required to render the control at
   *  all, never a silently-inert button. Returns the SAME act()-derived
   *  Promise the dialog awaits before closing (CodingDoorDialog's own
   *  contract) — never a fire-and-forget callback. */
  onPromote?: (interruptionId: string, scopeId: string) => Promise<void>;
}) {
  const t = useTranslations("DraftsDocumentGovernance.interruptions");

  if (interruptions.length === 0) {
    return <EmptyState>{t("empty")}</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{t("firmWideNote")}</p>
      {interruptions.map((row) => {
        const isActing = actingId === row.id;
        const clarify = readClarify(row.question);
        const scopeClientId = clientIdByTaskId[row.task_id] ?? null;
        return (
          <Card key={row.id} className="enter-content">
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm text-foreground">{clarify ? clarify.question : t("questionOpaque")}</span>
                {/* `expires_at` is `timestamptz not null` — the 14-day clarify
                    deadline (0006_runtime_core.sql:203). It used to render
                    through <FormattedDate>, which exists for `date` COLUMNS:
                    it regex-matches the leading YYYY-MM-DD and formats in UTC,
                    so a deadline INSTANT lost its time of day and arrived
                    unlabelled beside the question. Labelled, and formatted in
                    the reader's own zone. */}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("expiresLabel")} <FormattedDateTime value={row.expires_at} />
                </span>
              </div>
              {clarify?.context && <p className="text-xs text-muted-foreground">{clarify.context}</p>}
              {/* The runtime's own firm-visibility sentence, rendered exactly
                  as the chat card renders it (ClarifyCard.tsx:182). It repeats
                  the tab's `firmWideNote` in substance, and it is still the
                  writer's own text about THIS question — suppressing it would
                  be this panel deciding what Clara's warning is worth. */}
              {clarify?.framing && <p className="text-xs text-muted-foreground">{clarify.framing}</p>}
              {!clarify && (
                <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {JSON.stringify(row.question, null, 2)}
                </pre>
              )}
              {isActing && err && (
                <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner>
              )}
              <AnswerRow busy={busy} onAnswer={(answer, onOk) => onAnswer(row.id, answer, onOk)} />
              {/* T7 (port-wave plan §4: promote_clarify_to_question) —
                  offered ONLY once this row's own client_id genuinely
                  resolved; never a guessed scope_id. */}
              {onPromote && scopeClientId ? (
                <PromoteRow busy={busy} onConfirm={() => onPromote(row.id, scopeClientId)} />
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** F5 (independent review, RATIFIED AS-CONDUCTED, 2026-08-28): answer-
 *  interruption below is an INLINE textarea + submit button, not a
 *  JournalsDoorDialog. Conforming: §5's substance — one governed call
 *  (answerInterruption), a verbatim refusal in the persistent per-row banner
 *  (interruptions-panel.tsx's own `err`/`clr` attribution above), no
 *  composed batch — holds exactly as it does for every dialog-wrapped door
 *  in this file; a modal confirmation step buys nothing extra for a
 *  free-text answer a human already had to type once.
 *
 *  H-33: this control and the rail's own ClarifyCard form BOTH render on
 *  /clients/:id/journals — the workbench is the page, and RailMount is in
 *  app/(firm)/layout.tsx above it — and both shipped the accessible name
 *  "Your answer" from two different message keys. Two identically-named
 *  controls on one screen is the a11y defect; it also made
 *  `getByLabel("Your answer")` resolve two nodes under Playwright strict mode.
 *  NEITHER surface is suppressed — they are two legitimate altitudes on ONE
 *  door (ClarifyCard's own header: "a second caller of one door, never a
 *  second door") — so this one says WHERE it is instead, and the rail keeps
 *  the short name.
 *
 *  NOT CLOSED HERE, and named rather than left silent: the SUBMIT BUTTON on
 *  both surfaces still reads "Answer", so the same duplicate-accessible-name
 *  class survives one control over. Renaming it reds
 *  components/parts/clarify-card.test.tsx, which pins the pane's button by
 *  that exact text and belongs to another lane's file scope this session
 *  (裁-190 lane L3, components/parts/**). The label is the half H-33 names and
 *  the half the Playwright strict-mode collision turns on; the button is a
 *  one-line follow-up for whoever owns both files at once. */
function AnswerRow({ busy, onAnswer }: { busy: boolean; onAnswer: (answer: Record<string, unknown>, onOk: () => void) => void }) {
  const t = useTranslations("DraftsDocumentGovernance.interruptions");
  const [answer, setAnswer] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Textarea
        aria-label={t("answerLabel")}
        placeholder={t("answerPlaceholder")}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="min-h-16 flex-1"
      />
      <Button
        type="button"
        size="sm"
        disabled={busy || !answer.trim()}
        onClick={() => onAnswer({ text: answer.trim() }, () => setAnswer(""))}
      >
        {t("answerSubmit")}
      </Button>
    </div>
  );
}

/** T7 — the promote_clarify_to_question trigger, one door dialog, no fields
 *  of its own (the interruption's own text and the resolved client id are
 *  everything the door needs). */
function PromoteRow({ busy, onConfirm }: { busy: boolean; onConfirm: () => Promise<void> }) {
  const t = useTranslations("CodingQuestionsSignals.promoteClarify");
  return (
    <div className="flex justify-end">
      <CodingDoorDialog
        triggerLabel={t("trigger")}
        triggerVariant="secondary"
        title={t("dialogTitle")}
        description={t("dialogDescription")}
        confirmLabel={t("confirm")}
        busy={busy}
        onConfirm={onConfirm}
      />
    </div>
  );
}
