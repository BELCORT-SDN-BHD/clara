// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. A NEW frozen closure beside byte-untouched
// chatTurn_v1..v22.
//
// THE STAMP MOVES; THE RECORDER DOES NOT. v16's..v22's own arrangement carried forward:
// `recordChatUsage` accepts its engine id as a parameter, so the recorder, signature probe,
// never-refuse discipline and freeform-read stamp stay owned by v15 and are reached by import.
// Only this closure's chat engine label changes, from `chatturn-v22` to `chatturn-v23`.
//
// IT IS LOAD-BEARING, not cosmetic: `scripts/check-workflow-bundle.mjs` derives the expected stamp
// from whatever version the registry pins and REFUSES a built bundle that does not carry it, so a
// metering ledger can never attribute a v23 turn to the v22 body.

export {
  AGENT_USAGE_IDENT,
  CHAT_CALL_KIND,
  FREEFORM_CALL_KIND,
  freeformEngineId,
  liveAgentUsageIdent,
  onUsageProblem,
  recordChatUsage,
  recordFreeformUsage,
  type UsageProblem,
} from "./chatTurn.v15.usage.js";

export function chatEngineId(modelId: string): string {
  return `llm-openai:${modelId}:chatturn-v23`;
}
