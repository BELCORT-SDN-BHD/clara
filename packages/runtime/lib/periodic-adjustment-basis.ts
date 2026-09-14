// #643 — THE TYPED PARTICULARS OF A PERIODIC ADJUSTMENT, as a schema and a pair of builders.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. The chat tool `start_periodic_adjustment_work` ships
// in ONE shared `chatTurn.v19` (it carries another ticket's tool too), and a frozen workflow
// version is expensive to mint twice. So everything that tool needs which is NOT the frozen tool
// body lives here, in non-frozen infrastructure, tested on its own: the discriminated-union zod
// schema for the two typed bases, the `p_adjustment` builder, the derivation of the journal lines
// those particulars imply, and the shape refusals a model can act on without a database round
// trip. v19's job is then four lines (see WHAT v19 MUST WIRE, at the foot of this file).
//
// IT IS THE `basisFromInput` PATTERN, RESTATED. `chatTurn.v18.tools.ts` keeps `basisFromInput`
// (the `clara.accounting_work.basis` jsonb in the DATABASE's own field spelling) and
// `localBasisRefusal` (the earlier, more legible half of a validation the database owns) beside
// its tool. This module is those two for the periodic-adjustment lane, extracted so the frozen
// file can be small.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. `clara._assert_adjustment_basis` and
// `clara._assert_adjustment_relationships` (migration 0194) re-check every rule below at
// admission AND again at commit, against the client's live chart, the live staff-advance register
// and the live fiscal years. Nothing here is a rule of its own: every check is a MIRROR of one
// the database enforces, so a preparer or a model sees the mistake beside the thing that caused
// it instead of as a refusal a round trip later.
//
// AND NOTHING HERE INVENTS A NUMBER. #643's boundary: "do not invent employee calculations,
// current contribution rates or missing settlement facts." The one arithmetic this module does is
// `closing_cents - opening_cents`, which is the accountant's own two figures subtracted — and it
// is derived only to be CHECKED against the movement they supplied.

import { z } from "zod";

export const START_PERIODIC_ADJUSTMENT_WORK_TOOL = "start_periodic_adjustment_work";

/** `clara.accounting_work.purpose`'s two new values (0194). `journal_entry` is deliberately NOT
 *  here: it has its own door, its own tool and no typed particulars. */
export const PERIODIC_ADJUSTMENT_PURPOSES = ["periodic_stock_adjustment", "payroll_obligation"] as const;
export type PeriodicAdjustmentPurpose = (typeof PERIODIC_ADJUSTMENT_PURPOSES)[number];

/** The two ways an accountant can state a periodic stock movement. */
export const STOCK_METHODS = ["opening_closing_count", "explicit_adjustment"] as const;

/** The obligation vocabulary. The five statutory kinds are the ones the starter chart carries an
 *  account for (0150: 2100 EPF, 2110 SOCSO, 2120 EIS, 2130 PCB (MTD), 2140 HRDF); `salary` and
 *  `other_supplied` cover everything a firm books as a payroll accrual without a statutory
 *  regulator behind it. NOTHING here implies a rate: the kind names WHAT the obligation is, and
 *  the amount is always supplied. */
export const OBLIGATION_KINDS = ["epf", "socso", "eis", "pcb_mtd", "hrdf", "salary", "other_supplied"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD. Ask the human if they did not give one.");

const accountCode = z.string().trim().min(1).max(64);

const sharedShape = {
  period_start: isoDate.describe("The first day of the period these particulars are about."),
  period_end: isoDate.describe("The last day of that period."),
  instruction: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe("What the human asked for, in their own terms. This is the basis on the record."),
  /** The adjustment this one CORRECTS, when the human is correcting a posted one. A correction
   *  follows a reversal: `clara.reverse_entry` first, then this. */
  corrects_adjustment_id: z.string().uuid().optional(),
};

export const stockAdjustmentInputSchema = z
  .object({
    purpose: z.literal("periodic_stock_adjustment"),
    ...sharedShape,
    method: z
      .enum(STOCK_METHODS)
      .describe(
        "`opening_closing_count` when the human gave you an opening and a closing figure; "
        + "`explicit_adjustment` when they gave you the movement itself.",
      ),
    opening_cents: z.number().int().min(0).optional().describe("Integer cents. Required for opening_closing_count."),
    closing_cents: z.number().int().min(0).optional().describe("Integer cents. Required for opening_closing_count."),
    adjustment_cents: z
      .number()
      .int()
      .optional()
      .describe(
        "The movement in integer cents, SIGNED: positive when stock rose, negative when it fell. "
        + "For opening_closing_count it must equal closing - opening; leave it out and it is derived.",
      ),
    counted_at: isoDate.optional().describe("The day the count was taken. It must fall inside the period."),
    count_reference: z.string().trim().min(1).max(200).optional().describe("The client's own reference for the count sheet."),
    inventory_account_code: accountCode.describe("The inventory/stock account, from this client's chart."),
    cost_account_code: accountCode.describe("The cost-of-sales / stock-movement account, from this client's chart."),
  })
  .strict();

export const payrollObligationInputSchema = z
  .object({
    purpose: z.literal("payroll_obligation"),
    ...sharedShape,
    obligation_kind: z.enum(OBLIGATION_KINDS).describe("What kind of payroll or statutory obligation this is."),
    amount_cents: z
      .number()
      .int()
      .min(0)
      .describe("The obligation in integer cents, exactly as the human supplied it. Never compute it from a rate."),
    expense_account_code: accountCode.describe("The expense account the obligation is charged to."),
    liability_account_code: accountCode.describe("The liability account it is owed on."),
    payment_account_code: accountCode.optional().describe("Only when part of it was settled in the same entry."),
    settled_cents: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Integer cents settled through payment_account_code. The liability takes the remainder."),
    // #796 — THE STAFF-ADVANCE PARTICULAR, and it is a PAIR for the same reason
    // `payment_account_code` is: 0194's `_assert_adjustment_relationships` refuses a NAMED leg the
    // entry never touches (`advance_leg`), so an account code with no amount beside it could only
    // ever be admitted into a refusal. The code is a DATABASE particular (0194 validates it is a
    // live `clara.staff_advance_accounts` enrolment — `advance_not_enrolled`); the cents are a
    // DERIVATION INPUT ONLY and never enter `p_adjustment`, exactly as `settled_cents` does not
    // (#643's adversarial N3: no server refusal can name a key 0194 has no particular for).
    advance_account_code: accountCode
      .optional()
      .describe("Only when part of the obligation is carried on an enrolled staff-advance account."),
    advance_cents: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Integer cents carried on advance_account_code. Ask the human; never derive it from a rate."),
  })
  .strict();

/** The ONE input shape `start_periodic_adjustment_work` takes. A discriminated union rather than
 *  one object with optional halves: a model handed a single flat schema fills in whichever fields
 *  it recognises, and a payroll obligation carrying an `inventory_account_code` is not a shape
 *  the database can refuse helpfully — it is a shape the tool must never produce. */
export const startPeriodicAdjustmentWorkInputSchema = z.discriminatedUnion("purpose", [
  stockAdjustmentInputSchema,
  payrollObligationInputSchema,
]);

export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>;
export type PayrollObligationInput = z.infer<typeof payrollObligationInputSchema>;
export type StartPeriodicAdjustmentWorkInput = z.infer<typeof startPeriodicAdjustmentWorkInputSchema>;

/** A shape refusal in the shape `chatTurn.v18.tools.ts`'s `localBasisRefusal` returns, so v19 can
 *  hand it straight back to the model. */
export type AdjustmentRefusal = {
  ok: false;
  code: string;
  reason: string;
  fix: string;
  message: string;
  details: Record<string, unknown>;
};

function refuse(reason: string, field: string, message: string, fix: string, extra: Record<string, unknown> = {}): AdjustmentRefusal {
  return { ok: false, code: reason === "write_into_closed_period" ? "CLR19" : "CLR10", reason, fix, message, details: { field, ...extra } };
}

/** The SIGNED movement a set of stock particulars records, in exact minor units. Derived from the
 *  count when the model left it out, and otherwise the supplied figure — `localAdjustmentRefusal`
 *  is what refuses a supplied figure that contradicts the count. */
export function stockMovementCents(input: StockAdjustmentInput): number | null {
  if (typeof input.adjustment_cents === "number") return input.adjustment_cents;
  if (input.method === "opening_closing_count"
      && typeof input.opening_cents === "number" && typeof input.closing_cents === "number") {
    return input.closing_cents - input.opening_cents;
  }
  return null;
}

/**
 * Every shape refusal a model can act on WITHOUT a database round trip, in the DATABASE's own
 * `field` vocabulary (`adjustment.<key>`, migration 0194's own spelling) so one mapper serves both
 * halves of the validation. The database re-checks all of these and is the authority.
 */
export function localAdjustmentRefusal(input: StartPeriodicAdjustmentWorkInput): AdjustmentRefusal | null {
  if (input.period_end < input.period_start) {
    return refuse("invalid_adjustment", "adjustment.period_end",
      `The period ends (${input.period_end}) before it starts (${input.period_start}).`,
      "Give a period whose end is on or after its start.", { constraint: "order" });
  }
  if (input.purpose === "periodic_stock_adjustment") {
    if (input.inventory_account_code.trim() === input.cost_account_code.trim()) {
      return refuse("invalid_adjustment", "adjustment.cost_account_code",
        "The inventory and cost legs name one account.",
        "Name the inventory account and the cost-of-sales account separately.", { constraint: "distinct" });
    }
    if (input.method === "opening_closing_count") {
      if (typeof input.opening_cents !== "number" || typeof input.closing_cents !== "number") {
        return refuse("invalid_adjustment", "adjustment.opening_cents",
          "An opening/closing count needs both figures, in exact cents.",
          "Ask the human for the opening and closing stock figures.", { constraint: "present" });
      }
      const derived = input.closing_cents - input.opening_cents;
      if (typeof input.adjustment_cents === "number" && input.adjustment_cents !== derived) {
        return refuse("invalid_adjustment", "adjustment.adjustment_cents",
          `The movement given (${input.adjustment_cents}) is not closing minus opening (${derived}).`,
          "Leave the movement out and it is taken from the two counted figures.",
          { constraint: "derived_amount", opening_cents: input.opening_cents, closing_cents: input.closing_cents });
      }
    } else if (typeof input.opening_cents === "number" || typeof input.closing_cents === "number") {
      return refuse("invalid_adjustment", "adjustment.opening_cents",
        "An explicit adjustment carries no opening/closing count.",
        "Use `opening_closing_count` when the human gave you counted figures.", { constraint: "absent" });
    } else if (typeof input.adjustment_cents !== "number") {
      return refuse("invalid_adjustment", "adjustment.adjustment_cents",
        "An explicit adjustment needs the movement, in exact cents.",
        "Ask the human how much the stock moved by.", { constraint: "present" });
    }
    if (input.counted_at !== undefined && (input.counted_at < input.period_start || input.counted_at > input.period_end)) {
      return refuse("stale_basis", "adjustment.counted_at",
        `The count was taken on ${input.counted_at}, outside ${input.period_start} .. ${input.period_end}.`,
        "A count taken outside the period is not evidence about that period; ask which period it belongs to.",
        { constraint: "counted_at_outside_period" });
    }
    const movement = stockMovementCents(input);
    if (movement === 0) {
      return refuse("adjustment_all_zero", "adjustment.adjustment_cents",
        "This adjustment moves no money.",
        "If nothing moved there is nothing to post; check the two figures with the human.");
    }
    return null;
  }

  if (input.expense_account_code.trim() === input.liability_account_code.trim()) {
    return refuse("invalid_adjustment", "adjustment.liability_account_code",
      "The expense and liability legs name one account.",
      "Name the expense account and the liability account separately.", { constraint: "distinct" });
  }
  if (input.amount_cents === 0) {
    return refuse("adjustment_all_zero", "adjustment.amount_cents",
      "This obligation moves no money.",
      "Ask the human for the amount; an obligation of zero is not something to post.");
  }
  const settled = input.settled_cents ?? 0;
  if (settled > 0 && input.payment_account_code === undefined) {
    return refuse("invalid_adjustment", "adjustment.payment_account_code",
      "A settled amount needs the account it was settled from.",
      "Ask which bank or cash account paid it.", { constraint: "present" });
  }
  if (input.payment_account_code !== undefined && settled === 0) {
    return refuse("adjustment_lines_mismatch", "adjustment.payment_account_code",
      "A payment account is named but nothing was settled through it.",
      "Give the settled amount in exact cents, or leave the payment account out.",
      { constraint: "payment_leg" });
  }
  if (settled > input.amount_cents) {
    return refuse("invalid_adjustment", "adjustment.settled_cents",
      `More was settled (${settled}) than the obligation is (${input.amount_cents}).`,
      "The settled part cannot exceed the obligation; check the figures with the human.",
      { constraint: "over_settled" });
  }
  // #796 — the advance pair, mirroring the payment pair above AND 0194's own `advance_leg` and
  // `distinct` rules. Asking for the missing half by NAME is the #721 shape: the tool says which
  // particular it still needs BEFORE admission, rather than admitting a Work whose basis a later
  // question could not repair.
  const advance = input.advance_cents ?? 0;
  if (advance > 0 && input.advance_account_code === undefined) {
    return refuse("invalid_adjustment", "adjustment.advance_account_code",
      "An advanced amount needs the staff-advance account it sits on.",
      "Ask which enrolled staff-advance account carries it.", { constraint: "present" });
  }
  if (input.advance_account_code !== undefined && advance === 0) {
    return refuse("adjustment_lines_mismatch", "adjustment.advance_cents",
      "A staff-advance account is named but nothing is carried on it.",
      "Ask the human how much of this obligation sits on that advance, in exact cents.",
      { constraint: "advance_leg" });
  }
  if (input.advance_account_code !== undefined
      && (input.advance_account_code.trim() === input.expense_account_code.trim()
        || input.advance_account_code.trim() === input.liability_account_code.trim()
        || input.advance_account_code.trim() === (input.payment_account_code ?? "").trim())) {
    return refuse("invalid_adjustment", "adjustment.advance_account_code",
      "The advance leg repeats another named account.",
      "Name the staff-advance account separately from the expense, liability and payment accounts.",
      { constraint: "distinct" });
  }
  // The liability leg takes the remainder, and 0194 refuses a named leg carrying nothing — so a
  // remainder of zero is a refusal here rather than an admitted basis the database will reject.
  if (settled + advance >= input.amount_cents) {
    return refuse("adjustment_lines_mismatch", "adjustment.liability_account_code",
      `The settled (${settled}) and advanced (${advance}) parts leave nothing owed on the liability account.`,
      "Check the split with the human: the liability leg carries what is still owed.",
      { constraint: "liability_leg" });
  }
  return null;
}

/**
 * The `clara.accounting_work.adjustment_basis` jsonb, in the DATABASE's own field spelling — the
 * `p_adjustment` argument of `clara.admit_periodic_adjustment_work`.
 *
 * `particulars_source` is REQUIRED by the database for a payroll obligation, and it is filled here
 * from the caller's own words rather than invented: v19 passes the conversation's provenance
 * ("supplied in this conversation by <who>"), and the direct form passes what the preparer typed.
 */
export function adjustmentFromInput(
  input: StartPeriodicAdjustmentWorkInput,
  { particularsSource }: { particularsSource?: string } = {},
): Record<string, unknown> {
  const shared: Record<string, unknown> = {
    period_start: input.period_start,
    period_end: input.period_end,
    currency: "MYR",
    instruction: input.instruction,
  };
  if (input.corrects_adjustment_id !== undefined) shared.corrects_adjustment_id = input.corrects_adjustment_id;

  if (input.purpose === "periodic_stock_adjustment") {
    const out: Record<string, unknown> = {
      ...shared,
      method: input.method,
      inventory_account_code: input.inventory_account_code.trim(),
      cost_account_code: input.cost_account_code.trim(),
      adjustment_cents: stockMovementCents(input),
    };
    if (input.method === "opening_closing_count") {
      out.opening_cents = input.opening_cents;
      out.closing_cents = input.closing_cents;
    }
    if (input.counted_at !== undefined) out.counted_at = input.counted_at;
    if (input.count_reference !== undefined) out.count_reference = input.count_reference;
    return out;
  }

  const out: Record<string, unknown> = {
    ...shared,
    obligation_kind: input.obligation_kind,
    expense_account_code: input.expense_account_code.trim(),
    liability_account_code: input.liability_account_code.trim(),
    amount_cents: input.amount_cents,
    particulars_source: particularsSource ?? input.instruction,
  };
  if (input.payment_account_code !== undefined) out.payment_account_code = input.payment_account_code.trim();
  // #796. `advance_account_code` IS a 0194 particular (`_assert_adjustment_basis` reads it and
  // `_assert_adjustment_relationships` checks the enrolment); `advance_cents` is NOT, so it stays
  // out of the stored object for the reason `settled_cents` does — a key the database never reads
  // could carry no refusal and would be a figure nobody can be held to.
  if (input.advance_account_code !== undefined) out.advance_account_code = input.advance_account_code.trim();
  return out;
}

/**
 * The JOURNAL BASIS those particulars imply — the `p_basis` argument, in the same shape
 * `chatTurn.v18.tools.ts`'s `basisFromInput` produces.
 *
 * IT IS A DERIVATION, NOT A PROPOSAL. `clara._assert_adjustment_relationships` re-derives the same
 * relationship at admission and at commit and refuses a basis that does not say what the
 * particulars say (`adjustment_lines_mismatch`). So this function and that assertion are two
 * statements of one contract, and a change to either without the other is caught by the database
 * rather than by a reviewer.
 *
 * THE STOCK DIRECTION IS THE SIGN'S. A rise DEBITS inventory and CREDITS the cost account; a fall
 * is its mirror. Nothing is rounded and nothing is netted: the movement is already exact cents.
 *
 * THE PAYROLL SPLIT IS THE ACCOUNTANT'S. The expense leg carries the whole obligation; the credit
 * side is the liability, less whatever was settled through the payment account. A staff-advance
 * recovery is NOT derived here and cannot be: `clara._adv_on_approve` (migration 0043) refuses a
 * credit on an enrolled staff-advance account that does not say WHICH advance it discharges, and
 * `clara.book_staff_advance_application` is the door that does. An allocation is a missing
 * settlement fact, and #643 does not invent those.
 */
export function basisFromAdjustment(
  input: StartPeriodicAdjustmentWorkInput,
  { postingDate, memo }: { postingDate?: string; memo?: string } = {},
): Record<string, unknown> {
  const date = postingDate ?? input.period_end;

  if (input.purpose === "periodic_stock_adjustment") {
    const movement = stockMovementCents(input) ?? 0;
    const abs = Math.abs(movement);
    const rose = movement > 0;
    return {
      posting_date: date,
      memo: memo ?? `Periodic stock adjustment ${input.period_start} to ${input.period_end}`,
      currency: "MYR",
      lines: [
        {
          account_code: input.inventory_account_code.trim(),
          debit_cents: rose ? abs : 0,
          credit_cents: rose ? 0 : abs,
          description: "stock movement",
        },
        {
          account_code: input.cost_account_code.trim(),
          debit_cents: rose ? 0 : abs,
          credit_cents: rose ? abs : 0,
          description: "cost of sales",
        },
      ],
    };
  }

  const settled = input.settled_cents ?? 0;
  const advance = input.advance_cents ?? 0;
  const lines: Array<Record<string, unknown>> = [
    {
      account_code: input.expense_account_code.trim(),
      debit_cents: input.amount_cents,
      credit_cents: 0,
      description: `${input.obligation_kind} ${input.period_start} to ${input.period_end}`,
    },
    {
      account_code: input.liability_account_code.trim(),
      debit_cents: 0,
      credit_cents: input.amount_cents - settled - advance,
      description: "obligation",
    },
  ];
  // #796 — the advance leg, before the settlement leg, so the derived order reads the way an
  // accountant states it: what is owed, what is carried on the advance, what was paid. 0194 only
  // requires each NAMED leg to carry something; the order is this module's own.
  if (advance > 0 && input.advance_account_code !== undefined) {
    lines.push({
      account_code: input.advance_account_code.trim(),
      debit_cents: 0,
      credit_cents: advance,
      description: "staff advance",
    });
  }
  if (settled > 0 && input.payment_account_code !== undefined) {
    lines.push({
      account_code: input.payment_account_code.trim(),
      debit_cents: 0,
      credit_cents: settled,
      description: "settled",
    });
  }
  return {
    posting_date: date,
    memo: memo ?? `${input.obligation_kind} obligation ${input.period_start} to ${input.period_end}`,
    currency: "MYR",
    lines,
  };
}

// ---------------------------------------------------------------------------------------------
// WHAT `chatTurn.v19` MUST WIRE, and nothing more.
//
//   1. `tool({ inputSchema: startPeriodicAdjustmentWorkInputSchema, execute })` under the name
//      `START_PERIODIC_ADJUSTMENT_WORK_TOOL`, registered beside `start_journal_work` (which stays
//      exactly as v18 has it — this tool does not replace it).
//   2. In `execute`: the v18 client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localAdjustmentRefusal(input); if (local) return local;`.
//   3. `const intentKey = stableOpKey(ctx.taskId, START_PERIODIC_ADJUSTMENT_WORK_TOOL, input);`
//      — the SAME identity discipline `start_journal_work` uses, so a re-run turn resolves to the
//      Work it already admitted instead of admitting a second one.
//   4. ONE query, with the chat lane's own source ref and basis origin:
//
//        select clara.admit_periodic_adjustment_work(
//          $1::uuid,   -- ctx.clientId
//          $2::uuid,   -- ctx.createdBy
//          $3::text,   -- intentKey
//          $4::text,   -- input.purpose
//          $5::jsonb,  -- basisFromAdjustment(input)
//          $6::jsonb,  -- adjustmentFromInput(input, { particularsSource })
//          $7::text,   -- 'clara_interpreted'
//          $8::jsonb,  -- [{ kind: 'chat_task', task_id: ctx.taskId, session_id: <from the task> }]
//          $9::text    -- modelId
//        ) as r
//
//      `particularsSource` for the chat lane is the conversation's own provenance — v18's
//      `rationale` field is the precedent; a payroll obligation with no stated source is refused
//      by the database, deliberately.
//   5. The SAME result mapping `runStartJournalWork` already has: a `WorkAcceptedPart` on success,
//      and the database's typed `(code, detail.reason)` handed back on a refusal. Every reason
//      token this lane raises is listed in migration 0194's header; none of them is a new CLASS
//      of error, so `claraWork.v1.errors.ts` needs no change and the run settles as it always did.
//
// WHAT v19 MUST NOT DO: mint a new claraWork bundle. A periodic-adjustment Work runs through the
// EXISTING frozen claraWork v2 body byte for byte — the typed particulars live on
// `clara.accounting_work.adjustment_basis`, which the run never reads and never echoes.
// ---------------------------------------------------------------------------------------------
