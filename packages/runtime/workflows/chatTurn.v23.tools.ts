// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE TOOL MAP.
//
// `buildToolsV23` calls v22's `buildToolsV22(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// SEVEN tools — the seven `chatTurn.v22`'s own roster cell asserts absent BY NAME, "and that is a
// ruling". Nothing v22 could do stops being possible, nothing it did changes, and this cut
// REPLACES no existing name.
//
// EVERY TOOL NAME COMES FROM THE MODULE THAT DECLARES ITS STRING LITERAL, never through one that
// merely re-exports it. `check-parts-parity.mjs` resolves a computed key by dereferencing the
// identifier through its import chain and refuses a chain whose next hop is a RE-EXPORT rather
// than a binding. v22's header records that this rule has been paid for three times already; the
// two imports below are direct for that reason.
//
// THE DESCRIPTIONS ARE THE MODEL'S ONLY MAP OF THE LANE, so each one says what the tool will NOT
// do as plainly as what it will — the candidate it does not pick, the sentence it does not
// reword, the account it does not choose. `chatTurn.v23.prompt.ts` carries the long form.

import { tool } from "ai";
import { buildToolsV22 } from "./chatTurn.v22.tools.js";
import { type ToolCtx } from "./chatTurn.v15.infra.js";
import {
  READ_AGREEMENT_TERMS_TOOL,
  READ_PAYROLL_POSTING_STATE_TOOL,
  READ_PAYROLL_SETTLEMENT_STATE_TOOL,
  readAgreementTermsInputSchema,
  readPayrollPostingStateInputSchema,
  readPayrollSettlementStateInputSchema,
  runReadAgreementTerms,
  runReadPayrollPostingState,
  runReadPayrollSettlementState,
  type ReadAgreementTermsInput,
  type ReadPayrollPostingStateInput,
  type ReadPayrollSettlementStateInput,
} from "./chatTurn.v23.reads.js";
import {
  CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL,
  CONFIRM_TENANCY_RENT_PLAN_TOOL,
  READ_RENT_SETTLEMENT_CANDIDATES_TOOL,
  READ_TENANCY_TERMS_TOOL,
  confirmTenancyRentPlanInputSchema,
  confirmTenancyRentPlanRevisionInputSchema,
  readRentSettlementCandidatesInputSchema,
  readTenancyTermsInputSchema,
  runConfirmTenancyRentPlan,
  runConfirmTenancyRentPlanRevision,
  runReadRentSettlementCandidates,
  runReadTenancyTerms,
  type ConfirmTenancyRentPlanInput,
  type ConfirmTenancyRentPlanRevisionInput,
  type ReadRentSettlementCandidatesInput,
  type ReadTenancyTermsInput,
} from "./chatTurn.v23.tenancy.js";

export type { ToolRefusalV23 } from "./chatTurn.v23.refusals.js";

export function buildToolsV23(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV22(ctx, modelId, segment), {
    [READ_PAYROLL_POSTING_STATE_TOOL]: tool({
      description:
        "Say why a PAYROLL SUMMARY did or did not post. A summary that has been read posts itself "
        + "when every condition holds; when one fails, nothing is posted and a row appears under "
        + "Needs you carrying the database's own sentence for the condition that failed. Report "
        + "that sentence VERBATIM — rewording it would put a reason on screen nobody decided. You "
        + "never offer to post it anyway: there is no such door, by design. If the block is a "
        + "DUPLICATE, name the entry it points at and say the person decides whether this payslip "
        + "is a correction or a re-upload.",
      inputSchema: readPayrollPostingStateInputSchema,
      execute: (input: ReadPayrollPostingStateInput) => runReadPayrollPostingState(ctx, input),
    }),
    [READ_PAYROLL_SETTLEMENT_STATE_TOOL]: tool({
      description:
        "Say whether a posted PAYROLL RUN's net pay has left the bank, and which bank lines are "
        + "offered for it. Name the client; name a payroll summary only to narrow to that one "
        + "run. Report exactly what comes back: the month, the amount still owed, and EVERY "
        + "candidate line — never picking one for the person, even when only one exists. You "
        + "never accept a candidate here: acceptance happens on the bank surface or in Needs you, "
        + "where a person can see every candidate side by side.",
      inputSchema: readPayrollSettlementStateInputSchema,
      execute: (input: ReadPayrollSettlementStateInput) => runReadPayrollSettlementState(ctx, input),
    }),
    [READ_AGREEMENT_TERMS_TOOL]: tool({
      description:
        "Read back what a filed AGREEMENT CONTRACT says, as the lane banked it: the eleven terms "
        + "it recorded, each as the page printed it. A term the page did not print is recorded as "
        + "NOT PRINTED, which is not zero. Never add two terms together, and never say what kind "
        + "of agreement it is from anything but the agreement_class the record carries — a "
        + "deterministic evaluator decided that from the words the page uses for itself. If the "
        + "acquisition did not post, the queue row carries the one sentence saying why; give that "
        + "sentence and do not compose your own.",
      inputSchema: readAgreementTermsInputSchema,
      execute: (input: ReadAgreementTermsInput) => runReadAgreementTerms(ctx, input),
    }),
    [READ_TENANCY_TERMS_TOOL]: tool({
      description:
        "Read what a TENANCY records: its five terms, each with how it came to be what it is "
        + "(read from the page, derived by a stated rule, or stated by a person), the treatment "
        + "branch the standard asks for, and the plan it would draft. You name only the document. "
        + "Say which way each term was established and never present a derivation as something "
        + "the page printed. When nothing is recorded yet, the answer also says what Clara CAN "
        + "read off the banked reading — that is a proposal, not a record, and recording terms is "
        + "a person's act on the Contract page.",
      inputSchema: readTenancyTermsInputSchema,
      execute: (input: ReadTenancyTermsInput) => runReadTenancyTerms(ctx, input),
    }),
    [READ_RENT_SETTLEMENT_CANDIDATES_TOOL]: tool({
      description:
        "Say which months of RENT are still waiting on their payment, with every candidate bank "
        + "line offered for each, and what the deposits coding offers beside them. Offer every "
        + "candidate and choose none: two lines of the same amount in one window are two lines a "
        + "person adjudicates. Never say a rent has been paid because a plan posted it — the plan "
        + "recognises the expense, the bank line moves the money. A deposit is never drafted from "
        + "the agreement: signing states a term, it does not say the money moved.",
      inputSchema: readRentSettlementCandidatesInputSchema,
      execute: (input: ReadRentSettlementCandidatesInput) => runReadRentSettlementCandidates(ctx, input),
    }),
    [CONFIRM_TENANCY_RENT_PLAN_TOOL]: tool({
      description:
        "Confirm a TENANCY's recurring rent plan, as the person you are working for. A plan never "
        + "starts because you read a contract: it starts because a person said so, in this "
        + "conversation, in words, about this tenancy. State the rent, the term and the accounts "
        + "first, and say which standard admits the treatment. If the branch ASKS for a "
        + "professional judgement you may not supply one — give the question it carries and pass "
        + "the accountant's own written treatment through unchanged. Leave an account null to take "
        + "the draft's own; never choose a payable account yourself after the door refuses one, "
        + "because a plan that credits the bank counts the rent twice. The act is recorded as "
        + "theirs, not yours.",
      inputSchema: confirmTenancyRentPlanInputSchema,
      execute: (input: ConfirmTenancyRentPlanInput) => runConfirmTenancyRentPlan(ctx, input),
    }),
    [CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL]: tool({
      description:
        "Record a confirmed rent plan's ESCALATION as a revision, as the person you are working "
        + "for. Say what the plan charges today, what it would charge and from when, and why the "
        + "standard asks: a stepped rent's monthly expense differs from the month's cash rent "
        + "unless the increases only follow expected general inflation. That is a judgement about "
        + "the term, not a figure you can read — ask for it, pass it through unchanged, and never "
        + "average anything yourself. Confirm only after they have seen both figures and said so.",
      inputSchema: confirmTenancyRentPlanRevisionInputSchema,
      execute: (input: ConfirmTenancyRentPlanRevisionInput) => runConfirmTenancyRentPlanRevision(ctx, input),
    }),
  });
}
