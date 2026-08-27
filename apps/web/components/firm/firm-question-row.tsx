"use client";

// One clara.firm_open_questions_visible row (lib/firm/needs-you-gaps.ts).
// resolve_firm_question/dismiss_firm_question are the only two act doors this
// carrier has — the resolve form's optional client select writes `p_client`
// (nullable at the door); dismiss structurally cannot name a client
// (ck_firm_open_questions_dismissed_names_nobody, 0103:591-592), so its form
// carries no client control at all. `candidates` has a documented shape for
// only ONE kind ('collision', frontend-handoff-addendum-2026-08-24.md §2) —
// rendered generically here rather than assuming a shape the DB does not
// commit to for the other five.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/common/native-select";
import { Badge } from "@/components/parts/PartBadge";
import { businessDateTime } from "@/lib/business-date";
import { isKnownFirmQuestionKind, type FirmOpenQuestionRow } from "@/lib/firm/needs-you-gaps";
import type { ClientRow } from "@/lib/firm/reads";
import { ErrorMessage } from "./data-state";

export function FirmQuestionRow({
  row,
  busy,
  error,
  clients,
  clientsUnavailable,
  onResolve,
  onDismiss,
}: {
  row: FirmOpenQuestionRow;
  busy: boolean;
  /** Attached to THIS row only when it was the one last acted on — a page-
   *  level banner would misattribute a refusal to whichever row is on screen. */
  error: unknown;
  clients: ClientRow[];
  clientsUnavailable: boolean;
  onResolve: (questionId: string, resolution: string, clientId: string | null) => Promise<boolean>;
  onDismiss: (questionId: string, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"resolve" | "dismiss" | null>(null);
  const [text, setText] = useState("");
  const [clientId, setClientId] = useState("");

  const reset = () => {
    setMode(null);
    setText("");
    setClientId("");
  };

  const submit = async () => {
    if (!text.trim()) return;
    const ok =
      mode === "resolve" ? await onResolve(row.id, text.trim(), clientId || null) : await onDismiss(row.id, text.trim());
    // Clear only on success — a refusal must not discard what the human typed.
    if (ok) reset();
  };

  const kindLabel = isKnownFirmQuestionKind(row.kind) ? t(`firmQuestionKind.${row.kind}`) : t("firmQuestionKind.unknown", { kind: row.kind });
  const candidateCount = Array.isArray(row.candidates) ? row.candidates.length : 0;

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{kindLabel}</Badge>
        <span className="text-xs text-muted-foreground">{businessDateTime(row.opened_at)}</span>
      </div>
      <p className="text-card-foreground">{row.question_text}</p>
      {candidateCount > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary>{t("candidatesLabel", { count: candidateCount })}</summary>
          <pre className="mt-1 overflow-x-auto wrap-anywhere whitespace-pre-wrap">{JSON.stringify(row.candidates, null, 2)}</pre>
        </details>
      ) : null}
      <div className="flex flex-col gap-2">
        {error ? <ErrorMessage error={error} /> : null}
        {mode ? (
          <div className="flex flex-col gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
              aria-label={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
              disabled={busy}
            />
            {mode === "resolve" ? (
              clientsUnavailable ? (
                <p className="text-xs text-muted-foreground">{t("namedClientUnavailable")}</p>
              ) : (
                <NativeSelect
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  disabled={busy}
                  aria-label={t("namedClientLabel")}
                  className="w-full"
                >
                  <option value="">{t("namedClientNone")}</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )
            ) : null}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void submit()} disabled={busy || !text.trim()}>
                {busy ? t("submitting") : t("submit")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={reset} disabled={busy}>
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
    </li>
  );
}
