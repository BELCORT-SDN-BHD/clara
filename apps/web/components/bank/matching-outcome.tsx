"use client";

// #657 · AC5 — THE PERSISTENT OUTCOME. Not a toast.
//
// A match is a governed act with a receipt, and the human's next question is always the same
// one: "did that create a second cash entry?" So the answer stays on screen until the human
// starts a new decision, and it names the objects: the line, the pre-existing journal entry,
// the match allocation, the receipt's operation key, and the bank account.
//
// THE SENTENCE IS SOURCED, NOT ASSERTED. "No new cash entry was created" is rendered from the
// door's OWN `new_journal_entries` field (migration 0226 §6 put it there, valued from what the
// act actually created), never from this component reasoning about what a match is supposed to
// do. If the door ever reports a non-zero count — a match closed with a named adjustment leg,
// which is a DIFFERENT act — this block says so in the same place, with the same prominence,
// rather than repeating a reassurance that has stopped being true.
//
// WHAT IT DOES NOT CLAIM. Region/page citations: 0038's own lane contract states verbatim that
// per-line region citations are not carried, and `bank_statement_lines` has no page or region
// column — so this block names the STATEMENT and the FILENAME and stops. That residual is #657's
// and is named in its report, not papered over with an invented page number.

import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMyr } from "@/lib/bank/money";
import type { MatchReceipt } from "@/lib/bank/matching-context-types";

export function MatchingOutcome({
  receipt,
  filename,
  counterpartyName,
}: {
  receipt: MatchReceipt;
  /** The statement's own filename, from the context read. Absent is rendered as absent. */
  filename?: string | null;
  /** The matched candidate's counterparty, when the candidate carried one. */
  counterpartyName?: string | null;
}) {
  const t = useTranslations("ClientBank.matching");
  const created = Number(receipt.new_journal_entries ?? 0);
  const settlements = Number(receipt.settlement_objects ?? 0);
  const entryIds = Array.isArray(receipt.entry_ids) ? receipt.entry_ids : [];
  const lineIds = Array.isArray(receipt.line_ids) ? receipt.line_ids : [];

  return (
    <Alert
      // A result a human must be able to come back to: announced once, then readable.
      role="status"
      aria-live="polite"
      data-testid="matching-outcome"
      variant={created === 0 ? "default" : "destructive"}
    >
      <AlertTitle>{t("outcomeTitle")}</AlertTitle>
      <AlertDescription>
        <p data-testid="matching-outcome-no-new-cash">
          {created === 0 && settlements === 0 ? t("outcomeNoNewCash") : t("outcomeCreated", { count: created })}
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">{t("outcomeMatchId")}</dt>
          <dd className="break-all font-mono">{receipt.match_id ?? receipt.id ?? "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeLines")}</dt>
          <dd className="break-all font-mono">{lineIds.length > 0 ? lineIds.join(", ") : "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeEntries")}</dt>
          <dd className="break-all font-mono">{entryIds.length > 0 ? entryIds.join(", ") : "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeAmount")}</dt>
          <dd>{typeof receipt.line_cents === "number" ? formatMyr(receipt.line_cents) : "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeAccountCode")}</dt>
          <dd className="font-mono">{receipt.account_code ?? "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeCounterparty")}</dt>
          <dd>{counterpartyName ?? "—"}</dd>

          <dt className="text-muted-foreground">{t("outcomeSource")}</dt>
          <dd className="break-all">{filename ?? "—"}</dd>
        </dl>
      </AlertDescription>
    </Alert>
  );
}
