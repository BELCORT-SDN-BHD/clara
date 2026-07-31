"use client";

// The /bank detail pane for one statement (design part2 §4.7: "detail: lines with
// match state"). Header + tie banner + the document preview (reusing the agent-lane
// byte stream, DocViewer) + the void action + the lines table. Per-line actions
// branch on match_state: unmatched lines are selectable into the matching
// workspace; pending lines offer complete/cancel; live lines offer unmatch.

import { Fragment, useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { getBankStatement, voidBankStatement, unmatchBankMatch, completePendingMatch } from "../shared/bankApi";
import { listBankLineSuggestions, exceptBankLine } from "../shared/reconApi";
import { DocViewer } from "../shared/cards/DocViewer";
import {
  statementStatusLabel, tieBannerState, tieVarianceCents, lineMatchLabel,
  type BankStatementLineRow, type BankStatementRow,
} from "./model";
import { describeBankRefusal, toggleInSet } from "./matchModel";
import {
  bankRuleProposalLabel, exceptionKindLabel, EXCEPTION_KINDS,
  type BankLineSuggestionRow, type BankLineExceptionKind,
} from "./reconModel";
import type { CounterpartyKind } from "../shared/counterpartyApi";
import { fmtCents, fmtDeltaCents } from "../shared/fmt";
import { MatchingWorkspace } from "./MatchingWorkspace";
import { ReconciliationPanel } from "./ReconciliationPanel";
import styles from "./bank.module.css";

/** A confirmed match/settle suggestion chip's pre-fill (design §7) — cleared
 *  whenever the selection changes so a stale rule id can never ride a
 *  different line into the write call. */
type PendingSuggestion = { lineId: string; ruleId: string; counterpartyId: string; kind: CounterpartyKind };

export function StatementDetail({
  token, clientId, statementId, statements, onChanged,
}: {
  token: string;
  clientId: string;
  statementId: string;
  /** the account's full sibling statement list (already loaded by
   *  BankWorkbench) — passed through ONLY so ReconciliationPanel can compose
   *  the void-unwind count (design §3/§7); StatementDetail itself reads none
   *  of it directly. */
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
  const [suggestions, setSuggestions] = useState<BankLineSuggestionRow[]>([]);
  const [pendingSuggestion, setPendingSuggestion] = useState<PendingSuggestion | null>(null);
  const [exceptOpenLineId, setExceptOpenLineId] = useState<string | null>(null);
  const [exceptBusy, setExceptBusy] = useState(false);
  const [exceptErr, setExceptErr] = useState<{ id: string; message: string; reason: string | null } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setStatement(await getBankStatement(token, statementId));
      setSuggestions(await listBankLineSuggestions(token, statementId).catch(() => []));
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
          onToggle={(id) => { setPendingSuggestion(null); setSelected((s) => toggleInSet(s, id)); }}
          lineBusy={lineBusy}
          lineErr={lineErr}
          onUnmatch={(matchId, id) => runLine(id, () => unmatchBankMatch(token, clientId, matchId, "unmatched from /bank"))}
          onCompletePending={(matchId, id) => runLine(id, () => completePendingMatch(token, clientId, matchId))}
          suggestions={suggestions}
          onChipSelect={(lineId, ruleId, counterpartyId, kind) => {
            setSelected(new Set([lineId]));
            setPendingSuggestion({ lineId, ruleId, counterpartyId, kind });
          }}
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
          onDone={() => { setSelected(new Set()); setPendingSuggestion(null); void reload(); onChanged(); }}
          viaRuleId={pendingSuggestion && selectedLines.length === 1 && selectedLines[0]!.id === pendingSuggestion.lineId ? pendingSuggestion.ruleId : null}
          suggestedCounterpartyId={pendingSuggestion && selectedLines.length === 1 && selectedLines[0]!.id === pendingSuggestion.lineId ? pendingSuggestion.counterpartyId : null}
          suggestedKind={pendingSuggestion && selectedLines.length === 1 && selectedLines[0]!.id === pendingSuggestion.lineId ? pendingSuggestion.kind : null}
        />
      ) : null}
    </div>
  );
}

function LinesTable({
  lines, selected, onToggle, lineBusy, lineErr, onUnmatch, onCompletePending,
  suggestions, onChipSelect, exceptOpenLineId, onToggleExceptForm, onExcept, exceptBusy, exceptErr,
}: {
  lines: BankStatementLineRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  lineBusy: string | null;
  lineErr: { id: string; message: string; reason: string | null } | null;
  onUnmatch: (matchId: string, lineId: string) => void;
  onCompletePending: (matchId: string, lineId: string) => void;
  suggestions: BankLineSuggestionRow[];
  onChipSelect: (lineId: string, ruleId: string, counterpartyId: string, kind: CounterpartyKind) => void;
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
            const lineSuggestions = suggestions.filter((sg) => sg.line_id === l.id);
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
                    {lineErr?.id === l.id ? <div className={styles.errorText}>{lineErr.message}{describeBankRefusal(lineErr.reason) ? ` — ${describeBankRefusal(lineErr.reason)}` : ""}</div> : null}
                  </td>
                </tr>
                {l.match_state === "unmatched" && lineSuggestions.length > 0 ? (
                  <tr>
                    <td></td>
                    <td colSpan={7}><SuggestionChips line={l} suggestions={lineSuggestions} onSelect={onChipSelect} /></td>
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

/** design §7: "suggestion chips on unmatched lines (match/settle chip
 *  pre-fills the existing panels + passes via_rule; coding chip opens a
 *  pre-filled generic draft flow...)". A `match_settle` chip selects the line
 *  and hands the rule id + proposed counterparty up to StatementDetail, which
 *  threads it through MatchingWorkspace → SettleLinePanel. A `coding` chip is
 *  RENDERED INFORMATION ONLY — grep-verified zero hits for any manual
 *  generic-draft creation entry point anywhere in this dashboard, so there is
 *  nothing for this chip to open yet; see build-0040/u1-notes.md. */
function SuggestionChips({
  line, suggestions, onSelect,
}: {
  line: BankStatementLineRow;
  suggestions: BankLineSuggestionRow[];
  onSelect: (lineId: string, ruleId: string, counterpartyId: string, kind: CounterpartyKind) => void;
}) {
  return (
    <div className={styles.actions} style={{ marginTop: 0 }}>
      {suggestions.map((sg) => {
        const label = bankRuleProposalLabel(sg);
        if (sg.kind === "match_settle") {
          const domain = sg.proposal.domain;
          const counterpartyId = typeof sg.proposal.counterparty_id === "string" ? sg.proposal.counterparty_id : "";
          const kind: CounterpartyKind = domain === "ap" ? "vendor" : "customer";
          return (
            <button
              key={`${sg.kind}:${sg.rule_id}`}
              className={styles.buttonSecondary}
              disabled={!counterpartyId}
              onClick={() => onSelect(line.id, sg.rule_id, counterpartyId, kind)}
            >
              suggested — {label}
            </button>
          );
        }
        return (
          <span key={`${sg.kind}:${sg.rule_id}`} className={styles.idChip} title="No manual generic-draft entry point exists yet — code this from /chat.">
            suggested coding — {label}
          </span>
        );
      })}
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
