// @frozen
//
// FROZEN — part of the chatTurn_v13 closure (F-A2 CHAT PARITY, owner ruling D34). A NEW frozen
// closure beside the byte-untouched chatTurn_v1..v12 (ARCHITECTURE Appendix A).
//
// THIS FILE (prompt) — a THIN EXTENSION of v11's prompt, the same way v11 extends v10's: it
// re-exports every carried shape and adds exactly what F-A2 needs. Two things:
//   1. `POSTING_GUIDANCE` and `SYSTEM_PROMPT_V13` — the attended lane's posting paragraph.
//   2. `toTypedParts_v13` and `hasCodingIntent_v13` — the PART-PROMOTION law extended to the
//      two new tools, and the C-19 terminal invariant's intent signal extended with them.
//
// WHY THE PROMOTION HAD TO BE EXTENDED RATHER THAN INHERITED. `toTypedParts_v10` promotes only
// the DRAFT tool's results. Inheriting it unchanged would leave a chat post producing a bare
// `tool_result` part and no card — the transcript would record that a tool ran, and the human
// would see nothing saying their books changed. That is the worst failure mode available on this
// lane, so it is fixed at the promotion, not at the renderer.

import {
  CLARIFY_FRAMING,
  DRAFT_TOOL,
  type AiContentPart,
  type ClaraPart,
  type JeReviewPart,
  type RefusalPart,
} from "./chatTurn.v10.prompt.js";
import { SYSTEM_PROMPT_V11 } from "./chatTurn.v11.prompt.js";
import { POST_TOOL, OPEN_QUESTION_TOOL, type EntryPostedPart, type QuestionOpenedPart } from "./chatTurn.v13.post.js";

export {
  DRAFT_TOOL,
  CLARIFY_FRAMING,
  clarifyTool,
  draftJournalEntryInputSchema,
  findClarifyCall,
} from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { SYSTEM_PROMPT_V11 };

/** The two new part kinds. `ClaraPartV13` widens `ClaraPart` rather than replacing it, so every
 *  carried consumer keeps working on the parts it already knows and only the F-A2-aware ones
 *  need to know about these two. */
export type ClaraPartV13 = ClaraPart | EntryPostedPart | QuestionOpenedPart;

export const POSTING_GUIDANCE = [
  "POSTING, AND THE ONE THING THAT MAKES IT DIFFERENT FROM DRAFTING.",
  "",
  "A draft is a proposal. A POST is an entry in this client's books, made under YOUR identity, with",
  "your rationale recorded permanently on the receipt beside the model that wrote it. You can now do",
  "both, and the order is never negotiable: draft first with draft_journal_entry, then — if the human",
  "asked you to post, or asked for the document to be booked — call post_journal_entry ONCE with the",
  "entry_id and revision_token that draft returned and a short rationale in your own words.",
  "",
  "THE DATABASE DECIDES, NOT YOU. It re-evaluates every gate and either posts the entry or returns a",
  "typed refusal naming the gate that stopped it. A refusal is a NORMAL outcome, not an obstacle:",
  "say plainly which gate refused and what it means, leave the draft for the human, and do NOT",
  "re-draft, re-post, or reword the same request hoping for a different answer. Never tell anyone",
  "something was posted unless the tool returned a posting receipt.",
  "",
  "WHEN YOU MAY POST AT ALL. Only an entry you drafted for this client in this conversation, only",
  "once, and only when the human has asked for it — drafting something and posting it unasked is not",
  "helpfulness, it is acting without instruction on someone's books. If you are unsure whether they",
  "want it booked, ask; that is what the conversation is for.",
  "",
  "WHEN A PERSON MUST DECIDE — open_client_question. If the document cannot lawfully be drafted or",
  "posted and the blocker is a JUDGEMENT rather than a fact you can look up (which of three open",
  "bills a payment settles, which of two entities is the counterparty, whether an unusual charge is",
  "capital or expense), open a typed question scoped to the document, the counterparty or the client.",
  "It becomes a durable item in their queue, so the question survives this conversation ending. Do",
  "not open one for something you can read, and do not open one instead of simply asking the person",
  "in front of you a question they can answer right now.",
].join("\n");

export const SYSTEM_PROMPT_V13 = `${SYSTEM_PROMPT_V11}\n\n${POSTING_GUIDANCE}`;

function isJeReview(v: unknown): v is JeReviewPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "je_review";
}
function isRefusal(v: unknown): v is RefusalPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "refusal";
}
function isPosted(v: unknown): v is EntryPostedPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "entry_posted";
}
function isQuestionOpened(v: unknown): v is QuestionOpenedPart {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "question_opened";
}

/**
 * The PART-PROMOTION law (C-19), extended to F-A2's two tools. v10's behaviour is carried
 * exactly: a MAP, never a reducer — every tool result in the flattened content becomes its own
 * part, in order, so a retry sequence yields the refusal AND the card and both render.
 *
 * The three promoted kinds are deduped WITHIN this segment by their own identity: a je_review by
 * entry_id, a posted card by post_receipt_id, a refusal by code+reason+message. A question is
 * NOT deduped, and that is deliberate — two questions with different text about the same
 * document are two questions, and `_reserve_op`'s deterministic op key is what stops a REPLAY
 * duplicating one, which is a different problem from a model asking twice.
 */
export function toTypedParts_v13(content: readonly AiContentPart[]): ClaraPartV13[] {
  const out: ClaraPartV13[] = [];
  const seenEntries = new Set<string>();
  const seenReceipts = new Set<string>();
  const seenRefusals = new Set<string>();
  const pushJe = (p: JeReviewPart) => {
    if (seenEntries.has(p.entry_id)) return;
    seenEntries.add(p.entry_id);
    out.push(p);
  };
  const pushPosted = (p: EntryPostedPart) => {
    if (seenReceipts.has(p.post_receipt_id)) return;
    seenReceipts.add(p.post_receipt_id);
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
      const output = (tr.output ?? {}) as { je_review?: unknown; refusal?: unknown; posted?: unknown; question_opened?: unknown };
      if (tr.toolName === DRAFT_TOOL) {
        if (isJeReview(output.je_review)) pushJe(output.je_review);
        else if (isRefusal(output.refusal)) pushRefusal(output.refusal);
      } else if (tr.toolName === POST_TOOL) {
        if (isPosted(output.posted)) pushPosted(output.posted);
        else if (isRefusal(output.refusal)) pushRefusal(output.refusal);
      } else if (tr.toolName === OPEN_QUESTION_TOOL) {
        if (isQuestionOpened(output.question_opened)) out.push(output.question_opened);
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

/** The C-19 "coding intent" signal, extended: a POST call is coding intent too. Without this a
 *  turn that posted and then produced no card would settle silently, which is exactly the
 *  invariant C-19 exists to prevent — and the stakes are higher here than for a draft. */
export function hasCodingIntent_v13(content: readonly AiContentPart[]): boolean {
  return content.some(
    (p) => p.type === "tool-call" && ((p as { toolName?: string }).toolName === DRAFT_TOOL || (p as { toolName?: string }).toolName === POST_TOOL),
  );
}
