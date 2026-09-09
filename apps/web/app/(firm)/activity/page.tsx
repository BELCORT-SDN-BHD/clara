import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";
import { FirmActivityFeed } from "@/components/firm/firm-activity-feed";

/**
 * "/activity" — the firm activity feed: the receipts/open-register inversion
 * made surface (ADR-0074), at firm altitude across every client. Reads
 * clara.agent_receipts_visible (lib/firm/reads.ts) — an AUDIT TRAIL of what
 * happened, never conflated with a queue of what awaits.
 *
 * #614 — THE AGENT-TASK QUEUE MOVED TO /work, and that sentence above is why.
 * T7 had mounted `<AgentTasksPanel />` at the top of this page: a LIVE queue of
 * what the agent is running right now, with a cancel control, sitting above a
 * record of what already happened. The two are different questions and belong on
 * different pages — this one is the past, Work is the present. Nothing was
 * duplicated: the panel is mounted at /work and only there.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("FirmActivity");

  return (
    <PageShell>
      {/* The orientation line moved OUT of FirmActivityFeed and into the page
          header — same `FirmActivity.subheading` key, now in the one place
          every surface puts its "what am I looking at" sentence. */}
      <PageHeader title={t("heading")} description={t("subheading")} />
      {/* CB-AE2E-018: `clara.list_firm_timeline` is live and Firm Home already
          reads it. This route still leads with the receipts feed, so keep the
          missing Activity-page connection visible until the timeline section is
          shared or moved here. */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("timelineHeading")}</SectionHeader>
        <NotBuiltNote className="text-xs">{t("timelineNotBuilt")}</NotBuiltNote>
      </section>
      <FirmActivityFeed />
    </PageShell>
  );
}
