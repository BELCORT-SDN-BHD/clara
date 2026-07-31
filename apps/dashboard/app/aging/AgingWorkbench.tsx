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
  agingScreenState, agingRowHasBalance, isOverdueMarker, AGING_BUCKET_LABELS,
  type AgingBucketRow, type AgingDomain, type StatementLineRow,
} from "./agingModel";
import { fmtCents } from "../shared/fmt";
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
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const fn = domain === "ar" ? arAging : apAging;
      setRows(await fn(token, clientId, asOf));
    } catch (e) {
      setLoadErr((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, domain, asOf]);

  useEffect(() => { setSelectedCounterpartyId(null); void reload(); }, [reload]);

  const visibleRows = rows.filter(agingRowHasBalance);
  const state = agingScreenState({ loading, error: !!loadErr, totalRows: visibleRows.length });
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
          {state === "loading" ? (
            <p className={styles.muted}>Loading…</p>
          ) : state === "empty" ? (
            <p className={styles.emptyState}>No open {domain === "ar" ? "receivables" : "payables"} as of this date.</p>
          ) : (
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
                      onClick={() => setSelectedCounterpartyId(r.counterparty_id)}
                    >
                      <td>
                        {r.counterparty_name ?? r.counterparty_id.slice(0, 8)}
                        {typeof r.overdue_cents === "number" && r.overdue_cents !== 0 ? <span className={styles.overdueTag}>overdue</span> : null}
                      </td>
                      {AGING_BUCKET_LABELS.map((b) => <td key={b.key} className={styles.num}>{fmtCents(r[b.key])}</td>)}
                      <td className={styles.num}><strong>{fmtCents(r.total_cents)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const fn = domain === "ar" ? customerStatement : supplierStatement;
      setLines(await fn(token, clientId, row.counterparty_id, from, to));
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [token, clientId, domain, row.counterparty_id, from, to]);

  useEffect(() => { void reload(); }, [reload]);

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
      {loading && lines.length === 0 ? (
        <p className={styles.muted}>Loading…</p>
      ) : lines.length === 0 ? (
        <p className={styles.emptyState}>No items in this range.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>date</th><th>kind</th><th>description</th>
                <th className={styles.num}>amount</th><th className={styles.num}>outstanding</th><th className={styles.num}>running balance</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.item_id}>
                  <td>{l.item_date ?? "—"}</td>
                  <td>{l.item_kind ?? "—"}</td>
                  <td>
                    {l.description ?? "—"}
                    {isOverdueMarker(l.due_date, asOf) ? <span className={styles.overdueTag}>overdue</span> : null}
                  </td>
                  <td className={styles.num}>{fmtCents(l.amount_cents)}</td>
                  <td className={styles.num}>{fmtCents(l.outstanding_cents)}</td>
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
