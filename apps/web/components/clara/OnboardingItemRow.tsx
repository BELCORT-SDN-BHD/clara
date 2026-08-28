"use client";

// One onboarding-plan-item row — the Manus "task progress" checklist line
// (mobbin-grounding-wave-2026-08-28.md §T11 takeaway 1): a checkmark for a
// completed item, a plain marker for a pending one, never an interpolated
// percentage. "Completed" is `state !== 'pending'` — every non-pending state
// (`answered`/`resolved`/`deferred`) carries a non-null `answered_at`
// (0017_wave_b.sql:1059-1063's own CHECK), so this is a DB-read fact, never a
// client-derived guess.
//
// The resolve door (resolve_onboarding_plan_item, bookkeeper+) is this
// train's one generic human-resolution act on a plan item. Gating SHAPES,
// never HIDES (AGENTS.md's working protocol): the trigger renders for every
// row, disabled once the item is no longer pending — the DB's own body
// carries no "already resolved" refusal to lean on here (it happily
// re-writes any state to 'resolved'), so disabling client-side is UI shaping
// for a real UX reason, not a fabricated wall; the row's own state label
// still tells the truth regardless.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/parts/PartBadge";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";
import type { OnboardingPlanItemRow } from "@/lib/onboarding/types";

const STATE_GLYPH: Record<OnboardingPlanItemRow["state"], string> = {
  pending: "○",
  answered: "✓",
  resolved: "✓",
  deferred: "◐",
};

export function OnboardingItemRow({
  item,
  busy,
  planOpen,
  onResolve,
}: {
  item: OnboardingPlanItemRow;
  busy: boolean;
  /** resolve_onboarding_plan_item refuses CLR10 "onboarding plan is not open"
   *  on ANY non-open plan (0017:2722) — pre-gated here (SHAPE, never hide:
   *  the door still renders) so a doomed round trip is not the human's first
   *  signal that the plan already closed. */
  planOpen: boolean;
  /** F1 fix (rev-t11): the clear-on-settle discipline lives in the CALLER's
   *  `act(fn, onOk)` — `onOk` fires only inside `act`'s try block, BEFORE the
   *  reload, so a refusal never reaches it (`lib/parts/hooks.ts:221-243`).
   *  This row must not clear its own typed text itself; it hands the clear
   *  down as `onOk` so the parent's `act` decides whether it ever runs —
   *  mirrors this same file's sibling Cancel door
   *  (`OnboardingChecklistCard.tsx`'s `act(fn, () => setCancelReason(""))`). */
  onResolve: (resolution: string, onOk: () => void) => Promise<void>;
}) {
  const t = useTranslations("ClientOnboarding.item");
  const [resolution, setResolution] = useState("");
  const isPending = item.state === "pending";
  const canResolve = isPending && planOpen;

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true">{STATE_GLYPH[item.state]}</span>
        <span className="font-medium text-card-foreground">{item.question ?? item.item_key}</span>
        <Badge tone={isPending ? "neutral" : "info"}>{t(`state.${item.state}`)}</Badge>
        {item.required_for_commit ? <Badge tone="warning">{t("requiredForCommit")}</Badge> : null}
      </div>
      {!isPending && item.answer !== null && item.answer !== undefined ? (
        <p className="text-xs text-muted-foreground">{String(item.answer)}</p>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("resolveTrigger")}
        title={t("resolveTitle")}
        description={t("resolveDescription", { item: item.question ?? item.item_key })}
        confirmLabel={t("resolveConfirm")}
        busy={busy}
        confirmDisabled={!canResolve || resolution.trim().length === 0}
        onConfirm={async () => {
          await onResolve(resolution.trim(), () => setResolution(""));
        }}
      >
        <Textarea
          aria-label={t("resolveTrigger")}
          placeholder={t("resolvePlaceholder")}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          disabled={!canResolve}
        />
        {!isPending ? <p className="text-xs text-muted-foreground">{t("alreadySettled")}</p> : null}
        {isPending && !planOpen ? <p className="text-xs text-muted-foreground">{t("planNotOpen")}</p> : null}
      </OnboardingDoorDialog>
    </li>
  );
}
