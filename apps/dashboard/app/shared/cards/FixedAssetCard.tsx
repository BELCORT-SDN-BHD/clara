"use client";

// The `fixed_asset` card (Wave D-a, design v2.1 §1/§6/§7). Identifier-only
// (asset_id + client_id); hydrates get_fixed_asset on mount. READ-ONLY here —
// every cents figure is DB-projected (cost/accumulated/NBV, design §1.1/§1.3),
// never summed here, never a fake tie. Completion, revision, and disposal stay
// /assets workbench acts — the same "receipt vs editor" split BankReconReceiptCard/
// SweepReceiptCard draw between an inert card and the workbench that produced it.

import { useCallback } from "react";
import type { FixedAssetPart } from "../parts";
import { getFixedAsset } from "../assetsApi";
import type { GetFixedAssetRead } from "../../assets/assetsModel";
import { useCard } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import styles from "./cards.module.css";

export function FixedAssetCard({ token, part }: { token: string | null; part: FixedAssetPart }) {
  const loader = useCallback((t: string): Promise<GetFixedAssetRead> => getFixedAsset(t, part.asset_id), [part.asset_id]);
  const { data, loading, err } = useCard(token, loader);
  const asset = data?.asset ?? null;

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Fixed asset</span><span className={styles.idChip}>{shortId(part.asset_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this asset.</p>
      </div>
    );
  }

  const terminal = asset?.status === "disposed" || asset?.status === "unwound" || asset?.status === "superseded";

  return (
    <div className={`${styles.card} ${terminal ? styles.terminal : ""}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Fixed asset</span>
        <span className={styles.idChip}>{shortId(part.asset_id)}</span>
        {asset ? (
          <span className={`${styles.badge} ${asset.particulars_complete ? styles.badgeNew : styles.badgeWarn}`}>
            {asset.particulars_complete ? asset.status : "incomplete"}
          </span>
        ) : null}
      </div>

      {loading && !data ? <p className={styles.loadingState}>Loading asset…</p> : null}

      {asset ? (
        <>
          <p className={styles.muted}>{part.label ?? asset.description ?? "—"}</p>
          <div className={styles.countGrid}>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(asset.cost_cents)}</div><div className={styles.countLabel}>cost</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(asset.accumulated_cents)}</div><div className={styles.countLabel}>accumulated</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(asset.nbv_cents)}</div><div className={styles.countLabel}>NBV</div></div>
          </div>
          <p className={styles.muted}>
            {asset.method ?? "method pending"}
            {asset.uncharged_due_count ? ` · ${asset.uncharged_due_count} period${asset.uncharged_due_count === 1 ? "" : "s"} uncharged` : ""}
          </p>
          <p className={styles.hint}>Every figure above is the DB&apos;s (design §1/§3) — this card renders it verbatim. Completion, revision, and disposal happen on the /assets workbench.</p>
        </>
      ) : null}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
