"use client";

// The `bank_recon_receipt` card (Wave C-c, design v2.1 §4.1/§6/§7). Identifier-
// only (keyed on statement_id, not recon_id — see parts.ts's own comment on
// why); hydrates get_bank_reconciliation on mount. READ-ONLY here — the DB
// term set is rendered verbatim (never summed), never a fake tie. Completing
// or voiding a reconciliation stays a /bank act (StatementDetail's
// ReconciliationPanel owns that lifecycle with its full ack-list/ordered-
// unwind surfaces); this card is the receipt's SHOWING, not its editing —
// the same "receipt vs editor" split sweep_receipt/rule_post_receipt draw
// between an inert-once-acknowledged card and the workbench that produced it.

import { useCallback } from "react";
import type { BankReconReceiptPart } from "../parts";
import { getBankReconciliation } from "../reconApi";
import { reconTieState, type BankReconciliationView } from "../../bank/reconModel";
import { useCard } from "./cardHooks";
import { fmtCents, fmtDeltaCents, shortId } from "../fmt";
import styles from "./cards.module.css";

export function BankReconReceiptCard({ token, part }: { token: string | null; part: BankReconReceiptPart }) {
  const loader = useCallback((t: string): Promise<BankReconciliationView | null> => getBankReconciliation(t, part.statement_id), [part.statement_id]);
  const { data, loading, err } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Bank reconciliation</span><span className={styles.idChip}>{shortId(part.statement_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this reconciliation.</p>
      </div>
    );
  }

  const tie = data ? reconTieState(data) : "unavailable";
  const terminal = data?.mode === "receipt";

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Bank reconciliation</span>
        <span className={styles.idChip}>{shortId(part.statement_id)}</span>
        {data ? <span className={`${styles.badge} ${terminal ? styles.badgeTerminal : styles.badgeNew}`}>{data.mode === "receipt" ? data.status : "open"}</span> : null}
        {data ? <span className={`${styles.badge} ${tie === "tied" ? styles.badgeNew : styles.badgeAuto}`}>{tie}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading reconciliation…</p> : null}

      {data ? (
        <>
          <p className={styles.muted}>
            {data.coa_account_code ? `COA ${data.coa_account_code} · ` : ""}
            {data.period_start ?? "—"} → {data.period_end ?? "—"}
            {data.completed_at ? ` · completed ${new Date(data.completed_at).toLocaleString()}` : ""}
          </p>
          <div className={styles.countGrid}>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(data.terms.statement_closing_cents)}</div><div className={styles.countLabel}>statement closing</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(data.terms.computed_closing_cents)}</div><div className={styles.countLabel}>computed closing</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtDeltaCents(data.terms.difference_cents)}</div><div className={styles.countLabel}>difference</div></div>
          </div>
          <p className={styles.muted}>
            {data.snapshot.outstanding_entries.length} outstanding entr{data.snapshot.outstanding_entries.length === 1 ? "y" : "ies"} ·{" "}
            {data.snapshot.outstanding_lines.length} outstanding line{data.snapshot.outstanding_lines.length === 1 ? "" : "s"} ·{" "}
            {data.snapshot.exceptions.length} exception{data.snapshot.exceptions.length === 1 ? "" : "s"}
          </p>
          {/* [F5 parity fix] this card reads the SAME get_bank_reconciliation
              envelope as ReconciliationPanel — post-C6 its primary status is
              never 'void' (the voided_receipt sidecar is the ONE void
              shape, not rendered by this read-only card); the dead
              status==='void' banner is deleted here too, for the same
              reason it was deleted there. */}
          <p className={styles.hint}>Every figure above is the DB&apos;s (design §3) — this card renders it verbatim. Complete/void/except acts happen on the /bank workbench, which owns the full ack-list and ordered-unwind surfaces.</p>
        </>
      ) : null}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
