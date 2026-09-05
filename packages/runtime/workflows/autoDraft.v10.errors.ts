// @frozen
//
// FROZEN — part of the autoDraft_v10 closure (H-17, the beta-walk defect: the unattended coder
// refused itself on a sales invoice and asked a question no answer could satisfy). A NEW frozen
// closure beside the byte-untouched autoDraft_v1..v9 (ARCHITECTURE Appendix A: a behavioural
// change ships as a new _vN export, never an in-place edit — the registry repoints `autoDraft:`
// here). See autoDraft.v10.tools.ts for the one statement of what v10 changes.
//
// THIS FILE (errors) IS THE ONLY FILE IN THE v10 CLOSURE WHOSE BEHAVIOUR MOVES, and exactly one
// function moves inside it: `refusalFromDbError`'s native-23505 arm. Everything else here is
// BYTE-CARRIED from v9 (the CLR code table, all eleven CLR21 reason messages, the CLR10
// sst_account_missing branch, the 23503/23514 collapse, the structural 42501 -> CLR03 mapping,
// readToolRefusalMessage, the noFilingRefusal/noDraftRefusal/directionFamilyMismatchRefusal
// factories, evidenceIdxUnresolvedRefusal's EvidenceFailure machinery, and the whole POST-lane
// Tier B/C/D vocabulary below). The v10 sibling modules — tools / toolset / impl / the entry —
// are version-renames whose ONLY diff is which errors module they import; .prompt, .post,
// .settle, .infra, .usage and .postcall are REUSED from v9 unmodified, because none of them
// calls `refusalFromDbError` and copying an unchanged frozen body would mint a second hash of
// the same bytes for no behaviour.
//
// WHAT MOVED, IN ONE LINE: v9's 23505 arm tested the constraint name by SUBSTRING, so three
// different identity walls reached the bookkeeper as one untokened CLR23 question, and every
// unrecognised unique was recorded as a SUCCESS-shaped `double_coded` no-op. v10 replaces it
// with an exact, closed constraint-name map that falls through to `internal` on an unknown name.
// The map, the four proven index names, the reason vocabulary and the full argument for each
// arm live in autoDraft.v10.uniques.ts — read that file's header, not a second copy here.
//
// THE POST lane's closed refusal vocabulary (design Annex E.2) is carried unchanged from v9, in
// three named sets that never mix:
//
//   TIER B  — thirteen admission rungs, three-valued (pass / fail / not_evaluable). The receipt
//             carries the FULL vector; posting requires an empty failing set. The DB owns the
//             evaluation; this file owns only the human-readable message per token.
//   TIER C  — the delegated walls, converted by (errcode, reason) PAIRS in the DB and surfaced
//             here as a typed refusal. No wildcards, no errcode-only members.
//   TIER D  — the genuinely deferred belts. A Tier-D abort settles the task `failed` with the
//             commit error's (errcode, reason) captured verbatim in `last_refusal`; it is NEVER
//             an admission verdict and never carries a rung vector.
//
// THE CONSUMER CONTRACT IS A DESIGN LAW (design §3.2, D26), and it is enforced HERE as well as
// in the DB: no consumer may test a rung for `'fail'`. Every consumer tests for `'pass'` and
// treats everything else — `fail`, `not_evaluable`, an unknown future value, or a MISSING key —
// as non-admitting, because testing for `fail` lets a rung added later silently admit.

// The prompt module is REUSED from v9 unchanged (v10 alters no toolface, no schema and no system
// text), so this import deliberately names v9's file rather than minting a byte-identical copy.
import type { RefusalPart } from "./autoDraft.v9.prompt.js";
import {
  COUNTERPARTY_RETRY_CODE,
  COUNTERPARTY_RETRY_MESSAGES,
  CLR23_REASON_MESSAGES,
  nativeUniqueArm,
  unnamedUniqueRefusal,
} from "./autoDraft.v10.uniques.js";

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
    // v10 (H-17). Native uniques that may leak past a DB re-raise (belt): the constraint
    // disambiguates — EXACTLY, by name, never by substring. Postgres reports the INDEX name here
    // for a unique-index violation; the four names are measured on a rig rather than spelled
    // (this file's header, and packages/db/tests/counterparty-alias-kind.test.mjs).
    //
    // The lookup is trimmed and lower-cased because that is what v9 did and identifiers reach
    // here folded already; it is NOT a normalisation that could make two different indexes
    // collide, since these four names are distinct under case folding.
    //
    // AN UNKNOWN NAME FALLS THROUGH TO `internal`, WITH ITS OWN REASON TOKEN. It is deliberately
    // not CLR23 (that would invent a counterparty story for a wall nobody identified, and open a
    // human question with it) and deliberately not CLR21 double_coded (that would record a FALSE
    // success — see the header). `unnamed_unique` is the same discipline `tierDCapture` applies
    // to an unrecognised belt: absence recorded as absence, which is what makes it findable.
    const arm = nativeUniqueArm(err.constraint);
    if (arm?.kind === "retry") {
      return runtimeRefusal(COUNTERPARTY_RETRY_CODE, arm.reason, COUNTERPARTY_RETRY_MESSAGES[arm.reason]);
    }
    if (arm?.kind === "clr23") {
      return { type: "refusal", code: "CLR23", reason: arm.reason, message: CLR23_REASON_MESSAGES[arm.reason] };
    }
    if (arm?.kind === "clr21") {
      return { type: "refusal", code: "CLR21", reason: arm.reason, message: CLR21_REASON_MESSAGES[arm.reason] };
    }
    return unnamedUniqueRefusal();
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
 *  See v7's own copy of this comment (autoDraft.v7.errors.ts) for the accepted residual (a
 *  transient the model does NOT recover from in-run still parks a filing at attempt_count=2,
 *  with no unpark path) — byte-carried reasoning, not restated a second time here. */
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

// ===========================================================================================
// F-A2 — THE POST LANE'S CLOSED REFUSAL VOCABULARY (design Annex E.2). NEW in v9.
// ===========================================================================================

/** THE THIRTEEN TIER-B RUNGS, in the DB's own roster order (`_agent_post_entry_core`'s
 *  `v_rungs`). B12/B13 were CUT at the PR-0 gate on correctness grounds (GM-3) — their numbers
 *  are RETIRED, not reused, and the gap between B11 and B14 is deliberate. This array is the
 *  runtime's closed world: a rung the DB reports that is NOT in it is an unknown, which the
 *  consumer contract treats as non-admitting rather than ignoring. */
export const TIER_B_RUNGS = [
  "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B14", "B15",
] as const;
export type TierBRung = (typeof TIER_B_RUNGS)[number];

/** Every Tier-B token the DB can put on a receipt, with the message a human reads. The B15 row
 *  has TWO tokens because the C6-rider splits an UNTESTABLE stated identity from a genuinely
 *  directional document: "this document is directional" and "this document states an identity
 *  nobody could check" are different findings and are fixed differently. */
export const TIER_B_REASON_MESSAGES: Record<string, string> = {
  settlement_kind_human: "Which open bill a payment or receipt settles is a judgement a person makes — this kind is never posted unattended.",
  not_corroborated: "The document's amounts are not machine-corroborated, so this entry cannot be posted unattended.",
  anchor_unbound: "The entry is not bound to a corroborated amount on the document.",
  anchor_untied: "The entry's amounts do not tie to the corroborated document total.",
  amount_conflict: "The draft carries an amount exception with no override, so the figures disagree.",
  human_override_present: "A person has overridden a number on this draft; a person posts it.",
  unverified_evidence: "The amount-bearing citation is not verified evidence.",
  facts_moved: "A citation names a superseded extraction — the document's facts moved after the draft was written.",
  open_question_blocks: "An open question blocks this document — resolve it first.",
  supplier_leg_shape: "The supplier-bill leg shape does not satisfy the ledger's floor.",
  sales_leg_shape: "The sales leg shape does not satisfy the ledger's floor.",
  generic_control_leg: "A generic journal entry may not carry a receivable or payable control leg.",
  generic_on_directional_document: "This document has a direction (sales or purchase), so it may not be coded as a generic journal entry.",
  generic_registration_untestable: "This document states a party registration that could not be checked against the client's own identifiers.",
};

/** Tier C — the DELEGATED walls the DB converts on (errcode, reason) PAIRS. This runtime table
 *  mirrors that closed set exactly; it may only GROW, in step with the DB's own, and an
 *  unlisted pair never reaches here at all (the DB re-raises it and the task settles `failed`). */
export const TIER_C_REASON_MESSAGES: Record<string, string> = {
  currency_unsupported: "This ledger only supports MYR; a non-MYR document cannot be posted here.",
  corroboration_contradicted: "The corroborated amount contradicts the entry — the money wall refused this post.",
  counterparty_landscape_moved: "The counterparty landscape moved while this post was running.",
  registration_conflict: "The proposed counterparty's registration conflicts with an existing record.",
  counterparty_birth_race: "Another writer created this counterparty at the same moment.",
  customer_identity_name_only: "This client's customers are recorded by NAME ONLY; a registration or tax number may not be attached.",
  duplicate_bill: "This exact bill (same counterparty and invoice number) already has an approved entry.",
  duplicate_sales: "This exact sales document already has an approved entry.",
  write_into_closed_period: "The posting date falls in a closed period.",
};

/** TIER D — the six genuinely deferred belt tokens (design E.2, GM-3). They arrive as a COMMIT
 *  abort, which no exception block can convert, so they are never an admission verdict: the task
 *  settles `failed` and the (errcode, reason) is recorded VERBATIM in `last_refusal`. Kept as a
 *  named closed set so an UNNAMED Tier-D reason is visibly a finding rather than a shrug.
 *  `advance_movement_unregistered` stays SPLIT BY AXIS at the record (M-5): the mirror case
 *  carries its own `axis` in the DB detail and is reported separately, because a record that
 *  cannot tell a bad reversal from an unregistered disbursement names a symptom, not a wall. */
export const TIER_D_BELT_REASONS = [
  "fa_belt_unregistered_movement",
  "fa_cost_adjustment_deferred",
  "fa_k_gl_balance_on_enrolled",
  "advance_mirror_unregistered",
  "advance_movement_unregistered",
  "advance_application_missing",
] as const;
export type TierDBeltReason = (typeof TIER_D_BELT_REASONS)[number];

/** The `last_refusal` payload a Tier-D abort records. `belt` is TRUE only for a reason this
 *  runtime can NAME from the closed set above — an unrecognised reason is recorded with
 *  `belt:false` and its raw (errcode, reason) intact, so the row says "unnamed", which is what
 *  makes it findable, rather than being silently dropped or mislabelled as a known belt. */
export type TierDCapture = {
  tier: "D";
  clr: string;
  reason: string | null;
  belt: boolean;
  axis?: string;
  message: string;
};

/** Capture a COMMIT-time abort as Tier-D `last_refusal`. Reads the DB error's own detail; it
 *  never invents a reason, and a detail it cannot parse yields `reason: null` (absence recorded
 *  as absence, law 68) rather than a guessed token. */
export function tierDCapture(err: DbError): TierDCapture {
  const clr = String(err?.code ?? "unknown");
  const detail = parseDetail(err.detail);
  const reason = typeof detail?.reason === "string" ? detail.reason : null;
  const axis = typeof detail?.axis === "string" ? detail.axis : undefined;
  const belt = reason != null && (TIER_D_BELT_REASONS as readonly string[]).includes(reason);
  return {
    tier: "D",
    clr,
    reason,
    belt,
    ...(axis ? { axis } : {}),
    message: belt
      ? "A deferred ledger belt refused this post at commit."
      : "This post aborted at commit on a wall this lane does not name.",
  };
}

/** Parse a DB `detail` payload into an object without leaking raw text. Returns undefined for
 *  anything that is not a JSON object — never a partially-trusted string. */
function parseDetail(detail: string | undefined): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  try {
    const parsed = JSON.parse(detail) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** THE CONSUMER CONTRACT, AS CODE (design §3.2, D26). A rung ADMITS only when its value is the
 *  exact string `'pass'`. `fail`, `not_evaluable`, an unknown future value, a JSON null and a
 *  MISSING key are all non-admitting. Written as a positive test on purpose: the inverse
 *  (`!== 'fail'`) is the defect this law exists to forbid, because a rung added later would
 *  arrive absent and read as admitted. */
export function rungAdmits(vector: Record<string, unknown> | null | undefined, rung: string): boolean {
  return !!vector && vector[rung] === "pass";
}

/** The rungs that did NOT admit, walked over the CLOSED roster rather than over the vector's own
 *  keys — the producer walks the same roster (the DB's `v_rungs`), so the two cannot disagree
 *  about what was evaluated, and a rung the DB omitted entirely is reported, not skipped. */
export function nonAdmittingRungs(vector: Record<string, unknown> | null | undefined): TierBRung[] {
  return TIER_B_RUNGS.filter((r) => !rungAdmits(vector, r));
}

/** A post admits only when EVERY rung on the closed roster admits. An absent vector never
 *  admits: a read that cannot say NO has a meaningless YES. */
export function vectorAdmits(vector: Record<string, unknown> | null | undefined): boolean {
  return nonAdmittingRungs(vector).length === 0;
}

/** Turn a Tier-B refusal token into a typed refusal part. An unrecognised token keeps the token
 *  in `reason` and falls back to a generic message rather than being renamed to something known
 *  — the operator must be able to see that the runtime did not recognise it. */
export function tierBRefusal(reason: string | undefined, rung: string | undefined): RefusalPart {
  const message = (reason && TIER_B_REASON_MESSAGES[reason]) ?? "This entry did not pass the unattended posting gates.";
  return { type: "refusal", code: "CLR-POST-B", reason: reason ?? (rung ? `rung_${rung}` : undefined), message };
}

/** Turn a Tier-C conversion into a typed refusal part. Same rule: an unrecognised pair keeps its
 *  own reason string and gets the generic message. */
export function tierCRefusal(clr: string | undefined, reason: string | undefined): RefusalPart {
  const message = (reason && TIER_C_REASON_MESSAGES[reason]) ?? "A ledger wall refused this post.";
  return { type: "refusal", code: String(clr ?? "CLR-POST-C"), reason, message };
}

/** The runtime's own refusal when the post verb returned a shape this closure does not
 *  recognise. FAIL-CLOSED and LOUD: an unreadable receipt is never treated as a post. */
export function unreadablePostReceiptRefusal(): RefusalPart {
  return runtimeRefusal(
    "internal",
    "post_receipt_unreadable",
    "The posting verb returned a receipt this runtime does not recognise; nothing was recorded as posted.",
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
