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
