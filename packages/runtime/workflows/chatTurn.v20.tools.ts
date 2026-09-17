// @frozen
//
// FROZEN — part of the chatTurn_v20 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v19 (docs/ARCHITECTURE.md §10, #workflow-versioning-and-rollback).
//
// `buildToolsV20` calls v19's `buildToolsV19(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// TWO tools: `start_staff_expense_claim_work` (#638) and `start_accrual_work` (#652). Nothing v19
// could do stops being possible and nothing it did changes. ONE successor rather than three,
// because a frozen version is expensive to mint and all three tickets deferred their runtime half
// into this one cut by design (wave 2026-09-15 DECISIONS §1.1).
//
// THE THIRD TOOL THE WAVE ASKED FOR IS NOT HERE, AND THE REASON IS A MEASUREMENT RATHER THAN A
// PREFERENCE. #653's `start_prepayment_schedule_work` would call
// `clara.create_prepayment_schedule`, and that door is `_human_ctx`-fronted (bookkeeper floor read
// off a JWT actor) and granted to `clara_authenticated` ALONE — migration 0223 §D.1 states it as a
// rule: "The four doors to `clara_authenticated`; … The agent and both wake roles gain NOTHING".
// This lane runs on the runtime pool, which SET ROLEs to `clara_runtime` and carries no JWT actor,
// so the tool could only ever return a grant refusal. Closing it needs an OBO twin —
// `clara.create_prepayment_schedule_for`, in `clara.create_accrual_adjustment_for`'s own shape —
// which no branch of this wave shipped, and a migration is not this cut's to write. The contract
// stays written in `packages/runtime/lib/prepayment-schedule-basis.ts`'s footer, that module stays
// OUT of this closure (importing it would hash-lock it before its door exists), and the cut names
// the omission rather than shipping a tool that cannot work. #647's `record_counterparty_alias` is
// absent for the identical reason (DECISIONS D11: it needs `clara.add_counterparty_alias_for`).
//
// THE ROSTER IS A FIXED LITERAL, and v19's header states the whole defence: registration comes
// from THIS module alone — `Object.assign` over v19's map plus two literal keys. A client's
// recorded Knowledge reaches the prompt through v19's context block, and a tool-shaped JSON object
// sitting in a knowledge value is data in a string; there is no path from it to this object.
//
// ---------------------------------------------------------------------------------------------
// 1 · `start_staff_expense_claim_work` — THE CHAT ENTRANCE #638 LEFT OPEN.
//
// A staff expense claim is a `journal_entry`-purpose Work whose typed particulars live in
// `clara.staff_expense_claims`. Migration 0221's amendment is the whole reason this tool is cheap:
// a FOURTH `accounting_work.purpose` cannot post without recutting the posting core, so the claim
// rides the existing purpose and `WORK_ACCEPTED_PURPOSES` needs NO widening (see
// chatTurn.v19.parts.ts's `WORK_ACCEPTED_PURPOSES_V19`, pinned by tests/p6-1-parts-parity.test.mjs).
//
// IT ADMITS AND IT POSTS NOTHING. `clara.admit_staff_expense_claim_work` writes the claim row, its
// append-only status ledger, the staff-advance auto-enrolment and the `clara.accounting_work` row
// inside ONE transaction, and the ENTRY is written a moment later by a `claraWork` run under a
// wake credential minted OBO this same human, with the database rechecking their live role, the
// period, the chart and the exact cents AT COMMIT. So the honest thing to say after this tool
// succeeds is "I've queued it", and the prompt says exactly that.
//
// THE DOOR TAKES SEVEN ARGUMENTS AND THERE IS NO `p_basis`. It derives the balanced journal from
// the claim's own items and settlement, so handing it a basis would be a second opinion about
// arithmetic the database owns. `basisFromClaim` exists to SHOW a human, never for the wire — the
// module's own footer says so.
//
// EVERYTHING BUT THE FROZEN TOOL BODY IS #638's NON-FROZEN MODULE, BY IMPORT:
// `packages/runtime/lib/staff-expense-claim-basis.ts` carries the `.strict()` discriminated union,
// `localClaimRefusal`, `claimFromInput` and the settlement vocabulary, where #638 shipped and
// unit-tested them. Importing it PUTS IT IN THIS FROZEN CLOSURE, which is intended and is exactly
// what the ticket deferred: from this commit its text is hash-locked with the rest of the closure.
//
// ---------------------------------------------------------------------------------------------
// 2 · `start_accrual_work` — THE CHAT ENTRANCE #652 LEFT OPEN.
//
// It CONFIGURES an accrual: one `clara.accrual_adjustments` row, one `reversing_journal` plan and
// its revision, and — when the authority window is already open — the current period's occurrence,
// admitted through `clara._plan_admit_occurrence` as an ordinary `journal_entry` Work. That is why
// `WORK_ACCEPTED_PURPOSES` needs no widening here either.
//
// `occurrence` CAN BE NULL AND THE TOOL SAYS SO RATHER THAN INVENTING A WORK ID. An authority that
// starts in the future configures a schedule with nothing due yet; the honest answer is
// "configured, nothing due yet", and `work_accepted` is simply absent from that result.
//
// THE TERM IS THE HUMAN'S AND THE SCHEMA MAKES THAT STRUCTURAL. `term_source` is a
// `z.literal("human_stated")` — there is no value a model could put there to express a period it
// read out of a document — and `effective_to` is REQUIRED and must fall inside the stated service
// period (the wave's post-review ratification R4, and the module is the authority on the schema,
// not any older stanza text). A model-extracted period never enters the durable record.
//
// THE OP KEY IS DETERMINISTIC for both tools, for the reason `start_journal_work`'s intent key is:
// a REPLAYED step re-executes its tool call, and `clara._reserve_op` returns the first receipt
// rather than admitting a second Work.

import { tool } from "ai";
import { buildToolsV19 } from "./chatTurn.v19.tools.js";
import { authoringRefusal, stableOpKey } from "./chatTurn.v11.tools.js";
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import type { WorkAcceptedPartV19 } from "./chatTurn.v19.parts.js";
import {
  START_STAFF_EXPENSE_CLAIM_WORK_TOOL,
  claimFromInput,
  localClaimRefusal,
  startStaffExpenseClaimWorkInputSchema,
  type StartStaffExpenseClaimWorkInput,
} from "../lib/staff-expense-claim-basis.js";
import {
  ACCRUAL_TIMEZONE,
  START_ACCRUAL_WORK_TOOL,
  accrualFromInput,
  localAccrualRefusal,
  startAccrualWorkInputSchema,
  type StartAccrualWorkInput,
} from "../lib/accrual-basis.js";

export { START_STAFF_EXPENSE_CLAIM_WORK_TOOL, startStaffExpenseClaimWorkInputSchema };
export { START_ACCRUAL_WORK_TOOL, startAccrualWorkInputSchema };
export type { StartStaffExpenseClaimWorkInput, StartAccrualWorkInput };

/** The refusal envelope both tools answer with — v18's `StartJournalWorkResult` shape, carried by
 *  v19 and carried again here, so a model that has learned to read one has learned to read all. */
export type ToolRefusalV20 = {
  ok: false;
  code: string;
  reason: string | null;
  fix: string | null;
  message: string;
  details: Record<string, unknown>;
};

export type StartStaffExpenseClaimWorkResult =
  | {
      ok: true;
      work_accepted: WorkAcceptedPartV19;
      task_id: string;
      status: string;
      claim_id: string;
      replayed: boolean;
    }
  | ToolRefusalV20;

export type StartAccrualWorkResult =
  | {
      ok: true;
      work_accepted: WorkAcceptedPartV19 | null;
      accrual_id: string;
      plan_id: string;
      occurrence_due_on: string | null;
      replayed: boolean;
    }
  | ToolRefusalV20;

type DbError = { code?: string; message?: string; detail?: string };

/** v19's own `noClientRefusal`, restated because v19 does not export it — exporting it
 *  retroactively would edit a deployed body. Same code, same shape, same sentence structure. */
function noClientRefusal(reason: string, message: string): ToolRefusalV20 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client workspace whose books this belongs to.",
    message,
    details: {},
  };
}

/** Read the chat session this turn belongs to FROM THE TASK, never from a model argument — a
 *  model-supplied session id would be a provenance claim nobody checked. v18's own rule, carried
 *  by v19 and restated here for the same "a frozen predecessor does not export it" reason. */
async function sessionOfTask(c: PgExec, taskId: string): Promise<string | null> {
  const t = await c.query("select session_id from clara.agent_tasks where id = $1", [taskId]);
  const row = (t.rows[0] ?? null) as { session_id?: unknown } | null;
  return typeof row?.session_id === "string" ? row.session_id : null;
}

/** The database's typed refusal, handed back UNCHANGED. `authoringRefusal` answers `{ok:true}` for
 *  an error it does not recognise as a governed refusal — that is a FAULT, not a "no", and it
 *  becomes `internal` rather than a sentence this module invented. */
function refusalFromError(error: unknown, internalMessage: string): ToolRefusalV20 {
  const refused = authoringRefusal(error as DbError);
  if (refused.ok === true) {
    return { ok: false, code: "internal", reason: null, fix: null, message: internalMessage, details: {} };
  }
  return {
    ok: false,
    code: refused.code,
    reason: refused.reason,
    fix: refused.fix,
    message: refused.message,
    details: refused.details,
  };
}

export async function runStartStaffExpenseClaimWork(
  ctx: ToolCtx,
  input: StartStaffExpenseClaimWorkInput,
  modelId: string,
): Promise<StartStaffExpenseClaimWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "staff_claim_needs_client_pin",
      "This conversation is not bound to a client, so it cannot start a staff expense claim.",
    );
  }
  const local = localClaimRefusal(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const intentKey = stableOpKey(ctx.taskId, START_STAFF_EXPENSE_CLAIM_WORK_TOOL, input);
  const claim = claimFromInput(input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const sessionId = await sessionOfTask(c, ctx.taskId);
      const sourceRefs = [{ kind: "chat_task", task_id: ctx.taskId, session_id: sessionId }];
      const r = await c.query(
        "select clara.admit_staff_expense_claim_work($1::uuid, $2::uuid, $3::text, $4::jsonb,"
        + " $5::text, $6::jsonb, $7::text) as r",
        [
          clientId,
          ctx.createdBy,
          intentKey,
          JSON.stringify(claim),
          "clara_interpreted",
          JSON.stringify(sourceRefs),
          modelId,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.work_id == null) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        fix: null,
        message: "The staff expense claim could not be started. Nothing was recorded.",
        details: {},
      };
    }
    return {
      ok: true,
      work_accepted: {
        type: "work_accepted",
        work_id: String(receipt.work_id),
        client_id: clientId,
        // THE PURPOSE IS `journal_entry`, AND IT IS NOT A PLACEHOLDER. Migration 0221's amendment
        // rules that a claim rides the existing purpose; `clara.get_work_claim_origin` is what
        // labels it as a claim on the Work surfaces, never a purpose value.
        purpose: "journal_entry",
        logical_op_id: String(receipt.logical_op_id ?? ""),
      },
      task_id: String(receipt.task_id ?? ""),
      status: String(receipt.status ?? "queued"),
      claim_id: String(receipt.claim_id ?? ""),
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    return refusalFromError(error, "The staff expense claim could not be started.");
  }
}

/** The occurrence an accrual configuration admitted, or null. The door answers
 *  `{accrual_id, plan_id, occurrence: {...}|null, …}`; a future-dated authority has no occurrence
 *  yet and the tool must not invent a Work id for one. */
function occurrenceOf(receipt: Record<string, unknown>): Record<string, unknown> | null {
  const raw = receipt.occurrence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The occurrence's logical operation identity, from EITHER place 0193 puts it. A freshly admitted
 *  occurrence carries `logical_op_id` at the top level; a CONVERGED one (the replay branch, where
 *  the period already had a Work) carries the admitted attempt's own `outcome` object instead, and
 *  reading only the top level would drop the card for exactly the case where a human most needs to
 *  be shown the Work that already exists. */
function occurrenceLogicalOpId(occurrence: Record<string, unknown>): string {
  if (occurrence.logical_op_id != null) return String(occurrence.logical_op_id);
  const outcome = occurrence.outcome;
  if (outcome && typeof outcome === "object" && !Array.isArray(outcome)) {
    const inner = (outcome as Record<string, unknown>).logical_op_id;
    if (inner != null) return String(inner);
  }
  return "";
}

export async function runStartAccrualWork(
  ctx: ToolCtx,
  input: StartAccrualWorkInput,
): Promise<StartAccrualWorkResult> {
  if (!ctx.clientId) {
    return noClientRefusal(
      "accrual_work_needs_client_pin",
      "This conversation is not bound to a client, so it cannot configure an accrual.",
    );
  }
  const local = localAccrualRefusal(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const opKey = stableOpKey(ctx.taskId, START_ACCRUAL_WORK_TOOL, input);
  const accrual = accrualFromInput(input);
  const authorityRef = { kind: "accounting_work", id: input.authority_work_id };
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.create_accrual_adjustment_for($1::uuid, $2::uuid, $3::text, $4::jsonb,"
        + " $5::jsonb, $6::text, $7::text, $8::int, $9::text, $10::date, $11::date, $12::text) as r",
        [
          clientId,
          ctx.createdBy,
          input.purpose,
          JSON.stringify(authorityRef),
          JSON.stringify(accrual),
          input.frequency,
          input.day_rule,
          input.day_of_month ?? null,
          ACCRUAL_TIMEZONE,
          input.effective_from,
          input.effective_to,
          opKey,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (!receipt || receipt.accrual_id == null) {
      return {
        ok: false,
        code: "internal",
        reason: null,
        fix: null,
        message: "The accrual could not be configured. Nothing was recorded.",
        details: {},
      };
    }
    const occurrence = occurrenceOf(receipt);
    const workId = occurrence && occurrence.work_id != null ? String(occurrence.work_id) : "";
    return {
      ok: true,
      work_accepted:
        workId === ""
          ? null
          : {
              type: "work_accepted",
              work_id: workId,
              client_id: clientId,
              // 0193's `_plan_admit_occurrence` admits every occurrence through
              // `clara.admit_journal_work` with `adjustment_basis` NULL.
              purpose: "journal_entry",
              logical_op_id: occurrence === null ? "" : occurrenceLogicalOpId(occurrence),
            },
      accrual_id: String(receipt.accrual_id),
      plan_id: String(receipt.plan_id ?? ""),
      occurrence_due_on: occurrence && occurrence.due_date != null ? String(occurrence.due_date) : null,
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    return refusalFromError(error, "The accrual could not be configured.");
  }
}

export function buildToolsV20(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV19(ctx, modelId, segment), {
    [START_STAFF_EXPENSE_CLAIM_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE staff expense claim for the client pinned to "
        + "this conversation: a named employee paid for something out of their own pocket (or out "
        + "of an advance they already hold), itemised, from figures the human gave you. Amounts are "
        + "integer CENTS. Say WHO claimed it — an employee is never a supplier, and Clara enrols "
        + "them on the staff-advance register rather than minting a counterparty. Say how it is "
        + "settled: reimbursement (the firm owes them), advance_application (against a named live "
        + "advance) or already_settled (paid at the time). This does NOT post the entry — it queues "
        + "durable Work that posts it under the human's own authority, rechecked at commit. Say you "
        + "have QUEUED it, never that you have recorded it. If the claimant, the date the cost was "
        + "incurred, or an item's amount or account is missing, ask with clarify: the claim's basis "
        + "cannot be changed after admission.",
      inputSchema: startStaffExpenseClaimWorkInputSchema,
      execute: (input: StartStaffExpenseClaimWorkInput) => runStartStaffExpenseClaimWork(ctx, input, modelId),
    }),
    [START_ACCRUAL_WORK_TOOL]: tool({
      description:
        "Configure an ACCRUAL for the client pinned to this conversation: a cost the client has "
        + "incurred over a stated service period but has not been billed for, accrued to a "
        + "non-control liability and reversed when the bill arrives. Amounts are integer CENTS. The "
        + "service period and the authority window are the HUMAN's — never a period you read out of "
        + "a document, and never open-ended: the authority must end on or before the service period "
        + "ends. Name the accounting Work that carries the instruction authorising it. This "
        + "configures a schedule and may admit the current period's Work; it posts nothing itself, "
        + "and an authority that starts in the future is configured with nothing due yet — say so "
        + "rather than claiming a posting. If the period, the amount, the accounts or the "
        + "authorising Work are missing, ask with clarify.",
      inputSchema: startAccrualWorkInputSchema,
      execute: (input: StartAccrualWorkInput) => runStartAccrualWork(ctx, input),
    }),
  });
}
