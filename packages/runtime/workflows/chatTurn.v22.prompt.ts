// @frozen
//
// FROZEN — part of the chatTurn_v22 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v21 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback).
//
// A THIN EXTENSION of v21's prompt, and as thin as v21's was of v20's: `ClaraPartV22` IS
// `ClaraPartV21`, which IS `ClaraPartV20`. NO NEW WIRE KIND.
//
// #985's own contract says so in as many words — "reuse the existing typed receipt part; no new
// wire kind" — and the measurement behind it is that an opening read has no card to address:
// `clara.opening_tb_targets` rows are the basis's own surface on the client's Registers page, and
// the receipt a chat turn can honestly show is the tool result itself, which `toTypedParts_v10`
// has promoted to a generic `tool_result` part since v10. So `apps/web/lib/parts/types.ts` needs
// no change, `check-parts-parity.mjs` has no new declarer to read, and `chatTurn.v19.parts.ts`
// stays the declarer, byte-untouched.
//
// AND `read_opening_source` IS DELIBERATELY OUT OF THE C-19 CODING-INTENT SIGNAL, which is the
// decision a later reader will question, because the read DOES act on a client's books: it
// authors document-primary opening targets. The reason is the same one `run_depreciation_period_
// for_client` is out of it (v21's own measurement): C-19's remedy is `codingIncompleteRefusal()`
// — "The coding could not be completed into a review card this turn." — appended when a
// coding-intent turn ends with no TERMINAL card, and the terminal set is
// `je_review | entry_posted | bank_act | work_accepted | refusal | clarify`. This tool mints none
// of them by design, so a SUCCESSFUL read would always collect that refusal and a person would
// read "could not be completed" beside lines that were in fact recorded. A false sentence on a
// successful act is worse than an absent floor, and the floor here is real anyway: the tool's own
// refusal envelope is what a failed read returns, and the stanza below makes the model say what
// the answer says.

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import {
  SYSTEM_PROMPT_V21,
  toTypedParts_v21,
  hasCodingIntent_v21,
  type ClaraPartV21,
} from "./chatTurn.v21.prompt.js";
import { READ_OPENING_SOURCE_TOOL } from "./chatTurn.v22.tools.js";

// Every unchanged predecessor symbol is REACHED BY REFERENCE rather than re-spelled, so the text
// each one names is hash-locked once and a reader of either name is reading one value.
export {
  CLARIFY_FRAMING,
  DRAFT_TOOL,
  clarifyTool,
  draftJournalEntryInputSchema,
  findClarifyCall,
  POST_TOOL,
  OPEN_QUESTION_TOOL,
  SYSTEM_PROMPT_V14,
  FREEFORM_GUIDANCE,
  SYSTEM_PROMPT_V15,
  SYSTEM_PROMPT_V16,
  SYSTEM_PROMPT_V17,
  SYSTEM_PROMPT_V18,
  JOURNAL_WORK_CHAT_GUIDANCE,
  admittedWorkAccepted,
  SYSTEM_PROMPT_V19,
  PERIODIC_ADJUSTMENT_CHAT_GUIDANCE,
  CLIENT_KNOWLEDGE_CHAT_GUIDANCE,
  KNOWLEDGE_PACK_PURPOSE,
  KNOWLEDGE_CONTEXT_MAX_RECORDS,
  KNOWLEDGE_CONTEXT_MAX_VALUE_CHARS,
  renderKnowledgeContext,
  systemExtraV19,
  admittedAdjustmentWorkAccepted,
  capturedKnowledgeReceipt,
  SYSTEM_PROMPT_V20,
  STAFF_EXPENSE_CLAIM_CHAT_GUIDANCE,
  ACCRUAL_CHAT_GUIDANCE,
  admittedWorkAcceptedV20,
  SYSTEM_PROMPT_V21,
  TRADE_INVOICE_CHAT_GUIDANCE,
  DEPRECIATION_CHAT_GUIDANCE,
  CLIENT_BASIS_CHAT_GUIDANCE,
  CLIENT_BASIS_PURPOSE,
  CLIENT_BASIS_LIMIT,
  CLIENT_BASIS_PRINT_MAX,
  CLIENT_BASIS_VALUE_CHARS,
  admittedTradeInvoiceWorkAccepted,
  toTypedParts_v21,
  hasCodingIntent_v21,
} from "./chatTurn.v21.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export type { ClaraPartV18, WorkAcceptedPart } from "./chatTurn.v18.prompt.js";
export type { KnowledgeReceiptPart, WorkAcceptedPartV19 } from "./chatTurn.v19.prompt.js";
export type { ClaraPartV20 } from "./chatTurn.v20.prompt.js";
export type { ClaraPartV21 } from "./chatTurn.v21.prompt.js";

/** v22 adds NO wire kind. The union is v21's, by reference — not a re-spelling, so a reader of
 *  either name is reading one type. */
export type ClaraPartV22 = ClaraPartV21;

// --- the guidance -------------------------------------------------------------------------

export const OPENING_SOURCE_CHAT_GUIDANCE = [
  "READING AN OPENING SOURCE — THE DOCUMENT IS ALREADY BOUND, AND EVERY FIGURE IS THE DATABASE'S.",
  "",
  `${READ_OPENING_SOURCE_TOOL} reads the document a person has already attached to one of this`,
  "client's OPENING BASES into that basis's opening lines. You name the basis and nothing else:",
  "the document is bound to it already, and an amount, an account code or a document id in the",
  "call is refused rather than used. You are not reading the document; the database re-derives",
  "every line from the reading it already holds.",
  "",
  "SAY WHAT CAME BACK, AND THAT IS ONE FIGURE. The answer is HOW MANY LINES WERE RECORDED, and",
  "the amounts stay where they were derived, on the basis itself.",
  "Report that count, and never a figure you did not get back — not a total, not a balance, not",
  "one line's own amount. If somebody wants the figures, point them at the basis on the client's",
  "Registers page.",
  "",
  "NOTHING IS RECORDED UNLESS EVERY PRINTED LINE READS. One unreadable row forfeits the whole",
  "document, because a partial opening basis is worse than none. When a refusal names rows,",
  "regions or accounts, read those names out to the person: they are the only thing that tells",
  "them where to look, and they are the reason a refusal here is longer than a sentence.",
  "",
  "READING IS NOT APPROVING. The lines land on the basis for a person to check and approve on the",
  "client's Registers page. You cannot approve an opening basis, you cannot key a balance into",
  "one, and you must never say the opening is done because a read succeeded.",
  "",
  "A REFUSAL IS FINAL FOR THIS ASK. Pass the reason on in the words it arrives in, say which act a",
  "person takes next, and do not ask again with the same basis: the answer will be the same one.",
  "A document that has been READ AGAIN since the basis was parsed is refused on purpose — a second",
  "reading is not a retry — and a person brings the basis onto the newest reading from the",
  "register.",
].join("\n");

export const SYSTEM_PROMPT_V22 = `${SYSTEM_PROMPT_V21}\n\n${OPENING_SOURCE_CHAT_GUIDANCE}`;

// --- the promotions -----------------------------------------------------------------------

/** v21's promotion set, BY IMPORT and with no new arm: `read_opening_source` mints no card of its
 *  own (see this file's header), so the generic `tool_result` v10 promotes for every tool result
 *  is the whole of what this tool puts on the transcript. */
export function toTypedParts_v22(content: readonly AiContentPart[]): ClaraPartV22[] {
  return toTypedParts_v21(content);
}

/** The C-19 acting-intent signal, UNCHANGED from v21's — and the absence of an arm for
 *  `read_opening_source` is this cut's measured decision, not an omission. See the header. */
export function hasCodingIntent_v22(content: readonly AiContentPart[]): boolean {
  return hasCodingIntent_v21(content);
}
