"use client";

// /clients/plan?client_id=<uuid> — the plan-as-document page (settled dashboard plan §3.2 /
// F7 / F11 / F15 / P14/P18/P19). URL-as-truth via the query param (static-export compatible;
// no SSR). Renders the onboarding packet: items grouped must_ask/capture/todo with states +
// required_for_commit, the append-only revisions record (intended-vs-actual), the still-to-
// capture checklist with the resolve verb, and the commit gate (OpeningDryRunCard + the commit
// verb + the CLR06 stale-plan re-review + the F15 temp-admin refusal). Also the F11 admin object
// verb (bootstrap_client_plan) on a pre-0017 ACTIVE client with no plan. Every figure/state is
// DB-authored; the DB is the commit gate — the page only previews and renders its verdicts.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  currentPlanForClient, listPlanItems, listPlanRevisions, openingSeedForPlan,
  commitClientOnboarding, resolveOnboardingPlanItem, bootstrapClientPlan,
  type OnboardingPlanRow, type OnboardingPlanItemRow, type OnboardingPlanRevisionRow, type OpeningSeedLite,
} from "../../shared/onboardingApi";
import { listClients, type ClientRow } from "../../documents/api";
import { supabaseBase } from "../../shared/wire";
import {
  groupItems, stillToCapture, commitReadiness, revisionsRecord,
  classifyCommitRefusal, classifyBootstrapRefusal, type CommitRefusal,
} from "./model";
import { CommitGate } from "./CommitGate";
import styles from "./plan.module.css";

const TOKEN_KEY = "clara_dev_jwt";

const STATE_CLS: Record<string, string> = { pending: styles.stPending ?? "", answered: styles.stAnswered ?? "", resolved: styles.stResolved ?? "", deferred: styles.stDeferred ?? "" };
const PLAN_STATE_CLS: Record<string, string> = { open: styles.stateOpen ?? "", committed: styles.stateCommitted ?? "", cancelled: styles.stateCancelled ?? "" };

function renderAnswer(a: unknown): string {
  if (a == null) return "—";
  if (typeof a === "string") return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}

function ItemCard({ it }: { it: OnboardingPlanItemRow }) {
  return (
    <div className={styles.itemCard}>
      <div className={styles.itemHead}>
        <span className={styles.itemKey}>{it.item_key}</span>
        <span className={`${styles.itemState} ${STATE_CLS[it.state] ?? ""}`}>{it.state}</span>
        {it.required_for_commit ? <span className={styles.reqTag}>required</span> : null}
      </div>
      {it.question ? <div className={styles.itemQ}>{it.question}</div> : null}
      {it.answer != null ? <div className={styles.itemA}>{renderAnswer(it.answer)}</div> : null}
    </div>
  );
}

export default function PlanPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [client, setClient] = useState<ClientRow | null>(null);
  const [plan, setPlan] = useState<OnboardingPlanRow | null>(null);
  const [items, setItems] = useState<OnboardingPlanItemRow[]>([]);
  const [revisions, setRevisions] = useState<OnboardingPlanRevisionRow[]>([]);
  const [seed, setSeed] = useState<OpeningSeedLite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [refusal, setRefusal] = useState<CommitRefusal | null>(null);
  const [resolveDrafts, setResolveDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setClientId(new URLSearchParams(window.location.search).get("client_id"));
  }, []);

  const load = useCallback(async () => {
    if (!token || !clientId || !supabaseBase()) return;
    setLoading(true);
    setError(null);
    try {
      const [clients, p] = await Promise.all([
        listClients(token).catch(() => [] as ClientRow[]),
        currentPlanForClient(token, clientId),
      ]);
      setClient(clients.find((c) => c.id === clientId) ?? null);
      setPlan(p);
      if (p) {
        const [its, revs, sd] = await Promise.all([
          listPlanItems(token, p.id),
          listPlanRevisions(token, p.id),
          openingSeedForPlan(token, clientId, p.id).catch(() => null),
        ]);
        setItems(its);
        setRevisions(revs);
        setSeed(sd);
      } else {
        setItems([]); setRevisions([]); setSeed(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  useEffect(() => { void load(); }, [load]);

  const saveToken = () => { const t = tokenDraft.trim(); sessionStorage.setItem(TOKEN_KEY, t); setToken(t); };

  const doCommit = async (attestation?: string) => {
    if (!plan || !clientId) return;
    setCommitting(true);
    setError(null);
    setRefusal(null);
    try {
      const r = await commitClientOnboarding(token, { clientId, planId: plan.id, expectedRevision: plan.revision_token, attestation });
      setNotice(`Onboarding committed — client is now ${r.status} (${r.attestation_kind ?? "checker"}).`);
      await load();
    } catch (e) {
      setRefusal(classifyCommitRefusal(e));
      await load(); // refresh the revision so a stale-plan retry uses the fresh token
    } finally {
      setCommitting(false);
    }
  };

  const doResolve = async (itemKey: string) => {
    if (!plan) return;
    const resolution = (resolveDrafts[itemKey] ?? "").trim();
    if (!resolution) return;
    setError(null);
    try {
      await resolveOnboardingPlanItem(token, { planId: plan.id, itemKey, resolution });
      setResolveDrafts((d) => ({ ...d, [itemKey]: "" }));
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doBootstrap = async () => {
    if (!clientId) return;
    setError(null);
    try {
      const r = await bootstrapClientPlan(token, clientId);
      setNotice(`Carry-down plan ${r.bootstrap_status} for the active client.`);
      await load();
    } catch (e) {
      const cls = classifyBootstrapRefusal(e);
      setError(cls === "not_active" ? "Bootstrap is only for a pre-0017 active client."
        : cls === "plan_exists" ? "This active client already has a non-bootstrap onboarding plan."
        : (e as Error).message);
    }
  };

  const groups = groupItems(items);
  const outstanding = stillToCapture(items);
  const readiness = plan ? commitReadiness(plan, items, { seedFinalized: seed?.state === "finalized" }) : null;
  const revs = revisionsRecord(revisions);

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Onboarding plan</h1>
      <p className={styles.muted}>
        {clientId ? `client ${clientId.slice(0, 8)}` : "no client_id"}
        {client?.name ? ` · ${client.name}` : ""}
        {clientId ? <> · <Link className={styles.linkButton} href={`/onboarding/client?client_id=${clientId}`}>interview →</Link></> : null}
      </p>
      <div className={styles.tokenBar}>
        <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
        <button className={styles.button} onClick={saveToken}>Use token</button>
      </div>

      {notice ? <p className={styles.note}>{notice}</p> : null}
      {error ? <p className={styles.banner}>{error}</p> : null}

      {!token ? (
        <p className={styles.muted}>Paste a JWT to load the plan.</p>
      ) : !supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to read the plan on the human lane.</p>
      ) : !clientId ? (
        <p className={styles.muted}>This page needs a ?client_id=&lt;uuid&gt; in the URL.</p>
      ) : loading && !plan ? (
        <p className={styles.muted}>Loading plan…</p>
      ) : !plan ? (
        <div>
          <p className={styles.muted}>This client has no onboarding plan.</p>
          {client?.status === "active" ? (
            <div className={styles.note}>
              <strong>Active client, no plan.</strong> Bootstrap the incremental carry-down plan (B-12) —
              this does not change the client&rsquo;s active status.
              <div className={styles.resolveRow}><button className={styles.button} onClick={doBootstrap}>Bootstrap carry-down plan</button></div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className={styles.headMeta}>
            <span className={`${styles.stateBadge} ${PLAN_STATE_CLS[plan.state] ?? ""}`}>{plan.state}</span>
            <span className={styles.muted}>revision {plan.revision_n} · {plan.scope_kind} scope · {plan.contributors.length} contributor(s)</span>
            {plan.commit_attestation ? <span className={styles.muted}>· attested</span> : null}
          </div>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Plan items</p>
            {(["must_ask", "capture", "todo"] as const).map((k) => (
              groups[k].length > 0 ? (
                <div key={k}>
                  <p className={styles.sectionSub}>{k.replace("_", " ")} · {groups[k].length}</p>
                  {groups[k].map((it) => <ItemCard key={it.id} it={it} />)}
                </div>
              ) : null
            ))}
            {items.length === 0 ? <p className={styles.muted}>No items captured yet.</p> : null}
          </section>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Still to capture · {outstanding.length}</p>
            {outstanding.length === 0 ? (
              <p className={styles.muted}>Nothing outstanding.</p>
            ) : (
              <ul className={styles.checklist}>
                {outstanding.map((it) => (
                  <li key={it.id} className={styles.checkItem} style={{ flexWrap: "wrap" }}>
                    <span className={styles.checkGlyph} aria-hidden>○</span>
                    <span style={{ flex: 1 }}>{it.item_key}{it.required_for_commit ? " (required)" : it.item_kind === "todo" ? " (deferred)" : ""}</span>
                    {plan.state === "open" ? (
                      <span className={styles.resolveRow}>
                        <input className={styles.input} placeholder="resolution" value={resolveDrafts[it.item_key] ?? ""}
                          onChange={(e) => setResolveDrafts((d) => ({ ...d, [it.item_key]: e.target.value }))} aria-label={`Resolve ${it.item_key}`} />
                        <button className={styles.buttonSecondary} onClick={() => doResolve(it.item_key)} disabled={!(resolveDrafts[it.item_key] ?? "").trim()}>Resolve</button>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <p className={styles.sectionTitle}>Revisions · intended vs actual</p>
            {revs.length === 0 ? <p className={styles.muted}>No revisions.</p> : revs.map((r) => (
              <div key={r.revision_n} className={styles.revRow}>
                <span className={styles.revN}>#{r.revision_n}</span>
                <span>{r.item_count} item(s)</span>
                <span className={styles.revMeta}>{r.state ?? ""} · {r.created_at}</span>
              </div>
            ))}
          </section>

          {plan.state === "open" && readiness ? (
            <section className={styles.section}>
              <CommitGate
                token={token}
                seedId={seed?.id ?? null}
                readiness={readiness}
                refusal={refusal}
                committing={committing}
                onCommit={doCommit}
                onReReview={() => { setRefusal(null); void load(); }}
              />
            </section>
          ) : plan.state === "committed" ? (
            <p className={styles.note}>This client is onboarded — the plan is committed.</p>
          ) : plan.state === "cancelled" ? (
            <p className={styles.muted}>This onboarding plan was cancelled{plan.cancel_reason ? `: ${plan.cancel_reason}` : ""}.</p>
          ) : null}
        </>
      )}
    </main>
  );
}
