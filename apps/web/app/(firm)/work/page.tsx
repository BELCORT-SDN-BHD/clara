import { getTranslations } from "next-intl/server";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { AgentTasksPanel } from "@/components/firm/agent-tasks-panel";
import { NeedsYouInbox } from "@/components/firm/needs-you-inbox";
import { WorkViews } from "@/components/work/work-views";
import { WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";

/**
 * "/work" — what is waiting on a person, across every client (#614, refresh spec
 * #612 §8).
 *
 * WHAT IT REPLACED, AND WHY IT IS NOT JUST A RENAME OF /needs-you. The firm
 * level had two half-answers to one question: `/needs-you` held the cross-client
 * review queue, and `/activity` — an AUDIT TRAIL of what already happened — had
 * grown a live agent-task queue at the top of it, which is not a record of
 * anything and does not belong on a page about receipts. Between them a human
 * had to visit two pages to see what was outstanding, and one of those pages was
 * mostly about the past. Work is the one place that answers "what is open"; the
 * task queue moved here from /activity in the same commit, so /activity is an
 * audit trail again and nothing is duplicated.
 *
 * "NEEDS YOU" IS A SAVED VIEW OF THIS PAGE, not a route of its own —
 * `/work?view=needs-you`, which is where the old `/needs-you` redirects
 * (lib/navigation/legacy-routes.ts). A saved view is a filter on a destination:
 * it keeps ONE page, one back-button story and one thing to bookmark, instead of
 * two routes that each show a slice of the same queue.
 *
 * THE VIEW IS READ FROM THE SERVER'S OWN `searchParams`, not with
 * `useSearchParams` in a client child — the choice of view decides which
 * SECTIONS render, and a decision about markup belongs in the render that
 * produces it.
 *
 * HONESTLY PARTIAL, and the note on the page says so. The durable Work records
 * (#641) bring the filterable list and the detail view of a single item; today
 * this page composes the two live queues that already exist.
 */
export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("Work");
  const params = await searchParams;
  const raw = params.view;
  const view = Array.isArray(raw) ? raw[0] : raw;
  const needsYouOnly = view === WORK_NEEDS_YOU_VIEW;

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <WorkViews activeView={needsYouOnly ? WORK_NEEDS_YOU_VIEW : null} />

      <section className="flex flex-col gap-3">
        <SectionHeader level={2}>{t("needsYouHeading")}</SectionHeader>
        <NeedsYouInbox />
      </section>

      {/* The agent-task queue, moved here from /activity. It carries its OWN
          level-2 heading ("Running agent tasks"), so wrapping it in a second one
          would put two h2s over one list. */}
      {needsYouOnly ? null : <AgentTasksPanel />}

      <NotBuiltNote>{t("notBuilt")}</NotBuiltNote>
    </PageShell>
  );
}
