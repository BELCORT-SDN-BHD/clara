import { getTranslations } from "next-intl/server";

/**
 * "/clients/:clientId/bank" — one tab of the client workspace (owner ruling
 * Q3). Honest empty state, P2 shell only; the real surface (accounts,
 * statements, matching, reconciliation) is P3 work.
 */
export default async function ClientBankPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  await params;
  const t = await getTranslations("ClientBank");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
    </main>
  );
}
