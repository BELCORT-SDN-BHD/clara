// @frozen
//
// FROZEN — part of the chatTurn_v15 closure (F-A6 PR-2: THE AUDITED FREEFORM READ). A NEW frozen
// closure beside byte-untouched chatTurn_v1..v14 (ARCHITECTURE Appendix A).
//
// `buildToolsV15` calls v14's `buildToolsV14(ctx, modelId, segment)` BY IMPORT — every v14 tool
// (v13's whole set plus the thirteen bank tools) is BYTE-CARRIED, unchanged, no overrides. This
// closure adds exactly ONE tool.
//
// THE TOOL IS IN THE `interactive` SET AND NOWHERE ELSE. TA-P9 A(3) keeps the unattended lanes
// out, and it does so structurally rather than by omission here: `clara.wake_freeform_read`'s
// allowlist carries exactly two rows, both interactive-family (`interactive`,
// `interactive_client`), and `_freeform_arm` calls `assert_wake_allowed` UNCONDITIONALLY —
// deliberately NOT reusing `_agent_read_admitted`'s interactive/proactive bypass. So an
// `autodraft` or `proactive` credential is refused CLR03 at the DB even if a future closure
// wired the tool in. autoDraft's own tool set is untouched by this PR and stays untouched.
//
// THE READ COUNTER, and it is the `bankPackReadSeq` precedent exactly. A chat turn legitimately
// runs several freeform reads — one question often needs two or three angles — and two reads must
// never share a receipt row's op key. The counter is rebuilt fresh on every `buildToolsV15` call
// (i.e. every segment), which is what makes it deterministic under a same-segment WDK replay and
// distinct across successive reads within the segment.

import { tool } from "ai";
import { buildToolsV14 } from "./chatTurn.v14.tools.js";
import type { ToolCtx } from "./chatTurn.v15.infra.js";
import { FREEFORM_READ_TOOL, freeformReadInputSchema, runFreeformRead, type FreeformReadInput } from "./chatTurn.v15.freeform.js";

export { FREEFORM_READ_TOOL };
export {
  BANK_GET_PACK_TOOL,
  BANK_ACT_TOOLS,
} from "./chatTurn.v14.tools.js";

export function buildToolsV15(ctx: ToolCtx, modelId: string, segment: number) {
  const base = buildToolsV14(ctx, modelId, segment);
  let readSeq = 0;
  return {
    ...base,
    [FREEFORM_READ_TOOL]: tool({
      description:
        "Answer a question about this firm's books with ONE read-only SELECT, when no typed tool fits. " +
        "The database scopes it to this firm (and to this client when the conversation is pinned to one), " +
        "enforces the single-statement / read-only / enumerated-table walls itself, and records your SQL and " +
        "purpose on an audit receipt the firm can read. What comes back is NARRATIVE: say it and reason with " +
        "it, never post it, report it or record it as a fact.",
      inputSchema: freeformReadInputSchema,
      execute: (input: FreeformReadInput) => {
        readSeq += 1;
        return runFreeformRead(ctx, input, modelId, segment, readSeq);
      },
    }),
  };
}
