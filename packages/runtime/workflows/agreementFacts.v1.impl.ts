// @frozen
//
// Frozen agreementFacts_v1 STEPS. #948.
//
// Infrastructure is process-injected via globalThis so pool / storage / model-adapter tuning
// stays OUTSIDE the immutable workflow closure — the AB-16 precedent every sibling class uses.
// Step IO carries only the task id and small receipts: bytes, credentials, the raw region text
// and the provider payload never cross a WDK boundary.
//
// THE STEP BOUNDARY IS THE MEMOIZATION BOUNDARY. Four steps: claim, text read, vision read, one
// persist. A replay after a crash re-enters at the first step whose result was not banked, which
// is why the two reads are separate steps — a completed text read is not paid for twice.
//
// THE CLAIM ARITY IS PINNED (3-arg, `claim_document_processing_task(uuid,text,boolean)`), the
// same arity every sibling lane claims through.

import { FatalError, getWorkflowMetadata } from "workflow";
import {
  classifyAgreementFailure,
  interpretClaimReceipt,
  ownsAgreementLane,
  persistAgreementPair,
  runAgreementTextRead,
  runAgreementVisionRead,
} from "./agreementFacts.v1.behavior.mjs";

type PgExec = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
};

type ClaraPools = {
  withRuntime<T>(fn: (client: PgExec) => Promise<T>): Promise<T>;
};

/** One channel's model call. */
type AgreementModelCall = {
  channel: "text" | "vision";
  system: string;
  prompt: string;
  schema: unknown;
  file?: { path: string; mime: string };
};

type AgreementFactsServices = {
  taskTempPath(taskId: string): string;
  removeTempFile(path: string): Promise<unknown>;
  downloadCanonical(key: string, destination: string, sha256: string): Promise<unknown>;
  callAgreementModel(call: AgreementModelCall): Promise<{ object: unknown; usage?: Record<string, unknown> }>;
  agreementMediaType(mime: string): string | null;
  engineSnapshot: { engineId: string };
  log?: (message: string) => void;
};

/** The flat document metadata the claim receipt carries on a 'running'/'replayed' claim. */
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
type AgreementTextRead = {
  input_pin: string;
  prompt_hash: string;
  envelope: Record<string, unknown>;
  citations: Array<Record<string, unknown>>;
  usage: Record<string, unknown>;
  pages_used: number | null;
};

/** The writer's `p_vision` call blob. NO citations: the vision channel never sees regions. */
type AgreementVisionRead = {
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

/** This family's OWN services slot. It carries its OWN engine snapshot, and the engine id is the
 *  provenance stamp the behaviour refuses to egress without matching — so it must never share a
 *  slot with another family's bundle. */
function services(): AgreementFactsServices {
  const value = (globalThis as unknown as { __claraAgreementFactsServicesV1?: AgreementFactsServices }).__claraAgreementFactsServicesV1;
  if (!value) throw new Error("agreement-facts services not injected (globalThis.__claraAgreementFactsServicesV1)");
  return value;
}

/** Claim the agreement task. */
export async function claimAgreementFactsTaskStepV1(
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
export async function agreementTextReadStepV1(taskId: string, doc: ClaimDoc | null): Promise<AgreementTextRead> {
  "use step";
  if (!ownsAgreementLane(doc)) throw new Error(`agreement text read: task ${taskId} is not a contract_facts document task`);
  try {
    return (await runAgreementTextRead(services(), pools().withRuntime, taskId, doc)) as AgreementTextRead;
  } catch (err) {
    throw rethrowAgreement(err);
  }
}

/** THE VISION MODEL CALL — its own memoized step. */
export async function agreementVisionReadStepV1(taskId: string, doc: ClaimDoc | null): Promise<AgreementVisionRead> {
  "use step";
  if (!ownsAgreementLane(doc)) throw new Error(`agreement vision read: task ${taskId} is not a contract_facts document task`);
  try {
    return (await runAgreementVisionRead(services(), pools().withRuntime, taskId, doc)) as AgreementVisionRead;
  } catch (err) {
    throw rethrowAgreement(err);
  }
}

/** THE ONE PERSIST + SETTLE. */
export async function persistAgreementFactsStepV1(
  taskId: string,
  textRead: AgreementTextRead,
  visionRead: AgreementVisionRead,
): Promise<{ taskId: string; status: string }> {
  "use step";
  const out = await persistAgreementPair(services(), pools().withRuntime, taskId, textRead, visionRead);
  return { taskId: out.taskId, status: out.status };
}

/** A refusal and a permanent fault must not invite another retry. */
function rethrowAgreement(err: unknown): unknown {
  const verdict = classifyAgreementFailure(err);
  if (verdict.retry) return err;
  if (err instanceof FatalError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return Object.assign(new FatalError(`agreement read terminally failed (${verdict.code}): ${message}`), {
    code: verdict.code,
    cause: err,
  });
}
