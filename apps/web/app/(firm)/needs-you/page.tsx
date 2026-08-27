import { getTranslations } from "next-intl/server";
import { NeedsYouInbox } from "@/components/firm/needs-you-inbox";

/**
 * "/needs-you" — the cross-client Needs-you inbox (owner ruling Q3). Reads
 * clara.list_review_queue at firm altitude (lib/firm/needs-you.ts) — the ONE
 * paginated multi-source queue the DB ships (drafts, uncoded filings, open
 * questions, coding tasks); firm-level questions (clara.firm_open_questions)
 * have no human read surface yet and are named as a gap, not worked around
 * (see NeedsYouInbox's own gap panel).
 */
export default async function NeedsYouPage() {
  const t = await getTranslations("NeedsYou");

  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
      <NeedsYouInbox />
    </main>
  );
}
