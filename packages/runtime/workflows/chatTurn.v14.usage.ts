// @frozen
//
// FROZEN — part of the chatTurn_v14 closure (F-A3 PR-3, OQ-6). A NEW frozen closure beside
// byte-untouched chatTurn_v1..v13.
//
// ONE METERING ROW PER CHAT MODEL CALL (law 76). DELIBERATELY DUPLICATED FROM
// chatTurn.v13.usage.ts RATHER THAN SHARED — the chatTurn_v8 law: importing a common module
// across two frozen closures would make every future edit to it a version change in BOTH. Every
// substantive line here is v13.usage.ts's own, unchanged except the engine-id literal
// (`chatturn-v13` -> `chatturn-v14`); see that file for the full door/signature rationale.

import { pools, type PgExec, type ToolCtx } from "./chatTurn.v14.infra.js";

export function chatEngineId(modelId: string): string {
  return `llm-openai:${modelId}:chatturn-v14`;
}

export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

export const CHAT_CALL_KIND = "chat";

export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[chatTurn_v14] agent usage not metered (${p.reason}): ${p.detail}`);
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

export async function recordChatUsage(
  ctx: ToolCtx,
  engineId: string,
  usage: { inputTokens?: number; outputTokens?: number; durationMs?: number },
  outcome: "success" | "refused" | "error" | "timeout",
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
        CHAT_CALL_KIND,
        engineId,
        outcome,
        ctx.clientId,
        null,
        null,
        ctx.taskId,
        ctx.createdBy,
        "interactive",
        null,
        null,
        asInt(usage.inputTokens),
        asInt(usage.outputTokens),
        asInt(usage.durationMs),
      ]);
    });
  } catch (e) {
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}
