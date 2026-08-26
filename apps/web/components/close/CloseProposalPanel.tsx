"use client";

// "Clara proposes close" — HONESTLY NOT BUILT (coordinator ruling, following the
// ground-close census). Grepped the live catalog directly: no `clara.close_proposals`
// table, no `wake_propose_close` (or any `wake_*` close wrapper) exists in
// packages/db/migrations, and PROGRESS.md/docs/plan carry no scheduled migration
// for one (F-A4 PR-1c is unbuilt). `clara.attest_close_exception`'s own
// `p_from_proposal` argument (0120:919) stays unpassed here for exactly this
// reason — there is no proposal carrier to source one from. This panel surfaces
// that absence verbatim rather than inventing a UI for a verb that does not
// exist — the mission's own "anything verb-less renders honestly not built yet"
// rule.

import { useTranslations } from "next-intl";

export function CloseProposalPanel() {
  const t = useTranslations("ClientClose.proposal");
  return (
    <section className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
      <h3 className="text-sm font-medium text-foreground">{t("heading")}</h3>
      <p>{t("body")}</p>
    </section>
  );
}
