// Firm-altitude reads (owner ruling Q3, docs/plan/active/mohe-grill-rulings-2026-08-27.md):
// the firm activity/receipts feed and the client register. Needs-you lives in its own
// module (./needs-you.ts) — it rides a different mechanism (an RPC, with act doors).
//
// GROUNDING (file:line citations, packages/db/migrations/ as measured 2026-08-27):
//   - clara.agent_receipts_visible — the one bookkeeper+ read surface over every agent
//     act receipt (0103_f_a7_pi_additive.sql:406-413), granted to clara_authenticated
//     at :1030. The 19-column contract is clara.agent_receipt_contract
//     (0103:258-277) — every field on AgentReceiptRow below is copied from it verbatim,
//     in ordinal order. THIS IS AN AUDIT TRAIL (what happened), never an inbox (what
//     awaits) — render it as history, never conflated with Needs-you.
//   - clara.clients — the base client table (0003_books_core.sql:34-40): id, firm_id,
//     name, status, created_at. `p_clients_human` (0003:514) + the table-level SELECT
//     grant (0003:522-525) let a firm's own bookkeeper+ read every row scoped to
//     firm_id = jwt_firm() — RLS does the firm scoping; no explicit filter is sent.
//     `status` gained a THIRD value: 0017_wave_b.sql:658-659 replaces the CHECK
//     constraint to admit 'onboarding' beside 'active'/'archived' — trued here after
//     the independent review's superseded-body finding on a sibling module prompted
//     a re-check of every citation in this file.
//   - clara.client_facts (0055_client_facts_trio.sql:386-420, granted :467) — the
//     entity_type/msic enrichment for the register, joined CLIENT-SIDE by client_id
//     (two honest reads, never a fabricated join the DB doesn't offer). A client with
//     no live fact row renders that field absent, never inferred.

import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";

// --- clara.agent_receipts_visible (0103:406-413 / :258-277) -----------------

export type AgentReceiptRow = {
  receipt_kind: string;
  receipt_id: string;
  firm_id: string | null;
  client_id: string | null;
  subject_id: string | null;
  acting_actor: string;
  on_behalf_of: string | null;
  occurred_at: string;
  model: string | null;
  model_version: string | null;
  rationale: string | null;
  verdict: unknown;
  failing_rungs: string[] | null;
  via_wake_kind: string | null;
  trigger_kind: string | null;
  trigger_id: string | null;
  authorization_id: string | null;
  adopted_verbatim: boolean | null;
  scope: string;
};

const AGENT_RECEIPT_COLS =
  "receipt_kind,receipt_id,firm_id,client_id,subject_id,acting_actor,on_behalf_of," +
  "occurred_at,model,model_version,rationale,verdict,failing_rungs,via_wake_kind," +
  "trigger_kind,trigger_id,authorization_id,adopted_verbatim,scope";

/** The firm activity feed — the receipts/open-register inversion made surface
 *  (ADR-0074, Q3). One session's RLS already floors this to the caller's own
 *  firm (0103:408-410); no client_id filter is applied here — this is the
 *  FIRM-altitude, cross-client feed. */
export function loadFirmActivity(session: SessionTokenAccessor, limit = 100): Promise<AgentReceiptRow[]> {
  return getRows<AgentReceiptRow>("agent_receipts_visible", {
    select: AGENT_RECEIPT_COLS,
    order: "occurred_at.desc",
    limit,
    session,
  });
}

// --- clara.clients (0003:34-40 / :514 / :522-525) ----------------------------

export type ClientRow = {
  id: string;
  name: string;
  status: "active" | "archived" | "onboarding" | string;
  created_at: string;
};

/** The client register — every client the firm's RLS session can see, ordered
 *  by name. */
export function loadClientRegister(session: SessionTokenAccessor): Promise<ClientRow[]> {
  return getRows<ClientRow>("clients", {
    select: "id,name,status,created_at",
    order: "name.asc",
    session,
  });
}

/** One client, by id — the workspace overview's own read. `null` when RLS
 *  admits no such row (not in this firm, or it never existed): the caller
 *  renders that as `not_found`, never as a thrown error the DB never raised. */
export async function loadClientById(session: SessionTokenAccessor, clientId: string): Promise<ClientRow | null> {
  const rows = await getRows<ClientRow>("clients", {
    select: "id,name,status,created_at",
    filters: { id: `eq.${clientId}` },
    session,
  });
  return rows[0] ?? null;
}

// --- clara.client_facts, firm-wide narrow read (0055:386-420 / :467) --------

export type ClientRegisterFactRow = {
  client_id: string;
  fact_key: "entity_type" | "msic" | string;
  fact_value: unknown;
};

/** Every LIVE (unsuperseded) entity_type/msic fact across the whole firm — the
 *  register's enrichment read. Merged client-side onto ClientRow by client_id;
 *  a client absent here simply has no such fact recorded, rendered as absent. */
export function loadClientRegisterFacts(session: SessionTokenAccessor): Promise<ClientRegisterFactRow[]> {
  return getRows<ClientRegisterFactRow>("client_facts", {
    select: "client_id,fact_key,fact_value",
    filters: { fact_key: "in.(entity_type,msic)", superseded_at: "is.null" },
    session,
  });
}
