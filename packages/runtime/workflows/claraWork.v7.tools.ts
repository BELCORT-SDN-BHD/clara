// @frozen
//
// FROZEN — part of the claraWork_v7 closure. THE TOOL SET FOR ONE SEGMENT.
//
// THE ROSTER IS v6's, UNCHANGED — ten tools, same names, same schemas, same descriptions, every
// one of them reached by import. What this module restates is ONE statement: the posting tool
// hands `CLARA_WORK_BUNDLE_V7_DIGEST` to `clara.wake_record_journal_entry`, where v6's hands v6's.
//
// WHY THAT ONE STATEMENT CANNOT BE REACHED BY IMPORT. `tests/pinned-work-bundle.mjs` compares
// `work.bundle.id`, `work.bundle.digest`, `operation_receipts.bundle_digest` and
// `work_execution_traces.bundle_id` against the PINNED version's own bundle module. A v7 run whose
// receipt carried v6's digest would be a receipt naming a contract the run was not served under —
// the exact drift that comparison exists to catch — so the digest is version-bound and so is the
// one function that sends it.
//
// EVERY TOOL NAME COMES FROM THE MODULE THAT DECLARES ITS STRING LITERAL. The parts-parity census
// dereferences a computed key through its import chain and refuses a chain whose next hop is a
// RE-EXPORT rather than a binding. v3's, v4's and v6's headers state the same rule; it has been
// paid for three times and is not paid for a fourth here.

import { tool } from "ai";
import type { PgExec } from "./chatTurn.v15.infra.js";
import { classifyWorkError } from "./claraWork.v7.errors.js";
import type { ClaraWorkBudgets } from "./claraWork.v1.bundle.js";
import { RECORD_JOURNAL_ENTRY_TOOL } from "./claraWork.v1.prompt.js";
import {
  recordJournalEntryInputSchema,
  routeWriteFailure,
  workScoped,
  workTestFault,
  type PostedEffect,
  type RecordJournalEntryInput,
  type RecordJournalEntryResult,
  type WorkBudgetLedger,
  type WorkToolCtx,
} from "./claraWork.v1.tools.js";
import { buildClaraWorkToolsV6 } from "./claraWork.v6.tools.js";
import { CLARA_WORK_BUNDLE_V7_DIGEST } from "./claraWork.v7.bundle.js";

export type { PostedEffect, RecordJournalEntryInput, WorkBudgetLedger, WorkToolCtx };

// ---------------------------------------------------------------------------
// The recording tool, restated with THIS bundle's digest (see this file's header).
// ---------------------------------------------------------------------------

const TRANSIENT_BACKOFF_MS = [120, 360, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** v1's `withTransientRetry`, restated because no predecessor exports it. Same ledger, same bound:
 *  at most `budgets.transientRetries` retries across the WHOLE segment, so three tool calls cannot
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
 *  from v1/v3/v4/v6 except for the bundle digest, which is v7's. */
export async function runRecordJournalEntryV7(
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
              CLARA_WORK_BUNDLE_V7_DIGEST,
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

/**
 * Build the closed tool set for ONE v7 segment.
 *
 * v6's ten tools BY CALL rather than by copy — the descriptions, the schemas, the four
 * execute-less question tools and the four reads are all v6's, so the two versions can never
 * disagree about what a tool says it does — with the posting tool REPLACED under the same name by
 * the one above. `Object.assign` takes the later value, and the name is unchanged because a
 * different digest on the same act is not a different act.
 */
export function buildClaraWorkToolsV7(ctx: WorkToolCtx, ledger: WorkBudgetLedger, budgets: ClaraWorkBudgets) {
  const v6 = buildClaraWorkToolsV6(ctx, ledger, budgets);
  return Object.assign({}, v6, {
    [RECORD_JOURNAL_ENTRY_TOOL]: tool({
      description: v6[RECORD_JOURNAL_ENTRY_TOOL].description,
      inputSchema: recordJournalEntryInputSchema,
      execute: (input: RecordJournalEntryInput) => runRecordJournalEntryV7(ctx, ledger, budgets, input),
    }),
  });
}
