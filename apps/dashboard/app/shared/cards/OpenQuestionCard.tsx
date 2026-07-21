"use client";

// The `open_question` card (contract §6 / WA-R10): a durable must-ask object scoped
// to a document / vendor / client. Identifier-only; hydrates get_open_question.
// Resolve/dismiss are human-only (bookkeeper+) — an in-scope open question demotes
// its bills out of READY and refuses their approval until resolved. Terminal
// (resolved/dismissed) renders inert. Refusals verbatim.

import { useCallback, useState } from "react";
import type { OpenQuestionPart } from "../parts";
import { getOpenQuestion, resolveOpenQuestion, dismissOpenQuestion } from "../reviewApi";
import { useCard } from "./cardHooks";
import { shortId } from "../fmt";
import type { OpenQuestion } from "../reviewCardTypes";
import styles from "./cards.module.css";

const SCOPE_COPY: Record<string, string> = { document: "this document", vendor: "this vendor", client: "this client" };

export function OpenQuestionCard({ token, part }: { token: string | null; part: OpenQuestionPart }) {
  const loader = useCallback((t: string): Promise<OpenQuestion> => getOpenQuestion(t, part.question_id), [part.question_id]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);
  const [resolution, setResolution] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Open question</span><span className={styles.idChip}>{shortId(part.question_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this question.</p>
      </div>
    );
  }

  const terminal = !!data && data.status !== "open";

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Open question</span>
        <span className={styles.idChip}>{shortId(part.question_id)}</span>
        {data ? <span className={`${styles.band} ${styles.bandYou}`}>needs you</span> : null}
        {data?.scope_kind ? <span className={styles.badge}>{SCOPE_COPY[data.scope_kind] ?? data.scope_kind}</span> : null}
        {terminal ? <span className={`${styles.badge} ${styles.badgeTerminal}`}>{data.status}</span> : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading question…</p> : null}

      {data ? (
        <>
          <p className={styles.questionText}>{data.question || "(no question text)"}</p>
          {data.origin ? <p className={styles.muted}>raised by {data.origin}{data.created_at ? ` · ${new Date(data.created_at).toLocaleString()}` : ""}</p> : null}

          {terminal ? (
            <p className={styles.okText}>
              {data.status === "resolved" ? `Resolved${data.resolution ? `: ${data.resolution}` : ""}` : "Dismissed"}
              {data.resolved_at ? ` · ${new Date(data.resolved_at).toLocaleString()}` : ""}.
            </p>
          ) : (
            <div className={styles.section}>
              <div className={styles.actions}>
                <input className={styles.reasonInput} aria-label="Resolution" placeholder="Resolution (what to do)" value={resolution} onChange={(e) => setResolution(e.target.value)} />
                <button className={styles.button} disabled={busy || !resolution.trim()} onClick={() => void act(() => resolveOpenQuestion(token, part.question_id, resolution.trim()), () => setResolution(""))}>
                  {busy ? "Working…" : "Resolve"}
                </button>
              </div>
              <div className={styles.actions}>
                <input className={styles.reasonInput} aria-label="Dismiss reason" placeholder="Dismiss reason" value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} />
                <button className={styles.buttonSecondary} disabled={busy || !dismissReason.trim()} onClick={() => void act(() => dismissOpenQuestion(token, part.question_id, dismissReason.trim()), () => setDismissReason(""))}>
                  Dismiss
                </button>
              </div>
              <p className={styles.hint}>Resolving or dismissing is a bookkeeper+ act. Bills in scope stay out of READY until this is resolved.</p>
            </div>
          )}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span>{clr.code === "CLR04" ? "Owner/bookkeeper only." : ""}</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
