"use client";

// T6 (port-wave plan §4/§5) — the "document extract" workbench panel:
// clara.get_document_extract's own budgeted envelope+region text, the same
// read the agent works from. Lazy — a human opts in via a toggle rather than
// this fetching eagerly on every document-detail mount, since the envelope
// can run to the full `p_max_chars` budget.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getDocumentExtract } from "@/lib/documents/reads";
import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";
import type { DocumentExtractResult } from "@/lib/documents/types";

export function DocumentExtractPanel({ documentId, clientId }: { documentId: string; clientId: string }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
        {open ? t("hide") : t("show")}
      </Button>
      {open && <DocumentExtractLoader documentId={documentId} clientId={clientId} />}
    </div>
  );
}

function DocumentExtractLoader({ documentId, clientId }: { documentId: string; clientId: string }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  const { data, loading, err, clr } = useHydratedPart<DocumentExtractResult>(sessionTokenAccessor, (session) =>
    getDocumentExtract(documentId, clientId, 20000, { session }),
  );
  if (loading && !data) return <LoadingState>{t("loading")}</LoadingState>;
  if (!data) {
    return err ? <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner> : null;
  }
  return <DocumentExtractContent data={data} />;
}

/** The pure, fixed-prop presentational body — split out so an a11y scan can
 *  mount it directly with fixture data (documents-a11y.test.tsx's own
 *  fixed-prop pattern), never driving the self-fetching loader above. */
export function DocumentExtractContent({ data }: { data: DocumentExtractResult }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-2">
      <p className="text-xs text-muted-foreground">{t("maxCharsNote", { maxChars: data.max_chars })}</p>
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("extractionsHeading")}</SectionHeader>
        {data.extractions.length === 0 ? (
          <EmptyState>{t("noExtractions")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.extractions.map((e) => (
              <li key={e.id} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium text-foreground">{e.engine_kind} · v{e.version_n}</p>
                <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">
                  {e.envelope_text || t("envelopeEmpty")}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("regionsHeading")}</SectionHeader>
        {data.regions.length === 0 ? (
          <EmptyState>{t("noRegions")}</EmptyState>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {data.regions.map((r) => (
              <RegionEntry key={r.id} region={r} />
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

function RegionEntry({ region }: { region: DocumentExtractResult["regions"][number] }) {
  const t = useTranslations("ClientDocuments");
  const value = region.monetary_cents !== null ? (region.monetary_cents / 100).toFixed(2) : region.text_content;
  return (
    <>
      <dt className="truncate text-muted-foreground">{region.field_path ?? t("evidenceUnlabeledField")}</dt>
      <dd className="truncate text-foreground">{value ?? t("evidenceNoValue")}</dd>
    </>
  );
}
