import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { RegistrationsQueuePanel } from "@/components/admin/registrations-queue";

/**
 * "/admin/registrations" — the operator approval queue (P4-5; design
 * `docs/plan/active/p4-design-2026-08-27.md` §4 B, §5 ask 8). OPERATOR
 * ONLY: `RegistrationsQueuePanel` itself renders the honest refusal state
 * for anyone else — its own header explains why that gate lives there
 * (an affordance, not the DB's own wall) rather than in this page.
 *
 * NAMED HONESTLY (P4-5's own acceptance item): this console cannot be
 * smoke-tested at this tip. `clara.firms.is_operator` exists and ZERO
 * firms carry it — marking BELCORT is ruled onto the Wave-G setup
 * checklist, in the same ceremony as 裁-40's four clock switches (裁-43,
 * `docs/plan/active/mohe-grill-rulings-2026-08-29.md`). The rung-5 live
 * walk for this surface is DEFERRED to that ceremony, not claimed here.
 */
export default async function AdminRegistrationsPage() {
  const t = await getTranslations("Registrations");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} />
      <RegistrationsQueuePanel />
    </PageShell>
  );
}
