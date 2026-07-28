// @frozen
//
// documentIngest_v2 (ledger task #28): fixes the sidecar-before-retries ordering defect in v1's
// behavior closure — see documentIngest.behavior_v2.mjs's own header for the full measured
// diagnosis and the fix. The workflow SHAPE is unchanged from v1 (claim, then process) because
// the defect lives entirely inside the processing step's own failure handling, not in the
// orchestration around it. documentIngest.v1.ts stays byte-identical and reachable
// (registry.ts) so any in-flight v1 run finishes on v1; new admissions target v2.

import { claimDocumentTaskStep, processDocumentTaskStepV2 } from "./documentIngest.impl_v2.js";

export async function documentIngest_v2(
  input: { task_id: string },
): Promise<{ task_id: string; outcome: string; lane?: string }> {
  "use workflow";
  const taskId = input.task_id;
  const claim = await claimDocumentTaskStep(taskId);
  if (!claim.claimed) return { task_id: taskId, outcome: claim.status };
  const result = await processDocumentTaskStepV2(taskId);
  return { task_id: taskId, outcome: result.status, lane: result.lane };
}
