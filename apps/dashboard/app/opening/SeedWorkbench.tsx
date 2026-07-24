"use client";

// The per-seed carry-down workbench (LANE D3; §1 F9 + §3.2). Orchestrates one opening
// seed's lifecycle: header (state/provenance/as-of/batch), the targets surface, the item
// drafting forms, the item register (with the K6 supersede verb on a finalized seed), the
// self-hydrating dry-run card, the K5/K6 approval ceremony, and the B-12 reopen + cancel
// verbs. All figures/counts are DB-authored; the DB is the authority on every refusal.

import { useCallback, useEffect, useState } from "react";
import type { OpeningSeedRow, OpeningTargetRow, OpeningItemRow, ApprovalSetEntry, OpeningDryRun } from "./openingModel";
import {
  listOpeningTargets, listOpeningItems, getApprovalSet, getPlanRevision, getOpeningDryrun,
  cancelOpeningSeed, reopenOpeningSeed, supersedeOpeningItem,
  getKeyedSeedResolution, recordKeyedClientResolution,
} from "../shared/openingApi";
import type { PgrestError } from "../shared/wire";
import { refusalLabel, refusalHint } from "./openingModel";
import { OpeningTargets } from "./OpeningTargets";
import { OpeningItemForm } from "./OpeningItemForm";
import { OpeningCeremony } from "./OpeningCeremony";
import { OpeningDryRunCard } from "../shared/cards/OpeningDryRunCard";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./opening.module.css";

function stateBand(state: string): string {
  if (state === "finalized") return styles.bandReady ?? "";
  if (state === "cancelled") return styles.bandNeutral ?? "";
  return styles.bandReview ?? "";
}

export function SeedWorkbench({ token, seed, clientName, onSeedChanged }: { token: string; seed: OpeningSeedRow; clientName?: string | null; onSeedChanged: () => void }) {
  const [targets, setTargets] = useState<OpeningTargetRow[]>([]);
  const [items, setItems] = useState<OpeningItemRow[]>([]);
  const [approvalSet, setApprovalSet] = useState<ApprovalSetEntry[]>([]);
  const [dry, setDry] = useState<OpeningDryRun | null>(null);
  const [planRevision, setPlanRevision] = useState<string | null>(null);
  // F-C1: the explicit once-per-seed keyed client-attribution resolution (keyed seeds only).
  const [keyedResolution, setKeyedResolution] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [attrAck, setAttrAck] = useState(false);

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
    onSeedChanged();
  }, [onSeedChanged]);

  useEffect(() => {
    let live = true;
    setErr(null);
    const isKeyed = seed.tie_document_id === null;
    Promise.all([
      listOpeningTargets(token, seed.id),
      listOpeningItems(token, seed.id),
      getApprovalSet(token, seed.id),
      getPlanRevision(token, seed.plan_id),
      getOpeningDryrun(token, seed.id),
      isKeyed ? getKeyedSeedResolution(token, seed.id) : Promise.resolve(null),
    ])
      .then(([t, i, a, pr, d, kr]) => {
        if (!live) return;
        setTargets(t);
        setItems(i);
        setApprovalSet(a);
        setPlanRevision(pr);
        setDry(d);
        setKeyedResolution(kr);
      })
      .catch((e) => live && setErr((e as Error).message));
    return () => {
      live = false;
    };
  }, [token, seed.id, seed.plan_id, seed.state, seed.batch_n, nonce]);

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setClr(null);
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  const canCancel = seed.state === "open" && items.length === 0;

  return (
    <div>
      <div className={styles.cardHead ?? ""} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap" }}>
        <span className={styles.subtitle}>Opening seed</span>
        <span className={styles.idChip}>{shortId(seed.id)}</span>
        <span className={`${styles.band} ${stateBand(seed.state)}`}>{seed.state}</span>
        <span className={`${styles.badge} ${seed.tie_document_id ? styles.badgeDoc : styles.badgeKeyed}`}>
          {seed.tie_document_id ? "document-tied" : "keyed fallback"}
        </span>
        <span className={styles.provenanceNote}>as at {seed.as_of} · batch {seed.batch_n}</span>
      </div>

      <OpeningTargets token={token} seed={seed} targets={targets} onChanged={reload} />

      {/* Item register — the carried entries, with the K6 supersede verb on a finalized seed. */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Opening items ({items.length})</p>
        {items.length === 0 ? (
          <p className={styles.emptyState}>No opening items drafted yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>kind</th>
                  <th>key</th>
                  <th className={styles.num}>amount</th>
                  <th>state</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.item_kind}</td>
                    <td>{it.item_key}</td>
                    <td className={styles.num}>{fmtCents(it.amount_cents)}</td>
                    <td>
                      <span className={`${styles.badge} ${it.state === "active" ? styles.badgeDoc : styles.bandNeutral}`}>{it.state}</span>
                    </td>
                    <td className={styles.num}>
                      {seed.state === "finalized" && it.state === "active" ? (
                        <button className={styles.buttonDanger} disabled={busy}
                          onClick={() => void guarded(() => supersedeOpeningItem(token, it.id, null))}>
                          Supersede (reverse)
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {seed.state === "finalized" ? (
          <p className={styles.hint}>
            A superseded item reverses and reopens the seed; draft its replacement, then finalize through the correction
            approval below. A fixed-asset supersede requires a replacement baseline (the DB refuses a bare reversal).
          </p>
        ) : null}
      </div>

      {/* F-C1: on a KEYED seed the client attribution is an EXPLICIT once-per-seed human act —
          not a draft-path side effect. Drafting stays disabled until it is confirmed. */}
      {seed.state === "open" && seed.tie_document_id === null ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Client attribution</p>
          {keyedResolution ? (
            <p className={styles.okText}>
              Client attribution confirmed for this keyed seed{clientName ? ` · ${clientName}` : ""}. The keyed opening figures are attributed to you.
            </p>
          ) : (
            <div>
              <p className={styles.hint}>
                A keyed seed carries no tie document, so its figures must be attributed by an explicit human act (bookkeeper+) before any item can be drafted.
              </p>
              <label className={styles.ceremonyAck}>
                <input type="checkbox" checked={attrAck} onChange={(e) => setAttrAck(e.target.checked)} aria-label="Confirm client attribution" />
                <span>I confirm these keyed opening figures belong to {clientName ?? `client ${shortId(seed.client_id)}`}.</span>
              </label>
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || !attrAck}
                  onClick={() => void guarded(async () => { await recordKeyedClientResolution(token, seed.client_id, seed.id); setAttrAck(false); })}>
                  Confirm client attribution
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {seed.state === "open" ? <OpeningItemForm token={token} seed={seed} clientId={seed.client_id} keyedResolution={keyedResolution} onChanged={reload} /> : null}

      <div className={styles.section}>
        <p className={styles.sectionTitle}>Dry-run</p>
        <OpeningDryRunCard token={token} seedId={seed.id} mode="workbench" refreshKey={nonce} />
      </div>

      {seed.state === "open" && approvalSet.length > 0 ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Finalize</p>
          <OpeningCeremony token={token} seed={seed} entries={approvalSet} dry={dry} planRevision={planRevision} onFinalized={reload} />
        </div>
      ) : null}

      {/* B-12 reopen (admin) — additive carry for newly-arrived items on a finalized seed. */}
      {seed.state === "finalized" ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Reopen for additional items (B-12)</p>
          <div className={styles.actions}>
            <input className={styles.input} placeholder="Reopen reason" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} aria-label="Reopen reason" />
            <button className={styles.buttonSecondary} disabled={busy || !reopenReason.trim()}
              onClick={() => void guarded(async () => { await reopenOpeningSeed(token, seed.id, reopenReason.trim()); setReopenReason(""); })}>
              Reopen seed
            </button>
          </div>
        </div>
      ) : null}

      {canCancel ? (
        <div className={styles.section}>
          <div className={styles.actions}>
            <input className={styles.input} placeholder="Cancel reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} aria-label="Cancel reason" />
            <button className={styles.buttonDanger} disabled={busy || !cancelReason.trim()}
              onClick={() => void guarded(async () => { await cancelOpeningSeed(token, seed.id, cancelReason.trim()); setCancelReason(""); })}>
              Cancel empty seed
            </button>
          </div>
        </div>
      ) : null}

      {/* Finding 4b: the DB's verbatim message (err) is ALWAYS shown alongside the CLR
          badge — a recognized code must never suppress the actual refusal text (a bare
          "CLR10" with no reason token was previously the only thing an operator saw). */}
      {clr ? (
        <p className={styles.refusalNote}>
          <span className={styles.refusalBadge}>{refusalLabel(clr)}</span>
          {refusalHint(clr.code, clr.reason)}
        </p>
      ) : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
