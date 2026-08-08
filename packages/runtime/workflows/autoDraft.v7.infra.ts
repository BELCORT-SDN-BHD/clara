// @frozen
//
// FROZEN — part of the autoDraft_v7 closure (WAVE E, the F6–F9 fix batch; H1 ACCEPTANCE
// FINDING F9, ADR-064 §3). A NEW frozen closure beside the byte-untouched
// autoDraft_v1..v6 (ARCHITECTURE Appendix A: a behavioural change ships as a new _vN
// export, never an in-place edit — the registry repoints `autoDraft:` here).
//
// THE FINDING, ONCE, FOR THE WHOLE CLOSURE. The drafting model mis-transcribed ONE hex
// group of a 36-character region UUID (…-4c6d-… for the true …-4fce-…), recurring across
// independent attempts, and the DB evidence wall (clara._write_entry_evidence) correctly
// refused CLR21 evidence_invalid every time — its id-equality contract is right, and a
// hand-draft citing the true id drafted clean first try
// (docs/plan/wave-7a-acceptance-h1.md:773-790). The defect is upstream, in asking a model
// to reproduce an opaque 36-char identifier it was shown once inside a large JSON array.
// v7 stops asking: the toolface takes a small INDEX (`region_idx`) into the region list
// read_document printed, and the WRAPPER resolves index -> region_id server-side before
// the DB writer is called. The wall is untouched and still receives a region_id.
//
// THIS FILE (infra) — an UNMODIFIED version-rename of v6: the pool/credential/model
// resolution plumbing, ToolCtx (including PR #204's `direction` field) and safeRead are
// byte-identical; only the import path and the version in the prose moved. F9 changes
// nothing about infrastructure.

import { openai } from "@ai-sdk/openai";
import { readToolRefusalMessage } from "./autoDraft.v7.errors.js";

export type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

export type ClaraPools = {
  withReadWakeScoped<T>(secret: string, fn: (c: PgExec) => Promise<T>): Promise<T>;
  withWriteWakeScoped<T>(secret: string, fn: (c: PgExec) => Promise<T>): Promise<T>;
  withRuntime<T>(fn: (c: PgExec) => Promise<T>): Promise<T>;
};

/** The per-tool execution context: the firm + the PINNED client + the document/filing the
 *  admission bound this task to, PLUS the admission-bound direction ('sales' | 'purchase' |
 *  null — PR #204, the tri-state contract's runtime-visible half). */
export type ToolCtx = {
  firmId: string;
  clientId: string;
  documentId: string;
  filingId: string;
  taskId: string;
  direction: "sales" | "purchase" | null;
};

/** The short TTL minted for a per-attempt read/write step (never outlives one attempt). */
const AUTODRAFT_CREDENTIAL_TTL = process.env.CLARA_AUTODRAFT_CREDENTIAL_TTL || "5 minutes";

export function pools(): ClaraPools {
  const p = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!p) throw new Error("runtime pools not injected (globalThis.__claraPools) — the supervisor must inject them at boot");
  return p;
}

/** Resolve the language model. Production uses the OpenAI provider with the SNAPSHOT id; a
 *  test injects a mock via globalThis (no network/key ever in tests). Reuses the chatTurn
 *  test override name so a single mock arms both lanes. */
export function resolveModel(modelId: string): unknown {
  const override = (globalThis as unknown as { __claraModelForTest?: unknown }).__claraModelForTest;
  return override ?? openai(modelId);
}

/** Mint a fresh autodraft wake credential (client-pinned, OBO nobody) via the injected
 *  clara_runtime pool. Same secret-handling law as chatTurn's minting helpers — minted, used,
 *  and discarded inside ONE step execution attempt; never crosses a WDK step boundary. */
async function mintAutodraftCredential(firmId: string, clientId: string): Promise<{ secret: string }> {
  return pools().withRuntime(async (c: PgExec) => {
    const r = await c.query(
      "select credential_id, secret from clara.mint_wake_credential($1, $2, null, $3::interval, $4)",
      ["autodraft", firmId, AUTODRAFT_CREDENTIAL_TTL, clientId],
    );
    return { secret: String((r.rows[0] as { secret: unknown }).secret) };
  });
}

/** A client-pinned read under the autodraft credential (read pool, clara_agent_ro). */
export async function readScoped<T>(ctx: ToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  const { secret } = await mintAutodraftCredential(ctx.firmId, ctx.clientId);
  return pools().withReadWakeScoped(secret, fn);
}

/** A write-floor call under the autodraft credential (write pool, clara_wake_interactive). The
 *  secret is minted, used, and committed inside one step — it never crosses a step boundary. */
export async function writeScoped<T>(ctx: ToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  const { secret } = await mintAutodraftCredential(ctx.firmId, ctx.clientId);
  return pools().withWriteWakeScoped(secret, fn);
}

/** Wrap a read tool so an authority/tenant error (CLR03/CLR10/CLR11) becomes ONE oracle-safe
 *  refusal string (identical regardless of a document's existence or count), and any other
 *  fault becomes a generic error result — never a thrown crash. */
export async function safeRead<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: readToolRefusalMessage(e as { code?: string }) };
  }
}
