"use client";

// /aging?client_id=<uuid> — the Wave C-c AR/AP aging + counterparty-statement
// workbench (design v2.1 §7). Dev auth = the pasted session JWT (sessionStorage
// key shared with /queue + /accounts + /opening + /documents + /bank — the
// clara_dev_jwt idiom). URL-as-truth via ?client_id=, matching /bank's own
// convention. This shell is just the token box + the "Scope by client" select;
// AgingWorkbench does the actual reading.

import { useEffect, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { supabaseBase } from "../shared/wire";
import { AgingWorkbench } from "./AgingWorkbench";
import styles from "./aging.module.css";

const TOKEN_KEY = "clara_dev_jwt";

export default function AgingPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [didInit, setDidInit] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setClientId(new URLSearchParams(window.location.search).get("client_id") ?? "");
    setDidInit(true);
  }, []);

  useEffect(() => {
    if (!didInit) return;
    const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
    window.history.replaceState(null, "", qs || window.location.pathname);
  }, [clientId, didInit]);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Aging</h1>
        <div className={styles.tokenBar}>
          <input
            className={styles.input}
            type="password"
            placeholder="Paste a Supabase session JWT"
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
            aria-label="Session JWT"
          />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load a client's AR/AP aging.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read the aging workbench on the human lane.</p>
      ) : (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>scope by client</span>
            <select
              className={styles.select}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              aria-label="Scope by client"
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>
              ))}
            </select>
          </label>

          {!clientId ? (
            <p className={styles.emptyState}>Select a client above to open its aging workbench.</p>
          ) : (
            <AgingWorkbench key={clientId} token={token} clientId={clientId} clientName={selectedClient?.name} />
          )}
        </>
      )}
    </main>
  );
}
