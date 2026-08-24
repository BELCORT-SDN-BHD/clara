// @frozen
//
// FROZEN — part of the chatTurn_v13 closure (F-A2 CHAT PARITY, owner ruling D34). A NEW frozen
// closure beside the byte-untouched chatTurn_v1..v12 (ARCHITECTURE Appendix A).
//
// THIS FILE (usage) — ONE METERING ROW PER CHAT MODEL CALL (law 76 — this records spend, it
// never gates it). NEW in v13: before F-A9/PR-1A the chat lane could not be metered at all,
// because `clara.llm_usage_events` required a `document_id` and a chat turn has none.
//
// DELIBERATELY DUPLICATED FROM autoDraft.v9.usage.ts RATHER THAN SHARED, and this is the
// chatTurn_v8 law rather than laziness: importing a common module across two frozen closures
// would make every future edit to it a version change in BOTH. The rule is stated canonically
// in the unattended lane's copy; the two are asserted against the same live catalog by cells, so
// a divergence is a finding rather than a silent drift.
//
// WHICH DOOR, AND WHY NOT THE OBVIOUS ONE. `clara.record_llm_usage_event` is the
// DOCUMENT-EXTRACTION door: F-A9/PR-1A gives the table a `call_kind` column whose column DEFAULT
// is `'document_extraction'`, and the differently-NAMED sibling `clara.record_agent_usage_event`
// REFUSES that kind — one kind, one door. A chat model call is not a document extraction, so it
// meters through the AGENT door with `call_kind='chat'`.
//
// THE SIGNATURE IS ASSERTED AGAINST THE LIVE CATALOG, NEVER ASSUMED (review law 3: spelling is
// not identity). The emitter reads the live identity arguments from
// `pg_get_function_identity_arguments` and writes NOTHING unless they match `AGENT_USAGE_IDENT`
// exactly. A mismatch, or an absent verb, is reported LOUDLY and produces no row — it never
// falls back to a guessed argument order, and it never fabricates a document id to squeeze a
// chat-shaped call through the extraction door. That last clause is the whole reason this file
// exists rather than reusing the old writer.
//
// NOTE ON THE CATALOG'S SPELLING. `record_agent_usage_event` DECLARES `int`; the catalog PRINTS
// `integer`. An identity string written from the migration SOURCE would fail against a verb that
// is perfectly correct — the same class of mistake the assertion exists to catch, one level
// down. Pinned from the catalog.

import { pools, type PgExec, type ToolCtx } from "./chatTurn.v13.infra.js";

/** The engine identity this lane meters under — the TASK's own model snapshot, never a literal. */
export function chatEngineId(modelId: string): string {
  return `llm-openai:${modelId}:chatturn-v13`;
}

/** The `pg_get_function_identity_arguments` string this closure is written against. */
export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

/** This lane's value from `ck_llm_usage_events_call_kind`'s CLOSED roster. Widening that roster
 *  is a migration on a merge-ordered surface, never a runtime decision. */
export const CHAT_CALL_KIND = "chat";

/** Where a metering problem is reported. Injectable so a cell can SEE the refusal rather than
 *  infer it from an absence — a read that cannot say NO has a meaningless YES. */
export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[chatTurn_v13] agent usage not metered (${p.reason}): ${p.detail}`);
}

/** Read the live identity arguments of `clara.record_agent_usage_event`. Returns null when the
 *  verb does not exist, or when the name resolves to more than one overload — a POSITIVE read:
 *  only the single row this query actually SAW counts as the verb. */
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
      // p_document / p_document_task / p_channel are NULL by nature — a chat turn is not a
      // document extraction. p_client may legitimately be NULL: a firm-scoped conversation that
      // is not bound to a client still spends tokens, and recording the spend with an honest
      // NULL client is better than dropping the row or inventing a client for it.
      // p_triggering_actor IS known here and is recorded: unlike the unattended lane, an
      // attended turn has a directing human, and that is exactly the fact worth metering.
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
    // Law 76: metering never gates spend, so a write fault is not fatal to the turn — but it is
    // never SILENT either. A wrong firm now raises 23503 against F-A9/PR-1A's new
    // `fk_llm_usage_events_firm` and lands here rather than appending an orphan row that no
    // rollup and no RLS predicate could ever see again.
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}
