// @frozen
//
// FROZEN — the durable steps + tool wiring of chatTurn_v1 (contract §4). Every
// "use step" body here is memoized by the engine; its DB effects are the workflow's
// semantics and therefore frozen (ship a change as a new _vN). The freeze-lint
// hash-locks this file (chatTurn.v1.ts's import closure).
//
// The mutable INFRASTRUCTURE (connection pools, the model provider) is NOT imported
// here — it is read from the process-injected globals `__claraPools` / (optionally)
// `__claraModelForTest`. That keeps pools.mjs / the provider OUT of the frozen
// closure (so connection tuning is not a workflow-version change) while the SQL a
// step runs — which IS workflow behaviour — stays frozen. Per-attempt read
// credentials are minted INSIDE the step that uses them and NEVER cross a step
// boundary (§4.1 — step IO is durably persisted).

import { streamText, stepCountIs, hasToolCall, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { tool } from "ai";
import { getWritable } from "workflow";
import {
  SYSTEM_PROMPT,
  CLARIFY_FRAMING,
  clarifyTool,
  toTypedParts,
  findClarifyCall,
  type ClaraPart,
  type AiContentPart,
} from "./chatTurn.prompt.js";

export { SYSTEM_PROMPT };

// ---------------------------------------------------------------------------
// Injected infrastructure (process globals — never imported, so never frozen).
// ---------------------------------------------------------------------------

type PgExec = { query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }> };
type ClaraPools = {
  mintWakeCredential(firmId: string, ttl?: string): Promise<{ credentialId: string; secret: string }>;
  withReadWakeScoped<T>(secret: string, fn: (c: PgExec) => Promise<T>): Promise<T>;
  withRuntime<T>(fn: (c: PgExec) => Promise<T>): Promise<T>;
};

function pools(): ClaraPools {
  const p = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!p) throw new Error("runtime pools not injected (globalThis.__claraPools) — the supervisor must inject them at boot");
  return p;
}

/** Resolve the language model. Production uses the OpenAI provider with the SNAPSHOT
 *  id; a test injects a mock via globalThis (no network/key ever in tests). */
function resolveModel(modelId: string): unknown {
  const override = (globalThis as unknown as { __claraModelForTest?: unknown }).__claraModelForTest;
  return override ?? openai(modelId);
}

// ---------------------------------------------------------------------------
// Read-only tools — built PER SEGMENT with the per-attempt wake credential. A tool
// error becomes the tool's RESULT ({ error }) rather than a throw, so it surfaces as
// a tool-result part (contract §4.2), never crashes the segment.
// ---------------------------------------------------------------------------

function buildReadTools(secret: string, clientId: string) {
  const read = <T>(fn: (c: PgExec) => Promise<T>) => pools().withReadWakeScoped(secret, fn);
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await fn();
    } catch (e) {
      return { error: `${label} failed: ${String((e as Error)?.message ?? e)}` };
    }
  };
  return {
    get_context_pack: tool({
      description: "Read the typed context pack for the current client (what exists + the books_version token).",
      inputSchema: z.object({ purpose: z.string().optional() }),
      execute: ({ purpose }: { purpose?: string }) =>
        safe("get_context_pack", () =>
          read((c) =>
            c.query("select clara.get_context_pack($1, $2) as pack", [clientId, purpose ?? "chat"]).then((r) => r.rows[0]?.pack ?? null),
          ),
        ),
    }),
    trial_balance: tool({
      description: "Read the client's trial balance (approved entries), summed by the database.",
      inputSchema: z.object({}),
      execute: () =>
        safe("trial_balance", () =>
          read((c) =>
            c
              .query("select coalesce(jsonb_agg(t), '[]'::jsonb) as tb from clara.trial_balance($1) t", [clientId])
              .then((r) => r.rows[0]?.tb ?? []),
          ),
        ),
    }),
    list_journal_entries: tool({
      description: "List the client's journal entries (most recent first).",
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
      execute: ({ limit }: { limit?: number }) =>
        safe("list_journal_entries", () =>
          read((c) =>
            c
              .query("select coalesce(jsonb_agg(e), '[]'::jsonb) as es from clara.list_journal_entries($1, $2) e", [clientId, limit ?? 50])
              .then((r) => r.rows[0]?.es ?? []),
          ),
        ),
    }),
    get_journal_entry: tool({
      description: "Read one journal entry (header + lines) by id.",
      inputSchema: z.object({ entryId: z.string().uuid() }),
      execute: ({ entryId }: { entryId: string }) =>
        safe("get_journal_entry", () =>
          read((c) => c.query("select clara.get_journal_entry($1) as e", [entryId]).then((r) => r.rows[0]?.e ?? null)),
        ),
    }),
    clarify: clarifyTool,
  };
}

// ---------------------------------------------------------------------------
// Steps.
// ---------------------------------------------------------------------------

/** Read the task's durable snapshot + binding (model, session, client, firm). */
export async function loadTaskStep(taskId: string): Promise<{ sessionId: string; model: string; clientId: string | null; firmId: string }> {
  "use step";
  return pools().withRuntime(async (c) => {
    const r = await c.query("select session_id, model_snapshot, client_id, firm_id from clara.agent_tasks where id = $1", [taskId]);
    if (r.rowCount === 0) throw new Error(`chatTurn: task ${taskId} not found`);
    const row = r.rows[0]!;
    return {
      sessionId: String(row.session_id),
      model: String(row.model_snapshot),
      clientId: row.client_id == null ? null : String(row.client_id),
      firmId: String(row.firm_id),
    };
  });
}

/** Load prior transcript (as model messages) + the client context pack (per-attempt credential). */
export async function loadContextStep(
  sessionId: string,
  clientId: string | null,
  firmId: string,
): Promise<{ history: ModelMessage[]; contextPack: unknown | null }> {
  "use step";
  const history = await pools().withRuntime(async (c) => {
    const r = await c.query("select role, parts from clara.chat_messages where session_id = $1 order by seq", [sessionId]);
    return r.rows.map((row) => messageFromParts(String(row.role), (row.parts ?? []) as ClaraPart[])).filter((m): m is ModelMessage => m !== null);
  });
  let contextPack: unknown | null = null;
  if (clientId) {
    // Per-attempt credential minted + used + discarded entirely inside this step.
    const { secret } = await pools().mintWakeCredential(firmId);
    contextPack = await pools().withReadWakeScoped(secret, (c) =>
      c.query("select clara.get_context_pack($1, $2) as pack", [clientId, "chat"]).then((r) => r.rows[0]?.pack ?? null),
    );
  }
  return { history, contextPack };
}

/** One model segment: stream to the run's writable, collect typed parts, detect a clarify. */
export async function runModelSegmentStep(
  model: string,
  clientId: string | null,
  firmId: string,
  messages: ModelMessage[],
  systemExtra: string,
): Promise<{
  parts: ClaraPart[];
  assistantContent: AiContentPart[];
  usageTokens: number;
  clarify: { toolCallId: string; question: string; context?: string } | null;
  finishReason: string;
}> {
  "use step";
  // Per-attempt read credential for the read tools (only when the session is client-bound).
  let tools: Record<string, unknown> = { clarify: clarifyTool };
  if (clientId) {
    const { secret } = await pools().mintWakeCredential(firmId);
    tools = buildReadTools(secret, clientId);
  }

  const result = streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: resolveModel(model) as any,
    system: systemExtra ? `${SYSTEM_PROMPT}\n\n${systemExtra}` : SYSTEM_PROMPT,
    messages,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: tools as any,
    stopWhen: [stepCountIs(8), hasToolCall("clarify")],
  });

  // Stream every part to the run's writable (the live SSE feed). Do NOT close it —
  // the workflow closes exactly once at the end (P2 stream-close law).
  const writer = getWritable<unknown>().getWriter();
  try {
    for await (const part of result.fullStream) {
      await writer.write(part);
    }
  } finally {
    writer.releaseLock();
  }

  const content = (await result.content) as AiContentPart[];
  const usage = await result.totalUsage;
  const finishReason = String(await result.finishReason);
  const usageTokens =
    (usage as { totalTokens?: number }).totalTokens ??
    ((usage as { inputTokens?: number }).inputTokens ?? 0) + ((usage as { outputTokens?: number }).outputTokens ?? 0);

  return {
    parts: toTypedParts(content),
    assistantContent: content,
    usageTokens,
    clarify: findClarifyCall(content),
    finishReason,
  };
}

/** Open a clarify interruption + park the task (awaiting_input, 14-day deadline).
 *  The hook token is carried INSIDE the question payload (0006 has no token column)
 *  so the control listener can resume the exact hook; the workflow creates the hook
 *  BEFORE this step, so the token is live before the interruption is answerable. */
export async function recordInterruptionStep(
  taskId: string,
  hookToken: string,
  clarify: { question: string; context?: string },
): Promise<void> {
  "use step";
  const question = {
    type: "clarify",
    question: clarify.question,
    context: clarify.context ?? null,
    framing: CLARIFY_FRAMING,
    hook_token: hookToken,
  };
  await pools().withRuntime(async (c) => {
    await c.query(
      `insert into clara.agent_interruptions (task_id, question, expires_at)
         values ($1, $2::jsonb, now() + interval '14 days')`,
      [taskId, JSON.stringify(question)],
    );
    // Park the task — awaiting_input is the ONLY parked-visibility source (S4-P1a).
    await c.query("update clara.agent_tasks set status = 'awaiting_input' where id = $1 and status = 'running'", [taskId]);
  });
}

/** Un-park the task on resume (awaiting_input -> running) so it counts as compute. */
export async function markRunningStep(taskId: string): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("update clara.agent_tasks set status = 'running' where id = $1 and status = 'awaiting_input'", [taskId]),
  );
}

/** Settle the turn (idempotent; closes pending interruptions when terminal — S4-D6). */
export async function settleStep(
  taskId: string,
  parts: ClaraPart[],
  tokens: number,
  outcome: "completed" | "failed" | "expired" | "cancelled",
  errorCode: string | null,
): Promise<void> {
  "use step";
  await pools().withRuntime((c) =>
    c.query("select clara.settle_chat_turn($1, $2::jsonb, $3, $4, $5)", [taskId, JSON.stringify(parts), tokens, outcome, errorCode]),
  );
}

/** Close the run's writable exactly once — the readable never signals done otherwise (P2). */
export async function closeStreamStep(): Promise<void> {
  "use step";
  const writer = getWritable<unknown>().getWriter();
  await writer.close();
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Reconstruct a model message from stored Clara parts (text is sufficient for prior turns). */
function messageFromParts(role: string, parts: ClaraPart[]): ModelMessage | null {
  const text = parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "clarify") return `[clarify] ${p.question}`;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) return null;
  if (role === "user") return { role: "user", content: text };
  if (role === "assistant") return { role: "assistant", content: text };
  return null;
}
