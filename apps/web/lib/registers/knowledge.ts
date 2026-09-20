// The client Knowledge tab — clara.client_facts (packages/db/migrations/
// 0055_client_facts_trio.sql:386-420, granted :467) joined client-side against the
// global vocabulary clara.client_fact_keys (0055:347-368, granted :368). Every fact
// row carries WHO/BASIS/WHEN (recorded_by/basis/basis_kind/recorded_at) verbatim from
// ADR-062 — this is a provenanced register, not a free-text notes surface. Rows are
// superseded, never updated (0055:383-408): both live and superseded rows are read,
// so the UI can show current facts plus their history rather than only the latest.
//
// Codex's "data library" folds into documents/knowledge (owner ruling Q3) — this
// module is the "knowledge" half; a document-attached evidence library is the
// documents tab's own surface, not duplicated here.

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

export type ClientFactKeyRow = {
  fact_key: string;
  validated_against: string;
  allowed_values: unknown;
  description: string;
};

/** clara.client_fact_keys — a global (no firm dimension) catalog, unconditional read
 *  for any human role (0055:366-368). */
export function loadClientFactKeys(session: SessionTokenAccessor): Promise<ClientFactKeyRow[]> {
  return getRows<ClientFactKeyRow>("client_fact_keys", {
    select: "fact_key,validated_against,allowed_values,description",
    order: "fact_key.asc",
    session,
  });
}

export type ClientFactRow = {
  id: string;
  client_id: string;
  fact_key: string;
  fact_value: unknown;
  basis: string;
  basis_kind: "owner_instruction" | "document" | "registry_lookup" | "interview_carryover" | string;
  source_document_id: string | null;
  recorded_by: string;
  recorded_at: string;
  superseded_by: string | null;
  superseded_at: string | null;
};

const CLIENT_FACT_COLS =
  "id,client_id,fact_key,fact_value,basis,basis_kind,source_document_id,recorded_by," +
  "recorded_at,superseded_by,superseded_at";

/** Every fact ever recorded for this client (live and superseded), newest first —
 *  the caller renders the live set plus, where wanted, each fact's history. */
export function loadClientFacts(session: SessionTokenAccessor, clientId: string): Promise<ClientFactRow[]> {
  return getRows<ClientFactRow>("client_facts", {
    select: CLIENT_FACT_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "recorded_at.desc",
    session,
  });
}

// =============================================================================
// #644 — THE GOVERNED KNOWLEDGE RECORD (0192_client_knowledge_records.sql).
//
// Everything above this line is the LEGACY half: `clara.client_facts`, read
// directly through PostgREST, still rendered by the client Home identity band.
// It is deliberately untouched — 0192 adds a register beside it and UNIONs the
// legacy live facts into `clara.list_client_knowledge` as
// `source_kind='legacy_client_fact'`, so this surface shows ONE register while
// the old table keeps its own door and its own history.
//
// The four reads and two writes below are RPCs, so they ride `callDoor`
// (../doors) — the same transport as `listReviewQueue` (lib/firm/needs-you.ts):
// a read RPC is not a governed act, but it is still an RPC POST. Every write
// mints a FRESH op_key per attempt (doors.ts's "never retry a refusal" law).
// =============================================================================

import { callDoor } from "../doors";

const opKey = (): string => crypto.randomUUID();

export type KnowledgeKind = "assertion" | "extracted_fact" | "preference" | "policy";

/** The four trust levels 0192 DERIVES from the source kind — a caller cannot
 *  supply one, so a surface can label these without qualifying the label. */
export type KnowledgeTrust = "asserted" | "extracted" | "imported_unverified" | "inferred";

/** `legacy_client_fact` is not one of the DB CHECK's six values: it is the
 *  label `list_client_knowledge` gives a UNIONed `clara.client_facts` row, and
 *  those rows carry `editable: false` because no correction door addresses them. */
export type KnowledgeSourceKind =
  | "user_statement" | "interview" | "document_extraction"
  | "registry_lookup" | "imported_bundle" | "model_inference" | "legacy_client_fact";

export type KnowledgeState = "live" | "superseded" | "withdrawn";

export type KnowledgeSourcePins = {
  document_id: string | null;
  extraction_id: string | null;
  region_id: string | null;
  field_path: string | null;
  work_id: string | null;
};

export type KnowledgeRecordRow = {
  record_id: string;
  revision_id: string;
  revision_n: number;
  scope_kind: "client" | "firm";
  client_id: string | null;
  knowledge_key: string;
  kind: KnowledgeKind;
  value: unknown;
  applies_when: Record<string, unknown>;
  applies_when_digest: string | null;
  effective_from: string | null;
  effective_to: string | null;
  source_kind: KnowledgeSourceKind;
  trust: KnowledgeTrust;
  source: KnowledgeSourcePins;
  basis: string;
  asserted_by: string;
  asserted_by_name: string | null;
  recorded_via: "human_ui" | "clara_runtime";
  recorded_at: string;
  /** A bigint, emitted by the doors as TEXT and kept as text here. The union with
   *  `number` survives only for a pre-fix payload; nothing may coerce it, because
   *  this is the watermark a resumed run compares and a lossy Number() past 2^53
   *  would make two different versions look equal. */
  knowledge_version: string | number | null;
  revision_kind: "capture" | "correction" | "withdrawal";
  revision_reason: string | null;
  supersedes_id: string | null;
  superseded_by: string | null;
  superseded_at: string | null;
  state: KnowledgeState;
  /** "This is a governed knowledge record with its own detail route and doors" —
   *  true of every knowledge row, false only for a UNIONed legacy client_fact. */
  editable: boolean;
  /** "A correction or a withdrawal would actually be admitted" — true only of the
   *  CURRENT LIVE revision. A superseded revision is immutable at the table and a
   *  withdrawal is terminal, so a control offered on either would be a promise the
   *  database refuses. Two different questions; conflating them was the defect. */
  correctable: boolean;
  /** Legacy rows only, and TRUE on every one of them: `clara.client_facts` is
   *  still the table the rest of the estate READS for all five carried keys
   *  (get_context_pack 0055:765, the closing-stock gate 0056:1283, the name-only
   *  guard 0062:226, the bank-registry ledger 0121:4797), and 0192 does not
   *  dual-write. So a legacy row is never shadowed by a knowledge record of the
   *  same key, and the surface says which of the two is in force. */
  authoritative?: boolean;
  key_description?: string | null;
  value_shape?: string | null;
  validated_against?: string | null;
  authority_bearing?: boolean | null;
  basis_kind?: string | null;
};

export type ClientKnowledgeEnvelope = {
  client_id: string;
  knowledge_version: string | number;
  records: KnowledgeRecordRow[];
};

export type KnowledgeKeyDefinition = {
  knowledge_key: string;
  kind: KnowledgeKind;
  value_shape: string;
  validated_against: string;
  allowed_values: unknown;
  description: string;
  authority_bearing: boolean;
};

export type KnowledgeRecordDetail = {
  record: KnowledgeRecordRow & { client_name?: string | null };
  key: KnowledgeKeyDefinition;
  revision_count: number;
};

export type KnowledgeHistory = { record_id: string; revisions: KnowledgeRecordRow[] };

/** clara.list_client_knowledge(p_client uuid) — viewer+, the C13 register. A client
 *  row shadows the firm default of the same key AND THE SAME APPLICABILITY (never
 *  by key alone: a narrow client exception must not erase an unconditional firm
 *  default), and the legacy `client_facts` rows ride in with
 *  `source_kind='legacy_client_fact'` and are never shadowed at all. */
export function loadClientKnowledge(
  clientId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<ClientKnowledgeEnvelope> {
  return callDoor<ClientKnowledgeEnvelope>("list_client_knowledge", { p_client: clientId }, opts);
}

/** clara.get_knowledge_record(p_record uuid) — the CURRENT revision plus the
 *  catalog row that types it. CLR11 for a record this session cannot see. */
export function loadKnowledgeRecord(
  recordId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<KnowledgeRecordDetail> {
  return callDoor<KnowledgeRecordDetail>("get_knowledge_record", { p_record: recordId }, opts);
}

/** clara.get_knowledge_history(p_record uuid) — every revision, oldest first,
 *  each naming its own actor and (for a correction/withdrawal) its reason. */
export function loadKnowledgeHistory(
  recordId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<KnowledgeHistory> {
  return callDoor<KnowledgeHistory>("get_knowledge_history", { p_record: recordId }, opts);
}

/** clara.correct_knowledge — a new REVISION, never an edit. The reason is
 *  required by the door (CLR10 `knowledge_reason_required`); applicability and
 *  the effective window travel unchanged, so changing what a record applies to
 *  is a withdrawal plus a fresh capture, not a silent re-aim. */
export function correctKnowledge(
  args: { recordId: string; value: unknown; reason: string; basis?: string | null },
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<{ status: string; record_id: string; revision_id: string; revision_n: number }> {
  return callDoor("correct_knowledge", {
    p_record: args.recordId,
    p_value: args.value,
    p_reason: args.reason,
    p_op_key: opKey(),
    p_basis: args.basis ?? null,
  }, opts);
}

/** clara.withdraw_knowledge — TERMINAL. The withdrawal revision carries the
 *  value it retires, so the history still says what was withdrawn. */
export function withdrawKnowledge(
  args: { recordId: string; reason: string },
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<{ status: string; record_id: string; revision_n: number }> {
  return callDoor("withdraw_knowledge", {
    p_record: args.recordId,
    p_reason: args.reason,
    p_op_key: opKey(),
  }, opts);
}

// =============================================================================
// #654 — FIRM-WIDE DEFAULTS AND THE CLIENT EXCEPTIONS THAT SURVIVE THEM
// (0220_firm_knowledge_defaults.sql).
//
// THE PROMOTION IS NOT A NEW DOOR. `clara.capture_knowledge(p_scope_kind =>
// 'firm')` has been the promotion path since 0192 and is already admin+ by
// `clara._knowledge_floor` (#603 Q22); what 0192 recorded as its own deferral (3)
// was that nothing in the product ever CALLED it. `promoteKnowledgeToFirm` below
// is that caller, and it is a thin wrapper rather than a second contract.
//
// THE TWO READS ARE NEW, because neither shipped read could answer what C13 has
// to show. `clara.list_client_knowledge` FILTERS a shadowed firm row out in SQL
// (0192:1355-1363), so a client's register can say nothing about the firm rule it
// overrides; `clara.get_knowledge_applicability` answers exactly that, per
// applicability, and `clara.list_firm_knowledge` is the firm-altitude register at
// `/settings/knowledge`.
// =============================================================================

/** One live client row overriding a firm rule at the same key AND applicability —
 *  the same pair `list_client_knowledge`'s shadow matches on. */
export type FirmKnowledgeException = {
  client_id: string;
  client_name: string | null;
  record_id: string;
  value: unknown;
  recorded_at: string;
};

/** A non-terminal `clara.accounting_work` row citing this key. DERIVED from the
 *  `source_work_id` pin a knowledge record carries — nothing in the estate stamps
 *  a Work with the knowledge it reasoned under yet, which is what the claraWork
 *  successor contract closes. */
export type FirmKnowledgeWork = {
  work_id: string;
  client_id: string | null;
  purpose: string;
  status: string;
};

/** WHOSE ACT THE PROMOTION WAS. `required_role` is the authority the door
 *  VERIFIED at the time (`clara._knowledge_floor(key,'firm')`), which is the
 *  durable half; `promoter_role_now` / `promoter_active` are the promoter's
 *  CURRENT membership and are labelled as current by the surface.
 *
 *  `promoter_role_at_act` (#912) is the role the promoter ACTUALLY held when the
 *  rule was recorded, read from `clara.audit_log.actor_role` on the audit row the
 *  promotion itself wrote. `clara.firm_memberships` still carries no history, so
 *  a rule recorded before that column existed reads `null` — UNKNOWN, which the
 *  surface says in those words. It is never the current role by another name: the
 *  two disagree exactly when it matters, after a promotion or a demotion. */
export type FirmKnowledgeAuthority = {
  promoter: string;
  promoter_name: string | null;
  recorded_via: "human_ui" | "clara_runtime";
  recorded_at: string;
  reason: string;
  required_role: string | null;
  promoter_role_at_act: string | null;
  promoter_role_now: string | null;
  promoter_active: boolean;
};

export type FirmKnowledgeRow = KnowledgeRecordRow & {
  authority: FirmKnowledgeAuthority;
  exception_count: number;
  exceptions: FirmKnowledgeException[];
  live_work: FirmKnowledgeWork[];
  firm_defaultable_reason?: string | null;
  in_effect_today?: boolean | null;
};

export type FirmKnowledgeEnvelope = {
  firm_id: string;
  /** Today in `Asia/Kuala_Lumpur`, resolved SERVER-SIDE. A calendar day is a
   *  business fact here and the browser's clock is not evidence of it. */
  as_of: string;
  knowledge_version: string | number;
  records: FirmKnowledgeRow[];
};

/** `none` means neither scope holds a live row at this applicability — a real
 *  answer, not an empty one. */
export type KnowledgeInForce = "client_exception" | "firm_default" | "none";

export type KnowledgeInForceReason =
  | "client_exception_shadows_firm_default"
  | "client_record_only"
  | "firm_default_applies"
  | "no_live_record";

export type KnowledgeApplicabilityEntry = {
  applies_when: Record<string, unknown>;
  applies_when_digest: string;
  firm_rule: KnowledgeRecordRow | null;
  client_exception: KnowledgeRecordRow | null;
  in_force: KnowledgeInForce;
  reason: KnowledgeInForceReason;
  in_effect_today: boolean | null;
};

export type KnowledgeApplicabilityEnvelope = {
  client_id: string;
  knowledge_key: string;
  as_of: string;
  knowledge_version: string | number;
  key: KnowledgeKeyDefinition & {
    firm_defaultable: boolean;
    firm_defaultable_reason: string | null;
  };
  applicabilities: KnowledgeApplicabilityEntry[];
  /** How many clients in the firm hold a live exception to this key — a client row
   *  SHADOWING a live firm row at the same applicability. The firm register's stricter
   *  number, repeated here. */
  exception_count: number;
  /** How many clients hold their OWN live record of this key at all, firm rule or no.
   *  This is the number a promotion is decided against: at promote time `exception_count`
   *  is 0 by construction (nothing exists to be an exception to), while these are exactly
   *  the clients that keep their own value the instant the rule lands. */
  client_record_count: number;
  live_work: FirmKnowledgeWork[];
};

/** clara.list_firm_knowledge() — viewer+, the `/settings/knowledge` register. */
export function loadFirmKnowledge(
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<FirmKnowledgeEnvelope> {
  return callDoor<FirmKnowledgeEnvelope>("list_firm_knowledge", {}, opts);
}

/** clara.get_knowledge_applicability(p_client, p_knowledge_key) — viewer+. The
 *  firm rule, the client exception, which governs and why, per applicability. */
export function loadKnowledgeApplicability(
  clientId: string,
  knowledgeKey: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<KnowledgeApplicabilityEnvelope> {
  return callDoor<KnowledgeApplicabilityEnvelope>(
    "get_knowledge_applicability",
    { p_client: clientId, p_knowledge_key: knowledgeKey },
    opts,
  );
}

/**
 * clara.capture_knowledge at FIRM scope — the promotion.
 *
 * THE REASON IS AUTHORED, NEVER INHERITED. The caller passes the sentence a human
 * typed in the dialog as `p_basis`; the client record's own basis is that client's
 * narrative, and copying it would put one client's words behind a rule applied to
 * every other. The dialog is what enforces "required"; the door refuses a blank
 * one too (CLR10 `knowledge_basis_missing`).
 *
 * NO SOURCE PINS. A firm default cites no document at all here — the shipped
 * promotion path passes an empty source for the same reason (0192:1706-1711), and
 * 0220's evidence wall would refuse any document a client is filed against.
 *
 * TRUST TRAVELS FROM WHAT IS BEING GENERALISED: `sourceKind` is the client row's
 * own, so an extracted or inferred row cannot be laundered into an asserted firm
 * policy — the DB refuses that (CLR10 `knowledge_trust_insufficient`) and this
 * wrapper does not paper over it.
 *
 * A FRESH op_key PER ATTEMPT (doors.ts's "never retry a refusal" law).
 */
export function promoteKnowledgeToFirm(
  args: {
    knowledgeKey: string;
    value: unknown;
    reason: string;
    sourceKind: KnowledgeSourceKind;
    appliesWhen?: Record<string, unknown>;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
  },
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<{ status: string; record_id: string; revision_id: string; knowledge_key: string }> {
  return callDoor("capture_knowledge", {
    p_knowledge_key: args.knowledgeKey,
    p_value: args.value,
    p_basis: args.reason,
    p_op_key: opKey(),
    p_scope_kind: "firm",
    p_client: null,
    p_source_kind: args.sourceKind,
    p_applies_when: args.appliesWhen ?? {},
    p_effective_from: args.effectiveFrom ?? null,
    p_effective_to: args.effectiveTo ?? null,
    p_source: {},
  }, opts);
}

// =============================================================================
// #658 — WHO READ THIS RECORD (0230_knowledge_retrieval.sql, the SEVENTH door).
//
// `clara.work_knowledge_reads` is FORCE-RLS with NO app-role SELECT, so
// `clara.list_work_knowledge_reads_for_record` is the ONLY human path into it —
// DECISIONS.md:83 mandates exactly that door for exactly that reason, and a
// `grant select` is not an alternative (0230's tail refuses one).
//
// IT RETURNS READ METADATA AND NEVER A VALUE: which Work, at which
// `knowledge_version` and `as_of`, under which `purpose`, with which face word.
// No record value, no `applies_when`, no source bytes, no pack content — which
// is why granting it to `clara_authenticated` does not breach #783
// (.out-of-scope/human-read-of-knowledge-pack.md).
// =============================================================================

/** The estate's coverage vocabulary, and the four values `work_knowledge_reads.status`
 *  admits. The runtime's own `unavailable` is REFUSED by the CHECK and never appears
 *  here; `packages/runtime/lib/knowledge-retrieval.mjs`'s `faceStatusOf` is the one
 *  mapping between the two. */
export type KnowledgeReadStatus = "ok" | "partial" | "unknown" | "denied";

export type WorkKnowledgeReadRow = {
  work_id: string;
  client_id: string;
  run_id: string;
  seq: number;
  read_at: string;
  purpose: string;
  /** The period the run read FOR — not the instant it read at. */
  as_of: string;
  /** TEXT, and nothing may coerce it: it is the watermark a resumed run compares. */
  knowledge_version: string;
  status: KnowledgeReadStatus;
  reason: string | null;
};

export type WorkKnowledgeReadsEnvelope = {
  status: "ok";
  record_id: string;
  knowledge_key: string;
  scope_kind: "client" | "firm";
  client_id: string | null;
  reads: WorkKnowledgeReadRow[];
  /** The door caps the list at 100 newest-first. The C13 register is unbounded and this
   *  list is not, deliberately: an unbounded list on a detail page is how a record page
   *  quietly becomes a Work directory. */
  truncated: boolean;
  hidden_count: number;
  computed_at: string;
};

/** clara.list_work_knowledge_reads_for_record(p_record uuid) — viewer+, firm from the
 *  session, scope taken from the RECORD. A `scope_kind='firm'` record lists every client
 *  in the firm EXCEPT those whose own live record shadows the key, so the list never
 *  claims a client was reading the firm default when it was reading its own exception. */
export function loadWorkKnowledgeReadsForRecord(
  recordId: string,
  opts: { session?: SessionTokenAccessor; signal?: AbortSignal } = {},
): Promise<WorkKnowledgeReadsEnvelope> {
  return callDoor<WorkKnowledgeReadsEnvelope>(
    "list_work_knowledge_reads_for_record",
    { p_record: recordId },
    opts,
  );
}
