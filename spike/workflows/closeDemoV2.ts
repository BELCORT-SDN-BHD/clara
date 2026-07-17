import { createHook, getWorkflowMetadata } from "workflow";
import type { Approval } from "../lib/types.js";
import { auditMark, finalize, postEntry } from "./steps.js";

/**
 * T6 mitigation: the NAME-VERSIONED successor of closeDemo. Deployed
 * ALONGSIDE the untouched V1 (`closeDemo`) so that runs parked on V1
 * complete on V1 semantics while new enqueues target this workflow.
 *
 * Observable V2 markers: approver prefixed `v2:`, an extra `audit_mark`
 * canary row, and `codeVersion` in the return value.
 */
export async function closeDemoV2(opKey: string, amountCents: number) {
  "use workflow";
  const meta = getWorkflowMetadata();

  const posted = await postEntry(opKey, amountCents);

  const hook = createHook<Approval>({ token: `approval:${opKey}` });
  const approval = await hook;

  const completion = await finalize(meta.workflowRunId, opKey, {
    approved: approval.approved,
    approver: `v2:${approval.approver ?? "unknown"}`,
  });
  const mark = await auditMark(opKey, "closeDemoV2");

  return { opKey, posted, approval, completion, mark, codeVersion: "closeDemoV2" };
}
