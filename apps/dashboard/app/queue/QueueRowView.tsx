"use client";

// One queue row (DIRECTION §4.3 List model): a scannable line with right-aligned
// trust accessories — lane band (shape + label, never a digit), AUTO/RULE/HIGH
// badges, the DB-computed amount (safe-integer guarded), period, and an evidence dot.
// A selectable routine draft carries a checkbox; clicking it toggles batch selection
// without opening the detail. The amount is a DB figure — the row never computes one.

import type { QueueRow } from "../shared/reviewTypes";
import { fmtCents, shortId } from "../shared/fmt";
import { directionOf, counterpartyNoun } from "../shared/direction";
import { tierBand } from "../shared/cards/complianceWatch";
import styles from "./queue.module.css";

function bandFor(row: QueueRow): { label: string; cls: string } {
  const lane = row.lane ?? (row.section === "needs_you" ? "needs_you" : "needs_review");
  if (lane === "ready") return { label: "ready", cls: styles.bandReady ?? "" };
  if (lane === "needs_you") return { label: "needs you", cls: styles.bandYou ?? "" };
  return { label: "needs review", cls: styles.bandReview ?? "" };
}

function titleFor(row: QueueRow): string {
  switch (row.row_kind) {
    case "open_question": return row.question_text ?? "Open question";
    case "draft": return `Draft · ${shortId(row.entry_id)}`;
    case "uncoded_filing": return `Uncoded filing · ${shortId(row.filing_id)}`;
    case "coding_task": return `Coding task · ${shortId(row.task_id)}`;
    case "compliance_watch": return row.question_text ?? "SST registration watch";
    default: return `${row.row_kind} · ${shortId(row.id)}`;
  }
}

// §6.2: the counterparty subtitle noun follows the row's direction (sales → customer,
// purchase/unknown → vendor).
function counterpartySub(row: QueueRow): string {
  return `${counterpartyNoun(directionOf(row.coding_kind))} ${shortId(row.counterparty_id)}`;
}

export function QueueRowView({ row, active, selectable, selected, onOpen, onToggleSelect }: {
  row: QueueRow;
  active: boolean;
  selectable: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}) {
  const band = bandFor(row);
  return (
    <div className={`${styles.row} ${active ? styles.rowActive : ""}`} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
      {selectable ? (
        <input className={styles.rowCheck} type="checkbox" aria-label={`select ${shortId(row.id)}`} checked={selected}
          onClick={(e) => e.stopPropagation()} onChange={onToggleSelect} />
      ) : <span className={styles.rowCheck} aria-hidden />}
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>{titleFor(row)}</span>
        <span className={styles.rowSub}>
          {row.client_id ? `client ${shortId(row.client_id)}` : "unattributed"}
          {row.counterparty_id ? ` · ${counterpartySub(row)}` : ""}
          {row.aged_since ? ` · aging since ${new Date(row.aged_since).toLocaleDateString()}` : ""}
        </span>
      </span>
      <span className={styles.rowAccessories}>
        {row.auto ? <span className={`${styles.badge} ${styles.badgeAuto}`}>auto</span> : null}
        {row.rule_backed ? <span className={`${styles.badge} ${styles.badgeRule}`}>rule</span> : null}
        {row.high_stakes ? <span className={`${styles.badge} ${styles.badgeHigh}`}>high-stakes</span> : null}
        {row.row_kind === "compliance_watch" ? (() => {
          const tb = tierBand(row.tier);
          const cls = tb.tone === "alarm" ? styles.bandYou : tb.tone === "warn" ? styles.bandReview : "";
          return <span className={`${styles.band} ${cls ?? ""}`}>{tb.label}</span>;
        })() : null}
        <span className={`${styles.band} ${band.cls}`}>{band.label}</span>
        {row.amount_cents !== null ? <span className={styles.rowAmount}>{fmtCents(row.amount_cents)}</span> : null}
        {row.period ? <span className={styles.rowPeriod}>{row.period}</span> : null}
        <span className={row.document_id ? styles.evidenceDot : styles.evidenceDotNone} title={row.document_id ? "has a source document" : "no source document"} />
      </span>
    </div>
  );
}
