// @frozen
//
// documentIngest_v2 steps (ledger task #28 — the sidecar-before-retries ordering fix; full
// rationale in documentIngest.behavior_v2.mjs's own header). The CLAIM step is UNCHANGED from
// v1 — this fix touches processing/failure handling only — so it is imported, not duplicated,
// from the frozen v1 impl module (documentIngest.impl.ts, byte-identical, never edited by this
// file) and re-exported here so documentIngest.v2.ts has a single impl import, matching v1's
// own shape. Only the processing step is new.
//
// `getStepMetadata().attempt` is read HERE, at the top of the actual step function — the one
// place `workflow`'s docs guarantee it is valid — and handed to the behavior function as a
// plain parameter, never read from ambient context deep inside a nested call. `.maxRetries` is
// set EXPLICITLY on the step (matching MAX_RETRIES, the single source of truth in
// documentIngest.behavior_v2.mjs) rather than left to the framework default implicitly.

import { getStepMetadata } from "workflow";
import { claimDocumentTaskStep } from "./documentIngest.impl.js";
import { MAX_RETRIES, processDocumentTaskBehaviorV2 } from "./documentIngest.behavior_v2.mjs";

export { claimDocumentTaskStep };

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

type DocumentServices = {
  noteClaim(taskId: string, status: string, runId: string | null): Promise<unknown>;
  readTaskMeta(taskId: string): Promise<Record<string, unknown> | null>;
  removeTaskMeta(taskId: string): Promise<unknown>;
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  analyzeDocument(path: string, mime: string, task: Record<string, unknown>): Promise<Record<string, unknown>>;
  parseStructured(path: string, format: string, task: Record<string, unknown>): Promise<Record<string, unknown>>;
  // v2's split vocabulary (documentIngest.behavior_v2.mjs / spool.mjs's own headers): the
  // sidecar note now reflects which plane the DB actually committed, never a fixed guess.
  // `status` (R1 residual, the R-round's closing finding): defaults to "running" in
  // spool.mjs — the honest value for every call site EXCEPT the one branch that re-reads a
  // CONFIRMED, concrete status that isn't "running" (documentIngest.behavior_v2.mjs's own
  // R1(c) shape), which passes that verified value through explicitly instead.
  noteTransientFailure(taskId: string, code: string, note?: string, status?: string): Promise<unknown>;
  noteTerminalFailure(taskId: string, code: string, note?: string): Promise<unknown>;
};

function pools(): ClaraPools {
  const value = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!value) throw new Error("runtime pools not injected (globalThis.__claraPools)");
  return value;
}

function services(): DocumentServices {
  const value = (globalThis as unknown as { __claraDocumentServices?: DocumentServices }).__claraDocumentServices;
  if (!value) throw new Error("document services not injected (globalThis.__claraDocumentServices)");
  return value;
}

export async function processDocumentTaskStepV2(taskId: string): Promise<{ taskId: string; status: string; lane: string }> {
  "use step";
  const { attempt } = getStepMetadata();
  return processDocumentTaskBehaviorV2(services(), pools().withRuntime, taskId, attempt);
}
processDocumentTaskStepV2.maxRetries = MAX_RETRIES;
