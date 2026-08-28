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
 * T10 (port-wave plan §4 T10) adds the two links below to its own built
 * sub-pages — the compliance register and the vendor-bindings governance
 * panel — without touching the body text above, which stays P4's own honest
 * placeholder for the surfaces this train does not own.
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
      </nav>
    </PageShell>
  );
}
