"use client";

// The prior-GL seeding page (F13 §3.4 / D4). Plumbing-grade, consistent with
// /queue + /documents: dev auth is the pasted session JWT (sessionStorage, the same
// TOKEN_KEY). Pick a client + a filed prior_gl/management_account document → prepare
// a batch (runtime route) → the tick-list ceremony. A 409 with an existing open batch
// opens THAT batch (never a duplicate); a 422 renders the honest unparseable surface.
// Existing batches for the client list below the preparer so a closed session can be
// resumed. The selected batch mirrors into the URL (`?batch=`) — the shared address
// space idiom.

import { useCallback, useEffect, useState } from "react";
import { listClients, listDocuments, listActiveFilings, type ClientRow, type DocumentRow } from "../documents/api";
import { listSeedingBatches, prepareSeedingBatch, seedingPgrestConfigured, type SeedingBatch } from "../shared/seedingApi";
import { SeedingBatchView } from "./SeedingBatchView";
import styles from "./seeding.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat, /documents, /queue

const SEEDABLE_KINDS = new Set(["prior_gl", "management_account"]);

export default function SeedingPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [batches, setBatches] = useState<SeedingBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    const p = new URLSearchParams(window.location.search);
    setSelectedBatch(p.get("batch") ?? "");
  }, []);

  useEffect(() => {
    const qs = selectedBatch ? `?batch=${encodeURIComponent(selectedBatch)}` : "";
    window.history.replaceState(null, "", qs || window.location.pathname);
  }, [selectedBatch]);

  useEffect(() => {
    if (token && seedingPgrestConfigured()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  // Seedable documents FILED to the selected client (client-side join — no dedicated
  // read fn exists for "filed prior_gl docs of a client"; cross-import of the existing
  // /documents reads, never a hand-written row).
  const loadDocs = useCallback(async () => {
    if (!token || !clientId || !seedingPgrestConfigured()) { setDocs([]); return; }
    try {
      const [filings, allDocs] = await Promise.all([listActiveFilings(token), listDocuments(token)]);
      const filedIds = new Set(filings.filter((f) => f.client_id === clientId).map((f) => f.document_id));
      setDocs(allDocs.filter((d) => filedIds.has(d.id) && SEEDABLE_KINDS.has(d.document_kind ?? "")));
    } catch (e) {
      setError((e as Error).message);
      setDocs([]);
    }
  }, [token, clientId]);
  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const loadBatches = useCallback(async () => {
    if (!token || !clientId || !seedingPgrestConfigured()) { setBatches([]); return; }
    try {
      setBatches(await listSeedingBatches(token, { clientId }));
    } catch (e) {
      setError((e as Error).message);
      setBatches([]);
    }
  }, [token, clientId]);
  useEffect(() => { void loadBatches(); }, [loadBatches]);

  const prepare = useCallback(async () => {
    if (!token || !clientId || !documentId) return;
    setPreparing(true);
    setPrepareNote(null);
    setError(null);
    try {
      const r = await prepareSeedingBatch(token, clientId, documentId);
      if (r.status === "created") {
        // F-H9: proposal_count is DB-authored and already INCLUDES the refused ones — shown
        // verbatim, never a client-side sum.
        setPrepareNote(
          `Batch created — ${r.proposal_count ?? "some"} proposal(s)` +
            (r.refused_count ? ` (${r.refused_count} refused at parse)` : "") + ".",
        );
        setSelectedBatch(r.batchId);
      } else if (r.status === "existing") {
        setPrepareNote("An open batch already exists for this source — opened it.");
        setSelectedBatch(r.batchId);
      } else {
        setPrepareNote(`Could not parse this document: ${r.reason}`);
      }
      await loadBatches();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPreparing(false);
    }
  }, [token, clientId, documentId, loadBatches]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Prior-GL seeding</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load clients.</p>
      ) : !seedingPgrestConfigured() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read seeding on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} aria-label="Client" value={clientId} onChange={(e) => { setClientId(e.target.value); setSelectedBatch(""); }}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
            {clientId ? (
              <select className={styles.input} aria-label="Prior-GL document" value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
                <option value="">Select a filed prior-GL / management-account document…</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.original_filename ?? d.id.slice(0, 8)} ({d.document_kind})</option>)}
              </select>
            ) : null}
            {clientId && documentId ? (
              <button className={styles.button} disabled={preparing} onClick={() => void prepare()}>
                {preparing ? "Preparing…" : "Prepare seeding batch"}
              </button>
            ) : null}
          </div>

          {prepareNote ? <p className={styles.muted}>{prepareNote}</p> : null}
          {error ? <p className={styles.errorText}>{error}</p> : null}

          {clientId && batches.length > 0 ? (
            <div className={styles.batchList}>
              {batches.map((b) => (
                <button
                  key={b.id}
                  className={`${styles.batchListItem} ${selectedBatch === b.id ? styles.batchListItemActive : ""}`}
                  onClick={() => setSelectedBatch(b.id)}
                >
                  {b.id.slice(0, 8)} · {b.state} · {b.stats.proposal_count ?? "—"} proposals
                </button>
              ))}
            </div>
          ) : null}

          {selectedBatch ? <SeedingBatchView token={token} batchId={selectedBatch} onChanged={() => void loadBatches()} /> : null}
        </>
      )}
    </main>
  );
}
