// @frozen
//
// Frozen statementFacts_v3 STEPS. Copied from statementFacts.v2.impl.ts (F-A1 PR-4, design
// §3.7) and edited in ONE place — the persist step now has the try/catch its two sibling read
// steps always had (H-05). Infrastructure is process-injected via globalThis so pool / storage
// / model-adapter tuning stays OUTSIDE the immutable workflow closure — the AB-16 precedent
// every sibling class uses. Step IO carries only the task id and small receipts: bytes,
// credentials, the raw region text and the provider payload never cross a WDK boundary.
//
// v3 REUSES v2's SERVICES BUNDLE AND ITS globalThis SLOT, deliberately. The engine snapshot
// (`llm-openai:gpt-5.6-terra:stmt-witness-v1`) is UNCHANGED, because the DB router literal that
// stamps `document_processing_tasks.engine_id` is unchanged (0102) — so a v3 task's stamp
// matches this image's snapshot the moment the registry entry deploys, and this version carries
// NO coupled migration and NO deploy-order obligation. That is the witnessFacts v2->v3
// precedent (registry.ts's own note on that repoint), not a shortcut: minting a second bundle
// under a second slot would be the thing that created an ordering hazard, not the thing that
// avoided one.
//
// THE STRUCTURED LANE'S STEPS ARE IMPORTED, NOT DUPLICATED — the chatTurn.v10->v11 precedent
// applied here because `claimStatementFactsTaskStep` and `processStatementFactsTaskStep` are
// BYTE-IDENTICAL requirements for statementFacts_v3: the claim mechanism has not changed and
// the `statement_parse` lane is carried over BEHAVIOURALLY UNCHANGED. Freeze-lint hash-locks
// statementFacts.v1.impl.ts already, so this file's closure simply includes it unchanged.
//
// `processStatementFactsTaskStep` (v1's) is ONLY EVER CALLED HERE with a doc whose
// `lane === 'statement_parse'` — the workflow body (statementFacts.v3.ts) is what enforces
// that, by branching BEFORE calling either path. Passing it a `statement_facts`-lane doc would
// run v1's OLD Azure-based OCR lane, which this version REPLACES; the branch in
// statementFacts.v3.ts is therefore load-bearing and not a convenience.

import { claimStatementFactsTaskStep, processStatementFactsTaskStep } from "./statementFacts.v1.impl.js";
import {
  classifyStatementWitnessFailure,
  ownsStatementWitnessLane,
  persistStatementWitnessPair,
  runStatementWitnessTextRead,
  runStatementWitnessVisionRead,
} from "./statementFacts.v3.behavior.mjs";
import { FatalError } from "workflow";

export { claimStatementFactsTaskStep, processStatementFactsTaskStep };

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

/** The flat document metadata the claim receipt carries — the SAME shape statementFacts.v1's
 *  own `ClaimDoc` uses (PIN-AB-6). `lane` is load-bearing: the workflow body branches on it. */
type ClaimDoc = {
  document_id: string;
  firm_id: string;
  lane: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
  byte_size: number;
};

/** One channel's model call. The ADAPTER is infrastructure (non-frozen): it owns model
 *  resolution, the timeout, the provider content parts and the file read. */
type StatementWitnessModelCall = {
  channel: "text" | "vision";
  system: string;
  prompt: string;
  schema: unknown;
  file?: { path: string; mime: string };
};

type StatementWitnessServices = {
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  callStatementWitnessModel(call: StatementWitnessModelCall): Promise<{ object: unknown; usage?: Record<string, unknown> }>;
  statementWitnessMediaType(mime: string): string | null;
  engineSnapshot: { engineId: string };
  log?: (message: string) => void;
};

/** The writer's reader-1 (text) blob plus the pair's page count. */
type StatementWitnessTextRead = {
  header: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  engineId: string | null;
  pages_used: number | null;
};

/** The writer's reader-2 (vision) blob. */
type StatementWitnessVisionRead = {
  header: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  engineId: string | null;
};

function pools(): ClaraPools {
  const value = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!value) throw new Error("runtime pools not injected (globalThis.__claraPools)");
  return value;
}

function services(): StatementWitnessServices {
  const value = (globalThis as unknown as { __claraStatementWitnessServices?: StatementWitnessServices }).__claraStatementWitnessServices;
  if (!value) throw new Error("statement-witness services not injected (globalThis.__claraStatementWitnessServices)");
  return value;
}

/** THE TEXT MODEL CALL — its own memoized step. */
export async function statementWitnessTextReadStep(taskId: string, doc: ClaimDoc | null): Promise<StatementWitnessTextRead> {
  "use step";
  if (!ownsStatementWitnessLane(doc)) throw new Error(`statement witness text read: task ${taskId} is not a statement_facts witness-pair document task`);
  try {
    return (await runStatementWitnessTextRead(services(), pools().withRuntime, taskId, doc)) as StatementWitnessTextRead;
  } catch (err) {
    throw rethrowStatementWitness(err);
  }
}

/** THE VISION MODEL CALL — its own memoized step. */
export async function statementWitnessVisionReadStep(taskId: string, doc: ClaimDoc | null): Promise<StatementWitnessVisionRead> {
  "use step";
  if (!ownsStatementWitnessLane(doc)) throw new Error(`statement witness vision read: task ${taskId} is not a statement_facts witness-pair document task`);
  try {
    return (await runStatementWitnessVisionRead(services(), pools().withRuntime, taskId, doc)) as StatementWitnessVisionRead;
  } catch (err) {
    throw rethrowStatementWitness(err);
  }
}

/**
 * THE ONE PERSIST + SETTLE. `clara.persist_statement_facts_v2` writes both reader blobs and
 * settles the task done in ONE transaction, and returns its own stored receipt on a replay
 * (mirrors `clara.persist_witness_facts`'s idempotency contract).
 *
 * H-05: THE try/catch IS THE FIX'S OUTER HALF. v2's version of this step had none, so a raised
 * DB verdict reached the durable engine as a bare error — retried until the attempt cap, never
 * shaped into a FatalError, and (because the behaviour did not wrap the persist either) never
 * settling the task, which stayed `running` forever. The behaviour now settles; this arm makes
 * the engine stop re-buying a persist that can only fail the same way.
 */
export async function persistStatementWitnessPairStep(
  taskId: string,
  textRead: StatementWitnessTextRead,
  visionRead: StatementWitnessVisionRead,
): Promise<{ taskId: string; status: string }> {
  "use step";
  try {
    const out = await persistStatementWitnessPair(services(), pools().withRuntime, taskId, textRead, visionRead);
    return { taskId: out.taskId, status: out.status };
  } catch (err) {
    throw rethrowStatementWitness(err);
  }
}

/** A refusal and a permanent fault must not invite another retry — another retry on this lane
 *  is another PAID model call. A transient fault is rethrown UNCHANGED so the step retries;
 *  anything terminal becomes a FatalError, which the durable engine does not retry.
 *
 *  THE TASK ITSELF IS ALREADY SETTLED by the time a terminal error reaches here — the
 *  behaviour's `withStatementTerminalSettle` called `clara.fail_statement_facts(task, code)` on
 *  the way out, on the PERSIST arm as well as the two read arms (v3). This function only shapes
 *  the ERROR the durable engine sees. */
function rethrowStatementWitness(err: unknown): unknown {
  const verdict = classifyStatementWitnessFailure(err);
  if (verdict.retry) return err;
  if (err instanceof FatalError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new FatalError(`statement witness read terminally failed (${verdict.code}): ${message}`), {
    code: verdict.code,
    cause: err,
  });
}
