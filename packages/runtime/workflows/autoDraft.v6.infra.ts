// @frozen
//
// FROZEN — injected-infrastructure accessors + wake-credential scoping for the autoDraft_v6
// closure (§7-A). Split out of the impl so the file-cap discipline holds. Infrastructure (pools,
// model provider) is read from process globals, never imported, so tuning stays OUT of the
// frozen import closure (the AB-16 precedent). Per-attempt credentials are minted LAZILY
// inside the tool boundary and never cross a WDK step boundary (§4.1).
//
// The autodraft wake credential is minted OBO NOBODY (system origin) with the CLIENT PINNED
// from the admission row (companion §4): `mint_wake_credential('autodraft', firm, null, ttl,
// client)` — the 5-arg form. The reads run client-pinned under it; a cross-client read
// returns the single not-found shape (the C-11 floor). The mint runs as clara_runtime (the
// injected withRuntime), then the secret is bound TXN-LOCALLY into the read pool (clara_agent_ro)
// or the write pool (clara_wake_interactive) — the same pool discipline chatTurn uses, with the
// wake_kind carried by the credential (the allowlist rows for 'autodraft' gate every writer/read).
//
// v6 vs v5 (§7-A, skeleton §2a): the pool/credential/model-resolution plumbing and
// readToolRefusalMessage's shape are unchanged from v5 — this wave's functional changes live
// in autoDraft.v6.prompt.ts / autoDraft.v6.tools.ts / autoDraft.v6.errors.ts /
// autoDraft.v6.impl.ts's settle call, PLUS one small ToolCtx addition here:
//
// PR #204 (the DB lane) landed the bound-direction contract fact this file now carries:
// `ToolCtx` gains `direction: "sales" | "purchase" | null` — the admission-time family
// `begin_autodraft_task` now returns (`autodraft_attempts.direction`, nullable for
// pre-migration rows; the DB never admits an 'unresolved' document into this registry at
// all, so a concrete row is always 'sales' or 'purchase'). The wrapper (tools.ts) validates
// the model's proposed coding_kind against this family BEFORE any DB call; the model step
// (impl.ts) surfaces it in the per-run user message so the model proposes correctly the
// first time. `null` means an unbound/pre-migration attempt — no early validation runs, the
// DB draft writer stays the sole authority, exactly as before this wave.

import { openai } from "@ai-sdk/openai";
import { readToolRefusalMessage } from "./autoDraft.v6.errors.js";

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
