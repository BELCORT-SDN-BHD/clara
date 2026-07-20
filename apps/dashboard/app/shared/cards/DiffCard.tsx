"use client";

// The `diff` card (contract §7 / WA-R11): the DB-computed revision walk over
// journal_entry_revisions via get_entry_diff. Identifier-only part; hydrates on
// mount. Every delta_cents is a DB figure (fmtDeltaCents applies the safe-integer
// guard) — the UI NEVER sums or recomputes. Read-only; no terminal action.

import { useCallback } from "react";
import type { DiffPart } from "../parts";
import { getEntryDiff } from "../reviewApi";
import { useCard } from "./cardHooks";
import { fmtCents, fmtDeltaCents, shortId } from "../fmt";
import type { EntryDiff, EntryRevision } from "../reviewTypes";
import styles from "./cards.module.css";

function deltaClass(cents: number | null): string {
  if (cents === null || cents === 0) return styles.deltaZero ?? "";
  return (cents > 0 ? styles.deltaPos : styles.deltaNeg) ?? "";
}

function Revision({ rev }: { rev: EntryRevision }) {
  return (
    <div className={styles.section}>
      <div className={styles.cardHead}>
        <span className={styles.badge}>rev {rev.revision_no ?? "?"}</span>
        <span className={styles.muted}>
          {rev.actor_kind ?? "actor"}{rev.actor ? ` · ${shortId(rev.actor)}` : ""}
          {rev.created_at ? ` · ${new Date(rev.created_at).toLocaleString()}` : ""}
        </span>
        {rev.reason ? <span className={styles.muted}>— {rev.reason}</span> : null}
      </div>
      {rev.legs.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>account</th><th className={styles.num}>debit</th><th className={styles.num}>credit</th><th>note</th></tr></thead>
            <tbody>
              {rev.legs.map((l, i) => (
                <tr key={i}>
                  <td>{l.account_code ?? "—"}{l.account_name ? ` · ${l.account_name}` : ""}</td>
                  <td className={styles.num}>{l.debit_cents ? fmtCents(l.debit_cents) : ""}</td>
                  <td className={styles.num}>{l.credit_cents ? fmtCents(l.credit_cents) : ""}</td>
                  <td>{l.description ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {rev.deltas_vs_prev.length > 0 ? (
        <ul className={styles.evidenceList}>
          {rev.deltas_vs_prev.map((d, i) => (
            <li key={i} className={styles.evidenceRow}>
              <span className={styles.muted}>{d.field}:</span>
              <span>{d.before ?? "∅"} → {d.after ?? "∅"}</span>
              {d.delta_cents !== null ? <span className={deltaClass(d.delta_cents)}>({fmtDeltaCents(d.delta_cents)})</span> : null}
            </li>
          ))}
        </ul>
      ) : rev.revision_no === 0 ? <p className={styles.muted}>Initial revision.</p> : null}
    </div>
  );
}

export function DiffCard({ token, part }: { token: string | null; part: DiffPart }) {
  const loader = useCallback((t: string): Promise<EntryDiff> => getEntryDiff(t, part.entry_id, part.client_id), [part.entry_id, part.client_id]);
  const { data, loading, err, clr } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Entry history</span><span className={styles.idChip}>{shortId(part.entry_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load the revision history.</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Entry history</span>
        <span className={styles.idChip}>{shortId(part.entry_id)}</span>
        {data ? <span className={styles.muted}>{data.revisions.length} revision{data.revisions.length === 1 ? "" : "s"}</span> : null}
      </div>
      {loading && !data ? <p className={styles.loadingState}>Loading revision history…</p> : null}
      {data && data.revisions.length === 0 && !loading ? <p className={styles.emptyState}>No revision history yet.</p> : null}
      {data ? data.revisions.map((rev, i) => <Revision key={i} rev={rev} />) : null}
      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span></p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
