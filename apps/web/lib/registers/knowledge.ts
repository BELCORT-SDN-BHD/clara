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
