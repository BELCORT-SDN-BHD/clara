// The carry-down workbench wire client (LANE D3; settled plan §3.2/§3.3/§3.5). Two
// lanes, never mixed (the Wave-A split): HUMAN lane = Supabase PostgREST as
// clara_authenticated — every governed opening writer + the RLS table reads (0017
// grants G2); RUNTIME lane = the same-origin /api/opening/* route (F6) for the
// deterministic parse action only. Governance NEVER transits the runtime. Every writer
// carries a FRESH op_key (the DB is idempotent on firm,fn,op_key); the two serializable
// approval fns retry the SAME op_key once on a 40001 (F10). NO figure is computed
// client-side; every count/amount is DB-authored.

import { pgrestSelect, rpc } from "./wire";
import type { PgrestError } from "./wire";
import {
  toDryRun,
  type OpeningSeedRow,
  type OpeningTargetRow,
  type OpeningItemRow,
  type ApprovalSetEntry,
  type OpeningDryRun,
  type OpeningItemKind,
  type ParseResult,
} from "../opening/openingModel";

const opKey = () => crypto.randomUUID();

// A typed runtime-lane error (§3.5). PostgREST refusals keep the wire.ts PgrestError
// shape; the runtime parse route throws this instead.
export class RuntimeApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "RuntimeApiError";
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Reads (firm-scoped RLS table reads; 0017 grants opening_* SELECT to
// clara_authenticated with a firm_id=jwt_firm() policy). Every column is DB-owned.
// ---------------------------------------------------------------------------

const SEED_COLS =
  "id,client_id,plan_id,as_of,state,tie_document_id,tie_document_sha256,batch_n,finalized_at,created_at";

/** Opening seeds in scope (firm-wide or one client), newest first. */
export async function listOpeningSeeds(token: string, clientId?: string | null): Promise<OpeningSeedRow[]> {
  const filter = clientId ? `client_id=eq.${encodeURIComponent(clientId)}&` : "";
  return pgrestSelect<OpeningSeedRow>(
    `opening_seed_registry?${filter}select=${SEED_COLS}&order=created_at.desc`,
    token,
  );
}

export async function getOpeningSeed(token: string, seedId: string): Promise<OpeningSeedRow | null> {
  const rows = await pgrestSelect<OpeningSeedRow>(
    `opening_seed_registry?id=eq.${encodeURIComponent(seedId)}&select=${SEED_COLS}&limit=1`,
    token,
  );
  return rows[0] ?? null;
}

/** The onboarding plan for a client (scope_kind='client'), for the seed's plan_id and
 *  the approve CAS revision token. */
export async function getClientPlan(
  token: string,
  clientId: string,
): Promise<{ id: string; revision_token: string; state: string } | null> {
  const rows = await pgrestSelect<{ id: string; revision_token: string; state: string }>(
    `onboarding_plans?client_id=eq.${encodeURIComponent(clientId)}&scope_kind=eq.client` +
      `&select=id,revision_token,state&order=created_at.desc&limit=1`,
    token,
  );
  return rows[0] ?? null;
}

export async function getPlanRevision(token: string, planId: string): Promise<string | null> {
  const rows = await pgrestSelect<{ revision_token: string }>(
    `onboarding_plans?id=eq.${encodeURIComponent(planId)}&select=revision_token&limit=1`,
    token,
  );
  return rows[0]?.revision_token ?? null;
}

// The tie-document picker: verified opening_balance_doc / management_account documents
// with an ACTIVE filing to the client. Two reads (active filings → their documents),
// merged — robust against composite-FK embed ambiguity.
export type TieDocument = {
  document_id: string;
  sha256: string;
  document_kind: string;
  filename: string | null;
  financial_date: string | null;
  filed_at: string | null;
};

export async function listOpeningTieDocuments(token: string, clientId: string): Promise<TieDocument[]> {
  const filings = await pgrestSelect<{ document_id: string; filed_at: string | null }>(
    `document_filings?client_id=eq.${encodeURIComponent(clientId)}&retired_at=is.null` +
      `&select=document_id,filed_at&order=filed_at.desc`,
    token,
  );
  const ids = Array.from(new Set(filings.map((f) => f.document_id))).filter(Boolean);
  if (ids.length === 0) return [];
  const list = ids.map((i) => encodeURIComponent(i)).join(",");
  const docs = await pgrestSelect<{
    id: string;
    sha256: string;
    document_kind: string | null;
    original_filename: string | null;
    bytes_verified_at: string | null;
    financial_date: string | null;
  }>(
    `documents?id=in.(${list})&document_kind=in.(opening_balance_doc,management_account)` +
      `&bytes_verified_at=not.is.null&select=id,sha256,document_kind,original_filename,bytes_verified_at,financial_date`,
    token,
  );
  const filedAt = new Map(filings.map((f) => [f.document_id, f.filed_at]));
  return docs.map((d) => ({
    document_id: d.id,
    sha256: d.sha256,
    document_kind: d.document_kind ?? "—",
    filename: d.original_filename,
    financial_date: d.financial_date,
    filed_at: filedAt.get(d.id) ?? null,
  }));
}

/** The active filing (resolution_id) of the tie document for the client — draft_opening_item
 *  binds document-primary carry-down to this exact filing/resolution. */
export async function getActiveFilingResolution(
  token: string,
  documentId: string,
  clientId: string,
): Promise<string | null> {
  const rows = await pgrestSelect<{ resolution_id: string | null }>(
    `document_filings?document_id=eq.${encodeURIComponent(documentId)}` +
      `&client_id=eq.${encodeURIComponent(clientId)}&retired_at=is.null` +
      `&select=resolution_id&order=filed_at.desc&limit=1`,
    token,
  );
  return rows[0]?.resolution_id ?? null;
}

const TARGET_COLS =
  "id,line_key,account_code,source_label,debit_cents,credit_cents,provenance_kind,document_id,entered_by";

export async function listOpeningTargets(token: string, seedId: string): Promise<OpeningTargetRow[]> {
  return pgrestSelect<OpeningTargetRow>(
    `opening_tb_targets?seed_id=eq.${encodeURIComponent(seedId)}&select=${TARGET_COLS}&order=line_key.asc`,
    token,
  );
}

const ITEM_COLS =
  "id,item_kind,item_key,entry_id,state,amount_cents,counterparty_id,fixed_asset_id," +
  "item_ref,item_date,supersedes_item_id,superseded_by_item";

export async function listOpeningItems(token: string, seedId: string): Promise<OpeningItemRow[]> {
  return pgrestSelect<OpeningItemRow>(
    `opening_items?seed_id=eq.${encodeURIComponent(seedId)}&select=${ITEM_COLS}&order=item_key.asc`,
    token,
  );
}

/** The dry-run (get_opening_dryrun): DB-computed per-line deltas, OBE net, unmapped
 *  labels, missing must-asks. Every figure verbatim. */
export async function getOpeningDryrun(token: string, seedId: string): Promise<OpeningDryRun | null> {
  return toDryRun(await rpc("get_opening_dryrun", { p_seed: seedId }, token));
}

// The approval-set read (F9): the seed's DRAFT opening entries with their revision
// tokens, makers, and posting dates — display only, no client-side arithmetic. Every
// draft opening/reversal entry stamps flags.opening_seed_id, so one journal_entries
// read captures the whole set (including replacement-case reversal entries that carry
// no opening_items row); the items read supplies the display label.
export async function getApprovalSet(token: string, seedId: string): Promise<ApprovalSetEntry[]> {
  const entries = await pgrestSelect<{
    id: string;
    revision_token: string;
    last_human_editor: string | null;
    posting_date: string | null;
    memo: string | null;
    reversal_of: string | null;
  }>(
    `journal_entries?flags->>opening_seed_id=eq.${encodeURIComponent(seedId)}&status=eq.draft` +
      `&select=id,revision_token,last_human_editor,posting_date,memo,reversal_of&order=posting_date.asc,id.asc`,
    token,
  );
  const items = await listOpeningItems(token, seedId);
  const byEntry = new Map<string, OpeningItemRow>();
  for (const it of items) byEntry.set(it.entry_id, it);
  return entries.map((e): ApprovalSetEntry => {
    const it = byEntry.get(e.id) ?? null;
    return {
      entry_id: e.id,
      revision_token: e.revision_token,
      maker: e.last_human_editor,
      posting_date: e.posting_date,
      memo: e.memo,
      is_reversal: e.reversal_of !== null,
      item_kind: (it?.item_kind as OpeningItemKind | undefined) ?? null,
      item_key: it?.item_key ?? null,
      supersedes_item_id: it?.supersedes_item_id ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Governed writers (HUMAN lane; fresh op_key per call). Refusals throw PgrestError
// (clr + reason) so the shared refusal UI renders them verbatim.
// ---------------------------------------------------------------------------

export async function createOpeningSeed(
  token: string,
  args: { clientId: string; planId: string; asOf: string; tieDocumentId: string | null; tieSha256: string | null },
): Promise<{ seed_id: string }> {
  const out = (await rpc(
    "create_opening_seed",
    {
      p_client: args.clientId,
      p_plan: args.planId,
      p_as_of: args.asOf,
      p_tie_document: args.tieDocumentId,
      p_tie_sha256: args.tieSha256,
      p_op_key: opKey(),
    },
    token,
  )) as { seed_id?: string } | null;
  if (!out?.seed_id) throw new Error("create_opening_seed returned no seed_id");
  return { seed_id: out.seed_id };
}

export async function cancelOpeningSeed(token: string, seedId: string, reason: string): Promise<void> {
  await rpc("cancel_opening_seed", { p_seed: seedId, p_reason: reason, p_op_key: opKey() }, token);
}

export async function reopenOpeningSeed(token: string, seedId: string, reason: string): Promise<void> {
  await rpc("reopen_opening_seed", { p_seed: seedId, p_reason: reason, p_op_key: opKey() }, token);
}

/** Record ONE keyed target line (keyed-fallback seeds only; the DB refuses a document
 *  seed here with parsed_target_writer_required). */
export async function recordOpeningTarget(token: string, seedId: string, line: Record<string, unknown>): Promise<void> {
  await rpc("record_opening_target", { p_seed: seedId, p_line: line, p_op_key: opKey() }, token);
}

/** The LIVE keyed client-attribution resolution for THIS seed, if one exists. F-C1: a
 *  keyed seed's attribution is an EXPLICIT once-per-seed human act (the seed-workbench
 *  "Confirm client attribution" verb), never a draft-path side effect — so it is stamped
 *  with `evidence.seed_id = <seed>` and read back here. Returns the resolution id or null.
 *  (client_resolutions SELECT is granted to clara_authenticated with a firm RLS policy; 0003.) */
export async function getKeyedSeedResolution(token: string, seedId: string): Promise<string | null> {
  const rows = await pgrestSelect<{ id: string }>(
    `client_resolutions?subject_kind=eq.manual&superseded_at=is.null` +
      `&evidence->>seed_id=eq.${encodeURIComponent(seedId)}&select=id&order=created_at.desc&limit=1`,
    token,
  );
  return rows[0]?.id ?? null;
}

/** Mint the ONE keyed client-attribution resolution for a seed (F-C1 — the EXPLICIT human
 *  attribution act on the keyed seed workbench, not a draft-path side effect). draft_opening_item
 *  needs a client attribution even with no tie document — assert_client_resolved with a null
 *  document accepts any human resolution ≥0.95 for the client. Subject_kind='manual', method
 *  human, confidence 1.0; the evidence carries `seed_id` so the workbench reads it back and every
 *  keyed draft form consumes it. record_client_resolution floors at bookkeeper+ (CLR03 otherwise). */
export async function recordKeyedClientResolution(token: string, clientId: string, seedId: string): Promise<string> {
  const out = (await rpc(
    "record_client_resolution",
    {
      p_client: clientId,
      p_subject_kind: "manual",
      p_subject: clientId,
      p_confidence: 1.0,
      p_method: "human",
      p_evidence: { source: "opening_keyed_seed", seed_id: seedId },
      p_op_key: opKey(),
    },
    token,
  )) as { resolution_id?: string } | null;
  if (!out?.resolution_id) throw new Error("record_client_resolution returned no resolution_id");
  return out.resolution_id;
}

export async function draftOpeningItem(
  token: string,
  args: {
    clientId: string;
    seedId: string;
    item: Record<string, unknown>;
    lines: unknown[] | null;
    resolution: string | null;
    document: string | null;
    sha256: string | null;
  },
): Promise<{ item_id: string; entry_id: string; revision_token: string }> {
  const out = (await rpc(
    "draft_opening_item",
    {
      p_client: args.clientId,
      p_seed: args.seedId,
      p_item: args.item,
      p_lines: args.lines,
      p_resolution: args.resolution,
      p_document: args.document,
      p_sha256: args.sha256,
      p_op_key: opKey(),
    },
    token,
  )) as { item_id?: string; entry_id?: string; revision_token?: string } | null;
  if (!out?.item_id || !out?.entry_id) throw new Error("draft_opening_item returned no item");
  return { item_id: out.item_id, entry_id: out.entry_id, revision_token: out.revision_token ?? "" };
}

export async function seedFixedAsset(
  token: string,
  clientId: string,
  seedId: string,
  asset: Record<string, unknown>,
): Promise<{ item_id: string; entry_id: string; fixed_asset_id: string | null }> {
  const out = (await rpc(
    "seed_fixed_asset",
    { p_client: clientId, p_seed: seedId, p_asset: asset, p_op_key: opKey() },
    token,
  )) as { item_id?: string; entry_id?: string; fixed_asset_id?: string } | null;
  if (!out?.item_id || !out?.entry_id) throw new Error("seed_fixed_asset returned no item");
  return { item_id: out.item_id, entry_id: out.entry_id, fixed_asset_id: out.fixed_asset_id ?? null };
}

export async function supersedeOpeningItem(
  token: string,
  itemId: string,
  replacement: Record<string, unknown> | null,
): Promise<void> {
  await rpc("supersede_opening_item", { p_item: itemId, p_replacement: replacement, p_op_key: opKey() }, token);
}

// The two serializable approval fns. A 40001 (serialization_failure) means the txn
// rolled back under a concurrent live approval; the wire retries the SAME op_key ONCE
// (F10) — idempotent on the DB. Any other refusal (CLR05 self_attestation, CLR31
// tie_mismatch, revision_mismatch) throws for verbatim rendering.
async function rpcSerializableOnce(fn: string, args: Record<string, unknown>, token: string): Promise<void> {
  const key = opKey();
  try {
    await rpc(fn, { ...args, p_op_key: key }, token);
  } catch (e) {
    const pe = e as PgrestError;
    if (pe.pgCode === "40001") {
      await rpc(fn, { ...args, p_op_key: key }, token);
      return;
    }
    throw e;
  }
}

/** approve_opening_seed (K5, initial/additive). p_entry_revisions is the AMB-3 object
 *  map {entry_id: revision_token} built from the approval-set read. attestation is null
 *  unless the DB self-approval path requires it. */
export async function approveOpeningSeed(
  token: string,
  args: {
    seedId: string;
    expectedPlanRevision: string;
    tieSha256: string | null;
    entryRevisions: Record<string, string>;
    attestation: string | null;
  },
): Promise<void> {
  await rpcSerializableOnce(
    "approve_opening_seed",
    {
      p_seed: args.seedId,
      p_expected_plan_revision: args.expectedPlanRevision,
      p_tie_document_sha256: args.tieSha256,
      p_entry_revisions: args.entryRevisions,
      p_attestation: args.attestation,
    },
    token,
  );
}

/** approve_opening_correction (K6). Same AMB-3 revision map; no plan/tie args. */
export async function approveOpeningCorrection(
  token: string,
  args: { seedId: string; entryRevisions: Record<string, string>; attestation: string | null },
): Promise<void> {
  await rpcSerializableOnce(
    "approve_opening_correction",
    { p_seed: args.seedId, p_entry_revisions: args.entryRevisions, p_attestation: args.attestation },
    token,
  );
}

// ---------------------------------------------------------------------------
// Runtime lane — the deterministic parse action (§3.3). Same-origin POST; the dev
// rewrite / prod Pages Function forwards /api/opening/* to the runtime. The 422
// unparseable is the keyed-fallback signal D3 surfaces; a 409 is a typed refusal.
// ---------------------------------------------------------------------------

export async function parseOpeningTargets(token: string, seedId: string): Promise<ParseResult> {
  const res = await fetch(`/api/opening/parse-targets`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ seedId }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    lines?: number;
    reason?: string;
    code?: string;
    message?: string;
  };
  if (res.status === 202 || body.status === "parsed") {
    return { status: "parsed", lines: typeof body.lines === "number" ? body.lines : 0 };
  }
  if (res.status === 422 || body.status === "unparseable") {
    return { status: "unparseable", reason: body.reason ?? "the tie document could not be parsed into trial-balance lines" };
  }
  return {
    status: "refused",
    code: body.code ?? null,
    message: body.message ?? `parse-targets failed (${res.status})`,
  };
}

export { RuntimeApiError as OpeningRuntimeError };
