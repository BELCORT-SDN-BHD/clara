// @frozen
//
// FROZEN — part of the claraWork_v4 closure. THE SERVER-OWNED TOOL SET, v4.
//
// THE ROSTER IS AC1's OWN SUBJECT, AND IT IS A FIXED OBJECT LITERAL. `buildClaraWorkToolsV4` at the
// foot of this file returns FIVE keys, and the five names come from the HASHED BUNDLE's own roster
// (`CLARA_WORK_TOOL_NAMES_V4`, declared as string literals in claraWork.v4.prompt.ts). There is no
// path — none — by which a string arriving from a basis, an answer, a source reference, a wiki
// page, a Knowledge record or the model's own output can add a key to that object, widen one of
// these zod schemas, or change which database door a tool reaches.
//
// THE WIDENING IS TWO QUESTIONS AND IT GRANTS NOTHING, which is the argument that makes it lawful
// under "prompt, file, wiki and imported OKF content cannot register tools, widen scope or grant
// authority". `answer_accrual_term` and `ask_knowledge_conflict` carry NO `execute`. Calling either
// IS the act: the segment stops on the CALL, and the WORKFLOW opens the question through
// `clara.open_work_question` and parks the run on a WDK hook. Neither can write a row, read a
// table, or reach a door. What they add is the ability to ask a NARROW question well — with the
// right fields, and with the one answer a model must never supply itself made structurally
// impossible.
//
// AND THAT IS WHY NEITHER TAKES ITS OWN FIELD LIST. `ask_question` lets the model declare one to
// six typed fields; these two do not. `answer_accrual_term`'s fields are the two dates, fixed here,
// because #652's whole rule is that a service period a MODEL derived may never enter the durable
// record (0140's law) — a model that could shape the field list could offer a default.
// `ask_knowledge_conflict`'s fields are ONE choice built from the rows the model named, plus
// "neither — I will correct the record", because #654's ruling is that the question PICKS NO
// WINNER. In both cases the narrowing is the capability.
//
// THE CHART READ IS v1's, REACHED BY IMPORT — `runListAccounts`, its credential path, its bounded
// transient retry, its budget ledger and its "a failed required read is TERMINAL, never
// `{accounts: []}`" posture — for the reason v2's and v3's headers give: importing a frozen
// implementation keeps one body for one act.
//
// THE RECORDING TOOL IS COPIED, AND THE COPY IS FORCED RATHER THAN CHOSEN, for exactly the reason
// v2's and v3's headers state at length: the bundle digest this tool hands to
// `clara.wake_record_journal_entry` is a CONSTANT read from its own bundle module, and a v4 run
// calling v3's body would write v3's digest into `clara.operation_receipts.bundle_digest` while
// `clara.accounting_work.bundle` said v4 — two records of one fact, disagreeing, in the two places
// an auditor would look. Everything else about the body is byte-carried.
//
// WHAT IS NOT HERE, DELIBERATELY:
//   · the egress dispatch — the SEGMENT's act, not a tool's (claraWork.v3.impl.ts's own rule);
//   · `apply_fixed_asset_particulars` — #639's apply is a WORKFLOW act performed after a commit,
//     not a choice the model makes. `packages/runtime/lib/fixed-asset-acquisition.ts` exports the
//     name of the act and the schema of its answer; claraWork.v4.impl.ts performs it;
//   · `read_prepayment_source` — #653's stanza asks for a read of the bound document's recorded
//     service period, and no such read is reachable from this lane: `clara.get_prepayment_schedule`
//     and its siblings are granted to `clara_authenticated` alone (0208 §D.1) and
//     `clara.document_service_periods` carries no select for any machine role. A tool that could
//     only return a grant refusal is not a capability.

import { tool } from "ai";
import { z } from "zod";
import type { PgExec } from "./chatTurn.v15.infra.js";
import { classifyWorkError } from "./claraWork.v4.errors.js";
import type { ClaraWorkBudgets } from "./claraWork.v1.bundle.js";
// EVERY TOOL NAME IS IMPORTED FROM THE MODULE THAT DECLARES ITS STRING LITERAL — the three carried
// ones from v1's PROMPT module, the two new ones from v4's — and NEVER through a module that merely
// re-exports them. The parts-parity census resolves a computed key by dereferencing the identifier
// through its import chain and refuses a chain whose next hop is a RE-EXPORT rather than a binding
// (check-parts-parity.mjs `dereferenceExpression`), so importing `LIST_ACCOUNTS_TOOL` from
// claraWork.v4.prompt.ts — which re-exports it — refuses the whole tool map. MEASURED at this cut:
// the first draft did exactly that and the gate answered "unclassifiable computed key at
// claraWork.v4.tools.ts:319". claraWork.v3.tools.ts's header states the same rule; this is the
// second time it has been paid for.
import {
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
} from "./claraWork.v1.prompt.js";
import { ANSWER_ACCRUAL_TERM_TOOL, ASK_KNOWLEDGE_CONFLICT_TOOL } from "./claraWork.v4.prompt.js";
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
import {
  WORK_FIELD_KINDS,
  askQuestionInputSchemaV3,
  workQuestionFieldSchema,
  workQuestionOptionSchema,
  workQuestionSourceRefSchema,
  type AskQuestionInputV3,
} from "./claraWork.v3.tools.js";
import { CLARA_WORK_BUNDLE_V4_DIGEST } from "./claraWork.v4.bundle.js";

export {
  ANSWER_ACCRUAL_TERM_TOOL, ASK_KNOWLEDGE_CONFLICT_TOOL,
  ASK_QUESTION_TOOL, LIST_ACCOUNTS_TOOL, RECORD_JOURNAL_ENTRY_TOOL,
  WORK_FIELD_KINDS, askQuestionInputSchemaV3, listAccountsInputSchema,
  recordJournalEntryInputSchema, workQuestionFieldSchema, workQuestionOptionSchema,
  workQuestionSourceRefSchema,
};
export type { AskQuestionInputV3, RecordJournalEntryInput, WorkBudgetLedger, WorkToolCtx };

// ---------------------------------------------------------------------------
// #652 — `answer_accrual_term`. The park, and nothing else.
// ---------------------------------------------------------------------------

/**
 * The TWO fields an accrual-term question asks, FIXED HERE and not model-supplied.
 *
 * `0180`'s field grammar is closed — the key matches `^[a-z][a-z0-9_]{0,63}$` and the kind is one
 * of five — and these two are `date`, which is what makes the answer a calendar fact the human
 * typed rather than a sentence a model could pre-fill. The keys are the accrual module's own
 * spelling (`service_period_start` / `service_period_end`), so a surface that renders the answer
 * and the door that later reads a term are naming the same two things.
 */
export const ACCRUAL_TERM_FIELDS = Object.freeze([
  Object.freeze({
    key: "service_period_start",
    label: "First day of the service period",
    kind: "date" as const,
    required: true,
  }),
  Object.freeze({
    key: "service_period_end",
    label: "Last day of the service period",
    kind: "date" as const,
    required: true,
  }),
]);

/**
 * THE MODEL SUPPLIES THE REASON, NEVER THE ANSWER. There is no date field in this schema and there
 * never will be: #652's ruling is that a service period the model derived may not become a durable
 * accounting fact, and a schema that could carry one would make that rule a convention.
 */
export const answerAccrualTermInputSchemaV4 = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe(
        "WHY the service period is absent and what you already read looking for it — the document "
        + "or instruction this Work came from, and what it did and did not say.",
      ),
    context: z
      .string()
      .max(4000)
      .optional()
      .describe("What you already know about the cost, so the human is not asked to repeat it."),
    source_ref: workQuestionSourceRefSchema
      .optional()
      .describe("The document, chat task or basis line this accrual came from, where there is one."),
  })
  .strict();

export type AnswerAccrualTermInputV4 = z.infer<typeof answerAccrualTermInputSchemaV4>;

/** The question text a term park always asks. ONE sentence, spelled once, so the parked question, a
 *  Needs-you row and the Work detail all read the same words. #653's own stanza uses the identical
 *  sentence for the prepayment park it could not ship; when that lane gains its read, it reuses
 *  this one rather than inventing a second. */
export const ACCRUAL_TERM_QUESTION = "Over what service period was this cost incurred?";

// ---------------------------------------------------------------------------
// #654 — `ask_knowledge_conflict`. Two to four rows, no winner.
// ---------------------------------------------------------------------------

/** ONE candidate row of a knowledge conflict, as the model names it. Every field is required and
 *  none is optional-by-kindness: a row with no applicability statement is a row a human cannot
 *  choose between, and a row with no `record_id` addresses nothing. */
export const knowledgeConflictRowSchema = z
  .object({
    record_id: z.string().uuid().describe("The knowledge record's STABLE id, exactly as the context block gave it."),
    scope_kind: z.enum(["client", "firm"]).describe("Whether this row is the client's own record or a firm-wide rule."),
    applies_when: z
      .string()
      .trim()
      .min(1)
      .max(400)
      .describe("The condition this row says it holds under, in the record's own terms."),
    value: z.string().trim().min(1).max(400).describe("What this row records, rendered as the human would read it."),
  })
  .strict();

/**
 * TWO TO FOUR ROWS. Two because a conflict needs two sides; four because a question a person can
 * actually answer has a bounded number of options, and a run caught between five recorded facts has
 * found a data defect rather than a decision.
 */
export const askKnowledgeConflictInputSchemaV4 = z
  .object({
    knowledge_key: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("The registered knowledge key all of these rows are recorded under."),
    rows: z.array(knowledgeConflictRowSchema).min(2).max(4).describe("The recorded facts that cannot all govern here."),
    why_it_blocks: z
      .string()
      .trim()
      .min(1)
      .max(600)
      .describe("What you cannot do until this is settled, naming the part of the basis it bears on."),
  })
  .strict();

export type AskKnowledgeConflictInputV4 = z.infer<typeof askKnowledgeConflictInputSchemaV4>;

// ---------------------------------------------------------------------------
// The recording tool, restated with THIS bundle's digest (see this file's header).
// ---------------------------------------------------------------------------

const TRANSIENT_BACKOFF_MS = [120, 360, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** v1's `withTransientRetry`, restated because neither v1 nor v3 exports it. Same ledger, same
 *  bound: at most `budgets.transientRetries` retries across the WHOLE segment, so three tool calls
 *  cannot each spend three. Every non-transient classification is rethrown for the caller to
 *  route. */
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
 *  from v1/v3 except for the bundle digest, which is v4's. */
export async function runRecordJournalEntryV4(
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
              CLARA_WORK_BUNDLE_V4_DIGEST,
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

/** Build the closed tool set for ONE v4 segment. The names come from the hashed bundle's own
 *  roster, so a tool this file could build but the bundle does not name cannot exist. */
export function buildClaraWorkToolsV4(ctx: WorkToolCtx, ledger: WorkBudgetLedger, budgets: ClaraWorkBudgets) {
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
      execute: (input: RecordJournalEntryInput) => runRecordJournalEntryV4(ctx, ledger, budgets, input),
    }),
    // NO `execute`, exactly as v1's, v2's and v3's have none: calling this tool is the ACT. The
    // segment stops on the call, the workflow opens the shared question through
    // clara.open_work_question and parks the run on a WDK hook until a human answers it, it
    // expires, or the Work is cancelled.
    [ASK_QUESTION_TOOL]: tool({
      description:
        "Ask the human for the ONE fact or decision you are missing, instead of guessing. Give the question, the " +
        "REASON it blocks you, the SUPPORTING SOURCE where there is one (the document, chat task or basis line " +
        "this is about), and one to six TYPED fields the answer must fill (text, money in integer cents, " +
        "date, choice with options, or an account code from this client's chart). This parks the Work; the answer " +
        "is rechecked against the authority that is current when they answer. Do not use this to confirm figures " +
        "you were already given.",
      inputSchema: askQuestionInputSchemaV3,
    }),
    // NO `execute` — same act, narrower question. The FIELDS are not yours: this question always
    // asks a person for the two dates and nothing else.
    [ANSWER_ACCRUAL_TERM_TOOL]: tool({
      description:
        "Ask a human for an ACCRUAL's service period, when the document or instruction this Work came from never " +
        "stated one. Say WHY it is absent and what you already read looking for it. You supply no dates: a service " +
        "period a model derived can never become a durable accounting fact, so this question always asks a person " +
        "for the first and last day and nothing else. Do NOT use it when the Work's own basis already carries a " +
        "service period — the basis is the record — and never use it to confirm a period you were given.",
      inputSchema: answerAccrualTermInputSchemaV4,
    }),
    // NO `execute` — same act. The question names every row and picks no winner.
    [ASK_KNOWLEDGE_CONFLICT_TOOL]: tool({
      description:
        "Ask a human which of the client's RECORDED FACTS applies, when two or more rows under the same knowledge " +
        "key cannot all govern what you are doing — a firm-wide rule and a client exception that disagree, or two " +
        "client records with different applicability. Name every row you are caught between by its record id, its " +
        "scope and its applicability, and say what it blocks. PICK NO WINNER: ranking a firm's recorded facts is a " +
        "person's judgement. The question always offers them the answer that neither applies and the record needs " +
        "correcting. Use it only for a conflict that actually blocks this Work, never to tidy the register.",
      inputSchema: askKnowledgeConflictInputSchemaV4,
    }),
  };
}
