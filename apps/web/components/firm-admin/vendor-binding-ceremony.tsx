"use client";

// The revoke vendor-identity-binding ceremony body — split out of
// vendor-bindings-panel.tsx (file-size discipline, the house convention
// components/registers/fa-authority-ceremony.tsx's own header names). A
// RANK-gated governed act: revoke is bookkeeper+
// (lib/firm-admin/vendor-bindings.ts's own header).
//
// #921 [0273] (2026-09-20/21) RETIRED THE PROPOSE AND SIGN CONTROLS OUTRIGHT.
// D6 keeps only "historical receipts and in-flight legacy visibility" for
// this legacy lane; the Client-KB / counterparty-identity lane (#647) is the
// replacement. Migration 0273 revoked clara_authenticated's EXECUTE on both
// `propose_vendor_identity_binding` and `sign_vendor_identity_binding` for
// EVERY rank — unlike the RANK-shaped narrowing 裁-187 (below) still applies
// to Revoke, there is no floor left to gate client-side, because there is no
// rank at which either door succeeds any more. `ProposeBindingDialog` and the
// Sign half of `VendorBindingRowActions` are DELETED, not merely hidden — the
// history this file carries (裁-18a's signer≠proposer wall, F2's zero-consumer
// finding for `get_vendor_binding`, the RANK-gating note E-7 added) all
// concerned a door that no longer exists on the human surface, so it goes
// with the code rather than becoming a comment nobody can act on. Full
// history: git blame on this file before #921.
//
// E-7 (裁-187, 2026-09-04) narrowed Revoke's own RANK gate to be client-side:
// the caller's rank is positively read and a control the rank cannot use is
// not rendered — see lib/firm/capabilities.ts, `canRevokeVendorBinding`.
//
// F2 (independent review, fix-required, 2026-08-28): `get_vendor_binding` had
// zero production consumers — a consent must show what it approves. The
// Revoke dialog mounts `VendorBindingDetailView`, a READ (labelled as such at
// this call site — it rides `callDoor` as transport but is NOT a governed
// act, AGENTS.md's own rule) showing who proposed the binding, when, the
// evidence/resolution counts and the content fingerprint. A failed detail
// read renders its OWN error INSIDE the dialog and never disables or hides
// Revoke — the DB's own door is the wall, not this read.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";
import {
  revokeVendorIdentityBinding,
  getVendorBinding,
  type VendorBindingRow,
  type VendorBindingStatus,
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

/** F2's own read — a plain data-fetch labelled as a read at this call site
 *  (AGENTS.md: "a read-flavoured RPC still rides callDoor as transport but is
 *  NOT a governed act"). Mounted inside the Revoke dialog so the human sees
 *  what they are about to approve before confirming. */
function VendorBindingDetailView({ bindingId }: { bindingId: string }) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const { data, err, clr } = useHydratedPart(sessionTokenAccessor, (session) => getVendorBinding(session, bindingId));

  if (!data) {
    return err ? (
      <StateBanner tone="error" className="text-xs" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
        {err}
      </StateBanner>
    ) : (
      <LoadingState className="text-xs">{t("detailLoading")}</LoadingState>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border p-2 text-xs text-muted-foreground">
      <div>
        <dt>{t("detailProposedBy")}</dt>
        <dd className="font-mono text-foreground">{shortId(data.binding.created_by)}</dd>
      </div>
      <div>
        <dt>{t("detailProposedAt")}</dt>
        <dd className="text-foreground">{data.binding.created_at}</dd>
      </div>
      <div>
        <dt>{t("detailEvidence")}</dt>
        <dd className="text-foreground">{t("detailEvidenceCount", { count: data.evidence.length })}</dd>
      </div>
      <div>
        <dt>{t("detailResolutions")}</dt>
        <dd className="text-foreground">{t("detailResolutionsCount", { count: data.resolutions.length })}</dd>
      </div>
      <div className="col-span-2">
        <dt>{t("detailFingerprintHash")}</dt>
        <dd className="font-mono text-foreground">{data.binding.content_hash.slice(0, 16)}…</dd>
      </div>
    </dl>
  );
}

export function VendorBindingRowActions({
  binding,
  busy,
  canRevoke,
  act,
}: {
  binding: VendorBindingRow;
  busy: boolean;
  /** `clara.revoke_vendor_identity_binding` floors at bookkeeper — `0028:903`,
   *  which IS still the live body: no later migration defines or drops it. */
  canRevoke: boolean;
  /** CB-AE2E-004 widened this from `Promise<void>`: the caller's dialogs close only on an
   *  accepted act, and `act()` catches every refusal and RESOLVES, so the outcome has to be
   *  readable or a refusal is indistinguishable from a success. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
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
      {/* #921 [0273]: a "proposed" row (necessarily historical — the door that creates one is
          revoked) carries no action at all now, matching D6's "historical receipts" half; only
          a "live" row still offers Revoke, D6's "in-flight legacy visibility" half. */}
      {binding.status === "live" && canRevoke ? (
        <div className="flex gap-2">
          <RevokeDialog bindingId={binding.binding_id} busy={busy} act={act} />
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
  act: (fn: () => Promise<void>) => Promise<boolean>;
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
      <div className="flex flex-col gap-2">
        <VendorBindingDetailView bindingId={bindingId} />
        <div className="grid gap-1.5">
          <Label htmlFor="vb-revoke-reason">{t("reasonLabel")}</Label>
          <Textarea id="vb-revoke-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </FirmAdminDoorDialog>
  );
}
