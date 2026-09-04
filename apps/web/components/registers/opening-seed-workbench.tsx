"use client";

// The live seed's own workbench — mounted keyed by `seed.id` (opening-register.tsx),
// so every hook below is scoped to exactly one seed for its whole lifetime;
// a seed switch remounts this component fresh rather than reusing state
// across seeds (the use-async-read.ts convention for a captured id that can
// change). ONE combined read drives items/targets/keyed-resolution together
// so a single `act()` reloads all three plus the PARENT's own seed-list read
// (`onSeedsChanged`) after every governed write — the seed's own state/badge
// must never go stale after an approve/cancel/reopen/supersede.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadOpeningItems, loadOpeningTbTargets, loadOpeningKeyedResolution } from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { isDoorRefusal } from "@/lib/doors";
import { SectionHeader } from "@/components/common/section-header";
import { DataState, ErrorMessage } from "@/components/firm/data-state";
import { OpeningSeedBadge, CancelOpeningSeedDialog, ReopenOpeningSeedDialog } from "./opening-seed-lifecycle";
import { OpeningDryrunStrip } from "./opening-dryrun-strip";
import { toDialogRefusal } from "@/components/common/dialog-refusal";
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

  // BLOCKER 1 (fix round 2, rev-t2): `record_opening_target`'s live body ends
  // in `on conflict(seed_id,line_key) do update set … debit_cents=excluded…`
  // against `uq_opening_tb_targets_key UNIQUE(seed_id,line_key)` — RE-recording
  // an EXISTING line_key (correcting a mistyped amount, the commonest action
  // while keying a TB) updates the row IN PLACE. `targets.length` therefore
  // never moves on an edit, even though the figure the dry-run strip's own
  // `_opening_seed_deltas` reads DID change — a count-based remount key is
  // blind to an upsert. An epoch this component itself bumps on every
  // SETTLED `act()` (success or failure — the strip re-reading after a
  // failed act is exactly the same "never trust, always re-derive" law every
  // other read in this file already follows) is discriminator-free: it does
  // not need to know WHAT changed, only that a governed write on this seed
  // just settled, which subsumes the items.length/targets.length signals it
  // replaces.
  const [actEpoch, setActEpoch] = useState(0);
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    setActEpoch((e) => e + 1);
    await onSeedsChanged();
    return ok;
  };

  // CB-AE2E-004 / 裁-187: ONE conversion of this workbench's sticky failure into
  // the shape every governed dialog below reads — it renders verbatim inside the
  // dialog (which now stays open on a refusal) and it is the only thing that
  // reveals an attestation field.
  const dialogRefusal = toDialogRefusal(error);

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
          {/* F8 (fix round, rev-t2): un-hid — cancel_opening_seed's live
              precondition ("only an EMPTY open seed") was being enforced a
              second time here by hiding the trigger once items existed,
              contradicting opening-doors.ts's own doc comment ("never hides
              it outright"). Render-and-shape: the trigger is reachable on
              any open seed; the door refuses CLR31 `registry_not_open` on a
              non-empty one, surfaced verbatim like any other refusal. */}
          {seed.state === "open" ? <CancelOpeningSeedDialog seed={seed} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "finalized" ? <ReopenOpeningSeedDialog seed={seed} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "open" ? <ApproveOpeningSeedDialog seed={seed} draftItems={draftItems} busy={busy} refusal={dialogRefusal} act={act} /> : null}
          {seed.state === "open" && items.some((i) => i.supersedes_item_id !== null) ? (
            <ApproveOpeningCorrectionDialog seed={seed} correctionItems={correctionItems} busy={busy} refusal={dialogRefusal} act={act} />
          ) : null}
          {seed.state === "open" ? <OpeningFixedAssetDialog clientId={clientId} seed={seed} accounts={accounts} keyedResolutionId={keyedResolutionId} busy={busy} refusal={dialogRefusal} act={act} /> : null}
        </div>
      </div>

      {error ? <ErrorMessage error={error} /> : null}
      {/* NOT A DEFECT, recorded per the fix round: approve_opening_seed /
          approve_opening_correction assert `transaction_isolation =
          'serializable'` in-body; no migration sets it (a manual wave-b 0017
          ceremony artifact) — an un-ceremonied DB refuses CLR31
          `not_serializable` on EVERY approve attempt. The refusal itself
          already renders verbatim above; this is one extra line of operator
          guidance, reusing the prior build's own hint text verbatim
          (apps/dashboard/app/opening/openingModel.ts:348-349) rather than
          inventing new copy. */}
      {isDoorRefusal(error) && error.code === "CLR31" && error.reason === "not_serializable" ? (
        <p className="text-xs text-muted-foreground">{t("notSerializableHint")}</p>
      ) : null}

      <DataState loading={loading} error={null} isEmpty={false} emptyMessage="">
        {data ? (
          <div className="flex flex-col gap-6">
            {/* F2 residual fix (fix round 2, rev-t2): a COUNT-based key
                (items.length/targets.length) is blind to an in-place UPDATE
                (record_opening_target's own upsert on an existing line_key)
                — the count never moves even though the figure did. The
                act-epoch above bumps on every settled write on this seed,
                remounting (and re-fetching) the strip regardless of whether
                the write added, updated, or left the row count unchanged. */}
            <OpeningDryrunStrip key={`${seed.id}:${actEpoch}`} seedId={seed.id} targets={data?.targets ?? []} />

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
