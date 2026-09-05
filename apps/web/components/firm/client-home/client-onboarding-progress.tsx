"use client";

// SECTION B — onboarding progress. CONDITIONAL: it renders only when the client's own DB-owned
// status is `onboarding`, or a plan exists for them. For an established client it renders
// nothing at all — not an empty card, not a "0 of 0" line.
//
// AN ONBOARDING CLIENT'S WHOLE STORY IS THE PLAN, which is why this sits directly under the
// identity band rather than in the right column: for a client mid-interview, "how far through
// are we" outranks every other question on the page.
//
// NO PROGRESS BAR. `progress` is not vendored, and the count sentence is the more honest shape
// anyway: "3 of 7 required answers recorded" says which number moved, where a bar says only
// that something did. Vendoring a primitive to draw a figure the DB already states plainly is
// the wrong trade.
//
// THE COUNT IS OVER ROWS ALREADY FETCHED — `listOnboardingPlanItems` returns every item on the
// plan in one unpaginated read, so counting the `required_for_commit` ones client-side is a
// filter over a complete population, not a re-derivation of a DB predicate. The `state` values
// counted as recorded are `answered` and `resolved`: `pending` and `deferred` are, by the DB's
// own vocabulary (0017_wave_b.sql), items still owed.
//
// THE OPENING-POSITION RUNG IS READ, NEVER ASSUMED. `hasFinalizedOpeningSeed` answers the one
// disjunct of `commit_client_onboarding`'s opening-position requirement that the plan items
// cannot answer. It THROWS on a failed read by contract (lib/onboarding/api.ts's own note) and
// that failure is surfaced — a caught failure degraded to `false` would show a rung as unmet
// that the DB may well consider met, which is review law 2 aimed at over-blocking.

import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  getMostRecentOnboardingPlan,
  hasFinalizedOpeningSeed,
  listOnboardingPlanItems,
} from "@/lib/onboarding/api";
import type { OnboardingPlanItemRow } from "@/lib/onboarding/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** `answered` and `resolved` are the two states the DB treats as "this item has an answer";
 *  `pending` and `deferred` are not. Exported so the cell asserts the same closed set the
 *  component uses rather than a copy of it. */
export const ONBOARDING_ANSWERED_STATES: readonly string[] = ["answered", "resolved"];

export function countRequiredAnswers(items: readonly OnboardingPlanItemRow[]): {
  answered: number;
  required: number;
} {
  const required = items.filter((item) => item.required_for_commit);
  return {
    answered: required.filter((item) => ONBOARDING_ANSWERED_STATES.includes(item.state)).length,
    required: required.length,
  };
}

type PlanSnapshot = {
  planId: string;
  state: string;
  revisionN: number;
  committedAt: string | null;
  answered: number;
  required: number;
  openingSeeded: boolean;
};

export function ClientOnboardingProgress({
  clientId,
  status,
}: {
  clientId: string;
  /** The client's own `clara.clients.status`. Read by the page, passed in — this section
   *  renders on the DB's status, never on the mere presence of a plan document. */
  status: string;
}) {
  const t = useTranslations("ClientWorkspace");

  const plan = useAsyncRead<PlanSnapshot | null>(async () => {
    const row = await getMostRecentOnboardingPlan(clientId, { session: sessionTokenAccessor });
    if (row === null) return null;
    const [items, seeded] = await Promise.all([
      listOnboardingPlanItems(row.id, { session: sessionTokenAccessor }),
      hasFinalizedOpeningSeed(clientId, row.id, { session: sessionTokenAccessor }),
    ]);
    const { answered, required } = countRequiredAnswers(items);
    return {
      planId: row.id,
      state: row.state,
      revisionN: row.revision_n,
      committedAt: row.committed_at,
      answered,
      required,
      openingSeeded: seeded,
    };
  });

  // Render NOTHING when neither condition holds — an established client with no plan has no
  // onboarding story, and an empty card claiming otherwise is noise on their board.
  if (status !== "onboarding" && !plan.loading && !plan.error && plan.data === null) return null;

  return (
    <section aria-labelledby="client-home-onboarding" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="client-home-onboarding">{t("onboardingHeading")}</span>
      </SectionHeader>
      <DataState
        loading={plan.loading}
        error={plan.error}
        isEmpty={plan.data === null}
        emptyMessage={t("onboardingNoPlan")}
      >
        {plan.data ? (
          <ul className="enter-content flex flex-col gap-1 text-sm text-card-foreground">
            <li>{t("onboardingAnswers", { answered: plan.data.answered, required: plan.data.required })}</li>
            <li>
              {plan.data.openingSeeded ? t("onboardingOpeningSeeded") : t("onboardingOpeningPending")}
            </li>
            <li className="text-xs text-muted-foreground">
              {t("onboardingPlanState", { state: plan.data.state, revision: plan.data.revisionN })}
            </li>
          </ul>
        ) : null}
      </DataState>
      {/* NO LINK AND NO CONTROL HERE, DELIBERATELY. The checklist that actually runs the
          interview lives in the Clara rail, mounted beside this page by
          app/(firm)/layout.tsx — a "continue onboarding" affordance is that card's own, and
          duplicating it would be two entrances to one governed run. This section reports
          progress; it does not offer to advance it. */}
      <p className="text-xs text-muted-foreground">{t("onboardingWhereToContinue")}</p>
    </section>
  );
}
