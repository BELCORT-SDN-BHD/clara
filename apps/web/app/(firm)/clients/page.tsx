import { getTranslations } from "next-intl/server";

/**
 * "/clients" — the client register (owner ruling Q3). Honest empty state,
 * P2 shell only; the real surface (every client the firm serves, with a
 * click-through into its workspace at /clients/:clientId) is P3 work.
 */
export default async function ClientsRegisterPage() {
  const t = await getTranslations("ClientsRegister");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
    </main>
  );
}
