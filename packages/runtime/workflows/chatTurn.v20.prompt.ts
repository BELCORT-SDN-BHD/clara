// @frozen
//
// FROZEN — part of the chatTurn_v20 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v19 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback).
//
// A THIN EXTENSION of v19's prompt, and thinner than v19's was of v18's: `ClaraPartV20` IS
// `ClaraPartV19`. NO NEW WIRE KIND. Both tools this closure adds mint the SAME `work_accepted`
// card v18 declared and v19 already widens the purpose of — a staff expense claim and an accrual
// occurrence are both `journal_entry`-purpose Work — so `apps/web/lib/parts/types.ts` needs no
// change and `check-parts-parity.mjs` has no new declarer to read. That is not a shortcut: it is
// migration 0206's amendment (a fourth `accounting_work.purpose` cannot post without recutting the
// posting core) and 0193's `_plan_admit_occurrence` (every occurrence admits through
// `clara.admit_journal_work`) arriving in the wire vocabulary as an absence of work.
//
// `SYSTEM_PROMPT_V20` APPENDS two paragraphs to `SYSTEM_PROMPT_V19` BY IMPORT. Every prior word
// stays byte-identical, v19's knowledge-context block included.
//
// ---------------------------------------------------------------------------------------------
// THE PROMOTIONS ARE OFF THE TOOL RESULT, NEVER OFF THE TOOL CALL — v16's `freeform_result` shape
// and v18's `work_accepted` shape, carried. A CALL is a request; a card addresses a row the
// database confirmed.
//
// AND ONE OF THE TWO CAN LEGITIMATELY MINT NOTHING. `start_accrual_work` answers `ok: true` with
// `work_accepted: null` when the authority window has not opened yet — the schedule is configured
// and NOTHING IS DUE. A card built for that case would name a Work that does not exist, so the
// promotion returns null and the model is told, in its own guidance, to say "configured, nothing
// due yet". An absent card is the honest rendering of an absent Work.
//
// C-19: `hasCodingIntent_v20` returns true for BOTH new tools. Admitting a staff expense claim is
// acting on the client's books; so is configuring an accrual that admits this period's Work. Their
// terminal card is the SAME `work_accepted` v18 already put in the C-19 terminal set, so
// chatTurn.v20.ts's terminal set is v19's (which is v18's), unchanged.
//
// A NOTE ON THE ACCRUAL'S FUTURE-DATED CASE AND C-19, because it is the one interaction worth
// stating: a turn that configured a future-dated accrual has coding intent and mints no
// `work_accepted`. It is therefore the `codingIncompleteRefusal()` arm's business — and that is
// CORRECT rather than a defect to work around: the turn acted on the books' future and produced no
// card, so C-19 makes the turn say something terminal instead of trailing off. The tool's own text
// result is what the model narrates from; the refusal part is the floor under a turn that narrates
// nothing.

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import {
  SYSTEM_PROMPT_V19,
  toTypedParts_v19,
  hasCodingIntent_v19,
  type ClaraPartV19,
} from "./chatTurn.v19.prompt.js";
import type { WorkAcceptedPartV19 } from "./chatTurn.v19.parts.js";
import { START_STAFF_EXPENSE_CLAIM_WORK_TOOL, START_ACCRUAL_WORK_TOOL } from "./chatTurn.v20.tools.js";

export {
  CLARIFY_FRAMING,
  DRAFT_TOOL,
  clarifyTool,
  draftJournalEntryInputSchema,
  findClarifyCall,
} from "./chatTurn.v10.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export { POST_TOOL, OPEN_QUESTION_TOOL, SYSTEM_PROMPT_V14 } from "./chatTurn.v14.prompt.js";
export { FREEFORM_GUIDANCE, SYSTEM_PROMPT_V15 } from "./chatTurn.v15.prompt.js";
export { SYSTEM_PROMPT_V16 } from "./chatTurn.v16.prompt.js";
export { SYSTEM_PROMPT_V17 } from "./chatTurn.v17.prompt.js";
export { SYSTEM_PROMPT_V18, JOURNAL_WORK_CHAT_GUIDANCE, admittedWorkAccepted } from "./chatTurn.v18.prompt.js";
export {
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
} from "./chatTurn.v19.prompt.js";
export type { ClaraPartV18, WorkAcceptedPart } from "./chatTurn.v18.prompt.js";
export type { KnowledgeReceiptPart, WorkAcceptedPartV19 } from "./chatTurn.v19.prompt.js";

/** v20 adds NO wire kind. The union is v19's, by reference — not a re-spelling, so a reader of
 *  either name is reading one type. */
export type ClaraPartV20 = ClaraPartV19;

// --- the guidance -------------------------------------------------------------------------

export const STAFF_EXPENSE_CLAIM_CHAT_GUIDANCE = [
  "RECORDING A STAFF EXPENSE CLAIM FROM THE CONVERSATION — QUEUE THE WORK, DO NOT CLAIM THE POSTING.",
  "",
  `${START_STAFF_EXPENSE_CLAIM_WORK_TOOL} records what an EMPLOYEE paid for out of their own pocket`,
  "— or out of an advance they already hold — so the firm can reimburse them or clear the advance.",
  "",
  "THE CLAIMANT IS A PERSON, NOT A SUPPLIER. Name them. If they are already on this client's",
  "staff-advance register, give the enrolment; if they are new, give their label and say so. Clara",
  "enrols a new claimant on that register — it NEVER creates a vendor counterparty for an employee,",
  "because a supplier record for a colleague pollutes the master data every other lane reads.",
  "",
  "EVERY FIGURE IS THEIRS AND AMOUNTS ARE INTEGER CENTS: RM 128.50 is 12850. Itemise the claim —",
  "one line per thing bought, each with its expense account — and the items must add up to what is",
  "being claimed. Never invent an account, never round, and never estimate a date. If an item is",
  "waiting on a fact the human does not have yet, say which fact on that item; the rest of the",
  "claim continues without it.",
  "",
  "SAY HOW IT IS SETTLED, in the human's own terms: the firm still owes them (reimbursement, with",
  "the non-control payable account), it comes off a named live advance (advance application), or it",
  "was already paid at the time (already settled, with the account it was paid from). These are",
  "three different accounting facts and Clara may not guess between them.",
  "",
  "THE TOOL QUEUES WORK; IT DOES NOT POST. The entry, the claim register row and the employee's",
  "liability are written a moment later by a separate run under the human's own authority rechecked",
  "at that moment — the accounts, the open period and the enrolment are all checked AFTER you",
  "answer, and any of them can refuse. Say you have QUEUED it and point them at the Work card.",
  "If the claimant, the date the cost was incurred, or an item's amount or account is missing, ask",
  "with clarify: the claim's basis is fixed at admission and no later question can repair it.",
].join("\n");

export const ACCRUAL_CHAT_GUIDANCE = [
  "CONFIGURING AN ACCRUAL — A SCHEDULE, NOT A POSTING, AND THE TERM IS ALWAYS THE HUMAN'S.",
  "",
  `${START_ACCRUAL_WORK_TOOL} sets up an accrual: a cost the client has INCURRED over a stated`,
  "service period but has not been billed for, charged to an expense account and accrued into a",
  "NON-CONTROL liability, with a reversal when the real bill arrives. Amounts are integer CENTS.",
  "",
  "THE SERVICE PERIOD IS A FACT A PERSON STATED. Never a period you read out of a document, never",
  "one you inferred from an invoice date, and never one you rounded to a month. If the human has",
  "not told you when the service period starts and ends, ask with clarify. There is no way to",
  "express a derived period in this tool, and that is deliberate.",
  "",
  "THE AUTHORITY WINDOW RUNS INSIDE THE TERM. Both ends are required: the day the authority starts",
  "and the day it stops, and the stop day must fall on or before the service period ends. An",
  "open-ended accrual is refused rather than defaulted — an authorisation with no end is a standing",
  "instruction nobody gave. The schedule must also reach at least one accrual date inside that",
  "window, or the database refuses it by name: an accrual that can never post is a promise the",
  "ledger will not keep.",
  "",
  "NAME THE WORK THAT AUTHORISES IT. An accrual is an instruction, and the instruction lives on an",
  "accounting Work of this client. A remembered preference, a Knowledge record or a sentence in",
  "this conversation cannot authorise one; the database resolves the Work you name and refuses one",
  "it cannot.",
  "",
  "WHAT SUCCESS MEANS, AND IT HAS TWO SHAPES. If the authority window is already open, the current",
  "period's Work is queued and you have a Work card to point at — say it is QUEUED, never posted.",
  "If the window starts in the future, the schedule is CONFIGURED and NOTHING IS DUE YET: say",
  "exactly that, and do not describe a Work that does not exist.",
].join("\n");

export const SYSTEM_PROMPT_V20 = `${SYSTEM_PROMPT_V19}\n\n${STAFF_EXPENSE_CLAIM_CHAT_GUIDANCE}\n\n${ACCRUAL_CHAT_GUIDANCE}`;

// --- the promotions -----------------------------------------------------------------------

/**
 * Read the admitted Work identity out of a `start_staff_expense_claim_work` or
 * `start_accrual_work` RESULT.
 *
 * ONE READER FOR BOTH, because both results carry the identical `work_accepted` payload and a
 * second copy of this logic is how two cards of one shape come to disagree. Returns null for a
 * refusal, a malformed result, a purpose this closure does not admit, or — the accrual's own
 * honest case — an `ok` answer that carries `work_accepted: null` because the authority window has
 * not opened and nothing is due.
 *
 * `logical_op_id` IS NOT REQUIRED TO BE NON-EMPTY, and that differs from v18's and v19's readers on
 * purpose. An accrual occurrence that CONVERGED onto a Work admitted earlier carries its logical
 * operation identity inside the occurrence's own `outcome` object rather than at the top level
 * (0193's converged branch), and dropping the card there would hide the Work a human most needs to
 * be shown. The tool resolves it from either place; a blank one still addresses a real row by
 * `work_id`, which is what the card links on.
 */
export function admittedWorkAcceptedV20(output: unknown): WorkAcceptedPartV19 | null {
  if (!output || typeof output !== "object") return null;
  const result = output as { ok?: unknown; work_accepted?: unknown };
  if (result.ok !== true) return null;
  const part = result.work_accepted as Partial<WorkAcceptedPartV19> | null | undefined;
  if (!part || typeof part !== "object") return null;
  const workId = typeof part.work_id === "string" ? part.work_id.trim() : "";
  const clientId = typeof part.client_id === "string" ? part.client_id.trim() : "";
  if (!workId || !clientId) return null;
  if (part.purpose !== "journal_entry") return null;
  return {
    type: "work_accepted",
    work_id: workId,
    client_id: clientId,
    purpose: "journal_entry",
    logical_op_id: typeof part.logical_op_id === "string" ? part.logical_op_id : "",
  };
}

/** v19's promotion by import, plus the TWO new arms. Both mint `work_accepted`, so both dedupe
 *  against the SAME work-id set v19's own arms already filled — a turn that queued a journal
 *  entry AND a staff claim gets two cards; a replayed segment that re-ran either gets one each. */
export function toTypedParts_v20(content: readonly AiContentPart[]): ClaraPartV20[] {
  const out: ClaraPartV20[] = [...toTypedParts_v19(content)];
  const works = new Set<string>();
  for (const existing of out) if (existing.type === "work_accepted") works.add(existing.work_id);
  for (const p of content) {
    if (p.type !== "tool-result") continue;
    const tr = p as { toolName?: string; output?: unknown };
    if (tr.toolName !== START_STAFF_EXPENSE_CLAIM_WORK_TOOL && tr.toolName !== START_ACCRUAL_WORK_TOOL) continue;
    const part = admittedWorkAcceptedV20(tr.output);
    if (part === null) continue;
    if (works.has(part.work_id)) continue;
    works.add(part.work_id);
    out.push(part as unknown as ClaraPartV20);
  }
  return out;
}

/** The C-19 acting-intent signal, extended by the TWO new tools that act on the books. */
export function hasCodingIntent_v20(content: readonly AiContentPart[]): boolean {
  if (hasCodingIntent_v19(content)) return true;
  return content.some((p) => {
    if (p.type !== "tool-call") return false;
    const name = (p as { toolName?: string }).toolName;
    return name === START_STAFF_EXPENSE_CLAIM_WORK_TOOL || name === START_ACCRUAL_WORK_TOOL;
  });
}
