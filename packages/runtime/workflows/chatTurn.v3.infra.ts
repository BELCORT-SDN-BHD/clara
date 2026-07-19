// @frozen
//
// FROZEN — injected-infrastructure accessors + wake-credential scoping for the
// chatTurn_v3 closure. Split out of the impl so the 500-line file cap holds (the
// same file-cap discipline the S5 §13 companion follows). Infrastructure (pools,
// model provider) is read from process globals, never imported, so tuning stays
// OUT of the frozen import closure (the AB-16 precedent). Per-attempt credentials
// are minted LAZILY inside the tool boundary OBO the task's created_by (C-11/NEW-5)
// and never cross a WDK step boundary.

import { openai } from "@ai-sdk/openai";
import { readToolRefusalMessage } from "./chatTurn.v3.errors.js";

export type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

export type ClaraPools = {
  mintWakeCredential(firmId: string, ttl?: string): Promise<{ credentialId: string; secret: string }>;
  mintWakeCredentialObo(firmId: string, oboUserId: string, ttl?: string): Promise<{ credentialId: string; secret: string }>;
  withReadWakeScoped<T>(secret: string, fn: (c: PgExec) => Promise<T>): Promise<T>;
  withWriteWakeScoped<T>(secret: string, fn: (c: PgExec) => Promise<T>): Promise<T>;
  withRuntime<T>(fn: (c: PgExec) => Promise<T>): Promise<T>;
};

/** The per-tool execution context threaded into every wake-scoped read/write. */
export type ToolCtx = { firmId: string; clientId: string | null; createdBy: string; taskId: string };

export function pools(): ClaraPools {
  const p = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!p) throw new Error("runtime pools not injected (globalThis.__claraPools) — the supervisor must inject them at boot");
  return p;
}

/** Resolve the language model. Production uses the OpenAI provider with the SNAPSHOT
 *  id; a test injects a mock via globalThis (no network/key ever in tests). */
export function resolveModel(modelId: string): unknown {
  const override = (globalThis as unknown as { __claraModelForTest?: unknown }).__claraModelForTest;
  return override ?? openai(modelId);
}

/** A firm-scoped read minted OBO the initiator: a below-bookkeeper author's OBO mint
 *  is refused (CLR10) so the read never runs privileged past the initiator's floor. */
export async function readScoped<T>(ctx: ToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  const { secret } = await pools().mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return pools().withReadWakeScoped(secret, fn);
}

/** A write-floor call minted OBO the initiator (live bookkeeper+ revalidation, HIGH-5).
 *  The secret is minted, used, and committed inside one step — it never crosses a
 *  step boundary. */
export async function writeScoped<T>(ctx: ToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  const { secret } = await pools().mintWakeCredentialObo(ctx.firmId, ctx.createdBy);
  return pools().withWriteWakeScoped(secret, fn);
}

/** Wrap a read tool so an authority/tenant error (CLR03/CLR10/CLR11) becomes ONE
 *  oracle-safe refusal string (identical regardless of a document's existence or
 *  count), and any other fault becomes a generic error result — never a thrown crash. */
export async function safeRead<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: readToolRefusalMessage(e as { code?: string }) };
  }
}
