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
      {/* FIX-1 (rev-t1, HIGH): this block used to also gate on `!hold.loading`
          and `!hold.err` — `act()` makes a refusal STICKY (hooks.ts:232-237)
          and ALSO flips `loading` true->false on every reload it triggers
          (success or refusal), so EITHER condition made this WHOLE branch —
          HoldDialog included — return null the instant it fired, unmounting
          HoldDialog and losing the human's typed reason mid-attempt. The gate
          now depends ONLY on `hold.data === null` (matching the `held`
          branch below, which never had this problem: it gates purely on
          `hold.data`) — HoldDialog stays mounted through every loading tick
          and every refusal; only the WORDING beside it changes. */}
      {hold.data === null ? (
        <div className="flex items-center gap-2">
          {/* N2 (rev-t1 nit, review law 2): `p_cph_human` requires
              actor_role_rank() >= bookkeeper — a viewer session reads ZERO
              rows here whether or not a hold actually exists. "Close prep is
              not on hold" would assert a positive fact this read cannot
              prove; the neutral wording below is honest under EITHER cause
              (genuinely not held, or masked by RLS at this viewer's rank),
              and doubles as this block's own loading indicator — never a
              second, contradictory message painted alongside it. */}
          {hold.loading ? <LoadingState>{t("loading")}</LoadingState> : <EmptyState>{t("notHeld")}</EmptyState>}
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
