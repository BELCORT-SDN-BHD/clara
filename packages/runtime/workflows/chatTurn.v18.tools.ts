// @frozen
//
// FROZEN — part of the chatTurn_v18 closure (#623, the chat half). A NEW frozen closure beside
// byte-untouched chatTurn_v1..v17 (ARCHITECTURE Appendix A).
//
// `buildToolsV18` calls v17's `buildToolsV17(ctx, modelId, segment)` BY IMPORT and adds EXACTLY
// ONE tool: `start_journal_work`. Nothing v17 could do stops being possible and nothing it did
// changes.
//
// WHAT THIS TOOL IS AND IS NOT. It ADMITS a durable accounting Work — one
// `clara.accounting_work` row with a server-assigned logical operation identity and one queued
// `clara.agent_tasks` row of kind `accounting_work`. It does NOT post a journal entry, and the
// chat turn that calls it holds no authority to. The posting happens later, in a claraWork_v1
// run, under an `interactive_client` wake credential minted OBO this same human, with the
// database rechecking their LIVE role, the period, the chart, the control-account rule and the
// exact cents AT COMMIT. So the honest thing for the model to say after this tool succeeds is
// "I've queued it" — never "I've recorded it" — and the prompt says exactly that.
//
// THE INTENT KEY IS DETERMINISTIC, AND THAT IS THE WHOLE IDEMPOTENCY STORY ON THIS SIDE
// (C54.1 / C33.8). `stableOpKey(taskId, tool, input)` is v11's own key — same task, same tool,
// same input yields the same key, so a REPLAYED step (a WDK step re-execution, a resumed
// segment, a duplicate model call inside one segment) reaches
// `clara.admit_journal_work` with the key it already used and gets the EXISTING Work back with
// `replayed:true` and NO second task. A materially different input yields a different key and a
// legitimately different Work; the SAME key with a different basis is the database's typed
// `intent_payload_conflict`, which this tool surfaces verbatim rather than retrying.
//
// IT CANNOT ENQUEUE, AND THAT IS A STRUCTURAL FACT RATHER THAN AN OVERSIGHT. Every enqueue site
// in this package must hand `start()` a reference imported from `workflows/registry.ts` —
// freeze-lint capability (e), and the check is fail-closed. But `registry.ts` is NOT a frozen
// file and must never become one: it is repointed on every version bump, and a frozen file that
// imported it would pull it into the frozen import-closure and hash-lock it, so the next repoint
// would be a manifest violation. A frozen tool therefore cannot legally reach the registry, and
// an enqueue that bypassed the registry would target a pinned version forever. So this tool
// leaves the task `queued` + unbound and the RECONCILER's `accounting_work` arm starts it
// (packages/runtime/lib/reconciler-work.mjs) — the same belt that already recovers a route-side
// enqueue that failed after its commit. The measured pickup latency is the belt's own grace plus
// the leader's poll interval; both are named in that module.
//
// THE CLIENT PIN IS REQUIRED AND THE REFUSAL SAYS SO BY NAME. A conversation with no client has
// no books to post into. The refusal copies `noClientRefusal`'s shape from v17 (CLR03 + a named
// reason + a fix a human can act on), because a model that reads "not permitted" and a model
// that reads "open this from the client workspace" behave differently.

import { tool } from "ai";
import { z } from "zod";
import { buildToolsV17 } from "./chatTurn.v17.tools.js";
import { authoringRefusal, stableOpKey } from "./chatTurn.v11.tools.js";
import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import type { WorkAcceptedPart } from "./chatTurn.v18.parts.js";

export const START_JOURNAL_WORK_TOOL = "start_journal_work";

const lineSchema = z
  .object({
    account_code: z.string().trim().min(1).max(32).describe("An account code from this client's chart of accounts."),
    debit_cents: z.number().int().min(0).describe("Integer cents debited. Zero when this line is a credit."),
    credit_cents: z.number().int().min(0).describe("Integer cents credited. Zero when this line is a debit."),
    description: z.string().max(2000).optional().describe("Optional line narration."),
  })
  .strict();

export const startJournalWorkInputSchema = z
  .object({
    posting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The posting date the human gave, YYYY-MM-DD. Ask if they did not give one."),
    memo: z.string().trim().min(1).max(4000).describe("What this entry is for, in the human's own terms."),
    lines: z.array(lineSchema).min(2).max(200).describe("Two or more lines. Each line carries a debit OR a credit, never both. Debits must equal credits exactly."),
    rationale: z.string().trim().min(1).max(4000).describe("Why you read the human's message this way, for the Work record."),
  })
  .strict();

export type StartJournalWorkInput = z.infer<typeof startJournalWorkInputSchema>;

export type StartJournalWorkResult =
  | { ok: true; work_accepted: WorkAcceptedPart; task_id: string; status: string; replayed: boolean }
  | { ok: false; code: string; reason: string | null; fix: string | null; message: string; details: Record<string, unknown> };

type DbError = { code?: string; message?: string; detail?: string };

function noClientRefusal(): StartJournalWorkResult {
  return {
    ok: false,
    code: "CLR03",
    reason: "journal_work_needs_client_pin",
    fix: "Open this conversation from the client workspace whose books the entry belongs to.",
    message: "This conversation is not bound to a client, so it cannot start an accounting Work.",
    details: {},
  };
}

/** A shape refusal the model can act on WITHOUT a database round trip. The database re-checks
 *  every one of these at admission and again at commit — this is the earlier, more legible half,
 *  never the authority. */
export function localBasisRefusal(input: StartJournalWorkInput): StartJournalWorkResult | null {
  let debit = 0;
  let credit = 0;
  for (let i = 0; i < input.lines.length; i += 1) {
    const line = input.lines[i]!;
    const oneSided = (line.debit_cents > 0 && line.credit_cents === 0) || (line.credit_cents > 0 && line.debit_cents === 0);
    if (!oneSided) {
      return {
        ok: false,
        code: "CLR10",
        reason: "invalid_basis",
        fix: "Give each line either a debit or a credit, never both and never zero on both sides.",
        message: `Line ${i + 1} must carry exactly one of a debit or a credit.`,
        details: { field: `lines[${i}]` },
      };
    }
    debit += line.debit_cents;
    credit += line.credit_cents;
  }
  if (debit !== credit) {
    return {
      ok: false,
      code: "CLR10",
      reason: "invalid_basis",
      fix: "Adjust the lines so total debits equal total credits, in exact cents.",
      message: `Debits (${debit} cents) do not equal credits (${credit} cents).`,
      details: { field: "lines", debit_cents: debit, credit_cents: credit },
    };
  }
  return null;
}

/** The `clara.accounting_work.basis` jsonb, in the DATABASE's own field spelling. The runtime
 *  never computes the digest: it hands the basis over and the database derives and stores it,
 *  which is what makes a later `basis_mismatch` a real wall rather than two copies of one guess. */
export function basisFromInput(input: StartJournalWorkInput): Record<string, unknown> {
  return {
    posting_date: input.posting_date,
    memo: input.memo,
    currency: "MYR",
    lines: input.lines.map((l) => ({
      account_code: l.account_code,
      debit_cents: l.debit_cents,
      credit_cents: l.credit_cents,
      description: l.description ?? null,
    })),
  };
}

export async function runStartJournalWork(
  ctx: ToolCtx,
  input: StartJournalWorkInput,
  modelId: string,
): Promise<StartJournalWorkResult> {
  if (!ctx.clientId) return noClientRefusal();
  const local = localBasisRefusal(input);
  if (local) return local;

  const clientId = ctx.clientId;
  const intentKey = stableOpKey(ctx.taskId, START_JOURNAL_WORK_TOOL, input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      // The chat session this turn belongs to is read from the TASK, never from a model
      // argument — it is the source ref the Work records, and a model-supplied one would be a
      // provenance claim nobody checked.
      const t = await c.query("select session_id from clara.agent_tasks where id = $1", [ctx.taskId]);
      const sessionId = t.rows[0]?.session_id ?? null;
      const sourceRefs = [{ kind: "chat_task", task_id: ctx.taskId, session_id: sessionId }];
      const r = await c.query(
        `select clara.admit_journal_work($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text, $6::jsonb, $7::text) as r`,
        [
          clientId,
          ctx.createdBy,
          intentKey,
          JSON.stringify(basisFromInput(input)),
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
        message: "The accounting Work could not be started. Nothing was recorded.",
        details: {},
      };
    }
    return {
      ok: true,
      work_accepted: {
        type: "work_accepted",
        work_id: String(receipt.work_id),
        client_id: clientId,
        purpose: "journal_entry",
        logical_op_id: String(receipt.logical_op_id ?? ""),
      },
      task_id: String(receipt.task_id ?? ""),
      status: String(receipt.status ?? "queued"),
      replayed: receipt.replayed === true,
    };
  } catch (error) {
    const refused = authoringRefusal(error as DbError);
    if (refused.ok === true) {
      return { ok: false, code: "internal", reason: null, fix: null, message: "The accounting Work could not be started.", details: {} };
    }
    return { ok: false, code: refused.code, reason: refused.reason, fix: refused.fix, message: refused.message, details: refused.details };
  }
}

export function buildToolsV18(ctx: ToolCtx, modelId: string, segment: number) {
  return Object.assign({}, buildToolsV17(ctx, modelId, segment), {
    [START_JOURNAL_WORK_TOOL]: tool({
      description:
        "Start an accounting Work that records ONE journal entry for the client pinned to this conversation, from " +
        "figures the human gave you — there is no source document and you must never invent one. Give the posting " +
        "date, the memo, and two or more exact-cent lines; each line carries a debit OR a credit and total debits " +
        "must equal total credits. This does NOT post the entry: it queues durable Work that posts it under the " +
        "human's own authority, rechecked at commit. Say you have QUEUED it, never that you have recorded it, and " +
        "point the human at the Work card for the outcome. If the human has not given a posting date, an amount or " +
        "the accounts, ask them with clarify instead of guessing.",
      inputSchema: startJournalWorkInputSchema,
      execute: (input: StartJournalWorkInput) => runStartJournalWork(ctx, input, modelId),
    }),
  });
}
