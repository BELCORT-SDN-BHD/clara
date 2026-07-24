"use client";

// /accounts?client_id=<uuid> — the client-scoped chart-of-accounts lane (closes
// live-gate-run-2026-07-24 finding 1: no dashboard page called upsert_account, so a
// freshly onboarded client had no way to receive a posting at all). Dev auth = the
// pasted session JWT (sessionStorage key shared with /opening + /queue + /documents).
// URL-as-truth via ?client_id=, matching /clients/plan's own convention (the link from
// there carries the id straight through). The workbench does the actual reading/writing;
// this shell is just the token box + the "Scope by client" select.

import { useEffect, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { supabaseBase } from "../shared/wire";
import { AccountsWorkbench } from "./AccountsWorkbench";
import styles from "./accounts.module.css";

const TOKEN_KEY = "clara_dev_jwt";

export default function AccountsPage() {
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
        <h1 className={styles.title}>Chart of accounts</h1>
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
        <p className={styles.muted}>Paste a JWT above to load a client's chart of accounts.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read accounts on the human lane.</p>
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
            <p className={styles.emptyState}>Select a client above to open its chart of accounts.</p>
          ) : (
            <AccountsWorkbench key={clientId} token={token} clientId={clientId} clientName={selectedClient?.name} />
          )}
        </>
      )}
    </main>
  );
}
