"use client";

// The /assets two-pane workbench (Wave D-a, design v2.1 §6): register list +
// an authority/cadence/ramp banner (Dec-31 FY fallback surfaced, design §1.6)
// + a depreciation-runs tab. Copies /aging's shell (AgingWorkbench.tsx:
// domain/date state, reload clearing state up-front+on-catch, pure
// ScreenState-driven list body). Every figure is DB-owned (list_fixed_assets/
// get_depreciation_authority reads) — this module computes NONE. The asset
// detail pane (completion/revision/dispose forms, schedule, charges, lineage)
// is split out to AssetDetailPane.tsx; the runs tab to RunsPane.tsx — repo
// file-size discipline (the reconModel.ts/reconSnapshotModel.ts precedent).

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import {
  listFixedAssets, getDepreciationAuthority,
  proposeDepreciationAuthority, signDepreciationAuthority, retireDepreciationAuthority, setClientFyEnd,
} from "../shared/assetsApi";
import {
  assetsScreenState, assetIsIncomplete, assetHasUnchargedDue, assetHasSplitMonthAdvisory, fyEndLabel,
  type AssetRow, type DepreciationAuthorityRead, type DepreciationCadence, type ScreenState,
} from "./assetsModel";
import { AssetDetailPane } from "./AssetDetailPane";
import { RunsPane } from "./RunsPane";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./assets.module.css";

export function AssetsWorkbench({ token, clientId, clientName }: { token: string; clientId: string; clientName?: string | null }) {
  const [view, setView] = useState<"register" | "runs">("register");

  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [incompleteCount, setIncompleteCount] = useState<number | null>(null);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const [authority, setAuthority] = useState<DepreciationAuthorityRead | null>(null);
  const [authorityErr, setAuthorityErr] = useState<string | null>(null);

  const reloadAssets = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    // [F17/CX6#6 discipline, /aging precedent] clear stale rows up front — a
    // prior read's rows must never linger through a reload window.
    setAssets([]);
    setIncompleteCount(null);
    try {
      const read = await listFixedAssets(token, clientId);
      setAssets(read.assets);
      setIncompleteCount(read.incomplete_count);
      setAvailable(read.available);
    } catch (e) {
      setLoadErr((e as Error).message);
      setAssets([]);
      setIncompleteCount(null);
    } finally {
      setLoading(false);
    }
  }, [token, clientId]);

  const reloadAuthority = useCallback(async () => {
    setAuthorityErr(null);
    try {
      setAuthority(await getDepreciationAuthority(token, clientId));
    } catch (e) {
      setAuthorityErr((e as PgrestError).message ?? String(e));
      setAuthority(null);
    }
  }, [token, clientId]);

  useEffect(() => {
    setSelectedAssetId(null);
    void reloadAssets();
    void reloadAuthority();
  }, [reloadAssets, reloadAuthority]);

  const state = assetsScreenState({ loading, error: !!loadErr, totalRows: assets.length, available });
  const selectedAsset = assets.find((a) => a.id === selectedAssetId) ?? null;

  return (
    <div>
      <div className={styles.section} style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <p className={styles.subtitle}>{clientName ?? `client ${clientId.slice(0, 8)}`}</p>
      </div>

      <AuthorityBanner
        token={token} clientId={clientId} authority={authority} err={authorityErr}
        onChanged={() => { void reloadAuthority(); }}
      />

      <div className={styles.actions}>
        <button className={view === "register" ? styles.buttonSecondaryActive : styles.buttonSecondary} onClick={() => setView("register")}>
          Register{incompleteCount ? ` (${incompleteCount} incomplete)` : ""}
        </button>
        <button className={view === "runs" ? styles.buttonSecondaryActive : styles.buttonSecondary} onClick={() => setView("runs")}>
          Depreciation runs
        </button>
      </div>

      {view === "register" ? (
        <>
          {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}
          <div className={styles.layout}>
            <section className={styles.listPane}>
              <p className={styles.sectionTitle}>Register ({assets.length})</p>
              <AssetListBody state={state} assets={assets} selectedAssetId={selectedAssetId} onSelect={setSelectedAssetId} />
            </section>
            <section className={styles.detailPane}>
              {selectedAsset ? (
                <AssetDetailPane
                  key={selectedAsset.id} token={token} clientId={clientId} asset={selectedAsset}
                  onChanged={() => { void reloadAssets(); }}
                />
              ) : (
                <p className={styles.detailEmpty}>Select an asset to see its schedule, charge history, and lineage.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <RunsPane token={token} clientId={clientId} />
      )}
    </div>
  );
}

/** [F17/CX6#6 discipline, the AgingListBody precedent] the list pane's body,
 *  split out PURE (no hooks, no network) so its render branches are directly
 *  testable — every ScreenState arm is explicit, no default table arm exists
 *  that a new/renamed state could silently fall into. */
export function AssetListBody({
  state, assets, selectedAssetId, onSelect,
}: {
  state: ScreenState;
  assets: AssetRow[];
  selectedAssetId: string | null;
  onSelect: (id: string) => void;
}) {
  if (state === "loading") return <p className={styles.muted}>Loading…</p>;
  if (state === "error") {
    return <p className={styles.errorText}>Could not load the fixed asset register — showing nothing rather than stale rows from a prior read.</p>;
  }
  if (state === "unavailable") {
    return <p className={styles.errorText}>The register came back in an unexpected shape — showing nothing rather than guessing. Try reloading.</p>;
  }
  if (state === "empty") {
    return <p className={styles.emptyState}>No fixed assets on this register yet.</p>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>asset</th><th>status</th><th className={styles.num}>cost</th>
            <th className={styles.num}>accumulated</th><th className={styles.num}>NBV</th><th>due</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr
              key={a.id}
              className={`${styles.counterpartyRow} ${a.id === selectedAssetId ? styles.counterpartyRowActive : ""}`}
              onClick={() => onSelect(a.id)}
            >
              <td>
                {a.description ?? shortId(a.id)}
                {assetIsIncomplete(a) ? <span className={styles.overdueTag}>incomplete</span> : null}
                {/* [round-5 fix] the WDB-G14 changeover and the WDB-G10 freeze are
                    DB-owned facts about this row; both were emitted and rendered
                    nowhere. A reviewer scanning the register must see them here,
                    not only after selecting the row. */}
                {assetHasSplitMonthAdvisory(a) ? (
                  <span className={styles.overdueTag} title="A revision took effect after day 1 — the whole changeover month stayed with the predecessor. Open the row to review materiality.">
                    mid-month changeover
                  </span>
                ) : null}
                {a.disposal_draft_outstanding ? (
                  <span className={styles.overdueTag} title="A disposal draft is outstanding — a second disposal is refused until it is approved or withdrawn.">
                    disposal draft
                  </span>
                ) : null}
              </td>
              <td><span className={`${styles.band} ${a.status === "active" ? styles.bandReady : styles.bandNeutral}`}>{a.status}</span></td>
              <td className={styles.num}>{fmtCents(a.cost_cents)}</td>
              <td className={styles.num}>{fmtCents(a.accumulated_cents)}</td>
              <td className={styles.num}><strong>{fmtCents(a.nbv_cents)}</strong></td>
              {/* WD-R6: the DB projects WHICH months are owed, not only how many — show them. */}
              <td title={a.uncharged_due.join(", ")}>
                {assetHasUnchargedDue(a) ? <span className={styles.overdueTag}>{a.uncharged_due_count} due</span> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The authority/cadence/ramp banner (design §1.4/§1.6/§3.3/§3.4): status,
 *  ramp-earned, and the FY-end (Dec-31 fallback SURFACED, never silent).
 *  Propose/sign/retire/set-FY-end acts carry NO local role gating — the DB's
 *  role/CLR floor (e.g. sign = admin+, WD-R9) is the enforcement, matching
 *  the exceptBankLine precedent ("this UI does not gate on a local role
 *  guess"). */
function AuthorityBanner({
  token, clientId, authority, err, onChanged,
}: {
  token: string; clientId: string; authority: DepreciationAuthorityRead | null; err: string | null; onChanged: () => void;
}) {
  const [cadence, setCadence] = useState<DepreciationCadence>("monthly");
  const [fyMonth, setFyMonth] = useState(12);
  const [fyDay, setFyDay] = useState(31);
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setActErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const live = authority?.authority ?? null;

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Depreciation authority</p>
      {err ? <p className={styles.errorText}>{err}</p> : null}
      {authority ? (
        <>
          <p className={styles.muted}>
            {live ? `${live.status} · ${live.cadence}` : "no authority proposed yet"}
            {" · ramp "}{authority.ramp_earned ? "earned" : "not yet earned"}
            {" · FY end "}{fyEndLabel(authority.fy_end)}
            {authority.high_stakes_threshold_cents != null ? ` · high-stakes over ${fmtCents(authority.high_stakes_threshold_cents)}` : ""}
          </p>
          {authority.fy_end.fallback ? (
            <p className={styles.hint}>This client has no fiscal year-end on file — depreciation runs use the Dec-31 default until one is set.</p>
          ) : null}
        </>
      ) : null}

      <div className={styles.actions}>
        {!live || live.status === "retired" ? (
          <>
            <select className={styles.select} value={cadence} onChange={(e) => setCadence(e.target.value as DepreciationCadence)} aria-label="Cadence">
              <option value="monthly">monthly</option>
              <option value="annual">annual</option>
            </select>
            <button className={styles.buttonSecondary} disabled={busy} onClick={() => void act(() => proposeDepreciationAuthority(token, clientId, cadence))}>
              Propose authority
            </button>
          </>
        ) : null}
        {live?.status === "proposed" ? (
          <button className={styles.button} disabled={busy} onClick={() => void act(() => signDepreciationAuthority(token, clientId, live.id))}>
            Sign (admin+)
          </button>
        ) : null}
        {live?.status === "live" ? (
          <button className={styles.buttonSecondary} disabled={busy} onClick={() => void act(() => retireDepreciationAuthority(token, clientId, live.id, "cadence change"))}>
            Retire authority
          </button>
        ) : null}
      </div>

      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>FY end month</span>
          <input type="number" min={1} max={12} className={styles.input} value={fyMonth} onChange={(e) => setFyMonth(Number(e.target.value))} aria-label="Fiscal year-end month" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>day</span>
          <input type="number" min={1} max={31} className={styles.input} value={fyDay} onChange={(e) => setFyDay(Number(e.target.value))} aria-label="Fiscal year-end day" />
        </label>
        <button className={styles.buttonSecondary} disabled={busy} onClick={() => void act(() => setClientFyEnd(token, clientId, fyMonth, fyDay))}>
          Set FY end
        </button>
      </div>
      {actErr ? <p className={styles.errorText}>{actErr}</p> : null}
    </div>
  );
}
