"use client";

// SnapshotTables + ExceptionRow — split out of ReconciliationPanel.tsx (repo
// file-size discipline, the matchModel.ts/model.ts precedent). Renders ONE
// snapshot (BankReconciliationSnapshot) — the live receipt/preview's own, OR
// [voided_receipt follow-up] a voided receipt's frozen one, reused read-only
// by passing no onResolveException. Every figure is DB-owned, rendered
// verbatim; the only client behaviour is the disposition/counterpart PICKER
// state inside ExceptionRow, never a computed figure.

import { useState } from "react";
import {
  exceptionDispositionLabel, exceptionKindLabel, EXCEPTION_DISPOSITIONS,
  type BankReconciliationSnapshot, type ReconExceptionEntry, type BankLineExceptionDisposition,
} from "./reconModel";
import { describeBankRefusal } from "./matchModel";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import styles from "./bank.module.css";

export function SnapshotTables({
  snapshot, onResolveException, resolving, resolveErr,
}: {
  snapshot: BankReconciliationSnapshot;
  onResolveException?: (exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) => void;
  resolving?: string | null;
  resolveErr?: { id: string; message: string; reason: string | null } | null;
}) {
  const snap = snapshot;
  const hasAny = snap.outstanding_entries.length + snap.outstanding_group_items.length
    + snap.outstanding_lines.length + snap.exceptions.length + snap.opening_lineage.length > 0;
  if (!hasAny) {
    // [D7 fix] a known-but-unmapped collection must never read as "a clean
    // period" — shapeOk is false only when the raw snapshot is missing one
    // of the five collections this mapper expects as an array.
    if (!snap.shapeOk) {
      return <p className={styles.errorText}>The reconciliation snapshot came back in an unexpected shape — showing nothing rather than claiming a clean period.</p>;
    }
    return <p className={styles.emptyState}>Nothing outstanding, excepted, or carried from opening — a clean period.</p>;
  }
  return (
    <>
      {snap.outstanding_entries.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Outstanding entry-side ({snap.outstanding_entries.length})</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>entry</th><th>posting date</th><th className={styles.num}>amount</th><th className={styles.num}>age</th></tr></thead>
              <tbody>
                {snap.outstanding_entries.map((e) => (
                  <tr key={e.entry_id}>
                    <td>{shortId(e.entry_id)}</td><td>{e.posting_date ?? "—"}</td>
                    <td className={styles.num}>{fmtCents(e.amount_cents)}</td>
                    <td className={styles.num}>{e.age_days ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* [D7 fix] previously dropped entirely — the group-item residuals of
          a mixed group (part cleared, part not). */}
      {snap.outstanding_group_items.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Outstanding group items ({snap.outstanding_group_items.length})</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>match</th><th>anchor date</th><th className={styles.num}>uncleared</th><th className={styles.num}>age</th></tr></thead>
              <tbody>
                {snap.outstanding_group_items.map((g) => (
                  <tr key={g.match_id}>
                    <td>{shortId(g.match_id)}</td><td>{g.anchor_date ?? "—"}</td>
                    <td className={styles.num}>{fmtDeltaCents(g.uncleared_cents)}</td>
                    <td className={styles.num}>{g.age_days ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {snap.outstanding_lines.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Outstanding line-side ({snap.outstanding_lines.length})</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>line</th><th>entry date</th><th>description</th><th className={styles.num}>amount</th><th className={styles.num}>age</th></tr></thead>
              <tbody>
                {snap.outstanding_lines.map((l) => (
                  <tr key={l.line_id}>
                    <td>{shortId(l.line_id)}</td><td>{l.entry_date ?? "—"}</td><td>{l.description ?? "—"}</td>
                    <td className={styles.num}>{fmtCents(l.amount_cents)}</td>
                    <td className={styles.num}>{l.age_days ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {snap.opening_lineage.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Opening carry-down lineage ({snap.opening_lineage.length})</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>opening item</th><th>ref</th><th>date</th><th>entry</th></tr></thead>
              <tbody>
                {snap.opening_lineage.map((o) => (
                  <tr key={o.opening_item_id}>
                    <td>{shortId(o.opening_item_id)}</td><td>{o.item_ref ?? "—"}</td><td>{o.item_date ?? "—"}</td>
                    <td>{o.entry_id ? shortId(o.entry_id) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {snap.exceptions.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Exceptions ({snap.exceptions.length})</p>
          {snap.exceptions.map((exc) => (
            <ExceptionRow key={exc.exception_id} exc={exc} siblings={snap.exceptions} onResolve={onResolveException} busy={resolving === exc.exception_id} err={resolveErr?.id === exc.exception_id ? resolveErr : null} />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** [D3 fix] exceptions items are ReconExceptionEntry, not a table row (real
 *  id is `exception_id`). `matched_booking`/`written_off_adjustment` are
 *  OFFERED-BUT-DISABLED — no composite same-txn booking verb exists yet
 *  (design §4.2 open question); `bank_corrective_line` is the only reachable
 *  disposition and the default, naming a counterpart from this exception's
 *  siblings in the same snapshot. Read-only (no controls rendered) when the
 *  caller omits `onResolve` — the [voided_receipt follow-up] reuse for a
 *  frozen, historical snapshot. */
function ExceptionRow({
  exc, siblings, onResolve, busy, err,
}: {
  exc: ReconExceptionEntry;
  siblings: ReconExceptionEntry[];
  onResolve?: (exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) => void;
  busy?: boolean;
  err?: { message: string; reason: string | null } | null;
}) {
  const [disposition, setDisposition] = useState<BankLineExceptionDisposition>("bank_corrective_line");
  const [note, setNote] = useState("");
  const [counterpartLineId, setCounterpartLineId] = useState("");
  const open = exc.status === "open";
  const needsCounterpart = disposition === "bank_corrective_line";
  const candidates = siblings.filter((x) => x.exception_id !== exc.exception_id);
  const canSubmit = note.trim().length > 0 && (!needsCounterpart || counterpartLineId !== "");
  return (
    <div className={styles.candidateRow} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className={styles.accountMain}>
        <span className={styles.accountName}>
          {exceptionKindLabel(exc.kind)} · line {shortId(exc.line_id)}
          {exc.amount_cents !== null ? ` · ${fmtCents(exc.amount_cents)}` : ""}
          <span className={`${styles.band} ${open ? styles.bandYou : styles.bandReady}`} style={{ marginLeft: "0.4rem" }}>{exc.status}</span>
        </span>
        <span className={styles.accountSub}>{exc.entry_date ?? "—"}{exc.age_days !== null ? ` · ${exc.age_days}d` : ""}</span>
      </div>
      {!open ? (
        <p className={styles.okText}>
          Resolved{exc.resolution_disposition ? ` — ${exceptionDispositionLabel(exc.resolution_disposition)}` : ""}
        </p>
      ) : onResolve ? (
        <div className={styles.actions} style={{ flexWrap: "wrap" }}>
          <select className={styles.select} value={disposition} onChange={(e) => setDisposition(e.target.value as BankLineExceptionDisposition)} aria-label={`Disposition for exception ${exc.exception_id}`}>
            {EXCEPTION_DISPOSITIONS.map((d) => (
              <option key={d} value={d} disabled={d !== "bank_corrective_line"}>
                {exceptionDispositionLabel(d)}{d !== "bank_corrective_line" ? " — book the match first, a composite verb is owed" : ""}
              </option>
            ))}
          </select>
          {needsCounterpart ? (
            <select className={styles.select} value={counterpartLineId} onChange={(e) => setCounterpartLineId(e.target.value)} aria-label={`Counterpart line for exception ${exc.exception_id}`}>
              <option value="">Select the offsetting counterpart line…</option>
              {candidates.map((c) => (
                <option key={c.exception_id} value={c.line_id}>
                  line {shortId(c.line_id)} · {exceptionKindLabel(c.kind)}{c.amount_cents !== null ? ` · ${fmtCents(c.amount_cents)}` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <input className={styles.input} placeholder="Resolution note" value={note} onChange={(e) => setNote(e.target.value)} aria-label={`Resolution note for exception ${exc.exception_id}`} style={{ flex: 1 }} />
          <button className={styles.buttonSecondary} disabled={busy || !canSubmit} onClick={() => onResolve(exc.exception_id, disposition, note.trim(), needsCounterpart ? counterpartLineId : null)}>
            {busy ? "Resolving…" : "Resolve (owner)"}
          </button>
          {needsCounterpart && candidates.length === 0 ? (
            <p className={styles.hint}>No other excepted line is available yet to name as the offsetting counterpart.</p>
          ) : null}
        </div>
      ) : null}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}
