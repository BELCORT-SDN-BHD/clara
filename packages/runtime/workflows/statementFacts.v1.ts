// @frozen
//
// statementFacts_v1 (Wave C-b — `docs/plan/wave-c-b-bank-design.md` §4.3, part2 §5): a NEW
// registered frozen workflow CLASS beside the byte-untouched documentIngest_v2 and
// invoiceFacts_v1. It opens the `bank_statement` -> `skipped_kind` dead end the router has
// had since 0026, and it serves BOTH statement lanes from ONE body:
//
//   `statement_facts`  (pdf/image) — two independent readers, a typed governed-egress
//                                    dispatch wrapping ONLY the vendor read.
//   `statement_parse`  (csv/ofx)   — one deterministic in-process parse; the chain is the
//                                    second reader (WC-R7). No vendor, no egress.
//
// Branching on the CLAIMED TASK's own lane (rather than shipping two workflow classes) is
// the documentIngest ocr/structured_parse precedent: the orchestration is identical — claim,
// then process — and everything that differs lives inside the processing step's behaviour.
//
// No LLM participates in either lane. No chat concurrency is consumed. Do NOT edit this
// file or its import closure once deployed (ARCHITECTURE Appendix A immutability): a
// behavioural change ships as statementFacts.v2.ts with the registry repointed, and this
// export stays reachable until zero non-terminal runs reference it.

import { claimStatementFactsTaskStep, processStatementFactsTaskStep } from "./statementFacts.v1.impl.js";

export async function statementFacts_v1(
  input: { task_id: string },
): Promise<{ task_id: string; outcome: string; lane?: string }> {
  "use workflow";
  const taskId = input.task_id;
  const claim = await claimStatementFactsTaskStep(taskId);
  if (!claim.claimed) return { task_id: taskId, outcome: claim.status };
  const result = await processStatementFactsTaskStep(taskId, claim.doc);
  return { task_id: taskId, outcome: result.status, lane: result.lane };
}
