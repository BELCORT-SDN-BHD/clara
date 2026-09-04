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
// DEFERRED-ACTIVATION SCOPE NOTE (TRUED, fix round rev-t2, F3 — the original
// note here was a FALSE census, wrong instrument): the opening-position
// determination (deferred carry-down vs. first-year-zero) IS live and
// readable — it is a ROW on `clara.onboarding_plan_items`, not a field on
// `clients`/`onboarding_plans`. See opening-position-gate.tsx (the "no seed
// yet" branching) and lib/registers/opening.ts's `loadOpeningPositionPlanItems`
// for the full grounding. What genuinely is NOT built by this train, named
// honestly on the deferred branch's own NotBuiltNote rather than silently
// omitted: the FY1 basis-of-preparation cost figure and the close-seal block
// while the deferred banner is up (fa7b-gate-record.md's Q-D6/Q-D9) — both
// belong to a reporting/close surface, not this workbench.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadOpeningSeeds, loadOnboardingPlansForClient } from "@/lib/registers/opening";
import { loadChartOfAccounts } from "@/lib/registers/accounts";
import { loadCounterparties } from "@/lib/registers/counterparty";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { NoOpeningSeedState } from "./opening-position-gate";
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

  // F9 (fix round, rev-t2): `error={null}` here used to force DataState past
  // its own error branch UNCONDITIONALLY, so a genuine read failure (a 403,
  // say) fell straight through to the empty-state children below — a human
  // reading "No opening seed has been created for this client yet. Create
  // opening seed" on an account that simply cannot read the table yet, which
  // is exactly "a derived state is not evidence" (AGENTS.md review law 2) in
  // UI form. `hasSeedsData` mirrors the fixed-assets-register.tsx precedent:
  // once real data has loaded at least once, a LATER failed reload paints as
  // a banner above the still-good content (never replacing it); before that,
  // the failure IS the whole state DataState renders.
  const hasSeedsData = seedsRead.data !== null;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader level={2}>{t("heading")}</SectionHeader>
      {hasSeedsData && seedsRead.error ? <ErrorMessage error={seedsRead.error} /> : null}
      {/* (5) THE LOADING GATE UNMOUNTS THE PANEL THAT OWNS THE ACT — the same defect
          fixed_assets-register.tsx carries, and the same one ClosePrepHoldPanel's
          FIX-1 fixed for one panel without sweeping to its siblings. `DataState`
          renders its LoadingState INSTEAD of children while `loading` is true, and
          every `act()` flips `loading` on the reload it always fires, so a refused
          governed write tore down the whole workbench — the open dialog, the typed
          item key, the keyed target amounts — at the exact moment CB-AE2E-004 was
          working to keep them. Once real data has loaded ONCE, a later `loading` is a
          refresh; the `error` prop beside it already reads that way. */}
      <DataState loading={!hasSeedsData && seedsRead.loading} error={hasSeedsData ? null : seedsRead.error} isEmpty={false} emptyMessage="">
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
          <NoOpeningSeedState
            clientId={clientId}
            plan={preferredPlan ? { id: preferredPlan.id } : null}
            plansLoading={plansRead.loading}
            busy={seedsRead.busy}
            act={seedsRead.act}
          />
        )}
      </DataState>
      {plansRead.error ? <ErrorMessage error={plansRead.error} /> : null}
      {accountsRead.error ? <ErrorMessage error={accountsRead.error} /> : null}
      {counterpartiesRead.error ? <ErrorMessage error={counterpartiesRead.error} /> : null}
    </div>
  );
}
