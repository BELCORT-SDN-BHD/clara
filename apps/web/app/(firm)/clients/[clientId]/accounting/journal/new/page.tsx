import { getTranslations } from "next-intl/server";

import { JournalComposer } from "@/components/accounting/journal-composer";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/clients/:clientId/accounting/journal/new" — journey C3's direct entry point.
 *
 * IT IS A ROUTE AND NOT A DIALOG, and Appendix D is explicit about which is
 * which: a Dialog is "a focused, bounded form or decision that can complete
 * without losing page context", and a Sheet is "a side panel, not the durable
 * Work URL". A journal basis is neither bounded nor short — it is a table of
 * money with a draft that must survive a reload, and §4 puts exactly that case
 * on its own address ("a long source comparison or multi-section accounting form
 * uses a full detail destination"). A stable URL is also what makes the draft
 * recoverable at all: a human can close the tab, come back, and find it.
 *
 * IT READS NOTHING ON THE SERVER. The client's chart, the caller's rank and the
 * draft are all client-side concerns, and the one thing this route could have
 * checked here — may this caller compose — is checked in three better places
 * already: the composer renders the denied state, the runtime refuses the POST,
 * and the database rechecks the author's live role AT COMMIT. A fourth check
 * here would add a rank read to every page load and change no outcome.
 *
 * The client id's own shape guard lives in the layout above
 * (app/(firm)/clients/[clientId]/layout.tsx), so a malformed address is the
 * scoped not-found before this file is reached.
 */
export default async function NewJournalWorkPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const t = await getTranslations("JournalComposer");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <JournalComposer clientId={clientId} />
    </PageShell>
  );
}
