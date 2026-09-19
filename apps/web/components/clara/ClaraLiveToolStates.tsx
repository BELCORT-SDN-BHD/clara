"use client";

// #642 AC4 / UI-10 / UI-27 / UI-32 — WHAT CLARA IS ACTUALLY DOING, WHILE SHE DOES IT.
//
// THE DEFECT. `toolStatus.ts` resolves a chip's outcome from the SETTLED transcript and
// says so in its own header: "THERE IS DELIBERATELY NO 'RUNNING' ARM… a `tool_call` part
// only ever reaches a screen from the SETTLED transcript". That was true and correct
// while the live SSE buffer was folded for `clarify` alone — and it meant a turn that
// took a minute showed the reader nothing but an elapsed-time line, and then all of its
// steps at once, already finished. `lib/clara/liveTools.ts` folds the buffer the stream
// was already carrying; this renders it.
//
// FOUR STATES, AND `queued` IS A NAMED RESIDUAL. See liveTools.ts's header: the stream
// carries no admission event, so a live *queued* chip would be this surface asserting a
// state nothing reported. *preparing* is NOT *queued* and is never labelled as one.
//
// NO LINK ON A CHIP (G4). A source link would need a new field on `tool_result`, whose
// wire shape is minted by `toTypedParts_v10` inside the FROZEN `chatTurn.v10.prompt.ts`.
// Source links hang on the RESULT CARD, which is a different altitude and a different
// ticket's surface.
//
// OUTSIDE THE LOG, AND WITH NO LIVE REGION OF ITS OWN — the same two decisions
// `ClaraThreadView` records for the clarify group and for `TurnProgress`. Outside,
// because a `role="log"` containing a self-announcing widget is the DS-04 nested-live-
// region defect this component must not reopen. Without one, because a chip that moves
// preparing → running → done inside one turn would announce three times per step, and
// the sentence a screen-reader user actually needs ("Clara is responding…") is already
// announced by the stream-status line. The group carries an accessible NAME so it is
// still reachable and identifiable.

import { useTranslations } from "next-intl";

import { Badge, type BadgeTone } from "@/components/parts/PartBadge";
import type { LiveToolState, LiveToolStep } from "@/lib/clara/liveTools";
import { chatToolLabel } from "@/lib/clara/toolLabel";

/** Tone per live state, kept beside the renderer so the two cannot drift.
 *
 *  EVERY TONE IS ONE THIS TREE ALREADY RENDERS (`components/parts/PartBadge.tsx`), so
 *  `scripts/check-token-contrast.mjs`'s closed PAIR_SPECS world gains no entry and the
 *  two live axe measurements `ClaraMessageBubble.tsx:43-53` records on these grounds
 *  still stand. *preparing* and *running* share `neutral` deliberately: neither is an
 *  outcome, and giving an in-flight step a colour of its own would read as a verdict. */
const TONE: Record<LiveToolState, BadgeTone> = {
  preparing: "neutral",
  running: "neutral",
  done: "info",
  failed: "error",
  refused: "warning",
};

export function ClaraLiveToolStates({ steps }: { steps: readonly LiveToolStep[] }) {
  const t = useTranslations("Clara.thread");
  // Absence renders NOTHING — `liveClarify.ts:63-65`'s rule, and H-32's. An empty group
  // with a heading would tell the reader a step is happening when none is.
  if (steps.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={t("liveTools.label")}
      data-slot="clara-live-tools"
      className="flex flex-wrap items-center gap-1"
    >
      {steps.map((step) => (
        <Badge key={step.toolCallId} tone={TONE[step.state]}>
          {/* UI-32 — the HUMAN label, with the runtime's own token as the fallback for a
              tool this build has never heard of. A prettified token would read like a
              label while still being the implementation's word. */}
          <span>{chatToolLabel(step.tool, (key) => t(key))}</span>
          {/* The separator is an EXPLICIT string, not a flex gap: a gap is a visual space
              only, so the accessible text would otherwise run the two words together.
              Same idiom `PartRenderer`'s resolved chip uses. */}
          <span className="font-normal">{" · "}{t(`liveTools.state.${step.state}`)}</span>
        </Badge>
      ))}
    </div>
  );
}
