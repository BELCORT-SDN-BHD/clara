// @frozen
//
// FROZEN — part of the claraWork_v1 closure (#623). THE SERVER-OWNED TOOL SET, and "server-
// owned" is the load-bearing half: the roster is `CLARA_WORK_TOOL_NAMES` inside the hashed
// bundle, the schemas are written here, and every implementation is a function in this frozen
// file. NOTHING a model reads — no file, no memo, no chat message, no repository AGENTS.md —
// can register a tool, widen a schema, or reach a database verb that is not one of these three.
// ARCHITECTURE §5: "工具集合由服务器按实际能力与 scope 提供，文件内容不能注册工具或扩权."
//
// THREE TOOLS, AND WHY THERE IS NO FOURTH.
//   list_accounts        the REQUIRED read. Client-pinned by the run's own context, never by a
//                        tool argument, and it FAILS LOUDLY rather than returning an empty
//                        chart (ARCHITECTURE §5: "必要 Knowledge 读取失败不能伪装为空").
//   record_journal_entry the ONE write. Exactly one wake wrapper, under an `interactive_client`
//                        credential minted OBO the initiating human — never a service identity,
//                        never an impersonation. The DB rechecks that human's LIVE role, the
//                        client, the period, the accounts, the control-class rule, the balance
//                        and the admitted basis digest AT COMMIT, and returns the receipt.
//   ask_question         the park. It carries NO `execute`, exactly as chat's `clarify` does:
//                        the segment stops on the tool CALL, the workflow opens the shared
//                        question through clara.open_interruption and parks on a WDK hook.
// There is no create-account tool, no amend-basis tool and no read-any-table tool, because none
// of those is in this Work's authority and adding one here would grant it.
//
// THE CREDENTIAL PATH, STATED SO A READER CAN CHECK IT AGAINST THE DATABASE. `workScoped` mints
// `interactive_client` OBO `ctx.createdBy`, pinned to `ctx.clientId`, and runs ONE statement on
// the WRITE pool (which SET ROLEs to clara_wake_interactive on checkout). Migration 0178 must
// therefore carry BOTH halves for this to reach anything: the
// ('interactive_client','wake_record_journal_entry') allowlist row that
// clara.assert_wake_allowed reads, AND the Postgres EXECUTE grant on the wrapper to the role the
// write pool actually connects as. An allowlist row alone is not a grant — chatTurn.v14.infra.ts
// records the day that distinction cost a live lane, measured at 0 of 13.
//
// IT IS A SEPARATE HELPER FROM `questionScoped` / `bankScoped` / `freeformScoped` FOR THE REASON
// THIS ESTATE HAS ALREADY WRITTEN DOWN TWICE: each of those names, in its own frozen docblock,
// exactly one call path. Reusing one here would leave an earlier closure's claim misleading to a
// reader even though its code never changes (chatTurn.v14.infra.ts's own words). The body is the
// same two lines; the name and the docblock are the contract.
//
// THE FAULT INJECTION IS TEST-MODE-ONLY AND IT IS DELIBERATE. `CLARA_WORK_TEST_FAULT=
// exit_after_commit` is honoured ONLY when `RELAY_TEST_MODE=1`, and it exists to prove the one
// property no in-process assertion can: a crash AFTER the database committed and BEFORE the WDK
// step checkpointed re-executes the step, whose tool call REPLAYS onto the same receipt. Both
// conditions are read at CALL time, not at module load, so a production process cannot be
// talked into this branch by a late environment mutation either.

import { tool } from "ai";
import { z } from "zod";
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import { classifyWorkError, type WorkErrorClass } from "./claraWork.v1.errors.js";
import {
  ASK_QUESTION_TOOL,
  LIST_ACCOUNTS_TOOL,
  RECORD_JOURNAL_ENTRY_TOOL,
} from "./claraWork.v1.prompt.js";
import { CLARA_WORK_BUNDLE_V1_DIGEST, type ClaraWorkBudgets } from "./claraWork.v1.bundle.js";

export { ASK_QUESTION_TOOL, LIST_ACCOUNTS_TOOL, RECORD_JOURNAL_ENTRY_TOOL };

// ---------------------------------------------------------------------------
// The admitted basis — the DATABASE's own field spelling, carried verbatim.
// ---------------------------------------------------------------------------

/** ONE line of the admitted basis. Cents are INTEGERS; exactly one side is greater than zero.
 *  `.strict()` is the point: an extra key the model invented would change the canonical basis
 *  and be refused `basis_mismatch` at commit — refusing it here says so one layer earlier. */
export const journalBasisLineSchema = z
  .object({
    account_code: z.string().trim().min(1).describe("An account code that already exists in this client's chart."),
    debit_cents: z.number().int().min(0).describe("Integer cents debited. Zero when this line is a credit."),
    credit_cents: z.number().int().min(0).describe("Integer cents credited. Zero when this line is a debit."),
    // NULLISH, not merely optional. BOTH admission paths write an absent narration as an
    // EXPLICIT null — src/workRoutes.ts's `toDbBasis` and chatTurn.v18.tools' `basisFromInput`
    // each spell it `description: … ?? null` — so `clara.accounting_work.basis` stores
    // `"description": null`, the run hands the model exactly that, and a schema that admitted
    // only `undefined` would reject the model's own faithful echo. Measured: it settled the Work
    // `failed`/`no_effect` with nothing to point at. The database canonicaliser folds null and
    // absent to the same value, so both echoes hash to the admitted digest.
    description: z.string().max(2000).nullish().describe("The line narration, echoed from the admitted basis (may be null)."),
  })
  .strict();

/** The admitted basis, exactly as `clara.accounting_work.basis` stores it. */
export const journalBasisSchema = z
  .object({
    posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The posting date, YYYY-MM-DD, echoed from the admitted basis."),
    memo: z.string().trim().min(1).max(4000).describe("The memo, echoed from the admitted basis."),
    currency: z.literal("MYR").describe("Always MYR in this lane."),
    lines: z.array(journalBasisLineSchema).min(2).describe("Two or more lines, echoed from the admitted basis."),
  })
  .strict();

export type JournalBasis = z.infer<typeof journalBasisSchema>;

export const recordJournalEntryInputSchema = z
  .object({
    basis: journalBasisSchema,
    rationale: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .describe("Why this entry is being recorded, in your own words, for the operation receipt."),
  })
  .strict();

export type RecordJournalEntryInput = z.infer<typeof recordJournalEntryInputSchema>;

export const listAccountsInputSchema = z.object({}).strict();

export const askQuestionInputSchema = z
  .object({
    question: z.string().trim().min(1).max(2000).describe("The single decision or fact you need a human to supply."),
    context: z.string().max(4000).optional().describe("What you already know, so the human is not asked to repeat it."),
  })
  .strict();

export type AskQuestionInput = z.infer<typeof askQuestionInputSchema>;

// ---------------------------------------------------------------------------
// Tool results — the shapes the segment reads (never re-derives).
// ---------------------------------------------------------------------------

export type AccountRow = { account_code: string; name: string; debit_cents: string; credit_cents: string };

export type ListAccountsResult =
  | { ok: true; accounts: AccountRow[] }
  | { ok: false; terminal: true; required_read_failed: true; code: string; reason: string | null; message: string };

export type PostedEffect = {
  entry_id: string;
  receipt_id: string;
  revision_token: string | null;
  logical_op_id: string;
  replayed: boolean;
};

export type RecordJournalEntryResult =
  | { ok: true; posted: PostedEffect; replayed: boolean }
  | { ok: false; terminal: true; refusal: { code: string; reason: string | null; message: string } }
  | { ok: false; terminal: false; retry: { code: string; reason: string | null; message: string; kind: string } };

/** The mutable, PER-SEGMENT budget ledger. Handed to `buildClaraWorkTools` so the tools debit it
 *  as they run and the segment can read what was spent — "预算有限且被记录" is two claims, and a
 *  counter nobody reads discharges only the first. */
export type WorkBudgetLedger = {
  toolCalls: number;
  replans: number;
  transientRetries: number;
  /** Set by the FIRST terminal outcome so the stop condition and the settle agree on one story. */
  terminal: null | { kind: "posted" | "refusal" | "conflict" | "required_read_failed" | "budget_exhausted"; detail: unknown };
  posted: PostedEffect | null;
  refusal: { code: string; reason: string | null; message: string } | null;
  exhausted: string | null;
};

export function newBudgetLedger(): WorkBudgetLedger {
  return { toolCalls: 0, replans: 0, transientRetries: 0, terminal: null, posted: null, refusal: null, exhausted: null };
}

/** The per-run execution context. `ToolCtx`'s four fields (firm, client, initiator, task) plus
 *  the four this Work's identity adds. The basis is the ADMITTED one, read from the Work row —
 *  never from a model argument — so the echo can be compared before a wake call is even made. */
export type WorkToolCtx = ToolCtx & {
  clientId: string;
  workId: string;
  logicalOpId: string;
  runId: string;
  basis: JournalBasis;
};

// ---------------------------------------------------------------------------
// The credential path.
// ---------------------------------------------------------------------------

/**
 * #623 — the ONE call path `clara.wake_record_journal_entry` is reached through: an
 * `interactive_client` credential, pinned to this Work's client and minted OBO the human who
 * initiated it, running on the WRITE pool. Refuses without a client rather than falling back to
 * plain `interactive`: an accounting Work with no client has no books to post into, and a
 * client-less credential would be refused by the wrapper's own pin check one layer further from
 * the cause.
 *
 * NO HUMAN IMPERSONATION. `on_behalf_of` is the initiator; the ACTING actor the receipt records
 * is `clara.agent_user_id()`. The mint carries the human's authority, not their identity, and a
 * demoted or removed member's outstanding credential goes inert at `clara.wake_context()`.
 *
 * The secret is minted, used and committed inside ONE step execution attempt; it never crosses a
 * WDK step boundary (contract §4.1) and is never returned, logged or persisted.
 */
export async function workScoped<T>(ctx: WorkToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  if (!ctx.clientId) {
    throw Object.assign(new Error("an accounting work run needs a client-pinned credential"), {
      code: "CLR11",
      detail: '{"reason":"credential_client_pin"}',
    });
  }
  const p = pools();
  const { secret } = await p.mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId);
  return p.withWriteWakeScoped(secret, fn);
}

/** The REQUIRED read's own path: the READ pool, a plain `interactive` credential minted OBO the
 *  initiator, and `clara.trial_balance` — the estate's existing client-scoped read over
 *  `clara.coa_accounts` that chatTurn_v10's own `trial_balance` tool has used since Wave E. Its
 *  client argument comes from the RUN's context, never from a model argument, so no tool call
 *  can point it at another tenant's chart. */
async function readScopedWork<T>(ctx: WorkToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  const p = pools();
  const { secret } = await p.mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return p.withReadWakeScoped(secret, fn);
}

// ---------------------------------------------------------------------------
// Fault injection (RELAY_TEST_MODE only).
// ---------------------------------------------------------------------------

/** Read at CALL time, never at module load — see this file's header. Exported so the unit cell
 *  can prove the production combination (no RELAY_TEST_MODE) is inert without spawning. */
export function workTestFault(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.RELAY_TEST_MODE !== "1") return null;
  const fault = env.CLARA_WORK_TEST_FAULT;
  return typeof fault === "string" && fault.length > 0 ? fault : null;
}

// ---------------------------------------------------------------------------
// Bounded transient retry.
// ---------------------------------------------------------------------------

const TRANSIENT_BACKOFF_MS = [120, 360, 900];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `fn`, retrying ONLY classified-transient faults, at most `budgets.transientRetries`
 *  times across the whole segment (the ledger is shared, so three tool calls cannot each spend
 *  three retries). Every other classification is rethrown for the caller to route. */
async function withTransientRetry<T>(
  ledger: WorkBudgetLedger,
  budgets: ClaraWorkBudgets,
  fn: () => Promise<T>,
): Promise<T> {
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

// ---------------------------------------------------------------------------
// The three tools.
// ---------------------------------------------------------------------------

/** The ONE sentence a failed required read produces, wherever it surfaces. */
export const REQUIRED_READ_FAILED_MESSAGE =
  "The client's chart of accounts could not be read, so nothing was recorded.";

function budgetExhausted(ledger: WorkBudgetLedger, which: string): void {
  ledger.exhausted = which;
  if (ledger.terminal === null) ledger.terminal = { kind: "budget_exhausted", detail: which };
}

/** The REQUIRED accounts read. A failure is TERMINAL and typed — never `{accounts: []}`. */
export async function runListAccounts(
  ctx: WorkToolCtx,
  ledger: WorkBudgetLedger,
  budgets: ClaraWorkBudgets,
): Promise<ListAccountsResult> {
  if (ledger.toolCalls >= budgets.toolCalls) {
    budgetExhausted(ledger, "toolCalls");
    return { ok: false, terminal: true, required_read_failed: true, code: "budget_exhausted", reason: "toolCalls", message: "This Work reached its tool-call budget." };
  }
  ledger.toolCalls += 1;
  try {
    const accounts = await withTransientRetry(ledger, budgets, () =>
      readScopedWork(ctx, (c: PgExec) =>
        c
          // `jsonb_agg(t ORDER BY t.account_code)` — the aggregate's own ORDER BY over the
          // function's TABLE column. NOT `order by t->>'account_code'`: `t` is a RECORD here, the
          // jsonb `->>` operator has no record overload, and PostgreSQL answers that with a bare
          // 42883 that this closure's own classifier can only read as "migration 0178 is not
          // deployed" — a true-sounding, entirely wrong diagnosis for a chart read.
          .query("select coalesce(jsonb_agg(t order by t.account_code), '[]'::jsonb) as tb from clara.trial_balance($1) t", [ctx.clientId])
          .then((r) => (r.rows[0]?.tb ?? []) as AccountRow[]),
      ),
    );
    return { ok: true, accounts };
  } catch (error) {
    const classification = classifyWorkError(error);
    // ONE message for both the tool result and the Work's own `error` payload. The classifier's
    // generic sentence ("the runtime lacks a grant…") is true but answers a different question
    // than the human is asking; what they need to know is that the CHART could not be read and
    // therefore nothing was recorded. Rebuilt field by field rather than spread — an object
    // spread anywhere under packages/runtime is refused by the parts-parity census.
    const readFailure: WorkErrorClass = {
      kind: classification.kind,
      code: classification.code,
      reason: classification.reason,
      message: REQUIRED_READ_FAILED_MESSAGE,
      recoverable: true,
      terminal: true,
    };
    ledger.terminal = { kind: "required_read_failed", detail: readFailure };
    return {
      ok: false,
      terminal: true,
      required_read_failed: true,
      code: readFailure.code,
      reason: readFailure.reason,
      message: REQUIRED_READ_FAILED_MESSAGE,
    };
  }
}

/** THE ONE WRITE. Exactly one wake wrapper call; the database decides everything. */
export async function runRecordJournalEntry(
  ctx: WorkToolCtx,
  ledger: WorkBudgetLedger,
  budgets: ClaraWorkBudgets,
  input: RecordJournalEntryInput,
): Promise<RecordJournalEntryResult> {
  if (ledger.toolCalls >= budgets.toolCalls) {
    budgetExhausted(ledger, "toolCalls");
    return { ok: false, terminal: true, refusal: { code: "budget_exhausted", reason: "toolCalls", message: "This Work reached its tool-call budget before recording the entry." } };
  }
  ledger.toolCalls += 1;

  // A refusal or a conflict already ended this run. The model does not get a second attempt with
  // mutated parameters — spec §4, and the reason this check is here rather than only in the stop
  // condition: a single model step can emit two tool calls, and a stop condition only runs
  // BETWEEN steps.
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
              CLARA_WORK_BUNDLE_V1_DIGEST,
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
    // The verb returned without posting and without raising. Nothing in 0178 does this today;
    // treating it as a visible invariant is the only honest reading of an unrecognised answer.
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

/** Route a classified write failure into either a model-visible repair (inside budgets.replans)
 *  or a terminal outcome. Exported so the classifier cell drives the ACTUAL routing rather than
 *  re-implementing it. */
export function routeWriteFailure(
  ledger: WorkBudgetLedger,
  budgets: ClaraWorkBudgets,
  classification: WorkErrorClass,
): RecordJournalEntryResult {
  const named = { code: classification.code, reason: classification.reason, message: classification.message };
  if (classification.kind === "invalid_input" || classification.kind === "state_changed") {
    if (ledger.replans >= budgets.replans) {
      budgetExhausted(ledger, "replans");
      return { ok: false, terminal: true, refusal: { code: "budget_exhausted", reason: "replans", message: "This Work used every allowed correction attempt without recording the entry." } };
    }
    ledger.replans += 1;
    return { ok: false, terminal: false, retry: { code: named.code, reason: named.reason, message: named.message, kind: classification.kind } };
  }
  if (classification.kind === "transient") {
    // The bounded backoff above is spent; a transient that survives it is an unavailable
    // dependency, which is a recoverable WORK state, not a model repair.
    ledger.terminal = { kind: "refusal", detail: classification };
    ledger.refusal = named;
    return { ok: false, terminal: true, refusal: named };
  }
  ledger.terminal = { kind: classification.kind === "conflict" ? "conflict" : "refusal", detail: classification };
  ledger.refusal = named;
  return { ok: false, terminal: true, refusal: named };
}

/** Build the closed tool set for ONE segment. The names come from the hashed bundle's own
 *  roster, so a tool this file could build but the bundle does not name cannot exist. */
export function buildClaraWorkTools(ctx: WorkToolCtx, ledger: WorkBudgetLedger, budgets: ClaraWorkBudgets) {
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
      execute: (input: RecordJournalEntryInput) => runRecordJournalEntry(ctx, ledger, budgets, input),
    }),
    // NO `execute`, exactly as chat's `clarify` has none: calling this tool is the ACT. The
    // segment stops on the call, the workflow opens the shared question and parks the run on a
    // WDK hook until a human answers, expires it or cancels it.
    [ASK_QUESTION_TOOL]: tool({
      description:
        "Ask the human for the ONE decision or fact you are missing, instead of guessing. This parks the Work; " +
        "their answer is rechecked against the authority that is current when they answer. Do not use this to " +
        "confirm figures you were already given.",
      inputSchema: askQuestionInputSchema,
    }),
  };
}
