"use client";

// One seeding proposal row (F13/S4 — the BatchApprove tick-list precedent, NOT the K5
// one-txn approval). Evidence (occurrence count, date span, prior-GL line cites) rides
// ON the row, DB values verbatim — never a confidence score. A refused row is visible
// but NEVER tickable, with its refuse_reason shown plainly. Layered-disclosure citation
// chips use native <details>/<summary> (compact chip → click reveals the full cite) —
// framework-free and static-render-testable.

import type { SeedingProposal, SeedingEvidenceCite } from "../shared/seedingApi";
import { shortId } from "../shared/fmt";
import { proposalStatusCopy, proposalTargetLabel } from "./model";
import styles from "./seeding.module.css";

type Outcome = { ok: true; label: string } | { ok: false; message: string; clr: string | null };

// F-M14: render the exact cite union — row/region + text directly. An unknown shape keeps
// the raw JSON fallback so nothing DB-authored is dropped.
function CiteChip({ cite, i }: { cite: SeedingEvidenceCite; i: number }) {
  if (cite.kind === "raw") {
    return (
      <details className={styles.citeChip}>
        <summary>{`cite ${i + 1}`}</summary>
        <div className={styles.citeDetail}>
          <pre className={styles.citeRaw}>{JSON.stringify(cite.raw, null, 2)}</pre>
        </div>
      </details>
    );
  }
  const label = cite.kind === "row" ? `line ${cite.row}` : `region ${cite.region_id}`;
  return (
    <details className={styles.citeChip}>
      <summary>{label}</summary>
      <div className={styles.citeDetail}>
        <p>{cite.text}</p>
      </div>
    </details>
  );
}

export function SeedingProposalRow({
  proposal, outcome, busy, decidable, declineReason, onDeclineReasonChange, onTick, onDecline,
}: {
  proposal: SeedingProposal;
  outcome: Outcome | null;
  busy: boolean;
  decidable: boolean;
  declineReason: string;
  onDeclineReasonChange: (v: string) => void;
  onTick: () => void;
  onDecline: () => void;
}) {
  const ev = proposal.evidence;
  const terminal = !decidable;

  return (
    <div className={`${styles.propRow} ${terminal ? styles.propTerminal : ""}`}>
      <div className={styles.propHead}>
        <span className={styles.propTitle}>{proposalTargetLabel(proposal)}</span>
        <span className={styles.idChip}>{shortId(proposal.id)}</span>
        <span className={`${styles.stateBadge} ${styles[`state_${proposal.state}`] ?? ""}`}>{proposal.state}</span>
      </div>

      <div className={styles.evidenceBar}>
        {ev.occurrence_count !== null ? (
          <span className={styles.evChip}>{ev.occurrence_count} occurrence{ev.occurrence_count === 1 ? "" : "s"}</span>
        ) : null}
        {ev.date_span ? (
          <span className={styles.evChip}>{ev.date_span.from ?? "?"} – {ev.date_span.to ?? "?"}</span>
        ) : null}
        {ev.line_cites.map((c, i) => <CiteChip key={i} cite={c} i={i} />)}
      </div>

      <p className={styles.muted}>{proposalStatusCopy(proposal)}</p>
      {proposal.proposal_kind === "wiki_fact" && proposal.state === "ticked" ? (
        <p className={styles.wikiDispatch}>publishing to the wiki</p>
      ) : null}

      {decidable ? (
        <div className={styles.propActions}>
          <button className={styles.button} disabled={busy} onClick={onTick}>{busy ? "Working…" : "Tick"}</button>
          <input
            className={styles.reasonInput}
            aria-label={`decline reason for ${shortId(proposal.id)}`}
            placeholder="Decline reason"
            value={declineReason}
            onChange={(e) => onDeclineReasonChange(e.target.value)}
            disabled={busy}
          />
          <button className={styles.buttonSecondary} disabled={busy || !declineReason.trim()} onClick={onDecline}>
            Decline
          </button>
        </div>
      ) : null}

      {outcome ? (
        outcome.ok ? (
          <p className={styles.outcomeOk}>{outcome.label}</p>
        ) : (
          <p className={styles.outcomeFail}>{outcome.clr ? `${outcome.clr} · ` : ""}{outcome.message}</p>
        )
      ) : null}
    </div>
  );
}
