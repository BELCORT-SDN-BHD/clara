import { getTranslations } from "next-intl/server";

import { NavPills } from "@/components/common/nav-pills";
import { WORK_NEEDS_YOU_HREF, WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";

/**
 * The saved-view strip on /work.
 *
 * A SERVER COMPONENT with no hook: the active view is decided by the page's own
 * `searchParams` read, so there is nothing to resolve on the client and no
 * reason to ship this as one. The pill markup itself lives in
 * `components/common/nav-pills.tsx`, shared with `components/settings/settings-nav.tsx`
 * — see that file for why the shared piece is links, not tabs.
 */
export async function WorkViews({ activeView }: { activeView: string | null }) {
  const t = await getTranslations("Work");

  const views = [
    { id: null, href: "/work", label: t("viewAll") },
    { id: WORK_NEEDS_YOU_VIEW, href: WORK_NEEDS_YOU_HREF, label: t("viewNeedsYou") },
  ];

  return (
    <NavPills
      label={t("viewsLabel")}
      items={views.map((view) => ({
        key: view.href,
        href: view.href,
        label: view.label,
        current: view.id === activeView,
      }))}
    />
  );
}
