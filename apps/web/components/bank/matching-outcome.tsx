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
// #990 (owner ruling 2026-09-20): the outcome block ALSO names the line's own source citation —
// the printed page, on the machine (OCR/witness) intake lane, when one is present — and an
// explicit sentence (never a blank) on every other state. `lib/bank/citation.ts`'s
// `citationLabel` is the ONE place that decides which sentence, shared with the detail pane
// (`matching-section.tsx`'s `srcCitation` row) so the two surfaces can never render a different
// verdict for the same line. Superseded: this block used to stop at the statement and filename
// because `bank_statement_lines` carried no page/region column at all (0038's own residual);
// migration 0291 closed that gap.

import { useTranslations } from "next-intl";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMyr } from "@/lib/bank/money";
import { citationLabel } from "@/lib/bank/citation";
import type { MatchReceipt } from "@/lib/bank/matching-context-types";

export function MatchingOutcome({
  receipt,
  filename,
  counterpartyName,
  ingestMode = null,
  citationPage = null,
}: {
  receipt: MatchReceipt;
  /** The statement's own filename, from the context read. Absent is rendered as absent. */
  filename?: string | null;
  /** The matched candidate's counterparty, when the candidate carried one. */
  counterpartyName?: string | null;
  /** #990 — the matched line's own statement `ingest_mode`, from the same context read, so this
   *  block can state the SAME citation verdict the detail pane already showed for this line. */
  ingestMode?: string | null;
  /** #990 — the matched line's own `citation_page`, from the same context read. */
  citationPage?: number | null;
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

          <dt className="text-muted-foreground">{t("outcomeCitation")}</dt>
          <dd data-testid="matching-outcome-citation">{citationLabel(t, ingestMode, citationPage)}</dd>

          {/* The operation key this decision was submitted under (review A6). It is what a
              human quotes to name "the operation I already ran" — to a colleague, to support,
              or to themselves after a lost response — and it is the key the receipt is stored
              under in clara.op_receipts. It is the key the CLIENT sent, not a field the door
              echoes: `_finish_op`'s payload carries no op_key, and the label says "operation
              key" rather than claiming the receipt reported it. */}
          <dt className="text-muted-foreground">{t("outcomeOpKey")}</dt>
          <dd className="break-all font-mono" data-testid="matching-outcome-op-key">
            {typeof receipt.op_key === "string" && receipt.op_key.length > 0 ? receipt.op_key : "—"}
          </dd>
        </dl>
      </AlertDescription>
    </Alert>
  );
}
