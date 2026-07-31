"use client";

// The /bank recon pane (Wave C-c, design v2.1 §7): the derived identity
// preview → complete (with the stale-outstanding acknowledgment list) →
// receipt view with snapshot → the void action with the ordered-unwind
// surface. Split View (pure, testable via renderToStaticMarkup — the
// OpeningDryRunCard.tsx precedent) + Panel (stateful data-fetching wrapper).
// Every figure is DB-owned (get_bank_reconciliation's receipt/preview
// terms) — this module renders/labels/gates, it never computes one (the
// single derived boolean is reconModel's `reconTieState`, mirroring
// tieBannerState).

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { getBankReconciliation, completeBankReconciliation, voidBankReconciliation, resolveBankLineException } from "../shared/reconApi";
import {
  reconTieState, canCompleteReconciliation, outstandingStaleUnacked,
  deriveVoidUnwindCount, type BankReconciliationView, type BankLineExceptionDisposition,
} from "./reconModel";
import { SnapshotTables } from "./ReconciliationSnapshotTables";
import { describeBankRefusal, toggleInSet } from "./matchModel";
import type { BankStatementRow } from "./model";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import styles from "./bank.module.css";

type ActionErr = { message: string; reason: string | null } | null;

/** [D6 fix] the ordered-unwind count for ONE statement (design §3/§7) —
 *  shared by this panel's own void button AND StatementDetail's unmatch/
 *  cancel buttons: later, same-account, live statements whose own recon is
 *  complete (chain-order forces voiding those first). No new RPC. */
export async function voidUnwindCountFor(
  token: string,
  statements: readonly BankStatementRow[],
  statement: Pick<BankStatementRow, "id" | "bank_account_id" | "period_end">,
): Promise<number> {
  const later = statements.filter(
    (st) => st.bank_account_id === statement.bank_account_id && st.id !== statement.id
      && st.status === "live" && st.period_end > statement.period_end,
  );
  const pairs = await Promise.all(
    later.map(async (st) => [st.id, (await getBankReconciliation(token, st.id).catch(() => null))?.status ?? "open"] as const),
  );
  return deriveVoidUnwindCount(statements, statement, new Map(pairs));
}

/** PURE presentational view — testable with a fixture, no network. */
export function ReconciliationView({
  view, ackedStaleIds, onToggleAck, onComplete, completing, completeErr,
  voidReason, onVoidReasonChange, onVoid, voiding, voidErr, voidUnwindCount,
  onResolveException, resolving, resolveErr,
}: {
  view: BankReconciliationView;
  ackedStaleIds: ReadonlySet<string>;
  onToggleAck?: (id: string) => void;
  onComplete?: () => void;
  completing?: boolean;
  completeErr?: ActionErr;
  voidReason?: string;
  onVoidReasonChange?: (v: string) => void;
  onVoid?: () => void;
  voiding?: boolean;
  voidErr?: ActionErr;
  voidUnwindCount?: number | null;
  onResolveException?: (exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) => void;
  resolving?: string | null;
  resolveErr?: { id: string; message: string; reason: string | null } | null;
}) {
  const tie = reconTieState(view);
  const tieBand = tie === "tied" ? styles.bandReady : tie === "variance" ? styles.bandYou : styles.bandNeutral;
  const t = view.terms;
  const staleUnacked = outstandingStaleUnacked(view, ackedStaleIds);
  const canComplete = canCompleteReconciliation(view, ackedStaleIds);

  const staleLabel = (id: string): string => {
    const e = view.snapshot.outstanding_entries.find((x) => x.entry_id === id);
    if (e) return `entry ${shortId(e.entry_id)} · ${e.posting_date ?? "—"} · ${fmtCents(e.amount_cents)}${e.age_days !== null ? ` · ${e.age_days}d` : ""}`;
    const l = view.snapshot.outstanding_lines.find((x) => x.line_id === id);
    if (l) return `line ${shortId(l.line_id)} · ${l.entry_date ?? "—"} · ${fmtCents(l.amount_cents)}${l.age_days !== null ? ` · ${l.age_days}d` : ""}`;
    return shortId(id);
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.tieBanner} style={{ marginTop: 0 }}>
        <span>bank tie-out: <strong>{view.mode === "receipt" ? view.status : "open"}</strong></span>
        <span className={`${styles.band} ${tieBand}`}>{tie}</span>
        {view.coa_account_code ? <span>COA {view.coa_account_code}</span> : null}
        {view.first_period_exemption ? <span className={styles.idChip}>first-period exemption</span> : null}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>term</th><th className={styles.num}>cents</th></tr></thead>
          <tbody>
            <tr><td>opening anchor</td><td className={styles.num}>{fmtCents(t.opening_anchor_cents)}</td></tr>
            <tr><td>gl&apos; (approved, period-scoped)</td><td className={styles.num}>{fmtCents(t.gl_prime_cents)}</td></tr>
            <tr><td>Σ uncleared (per group)</td><td className={styles.num}>{fmtDeltaCents(t.uncleared_total_cents)}</td></tr>
            <tr><td>unmatched capacity&apos;</td><td className={styles.num}>{fmtDeltaCents(t.unmatched_capacity_prime_cents)}</td></tr>
            <tr><td>excepted</td><td className={styles.num}>{fmtDeltaCents(t.excepted_cents)}</td></tr>
            <tr><td><strong>computed closing</strong></td><td className={styles.num}><strong>{fmtCents(t.computed_closing_cents)}</strong></td></tr>
            <tr><td>statement closing</td><td className={styles.num}>{fmtCents(t.statement_closing_cents)}</td></tr>
            <tr><td>difference</td><td className={styles.num}>{fmtDeltaCents(t.difference_cents)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className={styles.hint}>Every term above is the DB&apos;s (design §3) — this pane renders them verbatim; it never sums a figure. The DB re-validates the identity under lock at completion time.</p>

      {view.mode === "preview" ? (
        <div className={styles.section}>
          {view.chain_ok === false ? (
            <p className={styles.banner}>A prior period in the chain is missing or incomplete — this statement cannot complete yet (recon_period_gap).</p>
          ) : null}
          {view.precondition_met === false ? (
            <p className={styles.banner}>Not every line of this statement is a live match member or under an open exception yet.</p>
          ) : null}
          {view.blockers.length > 0 ? (
            <ul className={styles.hint}>
              {view.blockers.map((b) => <li key={b}>{b}{describeBankRefusal(b) ? ` — ${describeBankRefusal(b)}` : ""}</li>)}
            </ul>
          ) : null}

          {view.stale_outstanding_ids.length > 0 ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>
                Stale outstanding items (&gt;60 days) — acknowledge to proceed
                {staleUnacked.length > 0 ? ` (${staleUnacked.length} unacknowledged)` : " (all acknowledged)"}
              </p>
              {view.stale_outstanding_ids.map((id) => (
                <label key={id} className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem" }}>
                  <input type="checkbox" checked={ackedStaleIds.has(id)} onChange={() => onToggleAck?.(id)} aria-label={`Acknowledge stale item ${shortId(id)}`} />
                  <span>{staleLabel(id)}</span>
                </label>
              ))}
              <p className={styles.hint}>design §3 recon_outstanding_stale — a duplicate-payment plug is challenged, not totalled; each id must be acknowledged by name.</p>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button className={styles.button} disabled={!canComplete || completing} onClick={() => onComplete?.()}>
              {completing ? "Completing…" : "Complete reconciliation"}
            </button>
          </div>
          {completeErr ? (
            <p className={styles.errorText}>{completeErr.message}{describeBankRefusal(completeErr.reason) ? ` — ${describeBankRefusal(completeErr.reason)}` : ""}</p>
          ) : null}
        </div>
      ) : null}

      {view.mode === "receipt" ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Receipt</p>
          <p className={styles.muted}>
            {view.status === "complete" ? "completed" : "voided"}
            {view.completed_by ? ` by ${shortId(view.completed_by)}` : ""}
            {view.completed_at ? ` · ${new Date(view.completed_at).toLocaleString()}` : ""}
          </p>
          {view.status === "void" ? (
            <p className={styles.banner}>Voided{view.voided_reason ? `: ${view.voided_reason}` : ""}.</p>
          ) : null}
        </div>
      ) : null}

      {/* [D3 fix] rendered in BOTH modes now — a preview's exceptions must be
          resolvable BEFORE completion, not only after (the exception door
          was previously a one-way trap: nowhere to resolve one until the
          statement was already complete, and open exceptions block
          completion in the first place). */}
      <SnapshotTables snapshot={view.snapshot} onResolveException={onResolveException} resolving={resolving} resolveErr={resolveErr} />

      {/* [voided_receipt follow-up] the preview/complete flow stays PRIMARY —
          re-completion is reachable — with the prior void collapsed beneath
          it, read-only (no onResolveException: a frozen snapshot is not a
          live one). Renders only once the DB lane lands `voided_receipt`;
          absent or malformed today, by design (toVoidedReceiptRow's own
          fail-closed law). */}
      {view.voided_receipt ? (
        <details className={styles.section}>
          <summary className={styles.sectionTitle} style={{ cursor: "pointer" }}>
            Previous receipt (voided){view.voided_receipt.voided_at ? ` — ${new Date(view.voided_receipt.voided_at).toLocaleString()}` : ""}
          </summary>
          <p className={styles.muted}>
            {view.voided_receipt.reconciliation_id ? `receipt ${shortId(view.voided_receipt.reconciliation_id)} · ` : ""}
            completed{view.voided_receipt.completed_by ? ` by ${shortId(view.voided_receipt.completed_by)}` : ""}
            {view.voided_receipt.completed_at ? ` · ${new Date(view.voided_receipt.completed_at).toLocaleString()}` : ""}
          </p>
          <p className={styles.banner}>
            Voided{view.voided_receipt.voided_by ? ` by ${shortId(view.voided_receipt.voided_by)}` : ""}
            {view.voided_receipt.voided_reason ? `: ${view.voided_receipt.voided_reason}` : ""}.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>term</th><th className={styles.num}>cents</th></tr></thead>
              <tbody>
                <tr><td>opening</td><td className={styles.num}>{fmtCents(view.voided_receipt.opening_cents)}</td></tr>
                <tr><td>closing</td><td className={styles.num}>{fmtCents(view.voided_receipt.closing_cents)}</td></tr>
                <tr><td>gl balance</td><td className={styles.num}>{fmtCents(view.voided_receipt.gl_balance_cents)}</td></tr>
                <tr><td>outstanding</td><td className={styles.num}>{fmtDeltaCents(view.voided_receipt.outstanding_cents)}</td></tr>
                <tr><td>excepted</td><td className={styles.num}>{fmtDeltaCents(view.voided_receipt.excepted_cents)}</td></tr>
              </tbody>
            </table>
          </div>
          <SnapshotTables snapshot={view.voided_receipt.snapshot} />
        </details>
      ) : null}

      {view.mode === "receipt" && view.status === "complete" ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Void this reconciliation</p>
          {typeof voidUnwindCount === "number" && voidUnwindCount > 0 ? (
            <p className={styles.banner}>This will void {voidUnwindCount} receipt{voidUnwindCount === 1 ? "" : "s"} — every complete reconciliation on this account after this period, newest-first (design §3 the ordered-unwind cost).</p>
          ) : null}
          <div className={styles.actions}>
            <input className={styles.input} placeholder="Void reason" value={voidReason ?? ""} onChange={(e) => onVoidReasonChange?.(e.target.value)} aria-label="Void reconciliation reason" style={{ flex: 1 }} />
            <button className={styles.buttonDanger} disabled={voiding || !(voidReason ?? "").trim()} onClick={() => onVoid?.()}>
              {voiding ? "Voiding…" : "Void reconciliation"}
            </button>
          </div>
          {voidErr ? (
            <p className={styles.errorText}>{voidErr.message}{describeBankRefusal(voidErr.reason) ? ` — ${describeBankRefusal(voidErr.reason)}` : ""}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The self-hydrating panel, mounted from StatementDetail.tsx. Hydrates
 *  get_bank_reconciliation on mount + after every action (no optimistic UI —
 *  the JeReviewCard/useCard precedent, hand-rolled here because complete/
 *  void/resolve are three independent actions with different arg shapes,
 *  unlike useCard's single `act`). `statements` is the account's full sibling
 *  list (already loaded by BankWorkbench) — used ONLY to compose the void-
 *  unwind count client-side (design §3/§7; see reconModel.deriveVoidUnwindCount's
 *  own comment for why this composition, not a client sum, is safe). */
export function ReconciliationPanel({
  token, clientId, statement, statements, onChanged,
}: {
  token: string;
  clientId: string;
  statement: BankStatementRow;
  statements: readonly BankStatementRow[];
  onChanged: () => void;
}) {
  const [view, setView] = useState<BankReconciliationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ackedStaleIds, setAckedStaleIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [completeErr, setCompleteErr] = useState<ActionErr>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidErr, setVoidErr] = useState<ActionErr>(null);
  const [voidUnwindCount, setVoidUnwindCount] = useState<number | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolveErr, setResolveErr] = useState<{ id: string; message: string; reason: string | null } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      setView(await getBankReconciliation(token, statement.id));
    } catch (e) {
      setLoadErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, statement.id]);

  useEffect(() => { setAckedStaleIds(new Set()); void reload(); }, [reload]);

  useEffect(() => {
    if (!view || view.mode !== "receipt" || view.status !== "complete") { setVoidUnwindCount(null); return; }
    let cancelled = false;
    voidUnwindCountFor(token, statements, statement).then((n) => { if (!cancelled) setVoidUnwindCount(n); });
    return () => { cancelled = true; };
  }, [view, statements, statement, token]);

  async function doComplete() {
    if (!view) return;
    setCompleting(true);
    setCompleteErr(null);
    try {
      await completeBankReconciliation(token, clientId, statement.id, [...ackedStaleIds]);
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setCompleteErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setCompleting(false);
    }
  }

  async function doVoid() {
    if (!view?.recon_id || !voidReason.trim()) return;
    setVoiding(true);
    setVoidErr(null);
    try {
      await voidBankReconciliation(token, clientId, view.recon_id, voidReason.trim());
      setVoidReason("");
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setVoidErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setVoiding(false);
    }
  }

  async function doResolve(exceptionId: string, disposition: BankLineExceptionDisposition, note: string, counterpartLineId?: string | null) {
    setResolving(exceptionId);
    setResolveErr(null);
    try {
      await resolveBankLineException(token, { clientId, exceptionId, disposition, note, counterpartLineId });
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setResolveErr({ id: exceptionId, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setResolving(null);
    }
  }

  if (loading && !view) return <p className={styles.muted}>Loading reconciliation…</p>;
  if (loadErr) return <p className={styles.errorText}>{loadErr}</p>;
  if (!view) return <p className={styles.detailEmpty}>Reconciliation is unavailable for this statement.</p>;

  return (
    <ReconciliationView
      view={view}
      ackedStaleIds={ackedStaleIds}
      onToggleAck={(id) => setAckedStaleIds((s) => toggleInSet(s, id))}
      onComplete={() => void doComplete()}
      completing={completing}
      completeErr={completeErr}
      voidReason={voidReason}
      onVoidReasonChange={setVoidReason}
      onVoid={() => void doVoid()}
      voiding={voiding}
      voidErr={voidErr}
      voidUnwindCount={voidUnwindCount}
      onResolveException={(id, d, n, cp) => void doResolve(id, d, n, cp)}
      resolving={resolving}
      resolveErr={resolveErr}
    />
  );
}
