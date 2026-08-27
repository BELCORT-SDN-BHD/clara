import { getTranslations } from "next-intl/server";
import { FirmActivityFeed } from "@/components/firm/firm-activity-feed";

/**
 * "/activity" — the firm activity feed: the receipts/open-register inversion
 * made surface (ADR-0074), at firm altitude across every client. Reads
 * clara.agent_receipts_visible (lib/firm/reads.ts) — an AUDIT TRAIL of what
 * happened, never conflated with Needs-you's queue of what awaits.
 */
export default async function FirmActivityPage() {
  const t = await getTranslations("FirmActivity");

  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <FirmActivityFeed />
    </main>
  );
}
