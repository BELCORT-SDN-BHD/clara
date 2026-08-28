"use client";

// The opening-seed lifecycle workbench (T2, port wave) — `registers-workbench.tsx`'s
// "opening" tab. Replaces this file's own prior NotBuiltNote placeholder body
// (T0 seam) — same array position, same file identity, only the content
// changes, per that seam's own instruction.
//
// `uq_opening_seed_registry_once` (a census-confirmed partial unique index)
// means at most ONE non-cancelled seed exists per client at a time — this
// component reads every seed the client has ever had and either shows the
// live one's full workbench (opening-seed-workbench.tsx, mounted keyed by its
// id) or an honest "no seed yet" state with the entry-point Create dialog
// (mobbin grounding takeaway 5).
//
// DEFERRED-ACTIVATION SCOPE NOTE (rung 0, this train's own census): the
// fa7b-gate-record.md playbook (bank-only/shoebox clients take NO opening
// seed, with a deferred-activation banner) has NO live, human-readable field
// on `clients` or `onboarding_plans` this build can read to tell which
// playbook a client is on — censused directly (`information_schema.columns`
// on both tables, plus a repo-wide grep for a materials-category/engagement-
// type column) and confirmed absent. This component therefore renders the
// SAME honest "no seed yet" empty state for every client with none, rather
// than fabricating a playbook determination it cannot read — see this
// train's settle report for the scope note in full.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadOpeningSeeds, loadOnboardingPlansForClient } from "@/lib/registers/opening";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { loadCounterparties } from "@/lib/registers/counterparty";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState } from "@/components/common/state";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { CreateOpeningSeedDialog } from "./opening-seed-lifecycle";
import { OpeningSeedWorkbench } from "./opening-seed-workbench";

async function loadAllCounterparties(clientId: string) {
  const [customers, vendors] = await Promise.all([
    loadCounterparties(sessionTokenAccessor, clientId, "customer"),
    loadCounterparties(sessionTokenAccessor, clientId, "vendor"),
  ]);
  return [...customers, ...vendors];
}

export function OpeningRegister({ clientId }: { clientId: string }) {
  const t = useTranslations("OpeningCarryDown");
  const seedsRead = useAsyncRead(() => loadOpeningSeeds(sessionTokenAccessor, clientId));
  const plansRead = useAsyncRead(() => loadOnboardingPlansForClient(sessionTokenAccessor, clientId));
  const accountsRead = useAsyncRead(() => loadChartOfAccounts(sessionTokenAccessor, clientId));
  const counterpartiesRead = useAsyncRead(() => loadAllCounterparties(clientId));

  const seeds = seedsRead.data ?? [];
  const liveSeed = seeds.find((s) => s.state !== "cancelled") ?? null;
  const plans = plansRead.data ?? [];
  // Prefer a non-cancelled plan (the client's live onboarding record); the
  // door itself has no state precondition on p_plan (this module's own
  // grounding), so falling back to the most recent cancelled one rather than
  // refusing outright still lets the workbench name a real plan id.
  const preferredPlan = plans.find((p) => p.state !== "cancelled") ?? plans[plans.length - 1] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      {seedsRead.error ? <ErrorMessage error={seedsRead.error} /> : null}
      <DataState loading={seedsRead.loading} error={null} isEmpty={false} emptyMessage="">
        {liveSeed ? (
          <OpeningSeedWorkbench
            key={liveSeed.id}
            clientId={clientId}
            seed={liveSeed}
            accounts={accountsRead.data ?? []}
            counterparties={counterpartiesRead.data ?? []}
            onSeedsChanged={seedsRead.reload}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <EmptyState>{t("noSeedYet")}</EmptyState>
            <div>
              <CreateOpeningSeedDialog clientId={clientId} planId={preferredPlan?.id ?? null} busy={seedsRead.busy} act={seedsRead.act} />
            </div>
            {!preferredPlan && !plansRead.loading ? <p className="text-xs text-warning">{t("noPlanNote")}</p> : null}
          </div>
        )}
      </DataState>
      {accountsRead.error ? <ErrorMessage error={accountsRead.error} /> : null}
      {counterpartiesRead.error ? <ErrorMessage error={counterpartiesRead.error} /> : null}
    </div>
  );
}
