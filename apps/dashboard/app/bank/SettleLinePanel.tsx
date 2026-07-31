"use client";

// settle_from_bank_line's UI (design §4.6): a brand-new settlement born FROM one
// selected unmatched line. Domain comes from the counterparty's KIND, never the
// cash sign (§4.6) — the refund quadrants refuse with the sanctioned workaround
// BEFORE the DB is even asked (matchModel.settlementDomainFor). At/above the
// firm's threshold the composite leaves a pending-match reservation (WCA-R7) —
// rendered generically here since the receipt shape is not pinned (bankApi.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { settleFromBankLine, type SettleReceipt } from "../shared/bankApi";
import { listCounterparties, type CounterpartyRow, type CounterpartyKind } from "../shared/counterpartyApi";
import { listOpenItemsByCounterparty } from "../shared/bankApi";
import { type BankStatementLineRow, type BankStatementRow, type OpenItemRow } from "./model";
import {
  isEligibleAdjustmentCoaAccount, settlementDomainFor, describeBankRefusal,
  REFUND_WORKAROUND_MESSAGE, type BankAdjustment, parseCentsInput } from "./matchModel";
import { listAccounts, type AccountRow } from "../accounts/api";
import { fmtCents } from "../shared/fmt";
import styles from "./bank.module.css";

export function SettleLinePanel({
  token, clientId, statement, line, onDone, viaRuleId, initialCounterpartyId, initialKind,
}: {
  token: string;
  clientId: string;
  statement: BankStatementRow;
  line: BankStatementLineRow;
  onDone: () => void;
  /** Wave C-c (design §5 splice #4): a confirmed `match_settle` suggestion's
   *  signed rule id — omitted on an ordinary human settle. */
  viaRuleId?: string | null;
  /** Wave C-c suggestion chip pre-fill (design §7): the rule's proposed
   *  counterparty/domain, applied ONCE on mount — a later manual Customer/
   *  Vendor toggle clears it like any ordinary kind change. */
  initialCounterpartyId?: string | null;
  initialKind?: CounterpartyKind | null;
}) {
  const [kind, setKind] = useState<CounterpartyKind>(initialKind ?? (line.amount_cents > 0 ? "customer" : "vendor"));
  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);
  const [counterpartyId, setCounterpartyId] = useState(initialCounterpartyId ?? "");
  const isFirstKindRun = useRef(true);
  const [openItems, setOpenItems] = useState<OpenItemRow[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [coaAccounts, setCoaAccounts] = useState<AccountRow[]>([]);
  const [memo, setMemo] = useState("");
  const [postingDate, setPostingDate] = useState(line.entry_date);
  const [chargeCents, setChargeCents] = useState(0);
  const [chargeAccount, setChargeAccount] = useState("");
  const [adjustments, setAdjustments] = useState<BankAdjustment[]>([]);
  const [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; reason: string | null } | null>(null);
  const [receipt, setReceipt] = useState<SettleReceipt | null>(null);

  const domain = settlementDomainFor(kind, line.amount_cents);

  useEffect(() => {
    listAccounts(token, clientId).then(setCoaAccounts).catch(() => setCoaAccounts([]));
  }, [token, clientId]);
  useEffect(() => {
    // Skip the reset on the very first run so a suggestion-chip pre-fill
    // survives mount; any LATER kind/client/token change clears it, same as
    // an ordinary Customer/Vendor toggle always has.
    if (isFirstKindRun.current) {
      isFirstKindRun.current = false;
    } else {
      setCounterpartyId("");
    }
    setOpenItems([]);
    listCounterparties(token, clientId, kind).then(setCounterparties).catch(() => setCounterparties([]));
  }, [token, clientId, kind]);
  useEffect(() => {
    if (!counterpartyId || domain === "refund_not_supported") { setOpenItems([]); return; }
    listOpenItemsByCounterparty(token, clientId, domain === "receipt" ? "ar" : "ap", counterpartyId)
      .then(setOpenItems).catch(() => setOpenItems([]));
  }, [token, clientId, counterpartyId, domain]);

  const eligibleCharge = coaAccounts.filter(isEligibleAdjustmentCoaAccount);
  const allocationInputs = Object.entries(allocations)
    .filter(([, v]) => v > 0)
    .map(([item_id, amount_cents]) => ({ item_id, amount_cents }));

  const setAlloc = useCallback((itemId: string, cents: number) => {
    setAllocations((a) => ({ ...a, [itemId]: cents }));
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const out = await settleFromBankLine(token, {
        clientId, lineId: line.id, counterpartyId,
        allocations: allocationInputs, memo,
        postingDate: postingDate || null,
        chargeCents, chargeAccount: chargeAccount || null,
        adjustments: adjustments.length ? adjustments : null,
        attestation: attestation || null,
        viaRuleId: viaRuleId ?? null,
      });
      setReceipt(out);
      onDone();
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    const pending = typeof receipt.status === "string" && /pending|draft/i.test(receipt.status);
    return (
      <div>
        <p className={styles.okText}>Settlement recorded{receipt.entry_id ? ` — entry ${receipt.entry_id.slice(0, 8)}` : ""}.</p>
        {pending ? (
          <p className={styles.banner}>
            At/above threshold: this settlement is a PENDING match reservation — the line is owned now, and a checker
            must approve the draft entry in /queue before complete_pending_match can flip it live (design §4.6 WCA-R7).
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      {viaRuleId ? <p className={styles.hint}>Confirming a suggested rule settlement — submitting will stamp this settlement &lsquo;via rule&rsquo; (design §4.3).</p> : null}
      <div className={styles.actions}>
        <button className={kind === "customer" ? styles.button : styles.buttonSecondary} onClick={() => setKind("customer")}>Customer</button>
        <button className={kind === "vendor" ? styles.button : styles.buttonSecondary} onClick={() => setKind("vendor")}>Vendor</button>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>counterparty</span>
        <select className={styles.select} value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} aria-label="Counterparty">
          <option value="">Select…</option>
          {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>

      {domain === "refund_not_supported" ? (
        <p className={styles.errorText}>{REFUND_WORKAROUND_MESSAGE}</p>
      ) : counterpartyId ? (
        <>
          <p className={styles.sectionTitle} style={{ marginTop: "0.5rem" }}>Open items ({domain === "receipt" ? "AR" : "AP"})</p>
          {openItems.length === 0 ? <p className={styles.muted}>No open items for this counterparty.</p> : openItems.map((it) => (
            <div key={it.id} className={styles.candidateRow}>
              <div className={styles.accountMain}>
                <span className={styles.accountName}>{it.item_kind} · {it.item_date}</span>
                <span className={styles.accountSub}>outstanding {fmtCents(it.outstanding_cents)}</span>
              </div>
              <input
                type="number" className={`${styles.input} ${styles.amountInput}`}
                value={allocations[it.id] ? allocations[it.id]! / 100 : ""} placeholder="0.00"
                aria-label={`Allocate to item ${it.id}`}
                onChange={(e) => setAlloc(it.id, parseCentsInput(e.target.value))}
              />
            </div>
          ))}

          <div className={styles.formGrid} style={{ marginTop: "0.5rem" }}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>memo</span>
              <input className={styles.input} value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="Settlement memo" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>posting date</span>
              <input type="date" className={styles.input} value={postingDate} min={statement.period_start} max={statement.period_end}
                onChange={(e) => setPostingDate(e.target.value)} aria-label="Posting date" />
            </label>
            {domain === "receipt" ? (
              <>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>charge (optional)</span>
                  <input type="number" className={styles.input} value={chargeCents ? chargeCents / 100 : ""} placeholder="0.00"
                    onChange={(e) => setChargeCents(parseCentsInput(e.target.value))} aria-label="Charge amount" />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>charge account</span>
                  <select className={styles.select} value={chargeAccount} onChange={(e) => setChargeAccount(e.target.value)} aria-label="Charge account">
                    <option value="">—</option>
                    {eligibleCharge.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>)}
                  </select>
                </label>
              </>
            ) : null}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>attestation (solo firms)</span>
              <input className={styles.input} value={attestation} onChange={(e) => setAttestation(e.target.value)} aria-label="Attestation" />
            </label>
          </div>

          {domain === "payment" ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Bank charge (payment side — a separate same-txn adjustment entry, design §4.6)</p>
              {adjustments.map((a, i) => (
                <div key={i} className={styles.candidateRow}>
                  <select className={styles.select} value={a.account_code} onChange={(e) => setAdjustments((list) => list.map((row, idx) => (idx === i ? { ...row, account_code: e.target.value } : row)))} aria-label={`Payment adjustment account ${i + 1}`}>
                    {eligibleCharge.map((acc) => <option key={acc.account_code} value={acc.account_code}>{acc.account_code} — {acc.name}</option>)}
                  </select>
                  <input
                    type="number" className={`${styles.input} ${styles.amountInput}`} value={a.amount_cents === 0 ? "" : a.amount_cents / 100}
                    placeholder="0.00" aria-label={`Payment adjustment amount ${i + 1}`}
                    onChange={(e) => setAdjustments((list) => list.map((row, idx) => (idx === i ? { ...row, amount_cents: parseCentsInput(e.target.value) } : row)))}
                  />
                  <button className={styles.linkButton} onClick={() => setAdjustments((list) => list.filter((_, idx) => idx !== i))}>remove</button>
                </div>
              ))}
              <button className={styles.linkButton} disabled={eligibleCharge.length === 0}
                onClick={() => setAdjustments((list) => [...list, { account_code: eligibleCharge[0]!.account_code, amount_cents: 0 }])}>
                + add a charge adjustment
              </button>
            </div>
          ) : null}

          <div className={styles.actions}>
            <button className={styles.button} disabled={busy || allocationInputs.length === 0} onClick={() => void submit()}>
              {busy ? "Settling…" : "Settle from this line"}
            </button>
          </div>
        </>
      ) : null}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}
