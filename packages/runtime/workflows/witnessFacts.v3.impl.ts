// @frozen
//
// Frozen witnessFacts_v3 STEPS (the NEXT-ROUND QUEUE fold). The witnessFacts_v2 steps,
// byte-for-byte, with exactly one thing moved: the behaviour it drives is
// witnessFacts.v3.behavior.mjs.
//
// NO NEW SERVICES GLOBAL, AND THAT IS A DELIBERATE DEPARTURE FROM THE v1->v2 PRECEDENT, stated
// because a silent omission is how a reader would mistake it for an oversight. v1->v2 needed a
// SEPARATE global (`__claraWitnessFactsServicesV2`) because the ENGINE ID moved with that version
// — v2 stamped `llm-openai:{model}:v2` and a straggler v1 run reading v2's slot would have stamped
// `:v2` provenance onto a read the frozen v1 prompt body produced (witnessFacts.v2.services.mjs's
// own header). v2->v3 carries NO engine-id change: this fold adds no answer key, widens no wire
// schema, and touches nothing vendor-shaped — every fix is prompt WORDING plus one dropped receipt
// member (witnessFacts.v3.prompts.mjs / .envelope.mjs headers). So the engine snapshot v2 already
// injects under `__claraWitnessFactsServicesV2` is EXACTLY what a v3 read should carry: it names
// the same model, the same contract-version stamp the DB router mints, and reusing it means this
// version needs no coupled DB migration and no deploy-order obligation at all — the registry
// repoint alone is the whole cutover. What DOES distinguish a v3 read from a v2 read is the PROMPT
// HASH (witnessFacts.v3.prompts.mjs's `witnessPromptHash`, which embeds "witnessFacts.v3"), which
// is the receipt this version's identity is designed to travel on — not `engine_id`, which is
// reserved for vendor/contract-version provenance and does not need to move for a wording-only
// prompt fix. A FUTURE version that DOES add an answer key or otherwise widens the wire schema
// must NOT default to this same reuse — it needs its own services file and global slot, exactly
// as v2 did, for the exact reason v2's header states.
//
// Infrastructure is process-injected via globalThis so pool / storage / model-adapter tuning
// stays OUTSIDE the immutable workflow closure — the exact AB-16 precedent every sibling class
// uses. Step IO carries only the task id and small receipts: bytes, credentials, the raw region
// text and the provider payload never cross a WDK boundary.
//
// THE STEP BOUNDARY IS THE MEMOIZATION BOUNDARY (design §3.1) — unchanged from v1/v2.
//
// THE CLAIM ARITY IS PINNED (3-arg, `claim_document_processing_task(uuid,text,boolean)`) —
// unchanged from v1/v2.

import { FatalError, getWorkflowMetadata } from "workflow";
import {
  classifyWitnessFailure,
  interpretClaimReceipt,
  ownsWitnessLane,
  persistWitnessPair,
  runWitnessTextRead,
  runWitnessVisionRead,
} from "./witnessFacts.v3.behavior.mjs";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

/** One channel's model call. Identical shape to v2's — the adapter is infrastructure and this
 *  version reuses v2's own bundle unchanged (this file's header). */
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
  witnessMediaType(mime: string): string | null;
  engineSnapshot: { engineId: string };
  log?: (message: string) => void;
};

/** The flat document metadata the claim receipt carries on a 'running'/'replayed' claim
 *  (PIN-AB-6). Identical shape to v2's. */
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

/** Reads the SAME global v2 injects — no `__claraWitnessFactsServicesV3` exists, and none is
 *  needed (this file's header explains why). If a future version widens the wire schema and
 *  therefore DOES need its own engine snapshot, it must mint its own global rather than extend
 *  this one. */
function services(): WitnessFactsServices {
  const value = (globalThis as unknown as { __claraWitnessFactsServicesV2?: WitnessFactsServices }).__claraWitnessFactsServicesV2;
  if (!value) throw new Error("witness-facts services not injected (globalThis.__claraWitnessFactsServicesV2, reused by v3)");
  return value;
}

/** Claim the witness task. BYTE-UNCHANGED FROM v2 apart from the imported interpreter. */
export async function claimWitnessFactsTaskStepV3(
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
export async function witnessTextReadStepV3(taskId: string, doc: ClaimDoc | null): Promise<WitnessTextRead> {
  "use step";
  if (!ownsWitnessLane(doc)) throw new Error(`witness text read: task ${taskId} is not an llm_witness document task`);
  try {
    return (await runWitnessTextRead(services(), pools().withRuntime, taskId, doc)) as WitnessTextRead;
  } catch (err) {
    throw rethrowWitness(err);
  }
}

/** THE VISION MODEL CALL — its own memoized step. */
export async function witnessVisionReadStepV3(taskId: string, doc: ClaimDoc | null): Promise<WitnessVisionRead> {
  "use step";
  if (!ownsWitnessLane(doc)) throw new Error(`witness vision read: task ${taskId} is not an llm_witness document task`);
  try {
    return (await runWitnessVisionRead(services(), pools().withRuntime, taskId, doc)) as WitnessVisionRead;
  } catch (err) {
    throw rethrowWitness(err);
  }
}

/** THE ONE PERSIST + SETTLE. */
export async function persistWitnessFactsStepV3(
  taskId: string,
  textRead: WitnessTextRead,
  visionRead: WitnessVisionRead,
): Promise<{ taskId: string; status: string }> {
  "use step";
  const out = await persistWitnessPair(services(), pools().withRuntime, taskId, textRead, visionRead);
  return { taskId: out.taskId, status: out.status };
}

/** A refusal and a permanent fault must not invite another retry. BYTE-UNCHANGED FROM v2. */
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
