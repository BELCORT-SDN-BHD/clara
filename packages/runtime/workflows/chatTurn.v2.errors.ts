// @frozen
//
// FROZEN — the runtime CLR -> typed-refusal map for chatTurn_v2 (contract §12 /
// pins §2; the per-LAYER error map: DB SQLSTATE/constraint -> CLR -> runtime tool
// result -> card behaviour). This module maps a caught DB error to a `refusal`
// typed part that is ORACLE-SAFE: identical shape regardless of a document's
// existence, count, or tenant (the no-cross-firm-oracle law, CLR11 pattern). No SQL
// text is ever exposed. Lives INSIDE the frozen closure so a change to the mapping
// is a workflow-version change.

import type { RefusalPart } from "./chatTurn.v2.prompt.js";

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
  CLR23: "The supplier could not be resolved as proposed.",
  CLR24: "That coding task cannot make this transition.",
  CLR25: "A newer machine-corroborated total contradicts this draft's evidence; re-draft against the current facts.",
};

const CLR21_REASON_MESSAGES: Record<Clr21Reason, string> = {
  amount_conflict: "The proposed total does not match the machine-corroborated invoice total.",
  currency_unsupported: "This ledger only supports MYR; a non-MYR bill cannot be coded here.",
  vendor_malformed: "The supplier details on the draft are malformed.",
  evidence_invalid: "The cited evidence does not match the document's extraction.",
  double_coded: "One bill per turn — this turn already drafted a bill. Start a new turn to code the next document.",
  duplicate_bill: "This exact bill (same supplier and invoice number) already has an approved entry for this client.",
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
export function runtimeRefusal(code: string, reason: Clr21Reason | undefined, message: string): RefusalPart {
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
