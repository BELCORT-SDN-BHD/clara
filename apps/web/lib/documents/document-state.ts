// #624 — THE FOUR INDEPENDENT DOCUMENT STATES, as the wire shape of
// `clara.get_document_state` plus the pure derivations the panel renders.
//
// WHY THIS MODULE EXISTS AT ALL. Before it, the workbench had exactly one signal —
// `documents.extraction_status` — and that scalar describes the LAST processing task to settle.
// A payroll PDF whose OCR finished read "extraction: done", and there was nothing anywhere in
// the read that could say the facts router had already terminated the pair with `skipped_kind`
// and would never derive anything from it. The registry and this module exist so the surface can
// say four separate true things instead of one true-sounding one.
//
// EVERY LEVEL AND EVERY VERDICT BELOW COMES FROM THE SERVER. This module contains NO policy: it
// narrows the RPC's jsonb into types and folds already-server-computed values into the small
// number of render decisions the panel needs (which single word to show, which tone to use).
// A capability level is never inferred from a filename, a mime, or an extension here — that
// inference is exactly the defect C-37 names, and the whole point of the DB registry is that the
// answer lives in one place.

/** The capability levels shared by THREE of the four axes — custody, byte extraction, typed
 *  facts. A closed set, mirroring those three columns' CHECKs on `clara.document_capabilities`
 *  (0191), which 0246 did not touch. */
export type CapabilityLevel = "supported" | "stored_only" | "unsupported" | "planned";

export const CAPABILITY_LEVELS: readonly CapabilityLevel[] = [
  "supported", "stored_only", "unsupported", "planned",
] as const;

export function isCapabilityLevel(value: unknown): value is CapabilityLevel {
  return typeof value === "string" && (CAPABILITY_LEVELS as readonly string[]).includes(value);
}

/** BUSINESS OPERATION has its own, WIDER set (#988): the four above plus `proposal_only` —
 *  "Clara reads the pair deterministically and derives a real proposal, but never carries it into
 *  a posted operation on its own authority; a person confirms first".
 *
 *  WHY IT IS A SECOND TYPE AND NOT ONE WIDENED SHARED TYPE. The asymmetry is the DATABASE's, not
 *  this module's, and it is checkable: `document_capabilities_business_operation_check` admits
 *  five values since 0246, while `..._custody_check`, `..._byte_extraction_check` and
 *  `..._typed_facts_check` each still read the original four — measured on the estate, and the
 *  sibling db battery pins it with its own BUSINESS_OPERATION_LEVELS constant rather than
 *  widening LEVELS. A single widened union would make `isCapabilityLevel` admit, for custody, a
 *  value custody's own CHECK refuses; a guard that admits what the database refuses has stopped
 *  mirroring it. */
export type BusinessOperationLevel = CapabilityLevel | "proposal_only";

export const BUSINESS_OPERATION_LEVELS: readonly BusinessOperationLevel[] = [
  ...CAPABILITY_LEVELS, "proposal_only",
] as const;

export function isBusinessOperationLevel(value: unknown): value is BusinessOperationLevel {
  return typeof value === "string" && (BUSINESS_OPERATION_LEVELS as readonly string[]).includes(value);
}

/** `clara._document_capability(format, kind)`'s jsonb. `known_pair`/`kind_known` are the two
 *  honest-unknown flags: an unadmitted format claims nothing, and a not-yet-classified document
 *  publishes its real custody and byte extraction while promising no facts level. */
export type DocumentCapability = {
  format: string | null;
  document_kind: string | null;
  mime_type: string | null;
  custody: CapabilityLevel;
  byte_extraction: CapabilityLevel;
  typed_facts: CapabilityLevel;
  business_operation: BusinessOperationLevel;
  engine_id: string | null;
  engine_byte: string | null;
  registry_version: number | null;
  basis: string;
  limits: Record<string, string>;
  known_pair: boolean;
  kind_known: boolean;
};

export type DocumentStateTask = {
  id: string;
  lane: string;
  status: "queued" | "held_egress" | "running" | "done" | "failed" | (string & {});
  engine_id: string | null;
  version_n: number | null;
  attempt_count: number | null;
  error_code: string | null;
  finished_at: string | null;
};

export type DocumentStateExtraction = {
  id: string;
  engine_kind: string;
  engine_id: string | null;
  version_n: number | null;
  status: string;
  superseded_by: string | null;
  extracted_at: string | null;
  region_count: number;
};

/** One named arithmetic check, as recorded by `clara.document_fact_validations`.
 *  `unmeasured` is deliberately NOT `pass`: it means the terms the check needs were never
 *  persisted, so no verdict exists. Rendering it as a success is the placeholder this ticket
 *  exists to remove. */
export type DocumentFactValidation = {
  check_name: string;
  outcome: "pass" | "fail" | "not_applicable" | "unmeasured" | (string & {});
  detail: Record<string, unknown>;
  extraction_id: string | null;
  statement_id: string | null;
  engine_id: string | null;
  evaluated_at: string;
};

export type DocumentStateResult = {
  document_id: string;
  document_kind: string | null;
  mime_type: string | null;
  format: string | null;
  capability: DocumentCapability;
  custody: {
    state: "stored" | "verified" | (string & {});
    sha256: string;
    byte_size: number | null;
    bytes_verified_at: string | null;
    legal_hold: boolean;
    legal_hold_reason: string | null;
    retention_state: string;
    retain_until: string | null;
    capability: CapabilityLevel;
  };
  byte_extraction: {
    status: string;
    page_count: number | null;
    capability: CapabilityLevel;
    engine_id: string | null;
    tasks: DocumentStateTask[];
  };
  facts: {
    capability: CapabilityLevel;
    limits: Record<string, string>;
    extractions: DocumentStateExtraction[];
    validations: DocumentFactValidation[];
  };
  operation: {
    capability: BusinessOperationLevel;
    codeable_kind: boolean;
    entries: { entry_id: string; status: string }[];
    statements: {
      statement_id: string; status: string; period_start: string | null;
      period_end: string | null; line_count: number | null;
    }[];
  };
  lineage: {
    sha256: string;
    intakes: { id: string; status: string; origin: string | null; original_filename: string | null; created_at: string }[];
    filings: {
      id: string; client_id: string; filed_at: string; basis: string;
      retired_at: string | null; retirement_reason: string | null; correction_id: string | null;
    }[];
    corrections: {
      id: string; status: string; from_client: string | null; to_client: string | null;
      proposed_at: string | null; approved_at: string | null; completed_at: string | null;
    }[];
    authoritative_extraction_id: string | null;
  };
};

// ---------------------------------------------------------------------------------------------
// The four rendered verdicts. Each is a SINGLE named state, so the panel can say four separate
// true things rather than one composite. The tone ladder is state.tsx's, never a new one.
// ---------------------------------------------------------------------------------------------

/** The words the panel renders. Each maps to exactly one message key and one tone, so no caller
 *  ever assembles a sentence out of fragments. */
export type CustodyVerdict = "held" | "verified" | "stored";
export type ExtractionVerdict =
  | "not_attempted" | "pending" | "running" | "done" | "failed" | "stored_unparsed";
export type FactsVerdict =
  | "unsupported_kind" | "unsupported_format" | "pending" | "none" | "partial" | "validated" | "invalid";
/** `awaiting_confirmation` is `business_operation: "proposal_only"` with nothing coded yet (#988):
 *  Clara reads this pair deterministically and derives a real proposal, but never carries it into
 *  a posted operation on its own authority. It is NOT `uncoded` — that word is the store-only
 *  pair's, where Clara derives nothing and nothing is ever coming. Once a person has acted the
 *  verdict is about what happened, so a confirmed proposal reads `coded` or `posted` like any
 *  other entry. */
export type OperationVerdict =
  "not_applicable" | "awaiting_confirmation" | "uncoded" | "coded" | "posted" | "reconciled";

/** CUSTODY. A legal hold is the loudest thing true about a document's bytes, so it wins; the
 *  rest is simply whether the stored bytes were re-hashed and matched. */
export function custodyVerdict(state: DocumentStateResult): CustodyVerdict {
  if (state.custody.legal_hold) return "held";
  return state.custody.bytes_verified_at !== null ? "verified" : "stored";
}

/** BYTE EXTRACTION. The document's own `extraction_status` is the scalar the DB maintains; the
 *  task list beside it is what makes it auditable. `not_attempted` is the honest reading when
 *  the registry says this format is never read at intake (OFX): there is no failure to report,
 *  because nothing was ever asked to run. */
export function extractionVerdict(state: DocumentStateResult): ExtractionVerdict {
  if (state.byte_extraction.capability === "stored_only" && state.byte_extraction.tasks.length === 0) {
    return "not_attempted";
  }
  switch (state.byte_extraction.status) {
    case "running": return "running";
    case "done": return "done";
    case "skipped_structured_done": return "done";
    case "failed": return "failed";
    case "stored_unparsed": return "stored_unparsed";
    case "held_egress": return "pending";
    default: return "pending";
  }
}

/** Did any FACTS extraction actually land? A `done`, un-superseded facts extraction with at
 *  least one region is the only thing that counts — a failed or superseded one is history. */
export function landedFactsExtractions(state: DocumentStateResult): DocumentStateExtraction[] {
  return state.facts.extractions.filter((e) => e.status === "done" && e.superseded_by === null);
}

/** The validations that carry a real verdict, i.e. not `not_applicable`. */
export function failingChecks(state: DocumentStateResult): DocumentFactValidation[] {
  return state.facts.validations.filter((v) => v.outcome === "fail");
}

export function unmeasuredChecks(state: DocumentStateResult): DocumentFactValidation[] {
  return state.facts.validations.filter((v) => v.outcome === "unmeasured");
}

/** FACTS — the verdict that matters most and the one this ticket exists for.
 *
 *  `unsupported_kind` / `unsupported_format` are DISTINCT because the sentence a professional
 *  needs is different: "Clara keeps this kind but derives nothing from it" versus "Clara cannot
 *  read facts out of this file format for this type". `pending` is the not-yet-classified case —
 *  no promise either way. `invalid` NEVER hides the facts: a failing arithmetic check is a state,
 *  and the fact rows stay readable beside it (#624 acceptance 2). */
export function factsVerdict(state: DocumentStateResult): FactsVerdict {
  const cap = state.facts.capability;
  if (!state.capability.kind_known) return "pending";
  if (cap === "unsupported") {
    return state.capability.known_pair ? "unsupported_format" : "unsupported_format";
  }
  if (cap === "stored_only" || cap === "planned") return "unsupported_kind";
  const landed = landedFactsExtractions(state);
  if (landed.length === 0) return "none";
  if (failingChecks(state).length > 0) return "invalid";
  const measured = state.facts.validations.filter((v) => v.outcome === "pass");
  if (measured.length === 0) return "partial";
  return "validated";
}

/** OPERATION. `not_applicable` is the registry's own `unsupported` — this kind carries no
 *  accounting operation at all — and it is a legitimate resting state, never a failure.
 *
 *  THE LEVEL ONLY SPEAKS WHERE NOTHING HAS HAPPENED YET. Statements, posted entries and drafts
 *  are FACTS about this document, and they outrank what the registry permits; a proposal someone
 *  confirmed and posted reads `posted`, not "awaiting confirmation". The two levels that differ
 *  before anything is coded are `proposal_only` (Clara has a proposal, a person confirms) and
 *  everything else (nothing is coded, and for a store-only pair nothing ever will be) — which is
 *  the one place #988's "distinct from the store-only level" has anything to distinguish. */
export function operationVerdict(state: DocumentStateResult): OperationVerdict {
  if (state.operation.capability === "unsupported") return "not_applicable";
  if (state.operation.statements.length > 0) return "reconciled";
  const live = state.operation.entries.filter((e) => e.status !== "withdrawn" && e.status !== "void");
  if (live.some((e) => e.status === "approved" || e.status === "posted")) return "posted";
  if (live.length > 0) return "coded";
  return state.operation.capability === "proposal_only" ? "awaiting_confirmation" : "uncoded";
}

/** The tone each verdict wears. NOTHING here is green-by-default: an unsupported kind is
 *  `neutral` (a true, unalarming fact), an invalid fact is `error`, and a pending state is
 *  `info`. A success tone is only ever reached by an actual success. */
export type StateTone = "neutral" | "info" | "warning" | "error";

export function factsTone(verdict: FactsVerdict): StateTone {
  switch (verdict) {
    case "invalid": return "error";
    case "partial": return "warning";
    case "pending": return "info";
    default: return "neutral";
  }
}

/** #988 — the ONE operation verdict that is not a plain statement of record. "Clara has a
 *  proposal and is waiting for you" is a pending state, and the panel's own ladder already spells
 *  pending `info` (the same token capability-tiers.tsx gives the `proposal_only` tier). Every
 *  other verdict stays `neutral`: a document that is simply not coded yet is not a warning. */
export function operationTone(verdict: OperationVerdict): StateTone {
  return verdict === "awaiting_confirmation" ? "info" : "neutral";
}

export function extractionTone(verdict: ExtractionVerdict): StateTone {
  switch (verdict) {
    case "failed": return "error";
    case "stored_unparsed": return "warning";
    case "running":
    case "pending": return "info";
    default: return "neutral";
  }
}

/** The named limits the registry publishes for this pair, as stable `[name, level]` pairs so the
 *  panel can render each one with its own message key instead of interpolating raw JSON. */
export function capabilityLimits(capability: DocumentCapability): [string, string][] {
  const limits = capability.limits ?? {};
  return Object.keys(limits).sort().map((key) => [key, String(limits[key])]);
}

/** #782 fix round — the limit VALUE's own message key.
 *
 *  A limit is a `[name, value]` pair and BOTH halves are machine tokens. The surfaces already
 *  render the NAME through its own key (`capabilityLimit.*`); until this map the VALUE was
 *  interpolated verbatim, so the invoice sentence read "Per-line invoice facts:
 *  accepted_limitation." and its reason read "Reason: no_consumer_reads_line_facts." A
 *  snake_case identifier is neither a sentence nor a reason a professional can act on, and #782's
 *  deliverable is precisely that sentence.
 *
 *  A LITERAL MAP, never a `t(\`capabilityLimitLevel.${value}\`)` cast: document-facts-table.tsx's
 *  own header settled that argument for this family — a missing translation renders the KEY at a
 *  professional, which is worse than printing nothing. An unmapped value therefore falls back to
 *  the raw token, which is honest rather than wrong, exactly as an unmapped limit NAME already
 *  does through `capabilityLimitUnknown`.
 *
 *  The roster is CLOSED and MEASURED: these are the seven distinct values
 *  `clara.document_capabilities.limits` publishes across all 240 rows (registry v3). */
const LIMIT_LEVEL_KEY: Record<string, string> = {
  absent: "capabilityLimitLevel.absent",
  absent_in_format: "capabilityLimitLevel.absentInFormat",
  accepted_limitation: "capabilityLimitLevel.acceptedLimitation",
  myinvois_ubl_only: "capabilityLimitLevel.myinvoisUblOnly",
  no_consumer_reads_line_facts: "capabilityLimitLevel.noConsumerReadsLineFacts",
  parse_succeeds_corroboration_cannot: "capabilityLimitLevel.parseSucceedsCorroborationCannot",
  tab_separated_mime_not_routed: "capabilityLimitLevel.tabSeparatedMimeNotRouted",
};

/** The message key for a limit's value, or `null` when this app publishes no phrase for it —
 *  in which case the caller shows the raw token. */
export function capabilityLimitLevelKey(level: string): string | null {
  return LIMIT_LEVEL_KEY[level] ?? null;
}
