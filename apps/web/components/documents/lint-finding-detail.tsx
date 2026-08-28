"use client";

// The get_lint_finding read — T7 (port-wave plan §4: "Signals: get_lint_finding
// · resolve_lint_finding..."). An on-demand expand, same reasoning as
// components/firm/open-question-detail.tsx's own header: never fetched until
// asked for, and the lint-findings section can show several rows at once.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { businessDateTime } from "@/lib/business-date";
import { getLintFindingDetail } from "@/lib/coding/reads";
import type { LintFindingDetail as LintFindingDetailResult } from "@/lib/coding/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "@/components/firm/data-state";

export function LintFindingDetail({ findingId }: { findingId: string }) {
  const t = useTranslations("CodingQuestionsSignals.lintFinding");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "loaded"; data: LintFindingDetailResult } | { kind: "error"; error: unknown }
  >({ kind: "idle" });

  const reveal = () => {
    setOpen(true);
    if (state.kind === "loaded") return;
    setState({ kind: "loading" });
    getLintFindingDetail(findingId, { session: sessionTokenAccessor })
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
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <dt className="text-muted-foreground">{t("dedupeKeyLabel")}</dt>
            <dd className="wrap-anywhere">{state.data.finding.dedupe_key}</dd>
          </dl>
          {state.data.events.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {state.data.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2">
                  <span>{event.event_kind}</span>
                  <span className="text-muted-foreground">{businessDateTime(event.created_at)}</span>
                  {event.rationale ? <span className="text-muted-foreground">— {event.rationale}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
