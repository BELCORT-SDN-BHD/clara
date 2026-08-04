"use client";

// The AF-2 composite's booking sub-forms (Wave D-b, design `wave-d-b-design.md`
// §4; the builder ABI `wave-d-b-design-abi.md` §A). Split out of
// ReconciliationSnapshotTables.tsx (repo file-size discipline — the
// matchModel/reconSnapshotModel precedent).
//
// ═══ WHAT ROUND 3 FOUND HERE, AND WHAT REPLACED IT ═══
// The previous shape offered TWO buttons: "Resolve + book now" (a hand-draft)
// and "Declare only (high-stakes park)" — and the second sent neither `p_draft`
// nor `p_allocations`, so `resolve_and_book_bank_line` refused EVERY click with
// CLR10 `booking_request_invalid` / axis `no_booking` (probed against the
// shipped 0042, sha a779171a). Meanwhile the SETTLEMENT leg — `p_allocations`,
// the ONLY leg that can park, and therefore the only producer of
// `pending_resolution` — had no dashboard caller at all, so the "resolution
// parked" badge rendered a state no dashboard act could create and a
// high-stakes matched_booking / written_off_adjustment was unreachable.
//
// The truth the surface now tells: THE PARK IS NOT AN ACT A HUMAN REQUESTS
// [WDB-G9]. A user picks a LEG — hand-code an entry, or settle the line against
// open items — and the DB answers `branch`. A settlement at or above the firm's
// high-stakes threshold comes back `pending` with the declaration parked; below
// it, everything completes live. Nothing here promises which.
//
// EVERY control's enabled state and its disabled-copy come from the ONE shared
// admission body (`af2Admission`, resolveBookModel.ts) that shared/reconApi.ts's
// wire caller also gates on — so a control can never offer an act the caller
// would refuse, which is the walled-corridor class this round closed.
//
// No figure is computed here: allocation cents are typed input the DB validates
// (`parseCentsInput` keeps the sen exact on the write path), and every open-item
// outstanding figure is rendered verbatim from the DB.

import { useEffect, useReducer, useState } from "react";
import type { ResolveAndBookBankLineDisposition } from "../shared/reconApi";
import type { SettleAllocationInput, BankAdjustmentInput } from "../shared/bankApi";
import { listOpenItemsByCounterparty } from "../shared/bankApi";
import { listCounterparties, type CounterpartyRow, type CounterpartyKind } from "../shared/counterpartyApi";
import { staffAdvanceSummary, type StaffAdvanceApplicationKind } from "../shared/advancesApi";
import type { StaffAdvanceSummaryRow } from "../advances/advancesModel";
import type { OpenItemRow } from "./model";
import { exceptionDispositionLabel } from "./reconModel";
import {
  af2Admission, settlementAllocationInputs, settlementLegInitialState, settlementLegReducer,
  type Af2Request,
} from "./resolveBookModel";
import { parseCentsInput, refundSubmitBlock, settlementDomainFor, REFUND_WORKAROUND_MESSAGE } from "./matchModel";
import { fmtCents, shortId } from "../shared/fmt";
import styles from "./bank.module.css";

/** The composite booking act's own event shape (design §4, ABI §A) — passed up
 *  so the caller (ReconciliationPanel) owns busy/err state, matching the
 *  existing onResolveException lifting precedent. EXACTLY ONE of `draft` /
 *  `allocations` is ever non-null: the leg is derived from what is supplied. */
export type ResolveAndBookArgs = {
  draft: {
    posting_date: string; memo: string;
    lines: { account_code: string; debit_cents: number; credit_cents: number; description?: string | null }[];
  } | null;
  allocations: SettleAllocationInput[] | null;
  adjustments: BankAdjustmentInput[] | null;
  /** [round-7 F-F2 fix] the AF-2 advance-application channel (design SS3.4/SS4,
   *  ABI SSA/SSB) -- draft-leg only (line_no names a position in draft.lines).
   *  Optional: every existing settlement-leg caller (SettlementLegFields) is
   *  untouched. */
  advanceApplications?: { kind: string; reason: string; allocations: { line_no: number; advance_id: string; amount_cents: number }[] } | null;
  /** [round-8 M3-F1] the period-exception acknowledgement — draft-leg only (the
   *  composite refuses it by name on the settlement leg, `ack_without_draft`).
   *  Optional: every settlement-leg caller is untouched. */
  ackPeriodExceptions?: boolean;
  chargeCents: number | null;
  chargeAccount: string | null;
};

const EMPTY_DRAFT_LINE = { account_code: "", debit_cents: 0, credit_cents: 0, description: "" };

export type BookingLeg = "draft" | "settle";

export function ExceptionBookingFields({
  token, clientId, exceptionId, lineAmountCents, disposition, note, busy, onSubmit,
  initialLeg, initialKind,
}: {
  /** Absent ⇒ the settlement leg cannot list counterparties/open items, so it is
   *  not offered at all (and says so) rather than offering a control that
   *  cannot fill itself. */
  token: string | null;
  clientId: string | null;
  exceptionId: string;
  /** The excepted line's own amount, for the refund-quadrant preview only. */
  lineAmountCents: number | null;
  disposition: ResolveAndBookBankLineDisposition;
  note: string;
  busy: boolean;
  onSubmit: (args: ResolveAndBookArgs) => void;
  /** The surface's ENTRY state (the SettleLinePanel `initialKind` precedent).
   *  Defaults: the settlement leg, and the counterparty kind implied by the
   *  line's own sign. A caller may deep-link into either leg/quadrant; the user
   *  can still toggle both. */
  initialLeg?: BookingLeg;
  initialKind?: CounterpartyKind;
}) {
  const [leg, setLeg] = useState<BookingLeg>(initialLeg ?? "settle");
  const settleReachable = !!token && !!clientId;

  return (
    <div className={styles.propose} style={{ width: "100%" }}>
      <p className={styles.sectionTitle}>{exceptionDispositionLabel(disposition)} — book via the composite</p>
      <div className={styles.actions}>
        <button className={leg === "settle" ? styles.button : styles.buttonSecondary} onClick={() => setLeg("settle")}>
          Settle open items
        </button>
        <button className={leg === "draft" ? styles.button : styles.buttonSecondary} onClick={() => setLeg("draft")}>
          Hand-code an entry
        </button>
      </div>
      {leg === "settle" ? (
        settleReachable ? (
          <SettlementLegFields
            token={token as string} clientId={clientId as string} exceptionId={exceptionId}
            lineAmountCents={lineAmountCents} initialKind={initialKind}
            disposition={disposition} note={note} busy={busy} onSubmit={onSubmit}
          />
        ) : (
          <p className={styles.hint}>
            The settlement leg needs a signed-in session to list this client&apos;s counterparties and open
            items — it is not offered here rather than offering a control that cannot be filled.
          </p>
        )
      ) : (
        <HandDraftLegFields
          token={token} clientId={clientId}
          exceptionId={exceptionId} disposition={disposition} note={note} busy={busy} onSubmit={onSubmit}
        />
      )}
      <p className={styles.hint}>
        A high-stakes park is NOT a separate button [WDB-G9]: only the SETTLEMENT leg can park, and the DB
        decides — at or above the firm&apos;s threshold it books the settlement, parks this declaration, and a
        distinct checker flips it with the pending line&apos;s complete/cancel controls above. A high-stakes
        HAND-DRAFT cannot park at all and refuses by name.
      </p>
    </div>
  );
}

/** Shared between the two legs: the ONE admission body decides the submit
 *  button's enabled state and its disabled copy.
 *
 *  EXPORTED for the same reason OpenItemAllocations is: its two states — an
 *  admissible request with a LOCAL block, and one without — are reachable in
 *  this surface only after a network effect and a typed allocation, and a state
 *  no cell can render is a state no cell can hold to account. */
export function SubmitRow({
  request, busy, label, busyLabel, blockedBy, onSubmit,
}: {
  request: Af2Request; busy: boolean; label: string; busyLabel: string;
  /** A LOCAL completeness bound the composite has no opinion about (e.g. an
   *  account code the DB would only reject two calls deeper). Stated in full,
   *  never as a silently disabled button. */
  blockedBy?: string | null;
  onSubmit: () => void;
}) {
  const admission = af2Admission(request);
  const why = admission.admitted ? (blockedBy ?? null) : admission.message;
  return (
    <>
      <div className={styles.actions}>
        <button className={styles.button} disabled={busy || why !== null} onClick={onSubmit}>
          {busy ? busyLabel : label}
        </button>
      </div>
      {why ? <p className={styles.hint}>{why}</p> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// THE SETTLEMENT LEG (`p_allocations`) — the only leg that can park.
// ---------------------------------------------------------------------------

function SettlementLegFields({
  token, clientId, exceptionId, lineAmountCents, initialKind, disposition, note, busy, onSubmit,
}: {
  token: string; clientId: string; exceptionId: string; lineAmountCents: number | null;
  initialKind?: CounterpartyKind;
  disposition: ResolveAndBookBankLineDisposition; note: string; busy: boolean;
  onSubmit: (args: ResolveAndBookArgs) => void;
}) {
  // [merge gate PR #184, finding 1] EVERY state this leg's scope owns lives in
  // ONE reducer (resolveBookModel), because the defect the gate caught was a
  // TRANSITION: switching party or kind cleared the displayed items and kept the
  // allocation map, and the composite derives its counterparty from the ids in
  // that map — so the surface could show party B and settle party A. The reducer
  // makes voiding the map a law of the transition rather than a call somebody
  // has to remember, and `settlementAllocationInputs` re-checks it on the way
  // out (belt and braces: an id that is not on screen cannot reach the wire).
  const [state, dispatch] = useReducer(
    settlementLegReducer,
    initialKind ?? ((lineAmountCents ?? 0) >= 0 ? "customer" : "vendor"),
    settlementLegInitialState,
  );
  const { kind, counterpartyId, openItems, itemsAvailable, allocations } = state;
  const [counterparties, setCounterparties] = useState<CounterpartyRow[]>([]);

  // The composite DERIVES its counterparty from the items named, so this picker
  // exists only to narrow the open-item list — it is never sent.
  const domain = kind === "customer" ? "ar" : "ap";

  useEffect(() => {
    // A session/client change voids the scope exactly as a kind toggle does:
    // nothing already picked is known to belong to the client now in view.
    dispatch({ type: "scope", kind });
    listCounterparties(token, clientId, kind).then(setCounterparties).catch(() => setCounterparties([]));
  }, [token, clientId, kind]);

  useEffect(() => {
    if (!counterpartyId) return; // the reducer already voided items on the switch
    let cancelled = false;
    listOpenItemsByCounterparty(token, clientId, domain, counterpartyId)
      .then((rows) => { if (!cancelled) dispatch({ type: "items_loaded", items: rows }); })
      .catch(() => { if (!cancelled) dispatch({ type: "items_unreadable" }); });
    return () => { cancelled = true; };
  }, [token, clientId, counterpartyId, domain]);

  const allocationInputs: SettleAllocationInput[] = settlementAllocationInputs(state);

  // The refund quadrant is a settle_from_bank_line law (design §4.6); previewed
  // only when the DB gave this exception an amount to preview it against.
  // [merge gate PR #184, finding 2] It also BLOCKS the submit: showing the
  // workaround while leaving the button live offered a call this surface had
  // already said the DB refuses by name.
  const refund = lineAmountCents !== null
    && settlementDomainFor(kind, lineAmountCents) === "refund_not_supported";
  const refundBlock = refundSubmitBlock(kind, lineAmountCents);

  const request: Af2Request = {
    disposition, note, draft: null, allocations: allocationInputs,
    adjustments: null, chargeCents: 0, chargeAccount: null,
  };

  return (
    <>
      <div className={styles.actions}>
        <button className={kind === "customer" ? styles.button : styles.buttonSecondary} onClick={() => dispatch({ type: "scope", kind: "customer" })}>Customer</button>
        <button className={kind === "vendor" ? styles.button : styles.buttonSecondary} onClick={() => dispatch({ type: "scope", kind: "vendor" })}>Vendor</button>
        <select
          className={styles.select} value={counterpartyId}
          onChange={(e) => dispatch({ type: "counterparty", counterpartyId: e.target.value })}
          aria-label={`Settlement counterparty for exception ${exceptionId}`} style={{ flex: 1 }}
        >
          <option value="">Select a counterparty to list its open items…</option>
          {counterparties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {refund ? <p className={styles.errorText}>{REFUND_WORKAROUND_MESSAGE}</p> : null}

      {counterpartyId ? (
        <OpenItemAllocations
          items={openItems} available={itemsAvailable} domain={domain}
          allocations={allocations}
          onAllocate={(id, cents) => dispatch({ type: "allocate", itemId: id, cents })}
        />
      ) : null}

      <SubmitRow
        request={request} busy={busy} label="Resolve + settle these items" busyLabel="Settling…"
        blockedBy={refundBlock}
        onSubmit={() => onSubmit({ draft: null, allocations: allocationInputs, adjustments: null, chargeCents: null, chargeAccount: null })}
      />
    </>
  );
}

/** The open-item picker. EXPORTED and pure so its three states can be rendered
 *  and asserted directly — the round-3 lesson that a branch only reachable
 *  through a network effect is a branch no cell can ask about.
 *
 *  `available === false` is the FAIL-CLOSED state (the assetsModel/advancesModel
 *  `available` law): a list that could not be read must never render as "nothing
 *  is owed", because that is the reading under which a human allocates zero and
 *  the settlement quietly books the wrong amount. */
export function OpenItemAllocations({
  items, available, domain, allocations, onAllocate,
}: {
  items: readonly OpenItemRow[];
  /** null = not asked yet; false = the read failed or came back wrong-shaped. */
  available: boolean | null;
  domain: "ar" | "ap";
  allocations: Readonly<Record<string, number>>;
  onAllocate: (itemId: string, cents: number) => void;
}) {
  if (available === false) {
    return (
      <p className={styles.errorText}>
        The open-item list for this counterparty could not be read — showing nothing rather than an empty
        list, because an empty list would read as &ldquo;nothing is owed&rdquo;.
      </p>
    );
  }
  if (available && items.length === 0) {
    return <p className={styles.muted}>No open items for this counterparty ({domain.toUpperCase()}).</p>;
  }
  return (
    <>
      {items.map((it) => (
        <div key={it.id} className={styles.candidateRow}>
          <div className={styles.accountMain}>
            <span className={styles.accountName}>{it.item_kind} · {it.item_date} · {shortId(it.id)}</span>
            <span className={styles.accountSub}>outstanding {fmtCents(it.outstanding_cents)}</span>
          </div>
          <input
            type="number" className={`${styles.input} ${styles.amountInput}`} placeholder="0.00"
            value={allocations[it.id] ? (allocations[it.id] as number) / 100 : ""}
            aria-label={`Allocate to item ${it.id}`}
            onChange={(e) => onAllocate(it.id, parseCentsInput(e.target.value))}
          />
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// THE HAND-DRAFT LEG (`p_draft`) — books its own entry; can never park.
// ---------------------------------------------------------------------------

function HandDraftLegFields({
  token, clientId, exceptionId, disposition, note, busy, onSubmit,
}: {
  /** [round-7 F-F2 fix] needed ONLY to list this client's outstanding staff
   *  advances for the allocation picker below — absent, the advance section
   *  says so rather than offering a control that cannot be filled (the
   *  SettlementLegFields precedent). The draft itself never needed a session. */
  token: string | null; clientId: string | null;
  exceptionId: string; disposition: ResolveAndBookBankLineDisposition; note: string; busy: boolean;
  onSubmit: (args: ResolveAndBookArgs) => void;
}) {
  const [postingDate, setPostingDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState([{ ...EMPTY_DRAFT_LINE }, { ...EMPTY_DRAFT_LINE }]);
  // [round-7 F-F2 fix] the AF-2 advance-application channel — was surface-dead:
  // `advanceApplications` existed only in the wire wrapper's TYPE (reconApi.ts);
  // no control anywhere ever set it, so a hand-draft crediting an enrolled
  // staff-advance account could NEVER be booked — the DB refuses CLR40
  // `advance_application_missing` on EVERY such credit, unconditionally
  // (measured, x42v.b1), and this form had no field to name the allocation
  // that fixes it.
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceKind, setAdvanceKind] = useState<StaffAdvanceApplicationKind>("bank_return");
  const [advanceReason, setAdvanceReason] = useState("");
  const [advanceRows, setAdvanceRows] = useState<AdvanceAllocRow[]>([]);
  // [round-8 M3-F1] the period-exception acknowledgement — a DRAFT-leg argument only (the
  // settlement leg posts at the line's own entry_date and the composite refuses an ack
  // there by name). Without this control the re-book leg of a released advance-carrying
  // booking has no reachable door: the composite refuses any posting date outside the
  // statement period unless the caller acknowledges it, exactly as match_bank_line does.
  const [ackPeriod, setAckPeriod] = useState(false);

  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_DRAFT_LINE }]);
  const removeLine = (i: number) => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls));

  const draft = {
    posting_date: postingDate, memo: memo.trim(),
    lines: lines.map((l) => ({ ...l, description: l.description || null })),
  };
  const codesFilled = lines.every((l) => l.account_code.trim() !== "") && memo.trim() !== "";
  // Well-formed only when the section is OPEN and every row names both an
  // advance and a positive amount — a half-open section must not silently ride
  // along as `{allocations: []}` (the DB's own coverage gate would refuse the
  // SAME CLR40 this section exists to avoid, with no visible cause).
  const advanceRowsReady = advanceRows.filter((r) => r.advance_id && r.amount_cents > 0);
  const advanceApplications = advanceOpen && advanceRowsReady.length > 0
    ? { kind: advanceKind, reason: advanceReason.trim(), allocations: advanceRowsReady }
    : null;
  const request: Af2Request = {
    disposition, note, draft, allocations: null, adjustments: null, advanceApplications,
    ackPeriodExceptions: ackPeriod, chargeCents: 0, chargeAccount: null,
  };

  return (
    <>
      <div className={styles.actions}>
        <input type="date" className={styles.input} value={postingDate} onChange={(e) => setPostingDate(e.target.value)} aria-label={`Posting date for exception ${exceptionId}`} />
        <input className={styles.input} placeholder="Memo" value={memo} onChange={(e) => setMemo(e.target.value)} aria-label={`Memo for exception ${exceptionId}`} style={{ flex: 1 }} />
      </div>
      {lines.map((l, i) => (
        <div className={styles.actions} key={i}>
          <input className={styles.input} placeholder="Account code" value={l.account_code} onChange={(e) => setLine(i, { account_code: e.target.value })} aria-label={`Draft line ${i + 1} account code`} />
          <input className={styles.input} placeholder="Debit cents" value={l.debit_cents || ""} onChange={(e) => setLine(i, { debit_cents: Number(e.target.value) || 0, credit_cents: 0 })} aria-label={`Draft line ${i + 1} debit cents`} />
          <input className={styles.input} placeholder="Credit cents" value={l.credit_cents || ""} onChange={(e) => setLine(i, { credit_cents: Number(e.target.value) || 0, debit_cents: 0 })} aria-label={`Draft line ${i + 1} credit cents`} />
          <input className={styles.input} placeholder="Description" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Draft line ${i + 1} description`} />
          <button className={styles.buttonSecondary} disabled={lines.length <= 2} onClick={() => removeLine(i)}>Remove</button>
        </div>
      ))}
      <div className={styles.actions}>
        <button className={styles.buttonSecondary} onClick={addLine}>+ Add line</button>
      </div>

      {token && clientId ? (
        !advanceOpen ? (
          <button className={styles.linkButton} onClick={() => setAdvanceOpen(true)}>+ This draft repays a staff advance</button>
        ) : (
          <AdvanceApplicationFields
            token={token} clientId={clientId} lines={lines}
            kind={advanceKind} onKindChange={setAdvanceKind}
            reason={advanceReason} onReasonChange={setAdvanceReason}
            rows={advanceRows} onRowsChange={setAdvanceRows}
          />
        )
      ) : (
        <p className={styles.hint}>Staff-advance allocations need a signed-in session to list this client&apos;s advances.</p>
      )}

      <label className={styles.hint}>
        <input
          type="checkbox" checked={ackPeriod} onChange={(e) => setAckPeriod(e.target.checked)}
          aria-label={`Acknowledge an out-of-period posting date for exception ${exceptionId}`}
        />{" "}
        The posting date is outside this statement&apos;s period, and I acknowledge booking it
        there (re-booking a released line at its own historic date needs this).
      </label>

      <SubmitRow
        request={request} busy={busy} label="Resolve + book now" busyLabel="Booking…"
        blockedBy={codesFilled ? null : "Every line needs an account code, and the entry needs a memo, before it can be drafted."}
        onSubmit={() => onSubmit({ draft, allocations: null, adjustments: null, advanceApplications, ackPeriodExceptions: ackPeriod, chargeCents: null, chargeAccount: null })}
      />
    </>
  );
}

/** ONE allocation row: `line_no` names a position in the draft's OWN `lines`
 *  (1-based — ABI SSA/SSB, measured against the shipped composite: x42.af2-5
 *  sends `{line_no:2,...}` for the SECOND element of `p_draft.lines`). */
export type AdvanceAllocRow = { line_no: number; advance_id: string; amount_cents: number };

/** The staff-advance allocation picker (round-7 F-F2). The composer only
 *  CARRIES the payload — identifier + cents; the DB validates enrolment,
 *  coverage-to-the-sen and the temporal cap (design SS3.3), and its refusal
 *  renders verbatim through the ordinary PgrestError path (the
 *  KbRuleProposalCard law), never re-derived here. */
export function AdvanceApplicationFields({
  token, clientId, lines, kind, onKindChange, reason, onReasonChange, rows, onRowsChange,
}: {
  token: string; clientId: string;
  lines: readonly { account_code: string }[];
  kind: StaffAdvanceApplicationKind; onKindChange: (k: StaffAdvanceApplicationKind) => void;
  reason: string; onReasonChange: (v: string) => void;
  rows: AdvanceAllocRow[]; onRowsChange: (rows: AdvanceAllocRow[]) => void;
}) {
  const [advances, setAdvances] = useState<StaffAdvanceSummaryRow[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    staffAdvanceSummary(token, clientId, null)
      .then((read) => {
        if (cancelled) return;
        setAvailable(read.available);
        setAdvances(read.available ? read.advances.filter((a) => !a.voided && (a.outstanding_cents ?? 0) > 0) : []);
      })
      .catch(() => { if (!cancelled) { setAvailable(false); setAdvances([]); } });
    return () => { cancelled = true; };
  }, [token, clientId]);

  const setRow = (i: number, patch: Partial<AdvanceAllocRow>) =>
    onRowsChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => onRowsChange([...rows, { line_no: 1, advance_id: "", amount_cents: 0 }]);
  const removeRow = (i: number) => onRowsChange(rows.filter((_, idx) => idx !== i));

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        If a line above credits a staff-advance account, add an allocation for its FULL amount here — an
        uncovered or partial credit on an enrolled advance code refuses (CLR40 <code>advance_application_missing</code>,
        design SS3.3's coverage-equality belt) — this section is how that refusal is avoided, not merely explained.
      </p>
      {available === false ? (
        <p className={styles.errorText}>
          The staff-advance register could not be read — showing no advances to pick from rather than an empty
          list that would read as &ldquo;nothing outstanding&rdquo;.
        </p>
      ) : null}
      <div className={styles.actions}>
        <select className={styles.select} value={kind} onChange={(e) => onKindChange(e.target.value as StaffAdvanceApplicationKind)} aria-label="Advance application kind">
          <option value="bank_return">bank return</option>
          <option value="payroll_deduction">payroll deduction</option>
          <option value="claim">claim offset</option>
        </select>
        <input className={styles.input} placeholder="Reason" value={reason} onChange={(e) => onReasonChange(e.target.value)} aria-label="Advance application reason" style={{ flex: 1 }} />
      </div>
      {rows.map((r, i) => (
        <div className={styles.actions} key={i}>
          <select className={styles.select} value={r.line_no} onChange={(e) => setRow(i, { line_no: Number(e.target.value) })} aria-label={`Advance allocation ${i + 1} line`}>
            {lines.map((l, li) => <option key={li} value={li + 1}>{`line ${li + 1} — ${l.account_code || "…"}`}</option>)}
          </select>
          <select className={styles.select} value={r.advance_id} onChange={(e) => setRow(i, { advance_id: e.target.value })} aria-label={`Advance allocation ${i + 1} advance`}>
            <option value="">Select an advance…</option>
            {advances.map((a) => <option key={a.advance_id} value={a.advance_id}>{`${a.person_label} · ${a.account_code} · outstanding ${fmtCents(a.outstanding_cents)}`}</option>)}
          </select>
          <input
            type="number" className={`${styles.input} ${styles.amountInput}`} placeholder="0.00"
            value={r.amount_cents ? r.amount_cents / 100 : ""}
            onChange={(e) => setRow(i, { amount_cents: parseCentsInput(e.target.value) })}
            aria-label={`Advance allocation ${i + 1} amount`}
          />
          <button className={styles.buttonSecondary} onClick={() => removeRow(i)}>Remove</button>
        </div>
      ))}
      <div className={styles.actions}>
        <button className={styles.buttonSecondary} onClick={addRow}>+ Add allocation</button>
      </div>
    </div>
  );
}
