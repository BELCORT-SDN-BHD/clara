// @frozen
//
// FROZEN — the autoDraft_v2 tool set + the draft_journal_entry write-floor wrapper
// (contract §3 / companion §4). Split from the impl to hold the file cap. Because the sweep
// task is ALWAYS bound to one client + one document (the admission row), every read is
// client-pinned and the write codes THAT document. The model supplies only business content;
// the wrapper fetches sha256 / resolution / books_version / Tier-A facts SERVER-side and
// stamps the coding_kind marker + the stable op_key. The DB is the authoritative Tier-A +
// supplier-bill-shape enforcer; the wrapper's checks are a friendly early backstop. There is
// NO clarify tool — the sweep is unattended.

import { tool } from "ai";
import { z } from "zod";
import {
  DRAFT_TOOL,
  draftJournalEntryInputSchema,
  type DraftToolResult,
  type JeReviewPart,
} from "./autoDraft.v2.prompt.js";
import { refusalFromDbError } from "./autoDraft.v2.errors.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./autoDraft.v2.infra.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** One region of the get_document_extract shape (regions[] of a done extraction). */
type ExtractRegion = {
  engine_kind?: string;
  version_n?: number;
  field_path?: string;
  monetary_cents?: number | null;
  engine_confidence?: number | null;
  locator?: { page?: number; polygon?: unknown } | null;
  text_content?: string | null;
};

/** Normalize a currency quote to its bare uppercase alpha code (e.g. "RM"/"MYR"). */
function normalizeCurrency(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const c = text.replace(/[^A-Za-z]/g, "").toUpperCase();
  return c.length > 0 ? c : null;
}

/** Read the invoice-facts corroboration signals off the get_document_extract shape (identical
 *  logic to the chat lane's friendly early read; the DB is the authoritative enforcer). */
export function readInvoiceFactState(extract: unknown): {
  verifiedTotalCents: number | null;
  corroborated: boolean;
  explicitNonMyr: boolean;
} {
  const regions = ((extract as { regions?: unknown } | null)?.regions ?? []) as ExtractRegion[];
  if (!Array.isArray(regions) || regions.length === 0) {
    return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };
  }
  const facts = regions.filter((r) => r?.engine_kind === "invoice_facts");
  if (facts.length === 0) return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };
  const latest = Math.max(...facts.map((r) => Number(r.version_n ?? 0)));
  const rows = facts.filter((r) => Number(r.version_n ?? 0) === latest);

  const totals = rows.filter((r) => r.field_path === "invoice.total");
  const totalRow = totals[0];
  const totalCents =
    totalRow && typeof totalRow.monetary_cents === "number" && Number.isFinite(totalRow.monetary_cents) ? totalRow.monetary_cents : null;
  const polygon = (totalRow?.locator as { polygon?: unknown } | null | undefined)?.polygon;
  const hasGeometry = Array.isArray(polygon) && polygon.length > 0;
  const conf = typeof totalRow?.engine_confidence === "number" ? totalRow.engine_confidence : 0;

  const currency = normalizeCurrency(rows.find((r) => r.field_path === "invoice.currency")?.text_content);
  const corroborated = totals.length === 1 && totalCents != null && totalCents > 0 && conf >= 0.95 && hasGeometry && currency === "MYR";
  const explicitNonMyr = currency != null && currency !== "MYR";
  return { verifiedTotalCents: corroborated ? totalCents : null, corroborated, explicitNonMyr };
}

/**
 * The draft_journal_entry wrapper (exported for direct unit testing). Fetches authoritative
 * values server-side, runs the tier check, then executes the DB writer through the write
 * floor. Never throws — always resolves to a typed result. The sweep task is client- and
 * document-bound: a draft naming a DIFFERENT document than the task's is refused (CLR11).
 */
export async function runDraftJournalEntry(ctx: ToolCtx, input: DraftInput): Promise<DraftToolResult> {
  const clientId = ctx.clientId;
  if (input.document_id !== ctx.documentId) {
    return { ok: false, refusal: refusalFromDbError({ code: "CLR11" }) };
  }
  try {
    // 1. Server-side authoritative reads (client-pinned, one wake-scoped txn).
    const server = await readScoped(ctx, async (c: PgExec) => {
      const fr = await c.query(
        `select d.sha256, f.id as filing_id, f.resolution_id
           from clara.document_filings f
           join clara.documents d on d.id = f.document_id and d.firm_id = f.firm_id
          where f.document_id = $1 and f.client_id = $2 and f.retired_at is null
            and d.bytes_verified_at is not null
          limit 1`,
        [ctx.documentId, clientId],
      );
      const filing = fr.rows[0] ?? null;
      const packRow = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, "coding"]);
      const pack = (packRow.rows[0]?.pack ?? {}) as { books_version?: number };
      let extract: unknown = null;
      try {
        const ex = await c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [ctx.documentId, clientId]);
        extract = ex.rows[0]?.x ?? null;
      } catch {
        extract = null; // facts not available (Tier B); the DB is the backstop.
      }
      return { filing, booksVersion: pack.books_version ?? null, extract };
    });

    const filing = server.filing as { sha256: string; filing_id: string; resolution_id: string | null } | null;
    if (!filing) return { ok: false, refusal: refusalFromDbError({ code: "CLR02" }) };

    // Friendly early reads off the AUTHORITATIVE extract shape. Explicit non-MYR refuses early
    // (the DB also refuses at both tiers). A machine/proposed total MISMATCH is NOT refused
    // here: the draft proceeds and the DB persists it as a reviewable flags.amount_exception.
    const facts = readInvoiceFactState(server.extract);
    if (facts.explicitNonMyr) {
      return { ok: false, refusal: refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }) };
    }
    const detectedTier: "verified" | "model_read" = facts.corroborated ? "verified" : "model_read";

    // 2. Assemble writer args. The model NEVER supplies sha256/books/op_key/resolution.
    const partPayload = {
      client_id: clientId,
      document_id: ctx.documentId,
      provenance_tier: detectedTier,
      uncertainty: input.uncertainty ?? null,
    };
    const coding = { task_id: ctx.taskId, part_payload: partPayload };
    const opKey = `code-doc:${ctx.taskId}:${ctx.documentId}`;

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
          ctx.documentId,
          filing.sha256,
          "{}",
          opKey,
          server.booksVersion,
          JSON.stringify(input.vendor),
          JSON.stringify(input.evidence),
          JSON.stringify(coding),
          "supplier_bill",
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
      document_id: ctx.documentId,
      provenance_tier: tier,
      ...(receipt.exception === true ? { exception: true } : {}),
      uncertainty: input.uncertainty,
    };
    return { ok: true, je_review };
  } catch (e) {
    return { ok: false, refusal: refusalFromDbError(e as { code?: string; detail?: string; constraint?: string }) };
  }
}

/**
 * Build the autoDraft tool set. Every read is client-pinned under the autodraft credential; a
 * read tool's authority/tenant error becomes ONE oracle-safe refusal (safeRead). NO clarify
 * tool (unattended). The five perception reads (companion §4 allowlist) + the draft write.
 */
export function buildAutoDraftTools(ctx: ToolCtx) {
  const clientId = ctx.clientId;
  return {
    read_document: tool({
      description:
        "Read this bill's stored extraction: filing state, invoice facts (when present), bounded text, and region ids to cite as evidence.",
      inputSchema: z.object({ document_id: z.string().uuid().optional() }),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [ctx.documentId, clientId]).then((r) => r.rows[0]?.x ?? null),
          ),
        ),
    }),
    get_context_pack: tool({
      description: "Read the typed context pack for this client (chart of accounts, recent entries, and the books_version token).",
      inputSchema: z.object({ purpose: z.string().optional() }),
      execute: ({ purpose }: { purpose?: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_context_pack($1, $2) as pack", [clientId, purpose ?? "coding"]).then((r) => r.rows[0]?.pack ?? null),
          ),
        ),
    }),
    coding_lane: tool({
      description: "Read the DB-computed lane and reasons for this filing (READY / NEEDS REVIEW / NEEDS YOU) — qualitative signals only.",
      inputSchema: z.object({}),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c
              .query("select lane, reasons from clara.coding_lane($1, $2)", [clientId, ctx.filingId])
              .then((r) => r.rows[0] ?? null),
          ),
        ),
    }),
    get_draft_review: tool({
      description: "Read the authoritative review state of an existing draft entry for this client (outcome, exception panel, evidence).",
      inputSchema: z.object({ entry_id: z.string().uuid() }),
      execute: ({ entry_id }: { entry_id: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) => c.query("select clara.get_draft_review($1::uuid, $2::uuid) as r", [entry_id, clientId]).then((r) => r.rows[0]?.r ?? null)),
        ),
    }),
    [DRAFT_TOOL]: tool({
      description:
        "Draft ONE supplier-bill journal entry for a human to review: with NO stated tax in the facts, expense debit(s) GROSS + a credit " +
        "to Accounts Payable GROSS with the vendor; with a STATED tax, expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY " +
        "to the stated tax + the Accounts Payable credit GROSS. " +
        "This is a proposal, not a posting. Provide lines, document_id, vendor, and an evidence array. If the bill is not lawfully draftable, do NOT call this — explain the block in text.",
      inputSchema: draftJournalEntryInputSchema,
      execute: (input: DraftInput) => runDraftJournalEntry(ctx, input),
    }),
  };
}
