"use client";

// The /bank detail pane for one statement (design part2 §4.7: "detail: lines with
// match state"). Header + tie banner + the document preview (reusing the agent-lane
// byte stream, DocViewer) + the void action + the lines table. Per-line actions
// branch on match_state: unmatched lines are selectable into the matching
// workspace; pending lines offer complete/cancel; live lines offer unmatch.

import { Fragment, useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import {
  getBankStatement, voidBankStatement, unmatchBankMatch, completePendingMatch,
  listOpenBankLineExceptionProposals, type BankAgentProposalRow,
} from "../shared/bankApi";
import { getBankReconciliation, exceptBankLine } from "../shared/reconApi";
import { DocViewer } from "../shared/cards/DocViewer";
import {
  statementStatusLabel, tieBannerState, tieVarianceCents, lineMatchLabel,
  type BankStatementLineRow, type BankStatementRow,
} from "./model";
import { describeBankRefusal, toggleInSet } from "./matchModel";
import { exceptionKindLabel, EXCEPTION_KINDS, type BankLineExceptionKind } from "./reconModel";
import { fmtCents, fmtDeltaCents } from "../shared/fmt";
import { MatchingWorkspace } from "./MatchingWorkspace";
import { ReconciliationPanel, voidUnwindCountFor } from "./ReconciliationPanel";
import styles from "./bank.module.css";

export function StatementDetail({
  token, clientId, statementId, statements, onChanged,
}: {
  token: string;
  clientId: string;
  statementId: string;
  /** the account's full sibling statement list (already loaded by
   *  BankWorkbench) — threaded to ReconciliationPanel for its own void-unwind
   *  count AND read directly here [D6 fix] for the SAME composition
   *  (voidUnwindCountFor), so the unmatch/cancel buttons below warn before
   *  the act too, not only the void button. */
  statements: readonly BankStatementRow[];
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
  const [exceptionProposals, setExceptionProposals] = useState<BankAgentProposalRow[]>([]);
  const [exceptOpenLineId, setExceptOpenLineId] = useState<string | null>(null);
  const [exceptBusy, setExceptBusy] = useState(false);
  const [exceptErr, setExceptErr] = useState<{ id: string; message: string; reason: string | null } | null>(null);
  const [voidUnwindCount, setVoidUnwindCount] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setStatement(await getBankStatement(token, statementId));
      setExceptionProposals(await listOpenBankLineExceptionProposals(token, clientId).catch(() => []));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, statementId, clientId]);

  useEffect(() => { setSelected(new Set()); void reload(); }, [reload]);

  // [D6 fix] the ordered-unwind warning, surfaced BEFORE a settled-period
  // unmatch/cancel, not only after a recon_period_settled refusal (design
  // §3/§7) — meaningful only once THIS statement's own reconciliation is
  // complete (the exact condition unmatch_bank_match's belt refuses on).
  useEffect(() => {
    if (!statement) { setVoidUnwindCount(null); return; }
    let cancelled = false;
    (async () => {
      const own = await getBankReconciliation(token, statementId).catch(() => null);
      if (cancelled) return;
      if (own?.status !== "complete") { setVoidUnwindCount(null); return; }
      const n = await voidUnwindCountFor(token, statements, statement.statement);
      if (!cancelled) setVoidUnwindCount(n);
    })();
    return () => { cancelled = true; };
  }, [token, statementId, statements, statement]);

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

  async function doExcept(lineId: string, kind: BankLineExceptionKind, reason: string) {
    setExceptBusy(true);
    setExceptErr(null);
    try {
      await exceptBankLine(token, { clientId, lineId, kind, reason });
      setExceptOpenLineId(null);
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setExceptErr({ id: lineId, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setExceptBusy(false);
    }
  }

  /** M.2's exception-proposal door: one click that calls the SAME `except_bank_line`
   *  the manual form below uses, pre-filled from an OPEN `bank_agent_proposals` row
   *  (kind='line_exception') — `t_bank_agent_proposal_accept` (0121 DDL 6) stamps the
   *  proposal `accepted` as a side effect of that insert, so no separate confirm verb
   *  exists or is needed. Fails closed on an unreadable payload rather than guessing
   *  a kind/reason the DB core did not actually write. */
  async function doApproveProposal(lineId: string, proposal: BankAgentProposalRow) {
    const kind = proposal.payload.kind;
    const reason = proposal.payload.reason;
    if ((kind !== "bank_error" && kind !== "disputed") || typeof reason !== "string") {
      setExceptErr({ id: lineId, message: "Clara's proposed exception carries an unreadable payload — use the manual form below instead.", reason: null });
      return;
    }
    const evidenceDocumentId = proposal.payload.evidence_document;
    setExceptBusy(true);
    setExceptErr(null);
    try {
      await exceptBankLine(token, {
        clientId, lineId, kind, reason,
        evidenceDocumentId: typeof evidenceDocumentId === "string" ? evidenceDocumentId : null,
      });
      await reload();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setExceptErr({ id: lineId, message: pe.message ?? String(e), reason: pe.reason ?? null });
    } finally {
      setExceptBusy(false);
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
      <p className={styles.hint}>This is the cheap read half, not reconciliation — an unmatched duplicate settlement can still sit outside every group (design §1). C-c's tie-out below closes that.</p>

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Tie-out</p>
        <ReconciliationPanel token={token} clientId={clientId} statement={st} statements={statements} onChanged={() => { void reload(); onChanged(); }} />
      </div>

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
          voidUnwindCount={voidUnwindCount}
          exceptionProposals={exceptionProposals}
          onApproveProposal={(lineId, proposal) => void doApproveProposal(lineId, proposal)}
          exceptOpenLineId={exceptOpenLineId}
          onToggleExceptForm={(lineId) => { setExceptErr(null); setExceptOpenLineId((cur) => (cur === lineId ? null : lineId)); }}
          onExcept={(lineId, kind, reason) => void doExcept(lineId, kind, reason)}
          exceptBusy={exceptBusy}
          exceptErr={exceptErr}
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
  lines, selected, onToggle, lineBusy, lineErr, onUnmatch, onCompletePending, voidUnwindCount,
  exceptionProposals, onApproveProposal, exceptOpenLineId, onToggleExceptForm, onExcept, exceptBusy, exceptErr,
}: {
  lines: BankStatementLineRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  lineBusy: string | null;
  lineErr: { id: string; message: string; reason: string | null } | null;
  onUnmatch: (matchId: string, lineId: string) => void;
  onCompletePending: (matchId: string, lineId: string) => void;
  /** [D6 fix] > 0 iff THIS statement's own reconciliation is complete and N
   *  later, same-account receipts are also complete — chain order would
   *  force voiding all N before an unmatch/cancel here is even reachable. */
  voidUnwindCount: number | null;
  /** M.2 — every OPEN `bank_agent_proposals` row of kind='line_exception' for
   *  this client, matched to a line by `subject_id`. */
  exceptionProposals: BankAgentProposalRow[];
  onApproveProposal: (lineId: string, proposal: BankAgentProposalRow) => void;
  exceptOpenLineId: string | null;
  onToggleExceptForm: (lineId: string) => void;
  onExcept: (lineId: string, kind: BankLineExceptionKind, reason: string) => void;
  exceptBusy: boolean;
  exceptErr: { id: string; message: string; reason: string | null } | null;
}) {
  if (lines.length === 0) return <p className={styles.muted}>This statement has no lines (a zero-activity period).</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr><th></th><th>line</th><th>date</th><th>description</th><th>amount</th><th>running</th><th>state</th><th></th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const proposal = exceptionProposals.find((p) => p.subject_id === l.id);
            return (
              <Fragment key={l.id}>
                <tr className={selected.has(l.id) ? styles.lineRowSelected : undefined}>
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
                    ) : (
                      <button className={styles.linkButton} onClick={() => onToggleExceptForm(l.id)}>except…</button>
                    )}
                    {(l.match_state === "live" || l.match_state === "pending") && typeof voidUnwindCount === "number" && voidUnwindCount > 0 ? (
                      <div className={styles.hint}>this period is reconciled — voiding {voidUnwindCount} receipt{voidUnwindCount === 1 ? "" : "s"} first is required</div>
                    ) : null}
                    {lineErr?.id === l.id ? <div className={styles.errorText}>{lineErr.message}{describeBankRefusal(lineErr.reason) ? ` — ${describeBankRefusal(lineErr.reason)}` : ""}</div> : null}
                  </td>
                </tr>
                {l.match_state === "unmatched" && proposal ? (
                  <tr>
                    <td></td>
                    <td colSpan={7}>
                      <ExceptionProposalChip
                        proposal={proposal} busy={exceptBusy}
                        err={exceptErr?.id === l.id ? exceptErr : null}
                        onApprove={() => onApproveProposal(l.id, proposal)}
                      />
                    </td>
                  </tr>
                ) : null}
                {exceptOpenLineId === l.id ? (
                  <tr>
                    <td></td>
                    <td colSpan={7}>
                      <ExceptLineForm lineId={l.id} busy={exceptBusy} err={exceptErr?.id === l.id ? exceptErr : null} onSubmit={onExcept} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** M.2's exception-proposal door (Annex I: "its slot becomes the exception-
 *  proposal door", replacing the retired rule-suggestion coding chip). An
 *  unmatched line with an OPEN `bank_agent_proposals` row of kind=
 *  'line_exception' gets one button, pre-filled from that row's own payload
 *  (kind/reason) — clicking it calls the SAME `except_bank_line` the manual
 *  form below uses; `t_bank_agent_proposal_accept` (0121 DDL 6) resolves the
 *  proposal as a side effect of that insert. No separate confirm verb exists
 *  or is needed. A line with no open proposal renders nothing here (the
 *  manual "except…" link in the row above is the only door for it). */
function ExceptionProposalChip({
  proposal, busy, err, onApprove,
}: {
  proposal: BankAgentProposalRow;
  busy: boolean;
  err: { message: string; reason: string | null } | null;
  onApprove: () => void;
}) {
  const kind = typeof proposal.payload.kind === "string" ? proposal.payload.kind : null;
  const reason = typeof proposal.payload.reason === "string" ? proposal.payload.reason : null;
  const label = kind ? exceptionKindLabel(kind) : "(exception)";
  return (
    <div className={styles.actions} style={{ marginTop: 0, flexDirection: "column", alignItems: "stretch" }}>
      <button className={styles.buttonSecondary} disabled={busy} onClick={onApprove}>
        {busy ? "Approving…" : `Approve Clara's proposed exception — ${label}`}
      </button>
      {reason ? <p className={styles.hint}>{reason}</p> : null}
      {err ? <p className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</p> : null}
    </div>
  );
}

function ExceptLineForm({
  lineId, busy, err, onSubmit,
}: {
  lineId: string;
  busy: boolean;
  err: { message: string; reason: string | null } | null;
  onSubmit: (lineId: string, kind: BankLineExceptionKind, reason: string) => void;
}) {
  const [kind, setKind] = useState<BankLineExceptionKind>("bank_error");
  const [reason, setReason] = useState("");
  return (
    <div className={styles.candidateRow}>
      <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value as BankLineExceptionKind)} aria-label={`Exception kind for line ${lineId}`}>
        {EXCEPTION_KINDS.map((k) => <option key={k} value={k}>{exceptionKindLabel(k)}</option>)}
      </select>
      <input className={styles.input} placeholder="Reason (owner sign-off required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label={`Exception reason for line ${lineId}`} style={{ flex: 1 }} />
      <button className={styles.buttonSecondary} disabled={busy || !reason.trim()} onClick={() => onSubmit(lineId, kind, reason.trim())}>
        {busy ? "Recording…" : "Except this line"}
      </button>
      {err ? <div className={styles.errorText}>{err.message}{describeBankRefusal(err.reason) ? ` — ${describeBankRefusal(err.reason)}` : ""}</div> : null}
    </div>
  );
}
