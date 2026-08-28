"use client";

// T6 (port-wave plan §4/§5) — the "Clarifications" tab: pending
// `agent_interruptions` (clara.answer_interruption's own target), rendered
// FIRM-WIDE and labeled honestly as such (lib/journals/types.ts's own header
// — the table carries no client_id column, so a per-client filter cannot
// exist on the human read side). `question` is an opaque agent-authored
// jsonb with no fixed schema anywhere in the catalog; this panel renders
// `question.text` when present (the runtime's own clarify-hook convention)
// and falls back to the raw JSON, honestly, rather than inventing a shape it
// cannot prove.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, StateBanner } from "@/components/common/state";
import { FormattedDate } from "./formatted-date";
import type { AgentInterruptionRow } from "@/lib/journals/types";
import type { PartClr } from "@/lib/parts/hooks";

function questionText(question: Record<string, unknown>): string | null {
  const v = question.text;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function InterruptionsPanel({
  interruptions,
  busy,
  err,
  clr,
  actingId,
  onAnswer,
}: {
  interruptions: AgentInterruptionRow[];
  busy: boolean;
  err: string | null;
  clr: PartClr;
  actingId: string | null;
  onAnswer: (interruptionId: string, answer: Record<string, unknown>, onOk: () => void) => void;
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
        const text = questionText(row.question);
        return (
          <Card key={row.id} className="enter-content">
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-foreground">{text ?? t("questionOpaque")}</span>
                <span className="text-xs text-muted-foreground">
                  <FormattedDate value={row.expires_at} />
                </span>
              </div>
              {!text && (
                <pre className="max-w-full overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {JSON.stringify(row.question, null, 2)}
                </pre>
              )}
              {isActing && err && (
                <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner>
              )}
              <AnswerRow busy={busy} onAnswer={(answer, onOk) => onAnswer(row.id, answer, onOk)} />
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
 *  free-text answer a human already had to type once. */
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
