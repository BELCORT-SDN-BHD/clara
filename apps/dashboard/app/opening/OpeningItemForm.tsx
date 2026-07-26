"use client";

// The opening-item drafting forms (LANE D3; §1 K3/AMB-4/AMB-5/WB-R11/WB-R12 + K8; 0018 §2
// lifts the keyed fixed-asset exclusion). One form per item kind; the payload is built by
// the pure ./openingPayloads builders and posted through draft_opening_item / seed_fixed_asset.
// Provenance (document vs keyed) is resolved from the seed: a document-tied seed lets the DB
// lock the exact active filing itself (seed_fixed_asset omits p_resolution); a keyed seed
// sends its bound client-attribution resolution as p_resolution. FORK-7 (non-straight-line
// depreciation) is left to the DB, whose refusal renders verbatim. No figure is computed —
// cents pass through.

import { useState } from "react";
import type { OpeningSeedRow, OpeningItemKind } from "./openingModel";
import { refusalLabel, refusalHint } from "./openingModel";
import {
  buildGlLikeItem,
  buildSubledgerItem,
  buildSignedEquityItem,
  buildFixedAssetEnvelope,
  equityNetSignNote,
  obePlugSignNote,
  parseCents,
  type LegInput,
} from "./openingPayloads";
import { CounterpartyPicker } from "./CounterpartyPicker";
import { draftOpeningItem, seedFixedAsset, getActiveFilingResolution } from "../shared/openingApi";
import type { PgrestError } from "../shared/wire";
import styles from "./opening.module.css";

const KINDS: { value: OpeningItemKind; label: string }[] = [
  { value: "gl_balance", label: "GL balance" },
  { value: "ar_open_item", label: "AR open item" },
  { value: "ap_open_item", label: "AP open item" },
  { value: "bank_uncleared", label: "Bank uncleared" },
  { value: "equity_net", label: "Equity (net)" },
  { value: "obe_plug", label: "OBE plug" },
  { value: "fixed_asset", label: "Fixed asset" },
];

const emptyLeg = (): LegInput => ({ accountCode: "", side: "debit", amountCents: "" });

export function OpeningItemForm({
  token,
  seed,
  clientId,
  keyedResolution,
  onChanged,
}: {
  token: string;
  seed: OpeningSeedRow;
  clientId: string;
  /** F-C1: the EXPLICIT once-per-seed keyed client-attribution resolution id (null until
   *  the seed workbench's "Confirm client attribution" verb mints it). Only meaningful for
   *  a keyed seed — a document-tied seed binds the tie filing instead and ignores this. */
  keyedResolution: string | null;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<OpeningItemKind>("gl_balance");
  const [itemKey, setItemKey] = useState("");
  const [amount, setAmount] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [itemRef, setItemRef] = useState("");
  const [itemDate, setItemDate] = useState("");
  const [sstPortion, setSstPortion] = useState("");
  const [sstRate, setSstRate] = useState("");
  const [sstBasis, setSstBasis] = useState("");
  const [legs, setLegs] = useState<LegInput[]>([emptyLeg()]);
  const [fa, setFa] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);

  const setFaField = (k: string, v: string) => setFa((f) => ({ ...f, [k]: v }));
  const faVal = (k: string) => fa[k] ?? "";

  function reset() {
    setItemKey("");
    setAmount("");
    setCounterparty("");
    setItemRef("");
    setItemDate("");
    setSstPortion("");
    setSstRate("");
    setSstBasis("");
    setLegs([emptyLeg()]);
    setFa({});
  }

  const isKeyed = seed.tie_document_id === null;
  // 0018 §2: seed_fixed_asset now accepts a 5th arg (p_resolution) that flows to the §1
  // bound assert on a keyed seed, so fixed assets are reachable on BOTH lanes — every kind
  // is always offered.
  const availableKinds = KINDS;
  // F-C1: a keyed seed cannot draft until its explicit client attribution exists.
  const attributionMissing = isKeyed && !keyedResolution;

  // Resolve the client attribution + document binding for draft_opening_item. F-C1: the
  // keyed lane CONSUMES the explicit once-per-seed resolution (never mints one here).
  async function provenance(): Promise<{ resolution: string | null; document: string | null; sha256: string | null }> {
    if (seed.tie_document_id) {
      const resolution = await getActiveFilingResolution(token, seed.tie_document_id, clientId);
      return { resolution, document: seed.tie_document_id, sha256: seed.tie_document_sha256 };
    }
    return { resolution: keyedResolution, document: null, sha256: null };
  }

  async function submit() {
    setErr(null);
    setClr(null);
    // Build first (pure) so a shape error never mints a resolution.
    let item: Record<string, unknown> | null = null;
    let lines: unknown[] | null = null;
    if (kind === "fixed_asset") {
      const built = buildFixedAssetEnvelope({
        itemKey,
        description: faVal("description"),
        acquiredDate: faVal("acquiredDate"),
        costCents: faVal("costCents"),
        accumulatedDepreciationCents: faVal("accum"),
        residualCents: faVal("residual"),
        usefulLifeMonths: faVal("life"),
        depreciationStartDate: faVal("startDate"),
        assetAccountCode: faVal("assetAcc"),
        accumDeprAccountCode: faVal("accumAcc"),
        deprExpenseAccountCode: faVal("expenseAcc"),
        depreciationMethod: faVal("method") || undefined,
      });
      if (!built.ok) return setErr(built.error);
      setBusy(true);
      try {
        // 0018 §2: p_resolution flows ONLY on a keyed seed (the bound attribution already
        // gating this form's draft button); a tied seed omits it — the DB locks the exact
        // active filing itself.
        await seedFixedAsset(token, clientId, seed.id, built.payload, isKeyed ? keyedResolution : null);
        reset();
        onChanged();
      } catch (e) {
        const pe = e as PgrestError;
        setErr(pe.message ?? String(e));
        if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
      } finally {
        setBusy(false);
      }
      return;
    }
    if (kind === "gl_balance" || kind === "bank_uncleared") {
      const built = buildGlLikeItem({ kind, itemKey, itemRef, itemDate, legs });
      if (!built.ok) return setErr(built.error);
      item = built.payload.item;
      lines = built.payload.lines;
    } else if (kind === "ar_open_item" || kind === "ap_open_item") {
      const built = buildSubledgerItem({
        kind,
        itemKey,
        amountCents: amount,
        counterpartyId: counterparty,
        itemRef,
        sstPortionCents: sstPortion,
        sstRateBp: sstRate,
        sstBasis,
      });
      if (!built.ok) return setErr(built.error);
      item = built.payload.item;
      lines = built.payload.lines;
    } else {
      const built = buildSignedEquityItem({ kind, itemKey, amountCents: amount });
      if (!built.ok) return setErr(built.error);
      item = built.payload.item;
      lines = built.payload.lines;
    }
    setBusy(true);
    try {
      const prov = await provenance();
      await draftOpeningItem(token, {
        clientId,
        seedId: seed.id,
        item,
        lines,
        resolution: prov.resolution,
        document: prov.document,
        sha256: prov.sha256,
      });
      reset();
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  const isGlLike = kind === "gl_balance" || kind === "bank_uncleared";
  const isSubledger = kind === "ar_open_item" || kind === "ap_open_item";
  const isSigned = kind === "equity_net" || kind === "obe_plug";
  const signedAmount = parseCents(amount);

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Draft an opening item</p>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>kind</span>
          <select className={styles.select} value={kind} onChange={(e) => setKind(e.target.value as OpeningItemKind)} aria-label="Item kind">
            {availableKinds.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>item key</span>
          <input className={styles.input} value={itemKey} onChange={(e) => setItemKey(e.target.value)} aria-label="Item key" />
        </label>
        {isSubledger || isSigned ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>amount (cents){isSigned ? ", signed" : ""}</span>
            <input className={styles.input} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Opening item amount in cents" />
          </label>
        ) : null}
        {isSubledger ? (
          // 0021. This was a bare "counterparty id" text box expecting a pasted uuid, which
          // at takeover nobody could fill: a counterparty could only come into existence
          // inside approve_entry, i.e. by approving a coded entry, and an opening carry-down
          // has none. The picker lists the client's live parties and mints a new one through
          // the governed verb. AP names a VENDOR, AR a CUSTOMER — kind-scoped, both indexes.
          <CounterpartyPicker
            token={token}
            clientId={clientId}
            kind={kind === "ar_open_item" ? "customer" : "vendor"}
            value={counterparty}
            onChange={setCounterparty}
          />
        ) : null}
        {kind === "bank_uncleared" || isSubledger ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>item ref{kind === "bank_uncleared" ? " (required)" : ""}</span>
            <input className={styles.input} value={itemRef} onChange={(e) => setItemRef(e.target.value)} aria-label="Item reference" />
          </label>
        ) : null}
        {kind === "bank_uncleared" ? (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>instrument date (required)</span>
            <input className={styles.input} type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} aria-label="Instrument date" />
          </label>
        ) : null}
      </div>

      {isSigned ? (
        <p className={styles.hint}>{kind === "equity_net" ? equityNetSignNote(signedAmount) : obePlugSignNote(signedAmount)}</p>
      ) : null}

      {isSubledger ? (
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>SST portion (cents)</span>
            <input className={styles.input} inputMode="numeric" value={sstPortion} onChange={(e) => setSstPortion(e.target.value)} aria-label="SST portion cents" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>SST rate (basis pts)</span>
            <input className={styles.input} inputMode="numeric" value={sstRate} onChange={(e) => setSstRate(e.target.value)} aria-label="SST rate basis points" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>SST basis</span>
            <input className={styles.input} value={sstBasis} onChange={(e) => setSstBasis(e.target.value)} aria-label="SST basis" />
          </label>
        </div>
      ) : null}

      {isSubledger ? <p className={styles.hint}>SST facts are all-or-none (WB-R11): leave all three blank, or fill all three.</p> : null}

      {isGlLike ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Legs (OBE/RE contra is DB-resolved — do not add it)</p>
          {legs.map((leg, i) => (
            <div key={i} className={styles.legRow}>
              <input className={styles.input} placeholder="account code" value={leg.accountCode}
                onChange={(e) => setLegs((L) => L.map((x, j) => (j === i ? { ...x, accountCode: e.target.value } : x)))} aria-label={`Leg ${i + 1} account code`} />
              <select className={styles.select} value={leg.side}
                onChange={(e) => setLegs((L) => L.map((x, j) => (j === i ? { ...x, side: e.target.value as "debit" | "credit" } : x)))} aria-label={`Leg ${i + 1} side`}>
                <option value="debit">debit</option>
                <option value="credit">credit</option>
              </select>
              <input className={styles.input} inputMode="numeric" placeholder="cents" value={String(leg.amountCents)}
                onChange={(e) => setLegs((L) => L.map((x, j) => (j === i ? { ...x, amountCents: e.target.value } : x)))} aria-label={`Leg ${i + 1} amount cents`} />
              {legs.length > 1 ? (
                <button className={styles.linkButton} onClick={() => setLegs((L) => L.filter((_, j) => j !== i))}>remove</button>
              ) : null}
            </div>
          ))}
          <button className={styles.linkButton} onClick={() => setLegs((L) => [...L, emptyLeg()])}>+ add leg</button>
        </div>
      ) : null}

      {kind === "fixed_asset" ? (
        <div className={styles.formGrid}>
          {[
            ["description", "description"], ["acquiredDate", "acquired date"], ["startDate", "depreciation start"],
            ["costCents", "cost (cents)"], ["accum", "accum. deprec. (cents)"], ["residual", "residual (cents)"],
            ["life", "useful life (months)"], ["assetAcc", "asset account"], ["accumAcc", "accum. deprec. account"],
            ["expenseAcc", "deprec. expense account"], ["method", "method (default straight_line)"],
          ].map(([k, label]) => (
            <label className={styles.field} key={k}>
              <span className={styles.fieldLabel}>{label}</span>
              <input
                className={styles.input}
                type={k === "acquiredDate" || k === "startDate" ? "date" : "text"}
                value={faVal(k as string)}
                onChange={(e) => setFaField(k as string, e.target.value)}
                aria-label={label as string}
              />
            </label>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || seed.state !== "open" || attributionMissing} onClick={() => void submit()}>
          {busy ? "Drafting…" : "Draft item"}
        </button>
        {seed.state !== "open" ? <span className={styles.provenanceNote}>Reopen the seed to draft more items.</span> : null}
        {attributionMissing ? (
          <span className={styles.provenanceNote}>Confirm client attribution on this keyed seed before drafting items.</span>
        ) : null}
      </div>

      {/* Finding 4b: err (the DB's verbatim message) is ALWAYS shown alongside the CLR
          badge — a recognized code must never suppress the actual refusal text. */}
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
