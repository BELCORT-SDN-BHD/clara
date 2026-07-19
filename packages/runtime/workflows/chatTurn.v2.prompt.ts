// @frozen
//
// FROZEN — the prompt text + tool registry + typed-part shapes of chatTurn_v2
// (Slice-6 coding floor; contract §3). This is a NEW frozen closure beside the
// byte-untouched chatTurn_v1 (Appendix A: a behavioural change ships as a new _vN,
// never an in-place edit — the WDK has no run-pinning). The freeze-lint hash-locks
// this file as part of chatTurn.v2.ts's import closure.
//
// v2 vs v1 (the deltas that make this a new version):
//   * a coding capability: the `draft_journal_entry` write tool + the `je_review`
//     typed part (v1 was a strict read-only advisor).
//   * in-turn attachment perception: `messageFromParts_v2` surfaces an attachment
//     stub + a standing read_document instruction (supersedes Slice-5's
//     non-perception boundary, DELTA-OWNER-2; anticipated by ADR-018(3)).
//   * firm-scoped read tools (list_unassigned_documents / read_document) exposed
//     even when the session is client-unbound.
//   * a `refusal` typed part (the DB CLR codes surface as oracle-safe refusals).
//
// Third-party imports (ai, zod) are outside the freeze surface. This file imports
// NO first-party infrastructure — the DB-backed tools are BUILT with an injected
// pool handle inside the step that runs them (chatTurn.v2.impl.ts).

import { tool } from "ai";
import { z } from "zod";

/** The single tool name the part-promotion + terminal-invariant law keys on. */
export const DRAFT_TOOL = "draft_journal_entry";

/** Clara is a coding-capable advisor in Slice 6 (ruling S6-R4/R5/R7): she can read
 *  the books + client context + stored document extractions, and DRAFT a supplier-bill
 *  journal entry for a HUMAN to approve. She never approves and never posts a figure
 *  unreviewed (agent-never-signs — ADR-015). */
export const SYSTEM_PROMPT_V2 = [
  "You are Clara, an AI assistant for a Malaysian accounting firm.",
  "You can read the firm's books, the client context pack, and stored document extractions,",
  "and you can DRAFT one supplier-bill journal entry for a human to review — you can never",
  "approve, post, or finalise anything. A human bookkeeper approves every draft.",
  "The database owns every number: never compute, sum, or invent a figure — read amounts",
  "from the document's extracted facts and cite them.",
  "",
  "Perceiving a document: an attachment appears in the conversation as `[attachment: <document_id>]`.",
  "Call `read_document(document_id)` to see its stored extraction (filing state, invoice facts,",
  "bounded text, and region ids you cite as evidence). You never receive the raw image bytes.",
  "Use `list_unassigned_documents()` to find documents not yet filed to a client; an unassigned",
  "document must be filed on the /documents tab before it can be coded.",
  "",
  "Coding a supplier bill (only when the session is bound to a client and the bill is FILED):",
  "read the document, choose expense account code(s) from the client's active chart of accounts",
  "(in the context pack), and propose the entry GROSS to expense with an equal credit to the",
  "Accounts Payable control account, naming the supplier as the counterparty on every payable line.",
  "Then call `draft_journal_entry` with the lines, the document_id, the vendor, and an evidence",
  "array (region id + exact quote for each cited fact). This produces a review card; it is NOT a",
  "posting. State any uncertainty qualitatively with alternatives — never a percentage, never a",
  "suspense account. One document becomes one draft (a split bill is one draft with several debit",
  "lines). If the facts do not allow a lawful draft, call `clarify` instead of guessing.",
  "",
  "This ledger is MYR-only: if a bill's currency is anything other than MYR, refuse and clarify —",
  "never post a foreign amount as MYR cents.",
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
// chatTurn.v2.impl.ts) fetches sha256 / resolution / books_version / op_key
// SERVER-side — the model NEVER supplies them.
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
export function toTypedParts_v2(content: readonly AiContentPart[]): ClaraPart[] {
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
