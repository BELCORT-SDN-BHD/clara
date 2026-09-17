"use client";

// #633 AC8 — THE FILE / WORK BOUNDARY, RENDERED.
//
// Beside the four capability verdicts, this answers the question a professional
// actually asks next: "this file was taken in — did anything come of it?" The two
// facts are DIFFERENT and the surface keeps them apart on purpose:
//
//   * a FILE was ADOPTED — custody happened, the bytes are sealed and readable. That
//     is what the custody verdict above says, and it says nothing about accounting.
//   * a WORK was ACCEPTED — an accounting operation was admitted, and a posted entry
//     cites this file as its evidence. That is what these rows say.
//
// Conflating them is the failure mode: "adopted" reading as "done", or a cancel
// control on the document appearing to undo an accepted Work. So the Work is reached
// by a LINK to its own surface (where its cancel control lives, under its own
// governance and its own lock order), never by an inline control here.
//
// "No Work yet" is stated, not implied by an empty area — an absence with no sentence
// reads as a surface that failed to load.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { loadDocumentWorkLinks, workHref, type DocumentWorkLinks } from "@/lib/documents/work-links";
import type { SessionTokenAccessor } from "@/lib/session";
import { DoorFeedback } from "./door-feedback";

export function DocumentWorkLinksPanel({
  documentId, clientId, session = sessionTokenAccessor,
}: {
  documentId: string;
  clientId: string;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("ClientDocuments");
  const { data, loading, err, clr } = useHydratedPart<DocumentWorkLinks>(
    session,
    (live) => loadDocumentWorkLinks(documentId, clientId, { session: live }),
  );

  return (
    <section className="flex flex-col gap-2" aria-label={t("workLinkHeading")}>
      <SectionHeader level={4}>{t("workLinkHeading")}</SectionHeader>
      {loading && !data ? <EmptyState>{t("loading")}</EmptyState> : null}
      {!loading && !data && (err || clr) ? <EmptyState>{t("workLinkNotAvailable")}</EmptyState> : null}
      {data && data.links.length === 0 ? <EmptyState>{t("workLinkNone")}</EmptyState> : null}
      {data && data.links.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">{t("workLinkFileVsWork")}</p>
          <ul className="flex flex-col gap-2">
            {data.links.map((link) => (
              <li key={`${link.entryId}:${link.workId ?? "none"}`} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-muted-foreground">{t("workLinkEntry", { entry: link.entryId })}</span>
                {link.via ? <span className="text-xs text-muted-foreground">{t("workLinkVia", { via: link.via })}</span> : null}
                {link.workId ? (
                  <Button size="xs" variant="outline" render={<Link href={workHref(link.clientId, link.workId)} />}>
                    {t("workLinkOpenWork")}
                  </Button>
                ) : (
                  // A LINK WITH NO `work_id` IS NOT "no Work": the row exists, it simply
                  // does not name one (a coding-lane binding, or a link written before
                  // the column carried a value). Saying "no Work yet" here would be a
                  // claim this read cannot support.
                  <span className="text-xs text-muted-foreground">{t("workLinkNone")}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <DoorFeedback err={err} clr={clr} />
    </section>
  );
}
