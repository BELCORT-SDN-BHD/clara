import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionHeader } from "@/components/common/section-header";
import { AgentTasksPanel } from "@/components/firm/agent-tasks-panel";
import { NeedsYouInbox } from "@/components/firm/needs-you-inbox";
import { AccountingWorkList } from "@/components/work/accounting-work-list";
import { WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";

/**
 * "/work" — every durable Work in the firm, plus what is waiting on a person (#614, #641;
 * refresh spec #612 journey B3).
 *
 * WHAT CHANGED HERE (#641). The page used to lead with two LIVE queues and a note saying the
 * durable Work list was not built. It is now built: `AccountingWorkList` is the firm-wide
 * server-backed list over `clara.list_accounting_work` — filterable, paged, URL-stable, with the
 * Client column and client filter the firm altitude needs. The two live queues stay BELOW it
 * because they answer different questions (see that component's own header): the Work list is
 * "what has been asked of the agent, and how did it end"; Needs you is "what is waiting on a
 * person"; the agent-task panel is "what is running right now".
 *
 * THE SAVED-VIEW STRIP MOVED INTO THE LIST. `?view=needs-you` — the address #614 minted and
 * `lib/navigation/legacy-routes.ts` redirects the old `/needs-you` to — is now a BUILT-IN saved
 * view of the durable list (status = awaiting_input), rendered by
 * `components/work/work-saved-views.tsx` beside the caller's own saved views. One pill strip, not
 * two, and the constant is unchanged.
 *
 * THE VIEW IS STILL READ FROM THE SERVER'S OWN `searchParams` HERE, for the one decision that is
 * genuinely about MARKUP rather than about data: the attention view does not render the
 * running-agent-task panel, because that panel is about the present rather than about anything
 * waiting on this person. Every other use of the view is the list's own, client-side.
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

      <AccountingWorkList scope={{ kind: "firm" }} />

      <section className="flex flex-col gap-3">
        <SectionHeader level={2}>{t("needsYouHeading")}</SectionHeader>
        <NeedsYouInbox />
      </section>

      {/* The agent-task queue. It carries its OWN level-2 heading ("Running agent tasks"), so
          wrapping it in a second one would put two h2s over one list. */}
      {needsYouOnly ? null : <AgentTasksPanel />}
    </PageShell>
  );
}
