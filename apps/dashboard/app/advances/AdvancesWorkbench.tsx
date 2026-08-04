"use client";

// The /advances two-pane workbench (Wave D-b, design `wave-d-b-design.md`
// §3.4): as-of date picker, per-advance register table (list pane) with the
// EA 1955 policy-note advisories, drill-down to the account's running
// statement + particulars completion (detail pane), the register-vs-GL tie
// strip, and enrol/retire actions (op-keyed calls, per the existing action
// conventions). Copies /aging's shell (AgingWorkbench.tsx: as-of state,
// reload clearing state up-front+on-catch, pure ScreenState-driven list
// body). Every figure is DB-owned (staff_advance_summary/statement/tie
// reads); this module computes none.
//
// [as-built ladder round 2] all three reads return an ENVELOPE, and this file
// consumes the envelope: the EA 1955 notes, the register's open total and the
// incomplete count are ENVELOPE keys (one set per client-day, not per row), and
// the statement's opening/closing balances and enrolment generations likewise.
// The tie strip + the enrol/retire panel live in ./AdvancePanels.tsx (the
// 500-line ceiling split).

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import {
  staffAdvanceSummary, staffAdvanceStatement, staffAdvanceTie,
  completeStaffAdvanceParticulars,
} from "../shared/advancesApi";
import {
  advancesScreenState, advanceRowHasOutstanding, advanceIsIncomplete,
  type StaffAdvanceSummaryRow, type StaffAdvanceStatementRead, type StaffAdvanceTieRead,
  type PolicyNote, type ScreenState,
} from "./advancesModel";
import { AdvanceTieStrip, EnrolPanel } from "./AdvancePanels";
import { fmtCents, fmtDeltaCents, shortId } from "../shared/fmt";
import styles from "./advances.module.css";

const EMPTY_TIE: StaffAdvanceTieRead = {
  client_id: null, as_of: null, tie: null, accounts: [], available: true,
};
const EMPTY_STATEMENT: StaffAdvanceStatementRead = {
  client_id: null, account_code: null, from: null, to: null,
  opening_cents: null, closing_cents: null, rows: [], generations: [], available: true,
};

// [round-5 fix, censused door 1 of 4] THE DB OWNS THE DATE, NEVER THE BROWSER.
// `asOf` started as the browser's **UTC** date and was sent as `p_as_of` to
// `staff_advance_summary` (which filters `a.issue_date <= v_as_of`) AND to
// `staff_advance_tie`. Malaysia is UTC+8, so for the eight hours between 00:00 and
// 08:00 MYT this register silently omitted every advance issued today and the
// header's outstanding total understated to match. Round 3 fixed exactly this law
// in advancesApi.getStaffAdvance; it was re-introduced here, one file over.
//
// TWO LAYERS, because the two reads have different contracts:
//   * `staff_advance_summary` ACCEPTS a null as-of and coalesces to
//     `clara._fa_today()`. So `asOf === null` means "the DB's today" and is sent
//     as SQL null — the DB, the only clock entitled to an opinion, answers, and
//     its echoed `as_of` is what the screen then shows and reuses.
//   * `staff_advance_tie` REFUSES a null (`CLR10 an as-of date is required`), so it
//     must be handed a concrete date. It gets `effectiveAsOf` — the DB's own
//     echoed date once known, `businessToday()` (the MYT-rendered instant) until
//     then. Both reads are therefore always asked about the SAME day, and the day
//     converges on the DB's.
import { businessToday, yearBefore } from "../shared/businessDate";

export function AdvancesWorkbench({ token, clientId, clientName }: { token: string; clientId: string; clientName?: string | null }) {
  /** null ⇒ "whatever day the DB says it is". Set only when a human picks a date. */
  const [asOf, setAsOf] = useState<string | null>(null);
  /** The date the DB actually answered as of — echoed by `staff_advance_summary`. */
  const [dbAsOf, setDbAsOf] = useState<string | null>(null);
  const [rows, setRows] = useState<StaffAdvanceSummaryRow[]>([]);
  const [policyNotes, setPolicyNotes] = useState<PolicyNote[]>([]);
  const [openCents, setOpenCents] = useState<number | null>(null);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedAdvanceId, setSelectedAdvanceId] = useState<string | null>(null);
  const [tie, setTie] = useState<StaffAdvanceTieRead>(EMPTY_TIE);
  const [tieErr, setTieErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    // [F17/CX6#6 discipline, /aging precedent] clear stale rows up front — a
    // prior read's money must never linger through the loading window.
    setRows([]);
    setOpenCents(null);
    setIncompleteCount(null);
    try {
      const read = await staffAdvanceSummary(token, clientId, asOf);
      setRows(read.advances);
      setPolicyNotes(read.policy_notes);
      setOpenCents(read.outstanding_cents);
      setIncompleteCount(read.incomplete_count);
      setAvailable(read.available);
      // The DB's own answer to "which day is this?" — adopted, then reused for the
      // tie read (which refuses a null) so both instruments report the same day.
      setDbAsOf(read.as_of);
    } catch (e) {
      setLoadErr((e as PgrestError).message ?? String(e));
      setRows([]);
      setAvailable(true);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, asOf]);

  // The one date every dated instrument on this screen uses. A human pick wins;
  // otherwise the DB's echoed date; only before the first answer does the local
  // MYT-rendered instant stand in — and it is the business date, not a UTC slice.
  const effectiveAsOf = asOf ?? dbAsOf ?? businessToday();

  const reloadTie = useCallback(async () => {
    setTieErr(null);
    try {
      setTie(await staffAdvanceTie(token, clientId, effectiveAsOf));
    } catch (e) {
      setTieErr((e as PgrestError).message ?? String(e));
      setTie(EMPTY_TIE);
    }
  }, [token, clientId, effectiveAsOf]);

  useEffect(() => { setSelectedAdvanceId(null); void reload(); }, [reload]);
  useEffect(() => { void reloadTie(); }, [reloadTie]);

  const state = advancesScreenState({ loading, error: !!loadErr, totalRows: rows.length, available });
  const selectedRow = rows.find((r) => r.advance_id === selectedAdvanceId) ?? null;

  return (
    <div>
      <div className={styles.section} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.subtitle}>{clientName ?? `client ${clientId.slice(0, 8)}`}</p>
      </div>

      <div className={styles.actions}>
        <label className={styles.field} style={{ marginLeft: "auto" }}>
          <span className={styles.fieldLabel}>as of{asOf === null ? " (the DB's date)" : ""}</span>
          <input
            type="date" className={styles.input} value={effectiveAsOf}
            onChange={(e) => setAsOf(e.target.value || null)} aria-label="As-of date"
          />
        </label>
      </div>

      {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}

      <div className={styles.layout}>
        <section className={styles.listPane}>
          <p className={styles.sectionTitle}>
            Advances as of {effectiveAsOf} ({rows.length})
            {openCents !== null ? <span className={styles.muted}> · outstanding {fmtCents(openCents)}</span> : null}
            {incompleteCount ? <span className={styles.overdueTag}>{incompleteCount} incomplete</span> : null}
          </p>
          <AdvanceListBody
            state={state} rows={rows} selectedAdvanceId={selectedAdvanceId} onSelect={setSelectedAdvanceId}
          />
          {policyNotes.length > 0 ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>EA 1955 advisory notes</p>
              {policyNotes.map((n) => (
                <p key={n.fact} className={styles.policyNote}>
                  <strong>{n.fact}</strong> — {n.note} <span className={styles.muted}>({n.source_note})</span>
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.detailPane}>
          {selectedRow ? (
            <AdvanceDetailPane
              token={token} clientId={clientId} row={selectedRow} asOf={effectiveAsOf}
              onChanged={() => { void reload(); void reloadTie(); }}
            />
          ) : (
            <p className={styles.detailEmpty}>Select an advance to see its account statement and particulars.</p>
          )}
        </section>
      </div>

      <AdvanceTieStrip read={tie} err={tieErr} />
      {/* [round-5 fix] the tie is the panel's SECOND source: it walks the union of
          enrolments and advances, so an enrolment with no disbursed advance — which
          still reserves its account code against four other doors — is retirable. */}
      <EnrolPanel
        token={token} clientId={clientId} rows={rows} tie={tie}
        onChanged={() => { void reload(); void reloadTie(); }}
      />
    </div>
  );
}

/** [F17/CX6#6 discipline, the AgingListBody precedent] the list pane's body,
 *  split out PURE (no hooks, no network) so its render branches are directly
 *  testable — every ScreenState arm is explicit. */
export function AdvanceListBody({
  state, rows, selectedAdvanceId, onSelect,
}: {
  state: ScreenState;
  rows: StaffAdvanceSummaryRow[];
  selectedAdvanceId: string | null;
  onSelect: (id: string) => void;
}) {
  if (state === "loading") return <p className={styles.muted}>Loading…</p>;
  if (state === "error") return <p className={styles.errorText}>Could not load the advance register — showing nothing rather than stale rows from a prior read.</p>;
  if (state === "unavailable") {
    return <p className={styles.errorText}>The advance register came back in an unexpected shape — showing nothing rather than guessing. Try reloading.</p>;
  }
  if (state === "empty") {
    return <p className={styles.emptyState}>No staff advances on this register yet.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>person</th><th>account</th><th>issued</th>
            <th className={styles.num}>amount</th><th className={styles.num}>outstanding</th><th>days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.advance_id}
              className={`${styles.counterpartyRow} ${r.advance_id === selectedAdvanceId ? styles.counterpartyRowActive : ""}`}
              onClick={() => onSelect(r.advance_id)}
            >
              <td>
                {r.person_label || shortId(r.advance_id)}
                {r.voided ? <span className={styles.overdueTag}>voided</span> : null}
                {advanceIsIncomplete(r) ? <span className={styles.overdueTag}>incomplete</span> : null}
              </td>
              <td>{r.account_code}</td>
              <td>{r.issue_date ?? "—"}</td>
              <td className={styles.num}>{fmtCents(r.amount_cents)}</td>
              <td className={styles.num}>
                <strong>{fmtCents(r.outstanding_cents)}</strong>
                {advanceRowHasOutstanding(r) ? null : <span className={styles.muted}> settled</span>}
              </td>
              <td>{r.days_outstanding ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The detail pane for one selected advance: the account's running
 *  statement (scoped [year-before(asOf), asOf] like /aging's own default
 *  window) + the particulars completion form (design §3.2's purpose/
 *  reference set-once door) when incomplete. Opening/closing balances and the
 *  enrolment GENERATIONS come straight off the statement envelope. */
function AdvanceDetailPane({
  token, clientId, row, asOf, onChanged,
}: {
  token: string; clientId: string; row: StaffAdvanceSummaryRow; asOf: string; onChanged: () => void;
}) {
  const [from, setFrom] = useState(() => yearBefore(asOf));
  const [to, setTo] = useState(asOf);
  const [stmt, setStmt] = useState<StaffAdvanceStatementRead>(EMPTY_STATEMENT);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setStmt(await staffAdvanceStatement(token, clientId, row.account_code, from, to));
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
      setStmt(EMPTY_STATEMENT);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, row.account_code, from, to]);

  useEffect(() => { void reload(); }, [reload]);

  const lines = stmt.rows;

  return (
    <div>
      <p className={styles.subtitle}>{row.person_label || shortId(row.advance_id)}</p>
      <p className={styles.muted}>
        account {row.account_code} · issued {row.issue_date ?? "—"} · outstanding as of {asOf}: {fmtCents(row.outstanding_cents)}
      </p>
      {row.purpose ? <p className={styles.muted}>purpose: {row.purpose}{row.reference ? ` · ref ${row.reference}` : ""}</p> : null}

      {advanceIsIncomplete(row) ? (
        <ParticularsForm token={token} clientId={clientId} advanceId={row.advance_id} onDone={onChanged} />
      ) : null}

      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>from</span>
          <input type="date" className={styles.input} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Statement from date" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>to</span>
          <input type="date" className={styles.input} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Statement to date" />
        </label>
      </div>
      {err ? <p className={styles.errorText}>{err}</p> : null}
      {stmt.generations.length > 0 ? (
        <p className={styles.muted}>
          held by {stmt.generations.map((g) => `${g.person_label}${g.active ? "" : " (retired)"}`).join(" · ")}
        </p>
      ) : null}
      {loading && lines.length === 0 ? (
        <p className={styles.muted}>Loading…</p>
      ) : !stmt.available ? (
        <p className={styles.errorText}>The statement came back in an unexpected shape — showing nothing rather than guessing.</p>
      ) : lines.length === 0 ? (
        <p className={styles.emptyState}>No movements in this range.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>date</th><th>kind</th><th className={styles.num}>amount</th><th className={styles.num}>running</th><th>reason</th></tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3} className={styles.muted}>opening {stmt.from ?? "—"}</td>
                <td className={styles.num}>{fmtCents(stmt.opening_cents)}</td>
                <td></td>
              </tr>
              {lines.map((l, i) => (
                <tr key={`${l.kind}-${l.entry_id ?? i}-${i}`}>
                  <td>{l.date ?? "—"}</td>
                  <td>{l.kind}{l.application_kind ? ` · ${l.application_kind}` : ""}</td>
                  <td className={styles.num}>{fmtDeltaCents(l.amount_cents)}</td>
                  <td className={styles.num}>{fmtCents(l.running_cents)}</td>
                  <td>{l.reason ?? "—"}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className={styles.muted}>closing {stmt.to ?? "—"}</td>
                <td className={styles.num}><strong>{fmtCents(stmt.closing_cents)}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** complete_staff_advance_particulars (design §3.2): purpose/reference,
 *  set-once — refuses `particulars_already_set` on a second call (ABI §F). */
function ParticularsForm({
  token, clientId, advanceId, onDone,
}: { token: string; clientId: string; advanceId: string; onDone: () => void }) {
  const [purpose, setPurpose] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await completeStaffAdvanceParticulars(token, clientId, advanceId, purpose.trim(), reference.trim());
      onDone();
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Complete particulars</p>
      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>purpose</span>
          <input className={styles.input} value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Advance purpose" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>reference</span>
          <input className={styles.input} value={reference} onChange={(e) => setReference(e.target.value)} aria-label="Advance reference" />
        </label>
      </div>
      <button className={styles.button} disabled={busy || !purpose.trim()} onClick={() => void submit()}>
        {busy ? "Saving…" : "Complete particulars"}
      </button>
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
