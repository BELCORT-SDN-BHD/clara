// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (reads) — the shared call helper plus the SIX read wrappers of the twelve 0138
// minted. Split from the write half only for the repo's 500-line module budget; the two halves
// are one tool set, assembled in closePrep.v1.tools.ts.
//
// WHY THE READS ARE WRAPPERS AND NOT A PLAIN GRANT, restated because it shapes every call here:
// 0138's own note (:1291-1294) is that a firm-scoped grant on get_close_plan would let a
// client-pinned lane read EVERY client's plan in the firm. So each read goes through
// _close_wake_ctx, which re-derives the subject's client and refuses anything the credential is
// not pinned to. That is why a read here costs an op key and a rationale: it is a receipted act,
// not a free look.

import { tool } from "ai";
import { z } from "zod";
import { READ_TOOLS, closeModelIdentity } from "./closePrep.v1.prompt.js";
import { closeScoped, closeOpKey, type CloseTaskContext, type PgExec } from "./closePrep.v1.infra.js";

/** One oracle-safe refusal for every authority/tenant fault, identical regardless of whether the
 *  subject exists — a refusal that varies with existence is an existence oracle. */
export function closeRefusal(e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: `the act did not go through: ${message}` };
}

/** The per-run record. `acts` counts only replies the DATABASE marked admitted — never the
 *  model's account of what it did (constraint 2 in its narrowest form). */
export type CloseRunRecord = { reads: number; acts: number; closeRunId: string | null };

export function newCloseRunRecord(): CloseRunRecord {
  return { reads: 0, acts: 0, closeRunId: null };
}

/**
 * Call one 0138 wrapper. `verb` is the WRAPPER'S OWN NAME and `subjectId` its declared subject —
 * both feed closeOpKey, which must reproduce the database's own derivation exactly or
 * _close_wake_ctx refuses with CLR10 'op_key_not_derived'. Passing the wrong subject here is
 * therefore a LOUD failure, not a silent mis-scope: the DB checks our arithmetic on every call.
 */
export async function callCloseVerb(
  ctx: CloseTaskContext,
  verb: string,
  subjectId: string,
  sql: string,
  argsBefore: unknown[],
  rationale: string,
  modelId: string,
): Promise<unknown> {
  const opKey = closeOpKey(ctx.taskId, verb, subjectId);
  return closeScoped(ctx, (c: PgExec) =>
    c.query(sql, [...argsBefore, rationale, JSON.stringify(closeModelIdentity(modelId)), opKey]).then((r) => r.rows[0]?.r ?? null),
  );
}

/** A verb's jsonb reply, read POSITIVELY for admission (review law 2: a non-throwing call is not
 *  evidence that anything happened). */
export function countIfAdmitted(rec: CloseRunRecord, reply: unknown): unknown {
  const verdict = (reply as { outcome?: unknown; verdict?: unknown })?.outcome ?? (reply as { verdict?: unknown })?.verdict;
  if (verdict === "admitted") rec.acts += 1;
  return reply;
}

const RATIONALE = z.string().min(1).describe("Why you are making this call, in one plain sentence.");

export function buildCloseReadTools(ctx: CloseTaskContext, modelId: string, rec: CloseRunRecord) {
  const read = async (verb: string, subject: string, sql: string, args: unknown[], rationale: string) => {
    try {
      const out = await callCloseVerb(ctx, verb, subject, sql, args, rationale, modelId);
      rec.reads += 1;
      return out;
    } catch (e) {
      return closeRefusal(e);
    }
  };

  return {
    [READ_TOOLS.LIST_FY]: tool({
      description: "List this client's fiscal years: which are open, reopened or closed, and when each ends. Start here.",
      inputSchema: z.object({ rationale: RATIONALE }),
      execute: ({ rationale }: { rationale: string }) =>
        read("wake_list_fiscal_years", ctx.clientId, "select clara.wake_list_fiscal_years($1,$2,$3::jsonb,$4) as r", [ctx.clientId], rationale),
    }),

    [READ_TOOLS.CLOSE_PLAN]: tool({
      description: "Read the close plan for one fiscal year — the ordered steps a close of this year involves.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read("wake_get_close_plan", fiscal_year_id, "select clara.wake_get_close_plan($1,$2,$3::jsonb,$4) as r", [fiscal_year_id], rationale),
    }),

    [READ_TOOLS.READINESS]: tool({
      description: "Read whether this fiscal year is ready to close, and what is blocking it if not. Blockers are facts; read them before acting.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read(
          "wake_get_close_readiness",
          fiscal_year_id,
          "select clara.wake_get_close_readiness($1,$2,$3,$4::jsonb,$5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.DRY_RUN]: tool({
      description: "Test close readiness WITHOUT committing to anything — use this to check a shape before you act on it.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read(
          "wake_dry_run_close_readiness",
          fiscal_year_id,
          "select clara.wake_dry_run_close_readiness($1,$2,$3,$4::jsonb,$5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.VERIFY]: tool({
      description: "Verify an existing close receipt — what it covers and whether it still holds.",
      inputSchema: z.object({ close_receipt_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ close_receipt_id, rationale }: { close_receipt_id: string; rationale: string }) =>
        read("wake_verify_close", close_receipt_id, "select clara.wake_verify_close($1,$2,$3::jsonb,$4) as r", [close_receipt_id], rationale),
    }),

    [READ_TOOLS.SNAPSHOT_STATE]: tool({
      description: "Read the state of one period snapshot.",
      inputSchema: z.object({ snapshot_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ snapshot_id, rationale }: { snapshot_id: string; rationale: string }) =>
        read("wake_snapshot_state", snapshot_id, "select clara.wake_snapshot_state($1,$2,$3::jsonb,$4) as r", [snapshot_id], rationale),
    }),
  };
}
