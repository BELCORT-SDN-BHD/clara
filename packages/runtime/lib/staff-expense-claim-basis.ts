// #638 — THE TYPED PARTICULARS OF A STAFF EXPENSE CLAIM, as a schema and a pair of builders.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. The chat tool `start_staff_expense_claim_work` ships in
// ONE shared `chatTurn_v20` (it carries #652's and #653's tools too), and a frozen workflow version
// is expensive to mint twice. So everything that tool needs which is NOT the frozen tool body lives
// here, in non-frozen infrastructure, tested on its own: the discriminated-union zod schema for the
// three settlement shapes, the `p_claim` builder, the derivation of the journal the claim implies,
// and the shape refusals a model can act on without a database round trip. The successor's job is
// then four lines (see WHAT THE SUCCESSOR MUST WIRE, at the foot of this file).
//
// IT IS THE `periodic-adjustment-basis.ts` PATTERN, RESTATED — which is itself
// `chatTurn.v18.tools.ts`'s `basisFromInput` / `localBasisRefusal` extracted so the frozen file can
// be small.
//
// **THIS MODULE IS NON-FROZEN ONLY UNTIL THE SHARED SUCCESSOR IMPORTS IT.**
// `scripts/check-frozen-workflows.mjs` freezes the transitive relative-import closure of every
// frozen workflow, so the moment `chatTurn.v20.tools.ts` imports this file, every byte below is
// hash-locked in `frozen-workflows.json` — exactly what happened to
// `lib/periodic-adjustment-basis.ts` when v19 imported it. A change to a rule here after that
// point is a change to a deployed body: it ships as a NEW module beside this one, wired by a NEW
// chatTurn version.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. `clara._assert_claim_basis` (migration 0206) re-checks
// every rule below at admission — the payload half before anything durable, the world half after
// the replay branch — against the client's live chart, the live staff-advance register and the live
// advance outstanding. Nothing here is a rule of its own: every check is a MIRROR of one the
// database enforces, so a preparer or a model sees the mistake beside the thing that caused it
// instead of as a refusal a round trip later.
//
// AND NOTHING HERE INVENTS A FACT. #638's first acceptance line is explicit: "do not invent payroll
// documents or missing dates." The ONE arithmetic this module does is adding the itemised amounts
// up, and it is derived only so the claim total and the settlement leg agree to the cent.
//
// TAX FACTS ARE CARRIED, NEVER VALIDATED. There is no `tax_code` vocabulary in this estate,
// `0150:525` calls the statutory tag a hint and `docs/PRD.md:124` defers tax; AC1 asks only that
// supplied tax facts be carried. `supplied_tax` is therefore an opaque passthrough object.

import { z } from "zod";

export const START_STAFF_EXPENSE_CLAIM_WORK_TOOL = "start_staff_expense_claim_work";

/** The three ways a claim is settled. `clara.staff_expense_claims.settlement`'s own CHECK. */
export const CLAIM_SETTLEMENTS = ["reimbursement", "advance_application", "already_settled"] as const;
export type ClaimSettlement = (typeof CLAIM_SETTLEMENTS)[number];

/** Where the claim came from. `clara.staff_expense_claims.source_kind`'s own CHECK. */
export const CLAIM_SOURCE_KINDS = ["document", "instruction"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one — never invent it.");

const accountCode = z.string().trim().min(1).max(64);

/**
 * THE CLAIMANT IS AN ENROLMENT HANDLE, NOT A PERSON RECORD (D4). Either an existing live
 * `clara.staff_advance_accounts` enrolment, or the account dedicated to that person plus what the
 * register needs to enrol them: the name it will carry, a written attestation, and the explicit
 * confirmation that the account is dedicated to one person.
 *
 * `.strict()` throughout, so a model that invents a `name` or an `employee_id` field is refused by
 * the schema rather than having its extra key silently dropped into a durable record.
 */
export const claimantInputSchema = z
  .object({
    enrolment_id: z
      .string()
      .uuid()
      .optional()
      .describe("The existing staff-advance enrolment this person already has. Prefer it when you know it."),
    account_code: accountCode
      .optional()
      .describe("The account dedicated to this person. Required when they have no enrolment yet."),
    person_label: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("The name the register will carry. Required when enrolling someone new."),
    attestation: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .optional()
      .describe(
        "Required when enrolling someone new: who this account is for, and whether the balance is "
        + "a related-party balance. It is stored verbatim and shown beside the balance forever.",
      ),
    confirm_dedicated: z
      .boolean()
      .optional()
      .describe("Required true when enrolling someone new: this account is dedicated to ONE person."),
    identifier: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe("The firm's own identifier for this person, if they gave you one. Carried, never parsed."),
  })
  .strict();

/**
 * ONE ITEMISED LINE. Either a complete one (an expense account and a positive amount) or a PENDING
 * one, which names the fact it is still waiting for and carries NO amount: AC3's per-item
 * continuation, designed inside one claim. A pending item posts nothing and contributes nothing to
 * the total; the claim's status ledger records which item is waiting and why.
 */
export const claimItemInputSchema = z
  .object({
    description: z.string().trim().min(1).max(2000).describe("What was bought, in the claimant's own words."),
    expense_account_code: accountCode
      .optional()
      .describe("The client's expense account this item codes to. Required unless the item is pending."),
    amount_cents: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Integer cents. Required unless the item is pending; never a decimal ringgit figure."),
    supplied_tax: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "Tax facts exactly as the source states them. CARRIED, never validated: this beta has no "
        + "tax vocabulary and does not derive a treatment from them.",
      ),
    incurred_date: isoDate.optional().describe("This item's own date, when it differs from the claim's."),
    pending_fact: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .optional()
      .describe(
        "The NAME of the fact this item is still waiting for (for example `incurred_date`). Use it "
        + "instead of guessing; the other items post and this one waits, visibly.",
      ),
  })
  .strict();

const sharedShape = {
  claimant: claimantInputSchema,
  source_kind: z.enum(CLAIM_SOURCE_KINDS).describe("Where the claim came from."),
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe("What the human asked for, in their own terms. This is the basis on the record."),
  incurred_date: isoDate.describe("When the money was spent."),
  posting_date: isoDate.describe("When the books should say so. Never earlier than the incurred date."),
  items: z.array(claimItemInputSchema).min(1).describe("One element per line the claimant itemised."),
  /** The claim this one CORRECTS. A correction follows a reversal: `clara.reverse_entry` first. */
  corrects_claim_id: z.string().uuid().optional(),
};

export const reimbursementClaimInputSchema = z
  .object({
    settlement: z.literal("reimbursement"),
    ...sharedShape,
    payable_account_code: accountCode.describe(
      "The NON-CONTROL liability the firm owes the claimant on (the starter chart's `2010 Other "
      + "Payables`). A control account is refused: an employee is never a counterparty.",
    ),
  })
  .strict();

export const advanceApplicationClaimInputSchema = z
  .object({
    settlement: z.literal("advance_application"),
    ...sharedShape,
    advance_account_code: accountCode.describe("The enrolled staff-advance account this claim discharges."),
    advance_id: z
      .string()
      .uuid()
      .describe(
        "WHICH advance it discharges. There is no silent FIFO in this register: ask the human if "
        + "two are outstanding.",
      ),
  })
  .strict();

export const alreadySettledClaimInputSchema = z
  .object({
    settlement: z.literal("already_settled"),
    ...sharedShape,
    payment_account_code: accountCode.describe(
      "The bank or cash account the claimant was already paid from. `already_settled` is NOT "
      + "'no journal': the expense debits land against this account.",
    ),
  })
  .strict();

export const startStaffExpenseClaimWorkInputSchema = z.discriminatedUnion("settlement", [
  reimbursementClaimInputSchema,
  advanceApplicationClaimInputSchema,
  alreadySettledClaimInputSchema,
]);

export type ReimbursementClaimInput = z.infer<typeof reimbursementClaimInputSchema>;
export type AdvanceApplicationClaimInput = z.infer<typeof advanceApplicationClaimInputSchema>;
export type AlreadySettledClaimInput = z.infer<typeof alreadySettledClaimInputSchema>;
export type StartStaffExpenseClaimWorkInput = z.infer<typeof startStaffExpenseClaimWorkInputSchema>;
export type ClaimItemInput = z.infer<typeof claimItemInputSchema>;

export type ClaimRefusal = {
  ok: false;
  code: string;
  reason: string;
  fix: string;
  message: string;
  details: Record<string, unknown>;
};

function refuse(
  reason: string,
  field: string,
  message: string,
  fix: string,
  extra: Record<string, unknown> = {},
): ClaimRefusal {
  return {
    ok: false,
    code: reason === "write_into_closed_period" ? "CLR19" : "CLR10",
    reason,
    fix,
    message,
    details: { field, ...extra },
  };
}

/** An item that is waiting on a fact posts nothing and counts nothing. */
export function isPendingItem(item: ClaimItemInput): boolean {
  return typeof item.pending_fact === "string" && item.pending_fact.trim() !== "";
}

/** The claim's exact total in minor units: the non-pending items, added up. ONE reader, so the
 *  stored `amount_cents`, the derived credit leg and the sum check can never disagree. */
export function claimTotalCents(input: StartStaffExpenseClaimWorkInput): number {
  return input.items
    .filter((i) => !isPendingItem(i))
    .reduce((n, i) => n + (typeof i.amount_cents === "number" ? i.amount_cents : 0), 0);
}

/** The ONE account the settlement credits. */
export function settlementAccountCode(input: StartStaffExpenseClaimWorkInput): string {
  if (input.settlement === "reimbursement") return input.payable_account_code.trim();
  if (input.settlement === "advance_application") return input.advance_account_code.trim();
  return input.payment_account_code.trim();
}

/** The wire path of the settlement account, so a refusal lands on the control that holds it. */
export function settlementFieldPath(settlement: ClaimSettlement): string {
  if (settlement === "reimbursement") return "claim.payable_account_code";
  if (settlement === "advance_application") return "claim.advance_account_code";
  return "claim.payment_account_code";
}

/**
 * Every shape refusal a model can act on WITHOUT a database round trip, in the DATABASE's own
 * `field` vocabulary (`claim.<key>`, migration 0206's own spelling) so ONE mapper serves both halves
 * of the validation. The database re-checks all of these and is the authority.
 *
 * WHAT IS DELIBERATELY ABSENT. The four world facts this module cannot know and must not guess:
 * whether the claimant's enrolment is live, whether an item account is an active EXPENSE account of
 * this client, whether the settlement leg is a control account, and whether the named advance can
 * carry the allocation. All four are the database's (`clara._assert_claim_basis`'s world half), and
 * a local approximation of any of them would refuse a claim the estate would have admitted.
 */
export function localClaimRefusal(input: StartStaffExpenseClaimWorkInput): ClaimRefusal | null {
  const claimant = input.claimant;
  if (claimant.enrolment_id === undefined && claimant.account_code === undefined) {
    return refuse("claimant_missing", "claim.claimant",
      "This claim does not say who claimed.",
      "Ask whose claim it is, and which account the firm keeps for them.", { constraint: "present" });
  }
  if (claimant.enrolment_id === undefined) {
    // Enrolling someone new: ask for the three things 0043's register requires, BY NAME, before
    // admission — #721's rule. A Work admitted without them could not be repaired by a later
    // question, because the enrolment happens inside the admission transaction.
    if (claimant.person_label === undefined) {
      return refuse("claimant_missing", "claim.claimant.person_label",
        "A new claimant needs the name the register will carry.",
        "Ask for the person's full name as the firm records it.", { constraint: "nonempty" });
    }
    if (claimant.attestation === undefined) {
      return refuse("claimant_missing", "claim.claimant.attestation",
        "Enrolling a new claimant needs a written attestation.",
        "Ask who this account is for, and whether the balance is a related-party balance.",
        { constraint: "attestation" });
    }
    if (claimant.confirm_dedicated !== true) {
      return refuse("claimant_missing", "claim.claimant.confirm_dedicated",
        "The register's tie-out is meaningless on a mixed account.",
        "Confirm with the human that this account is dedicated to this one person.",
        { constraint: "confirm_dedicated" });
    }
  }

  if (input.incurred_date > input.posting_date) {
    return refuse("incurred_after_posting", "claim.incurred_date",
      `The expense was incurred on ${input.incurred_date} but the claim posts on ${input.posting_date}.`,
      "Money cannot be booked before it was spent; check which date belongs where.",
      { constraint: "order", incurred_date: input.incurred_date, posting_date: input.posting_date });
  }

  const live = input.items.filter((i) => !isPendingItem(i));
  for (const [index, item] of input.items.entries()) {
    const i = index;
    const path = `claim.items[${i + 1}]`;
    if (isPendingItem(item)) {
      if (item.amount_cents !== undefined) {
        return refuse("invalid_claim", `${path}.amount_cents`,
          `Item ${i + 1} is waiting on ${item.pending_fact} and may not also claim an amount.`,
          "Either give the item's own facts, or leave the amount out until they are known.",
          { constraint: "absent" });
      }
      continue;
    }
    if (item.expense_account_code === undefined) {
      return refuse("invalid_claim", `${path}.expense_account_code`,
        `Item ${i + 1} does not say which expense account it codes to.`,
        "Ask which expense account this cost belongs in.", { constraint: "nonempty" });
    }
    if (item.amount_cents === undefined) {
      return refuse("invalid_claim", `${path}.amount_cents`,
        `Item ${i + 1} does not say how much it was.`,
        "Ask for the exact amount in cents, or mark the item as waiting with `pending_fact`.",
        { constraint: "present" });
    }
    if (item.incurred_date !== undefined && item.incurred_date > input.posting_date) {
      return refuse("incurred_after_posting", `${path}.incurred_date`,
        `Item ${i + 1} was incurred on ${item.incurred_date}, after the claim posts on ${input.posting_date}.`,
        "Check which period this item belongs in.", { constraint: "order" });
    }
  }
  if (live.length === 0) {
    return refuse("claim_all_zero", "claim.items",
      "Every item on this claim is waiting on a fact; there is nothing to post.",
      "Get at least one item's account and amount before admitting the claim.", {});
  }

  const total = claimTotalCents(input);
  if (total === 0) {
    return refuse("claim_all_zero", "claim.amount_cents",
      "This claim claims nothing.",
      "Check the figures with the human; a claim of zero is not something to post.", {});
  }

  const credit = settlementAccountCode(input);
  const repeats = live.find((i) => (i.expense_account_code ?? "").trim() === credit);
  if (repeats !== undefined) {
    return refuse("invalid_claim", settlementFieldPath(input.settlement),
      `The settlement leg repeats an item's own account (${credit}).`,
      "Name the settlement account separately from every expense account.",
      { constraint: "distinct", account_code: credit });
  }
  return null;
}

/**
 * The `p_claim` argument of `clara.admit_staff_expense_claim_work`, in the DATABASE's own field
 * spelling.
 *
 * `amount_cents` is DERIVED from the non-pending items rather than taken from the caller, because
 * the database refuses a claim whose items do not sum to it (`items_do_not_sum`) and there is
 * exactly one honest value. Every other value is the caller's.
 */
export function claimFromInput(input: StartStaffExpenseClaimWorkInput): Record<string, unknown> {
  const claimant: Record<string, unknown> = {};
  if (input.claimant.enrolment_id !== undefined) claimant.enrolment_id = input.claimant.enrolment_id;
  if (input.claimant.account_code !== undefined) claimant.account_code = input.claimant.account_code.trim();
  if (input.claimant.person_label !== undefined) claimant.person_label = input.claimant.person_label.trim();
  if (input.claimant.attestation !== undefined) claimant.attestation = input.claimant.attestation.trim();
  if (input.claimant.confirm_dedicated !== undefined) claimant.confirm_dedicated = input.claimant.confirm_dedicated;
  if (input.claimant.identifier !== undefined) claimant.identifier = input.claimant.identifier.trim();

  const out: Record<string, unknown> = {
    claimant,
    source_kind: input.source_kind,
    instruction: input.instruction.trim(),
    incurred_date: input.incurred_date,
    posting_date: input.posting_date,
    items: input.items.map((item) => {
      const one: Record<string, unknown> = { description: item.description.trim() };
      if (item.expense_account_code !== undefined) one.expense_account_code = item.expense_account_code.trim();
      if (item.amount_cents !== undefined) one.amount_cents = item.amount_cents;
      if (item.supplied_tax !== undefined) one.supplied_tax = item.supplied_tax;
      if (item.incurred_date !== undefined) one.incurred_date = item.incurred_date;
      if (item.pending_fact !== undefined) one.pending_fact = item.pending_fact.trim();
      return one;
    }),
    amount_cents: claimTotalCents(input),
    currency: "MYR",
    settlement: input.settlement,
  };
  if (input.settlement === "reimbursement") out.payable_account_code = input.payable_account_code.trim();
  if (input.settlement === "advance_application") {
    out.advance_account_code = input.advance_account_code.trim();
    out.advance_id = input.advance_id;
  }
  if (input.settlement === "already_settled") out.payment_account_code = input.payment_account_code.trim();
  if (input.corrects_claim_id !== undefined) out.corrects_claim_id = input.corrects_claim_id;
  return out;
}

/**
 * THE JOURNAL A CLAIM IMPLIES — the same derivation `clara._claim_journal_basis` (migration 0206)
 * performs inside the door.
 *
 * IT IS NOT SENT ANYWHERE. `clara.admit_staff_expense_claim_work` takes `p_claim` and derives the
 * basis itself, precisely so the lines can never be a second, drifting statement of the claim. This
 * function exists so a surface (or a model) can SHOW the accounting fact the particulars produce
 * before it is admitted, and so a cell can prove the two derivations agree byte for byte.
 *
 * Each non-pending item is one expense DEBIT; the settlement is the ONE credit. `already_settled`
 * is not "no journal" — the expense debits land against the stated payment account.
 */
export function basisFromClaim(input: StartStaffExpenseClaimWorkInput): Record<string, unknown> {
  const lines: Array<Record<string, unknown>> = input.items
    .filter((i) => !isPendingItem(i))
    .map((item) => ({
      account_code: (item.expense_account_code ?? "").trim(),
      debit_cents: item.amount_cents ?? 0,
      credit_cents: 0,
      description: item.description.trim().slice(0, 2000),
    }));
  lines.push({
    account_code: settlementAccountCode(input),
    debit_cents: 0,
    credit_cents: claimTotalCents(input),
    description: input.settlement,
  });
  return {
    posting_date: input.posting_date,
    memo: input.instruction.trim().slice(0, 4000),
    currency: "MYR",
    lines,
  };
}

// ---------------------------------------------------------------------------------------------
// WHAT THE SHARED SUCCESSOR (`chatTurn_v20`) MUST WIRE, and nothing more.
//
//   1. `tool({ inputSchema: startStaffExpenseClaimWorkInputSchema, execute })` under the name
//      `START_STAFF_EXPENSE_CLAIM_WORK_TOOL`, registered beside `start_journal_work` and
//      `start_periodic_adjustment_work` (both stay exactly as v19 has them).
//   2. In `execute`: the client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localClaimRefusal(input); if (local) return local;`.
//   3. `const intentKey = stableOpKey(ctx.taskId, START_STAFF_EXPENSE_CLAIM_WORK_TOOL, input);`
//      — the SAME identity discipline `start_journal_work` uses, so a re-run turn resolves to the
//      Work it already admitted instead of admitting a second one.
//   4. ONE query, with the chat lane's own source ref and basis origin:
//
//        select clara.admit_staff_expense_claim_work(
//          $1::uuid,   -- ctx.clientId
//          $2::uuid,   -- ctx.createdBy
//          $3::text,   -- intentKey
//          $4::jsonb,  -- claimFromInput(input)
//          $5::text,   -- 'clara_interpreted'
//          $6::jsonb,  -- [{ kind: 'chat_task', task_id: ctx.taskId, session_id: <from the task> }]
//          $7::text    -- modelId
//        ) as r
//
//      Note the argument ORDER: the door takes `p_claim` and DERIVES the journal basis itself, so
//      there is no `p_basis` argument. `basisFromClaim` above is for showing the human, never for
//      the wire.
//   5. The SAME result mapping `runStartJournalWork` already has: a `WorkAcceptedPart` on success,
//      and the database's typed `(code, detail.reason)` handed back on a refusal. The answer carries
//      `claim_id` beside `work_id`/`task_id`/`logical_op_id`/`status`/`replayed`.
//
// **NO `WORK_ACCEPTED_PURPOSES` WIDENING IS REQUIRED**, and this is the one thing the 2026-09-15
// amendment made cheaper for v20. `chatTurn.v19.parts.ts:91`'s frozen
// `WORK_ACCEPTED_PURPOSES_V19 = ["journal_entry","periodic_stock_adjustment","payroll_obligation"]`
// already names a claim Work: the purpose of a staff expense claim IS `journal_entry`, by design
// (see migration 0206's header — a fourth purpose cannot post without recutting the posting core).
// The chat `work_accepted` part therefore needs no change at all, and `p6-1-parts-parity.test.mjs`
// stays green.
//
// WHAT THE SUCCESSOR MUST NOT DO: mint a new claraWork bundle. A staff-expense-claim Work runs
// through the EXISTING frozen claraWork v3 body byte for byte — `claraWork.v3.impl.ts:330` reads
// `basis` off the Work row and nothing else, and the typed claim lives in
// `clara.staff_expense_claims`, which the run never reads and never echoes.
// ---------------------------------------------------------------------------------------------
