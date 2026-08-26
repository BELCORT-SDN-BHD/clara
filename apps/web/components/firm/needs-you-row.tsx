"use client";

// One clara.list_review_queue row (lib/firm/needs-you.ts), rendered honestly from
// exactly the fields the RPC projects — row_kind/section verbatim (this build's
// coordinator ruling), no relabeling. Only `open_question` rows carry an act door
// (resolve_open_question/dismiss_open_question) — every other row_kind is a
// same-page LINK into the object that actually owns its verbs (a draft's journals
// tab, a filing's documents tab, a coding task's documents tab), never a duplicated
// action here.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/parts/PartBadge";
import { fmtCents } from "@/lib/registers/money";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

export function NeedsYouRow({
  row,
  busy,
  onResolve,
  onDismiss,
}: {
  row: ReviewQueueRow;
  busy: boolean;
  onResolve: (questionId: string, resolution: string) => void;
  onDismiss: (questionId: string, reason: string) => void;
}) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"resolve" | "dismiss" | null>(null);
  const [text, setText] = useState("");

  const submit = () => {
    if (!row.question_id || !text.trim()) return;
    if (mode === "resolve") onResolve(row.question_id, text.trim());
    else if (mode === "dismiss") onDismiss(row.question_id, text.trim());
    setMode(null);
    setText("");
  };

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={row.section === "needs_you" ? "info" : "neutral"}>
          {row.section === "needs_you" ? t("sectionNeedsYou") : t("sectionNeedsReview")}
        </Badge>
        <span className="font-medium text-card-foreground">{t(`rowKind.${row.row_kind}` as "rowKind.draft")}</span>
        {row.high_stakes ? <Badge tone="error">{t("highStakes")}</Badge> : null}
        {row.client_id ? (
          <Link href={`/clients/${row.client_id}`} className="text-xs text-primary underline-offset-4 hover:underline">
            {t("openClient")}
          </Link>
        ) : null}
      </div>
      {row.question_text ? <p className="text-card-foreground">{row.question_text}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {row.amount_cents != null ? (
          <>
            <dt>{t("amountLabel")}</dt>
            <dd>{fmtCents(row.amount_cents)}</dd>
          </>
        ) : null}
        {row.period ? (
          <>
            <dt>{t("periodLabel")}</dt>
            <dd>{row.period}</dd>
          </>
        ) : null}
      </dl>
      {row.row_kind === "open_question" && row.question_id ? (
        <div className="flex flex-col gap-2">
          {mode ? (
            <div className="flex flex-col gap-2">
              <input
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={mode === "resolve" ? t("resolutionPlaceholder") : t("reasonPlaceholder")}
                disabled={busy}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  onClick={submit}
                  disabled={busy || !text.trim()}
                >
                  {busy ? t("submitting") : t("submit")}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2.5 py-1 text-xs"
                  onClick={() => {
                    setMode(null);
                    setText("");
                  }}
                  disabled={busy}
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1 text-xs"
                onClick={() => setMode("resolve")}
                disabled={busy}
              >
                {t("resolve")}
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1 text-xs"
                onClick={() => setMode("dismiss")}
                disabled={busy}
              >
                {t("dismiss")}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
