// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A1 PR-3a: widens the coding-lane toolfaces to
// the witness-pair regime; design docs/plan/active/f-a1-witness-pair-design.md §3.8, the M7
// selection rule; Annex B row M7). A NEW frozen closure beside the byte-untouched
// autoDraft_v1..v7 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN export,
// never an in-place edit — the registry repoints `autoDraft:` here).
//
// THE FINDING, ONCE. F-A1 PR-1 shipped a second extraction regime (`llm_text_facts` /
// `llm_vision_facts`, the witness pair) beside legacy `invoice_facts`, and repointed the DB's
// own resolver dispatch to prefer the newest generation ACROSS regimes by `extracted_at` —
// never `version_n`, a PER-LANE counter (a witness pair starting at 1 would otherwise lose
// forever to a legacy v3). v7's `readInvoiceFactState` knew none of this: it filtered to
// `invoice_facts` alone (kind-widening alone would DROP a witness-only document) and picked
// the latest generation via a bare cross-kind `Math.max(version_n)`. It also carried a STALE
// `engine_confidence >= 0.95` mirror — a term the real DB gate dropped at 0023 and has never
// carried since — which, applied unconditionally, would zero out every witness document's
// hint, since a witness fact region carries `engine_confidence = NULL` BY DESIGN (§3.4).
//
// ============================ WHAT v9 IS, ONCE, FOR THE WHOLE CLOSURE ========================
//
// F-A2 — THE AGENTIC POSTING LANE. v8 was DRAFT-ONLY: it read, proposed one journal entry, and
// a human approved every one of them. v9 keeps that first act byte-for-byte and adds a SECOND:
// after a successful draft the agent may POST the entry into the client's books under her own
// identity, through `clara.wake_post_entry` — a granted wake wrapper over an ungranted core
// whose thirteen-rung ladder, four tiers and post receipt are the sole authority on whether the
// post is lawful. Design: docs/plan/active/f-a2-agentic-posting-design.md (§3 the shape, §3.2
// the ladder, §3.3 the receipt and the two structural walls), its four annexes, and the PR-0
// gate record. Owner rulings: OQ-1 (any amount, no human checker, no threshold), OQ-4 (the
// three exits), OQ-6 (no category gate on the agent lane), D34-D37, D38-D43.
//
// THE ONE THING TO UNDERSTAND BEFORE EDITING ANY OF THIS. The runtime does not decide whether a
// post is lawful and cannot be made to. Every wall lives in the DB, inside the post verb's own
// core, so no sequence of tool calls can post a draft that should not post (design §3.1, the S1
// seam). What this closure owns is exactly three things: assembling the inputs the agent may not
// pick, carrying the DB's verdict back without re-deriving it, and settling the sweep task
// honestly. Where this file appears to duplicate a DB wall it is an EARLY, named refusal that
// saves a roundtrip — never a second authority, and never a place to relax one.
//
// v9 vs v8, the deltas in this file:
//   1. `deriveCounterpartyKind` returns `null` for the generic kind (v8's `? :` would have
//      defaulted it to "customer" — a real defect, not a widening).
//   2. `allowedCodingKindsForDirection` is extended DELIBERATELY (GB-1): the generic kind is
//      NOT added to either bound family, and its own header says why at length.
//   3. `runDraftJournalEntry` passes a NULL `coding_kind` and NO counterparty payload for the
//      generic kind.
//   4. The AI-SDK tool set moved to `autoDraft.v9.toolset.ts` and the post wrapper lives in
//      `autoDraft.v9.postcall.ts` (this file is at the repo's 500-line ceiling).
// Everything else — `readInvoiceFactState`'s two-regime resolution, `resolveEvidenceRegions`,
// `extractRev`, the read-snapshot record and `runDraftJournalEntry`'s whole draft path — is
// BYTE-CARRIED from v8, whose own header follows.
//
// ---------------------------- v8's header, carried verbatim ---------------------------------
// THIS FILE (tools) — v8 vs v7, ONE new function + ONE touched span:
//   1. NEW: `resolveRegimeGeneration` (unexported, pure) — the latest generation of ONE
//      engine_kind, by that regime's OWN key (`Math.max(version_n)` WITHIN the kind only).
//   2. TOUCHED: `readInvoiceFactState` — filters to BOTH regimes' kinds (`invoice_facts` +
//      `llm_text_facts`; the vision row carries no regions, §3.1, so needs no filter of its
//      own); resolves each regime's own latest generation; when both are present, the
//      cross-regime winner is `extracted_at` ALONE (a clock tie prefers witness, §3.3). The
//      confidence term is scoped to the LEGACY regime alone — a legacy-only winner's result is
//      byte-identical to v7's; a witness winner never applies the term.
//   `ExtractRegion` gains `extracted_at` (additive; every other field untouched).
// Everything else is byte-carried from v7: `resolveEvidenceRegions`, `extractRev`,
// `newReadSnapshots`/`ReadSnapshots`, the evidence types, `deriveCounterpartyKind`,
// `allowedCodingKindsForDirection`, `runDraftJournalEntry`'s whole body (calls the widened
// read, is not itself touched), and `buildAutoDraftTools` (unchanged wiring — a witness
// document's regions already carry the SAME idx/field_path vocabulary, D10).
//
// THE DB CONTRACT IS UNCHANGED — clara._write_entry_evidence still resolves by plain
// id-equality. This file's friendly read is advisory: the DB predicate (dispatching per-
// document across both regimes, F-A1 PR-1) is the sole authority on provenance_tier.

import { z } from "zod";
import { draftJournalEntryInputSchema, type DraftToolResult, type JeReviewPart } from "./autoDraft.v9.prompt.js";
import {
  refusalFromDbError,
  directionFamilyMismatchRefusal,
  refusalForEvidenceFailure,
  type EvidenceFailure,
  type MislabelledCitation,
  type RegionIdxHint,
} from "./autoDraft.v9.errors.js";
import { readScoped, writeScoped, type PgExec, type ToolCtx } from "./autoDraft.v9.infra.js";

export type DraftInput = z.infer<typeof draftJournalEntryInputSchema>;

/** One region of the get_document_extract shape (regions[] of a done extraction). `id` and
 *  `idx` are the two handles this closure reads: `idx` is what the MODEL cites (the DB's
 *  stable per-region ordinal, migration 0054) and `id` is what the DB evidence wall
 *  consumes. Both are optional at the type level because the RPC's shape is not validated
 *  here — a region missing either is simply not citable (see resolveEvidenceRegions).
 *  `extracted_at` is F-A1 PR-1's addition (M7) — published on every region entry now, read
 *  ONLY by readInvoiceFactState's cross-regime resolution below; nothing else in this file
 *  consults it. */
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

/** Normalize a currency quote to its bare uppercase alpha code (e.g. "RM"/"MYR"). */
function normalizeCurrency(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const c = text.replace(/[^A-Za-z]/g, "").toUpperCase();
  return c.length > 0 ? c : null;
}

/** ONE regime's resolved latest generation: the rows of that generation (one engine_kind,
 *  the newest version_n WITHIN that kind — never across kinds, M6/M7), a representative
 *  `extracted_at` clock parsed to epoch ms (null when unreadable), and whether a confidence
 *  term applies to THIS regime at all. Pure, no DB.
 *
 *  A null clock's fate below (`?? -Infinity`): it LOSES to a readable one; two null clocks
 *  tie, and the tie — like any tie — prefers witness (§3.3), so a null witness clock still
 *  wins against a null legacy clock, via the tie rule. */
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

/** Read the invoice-facts corroboration signals off the get_document_extract shape (identical
 *  logic to the chat lane's friendly early read; the DB is the authoritative enforcer).
 *
 *  M7 selection rule (design §3.8 / Annex B row M7): filters to BOTH regimes' kinds, resolves
 *  each regime's own latest generation independently, and — only when both are present —
 *  picks the cross-regime winner by `extracted_at` ALONE, never `Math.max(version_n)` across
 *  regimes (a per-lane counter, 0026:216-217) — see RegimeGeneration's own header for the
 *  null-clock/tie rule. A legacy-only document needs no comparison and is byte-identical to
 *  v7's. */
export function readInvoiceFactState(extract: unknown): {
  verifiedTotalCents: number | null;
  corroborated: boolean;
  explicitNonMyr: boolean;
} {
  const regions = ((extract as { regions?: unknown } | null)?.regions ?? []) as ExtractRegion[];
  if (!Array.isArray(regions) || regions.length === 0) {
    return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };
  }
  // The vision row (`llm_vision_facts`) carries no regions (§3.1), so it needs no filter.
  const legacy = resolveRegimeGeneration(regions, "invoice_facts", true);
  const witness = resolveRegimeGeneration(regions, "llm_text_facts", false);
  if (!legacy && !witness) return { verifiedTotalCents: null, corroborated: false, explicitNonMyr: false };

  let winner: RegimeGeneration;
  if (legacy && witness) {
    // `>=` on the witness side — see RegimeGeneration's header for the null/tie rule.
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
  // CORRECTED: v7's stale conf >= 0.95 mirror is scoped to legacy alone (the real DB gate
  // excludes it structurally, 0023) — a witness region carries engine_confidence NULL (§3.4).
  const confidenceOk = winner.requiresConfidence ? conf >= 0.95 : true;

  const currency = normalizeCurrency(rows.find((r) => r.field_path === "invoice.currency")?.text_content);
  const corroborated = totals.length === 1 && totalCents != null && totalCents > 0 && confidenceOk && hasGeometry && currency === "MYR";
  const explicitNonMyr = currency != null && currency !== "MYR";
  return { verifiedTotalCents: corroborated ? totalCents : null, corroborated, explicitNonMyr };
}

/** One cited fact as the model supplies it (region INDEX + quote + label), and the resolved
 *  shape the DB writer receives (region ID + quote + the label read BACK OFF THE REGION). */
export type DraftEvidence = DraftInput["evidence"][number];
export type ResolvedEvidence = { region_id: string; quote: string; field_path?: string };

export type EvidenceResolution = { ok: true; evidence: ResolvedEvidence[] } | { ok: false; failure: EvidenceFailure };

/** THE IN-RUN READ RECORD — what read_document actually showed the model, per document id, as
 *  a snapshot rev. Lives in the TOOL-SET CLOSURE (built + consumed inside one model step, never
 *  crossing a WDK step boundary). REPLAY-SAFETY: a replayed step rebuilds this EMPTY (non-
 *  primitives never survive @workflow/core's memoization), so a replay cannot inherit a stale
 *  snapshot — fail-closed by construction. */
export type ReadSnapshots = Map<string, string>;
export function newReadSnapshots(): ReadSnapshots {
  return new Map<string, string>();
}

/** THE SNAPSHOT REV — a canonical encoding of the (idx -> region id) mapping, each entry
 *  tagged with the extraction generation it came from (Law 3: prove the thing, not a
 *  projection of it). Any re-extraction, supersede, renumber, added/removed region changes
 *  this string; sorted, so array order alone is not mistaken for identity. Never shown to the
 *  model, never persisted — compared for equality, in memory, inside one step. Pure. F-A1: a
 *  witness persist renumbers every `idx` (witness kinds sort before 'ocr'), which is exactly
 *  the class of change this rev already exists to detect (Annex C's idx-stability cell). */
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
 *  read THIS RUN (byte-carried from v7; see v7's own header for the measured renumbering
 *  hazard this gate closes — an extraction landing between read and draft renumbers every
 *  ordinal, since the idx sort key is (engine_kind, version_n, id)).
 *
 *  THE FIVE GATES, IN ORDER, ALL FAIL-CLOSED:
 *    1. read-before-cite, PER DOCUMENT — no snapshot for THIS document, no citation.
 *    2. the snapshot must still be the one that was read — else the world moved; re-read.
 *    3. a duplicate idx REFUSES — first-wins would re-smuggle array order as authority.
 *    4. an empty citable set is named as such rather than reported as a bad index.
 *    5. the model's field_path must EQUAL the region's own — the resolved evidence carries
 *       the REGION'S label, never the model's string, so it is DB-sourced end to end.
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

/** THE COUNTERPARTY CONTRACT, layer 2 of 3 (skeleton §2a): the runtime tool derives the
 *  authoritative counterparty kind from coding_kind — supplier_bill -> vendor, sales_* ->
 *  customer. F-A2 adds the GENERIC arm, which derives NOTHING: a journal_entry names no party,
 *  so the honest answer is `null`, never a defaulted "customer". The v8 body's `? :` would have
 *  silently made every generic entry a customer entry — the exact shape of defect B14 exists to
 *  refuse — so this is a real behavioural change, not a type widening. Pure. */
export function deriveCounterpartyKind(codingKind: DraftInput["coding_kind"]): "vendor" | "customer" | null {
  if (codingKind === "journal_entry") return null;
  return codingKind === "supplier_bill" ? "vendor" : "customer";
}

/** PR #204 / 7A-R2: the coding_kind values an admitted direction allows. A `direction` of
 *  null (a pre-migration attempt row, or a document whose admission resolved neither way)
 *  returns null — no early family to check, the DB draft writer stays the sole authority.
 *
 *  F-A2 / GB-1 / D30 — THE DELIBERATE WIDENING, and it is deliberate in the direction people do
 *  not expect. The design requires that `allowedCodingKindsForDirection` be extended
 *  DELIBERATELY when the enum widens, and the extension is that `journal_entry` is **NOT** added
 *  to either bound family. That is a decision with a reason, not an omission:
 *
 *    * `coding_kind` is a MODEL-SUPPLIED input, so the kind SELECTS which walls bind. Before
 *      B15, a corroborated supplier invoice drafted `journal_entry` passed every rung — a
 *      phantom payment with the payable suppressed. B15 now refuses exactly that at the ladder
 *      (`generic_on_directional_document`), and this function refuses it one layer earlier, with
 *      a named early refusal instead of a DB roundtrip.
 *    * The two bound arms are therefore BYTE-IDENTICAL to v8's, and that identity is the point:
 *      the enum grew from three members to four, so an arm that lists two of them now EXCLUDES
 *      the generic kind BY CONSTRUCTION rather than by not having heard of it.
 *    * D18 survives: a genuinely direction-unresolved document has `direction === null`, this
 *      function returns null, `journal_entry` reaches the DB, and B15 judges the DOCUMENT's own
 *      class (`clara._direction_class`) rather than the admission bound. The runtime never
 *      decides that question — it only declines to contradict an admission that already did.
 *
 *  NOBODY SHOULD LATER "RESTORE" journal_entry TO EITHER ARM. Doing so would re-open GB-1's
 *  hole at the runtime layer while leaving B15 to catch it at the ladder — trading a named early
 *  refusal for a Tier-B receipt on every generic-on-directional draft. Pure. */
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
    // F-A2: the GENERIC kind passes NO counterparty at all. `deriveCounterpartyKind` returns
    // null for it and the schema already forbids the model supplying one, so this is the third,
    // independent place the same fact is stated — deliberately, because the v8 spread would
    // otherwise send `{kind: null}`, an OBJECT, where the DB expects the absence of one.
    const derivedKind = deriveCounterpartyKind(input.coding_kind);
    const counterpartyPayload =
      derivedKind === null ? null : { ...(input.counterparty as Record<string, unknown>), kind: derivedKind };

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
          counterpartyPayload === null ? null : JSON.stringify(counterpartyPayload),
          JSON.stringify(cited.evidence),
          JSON.stringify(coding),
          // F-A2 / D18: the GENERIC kind reaches the DB as a NULL `coding_kind`, which is what
          // `journal_entry` MEANS in the ledger — `ck_je_coding_kind` admits NULL and
          // `_draft_entry_core`'s coded-kind preconditions are all guarded `is not null`. The
          // model-facing name and the column value are deliberately different: the model needs a
          // word, the column needs the absence of one.
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

// THE TOOL SET ITSELF LIVES IN autoDraft.v9.toolset.ts — moved out of this file at v9 because
// the POST tool joins it and this file is at the repo's 500-line ceiling. The seam is
// "wrappers vs wiring": everything above is a pure or DB-facing WRAPPER that a unit test calls
// directly, and the toolset module is the AI-SDK wiring that binds them to a ctx.
