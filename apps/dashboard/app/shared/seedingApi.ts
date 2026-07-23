// Wire client for the B5 prior-GL seeding tick-list ceremony (dashboard-lanes-plan
// SETTLED v1.0 §3.4 / F13; 0017 Block S). Two lanes, never mixed:
//   HUMAN lane  — Supabase PostgREST as clara_authenticated: firm-scoped table reads
//                 of seeding_batches/seeding_proposals (RLS p_*_human, firm_id=jwt_firm())
//                 + the governed tick/decline/complete/cancel writers (0017 G2: auth ✓,
//                 agent ✗, wake ✗, runtime ✗ — admin+ floor enforced in-DB, `_human_ctx`).
//   RUNTIME lane — the ONE exception: POST /api/seeding/prepare (§3.4), a bookkeeper+
//                 admin-floored runtime route that parses a stamped prior_gl document
//                 into typed proposals and calls create_seeding_batch (clara_runtime
//                 ONLY — the dashboard structurally cannot call create_seeding_batch
//                 itself). Same-origin transport (F6): next.config.mjs already proxies
//                 /api/seeding/:path* to the runtime in dev; production rides the
//                 Cloudflare catch-all. Every governed writer carries a FRESH op_key
//                 (house idiom); every displayed number is a DB-authored value read
//                 verbatim off the row — this module computes none.
//
// This ceremony is DELIBERATELY distinct from the one-transaction K5 carry-down
// approval: N independent per-proposal ticks (BatchApprove doctrine — one refusal or
// decline never poisons the rest), never a bulk "approve all" verb. See SeedingBatchView.

import { pgrestSelect, rpc, runtimeBase, supabaseBase } from "./wire";
import type { PgrestError } from "./wire";

const opKey = () => crypto.randomUUID();

// --- Defensive scalar helpers (the reviewTypes.ts idiom: a mapper never crashes) ---

function s(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function n(v: unknown): number | null {
  return typeof v === "number" ? v : null;
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function bool(v: unknown): boolean {
  return v === true;
}

// --- Row types (mirror clara.seeding_batches / clara.seeding_proposals, 0017) -----

export type SeedingBatchState = "open" | "completed" | "cancelled";
export type SeedingProposalKind = "vendor_account_rule" | "counterparty_birth" | "wiki_fact";
export type SeedingProposalState = "proposed" | "ticked" | "declined" | "refused";

/** `seeding_batches.stats` (S1/S4 — mint counts + completion counts, jsonb, DB-authored;
 *  every key defensively optional since the shape grows across create/complete). */
export type SeedingBatchStats = {
  proposal_count: number | null;
  refused_count: number | null;
  ticked: number | null;
  declined: number | null;
  refused: number | null;
  still_proposed: number | null;
  source_document_id: string | null;
};

export type SeedingBatch = {
  id: string;
  firm_id: string;
  client_id: string;
  source_document_id: string;
  source_sha256: string;
  state: SeedingBatchState | string;
  stats: SeedingBatchStats;
  created_by: string | null;
  created_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
};

function toSeedingBatchStats(raw: unknown): SeedingBatchStats {
  const o = obj(raw);
  return {
    proposal_count: n(o.proposal_count),
    refused_count: n(o.refused_count),
    ticked: n(o.ticked),
    declined: n(o.declined),
    refused: n(o.refused),
    still_proposed: n(o.still_proposed),
    source_document_id: s(o.source_document_id),
  };
}

export function toSeedingBatch(raw: unknown): SeedingBatch {
  const o = obj(raw);
  return {
    id: s(o.id) ?? "",
    firm_id: s(o.firm_id) ?? "",
    client_id: s(o.client_id) ?? "",
    source_document_id: s(o.source_document_id) ?? "",
    source_sha256: s(o.source_sha256) ?? "",
    state: s(o.state) ?? "open",
    stats: toSeedingBatchStats(o.stats),
    created_by: s(o.created_by),
    created_at: s(o.created_at),
    completed_at: s(o.completed_at),
    completed_by: s(o.completed_by),
    cancelled_at: s(o.cancelled_at),
    cancelled_by: s(o.cancelled_by),
    cancel_reason: s(o.cancel_reason),
  };
}

/** One line/region citation (P10 / S6 vocabulary — the same source_kind that rides
 *  `wiki_page_citations` once a ticked wiki_fact publishes). F-M14: the parse lane emits the
 *  EXACT union `{row:number,text:string}` (a prior-GL line) OR `{region_id:string,text:string}`
 *  (a document region). An unknown shape degrades to `{kind:'raw'}` so no DB-authored detail
 *  is ever silently dropped — `raw` always keeps the untouched cite for disclosure. */
export type SeedingEvidenceCite =
  | { kind: "row"; row: number; text: string; raw: Record<string, unknown> }
  | { kind: "region"; region_id: string; text: string; raw: Record<string, unknown> }
  | { kind: "raw"; raw: Record<string, unknown> };

function toEvidenceCite(raw: unknown): SeedingEvidenceCite {
  const o = obj(raw);
  const row = n(o.row);
  const region = s(o.region_id);
  const text = s(o.text);
  if (row !== null && text !== null) return { kind: "row", row, text, raw: o };
  if (region !== null && text !== null) return { kind: "region", region_id: region, text, raw: o };
  return { kind: "raw", raw: o };
}

/** `seeding_proposals.evidence` (S1/P10 — provenance + frequency metrics live ON the
 *  proposal, NEVER a confidence on the resulting rule): occurrence count, date span,
 *  prior-GL line cites. Un-pinned key names — defensive under known aliases; `raw` keeps
 *  every DB-authored key so the row can render an honest fallback for an unknown shape. */
export type SeedingEvidence = {
  occurrence_count: number | null;
  date_span: { from: string | null; to: string | null } | null;
  line_cites: SeedingEvidenceCite[];
  raw: Record<string, unknown>;
};

function toDateSpan(raw: unknown, o: Record<string, unknown>): { from: string | null; to: string | null } | null {
  const span = obj(raw);
  // {first,last} is the shape R2's seeding-parse actually emits (integration-pinned).
  const from = s(span.first) ?? s(span.from) ?? s(span.start) ?? s(o.first_seen) ?? s(o.date_from);
  const to = s(span.last) ?? s(span.to) ?? s(span.end) ?? s(o.last_seen) ?? s(o.date_to);
  return from || to ? { from, to } : null;
}

export function toSeedingEvidence(raw: unknown): SeedingEvidence {
  const o = obj(raw);
  const cites = arr(o.line_cites).length > 0 ? o.line_cites : arr(o.prior_gl_line_cites).length > 0 ? o.prior_gl_line_cites : o.cites;
  return {
    occurrence_count: n(o.occurrence_count) ?? n(o.occurrences) ?? n(o.count),
    date_span: toDateSpan(o.date_span, o),
    line_cites: arr(cites).map(toEvidenceCite),
    raw: o,
  };
}

export type SeedingProposal = {
  id: string;
  batch_id: string;
  firm_id: string;
  client_id: string;
  proposal_kind: SeedingProposalKind | string;
  proposal_key: string;
  payload: Record<string, unknown>;
  evidence: SeedingEvidence;
  state: SeedingProposalState | string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  refuse_reason: string | null;
  resulting_rule_id: string | null;
  resulting_counterparty_id: string | null;
  created_at: string | null;
};

export function toSeedingProposal(raw: unknown): SeedingProposal {
  const o = obj(raw);
  return {
    id: s(o.id) ?? "",
    batch_id: s(o.batch_id) ?? "",
    firm_id: s(o.firm_id) ?? "",
    client_id: s(o.client_id) ?? "",
    proposal_kind: s(o.proposal_kind) ?? "",
    proposal_key: s(o.proposal_key) ?? "",
    payload: obj(o.payload),
    evidence: toSeedingEvidence(o.evidence),
    state: s(o.state) ?? "proposed",
    decided_by: s(o.decided_by),
    decided_at: s(o.decided_at),
    decision_reason: s(o.decision_reason),
    refuse_reason: s(o.refuse_reason),
    resulting_rule_id: s(o.resulting_rule_id),
    resulting_counterparty_id: s(o.resulting_counterparty_id),
    created_at: s(o.created_at),
  };
}

// --- Reads (PostgREST table reads; firm RLS pins them to jwt_firm()) --------------

const BATCH_COLS =
  "id,firm_id,client_id,source_document_id,source_sha256,state,stats,created_by," +
  "created_at,completed_at,completed_by,cancelled_at,cancelled_by,cancel_reason";

export async function listSeedingBatches(
  token: string,
  opts?: { clientId?: string | null; state?: SeedingBatchState | null },
): Promise<SeedingBatch[]> {
  const filters: string[] = [];
  if (opts?.clientId) filters.push(`client_id=eq.${encodeURIComponent(opts.clientId)}`);
  if (opts?.state) filters.push(`state=eq.${opts.state}`);
  const q = `seeding_batches?${filters.length ? filters.join("&") + "&" : ""}select=${BATCH_COLS}&order=created_at.desc`;
  const rows = await pgrestSelect<unknown>(q, token);
  return rows.map(toSeedingBatch);
}

export async function getSeedingBatch(token: string, batchId: string): Promise<SeedingBatch | null> {
  const rows = await pgrestSelect<unknown>(
    `seeding_batches?id=eq.${encodeURIComponent(batchId)}&select=${BATCH_COLS}`,
    token,
  );
  return rows[0] !== undefined ? toSeedingBatch(rows[0]) : null;
}

const PROPOSAL_COLS =
  "id,batch_id,firm_id,client_id,proposal_kind,proposal_key,payload,evidence,state," +
  "decided_by,decided_at,decision_reason,refuse_reason,resulting_rule_id,resulting_counterparty_id,created_at";

/** Every proposal of a batch — kind then age, so the UI's kind-grouping is stable
 *  even before it re-groups. */
export async function listSeedingProposals(token: string, batchId: string): Promise<SeedingProposal[]> {
  const rows = await pgrestSelect<unknown>(
    `seeding_proposals?batch_id=eq.${encodeURIComponent(batchId)}` +
      `&select=${PROPOSAL_COLS}&order=proposal_kind.asc,created_at.asc`,
    token,
  );
  return rows.map(toSeedingProposal);
}

/** True when PostgREST is configured (the house honest "not configured" gate). */
export function seedingPgrestConfigured(): boolean {
  return supabaseBase() !== null;
}

// --- Governed writers (human lane; admin+ floor enforced in-DB; fresh op_key/call) ---

export type SeedingTickResult = {
  proposal_id: string;
  status: string;
  proposal_kind: string;
  counterparty_id: string | null;
  rule_id: string | null;
  /** S6: a ticked wiki_fact dispatches publish_wiki_page_version downstream — the ONLY
   *  truthful "publishing to the wiki" signal (never inferred from proposal_kind alone,
   *  since the DB is the one deciding whether the dispatch is required). */
  wiki_dispatch_required: boolean;
  wiki_source_document_id: string | null;
};

function toTickResult(raw: unknown): SeedingTickResult {
  const o = obj(raw);
  return {
    proposal_id: s(o.proposal_id) ?? "",
    status: s(o.status) ?? "",
    proposal_kind: s(o.proposal_kind) ?? "",
    counterparty_id: s(o.counterparty_id),
    rule_id: s(o.rule_id),
    wiki_dispatch_required: bool(o.wiki_dispatch_required),
    wiki_source_document_id: s(o.wiki_source_document_id),
  };
}

/** ONE independent tick (S4 — admin+, `_human_ctx(role_rank('admin'))`; GRANT
 *  clara_authenticated ONLY). There is NO bulk-tick fn by design — the caller issues
 *  N separate calls, each with its own fresh op_key, and renders each outcome on its
 *  own row (BatchApprove doctrine: one refusal/CLR27 duplicate_live never poisons the
 *  rest of the batch). */
export async function tickSeedingProposal(token: string, proposalId: string): Promise<SeedingTickResult> {
  return toTickResult(await rpc("tick_seeding_proposal", { p_proposal: proposalId, p_op_key: opKey() }, token));
}

/** Decline ONE proposal with a mandatory reason (admin+; DB CLR10s a blank reason). */
export async function declineSeedingProposal(token: string, proposalId: string, reason: string): Promise<void> {
  await rpc("decline_seeding_proposal", { p_proposal: proposalId, p_reason: reason, p_op_key: opKey() }, token);
}

/** Close the batch (admin+). Unticked proposals simply STAY `proposed` — completing
 *  the batch never ticks or declines them; the DB just stamps final counts into
 *  `stats` (S4: "unticked proposals simply stay 'proposed'"). */
export async function completeSeedingBatch(token: string, batchId: string): Promise<void> {
  await rpc("complete_seeding_batch", { p_batch: batchId, p_op_key: opKey() }, token);
}

/** Cancel the OPEN batch with a mandatory reason (admin+; frees the one-open-per-source
 *  slot per `uq_seeding_batches_one_open_source`). */
export async function cancelSeedingBatch(token: string, batchId: string, reason: string): Promise<void> {
  await rpc("cancel_seeding_batch", { p_batch: batchId, p_reason: reason, p_op_key: opKey() }, token);
}

export type { PgrestError };

// --- §3.4 prepare client (RUNTIME lane; the one seeding call that is NOT PostgREST) ---

/** A typed runtime-transport error (§3.5): `{status, code, message}`. Thrown only for
 *  a genuinely unexpected response — the two anticipated non-2xx branches (409 open
 *  batch / 422 unparseable) return a typed result instead, per §3.4. */
export type RuntimeApiError = Error & { status: number; code: string | null };

function runtimeApiError(status: number, code: string | null, message: string): RuntimeApiError {
  const err = new Error(message) as RuntimeApiError;
  err.status = status;
  err.code = code;
  return err;
}

export type SeedingPrepareResult =
  // F-H9: the runtime relays the DB-authored counts VERBATIM — `proposal_count` already
  // INCLUDES the refused ones, so the UI displays it as-is (never a client-side sum).
  | { status: "created"; batchId: string; proposal_count: number | null; refused_count: number | null }
  | { status: "existing"; batchId: string }
  | { status: "unparseable"; reason: string };

/** POST /api/seeding/prepare (§3.4): Bearer session JWT, admin-floored on the runtime
 *  route (the client's firm). Same-origin — `runtimeBase()` is empty in production
 *  (the Cloudflare catch-all forwards /api/*); next.config.mjs proxies it in dev. A 409
 *  with `{existing:true, batchId}` means an open batch already exists for this source —
 *  the honest UI opens THAT batch rather than treating it as a failure; a 422 is the
 *  honest "could not parse this document" surface, not a crash. Any other non-2xx is a
 *  genuine RuntimeApiError. */
export async function prepareSeedingBatch(
  token: string,
  clientId: string,
  documentId: string,
): Promise<SeedingPrepareResult> {
  const base = runtimeBase();
  let res: Response;
  try {
    res = await fetch(`${base}/api/seeding/prepare`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ clientId, documentId }),
      cache: "no-store",
    });
  } catch (e) {
    throw runtimeApiError(0, "network_error", `seeding prepare network error: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 202) {
    return {
      status: "created",
      batchId: s(body.batchId) ?? s(body.batch_id) ?? "",
      proposal_count: n(body.proposal_count),
      refused_count: n(body.refused_count),
    };
  }
  if (res.status === 409) {
    if (body.existing === true) {
      const batchId = s(body.batchId) ?? s(body.batch_id);
      if (batchId) return { status: "existing", batchId };
    }
    throw runtimeApiError(409, s(body.code), s(body.message) ?? "an open seeding batch conflict was not resolvable");
  }
  if (res.status === 422) {
    return { status: "unparseable", reason: s(body.reason) ?? s(body.message) ?? "could not parse this document" };
  }
  throw runtimeApiError(res.status, s(body.code), s(body.message) ?? `seeding prepare failed (${res.status})`);
}
