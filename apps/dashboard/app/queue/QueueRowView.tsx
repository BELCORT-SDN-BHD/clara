"use client";

// One queue row (DIRECTION §4.3 List model): a scannable line with right-aligned
// trust accessories — lane band (shape + label, never a digit), AUTO/RULE/HIGH
// badges, the DB-computed amount (safe-integer guarded), period, and an evidence dot.
// A selectable routine draft carries a checkbox; clicking it toggles batch selection
// without opening the detail. The amount is a DB figure — the row never computes one.

import type { QueueRow } from "../shared/reviewTypes";
import { fmtCents, shortId } from "../shared/fmt";
import { directionOf, counterpartyNoun } from "../shared/direction";
import { catalogEntryFor, degradeTitle } from "../shared/queueKindCatalog";
import styles from "./queue.module.css";

function bandFor(row: QueueRow): { label: string; cls: string } {
  const lane = row.lane ?? (row.section === "needs_you" ? "needs_you" : "needs_review");
  if (lane === "ready") return { label: "ready", cls: styles.bandReady ?? "" };
  if (lane === "needs_you") return { label: "needs you", cls: styles.bandYou ?? "" };
  return { label: "needs review", cls: styles.bandReview ?? "" };
}

// §3.6: the per-kind title switch collapses into the queueKindCatalog — an
// unrecognised row_kind degrades to the honest id-only label.
function titleFor(row: QueueRow): string {
  return catalogEntryFor(row.row_kind)?.title(row) ?? degradeTitle(row);
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
  const RowAccessory = catalogEntryFor(row.row_kind)?.RowAccessory ?? null;
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
        {RowAccessory ? <RowAccessory row={row} /> : null}
        <span className={`${styles.band} ${band.cls}`}>{band.label}</span>
        {row.amount_cents !== null ? <span className={styles.rowAmount}>{fmtCents(row.amount_cents)}</span> : null}
        {row.period ? <span className={styles.rowPeriod}>{row.period}</span> : null}
        <span className={row.document_id ? styles.evidenceDot : styles.evidenceDotNone} title={row.document_id ? "has a source document" : "no source document"} />
      </span>
    </div>
  );
}
