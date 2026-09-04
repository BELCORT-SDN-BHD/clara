"use client";

// The get_open_question read — T7 (port-wave plan §4: "Questions:
// get_open_question · open_question · promote_clarify_to_question"). An
// on-demand expand beside the existing resolve/dismiss affordance
// (./open-question-affordance.tsx), never fetched until asked for — the
// needs-you queue can render many open_question rows at once, and this
// detail (the spawned coding rule, if any) is not needed to act on most of
// them.
//
// TWO RAW DB TOKENS REACHED THE SCREEN AND NO LONGER DO (2026-09-04, the twin of
// the documents-side `event_kind` flaw). `question.origin` rendered its enum
// value verbatim — a professional read "clarify_promotion" — and the spawned
// rule rendered "<account_code> (<status>)", printing
// "suspended_pending_resignature" the same way. Both are now CHECKED lookups
// with an honest unknown arm, the `components/firm/firm-activity-feed.tsx:66`
// shape: only a value this build knows reaches `t()` with a statically-valid
// key, and anything outside the vocabulary renders through an explicit
// "unrecognized" template rather than as a next-intl key path OR as the raw
// token. Absence of a label is stated, never silently shown.
//
// THE TWO VOCABULARIES, at their LIVE bodies (apps/web/AGENTS.md: chase the
// live body, never a migration's first CREATE — both of these were replaced,
// one of them three times):
//   · `clara.open_questions.origin` — `open_questions_origin_check_0017` as
//     REDEFINED at `0121_f_a3_pr1b_agent_limb.sql:288-290`: clarify_promotion,
//     rule_proposal, rule_conflict, sweep_refusal, manual, classification,
//     onboarding, bank_ambiguity. (0011:804 minted five, 0016:202 added
//     `classification`, 0017:666 renamed the constraint, 0121 added the last
//     two.) `OpenQuestionOrigin` in lib/coding/types.ts:136-138 already carries
//     exactly that set, so the map below is keyed off the TYPE — a ninth value
//     added there without a label is a tsc error, not a raw token on screen.
//   · `clara.coding_rules.status` — `coding_rules_status_check_0016`
//     (`0016_a21_compliance_watch.sql:97-98`, the live one; no later migration
//     replaces it): proposed, live, declined, retired,
//     suspended_pending_resignature. `CodingRuleRow.status` is typed `string`,
//     so this one needs its own runtime membership check.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { businessDateTime } from "@/lib/business-date";
import { getOpenQuestionDetail } from "@/lib/coding/reads";
import type { OpenQuestionDetail as OpenQuestionDetailResult, OpenQuestionOrigin } from "@/lib/coding/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";

/** The origin vocabulary, as a value list checked against the TYPE — see the
 *  header. `satisfies` is what ties it to the DB's own set: drop a member and
 *  the array no longer covers `OpenQuestionOrigin`, which tsc rejects. */
const OPEN_QUESTION_ORIGINS = [
  "clarify_promotion", "rule_proposal", "rule_conflict", "sweep_refusal",
  "manual", "classification", "onboarding", "bank_ambiguity",
] as const satisfies readonly OpenQuestionOrigin[];

function isKnownOrigin(origin: string): origin is OpenQuestionOrigin {
  return (OPEN_QUESTION_ORIGINS as readonly string[]).includes(origin);
}

/** `coding_rules.status`, 0016:97-98. `CodingRuleRow.status` is `string` on the
 *  wire, so membership is checked at runtime rather than by the type. */
const CODING_RULE_STATUSES = [
  "proposed", "live", "declined", "retired", "suspended_pending_resignature",
] as const;
type CodingRuleStatus = (typeof CODING_RULE_STATUSES)[number];

function isKnownRuleStatus(status: string): status is CodingRuleStatus {
  return (CODING_RULE_STATUSES as readonly string[]).includes(status);
}

export function OpenQuestionDetail({ questionId }: { questionId: string }) {
  const t = useTranslations("CodingQuestionsSignals.openQuestion");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "loaded"; data: OpenQuestionDetailResult } | { kind: "error"; error: unknown }
  >({ kind: "idle" });

  const reveal = () => {
    setOpen(true);
    if (state.kind === "loaded") return;
    setState({ kind: "loading" });
    getOpenQuestionDetail(questionId, { session: sessionTokenAccessor })
      .then((data) => setState({ kind: "loaded", data }))
      .catch((error) => setState({ kind: "error", error }));
  };

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={reveal}>
        {t("viewDetailsTrigger")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2 text-xs">
      {state.kind === "loading" ? <p className="text-muted-foreground">{t("loadingDetail")}</p> : null}
      {state.kind === "error" ? <ErrorMessage error={state.error} /> : null}
      {state.kind === "loaded" && !state.data ? <p className="text-muted-foreground">{t("detailNotReachable")}</p> : null}
      {state.kind === "loaded" && state.data ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted-foreground">{t("originLabel")}</dt>
          <dd>
            {isKnownOrigin(state.data.question.origin)
              ? t(`origins.${state.data.question.origin}`)
              : t("originUnknown", { origin: state.data.question.origin })}
          </dd>
          <dt className="text-muted-foreground">{t("openedAtLabel")}</dt>
          <dd>{businessDateTime(state.data.question.opened_at)}</dd>
          {state.data.rule ? (
            <>
              <dt className="text-muted-foreground">{t("spawnedRuleLabel")}</dt>
              {/* The ACCOUNT CODE is the DB's own identifier and renders
                  verbatim — it is what a bookkeeper looks up. Only the STATUS
                  was an engineering token, and only it is relabelled. */}
              <dd>
                {state.data.rule.account_code} —{" "}
                {isKnownRuleStatus(state.data.rule.status)
                  ? t(`ruleStatuses.${state.data.rule.status}`)
                  : t("ruleStatusUnknown", { status: state.data.rule.status })}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
