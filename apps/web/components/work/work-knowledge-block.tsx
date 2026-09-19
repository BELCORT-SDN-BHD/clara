"use client";

// #658 — WHAT THIS WORK READ, AND WHETHER IT HAS MOVED SINCE. B3 Work detail, Sources tab.
//
// WHY IT SITS IN SOURCES. The Sources tab answers "what did this Work stand on". Until now that
// meant documents alone, which was the honest answer only because nothing recorded the OTHER
// thing a run stands on: the client's governed knowledge. `clara.work_knowledge_reads` records it
// per attempt, and this is where a human reads it back.
//
// IT IS ITS OWN COMPONENT, MOUNTED BY ONE LINE. `work-detail.tsx` is 1332 lines and THREE lanes
// are editing it this wave; a section written inside it would collide on every line. Everything is
// here, and the page contributes a single mount — the discipline `work-diagnostics.tsx` wrote down
// for the same file and the same reason.
//
// ONE READ, NOT TWO. `clara.work_knowledge_drift(p_work)` answers both halves — what the last
// recorded attempt read (`read`: key NAMES, tier counts, the face word and its reason) and whether
// the client's basis has moved since. A second door for the first half would be a second read of
// one relation for one panel.
//
// THE FOUR FACE WORDS, AND NEVER A FIFTH. `ok` / `partial` / `unknown` / `denied` — the estate's
// live coverage vocabulary. The runtime's own `unavailable` never reaches a face; migration 0230's
// status CHECK refuses it in the column too, and
// `packages/runtime/lib/knowledge-retrieval.mjs`'s `faceStatusOf` is the one mapping between them.
//
// TWO WORDINGS FOR DRIFT, BECAUSE THE DOOR DISTINGUISHES THEM.
//   `relevant: true`  → "a record this Work read has changed: <keys>".
//   `relevant: null`  → "this client's knowledge changed after this Work last read it; which
//                        records it read was not recorded."
// Never a confident "unrelated" for the second: the observed version came from an execution trace,
// no read-set exists, and claiming irrelevance would be exactly the null-as-empty defect #658
// exists to kill.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { businessDateTime } from "@/lib/business-date";
import {
  driftBannerKeys,
  driftBannerKind,
  readWorkKnowledgeDrift,
  type WorkKnowledgeDriftRead,
} from "@/lib/work/knowledge";
import type { KnowledgeReadStatus } from "@/lib/registers/knowledge";
import type { SessionTokenAccessor } from "@/lib/session";

/** The word is the state; the tone only AGREES with it
 *  (`components/clara/client-work-attention.tsx:65-71`). */
const STATUS_TONE: Record<KnowledgeReadStatus, "outline" | "secondary" | "destructive"> = {
  ok: "outline",
  partial: "secondary",
  unknown: "secondary",
  denied: "destructive",
};

/** The drift banner, exported so the Work block and the question form render the SAME two
 *  sentences from the SAME judgement rather than two copies that can drift apart. */
export function WorkKnowledgeDriftBanner({
  read, silent = false, action,
}: {
  read: WorkKnowledgeDriftRead | null | undefined;
  silent?: boolean;
  action?: React.ReactNode;
}) {
  const t = useTranslations("WorkKnowledge");
  const kind = driftBannerKind(read);
  if (kind === "none") return null;
  if (kind === "relevant") {
    const keys = driftBannerKeys(read);
    return (
      <StateBanner
        tone="warning"
        title={t("driftRelevantTitle")}
        silent={silent}
        action={action}
      >
        <span data-testid="work-knowledge-drift-relevant">
          {t("driftRelevantBody", { keys: keys.length > 0 ? keys.join(", ") : t("driftKeysNone") })}
        </span>
      </StateBanner>
    );
  }
  // `unrecorded` — and it NAMES NO KEY, because it cannot.
  return (
    <StateBanner
      tone="warning"
      title={t("driftUnrecordedTitle")}
      silent={silent}
      action={action}
    >
      <span data-testid="work-knowledge-drift-unrecorded">{t("driftUnrecordedBody")}</span>
    </StateBanner>
  );
}

type State = { kind: "loading" } | { kind: "loaded"; read: WorkKnowledgeDriftRead };

export function WorkKnowledgeBlock({ workId, session }: {
  workId: string;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("WorkKnowledge");
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const read = await readWorkKnowledgeDrift(workId, { session });
    setState({ kind: "loaded", read });
  }, [workId, session]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="flex flex-col gap-2" data-testid="work-knowledge-block">
      <SectionHeader level={2}>{t("blockHeading")}</SectionHeader>
      <p className="max-w-prose text-xs text-muted-foreground">{t("blockLede")}</p>

      {/* A SKELETON THE SHAPE OF THE CONTENT — never a placeholder version or a zero count. */}
      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2" aria-label={t("blockLoading")} role="status">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "denied" ? (
        <StateBanner tone="warning" title={t("blockDeniedTitle")}>
          {t("blockDeniedBody")}
        </StateBanner>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "unreadable" ? (
        <StateBanner
          tone="error"
          title={t("blockFailedTitle")}
          code={state.read.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              {t("blockReread")}
            </Button>
          }
        >
          {t("blockFailedBody")}
        </StateBanner>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "ok" ? (
        <ReadSummary read={state.read} />
      ) : null}

      {/* THE DRIFT BANNER, on the Work as well as on the question form. A person reading the
          Sources tab must be able to see that the basis moved without opening the answer form. */}
      {state.kind === "loaded" ? <WorkKnowledgeDriftBanner read={state.read} /> : null}
    </section>
  );
}

function ReadSummary({ read }: { read: WorkKnowledgeDriftRead & { kind: "ok" } }) {
  const t = useTranslations("WorkKnowledge");
  const drift = read.drift;
  const summary = drift.read;

  // NOTHING RECORDED AT ALL. A run that finished before read-sets existed shows this — and the
  // hint says so, because "this Work read nothing" would be a claim the estate cannot support.
  if (!summary && drift.observed_from === null) {
    return (
      <div className="flex flex-col gap-1" data-testid="work-knowledge-none">
        <p className="text-sm text-muted-foreground">{t("blockNoRead")}</p>
        <p className="max-w-prose text-xs text-muted-foreground">{t("blockNoReadHint")}</p>
      </div>
    );
  }

  // A VERSION BUT NO READ-SET: the v4-shaped execution trace arm. The version is real and is
  // shown; which records it covered is not known and the sentence says exactly that.
  if (!summary) {
    return (
      <div className="flex flex-col gap-1" data-testid="work-knowledge-trace-only">
        <p className="text-sm text-foreground">
          {t("blockVersion", { version: String(drift.observed_version ?? "0") })}
        </p>
        <p className="max-w-prose text-xs text-muted-foreground">{t("blockTraceOnly")}</p>
      </div>
    );
  }

  const status = summary.status;
  const tiers = summary.tiers ?? {};
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm"
      data-testid="work-knowledge-read">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_TONE[status] ?? "outline"} title={t(`statusHint.${status}` as "statusHint.ok")}>
          {t(`status.${status}` as "status.ok")}
        </Badge>
        <span className="text-card-foreground">
          {t("blockVersion", { version: String(drift.observed_version ?? "0") })}
        </span>
        {drift.as_of ? (
          <span className="text-xs text-muted-foreground">{t("blockAsOf", { asOf: drift.as_of })}</span>
        ) : null}
      </div>
      {/* THE DOOR'S OWN REASON TOKEN, verbatim — never a reworded copy. */}
      {summary.reason ? (
        <p className="text-xs text-muted-foreground">{t("statusReason", { reason: summary.reason })}</p>
      ) : null}
      <p className="text-xs text-muted-foreground" data-testid="work-knowledge-tiers">
        {t("blockTiers", {
          core: String(Number(tiers.core ?? 0)),
          requested: String(Number(tiers.requested ?? 0)),
          remainder: String(Number(tiers.remainder ?? 0)),
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("blockShown", { shown: String(summary.records_shown ?? 0) })}
      </p>
      {/* PARTIAL IS ITS OWN SENTENCE, and it is neither neighbour: the required set IS complete,
          and some of the rest was withheld. */}
      {summary.truncated ? (
        <p className="text-xs text-muted-foreground" data-testid="work-knowledge-truncated">
          {t("blockTruncated")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground wrap-anywhere" data-testid="work-knowledge-keys">
        {summary.keys && summary.keys.length > 0
          ? t("blockKeys", { keys: summary.keys.join(", ") })
          : t("blockKeysNone")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("readWhen", { at: businessDateTime(summary.read_at) })}
      </p>
    </div>
  );
}
