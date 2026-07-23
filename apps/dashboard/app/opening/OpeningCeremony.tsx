"use client";

// The K5/K6 carry-down approval ceremony (LANE D3; settled plan §1 F9). ONE compound
// acknowledgment over the DB-DISPLAYED facts (the dry-run card + the approval-set read),
// framed explicitly as a single transaction; maker status rendered PASSIVELY (no per-row
// approve control — that is the tick-list this ceremony must never blur into). The typed
// solo-attestation input appears ONLY when the DB self-approval path requires it (revealed
// fail-closed after the DB's CLR05 self_attestation refusal). Then approve_opening_seed /
// approve_opening_correction is called with the AMB-3 revision map built VERBATIM from the
// approval-set read. Every displayed figure/count is DB-authored.

import { useState } from "react";
import type { OpeningSeedRow, ApprovalSetEntry, OpeningDryRun, CeremonyKind } from "./openingModel";
import { buildRevisionMap, ceremonyKind, ceremonyIsMixed, compoundAckSentence, refusalLabel, refusalHint } from "./openingModel";
import { approveOpeningSeed, approveOpeningCorrection } from "../shared/openingApi";
import type { PgrestError } from "../shared/wire";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./opening.module.css";

type Clr = { code: string; reason: string | null } | null;

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

  const kind: CeremonyKind = ceremonyKind(seed.state, entries);
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
    try {
      const entryRevisions = buildRevisionMap(entries);
      const attest = soloRequired ? attestation.trim() : null;
      if (kind === "initial") {
        await approveOpeningSeed(token, {
          seedId: seed.id,
          expectedPlanRevision: planRevision as string,
          tieSha256: seed.tie_document_sha256,
          entryRevisions,
          attestation: attest,
        });
      } else {
        await approveOpeningCorrection(token, { seedId: seed.id, entryRevisions, attestation: attest });
      }
      setAck(false);
      onFinalized();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) {
        setClr({ code: pe.clr, reason: pe.reason ?? null });
        // Fail-closed reveal: the DB says this actor is the sole eligible approver.
        if (pe.clr === "CLR05" && pe.reason === "self_attestation") setSoloRequired(true);
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
      {clr ? (
        <p className={styles.refusalNote}>
          <span className={styles.refusalBadge}>{refusalLabel(clr)}</span>
          {refusalHint(clr.code, clr.reason)}
        </p>
      ) : null}
      {err && !clr ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
