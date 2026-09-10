"use client";

// SST panel — this client's LIVE compliance watch, plus one honest note for the registration
// and return machinery that does not exist.
//
// WHAT CHANGED, AND WHY (CB-AE2E-032). This panel used to be a single static note whose text was
// internal build-log prose: it named lane ids, migration numbers, an owner-ruling id and raw SQL
// signatures, none of which is meaningful to a Malaysian accountant and the last of which leaks
// the internal decision log. The identifiers were not deleted — they belong in a source comment,
// which is where they now live (see the census in lib/tax/sst-watch.ts's header). The note the
// professional reads says what the firm cannot do yet and what to do instead.
//
// THE PANEL NOW READS. The SST compliance watch reaches a human session through
// `clara.list_review_queue`'s own `compliance` object and nothing else — the watch table carries
// no `clara_authenticated` grant. That read is made once by the workbench above and handed to
// the section below, so this panel adds no call of its own.

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import type { AsyncReadState } from "@/lib/firm/use-async-read";
import type { ClientSstWatch } from "@/lib/tax/sst-watch";
import { CAPABILITY_BOUNDARY_ANCHOR } from "./CapabilityBoundarySection";
import { SstWatchSection } from "./SstWatchSection";
import { TaxStatusRegion } from "./tax-status";

export function SstPanel({ watch }: { watch: AsyncReadState<ClientSstWatch> }) {
  const t = useTranslations("ClientTax.sst");
  const tb = useTranslations("ClientTax.boundary");
  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <SstWatchSection watch={watch} />
        {/* "Not enabled" — no read is ever attempted for SST registration/return state,
            because no such object exists in the catalog (this ticket's own inventory).
            role="status" (TaxStatusRegion) so it announces distinctly from the read
            states above it, and the one link every unsupported operation on this page
            uses to reach the single capability-boundary section (#627 AC(d)). */}
        <TaxStatusRegion>
          <NotBuiltNote className="text-xs">
            {t("notBuilt")}{" "}
            <a
              href={`#${CAPABILITY_BOUNDARY_ANCHOR}`}
              className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
            >
              {tb("linkText")}
            </a>
          </NotBuiltNote>
        </TaxStatusRegion>
      </CardContent>
    </Card>
  );
}
