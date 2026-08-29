// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (tools) — the AI-SDK wiring over exactly FOUR of the thirteen wrappers granted to
// clara_wake_bank. The other nine are deliberately NOT exposed, and the reason is a scope
// ruling, not an oversight: this lane matches and PROPOSES. wake_settle_from_bank_line,
// wake_resolve_and_book_bank_line, wake_unmatch_bank_match, wake_void_bank_reconciliation,
// wake_void_bank_statement, wake_complete_bank_reconciliation, wake_resolve_bank_line_exception,
// wake_add_bank_account and wake_upsert_account either mint books entries beyond bank matching
// or destroy existing work, and neither belongs to an unattended pass with no human in the
// room. Widening the set is a bankAgent_v2, with its own review.
//
// THE IN-RUN PACK RECORD (the same law autoDraft.v9.toolset.ts states for its read record).
// Every write wrapper takes p_inputs_digest, and 0129's freshness check requires that digest to
// name a REAL, PRIOR pack read bound to THIS task. The closure below remembers the digest the
// pack tool actually returned in THIS execution; a write attempted before any pack read is
// refused locally, by name, rather than sent to the database to fail with a CLR code nobody can
// read. A WDK REPLAY rebuilds this record EMPTY, which fails closed — that is the load-bearing
// half, not the ergonomics.

import { tool } from "ai";
import { z } from "zod";
import { PACK_TOOL, MATCH_TOOL, EXCEPTION_TOOL, PROMOTION_TOOL, bankModelIdentity } from "./bankAgent.v1.prompt.js";
import { bankScoped, bankOpKey, type BankTaskContext, type PgExec } from "./bankAgent.v1.infra.js";

/** One oracle-safe refusal string for every authority/tenant fault, identical regardless of
 *  whether the subject exists — the same shape autoDraft's safeRead uses, for the same reason:
 *  a refusal that varies with existence is an existence oracle. */
function refusal(e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: `the act did not go through: ${message}` };
}

/** The mutable per-run record. One per tool set, i.e. per model-step execution attempt. */
export type BankRunRecord = { digest: string | null; ordinal: number; admitted: number };

export function newBankRunRecord(): BankRunRecord {
  return { digest: null, ordinal: 0, admitted: 0 };
}

/** A verb's jsonb reply, read POSITIVELY for admission. Only a reply that actually SAYS it was
 *  admitted counts as an act (review law 2: absence is not evidence, and neither is a
 *  non-throwing call). Everything else is reported to the model as-is and counted as nothing. */
function countIfAdmitted(rec: BankRunRecord, reply: unknown): unknown {
  const verdict = (reply as { outcome?: unknown; verdict?: unknown })?.outcome ?? (reply as { verdict?: unknown })?.verdict;
  if (verdict === "admitted") rec.admitted += 1;
  return reply;
}

export function buildBankAgentTools(ctx: BankTaskContext, modelId: string, rec: BankRunRecord) {
  const model = bankModelIdentity(modelId);
  const needPack = () =>
    rec.digest === null
      ? { error: `call ${PACK_TOOL} first — every act must be grounded in a pack read from this run.` }
      : null;

  return {
    [PACK_TOOL]: tool({
      description:
        "Read the bank pack for this run's bank account: the live statement, its unmatched lines, the candidate approved journal entries, open items and any open proposals. This read is itself receipted. Call it first.",
      inputSchema: z.object({
        rationale: z.string().min(1).describe("Why you are reading — one plain sentence."),
      }),
      execute: async ({ rationale }: { rationale: string }) => {
        try {
          const opKey = bankOpKey("pack", ctx.taskId, (rec.ordinal += 1), ctx.bankAccountId);
          const pack = await bankScoped(ctx, (c: PgExec) =>
            c
              .query("select clara.wake_get_bank_pack($1,$2,$3,$4::jsonb,$5) as pack", [
                ctx.clientId,
                ctx.bankAccountId,
                rationale,
                JSON.stringify(model),
                opKey,
              ])
              .then((r) => r.rows[0]?.pack ?? null),
          );
          // Record WHAT THE DATABASE ACTUALLY RETURNED, never a digest we computed ourselves.
          const digest = (pack as { digest?: unknown } | null)?.digest;
          if (typeof digest === "string" && digest.length > 0) rec.digest = digest;
          return pack;
        } catch (e) {
          return refusal(e);
        }
      },
    }),

    [MATCH_TOOL]: tool({
      description:
        "Link statement lines to approved journal entries. Amounts must tie; the database checks and refuses if they do not. Only lines and entries you saw in the pack.",
      inputSchema: z.object({
        lines: z.array(z.string().uuid()).min(1).describe("Statement line ids from the pack."),
        entries: z.array(z.string().uuid()).min(1).describe("Approved journal entry ids from the pack's candidates."),
        rationale: z.string().min(1).describe("What ties these together, in plain words a bookkeeper can check."),
      }),
      execute: async ({ lines, entries, rationale }: { lines: string[]; entries: string[]; rationale: string }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          const opKey = bankOpKey("match", ctx.taskId, (rec.ordinal += 1), lines.join("_"));
          return await bankScoped(ctx, (c: PgExec) =>
            c
              .query("select clara.wake_match_bank_line($1,$2::jsonb,$3::jsonb,$4::jsonb,$5,$6,$7::jsonb,$8,$9) as r", [
                ctx.clientId,
                JSON.stringify(lines),
                JSON.stringify(entries),
                JSON.stringify([]),
                false,
                rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(e);
        }
      },
    }),

    [EXCEPTION_TOOL]: tool({
      description:
        "PROPOSE an exception on one statement line you cannot match. This writes a proposal for a human to settle; it does not except the line itself.",
      inputSchema: z.object({
        line_id: z.string().uuid(),
        kind: z.string().min(1).describe("The exception kind, as the pack's own vocabulary names it."),
        reason: z.string().min(1).describe("What is wrong with this line, concretely."),
        rationale: z.string().min(1).describe("Why an exception rather than a match — name what you ruled out."),
      }),
      execute: async ({ line_id, kind, reason, rationale }: { line_id: string; kind: string; reason: string; rationale: string }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          const opKey = bankOpKey("except", ctx.taskId, (rec.ordinal += 1), line_id);
          return await bankScoped(ctx, (c: PgExec) =>
            c
              // $4::uuid — p_evidence_document is always NULL from this lane (an unattended pass
              // cites no evidence document), and a BARE null gives the planner no type to infer.
              // Cast explicitly rather than rely on there happening to be one overload today.
              .query("select clara.wake_propose_bank_line_exception($1,$2,$3,$4::uuid,$5,$6::jsonb,$7,$8) as r", [
                line_id,
                kind,
                reason,
                null,
                rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(e);
        }
      },
    }),

    [PROMOTION_TOOL]: tool({
      description:
        "PROPOSE that a recurring printed identifier on the statement belongs to a counterparty. A proposal for a human, never a change to the books.",
      inputSchema: z.object({
        counterparty_id: z.string().uuid(),
        identifier_kind: z.string().min(1),
        identifier_value: z.string().min(1),
        times_seen: z.number().int().positive().describe("How many times you saw it in the pack. Count, never estimate."),
        rationale: z.string().min(1),
      }),
      execute: async (a: {
        counterparty_id: string;
        identifier_kind: string;
        identifier_value: string;
        times_seen: number;
        rationale: string;
      }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          const opKey = bankOpKey("promote", ctx.taskId, (rec.ordinal += 1), a.counterparty_id);
          return await bankScoped(ctx, (c: PgExec) =>
            c
              // $5::int — p_times_seen is declared int and the driver sends a JS number as text;
              // cast so the coercion is stated here rather than left to overload resolution.
              .query("select clara.wake_propose_bank_identifier_promotion($1,$2,$3,$4,$5::int,$6,$7::jsonb,$8,$9) as r", [
                ctx.clientId,
                a.counterparty_id,
                a.identifier_kind,
                a.identifier_value,
                a.times_seen,
                a.rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(e);
        }
      },
    }),
  };
}
