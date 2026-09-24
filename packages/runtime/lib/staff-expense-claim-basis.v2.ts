// #931 — THE STAFF-EXPENSE-CLAIM CARRIER'S SUCCESSOR: one claim, several advances.
//
// WHY A NEW FILE. `lib/staff-expense-claim-basis.ts` entered the frozen closure when
// `chatTurn.v20.tools.ts` imported it, so the widening ships beside it rather than inside it. Only
// the `advance_application` arm moves: `reimbursementClaimInputSchema`,
// `alreadySettledClaimInputSchema`, `claimantInputSchema`, `claimItemInputSchema` and every helper
// are REACHED FROM THE FROZEN MODULE BY REFERENCE, so there is one claimant rule on this estate
// and not two.
//
// THE REGISTER REFUSES A SILENT FIFO. That is the sentence the whole entry hangs on: migration
// 0301 records the list that was CONFIRMED, and a tool that picked a split on its own would be
// making a decision about whose money is discharged first. So the list is the human's, the tool
// can PROPOSE one (oldest advance first, each taking what it still has outstanding), and a split
// of two or more lines is refused locally until a person has said yes.
//
// NO OBJECT SPREAD ANYWHERE IN THIS FILE — the predecessor's own rule, for the same reason
// (`check-parts-parity.mjs` refuses an unclassifiable spread in any module it walks).

import { z } from "zod";
import {
  advanceApplicationClaimInputSchema,
  alreadySettledClaimInputSchema,
  claimFromInput,
  claimTotalCents,
  localClaimRefusal,
  reimbursementClaimInputSchema,
  type ClaimRefusal,
} from "./staff-expense-claim-basis.js";

export {
  CLAIM_SETTLEMENTS,
  CLAIM_SOURCE_KINDS,
  START_STAFF_EXPENSE_CLAIM_WORK_TOOL,
  advanceApplicationClaimInputSchema,
  alreadySettledClaimInputSchema,
  basisFromClaim,
  claimFromInput,
  claimItemInputSchema,
  claimTotalCents,
  claimantInputSchema,
  isPendingItem,
  localClaimRefusal,
  reimbursementClaimInputSchema,
  settlementAccountCode,
  settlementFieldPath,
} from "./staff-expense-claim-basis.js";
export type {
  ClaimItemInput,
  ClaimRefusal,
  ClaimSettlement,
  StartStaffExpenseClaimWorkInput,
} from "./staff-expense-claim-basis.js";

/** The account-code shape, restated because the frozen module keeps it private. It is the SAME
 *  three constraints — a trimmed string of one to sixty-four characters — and a cell compares the
 *  two arms' `advance_account_code` to prove the restatement did not drift. */
const accountCode = z.string().trim().min(1).max(64);

/**
 * ONE LINE OF THE SPLIT: which advance, how many sen, and optionally an account of its own.
 *
 * There is no `order` key and no `priority` key. The order the human confirmed IS the array's
 * order, and the door reads it that way.
 */
export const claimAllocationInputSchema = z
  .object({
    advance_id: z
      .string()
      .uuid()
      .describe("WHICH advance this line discharges. There is no silent FIFO in this register."),
    amount_cents: z
      .number()
      .int()
      .positive()
      .describe("How many sen of the claim come off THIS advance. Integer cents: RM 128.50 is 12850."),
    account_code: accountCode
      .optional()
      .describe(
        "Only when this advance sits on a DIFFERENT enrolled account from the claim's own "
        + "advance_account_code. Leave it out otherwise.",
      ),
  })
  .strict();

export type ClaimAllocationInput = z.infer<typeof claimAllocationInputSchema>;

/**
 * THE ONE ARM THAT MOVES. `advance_id` becomes OPTIONAL (a split may name no primary) and two keys
 * arrive: the list, and the confirmation flag that is never put on the wire.
 *
 * Every other key is the frozen arm's own, taken from its shape rather than re-typed.
 */
export const advanceApplicationClaimInputSchemaV2 = z
  .object({
    settlement: advanceApplicationClaimInputSchema.shape.settlement,
    claimant: advanceApplicationClaimInputSchema.shape.claimant,
    source_kind: advanceApplicationClaimInputSchema.shape.source_kind,
    instruction: advanceApplicationClaimInputSchema.shape.instruction,
    incurred_date: advanceApplicationClaimInputSchema.shape.incurred_date,
    posting_date: advanceApplicationClaimInputSchema.shape.posting_date,
    items: advanceApplicationClaimInputSchema.shape.items,
    corrects_claim_id: advanceApplicationClaimInputSchema.shape.corrects_claim_id,
    advance_account_code: accountCode.describe(
      "The enrolled staff-advance account this claim discharges — the FIRST allocation's account.",
    ),
    advance_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "WHICH advance it discharges, when there is exactly one. Give this OR advance_allocations.",
      ),
    advance_allocations: z
      .array(claimAllocationInputSchema)
      .min(1)
      .optional()
      .describe(
        "The advances this ONE claim discharges and how many sen come off each, in the order the "
        + "human confirmed. They must add up to the claim exactly. Use it when the human names more "
        + "than one advance; for a single advance, advance_id alone is the same claim.",
      ),
    allocations_confirmed: z
      .boolean()
      .optional()
      .describe(
        "true only after the human has confirmed the split you read back to them. Never set it on "
        + "your own initiative.",
      ),
  })
  .strict();

export const startStaffExpenseClaimWorkInputSchemaV2 = z.discriminatedUnion("settlement", [
  reimbursementClaimInputSchema,
  advanceApplicationClaimInputSchemaV2,
  alreadySettledClaimInputSchema,
]);

export type AdvanceApplicationClaimInputV2 = z.infer<typeof advanceApplicationClaimInputSchemaV2>;
export type StartStaffExpenseClaimWorkInputV2 = z.infer<typeof startStaffExpenseClaimWorkInputSchemaV2>;

/** The v1 view of a v2 claim: the only thing the frozen helpers cannot read is the list, and none
 *  of them looks at it. `advance_id` may be absent on a split, which every frozen helper that
 *  reads it treats as "not stated" — and `settlementAccountCode` reads `advance_account_code`,
 *  which is required on both arms. */
type ClaimLike = Parameters<typeof claimFromInput>[0];

function allocationsOf(input: StartStaffExpenseClaimWorkInputV2): ClaimAllocationInput[] | null {
  if (input.settlement !== "advance_application") return null;
  return input.advance_allocations === undefined ? null : input.advance_allocations;
}

/**
 * `p_claim`, with the list on it and the FLAG OFF IT.
 *
 * `allocations_confirmed` is TOOL-LOCAL and never goes on the wire: the door judges the list, not
 * the conversation that produced it. `advance_id` falls back to the first allocation's, which is
 * what makes a one-line split byte-identical to the `advance_id`-only claim 0221 already admits.
 */
export function claimFromInputV2(input: StartStaffExpenseClaimWorkInputV2): Record<string, unknown> {
  const out = claimFromInput(input as ClaimLike);
  const allocations = allocationsOf(input);
  if (allocations === null) return out;
  const lines: Array<Record<string, unknown>> = [];
  for (const line of allocations) {
    const one: Record<string, unknown> = { advance_id: line.advance_id, amount_cents: line.amount_cents };
    if (line.account_code !== undefined) one.account_code = line.account_code.trim();
    lines.push(one);
  }
  out.advance_allocations = lines;
  if (input.settlement === "advance_application") {
    out.advance_id = input.advance_id ?? allocations[0].advance_id;
  }
  return out;
}

/** The refusal shape the frozen mirror uses, built here for the three new reasons. `refuse` is
 *  private in the predecessor, so this is its restatement — same code, same keys, same order. */
function refuseV2(
  reason: string,
  field: string,
  message: string,
  fix: string,
  extra: Record<string, unknown>,
): ClaimRefusal {
  const details: Record<string, unknown> = { field };
  for (const [key, value] of Object.entries(extra)) details[key] = value;
  return { ok: false, code: "CLR10", reason, fix, message, details };
}

/** RM 128.50 from 12850 — a display figure for a refusal sentence, never a figure on the wire. */
function ringgit(cents: number): string {
  const whole = Math.trunc(Math.abs(cents) / 100);
  const sen = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}RM ${whole.toLocaleString("en-MY")}.${sen}`;
}

/**
 * THE FROZEN MIRROR, PLUS THE THREE 0301 ADDS — and the frozen one runs FIRST, so nothing it used
 * to refuse becomes admissible because a list arrived.
 *
 * Each of the three names the same `field` path the door does, so the tool and the door never send
 * a person to two different controls. The indices are 1-BASED on the wire
 * (`claim.advance_allocations[N].advance_id`), which is the spelling both `toWireField` and
 * `apps/web`'s `fieldForClaimPath` are pinned on.
 */
export function localClaimRefusalV2(input: StartStaffExpenseClaimWorkInputV2): ClaimRefusal | null {
  const inherited = localClaimRefusal(input as ClaimLike);
  if (inherited) return inherited;
  const allocations = allocationsOf(input);
  if (allocations === null) return null;

  // ONE LINE PER ADVANCE. Two lines naming one advance is not "add them up for me": which of the
  // two the person meant is a fact only they hold.
  const seen = new Set<string>();
  for (const [index, line] of allocations.entries()) {
    if (seen.has(line.advance_id)) {
      return refuseV2(
        "advance_allocation_mismatch",
        `claim.advance_allocations[${index + 1}].advance_id`,
        "This claim names the same advance twice.",
        "One line per advance. Add the two amounts together on a single line.",
        { constraint: "distinct", advance_id: line.advance_id },
      );
    }
    seen.add(line.advance_id);
  }

  // THE LINES ARE THE CLAIM. A split that does not add up is not a rounding question: it is either
  // a line the person has not stated or an amount they have mistyped, and only they know which.
  const total = claimTotalCents(input as ClaimLike);
  let allocated = 0;
  for (const line of allocations) allocated += line.amount_cents;
  if (allocated !== total) {
    return refuseV2(
      "advance_allocation_mismatch",
      "claim.advance_allocations",
      `These advances come to ${ringgit(allocated)}; the claim is ${ringgit(total)}.`,
      "The amounts on these advances must add up to the claim. Ask which line should change.",
      {
        constraint: "exact_sum",
        total_cents: total,
        allocated_cents: allocated,
        difference_cents: total - allocated,
      },
    );
  }

  // AND A SPLIT IS A PERSON'S DECISION. One advance is not a split and needs no confirmation;
  // two or more do, and the refusal hands the model the exact list to read back.
  if (allocations.length > 1 && input.settlement === "advance_application"
      && input.allocations_confirmed !== true) {
    const proposed: Array<Record<string, unknown>> = [];
    for (const line of allocations) {
      proposed.push({ advance_id: line.advance_id, amount_cents: line.amount_cents });
    }
    return refuseV2(
      "advance_split_unconfirmed",
      "claim.advance_allocations",
      "This claim comes off more than one advance, and nobody has confirmed the split.",
      "Read the split back to the human — which advance, how much off each — and set "
      + "allocations_confirmed once they agree.",
      { constraint: "confirmation", proposed_allocations: proposed },
    );
  }
  return null;
}

/** One outstanding advance, as `clara.staff_advance_summary` describes it. */
export type AdvanceCandidate = {
  advance_id: string;
  issue_date: string;
  outstanding_cents: number;
};

/**
 * THE PROPOSAL, AND IT IS ONLY EVER A PROPOSAL — `apps/web`'s own rule, restated here so the two
 * surfaces are a pair of mirrors the way `basisFromClaim` and `clara._claim_journal_basis` are.
 *
 * Oldest `issue_date` first, ties broken by `advance_id` so the answer is stable rather than
 * dependent on the order rows came back in; each line takes `min(outstanding, remaining)`; it
 * stops when the claim is settled.
 *
 * WHEN THE ADVANCES CANNOT COVER THE CLAIM IT NAMES EVERYTHING OUTSTANDING AND NO MORE. It never
 * invents the difference: an amount no advance carries is a figure nobody can discharge, and the
 * sum check above will then refuse the list, which is the correct place for a person to be asked.
 */
export function proposeAllocationsByDate(
  candidates: ReadonlyArray<AdvanceCandidate>,
  totalCents: number,
): Array<{ advance_id: string; amount_cents: number }> {
  const ordered = candidates
    .filter((c) => c.outstanding_cents > 0)
    .slice()
    .sort((a, b) => (a.issue_date === b.issue_date
      ? (a.advance_id < b.advance_id ? -1 : a.advance_id > b.advance_id ? 1 : 0)
      : (a.issue_date < b.issue_date ? -1 : 1)));
  const out: Array<{ advance_id: string; amount_cents: number }> = [];
  let remaining = totalCents;
  for (const candidate of ordered) {
    if (remaining <= 0) break;
    const take = Math.min(candidate.outstanding_cents, remaining);
    if (take <= 0) continue;
    out.push({ advance_id: candidate.advance_id, amount_cents: take });
    remaining -= take;
  }
  return out;
}
