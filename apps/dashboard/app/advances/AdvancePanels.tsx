"use client";

// /advances' two lower panels, split out of AdvancesWorkbench.tsx purely to keep
// both files under the repo's 500-line ceiling (the AgingWorkbench/AgingPanels
// precedent): the register↔GL TIE STRIP and the enrol/retire ACCOUNTS panel.
// Neither computes a figure — the tie strip renders `staff_advance_tie`'s own
// cents and its own `explained` verdict verbatim.

import { useState } from "react";
import type { PgrestError } from "../shared/wire";
import { enrolStaffAdvanceAccount, retireStaffAdvanceAccount } from "../shared/advancesApi";
import {
  staffAdvanceTieState, tieExplainedLabel,
  type StaffAdvanceSummaryRow, type StaffAdvanceTieRead,
} from "./advancesModel";

/** One retirable enrolment, unioned from the two reads this screen already makes. */
type EnrolmentRow = {
  enrolment_id: string; account_code: string; person_label: string;
  active: boolean; hasAdvance: boolean;
};
import { fmtCents, fmtDeltaCents } from "../shared/fmt";
import styles from "./advances.module.css";

/** staff_advance_tie(client, as_of) — design §3.4: "register vs GL vs
 *  difference vs out_of_window, explained." One row per account_code; the GL
 *  side is window-scoped to the code's enrolment generations, so a repurposed
 *  retired code cannot permanently break this strip.
 *
 *  [round-2 fix] `explained` is the DB's BOOLEAN `register_cents = gl_cents`
 *  verdict, not a prose gloss — it is rendered through tieExplainedLabel, which
 *  keeps "the DB did not report it" distinct from "the DB said no". And an
 *  UNAVAILABLE envelope is stated as such: an empty tie strip must never be
 *  allowed to read as "nothing to reconcile". */
export function AdvanceTieStrip({ read, err }: { read: StaffAdvanceTieRead; err: string | null }) {
  const rows = read.accounts;
  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>
        Register ↔ GL tie
        {read.tie === true ? <span className={styles.band + " " + styles.bandReady}> all tied</span> : null}
        {read.tie === false ? <span className={styles.band + " " + styles.bandYou}> variance</span> : null}
      </p>
      {err ? <p className={styles.errorText}>{err}</p> : null}
      {!err && !read.available ? (
        <p className={styles.errorText}>
          The tie came back in an unexpected shape — showing nothing rather than an empty strip,
          because an empty strip would read as &ldquo;nothing to reconcile&rdquo;.
        </p>
      ) : rows.length === 0 ? (
        <p className={styles.emptyState}>No advance accounts to tie yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>account</th><th className={styles.num}>register</th><th className={styles.num}>GL</th>
                <th className={styles.num}>difference</th><th className={styles.num}>out of window</th>
                <th>state</th><th>explained</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tieState = staffAdvanceTieState(r);
                return (
                  <tr key={r.account_code}>
                    <td>{r.account_code}</td>
                    <td className={styles.num}>{fmtCents(r.register_cents)}</td>
                    <td className={styles.num}>{fmtCents(r.gl_cents)}</td>
                    <td className={styles.num}>{fmtDeltaCents(r.difference_cents)}</td>
                    <td className={styles.num}>{fmtDeltaCents(r.out_of_window_cents)}</td>
                    <td>
                      <span className={`${styles.band} ${tieState === "tied" ? styles.bandReady : tieState === "variance" ? styles.bandYou : styles.bandNeutral}`}>
                        {tieState}
                      </span>
                    </td>
                    <td className={styles.muted}>{tieExplainedLabel(r.explained)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.hint}>Every figure above is the DB&apos;s (design §3.2 the outstanding equation) — this strip renders it verbatim; it never sums a figure.</p>
    </div>
  );
}

/** Enrolment (admin+, design §3.1) — enrol a new dedicated advance account, and
 *  retire EVERY enrolment this screen's own reads reveal.
 *
 *  [round-5 fix] THE UNRETIRABLE ENROLMENT. This panel used to derive its list
 *  from `rows` — the SUMMARY's advances — so an ACTIVE enrolment that had never
 *  disbursed an advance appeared nowhere and could not be retired from any surface
 *  in the product. That is not cosmetic: an active enrolment RESERVES its account
 *  code, and 0042's shared reservation union walls that code out of the FA account
 *  profile, the K-doc opening seed, the bank-account binding and the FA reversal
 *  door — whose brand-new refusal (`coa_account_advance_reserved`) NAMES
 *  `retire_staff_advance_account` as the remedy. A refusal that names a remedy no
 *  surface offers is a dead end, and the id needed to lift it was on this same
 *  screen all along: `staff_advance_tie` walks the UNION of enrolments and
 *  advances and emits `active_enrolment_id` per account code. The list below is
 *  that union — the DB's own, never re-derived.
 *
 *  No local role gating (the DB's admin+ floor is the enforcement, the /assets
 *  AuthorityBanner precedent). */
export function EnrolPanel({
  token, clientId, rows, tie, onChanged,
}: { token: string; clientId: string; rows: StaffAdvanceSummaryRow[]; tie: StaffAdvanceTieRead; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [personLabel, setPersonLabel] = useState("");
  const [confirmDedicated, setConfirmDedicated] = useState(false);
  const [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [retireReason, setRetireReason] = useState<Record<string, string>>({});
  const [retireBusyId, setRetireBusyId] = useState<string | null>(null);
  const [retireErr, setRetireErr] = useState<{ id: string; message: string } | null>(null);

  // THE UNION, keyed on enrolment_id. Summary rows carry the person label and cover
  // RETIRED generations that still hold advances; the tie covers every enrolled
  // code including those with no advance at all. An enrolment reachable from either
  // instrument is retirable here.
  const byId = new Map<string, EnrolmentRow>();
  for (const r of rows) {
    if (!r.enrolment_id) continue;
    byId.set(r.enrolment_id, {
      enrolment_id: r.enrolment_id, account_code: r.account_code,
      person_label: r.person_label, active: r.enrolment_active, hasAdvance: true,
    });
  }
  for (const t of tie.accounts) {
    const id = t.active_enrolment_id;
    if (!id || byId.has(id)) continue;
    byId.set(id, {
      enrolment_id: id, account_code: t.account_code,
      person_label: "", active: true, hasAdvance: (t.advance_count ?? 0) > 0,
    });
  }
  const enrolments = [...byId.values()].sort((a, b) => a.account_code.localeCompare(b.account_code));

  const submitEnrol = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await enrolStaffAdvanceAccount(token, {
        clientId, accountCode: accountCode.trim(), personLabel: personLabel.trim(),
        confirmDedicated, attestation: attestation.trim(),
      });
      setMsg("Enrolled.");
      setAccountCode(""); setPersonLabel(""); setConfirmDedicated(false); setAttestation("");
      onChanged();
    } catch (e) {
      setMsg((e as PgrestError).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = async (enrolmentId: string) => {
    const reason = (retireReason[enrolmentId] ?? "").trim();
    if (!reason) return;
    setRetireBusyId(enrolmentId);
    setRetireErr(null);
    try {
      await retireStaffAdvanceAccount(token, clientId, enrolmentId, reason);
      onChanged();
    } catch (e) {
      setRetireErr({ id: enrolmentId, message: (e as PgrestError).message ?? String(e) });
    } finally {
      setRetireBusyId(null);
    }
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Advance accounts</p>
      {enrolments.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>account</th><th>person</th><th></th></tr></thead>
            <tbody>
              {enrolments.map((e) => (
                <tr key={e.enrolment_id}>
                  <td>{e.account_code}</td>
                  <td>
                    {e.person_label || <span className={styles.muted}>—</span>}
                    {e.active ? null : <span className={styles.overdueTag}>retired</span>}
                    {e.hasAdvance ? null : <span className={styles.muted}> · no advance disbursed</span>}
                  </td>
                  <td>
                    <div className={styles.actions} style={{ marginTop: 0 }}>
                      <input
                        className={styles.input}
                        placeholder="Retire reason"
                        value={retireReason[e.enrolment_id] ?? ""}
                        onChange={(ev) => setRetireReason((s) => ({ ...s, [e.enrolment_id]: ev.target.value }))}
                        aria-label={`Retire reason for ${e.account_code}`}
                      />
                      <button
                        className={styles.buttonSecondary}
                        disabled={retireBusyId === e.enrolment_id || !(retireReason[e.enrolment_id] ?? "").trim()}
                        onClick={() => void retire(e.enrolment_id)}
                      >
                        {retireBusyId === e.enrolment_id ? "Retiring…" : "Retire"}
                      </button>
                    </div>
                    {retireErr?.id === e.enrolment_id ? <p className={styles.errorText}>{retireErr.message}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !tie.available ? (
        /* The tie is HALF this list's source. If its envelope was wrong-shaped we
           do not know whether there are enrolments — say so rather than render an
           empty table that reads as "nothing is enrolled". */
        <p className={styles.errorText}>Could not read this client&apos;s advance accounts — the tie came back in an unexpected shape.</p>
      ) : (
        <p className={styles.muted}>No advance accounts enrolled on this client yet.</p>
      )}

      {!open ? (
        <button className={styles.linkButton} onClick={() => setOpen(true)}>+ Enrol an advance account</button>
      ) : (
        <div className={styles.propose}>
          <p className={styles.sectionTitle}>Enrol an advance account (admin+)</p>
          <div className={styles.proposeGrid}>
            <input className={styles.input} placeholder="Account code" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} aria-label="Account code" />
            <input className={styles.input} placeholder="Person label" value={personLabel} onChange={(e) => setPersonLabel(e.target.value)} aria-label="Person label" />
          </div>
          <label className={styles.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.4rem", marginTop: "0.3rem" }}>
            <input type="checkbox" checked={confirmDedicated} onChange={(e) => setConfirmDedicated(e.target.checked)} aria-label="Confirm dedicated account" />
            <span>This account is dedicated to staff advances (not shared with any other purpose)</span>
          </label>
          <label className={styles.field} style={{ marginTop: "0.3rem" }}>
            <span className={styles.fieldLabel}>attestation (related-party evidence, G15)</span>
            <input className={styles.input} value={attestation} onChange={(e) => setAttestation(e.target.value)} aria-label="Enrolment attestation" />
          </label>
          <div className={styles.actions}>
            <button
              className={styles.button}
              disabled={busy || !accountCode.trim() || !personLabel.trim() || !confirmDedicated || !attestation.trim()}
              onClick={() => void submitEnrol()}
            >
              {busy ? "Enrolling…" : "Enrol"}
            </button>
            <button className={styles.buttonSecondary} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            {msg ? <span className={styles.muted}>{msg}</span> : null}
          </div>
          <p className={styles.hint}>Enrolment requires the account&apos;s approved GL balance to be exactly zero (enrol-clean-only) — a pre-existing balance defers to the attested-baseline mechanism.</p>
        </div>
      )}
    </div>
  );
}
