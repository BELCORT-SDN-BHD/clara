import { getTranslations } from "next-intl/server";

/**
 * Firm-altitude home ("/") — honest empty state, P2 shell only.
 *
 * P1 foundation scaffold, now inside the P2 firm shell
 * (app/(firm)/layout.tsx). The real surface (Needs-you inbox, client
 * register, firm activity/receipts feed, admin) is P3/P4 work, per the IA
 * ruling: docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3.
 */
export default async function FirmHomePage() {
  const t = await getTranslations("FirmHome");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
    </main>
  );
}
