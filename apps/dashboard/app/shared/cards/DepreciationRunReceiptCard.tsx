"use client";

// The `depreciation_run_receipt` card (Wave D-a, design v2.1 §1.5/§3.2/§6/§7).
// Identifier-only (run_id + client_id); hydrates get_depreciation_run on
// mount. READ-ONLY, always terminal — a receipt is minted ONLY at approve
// (design §1.5) and is never editable; a correction reverses the period entry
// and re-runs (§3.2's "Correction law"). Mirrors SweepReceiptCard/
// RulePostReceiptCard's receipt idiom: no optimistic UI, no client-side sum.

import { useCallback } from "react";
import type { DepreciationRunReceiptPart } from "../parts";
import { getDepreciationRun } from "../assetsApi";
import type { GetDepreciationRunRead } from "../../assets/assetsModel";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import styles from "./cards.module.css";

export function DepreciationRunReceiptCard({ token, part }: { token: string | null; part: DepreciationRunReceiptPart }) {
  const loader = useCallback((t: string): Promise<GetDepreciationRunRead> => getDepreciationRun(t, part.run_id), [part.run_id]);
  const { data, loading, err } = useCard(token, loader);
  const run = data?.run ?? null;

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Depreciation run</span><span className={styles.idChip}>{shortId(part.run_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this run.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.card} ${styles.terminal}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Depreciation run</span>
        <span className={styles.idChip}>{shortId(part.run_id)}</span>
        {run ? <span className={`${styles.badge} ${run.mode === "post" ? styles.badgeNew : styles.badgeAuto}`}>{run.mode}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading run receipt…</p> : null}

      {run ? (
        <>
          <p className={styles.muted}>
            {run.period_start ?? "—"} → {run.period_end ?? "—"}
            {run.created_at ? ` · ${new Date(run.created_at).toLocaleString()}` : ""}
          </p>
          <div className={styles.countGrid}>
            <div className={styles.countTile}><div className={styles.countNum}>{run.entries ?? "—"}</div><div className={styles.countLabel}>entries</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(run.charged_cents)}</div><div className={styles.countLabel}>charged</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{run.skipped.length}</div><div className={styles.countLabel}>skipped</div></div>
          </div>
          <p className={styles.hint}>Every figure above is the DB&apos;s (design §1.5) — this is an audit receipt, never editable; a correction reverses the period entry and re-runs.</p>
        </>
      ) : null}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
