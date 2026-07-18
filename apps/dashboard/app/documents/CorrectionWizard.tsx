// Wrong-client correction wizard (contract §4.5 / S5-D3). Read-only preview →
// record the DESTINATION document-subject resolution → propose (immutable
// hash-bound plan) → approve by a DISTINCT eligible checker. Every DB refusal is
// surfaced verbatim (CLR19 distinct-checker / stale-plan / CLR01 destination
// attribution). Clara is NOT in this loop in Slice 5 — this is a human surface.

import { useState } from "react";
import {
  approveCorrection,
  previewCorrection,
  proposeCorrection,
  recordDocumentResolution,
  type ClientRow,
  type CorrectionPreview,
  type DocumentRow,
} from "./api";
import styles from "./documents.module.css";

type Step = "select" | "preview" | "proposed" | "done";

export function CorrectionWizard({
  token,
  document: doc,
  fromClient,
  clients,
  onClose,
  onDone,
}: {
  token: string;
  document: DocumentRow;
  fromClient: string;
  clients: ClientRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>("select");
  const [toClient, setToClient] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [proposal, setProposal] = useState<{ correction_id: string; plan_hash: string; books_version: number } | null>(null);
  const [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id.slice(0, 8);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doPreview = () =>
    run(async () => {
      setPreview(await previewCorrection(token, doc.id, fromClient, toClient));
      setStep("preview");
    });

  const doPropose = () =>
    run(async () => {
      // The destination resolution MUST exist before approve refuses (CLR01);
      // record it now (S5-D3 / build-notes).
      await recordDocumentResolution(token, doc.id, toClient, "correction_destination");
      setProposal(await proposeCorrection(token, doc.id, fromClient, toClient, `Wrong-client correction: ${clientName(fromClient)} → ${clientName(toClient)}`));
      setStep("proposed");
    });

  const doApprove = () =>
    run(async () => {
      if (!proposal) return;
      await approveCorrection(token, proposal.correction_id, proposal.plan_hash, attestation.trim() || null);
      setStep("done");
      onDone();
    });

  return (
    <div className={styles.wizard}>
      <div className={styles.wizardHead}>
        <strong>Wrong-client correction</strong>
        <button type="button" className={styles.linkButton} onClick={onClose}>close</button>
      </div>
      <p className={styles.muted}>From {clientName(fromClient)} · document {doc.original_filename || doc.id.slice(0, 8)}</p>

      {step === "select" ? (
        <div className={styles.stack}>
          <label className={styles.muted} htmlFor="correction-to-client">Move to client</label>
          <select id="correction-to-client" aria-label="Move to client" className={styles.input}
            value={toClient} onChange={(e) => setToClient(e.target.value)}>
            <option value="">Select a client…</option>
            {clients.filter((c) => c.id !== fromClient && c.status === "active").map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>
            ))}
          </select>
          <button className={styles.button} disabled={busy || !toClient} onClick={() => void doPreview()}>
            {busy ? "Working…" : "Preview blast radius"}
          </button>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className={styles.stack}>
          <p className={styles.muted}>
            books_version {preview.books_version} · period model {preview.period_model} · subledger {preview.subledger_model}
            {preview.closed_period_blockers.length > 0 ? ` · closed-period blockers: ${preview.closed_period_blockers.length}` : ""}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>entry</th><th>action</th><th>status</th><th>period</th><th>posting</th></tr></thead>
              <tbody>
                {preview.items.map((it) => (
                  <tr key={it.entry_id}>
                    <td>{it.entry_id.slice(0, 8)}</td><td>{it.action}</td><td>{it.status}</td>
                    <td>{it.period_state}</td><td>{it.posting_date ?? "—"}</td>
                  </tr>
                ))}
                {preview.items.length === 0 ? <tr><td colSpan={5} className={styles.muted}>No cited entries — filing move only.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <button className={styles.button} disabled={busy} onClick={() => void doPropose()}>
            {busy ? "Working…" : "Record destination + propose"}
          </button>
          <button className={styles.linkButton} onClick={() => setStep("select")}>back</button>
        </div>
      ) : null}

      {step === "proposed" && proposal ? (
        <div className={styles.stack}>
          <p className={styles.muted}>Proposed · plan {proposal.plan_hash.slice(0, 12)} · books_version {proposal.books_version}</p>
          <p className={styles.hint}>
            Approval needs a DISTINCT eligible checker. If you proposed this and another eligible checker exists, approval
            refuses (CLR19). A solo firm may approve with a written attestation below.
          </p>
          <textarea className={styles.input} rows={2} placeholder="Attestation (only used on the solo path)"
            value={attestation} onChange={(e) => setAttestation(e.target.value)} />
          <button className={styles.button} disabled={busy} onClick={() => void doApprove()}>
            {busy ? "Working…" : "Approve + apply"}
          </button>
        </div>
      ) : null}

      {step === "done" ? <p className={styles.okText}>Correction completed.</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}
    </div>
  );
}
