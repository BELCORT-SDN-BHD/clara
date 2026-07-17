import { createHook, getWorkflowMetadata } from "workflow";
import type { Approval } from "../lib/types.js";
import { finalize, postEntry } from "./steps.js";

/**
 * The close-demo workflow: step A (post_entry, idempotent DB write) ->
 * parked approval hook (zero-compute, survives restarts) -> step B
 * (finalize, completion marker). No model calls anywhere - this tests the
 * ENGINE (durability / HITL / idempotency), not AI.
 *
 * The workflow body must stay deterministic: no I/O, no Date.now(), no
 * randomness here - all side effects live in the steps.
 */
export async function closeDemo(opKey: string, amountCents: number) {
  "use workflow";
  const meta = getWorkflowMetadata();

  const posted = await postEntry(opKey, amountCents);

  const hook = createHook<Approval>({ token: `approval:${opKey}` });
  const approval = await hook;

  const completion = await finalize(meta.workflowRunId, opKey, approval);

  return { opKey, posted, approval, completion };
}
