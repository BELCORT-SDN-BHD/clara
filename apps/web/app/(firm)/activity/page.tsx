import { getTranslations } from "next-intl/server";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";
import { FirmActivityFeed } from "@/components/firm/firm-activity-feed";
import { AgentTasksPanel } from "@/components/firm/agent-tasks-panel";

/**
 * "/activity" — the firm activity feed: the receipts/open-register inversion
 * made surface (ADR-0074), at firm altitude across every client. Reads
 * clara.agent_receipts_visible (lib/firm/reads.ts) — an AUDIT TRAIL of what
 * happened, never conflated with Needs-you's queue of what awaits.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("FirmActivity");

  return (
    <PageShell>
      {/* The orientation line moved OUT of FirmActivityFeed and into the page
          header — same `FirmActivity.subheading` key, now in the one place
          every surface puts its "what am I looking at" sentence. */}
      <PageHeader title={t("heading")} description={t("subheading")} />
      {/* T7 (port-wave plan §4/§5) — cancel_agent_task's own control over the
          LIVE task queue, above the receipts history below it. */}
      <AgentTasksPanel />
      {/* E-2 / CB-AE2E-018: the TIMELINE this page should lead with — every act
          in the firm, human as well as agent — is a DATABASE gap, not a web one.
          `clara.domain_events` and `clara.audit_log` both exist and are granted,
          but no read joins them into a firm-wide timeline and apps/web reads
          neither; the honest shape is a dashed note naming the absence, and the
          note goes away the day the read lands. Nothing fake is wired behind
          it. */}
      <section className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("timelineHeading")}</SectionHeader>
        <NotBuiltNote className="text-xs">{t("timelineNotBuilt")}</NotBuiltNote>
      </section>
      <FirmActivityFeed />
    </PageShell>
  );
}
