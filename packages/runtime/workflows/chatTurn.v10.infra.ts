// @frozen
//
// FROZEN — part of the chatTurn_v10 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// chatTurn_v1..v9 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `chatTurn:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts — INCLUDING a separate attempt on the CHAT lane, which is why this
// family bumps too and not only autoDraft. The DB evidence wall
// (clara._write_entry_evidence) correctly refused CLR21 evidence_invalid every time; a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v10 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (infra) — an UNMODIFIED version-rename of v9: the pool/credential/model
// resolution plumbing, ToolCtx and safeRead are byte-identical; only import paths and the
// version in the prose moved. F9 changes nothing about infrastructure.

import { openai } from "@ai-sdk/openai";
import { readToolRefusalMessage } from "./chatTurn.v10.errors.js";

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
