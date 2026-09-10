// @frozen
//
// FROZEN — part of the chatTurn_v18 closure (#623, the chat half). A NEW frozen closure beside
// byte-untouched chatTurn_v1..v17.
//
// THE STAMP MOVES; THE RECORDER DOES NOT. v16's and v17's own arrangement carried forward:
// `recordChatUsage` accepts its engine id as a parameter, so the recorder, signature probe,
// never-refuse discipline and freeform-read stamp stay owned by v15 and are reached by import.
// Only this closure's chat engine label changes, from `chatturn-v17` to `chatturn-v18`.

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
  return `llm-openai:${modelId}:chatturn-v18`;
}
