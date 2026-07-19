// @frozen
//
// FROZEN — the chatTurn_v2 tool set + the draft_journal_entry write-floor wrapper
// (contract §3/§4). Split from the impl to hold the 500-line file cap. Firm-scoped
// read tools + clarify are exposed even without a bound client; the client-scoped
// reads + the draft write tool are added only when a client is bound. The model
// supplies only business content; the wrapper fetches sha256 / resolution /
// books_version / Tier-A facts SERVER-side and stamps the coding_kind marker + the
// stable op_key. The DB is the authoritative Tier-A + supplier-bill-shape enforcer;
// the wrapper's checks are a friendly early backstop.

import { tool } from "ai";
import { z } from "zod";
import {
  DRAFT_TOOL,
  clarifyTool,
  draftJournalEntryInputSchema,
  type DraftToolResult,
  type JeReviewPart,
} from "./chatTurn.v2.prompt.js";
import { refusalFromDbError, sessionUnboundRefusal } from "./chatTurn.v2.errors.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./chatTurn.v2.infra.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** Best-effort read of a verified MYR invoice total (cents) from get_document_extract.
 *  Unknown keys collapse to Tier B; the DB still enforces the Tier-A equation. */
function readVerifiedTotalCents(extract: unknown): number | null {
  const x = (extract ?? {}) as Record<string, unknown>;
  const facts = (x.invoice_facts ?? x.facts ?? {}) as Record<string, unknown>;
  const total = (facts.total ?? facts.invoice_total ?? x.invoice_total) as Record<string, unknown> | number | undefined;
  const cents =
    typeof total === "number" ? total : total && typeof total === "object" ? (total.cents as number | undefined) : undefined;
  return typeof cents === "number" && Number.isFinite(cents) ? cents : null;
}

function readCurrency(extract: unknown): string | null {
  const x = (extract ?? {}) as Record<string, unknown>;
  const facts = (x.invoice_facts ?? x.facts ?? {}) as Record<string, unknown>;
  const cur = (facts.currency ?? x.currency) as string | undefined;
  return typeof cur === "string" && cur.length > 0 ? cur.toUpperCase() : null;
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
    const currency = readCurrency(server.extract);
    if (currency && currency !== "MYR") {
      return { ok: false, refusal: refusalFromDbError({ code: "CLR21", detail: '{"reason":"currency_unsupported"}' }) };
    }
    const verifiedTotal = readVerifiedTotalCents(server.extract);
    const proposedGross = input.lines.reduce((sum, l) => sum + (l.credit_cents || 0), 0);
    let tier: "verified" | "model_read" = "model_read";
    if (verifiedTotal != null) {
      tier = "verified";
      if (proposedGross !== verifiedTotal) {
        return { ok: false, refusal: refusalFromDbError({ code: "CLR21", detail: '{"reason":"amount_conflict"}' }) };
      }
    }

    // 2. Assemble writer args. The model NEVER supplies sha256/books/op_key/resolution.
    const partPayload = {
      client_id: clientId,
      document_id: input.document_id,
      provenance_tier: tier,
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
          JSON.stringify(input.vendor),
          JSON.stringify(input.evidence),
          JSON.stringify(coding),
          "supplier_bill",
        ],
      );
      return (r.rows[0]?.receipt ?? {}) as { entry_id?: string; revision_token?: string };
    });

    if (!receipt.entry_id || !receipt.revision_token) return { ok: false, refusal: refusalFromDbError({ code: "internal" }) };
    const je_review: JeReviewPart = {
      type: "je_review",
      entry_id: String(receipt.entry_id),
      revision_token: String(receipt.revision_token),
      client_id: clientId,
      document_id: input.document_id,
      provenance_tier: tier,
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
export function buildToolsV2(ctx: ToolCtx) {
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
        "Draft ONE supplier-bill journal entry for a human to review (gross to expense + a credit to Accounts Payable with the vendor). " +
        "This is a proposal, not a posting: it produces a review card a bookkeeper approves. Provide lines, document_id, vendor, and an evidence array.",
      inputSchema: draftJournalEntryInputSchema,
      execute: (input: DraftInput) => runDraftJournalEntry(ctx, input),
    }),
  };
}
