"use client";

// T1 — `hold_close_prep` / `release_close_prep` (port-wave-plan §4 T1; the
// "0138 four" the census found paired with the stale-notes-truing lane, which
// on rung-0 re-census turned out NOT to have wired these — see this train's
// own scope note). Client-scoped (the doors take no p_fy), reading the live
// hold (getRows close_prep_holds) so visibility follows the DB's own state —
// never a client-side guess (CloseDoors.tsx's own header: "visibility is a
// convenience, not a security boundary; the DB is").

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useHydratedPart } from "@/lib/parts/hooks";
import { getLiveClosePrepHold, holdClosePrep, releaseClosePrep } from "@/lib/close/api";
import type { SessionTokenAccessor } from "@/lib/session";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { CloseDoorDialog } from "./CloseDoorDialog";

export function ClosePrepHoldPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientClose.closePrep");
  const hold = useHydratedPart(session, (s) => getLiveClosePrepHold(clientId, { session: s }));

  return (
    <div className="flex flex-col gap-2">
      {hold.loading && hold.data === null ? <LoadingState>{t("loading")}</LoadingState> : null}
      {!hold.loading && hold.data === null && !hold.err ? (
        <div className="flex items-center gap-2">
          <EmptyState>{t("notHeld")}</EmptyState>
          <HoldDialog busy={hold.busy} onConfirm={(reason) => hold.act(async () => { await holdClosePrep(clientId, reason, { session }); })} />
        </div>
      ) : null}
      {hold.data ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t("held")}</Badge>
          <span className="text-xs text-muted-foreground">
            {t("heldBy")}: {hold.data.held_by} · {businessDateTime(hold.data.held_at)}
          </span>
          <span className="text-xs text-muted-foreground">{hold.data.reason}</span>
          <ReleaseDialog busy={hold.busy} onConfirm={(reason) => hold.act(async () => { await releaseClosePrep(clientId, reason, { session }); })} />
        </div>
      ) : null}
      {hold.err ? (
        <StateBanner tone="error" code={hold.clr ? `${hold.clr.code}${hold.clr.reason ? ` · ${hold.clr.reason}` : ""}` : undefined}>
          {hold.err}
        </StateBanner>
      ) : null}
    </div>
  );
}

function HoldDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (reason: string) => Promise<void> }) {
  const t = useTranslations("ClientClose.closePrep.hold");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onConfirm(reason)}
    >
      <Textarea aria-label={t("trigger")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </CloseDoorDialog>
  );
}

function ReleaseDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (reason: string) => Promise<void> }) {
  const t = useTranslations("ClientClose.closePrep.release");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onConfirm(reason)}
    >
      <Textarea aria-label={t("trigger")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </CloseDoorDialog>
  );
}
