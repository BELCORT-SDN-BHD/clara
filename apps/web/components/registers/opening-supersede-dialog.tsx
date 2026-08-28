"use client";

// supersede_opening_item — bookkeeper+. Only offered per-row on an ACTIVE
// item of a FINALIZED seed (the door's own precondition — parent panel gates
// on the same read it already has). T2 scope is the reversal-only path
// (`p_replacement: null`) — see lib/registers/opening-item-doors.ts's own
// header for the exact live-body reasoning. The live body carries NO
// `p_reason` argument for a reversal-only call — this dialog collects no
// field the door would silently discard (a text box whose contents vanish is
// exactly the kind of thing "consent shows what it approves" exists to rule
// out).
//
// F7 (fix round, rev-t2): a `fixed_asset` row's reversal-only call is not a
// degraded path — the live body raises CLR31 "a fixed-asset supersede
// requires a replacement baseline" and rolls back the WHOLE call, always,
// for this kind (this dialog does not author the live body's own nested
// `asset` replacement envelope). Render-and-shape: the trigger stays
// reachable on every active item (never hidden by kind), Confirm is disabled
// with a visible reason specifically for `fixed_asset` — the door is still
// what would refuse it; this is a courtesy that avoids a call known in
// advance to always fail, not a fabricated door precondition.

import { useTranslations } from "next-intl";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { supersedeOpeningItem } from "@/lib/registers/opening-item-doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningItemRow } from "@/lib/registers/opening-types";

export function OpeningSupersedeDialog({
  item,
  busy,
  act,
}: {
  item: OpeningItemRow;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.supersede");
  const isFixedAsset = item.item_kind === "fixed_asset";

  return (
    <OpeningDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title", { key: item.item_key })}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={isFixedAsset}
      onConfirm={async () => { await act(async () => { await supersedeOpeningItem(sessionTokenAccessor, { item: item.id, replacement: null }); }); }}
    >
      {isFixedAsset ? (
        <p className="text-xs text-warning">{t("fixedAssetReplacementRequired")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("reversalOnlyNote")}</p>
      )}
    </OpeningDoorDialog>
  );
}
