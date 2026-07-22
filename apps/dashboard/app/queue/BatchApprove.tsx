"use client";

// Batch approve (WA-R7 + WA-D5) — a queue-local component, NOT a ClaraPart. The
// selection model already excluded high-stakes rows (model.isSelectable); this shows
// a summary with per-row legs + per-row opt-out, then on confirm fires N INDIVIDUAL
// approve_routine_entry calls — each with the entry's own current revision token and
// a FRESH op_key. approve_routine_entry structurally refuses is_high_stakes in the DB
// (CLR05), so a forged selection still cannot post one. Per-row outcomes render
// honestly; one refusal never poisons the batch (each call is independent).

import { useCallback, useEffect, useState } from "react";
import type { QueueRow } from "../shared/reviewTypes";
import { getDraftReview, type DraftReview } from "../chat/review";
import { approveRoutineEntry } from "../shared/reviewApi";
import type { PgrestError } from "../shared/wire";
import { fmtCents, shortId } from "../shared/fmt";
import { directionOf, counterpartyNoun } from "../shared/direction";
import styles from "./queue.module.css";

type Loaded = { review: DraftReview | null; error: string | null };
type Outcome = { ok: true } | { ok: false; message: string; clr: string | null };

export function BatchApprove({ token, rows, onClearSelection, onApproved }: {
  token: string;
  rows: QueueRow[];
  onClearSelection: () => void;
  onApproved: () => void;
}) {
  const [loaded, setLoaded] = useState<Map<string, Loaded>>(new Map());
  const [optedOut, setOptedOut] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Map<string, Outcome>>(new Map());
  const [busy, setBusy] = useState(false);

  const entryIds = rows.map((r) => r.entry_id).filter((id): id is string => !!id);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = new Map<string, Loaded>();
      await Promise.all(
        rows.map(async (r) => {
          if (!r.entry_id) return;
          try {
            next.set(r.entry_id, { review: await getDraftReview(token, r.entry_id, r.client_id), error: null });
          } catch (e) {
            next.set(r.entry_id, { review: null, error: (e as Error).message });
          }
        }),
      );
      if (!cancelled) setLoaded(next);
    })();
    return () => { cancelled = true; };
  }, [token, rows]);

  const included = entryIds.filter((id) => !optedOut.has(id));

  const confirm = useCallback(async () => {
    setBusy(true);
    const results = new Map<string, Outcome>();
    // Sequential + independent: one refusal never aborts the rest (WA-R7).
    for (const id of included) {
      const rev = loaded.get(id)?.review?.revision_token;
      if (!rev) {
        results.set(id, { ok: false, message: "no current revision — reopen and review", clr: null });
        continue;
      }
      try {
        await approveRoutineEntry(token, id, rev);
        results.set(id, { ok: true });
      } catch (e) {
        const pe = e as PgrestError;
        results.set(id, { ok: false, message: pe.message ?? String(e), clr: pe.clr ?? null });
      }
    }
    setOutcomes(results);
    setBusy(false);
    onApproved();
  }, [included, loaded, token, onApproved]);

  const toggleOptOut = (id: string) => setOptedOut((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const done = outcomes.size > 0;

  return (
    <div className={styles.batchSummary}>
      <div className={styles.batchBar}>
        <strong>Batch approve — {included.length} routine draft{included.length === 1 ? "" : "s"}</strong>
        {!done ? (
          <>
            <button className={styles.button} disabled={busy || included.length === 0} onClick={() => void confirm()}>
              {busy ? "Approving…" : `Approve ${included.length}`}
            </button>
            <button className={styles.linkButton} disabled={busy} onClick={onClearSelection}>clear selection</button>
          </>
        ) : (
          <button className={styles.linkButton} onClick={onClearSelection}>done</button>
        )}
      </div>
      <p className={styles.muted}>High-stakes drafts are never selectable — and the DB re-refuses routine approval of one (CLR05). Each row is approved individually with its own revision token.</p>

      {rows.map((r) => {
        const id = r.entry_id ?? "";
        const l = loaded.get(id);
        const out = outcomes.get(id);
        const excluded = optedOut.has(id);
        // Legs are shown per-DB-figure (each leg's own cents); the summary total is the
        // envelope's DB-computed amount_cents — the UI never sums.
        const legs = l?.review?.lines ?? [];
        return (
          <div key={id} className={styles.batchItem}>
            <div className={styles.batchRow}>
              <span className={styles.batchRowMain}>
                {!done ? (
                  <input type="checkbox" aria-label={`include ${shortId(id)}`} checked={!excluded} onChange={() => toggleOptOut(id)} disabled={busy} />
                ) : null}
                <span className={styles.rowTitle}>
                  {l?.review?.vendor?.name ?? `(${counterpartyNoun(directionOf(l?.review?.coding_kind ?? null))})`} · {shortId(id)}
                  {l?.error ? <span className={styles.errorText}> — {l.error}</span> : null}
                </span>
              </span>
              <span className={styles.rowAccessories}>
                <span className={styles.rowAmount}>{fmtCents(r.amount_cents)}</span>
                {out ? (out.ok ? <span className={styles.outcomeOk}>approved</span> : <span className={styles.outcomeFail}>{out.clr ? `${out.clr} · ` : ""}{out.message}</span>) : null}
              </span>
            </div>
            {legs.length > 0 ? (
              <div className={styles.batchLegs}>
                {legs.map((ln, i) => (
                  <span key={i} className={styles.legChip}>
                    {ln.account_code}{ln.debit_cents ? ` Dr ${fmtCents(ln.debit_cents)}` : ""}{ln.credit_cents ? ` Cr ${fmtCents(ln.credit_cents)}` : ""}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
