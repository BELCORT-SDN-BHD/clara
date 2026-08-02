"use client";

// The /assets "Depreciation runs" tab (Wave D-a, design v2.1 §3.2/§6) — split
// out of AssetsWorkbench.tsx (repo file-size discipline). list_depreciation_
// runs read + the manual human run path (run_depreciation_manual — mode is
// DERIVED in-verb, design §3.3, never a caller argument). Every figure is
// DB-owned (charged_cents/entries/mode); this module computes none.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { listDepreciationRuns, runDepreciationManual } from "../shared/assetsApi";
import { assetsScreenState, type DepreciationRunRow } from "./assetsModel";
import { fmtCents } from "../shared/fmt";
import styles from "./assets.module.css";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth(dateIso: string): string {
  return `${dateIso.slice(0, 7)}-01`;
}

export function RunsPane({ token, clientId }: { token: string; clientId: string }) {
  const [runs, setRuns] = useState<DepreciationRunRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState(() => firstOfMonth(todayIso()));
  const [periodEnd, setPeriodEnd] = useState(() => todayIso());
  const [busy, setBusy] = useState(false);
  const [runErr, setRunErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setRuns([]);
    try {
      const read = await listDepreciationRuns(token, clientId);
      setRuns(read.runs);
      setAvailable(read.available);
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => { void reload(); }, [reload]);

  const state = assetsScreenState({ loading, error: !!err, totalRows: runs.length, available });

  const runNow = async () => {
    setBusy(true);
    setRunErr(null);
    try {
      await runDepreciationManual(token, clientId, periodStart, periodEnd);
      await reload();
    } catch (e) {
      setRunErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>period start</span>
          <input type="date" className={styles.input} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} aria-label="Period start" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>period end</span>
          <input type="date" className={styles.input} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} aria-label="Period end" />
        </label>
        <button className={styles.button} disabled={busy} onClick={() => void runNow()}>{busy ? "Running…" : "Run period (manual)"}</button>
      </div>
      {runErr ? <p className={styles.errorText}>{runErr}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}

      {state === "loading" ? (
        <p className={styles.muted}>Loading…</p>
      ) : state === "error" ? (
        <p className={styles.errorText}>Could not load depreciation runs — showing nothing rather than stale rows from a prior read.</p>
      ) : state === "unavailable" ? (
        <p className={styles.errorText}>The runs list came back in an unexpected shape — showing nothing rather than guessing.</p>
      ) : state === "empty" ? (
        <p className={styles.emptyState}>No depreciation runs yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>period</th><th>mode</th><th className={styles.num}>entries</th><th className={styles.num}>charged</th><th>created</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.period_start} → {r.period_end}</td>
                  <td><span className={`${styles.band} ${r.mode === "post" ? styles.bandReady : styles.bandReview}`}>{r.mode}</span></td>
                  <td className={styles.num}>{r.entries ?? "—"}</td>
                  <td className={styles.num}>{fmtCents(r.charged_cents)}</td>
                  <td className={styles.muted}>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
