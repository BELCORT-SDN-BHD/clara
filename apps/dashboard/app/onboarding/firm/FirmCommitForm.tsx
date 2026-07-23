"use client";

// The firm COMMIT handshake (settled dashboard plan §3.1/F8, v25 memo #5). At the commit park
// (expects === "create_firm_receipt") the workflow surfaces a STABLE op_key; the DASHBOARD —
// never the runtime — calls create_firm(name, admission_token, op_key) via PostgREST (the O7
// token-row receipt makes a same-op_key retry replay byte-identically), then hands the
// {firm_id, plan_id} receipt to the parent, which POSTs it back as the park's answer VERBATIM
// (snake — the runtime's buildFirmReceipt accepts it). The firm name + admission token live in
// COMPONENT MEMORY ONLY (useState) — never sessionStorage, never the URL, never a checkpoint —
// and are cleared the instant create_firm succeeds. The admission token never reaches the runtime.

import { useState } from "react";
import { commitOpKeyFromPrompt, type PendingPark } from "../../shared/interviewApi";
import { createFirm, type FirmReceipt } from "../../shared/onboardingApi";
import type { PgrestError } from "../../shared/wire";
import styles from "../onboarding.module.css";

export function FirmCommitForm(props: {
  park: PendingPark;
  token: string;
  // F-M10: onCommitted must report whether HOOK DELIVERY was confirmed, so this form can
  // retain the receipt and offer a retry (without re-asking the token) on delivery failure.
  onCommitted: (receipt: FirmReceipt) => Promise<boolean>;
}) {
  const { park, token } = props;
  const [name, setName] = useState("");
  const [admissionToken, setAdmissionToken] = useState("");
  // F-M10: the {firm_id, plan_id} receipt is retained until delivery is CONFIRMED — the
  // admission token still clears the instant create_firm succeeds (never re-asked on retry).
  const [receipt, setReceipt] = useState<FirmReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opKey = commitOpKeyFromPrompt(park);

  const create = async () => {
    setError(null);
    const cleanName = name.trim();
    const cleanToken = admissionToken.trim();
    if (!cleanName || !cleanToken) return void setError("Firm name and admission token are required.");
    // F-M16: the op_key is TYPED-ONLY — a park missing it is a runtime contract violation.
    if (!opKey) return void setError("Runtime contract violation — this commit park carries no typed op_key. Refresh /state and retry.");
    setBusy(true);
    let r: FirmReceipt;
    try {
      // O7: a same-op_key retry replays the receipt in the DB (CLR04 only on a DIFFERENT key
      // against a consumed token), so this is idempotent across a double-submit.
      r = await createFirm(token, { name: cleanName, admissionToken: cleanToken, opKey });
    } catch (e) {
      const pg = e as PgrestError;
      setError(pg.clr === "CLR04"
        ? "That admission token is invalid or was already consumed by a different attempt. Confirm the token and op_key."
        : (e as Error).message);
      setBusy(false);
      return;
    }
    // The firm exists — RETAIN the receipt, and clear the held secret + identity immediately.
    setReceipt(r);
    setName("");
    setAdmissionToken("");
    try {
      const ok = await props.onCommitted(r);
      if (!ok) setError("The firm was created, but confirming it to the interview failed. Retry delivery below — no admission token is needed.");
    } finally {
      setBusy(false);
    }
  };

  // F-M10: retry HOOK DELIVERY only, from the retained receipt — never re-asks the token.
  const retryDelivery = async () => {
    if (!receipt) return;
    setError(null);
    setBusy(true);
    try {
      const ok = await props.onCommitted(receipt);
      if (!ok) setError("Delivery failed again — retry when ready. No admission token is needed.");
    } finally {
      setBusy(false);
    }
  };

  // F-M10: once the firm exists, the token is gone — only the retained receipt remains, and
  // delivery can be retried without ever re-asking the admission token.
  if (receipt) {
    return (
      <div className={styles.note}>
        <p className={styles.subtitle} style={{ marginTop: 0 }}>Firm created — confirming to the interview</p>
        <p className={styles.muted}>
          The firm exists (firm {receipt.firm_id.slice(0, 8)}…). The admission token has been cleared. Delivering the
          receipt to the interview{busy ? "…" : ""}.
        </p>
        {error ? <p className={styles.banner}>{error}</p> : null}
        <div>
          <button className={styles.button} onClick={retryDelivery} disabled={busy}>
            {busy ? "Delivering…" : "Retry delivery"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.note}>
      <p className={styles.subtitle} style={{ marginTop: 0 }}>Create the firm</p>
      <p className={styles.muted}>
        Clara has your firm profile. To create the firm, provide its registered name and the
        one-time admission token — these are held only in this form and cleared once the firm exists.
      </p>
      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="fc-name">Firm registered name</label>
          <input id="fc-name" className={styles.input} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="fc-token">Admission token</label>
          <input id="fc-token" className={styles.input} type="password" autoComplete="off" value={admissionToken}
            onChange={(e) => setAdmissionToken(e.target.value)} disabled={busy} />
          <span className={styles.hint}>Held in memory only · op_key {opKey ? `${opKey.slice(0, 8)}…` : "missing"}</span>
        </div>
        {error ? <p className={styles.banner}>{error}</p> : null}
        <div>
          <button className={styles.button} onClick={create} disabled={busy || !name.trim() || !admissionToken.trim()}>
            {busy ? "Creating…" : "Create firm & confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
