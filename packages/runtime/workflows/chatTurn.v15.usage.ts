// @frozen
//
// FROZEN — part of the chatTurn_v15 closure (F-A6 PR-2). A NEW frozen closure beside
// byte-untouched chatTurn_v1..v14.
//
// ONE METERING ROW PER CHAT MODEL CALL (law 76). DELIBERATELY DUPLICATED FROM
// chatTurn.v14.usage.ts RATHER THAN SHARED — the chatTurn_v8 law: importing a common module
// across two frozen closures would make every future edit to it a version change in BOTH. Every
// substantive line of the chat half here is v14.usage.ts's own, unchanged except the engine-id
// literal (`chatturn-v14` -> `chatturn-v15`); see chatTurn.v13.usage.ts for the full
// door/signature rationale.
//
// WHAT IS NEW IN v15: `recordFreeformUsage`, the SECOND metering call this closure makes.
// F-A9 / TA-P13 A: ONE metering ledger, every call kind in it. `freeform_read` is already a
// REGISTERED kind on `ck_llm_usage_events_call_kind` (migration 0110 WALL 1, minted for F-A6),
// so the roster needs no widening — this is the writer the roster was reserved for, and until it
// existed the kind was registered and never emitted.
//
// WHY A FREEFORM READ IS METERED AT ALL WHEN IT SPENDS NO TOKENS. The ledger's question is
// "what did the agent do, on whose behalf, and how long did it take", not "what did OpenAI
// charge". The row carries no tokens (both NULL — an absent input is never a zero, law 68's own
// instinct applied to spend) and DOES carry the firm, the client, the acting human, the wake
// kind, the agent task, the outcome and the duration, so the lane is visible in the one ledger
// beside every other call kind rather than only in its own receipt table. The two records answer
// different questions and neither replaces the other: `clara.freeform_read_log` is the AUDIT
// receipt (what SQL, what scope, which rungs, what it returned) and this is the METERING row.
//
// NO SPEND REFUSAL, HERE OR ANYWHERE (law 76). A metering failure is reported through
// `onUsageProblem` and NEVER turns into a refused read: metering must not be the thing that
// refuses work. That is why every call here is wrapped and swallowed.

import { pools, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";

export function chatEngineId(modelId: string): string {
  return `llm-openai:${modelId}:chatturn-v15`;
}

/** The freeform read's engine id. Deliberately NOT an `llm-openai:` id: the join in
 *  `clara.llm_price_table` is exact string equality, and pricing a DB read as if it were a model
 *  call would mint a cost nobody was charged. The MODEL is still named, because the model is
 *  what composed the SQL and "who caused this" is the attribution the ledger exists for. */
export function freeformEngineId(modelId: string): string {
  return `freeform-read:${modelId}:chatturn-v15`;
}

export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

export const CHAT_CALL_KIND = "chat";
/** 0110 WALL 1's own registered token, spelled here exactly once. */
export const FREEFORM_CALL_KIND = "freeform_read";

export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[chatTurn_v15] agent usage not metered (${p.reason}): ${p.detail}`);
}

export async function liveAgentUsageIdent(c: PgExec): Promise<string | null> {
  const r = await c.query(
    `select pg_get_function_identity_arguments(p.oid) as ident
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = 'record_agent_usage_event'`,
  );
  if (r.rows.length !== 1) return null;
  const ident = r.rows[0]?.ident;
  return typeof ident === "string" ? ident : null;
}

const asInt = (n: unknown): number | null => (typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null);

/** The ONE door both call kinds go through — the signature probe, the write and the
 *  never-refuse discipline are identical, so only the row's own fields differ. */
async function recordAgentUsage(
  ctx: ToolCtx,
  row: {
    callKind: string;
    engineId: string;
    outcome: "success" | "refused" | "error" | "timeout";
    viaWakeKind: string;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
  },
): Promise<void> {
  if (!ctx.firmId || !ctx.taskId) {
    onUsageProblem({ reason: "write_failed", detail: "no firm or task on the context" });
    return;
  }
  try {
    await pools().withRuntime(async (c: PgExec) => {
      const live = await liveAgentUsageIdent(c);
      if (live === null) {
        onUsageProblem({ reason: "verb_absent", detail: "clara.record_agent_usage_event is not in the catalog" });
        return;
      }
      if (live !== AGENT_USAGE_IDENT) {
        onUsageProblem({ reason: "signature_mismatch", detail: `live=(${live}) expected=(${AGENT_USAGE_IDENT})` });
        return;
      }
      await c.query("select clara.record_agent_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) as id", [
        ctx.firmId,
        row.callKind,
        row.engineId,
        row.outcome,
        ctx.clientId,
        null,
        null,
        ctx.taskId,
        ctx.createdBy,
        row.viaWakeKind,
        null,
        null,
        asInt(row.inputTokens),
        asInt(row.outputTokens),
        asInt(row.durationMs),
      ]);
    });
  } catch (e) {
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}

export async function recordChatUsage(
  ctx: ToolCtx,
  engineId: string,
  usage: { inputTokens?: number; outputTokens?: number; durationMs?: number },
  outcome: "success" | "refused" | "error" | "timeout",
): Promise<void> {
  return recordAgentUsage(ctx, {
    callKind: CHAT_CALL_KIND,
    engineId,
    outcome,
    // v13/v14 wrote the literal "interactive" here and v15 carries it unchanged for the CHAT
    // row: the model call itself is not made under a wake credential at all, and changing a
    // metered lane's own historic label would break the ledger's continuity for no gain.
    viaWakeKind: "interactive",
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    durationMs: usage.durationMs,
  });
}

/**
 * F-A6 / F-A9 — the freeform read's metering row. `viaWakeKind` is the kind
 * `freeformScoped` ACTUALLY minted (chatTurn.v15.infra.ts's census), passed in by the caller
 * rather than re-derived here, so the ledger records what happened and not what this file would
 * have guessed. Tokens are omitted entirely: a DB read spends none, and writing zeros would
 * assert a measurement nobody made.
 */
export async function recordFreeformUsage(
  ctx: ToolCtx,
  engineId: string,
  viaWakeKind: string,
  outcome: "success" | "refused" | "error" | "timeout",
  durationMs?: number,
): Promise<void> {
  return recordAgentUsage(ctx, { callKind: FREEFORM_CALL_KIND, engineId, outcome, viaWakeKind, durationMs });
}
