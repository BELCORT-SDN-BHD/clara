"use client";

// The get_open_question read — T7 (port-wave plan §4: "Questions:
// get_open_question · open_question · promote_clarify_to_question"). An
// on-demand expand beside the existing resolve/dismiss affordance
// (./open-question-affordance.tsx), never fetched until asked for — the
// needs-you queue can render many open_question rows at once, and this
// detail (the spawned coding rule, if any) is not needed to act on most of
// them.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { businessDateTime } from "@/lib/business-date";
import { getOpenQuestionDetail } from "@/lib/coding/reads";
import type { OpenQuestionDetail as OpenQuestionDetailResult } from "@/lib/coding/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "./data-state";

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
          <dd>{state.data.question.origin}</dd>
          <dt className="text-muted-foreground">{t("openedAtLabel")}</dt>
          <dd>{businessDateTime(state.data.question.opened_at)}</dd>
          {state.data.rule ? (
            <>
              <dt className="text-muted-foreground">{t("spawnedRuleLabel")}</dt>
              <dd>{state.data.rule.account_code} ({state.data.rule.status})</dd>
            </>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
