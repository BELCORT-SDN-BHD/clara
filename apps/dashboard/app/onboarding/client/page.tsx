"use client";

// /onboarding/client — the client identity interview surface (settled dashboard plan §3.1/F8,
// Gate O). The client + plan are born by begin_client_onboarding (ClientStarter); this page then
// starts/resumes clientOnboarding_v1 and drives the 13-Q. CANCEL is the two-step F8 verb: deliver
// a runtime cancel into the open park, THEN the idempotent DB cancel_client_onboarding(reason)
// (archives the client + cancels the plan). ?client_id=&plan_id=&run_id= are URL-as-truth.

import { useCallback, useEffect, useState } from "react";
import { startClientInterview } from "../../shared/interviewApi";
import { cancelClientOnboarding } from "../../shared/onboardingApi";
import { runtimeBase } from "../../shared/wire";
import { useInterviewRun } from "../useInterviewRun";
import { InterviewPanel } from "../InterviewPanel";
import { ClientStarter } from "./ClientStarter";
import { InterviewAttachments } from "./InterviewAttachments";
import Link from "next/link";
import styles from "../onboarding.module.css";

const TOKEN_KEY = "clara_dev_jwt";

export default function ClientOnboardingPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    const p = new URLSearchParams(window.location.search);
    setClientId(p.get("client_id"));
    setPlanId(p.get("plan_id"));
    setRunId(p.get("run_id"));
  }, []);

  const syncUrl = useCallback((next: { clientId?: string | null; planId?: string | null; runId?: string | null }) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries({ client_id: next.clientId, plan_id: next.planId, run_id: next.runId })) {
      if (v === undefined) continue;
      if (v) p.set(k, v); else p.delete(k);
    }
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const run = useInterviewRun({ token, scope: "client", runId, planId });

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const onReady = (cid: string, pid: string) => {
    setClientId(cid); setPlanId(pid);
    syncUrl({ clientId: cid, planId: pid });
  };

  const startOrResume = async () => {
    if (!clientId || !planId) return;
    setStartError(null);
    setStarting(true);
    try {
      const r = await startClientInterview(token, { clientId, planId });
      setRunId(r.runId);
      syncUrl({ runId: r.runId });
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  // The two-step cancel (F8): runtime cancel into the open park (best-effort — a 409/not_pending
  // just means no open park), THEN the idempotent DB cancel_client_onboarding(reason).
  const doCancel = async () => {
    if (!clientId || !planId) return;
    const reason = cancelReason.trim();
    if (!reason) return void run.setError("A cancellation reason is required.");
    run.setBusy(true);
    run.setError(null);
    try {
      const park = run.state?.pendingPark;
      if (park) await run.runtimeCancel(park); // step 1 — terminate the durable run if parked
      await cancelClientOnboarding(token, { clientId, planId, reason }); // step 2 — the governed DB verb
      setShowCancel(false);
      setCancelReason("");
      await run.refresh();
    } catch (e) {
      run.setError((e as Error).message);
    } finally {
      run.setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Client onboarding</h1>
      <p className={styles.muted}>
        runtime: {runtimeBase() || "same-origin proxy"}
        {clientId ? ` · client ${clientId.slice(0, 8)}` : ""}
        {planId ? <> · <Link className={styles.linkButton} href={`/clients/plan?client_id=${clientId}`}>open plan</Link></> : null}
      </p>
      <div className={styles.tokenBar}>
        <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
        <button className={styles.button} onClick={saveToken}>Use token</button>
      </div>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to begin.</p>
      ) : !clientId || !planId ? (
        <ClientStarter token={token} onReady={onReady} />
      ) : !runId ? (
        <div>
          <p className={styles.muted}>The client and plan exist. Start the durable identity interview (idempotent — a running interview resumes).</p>
          {startError ? <p className={styles.banner}>{startError}</p> : null}
          <button className={styles.button} onClick={startOrResume} disabled={starting}>{starting ? "Starting…" : "Start / resume interview"}</button>
        </div>
      ) : !run.state ? (
        <p className={styles.muted}>Loading interview…</p>
      ) : (
        <>
          <InterviewPanel
            state={run.state}
            thread={run.thread}
            busy={run.busy}
            error={run.error}
            onSubmitAnswer={run.submitAnswer}
            onCancel={() => setShowCancel(true)}
            cancelLabel="Cancel onboarding"
            attachSlot={(park) => (park.seg === "sample_invoices" ? <InterviewAttachments token={token} /> : null)}
          />
          {showCancel ? (
            <div className={styles.note}>
              <p className={styles.subtitle} style={{ marginTop: 0 }}>Cancel onboarding</p>
              <p className={styles.muted}>This archives the client and cancels the plan (a governed, audited act). A reason is required.</p>
              <textarea className={styles.textarea} placeholder="Reason for cancelling" value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)} aria-label="Cancellation reason" />
              <div className={styles.tokenBar}>
                <button className={styles.buttonDanger} onClick={doCancel} disabled={run.busy || !cancelReason.trim()}>Confirm cancel</button>
                <button className={styles.buttonSecondary} onClick={() => setShowCancel(false)} disabled={run.busy}>Keep going</button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
