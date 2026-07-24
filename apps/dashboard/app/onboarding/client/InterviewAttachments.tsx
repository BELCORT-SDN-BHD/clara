"use client";

// Finding 5 (live-gate-run-2026-07-24 / #10): the 'sample_invoices' interview segment's
// question text (a FROZEN workflow file — interview.v1.questions.ts — never touched here)
// says "Attach them now, or reply skip", but the interview surface had no file input at all,
// so a client could never actually attach anything during that segment. This reuses the SAME
// upload transport the /documents page uses — useUploadQueue (begin→PUT→finalize→poll, the
// shared intake lane) — rather than duplicating any of that logic.
//
// Per the intake honest-state law (shared/intake.ts MED-1), the transport files NOTHING to a
// client: a finalized upload lands UNASSIGNED. The note below says so plainly and points at the
// /documents page, where Finding 3's classify control + "File to a client" can finish the job.
// The operator still types an answer into the interview's own answer box below this control
// (e.g. "attached" or "skip") — this component only adds the attachment side-channel.
//
// PROVENANCE LIMIT, recorded rather than faked: every upload from here is tagged
// origin='documents_tab', because clara.intake_requests.origin is a closed DB CHECK —
// `check (origin in ('chat','documents_tab'))` (0007_document_pipeline.sql:104), with a
// paired constraint tying 'chat' to a chat_session_id (0007:133). An honest
// 'onboarding_interview' origin therefore needs a migration, not a dashboard constant, and
// is a Wave-C candidate. Nothing downstream branches on the difference today (the runtime
// intake route special-cases only origin='chat', for a session-access check), so the cost
// is audit-trail precision, not behaviour — but it IS imprecise, and this is where to fix
// it when the origin enum is widened.

import { useState } from "react";
import Link from "next/link";
import { useUploadQueue } from "../../documents/useUploadQueue";
import styles from "../onboarding.module.css";

export function InterviewAttachments({ token }: { token: string }) {
  const [note, setNote] = useState<string | null>(null);
  const queue = useUploadQueue(token, () => {}, (m) => setNote(m));

  return (
    <div className={styles.note}>
      <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>Attach sample invoices</p>
      <input
        type="file"
        multiple
        aria-label="Attach sample invoices"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) queue.add(files);
          e.target.value = "";
        }}
      />
      {note ? <p className={styles.muted}>{note}</p> : null}
      {queue.items.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "0.4rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {queue.items.map((q) => (
            <li key={q.localId} style={{ fontSize: "0.8rem" }}>
              <span title={q.name}>{q.name}</span> · <span className={styles.muted}>{q.label}</span>
              {q.error ? <span className={styles.muted}> — {q.error}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.muted}>
        Uploaded files are stored <strong>unassigned</strong> — file them to this client and set a document kind on the{" "}
        <Link className={styles.linkButton} href="/documents">documents page</Link>. Then answer below (e.g. &quot;attached&quot; or &quot;skip&quot;).
      </p>
    </div>
  );
}
