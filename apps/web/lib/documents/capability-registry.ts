// #633 AC3(b) — THE FOUR CAPABILITY TIERS ON THE INTAKE SURFACES.
//
// WHY A SECOND READER AT ALL, next to `document-state.ts`. `clara.get_document_state`
// (0191:1344) is the DETAIL panel's single-document read: one round trip per document,
// carrying custody/extraction/facts/operation plus lineage and validations. Calling it per
// LIST row would be an N+1 under the user's JWT on the same hot path the settle-poll uses.
//
// `clara.document_capabilities` (0191:200-214) is the other half of the same answer and is
// shaped for exactly this: a GLOBAL 240-row catalogue (12 formats x 20 kinds) with NO
// tenant column, `grant select … to clara_authenticated` (0191:271) under a
// `for select … using (true)` policy (:267-268). So it is read ONCE PER MOUNT and joined
// per row in the browser. It is NEVER part of the bounded settle-poll's budget: a static
// vocabulary does not change while a page is open.
//
// THE JOIN KEY IS THE CANONICAL MIME, AND IT IS CANONICAL BY THE TIME WE SEE IT.
// `packages/runtime/lib/intake.mjs:88` canonicalises the declared MIME through
// MIME_ALIASES (:33-50) before anything is stored, and `finalize_document_intake` copies
// `i.declared_mime` into `clara.documents` (0007:2012) — so the intake row's
// `declared_mime`, a filed document's `mime_type` and `list_unassigned_documents`'
// projected `mime_type` (0009:2601) are all the SAME spelling as the registry's own
// `mime_type` (the one canonical mime per format, 0191:206).
//
// THIS MODULE DELIBERATELY HOLDS NO ALIAS TABLE OF ITS OWN. A browser-side copy of
// MIME_ALIASES would be a second place for the vocabulary to drift (brief risk 5), and the
// only spellings it would add are `text/xml` and the three non-canonical OFX/QFX ones. A
// value that is not a registry mime therefore resolves to the honest unknown rather than
// to a guess — which is also the correct answer for a browser-reported `file.type` this
// app has never admitted.

import { getRows } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import type { BusinessOperationLevel, CapabilityLevel } from "./document-state";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The published columns, verbatim from 0191:200-214. `recorded_at` is deliberately not
 *  projected: it is the registry's own bookkeeping, not a professional-facing fact. */
export const CAPABILITY_REGISTRY_COLS =
  "format,document_kind,mime_type,custody,byte_extraction,typed_facts,business_operation,engine_id,engine_byte,registry_version,basis,limits";

export type CapabilityRegistryRow = {
  format: string;
  document_kind: string;
  mime_type: string;
  custody: CapabilityLevel;
  byte_extraction: CapabilityLevel;
  typed_facts: CapabilityLevel;
  /** WIDER than the other three by exactly one value, because its DB CHECK is (#988/0246). */
  business_operation: BusinessOperationLevel;
  engine_id: string | null;
  engine_byte: string | null;
  registry_version: number | null;
  basis: string;
  limits: Record<string, string>;
};

export function capabilityRegistryPath(): string {
  return `document_capabilities?select=${CAPABILITY_REGISTRY_COLS}`;
}

/** ONE list-form read of the granted global registry. No filter: the whole catalogue is
 *  240 rows of static vocabulary, and a per-row filter would turn one read into many. */
export async function readCapabilityRegistry(opts: Opts = {}): Promise<CapabilityRegistryRow[]> {
  return getRows<CapabilityRegistryRow>(capabilityRegistryPath(), opts);
}

export type CapabilityIndex = {
  /** canonical mime → format token. 0191:206 states one mime per format; the tail of that
   *  migration asserts it. */
  formatByMime: ReadonlyMap<string, string>;
  /** `${format}\u0000${document_kind}` → row. */
  byPair: ReadonlyMap<string, CapabilityRegistryRow>;
  /** ONE row per format, for the two FORMAT-INTRINSIC tiers (custody, byte extraction) —
   *  0191's own column comments say the intake lane does not know the kind yet (:207-208),
   *  so those two are publishable before classification. */
  byFormat: ReadonlyMap<string, CapabilityRegistryRow>;
  /** Any mime the registry mapped to more than one format — a contract break, surfaced
   *  rather than silently collapsed to whichever row arrived last. */
  mimeConflicts: readonly string[];
};

const pairKey = (format: string, kind: string) => `${format}\u0000${kind}`;

export function buildCapabilityIndex(rows: readonly CapabilityRegistryRow[]): CapabilityIndex {
  const formatByMime = new Map<string, string>();
  const byPair = new Map<string, CapabilityRegistryRow>();
  const byFormat = new Map<string, CapabilityRegistryRow>();
  const conflicts = new Set<string>();

  for (const row of rows) {
    const existing = formatByMime.get(row.mime_type);
    if (existing === undefined) formatByMime.set(row.mime_type, row.format);
    else if (existing !== row.format) conflicts.add(row.mime_type);
    byPair.set(pairKey(row.format, row.document_kind), row);
    if (!byFormat.has(row.format)) byFormat.set(row.format, row);
  }

  return { formatByMime, byPair, byFormat, mimeConflicts: [...conflicts].sort() };
}

/** ONE tier as the surface renders it.
 *  * `level`   — a published registry level, with any named limits beside it (0191:214).
 *  * `needs_classification` — the kind is not decided yet, so no facts/operation promise
 *    exists. The NAMED state AC3 asks for, never a blank cell and never `pending` prose.
 *  * `unknown` — the mime resolved to no format, or the (format, kind) pair is not seeded.
 *    Nothing is claimed. */
export type TierState =
  | { state: "level"; level: BusinessOperationLevel; limits: Record<string, string> }
  | { state: "needs_classification" }
  | { state: "unknown" };

export type ResolvedCapability = {
  format: string | null;
  kindKnown: boolean;
  knownPair: boolean;
  custody: TierState;
  byteExtraction: TierState;
  typedFacts: TierState;
  businessOperation: TierState;
  engineByte: string | null;
  engineId: string | null;
  registryVersion: number | null;
  basis: string | null;
};

const UNKNOWN: TierState = { state: "unknown" };
const NEEDS_CLASSIFICATION: TierState = { state: "needs_classification" };

/** `TierState` is the union over ALL FOUR axes, so its level is the WIDEST of the four sets —
 *  `BusinessOperationLevel`. The three narrower axes pass values that are a subset of it, so
 *  nothing is widened for them at the call sites below. */
const level = (value: BusinessOperationLevel, limits: Record<string, string> = {}): TierState =>
  ({ state: "level", level: value, limits });

const ALL_UNKNOWN: ResolvedCapability = {
  format: null, kindKnown: false, knownPair: false,
  custody: UNKNOWN, byteExtraction: UNKNOWN, typedFacts: UNKNOWN, businessOperation: UNKNOWN,
  engineByte: null, engineId: null, registryVersion: null, basis: null,
};

/**
 * Resolve the four tiers for one row of any intake surface.
 *
 * `mime` is the CANONICAL mime as stored (an intake row's `declared_mime`, a document's
 * `mime_type`). `kind` is `documents.document_kind`, which is `null` until the classifier
 * lands — and `extraction_status: 'done'` alone NEVER stands in for a facts level here.
 */
export function resolveCapability(
  index: CapabilityIndex,
  mime: string | null | undefined,
  kind: string | null | undefined,
): ResolvedCapability {
  if (typeof mime !== "string" || mime === "") return { ...ALL_UNKNOWN, kindKnown: typeof kind === "string" && kind !== "" };
  const format = index.formatByMime.get(mime);
  const kindKnown = typeof kind === "string" && kind !== "";
  if (format === undefined) return { ...ALL_UNKNOWN, kindKnown };

  const formatRow = index.byFormat.get(format) ?? null;
  const pairRow = kindKnown ? index.byPair.get(pairKey(format, kind as string)) ?? null : null;

  // The FORMAT-INTRINSIC half. Published as soon as the mime is known, exactly as 0191's
  // own column comments justify — including OFX's honest `stored_only` byte extraction.
  const custody = formatRow ? level(formatRow.custody) : UNKNOWN;
  const byteExtraction = formatRow ? level(formatRow.byte_extraction) : UNKNOWN;

  // The KIND-DEPENDENT half.
  let typedFacts: TierState = UNKNOWN;
  let businessOperation: TierState = UNKNOWN;
  if (!kindKnown) {
    typedFacts = NEEDS_CLASSIFICATION;
    businessOperation = NEEDS_CLASSIFICATION;
  } else if (pairRow) {
    typedFacts = level(pairRow.typed_facts, pairRow.limits ?? {});
    businessOperation = level(pairRow.business_operation, {});
  }

  return {
    format,
    kindKnown,
    knownPair: pairRow !== null,
    custody,
    byteExtraction,
    typedFacts,
    businessOperation,
    engineByte: (pairRow ?? formatRow)?.engine_byte ?? null,
    engineId: pairRow?.engine_id ?? null,
    registryVersion: (pairRow ?? formatRow)?.registry_version ?? null,
    basis: pairRow?.basis ?? null,
  };
}

/** The message-key namespace the surfaces render a tier through. `unknown` and
 *  `needs_classification` each get their OWN phrase — never one shared "not available". */
export function tierStateKey(tier: TierState): string {
  switch (tier.state) {
    case "level": return `capabilityTier.${tier.level}`;
    case "needs_classification": return "capabilityTier.needs_classification";
    case "unknown": return "capabilityTier.unknown";
  }
}

export const TIER_STATE_KEYS: readonly string[] = [
  "capabilityTier.supported", "capabilityTier.stored_only", "capabilityTier.unsupported",
  "capabilityTier.planned", "capabilityTier.proposal_only", "capabilityTier.needs_classification",
  "capabilityTier.unknown",
];
