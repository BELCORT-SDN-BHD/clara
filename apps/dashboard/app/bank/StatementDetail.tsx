"use client";

// The /bank detail pane for one statement (design part2 §4.7: "detail: lines with
// match state"). Header + tie banner + the document preview (reusing the agent-lane
// byte stream, DocViewer) + the void action + the lines table. Per-line actions
// branch on match_state: unmatched lines are selectable into the matching
// workspace; pending lines offer complete/cancel; live lines offer unmatch.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { getBankStatement, voidBankStatement, unmatchBankMatch, completePendingMatch } from "../shared/bankApi";
import { DocViewer } from "../shared/cards/DocViewer";
import {
  statementStatusLabel, tieBannerState, tieVarianceCents, lineMatchLabel,
  type BankStatementLineRow,
} from "./model";
import { describeBankRefusal, toggleInSet } from "./matchModel";
import { fmtCents, fmtDeltaCents } from "../shared/fmt";
import { MatchingWorkspace } from "./MatchingWorkspace";
import styles from "./bank.module.css";

export function StatementDetail({
  token, clientId, statementId, onChanged,
}: {
  token: string;
  clientId: string;
  statementId: string;
  onChanged: () => void;
}) {
  const [statement, setStatement] = useState<ReturnType<typeof getBankStatement> extends Promise<infer T> ? T : never>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lineBusy, setLineBusy] = useState<string | null>(null);
  const [lineErr, setLineErr] = useState<{ id: string; message: string; reason: string | null } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidErr, setVoidErr] = useState<{ message: string; reason: string | null } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setStatement(await getBankStatement(token, statementId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, statementId]);

  useEffect(() => { setSelected(new Set()); void reload(); }, [reload]);

  async function runLine(id: string, fn: () => Promise<unknown>) {
    setLineBusy(id);
    setLineErr(null);
    try {
      await fn();
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setLineErr({ id, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setLineBusy(null);
    }
  }

  async function doVoid() {
    if (!voidReason.trim()) return;
    setVoidBusy(true);
    setVoidErr(null);
    try {
      await voidBankStatement(token, clientId, statementId, voidReason.trim());
      setVoidReason("");
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setVoidErr({ message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setVoidBusy(false);
    }
  }

  if (loading && !statement) return <p className={styles.muted}>Loading statement…</p>;
  if (err) return <p className={styles.errorText}>{err}</p>;
  if (!statement) return <p className={styles.detailEmpty}>This statement could not be loaded.</p>;

  const { statement: st, lines } = statement;
  const tie = tieBannerState(st);
  const selectedLines = lines.filter((l) => selected.has(l.id));

  return (
    <div>
      <p className={styles.subtitle}>{st.period_start} → {st.period_end}</p>
      <p className={styles.muted}>
        {statementStatusLabel(st.status)} · {st.ingest_mode} · opening {fmtCents(st.opening_cents)} · closing {fmtCents(st.closing_cents)}
        {st.total_debit_cents !== null ? ` · debits ${fmtCents(st.total_debit_cents)}` : ""}
        {st.total_credit_cents !== null ? ` · credits ${fmtCents(st.total_credit_cents)}` : ""}
      </p>

      <div className={`${styles.tieBanner} ${tie === "tied" ? styles.tieTied : tie === "variance" ? styles.tieVariance : styles.tieUnavailable}`}>
        <span>bank_statement_tie: <strong>{tie}</strong></span>
        <span>GL balance @ period_end: {fmtCents(st.tie.gl_balance_cents)}</span>
        <span>unmatched lines: {fmtCents(st.tie.unmatched_cents)}</span>
        {tie === "variance" ? <span>variance: {fmtDeltaCents(tieVarianceCents(st))}</span> : null}
      </div>
      <p className={styles.hint}>This is the cheap read half, not reconciliation — an unmatched duplicate settlement can still sit outside every group (design §1). C-c's tie-out closes that.</p>

      {st.status === "live" ? (
        <div className={styles.section}>
          <div className={styles.actions}>
            <input className={styles.input} placeholder="Void reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} aria-label="Void reason" style={{ flex: 1 }} />
            <button className={styles.buttonDanger} disabled={voidBusy || !voidReason.trim()} onClick={() => void doVoid()}>{voidBusy ? "Voiding…" : "Void statement"}</button>
          </div>
          {voidErr ? <p className={styles.errorText}>{voidErr.message}{describeBankRefusal(voidErr.reason) ? ` — ${describeBankRefusal(voidErr.reason)}` : ""}</p> : null}
        </div>
      ) : (
        <p className={styles.banner}>Voided{st.voided_reason ? `: ${st.voided_reason}` : ""}.</p>
      )}

      {st.document_id ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Source document</p>
          <DocViewer token={token} documentId={st.document_id} page={null} />
        </div>
      ) : null}

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Lines ({lines.length})</p>
        <LinesTable
          lines={lines}
          selected={selected}
          onToggle={(id) => setSelected((s) => toggleInSet(s, id))}
          lineBusy={lineBusy}
          lineErr={lineErr}
          onUnmatch={(matchId, id) => runLine(id, () => unmatchBankMatch(token, clientId, matchId, "unmatched from /bank"))}
          onCompletePending={(matchId, id) => runLine(id, () => completePendingMatch(token, clientId, matchId))}
        />
      </div>

      {selectedLines.length > 0 ? (
        <MatchingWorkspace
          token={token}
          clientId={clientId}
          statement={st}
          selectedLines={selectedLines}
          onDone={() => { setSelected(new Set()); void reload(); onChanged(); }}
        />
      ) : null}
    </div>
  );
}

function LinesTable({
  lines, selected, onToggle, lineBusy, lineErr, onUnmatch, onCompletePending,
}: {
  lines: BankStatementLineRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  lineBusy: string | null;
  lineErr: { id: string; message: string; reason: string | null } | null;
  onUnmatch: (matchId: string, lineId: string) => void;
  onCompletePending: (matchId: string, lineId: string) => void;
}) {
  if (lines.length === 0) return <p className={styles.muted}>This statement has no lines (a zero-activity period).</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr><th></th><th>line</th><th>date</th><th>description</th><th>amount</th><th>running</th><th>state</th><th></th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className={selected.has(l.id) ? styles.lineRowSelected : undefined}>
              <td>
                {l.match_state === "unmatched" ? (
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => onToggle(l.id)} aria-label={`Select line ${l.line_no}`} />
                ) : null}
              </td>
              <td>{l.line_no}</td>
              <td>{l.entry_date}</td>
              <td>{l.description ?? "—"}</td>
              <td className={styles.num}>{fmtCents(l.amount_cents)}</td>
              <td className={styles.num}>{fmtCents(l.running_balance_cents)}</td>
              <td>
                <span className={`${styles.band} ${l.match_state === "live" ? styles.bandReady : l.match_state === "pending" ? styles.bandReview : styles.bandNeutral}`}>
                  {lineMatchLabel(l.match_state)}
                </span>
              </td>
              <td>
                {l.match_state === "live" && l.match_id ? (
                  <button className={styles.linkButton} disabled={lineBusy === l.id} onClick={() => onUnmatch(l.match_id!, l.id)}>unmatch</button>
                ) : l.match_state === "pending" && l.match_id ? (
                  <>
                    <button className={styles.linkButton} disabled={lineBusy === l.id} onClick={() => onCompletePending(l.match_id!, l.id)}>complete</button>{" "}
                    <button className={styles.linkButton} disabled={lineBusy === l.id} onClick={() => onUnmatch(l.match_id!, l.id)}>cancel</button>
                  </>
                ) : null}
                {lineErr?.id === l.id ? <div className={styles.errorText}>{lineErr.message}{describeBankRefusal(lineErr.reason) ? ` — ${describeBankRefusal(lineErr.reason)}` : ""}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
