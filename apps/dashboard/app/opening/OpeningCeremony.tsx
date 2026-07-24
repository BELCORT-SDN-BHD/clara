"use client";

// The K5/K6 carry-down approval ceremony (LANE D3; settled plan §1 F9; 0018 §5 rider). ONE
// compound acknowledgment over the DB-DISPLAYED facts (the dry-run card + the approval-set
// read), framed explicitly as a single transaction; maker status rendered PASSIVELY (no
// per-row approve control — that is the tick-list this ceremony must never blur into). The
// typed solo-attestation input appears ONLY when the DB self-approval path requires it
// (revealed fail-closed after the DB's CLR05 self_attestation refusal). Then
// approve_opening_seed / approve_opening_correction is called with the AMB-3 revision map
// built VERBATIM from the approval-set read; the DB-authored ApprovalReceipt it returns is
// persisted in local state and rendered in place of the form — `onFinalized` is deliberately
// NEVER auto-invoked on success (a parent reload can unmount this component the instant its
// state moves, e.g. SeedWorkbench's `approvalSet.length > 0` guard, which would otherwise
// race the receipt off-screen before the operator ever sees proof the transaction posted).
// The receipt stays up until an explicit Done/Reload click. Every displayed figure/count is
// DB-authored.

import { useState } from "react";
import type { OpeningSeedRow, ApprovalSetEntry, OpeningDryRun, CeremonyKind, ApprovalReceipt } from "./openingModel";
import { buildRevisionMap, ceremonyKind, ceremonyIsMixed, compoundAckSentence, refusalLabel, refusalHint } from "./openingModel";
import { approveOpeningSeed, approveOpeningCorrection } from "../shared/openingApi";
import type { PgrestError } from "../shared/wire";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./opening.module.css";

type Clr = { code: string; reason: string | null } | null;

/** The persisted post-approval receipt view (0018 §5) — a pure, prop-driven presentational
 *  component (the OpeningDryRunView/Card split precedent) so it stays independently
 *  observable/testable. Every field is DB-authored (entry_count is NEVER recomputed from
 *  entries.length). `onDone` is wired to BOTH the Done and Reload actions — either is the
 *  operator's explicit signal that they have seen this receipt and it is safe to reload. */
export function OpeningApprovalReceiptView({
  receipt,
  kind,
  onDone,
}: {
  receipt: ApprovalReceipt;
  kind: Exclude<CeremonyKind, null>;
  onDone: () => void;
}) {
  return (
    <div className={styles.ceremony}>
      <p className={styles.ceremonyHead}>
        {kind === "correction" ? "Opening correction approved" : "Opening carry-down approved"}
      </p>
      <p className={styles.okText}>
        Posted {receipt.entry_count} {receipt.entry_count === 1 ? "entry" : "entries"} in batch {receipt.batch_n} — status{" "}
        {receipt.status}.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>posted entry</th>
            </tr>
          </thead>
          <tbody>
            {receipt.entries.map((id) => (
              <tr key={id}>
                <td>{shortId(id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.actions}>
        <button className={styles.button} onClick={onDone}>Done</button>
        <button className={styles.buttonSecondary} onClick={onDone}>Reload</button>
      </div>
    </div>
  );
}

export function OpeningCeremony({
  token,
  seed,
  entries,
  dry,
  planRevision,
  onFinalized,
}: {
  token: string;
  seed: OpeningSeedRow;
  entries: ApprovalSetEntry[];
  dry: OpeningDryRun | null;
  planRevision: string | null;
  onFinalized: () => void;
}) {
  const [ack, setAck] = useState(false);
  const [attestation, setAttestation] = useState("");
  const [soloRequired, setSoloRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clr, setClr] = useState<Clr>(null);
  const [err, setErr] = useState<string | null>(null);
  // Finding 6a: an expired/invalid session JWT returns a bare 401 — distinct from any
  // governed CLR refusal (which is a 400 with a typed code). Detected on `pe.status`,
  // never inferred from `pe.clr` being absent (that would also true for genuine
  // ungoverned errors), so a 401 can never be mistaken for — or silently swallowed
  // alongside — a business refusal.
  const [sessionExpired, setSessionExpired] = useState(false);
  // 0018 §5: the DB-authored receipt, persisted here (not auto-forwarded to onFinalized)
  // so the operator sees proof the transaction posted before this component can unmount.
  const [receipt, setReceipt] = useState<{ data: ApprovalReceipt; kind: Exclude<CeremonyKind, null> } | null>(null);

  const kind: CeremonyKind = ceremonyKind(seed.state, entries);

  if (receipt) {
    return (
      <OpeningApprovalReceiptView
        receipt={receipt.data}
        kind={receipt.kind}
        onDone={() => {
          setReceipt(null);
          onFinalized();
        }}
      />
    );
  }

  if (!kind) {
    return <p className={styles.muted}>This seed has no draft entries awaiting approval.</p>;
  }
  const mixed = ceremonyIsMixed(entries);
  const obeDisplay = fmtCents(dry?.obe_net_cents ?? null);
  const sentence = compoundAckSentence(entries.length, seed.as_of, obeDisplay, kind);
  const needsPlan = kind === "initial";
  const planMissing = needsPlan && !planRevision;

  async function onApprove() {
    setBusy(true);
    setClr(null);
    setErr(null);
    setSessionExpired(false);
    try {
      const entryRevisions = buildRevisionMap(entries);
      const attest = soloRequired ? attestation.trim() : null;
      const approvedKind = kind as Exclude<CeremonyKind, null>;
      const r =
        approvedKind === "initial"
          ? await approveOpeningSeed(token, {
              seedId: seed.id,
              expectedPlanRevision: planRevision as string,
              tieSha256: seed.tie_document_sha256,
              entryRevisions,
              attestation: attest,
            })
          : await approveOpeningCorrection(token, { seedId: seed.id, entryRevisions, attestation: attest });
      setAck(false);
      // Deliberately NOT calling onFinalized() here — the receipt above must render and
      // stay observable; the operator's explicit Done/Reload click triggers the reload.
      setReceipt({ data: r, kind: approvedKind });
    } catch (e) {
      const pe = e as PgrestError;
      // Finding 6a: branch on the HTTP status FIRST — a 401 is Supabase/PostgREST
      // rejecting the JWT itself (expired or invalid), never a governed CLR refusal,
      // and must never fall into the `clr`/`refusalHint` path below (which would
      // either show nothing useful or, worse, misread it as a business refusal and
      // silently defeat the solo-attestation reveal on CLR05).
      if (pe.status === 401) {
        setSessionExpired(true);
        setErr(null);
      } else {
        setErr(pe.message ?? String(e));
        if (pe.clr) {
          setClr({ code: pe.clr, reason: pe.reason ?? null });
          // Fail-closed reveal: the DB says this actor is the sole eligible approver.
          if (pe.clr === "CLR05" && pe.reason === "self_attestation") setSoloRequired(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // F-C3: a reopened seed carrying BOTH correction-linked drafts AND plain additive
  // drafts must NOT be approved as one — a mixed approval would finalize the seed with
  // drafts stranded. Disable both approval verbs and route the operator to one set at a time.
  const approveDisabled = busy || !ack || planMissing || mixed || (soloRequired && !attestation.trim());

  return (
    <div className={styles.ceremony}>
      <p className={styles.ceremonyHead}>
        {kind === "correction" ? "Approve opening correction" : "Approve opening carry-down"} — one transaction
      </p>

      {mixed ? (
        <p className={styles.banner}>
          Approve the correction set and the additive batch separately — a mixed approval would finalize the seed with drafts
          stranded. Handle one set at a time: finalize (or supersede/discard) the correction entries, then approve the
          remaining additive batch. Both approval verbs stay disabled until the set is no longer mixed.
        </p>
      ) : null}

      {/* Approval-set read — PASSIVE. Every field is DB-authored; no per-row control. */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>item</th>
              <th>entry</th>
              <th>maker</th>
              <th>posting date</th>
              <th>revision</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.entry_id} className={styles.approvalRow}>
                <td>
                  {e.is_reversal ? "reversal" : (e.item_kind ?? "entry")}
                  {e.item_key ? <span className={styles.idChip}>{e.item_key}</span> : null}
                </td>
                <td>{shortId(e.entry_id)}</td>
                <td>{shortId(e.maker)}</td>
                <td>{e.posting_date ?? "—"}</td>
                <td>{shortId(e.revision_token)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>
        Maker/checker separation is enforced by the DB — a distinct professional must approve this than drafted it, or (if
        you are the sole eligible approver) a typed attestation is required.
      </p>

      <p className={styles.ceremonyFraming}>
        Approving posts all {entries.length} draft {entries.length === 1 ? "entry" : "entries"} in ONE serializable
        transaction; a later change is a supersede (reverse-and-replace), never an edit.
      </p>

      <label className={styles.ceremonyAck}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="Compound acknowledgment" />
        <span>{sentence}</span>
      </label>

      {soloRequired ? (
        <div className={styles.attestBox}>
          <span className={styles.fieldLabel}>Solo-approval attestation (required by the DB)</span>
          <textarea
            className={styles.attestInput}
            aria-label="Solo approval attestation"
            placeholder="Attest that you have independently reviewed this carry-down as the sole eligible approver."
            value={attestation}
            onChange={(e) => setAttestation(e.target.value)}
          />
        </div>
      ) : null}

      <div className={styles.actions}>
        <button className={styles.button} disabled={approveDisabled} onClick={() => void onApprove()}>
          {busy ? "Posting…" : kind === "correction" ? "Approve correction (one transaction)" : "Approve carry-down (one transaction)"}
        </button>
      </div>

      {planMissing ? <p className={styles.hint}>The onboarding plan revision could not be read — reload before approving.</p> : null}
      {/* Finding 6a: a 401 (expired/invalid session JWT) is an AUTH failure, never a
          business refusal — it gets its OWN distinct message, never the CLR path below. */}
      {sessionExpired ? (
        <p className={styles.banner}>
          Your session token has expired — paste a fresh JWT in the token box above and retry the approval.
        </p>
      ) : null}
      {/* Finding 4b: err (the DB's verbatim message) is ALWAYS shown alongside the CLR
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
