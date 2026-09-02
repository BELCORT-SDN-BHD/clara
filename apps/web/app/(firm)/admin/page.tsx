import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { buttonVariants } from "@/components/ui/button";

/**
 * "/admin" — users, capabilities, metering rollup (owner ruling Q3; PRD §4
 * item 21). Honest empty state, P2 shell only for THOSE surfaces; the real
 * users/capabilities/metering surface is P4 work. Capabilities are
 * default-on with no per-firm dial (0074:40-43) — this page will surface
 * that state, not build a toggle, when it is built.
 *
 * T10 (port-wave plan §4 T10) adds the compliance-register and
 * vendor-bindings links below to its own built sub-pages, without touching
 * the body text above, which stays P4's own honest placeholder for the
 * surfaces this train does not own. P4-5 adds the third link, to the
 * operator approval queue at /admin/registrations — a non-operator who
 * clicks it lands on that page's own honest refusal panel (裁-90), so this
 * nav carries no extra gating of its own. FS-8 PR-2 (裁-97) adds the fourth
 * link, to the firm-settings surface at /admin/settings — the high-stakes
 * threshold control renders for every viewer regardless of role; a
 * below-owner caller who confirms a change gets the DB's own CLR04 refusal,
 * verbatim (components/firm-admin/settings-panel.tsx's own header).
 */
export default async function AdminPage() {
  const t = await getTranslations("Admin");
  const tFa = await getTranslations("FirmAdminCompliance");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <nav className="flex flex-wrap gap-2" aria-label={tFa("adminNavLabel")}>
        <Link href="/admin/compliance" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {tFa("compliance.heading")}
        </Link>
        <Link href="/admin/vendor-bindings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {tFa("vendorBindings.pageHeading")}
        </Link>
        <Link href="/admin/registrations" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {tFa("registrations.heading")}
        </Link>
        <Link href="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {tFa("settings.pageHeading")}
        </Link>
      </nav>
    </PageShell>
  );
}
