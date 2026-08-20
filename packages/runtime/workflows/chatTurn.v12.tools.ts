// @frozen
//
// FROZEN — part of the chatTurn_v12 closure (F-A1 PR-3a: widens the coding-lane toolface to
// the witness-pair regime; see autoDraft.v8.tools.ts for the shared M7 finding/rule statement
// — the two toolfaces carry the identical fix). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v11 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export,
// never an in-place edit — the registry repoints `chatTurn:` here).
//
// WHY THIS FILE EXISTS AT ALL (v11's own header asked the v12 author to record the reasoning
// rather than re-derive it). v11 imported chatTurn.v10.tools.js's `buildToolsV10` UNCHANGED —
// that is exactly where `read_document`/`draft_journal_entry`/`readInvoiceFactState` live, and
// v10.tools.ts is FROZEN, so v12 cannot edit it. This file therefore carries its OWN copy of
// the two coding tools (`read_document`, `draft_journal_entry`) and everything they need
// (`readInvoiceFactState` widened, `resolveEvidenceRegions`/`extractRev` byte-carried), and
// REUSES `chatTurn.v11.tools.js`'s `buildToolsV11` BY IMPORT for every tool that did not need
// to change: `list_unassigned_documents`, `clarify`, `get_context_pack`, `trial_balance`,
// `list_journal_entries`, `get_journal_entry`, and the five eta authoring tools. `buildToolsV12`
// below calls `buildToolsV11(ctx)` and then OVERRIDES exactly `read_document` and
// `draft_journal_entry` with this file's own versions, sharing ONE `reads` snapshot map between
// the two overrides (v11's own internal map, private to its closure, is simply unused — the
// two tools it built are shadowed and never invoked).
//
// THE WIDENING ITSELF — byte-identical to autoDraft.v8.tools.ts's `readInvoiceFactState`
// (same M7 selection rule, same confidence correction); see that file's header for the full
// finding. `resolveEvidenceRegions`/`extractRev`/`ReadSnapshots` are UNTOUCHED (byte-carried
// from v10.tools.ts) — the idx->id snapshot-map discipline needs no change for a witness
// document (Annex C's idx-stability cell already covers a witness renumber).
//
// THE DB CONTRACT IS UNCHANGED — clara._write_entry_evidence still resolves by plain
// id-equality; this file's friendly read is advisory only.

import { tool } from "ai";
import { z } from "zod";
import {
  DRAFT_TOOL,
  draftJournalEntryInputSchema,
  type DraftToolResult,
  type JeReviewPart,
} from "./chatTurn.v10.prompt.js";
import {
  refusalFromDbError,
  sessionUnboundRefusal,
  refusalForEvidenceFailure,
  type EvidenceFailure,
  type MislabelledCitation,
  type RegionIdxHint,
} from "./chatTurn.v10.errors.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./chatTurn.v10.infra.js";
import { buildToolsV11 } from "./chatTurn.v11.tools.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** One region of the REAL get_document_extract shape. `extracted_at` is F-A1 PR-1's addition
 *  (M7) — published on every region entry now, read ONLY by the cross-regime resolution
 *  below. See autoDraft.v8.tools.ts's identical type for the field-by-field rationale. */
type ExtractRegion = {
  id?: string;
  idx?: number;
  extraction_id?: string;
  engine_kind?: string;
  version_n?: number;
  extracted_at?: string;
  field_path?: string;
  monetary_cents?: number | null;
  engine_confidence?: number | null;
  locator?: { page?: number; polygon?: unknown } | null;
  text_content?: string | null;
};

function normalizeCurrency(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const c = text.replace(/[^A-Za-z]/g, "").toUpperCase();
  return c.length > 0 ? c : null;
}

/** ONE regime's resolved latest generation — see autoDraft.v8.tools.ts's identical helper.
 *  `extractedAt` is null when unreadable; below (`?? -Infinity`) a null clock LOSES to a
 *  readable one, and two null clocks tie — the tie, like any tie, prefers witness (§3.3). */
type RegimeGeneration = { rows: ExtractRegion[]; extractedAt: number | null; requiresConfidence: boolean };

function resolveRegimeGeneration(regions: readonly ExtractRegion[], kind: string, requiresConfidence: boolean): RegimeGeneration | null {
  const rowsOfKind = regions.filter((r) => r?.engine_kind === kind);
  if (rowsOfKind.length === 0) return null;
  const latest = Math.max(...rowsOfKind.map((r) => Number(r.version_n ?? 0)));
  const rows = rowsOfKind.filter((r) => Number(r.version_n ?? 0) === latest);
  const rawAt = rows.find((r) => typeof r.extracted_at === "string")?.extracted_at;
  const parsed = rawAt ? Date.parse(rawAt) : NaN;
  return { rows, extractedAt: Number.isFinite(parsed) ? parsed : null, requiresConfidence };
}

/** M7 selection rule (design §3.8 / Annex B row M7) — filters to BOTH regimes' kinds, resolves
 *  each regime's own latest generation, and (only when both are present) picks the winner by
 *  `extracted_at` alone, never cross-regime `Math.max(version_n)`; a clock tie prefers witness
 *  (§3.3). A legacy-only document is byte-identical to v10's. The confidence term applies to
 *  the legacy regime alone — a witness winner never applies it (engine_confidence is NULL
 *  there by design, §3.4; the real DB gate has excluded the term structurally since 0023). */
function readInvoiceFactState(extract: unknown): {
  verifiedTotalCents: number | null;
  corroborated: boolean;
  explicitNonMyr: boolean;
} {
  const regions = ((extract as { regions?: unknown } | null)?.regions ?? []) as ExtractRegion[];
  if (!Array.isArray(regions) || regions.length === 0) {
    return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };
  }
  const legacy = resolveRegimeGeneration(regions, "invoice_facts", true);
  const witness = resolveRegimeGeneration(regions, "llm_text_facts", false);
  if (!legacy && !witness) return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };

  let winner: RegimeGeneration;
  if (legacy && witness) {
    winner = (witness.extractedAt ?? -Infinity) >= (legacy.extractedAt ?? -Infinity) ? witness : legacy;
  } else {
    winner = (legacy ?? witness) as RegimeGeneration;
  }

  const rows = winner.rows;
  const totals = rows.filter((r) => r.field_path === "invoice.total");
  const totalRow = totals[0];
  const totalCents =
    totalRow && typeof totalRow.monetary_cents === "number" && Number.isFinite(totalRow.monetary_cents) ? totalRow.monetary_cents : null;
  const polygon = (totalRow?.locator as { polygon?: unknown } | null | undefined)?.polygon;
  const hasGeometry = Array.isArray(polygon) && polygon.length > 0;
  const conf = typeof totalRow?.engine_confidence === "number" ? totalRow.engine_confidence : 0;
  const confidenceOk = winner.requiresConfidence ? conf >= 0.95 : true;

  const currency = normalizeCurrency(rows.find((r) => r.field_path === "invoice.currency")?.text_content);
  const corroborated = totals.length === 1 && totalCents != null && totalCents > 0 && confidenceOk && hasGeometry && currency === "MYR";
  const explicitNonMyr = currency != null && currency !== "MYR";
  return { verifiedTotalCents: corroborated ? totalCents : null, corroborated, explicitNonMyr };
}

/** Byte-carried from chatTurn.v10.tools.ts — see that file for the full rationale. */
export type DraftEvidence = DraftInput["evidence"][number];
export type ResolvedEvidence = { region_id: string; quote: string; field_path?: string };
export type EvidenceResolution = { ok: true; evidence: ResolvedEvidence[] } | { ok: false; failure: EvidenceFailure };

export type ReadSnapshots = Map<string, string>;
export function newReadSnapshots(): ReadSnapshots {
  return new Map<string, string>();
}

/** THE SNAPSHOT REV — byte-carried from chatTurn.v10.tools.ts (see that file's header for the
 *  full rationale: a canonical (idx -> region id) mapping, compared for equality in-step). */
export function extractRev(extract: unknown): string {
  const raw = (extract as { regions?: unknown } | null)?.regions;
  const regions = (Array.isArray(raw) ? raw : []) as ExtractRegion[];
  const parts: string[] = [];
  for (const r of regions) {
    const idx = typeof r?.idx === "number" && Number.isInteger(r.idx) ? r.idx : null;
    const id = typeof r?.id === "string" && r.id.length > 0 ? r.id : null;
    if (idx === null || id === null) continue;
    parts.push(`${idx}:${id}@${String(r.extraction_id ?? "")}#${String(r.version_n ?? "")}`);
  }
  parts.sort();
  return `${parts.length}|${parts.join("|")}`;
}

/** F9 (ADR-064 §3) + THE FIX ROUND — byte-carried from chatTurn.v10.tools.ts. Resolves each
 *  cited `region_idx` to its region_id BY THE `idx` FIELD, only inside the snapshot the model
 *  actually read this run; see v10's own header for the measured renumbering hazard this
 *  closes and the five fail-closed gates. Pure — no DB, no model, no clock. */
export function resolveEvidenceRegions(
  extract: unknown,
  evidence: readonly DraftEvidence[],
  readRev: string | undefined,
): EvidenceResolution {
  const citedAll = evidence.map((e) => e.region_idx);
  if (readRev === undefined) {
    return { ok: false, failure: { kind: "system", reason: "evidence_not_read", citedIdx: citedAll, valid: [] } };
  }
  if (extractRev(extract) !== readRev) {
    return { ok: false, failure: { kind: "system", reason: "evidence_snapshot_changed", citedIdx: citedAll, valid: [] } };
  }

  const raw = (extract as { regions?: unknown } | null)?.regions;
  const regions = (Array.isArray(raw) ? raw : []) as ExtractRegion[];
  const byIdx = new Map<number, ExtractRegion>();
  for (const r of regions) {
    const idx = typeof r?.idx === "number" && Number.isInteger(r.idx) ? r.idx : null;
    const id = typeof r?.id === "string" && r.id.length > 0 ? r.id : null;
    if (idx === null || id === null) continue;
    if (byIdx.has(idx)) {
      return { ok: false, failure: { kind: "system", reason: "evidence_index_ambiguous", citedIdx: [idx], valid: [] } };
    }
    byIdx.set(idx, r);
  }
  if (byIdx.size === 0) {
    return { ok: false, failure: { kind: "system", reason: "evidence_index_unavailable", citedIdx: citedAll, valid: [] } };
  }

  const resolved: ResolvedEvidence[] = [];
  const unknown: number[] = [];
  const mislabelled: MislabelledCitation[] = [];
  for (const e of evidence) {
    const hit = byIdx.get(e.region_idx);
    const id = typeof hit?.id === "string" ? hit.id : null;
    if (hit === undefined || id === null) {
      unknown.push(e.region_idx);
      continue;
    }
    const actual = typeof hit.field_path === "string" && hit.field_path.length > 0 ? hit.field_path : null;
    if ((actual ?? "") !== e.field_path) {
      mislabelled.push({ idx: e.region_idx, cited: e.field_path, actual });
      continue;
    }
    resolved.push({ region_id: id, quote: e.quote, ...(actual === null ? {} : { field_path: actual }) });
  }
  if (unknown.length > 0) {
    const valid: RegionIdxHint[] = [...byIdx.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, r]) => ({ idx, field_path: typeof r.field_path === "string" ? r.field_path : null }));
    return { ok: false, failure: { kind: "system", reason: "evidence_index_unknown", citedIdx: unknown, valid } };
  }
  if (mislabelled.length > 0) return { ok: false, failure: { kind: "mislabelled", entries: mislabelled } };
  return { ok: true, evidence: resolved };
}

/** The draft_journal_entry wrapper — byte-carried from chatTurn.v10.tools.ts EXCEPT it calls
 *  the widened `readInvoiceFactState` above; everything else (the session-unbound check, the
 *  server-side reads, the writer args, the receipt handling) is unchanged. */
export async function runDraftJournalEntry(ctx: ToolCtx, input: DraftInput, reads: ReadSnapshots): Promise<DraftToolResult> {
  const clientId = ctx.clientId;
  if (!clientId) return { ok: false, refusal: sessionUnboundRefusal() };
  try {
    const server = await readScoped(ctx, async (c: PgExec) => {
      const fr = await c.query(
        `select d.sha256, f.id as filing_id, f.resolution_id
           from clara.document_filings f
           join clara.documents d on d.id = f.document_id and d.firm_id = f.firm_id
          where f.document_id = $1 and f.client_id = $2 and f.retired_at is null
            and d.bytes_verified_at is not null
          limit 1`,
        [input.document_id, clientId],
      );
      const filing = fr.rows[0] ?? null;
      const packRow = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, "coding"]);
      const pack = (packRow.rows[0]?.pack ?? {}) as { books_version?: number };
      let extract: unknown = null;
      try {
        const ex = await c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [input.document_id, clientId]);
        extract = ex.rows[0]?.x ?? null;
      } catch {
        extract = null; // facts not available (Tier B); the DB is the backstop.
      }
      return { filing, booksVersion: pack.books_version ?? null, extract };
    });

    const filing = server.filing as { sha256: string; filing_id: string; resolution_id: string | null } | null;
    if (!filing) return { ok: false, refusal: refusalFromDbError({ code: "CLR02" }) };

    const facts = readInvoiceFactState(server.extract);
    if (facts.explicitNonMyr) {
      return { ok: false, refusal: refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }) };
    }
    const detectedTier: "verified" | "model_read" = facts.corroborated ? "verified" : "model_read";

    const cited = resolveEvidenceRegions(server.extract, input.evidence, reads.get(input.document_id));
    if (!cited.ok) {
      return { ok: false, refusal: refusalForEvidenceFailure(cited.failure) };
    }
    const partPayload = {
      client_id: clientId,
      document_id: input.document_id,
      provenance_tier: detectedTier,
      uncertainty: input.uncertainty ?? null,
    };
    const coding = { task_id: ctx.taskId, part_payload: partPayload };
    const opKey = `code-doc:${ctx.taskId}:${input.document_id}`;

    const receipt = await writeScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        `select clara.wake_draft_entry(
           $1::uuid, $2::uuid, $3::date, $4::text, $5::jsonb,
           $6::uuid, $7::text, $8::jsonb, $9::text, $10::bigint,
           $11::jsonb, $12::jsonb, $13::jsonb, $14::text
         ) as receipt`,
        [
          clientId,
          filing.resolution_id,
          input.posting_date,
          input.memo ?? null,
          JSON.stringify(input.lines),
          input.document_id,
          filing.sha256,
          "{}",
          opKey,
          server.booksVersion,
          input.counterparty ? JSON.stringify(input.counterparty) : null,
          JSON.stringify(cited.evidence),
          JSON.stringify(coding),
          input.coding_kind === "journal_entry" ? null : input.coding_kind,
        ],
      );
      return (r.rows[0]?.receipt ?? {}) as {
        entry_id?: string;
        revision_token?: string;
        provenance_tier?: string;
        exception?: boolean;
      };
    });

    if (!receipt.entry_id || !receipt.revision_token) return { ok: false, refusal: refusalFromDbError({ code: "internal" }) };
    const tier: "verified" | "model_read" =
      receipt.provenance_tier === "verified" || receipt.provenance_tier === "model_read" ? receipt.provenance_tier : detectedTier;
    const je_review: JeReviewPart = {
      type: "je_review",
      entry_id: String(receipt.entry_id),
      revision_token: String(receipt.revision_token),
      client_id: clientId,
      document_id: input.document_id,
      provenance_tier: tier,
      ...(receipt.exception === true ? { exception: true } : {}),
      uncertainty: input.uncertainty,
    };
    return { ok: true, je_review };
  } catch (e) {
    return { ok: false, refusal: refusalFromDbError(e as { code?: string; detail?: string; constraint?: string }) };
  }
}

/** Build the v12 tool set: v11's FULL set by import (list_unassigned_documents, clarify, and —
 *  when client-bound — get_context_pack/trial_balance/list_journal_entries/get_journal_entry
 *  plus the five eta authoring tools) with `read_document` and `draft_journal_entry` OVERRIDDEN
 *  by this file's widened versions, sharing ONE `reads` snapshot map between the two. v11's own
 *  internal read_document/draft_journal_entry (and their private `reads` map) are shadowed and
 *  never invoked — dead but harmless. */
export function buildToolsV12(ctx: ToolCtx) {
  const base = buildToolsV11(ctx);
  const clientId = ctx.clientId;
  const reads = newReadSnapshots();
  const readDocument = tool({
    description:
      "Read one document's stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",
    inputSchema: z.object({ document_id: z.string().uuid() }),
    execute: ({ document_id }: { document_id: string }) =>
      safeRead(() =>
        readScoped(ctx, (c) =>
          c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [document_id, clientId]).then((r) => {
            const extract = r.rows[0]?.x ?? null;
            reads.set(document_id, extractRev(extract));
            return extract;
          }),
        ),
      ),
  });
  if (!clientId) return { ...base, read_document: readDocument };
  return {
    ...base,
    read_document: readDocument,
    [DRAFT_TOOL]: tool({
      description:
        "Draft ONE journal entry for a human to review: a supplier bill — with NO stated tax, or a stated ZERO tax, in the facts, " +
        "expense debit(s) GROSS + an Accounts Payable credit GROSS with the supplier; with a STATED NONZERO tax, expense debit(s) NET + " +
        "ONE sst_purchase_cost debit equal EXACTLY to the stated tax + the Accounts Payable credit GROSS — " +
        "a sales invoice (Trade Debtors debit gross + revenue credit net, + an SST output credit when the document states tax), " +
        "a sales credit note (the exact mirror), or a generic journal_entry mirroring a voucher's own stated debits and credits. " +
        "This is a proposal, not a posting: it produces a review card a bookkeeper approves. " +
        "Provide coding_kind, lines, document_id, an evidence array citing each amount by its region `idx` from " +
        "read_document (never a region id), and the counterparty (required except on a journal_entry) — " +
        "prefer an existing counterparty_id (from list_journal_entries/get_journal_entry) over proposing a new name when the vendor " +
        "or customer is already established for this client.",
      inputSchema: draftJournalEntryInputSchema,
      execute: (input: DraftInput) => runDraftJournalEntry(ctx, input, reads),
    }),
  };
}
