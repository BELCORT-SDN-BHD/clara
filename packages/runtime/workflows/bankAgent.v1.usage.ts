// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (usage) — ONE METERING ROW PER MODEL CALL, through F-A9's agent door. Law 76: this
// records spend, it never gates it.
//
// BEST-EFFORT BY CONSTRUCTION, NEVER SILENT. A metering write must not be the thing that loses a
// reconciliation pass the firm already paid for, so a write fault is not fatal to the run. What
// is NOT tolerated is silence: every refusal goes through onUsageProblem, so a lane that has
// stopped metering says so instead of looking healthy. This is autoDraft.v9.usage.ts's own law,
// carried deliberately rather than reinvented.
//
// THE SIGNATURE IS ASSERTED AGAINST THE LIVE CATALOG, NEVER ASSUMED (review law 3: a verb NAME
// is a projection of the verb, not the verb). The emitter reads the live identity arguments and
// writes NOTHING unless they match exactly — never a guessed argument order.
//
// ============================ THE call_kind COMPROMISE, STATED PLAINLY ==========================
// ck_llm_usage_events_call_kind (0110:269-279) is a CLOSED roster of nine values, and NONE of
// them was minted for this lane. Widening it is an ALTER on a merge-ordered constraint — a
// migration, not a runtime decision, and outside the scope this PR was ruled to.
//
// So this lane meters under 'unattended_posting' with via_wake_kind='bank_agent'. That is
// DEFENSIBLE and it is also NOT IDEAL, and both halves are said here rather than papered over:
//   defensible — this IS an unattended lane whose acts post (wake_match_bank_line writes live
//     match groups), and via_wake_kind is FREE TEXT (0110:201-207, no CHECK), so the true lane
//     is recorded and every rollup can discriminate on it.
//   not ideal  — 'unattended_posting' was minted as "F-A2's own coder, distinct from chat",
//     and a bank reconciliation pass is a different purchase from a coding sweep. The estate's
//     own metering discipline ("one kind, one door") argues for a 'bank_agent' roster value.
// THE ASK, carried into this PR's body as an owner question: add 'bank_agent' and 'close_prep'
// to that roster in the next DB pass, then bankAgent_v2/closePrep_v2 point at them. Until then
// the row is honest about the firm, the client, the task and the lane — only the coarse kind is
// borrowed, and it is borrowed visibly.

import { pools, type PgExec } from "./bankAgent.v1.infra.js";

/** The engine identity this lane meters under — the TASK's own model snapshot, never a literal. */
export function bankAgentEngineId(modelId: string): string {
  return `llm-openai:${modelId}:bankagent-v1`;
}

/** The pg_get_function_identity_arguments string this closure is written against. THE CATALOG'S
 *  SPELLING, NOT THE DECLARATION'S: record_agent_usage_event DECLARES int and the catalog PRINTS
 *  integer, so a comparison written from the migration SOURCE would fail against a verb that is
 *  perfectly correct. Pinned from the catalog, exactly as autoDraft.v9.usage.ts pins it. */
export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

/** This lane's borrowed value from the closed roster — see the header for why it is borrowed. */
export const BANK_AGENT_CALL_KIND = "unattended_posting";
/** The lane's TRUE identity, on a free-text column, which is what a rollup discriminates on. */
export const BANK_AGENT_VIA_WAKE_KIND = "bank_agent";

export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

/** Where a metering problem is reported. Injectable so a cell can SEE the refusal rather than
 *  infer it from an absence — a read that cannot say NO has a meaningless YES. */
export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[bankAgent_v1] agent usage not metered (${p.reason}): ${p.detail}`);
}

/** Read the live identity arguments. Returns null when the verb is absent, or when the name
 *  resolves to more than one overload — a POSITIVE read: only the single row this query
 *  actually SAW counts as the verb. */
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

export async function recordBankAgentUsage(
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
      // p_document / p_document_task / p_channel are NULL by nature — this is a bank
      // reconciliation pass, not a document extraction. p_triggering_actor is NULL because the
      // clocked lane HAS no directing human: the same structural NULL the credential mint
      // enforces, never a director by inference (law 68).
      // 裁-44 R3 / FOLD-19 — NAMED NOTATION, and this is the call that needed it most in the whole
      // closure. Fifteen positional arguments, of which p_client/p_document/p_document_task/
      // p_agent_task/p_triggering_actor are five ADJACENT uuids (four of them NULL here) and
      // p_input_tokens/p_output_tokens/p_duration_ms are three adjacent integers. Every one of
      // those transpositions is admitted by the driver and by the column types, and lands as a
      // metering row attributing this run's tokens to the wrong subject — silently, on the surface
      // whose entire job is telling the truth about what the lane spent.
      await c.query(
        `select clara.record_agent_usage_event(
            p_firm => $1, p_call_kind => $2, p_engine_id => $3, p_outcome => $4, p_client => $5,
            p_document => $6, p_document_task => $7, p_agent_task => $8, p_triggering_actor => $9,
            p_via_wake_kind => $10, p_channel => $11, p_prompt_hash => $12,
            p_input_tokens => $13, p_output_tokens => $14, p_duration_ms => $15) as id`,
        [
        ctx.firmId,
        BANK_AGENT_CALL_KIND,
        engineId,
        outcome,
        ctx.clientId,
        null,
        null,
        ctx.taskId,
        null,
        BANK_AGENT_VIA_WAKE_KIND,
        null,
        null,
        asInt(usage.inputTokens),
        asInt(usage.outputTokens),
        asInt(usage.durationMs),
        ],
      );
    });
  } catch (e) {
    // Law 76: metering never gates spend, so a write fault is not fatal to the run — but it is
    // never SILENT either. The settle still tells the truth about what the run did.
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}
