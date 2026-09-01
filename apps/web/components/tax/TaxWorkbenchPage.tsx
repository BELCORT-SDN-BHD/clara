"use client";

// The Tax tab (P6-T, 裁-34 — "one home each" for Track B's frontend, all of
// it in P6, with the backend — no new phase). 裁-44 FIXES THE SHAPE: this is
// agentic on the same shape as the close — after a close seals, Clara
// drafts the R1-R10 computation and the CP204 estimate UNASKED, every rung
// carrying its statutory citation and her own explanation, pushed to the
// needs-you inbox as a card for a human to sign. So this tab is a
// PROPOSAL/RECEIPT surface with a human signing lane — NEVER an input grid
// a professional types a computation into. A lane that builds a form here
// has built the wrong surface, not merely an early one.
//
// Measured state at this tip (FS-0 census, 2026-08-31): F-T1's PR-1 is
// merged (migration 0153) and F-T3's PR-1 is merged (migration 0152) — both
// ship reference/platform tables only, no governed door. Track B is paused
// beyond them (裁-80); neither lane's PR-2 has opened. So today this tab is
// IA ONLY: three honest
// NotBuiltNotes, each naming its own verb/object and its own lane, never a
// fake control — the house mechanism (apps/web/AGENTS.md: "a missing
// backend verb renders honestly 'not built yet' — never a fake control").
// The three ride-alongs (one per backend merge) wire each panel's real read
// against whichever doors that lane actually ships; none is invented here.

import { useTranslations } from "next-intl";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SstPanel } from "./SstPanel";
import { TaxComputationPanel } from "./TaxComputationPanel";
import { TurnoverClassificationPanel } from "./TurnoverClassificationPanel";

export function TaxWorkbenchPage({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientTax");
  // `clientId` is accepted now, matching every sibling tab's page->workbench
  // shape (registers-workbench.tsx, ReportsPage.tsx), for the three
  // ride-along PRs that wire a real per-client read into one of the panels
  // below. No panel needs it yet — every one is a static honest note.
  void clientId;

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("body")} />
      <SstPanel />
      <TaxComputationPanel />
      <TurnoverClassificationPanel />
    </PageShell>
  );
}
