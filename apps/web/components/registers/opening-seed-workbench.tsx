"use client";

// The live seed's own workbench — mounted keyed by `seed.id` (opening-register.tsx),
// so every hook below is scoped to exactly one seed for its whole lifetime;
// a seed switch remounts this component fresh rather than reusing state
// across seeds (the use-async-read.ts convention for a captured id that can
// change). ONE combined read drives items/targets/keyed-resolution together
// so a single `act()` reloads all three plus the PARENT's own seed-list read
// (`onSeedsChanged`) after every governed write — the seed's own state/badge
// must never go stale after an approve/cancel/reopen/supersede.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadOpeningItems, loadOpeningTbTargets, loadOpeningKeyedResolution } from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { OpeningSeedBadge, CancelOpeningSeedDialog, ReopenOpeningSeedDialog } from "./opening-seed-lifecycle";
import { OpeningDryrunStrip } from "./opening-dryrun-strip";
import { OpeningItemsPanel } from "./opening-items-panel";
import { OpeningTargetKeyedPanel } from "./opening-target-keyed-panel";
import { OpeningFixedAssetDialog } from "./opening-fixed-asset-dialog";
import { ApproveOpeningSeedDialog, ApproveOpeningCorrectionDialog } from "./opening-approve-dialogs";
import type { OpeningSeedRow } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";
import type { CounterpartyRow } from "@/lib/registers/counterparty";

export function OpeningSeedWorkbench({
  clientId,
  seed,
  accounts,
  counterparties,
  onSeedsChanged,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  accounts: AccountRow[];
  counterparties: CounterpartyRow[];
  onSeedsChanged: () => Promise<void>;
}) {
  const t = useTranslations("OpeningCarryDown.seed");
  const { data, loading, error, busy, act: rawAct } = useAsyncRead(async () => {
    const [items, targets, keyed] = await Promise.all([
      loadOpeningItems(sessionTokenAccessor, seed.id),
      loadOpeningTbTargets(sessionTokenAccessor, seed.id),
      loadOpeningKeyedResolution(sessionTokenAccessor, seed.id),
    ]);
    return { items, targets, keyed };
  });

  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    await onSeedsChanged();
    return ok;
  };

  const items = data?.items ?? [];
  const draftItems = items.filter((i) => i.state === "active");
  const correctionItems = items; // the door itself selects which drafts qualify (opening-approve-dialogs.tsx)
  const keyedResolutionId = data?.keyed?.id ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SectionHeader level={2}>{t("heading")}</SectionHeader>
          <OpeningSeedBadge state={seed.state} />
        </div>
        <div className="flex flex-wrap gap-2">
          {seed.state === "open" && items.length === 0 ? <CancelOpeningSeedDialog seed={seed} busy={busy} act={act} /> : null}
          {seed.state === "finalized" ? <ReopenOpeningSeedDialog seed={seed} busy={busy} act={act} /> : null}
          {seed.state === "open" ? <ApproveOpeningSeedDialog seed={seed} draftItems={draftItems} busy={busy} act={act} /> : null}
          {seed.state === "open" && items.some((i) => i.supersedes_item_id !== null) ? (
            <ApproveOpeningCorrectionDialog seed={seed} correctionItems={correctionItems} busy={busy} act={act} />
          ) : null}
          {seed.state === "open" ? <OpeningFixedAssetDialog clientId={clientId} seed={seed} accounts={accounts} keyedResolutionId={keyedResolutionId} busy={busy} act={act} /> : null}
        </div>
      </div>

      {error ? <ErrorMessage error={error} /> : null}

      <DataState loading={loading} error={null} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-6">
            <OpeningDryrunStrip key={`${seed.id}:${items.length}:${seed.state}`} seedId={seed.id} />

            {!seed.tie_document_id ? (
              <OpeningTargetKeyedPanel clientId={clientId} seed={seed} targets={data.targets} keyedResolutionId={keyedResolutionId} accounts={accounts} busy={busy} act={act} />
            ) : null}

            <OpeningItemsPanel clientId={clientId} seed={seed} items={items} accounts={accounts} counterparties={counterparties} keyedResolutionId={keyedResolutionId} busy={busy} act={act} />
          </div>
        ) : null}
      </DataState>
    </div>
  );
}
