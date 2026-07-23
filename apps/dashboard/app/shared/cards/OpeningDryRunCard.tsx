"use client";

// OpeningDryRunCard (LANE D3; settled plan §3.2). Self-hydrating on get_opening_dryrun;
// renders per-line computed-vs-document deltas (DB figures VERBATIM), OBE net, unmapped
// labels, and missing must-asks. D2 embeds it in `commit-gate` mode (read-only compact);
// the workbench uses `workbench` mode. Props contract is EXACTLY {token, seedId, mode}.
// Every figure is a DB-owned cents value — the card computes none; a line's tie/off tone
// is read off the DB delta, never recomputed.

import { useCallback } from "react";
import type { OpeningDryRun, DryRunDelta } from "../../opening/openingModel";
import { deltaTone, dryRunSummary, obeIsNil } from "../../opening/openingModel";
// F-H6: the tie verdict is one of ties / off / unavailable — never a fake tie over
// data the DB did not fully return.
import { getOpeningDryrun } from "../openingApi";
import { useCard } from "./cardHooks";
import { fmtCents, fmtDeltaCents, shortId } from "../fmt";
import styles from "./cards.module.css";

export type DryRunMode = "workbench" | "commit-gate";

function deltaCell(debit: number, credit: number): { text: string; cls: string } {
  // The DB emits actual-minus-target on each side; show the non-zero side, else nil.
  if (debit === 0 && credit === 0) return { text: "RM 0.00", cls: styles.deltaZero ?? "" };
  if (debit !== 0) return { text: fmtDeltaCents(debit), cls: styles.deltaNeg ?? "" };
  return { text: fmtDeltaCents(credit), cls: styles.deltaNeg ?? "" };
}

/** PURE presentational view — testable with a fixture, no network. */
export function OpeningDryRunView({ dry, mode }: { dry: OpeningDryRun; mode: DryRunMode }) {
  const s = dryRunSummary(dry);
  const compact = mode === "commit-gate";
  // Three-state verdict: a line the DB did not fully return withholds the tie verdict.
  const tieBand = s.verdict === "ties"
    ? { label: "ties", cls: styles.bandReady ?? "" }
    : s.verdict === "unavailable"
    ? { label: "unavailable — refresh", cls: styles.bandReview ?? "" }
    : { label: "does not tie", cls: styles.bandYou ?? "" };
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Opening dry-run</span>
        <span className={styles.idChip}>{shortId(dry.seed_id)}</span>
        <span className={`${styles.band} ${tieBand.cls}`}>{tieBand.label}</span>
        <span className={styles.badge}>as at {dry.as_of}</span>
      </div>

      <p className={styles.muted}>
        opening-balance-equity net:{" "}
        <strong className={obeIsNil(dry) ? styles.deltaZero : styles.deltaNeg}>{fmtCents(dry.obe_net_cents)}</strong>
        {obeIsNil(dry) ? " (nil)" : " — must net to nil before approval"}
      </p>

      {dry.deltas.length === 0 ? (
        <p className={styles.emptyState}>No target lines recorded yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>account</th>
                {!compact ? <th className={styles.num}>target Dr</th> : null}
                {!compact ? <th className={styles.num}>target Cr</th> : null}
                <th className={styles.num}>actual Dr</th>
                <th className={styles.num}>actual Cr</th>
                <th className={styles.num}>delta</th>
              </tr>
            </thead>
            <tbody>
              {dry.deltas.map((d: DryRunDelta) => {
                const tone = deltaTone(d);
                // F-H6: an unavailable line renders an explicit refresh state — never
                // RM 0.00 cells over figures the DB did not return.
                if (tone === "unavailable") {
                  return (
                    <tr key={d.account_code}>
                      <td>
                        {d.account_code}
                        <span className={styles.polygonBadge}>unavailable</span>
                      </td>
                      <td className={styles.num} colSpan={compact ? 3 : 5}>unavailable — refresh</td>
                    </tr>
                  );
                }
                const off = tone === "off";
                const cell = deltaCell(d.delta_debit ?? 0, d.delta_credit ?? 0);
                return (
                  <tr key={d.account_code}>
                    <td>
                      {d.account_code}
                      {off ? <span className={styles.polygonBadge}>off</span> : null}
                    </td>
                    {!compact ? <td className={styles.num}>{fmtCents(d.target_debit)}</td> : null}
                    {!compact ? <td className={styles.num}>{fmtCents(d.target_credit)}</td> : null}
                    <td className={styles.num}>{fmtCents(d.actual_debit)}</td>
                    <td className={styles.num}>{fmtCents(d.actual_credit)}</td>
                    <td className={`${styles.num} ${cell.cls}`}>{off ? cell.text : "RM 0.00"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dry.unmapped_labels.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Unmapped labels ({dry.unmapped_labels.length})</p>
          <ul className={styles.evidenceList}>
            {dry.unmapped_labels.map((u) => (
              <li key={u.line_key} className={styles.evidenceRow}>
                <span className={styles.idChip}>{u.line_key}</span>
                <span>{u.source_label}</span>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>An unmapped label carries no account code — the tie cannot close until it maps.</p>
        </div>
      ) : null}

      {dry.missing_must_asks.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Unanswered must-asks ({dry.missing_must_asks.length})</p>
          <ul className={styles.evidenceList}>
            {dry.missing_must_asks.map((m) => (
              <li key={m.item_key} className={styles.evidenceRow}>
                <span className={styles.idChip}>{m.item_key}</span>
                <span>{m.question ?? "—"}</span>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>Every required onboarding must-ask must resolve before the DB will finalize.</p>
        </div>
      ) : null}
    </div>
  );
}

/** The self-hydrating card (contract §3.2). Hydrates get_opening_dryrun on mount and on
 *  `refreshKey` change; D2 embeds it in commit-gate mode. */
export function OpeningDryRunCard({
  token,
  seedId,
  mode = "workbench",
  refreshKey,
}: {
  token: string | null;
  seedId: string;
  mode?: DryRunMode;
  refreshKey?: number;
}) {
  const loader = useCallback((t: string) => getOpeningDryrun(t, seedId), [seedId, refreshKey]);
  const { data, loading, err } = useCard(token, loader);

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Opening dry-run</span>
          <span className={styles.idChip}>{shortId(seedId)}</span>
        </div>
        <p className={styles.muted}>Paste a session JWT to load the dry-run.</p>
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className={styles.card}>
        <p className={styles.loadingState}>Loading dry-run…</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Opening dry-run</span>
          <span className={styles.idChip}>{shortId(seedId)}</span>
        </div>
        <p className={styles.errorText}>{err ?? "Dry-run unavailable."}</p>
      </div>
    );
  }
  return <OpeningDryRunView dry={data} mode={mode} />;
}
