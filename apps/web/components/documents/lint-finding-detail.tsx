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
import type { LintFindingDetail as LintFindingDetailResult, LintFindingEventKind } from "@/lib/coding/types";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { ErrorMessage } from "@/components/firm/data-state";

/** A CHECKED lookup from the DB's own `event_kind` to a translation key —
 *  `firm-activity-feed.tsx:53-63`'s `RECEIPT_KIND_KEYS` shape, never a dynamic
 *  key built from the raw token.
 *
 *  Before this, the history line printed the raw token: a professional read
 *  "recheck_opened" and "superseded" as if they were English. The set is closed
 *  today (`LintFindingEventKind`, lib/coding/types.ts:110) but a future member
 *  would land on the unknown arm, which renders the raw token deliberately —
 *  honest, and never a fabricated label for a state this app has not been
 *  taught. */
const EVENT_KIND_KEYS: Record<LintFindingEventKind, string> = {
  created: "eventKinds.created",
  superseded: "eventKinds.superseded",
  resolved: "eventKinds.resolved",
  recheck_opened: "eventKinds.recheck_opened",
  evaluation: "eventKinds.evaluation",
};

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
          {/* THE DEDUPE KEY IS GONE FROM THE FACE. It is the engine's internal
              idempotency key — the string that stops one finding being raised
              twice — and it named nothing a professional can act on, under a
              label ("Dedupe key") that is engineering vocabulary. It was the
              only content in this expander besides the history, so removing it
              leaves the history as the whole answer, which is what a human
              opened this for. Nothing is lost that a reader could use: the
              finding's own kind, severity and opened-at are on the row above,
              and the key is still in the DB for the engine that owns it. */}
          {state.data.events.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {state.data.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center gap-2">
                  <span>{eventKindLabel(event.event_kind, t)}</span>
                  <span className="text-muted-foreground">{businessDateTime(event.created_at)}</span>
                  {event.rationale ? <span className="text-muted-foreground">— {event.rationale}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("noEvents")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Resolves one event kind to its label. Split out of the render so the checked
 *  lookup and its honest unknown arm are testable directly
 *  (lint-finding-detail.test.tsx). */
function eventKindLabel(kind: LintFindingEventKind, t: (key: string) => string): string {
  const key = EVENT_KIND_KEYS[kind];
  return key ? t(key) : kind;
}
