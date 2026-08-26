import { getTranslations } from "next-intl/server";

/**
 * "/activity" — the firm activity feed: the receipts / open-register
 * inversion made surface (ADR-0074), at firm altitude across every client.
 * Honest empty state, P2 shell only; the real surface reads
 * `clara.agent_receipts_visible` and is P3 work.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("FirmActivity");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
    </main>
  );
}
