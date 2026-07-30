"use client";

// The manual "Add a bank account" form (design §4.1). NOT the primary path — §4.1
// names the statement-header proposal as "the authoritative trigger" — this exists
// because a firm must be able to register an account before any statement lands
// (and it doubles as the remedy when no eligible COA account exists for a
// proposal). `bank_code` is free text: no institution-list read is pinned anywhere
// in the design or in migration 0037 (bank_institutions is a seeded reference
// table, §4.1, but no list RPC for it is named) — ASSUMED gap, named honestly
// rather than inventing a picker over an unread table.

import { useState } from "react";
import type { PgrestError } from "../shared/wire";
import { addBankAccount } from "../shared/bankApi";
import { isEligibleBankCoaAccount, describeBankRefusal, type CoaAccountLike } from "./matchModel";
import styles from "./bank.module.css";

export function AddBankAccountPanel({
  token, clientId, eligibleCoa, onAdded,
}: {
  token: string;
  clientId: string;
  eligibleCoa: CoaAccountLike[];
  onAdded: () => void;
}) {
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [coaCode, setCoaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; reason: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const eligible = eligibleCoa.filter(isEligibleBankCoaAccount);

  async function submit() {
    setErr(null);
    setOk(null);
    if (!bankCode.trim() || !accountNumber.trim() || !displayName.trim() || !coaCode) {
      setErr({ message: "Bank code, account number, a display name, and a COA account are all required.", reason: null });
      return;
    }
    setBusy(true);
    try {
      await addBankAccount(token, {
        clientId, bankCode: bankCode.trim(), accountNumber: accountNumber.trim(),
        bankNameDisplay: displayName.trim(), coaAccountCode: coaCode,
      });
      setOk(`${displayName.trim()} added.`);
      setBankCode(""); setAccountNumber(""); setDisplayName(""); setCoaCode("");
      onAdded();
    } catch (e) {
      const pe = e as PgrestError;
      setErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Add a bank account</p>
      <p className={styles.hint}>
        The primary way an account is registered is confirming a statement-header proposal above — use this only to
        pre-register an account, or as the remedy when no eligible COA account exists yet.
      </p>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>institution code</span>
          <input className={styles.input} value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="MBB" aria-label="Bank institution code" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>account number</span>
          <input className={styles.input} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="1234567890" aria-label="Bank account number" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>display name</span>
          <input className={styles.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Maybank current" aria-label="Bank account display name" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>COA account</span>
          <select className={styles.select} value={coaCode} onChange={(e) => setCoaCode(e.target.value)} aria-label="COA account for the new bank account">
            <option value="">Select…</option>
            {eligible.map((a) => <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>)}
          </select>
        </label>
      </div>
      <div className={styles.actions}>
        <button className={styles.button} disabled={busy} onClick={() => void submit()}>{busy ? "Adding…" : "Add account"}</button>
      </div>
      {ok ? <p className={styles.okText}>{ok}</p> : null}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}
