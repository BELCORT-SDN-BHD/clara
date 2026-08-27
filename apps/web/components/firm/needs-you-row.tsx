"use client";

// One clara.list_review_queue row (lib/firm/needs-you.ts), rendered honestly from
// exactly the fields the RPC projects — row_kind/section verbatim (this build's
// coordinator ruling), no relabeling. Only `open_question` rows carry an act door
// (resolve_open_question/dismiss_open_question) — every other row_kind is a
// same-page LINK into the object that actually owns its verbs (a draft's journals
// tab, a filing's documents tab, a coding task's documents tab), never a duplicated
// action here.
//
// FIX-1 (independent review, fix-required, 2026-08-27): the row_kind label used a
// `t(\`rowKind.${row.row_kind}\` as "rowKind.draft")` CAST, which compiles clean
// against tsc regardless of whether the key actually exists — exactly the "hides
// it from tsc" failure the review caught (four of the eight LIVE row kinds had no
// label and rendered as a raw next-intl key path, e.g. "NeedsYou.rowKind.
// staff_advance_incomplete", to a professional). Replaced with a CHECKED lookup
// against lib/firm/needs-you.ts's REVIEW_QUEUE_ROW_KINDS (the closed world, kept
// in the one module that also grounds it against the live DB body) with an honest
// "unrecognized" fallback for anything outside it — never a key path, never a
// silent cast.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/parts/PartBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtCents } from "@/lib/registers/money";
import { ErrorMessage } from "./data-state";
import { isKnownReviewQueueRowKind, type ReviewQueueRow } from "@/lib/firm/needs-you";

export function NeedsYouRow({
  row,
  busy,
  error,
  onResolve,
  onDismiss,
}: {
  row: ReviewQueueRow;
  busy: boolean;
  /** Attached to THIS row only when it was the one last acted on (N13) — a page-
   *  level banner would misattribute a refusal to whichever row a human looks at
   *  next. */
  error: unknown;
  onResolve: (questionId: string, resolution: string) => Promise<boolean>;
  onDismiss: (questionId: string, reason: string) => Promise<boolean>;
}) {
  const t = useTranslations("NeedsYou");
  const tc = useTranslations("Common");
  const [mode, setMode] = useState<"resolve" | "dismiss" | null>(null);
  const [text, setText] = useState("");

  const submit = async () => {
    if (!row.question_id || !text.trim()) return;
    const ok =
      mode === "resolve" ? await onResolve(row.question_id, text.trim()) : await onDismiss(row.question_id, text.trim());
    // N13: clear ONLY on success — a refusal must not discard what the human
    // typed; they should be able to see the refusal, adjust, and resubmit.
    if (ok) {
      setMode(null);
      setText("");
    }
  };

  const kindLabel = isKnownReviewQueueRowKind(row.row_kind)
    ? t(`rowKind.${row.row_kind}`)
    : t("rowKind.unknown", { kind: row.row_kind });

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={row.section === "needs_you" ? "info" : "neutral"}>
          {row.section === "needs_you" ? t("sectionNeedsYou") : t("sectionNeedsReview")}
        </Badge>
        <span className="font-medium text-card-foreground">{kindLabel}</span>
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
            <dd>{fmtCents(row.amount_cents, tc("centsUnsafe"))}</dd>
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
          {error ? <ErrorMessage error={error} /> : null}
          {/* P3 polish: five hand-rolled <button>s and one hand-rolled <input>
              became the Button/Input primitives. The verbs, the disabled
              conditions and the submit-clears-only-on-success rule above are
              untouched; what changes is that "commit" now looks like every
              other commit in the product (default variant), "cancel"/"open a
              form" like every other secondary act (outline), and both focus
              with the same ring. */}
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
      ) : null}
    </li>
  );
}
