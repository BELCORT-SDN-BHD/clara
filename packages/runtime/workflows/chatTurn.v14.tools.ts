// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6: BANK CHAT PARITY). A NEW frozen
// closure beside byte-untouched chatTurn_v1..v13 (ARCHITECTURE Appendix A).
//
// `buildToolsV14` calls v13's `buildToolsV13(ctx, modelId)` BY IMPORT — every v13 tool
// (list_unassigned_documents, read_document, get_context_pack, trial_balance,
// list_journal_entries, get_journal_entry, draft_journal_entry, post_journal_entry,
// open_client_question, clarify, the five eta authoring tools) is BYTE-CARRIED, unchanged, no
// overrides — this closure adds capability, it does not touch the entry-posting or open-question
// limbs at all. `segment` is the ONE new input this file's tools need beyond what v13's own
// signature carries (chatTurn.v14.bank.ts's header explains why: op-key segment-qualification).

import { tool } from "ai";
import { buildToolsV13 } from "./chatTurn.v13.tools.js";
import type { ToolCtx } from "./chatTurn.v14.infra.js";
import { getBankPackInputSchema, runGetBankPack } from "./chatTurn.v14.bank.js";
import {
  addBankAccountInputSchema,
  upsertBankCoaAccountInputSchema,
  matchBankLineInputSchema,
  settleFromBankLineInputSchema,
  unmatchBankMatchInputSchema,
  completeBankReconciliationInputSchema,
  voidBankReconciliationInputSchema,
  resolveBankLineExceptionInputSchema,
  proposeBankLineExceptionInputSchema,
  voidBankStatementInputSchema,
  proposeBankIdentifierPromotionInputSchema,
  resolveAndBookBankLineInputSchema,
} from "./chatTurn.v14.bankSchemas.js";
import {
  runAddBankAccount,
  runUpsertBankCoaAccount,
  runMatchBankLine,
  runSettleFromBankLine,
  runUnmatchBankMatch,
  runCompleteBankReconciliation,
} from "./chatTurn.v14.bankActs.js";
import {
  runVoidBankReconciliation,
  runResolveBankLineException,
  runProposeBankLineException,
  runVoidBankStatement,
  runProposeBankIdentifierPromotion,
  runResolveAndBookBankLine,
} from "./chatTurn.v14.bankActs2.js";

/** The thirteen bank tool names — named constants because the C-19 terminal invariant (v14's own
 *  entry file) and the part-promotion law (chatTurn.v14.prompt.ts) both discriminate on them. */
export const BANK_GET_PACK_TOOL = "get_bank_pack";
export const BANK_ADD_ACCOUNT_TOOL = "add_bank_account";
export const BANK_UPSERT_COA_TOOL = "upsert_bank_coa_account";
export const BANK_MATCH_LINE_TOOL = "match_bank_line";
export const BANK_SETTLE_LINE_TOOL = "settle_from_bank_line";
export const BANK_UNMATCH_TOOL = "unmatch_bank_match";
export const BANK_COMPLETE_RECON_TOOL = "complete_bank_reconciliation";
export const BANK_VOID_RECON_TOOL = "void_bank_reconciliation";
export const BANK_RESOLVE_EXCEPTION_TOOL = "resolve_bank_line_exception";
export const BANK_PROPOSE_EXCEPTION_TOOL = "propose_bank_line_exception";
export const BANK_VOID_STATEMENT_TOOL = "void_bank_statement";
export const BANK_PROPOSE_PROMOTION_TOOL = "propose_bank_identifier_promotion";
export const BANK_RESOLVE_AND_BOOK_TOOL = "resolve_and_book_bank_line";

/** The twelve ACT tool names (excludes the read verb) — what counts toward "bank-acting intent"
 *  for the C-19 terminal invariant, mirroring how v13 keys on POST_TOOL/DRAFT_TOOL. */
export const BANK_ACT_TOOLS: readonly string[] = [
  BANK_ADD_ACCOUNT_TOOL,
  BANK_UPSERT_COA_TOOL,
  BANK_MATCH_LINE_TOOL,
  BANK_SETTLE_LINE_TOOL,
  BANK_UNMATCH_TOOL,
  BANK_COMPLETE_RECON_TOOL,
  BANK_VOID_RECON_TOOL,
  BANK_RESOLVE_EXCEPTION_TOOL,
  BANK_PROPOSE_EXCEPTION_TOOL,
  BANK_VOID_STATEMENT_TOOL,
  BANK_PROPOSE_PROMOTION_TOOL,
  BANK_RESOLVE_AND_BOOK_TOOL,
];

/** Build v14's full tool set: v13's tools by import, unchanged, plus the thirteen bank tools.
 *  `segment` is the workflow entry's own loop counter (chatTurn.v14.ts), threaded down so every
 *  bank tool call in THIS segment shares one deterministic namespace. */
export function buildToolsV14(ctx: ToolCtx, modelId: string, segment: number) {
  const base = buildToolsV13(ctx, modelId);
  const taskId = ctx.taskId;
  return {
    ...base,
    [BANK_GET_PACK_TOOL]: tool({
      description: "Read one bank account's unmatched statement lines, match candidates, open items and open proposals. Call this BEFORE any bank act — every act needs the digest this returns.",
      inputSchema: getBankPackInputSchema,
      execute: (input: import("./chatTurn.v14.bank.js").GetBankPackInput) => runGetBankPack(ctx, input, modelId, taskId, segment),
    }),
    [BANK_ADD_ACCOUNT_TOOL]: tool({
      description: "Register a new bank account against a confirmed proposal from the bank pack, binding it to a COA account.",
      inputSchema: addBankAccountInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").AddBankAccountInput) => runAddBankAccount(ctx, input, modelId, taskId, segment),
    }),
    [BANK_UPSERT_COA_TOOL]: tool({
      description: "Create or update a chart-of-accounts account in the bank-registration context.",
      inputSchema: upsertBankCoaAccountInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").UpsertBankCoaAccountInput) => runUpsertBankCoaAccount(ctx, input, modelId, taskId, segment),
    }),
    [BANK_MATCH_LINE_TOOL]: tool({
      description: "Match one or more statement lines to existing approved journal entries, with optional adjustment legs closing any difference. Does not mint a new entry.",
      inputSchema: matchBankLineInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").MatchBankLineInput) => runMatchBankLine(ctx, input, modelId, taskId, segment),
    }),
    [BANK_SETTLE_LINE_TOOL]: tool({
      description: "Settle a statement line against a counterparty by minting a new journal entry (allocating open items, optionally a bank charge leg). This POSTS a new entry.",
      inputSchema: settleFromBankLineInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").SettleFromBankLineInput) => runSettleFromBankLine(ctx, input, modelId, taskId, segment),
    }),
    [BANK_UNMATCH_TOOL]: tool({
      description: "Reverse an existing bank match — any pair, not only one you made.",
      inputSchema: unmatchBankMatchInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").UnmatchBankMatchInput) => runUnmatchBankMatch(ctx, input, modelId, taskId, segment),
    }),
    [BANK_COMPLETE_RECON_TOOL]: tool({
      description: "Complete a bank reconciliation for a statement, acknowledging any lines that will stay outstanding.",
      inputSchema: completeBankReconciliationInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").CompleteBankReconciliationInput) => runCompleteBankReconciliation(ctx, input, modelId, taskId, segment),
    }),
    [BANK_VOID_RECON_TOOL]: tool({
      description: "Void a completed bank reconciliation — any one, not only one you completed.",
      inputSchema: voidBankReconciliationInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").VoidBankReconciliationInput) => runVoidBankReconciliation(ctx, input, modelId, taskId, segment),
    }),
    [BANK_RESOLVE_EXCEPTION_TOOL]: tool({
      description: "Resolve an open bank line exception with a named disposition (may include a write-off).",
      inputSchema: resolveBankLineExceptionInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").ResolveBankLineExceptionInput) => runResolveBankLineException(ctx, input, modelId, taskId, segment),
    }),
    [BANK_PROPOSE_EXCEPTION_TOOL]: tool({
      description: "Flag a bank line as needing a person's decision — an exception a human reviews, never an autonomous resolution.",
      inputSchema: proposeBankLineExceptionInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").ProposeBankLineExceptionInput) => runProposeBankLineException(ctx, input, modelId, taskId, segment),
    }),
    [BANK_VOID_STATEMENT_TOOL]: tool({
      description: "Void a bank statement — any one, not only one you entered.",
      inputSchema: voidBankStatementInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").VoidBankStatementInput) => runVoidBankStatement(ctx, input, modelId, taskId, segment),
    }),
    [BANK_PROPOSE_PROMOTION_TOOL]: tool({
      description: "Propose promoting a learned payer identifier onto a counterparty — a structured proposal a person confirms in one click, never an autonomous identity write.",
      inputSchema: proposeBankIdentifierPromotionInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").ProposeBankIdentifierPromotionInput) => runProposeBankIdentifierPromotion(ctx, input, modelId, taskId, segment),
    }),
    [BANK_RESOLVE_AND_BOOK_TOOL]: tool({
      description: "Resolve a bank line exception AND book a new entry in one act (e.g. a corrective line). This POSTS a new entry.",
      inputSchema: resolveAndBookBankLineInputSchema,
      execute: (input: import("./chatTurn.v14.bankSchemas.js").ResolveAndBookBankLineInput) => runResolveAndBookBankLine(ctx, input, modelId, taskId, segment),
    }),
  };
}
