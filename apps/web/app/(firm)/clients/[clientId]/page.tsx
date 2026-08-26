import { getTranslations } from "next-intl/server";

/**
 * Client-workspace "Home" tab ("/clients/:clientId") — honest empty state.
 *
 * P1 foundation scaffold, now the Home tab of the P2 client-workspace shell
 * (app/(firm)/clients/[clientId]/layout.tsx — journals, documents, bank,
 * close, reports, registers, knowledge are its sibling tabs). The real
 * content here is P3 work, per the IA ruling:
 * docs/plan/active/mohe-grill-rulings-2026-08-27.md Q3.
 *
 * `clientId` is rendered verbatim from the URL — no lookup, no client name
 * yet. Resolving it against a real client record is P3's job once the
 * data-fetching layer exists (hard constraint 2: the DB owns every
 * authoritative number/identity render).
 */
export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("ClientWorkspace");

  return (
    <main className="flex flex-col gap-2 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <p className="max-w-prose text-sm text-muted-foreground">{t("body")}</p>
      <p className="text-sm text-muted-foreground">
        {t("clientIdLabel")}: <span className="font-mono">{clientId}</span>
      </p>
    </main>
  );
}
