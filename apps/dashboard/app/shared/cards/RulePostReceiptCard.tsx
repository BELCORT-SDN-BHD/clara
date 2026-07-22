"use client";

// The `rule_post_receipt` card (contract §6.4 / WA2-R7): the posted-by-rule receipt.
// A signed autopost rule replayed itself onto one or more routine drafts through the
// FULL predicate wall (the DB re-derives high-stakes, cap, window, direction, account,
// expiry at post time — the card only reports). Identifier-only; hydrates the
// rule_post_runs receipt on mount and re-derives after the acknowledgement. An ack is
// NOT an approval (WA2 §6.4) — it records that a human SAW the rule-posted batch; every
// entry is reversible (reverse-not-delete, via the normal entry reversal path). Once
// acknowledged the action is inert (terminal). Refusals render verbatim (CLR03 agent
// identity / CLR04 role floor). The UI sums nothing — every amount is a DB figure.

import { useCallback } from "react";
import type { RulePostReceiptPart } from "../parts";
import { getRulePostRun, acknowledgeRulePosts } from "../reviewApi";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import type { RulePostRun } from "../reviewCardTypes";
import styles from "./cards.module.css";

export function RulePostReceiptCard({ token, part }: { token: string | null; part: RulePostReceiptPart }) {
  const loader = useCallback((t: string): Promise<RulePostRun> => getRulePostRun(t, part.run_id), [part.run_id]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Posted by rule</span><span className={styles.idChip}>{shortId(part.run_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load the rule-post receipt.</p>
      </div>
    );
  }

  const acked = !!data?.acknowledged_at;
  const posts = data?.posts ?? [];

  return (
    <div className={`${styles.card} ${acked ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Posted by rule</span>
        <span className={styles.idChip}>{shortId(part.run_id)}</span>
        <span className={`${styles.badge} ${styles.badgeRule}`}>rule</span>
        {data?.direction ? <span className={styles.muted}>{data.direction}</span> : null}
        {data ? <span className={`${styles.badge} ${acked ? styles.badgeTerminal : styles.badgeNew}`}>{acked ? "acknowledged" : "posted"}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading rule-post receipt…</p> : null}

      {data ? (
        <>
          <p className={styles.muted}>
            {data.rule_id ? `rule ${shortId(data.rule_id)} · ` : ""}
            {posts.length} {posts.length === 1 ? "entry" : "entries"} posted
            {data.posted_at ? ` · ${new Date(data.posted_at).toLocaleString()}` : ""}
          </p>

          {posts.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>entry</th><th>account</th><th>period</th><th className={styles.num}>amount</th></tr></thead>
                <tbody>
                  {posts.map((p, i) => (
                    <tr key={i}>
                      <td>{shortId(p.entry_id)}{p.reversed ? <span className={styles.polygonBadge}>reversed</span> : null}</td>
                      <td>{p.account_code ?? "—"}{p.counterparty_name ? ` · ${p.counterparty_name}` : ""}</td>
                      <td>{p.period ?? "—"}</td>
                      <td className={styles.num}>{fmtCents(p.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.emptyState}>No entries recorded on this receipt.</p>
          )}

          {acked ? (
            <p className={styles.okText}>
              Acknowledged{data.acknowledged_by ? ` by ${shortId(data.acknowledged_by)}` : ""}
              {data.acknowledged_at ? ` · ${new Date(data.acknowledged_at).toLocaleString()}` : ""}. An acknowledgement records that you saw these rule-posted entries — it is not an approval.
            </p>
          ) : (
            <div className={styles.actions}>
              <button className={styles.button} disabled={busy} onClick={() => void act(() => acknowledgeRulePosts(token, [part.run_id]))}>
                {busy ? "Recording…" : "Acknowledge"}
              </button>
              <span className={styles.muted}>Records an audited &ldquo;seen&rdquo; — not an approval. Each entry was posted through the full predicate wall and is reversible.</span>
            </div>
          )}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.code === "CLR03" ? "Agent identities cannot acknowledge — a human bookkeeper+ must." : clr.code === "CLR04" ? "Owner/bookkeeper only." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
