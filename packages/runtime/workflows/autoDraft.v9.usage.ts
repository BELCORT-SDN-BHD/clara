// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A2: the agentic posting lane; see
// autoDraft.v9.tools.ts for the one statement of what v9 is). A NEW frozen closure beside the
// byte-untouched autoDraft_v1..v8 (ARCHITECTURE Appendix A).
//
// THIS FILE (usage) — ONE METERING ROW PER MODEL CALL (law 76 — this records spend, it never
// gates it). NEW in v9, and in its own module because `autoDraft.v9.impl.ts` is at the repo's
// 500-line ceiling.
//
// BEST-EFFORT BY CONSTRUCTION, and that is the rule the witness lane already follows: a metering
// write must never be the thing that loses a coding pass the firm already paid for, so a write
// fault is not fatal to the run. What is NOT tolerated is SILENCE — every refusal goes through
// `onUsageProblem`, so a lane that stops metering says so instead of looking healthy.
//
// WHICH DOOR THIS LANE USES, AND WHY IT IS NOT THE OBVIOUS ONE. `clara.record_llm_usage_event`
// is the DOCUMENT-EXTRACTION door: F-A9/PR-1A gives `llm_usage_events` a `call_kind` column whose
// column DEFAULT is `'document_extraction'`, and the differently-NAMED sibling verb
// `clara.record_agent_usage_event` REFUSES that kind — one kind, one door. An unattended
// CODING/POSTING model call is not a document extraction, so metering it through the extraction
// door would stamp it with a `call_kind` that misdescribes what was bought. This lane meters
// through the AGENT door, with `call_kind='unattended_posting'` — the roster's own value for
// F-A2's coder, minted distinct from `chat` precisely because the two are different purchases.
//
// THE SIGNATURE IS ASSERTED AGAINST THE LIVE CATALOG, NEVER ASSUMED (review law 3: spelling is
// not identity — a verb NAME is a projection of the verb, not the verb). The emitter reads the
// live identity arguments from `pg_get_function_identity_arguments` and writes NOTHING unless
// they match `AGENT_USAGE_IDENT` exactly. A mismatch, or an absent verb, is reported LOUDLY and
// produces no row: it never falls back to a guessed argument order, and it never fabricates a
// document id to squeeze an agent-shaped call through the extraction door.
//
// A WRONG FIRM NOW FAILS LOUDLY. F-A9/PR-1A adds `fk_llm_usage_events_firm` (NO ACTION) because
// the reshape opens a hole the composite NOT NULL FKs used to close: without it a non-extraction
// row could name a firm that does not exist — invisible to RLS (it can never equal
// `jwt_firm()`), invisible to every rollup, and permanently uncorrectable on an append-only
// table. With it, a bad `p_firm` raises 23503 and lands in `onUsageProblem` instead of appending
// an orphan.

import { pools, type PgExec, type ToolCtx } from "./autoDraft.v9.infra.js";

/** The engine identity this lane meters under. It is the TASK's own model snapshot, never a
 *  literal — the same discipline the witness lane states in its own `recordUsage` header. */
export function autoDraftEngineId(modelId: string): string {
  return `llm-openai:${modelId}:autodraft-v9`;
}

/** The `pg_get_function_identity_arguments` string this closure is written against.
 *
 *  THE CATALOG'S SPELLING, NOT THE DECLARATION'S. `record_agent_usage_event` DECLARES `int` and
 *  the catalog PRINTS `integer`. `to_regprocedure()` accepts either, so an identity-string
 *  comparison written from the migration SOURCE would fail against a verb that is perfectly
 *  correct — the same "spelling is not identity" class this assertion exists to catch, one level
 *  down. Pinned from the catalog. */
export const AGENT_USAGE_IDENT =
  "p_firm uuid, p_call_kind text, p_engine_id text, p_outcome text, p_client uuid, " +
  "p_document uuid, p_document_task uuid, p_agent_task uuid, p_triggering_actor uuid, " +
  "p_via_wake_kind text, p_channel text, p_prompt_hash text, p_input_tokens integer, " +
  "p_output_tokens integer, p_duration_ms integer";

/** This lane's value from `ck_llm_usage_events_call_kind`'s CLOSED roster. Widening that roster
 *  is a migration on a merge-ordered surface, never a runtime decision. */
export const AUTODRAFT_CALL_KIND = "unattended_posting";

/** Where a metering problem is reported. Injectable so a cell can SEE the refusal rather than
 *  infer it from an absence — a read that cannot say NO has a meaningless YES. */
export type UsageProblem = { reason: "verb_absent" | "signature_mismatch" | "write_failed"; detail: string };

export function onUsageProblem(p: UsageProblem): void {
  const sink = (globalThis as unknown as { __claraUsageProblems?: UsageProblem[] }).__claraUsageProblems;
  if (Array.isArray(sink)) sink.push(p);
  console.warn(`[autoDraft_v9] agent usage not metered (${p.reason}): ${p.detail}`);
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

export async function recordAutoDraftUsage(
  ctx: ToolCtx,
  firmId: string,
  engineId: string,
  usage: { inputTokens?: number; outputTokens?: number; durationMs?: number },
  outcome: "success" | "refused" | "error" | "timeout",
): Promise<void> {
  if (!firmId || !ctx.taskId) {
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
      // p_document / p_document_task / p_channel are NULL by nature: this is an agent coding
      // call, not a document extraction, and the extraction-shape wall is call-kind-scoped.
      // p_triggering_actor is NULL because the unattended lane HAS no directing human — the same
      // fact `entry_post_receipts.maker_active_at_approval` records as NULL rather than false
      // (law 68: never a director by inference).
      await c.query("select clara.record_agent_usage_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) as id", [
        firmId,
        AUTODRAFT_CALL_KIND,
        engineId,
        outcome,
        ctx.clientId,
        null,
        null,
        ctx.taskId,
        null,
        "autodraft",
        null,
        null,
        asInt(usage.inputTokens),
        asInt(usage.outputTokens),
        asInt(usage.durationMs),
      ]);
    });
  } catch (e) {
    // Law 76: metering never gates spend, so a write fault is not fatal to the run — but it is
    // never SILENT either. The settle record still tells the truth about what the run did.
    onUsageProblem({ reason: "write_failed", detail: e instanceof Error ? e.message : String(e) });
  }
}
