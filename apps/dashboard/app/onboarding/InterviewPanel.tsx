"use client";

// The durable-interview panel (settled dashboard plan §3.1): the run-state chip, section
// progress from seg/phase, an Activity-style thread (Clara question → your answer → echo),
// and the answer + cancel verbs. Reused by the firm-bootstrap and client-onboarding surfaces.
// When the current park is the firm COMMIT handshake (expects create_firm_receipt), the parent
// supplies `commitSlot` — the panel renders it instead of the free-text answer box (F8).
//
// Finding 5 (live-gate-run-2026-07-24): the client interview's 'sample_invoices' segment asks
// the operator to "Attach them now, or reply skip", but this panel had no file input anywhere.
// `attachSlot` is the same shape of render-prop as `commitSlot`, except it renders ALONGSIDE the
// free-text answer box rather than instead of it (the segment still expects a typed answer, e.g.
// "attached" or "skip") — the panel stays agnostic of uploads; only the client-onboarding page
// supplies it, gated on `park.seg`.
//
// The panel computes nothing: every displayed value is DB/runtime-authored. The thread is the
// parent's append-only log (seeded from durable plan items on resume; §3.1's resume story).

import { useState, type ReactNode } from "react";
import type { InterviewState, PendingPark } from "../shared/interviewApi";
import type { ThreadEntry } from "./thread";
import { StateChip } from "./StateChip";
import styles from "./onboarding.module.css";

const TERMINAL_COPY: Record<string, string> = {
  firm_created: "The firm was created and its plan recorded. Onboarding the first client is the next step.",
  interview_complete: "The interview is complete. Review the plan, then commit onboarding when ready.",
  cancelled: "This interview was cancelled.",
  expired: "This interview park expired. Start again or cancel onboarding.",
  plan_gone: "The onboarding plan is no longer open — nothing further to answer here.",
  superseded_by_existing_run: "Another interview run already owns this plan.",
};

export function InterviewPanel(props: {
  state: InterviewState;
  thread: ThreadEntry[];
  /** Resolves TRUE only when the answer was delivered. The answer bar holds the human's draft
   *  until it does — see `submit` below. */
  onSubmitAnswer: (park: PendingPark, text: string) => Promise<boolean>;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  commitSlot?: (park: PendingPark) => ReactNode;
  attachSlot?: (park: PendingPark) => ReactNode;
  cancelLabel?: string;
}) {
  const { state, thread, onSubmitAnswer, onCancel, busy, error, commitSlot, attachSlot } = props;
  const [draft, setDraft] = useState("");
  const park = state.pendingPark;
  const isFirmCommit = !!park && park.expects === "create_firm_receipt" && !!commitSlot;

  // THE DRAFT IS THE HUMAN'S ONLY COPY OF WHAT THEY TYPED, so it is held until delivery is
  // confirmed. It used to be cleared unconditionally, the instant the submit was fired: harmless
  // while a refused answer stayed visible in the thread as an (incorrectly) delivered-looking
  // bubble, and a real loss now that the thread withdraws that bubble on a refusal — the answer
  // would be gone from both places at once, leaving a banner saying it did not land and nothing
  // to retry from. That cost lands hardest on exactly the answers most expensive to retype.
  const submit = async () => {
    if (!park || busy || !draft.trim()) return;
    if (await onSubmitAnswer(park, draft.trim())) setDraft("");
  };

  return (
    <div>
      <div className={styles.panelHead}>
        <StateChip chip={state.chip} />
        {state.progress ? (
          <span className={styles.progress}>step {state.progress.index} · {state.progress.seg}</span>
        ) : null}
      </div>

      {error ? <p className={styles.banner}>{error}</p> : null}

      <div className={styles.thread} aria-label="Interview activity">
        {thread.length === 0 ? (
          <p className={styles.muted}>No activity yet.</p>
        ) : (
          thread.map((e) => (
            <div key={e.id} className={`${styles.turn} ${e.role === "you" ? styles.turnYou : styles.turnClara}`}>
              <div className={`${styles.bubble} ${e.role === "you" ? styles.bubbleYou : styles.bubbleClara}`}>{e.text}</div>
              <span className={styles.turnMeta}>{e.role === "you" ? "you" : "clara"}{e.seg ? ` · ${e.seg}` : ""}</span>
            </div>
          ))
        )}
      </div>

      {isFirmCommit && park ? (
        commitSlot!(park)
      ) : park ? (
        <div>
          {attachSlot ? attachSlot(park) : null}
          {/* The live question is the thread's last Clara entry above; the bar answers it. */}
          <div className={styles.answerBar}>
            <textarea
              className={styles.textarea}
              placeholder={park.phase === "c" ? "yes / change" : "Type your answer… (or 'skip' where allowed)"}
              value={draft}
              onChange={(ev) => setDraft(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) void submit(); }}
              aria-label="Your answer"
              disabled={busy}
            />
            <div className={styles.answerActions}>
              <button className={styles.button} onClick={() => { void submit(); }} disabled={busy || !draft.trim()}>Send</button>
              <button className={styles.buttonDanger} onClick={onCancel} disabled={busy}>{props.cancelLabel ?? "Cancel"}</button>
            </div>
          </div>
        </div>
      ) : state.terminal ? (
        <p className={styles.note}>{TERMINAL_COPY[state.terminal.outcome] ?? `Interview ended: ${state.terminal.outcome}.`}</p>
      ) : state.chip === "working" ? (
        <p className={styles.muted}>Clara is preparing the next question…</p>
      ) : (
        <p className={styles.muted}>No open question.</p>
      )}
    </div>
  );
}
