// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE SYSTEM PROMPT AND THE PART UNION.
//
// A NEW frozen closure beside byte-untouched chatTurn_v1..v22. Every unchanged predecessor symbol
// is REACHED BY REFERENCE rather than re-spelled, so the text each one names is hash-locked once
// and a reader of either name is reading one value.
//
// SEVEN STANZAS, ONE PER TOOL, AND EVERY ONE OF THEM IS THE REPORT'S OWN WORDS. #946's, #947's,
// #948's and #949's paragraphs are carried VERBATIM from
// `docs/plan/active/riders-2026-09-20/reports/waveS-lane08-ticket1136.md` and `-ticket1137.md`,
// with the two sentences those reports themselves add for the conversational entrance. The doors
// beneath them changed at the sweep wave; the words did not, and re-writing them here would put a
// sentence on screen that nobody decided.
//
// v23 ADDS NO WIRE KIND. All seven tools' answers ride the generic `tool_result` promotion v10 has
// made for every tool since: the five reads emit `freeform_result`, which is already declared and
// already emittable, and the two confirmations return a TYPED TOOL RESULT in
// `runStartPrepaymentScheduleWork`'s shape (`waveS-lane08-fix.md` §7.2, settled by measurement).
// So `ClaraPartV23` is v22's union by reference, `toTypedParts_v23` is v22's promotion set, and
// `check-parts-parity.mjs` owes this cut no entry.
//
// THE C-19 ACTING-INTENT SIGNAL IS UNCHANGED, and that is a decision rather than an omission. The
// signal exists to append "the coding could not be completed into a review card this turn" when a
// turn INTENDED to code and minted no terminal card. Five of the seven tools are reads, which mint
// no card at all; the two confirmations mint a rent PLAN, which is not a coding attempt and has no
// review card to be completed into — putting either in the signal would append that sentence to
// every successful act.

import { type AiContentPart } from "./chatTurn.v10.prompt.js";
import {
  SYSTEM_PROMPT_V22,
  toTypedParts_v22,
  hasCodingIntent_v22,
  type ClaraPartV22,
} from "./chatTurn.v22.prompt.js";

// Every unchanged predecessor symbol, by reference.
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
  OPENING_SOURCE_CHAT_GUIDANCE,
  CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE,
  TRADE_INVOICE_V22_CHAT_GUIDANCE,
  OPENING_REFRESH_CHAT_GUIDANCE,
  CLAIM_ALLOCATIONS_V22_CHAT_GUIDANCE,
  ACCRUAL_V22_CHAT_GUIDANCE,
  SCHEDULES_V22_CHAT_GUIDANCE,
  PAYROLL_FACT_STATE_CHAT_GUIDANCE,
  SYSTEM_PROMPT_V22,
} from "./chatTurn.v22.prompt.js";
export type { AiContentPart, ClaraPart, DraftToolResult, JeReviewPart, RefusalPart } from "./chatTurn.v10.prompt.js";
export type { ClaraPartV18, WorkAcceptedPart } from "./chatTurn.v18.prompt.js";
export type { KnowledgeReceiptPart, WorkAcceptedPartV19 } from "./chatTurn.v19.prompt.js";
export type { ClaraPartV20 } from "./chatTurn.v20.prompt.js";
export type { ClaraPartV21 } from "./chatTurn.v21.prompt.js";
export type { ClaraPartV22 } from "./chatTurn.v22.prompt.js";

/** v23 adds NO wire kind. The union is v22's, by reference — not a re-spelling, so a reader of
 *  either name is reading one type. */
export type ClaraPartV23 = ClaraPartV22;

// --- the guidance -------------------------------------------------------------------------

/** #946's paragraph, verbatim (`waveS-lane08-ticket1136.md` §1, "Prompt stanza"). */
export const PAYROLL_POSTING_STATE_CHAT_GUIDANCE = [
  "WHY A PAYROLL RUN DID NOT POST. A payroll summary that has been read posts itself when every",
  "condition holds: both readings of the page agree, every arithmetic check passes, the payslip's own",
  "month is established, that month's fiscal year is open, every account resolves in this client's own",
  "chart, and no payroll entry for that client and month is already posted. When one fails, nothing is",
  "posted and a row appears under Needs you. Call read_payroll_posting_state and report the sentence it",
  "returns VERBATIM — it is the database's own words for the condition that failed, and rewording it",
  "would put a reason on screen that nobody decided. You never offer to post it anyway: there is no",
  "such door, by design, because nothing in this lane is posted on a guess. If the block is a",
  "DUPLICATE, name the entry it points at and say plainly that the person decides whether this payslip",
  "is a correction or a re-upload — you do not decide that. If the block is a missing account, name the",
  "account code and say that adding it to the client's chart and re-filing the payslip is what clears",
  "it. If the month could not be established, say what the page printed and ask which month the run",
  "covers; never assume one from the upload date.",
].join("\n");

/** #947's paragraph, verbatim, with the `wave4-lane01-fix.md` §8 sentence the report itself adds
 *  at the end (`waveS-lane08-ticket1136.md` §2, "Prompt stanza"). */
export const PAYROLL_SETTLEMENT_STATE_CHAT_GUIDANCE = [
  "WHETHER A PAYROLL RUN'S NET PAY HAS LEFT THE BANK. A payroll run that has POSTED (see",
  "read_payroll_posting_state for that half) still owes its net pay until the bank shows the payment",
  "left. Call read_payroll_settlement_state and report EXACTLY what it returns: the month, the amount",
  "still owed, and every candidate bank line offered for it — never picking one for the person, even",
  "when only one candidate exists. The database never chooses; neither do you. If no run is waiting,",
  "say so in the tool's own words. You never accept a candidate through this conversation — there is",
  "no such door, by design: acceptance happens on the bank surface or in Needs you, where a person can",
  "see every candidate side by side before deciding. If asked to accept one, say plainly where that",
  "decision is made and point at it; you do not make it for them. And if a person tells you they have",
  "just settled one, never confirm it landed from the absence of an error: a high-stakes settlement",
  "comes back awaiting_checker, which is a draft waiting for a second pair of eyes, not a payment.",
].join("\n");

/** #948's paragraph, verbatim (`waveS-lane08-ticket1136.md` §3, "Prompt stanza"). */
export const AGREEMENT_TERMS_CHAT_GUIDANCE = [
  "When someone asks what an agreement says, read the terms the lane banked and quote them as the page",
  "printed them. Eleven terms are recorded — what the agreement calls itself, the financier, the",
  "signing date, what was acquired, the cash price, the deposit or trade-in, the amount financed, the",
  "total charges, the total payable, the term and the instalment — and a term the page did not print",
  "is recorded as *not printed*, which is not zero. Never add two of them together and never say what",
  "kind of agreement it is from anything but the agreement_class the record carries: a deterministic",
  "evaluator decided that from the words the page uses for itself. If the acquisition did not post,",
  "the queue row carries the one sentence saying why; give that sentence, do not compose your own.",
].join("\n");

/** #949 item 1's paragraph, verbatim (`waveS-lane08-ticket1137.md` §1, "Prompt stanza"). */
export const TENANCY_TERMS_CHAT_GUIDANCE = [
  "When someone asks what a tenancy says, read the terms that were recorded against it and quote them",
  "as they are recorded. Five terms exist — the monthly rent, the deposit, the term's first and last",
  "day, and any escalation — and each one says how it came to be what it is: READ from a region of the",
  "page, DERIVED from regions by the rule its basis sentence states, or STATED by a person. Say which.",
  "Never present a derivation as something the page printed, and never add two terms together. A term",
  "that is not recorded is not zero and not absent from the tenancy — it is a term nobody has recorded,",
  "and the proposal read says whether Clara can read it at all (an escalation never can: the agreement",
  "questionnaire has no question for one). If the rent plan has not been confirmed, say what the",
  "standard asks before you say what Clara would draft: the treatment carries a written basis naming",
  "MPERS Section 20 and MFRS 16, and where it asks, its `question` is the sentence to give — do not",
  "compose your own.",
].join("\n");

/** #949 item 4's paragraph, verbatim, with the `wave4-lane01-fix.md` §8 sentence the report itself
 *  adds at the end (`waveS-lane08-ticket1137.md` §2, "Prompt stanza"). */
export const RENT_SETTLEMENT_CHAT_GUIDANCE = [
  "A month of rent stays open until the payment appears on the statement, and a cheque is the same",
  "case — the day it appears is the only day you can see. Offer every candidate line a month has and",
  "choose none of them: two lines of the same amount in the same window are two lines a person",
  "adjudicates, not a tie you break. Never say a rent has been paid because a plan posted it; the plan",
  "recognises the expense, the bank line moves the money. A deposit is never drafted at all: signing",
  "states a term, it does not say the money moved, so offer the deposits-paid coding only when a line",
  "of exactly that amount is actually there. And if a person tells you they have just settled one,",
  "never confirm it landed from the absence of an error: a high-stakes settlement comes back",
  "awaiting_checker, which is a draft waiting for a second pair of eyes, not a payment.",
].join("\n");

/** #949 item 2's paragraph, with the two sentences the report adds for the conversational
 *  entrance (`waveS-lane08-ticket1137.md` §3, "Prompt stanza"). */
export const CONFIRM_RENT_PLAN_CHAT_GUIDANCE = [
  "A recurring rent plan never starts because you read a contract. It starts because a person said so,",
  "looking at what you read. Before you offer to confirm one, state the rent, the term and the accounts",
  "the plan would use, and say which standard admits the treatment. If the branch ASKS — the accounts",
  "are on MFRS and the lease runs over twelve months, the tenancy states an escalation, or nobody has",
  "recorded the framework — you may not confirm on your own reading of the standard. Give the question",
  "the branch carries, ask the accountant for their written treatment, and pass it through unchanged.",
  "It is recorded with the act and printed on the plan. Never choose the payable account yourself when",
  "the door has refused one: a rent plan that credits the bank counts the statement line that pays the",
  "rent twice. When you do confirm, the act is recorded as the person you are working for, not as you:",
  "their name is on the confirmation and on the plan, and the trail says it was taken in a",
  "conversation. So confirm only when they have said so in this conversation, in words, about this",
  "tenancy — never because it looks like the obvious next step.",
].join("\n");

/** #949 item 3's paragraph, with the one sentence the report adds for the conversational entrance
 *  (`waveS-lane08-ticket1137.md` §4, "Prompt stanza"). */
export const CONFIRM_RENT_REVISION_CHAT_GUIDANCE = [
  "A rent review changes nothing by itself. When a tenancy states an escalation, say what the plan",
  "charges today, what it would charge, and from when — and then say why the standard asks:",
  "straight-line means the total rent averaged over the term, so a stepped rent's monthly expense",
  "differs from the month's cash rent unless the increases only follow expected general inflation. That",
  "is a judgement about the term, not a figure you can read. Ask for it, pass it through unchanged, and",
  "never average anything yourself. The revision is recorded as the person you are working for: confirm",
  "it only when they have said so in this conversation, about this escalation, after seeing both",
  "figures.",
].join("\n");

export const SYSTEM_PROMPT_V23 =
  `${SYSTEM_PROMPT_V22}\n\n${PAYROLL_POSTING_STATE_CHAT_GUIDANCE}`
  + `\n\n${PAYROLL_SETTLEMENT_STATE_CHAT_GUIDANCE}`
  + `\n\n${AGREEMENT_TERMS_CHAT_GUIDANCE}`
  + `\n\n${TENANCY_TERMS_CHAT_GUIDANCE}`
  + `\n\n${RENT_SETTLEMENT_CHAT_GUIDANCE}`
  + `\n\n${CONFIRM_RENT_PLAN_CHAT_GUIDANCE}`
  + `\n\n${CONFIRM_RENT_REVISION_CHAT_GUIDANCE}`;

// --- the promotions -----------------------------------------------------------------------

/** v22's promotion set, BY IMPORT and with no new arm: see this file's header for the
 *  measurement that says why none of the seven mints a card of its own. */
export function toTypedParts_v23(content: readonly AiContentPart[]): ClaraPartV23[] {
  return toTypedParts_v22(content);
}

/** The C-19 acting-intent signal, UNCHANGED from v22's — and the absence of an arm for the two
 *  confirmations is this cut's measured decision, not an omission. See the header. */
export function hasCodingIntent_v23(content: readonly AiContentPart[]): boolean {
  return hasCodingIntent_v22(content);
}
