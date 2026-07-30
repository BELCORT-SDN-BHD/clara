"use client";

// match_bank_line's UI (design §4.6): N selected lines × M candidate approved
// entries, in ONE group. Candidate entries carry the DB-computed per-side
// remaining capacity (design §3) — shown as a PREVIEW; the entry-exhaustion belt
// is the authority at write time. The group-tie preview + the period-exception
// detector are the SAME pure fns matchModel exposes for testing.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { listBankMatchCandidates, matchBankLine } from "../shared/bankApi";
import { listAccounts, type AccountRow } from "../accounts/api";
import { type BankStatementLineRow, type BankStatementRow, type MatchCandidateEntryRow } from "./model";
import {
  isEligibleAdjustmentCoaAccount, upsertEntryAllocation, matchGroupTiePreview,
  anyPeriodException, describeBankRefusal, type EntryAllocation, type BankAdjustment,
} from "./matchModel";
import { fmtCents } from "../shared/fmt";
import styles from "./bank.module.css";

export function MatchLinesPanel({
  token, clientId, statement, selectedLines, onDone,
}: {
  token: string;
  clientId: string;
  statement: BankStatementRow;
  selectedLines: BankStatementLineRow[];
  onDone: () => void;
}) {
  const [candidates, setCandidates] = useState<MatchCandidateEntryRow[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<AccountRow[]>([]);
  const [allocations, setAllocations] = useState<EntryAllocation[]>([]);
  const [adjustments, setAdjustments] = useState<BankAdjustment[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; reason: string | null } | null>(null);

  const reload = useCallback(async () => {
    const [c, coa] = await Promise.all([
      listBankMatchCandidates(token, clientId, statement.bank_account_id).catch(() => []),
      listAccounts(token, clientId).catch(() => []),
    ]);
    setCandidates(c);
    setCoaAccounts(coa);
  }, [token, clientId, statement.bank_account_id]);

  useEffect(() => { void reload(); }, [reload]);

  const selectedEntryIds = allocations.map((a) => a.entry_id);
  const needsAck = anyPeriodException(candidates, selectedEntryIds, statement.period_end);
  const preview = matchGroupTiePreview(selectedLines, allocations, adjustments);
  const eligibleAdj = coaAccounts.filter(isEligibleAdjustmentCoaAccount);

  function setAmount(entryId: string, cents: number) {
    setAllocations((a) => upsertEntryAllocation(a, entryId, cents));
  }
  function addAdjustment() {
    if (eligibleAdj.length === 0) return;
    setAdjustments((a) => [...a, { account_code: eligibleAdj[0]!.account_code, amount_cents: 0 }]);
  }
  function updateAdjustment(i: number, patch: Partial<BankAdjustment>) {
    setAdjustments((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeAdjustment(i: number) {
    setAdjustments((a) => a.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await matchBankLine(token, {
        clientId, lineIds: selectedLines.map((l) => l.id),
        entries: allocations, adjustments: adjustments.length ? adjustments : null,
        ackPeriodExceptions: ack,
      });
      setAllocations([]);
      setAdjustments([]);
      setAck(false);
      onDone();
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className={styles.sectionTitle}>Candidate entries on this account</p>
      {candidates.length === 0 ? (
        <p className={styles.muted}>No approved candidate entries touching this bank account.</p>
      ) : (
        candidates.map((c) => {
          const current = allocations.find((a) => a.entry_id === c.entry_id)?.matched_cents ?? 0;
          return (
            <div key={c.entry_id} className={styles.candidateRow}>
              <div className={styles.accountMain}>
                <span className={styles.accountName}>{c.memo ?? c.entry_id.slice(0, 8)}{c.high_stakes ? <span className={`${styles.badge} ${styles.bandYou}`} style={{ marginLeft: "0.3rem" }}>high-stakes</span> : null}</span>
                <span className={styles.accountSub}>
                  {c.counterparty_name ?? "—"} · {c.posting_date ?? "—"} · debit remaining {fmtCents(c.debit_remaining_cents)} · credit remaining {fmtCents(c.credit_remaining_cents)}
                </span>
              </div>
              <input
                type="number" className={`${styles.input} ${styles.amountInput}`} value={current === 0 ? "" : current / 100}
                placeholder="0.00" aria-label={`Matched amount for entry ${c.entry_id}`}
                onChange={(e) => setAmount(c.entry_id, Math.round((Number(e.target.value) || 0) * 100))}
              />
            </div>
          );
        })
      )}

      <p className={styles.sectionTitle} style={{ marginTop: "0.6rem" }}>Adjustments (optional)</p>
      {adjustments.map((a, i) => (
        <div key={i} className={styles.candidateRow}>
          <select className={styles.select} value={a.account_code} onChange={(e) => updateAdjustment(i, { account_code: e.target.value })} aria-label={`Adjustment account ${i + 1}`}>
            {eligibleAdj.map((acc) => <option key={acc.account_code} value={acc.account_code}>{acc.account_code} — {acc.name}</option>)}
          </select>
          <input
            type="number" className={`${styles.input} ${styles.amountInput}`} value={a.amount_cents === 0 ? "" : a.amount_cents / 100}
            placeholder="0.00" aria-label={`Adjustment amount ${i + 1}`}
            onChange={(e) => updateAdjustment(i, { amount_cents: Math.round((Number(e.target.value) || 0) * 100) })}
          />
          <button className={styles.linkButton} onClick={() => removeAdjustment(i)}>remove</button>
        </div>
      ))}
      <button className={styles.linkButton} disabled={eligibleAdj.length === 0} onClick={addAdjustment}>+ add adjustment</button>

      {needsAck ? (
        <label className={styles.field} style={{ marginTop: "0.5rem" }}>
          <span>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="Acknowledge period exception" />
            {" "}A selected entry posts after this statement's period_end — acknowledge the exception to proceed (design §4.6).
          </span>
        </label>
      ) : null}

      <p className={`${styles.tiePreview} ${preview.ties ? styles.tiePreviewOk : styles.tiePreviewOff}`}>
        lines {fmtCents(preview.lineSum)} vs entries+adjustments {fmtCents(preview.entrySum + preview.adjustmentSum)}
        {!preview.ties ? ` — off by ${fmtCents(preview.diffCents)}` : " — ties"}
      </p>

      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || (needsAck && !ack) || allocations.length === 0} onClick={() => void submit()}>
          {busy ? "Matching…" : "Match lines"}
        </button>
      </div>
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}
