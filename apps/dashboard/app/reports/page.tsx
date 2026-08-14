"use client";

// /reports -- sealed-artifact links + a snapshot list (Wave E lane theta,
// design skeleton part4 §4), a sibling of /rules: pasted-JWT dev auth
// (sessionStorage, the shared clara_dev_jwt key), PostgREST reads, no design
// system, no animation. Snapshots read from lane gamma's live registry
// (0057); sealed artifacts read from lane epsilon's clara.report_artifacts,
// which may not be deployed here yet -- that absence is rendered explicitly,
// never a crash and never a silent empty list. The UI computes no cents.

import { useEffect, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { supabaseBase, runtimeBase } from "../shared/wire";
import { shortId } from "../shared/fmt";
import {
  listPeriodSnapshots, snapshotState, listReportArtifacts,
  type PeriodSnapshotRow, type ReportArtifactsRead,
} from "./reportsApi";
import styles from "./reports.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents + /queue + /rules + /close

export default function ReportsPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [snapshots, setSnapshots] = useState<PeriodSnapshotRow[] | null>(null);
  const [artifacts, setArtifacts] = useState<ReportArtifactsRead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  useEffect(() => {
    if (!token || !clientId) { setSnapshots(null); setArtifacts(null); return; }
    setError(null);
    listPeriodSnapshots(token, clientId).then(setSnapshots).catch((e) => { setError((e as Error).message); setSnapshots([]); });
    listReportArtifacts(token, clientId).then(setArtifacts).catch((e) => { setError((e as Error).message); setArtifacts({ available: false }); });
  }, [token, clientId]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t); setSnapshots(null); setArtifacts(null);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Reports -- snapshots &amp; sealed artifacts</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.buttonSecondary} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} &middot; PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load a client&rsquo;s reports.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read reports on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
              <option value="">Select client&hellip;</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
          </div>
          {error ? <p className={styles.banner}>{error}</p> : null}

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Month snapshots</p>
            {!clientId ? (
              <p className={styles.muted}>Select a client to list its snapshots.</p>
            ) : snapshots === null ? (
              <p className={styles.muted}>Loading&hellip;</p>
            ) : snapshots.length === 0 ? (
              <p className={styles.muted}>No snapshots minted yet for this client (mint_month_snapshot).</p>
            ) : (
              <div className={styles.rowList}>
                {snapshots.map((s) => <SnapshotRow key={s.id} snapshot={s} token={token} />)}
              </div>
            )}
          </section>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Sealed report artifacts</p>
            {!clientId ? (
              <p className={styles.muted}>Select a client to list its sealed artifacts.</p>
            ) : artifacts === null ? (
              <p className={styles.muted}>Loading&hellip;</p>
            ) : !artifacts.available ? (
              <p className={styles.notice}>Reporting engine not yet deployed -- the sealed-artifact registry is not present in this environment yet.</p>
            ) : artifacts.rows.length === 0 ? (
              <p className={styles.muted}>No sealed artifacts yet for this client.</p>
            ) : (
              <div className={styles.rowList}>
                {artifacts.rows.map((a) => (
                  <div key={a.id} className={styles.row}>
                    <div className={styles.rowHead}>
                      <span className={styles.rowTitle}>{a.kind.replace(/_/g, " ")}</span>
                      <span className={styles.idChip}>run {shortId(a.report_run_id)}</span>
                      {a.claim_removed ? <span className={`${styles.band} ${styles.bandFlag}`}><span className={styles.glyph} aria-hidden="true">✕</span>claim removed</span> : null}
                      {a.uncertified ? <span className={`${styles.band} ${styles.bandFlag}`}><span className={styles.glyph} aria-hidden="true">!</span>uncertified</span> : null}
                    </div>
                    <div className={styles.rowMeta}>
                      <span className={styles.mono}>sha256 {a.sha256}</span>
                      <span className={styles.mono}>{a.byte_size.toLocaleString()} bytes</span>
                      <span className={styles.mono}>sealed {a.sealed_at} by {shortId(a.sealed_by)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function SnapshotRow({ snapshot, token }: { snapshot: PeriodSnapshotRow; token: string }) {
  const [state, setState] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    snapshotState(token, snapshot.id).then((s) => { if (!cancelled) setState(s); }).catch(() => { if (!cancelled) setState("unknown"); });
    return () => { cancelled = true; };
  }, [token, snapshot.id]);

  const band = state === "current" ? styles.bandCurrent : state === "stale" ? styles.bandStale : styles.bandUnknown;
  const glyph = state === "current" ? "✓" : state === "stale" ? "↻" : "?";

  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.rowTitle}>{snapshot.period_start} -- {snapshot.period_end}</span>
        <span className={styles.idChip}>{snapshot.kind.replace(/_/g, " ")}</span>
        {state ? (
          <span className={`${styles.band} ${band}`}><span className={styles.glyph} aria-hidden="true">{glyph}</span>{state}</span>
        ) : null}
      </div>
      <div className={styles.rowMeta}>
        <span className={styles.mono}>minted {snapshot.minted_at} by {shortId(snapshot.minted_by)}</span>
        <span className={styles.mono}>sha256 {snapshot.dataset_sha256}</span>
      </div>
    </div>
  );
}
