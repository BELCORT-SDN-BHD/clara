"use client";

// The propose/sign/revoke vendor-identity-binding ceremony body — split out
// of vendor-bindings-panel.tsx (file-size discipline, the house convention
// components/registers/fa-authority-ceremony.tsx's own header names, itself
// the propose/sign/retire pattern this ceremony mirrors). A TWO-PERSON
// governed act: propose/revoke are bookkeeper+, sign is ADMIN+
// (lib/firm-admin/vendor-bindings.ts's own header) — the Sign trigger is
// NEVER pre-hidden on a client-side role guess; every viewer sees it, and a
// bookkeeper who clicks it gets the DB's own CLR04 refusal, verbatim.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";
import {
  proposeVendorIdentityBinding,
  signVendorIdentityBinding,
  revokeVendorIdentityBinding,
  type VendorBindingRow,
  type VendorBindingStatus,
  type VendorCounterpartyRow,
} from "@/lib/firm-admin/vendor-bindings";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { shortId } from "@/lib/firm-admin/money";

const STATUS_VARIANT: Record<string, "outline" | "default" | "destructive" | "secondary"> = {
  proposed: "outline",
  live: "default",
  revoked: "destructive",
  declined: "secondary",
  expired: "secondary",
};

const KNOWN_STATUSES = ["proposed", "live", "revoked", "declined", "expired"] as const;

function statusLabel(status: VendorBindingStatus, t: (key: string) => string): string {
  return (KNOWN_STATUSES as readonly string[]).includes(status) ? t(`status.${status}`) : status;
}

export function VendorBindingRowActions({
  binding,
  busy,
  act,
}: {
  binding: VendorBindingRow;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  return (
    <li className="flex flex-col gap-1.5 border-b border-border p-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{binding.counterparty_name}</span>
        <Badge variant={STATUS_VARIANT[binding.status] ?? "outline"}>{statusLabel(binding.status, t)}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{shortId(binding.binding_id)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("fingerprint", { f1: binding.f1_vendor_name_norm, f2: binding.f2_invoice_prefix })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("evidenceLine", {
          evidence: binding.evidence_count,
          resolutions: binding.resolution_count,
          divergences: binding.divergence_documents,
        })}
      </p>
      {binding.status === "proposed" || binding.status === "live" ? (
        <div className="flex gap-2">
          {binding.status === "proposed" ? (
            <FirmAdminDoorDialog
              triggerLabel={t("signTrigger")}
              title={t("signTitle")}
              description={t("signDescription")}
              confirmLabel={t("signTrigger")}
              busy={busy}
              onConfirm={() => act(async () => { await signVendorIdentityBinding(sessionTokenAccessor, binding.binding_id); })}
            />
          ) : null}
          {binding.status === "live" ? <RevokeDialog bindingId={binding.binding_id} busy={busy} act={act} /> : null}
        </div>
      ) : null}
    </li>
  );
}

function RevokeDialog({
  bindingId,
  busy,
  act,
}: {
  bindingId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const [reason, setReason] = useState("");
  return (
    <FirmAdminDoorDialog
      triggerLabel={t("revokeTrigger")}
      triggerVariant="destructive"
      title={t("revokeTitle")}
      description={t("revokeDescription")}
      confirmLabel={t("revokeTrigger")}
      busy={busy}
      confirmDisabled={!reason.trim()}
      onConfirm={() => act(async () => { await revokeVendorIdentityBinding(sessionTokenAccessor, bindingId, reason.trim()); })}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="vb-revoke-reason">{t("reasonLabel")}</Label>
        <Textarea id="vb-revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FirmAdminDoorDialog>
  );
}

export function ProposeBindingDialog({
  clientId,
  counterparties,
  busy,
  act,
}: {
  clientId: string;
  counterparties: VendorCounterpartyRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const [counterpartyId, setCounterpartyId] = useState("");

  return (
    <FirmAdminDoorDialog
      triggerLabel={t("proposeTrigger")}
      title={t("proposeTitle")}
      description={t("proposeDescription")}
      confirmLabel={t("proposeTrigger")}
      busy={busy}
      confirmDisabled={!counterpartyId}
      onConfirm={() =>
        act(async () => {
          await proposeVendorIdentityBinding(sessionTokenAccessor, clientId, counterpartyId);
        })
      }
    >
      <div className="grid gap-1.5">
        <Label htmlFor="vb-propose-counterparty">{t("counterpartyLabel")}</Label>
        <NativeSelect id="vb-propose-counterparty" value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
          <option value="">{t("counterpartyPlaceholder")}</option>
          {counterparties.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </FirmAdminDoorDialog>
  );
}
