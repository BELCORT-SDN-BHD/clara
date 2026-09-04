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
//
// 裁-27 — AND THAT SHAPING IS WHY A MIS-TYPED ANSWER WAS UNCORRECTABLE. This card is the
// ONLY surface for that door in the product, so "disabled once settled" meant a wrong answer
// could never be fixed from inside Clara. The amend is now allowed, on the SAME door — but
// it is a SECOND TRIGGER with its own dialog, not the resolve trigger re-enabled, because
// the two acts need to read differently to the person doing them: resolving is answering an
// open question, amending is correcting an answer that is already on the record and will
// stay on the record.
//
// THE AMEND IS A NEW RESOLUTION, NEVER AN EDIT OF THE OLD ONE. The door writes the item row
// in place AND appends a full snapshot to `clara.onboarding_plan_revisions` in the same
// transaction (0017:2740-2742) — an append-only table. So the dialog RENDERS THE PRIOR
// ANSWERS out of that trail (lib/onboarding/resolution-history.ts) before asking for a new
// one: the human sees what they are superseding, and the supersession itself is what the
// database records. Nothing here mutates or hides the old answer.
//
// STILL GATED ON `planOpen`. The door refuses CLR10 "onboarding plan is not open" on ANY
// non-open plan (0017:2722), so an amend after commit is not a UI decision to make — it is
// a door that would refuse, and the dialog says so instead of offering a doomed round trip.

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/parts/PartBadge";
import { businessDateTime } from "@/lib/business-date";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";
import { formatPlanItemAnswer, type AnswerTranslator, type FormattedAnswer } from "@/lib/onboarding/answer-format";
import type { ItemResolution } from "@/lib/onboarding/resolution-history";
import type { OnboardingPlanItemRow } from "@/lib/onboarding/types";

const STATE_GLYPH: Record<OnboardingPlanItemRow["state"], string> = {
  pending: "○",
  answered: "✓",
  resolved: "✓",
  deferred: "◐",
};

/** H-26 — the settled answer, said out loud, plus the acknowledged-warning lines and the
 *  UNVERIFIED badge. Rendered in TWO places (the row, and the amend dialog's "answer standing
 *  now"), so it is one component rather than two copies that could drift apart on exactly the
 *  capture whose formatting is a professional-liability signal. */
function SettledAnswer({ formatted, unverifiedLabel }: { formatted: FormattedAnswer; unverifiedLabel: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{formatted.text}</p>
        {/* WARNING-TONED, in BOTH places (the open question the map raised, answered the
            careful way): a registration the product did not recognise and did not check is
            the one capture a reader must not mistake for a verified identity, and the amend
            dialog is precisely where someone decides whether to correct it. */}
        {formatted.unverified ? <Badge tone="warning">{unverifiedLabel}</Badge> : null}
      </div>
      {formatted.warnings.map((line) => (
        <p key={line} className="text-xs text-warning">{line}</p>
      ))}
    </div>
  );
}

export function OnboardingItemRow({
  item,
  busy,
  planOpen,
  onResolve,
  priorResolutions,
  onRequestHistory,
  extraControls,
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
  /** 裁-27 — the item's SUPERSEDED answers, read from `onboarding_plan_revisions` by the
   *  parent and passed down (the card owns every read; this row renders). `null` means the
   *  trail has not been read yet, which is a DIFFERENT fact from `[]` ("read, and this
   *  answer has never been amended") and the dialog says so. */
  priorResolutions?: ItemResolution[] | null;
  /** Fired when the amend dialog opens, so the parent can fetch the trail lazily — a plan's
   *  full revision snapshots are not worth loading for every row on every render. */
  onRequestHistory?: () => void;
  extraControls?: ReactNode;
}) {
  const t = useTranslations("ClientOnboarding.item");
  // H-26 — the answer namespace, narrowed to the shape `formatPlanItemAnswer` takes. The cast
  // is to next-intl's key-literal typing only: every key this resolves is asserted to EXIST in
  // messages/en.json by `answer-format.test.ts`, which walks the real catalog rather than
  // trusting this line.
  const tAnswer = useTranslations("ClientOnboarding.answer") as unknown as AnswerTranslator;
  const [resolution, setResolution] = useState("");
  const [amendment, setAmendment] = useState("");
  const isPending = item.state === "pending";
  const canResolve = isPending && planOpen;
  // 裁-27: the amend is offered for a SETTLED item on an OPEN plan — the exact complement of
  // the resolve trigger's own gate, so between them every state has one honest control.
  const canAmend = !isPending && planOpen;
  const hasAnswer = item.answer !== null && item.answer !== undefined;
  const formatted = hasAnswer ? formatPlanItemAnswer(item.item_key, item.answer, tAnswer) : null;

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true">{STATE_GLYPH[item.state]}</span>
        <span className="font-medium text-card-foreground">{item.question ?? item.item_key}</span>
        <Badge tone={isPending ? "neutral" : "info"}>{t(`state.${item.state}`)}</Badge>
        {item.required_for_commit ? <Badge tone="warning">{t("requiredForCommit")}</Badge> : null}
      </div>
      {/* H-26 — was `String(item.answer)`, which read "[object Object]" for every
          interview-written answer (all of them are jsonb objects; only a human resolution is
          a string). The formatter names the shape it recognises and falls back to ordered
          `key: value` lines for one it does not — never JSON, never a blob. */}
      {!isPending && formatted !== null ? (
        <SettledAnswer formatted={formatted} unverifiedLabel={t("unverifiedBadge")} />
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
        {/* "close this and use Amend resolution" is only true where that trigger EXISTS.
            `canAmend` is `!isPending && planOpen`, so on a settled receipt's rows (planOpen
            false) the old unconditional line told a professional to use a control that is not
            on the screen and could not be — `resolve_onboarding_plan_item` refuses CLR10 on any
            non-open plan (0017:2722). Each arm now says the thing that is true of its own row:
            an amendable settled item points at the amend door; anything on a closed plan says
            the plan is closed, pending or not. */}
        {!isPending && planOpen ? <p className="text-xs text-muted-foreground">{t("alreadySettledAmendable")}</p> : null}
        {!planOpen ? <p className="text-xs text-muted-foreground">{t("planNotOpen")}</p> : null}
      </OnboardingDoorDialog>

      {/* 裁-27 — the amend. Rendered only for a settled item, and only while the plan is
          open; see this file's header for why the door itself is the gate on the second
          half. Same door, second entry point, its own words. */}
      {canAmend ? (
        <OnboardingDoorDialog
          triggerLabel={t("amendTrigger")}
          title={t("amendTitle")}
          description={t("amendDescription", { item: item.question ?? item.item_key })}
          confirmLabel={t("amendConfirm")}
          busy={busy}
          confirmDisabled={amendment.trim().length === 0}
          onOpen={onRequestHistory}
          onConfirm={async () => {
            await onResolve(amendment.trim(), () => setAmendment(""));
          }}
        >
          {/* WHAT IS BEING SUPERSEDED, shown before the field that supersedes it. The
              standing answer comes from the item row; the ones before it come from the
              append-only revision trail. Neither is edited by this dialog. */}
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2">
            <p className="text-xs font-medium text-card-foreground">{t("amendCurrentLabel")}</p>
            {formatted === null ? (
              <p className="text-xs text-muted-foreground">{t("amendNoCurrent")}</p>
            ) : (
              <SettledAnswer formatted={formatted} unverifiedLabel={t("unverifiedBadge")} />
            )}
          </div>
          {priorResolutions === null || priorResolutions === undefined ? (
            <p className="text-xs text-muted-foreground">{t("amendHistoryLoading")}</p>
          ) : priorResolutions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("amendHistoryNone")}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-card-foreground">{t("amendHistoryLabel")}</p>
              <ol className="flex flex-col gap-1">
                {priorResolutions.map((prior) => (
                  <li key={prior.revisionN} className="text-xs text-muted-foreground">
                    {t("amendHistoryEntry", { at: businessDateTime(prior.at), answer: prior.answerText })}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("amendAppendOnlyNote")}</p>
          <Textarea
            aria-label={t("amendTrigger")}
            placeholder={t("amendPlaceholder")}
            value={amendment}
            onChange={(e) => setAmendment(e.target.value)}
          />
        </OnboardingDoorDialog>
      ) : null}
      {extraControls}
    </li>
  );
}
