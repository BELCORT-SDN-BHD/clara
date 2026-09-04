"use client";

// ONE persisted transcript row, and the one thing a row knows that a part does not:
// which parts are its SIBLINGS.
//
// Extracted from ClaraThreadView.tsx's message map — same JSX, same tokens, same merge
// history (kept verbatim in the comments below, because both of those notes record a
// measured contrast decision that a re-write would quietly lose). What is NEW is the
// tool-status composition: `PartRenderer` is handed one part at a time and therefore
// cannot see whether a `tool_call` was answered, which is why its own body called that
// resolution "a later lane's wiring". This is that wiring, and this is the only
// altitude at which it is sound — the sibling set IS the message's `parts` array.

import { useTranslations } from "next-intl";

import { PartSlot } from "@/components/clara/PartSlot";
import type { MessageRow } from "@/lib/clara/api";
import type { SessionTokenAccessor } from "@/lib/session";
import { resolveToolStatuses } from "@/lib/parts/toolStatus";
import { cn } from "@/lib/utils";

export function ClaraMessageBubble({
  message,
  session,
}: {
  message: MessageRow;
  session: SessionTokenAccessor;
}) {
  const t = useTranslations("Clara.thread");
  // A `tool_call` and its `tool_result`/`tool_error` always land in the SAME persisted
  // row: chatTurn.v17.ts:98 pushes every segment's parts into one `allParts` array and
  // :83 settles that array once. So this row's own parts are the complete evidence
  // available about each call's outcome — see lib/parts/toolStatus.ts for the mapping
  // and for why there is deliberately no "running" arm.
  const toolStatuses = resolveToolStatuses(message.parts);

  return (
    // `enter-content`: a message ARRIVING is the archetypal "prevent a
    // jarring change". It fires per new message only — a streaming
    // assistant turn keeps its key, so the text grows without the
    // bubble ever re-animating.
    <div className={cn("enter-content rounded-lg p-2 text-sm", message.role === "user" ? "bg-muted" : "bg-clara-muted")}>
      {/* `text-secondary-ink` on the Clara-role ground, not `text-muted-
          foreground`: the live axe scan measures the latter at 4.49:1 on
          `--clara-muted` — the exact blind spot `secondary-ink-on-clara-muted`
          was pinned for after InterviewRunCard hit it (check-token-contrast.mjs
          PAIR_SPECS). The user bubble keeps the muted ink it passes on.
          MERGE NOTE: P6-3 had moved BOTH roles to secondary-ink for
          consistency; #508's conditional is kept because it is the
          merged decision and both arms clear AA on their own ground
          (muted-foreground 4.624:1 on bg-muted, secondary-ink 7.072:1 on
          bg-clara-muted). P6-3's `secondary-ink-on-muted` gate row is
          re-sourced accordingly rather than left naming this line. */}
      <p className={cn("mb-1 text-xs font-medium", message.role === "user" ? "text-muted-foreground" : "text-secondary-ink")}>
        {t(`role.${message.role}`)}
      </p>
      {message.parts.map((part, i) => (
        <PartSlot
          key={i}
          part={part}
          taskId={message.task_id}
          session={session}
          // Passed for a `tool_call` and nothing else. A part that is not a call has
          // no status of its own to carry, and handing one down would invite a card
          // to render a state no part of the wire reported.
          toolStatus={part.type === "tool_call" ? toolStatuses.get(part.tool_call_id) : undefined}
        />
      ))}
    </div>
  );
}
