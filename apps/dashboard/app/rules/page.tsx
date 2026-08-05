"use client";

// The autopost standing-rules management surface (contract §6 / §7 / WA2-R7..R12).
// Plumbing-grade, consistent with /queue: dev auth is the pasted session JWT
// (sessionStorage, shared key). It lists a client's autopost rules (see), offers sign
// (admin+) / retire, surfaces the renew-or-retire nudge (L6 — read notifications), and
// a compact human-author propose form (bookkeeper+; only admin+ signs). All governed
// acts are PostgREST rpc() — static-export holds (no server route). The agent NEVER
// signs; the signature is the posting authority. Every amount is DB-owned (the cap is
// sent raw for the DB to normalize — the UI computes no cents).

import { useCallback, useEffect, useMemo, useState } from "react";
import { listAutopostRules, listRuleNotifications, proposeAutopostRule, pgrestConfigured, type QueueScope } from "../shared/reviewApi";
import type { AutopostRule, Notification } from "../shared/reviewCardTypes";
import { listClients, type ClientRow } from "../documents/api";
import { runtimeBase, supabaseBase } from "../shared/wire";
import { isExpiringSoon } from "./model";
import { AutopostRulePanel } from "./AutopostRulePanel";
import { AdjustmentTemplatePanel } from "./AdjustmentTemplatePanel";
import styles from "./rules.module.css";

const TOKEN_KEY = "clara_dev_jwt"; // shared with /chat + /documents + /queue

export default function RulesPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [scope, setScope] = useState("");
  const [rules, setRules] = useState<AutopostRule[] | null>(null);
  const [nudges, setNudges] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []); // mount-time clock for the nudge/urgency bands

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !supabaseBase()) return;
    setLoading(true); setError(null);
    const s: QueueScope = scope ? { client_id: scope } : {};
    try {
      const [r, n] = await Promise.all([
        listAutopostRules(token, s),
        listRuleNotifications(token, s).catch(() => [] as Notification[]),
      ]);
      setRules(r); setNudges(n);
    } catch (e) {
      setError((e as Error).message); setRules(null);
    } finally {
      setLoading(false);
    }
  }, [token, scope]);

  useEffect(() => { void load(); }, [load]);

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t); setToken(t); setRules(null);
  };

  const rulesList = rules ?? [];
  const expiringCount = rulesList.filter((r) => isExpiringSoon(r, now)).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Autopost standing rules</h1>
        <div className={styles.tokenBar}>
          <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
          <button className={styles.button} onClick={saveToken}>Use token</button>
        </div>
        <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"} · PostgREST: {supabaseBase() ?? "not configured"}</p>
      </header>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to load the firm&rsquo;s autopost rules.</p>
      ) : !pgrestConfigured() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read the rules on the human lane.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <select className={styles.input} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope by client">
              <option value="">All clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
            </select>
            {expiringCount > 0 ? <span className={styles.staleBadge}>{expiringCount} renew-or-retire</span> : null}
          </div>

          {nudges.length > 0 ? (
            <div className={styles.nudges}>
              <p className={styles.sectionTitle}>Renew-or-retire nudges</p>
              {nudges.map((n) => (
                <p key={n.id} className={styles.nudge}>
                  <span className={styles.badge}>{n.kind}</span>
                  {typeof n.payload.message === "string" ? n.payload.message : "An autopost rule is nearing its hard expiry — renew with a fresh signature or retire it."}
                  {n.created_at ? <span className={styles.muted}> · {new Date(n.created_at).toLocaleString()}</span> : null}
                </p>
              ))}
            </div>
          ) : null}

          {error ? <p className={styles.banner}>Could not load rules: {error}. The 0015 rule fns may not be deployed yet.</p> : null}
          {loading && !rules ? <p className={styles.muted}>Loading autopost rules…</p> : null}
          {rules && rulesList.length === 0 && !loading ? <p className={styles.muted}>No autopost rules{scope ? " for this client" : ""} yet. Rules are proposed from human-approved sightings, then signed by an admin.</p> : null}

          <div className={styles.ruleList}>
            {rulesList.map((r) => (
              <AutopostRulePanel key={r.rule_id} token={token} rule={r} now={now} onChanged={() => void load()} />
            ))}
          </div>

          <ProposeForm token={token} clients={clients} defaultClient={scope} onProposed={() => void load()} />

          {/* Wave D-b (design §2.7/§2.8): adjustment templates are ALWAYS
              client-scoped (list_adjustment_templates/adjustment_run_due both
              take p_client, unlike the autopost rules' optional {}-scope
              above) — only rendered once a specific client is picked. */}
          {scope ? (
            <AdjustmentTemplatePanel token={token} clientId={scope} />
          ) : (
            <p className={styles.muted}>Scope to one client above to see its adjustment templates.</p>
          )}
        </>
      )}
    </main>
  );
}

// A compact human-author proposal (WA2 §6.2: bookkeeper+ may author; only admin+ signs).
// The cap is sent RAW (a string) — the DB normalizes to cents (the DB owns every number).
function ProposeForm({ token, clients, defaultClient, onProposed }: {
  token: string; clients: ClientRow[]; defaultClient: string; onProposed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({
    client_id: defaultClient, counterparty_id: "", direction: "purchase",
    account_code: "", amount_cap: "", frequency_window: "monthly", window_max_posts: "3", expires_at: "",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      await proposeAutopostRule(token, {
        client_id: f.client_id || null, counterparty_id: f.counterparty_id || null, direction: f.direction,
        account_code: f.account_code || null, amount_cap: f.amount_cap || null, frequency_window: f.frequency_window,
        window_max_posts: Number(f.window_max_posts) || null, expires_at: f.expires_at || null,
      });
      setMsg("Proposed — an admin must sign it before it posts."); onProposed();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return <button className={styles.linkButton} onClick={() => setOpen(true)}>+ Propose an autopost rule</button>;
  return (
    <div className={styles.propose}>
      <p className={styles.sectionTitle}>Propose an autopost rule (bookkeeper+ — an admin signs)</p>
      <div className={styles.proposeGrid}>
        <select className={styles.input} value={f.client_id} onChange={set("client_id")} aria-label="Client">
          <option value="">Select client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name || c.id.slice(0, 8)}</option>)}
        </select>
        <input className={styles.input} placeholder="Counterparty id" value={f.counterparty_id} onChange={set("counterparty_id")} aria-label="Counterparty id" />
        <select className={styles.input} value={f.direction} onChange={set("direction")} aria-label="Direction">
          <option value="purchase">purchase</option>
          <option value="sales">sales</option>
        </select>
        <input className={styles.input} placeholder="Account code" value={f.account_code} onChange={set("account_code")} aria-label="Account code" />
        <input className={styles.input} placeholder="Cap e.g. 1000.00" value={f.amount_cap} onChange={set("amount_cap")} aria-label="Amount cap (RM)" />
        <input className={styles.input} placeholder="Window" value={f.frequency_window} onChange={set("frequency_window")} aria-label="Frequency window" />
        <input className={styles.input} placeholder="Max posts" value={f.window_max_posts} onChange={set("window_max_posts")} aria-label="Max posts per window" />
        <input className={styles.input} type="date" value={f.expires_at} onChange={set("expires_at")} aria-label="Expires at" />
      </div>
      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || !f.client_id || !f.counterparty_id || !f.account_code} onClick={() => void submit()}>
          {busy ? "Proposing…" : "Propose"}
        </button>
        <button className={styles.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        {msg ? <span className={styles.muted}>{msg}</span> : null}
      </div>
      <p className={styles.hint}>The cap is sent as typed — the DB normalizes it to cents and enforces the ceiling (min of your cap and the firm high-stakes threshold). Bounds are frozen once signed.</p>
    </div>
  );
}
