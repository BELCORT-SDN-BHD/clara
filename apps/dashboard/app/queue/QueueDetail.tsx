"use client";

// The /queue split-view detail pane (contract §5 / WA-R6): a selected row resolves to
// its detail card. A draft with a document → the doc_review evidence surface (the
// primary detail per WA-R6); a draft without one → its revision history; an open
// question → the question card; an uncoded filing → its DB-computed lane + reasons.
// Every pane hydrates by identifier — the row payload carries ids only.

import { useCallback } from "react";
import type { QueueRow, ReviewCompliance } from "../shared/reviewTypes";
import { getCodingLane } from "../shared/reviewApi";
import { laneReasonCopy, type CodingLane } from "../shared/reviewCardTypes";
import { useCard } from "../shared/cards/cardHooks";
import { DocReviewCard } from "../shared/cards/DocReviewCard";
import { DiffCard } from "../shared/cards/DiffCard";
import { OpenQuestionCard } from "../shared/cards/OpenQuestionCard";
import { ComplianceWatchCard } from "../shared/cards/ComplianceWatchCard";
import { matchComplianceClient, parseServiceGroup } from "../shared/cards/complianceWatch";
import { shortId } from "../shared/fmt";
import styles from "./queue.module.css";

function LaneSummary({ token, clientId, filingId }: { token: string; clientId: string; filingId: string }) {
  const loader = useCallback((t: string): Promise<CodingLane> => getCodingLane(t, clientId, filingId), [clientId, filingId]);
  const { data, loading, err } = useCard(token, loader);
  const band = data?.lane === "ready" ? styles.bandReady : data?.lane === "needs_you" ? styles.bandYou : styles.bandReview;
  return (
    <div>
      <div className={styles.sectionHeader}>Uncoded filing · {shortId(filingId)}</div>
      {loading && !data ? <p className={styles.muted}>Loading lane…</p> : null}
      {data ? (
        <>
          <p><span className={`${styles.band} ${band}`}>{data.lane ?? "—"}</span></p>
          {data.reasons.length > 0 ? (
            <ul>
              {/* An uncoded filing carries no coding_kind — direction is unknowable here,
                  so the lane copy keeps the AP-loop wording (§6.2: never guess). */}
              {data.reasons.map((r, i) => <li key={i} className={styles.muted}>{laneReasonCopy(r, null)}</li>)}
            </ul>
          ) : <p className={styles.muted}>No blocking reasons — eligible to draft.</p>}
        </>
      ) : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}

export function QueueDetail({ token, row, compliance, onChanged }: {
  token: string;
  row: QueueRow | null;
  compliance: ReviewCompliance | null;
  onChanged: () => void;
}) {
  if (!row) return <p className={styles.detailEmpty}>Select a row to see its detail — document, derivation, question, or lane.</p>;

  if (row.row_kind === "open_question" && row.question_id) {
    return <OpenQuestionCard token={token} part={{ type: "open_question", question_id: row.question_id, client_id: row.client_id ?? "" }} />;
  }
  if (row.row_kind === "compliance_watch" && row.watch_id) {
    // Hydrate from the queue envelope — no get_compliance_watch fn exists (0016). Match
    // the client entry by client_id + the parsed service group (else the tier).
    const client = compliance
      ? matchComplianceClient(compliance.clients, {
          clientId: row.client_id,
          serviceGroup: parseServiceGroup(row.question_text),
          tier: row.tier,
        })
      : null;
    return <ComplianceWatchCard token={token} row={row} client={client} watchId={row.watch_id} onChanged={onChanged} />;
  }
  if (row.row_kind === "draft" && row.entry_id) {
    if (row.document_id) {
      return <DocReviewCard token={token} part={{ type: "doc_review", document_id: row.document_id, entry_id: row.entry_id, client_id: row.client_id ?? "" }} />;
    }
    return <DiffCard token={token} part={{ type: "diff", entry_id: row.entry_id, client_id: row.client_id ?? "" }} />;
  }
  if (row.row_kind === "uncoded_filing" && row.filing_id && row.client_id) {
    return <LaneSummary token={token} clientId={row.client_id} filingId={row.filing_id} />;
  }
  // coding_task (or any row without a richer detail): honest minimal panel.
  return (
    <div>
      <div className={styles.sectionHeader}>{row.row_kind.replace(/_/g, " ")} · {shortId(row.id)}</div>
      <p className={styles.muted}>
        {row.client_id ? `client ${shortId(row.client_id)}` : ""}
        {row.document_id ? ` · document ${shortId(row.document_id)}` : ""}
        {row.task_id ? ` · task ${shortId(row.task_id)}` : ""}
      </p>
      <p className={styles.detailEmpty}>Work this item from the documents workspace — no inline detail surface yet.</p>
    </div>
  );
}
