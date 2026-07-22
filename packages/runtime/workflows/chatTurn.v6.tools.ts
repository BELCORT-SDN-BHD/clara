// @frozen
//
// FROZEN — the chatTurn_v6 tool set + the draft_journal_entry write-floor wrapper
// (contract §3/§4). Split from the impl to hold the 500-line file cap. Firm-scoped
// read tools + clarify are exposed even without a bound client; the client-scoped
// reads + the draft write tool are added only when a client is bound. The model
// supplies only business content; the wrapper fetches sha256 / resolution /
// books_version / Tier-A facts SERVER-side and stamps the coding_kind marker + the
// stable op_key. The DB is the authoritative Tier-A + entry-shape enforcer (the
// supplier-bill floor AND the 0015 sales/CN floor); the wrapper's checks are a
// friendly early backstop. v4: the model's coding_kind is passed through to the
// writer (v3 hardcoded 'supplier_bill') and the counterparty field is kind-neutral.
// v6: coding_kind "journal_entry" maps to NULL at the writer (the generic voucher
// lane the DB has always supported) and counterparty becomes optional (the DB still
// requires it for the three document kinds).

import { tool } from "ai";
import { z } from "zod";
import {
  DRAFT_TOOL,
  clarifyTool,
  draftJournalEntryInputSchema,
  type DraftToolResult,
  type JeReviewPart,
} from "./chatTurn.v6.prompt.js";
import { refusalFromDbError, sessionUnboundRefusal } from "./chatTurn.v6.errors.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./chatTurn.v6.infra.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** One region of the REAL get_document_extract shape (0009 get_document_extract:
 *  regions[] joined to a done extraction). locator is `{page, polygon}` jsonb. */
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

/** Read the invoice-facts corroboration signals off the REAL get_document_extract
 *  shape (W5 / pins §3): the invoice_facts regions of the latest done extraction.
 *  This is the wrapper's FRIENDLY early read — the tier label for the part and an
 *  explicit-non-MYR early refusal. The DB (_invoice_fact_state / _draft_entry_core)
 *  is the AUTHORITATIVE Tier-A + currency enforcer (single-doc, amount_due, deposit,
 *  non-empty polygon, submitted-evidence currency); a disagreement never posts a
 *  number — the DB persists the amount exception or refuses. */
function readInvoiceFactState(extract: unknown): {
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
  // Friendly Tier-A: exactly one physical total row, positive cents, confidence >=0.95,
  // MYR. Empty geometry never corroborates (no fabricated locator — W3).
  const corroborated = totals.length === 1 && totalCents != null && totalCents > 0 && conf >= 0.95 && hasGeometry && currency === "MYR";
  const explicitNonMyr = currency != null && currency !== "MYR";
  return { verifiedTotalCents: corroborated ? totalCents : null, corroborated, explicitNonMyr };
}

/**
 * The draft_journal_entry wrapper (exported for direct unit testing). Fetches
 * authoritative values server-side, runs the tier check, then executes the DB
 * writer through the write floor. Never throws — always resolves to a typed result.
 */
export async function runDraftJournalEntry(ctx: ToolCtx, input: DraftInput): Promise<DraftToolResult> {
  const clientId = ctx.clientId;
  if (!clientId) return { ok: false, refusal: sessionUnboundRefusal() };
  try {
    // 1. Server-side authoritative reads (OBO the initiator, one wake-scoped txn).
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

    // Friendly early reads off the AUTHORITATIVE extract shape (W5). Explicit non-MYR
    // refuses early (the DB also refuses at both tiers). A machine/proposed total
    // MISMATCH is NOT refused here (W1): the draft proceeds and the DB persists it as
    // a reviewable `flags.amount_exception` — the receipt/part carries exception:true.
    const facts = readInvoiceFactState(server.extract);
    if (facts.explicitNonMyr) {
      return { ok: false, refusal: refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }) };
    }
    const detectedTier: "verified" | "model_read" = facts.corroborated ? "verified" : "model_read";

    // 2. Assemble writer args. The model NEVER supplies sha256/books/op_key/resolution.
    // The DB re-derives the authoritative provenance_tier into the coding_attempts row;
    // detectedTier is a hint carried for the fresh part when the receipt omits a tier.
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
          JSON.stringify(input.evidence),
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
    // Prefer the DB's authoritative tier from the receipt; fall back to the friendly
    // detected tier when the receipt omits it. `exception` reflects a persisted
    // amount exception (W1) — the card renders the panel from get_draft_review.
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

/**
 * Build the v2 tool set for a segment. Every read is wake-scoped OBO the initiator;
 * a read tool's authority/tenant error becomes ONE oracle-safe refusal (safeRead).
 */
export function buildToolsV6(ctx: ToolCtx) {
  const clientId = ctx.clientId;
  const firmScoped = {
    list_unassigned_documents: tool({
      description: "List firm documents not yet filed to any client. File one on the /documents tab before it can be coded.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).optional() }),
      execute: ({ limit }: { limit?: number }) =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c
              .query("select coalesce(jsonb_agg(d), '[]'::jsonb) as ds from clara.list_unassigned_documents($1) d", [limit ?? 50])
              .then((r) => r.rows[0]?.ds ?? []),
          ),
        ),
    }),
    read_document: tool({
      description:
        "Read one document's stored extraction: filing state, invoice facts (when present), bounded text, and region ids to cite as evidence.",
      inputSchema: z.object({ document_id: z.string().uuid() }),
      execute: ({ document_id }: { document_id: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [document_id, clientId]).then((r) => r.rows[0]?.x ?? null),
          ),
        ),
    }),
    clarify: clarifyTool,
  };
  if (!clientId) return firmScoped;
  return {
    ...firmScoped,
    get_context_pack: tool({
      description: "Read the typed context pack for the current client (chart of accounts, recent entries, and the books_version token).",
      inputSchema: z.object({ purpose: z.string().optional() }),
      execute: ({ purpose }: { purpose?: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_context_pack($1, $2) as pack", [clientId, purpose ?? "chat"]).then((r) => r.rows[0]?.pack ?? null),
          ),
        ),
    }),
    trial_balance: tool({
      description: "Read the client's trial balance (approved entries), summed by the database.",
      inputSchema: z.object({}),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select coalesce(jsonb_agg(t), '[]'::jsonb) as tb from clara.trial_balance($1) t", [clientId]).then((r) => r.rows[0]?.tb ?? []),
          ),
        ),
    }),
    list_journal_entries: tool({
      description: "List the client's journal entries (most recent first).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
      execute: ({ limit }: { limit?: number }) =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c
              .query("select coalesce(jsonb_agg(e), '[]'::jsonb) as es from clara.list_journal_entries($1, $2) e", [clientId, limit ?? 50])
              .then((r) => r.rows[0]?.es ?? []),
          ),
        ),
    }),
    get_journal_entry: tool({
      description: "Read one journal entry (header + lines) by id, scoped to the current client.",
      inputSchema: z.object({ entryId: z.string().uuid() }),
      execute: ({ entryId }: { entryId: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) => c.query("select clara.get_journal_entry_for($1, $2) as e", [entryId, clientId]).then((r) => r.rows[0]?.e ?? null)),
        ),
    }),
    [DRAFT_TOOL]: tool({
      description:
        "Draft ONE journal entry for a human to review: a supplier bill (gross to expense + an Accounts Payable credit with the supplier), " +
        "a sales invoice (Trade Debtors debit gross + revenue credit net, + an SST output credit when the document states tax), " +
        "a sales credit note (the exact mirror), or a generic journal_entry mirroring a voucher's own stated debits and credits. " +
        "This is a proposal, not a posting: it produces a review card a bookkeeper approves. " +
        "Provide coding_kind, lines, document_id, an evidence array, and the counterparty (required except on a journal_entry).",
      inputSchema: draftJournalEntryInputSchema,
      execute: (input: DraftInput) => runDraftJournalEntry(ctx, input),
    }),
  };
}
