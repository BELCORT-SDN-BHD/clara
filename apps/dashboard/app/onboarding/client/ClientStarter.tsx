"use client";

// The client-onboarding entry step (settled dashboard plan §3.1/F8): begin a NEW client
// onboarding (begin_client_onboarding mints the client + its open plan) OR resume an existing
// onboarding client (reads its current open plan). This is a client picker THIS lane owns, so it
// BADGES onboarding status (never filters it out — takeover uploads target onboarding clients).

import { useEffect, useState } from "react";
import { beginClientOnboarding, currentPlanForClient } from "../../shared/onboardingApi";
import { listClients, type ClientRow } from "../../documents/api";
import { supabaseBase } from "../../shared/wire";
import styles from "../onboarding.module.css";

export function ClientStarter(props: { token: string; onReady: (clientId: string, planId: string) => void }) {
  const { token } = props;
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token && supabaseBase()) listClients(token).then(setClients).catch(() => setClients([]));
  }, [token]);

  const begin = async () => {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const r = await beginClientOnboarding(token, clean);
      setName("");
      props.onReady(r.client_id, r.plan_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resume = async (clientId: string) => {
    setBusy(true);
    setError(null);
    try {
      const plan = await currentPlanForClient(token, clientId);
      if (!plan) return void setError("That client has no onboarding plan.");
      if (plan.state !== "open") return void setError("That client's onboarding plan is not open (already committed or cancelled).");
      props.onReady(clientId, plan.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onboarding = clients.filter((c) => c.status === "onboarding");

  return (
    <div>
      {error ? <p className={styles.banner}>{error}</p> : null}

      <p className={styles.subtitle}>Begin a new client</p>
      <div className={styles.tokenBar}>
        <input className={styles.input} placeholder="Client legal name" value={name} onChange={(e) => setName(e.target.value)}
          disabled={busy} aria-label="New client name" style={{ flex: 1 }} />
        <button className={styles.button} onClick={begin} disabled={busy || !name.trim()}>Begin onboarding</button>
      </div>

      <p className={styles.subtitle}>Resume an onboarding client</p>
      {!supabaseBase() ? (
        <p className={styles.muted}>Set NEXT_PUBLIC_SUPABASE_URL to list clients.</p>
      ) : onboarding.length === 0 ? (
        <p className={styles.muted}>No clients are currently onboarding.</p>
      ) : (
        <div>
          {onboarding.map((c) => (
            <div key={c.id} className={styles.clientRow}>
              <span className={styles.obBadge}>onboarding</span>
              <span style={{ flex: 1 }}>{c.name || c.id.slice(0, 8)}</span>
              <button className={styles.buttonSecondary} onClick={() => resume(c.id)} disabled={busy}>Resume</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
