// @frozen
//
// Frozen statementFacts_v2 STEPS (F-A1 PR-4, design §3.7). Infrastructure is process-injected
// via globalThis so pool / storage / model-adapter tuning stays OUTSIDE the immutable workflow
// closure — the AB-16 precedent every sibling class (documentIngest, invoiceFacts,
// statementFacts.v1, witnessFacts.v1) uses. Step IO carries only the task id and small
// receipts: bytes, credentials, the raw region text and the provider payload never cross a WDK
// boundary.
//
// THE STRUCTURED LANE'S STEPS ARE IMPORTED, NOT DUPLICATED — the chatTurn.v10->v11 precedent
// (chatTurn.v11.ts's own header: "the coding lane ... are v10's bodies, reached by IMPORT rather
// than by copy, so they cannot drift"), applied here because `claimStatementFactsTaskStep` and
// `processStatementFactsTaskStep` are BYTE-IDENTICAL requirements for statementFacts_v2: the
// claim mechanism (`claim_document_processing_task`, 3-arg) has not changed, and the
// `statement_parse` lane is carried over BEHAVIOURALLY UNCHANGED (this PR's own work order,
// STEP 2). Re-exporting from statementFacts.v1.impl.ts — a SAME-FAMILY, cross-VERSION reuse —
// is a different case from the cross-FAMILY duplication statementFacts.v2.dispatch.mjs
// practises against witnessFacts.v1: freeze-lint hash-locks statementFacts.v1.impl.ts already
// (deployed:true), so this file's closure simply includes it unchanged, exactly as
// chatTurn.v11.impl.ts's closure includes chatTurn.v10.impl.ts unchanged.
//
// `processStatementFactsTaskStep` (v1's) is ONLY EVER CALLED HERE with a doc whose
// `lane === 'statement_parse'` — the workflow body (statementFacts.v2.ts) is what enforces
// that, by branching BEFORE calling either path. Passing it a `statement_facts`-lane doc would
// run v1's OLD Azure-based OCR lane, which this version REPLACES; the branch in
// statementFacts.v2.ts is therefore load-bearing and not a convenience.

import { claimStatementFactsTaskStep, processStatementFactsTaskStep } from "./statementFacts.v1.impl.js";
import {
  classifyStatementWitnessFailure,
  ownsStatementWitnessLane,
  persistStatementWitnessPair,
  runStatementWitnessTextRead,
  runStatementWitnessVisionRead,
} from "./statementFacts.v2.behavior.mjs";
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

/** THE ONE PERSIST + SETTLE. `clara.persist_statement_facts_v2` writes both reader blobs and
 *  settles the task done in ONE transaction, and returns its own stored receipt on a replay
 *  (mirrors `clara.persist_witness_facts`'s idempotency contract). */
export async function persistStatementWitnessPairStep(
  taskId: string,
  textRead: StatementWitnessTextRead,
  visionRead: StatementWitnessVisionRead,
): Promise<{ taskId: string; status: string }> {
  "use step";
  const out = await persistStatementWitnessPair(services(), pools().withRuntime, taskId, textRead, visionRead);
  return { taskId: out.taskId, status: out.status };
}

/** A refusal and a permanent fault must not invite another retry — another retry on this lane
 *  is another PAID model call. A transient fault is rethrown UNCHANGED so the step retries;
 *  anything terminal becomes a FatalError, which the durable engine does not retry.
 *
 *  THE TASK ITSELF IS ALREADY SETTLED by the time a terminal error reaches here — the
 *  behaviour's `withStatementTerminalSettle` called `clara.fail_statement_facts(task, code)` on
 *  the way out. This function only shapes the ERROR the durable engine sees. */
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
