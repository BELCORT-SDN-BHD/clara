"use client";

// The firm review queue (contract §4 / §6 WA-R6 / DIRECTION List model). Plumbing-
// grade, consistent with /chat + /documents: dev auth is the pasted session JWT
// (sessionStorage). One cross-client queue over list_review_queue — sections by lane,
// grouped client→vendor by the envelope's total order; counts + sweep staleness from
// the SAME snapshot (never a live progress bar); always-on filter; scope dropdown;
// keyset cursor + scope + selection mirrored to the URL (the shared address space);
// virtualization; the five screen states; split-view row → doc_review detail; and the
// routine-only batch approve. The queue degrades to its honest empty/error states when
// the 0011 read fns are absent (PostgREST 404) — which is also how it develops now.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listReviewQueue, pgrestConfigured, type QueueScope } from "../shared/reviewApi";
import type { ReviewQueue, QueueRow } from "../shared/reviewTypes";
import { listClients, type ClientRow } from "../documents/api";
import { runtimeBase, supabaseBase } from "../shared/wire";
import {
  decodeCursor, encodeCursor, filterRows, groupBySection, isSelectable, queueScreenState,
  SECTION_TITLE, type QueueSectionKey,
} from "./model";
import { VirtualList } from "./VirtualList";
import { QueueRowView } from "./QueueRowView";
import { QueueDetail } from "./QueueDetail";
import { BatchApprove } from "./BatchApprove";
import styles from "./queue.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents

type Item = { kind: "header"; id: string; title: string; count: number } | { kind: "row"; row: QueueRow };

function Tile({ n, label }: { n: number; label: string }) {
  return <div className={styles.countTile}><div className={styles.countNum}>{n}</div><div className={styles.countLabel}>{label}</div></div>;
}

export default function QueuePage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("");
  const [sel, setSel] = useState("");
  const [cursor, setCursor] = useState<{ tuple: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const didInit = useRef(false);

  // Mount: hydrate token + parse the URL (scope / sel / cursor) once.
  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    const p = new URLSearchParams(window.location.search);
    setScope(p.get("scope") ?? "");
    setSel(p.get("sel") ?? "");
    setCursor(decodeCursor(p.get("cursor")));
    didInit.current = true;
  }, []);

  // Mirror scope / sel / cursor into the URL (replaceState — the shared address space).
  useEffect(() => {
    if (!didInit.current) return;
    const p = new URLSearchParams();
    if (scope) p.set("scope", scope);
    if (sel) p.set("sel", sel);
    const c = encodeCursor(cursor);
    if (c) p.set("cursor", c);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [scope, sel, cursor]);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !supabaseBase()) return;
    setLoading(true);
    setError(null);
    try {
      const scopeArg: QueueScope = scope ? { client_id: scope } : {};
      setQueue(await listReviewQueue(token, scopeArg, cursor, 50));
    } catch (e) {
      setError((e as Error).message);
      setQueue(null);
    } finally {
      setLoading(false);
    }
  }, [token, scope, cursor]);

  useEffect(() => { void load(); }, [load]);

  const rows = queue?.rows ?? [];
  const filtered = useMemo(() => filterRows(rows, query), [rows, query]);
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const g of groupBySection(filtered)) {
      out.push({ kind: "header", id: `h:${g.key}`, title: SECTION_TITLE[g.key as QueueSectionKey], count: g.rows.length });
      for (const row of g.rows) out.push({ kind: "row", row });
    }
    return out;
  }, [filtered]);

  const selectedRows = useMemo(
    () => rows.filter((r) => r.entry_id && selected.has(r.entry_id) && isSelectable(r)),
    [rows, selected],
  );
  const detailRow = rows.find((r) => r.id === sel) ?? null;

  const toggleSelect = (entryId: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(entryId)) n.delete(entryId); else n.add(entryId);
    return n;
  });
  const changeScope = (v: string) => { setScope(v); setCursor(null); setSelected(new Set()); };
  const goPage = (c: { tuple: string[] } | null) => { setCursor(c); setSelected(new Set()); };

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setQueue(null);
  };

  const state = queueScreenState({
    loading, error: !!error, totalRows: rows.length, visibleRows: filtered.length,
    loadingMore: false, hasMore: !!queue?.next_cursor,
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Clara review queue</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}</p>
        {error && rows.length > 0 ? <p className={styles.banner}>{error}</p> : null}
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load the firm review queue.</p>
      ) : !pgrestConfigured() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read the queue on the human lane.</p>
      ) : (
        <>
          {queue ? (
            <div className={styles.countGrid}>
              <Tile n={queue.counts.ready} label="ready" />
              <Tile n={queue.counts.needs_review} label="needs review" />
              <Tile n={queue.counts.needs_you} label="needs you" />
              <Tile n={queue.counts.open_drafts} label="open drafts" />
              <Tile n={queue.counts.open_questions} label="open questions" />
              <Tile n={queue.counts.open_tasks} label="open tasks" />
              {/* Only once the watch surface exists: a pre-0016 DB has no watches at
                  all, and a permanent "0 compliance" tile would be noise, not news. */}
              {queue.counts.compliance_watches > 0 || queue.compliance.clients.length > 0 ? <Tile n={queue.counts.compliance_watches} label="compliance" /> : null}
              {queue.sweep.open_run ? <span className={styles.staleBadge}>sweep reconciling</span> : null}
              {queue.compliance.stale_evaluator ? <span className={styles.staleBadge}>compliance eval stale</span> : null}
            </div>
          ) : null}

          {/* §2.3: a persistent banner once any watch reaches early_warning (crossed/
              overdue rows already sort to top-of-queue via their needs_you section). */}
          {queue && queue.compliance.clients.some((c) => c.state === "early_warning" || c.state === "crossed" || c.state === "overdue") ? (
            <p className={styles.banner}>An SST registration-threshold watch needs attention — open the compliance rows to review.</p>
          ) : null}

          <div className={styles.toolbar}>
            <input className={styles.filterInput} placeholder="Filter this page…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter queue" />
            <select className={styles.input} value={scope} onChange={(e) => changeScope(e.target.value)} aria-label="Scope by client">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
            {cursor ? <button className={styles.linkButton} onClick={() => goPage(null)}>first page</button> : null}
          </div>

          {selectedRows.length > 0 ? (
            <BatchApprove token={token} rows={selectedRows} onClearSelection={() => setSelected(new Set())} onApproved={() => void load()} />
          ) : null}

          <div className={styles.layout}>
            <section className={styles.listPane}>
              {state === "loading" ? (
                <div>{[0, 1, 2, 3, 4].map((i) => <div key={i} className={styles.skeletonRow} />)}</div>
              ) : state === "error" ? (
                <p className={styles.stateBlock}>Could not load the queue: {error}. The review fns may not be deployed yet — retry once 0011 is live.</p>
              ) : state === "empty" ? (
                <p className={styles.stateBlock}>{query.trim() ? "No rows match this filter." : "Nothing to review — the queue is clear."}</p>
              ) : (
                <>
                  <VirtualList
                    items={items}
                    render={(item) =>
                      item.kind === "header" ? (
                        <div className={styles.sectionHeader}>{item.title} · {item.count}</div>
                      ) : (
                        <QueueRowView
                          row={item.row}
                          active={item.row.id === sel}
                          selectable={isSelectable(item.row)}
                          selected={!!item.row.entry_id && selected.has(item.row.entry_id)}
                          onOpen={() => setSel(item.row.id)}
                          onToggleSelect={() => item.row.entry_id && toggleSelect(item.row.entry_id)}
                        />
                      )
                    }
                  />
                  {state === "partial" && queue?.next_cursor ? (
                    <div className={styles.loadMoreBar}>
                      <button className={styles.buttonSecondary} onClick={() => goPage(queue.next_cursor)}>Next page →</button>
                    </div>
                  ) : null}
                </>
              )}
            </section>

            <section className={styles.detailPane}>
              <QueueDetail token={token} row={detailRow} compliance={queue?.compliance ?? null} onChanged={() => void load()} />
            </section>
          </div>
        </>
      )}
    </main>
  );
}
