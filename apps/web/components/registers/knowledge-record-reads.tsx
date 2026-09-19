"use client";

// #658 — "WORK THAT READ THIS RECORD", the HUMAN half of AC5's historical basis.
//
// WHY IT NEEDS A DOOR OF ITS OWN. `clara.work_knowledge_reads` is FORCE-RLS with NO app-role
// SELECT — a deliberate posture copied from `clara.work_execution_traces` (0195:1352-1362:
// PostgREST serves the `clara` schema, so a SELECT grant would put every row in front of any role
// holding it, below every door's floor). DECISIONS.md:83 therefore mandates
// `clara.list_work_knowledge_reads_for_record`, and a `grant select` is not an alternative to it.
//
// WHERE IT SITS, AND WHY BELOW THE TIMELINE. The revision timeline is what the record IS; this is
// who CONSUMED it. A reader arriving to answer "what does this record say and how did it get
// here?" must not have to scroll past a Work directory to find out.
//
// IT IS READ-ONLY, AND CAPPED. No act hangs off a row — the Work id is a LINK, so this never
// becomes a second entrance to a Work — and the door returns at most the 100 newest reads with an
// exact `hidden_count`. The C13 register above is unbounded and this list is not, deliberately:
// an unbounded list on a detail page is how a record page quietly becomes a Work directory.
//
// ITS OWN STATE LADDER, because this read FAILS INDEPENDENTLY of the two the page already makes.
// A denied reads-read must leave the revision timeline readable beside it, and an empty list must
// read as "no Work has recorded a read of this record" — never as "this record is unused" (runs
// that predate the read-set recorded nothing, and saying otherwise would be a claim the estate
// cannot support) and never as an error.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { businessDateTime } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DoorError, DoorRefusal } from "@/lib/doors";
import {
  loadWorkKnowledgeReadsForRecord,
  type KnowledgeReadStatus,
  type WorkKnowledgeReadRow,
  type WorkKnowledgeReadsEnvelope,
} from "@/lib/registers/knowledge";

/** The estate's four face words, and the badge tone that only AGREES with each — the word is the
 *  state, never the colour (`components/clara/client-work-attention.tsx:65-71`). A fifth value
 *  cannot arrive: migration 0230's CHECK admits exactly these four and refuses the runtime's own
 *  `unavailable` by name. */
const STATUS_TONE: Record<KnowledgeReadStatus, "outline" | "secondary" | "destructive"> = {
  ok: "outline",
  partial: "secondary",
  unknown: "secondary",
  denied: "destructive",
};

type Read =
  | { kind: "loading" }
  | { kind: "ok"; envelope: WorkKnowledgeReadsEnvelope }
  | { kind: "denied" }
  | { kind: "failed"; message: string };

export function KnowledgeRecordReads({ clientId, recordId }: { clientId: string; recordId: string }) {
  const t = useTranslations("WorkKnowledge");
  const [state, setState] = useState<Read>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const envelope = await loadWorkKnowledgeReadsForRecord(recordId, { session: sessionTokenAccessor });
      setState({ kind: "ok", envelope });
    } catch (err) {
      // CLR04 is the viewer floor; CLR11 is "not in your firm", which the door answers the same
      // way for an absent record — deliberately, so it is not an existence oracle. Both are
      // "you may not see this" to the person looking at the page.
      if (err instanceof DoorRefusal && (err.code === "CLR04" || err.code === "CLR11")) {
        setState({ kind: "denied" });
        return;
      }
      // …and an HTTP 401/403 is the SAME face by a different road: a grant or an RLS policy said
      // no before the body could carry a CLR code. `lib/wire-error-kind.ts` already classifies
      // those two statuses, so this reads its taxonomy rather than inventing a second one.
      if (err instanceof DoorError && (err.kind === "forbidden" || err.kind === "unauthenticated")) {
        setState({ kind: "denied" });
        return;
      }
      setState({ kind: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  }, [recordId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="flex flex-col gap-2" data-testid="knowledge-record-reads">
      <SectionHeader level={2}>{t("readsHeading")}</SectionHeader>
      <p className="max-w-prose text-xs text-muted-foreground">{t("readsLede")}</p>

      {/* A SKELETON THE SHAPE OF THE CONTENT, never a placeholder zero: a count of 0 that turns
          into 12 is a number a reader may have already acted on. */}
      {state.kind === "loading" ? (
        <div className="flex flex-col gap-2" aria-label={t("readsLoading")} role="status">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {state.kind === "denied" ? (
        <StateBanner tone="warning" title={t("readsDeniedTitle")}>
          {t("readsDeniedBody")}
        </StateBanner>
      ) : null}

      {state.kind === "failed" ? (
        <StateBanner
          tone="error"
          title={t("readsFailedTitle")}
          code={state.message}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
              {t("readsReread")}
            </Button>
          }
        >
          {t("readsFailedBody")}
        </StateBanner>
      ) : null}

      {state.kind === "ok" && state.envelope.reads.length === 0 ? (
        <div className="flex flex-col gap-1" data-testid="knowledge-record-reads-empty">
          <p className="text-sm text-muted-foreground">{t("readsEmpty")}</p>
          <p className="max-w-prose text-xs text-muted-foreground">{t("readsEmptyHint")}</p>
        </div>
      ) : null}

      {state.kind === "ok" && state.envelope.reads.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2">
            {state.envelope.reads.map((row) => (
              <ReadRow key={`${row.work_id}-${row.run_id}-${row.seq}`} clientId={clientId} row={row} />
            ))}
          </ul>
          {/* PARTIAL, AND IT SAYS SO. The exact number withheld comes from the door, never from a
              subtraction this component invents. */}
          {state.envelope.truncated ? (
            <p className="text-xs text-muted-foreground" data-testid="knowledge-record-reads-truncated">
              {t("readsTruncated", { hidden: String(state.envelope.hidden_count) })}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ReadRow({ clientId, row }: { clientId: string; row: WorkKnowledgeReadRow }) {
  const t = useTranslations("WorkKnowledge");
  // THE ROW'S OWN CLIENT, not the page's. A `scope_kind='firm'` record lists reads from every
  // client in the firm that was actually reading the firm default, so a link built from the page's
  // client id would point at the wrong workspace.
  const workClient = row.client_id || clientId;
  const status = row.status;
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_TONE[status] ?? "outline"} title={t(`statusHint.${status}` as "statusHint.ok")}>
          {t(`status.${status}` as "status.ok")}
        </Badge>
        <span className="text-card-foreground">
          {t("readVersion", { version: row.knowledge_version })}
        </span>
        <span className="text-xs text-muted-foreground">{t("readAsOf", { asOf: row.as_of })}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("readPurpose", { purpose: row.purpose })}</p>
      <p className="text-xs text-muted-foreground">{t("readWhen", { at: businessDateTime(row.read_at) })}</p>
      {/* THE DOOR'S OWN REASON TOKEN, verbatim. A reworded copy would be a second vocabulary for
          one fact (the rule `work-diagnostics.tsx` states at its own refusal cell). */}
      {row.reason ? (
        <p className="text-xs text-muted-foreground">{t("statusReason", { reason: row.reason })}</p>
      ) : null}
      <Link
        className="w-fit text-xs underline underline-offset-4"
        href={`/clients/${workClient}/work/${row.work_id}`}
      >
        {t("openWork")}
      </Link>
    </li>
  );
}
