"use client";

// The opening trial-balance TARGETS surface (LANE D3; §1 F12 + §3.3). A document-tied
// seed parses its tie document deterministically through the runtime parse route; a 422
// unparseable is surfaced as the ATTRIBUTED-KEYED fallback guidance (WB-R15). A seed with
// no tie document uses the keyed form (record_opening_target), the human maker visibly
// attributed. Provenance (document vs keyed) is shown on every row. No figure is computed
// here — cents are DB-echoed / DB-recorded verbatim.

import { useState } from "react";
import type { OpeningSeedRow, OpeningTargetRow, ParseResult } from "./openingModel";
import { buildKeyedTargetLine } from "./openingPayloads";
import { recordOpeningTarget, parseOpeningTargets } from "../shared/openingApi";
import type { PgrestError } from "../shared/wire";
import { refusalLabel, refusalHint } from "./openingModel";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./opening.module.css";

export function OpeningTargets({
  token,
  seed,
  targets,
  onChanged,
}: {
  token: string;
  seed: OpeningSeedRow;
  targets: OpeningTargetRow[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [parseNote, setParseNote] = useState<ParseResult | null>(null);
  // Keyed form state.
  const [lineKey, setLineKey] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");

  const editable = seed.state === "open";
  const isDocument = seed.tie_document_id !== null;

  async function runParse() {
    setBusy(true);
    setErr(null);
    setClr(null);
    setParseNote(null);
    try {
      const r = await parseOpeningTargets(token, seed.id);
      setParseNote(r);
      if (r.status === "parsed") onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitKeyed() {
    const built = buildKeyedTargetLine({ lineKey, accountCode, sourceLabel, side, amountCents: amount });
    if (!built.ok) {
      setErr(built.error);
      return;
    }
    setBusy(true);
    setErr(null);
    setClr(null);
    try {
      await recordOpeningTarget(token, seed.id, built.payload);
      setLineKey("");
      setAccountCode("");
      setSourceLabel("");
      setAmount("");
      onChanged();
    } catch (e) {
      const pe = e as PgrestError;
      setErr(pe.message ?? String(e));
      if (pe.clr) setClr({ code: pe.clr, reason: pe.reason ?? null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>
        Trial-balance targets ({targets.length}) · {isDocument ? "document-tied" : "keyed fallback"}
      </p>

      {targets.length === 0 ? (
        <p className={styles.emptyState}>No targets recorded yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>line</th>
                <th>account</th>
                <th className={styles.num}>debit</th>
                <th className={styles.num}>credit</th>
                <th>provenance</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.line_key}
                    <div className={styles.provenanceNote}>{t.source_label}</div>
                  </td>
                  <td>{t.account_code ?? <span className={styles.band + " " + styles.bandYou}>unmapped</span>}</td>
                  <td className={styles.num}>{t.debit_cents > 0 ? fmtCents(t.debit_cents) : "—"}</td>
                  <td className={styles.num}>{t.credit_cents > 0 ? fmtCents(t.credit_cents) : "—"}</td>
                  <td>
                    <span className={`${styles.badge} ${t.provenance_kind === "document" ? styles.badgeDoc : styles.badgeKeyed}`}>
                      {t.provenance_kind}
                    </span>
                    {t.provenance_kind === "keyed" && t.entered_by ? (
                      <span className={styles.provenanceNote}> by {shortId(t.entered_by)}</span>
                    ) : null}
                    {t.provenance_kind === "document" && t.document_id ? (
                      <span className={styles.provenanceNote}> {shortId(t.document_id)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && isDocument ? (
        <div className={styles.actions}>
          <button className={styles.buttonSecondary} disabled={busy} onClick={() => void runParse()}>
            {busy ? "Parsing…" : "Parse tie document"}
          </button>
          <span className={styles.provenanceNote}>Deterministic extraction — labels + amounts, no model, no egress.</span>
        </div>
      ) : null}

      {parseNote?.status === "parsed" ? (
        <p className={styles.okText}>Parsed {parseNote.lines} target line{parseNote.lines === 1 ? "" : "s"} from the tie document.</p>
      ) : null}
      {parseNote?.status === "unparseable" ? (
        <p className={styles.hint}>
          The tie document could not be parsed into trial-balance lines ({parseNote.reason}). To key the targets manually,
          create the opening seed WITHOUT a tie document — the keyed fallback attributes every line to you (WB-R15).
        </p>
      ) : null}
      {parseNote?.status === "refused" ? (
        <p className={styles.refusalNote}>
          <span className={styles.refusalBadge}>{parseNote.code ?? "refused"}</span>
          {parseNote.message}
        </p>
      ) : null}

      {editable && !isDocument ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Add a keyed target line</p>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>line key</span>
              <input className={styles.input} value={lineKey} onChange={(e) => setLineKey(e.target.value)} aria-label="Line key" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>account code (optional)</span>
              <input className={styles.input} value={accountCode} onChange={(e) => setAccountCode(e.target.value)} aria-label="Account code" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>source label (optional)</span>
              <input className={styles.input} value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} aria-label="Source label" />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>side</span>
              <select className={styles.select} value={side} onChange={(e) => setSide(e.target.value as "debit" | "credit")} aria-label="Side">
                <option value="debit">debit</option>
                <option value="credit">credit</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>amount (cents)</span>
              <input className={styles.input} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in cents" />
            </label>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} disabled={busy} onClick={() => void submitKeyed()}>
              {busy ? "Saving…" : "Record keyed target"}
            </button>
          </div>
        </div>
      ) : null}

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
