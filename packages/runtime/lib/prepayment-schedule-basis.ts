// #653 — THE PREPAYMENT-SCHEDULE DOOR'S CHAT-LANE CONTRACT, as a schema, a mirror and a builder.
//
// WHY THIS FILE EXISTS AND WHY IT IS HERE. A chat entrance for "amortise this prepayment over the
// term on its invoice" needs a tool in a FROZEN workflow body, and this wave forbids cutting one
// (WORK-ORDER item 8; DECISIONS §1.1 puts every chat tool of this wave into ONE shared
// `chatTurn_v20` at the integration cut). So everything that tool needs which is NOT the frozen
// tool body lives here, in non-frozen infrastructure, tested on its own: the `.strict()` input
// schema, the local refusal MIRROR, the door payload builder, and the refusal→message map. v20's
// job is then the four lines at the foot of this file.
//
// IT IS THE `periodic-adjustment-basis.ts` PATTERN, RESTATED — and that file's own header is the
// warning this one has to honour: it became frozen BY IMPORT the moment `chatTurn.v19.tools.ts`
// imported it, and every byte of it is now hash-locked in `frozen-workflows.json`. Until the
// wave's successor ceremony, NOTHING frozen may import this file — including dynamically, because
// `scripts/check-frozen-workflows.mjs`'s specifier scan matches `import("…")` too.
//
// THE CEREMONY HAPPENED AND THIS FILE IS STILL OUTSIDE IT (wave 2026-09-15 integration cut,
// 2026-09-17). `chatTurn_v20` and `claraWork_v4` were cut and the registry repointed, and NEITHER
// imports this module — so it is still not in `frozen-workflows.json` and the four lines at the
// foot of this file are still owed. The reason is a MEASUREMENT, not a preference: 0208 grants
// `clara.create_prepayment_schedule`, `get_prepayment_schedule`, `list_prepayment_schedules` and
// `list_prepayment_attention` to `clara_authenticated` ALONE (`0208:1674-1677`), the door is
// `_human_ctx`-fronted at the bookkeeper rank (`0208:1043`), `clara.prepayment_schedules` carries a
// NULL relacl and `clara.document_service_periods` is granted select to `clara_authenticated` only
// (`0140:627`). The runtime pool SET ROLEs to `clara_runtime` and carries no JWT actor, so both
// contracts at the foot of this file — the chat tool and `read_prepayment_source` — could only ever
// return a grant refusal. Closing them needs an OBO twin (`clara.create_prepayment_schedule_for`,
// in `clara.create_accrual_adjustment_for`'s shape) and a machine-lane read, and a migration is not
// a workflow cut's to write. Both stanzas stay contracts; the omission is named in
// `docs/plan/active/refresh-wave-2026-09-15/reports/successors-final.md`.
//
// THE DATABASE IS THE AUTHORITY, ALWAYS. `clara.create_prepayment_schedule` (migration 0208)
// re-checks every rule below against the client's live chart, the frozen evaluator's own output
// and the document's live service period. Nothing here is a rule of its own: every check is a
// MIRROR of one the database enforces, so a model sees the mistake beside the thing that caused it
// instead of as a refusal a round trip later.
//
// AND NOTHING HERE DERIVES A NUMBER, A DATE OR A TERM. #653's boundary is sharper than #643's: the
// amount, the period count, the per-period allocation, the cadence and the authority window are
// ALL derived by `clara.prepayment_schedule_v1`, a FROZEN single-member evaluator closure, from
// rows this database already holds. The model contributes exactly two things — WHICH expense
// account the amortisation charges, and WHY — and both are recorded as a judgement with its
// stated grounds. A service period is HUMAN-ONLY BY LAW (`clara.record_document_service_period`
// has no wake wrapper and never will: `packages/db/tests/rig-meta.mjs:1196-1199` records it under
// hard constraint 2), which is why the missing-term refusal below names a human door rather than
// offering the model a way to supply one.

import { z } from "zod";

export const START_PREPAYMENT_SCHEDULE_WORK_TOOL = "start_prepayment_schedule_work";

/** The plan kind migration 0208 adds. Named here so the successor's part payload can echo it
 *  without re-spelling a string the database owns. */
export const AMORTISATION_PLAN_KIND = "amortisation_schedule";

const uuid = z
  .string()
  .uuid()
  .describe("A uuid this database already holds. Never invent one.");

const accountCode = z.string().trim().min(1).max(64);

/**
 * THE TOOL'S INPUT, `.strict()`.
 *
 * WHAT IS DELIBERATELY ABSENT, because each absence is a rule:
 *   · no amount, no period count, no per-period figures — the frozen evaluator derives all of them
 *     from the source entry's own prepaid leg and the document's own service period;
 *   · no term and no dates — a service period read off a document by a model is a model-generated
 *     value, and hard constraint 2 forbids one entering a durable artifact. The database's own
 *     refusal names the human door instead;
 *   · no cadence — it is derived (monthly, each period's own month end) and the door accepts none
 *     of it from a caller;
 *   · no authority reference — the chat lane's authority is the CONVERSATION, so the successor
 *     supplies `{kind: "chat_task", id: ctx.taskId}` from its own context. A tool that accepted an
 *     authority id would let a model name the instruction that authorises it.
 */
export const startPrepaymentScheduleWorkInputSchema = z
  .object({
    source_entry_id: uuid.describe(
      "The POSTED journal entry that recognised the prepayment. It must be approved, bind a "
      + "document, and debit exactly one asset account — the database refuses anything else.",
    ),
    expense_account_code: accountCode.describe(
      "The expense account each period's amortisation charge is booked to, from this client's "
      + "chart. It must be an expense-class account; the database refuses a balance-sheet, bank, "
      + "control, inactive or role-reserved account.",
    ),
    expense_account_basis: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .describe(
        "Why THAT expense account, in the terms the human gave you. A classification with no "
        + "stated grounds is refused rather than recorded unexplained.",
      ),
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("What this schedule is FOR, in the firm's own words. It names the plan."),
  })
  .strict();

export type StartPrepaymentScheduleWorkInput = z.infer<typeof startPrepaymentScheduleWorkInputSchema>;

/** The typed `detail.reason` tokens migration 0208's door raises, and the two 0140 tokens it
 *  surfaces verbatim from the frozen evaluator. Spelled here ONCE so the successor's refusal map
 *  and this module's mirror cannot drift apart. */
export const PREPAYMENT_REFUSAL = {
  sourceUnfit: "prepayment_source_unfit",
  termUnderivable: "prepayment_term_underivable",
  targetIneligible: "prepayment_target_ineligible",
  targetUnderivable: "prepayment_target_underivable",
  belowGranularity: "prepayment_amount_below_period_granularity",
  scheduleExists: "prepayment_schedule_exists",
  invalidPurpose: "invalid_purpose",
  clientNotFound: "client_not_found",
  clientInactive: "client_inactive",
  authorityRefUnresolved: "authority_ref_unresolved",
  operationInFlight: "operation_in_flight",
} as const;

export type PrepaymentRefusalReason = (typeof PREPAYMENT_REFUSAL)[keyof typeof PREPAYMENT_REFUSAL];

export type LocalRefusal = { refusal: PrepaymentRefusalReason; axis?: string; message: string };

/**
 * THE LOCAL MIRROR. It refuses ONLY what the database refuses, in the database's own words, and it
 * refuses nothing the database would accept.
 *
 * IT IS DELIBERATELY SHALLOW. Everything that needs a row — is the entry approved, does it bind a
 * document, does the document state a term, is the account an expense, does the term charge a
 * positive amount every period — is the DATABASE's, and asking a model to guess any of it would be
 * the invention this lane exists to prevent. What is left is the shape: the two fields the model
 * itself supplies, and the purpose.
 */
export function localPrepaymentRefusal(
  input: StartPrepaymentScheduleWorkInput,
): LocalRefusal | null {
  if (input.expense_account_code.trim() === "") {
    return {
      refusal: PREPAYMENT_REFUSAL.targetUnderivable,
      axis: "account_missing",
      message: "Name the expense account the amortisation charge is booked to.",
    };
  }
  if (input.expense_account_basis.trim() === "") {
    return {
      refusal: PREPAYMENT_REFUSAL.targetUnderivable,
      axis: "basis_missing",
      message: "Say why that expense account, in the terms the human gave you.",
    };
  }
  if (input.purpose.trim() === "") {
    return {
      refusal: PREPAYMENT_REFUSAL.invalidPurpose,
      message: "Give the schedule a purpose — it is what the plan is called.",
    };
  }
  return null;
}

/**
 * WHAT A REFUSAL MEANS TO A PERSON, and what to do next. Every message names an ACT rather than a
 * state, because a refusal a reader cannot act on is a dead end — and the term arm names the HUMAN
 * door by its own verb, since no agent path to it exists or ever will.
 */
export function prepaymentRefusalMessage(reason: string, detail?: Record<string, unknown>): string {
  switch (reason) {
    case PREPAYMENT_REFUSAL.sourceUnfit:
      return (
        "That entry cannot be amortised: a prepayment schedule amortises a POSTED entry that "
        + "debits exactly one asset account. Approve the entry first, or name the entry that "
        + "actually carries the prepaid asset."
      );
    case PREPAYMENT_REFUSAL.termUnderivable:
      return detail?.missing === "document_service_periods"
        ? (
          "The document behind that entry states no service period, so there is no term to "
          + "amortise over. A person has to record it — the service period is a human-stated "
          + "fact and I never supply one."
        )
        : (
          "The term for that prepayment cannot be derived: "
          + String(detail?.reason_text ?? "the source entry binds no document, or its fiscal year has no open successor.")
        );
    case PREPAYMENT_REFUSAL.targetIneligible:
      return (
        `That account cannot carry an amortisation charge (${String(detail?.axis ?? "ineligible")}). `
        + "Name an active expense account from this client's chart."
      );
    case PREPAYMENT_REFUSAL.targetUnderivable:
      return detail?.axis === "basis_missing"
        ? "Say why that expense account before I record the classification."
        : "Name the expense account the amortisation charge is booked to.";
    case PREPAYMENT_REFUSAL.belowGranularity:
      return (
        `That term charges nothing in at least one period: ${String(detail?.total_cents ?? "the amount")} `
        + `cents over ${String(detail?.period_count ?? "the term")} periods truncates to zero. `
        + "A shorter term, or simply expensing it, is a judgement for a person to make."
      );
    case PREPAYMENT_REFUSAL.scheduleExists:
      return "That prepayment already has an amortisation schedule.";
    case PREPAYMENT_REFUSAL.clientNotFound:
    case PREPAYMENT_REFUSAL.clientInactive:
      return "I cannot act on that client here.";
    case PREPAYMENT_REFUSAL.authorityRefUnresolved:
      return "This conversation is not an instruction this database holds, so it cannot authorise a schedule.";
    case PREPAYMENT_REFUSAL.operationInFlight:
      return "That same request is already in flight; I am waiting for it rather than asking twice.";
    default:
      return "I could not configure that amortisation schedule.";
  }
}

export type PrepaymentDoorPayload = {
  p_client: string;
  p_source_entry: string;
  p_expense_account: string;
  p_expense_basis: string;
  p_purpose: string;
  /** The CONVERSATION is the instruction. The successor supplies its own `ctx.taskId`; a model
   *  never names the row that authorises its own act. */
  p_authority_ref: { kind: "chat_task"; id: string };
  p_op_key: string;
};

/**
 * THE DOOR PAYLOAD, in the DATABASE's own parameter names and argument order — the shape
 * `clara.create_prepayment_schedule(p_client, p_source_entry, p_expense_account, p_expense_basis,
 * p_purpose, p_authority_ref, p_op_key)` takes. Named rather than positional for the reason
 * `packages/db/tests/rig-helpers.mjs`'s `namedCall` gives: a parameter-name divergence is a real
 * finding, a positional one is a silent mismatch.
 */
export function prepaymentDoorPayload(
  input: StartPrepaymentScheduleWorkInput,
  ctx: { clientId: string; taskId: string; opKey: string },
): PrepaymentDoorPayload {
  return {
    p_client: ctx.clientId,
    p_source_entry: input.source_entry_id,
    p_expense_account: input.expense_account_code.trim(),
    p_expense_basis: input.expense_account_basis.trim(),
    p_purpose: input.purpose.trim(),
    p_authority_ref: { kind: "chat_task", id: ctx.taskId },
    p_op_key: ctx.opKey,
  };
}

/**
 * THE PART A SUCCESSFUL CALL EMITS. It is a CONFIGURATION receipt and it says so: the boundary
 * between "an accepted schedule" and "a posted occurrence" is the one thing a chat surface must
 * never blur, because recognition and configuration CANNOT be one commit on this estate (the
 * evaluator refuses a source entry that has not posted), and the first occurrence is admitted by
 * the belt rather than by this call.
 */
export type PrepaymentSchedulePart = {
  kind: "prepayment_schedule_configured";
  scheduleId: string;
  planId: string;
  planKind: typeof AMORTISATION_PLAN_KIND;
  totalCents: number;
  periodCount: number;
  effectiveFrom: string;
  effectiveTo: string;
  expenseAccountCode: string;
  prepaidAccountCode: string;
  /** Always true. A schedule creates journal Work; it never initiates a bank payment, and it has
   *  posted nothing at the moment this part is emitted. */
  configurationOnly: true;
};

export function prepaymentSchedulePart(answer: Record<string, unknown>): PrepaymentSchedulePart {
  return {
    kind: "prepayment_schedule_configured",
    scheduleId: String(answer.schedule_id),
    planId: String(answer.plan_id),
    planKind: AMORTISATION_PLAN_KIND,
    totalCents: Number(answer.total_cents),
    periodCount: Number(answer.period_count),
    effectiveFrom: String(answer.effective_from),
    effectiveTo: String(answer.effective_to),
    expenseAccountCode: String(answer.expense_account_code),
    prepaidAccountCode: String(answer.prepaid_account_code),
    configurationOnly: true,
  };
}

// ---------------------------------------------------------------------------------------------
// WHAT `chatTurn_v20` MUST WIRE, and nothing more.
//
//   1. `tool({ inputSchema: startPrepaymentScheduleWorkInputSchema, execute })` under the name
//      `START_PREPAYMENT_SCHEDULE_WORK_TOOL`, registered beside `start_journal_work` and
//      `start_periodic_adjustment_work` (both stay exactly as v19 has them).
//   2. In `execute`: the v18 client pin (`if (!ctx.clientId) return noClientRefusal()`), then
//      `const local = localPrepaymentRefusal(input); if (local) return local;`.
//   3. `const opKey = stableOpKey(ctx.taskId, START_PREPAYMENT_SCHEDULE_WORK_TOOL, input);` — the
//      SAME identity discipline `start_journal_work` uses, so a re-run turn REPLAYS the schedule
//      it already created instead of answering `prepayment_schedule_exists`. (Migration 0208 asks
//      `_reserve_op` BEFORE the duplicate check for exactly this reason; the two halves have to
//      agree or a lost response becomes a second question.)
//   4. ONE query, with named arguments in the database's own spelling:
//
//        select clara.create_prepayment_schedule(
//          p_client          => $1::uuid,
//          p_source_entry    => $2::uuid,
//          p_expense_account => $3::text,
//          p_expense_basis   => $4::text,
//          p_purpose         => $5::text,
//          p_authority_ref   => $6::jsonb,
//          p_op_key          => $7::text) as r
//
//      with the seven values of `prepaymentDoorPayload(input, {clientId, taskId, opKey})` in that
//      order. `p_authority_ref` is `{kind:"chat_task", id: ctx.taskId}` — the CONVERSATION is the
//      instruction, and the door RESOLVES it against `clara.agent_tasks` in the same firm and
//      client, so a remembered preference or an invented id cannot supply authority.
//   5. On success: a part built by `prepaymentSchedulePart(answer)` — part kind
//      `prepayment_schedule_configured`. On a refusal: the database's typed `(code,
//      detail.reason)` handed back, rendered with `prepaymentRefusalMessage(reason, detail)`.
//      Every reason token this lane raises is listed in `PREPAYMENT_REFUSAL` above and in
//      migration 0208's header; none of them is a new CLASS of error, so `claraWork.v1.errors.ts`
//      needs no change.
//
// WHAT v20 MUST NOT DO: mint a new claraWork bundle, and mint no `accounting_work.purpose`. An
// amortisation occurrence is an ordinary `journal_entry` Work that the EXISTING frozen claraWork
// body runs byte for byte; `clara.get_work_plan_origin` (0193) resolves it back to its plan,
// revision, due date and attempt, so `WORK_ACCEPTED_PURPOSES` needs no widening either.
//
// ---------------------------------------------------------------------------------------------
// WHAT `claraWork_v4` MUST WIRE — THE TERM PARK. #653's AC5 and historical row C55.13 are NOT
// CLAIMED by this slice, and this is the contract that would close them.
//
// WHY IT CANNOT BE DELIVERED HERE, measured rather than asserted:
//   · `clara.open_work_question` is `grant execute … to clara_runtime` ONLY (`0180:686`, re-granted
//     identically at `0184:1696`), it refuses a null or blank HOOK TOKEN (`0180:585-588`), and the
//     live body requires the task to be `running` (`0184:1643`). No human door can park a Work, so
//     the park is a claraWork-lane capability rather than a DB+web one.
//   · the frozen prompt forbids the run from citing a source document at all — "There is no source
//     document for this Work and you must never invent" (`claraWork.v1.prompt.ts:68`) — and the
//     frozen roster carries no document tool (`:36-40`). So "re-read the evidence, THEN ask a
//     bounded question" needs a new prompt and a new roster, which is a new frozen body.
//
// THE CONTRACT:
//   1. ROSTER: add `read_prepayment_source` (read-only: the bound document's recorded service
//      period, its basis kind and its basis text, by `clara.get_prepayment_schedule` or a new
//      read; NEVER the document's bytes) and keep `ask_question` execute-less, so the run parks on
//      the WDK hook exactly as `claraWork.v3.tools.ts:29-32` already does.
//   2. PROMPT: the "no source document" sentence becomes "the document this Work's entry binds is
//      the ONLY source you may cite, by its recorded facts and never by inventing one".
//   3. THE QUESTION, opened through the run's own hook token:
//        clara.open_work_question(
//          p_work      => <this Work>,
//          p_prompt    => 'Over what service period does this prepayment run?',
//          p_fields    => [{key:'period_start', kind:'date', required:true},
//                          {key:'period_end',   kind:'date', required:true},
//                          {key:'basis',        kind:'text', required:true, max:4000}],
//          p_context   => {document_id, source_entry_id, prepaid_account_code, total_cents},
//          p_hook      => <the run's hook token>,
//          p_asked_against => {basis_version: <the Work's basis digest>})
//      `p_fields` uses 0180's CLOSED field kinds (`0180:362-479`); anything outside them is
//      refused by the database rather than rendered as free text.
//   4. THE ANSWER APPLIES THROUGH THE HUMAN DOOR, NOT THE RUN. A settled answer is delivered to
//      the parked run, which calls NOTHING that writes the term: the run hands the answer back to
//      the human lane, and `clara.record_document_service_period` — bookkeeper-floored, human-only
//      by law, `basis_kind='human_stated'` STRUCTURALLY (`0140:944-959`) — is what records it. The
//      run then re-derives by calling the schedule door. A run that wrote the term itself would
//      make a model-read period a durable accounting fact, which hard constraint 2 forbids.
//   5. AN EXPIRED QUESTION. 0198 removed the `work_id is not null` predicate from the expiry
//      sweep, so a parked Work question that passes its deadline is moved to `expired` and the run
//      RESUMES with no answer: the correct settle is `refused` carrying
//      `prepayment_term_underivable`, which leaves the recognition visible in
//      `clara.list_prepayment_attention`'s ARM B ("recognised, not yet amortised") rather than in
//      no surface at all. The Work must NOT settle `completed`, and it must NOT retry the question.
// ---------------------------------------------------------------------------------------------
