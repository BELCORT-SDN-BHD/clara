// @frozen
//
// FROZEN — part of the autoDraft_v7 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// autoDraft_v1..v6 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `autoDraft:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts, and the DB evidence wall (clara._write_entry_evidence) correctly
// refused CLR21 evidence_invalid every time — its id-equality contract is right, and a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v7 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (tools) — v7 vs v6, ONE new function and THREE touched spans:
//   1. NEW: `resolveEvidenceRegions` (exported, pure) — maps each cited `region_idx` to a
//      region_id by the `idx` FIELD of the regions this wrapper already fetches
//      server-side. Its own doc comment states, at length, why FIELD and not POSITION.
//   2. `runDraftJournalEntry` calls it after the existing filing/currency checks and
//      BEFORE assembling the writer args; an unresolvable idx returns the typed refusal
//      `evidenceIdxUnresolvedRefusal(...)` (CLR21 / evidence_invalid, with the valid idx
//      set echoed), and writer arg 12 now carries the RESOLVED evidence.
//   3. `ExtractRegion` gains the `id` and `idx` fields the resolution reads, and the
//      read_document / draft_journal_entry tool descriptions teach the idx.
// Everything else is byte-carried from v6: the direction-family early check, the
// document-binding CLR11 check, the whole server-side read block, readInvoiceFactState,
// deriveCounterpartyKind + allowedCodingKindsForDirection, the counterparty payload
// derivation, the other thirteen writer args, the receipt handling, and every other tool.
//
// THE DB CONTRACT IS UNCHANGED. clara.wake_draft_entry still receives an evidence array of
// { region_id, quote, field_path? }; clara._write_entry_evidence still resolves it by plain
// id-equality against a done extraction of this document and still re-checks the quote
// against the stored region text. This file changed WHO types the identifier, not what the
// wall verifies.

import { tool } from "ai";
import { z } from "zod";
import {
  DRAFT_TOOL,
  draftJournalEntryInputSchema,
  type DraftToolResult,
  type JeReviewPart,
} from "./autoDraft.v7.prompt.js";
import {
  refusalFromDbError,
  directionFamilyMismatchRefusal,
  refusalForEvidenceFailure,
  type EvidenceFailure,
  type MislabelledCitation,
  type RegionIdxHint,
} from "./autoDraft.v7.errors.js";
import { readScoped, writeScoped, safeRead, type PgExec, type ToolCtx } from "./autoDraft.v7.infra.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** One region of the get_document_extract shape (regions[] of a done extraction). `id` and
 *  `idx` are the two handles this closure reads: `idx` is what the MODEL cites (the DB's
 *  stable per-region ordinal, migration 0054) and `id` is what the DB evidence wall
 *  consumes. Both are optional at the type level because the RPC's shape is not validated
 *  here — a region missing either is simply not citable (see resolveEvidenceRegions). */
type ExtractRegion = {
  id?: string;
  idx?: number;
  extraction_id?: string;
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

/** One cited fact as the model supplies it (region INDEX + quote + the region's own label),
 *  and the resolved shape the DB evidence writer receives (region ID + quote + the label read
 *  BACK OFF THE REGION, never the model's string). The two are deliberately different types:
 *  the toolface stopped taking ids, the wall never stopped taking them. */
export type DraftEvidence = DraftInput["evidence"][number];
export type ResolvedEvidence = { region_id: string; quote: string; field_path?: string };

export type EvidenceResolution = { ok: true; evidence: ResolvedEvidence[] } | { ok: false; failure: EvidenceFailure };

/** THE IN-RUN READ RECORD — what read_document actually showed the model, per document id,
 *  as a snapshot rev. Lives in the TOOL-SET CLOSURE: built inside the model step, consumed
 *  inside the same step, never crossing a WDK step boundary — the same lifetime discipline
 *  the per-attempt wake credentials already follow (§4.1).
 *
 *  REPLAY-SAFETY, MEASURED NOT ASSUMED. @workflow/core@4.6.0's own step.js says of its
 *  memoization: "Only primitive results are memoized; non-primitives re-hydrate fresh each
 *  replay so a shared reference can never carry a mutation between replays." Replay is at
 *  STEP granularity — a replayed model step re-enters this body, rebuilds the tool set, and
 *  gets an EMPTY map. So a replay cannot inherit a stale snapshot (fail-open) and cannot
 *  smuggle one across runs; it simply has to read again, which is the fail-CLOSED direction
 *  and is exactly what the gate wants. */
export type ReadSnapshots = Map<string, string>;
export function newReadSnapshots(): ReadSnapshots {
  return new Map<string, string>();
}

/** THE SNAPSHOT REV — a canonical encoding of the very thing an index indexes: the
 *  (idx -> region id) mapping, each entry tagged with the extraction generation it came from.
 *
 *  WHY THE MAPPING AND NOT THE (extraction_id, version_n) SET. The pair set is a PROXY for
 *  the mapping; the mapping is the thing the model is being asked to point into. Law 3 —
 *  prove the thing, not a projection of it. Any re-extraction, supersede, renumber, added or
 *  removed region changes this string, and nothing else does. Sorted, so an incidental change
 *  in array order is not mistaken for a change in identity.
 *
 *  It is never shown to the model, never persisted, and never sent to the DB: it is compared
 *  for equality, in memory, inside one step. Pure. */
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

/** F9 (ADR-064 §3) + THE FIX ROUND: resolve each cited `region_idx` to its region_id, BY THE
 *  `idx` FIELD — never by array position — and ONLY inside the snapshot the model actually
 *  read THIS RUN.
 *
 *  WHY THE SNAPSHOT GATE EXISTS (Codex #1 CRITICAL, native Finding 1, REPRODUCED on a rig
 *  before this fix). The first cut resolved the model's number against the WRAPPER's own,
 *  independently-issued RPC call. Measured: a four-region `ocr` extract is read at T0; an
 *  `invoice_facts` extraction lands before the draft call; because the ordinal sorts by
 *  (engine_kind, version_n, id) and 'invoice_facts' < 'ocr', EVERY index is renumbered. The
 *  model's idx=2 (the `invoice.amount_due` region, "RM 5,000.00") resolved at T1 to a
 *  DIFFERENT extraction's `invoice.total` region carrying the SAME text, and the untouched
 *  wall ACCEPTED it — the quote really is a substring of that region. The recorded evidence
 *  then read field_path 'invoice.total', which is exactly what the corroboration bound and
 *  the supplier-bill shape check select on. A stale UUID always named the region it was read
 *  from; a stale INDEX can name a different one. That is a new silent-wrong-binding class,
 *  and it is closed HERE, at the toolface that introduced it — the DB wall is untouched.
 *
 *  THE FIVE GATES, IN ORDER, ALL FAIL-CLOSED:
 *    1. read-before-cite, PER DOCUMENT (native Finding 2) — no snapshot for THIS document,
 *       no citation. Reading A never licenses citing B.
 *    2. the snapshot must still be the one that was read — else the world moved; re-read.
 *    3. a duplicate idx REFUSES (Codex #4, native Finding 3). First-wins would re-smuggle
 *       array order as authority. "A duplicate would be a DB defect" is the argument FOR
 *       refusing, not for picking one.
 *    4. an empty citable set is named as such rather than reported as a bad index.
 *    5. the model's field_path must EQUAL the region's own (coordinator ruling 5): a region
 *       with a label must be cited by that label, a region with none must not be given one.
 *       The resolved evidence then carries the REGION'S label, never the model's string, so
 *       the recorded field_path is DB-sourced end to end.
 *
 *  Pure — no DB, no model, no clock. Directly unit-testable. */
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

/** THE COUNTERPARTY CONTRACT, layer 2 of 3 (skeleton §2a): the runtime tool — never the
 *  model — derives the authoritative counterparty kind from coding_kind. A supplier_bill
 *  names a vendor; sales_invoice/sales_credit_note name a customer. Pure. */
export function deriveCounterpartyKind(codingKind: DraftInput["coding_kind"]): "vendor" | "customer" {
  return codingKind === "supplier_bill" ? "vendor" : "customer";
}

/** PR #204 / 7A-R2, THE BOUND FAMILY: the coding_kind values an admitted direction allows.
 *  A `direction` of null (a pre-migration attempt row) allows nothing to be checked here at
 *  all — returns null, meaning "no early family to validate against; the DB draft writer
 *  stays the sole authority." Pure. */
export function allowedCodingKindsForDirection(direction: "sales" | "purchase" | null): readonly DraftInput["coding_kind"][] | null {
  if (direction === "sales") return ["sales_invoice", "sales_credit_note"];
  if (direction === "purchase") return ["supplier_bill"];
  return null;
}

/**
 * The draft_journal_entry wrapper (exported for direct unit testing). Fetches authoritative
 * values server-side, runs the tier check, then executes the DB writer through the write
 * floor. Never throws — always resolves to a typed result. The sweep task is client- and
 * document-bound: a draft naming a DIFFERENT document than the task's is refused (CLR11).
 */
export async function runDraftJournalEntry(ctx: ToolCtx, input: DraftInput, reads: ReadSnapshots): Promise<DraftToolResult> {
  const clientId = ctx.clientId;
  // PR #204 / 7A-R2, THE BOUND FAMILY — the VERY FIRST check, before any DB read: the model's
  // proposed coding_kind must fall inside the admission-bound direction's family. A mismatch
  // is a named EARLY refusal, never a DB roundtrip. ctx.direction === null (a pre-migration
  // attempt row) skips this check entirely — the DB draft writer stays the sole authority.
  const allowedKinds = allowedCodingKindsForDirection(ctx.direction);
  if (allowedKinds && !allowedKinds.includes(input.coding_kind)) {
    return { ok: false, refusal: directionFamilyMismatchRefusal() };
  }
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

    // F9 (ADR-064 §3) + THE FIX ROUND: resolve the model's cited region INDEXES into the
    // region ids the DB evidence wall reads — by the `idx` FIELD, never by array position,
    // and ONLY within the snapshot read_document showed the model in THIS run for THIS
    // document. `reads` is the tool-set closure's own record; a run that never read, or read
    // a snapshot that has since moved, is refused as a SYSTEM condition and told to re-read
    // (see resolveEvidenceRegions' own header for the measured drift this closes).
    const cited = resolveEvidenceRegions(server.extract, input.evidence, reads.get(ctx.documentId));
    if (!cited.ok) {
      return { ok: false, refusal: refusalForEvidenceFailure(cited.failure) };
    }
    // 2. Assemble writer args. The model NEVER supplies sha256/books/op_key/resolution.
    // THE COUNTERPARTY CONTRACT: the derived kind ALWAYS overwrites whatever (optional)
    // kind the model proposed — the tool is the derivation authority, not a second model
    // choice (skeleton §2a layer 2; the zod superRefine in .prompt.ts is layer 1, a
    // model-supplied contradiction is ergonomics only; the DB draft writer is layer 3,
    // the sole authority).
    const counterpartyPayload = {
      ...(input.counterparty as Record<string, unknown>),
      kind: deriveCounterpartyKind(input.coding_kind),
    };

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
          JSON.stringify(counterpartyPayload),
          JSON.stringify(cited.evidence),
          JSON.stringify(coding),
          input.coding_kind,
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
  // THE IN-RUN READ RECORD (the fix round's gate). One map per tool set, i.e. per model-step
  // execution: read_document writes the snapshot rev it showed the model, the draft wrapper
  // requires it. A replay rebuilds this EMPTY, which fails closed.
  const reads = newReadSnapshots();
  return {
    read_document: tool({
      description:
        "Read this document's stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",
      inputSchema: z.object({ document_id: z.string().uuid().optional() }),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [ctx.documentId, clientId]).then((r) => {
              const extract = r.rows[0]?.x ?? null;
              // Record WHAT WAS SHOWN, not that a read happened: the rev is the mapping the
              // model is about to index into. A throwing read records nothing, so a failed
              // read can never license a citation.
              reads.set(ctx.documentId, extractRev(extract));
              return extract;
            }),
          ),
        ),
    }),
    get_context_pack: tool({
      description: "Read the typed context pack for this client (chart of accounts, recent entries, and the books_version token).",
      inputSchema: z.object({ purpose: z.literal("wiki_coding").optional() }),
      execute: ({ purpose }: { purpose?: "wiki_coding" }) =>
        safeRead(() =>
          readScoped(ctx, async (c) => {
            // FORK-6: the marker GUC is set txn-local on the SAME client, immediately
            // before the pack fetch, inside the SAME readScoped transaction — the DB
            // gate (0017's get_context_pack case) reads current_setting inside this
            // one txn, so the pair must share it.
            await c.query("select set_config('clara.pack_consumer', $1, true)", ["v25"]);
            const r = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, purpose ?? "wiki_coding"]);
            return r.rows[0]?.pack ?? null;
          }),
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
        "Draft ONE journal entry for a human to review: a supplier bill — with NO stated tax, or a stated ZERO tax, in the facts, " +
        "expense debit(s) GROSS + a credit to Accounts Payable GROSS with the vendor; with a STATED NONZERO tax, expense debit(s) NET + " +
        "ONE sst_purchase_cost debit equal EXACTLY to the stated tax + the Accounts Payable credit GROSS — " +
        "or a sales invoice / sales credit note (Trade Debtors debit/credit gross + revenue credit/debit net, + an SST output " +
        "credit/debit when the document states tax) with the customer. " +
        "This is a proposal, not a posting. Provide coding_kind, lines, document_id, counterparty, and an evidence array citing " +
        "each amount by its region `idx` from read_document (never a region id) — never set " +
        "counterparty.kind yourself, it is derived from coding_kind. If the document is not lawfully draftable, do NOT call this — " +
        "explain the block in text.",
      inputSchema: draftJournalEntryInputSchema,
      execute: (input: DraftInput) => runDraftJournalEntry(ctx, input, reads),
    }),
  };
}
