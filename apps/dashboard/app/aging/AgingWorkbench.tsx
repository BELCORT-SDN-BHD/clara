"use client";

// The /aging two-pane workbench (Wave C-c, design v2.1 §7): AR/AP toggle,
// as-of date picker, per-counterparty bucket table (list pane), drill-down to
// the counterparty statement — running balance (detail pane). Copies /bank's
// shell (BankWorkbench.tsx: dev-JWT, ?client_id=, two-pane layout). Every
// figure is DB-owned (ar_aging/ap_aging/customer_statement/supplier_statement
// reads); this module computes none — grouping/labels are the pure fns in
// ./agingModel.

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { arAging, apAging, customerStatement, supplierStatement } from "../shared/agingApi";
import {
  agingScreenState, agingRowHasBalance, agingRowHasOverdueItem, AGING_BUCKET_LABELS,
  type AgingBucketRow, type AgingDomain, type AgingTotals, type StatementLineRow, type ScreenState,
} from "./agingModel";
import { fmtCents, fmtDeltaCents } from "../shared/fmt";
import styles from "./aging.module.css";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearBefore(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export function AgingWorkbench({ token, clientId, clientName }: { token: string; clientId: string; clientName?: string | null }) {
  const [domain, setDomain] = useState<AgingDomain>("ar");
  const [asOf, setAsOf] = useState(todayIso());
  const [rows, setRows] = useState<AgingBucketRow[]>([]);
  const [totals, setTotals] = useState<AgingTotals | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    // [F17/CX6#6 fix] a domain/as-of TRANSITION clears rows AND totals up
    // front — the prior domain's money must never linger through the
    // loading window into a different domain's screen.
    setRows([]);
    setTotals(null);
    try {
      const fn = domain === "ar" ? arAging : apAging;
      const read = await fn(token, clientId, asOf);
      setRows(read.rows);
      setTotals(read.totals);
      setAvailable(read.available);
    } catch (e) {
      setLoadErr((e as Error).message);
      // [F17/CX6#6 fix] the catch also nulls totals explicitly (belt and
      // suspenders alongside the up-front clear above) — a failed reload
      // must never leave the PRIOR successful load's footer totals in state.
      setRows([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, domain, asOf]);

  useEffect(() => { setSelectedCounterpartyId(null); void reload(); }, [reload]);

  const visibleRows = rows.filter(agingRowHasBalance);
  const state = agingScreenState({ loading, error: !!loadErr, totalRows: visibleRows.length, available });
  const selectedRow = rows.find((r) => r.counterparty_id === selectedCounterpartyId) ?? null;

  return (
    <div>
      <div className={styles.section} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.subtitle}>{clientName ?? `client ${clientId.slice(0, 8)}`}</p>
      </div>

      <div className={styles.actions}>
        <button className={domain === "ar" ? styles.buttonSecondaryActive : styles.buttonSecondary} onClick={() => setDomain("ar")}>
          AR (receivables)
        </button>
        <button className={domain === "ap" ? styles.buttonSecondaryActive : styles.buttonSecondary} onClick={() => setDomain("ap")}>
          AP (payables)
        </button>
        <label className={styles.field} style={{ marginLeft: "auto" }}>
          <span className={styles.fieldLabel}>as of</span>
          <input type="date" className={styles.input} value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="As-of date" />
        </label>
      </div>

      {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}

      <div className={styles.layout}>
        <section className={styles.listPane}>
          <p className={styles.sectionTitle}>
            {domain === "ar" ? "Customers" : "Vendors"} as of {asOf} ({visibleRows.length})
          </p>
          <AgingListBody
            state={state} domain={domain} visibleRows={visibleRows} totals={totals}
            selectedCounterpartyId={selectedCounterpartyId} onSelect={setSelectedCounterpartyId}
          />
        </section>

        <section className={styles.detailPane}>
          {selectedRow ? (
            <CounterpartyStatementPane token={token} clientId={clientId} domain={domain} row={selectedRow} asOf={asOf} />
          ) : (
            <p className={styles.detailEmpty}>Select a counterparty to see its running-balance statement.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** [F17/CX6#6 fix] the list pane's body, split out PURE (no hooks, no
 *  network — the ReconciliationView precedent) precisely so its render
 *  branches are directly testable. The root cause of the stale-total bug
 *  was a MISSING 'error' branch here: `state` could read "error" while this
 *  fell through to the default table arm and rendered whatever `totals` the
 *  caller still had in hand. Every ScreenState arm is now explicit — no
 *  default table arm exists that a new/renamed state could silently fall
 *  into, and 'error' renders NO money at all. */
export function AgingListBody({
  state, domain, visibleRows, totals, selectedCounterpartyId, onSelect,
}: {
  state: ScreenState;
  domain: AgingDomain;
  visibleRows: AgingBucketRow[];
  totals: AgingTotals | null;
  selectedCounterpartyId: string | null;
  onSelect: (id: string) => void;
}) {
  if (state === "loading") return <p className={styles.muted}>Loading…</p>;
  if (state === "error") return <p className={styles.errorText}>Could not load this aging report — showing nothing rather than stale figures from a prior read.</p>;
  if (state === "unavailable") {
    return <p className={styles.errorText}>The aging report came back in an unexpected shape — showing nothing rather than guessing. Try reloading.</p>;
  }
  if (state === "empty") {
    return <p className={styles.emptyState}>No open {domain === "ar" ? "receivables" : "payables"} as of this date.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>counterparty</th>
            {AGING_BUCKET_LABELS.map((b) => <th key={b.key} className={styles.num}>{b.label}</th>)}
            <th className={styles.num}>total</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr
              key={r.counterparty_id}
              className={`${styles.counterpartyRow} ${r.counterparty_id === selectedCounterpartyId ? styles.counterpartyRowActive : ""}`}
              onClick={() => onSelect(r.counterparty_id)}
            >
              <td>
                {r.counterparty_name ?? r.counterparty_id.slice(0, 8)}
                {agingRowHasOverdueItem(r) ? <span className={styles.overdueTag}>overdue</span> : null}
              </td>
              {AGING_BUCKET_LABELS.map((b) => <td key={b.key} className={styles.num}>{fmtCents(r[b.key])}</td>)}
              <td className={styles.num}><strong>{fmtCents(r.total_cents)}</strong></td>
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot>
            <tr>
              <td><strong>total</strong></td>
              {AGING_BUCKET_LABELS.map((b) => <td key={b.key} className={styles.num}>{fmtCents(totals[b.key])}</td>)}
              <td className={styles.num}><strong>{fmtCents(totals.total_cents)}</strong></td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function CounterpartyStatementPane({
  token, clientId, domain, row, asOf,
}: {
  token: string;
  clientId: string;
  domain: AgingDomain;
  row: AgingBucketRow;
  asOf: string;
}) {
  const [from, setFrom] = useState(() => yearBefore(asOf));
  const [to, setTo] = useState(asOf);
  const [lines, setLines] = useState<StatementLineRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const fn = domain === "ar" ? customerStatement : supplierStatement;
      const read = await fn(token, clientId, row.counterparty_id, from, to);
      setLines(read.rows);
      setAvailable(read.available);
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, domain, row.counterparty_id, from, to]);

  useEffect(() => { void reload(); }, [reload]);

  const state = agingScreenState({ loading, error: !!err, totalRows: lines.length, available });

  return (
    <div>
      <p className={styles.subtitle}>{row.counterparty_name ?? row.counterparty_id.slice(0, 8)}</p>
      <p className={styles.muted}>outstanding as of {asOf}: {fmtCents(row.total_cents)}</p>
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
      {state === "loading" ? (
        <p className={styles.muted}>Loading…</p>
      ) : state === "unavailable" ? (
        <p className={styles.errorText}>This statement came back in an unexpected shape — showing nothing rather than guessing.</p>
      ) : state === "empty" ? (
        <p className={styles.emptyState}>No items in this range.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>date</th><th>type</th><th>label</th>
                <th className={styles.num}>delta</th><th className={styles.num}>running balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={`${l.row_type ?? "row"}-${l.allocation_id ?? l.item_id ?? i}-${i}`}>
                  <td>{l.event_date ?? "—"}</td>
                  <td>{l.row_type ?? "—"}</td>
                  <td>{l.label ?? "—"}</td>
                  <td className={styles.num}>{fmtDeltaCents(l.delta_cents)}</td>
                  <td className={styles.num}>{fmtCents(l.running_balance_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
