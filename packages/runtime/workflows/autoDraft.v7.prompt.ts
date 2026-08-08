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
// THIS FILE (prompt) — v7 vs v6, TWO changes and nothing else:
//   1. The draft schema's `evidence[]` element becomes { region_idx: int >= 1, quote,
//      field_path? }. `region_id` is GONE from the toolface entirely — not deprecated,
//      not optional, gone: a field the model cannot supply is a field it cannot
//      mis-transcribe. `.min(1)` on the array is unchanged (evidence stays REQUIRED).
//   2. The system prompt's citation sentence teaches the idx, and says explicitly that a
//      long id is not accepted.
// Everything else — the whole direction/leg-shape/SST/watch/wiki/MYR-only body of the
// prompt, every other schema field, the superRefine counterparty contract, and every typed
// part shape (AiContentPart/JeReviewPart/RefusalPart/DraftToolResult/AutoDraftOutcome,
// toAutoDraftOutcome/isDoubleCodedReason/isQuestionShaped) — is byte-carried from v6.
//
// Deliberately a version-independent local copy of the draft schema + part shapes (a
// versioned workflow must never couple its shape to another version's frozen file).
// Third-party imports (ai, zod) are outside the freeze surface.

import { z } from "zod";

/** The single tool name the draft-detection + terminal law keys on. */
export const DRAFT_TOOL = "draft_journal_entry";

/** The unattended sweep coder. Reads the client-pinned surface, drafts ONE
 *  purchase OR sales document for a human to review, and never approves, posts,
 *  or invents a figure. Because no human is present, when a lawful draft is not
 *  possible she DOES NOT guess and DOES NOT clarify — she simply produces no
 *  draft (the workflow records the honest outcome). */
export const SYSTEM_PROMPT_AUTODRAFT_V7 = [
  "You are Clara, drafting a journal entry for a Malaysian accounting firm as an automated",
  "background pass — no human is watching this run. You can read the firm's books, the client",
  "context pack, and the document's stored extraction, and you can DRAFT exactly one journal",
  "entry for a human bookkeeper to review later. You never approve, post, or finalise anything,",
  "and a human approves every draft.",
  "The database owns every number: never compute, sum, or invent a figure — read amounts from",
  "the document's extracted invoice facts and cite them. CITE A REGION BY ITS `idx` — the small",
  "integer read_document prints on every region — together with the exact quote for that amount.",
  "NEVER type a region's long id: the tool does not accept one, and the server resolves your idx",
  "back to the region itself. Always call read_document in THIS run before you draft — an idx only",
  "means something against the list that call printed — and echo each cited region's own field_path",
  "exactly as it was printed. If the document's extraction changed in between, the draft is refused",
  "and you simply read again and re-cite; that is a normal outcome, not an error to explain away.",
  "",
  "This document was admitted into a BOUND direction — sales or purchase — before this run",
  "started. Your coding_kind choice is a PROPOSAL the database revalidates against that bound",
  "family, never routing authority. Decide which side the CLIENT is on from the extracted facts:",
  "if the client is the issuer/supplier and the other party is the customer, it is a SALES",
  "document (coding_kind \"sales_invoice\", or \"sales_credit_note\" for the exact mirror); if the",
  "client is the bill-to party, it is a supplier bill (coding_kind \"supplier_bill\"). Never code",
  "one direction as the other. If the document's own direction is ambiguous or contradicts the",
  "facts, do NOT draft and do NOT guess — explain the block in text.",
  "",
  "Choose the account code(s) from the client's active chart of accounts (in the context pack)",
  "and propose the counterparty — the VENDOR on a supplier_bill, the CUSTOMER on a",
  "sales_invoice/sales_credit_note — as a match-before-create id or a new-counterparty proposal.",
  "NEVER set counterparty.kind yourself: it is derived server-side from coding_kind, and a",
  "contradictory kind is rejected. One document becomes one draft (a split bill or invoice is one",
  "draft with several lines). Then call `draft_journal_entry` with coding_kind, the lines, the",
  "document_id, the counterparty, and an evidence array.",
  "",
  "SUPPLIER BILL leg shape depends on one thing — whether the bill's extracted facts STATE a",
  "NONZERO tax amount. Check that first, every time:",
  "  * NO stated tax in the facts, OR a stated tax that is EXACTLY ZERO: a TWO-leg entry — the",
  "    expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same",
  "    GROSS. A stated-but-zero tax figure documents \"no tax was charged\" — it does not open a",
  "    visibility leg (a zero-amount leg conveys nothing and is not a meaningful debit).",
  "  * A STATED NONZERO tax amount in the facts: a THREE-leg VISIBILITY split — the expense",
  "    account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the",
  "    stated tax figure from the facts (choose the account carrying the sst_purchase_cost",
  "    special type in the chart of accounts), and the Accounts Payable CREDIT for the GROSS.",
  "When the facts state a NONZERO tax amount NEVER put the gross on the expense leg and NEVER",
  "drop the tied tax leg; when they state none, or state zero, NEVER invent a tax leg. Malaysian",
  "SST has NO input-tax credit — the tax leg (when one applies) is a visibility split of the",
  "expense cost, never a recoverable asset and never an sst_output leg.",
  "A client-issued document — the client is the ISSUER, not the bill-to party — is NEVER coded",
  "here even if it superficially resembles a bill: code it as sales_invoice below, crediting",
  "income, never as a supplier_bill crediting Accounts Payable.",
  "",
  "SALES INVOICE / SALES CREDIT NOTE leg shape: debit (sales_invoice) or credit",
  "(sales_credit_note) the Trade Debtors (receivable-class) control account for the GROSS total;",
  "credit (sales_invoice) or debit (sales_credit_note) revenue account(s) for the NET; when the",
  "document carries stated tax facts, also credit (sales_invoice) or debit (sales_credit_note)",
  "the SST output account for the stated tax figure — no stated tax means a two-leg draft, the",
  "receivable leg exactly equal to the revenue leg. SST output tax is sales-only and is never",
  "mixed with the purchase-side sst_purchase_cost account.",
  "",
  "The context pack (via get_context_pack, purpose \"wiki_coding\") may include an `sst_registration_watch`",
  "block. Because no human is watching this run, the ONLY thing you may ever say about it is that an",
  "SST registration watch is OPEN for this client and that the professional handles it in the review",
  "queue. NEVER quote any figure, status, tier, window, or deadline from it, and NEVER draw ANY",
  "conclusion from it: no liability, no registration status, no tax computation, no multiplying by",
  "8%, no threshold judgement, no future-method inference, and never \"below threshold\" or \"no",
  "issue\". This unattended sweep NEVER acts on it — surfacing and professional review belong to the",
  "attended chat lane.",
  "",
  "Clara's wiki notes: the context pack may include a `wiki` block — Clara-maintained advisory",
  "notes (basis `clara_maintained_advisory_notes`, permitted_use `inform_never_decide`) built from",
  "this client's own approved history. Wiki content may INFORM this draft; it may NEVER decide one",
  "— every DB gate, bound, floor, and autopost rule stays authoritative regardless of what the wiki",
  "says, and this sweep draft remains human-reviewed under the same acknowledgement floors as any",
  "other draft. When a wiki page informs this draft, cite it BY SLUG AND TITLE in the entry's memo",
  "(e.g. \"per the <slug> page, '<title>'\") so the citation stays visible to the reviewing",
  "bookkeeper even though this unattended run keeps no transcript.",
  "The block's `last_projected_seq` versus the pack's `books_version` is a LAG MARKER: a gap means",
  "the wiki notes are POSSIBLY STALE relative to the books. The books_version freshness token stays",
  "authoritative regardless of the wiki's projection lag — never treat a wiki note as more current",
  "than the books.",
  "",
  "This ledger is MYR-only. If the document is not lawfully draftable — a non-MYR currency, an",
  "ambiguous or unresolvable counterparty, missing corroborated amounts, a document whose stated",
  "type does not match the coding kind, or a multi-document bundle — DO NOT draft and DO NOT",
  "guess: reply with a short plain-text explanation of exactly what is blocking the draft. There",
  "is no human to ask right now; a truthful non-draft is correct.",
  "State any uncertainty qualitatively with alternatives — never a percentage, never a suspense account.",
  "Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.",
].join("\n");

// ---------------------------------------------------------------------------
// The draft_journal_entry input schema (skeleton §2a verbatim; a local copy — the
// wrapper in autoDraft.v7.tools.ts fetches sha256 / resolution / books_version /
// op_key SERVER-side, so the model NEVER supplies them).
// ---------------------------------------------------------------------------
export const draftJournalEntryInputSchema = z
  .object({
    coding_kind: z
      .enum(["supplier_bill", "sales_invoice", "sales_credit_note"])
      .describe(
        "The entry kind, bound by the client's admitted direction for this document (a " +
          "purchase-direction document only accepts supplier_bill; a sales-direction document " +
          "only accepts sales_invoice or sales_credit_note — the DB revalidates the bound family " +
          "and refuses a contradiction): supplier_bill (expense debit(s) + an Accounts Payable " +
          "credit — expense GROSS when the facts state NO tax or a stated ZERO tax; expense NET " +
          "plus one tied sst_purchase_cost debit when they state a NONZERO tax), sales_invoice " +
          "(Trade Debtors debit + revenue credit — a customer-facing debit note too), or " +
          "sales_credit_note (the exact mirror: Trade Debtors credit + revenue debit).",
      ),
    posting_date: z.string().describe("The entry posting date (YYYY-MM-DD), from the document."),
    memo: z.string().optional().describe("Optional short memo for the entry."),
    lines: z
      .array(
        z.object({
          account_code: z.string().describe("An account code from the client's active chart of accounts."),
          debit_cents: z.number().int().min(0),
          credit_cents: z.number().int().min(0),
          description: z.string().optional(),
        }),
      )
      .min(2)
      .describe(
        "At least two balanced lines. supplier_bill when the facts state NO tax, or a stated tax " +
          "that is EXACTLY ZERO: expense debit(s) GROSS + one Accounts Payable credit GROSS (two " +
          "legs). supplier_bill when the facts state a NONZERO tax: expense debit(s) NET + ONE " +
          "sst_purchase_cost debit equal EXACTLY to the stated tax + one Accounts Payable credit " +
          "GROSS (three legs) — never gross-to-expense with a tax leg, never a dropped tax leg " +
          "when one is required. sales_invoice: one Trade Debtors (receivable) debit GROSS + " +
          "revenue credit(s) NET (+ an SST output credit when the document states tax). " +
          "sales_credit_note: the exact mirror.",
      ),
    document_id: z.string().uuid().describe("The filed document this entry codes."),
    counterparty: z
      .union([
        z.object({ kind: z.enum(["customer", "vendor"]).optional(), existing_id: z.string().uuid() }),
        z.object({
          kind: z.enum(["customer", "vendor"]).optional(),
          new: z.object({ name: z.string(), registration_no: z.string().optional() }),
        }),
      ])
      .describe(
        "The counterparty: an existing id, or a proposed new counterparty (match-before-create). " +
          "The VENDOR on a supplier_bill, the CUSTOMER on a sales_invoice/sales_credit_note. NEVER " +
          "set `kind` yourself — it is derived server-side from coding_kind (vendor for " +
          "supplier_bill, customer for sales_invoice/sales_credit_note); an explicit kind that " +
          "contradicts coding_kind is rejected.",
      ),
    evidence: z
      .array(
        z.object({
          region_idx: z
            .number()
            .int()
            .min(1)
            .describe(
              "The region's `idx` from THIS run's read_document call — a small 1-based integer, NOT a " +
                "region id. The server resolves it against the very list that call printed; if the " +
                "document's extraction has changed since, the draft is refused and you simply read " +
                "the document again and re-cite.",
            ),
          quote: z.string(),
          field_path: z
            .string()
            .describe(
              "The region's OWN `field_path`, copied EXACTLY as read_document printed it — send an " +
                "empty string for a region that printed none. You never choose this label, you echo " +
                "it: it is checked against the region your idx names, and the database records the " +
                "region's own label either way.",
            ),
        }),
      )
      .min(1)
      .describe(
        "Cited facts (region idx + exact quote + the region's own field_path) backing the amounts — " +
          "REQUIRED for a document-bound draft. Read the document in THIS run before citing: an idx " +
          "only means something against the list you were shown.",
      ),
    uncertainty: z
      .object({ note: z.string(), alternatives: z.array(z.string()) })
      .optional()
      .describe("Qualitative uncertainty + alternatives (never a percentage)."),
  })
  .superRefine((val, ctx) => {
    // Layer 2 of the counterparty contract (skeleton §2a) — ergonomics, not the
    // guard: reject a model-supplied counterparty.kind that contradicts the
    // coding_kind-derived kind outright. Layer 1 is this file's schema shape;
    // layer 3 (the only AUTHORITY layer) is the DB draft writer, which
    // re-derives and re-rejects independently.
    const expectedKind = val.coding_kind === "supplier_bill" ? "vendor" : "customer";
    const suppliedKind = (val.counterparty as { kind?: "customer" | "vendor" }).kind;
    if (suppliedKind && suppliedKind !== expectedKind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["counterparty", "kind"],
        message: `counterparty.kind "${suppliedKind}" contradicts coding_kind "${val.coding_kind}" (expected "${expectedKind}").`,
      });
    }
  });

// ---------------------------------------------------------------------------
// Typed shapes. autoDraft does NOT persist a transcript (settle_autodraft_task takes
// no parts jsonb) — these shapes are internal to the workflow, describing the draft
// tool's result and the terminal outcome the settle maps from.
// ---------------------------------------------------------------------------

/** @internal a minimal shape for an AI SDK content part we care about. */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "tool-error"; toolCallId: string; toolName: string; error: unknown }
  | { type: string; [k: string]: unknown };

export type JeReviewPart = {
  type: "je_review";
  entry_id: string;
  revision_token: string;
  client_id: string;
  document_id: string;
  provenance_tier: "verified" | "model_read";
  exception?: boolean;
  uncertainty?: { note: string; alternatives: string[] };
};

/** A typed, oracle-safe refusal. `reason` discriminates the sweep-refusal handling
 *  (double_coded -> success-shaped noop; question-shaped -> may open an open-question). */
export type RefusalPart = { type: "refusal"; code: string; reason?: string; message: string };

/** The result shape the draft_journal_entry wrapper returns. */
export type DraftToolResult =
  | { ok: true; je_review: JeReviewPart }
  | { ok: false; refusal: RefusalPart };

/** The terminal outcome the workflow settles from, derived from the model segment. */
export type AutoDraftOutcome =
  | { kind: "drafted"; entryId: string; jeReview: JeReviewPart }
  | { kind: "noop_existing"; reason: string } // BOTH double_coded reasons -> success-shaped
  | { kind: "refused"; refusal: RefusalPart } // a question-shaped or terminal refusal
  | { kind: "none" }; // the model produced no draft and no refusal (e.g. explained a block in prose)

function isJeReview(v: unknown): v is JeReviewPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "je_review";
}
function isRefusal(v: unknown): v is RefusalPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "refusal";
}

/** The reasons the WA-L8 "one draft per filing" no-op surfaces as (companion §14). Either
 *  maps to a SUCCESS-shaped settle (`noop_existing`) — the bill is already being coded. */
export function isDoubleCodedReason(reason: string | undefined): boolean {
  return reason === "double_coded" || reason === "already_coded";
}

/**
 * Reduce a completed model segment's content to the terminal AutoDraft outcome. A successful
 * draft_journal_entry tool RESULT yields `drafted`; a refusal whose reason is a double_coded
 * variant yields `noop_existing` (WA-L8, success-shaped); any other refusal yields `refused`;
 * content with neither is `none`. Pure — unit-testable with no DB/model.
 *
 * THE FIX ROUND'S SECOND DEFECT (Codex re-verify HIGH, CONFIRMED BY EXECUTION). v1..v6 of
 * this reducer returned on the FIRST draft_journal_entry result. `content` is not one step:
 * the AI SDK's `content` getter flattens EVERY step chronologically (ai@7.0.31 dist/index.js
 * :9679), and the model loop runs up to eight steps. So the sequence
 * `[transient refusal, successful draft]` reduced to `refused` — measured — and the workflow
 * then settled the run FAILED while the successful DB write already stood. A receipt that
 * lies about a draft that exists is worse than the refusal it reports.
 *
 * PRE-EXISTING, NEWLY REACHABLE — and that distinction is why the fix ships HERE and not as
 * a patch to frozen bodies. autoDraft.v6.prompt.ts carries this function BYTE-IDENTICALLY;
 * the defect is v6's too. What v7 changed is the REACHABILITY: v7's system classification
 * (errors.ts) deliberately INVITES an in-run retry — "read the document again and re-cite" —
 * so the retry-then-succeed sequence stops being a corner case and becomes the designed
 * happy path for every transient. v6/v9 stay frozen and byte-untouched (Appendix A); the
 * corrected reducer is part of the v7/v10 closures only.
 *
 * THE RULE, AND WHY IT IS NOT SIMPLY "TAKE THE LAST RESULT". Precedence, then recency:
 *   drafted  >  noop_existing  >  refused  >  none,   and the LAST result within each class.
 * "Last result" alone is wrong in one reachable shape: the model may emit two draft
 * tool-CALLS inside ONE step, so a step's results can be `[success, refusal]` — and
 * `stoppedOnSuccessfulDraft` (impl.ts) stops the loop when ANY result in the last step has
 * `output.ok === true`, regardless of its position in that step. Aligning with that stop
 * condition therefore means "a success anywhere wins", not "whatever came last wins". The
 * two discriminants agree by construction: runDraftJournalEntry returns exactly
 * `{ok:true, je_review}` or `{ok:false, refusal}`, so `ok === true` and `isJeReview(...)`
 * are the same fact read two ways.
 * `noop_existing` outranks `refused` for the same honesty reason the WA-L8 rule exists: a
 * double_coded refusal is the DB reporting that the work ALREADY EXISTS, so a later
 * transient must not turn "already coded" into "failed".
 *
 * AND WITHIN `refused`, A QUESTION-SHAPED REFUSAL OUTRANKS A LATER ONE THAT IS NOT (native
 * round-3 review, measured). Plain recency loses the one refusal a human can actually act
 * on: `[CLR23 vendor conflict, transient idx slip]` reduced to the transient, so
 * isQuestionShaped answered FALSE, NO scoped open-question was opened, and the filing could
 * park carrying "transient" as its legible last_refusal — the vendor conflict buried behind
 * a retry artefact. The rule is therefore: the LAST question-shaped refusal if any exists,
 * else the LAST refusal. Recency still decides between two of the same kind; it just no
 * longer lets a system condition outrank a human decision. This is the same precedence
 * instinct as drafted/noop above — prefer the refusal that carries the most actionable
 * truth — applied one level down.
 */
export function toAutoDraftOutcome(content: readonly AiContentPart[]): AutoDraftOutcome {
  let drafted: AutoDraftOutcome | null = null;
  let noop: AutoDraftOutcome | null = null;
  let refused: AutoDraftOutcome | null = null;
  let refusedQuestionShaped: AutoDraftOutcome | null = null;
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName: string; output: unknown };
    if (tr.toolName !== DRAFT_TOOL) continue;
    const output = (tr.output ?? {}) as { je_review?: unknown; refusal?: unknown };
    if (isJeReview(output.je_review)) {
      drafted = { kind: "drafted", entryId: output.je_review.entry_id, jeReview: output.je_review };
      continue;
    }
    if (isRefusal(output.refusal)) {
      if (isDoubleCodedReason(output.refusal.reason)) {
        noop = { kind: "noop_existing", reason: output.refusal.reason ?? "double_coded" };
      } else {
        refused = { kind: "refused", refusal: output.refusal };
        if (isQuestionShaped(output.refusal)) refusedQuestionShaped = refused;
      }
    }
  }
  return drafted ?? noop ?? refusedQuestionShaped ?? refused ?? { kind: "none" };
}

/** The refusal reasons that warrant opening a scoped open-question (a human must decide) vs
 *  a plain failed settle. Vendor/currency/ambiguity blocks are question-worthy; a transient
 *  or internal fault is not. Pure. */
export function isQuestionShaped(refusal: RefusalPart | undefined): boolean {
  if (!refusal) return false;
  const r = refusal.reason ?? "";
  return (
    refusal.code === "CLR23" || // supplier could not be resolved as proposed
    r === "vendor_unresolved" ||
    r === "vendor_ambiguous" ||
    r === "vendor_malformed" ||
    r === "currency_unsupported" ||
    r === "evidence_invalid"
  );
}
