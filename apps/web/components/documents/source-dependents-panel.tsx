"use client";

// #646 — WHAT IS STANDING ON THIS DOCUMENT'S READING (AC3).
//
// THE HONEST HALF, AND THE HALF THAT IS NOT BUILT. AC3 asks Clara to "reassess affected pending
// Work and Knowledge, invalidate only obsolete questions and retain useful accepted basis". Two of
// those three are real here and one is not, and this panel says which is which rather than
// implying all three:
//
//   * INVALIDATING THE OBSOLETE QUESTION is real and already narrow:
//     `clara.set_document_kind` resolves exactly the `origin='classification'` question it answered
//     and leaves a manual one open (migration 0169; `dba.5b` pins the narrowness). #646 adds the
//     door for the one case that had none — a classification question whose filing was retired,
//     which every other verb refuses because they share one provenance predicate.
//   * RETAINING USEFUL ACCEPTED BASIS is real by construction: nothing here writes on
//     `clara.knowledge_records`. A record standing on a superseded reading is LISTED, with its
//     state untouched, for a human to judge.
//   * AUTOMATIC RE-ASSESSMENT IS NOT BUILT, by ruling rather than by omission. `docs/PRD.md:123`
//     records it as accepted-but-deferred with #658 and #663 as its owners, and the current
//     accepted posture is human review. So this panel is a REVIEW AFFORDANCE, and it claims exactly
//     that.
//
// EVERY ROW IS THE DOOR'S OWN. `orphaned` and `source_superseded` are DERIVED IN THE DATABASE
// (`clara.list_source_dependents`) from rows this surface does not own, so the control below can
// never offer a dismissal the door would refuse for a reason the screen cannot see.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { dismissOrphanedClassificationQuestion } from "@/lib/documents/doors";
import { DocumentsDoorDialog } from "./DocumentsDoorDialog";
import type { SourceDependentsResult } from "@/lib/documents/types";

function OrphanDismissal({
  questionId, busy, act,
}: {
  questionId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ClientDocuments");
  const [reason, setReason] = useState("");
  return (
    <DocumentsDoorDialog
      triggerLabel={t("orphanDismissTrigger")}
      triggerSize="xs"
      title={t("orphanDismissTitle")}
      description={t("orphanDismissDescription")}
      diagnostic={t("doorDiagnostic.dismissOrphanedClassificationQuestion")}
      confirmLabel={t("orphanDismissConfirm")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={() => act(async () => {
        await dismissOrphanedClassificationQuestion(questionId, reason.trim());
        setReason("");
      })}
    >
      <Textarea
        aria-label={t("orphanDismissReasonLabel")}
        placeholder={t("reasonRequiredPlaceholder")}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
      />
    </DocumentsDoorDialog>
  );
}

export function SourceDependentsPanel({
  dependents, clientId, busy, act,
}: {
  /** `null` while the read is in flight, or when it answered nothing this caller may see. */
  dependents: SourceDependentsResult | null;
  clientId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ClientDocuments");
  if (!dependents) return null;
  // Same posture as the band: three arrays, none of them trusted to be present.
  const knowledge = Array.isArray(dependents.knowledge_records) ? dependents.knowledge_records : [];
  const questions = Array.isArray(dependents.open_questions) ? dependents.open_questions : [];
  const work = Array.isArray(dependents.work_questions) ? dependents.work_questions : [];
  const nothing = knowledge.length === 0 && questions.length === 0 && work.length === 0;

  return (
    <section className="flex flex-col gap-2" data-testid="source-dependents">
      <SectionHeader level={4}>{t("dependentsHeading")}</SectionHeader>
      <p className="text-xs text-muted-foreground">{t("dependentsNote")}</p>

      {nothing ? <EmptyState>{t("dependentsEmpty")}</EmptyState> : null}

      {knowledge.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="dependent-knowledge">
          {knowledge.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={k.source_superseded ? "outline" : "secondary"}>
                {k.source_superseded ? t("dependentsStale") : t("dependentsCurrent")}
              </Badge>
              {/* The record's own address, so "review it" is a place a person can go rather than a
                  thing they are told to do. Client-scoped records only: a firm-scope record has no
                  page under this client. */}
              {k.scope_kind === "client" && k.client_id ? (
                <Link
                  className="underline underline-offset-2"
                  href={`/clients/${k.client_id}/knowledge/${k.record_id}`}
                >
                  {k.knowledge_key}
                </Link>
              ) : (
                <span className="text-foreground">{k.knowledge_key}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {k.source_field_path ?? t("dependentsNoField")} · {k.state} · {businessDateTime(k.recorded_at)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {questions.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="dependent-questions">
          {questions.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline">{q.origin}</Badge>
                <span className="text-foreground wrap-anywhere">{q.question_text}</span>
              </span>
              {/* THE ONE CONTROL THIS PANEL OFFERS, and only where the DB says the door would admit
                  it. A question whose (document, client) pair still carries a live filing belongs
                  to `resolve_open_question`, and offering a dismissal there would be offering a
                  control that cannot work. */}
              {q.orphaned && q.client_id === clientId ? (
                <OrphanDismissal questionId={q.id} busy={busy} act={act} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("dependentsQuestionLive", { count: q.live_filings })}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {work.length > 0 ? (
        <ul className="flex flex-col gap-1" data-testid="dependent-work">
          {work.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">{w.work_status}</Badge>
              <Link className="underline underline-offset-2" href={`/work/${w.work_id}`}>
                {t("dependentsWorkQuestion", { version: w.question_version })}
              </Link>
              <span className="text-xs text-muted-foreground">{businessDateTime(w.created_at)}</span>
            </li>
          ))}
          {/* MEASURED, and stated rather than implied: a revision of this document does NOT move a
              parked Work question's version, because #646 writes nothing on `clara.accounting_work`
              (wave decision D6) and `clara.answer_work_question` compares exactly the question
              version and the Work's basis digest. A human reading this list is the mechanism
              today. */}
          <li className="text-xs text-muted-foreground">{t("dependentsWorkNote")}</li>
        </ul>
      ) : null}
    </section>
  );
}
