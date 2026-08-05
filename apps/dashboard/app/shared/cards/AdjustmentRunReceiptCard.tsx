"use client";

// The `adjustment_run_receipt` card (Wave D-b, design `wave-d-b-design.md`
// §2.5/§2.7/§2.8). Identifier-only (run_id + client_id); hydrates
// get_adjustment_run on mount. The receipt row itself is READ-ONLY and always
// terminal — a run is minted ONLY after the (possible) auto-reversal mirror
// and is fully immutable (design §2.5) — mirroring DepreciationRunReceiptCard's
// receipt idiom: no optimistic UI, no client-side sum.
//
// ═══ [round-7 F-F1 fix] THE CORRECTION LANE — WIRED, NOT NAMED ═══
// This card used to tell the user "a correction rides reverse_adjustment_pair/
// reverse_entry" with no button that called either — `reverse_adjustment_pair`
// had NO non-test referent anywhere in the dashboard, and on a PAIRED run,
// plain `reverse_entry` refuses CLR39 `adjustment_pair_locked` (measured,
// x42.c6) — so the named remedy was a walled corridor.
//
// The design does not say WHERE this affordance lives (§2.8 lists only the
// panel's propose/sign/retire/due surface); the smallest faithful placement is
// HERE, on the run receipt the correction ACTS ON — the "identifier-only card
// law" this card already claims: the affordance rides the run row the card
// already hydrates, never a new screen. `run.reversal_entry_id` is the DB's
// own, cheap signal for which door applies (design §2.4: the mirror is
// approved in the SAME statement as the occurrence, so a receipt for a paired
// run always carries it by the time it exists):
//   · reversal_entry_id present  → `reverse_adjustment_pair` is the ONLY door
//     (plain reverse_entry on either half refuses `adjustment_pair_locked`).
//   · reversal_entry_id absent   → this run is SOLO (a non-auto-reverse
//     template); `reverse_adjustment_pair` refuses it by name
//     (`not_an_auto_pair`, x42.c5) and its correction is a plain reversal on
//     the entry itself — a door THIS DASHBOARD DOES NOT BUILD ANYWHERE (grep-
//     verified: no `reverse_entry` wire client exists in the app at all). The
//     old copy's "…/reverse_entry" half was therefore ALWAYS a phantom, not
//     only on a pair-half — this fix does not invent that door (out of scope:
//     a general JE-reversal surface is a separate, larger feature) and says so
//     plainly instead of repeating the promise.
// A high-stakes correction PARKS both halves pending a second approval
// (design §2.4) — the card offers `approve_pair_reversal`/`cancel_pair_reversal`
// inline on the parked state, so a park has a completer on the surface that shows
// it (never a second dead door). A CANCELLED pair leaves the occurrence
// correctable again (x42.c3), so `correctionPhase` returns to the offer state
// rather than stranding the row on a dead "pending" badge.
//
// ═══ [round-11 W2 finding 2] "…a park this card can also finish" WAS MEASURED FALSE ═══
// The sentence above used to read "the card carries that pair's own receipt forward in
// LOCAL STATE", and the two buttons acted on that local receipt. The checker is by DB law
// a DIFFERENT human (CLR05 `distinct_checker`), so a different browser session, so the
// local receipt was always null for the only role permitted to finish the park: both
// buttons rendered, fired no RPC, and reported nothing. The acts now take the pair id from
// the same authority the phase does — see `correctionActPairId`.
//
// ═══ [round-8 F4 fix] `reversal_entry_id` NAMES the door; it does NOT prove the
// door is OPEN ═══
// `reversal_entry_id` above still correctly tells SOLO from PAIRED (a solo
// template's run never carries one, and that fact never changes once the run is
// minted) — but it says nothing about whether THIS paired run already has a
// correction in flight or done. Before this fix, `paired = !!run.reversal_
// entry_id` was the ONLY input to `correctionPhase`, so the card offered "Correct
// this run" on a run that was already corrected (a completed pair) or already
// parked (a pending one) — the button existed, but the DB's OWN authority
// (`_wdb_reversal_blocked` / the pair machine) would refuse it. `correctionPhase`
// now takes the run's own `correctable`/`active_pair_id`/`active_pair_status`
// triplet (M1-intersection-gate.md §Finding-4, lane M1) — the SAME authority that
// would refuse, read off the row instead of re-derived from a proxy — and only
// falls back to the button when the DB itself says this occurrence is
// correctable RIGHT NOW.

import { useCallback, useState } from "react";
import type { AdjustmentRunReceiptPart } from "../parts";
import { getAdjustmentRun, reverseAdjustmentPair, approvePairReversal, cancelPairReversal } from "../adjustmentApi";
import type { GetAdjustmentRunRead, PairReversalResult } from "../adjustmentApi";
import type { AdjustmentRunRow } from "../../rules/adjustmentModel";
import { useCard, type Clr } from "./cardHooks";
import { fmtCents, shortId } from "../fmt";
import styles from "./cards.module.css";

/** The card's own DISCRIMINATED state for the correction lane — PURE and
 *  exported so every branch (including the off-path ones: a cancelled pair, a
 *  solo run) can be asserted directly, never only through a click no test
 *  harness here can simulate (no jsdom in this repo's test runner). */
export type CorrectionPhase =
  | { kind: "none" }
  /** [round-9 F3] The DB names a verb this dashboard does not wire
   *  (clara.reverse_entry, the solo-occurrence door). The run IS correctable —
   *  saying otherwise would be a second lie — but this app has no door for it, so
   *  it says exactly that instead of offering the pair button. */
  | { kind: "no_door"; verb: string }
  | { kind: "offer" }
  | { kind: "reason_form" }
  /** [round-10 F4] `pairId` is `null` exactly when this phase was re-keyed off
   *  `correction_wall` rather than off a real `active_pair_id`/`PairReversalResult`
   *  — the door has no pair id left to report for a completed pair (see the
   *  branch's own comment above). Render must not assume a pair id exists. */
  | { kind: "completed"; pairId: string | null }
  | { kind: "pending"; pairId: string }
  | { kind: "cancelled"; pairId: string }
  /** [round-11 W2 finding 5] A door the DB CLOSED, named. MEASURED: for the walls
   *  advance_movement_unregistered, pair_half_not_approved, pair_half_already_reversed,
   *  allocated_items_present, live_bank_match_present and fa_reversal_blocked the phase was
   *  `none` and the wall token appeared nowhere in the markup — every one of them rendered
   *  as a healthy run minus a button, under a static line still telling the reader the
   *  correction "rides reverse_adjustment_pair", a verb measured to refuse CLR40 in exactly
   *  that state. `advice` is the wall-owning body's own sentence (`correction_wall_advice`),
   *  null on the branches that carry none — which the render says rather than printing an
   *  empty remedy. */
  | { kind: "walled"; wall: string; advice: string | null };

/** [round-11 W2 finding 2] The pair id an ACT on this card must use.
 *
 *  THE DEFECT: `submitApprove`/`submitCancel` both opened `if (!token || !pairResult) return;`
 *  and `pairResult` is set ONLY by this session's own submit*. The checker is BY DB LAW a
 *  different human (CLR05 `distinct_checker`, measured: the maker who created the pair is
 *  refused, a second human succeeds), therefore a different browser session, therefore
 *  `pairResult` is null for every human permitted to press the button — and both buttons
 *  rendered, fired NO RPC, and showed NO error. There is no other completer: plain
 *  `approve_entry` on a correction draft refuses CLR39 `pair_draft_locked` naming
 *  `approve_pair_reversal`, this card is the sole call site of both pair verbs, and there is
 *  no review-queue door. The park the whole pair machine exists to create could not be
 *  finished or cancelled through the product at all.
 *
 *  THE SHAPE: the act reads the id off the same authority the PHASE came from. Because
 *  `correctionPhase` already prefers a fresh `pairResult` over the run snapshot, one
 *  expression covers both cases — `run.active_pair_id` (the DB's own key) on a reload, and
 *  this session's own receipt when it has one. ROOT: a card that derives its STATE from the
 *  DB but its ACTIONS from local memory can always render an affordance it cannot execute. */
export function correctionActPairId(phase: CorrectionPhase): string | null {
  return phase.kind === "pending" ? phase.pairId : null;
}

/** [round-8 F4] The slice of the run row `correctionPhase` needs — the DB's OWN
 *  correctable/active_pair_* triplet (M1-intersection-gate.md §Finding-4), NOT
 *  `reversal_entry_id` (which only ever proved "was ever auto-paired", never
 *  "has no outstanding correction now"). [round-10 F4] `correction_wall` and
 *  `reversal_entry_id` re-join the slice below — see the completed-via-wall
 *  branch's own comment for why. */
export type RunCorrectionState = Pick<AdjustmentRunRow, "correctable" | "active_pair_id" | "active_pair_status" | "correction_verb" | "correction_wall" | "correction_wall_advice" | "reversal_entry_id">;

export function correctionPhase(run: RunCorrectionState | null, reasonOpen: boolean, pairResult: PairReversalResult | null): CorrectionPhase {
  // A FRESH local action result is the newest fact this card has — the run row
  // itself is never re-fetched after a correction (design §2.5: immutable
  // receipt), so a just-completed action always wins over the `run` snapshot
  // hydrated at load time.
  if (pairResult) {
    if (pairResult.status === "completed") return { kind: "completed", pairId: pairResult.pair_id };
    if (pairResult.status === "cancelled") return { kind: "cancelled", pairId: pairResult.pair_id };
    // "pending" and any other DB-reported status default to the actionable
    // parked state — fail toward "still needs a human", never toward silence.
    return { kind: "pending", pairId: pairResult.pair_id };
  }
  // No local action yet — the DB's OWN triplet is authoritative. An ACTIVE pair
  // (pending or completed) takes precedence over `correctable`: the two can never
  // both be true at once (an active pair is exactly what makes a run NOT
  // correctable right now), but reading active_pair_id first makes that
  // precedence explicit rather than assumed.
  if (run?.active_pair_id) {
    return run.active_pair_status === "completed"
      ? { kind: "completed", pairId: run.active_pair_id }
      : { kind: "pending", pairId: run.active_pair_id };
  }
  // [round-10 F4] `active_pair_id` reads NULL for a pair that reached 'completed' —
  // clara._adj_correction_door's own pair lookup is scoped to the SCHEMA's "active"
  // predicate (uq_adjustment_pair_reversals_occurrence_active: status in ('pending',
  // 'approving')), so a FINISHED pair drops out of that query exactly like an absent
  // one and the branch above can never see it (MEASURED, r10-Z2-report.json finding
  // 4: both stake levels read {active_pair_id:null, active_pair_status:null} once
  // the pair completes). `correction_wall` still tells the truth without
  // re-deriving anything: 'entry_already_reversed' fires the instant `reversed_by`
  // is stamped, and for a PAIRED occurrence that stamp is written ONLY by
  // clara._pair_reverse_core — a bare clara.reverse_entry on either half is refused
  // CLR39 by name first (0042 s2:3311/3317), so there is no OTHER way a paired
  // occurrence's `reversed_by` gets set. `reversal_entry_id` is this run's own
  // immutable mint-time fact (this card's ORIGINAL solo-vs-paired signal, above) —
  // not a new proxy, the SAME one this file has trusted since round 7 — so wall +
  // reversal_entry_id TOGETHER identify "the pair that owned this occurrence
  // finished" without re-reading the pair machine's internal state. No pair id is
  // knowable here (the door genuinely has none left to report), so this degrades to
  // an UNIDENTIFIED completion rather than inventing one — the render below must
  // handle a null pairId. [Reported, not built here: the DB could instead widen
  // _adj_correction_door's pair lookup to report the most recent pair regardless of
  // status, which would populate a real pairId and make this branch dead weight if
  // adopted — see the O2 report's cross-section patch. The two are compatible by
  // construction: the active_pair_id branch above is checked FIRST and always wins
  // when the DB carries a real id.]
  if (run?.correction_wall === "entry_already_reversed" && run.reversal_entry_id) {
    return { kind: "completed", pairId: null };
  }
  // [round-11 W2 finding 5] A run that is NOT correctable and whose door NAMED a wall is not
  // the same fact as a run with no correction door at all, and it used to render
  // byte-identically to one. The completed branch above is checked FIRST and keeps winning,
  // so a finished correction still reads as completed and never as walled (cell x42.r10o2.f4a).
  // `none` now means exactly what it says: the row carries no door and no reason either —
  // e.g. an envelope minted before the correction keys existed.
  if (!run?.correctable) {
    return run?.correction_wall
      ? { kind: "walled", wall: run.correction_wall, advice: run.correction_wall_advice }
      : { kind: "none" };
  }
  // [round-9 F3] WHICH verb, asked of the DB, never inferred. The only door this
  // card wires is the PAIR verb; any other answer (today: 'clara.reverse_entry'
  // for a solo occurrence) must render as 'correctable, but not from here'.
  if (run.correction_verb !== "clara.reverse_adjustment_pair") {
    return { kind: "no_door", verb: run.correction_verb ?? "(none reported)" };
  }
  return reasonOpen ? { kind: "reason_form" } : { kind: "offer" };
}

export function AdjustmentRunReceiptCard({ token, part }: { token: string | null; part: AdjustmentRunReceiptPart }) {
  const loader = useCallback((t: string): Promise<GetAdjustmentRunRead> => getAdjustmentRun(t, part.run_id), [part.run_id]);
  const { data, loading, busy, err, clr, act } = useCard(token, loader);
  const run = data?.run ?? null;

  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [attestation, setAttestation] = useState("");
  // The pair's OWN receipt (pair_id/status/correction ids) — a fact this
  // card's own act just learned, not something get_adjustment_run re-reads
  // (the run row it hydrates never changes on a correction; immutable by
  // design).
  const [pairResult, setPairResult] = useState<PairReversalResult | null>(null);

  const phase = correctionPhase(run, reasonOpen, pairResult);
  // [round-11 W2 finding 2] The ACT's pair id comes from the PHASE — never from
  // `pairResult`, which the checker (a distinct human, therefore a distinct session) can
  // never have. See correctionActPairId's own comment for the measurement.
  const actPairId = correctionActPairId(phase);

  const submitCorrection = () =>
    act(async () => {
      if (!token || !run?.entry_id) return;
      setPairResult(await reverseAdjustmentPair(token, part.client_id, run.entry_id, reason.trim()));
    }, () => { setReasonOpen(false); setReason(""); });

  const submitApprove = () =>
    act(async () => {
      if (!token || !actPairId) return;
      setPairResult(await approvePairReversal(token, part.client_id, actPairId, attestation.trim() || null));
    }, () => setAttestation(""));

  const submitCancel = () =>
    act(async () => {
      if (!token || !actPairId) return;
      setPairResult(await cancelPairReversal(token, part.client_id, actPairId, cancelReason.trim()));
    }, () => setCancelReason(""));

  if (!token) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}><span className={styles.cardTitle}>Adjustment run</span><span className={styles.idChip}>{shortId(part.run_id)}</span></div>
        <p className={styles.muted}>Paste a session JWT to load this run.</p>
      </div>
    );
  }

  return (
    <AdjustmentRunReceiptView
      part={part} run={run} loading={loading} busy={busy} clr={clr} err={err} phase={phase}
      reason={reason} onReasonChange={setReason}
      attestation={attestation} onAttestationChange={setAttestation}
      cancelReason={cancelReason} onCancelReasonChange={setCancelReason}
      onOpenReason={() => setReasonOpen(true)}
      onAbandonReason={() => { setReasonOpen(false); setReason(""); }}
      onSubmitCorrection={() => void submitCorrection()}
      onSubmitApprove={() => void submitApprove()}
      onSubmitCancel={() => void submitCancel()}
    />
  );
}

/** The card's rendered body, PURE and exported (the StaffAdvanceCardView
 *  precedent) so every `CorrectionPhase` — including the off-path ones this
 *  round's fix must prove, not only the corridor it built — renders and can
 *  be asserted without a click. */
export function AdjustmentRunReceiptView({
  part, run, loading, busy, clr, err, phase,
  reason, onReasonChange, attestation, onAttestationChange, cancelReason, onCancelReasonChange,
  onOpenReason, onAbandonReason, onSubmitCorrection, onSubmitApprove, onSubmitCancel,
}: {
  part: AdjustmentRunReceiptPart;
  run: GetAdjustmentRunRead["run"];
  loading: boolean; busy: boolean; clr: Clr; err: string | null;
  phase: CorrectionPhase;
  reason: string; onReasonChange: (v: string) => void;
  attestation: string; onAttestationChange: (v: string) => void;
  cancelReason: string; onCancelReasonChange: (v: string) => void;
  onOpenReason: () => void; onAbandonReason: () => void;
  onSubmitCorrection: () => void; onSubmitApprove: () => void; onSubmitCancel: () => void;
}) {
  return (
    <div className={`${styles.card} ${styles.terminal}`}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Adjustment run</span>
        <span className={styles.idChip}>{shortId(part.run_id)}</span>
        {run ? <span className={`${styles.badge} ${run.mode === "post" ? styles.badgeNew : styles.badgeAuto}`}>{run.mode}</span> : null}
      </div>

      {loading && !run ? <p className={styles.loadingState}>Loading run receipt…</p> : null}

      {run ? (
        <>
          <p className={styles.muted}>
            {part.label ?? ""}{part.label ? " · " : ""}{run.period_start ?? "—"} → {run.period_end ?? "—"}
            {run.created_at ? ` · ${new Date(run.created_at).toLocaleString()}` : ""}
          </p>
          <div className={styles.countGrid}>
            <div className={styles.countTile}><div className={styles.countNum}>{fmtCents(run.amount_cents)}</div><div className={styles.countLabel}>amount</div></div>
            <div className={styles.countTile}><div className={styles.countNum}>{run.reversal_entry_id ? "yes" : "no"}</div><div className={styles.countLabel}>auto-reversed</div></div>
          </div>
          {/* [round-11 W2 finding 5] The PAIRED half of this line is a claim about an act —
              "a correction rides reverse_adjustment_pair" — and in the walled, parked and
              completed states that verb is MEASURED to refuse (CLR40 on an unregistered
              advance mirror; pair_already_active on a park; entry_already_reversed once the
              pair finishes). It now prints only where the card actually offers that door.
              The SOLO half is a mint-time fact about the run rather than an offer, and it
              already names its own refusal, so it keeps printing in every state. */}
          <p className={styles.hint}>
            Every figure above is the DB&apos;s (design §2.5) — this is an audit receipt, never editable.{" "}
            {run.reversal_entry_id
              ? (phase.kind === "walled" || phase.kind === "pending" || phase.kind === "completed" ? null
                : <>A correction on this PAIRED run rides <code>reverse_adjustment_pair</code> only — its plain reversal refuses
                    (<code>adjustment_pair_locked</code>).</>)
              : <>This run has NO auto-reversal pair (a solo, non-auto-reverse template) — <code>reverse_adjustment_pair</code> refuses
                  it by name (<code>not_an_auto_pair</code>), and this dashboard does not yet offer a plain-entry reversal door anywhere.</>}
          </p>

          {phase.kind === "offer" ? (
            <div className={styles.actions}>
              <button className={styles.buttonSecondary} disabled={busy} onClick={onOpenReason}>
                Correct this run (bookkeeper+)
              </button>
            </div>
          ) : null}

          {/* [round-10 F5] `no_door` used to render byte-identically to `none` — the DB
              names a verb (round-9 F3) but the render never put it on a pixel, so an
              operator reading this card could not tell "no correction is possible"
              apart from "a correction door exists but this app hasn't wired it".
              Named here, distinctly, so the two states read as different facts. */}
          {phase.kind === "no_door" ? (
            <p className={styles.hint}>
              Correctable via <code>{phase.verb}</code> — not wired here.
            </p>
          ) : null}

          {/* [round-11 W2 finding 5] A CLOSED door, named. Before this branch every wall
              rendered as a healthy run minus a button: the token reached no pixel, and the
              wall-owning body's own remedy sentence — round 10's whole point — had no
              consumer on this path at all. */}
          {phase.kind === "walled" ? (
            <div className={styles.section}>
              <p className={styles.hint}>
                This run cannot be corrected right now — the correction door closed with <code>{phase.wall}</code>.
              </p>
              {phase.advice
                ? <p className={styles.muted}>{phase.advice}</p>
                : <p className={styles.muted}>
                    That door carried no remedy sentence of its own, so the token above is the whole answer it gave.
                  </p>}
            </div>
          ) : null}

          {phase.kind === "reason_form" ? (
            <div className={styles.section}>
              <input
                className={styles.reasonInput} aria-label="Correction reason" placeholder="Reason for the correction"
                value={reason} onChange={(e) => onReasonChange(e.target.value)}
              />
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy || !reason.trim()} onClick={onSubmitCorrection}>
                  {busy ? "Reversing…" : "Confirm — reverse this pair"}
                </button>
                <button className={styles.buttonSecondary} disabled={busy} onClick={onAbandonReason}>Cancel</button>
              </div>
            </div>
          ) : null}

          {phase.kind === "completed" ? (
            // [round-10 F4] `pairId` is null when this phase came off `correction_wall`
            // rather than a real pair id (see correctionPhase's own comment) — say so
            // honestly rather than rendering a fabricated identifier.
            <p className={styles.okText}>
              Correction completed{phase.pairId ? <> — pair {shortId(phase.pairId)}</> : null}.
            </p>
          ) : null}

          {phase.kind === "cancelled" ? (
            <>
              <p className={styles.muted}>Correction pair {shortId(phase.pairId)} was cancelled — this run can be corrected again.</p>
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} disabled={busy} onClick={onOpenReason}>
                  Correct this run (bookkeeper+)
                </button>
              </div>
            </>
          ) : null}

          {phase.kind === "pending" ? (
            // High-stakes: both correction drafts parked pending a SECOND,
            // distinct approval (design §2.4) — carried forward rather than
            // left a park with no completer.
            <div className={styles.section}>
              <p className={styles.hint}>
                High-stakes: pair {shortId(phase.pairId)} is parked — both correction drafts wait for a SECOND bookkeeper+ to
                approve or cancel.
              </p>
              <input
                className={styles.reasonInput} aria-label="Approval attestation (optional)" placeholder="Attestation (optional)"
                value={attestation} onChange={(e) => onAttestationChange(e.target.value)}
              />
              <div className={styles.actions}>
                <button className={styles.button} disabled={busy} onClick={onSubmitApprove}>
                  {busy ? "Working…" : "Approve — complete the correction"}
                </button>
              </div>
              <input
                className={styles.reasonInput} aria-label="Cancel reason" placeholder="Reason to cancel the correction"
                value={cancelReason} onChange={(e) => onCancelReasonChange(e.target.value)}
              />
              <div className={styles.actions}>
                <button className={styles.buttonSecondary} disabled={busy || !cancelReason.trim()} onClick={onSubmitCancel}>
                  {busy ? "Working…" : "Cancel the correction"}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {clr ? <p className={styles.refusalNote}><span className={styles.refusalBadge}>{clr.code}{clr.reason ? ` · ${clr.reason}` : ""}</span></p> : null}
      {err ? <p className={styles.errorText}>{err}</p> : null}
    </div>
  );
}
