// @frozen
//
// FROZEN — part of the chatTurn_v18 closure (#623, the chat half). A NEW frozen closure beside
// byte-untouched chatTurn_v1..v17 (ARCHITECTURE Appendix A).
//
// A THIN EXTENSION of v17's prompt, and the ONLY wire widening since v16: `ClaraPartV18` is
// `ClaraPartV17 | WorkAcceptedPart`. One kind, one producer, one promotion arm.
//
// `SYSTEM_PROMPT_V18` APPENDS one paragraph to `SYSTEM_PROMPT_V17` BY IMPORT. Every prior word
// stays byte-identical. The new words say the one thing a model gets wrong here if nobody says
// it: starting the Work is not posting the entry. The tool returns in milliseconds and the entry
// is posted seconds later by a different run under a rechecked authority, so "I've recorded it"
// would be a confident false statement about the books — the exact failure class law 22 and
// obligation UI-13/UI-36's "default agentic execution" reframing both turn on.
//
// THE PROMOTION IS OFF THE TOOL RESULT, NEVER OFF THE TOOL CALL. A `start_journal_work` CALL is
// a request; the `work_accepted` card addresses a row that exists. v16's `freeform_result` arm
// established the shape (read the result, take the identifier the DATABASE returned, dedupe),
// and this arm is that arm with a different identifier.
//
// C-19 GAINS THIS KIND, AND IT MUST. `hasCodingIntent_v18` returns true for a
// `start_journal_work` call, because admitting an accounting Work IS acting on the client's
// books — it is the whole point of the ticket. Without the matching terminal-set entry in
// chatTurn.v18.ts, a turn that admitted a Work and then failed to emit its card would be
// "completed" with nothing to show, which is exactly what C-19 exists to refuse.

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import {
  SYSTEM_PROMPT_V17,
  toTypedParts_v17,
  hasCodingIntent_v17,
  type ClaraPartV17,
} from "./chatTurn.v17.prompt.js";
import { START_JOURNAL_WORK_TOOL } from "./chatTurn.v18.tools.js";
import type { WorkAcceptedPart } from "./chatTurn.v18.parts.js";

export { CLARIFY_FRAMING, DRAFT_TOOL, clarifyTool, draftJournalEntryInputSchema, findClarifyCall } from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { POST_TOOL, OPEN_QUESTION_TOOL, SYSTEM_PROMPT_V14 } from "./chatTurn.v14.prompt.js";
export { FREEFORM_GUIDANCE, SYSTEM_PROMPT_V15 } from "./chatTurn.v15.prompt.js";
export { SYSTEM_PROMPT_V16 } from "./chatTurn.v16.prompt.js";
export { SYSTEM_PROMPT_V17 } from "./chatTurn.v17.prompt.js";
export type {
  AgentReceiptPart,
  CloseProposalPart,
  ClaraPartV16,
  ClaraPartV16Additions,
  FirmQuestionPart,
  FreeformResultPart,
} from "./chatTurn.v17.prompt.js";
export type { WorkAcceptedPart };

/** The ONE kind #623 adds to the transcript wire. */
export type ClaraPartV18 = ClaraPartV17 | WorkAcceptedPart;

export const JOURNAL_WORK_CHAT_GUIDANCE = [
  "RECORDING A JOURNAL ENTRY FROM THE CONVERSATION — QUEUE THE WORK, DO NOT CLAIM THE POSTING.",
  "",
  `When the human tells you an entry to record and gives you a date, a memo and exact amounts with`,
  `accounts, use ${START_JOURNAL_WORK_TOOL}. Amounts are integer CENTS: RM 1,200.00 is 120000. Each`,
  "line carries a debit OR a credit, never both, and total debits must equal total credits exactly.",
  "There is no source document for this kind of entry and you must never invent, cite or imply one.",
  "",
  "IF ANYTHING IS MISSING — the posting date, an amount, which accounts, or which client — ask with",
  "clarify. Do not infer a posting date from today, do not round an amount, and do not pick an",
  "account code because it looks close. The figures you pass become the admitted basis and cannot",
  "be changed afterwards by you or by the run that posts them.",
  "",
  "THE TOOL QUEUES WORK; IT DOES NOT POST. It returns as soon as the Work is admitted. The entry is",
  "posted a moment later by a separate run, under the human's own authority rechecked at that",
  "moment — so the period, the accounts and their role are all checked AFTER you answer, and any of",
  "them can refuse. Say you have QUEUED the entry and point them at the Work card for the outcome.",
  "Never say the entry is recorded, posted or done on the strength of this tool succeeding.",
].join("\n");

export const SYSTEM_PROMPT_V18 = `${SYSTEM_PROMPT_V17}\n\n${JOURNAL_WORK_CHAT_GUIDANCE}`;

/** Read the admitted Work identity out of a `start_journal_work` RESULT. Returns null for a
 *  refusal, a malformed result, or anything that is not this tool's own answer — a card is only
 *  ever minted for a row the database confirmed. */
export function admittedWorkAccepted(output: unknown): WorkAcceptedPart | null {
  if (!output || typeof output !== "object") return null;
  const result = output as { ok?: unknown; work_accepted?: unknown };
  if (result.ok !== true) return null;
  const part = result.work_accepted as Partial<WorkAcceptedPart> | undefined;
  if (!part || typeof part !== "object") return null;
  const workId = typeof part.work_id === "string" ? part.work_id.trim() : "";
  const clientId = typeof part.client_id === "string" ? part.client_id.trim() : "";
  const logicalOpId = typeof part.logical_op_id === "string" ? part.logical_op_id.trim() : "";
  if (!workId || !clientId || !logicalOpId) return null;
  if (part.purpose !== "journal_entry") return null;
  return { type: "work_accepted", work_id: workId, client_id: clientId, purpose: "journal_entry", logical_op_id: logicalOpId };
}

/** v17's promotion by import, plus the ONE new arm (see this file's header). */
export function toTypedParts_v18(content: readonly AiContentPart[]): ClaraPartV18[] {
  const out: ClaraPartV18[] = [...toTypedParts_v17(content)];
  const seen = new Set<string>();
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName?: string; output?: unknown };
    if (tr.toolName !== START_JOURNAL_WORK_TOOL) continue;
    const part = admittedWorkAccepted(tr.output);
    if (part === null) continue;
    if (seen.has(part.work_id)) continue;
    seen.add(part.work_id);
    out.push(part);
  }
  return out;
}

/** The C-19 acting-intent signal, extended: admitting an accounting Work IS acting on the
 *  client's books (see this file's header). */
export function hasCodingIntent_v18(content: readonly AiContentPart[]): boolean {
  if (hasCodingIntent_v17(content)) return true;
  return content.some((p) => p.type === "tool-call" && (p as { toolName?: string }).toolName === START_JOURNAL_WORK_TOOL);
}
