// @frozen
//
// Frozen witnessFacts_v2 STEPS (F-A2 openers ①②). The witnessFacts_v1 steps, byte-for-byte, with
// exactly two things moved:
//
//   1. the behaviour it drives is witnessFacts.v2.behavior.mjs;
//   2. it reads its service bundle from ITS OWN global slot, `__claraWitnessFactsServicesV2`.
//
// WHY A SEPARATE GLOBAL, and it is not tidiness. The bundle carries the ENGINE SNAPSHOT, and the
// witness contract version lives inside the engine id — witnessFacts.v1.services.mjs stamps `:v1`
// and witnessFacts.v2.services.mjs stamps `:v2`. If v2 read v1's slot (or if the bump had been an
// edit to v1's constant), a straggler v1 run resuming after this image deploys would stamp `:v2`
// provenance onto a read produced by the FROZEN v1 prompt body — a receipt naming a prompt
// closure that did not read the document, which is the exact shape PRD invariant 2(b) forbids.
// startWorld.ts injects BOTH slots simultaneously and neither replaces the other; this is the
// statementFacts.v1/`__claraStatementFactsServices` + statementFacts.v2/`__claraStatementWitnessServices`
// precedent applied unchanged.
//
// Infrastructure is process-injected via globalThis so pool / storage / model-adapter tuning
// stays OUTSIDE the immutable workflow closure — the exact AB-16 precedent documentIngest_v1,
// invoiceFacts_v1, statementFacts_v1/v2 and witnessFacts_v1 all use. Step IO carries only the
// task id and small receipts: bytes, credentials, the raw region text and the provider payload
// never cross a WDK boundary.
//
// THE STEP BOUNDARY IS THE MEMOIZATION BOUNDARY, and that is why each model call gets its own
// step (design §3.1). A durable step's return value is stored; a later failure REPLAYS it rather
// than re-running the step. So `witnessTextReadStep` and `witnessVisionReadStep` each return a
// small envelope receipt, and a retry of `persistWitnessFactsStep` re-uses BOTH stored envelopes
// instead of buying two more model calls.
//
// THE CLAIM ARITY IS PINNED (3-arg, `claim_document_processing_task(uuid,text,boolean)`). The
// boolean is the GLOBAL kill switch — "is the vendor safe right now" — and `llm_witness` joined
// its lane list at 0090 §5. It is NOT the typed consent, which asks "did this client authorize
// this purpose" and is answered at ENQUEUE and again at each dispatch. Passing the boolean here
// is a call-shape obligation, never an authorization this workflow grants itself.

import { FatalError, getWorkflowMetadata } from "workflow";
import {
  classifyWitnessFailure,
  interpretClaimReceipt,
  ownsWitnessLane,
  persistWitnessPair,
  runWitnessTextRead,
  runWitnessVisionRead,
} from "./witnessFacts.v2.behavior.mjs";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

/** One channel's model call. The ADAPTER is infrastructure (non-frozen): it owns model
 *  resolution, the timeout, the provider content parts and the file read. It is handed the
 *  FROZEN system prompt, user prompt and schema, and returns the parsed object plus token
 *  usage — nothing provider-shaped crosses back. */
type WitnessModelCall = {
  channel: "text" | "vision";
  system: string;
  prompt: string;
  schema: unknown;
  file?: { path: string; mime: string };
};

type WitnessFactsServices = {
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  callWitnessModel(call: WitnessModelCall): Promise<{ object: unknown; usage?: Record<string, unknown> }>;
  /** The provider's media-type contract, asked BEFORE an authorization is minted (review M4):
   *  bytes that can never leave must not consume a single-use dispatch on the way to finding
   *  that out. Returns the provider media type, or null when the channel cannot read it. */
  witnessMediaType(mime: string): string | null;
  /** The engine identity this image serves. The behaviour compares it against the engine_id the
   *  ROUTER stamped on the task BEFORE any egress, so a pair can never carry a provenance
   *  receipt naming a model that was not called. Required, not optional: an absent snapshot is a
   *  wiring fault, and skipping the check when the answer is missing would be fail-open. */
  engineSnapshot: { engineId: string };
  /** Where a settle failure shouts. Optional; defaults to console.error. */
  log?: (message: string) => void;
};

/** The flat document metadata the claim receipt carries on a 'running'/'replayed' claim
 *  (PIN-AB-6) — this lane is receipt-driven, never a spool sidecar. `lane` is load-bearing: the
 *  behaviour refuses to drive a task this workflow does not own. */
type ClaimDoc = {
  document_id: string;
  firm_id: string;
  lane: string;
  storage_path: string;
  sha256: string;
  mime_type: string;
  byte_size: number;
};

/** The writer's `p_text` call blob plus the pair's page count (the writer's 4th argument). */
type WitnessTextRead = {
  input_pin: string;
  prompt_hash: string;
  envelope: Record<string, unknown>;
  citations: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  pages_used: number | null;
};

/** The writer's `p_vision` call blob. NO citations key: the vision channel never sees regions. */
type WitnessVisionRead = {
  input_pin: string;
  prompt_hash: string;
  envelope: Record<string, unknown>;
  usage: Record<string, unknown>;
};

function pools(): ClaraPools {
  const value = (globalThis as unknown as { __claraPools?: ClaraPools }).__claraPools;
  if (!value) throw new Error("runtime pools not injected (globalThis.__claraPools)");
  return value;
}

function services(): WitnessFactsServices {
  const value = (globalThis as unknown as { __claraWitnessFactsServicesV2?: WitnessFactsServices }).__claraWitnessFactsServicesV2;
  if (!value) throw new Error("witness-facts v2 services not injected (globalThis.__claraWitnessFactsServicesV2)");
  return value;
}

/** Claim the witness task. A 'running' claim carries the flat document metadata and proceeds;
 *  'held_egress' parks (the global kill switch); a terminal 'failed' claim — the DB's attempt
 *  cap ALREADY failed + refunded + evented the task — simply ends the workflow, never re-fails
 *  and never loops. */
export async function claimWitnessFactsTaskStepV2(
  taskId: string,
): Promise<{ claimed: boolean; status: string; doc: ClaimDoc | null }> {
  "use step";
  const { workflowRunId } = getWorkflowMetadata();
  const egressApproved = process.env.CLARA_DOC_EGRESS_APPROVED === "1";
  try {
    const result = await pools().withRuntime(async (client) => {
      const row = await client.query("select clara.claim_document_processing_task($1,$2,$3) as receipt", [
        taskId,
        workflowRunId,
        egressApproved,
      ]);
      return (row.rows[0]?.receipt ?? {}) as Record<string, unknown>;
    });
    return interpretClaimReceipt(result) as { claimed: boolean; status: string; doc: ClaimDoc | null };
  } catch (err) {
    // CLR16 covers a missing task or one already claimed by another run — dedupe.
    if ((err as { code?: string })?.code === "CLR16") return { claimed: false, status: "deduped", doc: null };
    throw err;
  }
}

/** THE TEXT MODEL CALL — its own memoized step. */
export async function witnessTextReadStepV2(taskId: string, doc: ClaimDoc | null): Promise<WitnessTextRead> {
  "use step";
  if (!ownsWitnessLane(doc)) throw new Error(`witness text read: task ${taskId} is not an llm_witness document task`);
  try {
    return (await runWitnessTextRead(services(), pools().withRuntime, taskId, doc)) as WitnessTextRead;
  } catch (err) {
    throw rethrowWitness(err);
  }
}

/** THE VISION MODEL CALL — its own memoized step. */
export async function witnessVisionReadStepV2(taskId: string, doc: ClaimDoc | null): Promise<WitnessVisionRead> {
  "use step";
  if (!ownsWitnessLane(doc)) throw new Error(`witness vision read: task ${taskId} is not an llm_witness document task`);
  try {
    return (await runWitnessVisionRead(services(), pools().withRuntime, taskId, doc)) as WitnessVisionRead;
  } catch (err) {
    throw rethrowWitness(err);
  }
}

/** THE ONE PERSIST + SETTLE. `clara.persist_witness_facts` writes both rows, both fact-region
 *  sets and the settle in ONE transaction, and returns its own stored receipt on a replay. */
export async function persistWitnessFactsStepV2(
  taskId: string,
  textRead: WitnessTextRead,
  visionRead: WitnessVisionRead,
): Promise<{ taskId: string; status: string }> {
  "use step";
  const out = await persistWitnessPair(services(), pools().withRuntime, taskId, textRead, visionRead);
  return { taskId: out.taskId, status: out.status };
}

/** A refusal and a permanent fault must not invite another retry — on this lane another retry
 *  is another PAID model call, which is why the terminal/retryable split is enforced at the step
 *  boundary rather than left to the engine's default three attempts. A transient fault is
 *  rethrown UNCHANGED (code, message and all) so the step retries; anything terminal becomes a
 *  FatalError, which the durable engine does not retry. `classifyWitnessFailure` (frozen) owns
 *  the split; this function only applies it.
 *
 *  THE TASK ITSELF IS ALREADY SETTLED by the time a terminal error reaches here — the behaviour's
 *  `withTerminalSettle` called `clara.fail_witness_facts(task, code)` on the way out (review B1).
 *  This function only shapes the ERROR the durable engine sees; it is not what ends the task, and
 *  it must not be described as one. */
function rethrowWitness(err: unknown): unknown {
  const verdict = classifyWitnessFailure(err);
  if (verdict.retry) return err;
  if (err instanceof FatalError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new FatalError(`witness read terminally failed (${verdict.code}): ${message}`), {
    code: verdict.code,
    cause: err,
  });
}
