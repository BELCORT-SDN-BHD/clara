"use client";

// The carry-down workbench shell (LANE D3; settled plan §1 F9). Dev auth = the pasted
// session JWT (sessionStorage, shared with /queue + /documents). Left pane: client scope +
// the opening-seed list + the create-seed form (tie-document picker fed by verified
// opening_balance_doc/management_account filings, or the attributed keyed fallback). Right
// pane: the selected seed's workbench. URL mirrors the selected seed (URL-as-truth). Every
// figure/count is DB-authored; the UI computes none.

import { useCallback, useEffect, useState } from "react";
import { listClients, type ClientRow } from "../documents/api";
import { listOpeningSeeds, getClientPlan, listOpeningTieDocuments, createOpeningSeed, type TieDocument } from "../shared/openingApi";
import type { OpeningSeedRow } from "./openingModel";
import { SeedWorkbench } from "./SeedWorkbench";
import { runtimeBase, supabaseBase } from "../shared/wire";
import { shortId } from "../shared/fmt";
import styles from "./opening.module.css";

const TOKEN_KEY = "clara_dev_jwt";
const KEYED = "__keyed__";

export default function OpeningPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [scope, setScope] = useState("");
  const [seeds, setSeeds] = useState<OpeningSeedRow[]>([]);
  const [sel, setSel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Create-seed form.
  const [newClient, setNewClient] = useState("");
  const [asOf, setAsOf] = useState("");
  const [tieDocs, setTieDocs] = useState<TieDocument[]>([]);
  const [tieChoice, setTieChoice] = useState(KEYED);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [didInit, setDidInit] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    const p = new URLSearchParams(window.location.search);
    setScope(p.get("scope") ?? "");
    setSel(p.get("seed") ?? "");
    setDidInit(true);
  }, []);

  useEffect(() => {
    if (!didInit) return;
    const p = new URLSearchParams();
    if (scope) p.set("scope", scope);
    if (sel) p.set("seed", sel);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [scope, sel, didInit]);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !supabaseBase()) return;
    setError(null);
    try {
      setSeeds(await listOpeningSeeds(token, scope || null));
    } catch (e) {
      setError((e as Error).message);
      setSeeds([]);
    }
  }, [token, scope, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  // When a create-form client is chosen, load its verified tie documents.
  useEffect(() => {
    if (token && newClient && supabaseBase()) {
      listOpeningTieDocuments(token, newClient).then(setTieDocs).catch(() => setTieDocs([]));
    } else {
      setTieDocs([]);
    }
    setTieChoice(KEYED);
  }, [token, newClient]);

  const refresh = () => setNonce((n) => n + 1);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setSeeds([]);
  };

  async function create() {
    setCreateErr(null);
    if (!newClient || !asOf) {
      setCreateErr("Pick a client and an as-of date.");
      return;
    }
    setCreating(true);
    try {
      const plan = await getClientPlan(token, newClient);
      if (!plan) {
        setCreateErr("This client has no onboarding plan — begin onboarding first (Gate O).");
        return;
      }
      const tie = tieChoice === KEYED ? null : tieDocs.find((d) => d.document_id === tieChoice) ?? null;
      const out = await createOpeningSeed(token, {
        clientId: newClient,
        planId: plan.id,
        asOf,
        tieDocumentId: tie?.document_id ?? null,
        tieSha256: tie?.sha256 ?? null,
      });
      setAsOf("");
      setSel(out.seed_id);
      refresh();
    } catch (e) {
      setCreateErr((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const selectedSeed = seeds.find((s) => s.id === sel) ?? null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Opening carry-down workbench</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}</p>
        {error ? <p className={styles.banner}>{error}</p> : null}
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load opening seeds.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read seeds on the human lane.</p>
      ) : (
        <div className={styles.layout}>
          <section className={styles.listPane}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>scope by client</span>
              <select className={styles.select} value={scope} onChange={(e) => { setScope(e.target.value); setSel(""); }} aria-label="Scope by client">
                <option value="">All clients</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name || shortId(c.id)}</option>)}
              </select>
            </label>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Seeds ({seeds.length})</p>
              {seeds.length === 0 ? (
                <p className={styles.emptyState}>No opening seeds in scope.</p>
              ) : (
                seeds.map((s) => (
                  <button key={s.id} className={`${styles.seedRow} ${s.id === sel ? styles.seedRowActive : ""}`} onClick={() => setSel(s.id)}>
                    <span className={styles.seedRowMain}>
                      <span className={styles.seedRowTitle}>{shortId(s.id)} · {s.state}</span>
                      <span className={styles.seedRowSub}>
                        {s.tie_document_id ? "document-tied" : "keyed"} · as at {s.as_of} · batch {s.batch_n}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className={styles.section}>
              <p className={styles.sectionTitle}>Create a seed</p>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>client</span>
                <select className={styles.select} value={newClient} onChange={(e) => setNewClient(e.target.value)} aria-label="New seed client">
                  <option value="">Select…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name || shortId(c.id)}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>as-of date</span>
                <input className={styles.input} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="As-of date" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>tie document</span>
                <select className={styles.select} value={tieChoice} onChange={(e) => setTieChoice(e.target.value)} aria-label="Tie document">
                  <option value={KEYED}>Keyed fallback (no document — attributed to you)</option>
                  {tieDocs.map((d) => (
                    <option key={d.document_id} value={d.document_id}>
                      {d.document_kind} · {d.filename || shortId(d.document_id)}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button className={styles.button} disabled={creating} onClick={() => void create()}>
                  {creating ? "Creating…" : "Create seed"}
                </button>
              </div>
              {createErr ? <p className={styles.errorText}>{createErr}</p> : null}
            </div>
          </section>

          <section className={styles.workPane}>
            {selectedSeed ? (
              <SeedWorkbench
                key={selectedSeed.id}
                token={token}
                seed={selectedSeed}
                clientName={clients.find((c) => c.id === selectedSeed.client_id)?.name ?? null}
                onSeedChanged={refresh}
              />
            ) : (
              <p className={styles.emptyState}>Select a seed on the left, or create one, to open its carry-down workbench.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
