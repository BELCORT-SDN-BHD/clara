// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (usage) — ONE METERING ROW PER MODEL CALL, through F-A9's agent door. Law 76: this
// records spend, it never gates it. Best-effort by construction (a metering fault must not lose
// a close-prep pass the firm already paid for) but NEVER silent — every refusal goes through
// onUsageProblem. The signature is asserted against the LIVE catalog, never assumed (review law
// 3). All of that is autoDraft.v9.usage.ts's law, carried deliberately.
//
// THE call_kind COMPROMISE is identical to bankAgent.v1.usage.ts's, and stated there in full:
// ck_llm_usage_events_call_kind (0110:269-279) is a CLOSED roster of nine values and none was
// minted for this lane; widening it is a migration on a merge-ordered constraint, outside this
// PR's scope. So this lane meters under 'unattended_posting' with via_wake_kind='close_prep'
// (free text, 0110:201-207, no CHECK) carrying the true identity. The ask — add 'close_prep' to
// the roster, then closePrep_v2 points at it — rides in this PR's body as an owner question.
// A close-prep pass IS an unattended lane whose acts post (the depreciation catch-up and the
// snapshot mint both write books rows), so the borrowed kind is defensible; it is borrowed
// visibly rather than quietly, which is the part that matters.

import { pools, type PgExec } from "./closePrep.v1.infra.js";

export function closePrepEngineId(modelId: string): string {
  return `llm-openai:${modelId}:closeprep-v1`;
}

/** THE CATALOG'S SPELLING, NOT THE DECLARATION'S — record_agent_usage_event DECLARES int and the
 *  catalog PRINTS integer, so a string written from the migration source would fail against a
 *  perfectly correct verb. Pinned from the catalog. */
export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

export const CLOSE_PREP_CALL_KIND = "unattended_posting";
export const CLOSE_PREP_VIA_WAKE_KIND = "close_prep";

export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[closePrep_v1] agent usage not metered (${p.reason}): ${p.detail}`);
}

/** A POSITIVE read: only the single row this query actually SAW counts as the verb. */
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

export async function recordClosePrepUsage(
  ctx: { firmId: string; clientId: string; taskId: string },
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
      // p_document / p_document_task / p_channel are NULL by nature. p_triggering_actor is NULL
      // because the clocked lane HAS no directing human — the same structural NULL the
      // task-bound mint enforces, never a director by inference (law 68).
      // 裁-44 R3 / FOLD-19 — named notation; see bankAgent.v1.usage.ts's own copy for why these
      // fifteen positional arguments were the most transposition-prone call in the closure.
      await c.query(
        `select clara.record_agent_usage_event(
            p_firm => $1, p_call_kind => $2, p_engine_id => $3, p_outcome => $4, p_client => $5,
            p_document => $6, p_document_task => $7, p_agent_task => $8, p_triggering_actor => $9,
            p_via_wake_kind => $10, p_channel => $11, p_prompt_hash => $12,
            p_input_tokens => $13, p_output_tokens => $14, p_duration_ms => $15) as id`,
        [
        ctx.firmId,
        CLOSE_PREP_CALL_KIND,
        engineId,
        outcome,
        ctx.clientId,
        null,
        null,
        ctx.taskId,
        null,
        CLOSE_PREP_VIA_WAKE_KIND,
        null,
        null,
        asInt(usage.inputTokens),
        asInt(usage.outputTokens),
        asInt(usage.durationMs),
        ],
      );
    });
  } catch (e) {
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}
