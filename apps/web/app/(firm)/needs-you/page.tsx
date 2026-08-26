import { getTranslations } from "next-intl/server";

/**
 * "/needs-you" — the cross-client Needs-you inbox (owner ruling Q3). Honest
 * empty state, P2 shell only; the real surface (queued items needing a
 * human act across every client) is P3 work.
 */
export default async function NeedsYouPage() {
  const t = await getTranslations("NeedsYou");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
    </main>
  );
}
