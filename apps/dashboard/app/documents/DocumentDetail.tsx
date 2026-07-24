// Per-document detail (contract §4.5): intake/extraction status, filings +
// retire, deterministic attribution candidates (confirm & file / dismiss),
// explicit file-to-client, legal hold (admin affordance, honest failure), and the
// wrong-client correction entry. Every state is honest; confidence is NEVER shown
// as a percentage (S5-D2) — candidates read as shaped bands.

import { useCallback, useEffect, useState } from "react";
import {
  attemptsForDocument, confirmCandidate, dismissCandidate, filingsForDocument, fileToClient,
  openCandidates, placeLegalHold, releaseLegalHold, retireFiling, setDocumentKind, DOCUMENT_KINDS,
  type AttemptRow, type CandidateRow, type ClientRow, type DocumentRow, type FilingRow,
} from "./api";
import { processingStatusCopy, readProcessingTasks, type ProcessingTaskRow } from "../shared/intake";
import type { PgrestError } from "../shared/wire";
import { CorrectionWizard } from "./CorrectionWizard";
import styles from "./documents.module.css";

const RULE_BAND: Record<CandidateRow["rule_kind"], string> = {
  name_exact: "exact registered-name match",
  alias_exact: "exact alias match",
};

function isEInvoice(doc: DocumentRow): boolean {
  return doc.extraction_status === "stored_unparsed" || doc.document_kind === "e_invoice_xml"
    || (doc.mime_type ?? "").toLowerCase().includes("xml");
}

export function DocumentDetail({
  token, document: doc, clients, onRefresh,
}: {
  token: string; document: DocumentRow; clients: ClientRow[]; onRefresh: () => void;
}) {
  const [tasks, setTasks] = useState<ProcessingTaskRow[]>([]);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [fileClient, setFileClient] = useState("");
  const [reason, setReason] = useState("");
  const [correctionFrom, setCorrectionFrom] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Finding 3: the classify control's own draft state (kind + REQUIRED reason).
  const [kindDraft, setKindDraft] = useState("");
  const [kindReason, setKindReason] = useState("");
  // Finding 4b (applied here too, not just app/opening/): the typed CLR code + reason,
  // rendered ALONGSIDE err (never in place of it) — a recognized code must never
  // suppress the DB's verbatim message.
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);

  // A fresh document selection starts the classify draft blank — it must never carry
  // a stale kind/reason over from whichever document was selected before (DocumentDetail
  // is not remounted per document; only `load()` below is keyed on doc.id). `clr` is
  // reset here too: it is rendered APPENDED to `err`, and `load()` clears only `err`, so
  // a refusal reason from the previous document would otherwise survive and be glued onto
  // an unrelated error for the next one.
  useEffect(() => {
    setKindDraft("");
    setKindReason("");
    setClr(null);
  }, [doc.id]);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id.slice(0, 8);

  const load = useCallback(async () => {
    setErr(null);
    setClr(null);
    try {
      const [t, f, a] = await Promise.all([
        readProcessingTasks(token, doc.id),
        filingsForDocument(token, doc.id),
        attemptsForDocument(token, doc.id),
      ]);
      setTasks(t); setFilings(f); setAttempts(a);
      setCandidates(await openCandidates(token, a.map((x) => x.id)));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [token, doc.id]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null); setClr(null);
    try { await fn(); await load(); onRefresh(); }
    catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    }
    finally { setBusy(false); }
  };

  const activeFilings = filings.filter((f) => f.retired_at === null);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <strong>{doc.original_filename || "Untitled document"}</strong>
        <span className={styles.muted}>{doc.id.slice(0, 8)} · sha {doc.sha256.slice(0, 10)}</span>
      </div>

      <div className={styles.badges}>
        <span className={styles.badge}>extraction: {doc.extraction_status === "held_egress" ? "awaiting egress approval" : doc.extraction_status}</span>
        {doc.page_count !== null ? <span className={styles.badge}>{doc.page_count} pages</span> : null}
        {doc.document_kind ? <span className={styles.badge}>{doc.document_kind}</span> : null}
        {doc.financial_date ? <span className={styles.badge}>date {doc.financial_date}</span> : null}
        <span className={styles.badge}>retention: {doc.retention_state}{doc.retain_until ? ` → ${doc.retain_until}` : ""}</span>
        {doc.legal_hold ? <span className={`${styles.badge} ${styles.badgeHold}`}>legal hold</span> : null}
        {isEInvoice(doc) ? <span className={`${styles.badge} ${styles.badgeInfo}`}>e-invoice — stored, not parsed</span> : null}
      </div>
      {doc.legal_hold && doc.legal_hold_reason ? <p className={styles.muted}>hold reason: {doc.legal_hold_reason}</p> : null}

      <section className={styles.section}>
        <h2 className={styles.h4}>Document kind</h2>
        <p className={styles.muted}>Current: {doc.document_kind ?? "unclassified"}</p>
        <div className={styles.inlineRow}>
          <select aria-label="Document kind" className={styles.input} value={kindDraft} onChange={(e) => setKindDraft(e.target.value)}>
            <option value="">Select a kind…</option>
            {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input className={styles.input} placeholder="Reason (required)" value={kindReason}
            onChange={(e) => setKindReason(e.target.value)} aria-label="Document kind reason" />
          <button className={styles.button} disabled={busy || !kindDraft || !kindReason.trim()}
            onClick={() => void act(async () => {
              await setDocumentKind(token, doc.id, kindDraft, kindReason.trim());
              setKindDraft(""); setKindReason("");
            })}>
            Set kind
          </button>
        </div>
        <p className={styles.muted}>A reason is required — this is the audited human classification/correction lane (bookkeeper+).</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>Extraction tasks</h2>
        {tasks.length === 0 ? <p className={styles.muted}>No processing tasks yet.</p> : (
          <ul className={styles.plainList}>
            {tasks.map((t) => (
              <li key={t.id} className={styles.rowItem}>
                <span>{t.lane} v{t.version_n}</span>
                <span className={styles.muted}>{processingStatusCopy(t.status, t.error_code)}{t.attempt_count > 0 ? ` · attempt ${t.attempt_count}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>Filings</h2>
        {filings.length === 0 ? <p className={styles.muted}>Unassigned — zero active filings.</p> : (
          <ul className={styles.plainList}>
            {filings.map((f) => (
              <li key={f.id} className={styles.rowItem}>
                <span>{clientName(f.client_id)} <span className={styles.muted}>({f.basis})</span></span>
                {f.retired_at ? <span className={styles.muted}>retired</span> : (
                  <button className={styles.linkButton} disabled={busy}
                    onClick={() => void act(() => retireFiling(token, f.id, reason.trim() || "retired via documents tab", f.revision_token))}>
                    retire
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>Attribution</h2>
        {attempts.some((a) => a.conflict_reason) ? (
          <p className={styles.hint}>Conflict: {attempts.find((a) => a.conflict_reason)?.conflict_reason} — the matcher abstained; assign by hand.</p>
        ) : null}
        {candidates.length === 0 ? <p className={styles.muted}>No open candidates.</p> : (
          <ul className={styles.plainList}>
            {candidates.map((c) => (
              <li key={c.id} className={styles.rowItem}>
                <span>{clientName(c.client_id)} <span className={styles.muted}>· {RULE_BAND[c.rule_kind]}</span></span>
                <span className={styles.actions}>
                  <button className={styles.linkButton} disabled={busy} onClick={() => void act(() => confirmCandidate(token, c.id))}>confirm &amp; file</button>
                  <button className={styles.linkButton} disabled={busy} onClick={() => void act(() => dismissCandidate(token, c.id))}>dismiss</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>File to a client</h2>
        <div className={styles.inlineRow}>
          <select aria-label="File to client" className={styles.input} value={fileClient} onChange={(e) => setFileClient(e.target.value)}>
            <option value="">Select a client…</option>
            {/* FILING targets include onboarding clients (O8 row 10 — the takeover pack
                must be fileable pre-commit), BADGED, never filtered (WB-R1/design law).
                Coding + wrong-client-correction pickers stay active-only. */}
            {clients.filter((c) => c.status === "active" || c.status === "onboarding").map((c) => (
              <option key={c.id} value={c.id}>
                {(c.name || c.id.slice(0, 8)) + (c.status === "onboarding" ? " — onboarding" : "")}
              </option>
            ))}
          </select>
          <button className={styles.button} disabled={busy || !fileClient}
            onClick={() => void act(async () => { await fileToClient(token, doc.id, fileClient); setFileClient(""); })}>
            File
          </button>
        </div>
        <p className={styles.muted}>Your explicit choice is the human attribution act — it records a resolution, then files.</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>Admin</h2>
        <input className={styles.input} placeholder="Reason (retire / legal hold)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Action reason" />
        <div className={styles.inlineRow}>
          {doc.legal_hold ? (
            <button className={styles.button} disabled={busy || !reason.trim()} onClick={() => void act(() => releaseLegalHold(token, doc.id, reason.trim()))}>Release legal hold</button>
          ) : (
            <button className={styles.button} disabled={busy || !reason.trim()} onClick={() => void act(() => placeLegalHold(token, doc.id, reason.trim()))}>Place legal hold</button>
          )}
          <button className={styles.button} disabled={busy || activeFilings.length === 0} onClick={() => setCorrectionFrom(activeFilings[0]?.client_id ?? null)}>
            Correct wrong-client filing
          </button>
        </div>
        <p className={styles.muted}>Legal-hold + correction are privileged; a non-admin token fails honestly below.</p>
      </section>

      {correctionFrom ? (
        <CorrectionWizard token={token} document={doc} fromClient={correctionFrom} clients={clients}
          onClose={() => setCorrectionFrom(null)} onDone={() => { setCorrectionFrom(null); void load(); onRefresh(); }} />
      ) : null}

      {/* Finding 4b's pattern applied here too: err already carries the CLR code + the
          DB's verbatim message; the typed reason token (when the DB sets one) is
          appended rather than hidden behind a bare code. */}
      {err ? (
        <p className={styles.errorText}>
          {err}
          {clr?.reason ? ` (${clr.reason})` : ""}
        </p>
      ) : null}
    </div>
  );
}
