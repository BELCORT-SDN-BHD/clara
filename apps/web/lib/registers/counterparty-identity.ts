// #647 — COUNTERPARTY IDENTITY: the three reads 0215 ships, and nothing else.
//
// Every signature below transcribes `packages/db/migrations/
// 0215_counterparty_identity_provenance.sql`'s own `jsonb_build_object(...)` tail exactly, not a
// guess, the same way ./counterparty-doors.ts's header describes.
//
//   clara.get_counterparty_identity(p_client, p_counterparty) — 0215 §8.2. viewer+.
//     Refuses CLR11 when the client is not in the caller's firm or the counterparty is not that
//     client's. Returns {client_id, as_of, current, aliases, identifier_revisions, merges,
//     conflicts}. `identifier_revisions` carries EVERY act, not only identifier ones: there is
//     ONE revision relation by orchestrator ruling and this is the key name the brief fixed.
//   clara.list_counterparty_identity(p_client, p_kind) — 0215 §8.3. viewer+. A NULL kind means
//     BOTH roles, which is a different answer from a role that happens to be empty. Every count
//     is computed in the database from the relations themselves (H-34: a surface may never show
//     a number no read produced).
//   clara.list_counterparty_merge_corrections(p_client) — 0215 §8.4. viewer+. AC3's bounded
//     discovery: which merges a correction could even be described for. There is NO un-merge
//     door and this module exports no call that pretends otherwise.
//
// READ-FLAVOURED RPCs. They ride `callDoor` as transport but are NOT governed acts — no
// confirmation UI, no re-read-after semantics (aging.ts's precedent, and this train's own rule).

import { callDoor } from "../doors";
import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";
import type { CounterpartyKind } from "./counterparty";

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** The four LANES a row can have been written by (0215's `recorded_via` CHECK). Deliberately
 *  NOT `clara.knowledge_records`' two-value union: that column names a ROLE, this one names a
 *  lane, and `lib/registers/knowledge.ts`'s `KnowledgeRecordRow` must not be widened to carry
 *  these — it is #654's register and `ClientKnowledge.recordedVia` has exactly two keys. */
export type IdentityRecordedVia = "human_ui" | "agent" | "seeding" | "legacy_unknown";

/** 0215's widened `origin` CHECK. `agent_proposed` is reachable from no door in this build —
 *  it is declared so the successor contract has a value to write — and is still rendered,
 *  because a row that exists must be readable. */
export type CounterpartyAliasOriginRead =
  | "former_name" | "trade_name" | "human" | "extracted" | "agent_proposed";

/** The four source pins, in the SAME shape `KnowledgeSourcePins` uses, so
 *  `KnowledgeSourceBlock` (components/registers/knowledge-shared.tsx:123) can be called
 *  VERBATIM over an identity row. `work_id` is always null here: an identity act is never
 *  inside a Work bundle. */
export type IdentitySourcePins = {
  document_id: string | null;
  extraction_id: string | null;
  region_id: string | null;
  field_path: string | null;
};

export type CounterpartyIdentityCurrent = {
  id: string;
  kind: CounterpartyKind | string;
  name: string;
  name_normalized: string;
  registration_no: string | null;
  registration_normalized: string | null;
  tin: string | null;
  payment_terms_days: number | null;
  merged_into: string | null;
  retired_at: string | null;
  /** `clara._canonical_counterparty` — the party this one folds into after any merge chain.
   *  Equal to `id` for a live party; different for a merged one, which is exactly the
   *  "recorded vs canonical" distinction the aging and statement surfaces render. */
  canonical_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CounterpartyAliasRow = {
  id: string;
  alias_display: string;
  alias_normalized: string;
  kind: CounterpartyKind | string;
  origin: CounterpartyAliasOriginRead | string;
  recorded_via: IdentityRecordedVia | string;
  /** The human's own words for why this alias exists, or null where nobody stated one. */
  recorded_basis: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  retired_at: string | null;
  source: IdentitySourcePins;
};

export type CounterpartyIdentityAct =
  | "rename" | "alias_added" | "alias_retired" | "identifiers_set" | "merged";

export type CounterpartyIdentityRevision = {
  revision_n: number;
  act: CounterpartyIdentityAct | string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  basis: string;
  changed_by: string;
  changed_by_name: string | null;
  recorded_via: IdentityRecordedVia | string;
  changed_at: string;
  alias_id: string | null;
  source: IdentitySourcePins;
};

export type CounterpartyMergeRow = {
  id: string;
  survivor_id: string;
  survivor_name: string | null;
  merged_id: string;
  merged_name: string | null;
  reason: string;
  merged_by: string;
  merged_by_name: string | null;
  merged_at: string;
  alias_id: string | null;
  unmerged_at: string | null;
  /** Which side of this lineage the counterparty being viewed sits on. */
  side: "survivor" | "merged" | string;
};

/** A conflict the database can SEE and deliberately does not resolve (AC4). Two clients of one
 *  firm may carry the same registration or TIN and stay unlinked; a vendor and a customer of one
 *  client may share a name and stay distinct. The surface states both. */
export type CounterpartyIdentityConflict = {
  kind: "cross_client_identifier" | "cross_kind_same_name" | string;
  identifier_kind?: "registration" | "tin" | string;
  value: string | null;
  other_client_id: string;
  other_client_name: string | null;
  other_counterparty_id: string;
  other_counterparty_name: string | null;
  other_kind: CounterpartyKind | string;
};

export type CounterpartyIdentity = {
  client_id: string;
  as_of: string;
  current: CounterpartyIdentityCurrent;
  aliases: CounterpartyAliasRow[];
  identifier_revisions: CounterpartyIdentityRevision[];
  merges: CounterpartyMergeRow[];
  conflicts: CounterpartyIdentityConflict[];
};

export function getCounterpartyIdentity(
  clientId: string,
  counterpartyId: string,
  opts: Opts = {},
): Promise<CounterpartyIdentity> {
  return callDoor<CounterpartyIdentity>(
    "get_counterparty_identity",
    { p_client: clientId, p_counterparty: counterpartyId },
    opts,
  );
}

export type CounterpartyIdentityListRow = {
  id: string;
  kind: CounterpartyKind | string;
  name: string;
  registration_no: string | null;
  tin: string | null;
  merged_into: string | null;
  retired_at: string | null;
  status: "live" | "retired" | "merged" | string;
  alias_count: number;
  live_alias_count: number;
  revision_count: number;
  last_revision_at: string | null;
  merge_count: number;
  /** Live aliases with no document pinned. NOT a defect count — a human may simply have said
   *  so — but it is the honest measure of how much of this identity rests on a source. */
  unsourced_alias_count: number;
};

export type CounterpartyIdentityList = {
  client_id: string;
  /** Echoed back so a surface can tell "both roles" from "the role I asked for". */
  kind: CounterpartyKind | null | string;
  as_of: string;
  counterparties: CounterpartyIdentityListRow[];
};

/** `kind` null asks for BOTH roles. The DB refuses any other value with CLR10 `kind_unknown` —
 *  this module does not re-implement that check (the DB's own monopoly). */
export function listCounterpartyIdentity(
  clientId: string,
  kind: CounterpartyKind | null,
  opts: Opts = {},
): Promise<CounterpartyIdentityList> {
  return callDoor<CounterpartyIdentityList>(
    "list_counterparty_identity",
    { p_client: clientId, p_kind: kind },
    opts,
  );
}

export type CounterpartyMergeCorrectionRow = {
  merged_id: string;
  merged_name: string | null;
  kind: CounterpartyKind | string;
  survivor_id: string | null;
  survivor_name: string | null;
  merged_at: string | null;
  merged_by: string | null;
  merged_by_name: string | null;
  merge_id: string | null;
  merge_reason: string | null;
  alias_id: string | null;
  /** True when a `clara.counterparty_merges` carrier row records what the merge actually did, so
   *  a correction could at least be DESCRIBED. False for a pre-lineage merge. Neither value is a
   *  promise that an un-merge exists — none does. */
  representable: boolean;
  reason: "carrier_recorded" | "legacy_no_carrier" | string;
  unmerged_at: string | null;
};

export type CounterpartyMergeCorrections = {
  client_id: string;
  as_of: string;
  merges: CounterpartyMergeCorrectionRow[];
};

export function listCounterpartyMergeCorrections(
  clientId: string,
  opts: Opts = {},
): Promise<CounterpartyMergeCorrections> {
  return callDoor<CounterpartyMergeCorrections>(
    "list_counterparty_merge_corrections",
    { p_client: clientId },
    opts,
  );
}

// =====================================================================
// The CLIENT's own identifiers — H-20's missing half.
//
// `clara.client_identifiers` is read DIRECTLY under RLS: the table carries
// `p_client_identifiers_human` (SELECT to clara_authenticated where firm_id = jwt_firm()) plus
// the table grant, both MEASURED on the #647 rig rather than taken from migration text. There is
// no list door and wrapping one would be a second read of the same rows.
// =====================================================================

export type ClientIdentifierRow = {
  id: string;
  client_id: string;
  kind: string;
  value_normalized: string;
  added_by: string;
  added_at: string;
};

const CLIENT_IDENTIFIER_COLS = "id,client_id,kind,value_normalized,added_by,added_at";

/** A DIRECT RLS table read, never an RPC — the table's own human policy is the whole access
 *  rule, and wrapping it in a door would be a second read of the same rows (SYNTHESIS §3.1). */
export function loadClientIdentifiers(
  session: SessionTokenAccessor,
  clientId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ClientIdentifierRow[]> {
  return getRows<ClientIdentifierRow>("client_identifiers", {
    select: CLIENT_IDENTIFIER_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "added_at.desc",
    session,
    signal: opts.signal,
  });
}

export type AddClientIdentifierResult = { identifier_id: string };

/** clara.add_client_identifier(p_client, p_kind, p_value_normalized, p_op_key) — 0007:1508,
 *  RECUT 0155:426-459 (adds the typed duplicate refusal). bookkeeper+. Refuses CLR11 when the
 *  client is not in the caller's firm and CLR10 `already_recorded` when
 *  `uq_client_identifiers_client_kind_value` already holds this (client, kind, value). The DB
 *  normalises the value itself (`lower(regexp_replace(v,'\s+','','g'))`); this module sends what
 *  the human typed and never pre-normalises — a client-side copy of a DB predicate is exactly
 *  the drift review law 3 forbids. */
export function addClientIdentifier(
  clientId: string,
  kind: string,
  value: string,
  opts: Opts = {},
): Promise<AddClientIdentifierResult> {
  return callDoor<AddClientIdentifierResult>(
    "add_client_identifier",
    { p_client: clientId, p_kind: kind, p_value_normalized: value, p_op_key: crypto.randomUUID() },
    opts,
  );
}
