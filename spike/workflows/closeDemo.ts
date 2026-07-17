import { createHook, getWorkflowMetadata } from "workflow";
import type { Approval } from "../lib/types.js";
import { auditMark, finalize, postEntry } from "./steps.js";

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

  // T6a IN-PLACE CHANGE (build C): the post-hook continuation now writes a
  // marked approver, runs an extra step, and returns a codeVersion field.
  // Runs parked under build A resume into THIS body - the hazard under test.
  const completion = await finalize(meta.workflowRunId, opKey, {
    approved: approval.approved,
    approver: `inplace-v2:${approval.approver ?? "unknown"}`,
  });
  const mark = await auditMark(opKey, "closeDemo-inplace-v2");

  return { opKey, posted, approval, completion, mark, codeVersion: "closeDemo-inplace-v2" };
}
