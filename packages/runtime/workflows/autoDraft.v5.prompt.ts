// @frozen
//
// FROZEN — the prompt text + draft input schema + typed-part shapes of autoDraft_v5
// (Wave-A auto-draft sweep; contract §3 / companion §4-5). A NEW frozen closure beside
// the byte-untouched autoDraft_v1/v2/v3/v4 (ARCHITECTURE Appendix A: a behavioural change
// ships as a new _vN export, never an in-place edit; the registry repoints `autoDraft:`
// here). The freeze-lint hash-locks this file as part of autoDraft.v5.ts's import closure.
// It imports NO first-party infrastructure — the DB-backed tools are BUILT with an injected
// pool handle inside the step that runs them (autoDraft.v5.impl.ts).
//
// v5 vs v4 (ledger #46, owner ruling 2026-07-29 — THE SST-ZERO PRECEDENT): the ONLY
// functional change this wave ships, anywhere in the autoDraft_v5 closure, is HERE — the
// purchase-leg SHAPE rule below (+ its .describe() echo on the draft schema below, and its
// separate echo on the DRAFT_TOOL's own description in autoDraft.v5.tools.ts).
//
// THE FINDING (recovered live, read-only, via ~/.clara-tools/live_ro.py against
// workflow.workflow_stream_chunks, decoded byte-for-byte devalue): task
// 7b389b4f-86af-4c72-ac17-07f1084eccb9 (filing 0586d531-f02c-4077-a14b-41a96965c83f,
// IV-00743, run wrun_01KYP3AYD044CA932JQFEJC9K2, 2026-07-29, model gpt-5.6-terra — the
// CORRECT model post-ledger-#44) settled CLR21 coding_incomplete on its second and final
// attempt. The model's own final answer: "Cannot draft: the invoice states SST of
// \"0.00\", which requires the stated-tax entry shape, but the active chart has no account
// marked `sst_purchase_cost` for the required SST visibility line." Corroborated directly
// against the SAME run's own tool-result stream: the bill's extracted text carries a
// literal "SST Amt @ 6%: 0.00" line (a STATED tax figure, per the pre-v5 rule below, that
// computes to zero), and the client's (ROME SECRETARY SDN BHD) get_context_pack `coa` was
// exactly five accounts, none carrying special_acc_type sst_purchase_cost. The model's
// refusal was CORRECT under the pre-v5 rule and non-hallucinated — coding_lane's own
// output was a clean `lane:"ready"`, ruling out a vendor/lane cause.
//
// THE OWNER'S RULING: the client's OWN four previously-approved EZSEC entries (ids
// 262/280/295/310 — every one of them printing the IDENTICAL "SST Amt @ 6%: 0.00" line)
// are ALL two-leg (expense debit GROSS, Accounts Payable credit GROSS — no
// sst_purchase_cost leg at all). A stated-but-ZERO tax figure documents "no tax charged";
// a zero-amount visibility leg conveys nothing and would likely be refused by entry
// validation anyway (a zero-cents line is not a meaningful debit). The coding contract
// refines to: a STATED NONZERO tax takes the three-leg sst_purchase_cost visibility split
// (UNCHANGED); a STATED ZERO tax, or NO stated tax at all, takes the two-leg shape. The
// zero-stated fact itself remains recorded in the extraction facts exactly as it already
// is — this is a DRAFTING-SHAPE rule only, never a facts-extraction change. Attempt 3
// against IV-00743 is deliberately NOT triggered by this fix — the filing stays parked as
// the control's honest record (its own two real, distinct failures predate this rule); the
// fourth firing targets a FRESH filing under the SAME recurring-vendor family instead.
//
// v4 vs v3 (ledger #44/GitHub #42): v4 was an UNMODIFIED version-rename of v3 — the prompt
// text, draft schema, and typed-part shapes were unaffected by that wave's fix (it lived
// entirely in the model step's stream-error handling and the workflow entry's catch block).
//
// v3 vs v2 (Wave B, ADR-032 WB-R6/WB-R7, FORK-6, AMB-1/AMB-2, WB-R6(4)): the draft schema
// STRUCTURE and the tool mapping are identical to v2 — this is a PROMPT + pack-purpose
// delta only, shipped in the SAME ceremony as chatTurn_v7 (WB-R7: sweep drafts remain
// human-reviewed under the acknowledgement floors; the eval carries a sweep-specific W2
// probe). v3 fetches the context pack for purpose "wiki_coding" (AMB-1) instead of v2's
// "coding" default at the call site that feeds MODEL context (the get_context_pack TOOL),
// and the server-side tool boundary sets the txn-local `clara.pack_consumer = 'v25'` GUC
// (FORK-6) immediately before that fetch, in the SAME transaction, so a frozen pre-v3
// consumer replaying the same SQL text can never surface the wiki block (WB-R6(2)'s
// structural claim). The tool's `purpose` input is pinned to the literal enum
// "wiki_coding" (z.literal). The prompt adds the WB-R6(4) wiki framing, adapted for this
// UNATTENDED lane: the pack's `wiki` block is Clara-maintained advisory notes (basis
// `clara_maintained_advisory_notes`, permitted_use `inform_never_decide`) that may INFORM
// this draft but NEVER decide one — every DB gate/bound/floor/autopost rule stays
// authoritative, and this sweep draft remains human-reviewed under the SAME
// acknowledgement floors as any other draft (WB-R7). Because this lane persists no
// transcript, a wiki-informed draft cites the page (slug + title) in the entry's memo so
// the citation stays visible to the reviewing bookkeeper. The block's `last_projected_seq`
// vs the pack's `books_version` is a lag marker (possibly-stale); books_version stays the
// authoritative freshness token (WB-R3). ALL v2 clauses carry byte-preserved below.
//
// v2 vs v1 (carried, Wave-A2.1, PROMPT-ONLY; the schema STRUCTURE + steps are identical to
// v1 — field names and types untouched — but the model-facing description TEXT is deliberately
// NOT byte-identical: the `.describe()` string and the draft tool's description carry the
// conditional purchase-leg rule, because a rule the schema surface contradicts is a rule the
// model breaks): the purchase leg shape is CONDITIONAL on the facts (v5 REFINES this to a
// NONZERO/zero-or-absent split — see above; this paragraph is carried for the fork's own
// history) — no stated tax ⇒ 2 legs (expense GROSS + AP GROSS); a stated tax ⇒ a 3-leg
// VISIBILITY split (expense-net DEBIT + a tied sst_purchase_cost DEBIT = the stated tax +
// AP gross; Malaysian SST has no input-tax credit). Plus an EXISTENCE-ONLY note that the
// context pack may carry an `sst_registration_watch` block: this unattended lane may say
// only that a watch is open and that the professional handles it in the review queue — no
// figure, status, deadline or conclusion — and NEVER acts on it (surfacing/decisions
// belong to the attended chat lane).
//
// autoDraft_v5 is the UNATTENDED coding lane: there is NO human in the loop, so there is
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
export const SYSTEM_PROMPT_AUTODRAFT_V5 = [
  "You are Clara, drafting a supplier-bill journal entry for a Malaysian accounting firm as an",
  "automated background pass — no human is watching this run. You can read the firm's books,",
  "the client context pack, and the document's stored extraction, and you can DRAFT exactly one",
  "supplier-bill journal entry for a human bookkeeper to review later. You never approve, post,",
  "or finalise anything, and a human approves every draft.",
  "The database owns every number: never compute, sum, or invent a figure — read amounts from",
  "the document's extracted invoice facts and cite them (region id + exact quote per amount).",
  "",
  "Choose the expense account code(s) from the client's active chart of accounts (in the context",
  "pack) and name the supplier as the counterparty on every payable line. One document becomes one",
  "draft (a split bill is one draft with several debit lines). Then call `draft_journal_entry` with",
  "the lines, the document_id, the vendor, and an evidence array. This sweep only ever codes a",
  "supplier bill (purchase direction): the counterparty is the VENDOR, never a customer.",
  "",
  "The LEG SHAPE depends on one thing — whether the bill's extracted facts STATE a NONZERO tax",
  "amount. Check that first, every time:",
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
  "This ledger is MYR-only. If the bill is not lawfully draftable — a non-MYR currency, an",
  "ambiguous or unresolvable supplier, missing corroborated amounts, or a multi-document bundle —",
  "DO NOT draft and DO NOT guess: reply with a short plain-text explanation of exactly what is",
  "blocking the draft. There is no human to ask right now; a truthful non-draft is correct.",
  "State any uncertainty qualitatively with alternatives — never a percentage, never a suspense account.",
  "Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.",
].join("\n");

// ---------------------------------------------------------------------------
// The draft_journal_entry input schema (contract §3 verbatim; a local copy — the
// wrapper in autoDraft.v5.tools.ts fetches sha256 / resolution / books_version /
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
    .describe(
      "At least two balanced lines. When the facts state NO tax, or a stated tax that is EXACTLY " +
        "ZERO: expense debit(s) GROSS + one Accounts Payable credit GROSS (two legs). When the facts " +
        "state a NONZERO tax: expense debit(s) NET + ONE sst_purchase_cost debit equal EXACTLY to the " +
        "stated tax + one Accounts Payable credit GROSS (three legs) — never gross-to-expense with a " +
        "tax leg, never a dropped tax leg when one is required.",
    ),
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
