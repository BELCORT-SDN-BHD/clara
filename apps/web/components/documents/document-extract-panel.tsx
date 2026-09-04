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
import { partitionRegions, prettyEnvelope } from "@/lib/documents/extract-shape";
import { DocumentFactsTable } from "./document-facts-table";
import type { DocumentExtractResult } from "@/lib/documents/types";

export function DocumentExtractPanel({
  documentId, clientId, open: controlledOpen, onOpenChange,
}: {
  documentId: string;
  clientId: string;
  /** C-07: the panel's open state is LIFTED when a caller passes it, so the
   *  document-metadata control's "this file type can't be shown in a tab"
   *  refusal can open this view rather than merely naming it. Uncontrolled
   *  (both props absent) it keeps its own state exactly as before, so no
   *  existing call site changes behaviour. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(!open)}>
        {open ? t("hide") : t("show")}
      </Button>
      {open && <DocumentExtractLoader documentId={documentId} clientId={clientId} />}
    </div>
  );
}

/** Wraps the read's own `DocumentExtractResult | null` in a non-null
 *  container (F2, independent review) so `useHydratedPart`'s `data` field
 *  can tell "not yet loaded" (`data === null`, the hook's own initial state)
 *  apart from "loaded, and the DB legitimately admitted nothing" (`data =
 *  {result: null}`, a real fact) — the SAME shape `EntryDiffPanel`'s own
 *  `Bundle` uses for `get_doc_entry_diff`'s equally-legitimate null. */
type ExtractLoad = { result: DocumentExtractResult | null };

function DocumentExtractLoader({ documentId, clientId }: { documentId: string; clientId: string }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  const { data, loading, err, clr } = useHydratedPart<ExtractLoad>(sessionTokenAccessor, async (session) => {
    const result = await getDocumentExtract(documentId, clientId, 20000, { session });
    return { result };
  });
  if (loading && !data) return <LoadingState>{t("loading")}</LoadingState>;
  if (!data) {
    return err ? <StateBanner tone="error" code={clr ? clr.code : undefined}>{err}</StateBanner> : null;
  }
  if (data.result === null) {
    return <StateBanner tone="neutral">{t("notAvailable")}</StateBanner>;
  }
  return <DocumentExtractContent data={data.result} />;
}

/** The pure, fixed-prop presentational body — split out so an a11y scan can
 *  mount it directly with fixture data (documents-a11y.test.tsx's own
 *  fixed-prop pattern), never driving the self-fetching loader above.
 *
 *  D3 — THREE TIERS, in the order a professional reads them.
 *
 *  Before this pass there were two raw surfaces and nothing else: one <pre> per
 *  extraction carrying up to 20,000 characters of raw JSON envelope, and every
 *  region — dozens to hundreds of them, one per OCR line and per table cell —
 *  as a truncated two-column <dl> row with no grouping. Neither was readable,
 *  and the FACTS a human came to check were buried among the layout noise.
 *
 *    1. FACTS      the regions carrying money or a non-layout dotted path, as a
 *                  real table with labels, values and the raw confidence.
 *    2. LAYOUT     the OCR lines and table cells, grouped per page inside a
 *                  collapsed <details>, in the producer's own reading order.
 *    3. RAW        the envelope JSON, pretty-printed inside a collapsed
 *                  <details>, falling back to the verbatim string when the
 *                  budget truncated it mid-token.
 *
 *  The partition is `lib/documents/extract-shape.ts`'s, and it is TOTAL — no
 *  region is dropped by either tier, which is the property that keeps the count
 *  on screen honest against the DB's.
 *
 *  NO NEW DEPENDENCY. There is no markdown renderer in apps/web and this needed
 *  none: the read already returns structure (field_path, monetary_cents,
 *  engine_confidence, idx), and a <table> plus <details> is the whole surface.
 */
export function DocumentExtractContent({ data }: { data: DocumentExtractResult }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  const td = useTranslations("ClientDocuments");
  const { facts, layout } = partitionRegions(data.regions);

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-2">
      <p className="text-xs text-muted-foreground">{t("maxCharsNote", { maxChars: data.max_chars })}</p>

      {/* TIER 1 — FACTS */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={4}>{td("factsHeading")}</SectionHeader>
        <DocumentFactsTable facts={facts} />
      </section>

      {/* TIER 2 — LAYOUT TEXT, collapsed per page */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={4}>{t("layoutHeading")}</SectionHeader>
        {layout.length === 0 ? (
          <EmptyState>{t("noLayoutText")}</EmptyState>
        ) : (
          layout.map((group) => (
            <details key={group.page ?? "unpaged"} className="rounded-md border border-border p-2">
              <summary className="cursor-pointer text-sm text-foreground">
                {group.page === null
                  ? t("layoutPageless", { count: group.regions.length })
                  : t("layoutPage", { page: group.page, count: group.regions.length })}
              </summary>
              {/* One reading-order block, not a <dl> of one row per line. The
                  producer walks `page.lines` in order (egress.mjs), so this IS
                  the page's text; re-sorting it would turn a paragraph into a
                  word salad. A region with no text at all contributes nothing
                  rather than an invented placeholder. */}
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                {group.regions.map((r) => r.text_content).filter((v): v is string => v !== null && v !== "").join("\n")}
              </p>
            </details>
          ))
        )}
      </section>

      {/* TIER 3 — THE RAW ENVELOPE, collapsed */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={4}>{t("extractionsHeading")}</SectionHeader>
        {data.extractions.length === 0 ? (
          <EmptyState>{t("noExtractions")}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.extractions.map((e) => (
              <li key={e.id} className="rounded-md border border-border p-2 text-sm">
                <p className="font-medium text-foreground">{e.engine_kind} · v{e.version_n}</p>
                <RawEnvelope envelopeText={e.envelope_text} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Tier 3's body. Collapsed BY DEFAULT — the envelope is engine output, not the
 *  product, and it is up to 20k characters. Pretty-printed when it parses;
 *  rendered verbatim when it does not, with an honest line saying which,
 *  because `envelope_text` is cut to `p_max_chars` by the read and therefore
 *  arrives truncated mid-token on any large document. A parse failure here is
 *  an ordinary, expected outcome — never an error, and never a reason to hide
 *  the text the budget did admit. */
function RawEnvelope({ envelopeText }: { envelopeText: string }) {
  const t = useTranslations("DraftsDocumentGovernance.documentExtract");
  if (!envelopeText) {
    return <p className="mt-1 text-xs text-muted-foreground">{t("envelopeEmpty")}</p>;
  }
  const { text, parsed } = prettyEnvelope(envelopeText);
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground">{t("rawEnvelopeSummary")}</summary>
      {!parsed ? <p className="mt-1 text-xs text-muted-foreground">{t("rawEnvelopeTruncated")}</p> : null}
      {/* FOCUSABLE — the same class of finding this train's own axe scan raised
          against the overlay's page scroller. A capped `overflow-auto` block
          holding nothing but text is a scroll region a keyboard cannot reach,
          so a keyboard-only reader sees the first ~96 lines of a 20,000-
          character envelope and has no way to reach the rest.

          NOT PROVEN BY A CELL, and that is stated rather than left implied.
          The fold's mutant panel removed this `tabIndex` and every gate stayed
          green: the unit a11y engine (test/a11yRules.ts) carries no
          scrollable-region rule, and real axe in the browser leg does not flag
          this element even with an envelope long enough to overflow it — a
          reason not pinned down. The change stands on the same reasoning that
          the overlay's scroller stands on, where axe DID fire; it is not
          standing on a test. */}
      <pre
        tabIndex={0}
        role="group"
        aria-label={t("rawEnvelopeSummary")}
        className="mt-1 max-h-96 max-w-full overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {text}
      </pre>
    </details>
  );
}
