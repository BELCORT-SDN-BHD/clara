"use client";

// supersede_opening_item — bookkeeper+. Only offered per-row on an ACTIVE
// item of a FINALIZED seed (the door's own precondition — parent panel gates
// on the same read it already has). T2 scope is the reversal-only path
// (`p_replacement: null`) — see lib/registers/opening-item-doors.ts's own
// header for why a fixed-asset replacement's nested `asset` envelope is out
// of this dialog's scope (reversal here, then a fresh seed_fixed_asset
// baseline). The live body carries NO `p_reason` argument for a reversal-only
// call — this dialog collects no field the door would silently discard (a
// text box whose contents vanish is exactly the kind of thing "consent shows
// what it approves" exists to rule out).

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

  return (
    <OpeningDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title", { key: item.item_key })}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      onConfirm={async () => { await act(async () => { await supersedeOpeningItem(sessionTokenAccessor, { item: item.id, replacement: null }); }); }}
    >
      <p className="text-xs text-muted-foreground">{t("reversalOnlyNote")}</p>
    </OpeningDoorDialog>
  );
}
