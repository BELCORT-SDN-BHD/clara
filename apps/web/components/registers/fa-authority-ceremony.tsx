"use client";

// The propose/sign/retire authority ceremony body — split out of
// depreciation-authority-panel.tsx (file-size discipline, the house
// convention write-off-form.tsx's own header names).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { FaDoorDialog } from "./FaDoorDialog";
import {
  proposeDepreciationAuthority,
  signDepreciationAuthority,
  retireDepreciationAuthority,
  type FaDepreciationAuthorityEnvelope,
} from "@/lib/registers/depreciation";
import { sessionTokenAccessor } from "@/lib/session-accessor";

// F6 (independent review, fix-required, 2026-08-28): only `proposed`/`live`
// ever reach this component — see lib/registers/depreciation.ts's
// `FaDepreciationAuthority.status` for why `retired` was dead code here (a
// retired-only client's `get_depreciation_authority` returns
// `authority: null`, which the `!au` branch below already renders
// correctly as "none proposed" — the same honest state a fresh client and a
// just-retired client share).
const STATUS_VARIANT = { proposed: "outline", live: "default" } as const;

export function AuthorityCeremony({
  clientId,
  data,
  busy,
  act,
}: {
  clientId: string;
  data: FaDepreciationAuthorityEnvelope;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const au = data.authority;

  return (
    <div className="flex flex-col gap-2">
      {data.fy_end.fallback ? <p className="text-xs text-warning">{t("fyEndFallback")}</p> : null}
      {!au ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("none")}</p>
          <ProposeDialog clientId={clientId} busy={busy} act={act} />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{t(`cadence.${au.cadence}`)}</Badge>
            <Badge variant={STATUS_VARIANT[au.status]}>{t(`status.${au.status}`)}</Badge>
          </div>
          {au.status === "live" ? (
            <p className="text-xs text-muted-foreground">{data.ramp_earned ? t("rampEarned") : t("rampNotEarned")}</p>
          ) : null}
          <div className="flex gap-2">
            {au.status === "proposed" ? <SignDialog clientId={clientId} authorityId={au.id} busy={busy} act={act} /> : null}
            <RetireDialog clientId={clientId} authorityId={au.id} busy={busy} act={act} />
          </div>
        </div>
      )}
    </div>
  );
}

function ProposeDialog({ clientId, busy, act }: { clientId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const [cadence, setCadence] = useState<"monthly" | "annual">("monthly");
  return (
    <FaDoorDialog
      triggerLabel={t("proposeTrigger")}
      title={t("proposeTitle")}
      description={t("proposeDescription")}
      confirmLabel={t("proposeTrigger")}
      busy={busy}
      onConfirm={() => act(async () => { await proposeDepreciationAuthority(sessionTokenAccessor, { clientId, cadence }); })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fa-authority-cadence">{t("cadenceLabel")}</Label>
        <NativeSelect id="fa-authority-cadence" value={cadence} onChange={(e) => setCadence(e.target.value as "monthly" | "annual")}>
          <option value="monthly">{t("cadence.monthly")}</option>
          <option value="annual">{t("cadence.annual")}</option>
        </NativeSelect>
      </div>
    </FaDoorDialog>
  );
}

function SignDialog({ clientId, authorityId, busy, act }: { clientId: string; authorityId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  return (
    <FaDoorDialog
      triggerLabel={t("signTrigger")}
      title={t("signTitle")}
      description={t("signDescription")}
      confirmLabel={t("signTrigger")}
      busy={busy}
      onConfirm={() => act(async () => { await signDepreciationAuthority(sessionTokenAccessor, { clientId, authorityId }); })}
    />
  );
}

function RetireDialog({ clientId, authorityId, busy, act }: { clientId: string; authorityId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("FixedAssetsDepreciation.authority");
  const [reason, setReason] = useState("");
  return (
    <FaDoorDialog
      triggerLabel={t("retireTrigger")}
      triggerVariant="destructive"
      title={t("retireTitle")}
      description={t("retireDescription")}
      confirmLabel={t("retireTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={() => act(async () => { await retireDepreciationAuthority(sessionTokenAccessor, { clientId, authorityId, reason: reason.trim() }); })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="fa-authority-retire-reason">{t("reasonLabel")}</Label>
        <Textarea id="fa-authority-retire-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FaDoorDialog>
  );
}
