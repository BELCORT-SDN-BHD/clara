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

/** The (idx, field_path) pairs a resolution refusal echoes back so the model can re-cite —
 *  the shape evidenceIdxUnresolvedRefusal below takes. DECLARED HERE rather than beside the
 *  resolver that builds it because the dependency only runs one way inside this closure:
 *  tools.ts imports from errors.ts, never the reverse. */
export type RegionIdxHint = { idx: number; field_path: string | null };


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

/** F9 (ADR-064 §3): the EARLY, runtime-labelled refusal for a cited `region_idx` that names
 *  no region of this document's current extraction. It carries the EXISTING
 *  `evidence_invalid` token DELIBERATELY — the meaning is unchanged ("the cited evidence does
 *  not match the document's extraction"), so every downstream consumer behaves exactly as it
 *  does when the DB wall itself raises it: isQuestionShaped still opens a scoped
 *  open-question, the dashboard's CLR21 copy still reads "re-cite before approving", and the
 *  settle record keeps the same discriminant. Introducing a new token would have forked all
 *  of that for a case that IS the same case, caught one layer earlier.
 *
 *  What is new is the HINT appended after the standard message: which idx values actually
 *  exist, each with its field_path, so the model can re-cite rather than guess again. The
 *  hint is derived entirely from the extraction of the document this task is ALREADY bound
 *  to, names no other tenant's data, and carries no monetary value — so it adds no oracle to
 *  a message the model has already been handed the source of via read_document. */
export function evidenceIdxUnresolvedRefusal(citedIdx: readonly number[], valid: readonly RegionIdxHint[]): RefusalPart {
  const cited = citedIdx.join(", ");
  const list =
    valid.length === 0
      ? "none"
      : valid.map((v) => (v.field_path ? `${v.idx} (${v.field_path})` : String(v.idx))).join(", ");
  return runtimeRefusal(
    "CLR21",
    "evidence_invalid",
    `${CLR21_REASON_MESSAGES.evidence_invalid} No region of this document has region_idx ${cited}. Valid region_idx values: ${list}.`,
  );
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
