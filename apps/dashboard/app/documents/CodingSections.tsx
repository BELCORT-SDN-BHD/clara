// Slice-6 coding surfaces for /documents (contract §7): a read-only uncoded-bills
// view (list_uncoded_filings) + the coding-tasks list (coding_tasks_visible), the
// AB-9 recode carrier as a real durable task. House act()/re-load idiom — every
// mutation is followed by a full re-read from the DB (no optimistic UI). Coding
// itself is chat-first (S6-R10); these are the read + close surfaces, not a
// coder — "Done" just records that a task was addressed, referencing the coded
// entry when known.

import { useCallback, useEffect, useState } from "react";
import {
  completeCodingTask,
  dismissCodingTask,
  listCodingTasks,
  listUncodedFilings,
  type ClientRow,
  type CodingTaskRow,
  type UncodedFiling,
} from "./api";
import styles from "./documents.module.css";

export function CodingSections({ token, clients }: { token: string; clients: ClientRow[] }) {
  const [clientFilter, setClientFilter] = useState("");
  const [uncoded, setUncoded] = useState<UncodedFiling[]>([]);
  const [tasks, setTasks] = useState<CodingTaskRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Per-task inputs (the coded result entry to reference / a dismiss reason).
  const [entryInput, setEntryInput] = useState<Record<string, string>>({});
  const [reasonInput, setReasonInput] = useState<Record<string, string>>({});

  const clientName = (id: string | null) => (id ? clients.find((c) => c.id === id)?.name || id.slice(0, 8) : "firm-wide");

  const load = useCallback(async () => {
    setErr(null);
    const filter = clientFilter || null;
    // The two reads are independent; a masked-view column mismatch surfaces inline
    // rather than blanking the whole page.
    const [u, t] = await Promise.allSettled([listUncodedFilings(token, filter), listCodingTasks(token, { clientId: filter })]);
    if (u.status === "fulfilled") setUncoded(u.value);
    else setErr((u.reason as Error).message);
    if (t.status === "fulfilled") setTasks(t.value);
    else setErr((prev) => prev ?? (t.reason as Error).message);
  }, [token, clientFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openTasks = tasks.filter((t) => t.status === "open");
  const closedTasks = tasks.filter((t) => t.status !== "open");

  return (
    <div className={styles.detail}>
      <div className={styles.inlineRow}>
        <label className={styles.muted} htmlFor="coding-client-filter">Client</label>
        <select id="coding-client-filter" aria-label="Filter coding by client" className={styles.input} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients (firm-wide)</option>
          {clients.filter((c) => c.status === "active").map((c) => (
            <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>
          ))}
        </select>
        <button className={styles.linkButton} disabled={busy} onClick={() => void load()}>refresh</button>
      </div>

      <section className={styles.section}>
        <h2 className={styles.h4}>Uncoded bills</h2>
        <p className={styles.muted}>Active filings with no draft and no unreversed approved entry. Ask Clara in chat to code one.</p>
        {uncoded.length === 0 ? <p className={styles.muted}>No uncoded bills.</p> : (
          <ul className={styles.plainList}>
            {uncoded.map((f) => (
              <li key={f.filing_id} className={styles.rowItem}>
                <span>{f.filename || (f.document_id ? f.document_id.slice(0, 8) : f.filing_id.slice(0, 8))}</span>
                <span className={styles.muted}>{clientName(f.client_id)}{f.filed_at ? ` · filed ${new Date(f.filed_at).toLocaleDateString()}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.h4}>Coding tasks</h2>
        {openTasks.length === 0 ? <p className={styles.muted}>No open coding tasks.</p> : (
          <ul className={styles.plainList}>
            {openTasks.map((t) => (
              <li key={t.id} className={styles.codingTask}>
                <div className={styles.rowItem}>
                  <span>{t.document_id ? t.document_id.slice(0, 8) : t.id.slice(0, 8)} <span className={styles.muted}>· {t.origin}{t.origin === "correction" ? " (recode)" : ""}</span></span>
                  <span className={styles.muted}>{clientName(t.client_id)}</span>
                </div>
                <div className={styles.inlineRow}>
                  <input className={styles.input} aria-label={`result entry id for task ${t.id.slice(0, 8)}`} placeholder="coded entry id"
                    value={entryInput[t.id] ?? ""} onChange={(e) => setEntryInput({ ...entryInput, [t.id]: e.target.value })} />
                  <button className={styles.linkButton} disabled={busy || !(entryInput[t.id]?.trim())} onClick={() => void act(() => completeCodingTask(token, t.id, entryInput[t.id]!.trim()))}>Done</button>
                </div>
                <div className={styles.inlineRow}>
                  <input className={styles.input} aria-label={`dismiss reason for task ${t.id.slice(0, 8)}`} placeholder="dismiss reason"
                    value={reasonInput[t.id] ?? ""} onChange={(e) => setReasonInput({ ...reasonInput, [t.id]: e.target.value })} />
                  <button className={styles.linkButton} disabled={busy || !(reasonInput[t.id]?.trim())} onClick={() => void act(() => dismissCodingTask(token, t.id, reasonInput[t.id]!.trim()))}>Dismiss</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {closedTasks.length > 0 ? (
          <ul className={styles.plainList}>
            {closedTasks.map((t) => (
              <li key={t.id} className={styles.rowItem}>
                <span className={styles.muted}>{t.document_id ? t.document_id.slice(0, 8) : t.id.slice(0, 8)} · {t.origin}{t.closed_reason ? ` — ${t.closed_reason}` : ""}</span>
                <span className={styles.muted}>{t.status}{t.result_entry_id ? ` → ${t.result_entry_id.slice(0, 8)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
