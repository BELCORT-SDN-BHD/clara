"use client";

// The `compliance_watch` card (0016 §2.3 / WA21-R3): the SST registration-threshold
// watch case. Mirrors OpenQuestionCard (props / useCard / act / refusal-render) but
// hydrates WITHOUT a network read — no get_compliance_watch fn exists in 0016. It
// renders from the queue row + the envelope's matched compliance.clients[] entry
// (matched in QueueDetail). Every figure is a DB-owned cents value — the card NEVER
// computes one. The statutory qualification is rendered ALWAYS, independent of any
// model output (§2.3: the dashboard renders it independently of the model). Actions
// (ack / snooze / resolve) are governed rpc writers; refusals render verbatim.

import { useCallback, useState } from "react";
import type { QueueRow, ComplianceClient } from "../reviewTypes";
import { ackComplianceWatch, snoozeComplianceWatch, resolveComplianceWatch } from "../reviewApi";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import {
  tierBand, isTerminalState, showStatutoryCountdown, ackEnabled, complianceFigures,
  parseServiceGroup, snoozeMaxDate, isSnoozeWithinCap, refusalLabel, refusalHint,
  type TierTone, type ResolveConclusion,
} from "./complianceWatch";
import styles from "./cards.module.css";

// Rendered ALWAYS, verbatim, independent of any model output (§2.3).
const QUALIFICATION = "DB-computed screening estimate — not a legal determination. Professional review required.";

function toneClass(tone: TierTone): string {
  return tone === "alarm" ? (styles.bandYou ?? "") : tone === "warn" ? (styles.bandReview ?? "") : "";
}

export function ComplianceWatchCard({ token, row, client, watchId, onChanged }: {
  token: string | null;
  row: QueueRow;
  client: ComplianceClient | null;
  watchId: string;
  onChanged: () => void;
}) {
  // No network read — the loader resolves the already-in-hand matched entry so the
  // useCard act/busy/clr machinery (and re-derive-after-action) works unchanged.
  const loader = useCallback((): Promise<ComplianceClient | null> => Promise.resolve(client), [client]);
  const { busy, clr, err, act } = useCard(token, loader);
  const [rationale, setRationale] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [snoozeReason, setSnoozeReason] = useState("");
  const [conclusion, setConclusion] = useState<ResolveConclusion>("registration_recorded");
  const [evidence, setEvidence] = useState("");

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Compliance watch</span><span className={styles.idChip}>{shortId(watchId)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load and act on this watch.</p>
      </div>
    );
  }

  const state = client?.state ?? row.tier;
  const tb = tierBand(state);
  const terminal = isTerminalState(state);
  const serviceGroup = parseServiceGroup(row.question_text);
  const figures = complianceFigures(client);
  const now = new Date();

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>SST registration watch</span>
        <span className={styles.idChip}>{shortId(watchId)}</span>
        <span className={`${styles.band} ${toneClass(tb.tone)}`}>{tb.label}</span>
        {serviceGroup ? <span className={styles.badge}>{serviceGroup}</span> : null}
      </div>

      <p className={styles.questionText}>{row.question_text ?? "SST registration threshold watch"}</p>
      <p className={styles.muted}>
        window ends {row.period ?? "—"}
        {client?.earliest_crossing_month ? ` · earliest crossing ${client.earliest_crossing_month}` : ""}
        {client?.future_method_status ? ` · future method: ${client.future_method_status}` : ""}
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            {figures.map((f, i) => (
              <tr key={i}>
                <td>{f.label}</td>
                <td className={styles.num}>{fmtCents(f.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showStatutoryCountdown(state) ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Statutory countdown</p>
          <p>Application due: <strong>{client?.application_due ?? "—"}</strong> — s.13(1) Service Tax Act 2018.</p>
          <p className={styles.muted}>Tax chargeable from the following month — s.13(3).</p>
        </div>
      ) : null}

      <p className={styles.hint}>{QUALIFICATION}</p>

      {terminal ? (
        <p className={styles.okText}>This watch is resolved.</p>
      ) : (
        <>
          <div className={styles.section}>
            <div className={styles.actions}>
              <input className={styles.reasonInput} aria-label="Acknowledge rationale" placeholder="Acknowledge rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
              <button className={styles.button} disabled={busy || !ackEnabled(rationale)} onClick={() => void act(() => ackComplianceWatch(token, watchId, rationale.trim()), () => { setRationale(""); onChanged(); })}>
                {busy ? "Working…" : "Acknowledge"}
              </button>
            </div>
            <p className={styles.hint}>Acknowledging records that you have seen it — it never erases the condition.</p>
          </div>

          <div className={styles.section}>
            <div className={styles.actions}>
              <input className={styles.input} type="date" aria-label="Snooze until" max={snoozeMaxDate(now)} value={snoozeUntil} onChange={(e) => setSnoozeUntil(e.target.value)} />
              <input className={styles.reasonInput} aria-label="Snooze rationale" placeholder="Snooze rationale" value={snoozeReason} onChange={(e) => setSnoozeReason(e.target.value)} />
              <button className={styles.buttonSecondary} disabled={busy || !snoozeReason.trim() || !isSnoozeWithinCap(snoozeUntil, now)} onClick={() => void act(() => snoozeComplianceWatch(token, watchId, snoozeUntil, snoozeReason.trim()), () => { setSnoozeUntil(""); setSnoozeReason(""); onChanged(); })}>
                Snooze
              </button>
            </div>
            <p className={styles.hint}>A snooze is bounded to 60 days — it re-arms automatically on expiry.</p>
          </div>

          <div className={styles.section}>
            <div className={styles.actions}>
              <select className={styles.input} aria-label="Resolution conclusion" value={conclusion} onChange={(e) => setConclusion(e.target.value as ResolveConclusion)}>
                <option value="registration_recorded">registration recorded</option>
                <option value="not_liable_documented">not liable — documented</option>
              </select>
              <input className={styles.reasonInput} aria-label="Resolution evidence" placeholder="Evidence (required)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
              <button className={styles.buttonSecondary} disabled={busy || !evidence.trim()} onClick={() => void act(() => resolveComplianceWatch(token, watchId, conclusion, evidence.trim()), () => { setEvidence(""); onChanged(); })}>
                Resolve
              </button>
            </div>
            {conclusion === "not_liable_documented" ? <p className={styles.hint}>Pair with the corrective turnover-account reclassification that supports it. A not-liable resolution is admin+.</p> : null}
          </div>
        </>
      )}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{refusalLabel(clr)}</span>{refusalHint(clr.code)}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
