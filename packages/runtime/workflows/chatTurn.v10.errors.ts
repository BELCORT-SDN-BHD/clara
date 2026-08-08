// @frozen
//
// FROZEN — part of the chatTurn_v10 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v9 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `chatTurn:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts — INCLUDING a separate attempt on the CHAT lane, which is why this
// family bumps too and not only autoDraft. The DB evidence wall
// (clara._write_entry_evidence) correctly refused CLR21 evidence_invalid every time; a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v10 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (errors) — v10 vs v9, ONE addition and zero edits: the new factory
// `evidenceIdxUnresolvedRefusal(citedIdx, valid)`, plus the small `RegionIdxHint` type it
// takes. Every existing mapping is byte-carried: the CLR code table, the ten CLR21 reason
// messages, the 23505/23503/23514 native collapse, the structural 42501 -> CLR03 mapping,
// readToolRefusalMessage, isAuthorityOrOracleError, and the sessionUnbound /
// codingIncomplete factories.
//
// The new factory reuses the EXISTING `evidence_invalid` token on purpose — see its own
// doc comment for why a new token would have been the wrong call.

import type { RefusalPart } from "./chatTurn.v10.prompt.js";

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


/** A DB error as node-postgres surfaces it: `code` is the 5-char SQLSTATE (our
 *  custom CLRxx codes are 5 chars), `detail` may carry a machine-readable reason. */
export type DbError = { code?: string; detail?: string; message?: string; constraint?: string };

/** CLR21 reason tokens (pins §2). `amount_conflict` is resolvable via the
 *  amount-exception flow; the rest are terminal refusals. `session_unbound` is
 *  RUNTIME-labelled only (never a DB raise). */
export type Clr21Reason =
  | "amount_conflict"
  | "currency_unsupported"
  | "vendor_malformed"
  | "evidence_invalid"
  | "double_coded"
  | "duplicate_bill"
  | "duplicate_sales"
  | "direction_unresolved"
  | "session_unbound"
  | "coding_incomplete";

/** Parse the CLR21 `{ "reason": <token> }` DETAIL payload without leaking raw text. */
function reasonFromDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  try {
    const parsed = JSON.parse(detail) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return undefined;
  }
}

/** Human-facing, oracle-safe message per CLR code — never the raw SQL/DETAIL. A
 *  concrete object (not a Record) so dot access is non-optional; use messageFor()
 *  for a dynamic code lookup. */
const MESSAGES = {
  CLR01: "This document is not resolved to the client with enough confidence to code it. File it to the client first.",
  CLR02: "This document has no active, verified filing for the client, so it cannot be coded yet.",
  CLR03: "This action needs an active bookkeeper (or higher) session for the firm.",
  CLR05: "This entry is high-stakes and needs a different person to approve it than the one who prepared it.",
  CLR06: "The draft changed since it was read. Re-open the review card and try again.",
  CLR07: "The proposed lines do not balance within the allowed rounding.",
  CLR10: "The request is missing or malformed information required to draft this entry.",
  CLR11: "That document is not available in this context.",
  CLR12: "The books changed while drafting; please retry.",
  CLR21: "This bill cannot be coded as proposed.",
  CLR22: "This draft can no longer be edited or withdrawn (it is not a draft).",
  CLR23: "The counterparty could not be resolved as proposed.",
  CLR24: "That coding task cannot make this transition.",
  CLR25: "A newer machine-corroborated total contradicts this draft's evidence; re-draft against the current facts.",
  CLR30: "The document's direction (sales vs purchase) could not be resolved from its facts.",
};

const CLR21_REASON_MESSAGES: Record<Clr21Reason, string> = {
  amount_conflict: "The proposed total does not match the machine-corroborated invoice total.",
  currency_unsupported: "This ledger only supports MYR; a non-MYR bill cannot be coded here.",
  vendor_malformed: "The counterparty details on the draft are malformed.",
  evidence_invalid: "The cited evidence does not match the document's extraction.",
  double_coded: "One document per turn — this turn already drafted an entry. Start a new turn to code the next document.",
  duplicate_bill: "This exact bill (same supplier and invoice number) already has an approved entry for this client.",
  duplicate_sales: "This exact sales document (same customer and invoice number, or same date and total) already has an approved entry for this client.",
  direction_unresolved: "The document's direction (sales vs purchase) could not be resolved from its facts.",
  session_unbound: "Coding needs a chat session bound to a specific client.",
  coding_incomplete: "The coding could not be completed into a review card this turn.",
};

/** Dynamic (arbitrary-code) message lookup — the object above is concrete so dot
 *  access is non-optional, but a runtime CLR code needs an index-signature view. */
function messageFor(code: string): string | undefined {
  return (MESSAGES as Record<string, string | undefined>)[code];
}

/**
 * Map a caught DB error to a typed, oracle-safe `refusal` part. Unknown/other
 * codes collapse to a generic refusal that never leaks SQL text.
 */
export function refusalFromDbError(err: DbError): RefusalPart {
  const code = String(err?.code ?? "");
  if (code === "CLR21") {
    const reason = reasonFromDetail(err.detail);
    const message =
      (reason && CLR21_REASON_MESSAGES[reason as Clr21Reason]) ?? MESSAGES.CLR21;
    return { type: "refusal", code: "CLR21", reason, message };
  }
  // Native constraints that may leak past the DB's own re-raise (belt): map them
  // to their business code per pins §2. The constraint name disambiguates uniques.
  if (code === "23505") {
    const c = String(err.constraint ?? "").toLowerCase();
    if (c.includes("counterpart")) return { type: "refusal", code: "CLR23", message: MESSAGES.CLR23 };
    return { type: "refusal", code: "CLR21", reason: "double_coded", message: CLR21_REASON_MESSAGES.double_coded };
  }
  if (code === "23503" || code === "23514") {
    // FK / check breach -> not-found collapse (no tenant oracle).
    return { type: "refusal", code: "CLR11", message: MESSAGES.CLR11 };
  }
  const known = code ? messageFor(code) : undefined;
  if (known) {
    return { type: "refusal", code, message: known };
  }
  // The structural 42501 (an agent role attempting a human-only writer) stays
  // DISTINCT from a business refusal but is still surfaced oracle-safe.
  if (code === "42501") {
    return { type: "refusal", code: "CLR03", message: MESSAGES.CLR03 };
  }
  return { type: "refusal", code: "internal", message: "This could not be completed. Please try again or ask a colleague." };
}

/** A purely runtime-labelled refusal (never a DB raise) — e.g. the write tool
 *  invoked without a client-bound session, or a caught read-tool authority error. */
export function runtimeRefusal(code: string, reason: Clr21Reason | EvidenceSystemReason | undefined, message: string): RefusalPart {
  return { type: "refusal", code, reason, message };
}

/** The session-unbound refusal for the write tool (runtime-labelled CLR21). */
export function sessionUnboundRefusal(): RefusalPart {
  return runtimeRefusal("CLR21", "session_unbound", CLR21_REASON_MESSAGES.session_unbound);
}

/** The terminal-invariant refusal (C-19): a coding-intent turn that reached the
 *  segment cap without a card, clarify, or refusal never settles silently. */
export function codingIncompleteRefusal(): RefusalPart {
  return runtimeRefusal("CLR21", "coding_incomplete", CLR21_REASON_MESSAGES.coding_incomplete);
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

/** An oracle-safe string a READ tool returns as its `{ error }` result on an
 *  authority/tenant error (CLR03/CLR10/CLR11) — the model sees a clean refusal, not
 *  a raw SQL error, and the string is identical regardless of document existence. */
export function readToolRefusalMessage(err: DbError): string {
  const code = String(err?.code ?? "");
  if (code === "CLR03" || code === "42501") return MESSAGES.CLR03;
  if (code === "CLR10") return MESSAGES.CLR10;
  if (code === "CLR11") return MESSAGES.CLR11;
  return "That could not be read in this context.";
}

/** True iff a caught read-tool error is an authority/tenant refusal (vs a transient
 *  fault) — the ones that must return ONE oracle-safe refusal, count-independent. */
export function isAuthorityOrOracleError(err: DbError): boolean {
  const code = String(err?.code ?? "");
  return code === "CLR03" || code === "CLR10" || code === "CLR11" || code === "42501";
}
