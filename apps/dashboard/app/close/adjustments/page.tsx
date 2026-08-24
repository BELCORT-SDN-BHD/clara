"use client";

// The recurring/reversing adjustment-templates surface (Wave D-b, design
// `wave-d-b-design.md` §2, rulings WDB-G1..G4/G13). Relocated from /rules by
// F-A2 PR-3 — F-A2 retires the autopost standing-rules machinery /rules existed
// for; adjustment templates are an unrelated Wave D-b feature that page carried
// only for convenience (its own comment named the coupling: "adjustment
// templates are ALWAYS client-scoped ... only rendered once a specific client
// is picked"). Plumbing-grade, consistent with the rest of the dashboard's dev
// surfaces: dev auth is the page's own pasted session JWT (sessionStorage,
// shared key). Client-scoped only — the DB verbs (list_adjustment_templates,
// adjustment_run_due) both take p_client, never a firm-wide {} scope.

import { useEffect, useState } from "react";
import { listClients, type ClientRow } from "../../documents/api";
import { runtimeBase, supabaseBase } from "../../shared/wire";
import { AdjustmentTemplatePanel } from "./AdjustmentTemplatePanel";
import styles from "./adjustments.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents + /queue + /close

export default function AdjustmentsPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [scope, setScope] = useState("");

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Adjustment templates</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load a client&rsquo;s adjustment templates.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read templates on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Client">
              <option value="">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
          </div>

          {scope ? (
            <AdjustmentTemplatePanel token={token} clientId={scope} />
          ) : (
            <p className={styles.muted}>Pick a client above to see its adjustment templates.</p>
          )}
        </>
      )}
    </main>
  );
}
