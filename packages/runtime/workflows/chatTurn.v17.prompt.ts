// @frozen
//
// FROZEN — part of the chatTurn_v17 closure (FS-7 ECHELON-1: THE REPORT CHAT OPENER). A NEW
// frozen closure beside byte-untouched chatTurn_v1..v16 (ARCHITECTURE Appendix A).
//
// A THIN EXTENSION of v16's prompt. `ClaraPartV17` IS `ClaraPartV16`: the three report tools
// return narrative jsonb and mint no wire part. In particular, they do not construct the generic
// `agent_receipt`: the report-agent hydrate shim is still empty and the wrappers do not return
// their receipt-row ids, so doing so would manufacture an unresolvable card.
//
// `SYSTEM_PROMPT_V17` APPENDS one report paragraph to `SYSTEM_PROMPT_V16` BY IMPORT. Every prior
// word remains byte-identical, and the new words state the operational boundary plainly: the
// model needs exact UUIDs already in context, the run must already contain evaluated cells before
// it can be sealed, sealing queues a render, and F-A5b's PDF worker is not built in this echelon.
// An honest queued render is not presented as a ready download.
//
// `toTypedParts_v17` and `hasCodingIntent_v17` delegate to v16 unchanged. There is no promotion
// arm because there is no new part. C-19 remains book-act scoped: opening, assessing and sealing
// report lifecycle rows does not alter the client's books, so these tools do not acquire a
// terminal-card obligation merely because their DB wrappers write audit receipts.

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import {
  SYSTEM_PROMPT_V16,
  toTypedParts_v16,
  hasCodingIntent_v16,
  type ClaraPartV16,
} from "./chatTurn.v16.prompt.js";
import {
  OPEN_REPORT_RUN_TOOL,
  ASSESS_REPORT_CLAIM_TOOL,
  SEAL_REPORT_DATASET_TOOL,
} from "./chatTurn.v17.tools.js";

export { CLARIFY_FRAMING, DRAFT_TOOL, clarifyTool, draftJournalEntryInputSchema, findClarifyCall } from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { POST_TOOL, OPEN_QUESTION_TOOL, SYSTEM_PROMPT_V14 } from "./chatTurn.v14.prompt.js";
export { FREEFORM_GUIDANCE, SYSTEM_PROMPT_V15 } from "./chatTurn.v15.prompt.js";
export { SYSTEM_PROMPT_V16 } from "./chatTurn.v16.prompt.js";
export type {
  AgentReceiptPart,
  CloseProposalPart,
  ClaraPartV16,
  ClaraPartV16Additions,
  FirmQuestionPart,
  FreeformResultPart,
} from "./chatTurn.v16.prompt.js";

/** No wire widening in FS-7 ECHELON-1 — v16 remains the newest declarer. */
export type ClaraPartV17 = ClaraPartV16;

export const REPORT_CHAT_GUIDANCE = [
  "MANAGEMENT-ACCOUNTS REPORTS — OPEN, ASSESS, THEN SEAL AN ALREADY-EVALUATED RUN.",
  "",
  `When the human asks to prepare a management-accounts report, use ${OPEN_REPORT_RUN_TOOL}, then`,
  `${ASSESS_REPORT_CLAIM_TOOL}, then ${SEAL_REPORT_DATASET_TOOL} only after the report pack has`,
  "already been evaluated against that run. These three tools do not include the separate pack-",
  "evaluation verb: if the run has no evaluated cells, say that this chat surface cannot complete",
  "the chain yet rather than pretending assessment performs evaluation. Sealing auto-assesses again",
  "and enqueues the render. It does NOT make a downloadable PDF ready: the PDF render worker is not built",
  "in this echelon, so say honestly that the render was queued and do not promise a download link.",
  "",
  "These tools require exact UUIDs for the report run and its versioned inputs. There is no chat",
  "tool that lists report spec versions, books snapshots, reporting periods or chart template",
  "versions. Use ids already present in the conversation; if one is missing, ask the human for it",
  "rather than guessing. Their JSON results are narrative — explain them in prose; no receipt card",
  "is emitted.",
].join("\n");

export const SYSTEM_PROMPT_V17 = `${SYSTEM_PROMPT_V16}\n\n${REPORT_CHAT_GUIDANCE}`;

/** v16's promotion by import: report results remain narrative and add no part. */
export function toTypedParts_v17(content: readonly AiContentPart[]): ClaraPartV17[] {
  return toTypedParts_v16(content);
}

/** v16's acting-intent classifier by import: report lifecycle work does not alter the books. */
export function hasCodingIntent_v17(content: readonly AiContentPart[]): boolean {
  return hasCodingIntent_v16(content);
}
