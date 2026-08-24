// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A2: the agentic posting lane; see
// autoDraft.v9.tools.ts for the one statement of what changed and why). A NEW frozen closure
// beside the byte-untouched autoDraft_v1..v8 (ARCHITECTURE Appendix A: a behavioural change
// ships as a new _vN export, never an in-place edit — the registry repoints `autoDraft:` here).
//
// THIS FILE (prompt) — v9 vs v8, THREE deltas and everything else byte-carried:
//   1. `coding_kind` gains `journal_entry`, the GENERIC kind (design §1, D18, superseding
//      7A-R7 / ADR-063 — it widens DOCUMENT CLASS and nothing else). `counterparty` becomes
//      OPTIONAL and is FORBIDDEN on the generic kind: B14 refuses a generic entry that carries
//      an AR/AP control leg, so a counterparty on one is a contradiction the schema can catch
//      before the model spends a DB roundtrip.
//   2. A SECOND tool, `post_journal_entry` (POST_TOOL), and its input schema. It carries no
//      figures: the entry is already in the DB and the walls read it there. The model supplies
//      only the entry it drafted, the revision token it read, and its RATIONALE.
//   3. The terminal outcome gains `posted` and `post_refused`, and `toAutoDraftOutcome` reduces
//      them with `posted` at the TOP of the precedence chain.
// The whole direction/leg-shape/SST/watch/wiki/MYR-only prompt body, the region_idx evidence
// shape, and every carried part shape are otherwise unchanged.
//
// Deliberately a version-independent local copy of the draft schema + part shapes (a
// versioned workflow must never couple its shape to another version's frozen file).
// Third-party imports (ai, zod) are outside the freeze surface.

import { z } from "zod";

/** The single tool name the draft-detection + terminal law keys on. */
export const DRAFT_TOOL = "draft_journal_entry";

// F-A2's POST leaf shapes live in autoDraft.v9.post.ts (this file is at the 500-line ceiling);
// they are re-exported here so every consumer keeps ONE import site for the toolface.
export { POST_TOOL, postJournalEntryInputSchema } from "./autoDraft.v9.post.js";
export type { PostInput, EntryPostedPart } from "./autoDraft.v9.post.js";
import { POST_TOOL, type EntryPostedPart } from "./autoDraft.v9.post.js";

/** The unattended sweep coder. Reads the client-pinned surface, drafts ONE
 *  purchase OR sales document for a human to review, and never approves, posts,
 *  or invents a figure. Because no human is present, when a lawful draft is not
 *  possible she DOES NOT guess and DOES NOT clarify — she simply produces no
 *  draft (the workflow records the honest outcome). */
export const SYSTEM_PROMPT_AUTODRAFT_V9 = [
  "You are Clara, coding a journal entry for a Malaysian accounting firm as an automated",
  "background pass — no human is watching this run. You can read the firm's books, the client",
  "context pack, and the document's stored extraction; you DRAFT exactly one journal entry, and",
  "then — and only then — you may POST it into the client's books under your own identity.",
  "",
  "POSTING IS THE SECOND ACT, NEVER THE FIRST. Call `draft_journal_entry` first. If it succeeds,",
  "call `post_journal_entry` ONCE with the entry_id and revision_token that draft returned, and a",
  "short RATIONALE in your own words saying why this coding is right for this document. The",
  "database — not you — decides whether the post is lawful: it re-evaluates every gate and either",
  "posts the entry or returns a typed refusal naming the gate that stopped it. A refused post is",
  "a NORMAL, correct outcome, not an error to argue with: the entry stays a draft for a human,",
  "and you simply say so in plain text. NEVER call post_journal_entry twice, never call it for an",
  "entry you did not draft in this run, and never re-draft after a refused post.",
  "",
  "Your rationale is recorded on the posting receipt beside your model identity, permanently. It",
  "must be a reason, not a restatement — say what the document is, which side the client is on,",
  "and what made the coding unambiguous. Never write a figure into it that you did not read from",
  "the document's own extracted facts.",
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
  "GENERIC JOURNAL ENTRY (coding_kind \"journal_entry\") — the narrowest lane, and the one to",
  "reach for LAST. Use it only for a document that genuinely has NO sales or purchase direction:",
  "an internal voucher, a memo, an adjustment the document itself states as debits and credits.",
  "Mirror the voucher's own stated legs. It carries NO counterparty and NO receivable or payable",
  "line — an entry that needs Trade Debtors or Accounts Payable is a sales or purchase document",
  "and must be coded as one. If the document names a supplier or a customer, it is DIRECTIONAL:",
  "code it as supplier_bill or sales_invoice/sales_credit_note, never as a generic entry. A",
  "generic entry whose amount is not the document's own corroborated total will not post — it",
  "lands as a draft for a human, which is the correct outcome, not a failure to work around.",
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
// wrapper in autoDraft.v9.tools.ts fetches sha256 / resolution / books_version /
// op_key SERVER-side, so the model NEVER supplies them).
// ---------------------------------------------------------------------------
export const draftJournalEntryInputSchema = z
  .object({
    coding_kind: z
      // F-A2 / D18: `journal_entry` joins the unattended menu, superseding 7A-R7 / ADR-063.
      // It widens DOCUMENT CLASS and nothing else — the generic kind reaches the DB as a NULL
      // `coding_kind` (see runDraftJournalEntry), which the draft core already admits at every
      // gate it owns; what makes it SAFE is three walls in the post ladder, not the enum:
      // B4-generic (the amount must tie), B14 (no AR/AP control leg) and B15 (no directional
      // anchor).
      .enum(["supplier_bill", "sales_invoice", "sales_credit_note", "journal_entry"])
      .describe(
        "The entry kind, bound by the client's admitted direction for this document (a " +
          "purchase-direction document only accepts supplier_bill; a sales-direction document " +
          "only accepts sales_invoice or sales_credit_note — the DB revalidates the bound family " +
          "and refuses a contradiction): supplier_bill (expense debit(s) + an Accounts Payable " +
          "credit — expense GROSS when the facts state NO tax or a stated ZERO tax; expense NET " +
          "plus one tied sst_purchase_cost debit when they state a NONZERO tax), sales_invoice " +
          "(Trade Debtors debit + revenue credit — a customer-facing debit note too), or " +
          "sales_credit_note (the exact mirror: Trade Debtors credit + revenue debit), or " +
          "journal_entry — a GENERIC voucher-style entry mirroring the document's own stated " +
          "debits and credits, for a document with no sales or purchase direction at all. A " +
          "journal_entry takes NO counterparty and may carry NO receivable or payable line.",
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
      // F-A2: OPTIONAL, because the generic kind has none. It stays REQUIRED for the three
      // directional kinds — the superRefine below enforces both directions, so "optional" here
      // never becomes "omit it on a supplier bill".
      .optional()
      .describe(
        "The counterparty: an existing id, or a proposed new counterparty (match-before-create). " +
          "The VENDOR on a supplier_bill, the CUSTOMER on a sales_invoice/sales_credit_note. " +
          "REQUIRED for those three kinds and FORBIDDEN on a journal_entry, which names no party. " +
          "NEVER set `kind` yourself — it is derived server-side from coding_kind (vendor for " +
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
    //
    // F-A2 adds the GENERIC arm, in BOTH directions and as two separate issues, because they
    // are two different mistakes: a generic entry that names a party (which B14/B15 would
    // refuse at the ladder) and a directional entry that names none (which the DB draft writer
    // refuses). Making `counterparty` `.optional()` for the generic kind must not silently make
    // it optional for the other three, so the second arm is written out rather than implied.
    if (val.coding_kind === "journal_entry") {
      if (val.counterparty !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["counterparty"],
          message: 'a journal_entry names no counterparty — a document with a supplier or a customer is directional and must be coded as supplier_bill or sales_invoice/sales_credit_note.',
        });
      }
      return;
    }
    if (val.counterparty === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["counterparty"],
        message: `coding_kind "${val.coding_kind}" requires a counterparty.`,
      });
      return;
    }
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

/** The result shape the post_journal_entry wrapper returns. THREE outcomes, not two, because a
 *  REFUSED post and a FAILED post are different facts about the books: a refusal is the ladder
 *  working (the entry stays a draft, the transaction committed, the reason is durable), while an
 *  abort is a Tier-D commit failure that settles the task `failed`. Collapsing them would let a
 *  belt abort be recorded as an admission verdict. */
export type PostToolResult =
  | { ok: true; posted: EntryPostedPart }
  | { ok: false; refusal: RefusalPart; rung_vector?: Record<string, string>; tier: "B" | "C" }
  | { ok: false; refusal: RefusalPart; tier: "D"; last_refusal: Record<string, unknown> };

/** The terminal outcome the workflow settles from, derived from the model segment. */
export type AutoDraftOutcome =
  | { kind: "posted"; entryId: string; posted: EntryPostedPart }
  | { kind: "post_refused"; entryId: string; refusal: RefusalPart; tier: "B" | "C" | "D"; lastRefusal: Record<string, unknown> }
  | { kind: "drafted"; entryId: string; jeReview: JeReviewPart }
  | { kind: "noop_existing"; reason: string } // BOTH double_coded reasons -> success-shaped
  | { kind: "refused"; refusal: RefusalPart } // a question-shaped or terminal refusal
  | { kind: "none" }; // the model produced no draft and no refusal (e.g. explained a block in prose)

function isJeReview(v: unknown): v is JeReviewPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "je_review";
}
function isPosted(v: unknown): v is EntryPostedPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "entry_posted";
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
 * Precedence, then recency: drafted > noop_existing > refused > none, and (within `refused`)
 * the LAST question-shaped refusal if any exists, else the LAST refusal — see v7's own copy
 * of this comment (autoDraft.v7.prompt.ts) for the full measured rationale (the AI SDK's
 * `content` getter flattens EVERY step, so "first result wins" and "last result wins" are
 * both wrong in reachable shapes; this is byte-carried unchanged). */
export function toAutoDraftOutcome(content: readonly AiContentPart[]): AutoDraftOutcome {
  let posted: AutoDraftOutcome | null = null;
  let postRefused: AutoDraftOutcome | null = null;
  let drafted: AutoDraftOutcome | null = null;
  let noop: AutoDraftOutcome | null = null;
  let refused: AutoDraftOutcome | null = null;
  let refusedQuestionShaped: AutoDraftOutcome | null = null;
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName: string; output: unknown };

    // F-A2: the POST results come first in the precedence chain below, and they are read from
    // their OWN tool. A post result can only exist because a draft result already did, so the
    // two are read independently and reconciled by precedence rather than by ordering.
    if (tr.toolName === POST_TOOL) {
      const out = (tr.output ?? {}) as {
        posted?: unknown;
        refusal?: unknown;
        tier?: unknown;
        rung_vector?: unknown;
        last_refusal?: unknown;
      };
      if (isPosted(out.posted)) {
        posted = { kind: "posted", entryId: out.posted.entry_id, posted: out.posted };
      } else if (isRefusal(out.refusal)) {
        // The tier is READ, never inferred. An unrecognised tier is recorded as 'D' — the
        // non-admitting, task-failing branch — because an unknown refusal class must never be
        // filed as a committed admission verdict (law 68 at the consumer).
        const tier = out.tier === "B" || out.tier === "C" ? out.tier : "D";
        postRefused = {
          kind: "post_refused",
          entryId: postEntryIdFromCall(content, (p as { toolCallId?: string }).toolCallId),
          refusal: out.refusal,
          tier,
          lastRefusal:
            out.last_refusal && typeof out.last_refusal === "object"
              ? (out.last_refusal as Record<string, unknown>)
              : { tier, clr: out.refusal.code, reason: out.refusal.reason ?? null },
        };
      }
      continue;
    }

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
  // A REFUSED POST OUTRANKS ITS OWN SUCCESSFUL DRAFT, and that ordering is the whole point: the
  // draft exists either way, so reporting `drafted` would hide the fact that a post was
  // attempted and the ladder said no — and the sweep item, the run counters and §6's numbers all
  // read this outcome. `posted` outranks everything because it is the only one that moved money.
  return posted ?? postRefused ?? drafted ?? noop ?? refusedQuestionShaped ?? refused ?? { kind: "none" };
}

/** The entry a post_journal_entry RESULT was about, recovered from its own tool CALL. The result
 *  shape carries no entry id on the refusal arms (the DB's refusal receipt names the entry, but
 *  the runtime must not depend on that to record WHICH entry it tried), so this reads the paired
 *  call by toolCallId — an exact pairing, never "the last draft we saw". An unpairable result
 *  yields the empty string, which every caller treats as "no entry recorded". */
function postEntryIdFromCall(content: readonly AiContentPart[], toolCallId: string | undefined): string {
  if (!toolCallId) return "";
  for (const p of content) {
    if (p.type !== "tool-call") continue;
    const tc = p as { toolCallId: string; toolName: string; input: unknown };
    if (tc.toolName !== POST_TOOL || tc.toolCallId !== toolCallId) continue;
    const input = (tc.input ?? {}) as { entry_id?: unknown };
    return typeof input.entry_id === "string" ? input.entry_id : "";
  }
  return "";
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
