// @frozen
//
// FROZEN — part of the claraWork_v2 closure (#629). THE SERVER-OWNED TOOL SET, v2.
//
// THE CHART READ IS v1's, REACHED BY IMPORT. `runListAccounts` — its credential path, its bounded
// transient retry, its budget ledger and its "a failed required read is TERMINAL, never
// `{accounts: []}`" posture — is UNCHANGED by this ticket, so it is called, never copied.
// ARCHITECTURE §5's rule that the server owns the tool set is about who may REGISTER a tool, not
// about which file the body lives in; importing a frozen implementation keeps one body for one act,
// which is the same discipline claraWork.v1.impl.ts states for chatTurn_v10's four park/resume
// steps.
//
// THE RECORDING TOOL IS COPIED, AND THE COPY IS FORCED RATHER THAN CHOSEN. `runRecordJournalEntry`
// passes `CLARA_WORK_BUNDLE_V1_DIGEST` to `clara.wake_record_journal_entry` as a CONSTANT read from
// v1's own bundle module — the digest is not a parameter and the body is frozen. A v2 run calling
// it would write v1's digest into `clara.operation_receipts.bundle_digest`, which is the estate's
// audit-grade claim "this effect was produced by exactly this bundle", while
// `clara.accounting_work.bundle` (stamped by the claim) said v2. Two records of one fact,
// disagreeing, in the two places an auditor would look. So the body is restated here with the
// digest taken from the CONTEXT, and everything else about it — the one wake wrapper, the
// prior-refusal gate, the classifier routing, the crash barrier — is byte-carried. The three
// helpers that surround it (`workScoped`, `routeWriteFailure`, `workTestFault`) are still v1's, by
// import; only `withTransientRetry` is restated, because v1 does not export it.
//
// THE THIRD TOOL IS WHY THIS VERSION EXISTS AT ALL. `ask_question`'s INPUT SCHEMA is what #629
// changes: a sentence becomes a sentence plus a REASON plus one to six TYPED FIELDS. The schema is
// the wall that makes the shared form possible — the database validates the same field grammar
// again in `clara.open_work_question`, so a model that invents a seventh field or a `colour` kind
// is refused twice, by two independent implementations, and the run settles rather than parking on
// a question no surface can render.
//
// IT STILL CARRIES NO `execute`, exactly as v1's does and exactly as chat's `clarify` does: calling
// this tool IS the act. The segment stops on the tool CALL, and the WORKFLOW opens the shared
// question and parks the run on a WDK hook. A tool with an `execute` would let the model open a
// question inside the model loop, where the workflow could not park on it.

import { tool } from "ai";
import { z } from "zod";
import type { PgExec } from "./chatTurn.v15.infra.js";
import { classifyWorkError } from "./claraWork.v2.errors.js";
import type { ClaraWorkBudgets } from "./claraWork.v1.bundle.js";
// The three tool NAMES come from v1's PROMPT module, where the string literals are declared —
// never from v1's tools module, which merely re-exports them. The parts-parity census resolves a
// computed key by following the import to a literal and refuses a chain it cannot follow, so the
// re-export hop is the difference between a classifiable `[LIST_ACCOUNTS_TOOL]:` key and a refused
// one. Measured, not stylistic.
import {
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
} from "./claraWork.v1.prompt.js";
import {
  listAccountsInputSchema,
  recordJournalEntryInputSchema,
  routeWriteFailure,
  runListAccounts,
  workScoped,
  workTestFault,
  type PostedEffect,
  type RecordJournalEntryInput,
  type RecordJournalEntryResult,
  type WorkBudgetLedger,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import { CLARA_WORK_BUNDLE_V2_DIGEST } from "./claraWork.v2.bundle.js";

export {
  ASK_QUESTION_TOOL, LIST_ACCOUNTS_TOOL, RECORD_JOURNAL_ENTRY_TOOL,
  listAccountsInputSchema, recordJournalEntryInputSchema,
};
export type { RecordJournalEntryInput, WorkBudgetLedger, WorkToolCtx };

/** The field kinds a work question may declare. THE SAME FIVE `clara._assert_work_question_fields`
 *  admits, spelled here so the model is refused before a round trip rather than after one. */
export const WORK_FIELD_KINDS = ["text", "money", "date", "choice", "account"] as const;

/** ONE option of a `choice` field. Both halves are required and neither may be blank: an option
 *  with no label is a radio button with no name, and an option with no value is one the answer
 *  door can never match. */
export const workQuestionOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(200).describe("The value the answer must carry for this option."),
    label: z.string().trim().min(1).max(200).describe("What a human reads on the control."),
  })
  .strict();

/**
 * ONE typed field of a work question.
 *
 * `key` IS `^[a-z][a-z0-9_]{0,63}$`, AND IT IS THE SAME REGEX THE DATABASE ENFORCES. It is the
 * answer object's own key, the web form's control name, and the path a validation refusal names
 * (`detail.field`) so the browser can focus the first invalid control. A key that differed between
 * the two implementations would make that focus land on nothing.
 *
 * `options` is required for `choice` and forbidden for everything else, expressed as a refinement
 * rather than a discriminated union: the model writes ONE object shape, and a union would make its
 * failure message name a branch rather than a field.
 */
export const workQuestionFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).describe("The answer key: lower snake_case, unique within this question."),
    label: z.string().trim().min(1).max(200).describe("The question this one field asks, as a human reads it."),
    kind: z.enum(WORK_FIELD_KINDS).describe("text | money (integer cents) | date (YYYY-MM-DD) | choice | account (a code from this client's chart)."),
    required: z.boolean().optional().describe("Defaults to true. Mark a field optional only when you can finish without it."),
    options: z.array(workQuestionOptionSchema).min(2).max(20).optional().describe("Required for kind='choice', forbidden otherwise."),
    unit: z.string().trim().min(1).max(40).optional().describe("A unit shown beside the control, e.g. 'MYR cents'."),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.kind === "choice" && field.options === undefined) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "a choice field must declare its options" });
    }
    if (field.kind !== "choice" && field.options !== undefined) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "only a choice field may declare options" });
    }
  });

/**
 * v2's `ask_question` input.
 *
 * ONE TO SIX FIELDS. The lower bound is what makes the shared form possible at all — a question
 * with no fields is prose, and prose cannot be answered from Needs-you or from a Clara card. The
 * upper bound is what keeps the bounded stepper bounded: six related facts is already a long walk
 * for a person who came to look at one Work, and a seventh is a sign the run should have asked a
 * narrower question.
 *
 * `reason` IS REQUIRED, and it is the one thing v2 asks the model for that v1 did not. #629 asks
 * every surface to render "the missing fact, reason and supporting source"; a reason the model did
 * not supply is a reason no surface can show, and "the agent needs more information" is not one.
 */
export const askQuestionInputSchemaV2 = z
  .object({
    question: z.string().trim().min(1).max(2000).describe("The single decision or fact you need a human to supply."),
    reason: z.string().trim().min(1).max(2000).describe("WHY you cannot proceed without it, naming what you already read or were given."),
    context: z.string().max(4000).optional().describe("What you already know, so the human is not asked to repeat it."),
    fields: z.array(workQuestionFieldSchema).min(1).max(6).describe("One to six typed fields the answer must fill."),
  })
  .strict();

export type AskQuestionInputV2 = z.infer<typeof askQuestionInputSchemaV2>;

// ---------------------------------------------------------------------------
// The recording tool, restated with THIS bundle's digest (see this file's header).
// ---------------------------------------------------------------------------

const TRANSIENT_BACKOFF_MS = [120, 360, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** v1's `withTransientRetry`, restated because v1 does not export it. Same ledger, same bound: at
 *  most `budgets.transientRetries` retries across the WHOLE segment, so three tool calls cannot
 *  each spend three. Every non-transient classification is rethrown for the caller to route. */
async function withTransientRetry<T>(ledger: WorkBudgetLedger, budgets: ClaraWorkBudgets, fn: () => Promise<T>): Promise<T> {
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const classification = classifyWorkError(error);
      if (classification.kind !== "transient") throw error;
      if (ledger.transientRetries >= budgets.transientRetries) throw error;
      const attempt = ledger.transientRetries;
      ledger.transientRetries += 1;
      await sleep(TRANSIENT_BACKOFF_MS[Math.min(attempt, TRANSIENT_BACKOFF_MS.length - 1)] ?? 900);
    }
  }
}

/** THE ONE WRITE. Exactly one wake wrapper call; the database decides everything. Byte-carried
 *  from v1 except for the bundle digest, which is v2's. */
export async function runRecordJournalEntryV2(
  ctx: WorkToolCtx,
  ledger: WorkBudgetLedger,
  budgets: ClaraWorkBudgets,
  input: RecordJournalEntryInput,
): Promise<RecordJournalEntryResult> {
  if (ledger.toolCalls >= budgets.toolCalls) {
    ledger.exhausted = "toolCalls";
    if (ledger.terminal === null) ledger.terminal = { kind: "budget_exhausted", detail: "toolCalls" };
    return { ok: false, terminal: true, refusal: { code: "budget_exhausted", reason: "toolCalls", message: "This Work reached its tool-call budget before recording the entry." } };
  }
  ledger.toolCalls += 1;

  // A refusal or a conflict already ended this run. The model does not get a second attempt with
  // mutated parameters — spec §4, and the reason this check is here rather than only in the stop
  // condition: a single model step can emit two tool calls, and a stop condition only runs BETWEEN
  // steps.
  if (ledger.terminal !== null && (ledger.terminal.kind === "refusal" || ledger.terminal.kind === "conflict")) {
    const prior = ledger.refusal ?? { code: "CLR10", reason: null, message: "This operation was already refused." };
    return { ok: false, terminal: true, refusal: prior };
  }

  let receipt: Record<string, unknown> | null;
  try {
    receipt = await withTransientRetry(ledger, budgets, () =>
      workScoped(ctx, (c: PgExec) =>
        c
          .query(
            `select clara.wake_record_journal_entry($1::uuid, $2::uuid, $3::text, $4::jsonb,
               $5::text, $6::text, $7::text) as r`,
            [
              ctx.clientId,
              ctx.workId,
              ctx.logicalOpId,
              JSON.stringify(input.basis),
              CLARA_WORK_BUNDLE_V2_DIGEST,
              ctx.runId,
              input.rationale,
            ],
          )
          .then((r) => (r.rows[0]?.r ?? null) as Record<string, unknown> | null),
      ),
    );
  } catch (error) {
    return routeWriteFailure(ledger, budgets, classifyWorkError(error));
  }

  if (!receipt || receipt.posted !== true) {
    const classification = classifyWorkError({ code: "internal", message: "the recording verb returned no receipt" });
    ledger.terminal = { kind: "refusal", detail: classification };
    ledger.refusal = { code: classification.code, reason: classification.reason, message: classification.message };
    return { ok: false, terminal: true, refusal: ledger.refusal };
  }

  const posted: PostedEffect = {
    entry_id: String(receipt.entry_id ?? ""),
    receipt_id: String(receipt.receipt_id ?? ""),
    revision_token: receipt.revision_token == null ? null : String(receipt.revision_token),
    logical_op_id: String(receipt.logical_op_id ?? ctx.logicalOpId),
    replayed: receipt.replayed === true,
  };
  ledger.posted = posted;
  ledger.terminal = { kind: "posted", detail: posted };

  // THE CRASH BARRIER (test mode only). The database has COMMITTED; the WDK step has not
  // checkpointed. Exiting here is the only way to produce that window deterministically.
  if (workTestFault() === "exit_after_commit") {
    console.error(`[clara-runtime] CLARA_WORK_TEST_FAULT=exit_after_commit — exiting after commit, before checkpoint (work=${ctx.workId})`);
    process.exit(137);
  }

  return { ok: true, posted, replayed: posted.replayed };
}

/** Build the closed tool set for ONE v2 segment. The names come from the hashed bundle's own
 *  roster, so a tool this file could build but the bundle does not name cannot exist. */
export function buildClaraWorkToolsV2(ctx: WorkToolCtx, ledger: WorkBudgetLedger, budgets: ClaraWorkBudgets) {
  return {
    [LIST_ACCOUNTS_TOOL]: tool({
      description:
        "Read this client's chart of accounts with their current approved debit and credit totals. " +
        "Call this FIRST. It is a required read: if it fails, stop and report that the chart could not be read — " +
        "never continue as though the chart were empty.",
      inputSchema: listAccountsInputSchema,
      execute: () => runListAccounts(ctx, ledger, budgets),
    }),
    [RECORD_JOURNAL_ENTRY_TOOL]: tool({
      description:
        "Record the admitted journal entry. Echo the basis you were given VERBATIM — the database re-derives its " +
        "digest and refuses a changed one. The database rechecks the initiating human's current role and client " +
        "access, the posting period, every account code, the control-account rule and the exact-cent balance AT " +
        "COMMIT, then returns the entry id and the operation receipt. A refusal is final for this run: report the " +
        "named reason and stop, never call this tool again with different figures.",
      inputSchema: recordJournalEntryInputSchema,
      execute: (input: RecordJournalEntryInput) => runRecordJournalEntryV2(ctx, ledger, budgets, input),
    }),
    // NO `execute`, exactly as v1's has none: calling this tool is the ACT. The segment stops on
    // the call, the workflow opens the shared question through clara.open_work_question and parks
    // the run on a WDK hook until a human answers it, it expires, or the Work is cancelled.
    [ASK_QUESTION_TOOL]: tool({
      description:
        "Ask the human for the ONE fact or decision you are missing, instead of guessing. Give the question, the " +
        "REASON it blocks you, and one to six TYPED fields the answer must fill (text, money in integer cents, " +
        "date, choice with options, or an account code from this client's chart). This parks the Work; the answer " +
        "is rechecked against the authority that is current when they answer. Do not use this to confirm figures " +
        "you were already given.",
      inputSchema: askQuestionInputSchemaV2,
    }),
  };
}
