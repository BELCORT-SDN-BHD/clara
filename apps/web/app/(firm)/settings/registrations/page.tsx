import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { RegistrationsQueuePanel } from "@/components/admin/registrations-queue";

/**
 * "/settings/registrations" — the operator approval queue (P4-5; design
 * `docs/plan/active/p4-design-2026-08-27.md` §4 B, §5 ask 8). Moved from
 * "/admin/registrations" by #614; the old path redirects here.
 *
 * PROVISIONAL ADDRESS: #615 builds the operator console and may relocate this
 * surface out of a firm's own settings entirely — an operator's queue is not a
 * property of the firm they happen to be a member of. Leave the registry row's
 * `operatorOnly` floor alone until it does.
 *
 * OPERATOR ONLY: `RegistrationsQueuePanel` itself renders the honest refusal
 * state for anyone else — its own header explains why that gate lives there (an
 * affordance, not the DB's own wall) rather than in this page.
 *
 * NAMED HONESTLY (P4-5's own acceptance item): this console cannot be
 * smoke-tested at this tip. `clara.firms.is_operator` exists and ZERO firms carry
 * it — marking BELCORT is ruled onto the Wave-G setup checklist, in the same
 * ceremony as 裁-40's four clock switches (裁-43). The rung-5 live walk for this
 * surface is DEFERRED to that ceremony, not claimed here.
 */
export default async function SettingsRegistrationsPage() {
  const t = await getTranslations("Registrations");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} />
      <SettingsNav />
      <RegistrationsQueuePanel />
    </PageShell>
  );
}
