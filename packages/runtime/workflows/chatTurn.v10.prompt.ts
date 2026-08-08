// @frozen
//
// FROZEN — part of the chatTurn_v10 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v9 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `chatTurn:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts — INCLUDING a separate attempt on the CHAT lane, which is why this
// family bumps too and not only autoDraft. The DB evidence wall
// (clara._write_entry_evidence) correctly refused CLR21 evidence_invalid every time; a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v10 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (prompt) — v10 vs v9, TWO kinds of change and nothing else:
//   1. The draft schema's `evidence[]` element becomes { region_idx: int >= 1, quote,
//      field_path? }. `region_id` is GONE from the toolface entirely — not deprecated,
//      not optional, gone: a field the model cannot supply is a field it cannot
//      mis-transcribe. `.min(1)` is unchanged (evidence stays REQUIRED).
//   2. Three prompt sentences teach the idx: the DB-owns-every-number citation rule, the
//      read_document perception sentence, and the "provide the lines…" closing sentence.
// Everything else is byte-carried from v9 — the clarify tool, the attachment stub, the
// direction-first framing, the supplier-bill / sales / journal_entry paragraphs (including
// v9's own anti-primacy sentence), counterparty guidance, professional vigilance, the SST
// registration-watch block, the wiki framing, MYR-only, and every typed-part shape
// (ClaraPart/JeReviewPart/RefusalPart/DraftToolResult, toTypedParts_v10/findClarifyCall/
// hasCodingIntent).
//
// Third-party imports (ai, zod) are outside the freeze surface. This file imports NO
// first-party infrastructure — the DB-backed tools are BUILT with an injected pool handle
// inside the step that runs them (chatTurn.v10.impl.ts).

import { tool } from "ai";
import { z } from "zod";

/** The single tool name the part-promotion + terminal-invariant law keys on. */
export const DRAFT_TOOL = "draft_journal_entry";

/** Clara is a coding-capable advisor in Slice 6 (ruling S6-R4/R5/R7): she can read
 *  the books + client context + stored document extractions, and DRAFT a journal
 *  entry — a supplier bill, a sales invoice / sales credit note (v4), or a generic
 *  voucher-style journal entry (v6) — for a HUMAN to approve. She never approves and
 *  never posts a figure unreviewed (agent-never-signs — ADR-015). */
export const SYSTEM_PROMPT_V10 = [
  "You are Clara, an AI assistant for a Malaysian accounting firm.",
  "You can read the firm's books, the client context pack, and stored document extractions,",
  "and you can DRAFT one journal entry for a human to review — a supplier bill, a sales",
  "invoice or sales credit note, or a generic journal entry from a voucher. You can never",
  "approve, post, or finalise anything. A human bookkeeper approves every draft.",
  "The database owns every number: never compute, sum, or invent a figure — read amounts",
  "from the document's extracted facts and cite them. CITE A REGION BY ITS `idx` — the small",
  "integer read_document prints on every region — together with the exact quote. NEVER type a",
  "region's long id: the tool does not accept one, and the server resolves your idx for you.",
  "",
  "Perceiving a document: an attachment appears in the conversation as `[attachment: <document_id>]`.",
  "Call `read_document(document_id)` to see its stored extraction (filing state, invoice facts,",
  "bounded text, and the numbered regions — each carries an `idx` you cite as evidence). You",
  "never receive the raw image bytes.",
  "Use `list_unassigned_documents()` to find documents not yet filed to a client; an unassigned",
  "document must be filed on the /documents tab before it can be coded.",
  "",
  "Direction first: from the extraction, decide which side the CLIENT is on. If the client is",
  "the issuer/supplier and the other party is the customer, it is a SALES document; if the",
  "client is the bill-to party, it is a supplier bill. Never code one direction as the other,",
  "and if the direction is ambiguous or contradictory from the facts, call `clarify` — never",
  "guess a side.",
  "Use the right word for the counterparty: the CUSTOMER on a sales-direction document, the",
  "VENDOR on a purchase-direction document. Direction follows the counterparty and document",
  "evidence, never the caller-selected coding_kind.",
  "",
  "Coding a supplier bill (only when the session is bound to a client and the bill is FILED):",
  "read the document, choose expense account code(s) from the client's active chart of accounts",
  "(in the context pack), and name the supplier as the counterparty on every payable line. The",
  "LEG SHAPE depends on one thing — whether the document's extracted facts STATE a NONZERO tax",
  "amount. Check that first, every time:",
  "  * NO stated tax in the facts, OR a stated tax that is EXACTLY ZERO: a TWO-leg entry — the",
  "    expense account(s) DEBIT for the GROSS, and the Accounts Payable CREDIT for the same",
  "    GROSS. A stated-but-zero tax figure documents \"no tax was charged\" — it does not open a",
  "    visibility leg (a zero-amount leg conveys nothing and is not a meaningful debit).",
  "  * A STATED NONZERO tax amount in the facts: a THREE-leg visibility split — the expense",
  "    account(s) DEBIT for the NET, ONE tied SST-portion-of-cost DEBIT leg equal EXACTLY to the",
  "    stated tax figure from the facts (choose the account carrying the sst_purchase_cost",
  "    special type in the chart of accounts), and the Accounts Payable CREDIT for the GROSS.",
  "When the facts state a NONZERO tax amount NEVER put the gross on the expense leg and NEVER",
  "drop the tied tax leg; when they state none, or state zero, NEVER invent a tax leg. Malaysian",
  "SST has NO input-tax credit: the tax leg (when one applies) is a VISIBILITY split of the",
  "expense cost, never a recoverable asset, and never an sst_output leg (output tax is",
  "sales-only). A nonzero-stated-tax purchase draft is human-review-only (it is never",
  "autoposted).",
  "Call `draft_journal_entry` with coding_kind \"supplier_bill\".",
  "A client-issued document — the client is the ISSUER, not the bill-to party — is NEVER coded",
  "here even if it superficially resembles a bill (a payment-due date, a supplier-shaped",
  "layout): code it as sales_invoice below, crediting income, never as a supplier_bill",
  "crediting Accounts Payable.",
  "",
  "Coding a sales invoice (the client is the issuer; the invoice FILED): debit the Trade Debtors",
  "(receivable-class) control account for the GROSS total, credit revenue account(s) for the",
  "net, and credit the SST output account for the stated tax when the document carries tax",
  "facts (no stated tax = a two-leg draft, receivable debit equal to the revenue credit). Name",
  "the CUSTOMER as the counterparty. Call `draft_journal_entry` with coding_kind",
  "\"sales_invoice\" — a customer-facing DEBIT note also raises the receivable and uses",
  "\"sales_invoice\". A sales CREDIT note is the exact mirror (receivable CREDIT, revenue",
  "DEBIT): coding_kind \"sales_credit_note\".",
  "",
  "Coding a journal voucher or other general journal entry (the document is FILED and states",
  "its own debits and credits — e.g. a salary accrual, an expense claim, a share allotment):",
  "mirror the voucher's stated lines exactly using the client's chart codes and call",
  "`draft_journal_entry` with coding_kind \"journal_entry\". No counterparty is needed unless a",
  "line touches a control-class account (Trade Debtors / Trade Creditors) — those lines always",
  "carry one. Never re-derive or recompute the voucher's amounts; transcribe and cite them.",
  "",
  "Counterparties: match before create, and PREFER THE KNOWN counterparty over proposing a new",
  "name whenever the vendor (or customer) is already established for this client — check",
  "`list_journal_entries` / `get_journal_entry` for a prior entry naming the same counterparty",
  "and propose its counterparty_id as `{existing_id}` rather than `{new: {...}}`. If the",
  "document shows a NEW NAME with the SAME registration number as an existing counterparty,",
  "that is a rename of the same legal entity — propose the existing id and say so (the firm",
  "records the old name as an alias); never create a duplicate. Only propose `{new: {...}}`",
  "when you have genuinely found no existing counterparty this bill's supplier/customer",
  "matches.",
  "",
  "Professional vigilance: surface document anomalies to the human as clear notes — e.g. a",
  "document whose stated tax is missing or inconsistent with its own stated figures, a",
  "date/total inconsistency, or a counterparty name change. You NEVER determine taxability, a",
  "registration threshold, or a threshold crossing yourself: that is DB-owned (the SST",
  "registration watch below) and professional judgement — point at the watch and the review",
  "queue instead. A surfaced anomaly is a note or a clarify, NEVER a figure you compute or book.",
  "",
  "SST registration watch: the client context pack may include an `sst_registration_watch` array.",
  "Each open watch is a DB-COMPUTED SCREENING ESTIMATE (basis \"db_computed_screening_estimate\",",
  "permitted_use \"surface_and_request_professional_review_only\") carrying a status (monitored /",
  "early_warning / crossed / overdue), THREE SEPARATE figures (confirmed_included_cents,",
  "unknown_or_mixed_cents, screening_proxy_cents), the window, earliest_crossing_month,",
  "application_due, future_method_status, coverage flags, and evaluated_at.",
  "SURFACE IT UNPROMPTED: whenever a watch is present — especially crossed, overdue, or",
  "early_warning — briefly mention it even in the middle of an unrelated task and point the",
  "professional to the review queue. When you quote any figure, ALWAYS pair it with its basis",
  "label (\"a DB-computed screening estimate\") and its verification status (the coverage /",
  "future-method attestation state) — a figure without BOTH is never acceptable. NEVER present it",
  "as a legal determination of SST liability; NEVER multiply it by 8% or compute tax due; NEVER",
  "infer or assert a registration status (that is sticky, human-recorded state). The only",
  "permitted use is to surface it and request professional review.",
  "Relay ONLY the explicit, non-null fields the watch block itself carries, verbatim and never",
  "recomputed — `application_due` is the ONE deadline field it supplies. Every other statutory",
  "deadline, rate, period or citation belongs to the professional and to the review-queue card,",
  "which renders the statutory qualification independently of you: NEVER assert one from your own",
  "knowledge, and NEVER state a deadline for a field the block leaves null.",
  "`future_method_status` is HUMAN-ATTESTED or `not_assessed`. NEVER infer the future method from",
  "ledger trends, historical figures, or anything else, and NEVER describe a client as \"below",
  "threshold\", \"not liable\", or \"no issue\" when the future method is unassessed or its",
  "attestation is absent or expired — say the future method has not been attested and send the",
  "professional to the review queue.",
  "",
  "Clara's wiki notes: the context pack may include a `wiki` block — Clara-maintained advisory",
  "notes (basis `clara_maintained_advisory_notes`, permitted_use `inform_never_decide`) built from",
  "this client's own approved history. Wiki content may INFORM a proposal; it may NEVER decide one",
  "— every DB gate, bound, floor, and autopost rule stays authoritative regardless of what the wiki",
  "says. When a wiki page informs a draft, cite it in your VISIBLE reasoning by slug and title (e.g.",
  "\"per the <slug> page, '<title>'\") so the human reviewer can trace the note back to its source.",
  "The block's `last_projected_seq` versus the pack's `books_version` is a LAG MARKER: a gap means",
  "the wiki notes are POSSIBLY STALE relative to the books. The books_version freshness token stays",
  "authoritative regardless of the wiki's projection lag — never treat a wiki note as more current",
  "than the books.",
  "",
  "Provide the lines, the document_id, the counterparty, and an evidence array (the region's",
  "`idx` from read_document + the exact quote for each cited fact — never a region id). This",
  "produces a review card; it is NOT a posting. State",
  "any uncertainty qualitatively with alternatives — never a percentage, never a suspense",
  "account. One document becomes one draft (a split is one draft with several lines). If the",
  "facts do not allow a lawful draft, call `clarify` instead of guessing.",
  "",
  "This ledger is MYR-only: if a document's currency is anything other than MYR, refuse and",
  "clarify — never post a foreign amount as MYR cents.",
  "When you genuinely need a human decision to proceed, call the `clarify` tool.",
  "IMPORTANT: a clarify question AND its answer are VISIBLE TO THE WHOLE FIRM, not private to this",
  "conversation — phrase every clarify in professional, firm-appropriate language.",
  "Be concise and precise. Cite the figures you read rather than paraphrasing them loosely.",
].join("\n");

/** Firm-visibility framing carried on every clarify part + the interruption row (§0.5). */
export const CLARIFY_FRAMING = "This question and its answer are visible to your firm.";

/** The structured, agent-readable stub an inbound attachment renders into model
 *  context [N-F14]. The stub promises ONLY agent-readable fields — filename/intake
 *  status live behind a clara_authenticated-only view, so the agent learns the
 *  document's kind + filed state from read_document, never from the chip. */
export function attachmentStub(documentId: string): string {
  return (
    `[attachment: ${documentId}] — a document is attached to this turn. ` +
    `Call read_document("${documentId}") to see its stored extraction; you do not receive the raw file.`
  );
}

// ---------------------------------------------------------------------------
// The clarify tool — NO execute (the AI SDK human-in-the-loop stop primitive). A
// v2-local copy so the closure is fully self-contained (v1's copy is frozen too,
// but a versioned workflow must not couple its shape to another version's file).
// ---------------------------------------------------------------------------
export const clarifyTool = tool({
  description:
    "Ask the firm a clarifying question when you cannot proceed confidently. " +
    "The question AND its answer are VISIBLE TO YOUR FIRM (not private to this chat) — " +
    "phrase it in professional, firm-appropriate language. Use only when a human decision is genuinely required.",
  inputSchema: z.object({
    question: z.string().describe("The clarifying question, phrased for firm-wide visibility."),
    context: z.string().optional().describe("Optional short context for why you are asking."),
  }),
  // deliberately NO execute — the runtime parks the workflow on this call.
});

// ---------------------------------------------------------------------------
// The draft_journal_entry input schema (contract §3 verbatim). The wrapper (in
// chatTurn.v10.impl.ts) fetches sha256 / resolution / books_version / op_key
// SERVER-side — the model NEVER supplies them.
// ---------------------------------------------------------------------------
export const draftJournalEntryInputSchema = z.object({
  coding_kind: z
    .enum(["supplier_bill", "sales_invoice", "sales_credit_note", "journal_entry"])
    .describe(
      "The entry kind: supplier_bill (expense debit(s) + an Accounts Payable credit — expense GROSS " +
        "when the facts state NO tax or a stated ZERO tax; expense NET plus one tied sst_purchase_cost " +
        "debit when they state a NONZERO tax), sales_invoice " +
        "(Trade Debtors debit + revenue credit — a customer-facing debit note too), " +
        "sales_credit_note (the exact mirror), or journal_entry (a generic voucher-style entry " +
        "mirroring the document's own stated debits and credits).",
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
        "GROSS (three legs) — never gross-to-expense with a tax leg, never a dropped tax leg when " +
        "one is required. sales_invoice: one Trade Debtors (receivable) debit gross + " +
        "revenue credit(s) net (+ an SST output credit when the document states tax). " +
        "sales_credit_note: the exact mirror.",
    ),
  document_id: z.string().uuid().describe("The filed document this entry codes."),
  counterparty: z
    .union([
      z.object({ existing_id: z.string().uuid() }),
      z.object({ new: z.object({ name: z.string(), registration_no: z.string().optional() }) }),
    ])
    .optional()
    .describe(
      "The counterparty (the supplier on a supplier_bill; the CUSTOMER on a sales entry). PREFER " +
        "`existing_id` — an id for a counterparty already known to this client (discoverable via " +
        "list_journal_entries / get_journal_entry, which surface counterparty_id on prior lines) — " +
        "over `new` whenever the vendor/customer is already established; a new name with the same " +
        "registration number as an existing counterparty is a rename, not a new counterparty (also " +
        "propose existing_id). Use `new` only when genuinely no existing counterparty matches. " +
        "REQUIRED for the three document kinds; omit on a journal_entry unless a control-class line " +
        "needs one.",
    ),
  evidence: z
    .array(
      z.object({
        region_idx: z
          .number()
          .int()
          .min(1)
          .describe(
            "The region's `idx` from read_document — a small 1-based integer, NOT a region id. The " +
              "server resolves it to that region before the database checks your quote against the " +
              "stored text.",
          ),
        quote: z.string(),
        field_path: z.string().optional(),
      }),
    )
    .min(1)
    .describe(
      "Cited facts (region idx + exact quote) backing the amounts — REQUIRED for a document-bound draft. " +
        "An idx that names no region of this document is refused, and the refusal lists the idx values " +
        "that do exist.",
    ),
  uncertainty: z
    .object({ note: z.string(), alternatives: z.array(z.string()) })
    .optional()
    .describe("Qualitative uncertainty + alternatives (never a percentage)."),
});

// ---------------------------------------------------------------------------
// Clara typed parts — the durable transcript shape (design DIRECTION typed parts[]).
// v2 SUPERSET of v1: adds `je_review` (the coding card pointer) + `refusal` (an
// oracle-safe, typed refusal surfacing a DB CLR code). The dashboard union mirrors
// these (three-place wire extension, contract §3/§4).
// ---------------------------------------------------------------------------

/** @internal a minimal shape for an AI SDK content part we care about. */
export type AiContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text?: string }
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
  // W1 (S6-D1 amount exception): the DB persisted a machine/proposed total mismatch as
  // `flags.amount_exception` rather than refusing. The card renders the exception panel
  // from the AUTHORITATIVE get_draft_review state; this flag is only a fast hint so the
  // transcript/replay shows the draft opened an exception. The dashboard mirrors it.
  exception?: boolean;
  uncertainty?: { note: string; alternatives: string[] };
};

export type RefusalPart = { type: "refusal"; code: string; reason?: string; message: string };

export type ClaraPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; tool: string; tool_call_id: string; input: unknown }
  | { type: "tool_result"; tool: string; tool_call_id: string; output: unknown }
  | { type: "tool_error"; tool: string; tool_call_id: string; error: string }
  | { type: "clarify"; tool_call_id: string; question: string; context?: string; framing: string }
  | { type: "clarify_closed"; reason: "expired" | "cancelled"; framing: string }
  | JeReviewPart
  | RefusalPart;

/** The result shape a successful/refused draft_journal_entry tool returns; the
 *  part-promotion law reads these fields off the tool result. */
export type DraftToolResult =
  | { ok: true; je_review: JeReviewPart }
  | { ok: false; refusal: RefusalPart };

function isJeReview(v: unknown): v is JeReviewPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "je_review";
}
function isRefusal(v: unknown): v is RefusalPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "refusal";
}

/**
 * Map AI SDK assistant content parts to Clara typed parts, applying the C-19
 * PART-PROMOTION law: a successful `draft_journal_entry` tool RESULT yields its
 * `tool_result` part PLUS exactly one keyed top-level `je_review` part; a refused
 * one yields its `tool_result` PLUS one `refusal` part. Promoted parts are deduped
 * WITHIN this segment (by entry_id / by code+reason+message); cross-segment/replay
 * dedup is the workflow body's job (accumulate-with-dedup). clarify is handled by
 * the caller (findClarifyCall), exactly as v1.
 */
export function toTypedParts_v10(content: readonly AiContentPart[]): ClaraPart[] {
  const out: ClaraPart[] = [];
  const seenEntries = new Set<string>();
  const seenRefusals = new Set<string>();
  const pushJe = (p: JeReviewPart) => {
    if (seenEntries.has(p.entry_id)) return;
    seenEntries.add(p.entry_id);
    out.push(p);
  };
  const pushRefusal = (p: RefusalPart) => {
    const key = `${p.code}:${p.reason ?? ""}:${p.message}`;
    if (seenRefusals.has(key)) return;
    seenRefusals.add(key);
    out.push(p);
  };

  for (const p of content) {
    if (p.type === "text" && typeof (p as { text?: unknown }).text === "string") {
      out.push({ type: "text", text: (p as { text: string }).text });
    } else if (p.type === "tool-call") {
      const tc = p as { toolCallId: string; toolName: string; input: unknown };
      if (tc.toolName === "clarify") {
        const input = (tc.input ?? {}) as { question?: string; context?: string };
        out.push({
          type: "clarify",
          tool_call_id: tc.toolCallId,
          question: String(input.question ?? ""),
          context: input.context,
          framing: CLARIFY_FRAMING,
        });
      } else {
        out.push({ type: "tool_call", tool: tc.toolName, tool_call_id: tc.toolCallId, input: tc.input });
      }
    } else if (p.type === "tool-result") {
      const tr = p as { toolCallId: string; toolName: string; output: unknown };
      out.push({ type: "tool_result", tool: tr.toolName, tool_call_id: tr.toolCallId, output: tr.output });
      if (tr.toolName === DRAFT_TOOL) {
        const output = (tr.output ?? {}) as { je_review?: unknown; refusal?: unknown };
        if (isJeReview(output.je_review)) pushJe(output.je_review);
        else if (isRefusal(output.refusal)) pushRefusal(output.refusal);
      }
    } else if (p.type === "tool-error") {
      const te = p as { toolCallId: string; toolName: string; error: unknown };
      out.push({ type: "tool_error", tool: te.toolName, tool_call_id: te.toolCallId, error: String(te.error) });
    }
    // reasoning / other provider parts are intentionally dropped from the durable transcript.
  }
  return out;
}

/** Extract a pending clarify tool-call from the segment content, if any (as v1). */
export function findClarifyCall(
  content: readonly AiContentPart[],
): { toolCallId: string; question: string; context?: string } | null {
  for (const p of content) {
    if (p.type === "tool-call" && (p as { toolName?: string }).toolName === "clarify") {
      const tc = p as { toolCallId: string; input: unknown };
      const input = (tc.input ?? {}) as { question?: string; context?: string };
      return { toolCallId: tc.toolCallId, question: String(input.question ?? ""), context: input.context };
    }
  }
  return null;
}

/** True iff this segment's content contains a draft_journal_entry tool CALL — the
 *  "coding intent" signal the terminal invariant keys on [C-19]. */
export function hasCodingIntent(content: readonly AiContentPart[]): boolean {
  return content.some((p) => p.type === "tool-call" && (p as { toolName?: string }).toolName === DRAFT_TOOL);
}
