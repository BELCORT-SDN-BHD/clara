// @frozen
//
// FROZEN — part of the chatTurn_v16 closure (P6-1: THE FOUR-CARD WIRE BUMP). A NEW frozen
// closure beside byte-untouched chatTurn_v1..v15.
//
// THE STAMP MOVES; THE RECORDER DOES NOT, AND THAT IS A DELIBERATE DEPARTURE FROM v15's OWN
// SHAPE. chatTurn.v15.usage.ts duplicated v14's whole file rather than importing it, and its
// header gives the reason: the literal it had to change lived INSIDE the recorder's module, so
// sharing would have made every future edit a version change in both closures. That reason
// does not apply here. `recordChatUsage` takes its engine id as a PARAMETER, so the thing v16
// changes is a function of its own — and the recorder (the signature probe, the one door, the
// never-refuse discipline) is reached BY IMPORT and re-exported below, byte-carried, unable to
// drift. This is chatTurn.v15.infra.ts's idiom applied to the ledger.
//
// `chatEngineId` -> `chatturn-v16`, following v15's own precedent verbatim ("unchanged except
// the engine-id literal `chatturn-v14` -> `chatturn-v15`").
//
// THE STAMP IS A LEDGER LABEL, NEVER A GUARD, AND THAT IS MEASURED RATHER THAN ASSUMED. The
// witness lanes' `:v2` / `:stmt-witness-v1` snapshots ARE guards — `assertStatementEngineStamp`
// WAITS on a mismatch — so a chat stamp that moved under a live guard would be a stranding
// hazard. Nothing consults this one: the only consumers of `chatEngineId` in packages/runtime
// are the two `recordChatUsage` call sites inside each closure's own impl.
//
// AND IT MOVES NO COST LINE, ALSO MEASURED. `clara.llm_price_table`'s seed (0110_f_a9_llm_usage
// _reshape.sql:591-646) carries five engine ids — `gpt-5.6-terra`,
// `llm-openai:gpt-5.6-terra:v1`, `:v2`, `:stmt-witness-v1`, and `gpt-5.6-sol` — and NO
// `chatturn-*` stamp of any version. The join is exact string equality (0110:670-672), so the
// chat lane is ALREADY unpriced, by the design's own tripwire: "An engine stamp that is not
// seeded (a model override, a new lane) stays UNPRICED and shows up in the rollup's unpriced
// count ... deliberately not pattern-matched away" (0110:586-589). Moving v15 -> v16 therefore
// changes no spend figure; it only stops the ledger saying v15 ran when v16 ran.
//
// `freeformEngineId` IS NOT BUMPED, and that is the honest answer rather than the tidy one. It
// labels the body that ran the READ, and under v16 that body is chatTurn.v15.freeform.ts's
// `runFreeformRead` — reached through `buildToolsV15`, by import, byte-identical, never copied.
// Restamping it `chatturn-v16` would mean minting a v16 copy of a frozen module for no reason
// but a label, and the new label would name a file that never executed. It is re-exported
// unchanged, from the closure that owns it.

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
  return `llm-openai:${modelId}:chatturn-v16`;
}
