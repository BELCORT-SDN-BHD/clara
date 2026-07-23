"use client";

// The /queue split-view detail pane (contract §5 / WA-R6): a selected row resolves to
// its detail card. A draft with a document → the doc_review evidence surface (the
// primary detail per WA-R6); a draft without one → its revision history; an open
// question → the question card; an uncoded filing → its DB-computed lane + reasons.
// Every pane hydrates by identifier — the row payload carries ids only.

import type { QueueRow, ReviewCompliance } from "../shared/reviewTypes";
import { catalogEntryFor, FallbackDetail } from "../shared/queueKindCatalog";
import styles from "./queue.module.css";

// §3.6: every per-kind branch now lives in the queueKindCatalog (Detail renderers
// + the FallbackPanel they share) — this file only resolves a row's catalog entry
// and hands off. An unrecognised row_kind gets the SAME honest FallbackDetail a
// recognised-but-id-incomplete row would.
export function QueueDetail({ token, row, compliance, onChanged }: {
  token: string;
  row: QueueRow | null;
  compliance: ReviewCompliance | null;
  onChanged: () => void;
}) {
  if (!row) return <p className={styles.detailEmpty}>Select a row to see its detail — document, derivation, question, or lane.</p>;
  const Detail = catalogEntryFor(row.row_kind)?.Detail ?? FallbackDetail;
  return <Detail token={token} row={row} compliance={compliance} onChanged={onChanged} />;
}
