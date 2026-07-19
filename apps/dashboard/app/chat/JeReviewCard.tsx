// The je_review card (contract §6 / S6-R12). Hydration law: the je_review part
// carries IDENTIFIERS ONLY — this card re-derives authoritative state via
// get_draft_review on mount and after EVERY action (no optimistic UI; the
// answer_interruption / CorrectionWizard precedent, brief 5b/5f). Actions are
// direct PostgREST RPCs on the human lane, each with a fresh op_key (inside the
// review.ts wrappers). DB refusals are surfaced VERBATIM; the CLR21 amount_conflict
// discriminant renders the amount-exception state (S6-D1), whose only lawful
// resolution is the governed revise override (which sets the HIGH-STAKES flag).

import { useCallback, useEffect, useState } from "react";
import type { ClaraPart, PgrestError } from "./api";
import {
  approveEntry,
  getDraftReview,
  getMachineTotal,
  reviseEntry,
  withdrawDraft,
  type AmountException,
  type DraftReview,
  type EvidenceArg,
  type ReviseLine,
  type VendorArg,
} from "./review";
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
  const [notice, setNotice] = useState<"stale" | "amount_conflict" | null>(null);
  const [amountException, setAmountException] = useState<AmountException | null>(null);
  const [outcome, setOutcome] = useState<"approved" | "discarded" | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [attestation, setAttestation] = useState("");
  const [lineBuf, setLineBuf] = useState<LineBuf[]>([]);
  const [evidenceBuf, setEvidenceBuf] = useState<EvidenceBuf[]>([]);
  const [vendorBuf, setVendorBuf] = useState<VendorBuf>({ mode: "new", existing_id: "", name: "", registration_no: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setReview(await getDraftReview(token, part.entry_id, part.client_id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, part.entry_id, part.client_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The amount exception (S6-D1) is NOT a field of get_draft_review — compose it
  // from the CLR21 error + a get_document_extract read (both machine values + region).
  const composeAmountException = async (rev: DraftReview | null) => {
    const proposed = rev ? rev.lines.reduce((sum, l) => sum + l.debit_cents, 0) : 0;
    if (!token || !rev?.document_id) {
      setAmountException({ proposed_cents: proposed, machine_total_cents: null, machine_region: null, confidence: null });
      return;
    }
    const m = await getMachineTotal(token, rev.document_id, rev.client_id).catch(() => null);
    setAmountException({ proposed_cents: proposed, machine_total_cents: m?.cents ?? null, machine_region: m?.region ?? null, confidence: m?.confidence ?? null });
  };

  // Every action re-derives authoritative state afterward. amount_conflict / stale
  // token are classified from the governed error envelope and re-fetched so the
  // card shows the DB's truth, never an optimistic guess. A plain function (not
  // useCallback) so it closes over the CURRENT review for the exception compose.
  const act = async (fn: () => Promise<void>, onOk?: () => void) => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    setAmountException(null);
    try {
      await fn();
      onOk?.();
      await load();
    } catch (e) {
      const pe = e as PgrestError;
      if (pe.reason === "amount_conflict" || pe.clr === "CLR21") {
        setNotice("amount_conflict");
        await composeAmountException(review);
      } else if (pe.clr === "CLR06") {
        setNotice("stale");
      }
      setErr(pe.message ?? String(e));
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
    setEvidenceBuf(review.evidence.map((e) => ({ region_id: e.region_id ?? "", quote: e.quote, field_path: e.field_path ?? "" })));
    setVendorBuf(
      review.vendor?.matched_counterparty_id
        ? { mode: "existing", existing_id: review.vendor.matched_counterparty_id, name: review.vendor.name, registration_no: review.vendor.registration_no ?? "" }
        : { mode: "new", existing_id: "", name: review.vendor?.name ?? "", registration_no: review.vendor?.registration_no ?? "" },
    );
    setErr(null);
    setMode("edit");
  };

  const buildReviseArgs = (): { lines: ReviseLine[]; vendor: VendorArg | null; evidence: EvidenceArg[] } => {
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
    return { lines, vendor, evidence };
  };

  // Edit → approve (§6): revise (rotates the token) THEN approve with the NEW token.
  const saveAndApprove = () =>
    act(async () => {
      if (!review) return;
      const { lines, vendor, evidence } = buildReviseArgs();
      const nextToken = await reviseEntry(token!, review.entry_id, lines, vendor, evidence, review.revision_token);
      await approveEntry(token!, review.entry_id, nextToken, attestation.trim() || null);
    }, () => { setMode("view"); setOutcome("approved"); });

  // Save the edit as a re-reviewable draft (revise only; the token rotates).
  const saveDraft = () =>
    act(async () => {
      if (!review) return;
      const { lines, vendor, evidence } = buildReviseArgs();
      await reviseEntry(token!, review.entry_id, lines, vendor, evidence, review.revision_token);
    }, () => setMode("view"));

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
        <p className={styles.okText}>{outcome === "approved" ? "Approved — the entry is posted with filing-bound provenance." : "Draft discarded."}</p>
      </div>
    );
  }

  const r = review;
  const debitTotal = r ? r.lines.reduce((s, l) => s + l.debit_cents, 0) : 0;
  const creditTotal = r ? r.lines.reduce((s, l) => s + l.credit_cents, 0) : 0;
  const ex = amountException;
  const uncertainty = r?.uncertainty ?? part.uncertainty ?? null;
  const isDraft = r?.status === "draft";
  const distinctCheckerNeeded = !!r && r.high_stakes && r.eligible_checker_count >= 2;
  const ready = !!r && isDraft && !ex;

  return (
    <div className={styles.jeCard}>
      <div className={styles.jeHead}>
        <strong>Journal entry review</strong>
        <span className={styles.muted}>{part.entry_id.slice(0, 8)}{r ? ` · ${r.status}` : ""}</span>
        <span className={`${styles.jeTierBadge} ${part.provenance_tier === "verified" ? styles.jeTierVerified : styles.jeTierRead}`}>
          {part.provenance_tier === "verified" ? "machine-verified total" : "read by Clara — verify against the source"}
        </span>
      </div>

      {loading && !r ? <p className={styles.muted}>Loading review…</p> : null}

      {r ? (
        <>
          {r.high_stakes ? (
            <div className={styles.jeHighStakes}>
              <strong>High-stakes</strong>
              {r.high_stakes_reasons.length ? <span> — {r.high_stakes_reasons.join("; ")}</span> : null}
              {distinctCheckerNeeded ? <p className={styles.jeHint}>A distinct checker is required (CLR05). If you created this draft, approval will be refused — a second eligible checker must approve.</p> : null}
            </div>
          ) : null}

          <div className={styles.jeMeta}>
            <span>posting {r.posting_date ?? "—"}</span>
            {r.memo ? <span>· {r.memo}</span> : null}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.jeTable}>
              <thead><tr><th>account</th><th className={styles.num}>debit</th><th className={styles.num}>credit</th><th>vendor / note</th></tr></thead>
              <tbody>
                {r.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.account_code}{l.account_name ? ` · ${l.account_name}` : ""}{l.description ? <span className={styles.muted}> — {l.description}</span> : null}</td>
                    <td className={styles.num}>{l.debit_cents ? fmtCents(l.debit_cents) : ""}</td>
                    <td className={styles.num}>{l.credit_cents ? fmtCents(l.credit_cents) : ""}</td>
                    <td>{l.is_payable ? <span className={styles.muted}>{l.counterparty_name ?? "vendor"} (payable)</span> : ""}</td>
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
              {r.vendor.disposition === "new" ? <span className={`${styles.jeBadge} ${styles.jeBadgeNew}`}>new vendor</span> : null}
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
                  <span className={`${styles.jeCite} ${e.provenance_tier === "verified" ? styles.jeCiteVerified : styles.jeCiteRead}`}>{e.provenance_tier === "verified" ? "verified" : "read"}</span>
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

          {ex ? (
            <div className={styles.jeException}>
              <strong>Amount exception — approval is disabled.</strong>
              {ex.machine_total_cents !== null ? (
                <p>Machine-verified total {fmtCents(ex.machine_total_cents)}{ex.machine_region ? ` (region ${ex.machine_region.slice(0, 8)})` : ""}{ex.confidence !== null ? ` · confidence ${ex.confidence}` : ""} does not match the proposed {fmtCents(ex.proposed_cents)}.</p>
              ) : (
                <p>The proposed total {fmtCents(ex.proposed_cents)} was refused as an amount conflict; the machine total was not readable from the extract.</p>
              )}
              <p className={styles.jeHint}>Resolve with a governed override: edit the draft to the correct amount (or attest the read value). The override sets the HIGH-STAKES flag, so a distinct checker will be required.</p>
              <button className={styles.button} disabled={busy} onClick={enterEdit}>Resolve by editing</button>
            </div>
          ) : null}

          {notice === "amount_conflict" && !ex ? <p className={styles.jeHint}>Amount conflict — resolve by editing the draft to the correct amount (a governed override that sets the HIGH-STAKES flag).</p> : null}
          {notice === "stale" ? <p className={styles.jeHint}>The draft changed since it was shown — re-reviewed with the current state. Check the lines, then act again.</p> : null}
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
          busy={busy}
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

function EditPanel({
  lineBuf, setLineBuf, evidenceBuf, setEvidenceBuf, vendorBuf, setVendorBuf, attestation, setAttestation, busy, onSaveApprove, onSaveDraft, onCancel,
}: {
  lineBuf: LineBuf[]; setLineBuf: (v: LineBuf[]) => void;
  evidenceBuf: EvidenceBuf[]; setEvidenceBuf: (v: EvidenceBuf[]) => void;
  vendorBuf: VendorBuf; setVendorBuf: (v: VendorBuf) => void;
  attestation: string; setAttestation: (v: string) => void;
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
        <label className={styles.muted}>Vendor</label>
        <select className={styles.jeInput} value={vendorBuf.mode} onChange={(e) => setVendorBuf({ ...vendorBuf, mode: e.target.value as VendorBuf["mode"] })} aria-label="Vendor mode">
          <option value="new">New vendor</option>
          <option value="existing">Existing vendor id</option>
        </select>
        {vendorBuf.mode === "existing" ? (
          <input className={styles.jeInput} aria-label="counterparty id" placeholder="counterparty id" value={vendorBuf.existing_id} onChange={(e) => setVendorBuf({ ...vendorBuf, existing_id: e.target.value })} />
        ) : (
          <>
            <input className={styles.jeInput} aria-label="vendor name" placeholder="vendor name" value={vendorBuf.name} onChange={(e) => setVendorBuf({ ...vendorBuf, name: e.target.value })} />
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
      <input className={styles.jeAttest} placeholder="Attestation (solo path)" value={attestation} onChange={(e) => setAttestation(e.target.value)} aria-label="Attestation" />
      <div className={styles.jeActions}>
        <button className={styles.button} disabled={busy} onClick={onSaveApprove}>{busy ? "Working…" : "Save & approve"}</button>
        <button className={styles.buttonSecondary} disabled={busy} onClick={onSaveDraft}>Save draft (re-review)</button>
        <button className={styles.linkButton} disabled={busy} onClick={onCancel}>cancel</button>
      </div>
    </div>
  );
}
