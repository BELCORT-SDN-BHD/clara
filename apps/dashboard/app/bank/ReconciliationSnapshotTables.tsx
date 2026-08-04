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
import type { ResolveAndBookBankLineDisposition } from "../shared/reconApi";
import { describeBankRefusal } from "./matchModel";
import { ExceptionBookingFields, type ResolveAndBookArgs } from "./ExceptionBookingFields";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import styles from "./bank.module.css";

// [round-3 fix] `ResolveAndBookArgs` and BOTH booking sub-forms now live in
// ExceptionBookingFields.tsx (file-size discipline + the walled-corridor fix
// this round landed). Re-exported so existing importers keep their one home.
export type { ResolveAndBookArgs };

/** A governed refusal as this surface carries it: the DB's verbatim message,
 *  its machine reason token, and — new in round 3 — the AXIS, because
 *  `booking_request_invalid` alone names six different mistakes. */
export type ExceptionActionErr = { id: string; message: string; reason: string | null; axis?: string | null };

export function SnapshotTables({
  snapshot, token, clientId,
  onResolveException, resolving, resolveErr, onResolveAndBook, resolvingBook, resolveBookErr,
}: {
  snapshot: BankReconciliationSnapshot;
  /** Threaded through to the settlement leg, which must read this client's
   *  counterparties and open items. Absent in the read-only (voided receipt)
   *  reuse, where no booking control renders at all. */
  token?: string | null;
  clientId?: string | null;
  onResolveException?: (exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) => void;
  resolving?: string | null;
  resolveErr?: ExceptionActionErr | null;
  /** design §4 the AF-2 composite (resolve_and_book_bank_line) — the two
   *  booking dispositions ONLY; `bank_corrective_line` stays on onResolveException. */
  onResolveAndBook?: (exceptionId: string, disposition: ResolveAndBookBankLineDisposition, note: string, args: ResolveAndBookArgs) => void;
  resolvingBook?: string | null;
  resolveBookErr?: ExceptionActionErr | null;
}) {
  const snap = snapshot;
  // [F15/CX6#4 fix] shapeOk gates FIRST, unconditionally — a known-but-
  // unmapped or an UNKNOWN collection must never read as "a clean period"
  // NOR render a partial table just because some mapped collection had a
  // row (shapeOk is an exact allowlist now; see reconSnapshotModel.ts).
  if (!snap.shapeOk) {
    return <p className={styles.errorText}>The reconciliation snapshot came back in an unexpected shape — showing nothing rather than claiming a clean period.</p>;
  }
  const hasAny = snap.outstanding_entries.length + snap.outstanding_group_items.length
    + snap.outstanding_lines.length + snap.exceptions.length + snap.opening_lineage.length > 0;
  if (!hasAny) {
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
            <ExceptionRow
              key={exc.exception_id} exc={exc} siblings={snap.exceptions} token={token ?? null} clientId={clientId ?? null}
              onResolve={onResolveException} busy={resolving === exc.exception_id} err={resolveErr?.id === exc.exception_id ? resolveErr : null}
              onResolveAndBook={onResolveAndBook} bookBusy={resolvingBook === exc.exception_id} bookErr={resolveBookErr?.id === exc.exception_id ? resolveBookErr : null}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

/** [D3 fix; AF-2 re-enable, Wave D-b design §4] exceptions items are
 *  ReconExceptionEntry, not a table row (real id is `exception_id`). All
 *  THREE dispositions are now reachable: `bank_corrective_line` keeps the
 *  existing counterpart-line flow (`onResolve` → resolve_bank_line_
 *  exception); `matched_booking`/`written_off_adjustment` now book via the
 *  AF-2 composite (`onResolveAndBook` → resolve_and_book_bank_line) — the
 *  same-transaction booking door design §4.2 previously flagged as an open
 *  question. Read-only (no controls rendered) when the caller omits both
 *  handlers — the [voided_receipt follow-up] reuse for a frozen, historical
 *  snapshot. A "resolution parked" badge renders whenever this exception's
 *  own `pending_resolution` is present (design §4's high-stakes park). */
function ExceptionRow({
  exc, siblings, token, clientId, onResolve, busy, err, onResolveAndBook, bookBusy, bookErr,
}: {
  exc: ReconExceptionEntry;
  siblings: ReconExceptionEntry[];
  token: string | null;
  clientId: string | null;
  onResolve?: (exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) => void;
  busy?: boolean;
  err?: { message: string; reason: string | null; axis?: string | null } | null;
  onResolveAndBook?: (exceptionId: string, disposition: ResolveAndBookBankLineDisposition, note: string, args: ResolveAndBookArgs) => void;
  bookBusy?: boolean;
  bookErr?: { message: string; reason: string | null; axis?: string | null } | null;
}) {
  const [disposition, setDisposition] = useState<BankLineExceptionDisposition>("bank_corrective_line");
  const [note, setNote] = useState("");
  const [counterpartLineId, setCounterpartLineId] = useState("");
  const open = exc.status === "open";
  const needsCounterpart = disposition === "bank_corrective_line";
  const isBookingDisposition = disposition === "matched_booking" || disposition === "written_off_adjustment";
  const candidates = siblings.filter((x) => x.exception_id !== exc.exception_id);
  const canSubmit = note.trim().length > 0 && (!needsCounterpart || counterpartLineId !== "");
  const parked = exc.pending_resolution !== null;

  return (
    <div className={styles.candidateRow} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className={styles.accountMain}>
        <span className={styles.accountName}>
          {exceptionKindLabel(exc.kind)} · line {shortId(exc.line_id)}
          {exc.amount_cents !== null ? ` · ${fmtCents(exc.amount_cents)}` : ""}
          <span className={`${styles.band} ${open ? styles.bandYou : styles.bandReady}`} style={{ marginLeft: "0.4rem" }}>{exc.status}</span>
          {parked ? <span className={`${styles.band} ${styles.bandReview}`} style={{ marginLeft: "0.3rem" }}>resolution parked</span> : null}
        </span>
        <span className={styles.accountSub}>{exc.entry_date ?? "—"}{exc.age_days !== null ? ` · ${exc.age_days}d` : ""}</span>
      </div>
      {parked ? (
        <p className={styles.hint}>
          Declared{exc.pending_resolution?.disposition ? ` — ${exceptionDispositionLabel(exc.pending_resolution.disposition)}` : ""}
          {exc.pending_resolution?.declared_at ? ` at ${new Date(exc.pending_resolution.declared_at).toLocaleString()}` : ""}; a checker must flip the pending line (complete/cancel, above) to finish it.
        </p>
      ) : null}
      {!open ? (
        <p className={styles.okText}>
          Resolved{exc.resolution_disposition ? ` — ${exceptionDispositionLabel(exc.resolution_disposition)}` : ""}
        </p>
      ) : (onResolve || onResolveAndBook) ? (
        <div className={styles.actions} style={{ flexWrap: "wrap" }}>
          <select className={styles.select} value={disposition} onChange={(e) => setDisposition(e.target.value as BankLineExceptionDisposition)} aria-label={`Disposition for exception ${exc.exception_id}`}>
            {EXCEPTION_DISPOSITIONS.map((d) => <option key={d} value={d}>{exceptionDispositionLabel(d)}</option>)}
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
          {needsCounterpart ? (
            <>
              <button className={styles.buttonSecondary} disabled={!onResolve || busy || !canSubmit} onClick={() => onResolve?.(exc.exception_id, disposition, note.trim(), counterpartLineId)}>
                {busy ? "Resolving…" : "Resolve (owner)"}
              </button>
              {candidates.length === 0 ? (
                <p className={styles.hint}>No other excepted line is available yet to name as the offsetting counterpart.</p>
              ) : null}
            </>
          ) : null}
          {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason, err.axis) ? ` — ${describeBankRefusal(err.reason, err.axis)}` : ""}</p> : null}
          {isBookingDisposition && onResolveAndBook ? (
            <ExceptionBookingFields
              token={token} clientId={clientId}
              exceptionId={exc.exception_id} lineAmountCents={exc.amount_cents}
              disposition={disposition} note={note} busy={!!bookBusy}
              onSubmit={(args) => onResolveAndBook(exc.exception_id, disposition, note.trim(), args)}
            />
          ) : null}
        </div>
      ) : null}
      {bookErr ? <p className={styles.errorText}>{bookErr.message}{describeBankRefusal(bookErr.reason, bookErr.axis) ? ` — ${describeBankRefusal(bookErr.reason, bookErr.axis)}` : ""}</p> : null}
    </div>
  );
}
