"use client";

// #631 — THE DIAGNOSTICS SECTION of B3 Work detail (C88.18).
//
// WHAT IT IS FOR. A Work that refused, or one that posted and a reviewer is checking, raises the
// same question: WHAT ACTUALLY RAN? Which bundle, which instructions, which tool set, which model,
// under which purpose authorisation — and how far did the run get before it stopped. Until #631
// the honest answer was "read the logs", which is not an answer a firm can give an auditor.
//
// IT IS ITS OWN COMPONENT, MOUNTED BY ONE LINE. `work-detail.tsx` is being restructured into Tabs
// on another branch (#641) at the same time; a section written INSIDE that file would collide on
// every line. So everything is here, and the page contributes a single mount.
//
// EVERY VALUE IS THE DATABASE'S. `clara.work_execution_traces` has NO PAYLOAD COLUMN — no prompt,
// no transcript, no basis — so there is nothing to filter on the way out and nothing this
// component could leak by rendering too much. What it renders is identifiers, digests, timings and
// outcomes, plus the TYPED refusal the run recorded.
//
// THE FIVE FACES THE REFRESH SPEC ASKS FOR, and each one is a real answer rather than a spinner:
//   LOADING     a skeleton the size of the content, not a placeholder amount.
//   EMPTY       "no steps recorded" — distinguished from "not permitted" and from "read failed",
//               because a queued Work genuinely has no steps yet and that is not a fault.
//   PARTIAL     a run whose trace stops before `settle` is labelled as still running rather than
//               silently rendered as if it had finished.
//   DENIED      a viewer (below the bookkeeper floor) is told they may not see this — the door's
//               own CLR04, rendered as a face.
//   FAILED      a read error keeps its message and offers a re-read; it never takes the page down.
//
// NO PROVIDER DISCLOSURE ANYWHERE. `model_id` is the model SNAPSHOT the Work row already carries
// and the page already shows; nothing here names a vendor, and the `egress_not_authorized` face
// (below) states the AGREEMENT and the CLIENT, which is what an owner can act on.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import {
  formatDuration,
  groupTraceByRun,
  readWorkTrace,
  shortDigest,
  traceSummary,
  type WorkTraceRead,
  type WorkTraceRow,
  type WorkTraceRun,
} from "@/lib/work/diagnostics";
import type { SessionTokenAccessor } from "@/lib/session";

/** The phase vocabulary, mapped to its own message key. A phase outside the four renders VERBATIM
 *  rather than crashing on a missing message — the same rule `basis_origin` follows on this page,
 *  and for the same reason: the CHECK can widen before this file does. */
const PHASE_KEYS: Record<string, string> = {
  dispatch: "phase.dispatch",
  model_call: "phase.modelCall",
  tool_call: "phase.toolCall",
  settle: "phase.settle",
};

/** The outcome vocabulary, same rule. */
const OUTCOME_KEYS: Record<string, string> = {
  ok: "outcome.ok",
  refused: "outcome.refused",
  failed: "outcome.failed",
  cancelled: "outcome.cancelled",
  skipped: "outcome.skipped",
};

type Translate = (key: string) => string;

/** A phase outside the four renders VERBATIM rather than crashing on a missing message. Written as
 *  a function so the lookup is total: `PHASE_KEYS[x]` is `string | undefined` under
 *  `noUncheckedIndexedAccess`, and a `t(undefined)` would be a runtime throw the type system was
 *  trying to tell us about. */
function phaseLabel(phase: string, t: Translate): string {
  const key = PHASE_KEYS[phase];
  return key === undefined ? phase : t(key);
}

/** Same rule for the outcome vocabulary. */
function outcomeLabel(outcome: string, t: Translate): string {
  const key = OUTCOME_KEYS[outcome];
  return key === undefined ? outcome : t(key);
}

type Loaded = { kind: "loading" } | { kind: "loaded"; read: WorkTraceRead; at: number };

export function WorkDiagnostics({
  workId,
  session,
  read = readWorkTrace,
}: {
  workId: string;
  session?: SessionTokenAccessor;
  /** Injected for tests only. The default is the real door. */
  read?: typeof readWorkTrace;
}) {
  const t = useTranslations("WorkDiagnostics");
  const [state, setState] = useState<Loaded>({ kind: "loading" });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const result = await read(workId, session === undefined ? {} : { session });
      setState({ kind: "loaded", read: result, at: Date.now() });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setState({
        kind: "loaded",
        read: { kind: "unreadable", message: err instanceof Error ? err.message : String(err) },
        at: Date.now(),
      });
    }
  }, [read, session, workId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="work-diagnostics-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="work-diagnostics-heading" className="text-sm font-semibold text-foreground">
          {t("title")}
        </h3>
        <div className="flex items-center gap-2">
          {/* THE RE-READ IS A READ, and it is labelled as one. The page's other "retry" asks the
              runtime for a NEW RUN; conflating the two on one screen is a real defect this lane
              has already paid for once (see work-detail.tsx's own header). */}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("reread")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("lede")}</p>

      {state.kind === "loading" ? (
        <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
          <span className="sr-only">{t("loading")}</span>
          {/* A SKELETON THE SIZE OF THE CONTENT — four step rows, which is what an ordinary run
              records. A placeholder that showed a number would be showing a number nobody read. */}
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-6 w-full animate-pulse rounded bg-muted motion-reduce:animate-none" />
          ))}
        </div>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "denied" ? (
        <StateBanner tone="warning" title={t("denied.title")}>
          {t("denied.body")}
        </StateBanner>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "unreadable" ? (
        <StateBanner
          tone="error"
          title={t("unreadable.title")}
          code={state.read.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              {t("reread")}
            </Button>
          }
        >
          {t("unreadable.body")}
        </StateBanner>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "ok" && state.read.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="work-diagnostics-empty">
          {t("empty")}
        </p>
      ) : null}

      {state.kind === "loaded" && state.read.kind === "ok" && state.read.rows.length > 0 ? (
        <TraceRuns runs={groupTraceByRun(state.read.rows)} open={open} onToggle={() => setOpen((v) => !v)} />
      ) : null}
    </section>
  );
}

function TraceRuns({ runs, open, onToggle }: { runs: WorkTraceRun[]; open: boolean; onToggle: () => void }) {
  const t = useTranslations("WorkDiagnostics");
  return (
    <div className="flex flex-col gap-4">
      {runs.map((run, index) => {
        const summary = traceSummary(run);
        return (
          <div key={run.runId} className="flex flex-col gap-2 rounded border border-border p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs font-medium text-foreground">
                {index === 0 ? t("run.latest") : t("run.earlier", { n: runs.length - index })}
              </span>
              <span className="text-xs text-muted-foreground" title={run.runId}>
                {t("run.id", { id: shortDigest(run.runId) })}
              </span>
              <span className="text-xs text-muted-foreground">
                {businessDateTime(run.startedAt)}
              </span>
            </div>
            {/* THE ONE-LINE ANSWER, before any detail. "Did a model see this client's books, and
                did it get as far as the books?" is the question a reviewer opens this section
                with, and it must not require reading a table. */}
            <p className="text-xs text-foreground" data-testid="work-diagnostics-summary">
              {summary.calledModel ? t("summary.calledModel") : t("summary.noModel")}
              {summary.refusedPhase === null ? "" : ` ${t("summary.stoppedAt", { phase: summary.refusedPhase })}`}
              {summary.refusedPhase === null && !run.rows.some((r) => r.phase === "settle")
                ? ` ${t("summary.stillRunning")}`
                : ""}
            </p>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className="self-start text-xs font-medium text-primary underline underline-offset-2"
            >
              {open ? t("hideSteps") : t("showSteps", { n: run.rows.length })}
            </button>
            {open ? <StepTable rows={run.rows} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/** The observed-revision object of ONE step, key by key. `clara.work_execution_traces`'
 *  `observed_revisions` is a CLOSED six-key vocabulary (`knowledge_version`, `books_version`,
 *  `chart_revision`, `basis_digest`, `source_sha256`, `question_version`) whose values 0210 bounds
 *  in shape at the door, so every value here is a digest, a number or a short token — there is
 *  nothing for this renderer to filter and nothing it could leak by rendering too much.
 *
 *  A KEY OUTSIDE THE SIX RENDERS VERBATIM rather than crashing on a missing message — the same
 *  rule `phaseLabel` and `outcomeLabel` follow on this page, and for the same reason: the
 *  vocabulary can widen before this file does. */
export function ObservedRevisions({ observed }: { observed: Record<string, unknown> | null | undefined }) {
  const t = useTranslations("WorkKnowledge");
  const entries = observed && typeof observed === "object" && !Array.isArray(observed)
    ? Object.entries(observed).filter(([, v]) => v !== null && v !== undefined)
    : [];
  if (entries.length === 0) return null;
  return (
    <span className="block text-muted-foreground" data-testid="work-diagnostics-observed">
      <span className="sr-only">{t("observedHeading")}: </span>
      {entries
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key} ${String(value)}`)
        .join(" · ")}
    </span>
  );
}

function StepTable({ rows }: { rows: ReadonlyArray<WorkTraceRow> }) {
  const t = useTranslations("WorkDiagnostics");
  return (
    // A genuinely two-dimensional table gets its OWN labelled horizontal viewport, so the page
    // body never scrolls sideways at 320 px (refresh appendix C §4).
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("tableLabel")}>
      <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
        <caption className="sr-only">{t("tableLabel")}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-medium">{t("col.step")}</th>
            <th scope="col" className="py-1 pr-3 font-medium">{t("col.capability")}</th>
            <th scope="col" className="py-1 pr-3 font-medium">{t("col.purpose")}</th>
            <th scope="col" className="py-1 pr-3 font-medium">{t("col.bundle")}</th>
            <th scope="col" className="py-1 pr-3 font-medium">{t("col.duration")}</th>
            <th scope="col" className="py-1 font-medium">{t("col.outcome")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border align-top">
              <th scope="row" className="py-1 pr-3 font-normal text-foreground">
                {phaseLabel(row.phase, t)}
              </th>
              <td className="py-1 pr-3 text-muted-foreground">{row.capability_id ?? "—"}</td>
              <td className="py-1 pr-3 text-muted-foreground">{row.purpose ?? "—"}</td>
              <td className="py-1 pr-3 text-muted-foreground" title={row.bundle_digest ?? undefined}>
                {row.bundle_id ?? "—"}
                {row.bundle_digest ? ` · ${shortDigest(row.bundle_digest)}` : ""}
              </td>
              <td className="py-1 pr-3 text-muted-foreground">{formatDuration(row.duration_ms)}</td>
              <td className="py-1 text-foreground">
                {outcomeLabel(row.outcome, t)}
                {/* THE TYPED REFUSAL, verbatim. It is the database's own reason token, and a
                    reworded copy would be a second vocabulary for one fact. */}
                {row.refusal && typeof row.refusal.reason === "string" ? (
                  <span className="block text-muted-foreground">{String(row.refusal.reason)}</span>
                ) : null}
                {/* #658 — THE OBSERVED REVISIONS, rendered for the first time. The field has been
                    TYPED in lib/work/diagnostics.ts since #631 and rendered NOWHERE, so a run that
                    recorded which knowledge version it reasoned under had no surface that said so
                    — the human-visible half of #885. It is rendered HERE, inside the rows this
                    component ALREADY loaded, rather than in a second component: a second
                    get_work_execution_trace read on one page would double the request and split
                    the honesty story across two places. Values only — a closed six-key vocabulary
                    bounded in shape at the door (0210), so there is nothing here to redact. */}
                <ObservedRevisions observed={row.observed_revisions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
