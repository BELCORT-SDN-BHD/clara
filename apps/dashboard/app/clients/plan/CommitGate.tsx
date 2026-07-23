"use client";

// The commit gate section of the plan page (settled dashboard plan §3.2 / F15). Embeds D3's
// OpeningDryRunCard in commit-gate mode (read-only compact — DB figures verbatim), then the
// commit verb and its governed-refusal surfaces:
//   - stale_plan (CLR06)      → re-review + retry (the plan revision moved under the reviewer)
//   - self_attestation (CLR05)→ a typed attestation unlocks the solo-firm commit
//   - distinct_checker (CLR05)→ the F15 refusal: a DIFFERENT non-contributing admin must approve.
//                               NO membership mutation from here — a precise explanation + a link
//                               to the documented manual admission ceremony ONLY (owner-gated).
//   - required_unresolved / opening_required / other → the DB message verbatim.
//
// CROSS-LANE: OpeningDryRunCard is built by D3 in parallel (contract §3.2). Until it lands this
// import is the single expected unresolved module in this lane (reported to the orchestrator);
// no test imports this file, so the pure test suite stays green.

import { useState } from "react";
import { OpeningDryRunCard } from "../../shared/cards/OpeningDryRunCard";
import type { CommitReadiness, CommitRefusal } from "./model";
import styles from "./plan.module.css";

// The documented manual admission ceremony (F15 target — read-only reference, no mutation).
const OPS_DOCS_HREF = "https://github.com/BELCORT-SDN-BHD/clara/tree/main/docs/ops";

const BLOCKER_COPY: Record<string, string> = {
  plan_not_open: "The plan is not open (already committed or cancelled).",
  required_unresolved: "Some required questions are still unresolved.",
  opening_position_unconfirmed: "No opening position is confirmed yet (a first-year zero, a carry-down, or a finalized opening seed).",
};

export function CommitGate(props: {
  token: string;
  seedId: string | null;
  readiness: CommitReadiness;
  refusal: CommitRefusal | null;
  committing: boolean;
  onCommit: (attestation?: string) => void;
  onReReview: () => void;
}) {
  const { token, seedId, readiness, refusal, committing } = props;
  const [attestation, setAttestation] = useState("");

  return (
    <div className={styles.commitBox}>
      <p className={styles.sectionTitle}>Commit gate</p>

      {seedId ? (
        <OpeningDryRunCard token={token} seedId={seedId} mode="commit-gate" />
      ) : (
        <p className={styles.muted}>No carry-down opening seed — the opening position rides the plan item (first-year zero / deferred carry-down).</p>
      )}

      {/* F-M15: a NON-AUTHORITATIVE local preview — the database is the real commit gate. This
          never disables the commit verb; it only lets the button explain what the DB may refuse. */}
      <p className={styles.muted}>
        Preview only — the database is the commit gate. This checklist is a local read of the loaded plan rows and does
        not authorize (or block) commit.
      </p>
      {!readiness.ready ? (
        <ul className={styles.checklist}>
          {readiness.blockers.map((b) => (
            <li key={b.kind} className={styles.checkItem}>
              <span className={styles.checkGlyph} aria-hidden>○</span>
              {BLOCKER_COPY[b.kind] ?? b.kind}
              {b.kind === "required_unresolved" ? ` (${(b as { items: unknown[] }).items.length} of loaded rows)` : ""}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Every plan-side precondition appears met in this preview. The database re-checks and remains the authority on commit.</p>
      )}

      {/* Governed refusal surfaces (the DB is the real gate; these render its verdicts). */}
      {refusal?.kind === "stale_plan" ? (
        <div className={styles.refusal}>
          <strong>Re-review needed.</strong> The plan changed while you were reviewing it. Re-read the current
          revision, confirm it still reflects your intent, then commit again.
          <div className={styles.resolveRow}>
            <button className={styles.buttonSecondary} onClick={props.onReReview} disabled={committing}>Re-review &amp; retry</button>
          </div>
        </div>
      ) : refusal?.kind === "self_attestation" ? (
        <div className={styles.note}>
          <strong>Solo firm — attestation required.</strong> You contributed to this plan and no distinct
          checker is available. Provide a written attestation to commit under your own approval.
          <textarea className={styles.textarea} placeholder="I attest that…" value={attestation}
            onChange={(e) => setAttestation(e.target.value)} aria-label="Commit attestation" />
          <div className={styles.resolveRow}>
            <button className={styles.button} onClick={() => props.onCommit(attestation.trim() || undefined)}
              disabled={committing || !attestation.trim()}>Attest &amp; commit</button>
          </div>
        </div>
      ) : refusal?.kind === "distinct_checker" || refusal?.kind === "checker_required" ? (
        <div className={styles.refusal}>
          <strong>A distinct checker is required.</strong> You contributed to this plan, so a different admin
          who did <em>not</em> contribute must approve the commit (maker ≠ checker, enforced in the database).
          This cannot be resolved by granting a temporary admin from this screen — follow the documented manual
          admission ceremony instead.
          <div className={styles.resolveRow}>
            <a className={styles.linkButton} href={OPS_DOCS_HREF} target="_blank" rel="noreferrer">Manual admission ceremony (docs/ops) →</a>
          </div>
        </div>
      ) : refusal && refusal.kind === "other" ? (
        <p className={styles.refusal}>{refusal.message}</p>
      ) : refusal?.kind === "required_unresolved" ? (
        <p className={styles.refusal}>The database refused: a required onboarding question remains unresolved.</p>
      ) : refusal?.kind === "opening_required" ? (
        <p className={styles.refusal}>The database refused: an opening position is required before activation.</p>
      ) : null}

      {/* The primary commit verb. F-M15: NEVER disabled by locally-derived readiness — the button
          stays enabled and the DB re-validates (maker≠checker, revision, required items, opening),
          rendering any refusal verbatim above. Only an in-flight commit disables it. */}
      {refusal?.kind !== "self_attestation" ? (
        <div className={styles.resolveRow} style={{ marginTop: "0.5rem" }}>
          <button className={styles.button} onClick={() => props.onCommit()} disabled={committing}>
            {committing ? "Committing…" : "Commit onboarding"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
