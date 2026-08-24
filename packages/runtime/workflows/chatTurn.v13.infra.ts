// @frozen
//
// FROZEN — part of the chatTurn_v13 closure (F-A2: CHAT PARITY, owner ruling D34). A NEW frozen
// closure beside the byte-untouched chatTurn_v1..v12 (ARCHITECTURE Appendix A: a behavioural
// change ships as a new _vN export, never an in-place edit — registry.ts repoints `chatTurn:`
// here).
//
// WHY THIS FILE EXISTS AT ALL, AND IT IS THE WHOLE POINT OF THE LIMB. `chatTurn.v10.infra.ts`
// carries `// @frozen` on line 1 and declares the two mint helpers the chat lane uses. Both
// hardcode `"interactive"` and take no client. The contract F-A2 must satisfy is that what
// cannot post lands as a draft **or a typed open question** — and the chat lane cannot do the
// second, because `clara.wake_open_question` is keyed on the credential's CLIENT PIN and a plain
// `interactive` credential is client-less by construction. Changing the mint is therefore
// changing a FROZEN body, which is forbidden; the change ships as this NEW frozen infra file and
// the registry repoints to the closure that imports it. v10/v11/v12 are byte-untouched and stay
// exported so no parked run is stranded (policy (c)).
//
// THIS FILE (infra) — v13 vs v10: the pool/credential/model resolution plumbing, `ToolCtx` and
// `safeRead` are BYTE-CARRIED. Three things are added:
//   1. `ClaraPools` declares `mintWakeCredentialClientObo` — the `interactive_client` mint.
//   2. `questionScoped`, the ONE call path R-1 narrows the pinned kind to.
// Metering lives in the closure's sibling `chatTurn.v13.usage.ts`; keeping it out of this
// infrastructure module avoids pretending the credential limb owns the usage writer.
//
// R-1, AND IT IS NARROW ON PURPOSE. The pinned credential is minted for the fail-closed
// `wake_open_question` call ALONE. Every other chat read and write — INCLUDING the post — keeps
// plain `interactive` with its NULL-client guarantee, which is what makes §D.2's census findings
// (list_unassigned_documents regressing, `coding_lane` widening silently and changing frozen
// chatTurn_v12's answers with no byte change, eight further readers flipping) genuinely not
// arise rather than merely be argued around. The DB agrees independently: `interactive_client`
// holds EXACTLY ONE `wake_fn_allowlist` row, for `wake_open_question`, and the post verb is
// allowlisted for `autodraft` and `interactive` only — measured on the rig, not assumed.

import { openai } from "@ai-sdk/openai";
import { readToolRefusalMessage } from "./chatTurn.v10.errors.js";

export type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

export type ClaraPools = {
  mintWakeCredential(firmId: string, ttl?: string): Promise<{ credentialId: string; secret: string }>;
  mintWakeCredentialObo(firmId: string, oboUserId: string, ttl?: string): Promise<{ credentialId: string; secret: string }>;
  /** F-A2 (D34 / R-1): the PINNED chat kind, `interactive_client`. Declared here and used by
   *  `questionScoped` ALONE — the narrowing is the whole safety argument (see this file's
   *  header), so a second call site is a design change, not a convenience. */
  mintWakeCredentialClientObo(
    firmId: string,
    oboUserId: string,
    clientId: string,
    ttl?: string,
  ): Promise<{ credentialId: string; secret: string }>;
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

/**
 * F-A2 — THE ONE CALL PATH THE PINNED KIND EXISTS FOR (R-1). A write minted under
 * `interactive_client`, client-pinned and OBO the initiator, for `clara.wake_open_question` and
 * nothing else.
 *
 * IT REFUSES WITHOUT A CLIENT RATHER THAN FALLING BACK. A chat session with no client has no
 * client-scoped question to open; minting plain `interactive` instead would produce a credential
 * `wake_open_question` refuses CLR03 anyway, one layer further from the cause. Fail closed and
 * say which precondition was missing.
 *
 * THE WALL IS THE PIN, NOT THE KIND NAME, and the DB says so in its own words: PR-1 re-keyed
 * `wake_open_question` onto `w.client_id is null or w.client_id is distinct from p_client`
 * (law 27(3)), which is what satisfies 0011:1980-1983's PIN BLOCKER on its own stated exit
 * condition rather than deleting it. So this helper's job is to present a credential that IS
 * pinned to the client the question names — never to assert a kind.
 */
export async function questionScoped<T>(ctx: ToolCtx, fn: (c: PgExec) => Promise<T>): Promise<T> {
  if (!ctx.clientId) {
    throw Object.assign(new Error("a client-scoped open question needs a client-pinned session"), {
      code: "CLR03",
      detail: '{"reason":"question_needs_client_pin"}',
    });
  }
  const { secret } = await pools().mintWakeCredentialClientObo(ctx.firmId, ctx.createdBy, ctx.clientId);
  return pools().withWriteWakeScoped(secret, fn);
}
