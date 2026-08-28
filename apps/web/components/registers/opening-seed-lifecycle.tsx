"use client";

// The seed lifecycle header — mobbin grounding takeaway 4: the seed's own
// state is a `Badge` beside the page title, never a full-page banner (the
// dry-run's tone="success"/"warning" StateBanner owns that visual weight —
// two banners stacked on one page would blur which one the user must act
// on). Also the seed's entry-point dialog (takeaway 5: a small `Dialog`
// starts the lifecycle, not a wizard page) plus the cancel/reopen door
// dialogs.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { createOpeningSeed, cancelOpeningSeed, reopenOpeningSeed } from "@/lib/registers/opening-doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { businessToday } from "@/lib/business-date";
import type { OpeningSeedRow } from "@/lib/registers/opening-types";

const STATE_VARIANT: Record<string, "outline" | "default" | "secondary"> = {
  open: "secondary",
  finalized: "default",
  cancelled: "outline",
};

export function OpeningSeedBadge({ state }: { state: string }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const labels: Record<string, string> = { open: t("states.open"), finalized: t("states.finalized"), cancelled: t("states.cancelled") };
  return <Badge variant={STATE_VARIANT[state] ?? "outline"}>{labels[state] ?? state}</Badge>;
}

export function CreateOpeningSeedDialog({
  clientId,
  planId,
  busy,
  act,
}: {
  clientId: string;
  planId: string | null;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [asOf, setAsOf] = useState(businessToday());

  return (
    <OpeningDoorDialog
      triggerLabel={t("createTrigger")}
      title={t("createTitle")}
      description={t("createDescription")}
      confirmLabel={t("createTrigger")}
      busy={busy}
      confirmDisabled={!planId || !asOf}
      onConfirm={() =>
        act(async () => {
          if (!planId) return;
          await createOpeningSeed(sessionTokenAccessor, { client: clientId, plan: planId, asOf, tieDocumentId: null, tieSha256: null });
        }).then(() => {})
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-seed-as-of">{t("asOfLabel")}</Label>
        <Input id="opening-seed-as-of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("keyedNote")}</p>
      </div>
    </OpeningDoorDialog>
  );
}

export function CancelOpeningSeedDialog({ seed, busy, act }: { seed: OpeningSeedRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [reason, setReason] = useState("");

  return (
    <OpeningDoorDialog
      triggerLabel={t("cancelTrigger")}
      triggerVariant="destructive"
      title={t("cancelTitle")}
      description={t("cancelDescription")}
      confirmLabel={t("cancelTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={async () => { await act(async () => { await cancelOpeningSeed(sessionTokenAccessor, { seed: seed.id, reason: reason.trim() }); }); }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-seed-cancel-reason">{t("reasonLabel")}</Label>
        <Textarea id="opening-seed-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </OpeningDoorDialog>
  );
}

export function ReopenOpeningSeedDialog({ seed, busy, act }: { seed: OpeningSeedRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("OpeningCarryDown.seed");
  const [reason, setReason] = useState("");

  return (
    <OpeningDoorDialog
      triggerLabel={t("reopenTrigger")}
      title={t("reopenTitle")}
      description={t("reopenDescription")}
      confirmLabel={t("reopenTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={async () => { await act(async () => { await reopenOpeningSeed(sessionTokenAccessor, { seed: seed.id, reason: reason.trim() }); }); }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="opening-seed-reopen-reason">{t("reasonLabel")}</Label>
        <Textarea id="opening-seed-reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </OpeningDoorDialog>
  );
}
