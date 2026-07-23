"use client";

// The seeding batch tick-list ceremony (F13/S4; dashboard-lanes-plan §2 D4). Self-
// hydrating on batch + proposal ids (the cardHooks idiom): re-derives from the DB after
// EVERY action, never optimistic. N INDEPENDENT tick_seeding_proposal / decline calls —
// one refusal (CLR27 duplicate_live) or one decline never poisons the rest; there is NO
// bulk verb. This is DELIBERATELY distinct, visually and verbally, from the K5 one-
// transaction carry-down approval: no "approve all" exists here, only per-row ticks.

import { useCallback, useState } from "react";
import type { SeedingBatch, SeedingProposal, PgrestError } from "../shared/seedingApi";
import {
  getSeedingBatch, listSeedingProposals, tickSeedingProposal, declineSeedingProposal,
  completeSeedingBatch, cancelSeedingBatch,
} from "../shared/seedingApi";
import { useCard } from "../shared/cards/cardHooks";
import { shortId } from "../shared/fmt";
import { groupProposalsByKind, batchIsOpen, isDecidable, batchStatusCopy } from "./model";
import { SeedingProposalRow } from "./SeedingProposalRow";
import styles from "./seeding.module.css";

type Bundle = { batch: SeedingBatch | null; proposals: SeedingProposal[] };
type Outcome = { ok: true; label: string } | { ok: false; message: string; clr: string | null };

export function SeedingBatchView({ token, batchId, onChanged }: {
  token: string | null;
  batchId: string;
  onChanged?: () => void;
}) {
  const loader = useCallback(
    async (t: string): Promise<Bundle> => {
      const [batch, proposals] = await Promise.all([getSeedingBatch(t, batchId), listSeedingProposals(t, batchId)]);
      return { batch, proposals };
    },
    [batchId],
  );
  const { data, loading, err, reload } = useCard(token, loader);
  const [declineReasons, setDeclineReasons] = useState<Map<string, string>>(new Map());
  const [outcomes, setOutcomes] = useState<Map<string, Outcome>>(new Map());
  const [cancelReason, setCancelReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);

  const batch = data?.batch ?? null;
  const proposals = data?.proposals ?? [];
  const open = batchIsOpen(batch);

  const setOutcome = (id: string, o: Outcome) => setOutcomes((m) => new Map(m).set(id, o));

  const doTick = useCallback(async (id: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      const r = await tickSeedingProposal(token, id);
      setOutcome(id, { ok: true, label: r.wiki_dispatch_required ? "ticked — publishing to the wiki" : "ticked" });
    } catch (e) {
      const pe = e as PgrestError;
      setOutcome(id, { ok: false, message: pe.message ?? String(e), clr: pe.clr ?? null });
    } finally {
      await reload();
      setBusyId(null);
      onChanged?.();
    }
  }, [token, reload, onChanged]);

  const doDecline = useCallback(async (id: string) => {
    const reason = (declineReasons.get(id) ?? "").trim();
    if (!reason || !token) return;
    setBusyId(id);
    try {
      await declineSeedingProposal(token, id, reason);
      setOutcome(id, { ok: true, label: "declined" });
    } catch (e) {
      const pe = e as PgrestError;
      setOutcome(id, { ok: false, message: pe.message ?? String(e), clr: pe.clr ?? null });
    } finally {
      await reload();
      setBusyId(null);
      onChanged?.();
    }
  }, [token, declineReasons, reload, onChanged]);

  const doComplete = useCallback(async () => {
    if (!batch || !token) return;
    setBatchBusy(true);
    try {
      await completeSeedingBatch(token, batch.id);
      await reload();
      onChanged?.();
    } finally {
      setBatchBusy(false);
    }
  }, [token, batch, reload, onChanged]);

  const doCancel = useCallback(async () => {
    if (!batch || !cancelReason.trim() || !token) return;
    setBatchBusy(true);
    try {
      await cancelSeedingBatch(token, batch.id, cancelReason.trim());
      await reload();
      onChanged?.();
    } finally {
      setBatchBusy(false);
    }
  }, [token, batch, cancelReason, reload, onChanged]);

  if (!token) {
    return <p className={styles.muted}>Paste a session JWT to load this seeding batch.</p>;
  }

  if (!batch) {
    return <p className={styles.muted}>{loading ? "Loading seeding batch…" : err ?? "Batch not found."}</p>;
  }

  const groups = groupProposalsByKind(proposals);

  return (
    <div className={styles.batchCard}>
      <div className={styles.batchHead}>
        <strong>Seeding batch</strong>
        <span className={styles.idChip}>{shortId(batch.id)}</span>
        {/* F-M15: the DB-authored count is authoritative; the loaded-rows fallback is labeled. */}
        <span className={styles.muted}>
          {batch.stats.proposal_count != null ? `${batch.stats.proposal_count} proposals` : `${proposals.length} loaded`}
        </span>
      </div>
      <p className={styles.distinctNote}>
        Tick each proposal you accept — there is no &quot;approve all&quot;. Every tick mints one
        real signature on its own; declining or leaving one proposed never affects the others.
      </p>

      {groups.map((g) => (
        <section key={g.kind} className={styles.propGroup}>
          <div className={styles.sectionHeader}>{g.label} · {g.rows.length}</div>
          {g.rows.map((p) => (
            <SeedingProposalRow
              key={p.id}
              proposal={p}
              outcome={outcomes.get(p.id) ?? null}
              busy={busyId === p.id}
              decidable={isDecidable(p, open)}
              declineReason={declineReasons.get(p.id) ?? ""}
              onDeclineReasonChange={(v) => setDeclineReasons((m) => new Map(m).set(p.id, v))}
              onTick={() => void doTick(p.id)}
              onDecline={() => void doDecline(p.id)}
            />
          ))}
        </section>
      ))}

      {open ? (
        <div className={styles.batchActions}>
          <button className={styles.buttonSecondary} disabled={batchBusy} onClick={() => void doComplete()}>
            Complete batch
          </button>
          <input
            className={styles.reasonInput}
            aria-label="Cancel batch reason"
            placeholder="Cancel reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            disabled={batchBusy}
          />
          <button className={styles.buttonSecondary} disabled={batchBusy || !cancelReason.trim()} onClick={() => void doCancel()}>
            Cancel batch
          </button>
        </div>
      ) : (
        <p className={styles.okText}>{batchStatusCopy(batch)}</p>
      )}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
