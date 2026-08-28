"use client";

// The open_question inline act — resolve/dismiss on clara.list_review_queue's
// one row kind that has ever carried one. Extracted verbatim out of
// needs-you-row.tsx (behavior unchanged) as the FIRST entry in the row-kind
// affordance registry (./needs-you-affordances.tsx, T0 seam, port-wave plan
// §3.2) — the pattern every later train's own inline affordance copies: its
// own file, registered by one line in that table, never a branch added to
// needs-you-row.tsx itself.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dismissOpenQuestion, resolveOpenQuestion } from "@/lib/firm/needs-you";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";
import { OpenQuestionDetail } from "./open-question-detail";
import type { NeedsYouAffordanceProps } from "./needs-you-affordances";

export function OpenQuestionAffordance({ row, busy, error, act }: NeedsYouAffordanceProps) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"resolve" | "dismiss" | null>(null);
  const [text, setText] = useState("");

  if (!row.question_id) return null;
  const questionId = row.question_id;

  const submit = async () => {
    if (!text.trim()) return;
    const resolution = text.trim();
    const ok = await act(() =>
      (mode === "resolve"
        ? resolveOpenQuestion(sessionTokenAccessor, questionId, resolution)
        : dismissOpenQuestion(sessionTokenAccessor, questionId, resolution)
      ).then(() => undefined),
    );
    // N13: clear ONLY on success — a refusal must not discard what the human
    // typed; they should be able to see the refusal, adjust, and resubmit.
    if (ok) {
      setMode(null);
      setText("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {error ? <ErrorMessage error={error} /> : null}
      {/* T7 (port-wave plan §4) — clara.get_open_question, on demand. */}
      <OpenQuestionDetail questionId={questionId} />
      {mode ? (
        <div className="flex flex-col gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
            aria-label={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !text.trim()}>
              {busy ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setMode(null);
                setText("");
              }}
              disabled={busy}
            >
              {tc("cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("resolve")} disabled={busy}>
            {t("resolve")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("dismiss")} disabled={busy}>
            {t("dismiss")}
          </Button>
        </div>
      )}
    </div>
  );
}
