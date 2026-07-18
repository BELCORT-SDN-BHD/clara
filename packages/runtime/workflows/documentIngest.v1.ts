// @frozen
//
// documentIngest_v1 receives one durable task reference. The claim step binds the
// WDK run (or parks OCR at the egress gate); the processing step keeps all bytes,
// credentials, and normalized extraction payloads inside one memoized attempt and
// persists them directly through the database writer. No LLM participates.

import { claimDocumentTaskStep, processDocumentTaskStep } from "./documentIngest.impl.js";

export async function documentIngest_v1(
  input: { task_id: string },
): Promise<{ task_id: string; outcome: string; lane?: string }> {
  "use workflow";
  const taskId = input.task_id;
  const claim = await claimDocumentTaskStep(taskId);
  if (!claim.claimed) return { task_id: taskId, outcome: claim.status };
  const result = await processDocumentTaskStep(taskId);
  return { task_id: taskId, outcome: result.status, lane: result.lane };
}
