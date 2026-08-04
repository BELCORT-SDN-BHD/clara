"use client";

// The /assets detail pane (Wave D-a, design v2.1 §2.3/§4/§6) — split out of
// AssetsWorkbench.tsx (repo file-size discipline, the reconModel.ts/
// reconSnapshotModel.ts precedent). Header + uncharged-due advisory, the
// completion/revision particulars form, the DB-projected schedule, charge
// history, lineage, and the dispose form (incl. cost-portion). Manages its
// own get_fixed_asset reload (the /aging CounterpartyStatementPane precedent)
// keyed on the selected asset's id — AssetsWorkbench remounts this pane on
// selection change via `key={selectedAsset.id}`. Every figure is DB-owned;
// this module computes none — schedule/charges/accumulated/NBV are DB-
// projected (assetsModel.ts's own header).

import { useCallback, useEffect, useState } from "react";
import type { PgrestError } from "../shared/wire";
import { getFixedAsset, completeFixedAssetParticulars, reviseFixedAssetParticulars, disposeFixedAsset } from "../shared/assetsApi";
import { getDraftReview, withdrawDraft } from "../chat/review";
import type { AssetRow, ChargeRow, ScheduleRow, FixedAssetParticulars, SplitMonthAdvisory } from "./assetsModel";
import { assetIsDisposable, assetHasSplitMonthAdvisory } from "./assetsModel";
import { fmtCents, shortId } from "../shared/fmt";
// [round-5 fix] the DB owns the date, never the browser. `todayIso()` here was the
// browser's UTC date, so between 00:00 and 08:00 MYT every date DEFAULT on this
// pane — in-service date, revision effective-from, DISPOSAL DATE — proposed
// yesterday. Across a month boundary that puts the disposal month, and therefore
// the last charged month, in the wrong period. See shared/businessDate.ts.
import { businessToday } from "../shared/businessDate";
import styles from "./assets.module.css";

type AssetDetail = { asset: AssetRow | null; lineage: AssetRow[]; charges: ChargeRow[]; schedule: ScheduleRow[]; uncharged_due: string[] };

export function AssetDetailPane({
  token, clientId, asset, onChanged,
}: {
  token: string; clientId: string; asset: AssetRow; onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setDetail(await getFixedAsset(token, asset.id));
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [token, asset.id]);

  useEffect(() => { void reload(); }, [reload]);

  const live = detail?.asset ?? asset;

  return (
    <div>
      <p className={styles.subtitle}>{live.description ?? shortId(live.id)}</p>
      <p className={styles.muted}>
        {live.status} · {live.method ?? "method pending"}
        {live.rate_bps ? ` · ${(live.rate_bps / 100).toFixed(2)}%` : ""}
        {live.start_date ? ` · in service ${live.start_date}` : ""}
      </p>
      <p className={styles.actions}>
        <span className={styles.idChip}>cost {fmtCents(live.cost_cents)}</span>
        <span className={styles.idChip}>accumulated {fmtCents(live.accumulated_cents)}</span>
        <span className={styles.idChip}>NBV {fmtCents(live.nbv_cents)}</span>
      </p>

      {loading && !detail ? <p className={styles.muted}>Loading asset detail…</p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}

      {detail && detail.uncharged_due.length > 0 ? (
        <p className={styles.hint}>Uncharged periods: {detail.uncharged_due.join(", ")}</p>
      ) : null}

      {assetHasSplitMonthAdvisory(live) ? <SplitMonthPanel rows={live.split_month_advisory} /> : null}

      {!live.particulars_complete ? (
        <ParticularsForm token={token} clientId={clientId} assetId={live.id} onDone={() => { void reload(); onChanged(); }} />
      ) : (
        <ReviseParticularsForm token={token} clientId={clientId} assetId={live.id} onDone={() => { void reload(); onChanged(); }} />
      )}

      {detail && detail.schedule.length > 0 ? <ScheduleTable schedule={detail.schedule} /> : null}
      {detail && detail.charges.length > 0 ? <ChargesTable charges={detail.charges} /> : null}
      {detail && detail.lineage.length > 0 ? <LineageList lineage={detail.lineage} /> : null}

      {/* [round-5 fix] KEYED ON THE DB'S VERDICT, NOT ON AN ID. The guard used to be
          gated on `disposal_draft_entry_id` — a key no function emitted — so it could
          never render, and the ELSE arm offered a dispose form whose only possible
          outcome on a frozen row was the CLR39 refusal. The freeze verdict now comes
          from `_fa_asset_json`, which asks the guard's OWN function; the id only
          decides whether the inline withdraw affordance is offered. */}
      {live.disposal_draft_outstanding ? (
        <DisposalDraftGuard
          token={token} clientId={clientId} entryId={live.disposal_draft_entry_id}
          onDone={() => { void reload(); onChanged(); }}
        />
      ) : assetIsDisposable(live) ? (
        <DisposeForm token={token} clientId={clientId} assetId={live.id} onDone={() => { void reload(); onChanged(); }} />
      ) : null}
    </div>
  );
}

function ScheduleTable({ schedule }: { schedule: ScheduleRow[] }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Projected schedule</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>period</th><th className={styles.num}>projected</th></tr></thead>
          <tbody>
            {schedule.map((row, i) => (
              <tr key={i}><td>{row.period_start} → {row.period_end}</td><td className={styles.num}>{fmtCents(row.projected_cents)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChargesTable({ charges }: { charges: ChargeRow[] }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Charge history</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>period</th><th className={styles.num}>amount</th><th>run</th></tr></thead>
          <tbody>
            {charges.map((c) => (
              <tr key={c.id} className={c.unwind_of ? styles.counterpartyRowActive : ""}>
                <td>{c.period_start} → {c.period_end}{c.unwind_of ? " (unwind)" : ""}</td>
                <td className={styles.num}>{fmtCents(c.amount_cents)}</td>
                <td>{c.run_id ? shortId(c.run_id) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineageList({ lineage }: { lineage: AssetRow[] }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Lineage</p>
      <ul>
        {lineage.map((l) => (
          <li key={l.id} className={styles.muted}>
            {l.description ?? shortId(l.id)} · {l.status}{l.superseded_at ? ` · superseded ${l.superseded_at}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function useMethodFields(initial: "straight_line" | "reducing_balance" | "none" = "straight_line") {
  const [method, setMethod] = useState<"straight_line" | "reducing_balance" | "none">(initial);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState("60");
  const [rateBps, setRateBps] = useState("");
  const [residualCents, setResidualCents] = useState("0");
  const [startDate, setStartDate] = useState(businessToday());
  const [description, setDescription] = useState("");

  const particulars = (): FixedAssetParticulars => ({
    method,
    start_date: startDate,
    useful_life_months: method !== "none" ? Number(usefulLifeMonths) || null : null,
    rate_bps: method === "reducing_balance" ? Number(rateBps) || null : null,
    residual_cents: method !== "none" ? Number(residualCents) || 0 : null,
    description: description || null,
  });

  return {
    method, setMethod, usefulLifeMonths, setUsefulLifeMonths, rateBps, setRateBps,
    residualCents, setResidualCents, startDate, setStartDate, description, setDescription, particulars,
  };
}

/** complete_fixed_asset_particulars (design §2.3): sets method/life/rate/
 *  residual/start while incomplete; complete-once. */
function ParticularsForm({
  token, clientId, assetId, onDone,
}: { token: string; clientId: string; assetId: string; onDone: () => void }) {
  const f = useMethodFields();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await completeFixedAssetParticulars(token, clientId, assetId, f.particulars());
      onDone();
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Complete particulars</p>
      <MethodFields f={f} />
      <button className={styles.button} disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Complete particulars"}</button>
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}

/** revise_fixed_asset_particulars (design §2.3 — the MPERS-17.19 prospective
 *  door): supersede-forward, new particulars apply to FUTURE periods only. */
function ReviseParticularsForm({
  token, clientId, assetId, onDone,
}: { token: string; clientId: string; assetId: string; onDone: () => void }) {
  const f = useMethodFields();
  const [effectiveFrom, setEffectiveFrom] = useState(businessToday());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // [round-5 fix] the receipt's WDB-G14 advisory, shown AT THE MOMENT OF THE ACT
  // (0042 S5.5's stated purpose). Held in state deliberately: `onDone()` reloads
  // the pane, and the reviewer must still be able to read what their own revision
  // just did to the changeover month.
  const [receiptAdvisory, setReceiptAdvisory] = useState<SplitMonthAdvisory[]>([]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const receipt = await reviseFixedAssetParticulars(token, clientId, assetId, f.particulars(), effectiveFrom);
      setReceiptAdvisory(receipt.split_month_advisory);
      onDone();
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Revise particulars (prospective)</p>
      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>effective from</span>
          <input type="date" className={styles.input} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} aria-label="Revision effective-from date" />
        </label>
      </div>
      <MethodFields f={f} />
      <button className={styles.button} disabled={busy} onClick={() => void submit()}>{busy ? "Saving…" : "Revise particulars"}</button>
      {err ? <p className={styles.errorText}>{err}</p> : null}
      <SplitMonthPanel rows={receiptAdvisory} />
    </div>
  );
}

function MethodFields({ f }: { f: ReturnType<typeof useMethodFields> }) {
  return (
    <div className={styles.actions}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>method</span>
        <select className={styles.select} value={f.method} onChange={(e) => f.setMethod(e.target.value as typeof f.method)} aria-label="Depreciation method">
          <option value="straight_line">straight line</option>
          <option value="reducing_balance">reducing balance</option>
          <option value="none">none (not depreciable)</option>
        </select>
      </label>
      {f.method !== "none" ? (
        <>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>useful life (months)</span>
            <input className={styles.input} value={f.usefulLifeMonths} onChange={(e) => f.setUsefulLifeMonths(e.target.value)} aria-label="Useful life months" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>residual (cents)</span>
            <input className={styles.input} value={f.residualCents} onChange={(e) => f.setResidualCents(e.target.value)} aria-label="Residual cents" />
          </label>
        </>
      ) : null}
      {f.method === "reducing_balance" ? (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>rate (bps)</span>
          <input className={styles.input} value={f.rateBps} onChange={(e) => f.setRateBps(e.target.value)} aria-label="Rate basis points" />
        </label>
      ) : null}
      <label className={styles.field}>
        <span className={styles.fieldLabel}>in-service date</span>
        <input type="date" className={styles.input} value={f.startDate} onChange={(e) => f.setStartDate(e.target.value)} aria-label="In-service date" />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>description</span>
        <input className={styles.input} value={f.description} onChange={(e) => f.setDescription(e.target.value)} aria-label="Description" />
      </label>
    </div>
  );
}

/** dispose_fixed_asset (design §4.1): full or partial (cost-portion) disposal;
 *  ONLY offered on a live, complete asset (the call site's own gate). */
function DisposeForm({
  token, clientId, assetId, onDone,
}: { token: string; clientId: string; assetId: string; onDone: () => void }) {
  const [disposalDate, setDisposalDate] = useState(businessToday());
  const [proceedsCents, setProceedsCents] = useState("0");
  const [proceedsAccount, setProceedsAccount] = useState("");
  const [gainAccount, setGainAccount] = useState("");
  const [lossAccount, setLossAccount] = useState("");
  const [memo, setMemo] = useState("");
  const [costPortionCents, setCostPortionCents] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await disposeFixedAsset(token, {
        clientId, assetId, disposalDate,
        proceedsCents: Number(proceedsCents) || 0,
        proceedsAccount: proceedsAccount || null,
        gainAccount, lossAccount, memo: memo || null,
        costPortionCents: costPortionCents ? Number(costPortionCents) : null,
      });
      onDone();
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Dispose</p>
      <div className={styles.actions}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>disposal date</span>
          <input type="date" className={styles.input} value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} aria-label="Disposal date" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>proceeds (cents)</span>
          <input className={styles.input} value={proceedsCents} onChange={(e) => setProceedsCents(e.target.value)} aria-label="Proceeds cents" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>proceeds account</span>
          <input className={styles.input} value={proceedsAccount} onChange={(e) => setProceedsAccount(e.target.value)} aria-label="Proceeds account" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>gain account</span>
          <input className={styles.input} value={gainAccount} onChange={(e) => setGainAccount(e.target.value)} aria-label="Gain account" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>loss account</span>
          <input className={styles.input} value={lossAccount} onChange={(e) => setLossAccount(e.target.value)} aria-label="Loss account" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>cost portion (cents, partial only)</span>
          <input className={styles.input} value={costPortionCents} onChange={(e) => setCostPortionCents(e.target.value)} aria-label="Cost portion cents" />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>memo</span>
          <input className={styles.input} value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="Disposal memo" />
        </label>
      </div>
      <button className={styles.button} disabled={busy} onClick={() => void submit()}>{busy ? "Disposing…" : "Dispose asset"}</button>
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}

/** The second-draft guard's UI face (Wave D-b, design §6.1, G10):
 *  `dispose_fixed_asset` refuses a second draft while an earlier one is
 *  still outstanding (`disposal_draft_outstanding`) — this panel is that
 *  outstanding draft's withdraw affordance, so a corrected re-dispose has a
 *  door. Reuses the EXISTING generic draft primitives (getDraftReview +
 *  withdrawDraft, ../chat/review) rather than inventing a new asset-specific
 *  withdraw verb — the same cross-lane reuse DocReviewCard.tsx already
 *  establishes (it pulls getDraftReview from chat/review too, and is itself
 *  mounted from BOTH /chat and /queue). */
function DisposalDraftGuard({
  token, clientId, entryId, onDone,
}: { token: string; clientId: string; entryId: string | null; onDone: () => void }) {
  const [revisionToken, setRevisionToken] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadErr(null);
    if (!entryId) { setRevisionToken(null); return; }
    try {
      const review = await getDraftReview(token, entryId, clientId);
      setRevisionToken(review?.revision_token ?? null);
    } catch (e) {
      setLoadErr((e as PgrestError).message ?? String(e));
      setRevisionToken(null);
    }
  }, [token, entryId, clientId]);

  useEffect(() => { void reload(); }, [reload]);

  const withdraw = async () => {
    if (!entryId || !revisionToken || !reason.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await withdrawDraft(token, entryId, reason.trim(), revisionToken);
      onDone();
    } catch (e) {
      setErr((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Disposal draft outstanding</p>
      <p className={styles.hint}>
        A disposal draft{entryId ? ` (entry ${shortId(entryId)})` : ""} is still outstanding on this asset — a second
        disposal is refused (`disposal_draft_outstanding`) until this one is approved or withdrawn.
      </p>
      {loadErr ? <p className={styles.errorText}>{loadErr}</p> : null}
      {entryId && revisionToken === null && !loadErr ? <p className={styles.muted}>Loading the outstanding draft…</p> : null}
      {entryId ? (
        <div className={styles.actions}>
          <input
            className={styles.input} placeholder="Withdrawal reason" value={reason}
            onChange={(e) => setReason(e.target.value)} aria-label="Disposal draft withdrawal reason" style={{ flex: 1 }}
          />
          <button className={styles.buttonSecondary} disabled={busy || !revisionToken || !reason.trim()} onClick={() => void withdraw()}>
            {busy ? "Withdrawing…" : "Withdraw draft"}
          </button>
        </div>
      ) : (
        /* The DB says this row is frozen but did not name the draft. State that
           plainly and send the reader to the queue rather than showing an inert
           button — the freeze is the fact, the id is only a convenience. */
        <p className={styles.muted}>The register did not name the outstanding draft — find and withdraw it on /queue.</p>
      )}
      {err ? <p className={styles.errorText}>{err}</p> : null}
      <p className={styles.hint}>Withdrawing clears the way for a fresh, corrected disposal draft — or review it directly on /queue.</p>
    </div>
  );
}

/** WDB-G14 (design §6.4) — THE MID-MONTH CHANGEOVER ADVISORY, ON A SURFACE.
 *  The 2026-08-02 owner ruling pinned the month-grain convention (a revision
 *  effective after day 1 leaves the WHOLE changeover month with the predecessor)
 *  ON CONDITION that the changeover is escalated where a professional can see it.
 *  `_fa_asset_json` emits it on every /assets read and
 *  `revise_fixed_asset_particulars` returns it in the receipt; until now NO
 *  dashboard code rendered either, so the condition the ruling carries was not met
 *  on any surface. Every field below is the DB's own — the note text included. */
export function SplitMonthPanel({ rows }: { rows: SplitMonthAdvisory[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Mid-month changeover ({rows.length}) — review for materiality</p>
      {rows.map((r, i) => (
        <div key={`${r.asset_id ?? i}-${r.effective_from ?? i}`}>
          <p className={styles.muted}>
            revision effective {r.effective_from ?? "—"} · changeover month {r.changeover_month_start ?? "—"} → {r.changeover_month_end ?? "—"}
            {" · month charged to "}<strong>{r.month_charged_to ?? "—"}</strong>
          </p>
          <p className={styles.muted}>
            predecessor last chargeable month {r.predecessor_last_chargeable_month ?? "—"} · successor first {r.successor_first_chargeable_month ?? "—"}
          </p>
          {r.note ? <p className={styles.hint}>{r.note}</p> : null}
        </div>
      ))}
    </div>
  );
}
