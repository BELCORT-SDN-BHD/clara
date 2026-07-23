// @frozen
//
// FROZEN — the runtime CLR -> typed-refusal map for autoDraft_v3 (contract §10 / pins §6).
// autoDraft has its OWN errors module (the frozen chatTurn errors module CANNOT gain
// entries, and a versioned workflow must not couple to another version's file). Maps a
// caught DB error to an ORACLE-SAFE `refusal` — identical shape regardless of a document's
// existence, count, or tenant — never leaking SQL text. Lives inside the frozen closure so
// a mapping change is a workflow-version change.

import type { RefusalPart } from "./autoDraft.v3.prompt.js";

/** A DB error as node-postgres surfaces it. `code` is the 5-char SQLSTATE (our CLRxx codes
 *  are 5 chars); `detail` may carry a machine-readable `{ "reason": <token> }`. */
export type DbError = { code?: string; detail?: string; message?: string; constraint?: string };

/** CLR21 reason tokens carried in the DETAIL payload (pins §2/§6). */
export type Clr21Reason =
  | "amount_conflict"
  | "currency_unsupported"
  | "vendor_malformed"
  | "evidence_invalid"
  | "double_coded"
  | "duplicate_bill"
  | "coding_incomplete";

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
 *  Record) so dot access is non-optional; use messageFor() for a dynamic code lookup. */
const MESSAGES = {
  CLR01: "This document is not resolved to the client with enough confidence to code it.",
  CLR02: "This document has no active, verified filing for the client, so it cannot be coded yet.",
  CLR03: "The sweep does not hold an authorised context for this client.",
  CLR10: "The request is missing or malformed information required to draft this entry.",
  CLR11: "That document is not available in this context.",
  CLR21: "This bill cannot be coded as proposed.",
  CLR23: "The supplier could not be resolved as proposed.",
  CLR26: "An open question blocks this bill — resolve it first.",
  CLR28: "Document processing is paused for this client — consent required.",
  CLR29: "This bill is already being coded.",
};

/** Dynamic (arbitrary-code) message lookup — the object above is concrete so dot access is
 *  non-optional, but a runtime CLR code needs an index-signature view. */
function messageFor(code: string): string | undefined {
  return (MESSAGES as Record<string, string | undefined>)[code];
}

const CLR21_REASON_MESSAGES: Record<Clr21Reason, string> = {
  amount_conflict: "The proposed total does not match the machine-corroborated invoice total.",
  currency_unsupported: "This ledger only supports MYR; a non-MYR bill cannot be coded here.",
  vendor_malformed: "The supplier details on the draft are malformed.",
  evidence_invalid: "The cited evidence does not match the document's extraction.",
  double_coded: "This bill is already being coded in another draft this window.",
  duplicate_bill: "This exact bill (same supplier and invoice number) already has an approved entry.",
  coding_incomplete: "The sweep could not complete this bill into a review draft.",
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
  return { type: "refusal", code: "internal", message: "This bill could not be coded automatically." };
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

/** An oracle-safe string a READ tool returns as its `{ error }` result on an authority/tenant
 *  error — the model sees a clean refusal, not raw SQL, count-independent. */
export function readToolRefusalMessage(err: DbError): string {
  const code = String(err?.code ?? "");
  if (code === "CLR03" || code === "42501") return MESSAGES.CLR03;
  if (code === "CLR10") return MESSAGES.CLR10;
  if (code === "CLR11") return MESSAGES.CLR11;
  return "That could not be read in this context.";
}
