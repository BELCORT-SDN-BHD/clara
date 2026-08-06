"use client";

// /onboarding/firm — the firm-bootstrap interview surface (settled dashboard plan §3.1/F8,
// Gate F). A PRE-FIRM principal (a user with no firm) starts the durable firmInterview_v1 run,
// answers the 11-Q, and at the commit park runs the create_firm handshake (FirmCommitForm). The
// run id is mirrored to the URL (?run_id=) so a refresh resumes the same durable run. Dev auth
// is the pasted session JWT (sessionStorage), shared with the rest of the dashboard.

import { useCallback, useEffect, useState } from "react";
import { startFirmInterview, type PendingPark } from "../../shared/interviewApi";
import type { FirmReceipt } from "../../shared/onboardingApi";
import { runtimeBase } from "../../shared/wire";
import { useInterviewRun } from "../useInterviewRun";
import { InterviewPanel } from "../InterviewPanel";
import { FirmCommitForm } from "./FirmCommitForm";
import styles from "../onboarding.module.css";

const TOKEN_KEY = "clara_dev_jwt";

export default function FirmOnboardingPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? "");
    setTokenDraft(sessionStorage.getItem(TOKEN_KEY) ?? "");
    const p = new URLSearchParams(window.location.search);
    setRunId(p.get("run_id"));
  }, []);

  const setRun = useCallback((id: string | null) => {
    setRunId(id);
    const p = new URLSearchParams(window.location.search);
    if (id) p.set("run_id", id); else p.delete("run_id");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const run = useInterviewRun({ token, scope: "firm", runId, planId: null });

  const saveToken = () => {
    const t = tokenDraft.trim();
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const start = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const r = await startFirmInterview(token);
      setRun(r.runId);
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  // F-M10: return the delivery result so FirmCommitForm can retain the receipt + retry on failure.
  const onCommitted = (park: PendingPark) => (receipt: FirmReceipt): Promise<boolean> =>
    run.deliverValue(park, receipt, "Delivered create_firm receipt");

  const cancelRun = async () => {
    const park = run.state?.pendingPark;
    if (!park) return;
    run.setBusy(true);
    // The human is acting again, so their own retry clears the board (client/page.tsx does the
    // same before its cancel). Without this, a FAILED cancel raises a park-less refusal that no
    // read can retire, and a LATER SUCCESSFUL cancel would leave that "cancel failed" banner
    // standing for good — the run is terminal by then, so the poller has stopped for good too.
    run.setError(null);
    try {
      await run.runtimeCancel(park);
      await run.refresh();
    } catch (e) {
      run.setError((e as Error).message);
    } finally {
      run.setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Firm bootstrap</h1>
      <p className={styles.muted}>runtime: {runtimeBase() || "same-origin proxy"}</p>
      <div className={styles.tokenBar}>
        <input className={styles.input} type="password" placeholder="Paste a Supabase session JWT" value={tokenDraft}
          onChange={(e) => setTokenDraft(e.target.value)} aria-label="Session JWT" />
        <button className={styles.button} onClick={saveToken}>Use token</button>
      </div>

      {!token ? (
        <p className={styles.muted}>Paste a JWT above to begin. Firm bootstrap is for a user who does not yet belong to a firm.</p>
      ) : !runId ? (
        <div>
          <p className={styles.muted}>Start a durable interview to register your firm. Clara will ask ~11 questions, then create the firm from your answers.</p>
          {startError ? <p className={styles.banner}>{startError}</p> : null}
          <button className={styles.button} onClick={start} disabled={starting}>{starting ? "Starting…" : "Start firm bootstrap"}</button>
        </div>
      ) : !run.state ? (
        <p className={styles.muted}>Loading interview…</p>
      ) : (
        <InterviewPanel
          state={run.state}
          thread={run.thread}
          busy={run.busy}
          error={run.error}
          onSubmitAnswer={run.submitAnswer}
          onCancel={cancelRun}
          commitSlot={(park) => <FirmCommitForm park={park} token={token} onCommitted={onCommitted(park)} />}
        />
      )}
    </main>
  );
}
