// The je_review card (contract §6 / S6-R12 / W1). Hydration law: the je_review part
// carries IDENTIFIERS ONLY — this card re-derives authoritative state via
// get_draft_review on mount and after EVERY action (no optimistic UI; the
// answer_interruption / CorrectionWizard precedent). Actions are direct PostgREST
// RPCs on the human lane, each with a fresh op_key (inside the review.ts wrappers).
// DB refusals are surfaced VERBATIM; the CLR21 DETAIL reason token is parsed EXACTLY
// (never blanket-classified). The amount exception (W1/F1) is PERSISTED at draft on
// entry.flags.amount_exception — the panel renders from that hydrated state, NEVER
// synthesized from a caught error; its only lawful resolution is revising to the
// corroborated total or a governed amount override (which sets HIGH-STAKES).

import { useCallback, useEffect, useState } from "react";
import type { ClaraPart, PgrestError } from "./api";
import {
  approveEntry,
  getDraftReview,
  getMachineTotal,
  reviseEntry,
  withdrawDraft,
  type AmountOverrideArg,
  type DraftReview,
  type DuplicateOverrideArg,
  type EvidenceArg,
  type MachineTotal,
  type ReviseLine,
  type VendorArg,
} from "./review";
import { clr21Copy, CLR05_COPY } from "./reviewCopy";
import { directionOf, counterpartyNoun } from "../shared/direction";
import { resolveReviewHydration, settledReceiptCopy, type SettledState } from "../shared/settledState";
import { JeSettledReceipt, JeReviewGoneShell } from "./JeSettledCard";
import styles from "./chat.module.css";

type JeReviewPart = Extract<ClaraPart, { type: "je_review" }>;
type LineBuf = { account_code: string; debit: string; credit: string; description: string };
type EvidenceBuf = { region_id: string; quote: string; field_path: string };
type VendorBuf = { mode: "existing" | "new"; existing_id: string; name: string; registration_no: string };

function fmtCents(cents: number): string {
  const neg = cents < 0;
  const s = (Math.abs(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "-" : ""}RM ${s}`;
}

export function JeReviewCard({ token, part }: { token: string | null; part: JeReviewPart }) {
  const [review, setReview] = useState<DraftReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string | null; reason: string | null } | null>(null);
  const [stale, setStale] = useState(false);
  const [machineFact, setMachineFact] = useState<MachineTotal | null>(null);
  const [outcome, setOutcome] = useState<"approved" | "discarded" | null>(null);
  // §6.1: settled = a TRUE DB-reported terminal state; gone = the honest shell. Never both.
  const [settled, setSettled] = useState<SettledState | null>(null);
  const [gone, setGone] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [attestation, setAttestation] = useState("");
  const [lineBuf, setLineBuf] = useState<LineBuf[]>([]);
  const [evidenceBuf, setEvidenceBuf] = useState<EvidenceBuf[]>([]);
  const [vendorBuf, setVendorBuf] = useState<VendorBuf>({ mode: "new", existing_id: "", name: "", registration_no: "" });
  const [amountOverrideReason, setAmountOverrideReason] = useState("");
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      // §6.1: non-draft status (0016 slim payload) → settled; null → gone DIRECTLY,
      // no bridge — a terminal state is unprovable client-side (shared/settledState.ts).
      const res = resolveReviewHydration(await getDraftReview(token, part.entry_id, part.client_id));
      setReview(res.kind === "gone" ? null : res.review);
      setSettled(res.kind === "settled" ? res.settled : null);
      setGone(res.kind === "gone");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, part.entry_id, part.client_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The machine-total REGION for the persisted amount-exception panel + the amount
  // override citation comes from get_document_extract (the exception itself is
  // hydrated from get_draft_review — this only adds the region id).
  const exceptionActive = !!review?.amount_exception && !review?.amount_override;
  useEffect(() => {
    if (!token || !exceptionActive || !review?.document_id) {
      setMachineFact(null);
      return;
    }
    let cancelled = false;
    getMachineTotal(token, review.document_id, review.client_id)
      .then((m) => {
        if (!cancelled) setMachineFact(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, exceptionActive, review?.document_id, review?.client_id]);

  // Every action re-derives authoritative state afterward (no optimistic UI). A CLR
  // refusal is classified from the governed envelope (exact reason token) and the
  // draft re-fetched so persisted state (e.g. the amount exception) shows the truth.
  const act = async (fn: () => Promise<void>, onOk?: () => void) => {
    setBusy(true);
    setErr(null);
    setClr(null);
    setStale(false);
    try {
      await fn();
      onOk?.();
      await load();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr === "CLR06") setStale(true);
      else if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const enterEdit = () => {
    if (!review) return;
    setLineBuf(
      review.lines.map((l) => ({
        account_code: l.account_code,
        debit: String(l.debit_cents),
        credit: String(l.credit_cents),
        description: l.description ?? "",
      })),
    );
    const seededEvidence = review.evidence.map((e) => ({ region_id: e.region_id ?? "", quote: e.quote, field_path: e.field_path ?? "" }));
    // W1 refinement: an amount override must cite the machine-total region in the
    // revised evidence — prefill it (region.text_content is the quote; the DB's
    // position() recoverability check passes on the stored substring). The
    // bookkeeper can still edit before submitting.
    const exActive = !!review.amount_exception && !review.amount_override;
    if (exActive && machineFact?.region && !seededEvidence.some((e) => e.region_id === machineFact.region)) {
      seededEvidence.push({ region_id: machineFact.region, quote: machineFact.quote ?? "", field_path: "invoice.total" });
    }
    setEvidenceBuf(seededEvidence);
    setVendorBuf(
      review.vendor?.matched_counterparty_id
        ? { mode: "existing", existing_id: review.vendor.matched_counterparty_id, name: review.vendor.name, registration_no: review.vendor.registration_no ?? "" }
        : { mode: "new", existing_id: "", name: review.vendor?.name ?? "", registration_no: review.vendor?.registration_no ?? "" },
    );
    setAmountOverrideReason("");
    setDuplicateOverrideReason("");
    setErr(null);
    setMode("edit");
  };

  const buildReviseArgs = (): {
    lines: ReviseLine[];
    vendor: VendorArg | null;
    evidence: EvidenceArg[];
    overrides: { amount: AmountOverrideArg | null; duplicate: DuplicateOverrideArg | null };
  } => {
    const lines: ReviseLine[] = lineBuf.map((l) => ({
      account_code: l.account_code.trim(),
      debit_cents: Number(l.debit) || 0,
      credit_cents: Number(l.credit) || 0,
      description: l.description.trim() || undefined,
    }));
    const vendor: VendorArg | null =
      vendorBuf.mode === "existing"
        ? vendorBuf.existing_id.trim()
          ? { existing_id: vendorBuf.existing_id.trim() }
          : null
        : vendorBuf.name.trim()
          ? { new: { name: vendorBuf.name.trim(), registration_no: vendorBuf.registration_no.trim() || undefined } }
          : null;
    const evidence: EvidenceArg[] = evidenceBuf
      .filter((e) => e.quote.trim())
      .map((e) => ({ region_id: e.region_id.trim(), quote: e.quote.trim(), field_path: e.field_path.trim() || undefined }));
    const overrides = {
      // An amount override cites the machine-total region (must be in the revised evidence).
      amount: amountOverrideReason.trim() ? { reason: amountOverrideReason.trim(), region_id: machineFact?.region ?? null } : null,
      duplicate: duplicateOverrideReason.trim() ? { reason: duplicateOverrideReason.trim() } : null,
    };
    return { lines, vendor, evidence, overrides };
  };

  // Edit → approve (§6): revise (rotates the token) THEN approve with the NEW token.
  const saveAndApprove = () =>
    act(
      async () => {
        if (!review) return;
        const { lines, vendor, evidence, overrides } = buildReviseArgs();
        const nextToken = await reviseEntry(token!, review.entry_id, lines, vendor, evidence, review.revision_token, overrides);
        await approveEntry(token!, review.entry_id, nextToken, attestation.trim() || null);
      },
      () => {
        setMode("view");
        setOutcome("approved");
      },
    );

  // Save the edit as a re-reviewable draft (revise only; the token rotates). Clears
  // an amount exception when revised to a conforming total or with an override.
  const saveDraft = () =>
    act(
      async () => {
        if (!review) return;
        const { lines, vendor, evidence, overrides } = buildReviseArgs();
        await reviseEntry(token!, review.entry_id, lines, vendor, evidence, review.revision_token, overrides);
      },
      () => setMode("view"),
    );

  if (!token) {
    return (
      <div className={styles.jeCard}>
        <div className={styles.jeHead}><strong>Journal entry review</strong><span className={styles.muted}>{part.entry_id.slice(0, 8)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load and act on this draft.</p>
      </div>
    );
  }

  if (outcome) {
    return (
      <div className={styles.jeCard}>
        <div className={styles.jeHead}><strong>Journal entry review</strong><span className={styles.muted}>{part.entry_id.slice(0, 8)}</span></div>
        <p className={styles.okText}>{settledReceiptCopy(outcome === "approved" ? "approved" : "withdrawn")}</p>
      </div>
    );
  }

  // §6.1: settled → the TRUE terminal receipt; gone → the honest no-claim shell —
  // NEVER the fabricated unknown/RM 0.00 shell.
  if (settled) return <JeSettledReceipt entryId={part.entry_id} settled={settled} review={review} />;
  if (gone) return <JeReviewGoneShell entryId={part.entry_id} />;

  const r = review;
  const direction = directionOf(r?.coding_kind ?? null); // §6.2: sales → customer noun
  const cpNoun = counterpartyNoun(direction);
  const debitTotal = r ? r.lines.reduce((s, l) => s + l.debit_cents, 0) : 0;
  const creditTotal = r ? r.lines.reduce((s, l) => s + l.credit_cents, 0) : 0;
  const uncertainty = r?.uncertainty ?? part.uncertainty ?? null;
  const isDraft = r?.status === "draft";
  const distinctCheckerNeeded = !!r && r.high_stakes && r.eligible_checker_count >= 2;
  // Hydrated tier is authoritative (the part value can be stale). Approve is blocked
  // only by an UNRESOLVED persisted amount exception.
  const tier = r?.provenance_tier ?? part.provenance_tier;
  const exUnresolved = !!r?.amount_exception && !r?.amount_override;
  const ready = !!r && isDraft && !exUnresolved;

  return (
    <div className={styles.jeCard}>
      <div className={styles.jeHead}>
        <strong>Journal entry review</strong>
        <span className={styles.muted}>{part.entry_id.slice(0, 8)}{r ? ` · ${r.status}` : ""}</span>
        <span className={`${styles.jeTierBadge} ${tier === "verified" ? styles.jeTierVerified : styles.jeTierRead}`}>
          {tier === "verified" ? "machine-corroborated total" : "read by Clara — verify against the source"}
        </span>
      </div>

      {loading && !r ? <p className={styles.muted}>Loading review…</p> : null}

      {r ? (
        <>
          {r.high_stakes ? (
            <div className={styles.jeHighStakes}>
              <strong>High-stakes</strong>
              {r.high_stakes_reasons.length ? (
                <ul className={styles.jeReasonList}>
                  {r.high_stakes_reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
              ) : null}
              {distinctCheckerNeeded ? <p className={styles.jeHint}>A distinct checker is required (CLR05). If you created this draft, approval will be refused — a second eligible checker must approve.</p> : null}
            </div>
          ) : null}

          <div className={styles.jeMeta}>
            <span>posting {r.posting_date ?? "—"}</span>
            {r.memo ? <span>· {r.memo}</span> : null}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.jeTable}>
              <thead><tr><th>account</th><th className={styles.num}>debit</th><th className={styles.num}>credit</th><th>{cpNoun} / note</th></tr></thead>
              <tbody>
                {r.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.account_code}{l.account_name ? ` · ${l.account_name}` : ""}{l.description ? <span className={styles.muted}> — {l.description}</span> : null}</td>
                    <td className={styles.num}>{l.debit_cents ? fmtCents(l.debit_cents) : ""}</td>
                    <td className={styles.num}>{l.credit_cents ? fmtCents(l.credit_cents) : ""}</td>
                    <td>{l.is_payable ? <span className={styles.muted}>{l.counterparty_name ?? cpNoun} (payable)</span> : ""}</td>
                  </tr>
                ))}
                <tr className={styles.jeTotalRow}>
                  <td>total</td><td className={styles.num}>{fmtCents(debitTotal)}</td><td className={styles.num}>{fmtCents(creditTotal)}</td><td />
                </tr>
              </tbody>
            </table>
          </div>

          {r.vendor ? (
            <div className={styles.jeVendor}>
              {r.vendor.disposition === "new" ? <span className={`${styles.jeBadge} ${styles.jeBadgeNew}`}>new {cpNoun}</span> : null}
              {r.vendor.disposition === "matched" ? <span className={`${styles.jeBadge} ${styles.jeBadgeMatch}`}>matched existing</span> : null}
              {r.vendor.disposition === "ambiguous" ? <span className={`${styles.jeBadge} ${styles.jeBadgeWarn}`}>suspected match — confirm</span> : null}
              <span>{r.vendor.name}{r.vendor.registration_no ? ` · ${r.vendor.registration_no}` : " · no registration on the bill"}</span>
              {r.vendor.note ? <span className={styles.muted}> — {r.vendor.note}</span> : null}
            </div>
          ) : null}

          <div className={styles.jeSource}>
            <span className={styles.jeSourceChip}>document {r.document_id ? r.document_id.slice(0, 8) : "—"}{r.filing_id ? ` · filing ${r.filing_id.slice(0, 8)}` : ""}</span>
            <span className={styles.muted}> · {r.amount_label}</span>
          </div>
          {r.evidence.length ? (
            <ul className={styles.jeEvidence}>
              {r.evidence.map((e, i) => (
                <li key={i}>
                  <span className={`${styles.jeCite} ${e.provenance_tier === "verified" ? styles.jeCiteVerified : styles.jeCiteRead}`}>{e.provenance_tier === "verified" ? "corroborated" : "read"}</span>
                  <span className={styles.muted}>{e.field_path ?? "fact"}{e.region_id ? ` · region ${e.region_id.slice(0, 8)}` : ""}:</span> “{e.quote}”
                </li>
              ))}
            </ul>
          ) : null}

          {uncertainty ? (
            <div className={styles.jeUncertain}>
              <em>{uncertainty.note}</em>
              {uncertainty.alternatives.length ? <span className={styles.muted}> Alternatives: {uncertainty.alternatives.join(", ")}.</span> : null}
            </div>
          ) : null}

          {r.near_duplicates.length ? (
            <div className={styles.jeDup}>
              <strong>Possible duplicate</strong>
              <ul className={styles.jeReasonList}>
                {r.near_duplicates.map((d, i) => (
                  <li key={i}>
                    {d.invoice_id ?? "(no invoice no)"} · {d.total_cents !== null ? fmtCents(d.total_cents) : "—"}
                    {d.posting_date ? ` · ${d.posting_date}` : ""} · entry {d.entry_id.slice(0, 8)}
                  </li>
                ))}
              </ul>
              <span className={styles.muted}>Non-blocking — review before approving. An exact duplicate is refused at approve (override with a reason).</span>
            </div>
          ) : null}

          {r.amount_exception && !r.amount_override ? (
            <div className={styles.jeException}>
              <strong>Amount exception — approval is disabled.</strong>
              <p>
                The machine-corroborated total {r.amount_exception.machine_total_cents !== null ? fmtCents(r.amount_exception.machine_total_cents) : "(unavailable)"}
                {machineFact?.region ? ` (region ${machineFact.region.slice(0, 8)})` : ""} does not match the proposed {fmtCents(r.amount_exception.proposed_cents)}.
              </p>
              <p className={styles.jeHint}>Resolve by editing the draft to the corroborated total, OR override with a reason (cites the machine-total region). An override sets HIGH-STAKES — a distinct checker will be required.</p>
              <button className={styles.button} disabled={busy} onClick={enterEdit}>Resolve by editing</button>
            </div>
          ) : r.amount_override ? (
            <div className={styles.jeException}>
              <strong>Amount override applied.</strong>
              <p>{r.amount_override.reason}{r.amount_override.region_id ? ` · region ${r.amount_override.region_id.slice(0, 8)}` : ""} — HIGH-STAKES; a distinct checker is required.</p>
            </div>
          ) : null}

          {clr && clr.reason && clr21Copy(clr.reason, direction) ? <p className={styles.jeHint}>{clr.reason}: {clr21Copy(clr.reason, direction)}</p> : null}
          {clr && clr.code === "CLR05" && clr.reason && CLR05_COPY[clr.reason] ? <p className={styles.jeHint}>{CLR05_COPY[clr.reason]}</p> : null}
          {stale ? <p className={styles.jeHint}>The draft changed since it was shown — re-reviewed with the current state. Check the lines, then act again.</p> : null}
        </>
      ) : null}

      {mode === "edit" && r ? (
        <EditPanel
          lineBuf={lineBuf}
          setLineBuf={setLineBuf}
          evidenceBuf={evidenceBuf}
          setEvidenceBuf={setEvidenceBuf}
          vendorBuf={vendorBuf}
          setVendorBuf={setVendorBuf}
          attestation={attestation}
          setAttestation={setAttestation}
          overrides={{
            showAmount: exUnresolved,
            amountReason: amountOverrideReason,
            setAmountReason: setAmountOverrideReason,
            machineRegion: machineFact?.region ?? null,
            showDuplicate: (clr?.reason === "duplicate_bill") || r.near_duplicates.length > 0,
            duplicateReason: duplicateOverrideReason,
            setDuplicateReason: setDuplicateOverrideReason,
          }}
          busy={busy} counterparty={cpNoun}
          onSaveApprove={() => void saveAndApprove()}
          onSaveDraft={() => void saveDraft()}
          onCancel={() => { setMode("view"); setErr(null); }}
        />
      ) : mode === "view" && r ? (
        <div className={styles.jeActions}>
          <button className={styles.button} disabled={busy || !ready} onClick={() => void act(() => approveEntry(token, r.entry_id, r.revision_token, attestation.trim() || null), () => setOutcome("approved"))}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button className={styles.buttonSecondary} disabled={busy || !isDraft} onClick={enterEdit}>Edit</button>
          <button className={styles.linkButton} disabled={busy || !isDraft} onClick={() => void act(() => withdrawDraft(token, r.entry_id, "discarded from je_review card", r.revision_token), () => setOutcome("discarded"))}>Discard draft</button>
          <input className={styles.jeAttest} placeholder="Attestation (solo path)" value={attestation} onChange={(e) => setAttestation(e.target.value)} aria-label="Attestation" />
        </div>
      ) : null}

      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}

type OverrideCtl = {
  showAmount: boolean;
  amountReason: string;
  setAmountReason: (v: string) => void;
  machineRegion: string | null;
  showDuplicate: boolean;
  duplicateReason: string;
  setDuplicateReason: (v: string) => void;
};

function EditPanel({
  lineBuf, setLineBuf, evidenceBuf, setEvidenceBuf, vendorBuf, setVendorBuf, attestation, setAttestation, overrides, busy, counterparty, onSaveApprove, onSaveDraft, onCancel,
}: {
  lineBuf: LineBuf[]; setLineBuf: (v: LineBuf[]) => void;
  evidenceBuf: EvidenceBuf[]; setEvidenceBuf: (v: EvidenceBuf[]) => void;
  vendorBuf: VendorBuf; setVendorBuf: (v: VendorBuf) => void;
  attestation: string; setAttestation: (v: string) => void;
  overrides: OverrideCtl; counterparty: string;
  busy: boolean; onSaveApprove: () => void; onSaveDraft: () => void; onCancel: () => void;
}) {
  const patchLine = (i: number, p: Partial<LineBuf>) => setLineBuf(lineBuf.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className={styles.jeEdit}>
      <p className={styles.muted}>Edit the draft, then approve at the new revision (or save it back for re-review). Amounts are integer cents — the DB owns rounding.</p>
      <div className={styles.tableWrap}>
        <table className={styles.jeTable}>
          <thead><tr><th>account code</th><th>debit (cents)</th><th>credit (cents)</th><th>description</th></tr></thead>
          <tbody>
            {lineBuf.map((l, i) => (
              <tr key={i}>
                <td><input className={styles.jeInput} aria-label={`account code, line ${i + 1}`} value={l.account_code} onChange={(e) => patchLine(i, { account_code: e.target.value })} /></td>
                <td><input className={styles.jeInput} aria-label={`debit cents, line ${i + 1}`} inputMode="numeric" value={l.debit} onChange={(e) => patchLine(i, { debit: e.target.value })} /></td>
                <td><input className={styles.jeInput} aria-label={`credit cents, line ${i + 1}`} inputMode="numeric" value={l.credit} onChange={(e) => patchLine(i, { credit: e.target.value })} /></td>
                <td><input className={styles.jeInput} aria-label={`description, line ${i + 1}`} value={l.description} onChange={(e) => patchLine(i, { description: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.jeVendorEdit}>
        <label className={styles.muted}>{counterparty[0]?.toUpperCase()}{counterparty.slice(1)}</label>
        <select className={styles.jeInput} value={vendorBuf.mode} onChange={(e) => setVendorBuf({ ...vendorBuf, mode: e.target.value as VendorBuf["mode"] })} aria-label="Vendor mode">
          <option value="new">New {counterparty}</option>
          <option value="existing">Existing {counterparty} id</option>
        </select>
        {vendorBuf.mode === "existing" ? (
          <input className={styles.jeInput} aria-label="counterparty id" placeholder="counterparty id" value={vendorBuf.existing_id} onChange={(e) => setVendorBuf({ ...vendorBuf, existing_id: e.target.value })} />
        ) : (
          <>
            <input className={styles.jeInput} aria-label="vendor name" placeholder={`${counterparty} name`} value={vendorBuf.name} onChange={(e) => setVendorBuf({ ...vendorBuf, name: e.target.value })} />
            <input className={styles.jeInput} aria-label="vendor registration no" placeholder="registration no (optional)" value={vendorBuf.registration_no} onChange={(e) => setVendorBuf({ ...vendorBuf, registration_no: e.target.value })} />
          </>
        )}
      </div>
      <div className={styles.jeVendorEdit}>
        <label className={styles.muted}>Evidence (region-cited; required for a document-bound draft)</label>
        {evidenceBuf.map((ev, i) => (
          <div key={i} className={styles.inlineRow}>
            <input className={styles.jeInput} aria-label={`evidence region id ${i + 1}`} placeholder="region id" value={ev.region_id} onChange={(e) => setEvidenceBuf(evidenceBuf.map((x, j) => (j === i ? { ...x, region_id: e.target.value } : x)))} />
            <input className={styles.jeInput} aria-label={`evidence field path ${i + 1}`} placeholder="field path" value={ev.field_path} onChange={(e) => setEvidenceBuf(evidenceBuf.map((x, j) => (j === i ? { ...x, field_path: e.target.value } : x)))} />
            <input className={styles.jeInput} aria-label={`evidence quote ${i + 1}`} placeholder="exact quote" value={ev.quote} onChange={(e) => setEvidenceBuf(evidenceBuf.map((x, j) => (j === i ? { ...x, quote: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      {overrides.showAmount || overrides.showDuplicate ? (
        <div className={styles.jeVendorEdit}>
          <label className={styles.muted}>Governed overrides (HIGH-STAKES — a distinct checker will be required)</label>
          {overrides.showAmount ? (
            <input className={styles.jeInput} aria-label="amount override reason" placeholder={`amount override reason${overrides.machineRegion ? ` (cites region ${overrides.machineRegion.slice(0, 8)})` : ""}`}
              value={overrides.amountReason} onChange={(e) => overrides.setAmountReason(e.target.value)} />
          ) : null}
          {overrides.showDuplicate ? (
            <input className={styles.jeInput} aria-label="duplicate override reason" placeholder="duplicate override reason"
              value={overrides.duplicateReason} onChange={(e) => overrides.setDuplicateReason(e.target.value)} />
          ) : null}
        </div>
      ) : null}
      <input className={styles.jeAttest} placeholder="Attestation (solo path)" value={attestation} onChange={(e) => setAttestation(e.target.value)} aria-label="Attestation" />
      <div className={styles.jeActions}>
        <button className={styles.button} disabled={busy} onClick={onSaveApprove}>{busy ? "Working…" : "Save & approve"}</button>
        <button className={styles.buttonSecondary} disabled={busy} onClick={onSaveDraft}>Save draft (re-review)</button>
        <button className={styles.linkButton} disabled={busy} onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}
