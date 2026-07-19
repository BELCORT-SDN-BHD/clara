"use client";

// The Slice-5 /documents plumbing page (contract §4.5). Deliberately plumbing-
// grade like /chat — NOT the Phase-4 design build. Two-lane discipline: bytes ride
// the runtime intake transport (shared/intake); every read/write here is the
// firm-scoped PostgREST HUMAN lane. Dev auth = the same pasted JWT as /chat.

import { useCallback, useEffect, useMemo, useState } from "react";
import { listActiveFilings, listClients, listDocuments, type ClientRow, type DocumentRow, type FilingRow } from "./api";
import { runtimeBase, supabaseBase } from "../shared/wire";
import { useUploadQueue } from "./useUploadQueue";
import { DocumentDetail } from "./DocumentDetail";
import { CodingSections } from "./CodingSections";
import styles from "./documents.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat

export default function DocumentsPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [filings, setFilings] = useState<FilingRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem(TOKEN_KEY) ?? "";
    setToken(t);
    setTokenDraft(t);
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !supabaseBase()) return;
    setBanner(null);
    try {
      const [d, f, c] = await Promise.all([listDocuments(token), listActiveFilings(token), listClients(token)]);
      setDocuments(d); setFilings(f); setClients(c);
    } catch (err) {
      setBanner((err as Error).message);
    }
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  const queue = useUploadQueue(token, () => void refresh(), (m) => setNote(m));

  // Unassigned = zero ACTIVE filings, oldest first (FIFO). GAP5-7 zero-client
  // escape hatch: the lane is reachable/complete with NO client selected — nothing
  // here gates on a client.
  const activeFiledIds = useMemo(() => new Set(filings.map((f) => f.document_id)), [filings]);
  const unassigned = useMemo(
    () => documents.filter((d) => !activeFiledIds.has(d.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [documents, activeFiledIds],
  );
  const filed = useMemo(
    () => documents.filter((d) => activeFiledIds.has(d.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [documents, activeFiledIds],
  );
  const selectedDoc = documents.find((d) => d.id === selected) ?? null;

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setSelected(null);
    setBanner(null);
  };

  const eInvoice = (d: DocumentRow) =>
    d.extraction_status === "stored_unparsed" || d.document_kind === "e_invoice_xml" || (d.mime_type ?? "").toLowerCase().includes("xml");
  const extractionCopy = (d: DocumentRow) => (d.extraction_status === "held_egress" ? "awaiting egress approval" : d.extraction_status);

  const docRow = (d: DocumentRow) => (
    <li key={d.id}>
      <button className={`${styles.docItem} ${selected === d.id ? styles.docActive : ""}`} onClick={() => setSelected(d.id)}>
        <span className={styles.docName}>{d.original_filename || d.id.slice(0, 8)}</span>
        <span className={styles.muted}>
          {new Date(d.created_at).toLocaleString()} · {extractionCopy(d)}
          {eInvoice(d) ? " · e-invoice (stored, not parsed)" : ""}
          {d.legal_hold ? " · hold" : ""}
        </span>
      </button>
    </li>
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Clara documents — Slice 5 plumbing</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT"
            value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>
          runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}
        </p>
        {banner ? <p className={styles.banner}>{banner}</p> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
      </header>

      {!token ? (
        <p className={styles.prose}>Paste a JWT above to begin.</p>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <section className={styles.section}>
              <h2 className={styles.h4}>Upload</h2>
              <div className={styles.dropZone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length) queue.add(f); }}>
                <input type="file" multiple aria-label="Upload documents"
                  onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) queue.add(f); e.target.value = ""; }} />
                <p className={styles.muted}>Drop files here or pick — up to 20MB each; queued 2 at a time.</p>
              </div>
              {queue.items.length > 0 ? (
                <ul className={styles.plainList}>
                  {queue.items.map((q) => (
                    <li key={q.localId} className={`${styles.queueItem} ${styles[`q_${q.state}`] ?? ""}`}>
                      <span className={styles.docName} title={q.name}>{q.name}</span>
                      <span className={styles.muted}>{q.label}</span>
                      {q.state === "failed" || q.state === "error" ? <button className={styles.linkButton} onClick={() => queue.retry(q.localId)}>retry</button> : null}
                      <button className={styles.linkButton} onClick={() => queue.remove(q.localId)}>remove</button>
                      {q.error ? <span className={styles.errorText}>{q.error}</span> : null}
                    </li>
                  ))}
                  <li><button className={styles.linkButton} onClick={queue.clearDone}>clear finished</button></li>
                </ul>
              ) : null}
            </section>

            <section className={styles.section}>
              <h2 className={styles.h4}>Unassigned lane (FIFO)</h2>
              <ul className={styles.docList}>
                {unassigned.map(docRow)}
                {unassigned.length === 0 ? <li className={styles.muted}>No unassigned documents.</li> : null}
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.h4}>Filed</h2>
              <ul className={styles.docList}>
                {filed.map(docRow)}
                {filed.length === 0 ? <li className={styles.muted}>No filed documents.</li> : null}
              </ul>
            </section>
          </aside>

          <section className={styles.pane}>
            {!supabaseBase() ? (
              <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read documents on the human lane.</p>
            ) : selectedDoc ? (
              <DocumentDetail token={token} document={selectedDoc} clients={clients} onRefresh={() => void refresh()} />
            ) : (
              <>
                <p className={styles.muted}>Select a document to see its status, filings, candidates, and corrections — or work the coding queue below.</p>
                <CodingSections token={token} clients={clients} />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
