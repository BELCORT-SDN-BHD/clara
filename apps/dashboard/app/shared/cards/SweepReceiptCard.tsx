"use client";

// The `sweep_receipt` card (contract §3.5 / WA-R5 / WA-L6): the auto-draft sweep-run
// receipt. Counts are DB counts from ONE snapshot — never a live progress bar. An
// OPEN run shows the honest "still reconciling" staleness note; a FINALIZED run
// offers the audited bookkeeper+ acknowledgement (an ack is NOT an approval, WA-L4).
// Once acknowledged the action is inert (terminal). Refusals render verbatim (CLR29
// not_finalized / CLR03 identity / CLR04 role floor).

import { useCallback } from "react";
import type { SweepReceiptPart } from "../parts";
import { getSweepRun, acknowledgeSweepRun } from "../reviewApi";
import { useCard } from "./cardHooks";
import { shortId } from "../fmt";
import { sweepIsFinalized, type SweepRun } from "../reviewCardTypes";
import styles from "./cards.module.css";

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div className={styles.countTile}>
      <div className={styles.countNum}>{n}</div>
      <div className={styles.countLabel}>{label}</div>
    </div>
  );
}

export function SweepReceiptCard({ token, part }: { token: string | null; part: SweepReceiptPart }) {
  const loader = useCallback((t: string): Promise<SweepRun> => getSweepRun(t, part.run_id), [part.run_id]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Auto-draft sweep</span><span className={styles.idChip}>{shortId(part.run_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load the sweep receipt.</p>
      </div>
    );
  }

  const finalized = data ? sweepIsFinalized(data) : false;
  const acked = !!data?.last_ack_at;

  return (
    <div className={`${styles.card} ${acked ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Auto-draft sweep</span>
        <span className={styles.idChip}>{shortId(part.run_id)}</span>
        {data ? (
          <span className={`${styles.badge} ${finalized ? styles.badgeNew : styles.badgeAuto}`}>{finalized ? "finalized" : "reconciling"}</span>
        ) : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading sweep receipt…</p> : null}

      {data ? (
        <>
          <div className={styles.countGrid}>
            <Tile n={data.counts.drafted} label="auto-drafted" />
            <Tile n={data.counts.skipped_lane} label="lane changed" />
            <Tile n={data.counts.refused_budget} label="over budget" />
            <Tile n={data.counts.refused_attempts} label="parked" />
            <Tile n={data.counts.noop_existing} label="already coded" />
          </div>
          <p className={styles.muted}>
            {data.expected !== null ? `${data.expected} filing${data.expected === 1 ? "" : "s"} in scope · ` : ""}
            {data.opened_at ? `opened ${new Date(data.opened_at).toLocaleString()}` : ""}
            {data.finalized_at ? ` · finalized ${new Date(data.finalized_at).toLocaleString()}` : ""}
          </p>

          {!finalized ? (
            <p className={styles.hint}>This sweep is still reconciling — acknowledgement unlocks when every item is settled.</p>
          ) : acked ? (
            <p className={styles.okText}>Acknowledged{data.acked_by ? ` by ${shortId(data.acked_by)}` : ""}{data.last_ack_at ? ` · ${new Date(data.last_ack_at).toLocaleString()}` : ""}. An acknowledgement records that you saw these drafts — it is not an approval.</p>
          ) : (
            <div className={styles.actions}>
              <button className={styles.button} disabled={busy} onClick={() => void act(() => acknowledgeSweepRun(token, part.run_id))}>
                {busy ? "Recording…" : "Acknowledge sweep"}
              </button>
              <span className={styles.muted}>Records an audited &ldquo;seen&rdquo; — not an approval. The drafts still await individual review.</span>
            </div>
          )}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.reason === "not_finalized" ? "This sweep is still reconciling." : clr.code === "CLR03" || clr.code === "CLR04" ? "Owner/bookkeeper only." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
