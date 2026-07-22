// @frozen
//
// FROZEN — the prompt text + draft input schema + typed-part shapes of autoDraft_v2
// (Wave-A auto-draft sweep; contract §3 / companion §4-5). A NEW frozen closure beside
// the byte-untouched autoDraft_v1 (ARCHITECTURE Appendix A: a behavioural change ships as
// a new _vN export, never an in-place edit; the registry repoints `autoDraft:` here). The
// freeze-lint hash-locks this file as part of autoDraft.v2.ts's import closure. It imports
// NO first-party infrastructure — the DB-backed tools are BUILT with an injected pool
// handle inside the step that runs them (autoDraft.v2.impl.ts).
//
// v2 vs v1 (the delta — Wave-A2.1, PROMPT-ONLY; the schema + steps are byte-identical to
// v1): the purchase 3-leg VISIBILITY split when a bill's facts state a tax amount (an
// expense-net DEBIT + a tied sst_purchase_cost DEBIT = the stated tax + AP gross; Malaysian
// SST has no input-tax credit), and an awareness note that the context pack may carry an
// `sst_registration_watch` block — the sweep may MENTION it in a draft note with its basis
// label but NEVER acts on it (surfacing/decisions belong to the attended chat lane).
//
// autoDraft_v2 is the UNATTENDED coding lane: there is NO human in the loop, so there is
// NO clarify tool and NO park. The model reads the client-pinned surface and either DRAFTS
// exactly one supplier bill (draft_journal_entry -> wake_draft_entry) or produces no draft;
// a question-shaped non-draft may open a scoped open-question (wake_open_question, origin
// sweep_refusal) — never any other write. One bill per task by construction
// (uq_coding_attempts_task + the WA-L8 double_coded no-op).
//
// Deliberately a version-independent local copy of the draft schema + part shapes (a versioned
// workflow must never couple its shape to another version's frozen file). Third-party imports
// (ai, zod) are outside the freeze surface.

import { z } from "zod";

/** The single tool name the draft-detection + terminal law keys on. */
export const DRAFT_TOOL = "draft_journal_entry";

/** The unattended sweep coder. Reads the client-pinned surface, drafts ONE supplier bill
 *  for a human to review, and never approves, posts, or invents a figure. Because no human
 *  is present, when a lawful draft is not possible she DOES NOT guess and DOES NOT clarify —
 *  she simply produces no draft (the workflow records the honest outcome). */
export const SYSTEM_PROMPT_AUTODRAFT_V2 = [
  "You are Clara, drafting a supplier-bill journal entry for a Malaysian accounting firm as an",
  "automated background pass — no human is watching this run. You can read the firm's books,",
  "the client context pack, and the document's stored extraction, and you can DRAFT exactly one",
  "supplier-bill journal entry for a human bookkeeper to review later. You never approve, post,",
  "or finalise anything, and a human approves every draft.",
  "The database owns every number: never compute, sum, or invent a figure — read amounts from",
  "the document's extracted invoice facts and cite them (region id + exact quote per amount).",
  "",
  "Draft the entry GROSS to the expense account code(s) from the client's active chart of",
  "accounts (in the context pack), with an equal credit to the Accounts Payable control account,",
  "naming the supplier as the counterparty on every payable line. One document becomes one draft",
  "(a split bill is one draft with several debit lines). Then call `draft_journal_entry` with the",
  "lines, the document_id, the vendor, and an evidence array. This sweep only ever codes a",
  "supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.",
  "",
  "When the bill's extracted facts STATE a tax amount, draft it as a 3-leg VISIBILITY split: the",
  "expense account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to",
  "the stated tax figure from the facts (choose the account carrying the sst_purchase_cost special",
  "type in the chart of accounts), and the Accounts Payable CREDIT for the GROSS. Malaysian SST",
  "has NO input-tax credit — this leg is a visibility split of the expense cost, never a",
  "recoverable asset and never an sst_output leg; never invent a tax figure the facts do not state.",
  "",
  "The context pack (via get_context_pack, purpose \"coding\") may include an `sst_registration_watch`",
  "block — a DB-computed screening estimate. You may MENTION it in the draft's note or rationale with",
  "its basis label (\"a DB-computed screening estimate\"), but this unattended sweep NEVER acts on it:",
  "never surface a decision, never compute tax, never multiply by 8%, never infer a registration",
  "status. Surfacing and professional review belong to the attended chat lane.",
  "",
  "This ledger is MYR-only. If the bill is not lawfully draftable — a non-MYR currency, an",
  "ambiguous or unresolvable supplier, missing corroborated amounts, or a multi-document bundle —",
  "DO NOT draft and DO NOT guess: reply with a short plain-text explanation of exactly what is",
  "blocking the draft. There is no human to ask right now; a truthful non-draft is correct.",
  "State any uncertainty qualitatively with alternatives — never a percentage, never a suspense account.",
  "Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.",
].join("\n");

// ---------------------------------------------------------------------------
// The draft_journal_entry input schema (contract §3 verbatim; a local copy — the
// wrapper in autoDraft.v2.tools.ts fetches sha256 / resolution / books_version /
// op_key SERVER-side, so the model NEVER supplies them).
// ---------------------------------------------------------------------------
export const draftJournalEntryInputSchema = z.object({
  posting_date: z.string().describe("The entry posting date (YYYY-MM-DD), from the bill."),
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
    .describe("At least two balanced lines: expense debit(s) gross + one Accounts Payable credit."),
  document_id: z.string().uuid().describe("The filed supplier bill this entry codes."),
  vendor: z
    .union([
      z.object({ existing_id: z.string().uuid() }),
      z.object({ new: z.object({ name: z.string(), registration_no: z.string().optional() }) }),
    ])
    .describe("The counterparty: an existing vendor id, or a proposed new vendor (match-before-create)."),
  evidence: z
    .array(
      z.object({
        region_id: z.string().uuid(),
        quote: z.string(),
        field_path: z.string().optional(),
      }),
    )
    .min(1)
    .describe("Cited facts (region id + exact quote) backing the amounts — REQUIRED for a document-bound draft."),
  uncertainty: z
    .object({ note: z.string(), alternatives: z.array(z.string()) })
    .optional()
    .describe("Qualitative uncertainty + alternatives (never a percentage)."),
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
 * Reduce a completed model segment's content to the terminal AutoDraft outcome. A
 * successful draft_journal_entry tool RESULT yields `drafted`; a refusal whose reason is
 * a double_coded variant yields `noop_existing` (WA-L8, success-shaped); any other refusal
 * yields `refused`; content with neither is `none`. Pure — unit-testable with no DB/model.
 */
export function toAutoDraftOutcome(content: readonly AiContentPart[]): AutoDraftOutcome {
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName: string; output: unknown };
    if (tr.toolName !== DRAFT_TOOL) continue;
    const output = (tr.output ?? {}) as { je_review?: unknown; refusal?: unknown };
    if (isJeReview(output.je_review)) {
      return { kind: "drafted", entryId: output.je_review.entry_id, jeReview: output.je_review };
    }
    if (isRefusal(output.refusal)) {
      if (isDoubleCodedReason(output.refusal.reason)) return { kind: "noop_existing", reason: output.refusal.reason ?? "double_coded" };
      return { kind: "refused", refusal: output.refusal };
    }
  }
  return { kind: "none" };
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
