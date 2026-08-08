// @frozen
//
// FROZEN — part of the autoDraft_v7 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// autoDraft_v1..v6 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `autoDraft:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts, and the DB evidence wall (clara._write_entry_evidence) correctly
// refused CLR21 evidence_invalid every time — its id-equality contract is right, and a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v7 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (errors) — v7 vs v6, ONE addition and zero edits: the new factory
// `evidenceIdxUnresolvedRefusal(citedIdx, valid)`, plus the small `RegionIdxHint` type it
// takes. Every existing mapping is byte-carried: the CLR code table, all eleven CLR21
// reason messages, the CLR10 sst_account_missing branch, the 23505/23503/23514 native
// collapse, the structural 42501 -> CLR03 mapping, readToolRefusalMessage, and the
// noFilingRefusal / noDraftRefusal / directionFamilyMismatchRefusal factories.
//
// The new factory reuses the EXISTING `evidence_invalid` token on purpose — see its own
// doc comment for why a new token would have been the wrong call.

import type { RefusalPart } from "./autoDraft.v7.prompt.js";

/** The (idx, field_path) pairs a resolution refusal echoes back so the model can re-cite,
 *  and the two shapes a failed resolution can take. DECLARED HERE rather than beside the
 *  resolver that builds them because the dependency only runs one way inside this closure:
 *  tools.ts imports from errors.ts, never the reverse.
 *
 *  THE TWO FAILURE KINDS ARE NOT THE SAME KIND OF FACT, and collapsing them is the defect
 *  the F9 fix round exists to remove (Codex #3, native Finding 1):
 *    * `system`      — the run cannot lawfully resolve an index AT ALL: it never read the
 *                      document, the extraction moved under it, the extraction publishes no
 *                      ordinal, or the ordinal is self-contradictory. Nobody's evidence is
 *                      wrong; the WORLD moved or the deployment is mid-window. Retryable.
 *    * `mislabelled` — inside a snapshot the model demonstrably read, it claimed a
 *                      field_path the cited region does not carry. That IS a bad citation,
 *                      and it keeps the existing `evidence_invalid` discriminant. */
export type RegionIdxHint = { idx: number; field_path: string | null };
export type MislabelledCitation = { idx: number; cited: string; actual: string | null };
export type EvidenceFailure =
  | { kind: "system"; reason: EvidenceSystemReason; citedIdx: number[]; valid: RegionIdxHint[] }
  | { kind: "mislabelled"; entries: MislabelledCitation[] };


/** A DB error as node-postgres surfaces it. `code` is the 5-char SQLSTATE (our CLRxx codes
 *  are 5 chars); `detail` may carry a machine-readable `{ "reason": <token> }`. */
export type DbError = { code?: string; detail?: string; message?: string; constraint?: string };

/** CLR21 reason tokens carried in the DETAIL payload (0036/0016/0046 pins). */
export type Clr21Reason =
  | "amount_conflict"
  | "currency_unsupported"
  | "vendor_malformed"
  | "evidence_invalid"
  | "double_coded"
  | "duplicate_bill"
  | "coding_incomplete"
  | "tax_leg_missing"
  | "type_polarity_mismatch"
  | "counterparty_kind_contradiction"
  | "direction_family_mismatch";

/** CLR10 reason tokens (§7-A adds the first one — the SST-output-account precondition
 *  for a tax-bearing sales document). */
export type Clr10Reason = "sst_account_missing";

/** Parse the `{ "reason": <token> }` DETAIL payload without leaking raw text. */
function reasonFromDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return undefined;
  }
}

/** Oracle-safe message per CLR code — never the raw SQL/DETAIL. A concrete object (not a
 *  Record) so dot access is non-optional; use messageFor() for a dynamic code lookup.
 *  Direction-neutral: this sweep drafts both purchase and sales documents. */
const MESSAGES = {
  CLR01: "This document is not resolved to the client with enough confidence to code it.",
  CLR02: "This document has no active, verified filing for the client, so it cannot be coded yet.",
  CLR03: "The sweep does not hold an authorised context for this client.",
  CLR10: "The request is missing or malformed information required to draft this entry.",
  CLR11: "That document is not available in this context.",
  CLR21: "This document cannot be coded as proposed.",
  CLR23: "The counterparty could not be resolved as proposed.",
  CLR26: "An open question blocks this document — resolve it first.",
  CLR28: "Document processing is paused for this client — consent required.",
  CLR29: "This document is already being coded.",
};

/** Dynamic (arbitrary-code) message lookup — the object above is concrete so dot access is
 *  non-optional, but a runtime CLR code needs an index-signature view. */
function messageFor(code: string): string | undefined {
  return (MESSAGES as Record<string, string | undefined>)[code];
}

const CLR21_REASON_MESSAGES: Record<Clr21Reason, string> = {
  amount_conflict: "The proposed total does not match the machine-corroborated invoice total.",
  currency_unsupported: "This ledger only supports MYR; a non-MYR document cannot be coded here.",
  vendor_malformed: "The counterparty details on the draft are malformed.",
  evidence_invalid: "The cited evidence does not match the document's extraction.",
  double_coded: "This document is already being coded in another draft this window.",
  duplicate_bill: "This exact document (same counterparty and invoice number) already has an approved entry.",
  coding_incomplete: "The sweep could not complete this document into a review draft.",
  tax_leg_missing: "A stated nonzero tax on this document requires one tied SST-portion-of-cost debit leg.",
  type_polarity_mismatch: "This document's own stated type does not match the coding kind proposed.",
  counterparty_kind_contradiction: "The proposed counterparty does not match the coding kind — a supplier bill names a vendor, a sales entry names a customer.",
  direction_family_mismatch: "The proposed coding kind does not match this document's admitted direction (sales vs purchase).",
};

const CLR10_REASON_MESSAGES: Record<Clr10Reason, string> = {
  sst_account_missing: "This client's chart of accounts has no active SST output account for a tax-bearing sales document.",
};

/**
 * Map a caught DB error to a typed, oracle-safe `refusal`. `double_coded` (whether raised as
 * CLR21 detail or surfaced as the CLR29 no-op) is preserved as the reason so the workflow can
 * map it to a success-shaped settle (WA-L8). Unknown codes collapse to a generic refusal.
 */
export function refusalFromDbError(err: DbError): RefusalPart {
  const code = String(err?.code ?? "");
  if (code === "CLR21") {
    const reason = reasonFromDetail(err.detail);
    const message = (reason && CLR21_REASON_MESSAGES[reason as Clr21Reason]) ?? MESSAGES.CLR21;
    return { type: "refusal", code: "CLR21", reason, message };
  }
  if (code === "CLR10") {
    // §7-A: sst_account_missing rides CLR10 (positive-tax only), not CLR21 — the sales-side
    // mirror of the purchase precondition. Other CLR10 raises stay the generic message.
    const reason = reasonFromDetail(err.detail);
    const message = (reason && CLR10_REASON_MESSAGES[reason as Clr10Reason]) ?? MESSAGES.CLR10;
    return { type: "refusal", code: "CLR10", reason, message };
  }
  if (code === "CLR29") {
    // The one-draft-per-filing no-op surfaces here as a success-shaped double_coded reason.
    const reason = reasonFromDetail(err.detail) ?? "double_coded";
    return { type: "refusal", code: "CLR29", reason, message: MESSAGES.CLR29 };
  }
  if (code === "23505") {
    // Native uniques that may leak past a DB re-raise (belt): the constraint disambiguates.
    const c = String(err.constraint ?? "").toLowerCase();
    if (c.includes("counterpart") || c.includes("alias")) return { type: "refusal", code: "CLR23", message: MESSAGES.CLR23 };
    return { type: "refusal", code: "CLR21", reason: "double_coded", message: CLR21_REASON_MESSAGES.double_coded };
  }
  if (code === "23503" || code === "23514") {
    // FK / check breach -> not-found collapse (no tenant oracle).
    return { type: "refusal", code: "CLR11", message: MESSAGES.CLR11 };
  }
  const known = code ? messageFor(code) : undefined;
  if (known) return { type: "refusal", code, message: known };
  // The structural 42501 (an agent role attempting a human-only writer) stays oracle-safe.
  if (code === "42501") return { type: "refusal", code: "CLR03", message: MESSAGES.CLR03 };
  return { type: "refusal", code: "internal", message: "This document could not be coded automatically." };
}

/** A purely runtime-labelled refusal (never a DB raise). */
export function runtimeRefusal(code: string, reason: string | undefined, message: string): RefusalPart {
  return { type: "refusal", code, reason, message };
}

/** The no-active-filing refusal (the resolver found the document but no lawful filing). */
export function noFilingRefusal(): RefusalPart {
  return runtimeRefusal("CLR02", undefined, MESSAGES.CLR02);
}

/** The terminal "produced no draft" refusal (the model explained a block but did not draft). */
export function noDraftRefusal(): RefusalPart {
  return runtimeRefusal("CLR21", "coding_incomplete", CLR21_REASON_MESSAGES.coding_incomplete);
}

/** PR #204 / 7A-R2: an EARLY, runtime-labelled refusal — the wrapper's own check that the
 *  model's proposed coding_kind falls inside the admission-bound direction family, BEFORE
 *  any DB call. Shares the exact CLR21 reason token the DB draft writer raises for the same
 *  contradiction (`direction_family_mismatch`), so the bookkeeper sees an identical message
 *  whichever layer actually caught it. */
export function directionFamilyMismatchRefusal(): RefusalPart {
  return runtimeRefusal("CLR21", "direction_family_mismatch", CLR21_REASON_MESSAGES.direction_family_mismatch);
}

/** F9 FIX ROUND (coordinator ruling 2, from Codex #3 + native Finding 1). The conditions
 *  under which a cited region INDEX cannot be lawfully resolved are SYSTEM conditions, not
 *  bad evidence:
 *
 *    evidence_not_read           the run holds no read_document snapshot FOR THIS DOCUMENT
 *                                (native Finding 2: reading document A never licenses
 *                                citing document B).
 *    evidence_snapshot_changed   the extraction set moved between the model's read and this
 *                                draft, so the same idx no longer names the same region.
 *    evidence_index_unavailable  the extraction publishes no citable ordinal at all — the
 *                                pre-0054 database in a runtime-ahead-of-migration window.
 *    evidence_index_unknown      a cited idx is not in the snapshot the model read.
 *    evidence_index_ambiguous    the snapshot lists one idx twice, so an index cannot name
 *                                one region (Codex #4 / native Finding 3: first-wins would
 *                                hand array order the authority the idx design removes).
 *
 *  NONE of them may map to `evidence_invalid`, and NONE may be question-shaped. A durable
 *  human question reading "the extraction moved" or "the database is not migrated yet" is
 *  noise a bookkeeper cannot act on, and recording an evidence-blame receipt for a snapshot
 *  race is a FALSE receipt. Each is RETRYABLE IN-RUN: the tool result tells the model exactly
 *  what to do (read again, then re-cite) and the model loop still holds its step budget.
 *
 *  WHAT "RETRYABLE" DOES **NOT** MEAN — the accepted residual, stated in full because the
 *  first cut of this comment let a reader infer more than is true (Codex re-verify HIGH,
 *  CONFIRMED by end-to-end execution on a real database). A transient that the model does
 *  NOT recover from IN-RUN still reaches `settle("failed", ...)` in autoDraft.v7.ts, and the
 *  DB counts that like any other failure: settle_autodraft_task increments attempt_count and
 *  sets `state='parked'` at the cap of two (0036_wave_c0_deferred_belts.sql:962-973), after
 *  which admit_autodraft_task refuses every future admission with `refused_attempts`
 *  (0036:1188). Codex drove exactly that: two transient-coded failed settles ->
 *  attempt_count=2, state=parked, open_questions=0; applying 0054 then made the same extract
 *  resolve, and admission STILL answered refused_attempts.
 *
 *  SO "AUTOMATIC RECOVERY ONCE THE MIGRATION LANDS" IS FALSE FOR A PARKED FILING, and the
 *  earlier wording that implied it is withdrawn. MEASURED on the live catalog: exactly four
 *  functions write `autodraft_attempts.state` (counting BOTH write forms — an UPDATE and an
 *  `insert ... on conflict do update`), and NOT ONE can move a row off 'parked'. THREE of
 *  them are excluded by a PREDICATE:
 *    settle_autodraft_task (both overloads), cancelled/expired arm: `where task_id=p_task
 *      and state='active'` (0036:900-901);
 *    settle_autodraft_task, success arm: `attempt_count=0,state='idle'` (0036:977) — needs a
 *      live task, and a parked filing admits none;
 *    reconcile_sweep_runs: `where aa.state='active'` (0011_daily_loop.sql:2734-2736).
 *  THE FOURTH IS NOT, AND THAT DISTINCTION IS THE FRAGILE PART. admit_autodraft_task's own
 *  registry UPSERT sets `state='active'` with NO state predicate at all; what keeps it off a
 *  parked row is CONTROL FLOW — both parked branches return before execution reaches it
 *  (measured on the live catalog: parked #1 at prosrc offset 1414, the post-lock parked
 *  re-check at 4520, the supersede arm at 5586, the upsert at 23620). A predicate survives a
 *  reorder; control flow does not, so a future recut that moved the upsert or dropped an
 *  early return would break this SILENTLY. That is why the ordering is pinned as a cell
 *  (packages/db/tests/x54-transient-attempt-residual.test.mjs) rather than trusted here.
 *  No dashboard or human verb touches it either (the dashboard's own "parked" strings are the
 *  bank-reconciliation declaration, a different concept). THERE IS NO UNPARK PATH: NONE
 *  EXISTS — registered for PROJECTLOG PART 2, not silently absorbed here.
 *
 *  WHY THE RESIDUAL IS STILL ACCEPTED, AS A DECISION: (a) with the reducer fix
 *  (autoDraft.v7.prompt.ts) a transient that the model recovers from in-run never settles at
 *  all, which is the designed path for every one of these; (b) the deploy order is BINDING
 *  (migration before image), so the one condition that could hit every document at once —
 *  evidence_index_unavailable — should never open; (c) parking closes the UNATTENDED lane for
 *  that filing only: the chat and hand doors do not consult this registry, so the document
 *  stays codable by a human (the same route ADR-064 records all nine H1 redrafts taking).
 *  Widening the DB's own attempt accounting to distinguish a system condition from a real
 *  failure is a REGISTERED follow-up, deliberately out of this PR's scope.
 *
 *  THE CODE IS DELIBERATELY NOT A CLR. No DB gate raised this, and reusing a CLR reason token
 *  is precisely the misclassification being fixed. "transient" sits beside the existing
 *  runtime-labelled "internal" code. isQuestionShaped() keys on CLR23 plus a CLOSED set of
 *  CLR21 reasons, so none of these can open a durable question — asserted directly in the
 *  battery rather than left to inspection. */
export type EvidenceSystemReason =
  | "evidence_not_read"
  | "evidence_snapshot_changed"
  | "evidence_index_unavailable"
  | "evidence_index_unknown"
  | "evidence_index_ambiguous";

export const EVIDENCE_SYSTEM_CODE = "transient";

const EVIDENCE_SYSTEM_MESSAGES: Record<EvidenceSystemReason, string> = {
  evidence_not_read:
    "Read this document with read_document in this run before citing evidence — a region index only means something against the list that call prints.",
  evidence_snapshot_changed:
    "This document's stored extraction changed after you read it, so the region indexes have been renumbered. Call read_document again and re-cite from the new list.",
  evidence_index_unavailable: "This document's stored extraction does not publish region indexes, so no region can be cited yet.",
  evidence_index_unknown: "One of the cited region indexes is not in the list read_document printed for this document.",
  evidence_index_ambiguous: "This document's stored extraction lists the same region index more than once, so an index cannot name one region.",
};

/** The (idx, field_path) hint appended to an unknown-index refusal. Derived entirely from the
 *  extraction of the document this run has ALREADY been shown, so it adds no oracle; it names
 *  no monetary value. Deliberately NOT attached to `evidence_snapshot_changed`: after a
 *  renumber the model must RE-READ, and handing it a list it did not read would let a hint
 *  stand in for the read the gate exists to require. */
export function validIdxHint(valid: readonly RegionIdxHint[]): string {
  if (valid.length === 0) return "This document has no citable region index.";
  return `Valid region_idx values: ${valid.map((v) => (v.field_path ? `${v.idx} (${v.field_path})` : String(v.idx))).join(", ")}.`;
}

export function evidenceSystemRefusal(reason: EvidenceSystemReason, hint?: string): RefusalPart {
  const base = EVIDENCE_SYSTEM_MESSAGES[reason];
  return runtimeRefusal(EVIDENCE_SYSTEM_CODE, reason, hint ? `${base} ${hint}` : base);
}

/** Map a failed resolution to its refusal. The ONE place the two failure kinds are given
 *  their different names, so no call site can accidentally blame evidence for a system
 *  condition. */
export function refusalForEvidenceFailure(failure: EvidenceFailure): RefusalPart {
  if (failure.kind === "mislabelled") {
    const detail = failure.entries
      .map((m) => `region_idx ${m.idx} is ${m.actual === null ? "unlabelled" : `"${m.actual}"`}, not "${m.cited}"`)
      .join("; ");
    return runtimeRefusal("CLR21", "evidence_invalid", `${CLR21_REASON_MESSAGES.evidence_invalid} ${detail}.`);
  }
  return evidenceSystemRefusal(failure.reason, failure.reason === "evidence_index_unknown" ? validIdxHint(failure.valid) : undefined);
}

/** An oracle-safe string a READ tool returns as its `{ error }` result on an authority/tenant
 *  error — the model sees a clean refusal, not raw SQL, count-independent. */
export function readToolRefusalMessage(err: DbError): string {
  const code = String(err?.code ?? "");
  if (code === "CLR03" || code === "42501") return MESSAGES.CLR03;
  if (code === "CLR10") return MESSAGES.CLR10;
  if (code === "CLR11") return MESSAGES.CLR11;
  return "That could not be read in this context.";
}
