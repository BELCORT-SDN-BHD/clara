"use client";

// The propose/sign/revoke vendor-identity-binding ceremony body — split out
// of vendor-bindings-panel.tsx (file-size discipline, the house convention
// components/registers/fa-authority-ceremony.tsx's own header names, itself
// the propose/sign/retire pattern this ceremony mirrors). A RANK-gated
// governed act: propose/revoke are bookkeeper+, sign is ADMIN+
// (lib/firm-admin/vendor-bindings.ts's own header). RE-TRUED (裁-18a,
// mohe-grill-rulings, 2026-08-28, pre-beta hardening batch): the live
// `sign_vendor_identity_binding` body NOW reads `created_by` and refuses
// when the signer is the same person who proposed the binding — a PERSON
// separation on top of the RANK floor, not merely rank-gated. STRICT: no
// relaxation for a single-admin firm; the refusal names both lawful ways out
// in the OWNER'S OWN RULED WORDS (裁-18c: "let Clara propose it, or add a
// second admin" — independent review, 2026-08-29). This component
// NARROWED, 2026-09-04 (E-7 / CB-AE2E-014 / CB-AE2E-033, 裁-190): the RANK half
// of each floor IS now gated client-side, because the caller's rank is
// positively read and a control the rank cannot use is no longer rendered — see
// lib/firm/capabilities.ts. What follows still holds for the PERSON half, which
// no client-side read can decide. This file
// still adds no client-side proposer≠signer gate — the DB's own wall is the
// wall, matching the estate's standing convention (a DoorRefusal renders
// verbatim, never pre-guessed client-side). The Sign trigger is NEVER
// pre-hidden on a client-side role OR identity guess; every viewer sees it,
// and a caller who clicks it gets the DB's own CLR04 refusal, verbatim —
// whether that refusal is the rank floor or the signer≠proposer wall.
//
// F2 (independent review, fix-required, 2026-08-28): `get_vendor_binding` had
// zero production consumers — a consent must show what it approves. Both the
// Sign and Revoke dialogs now mount `VendorBindingDetailView`, a READ
// (labelled as such at this call site — it rides `callDoor` as transport but
// is NOT a governed act, AGENTS.md's own rule) showing who proposed the
// binding, when, the evidence/resolution counts and the content fingerprint.
// A failed detail read renders its OWN error INSIDE the dialog and never
// disables or hides Sign/Revoke — the DB's own doors are the wall, not this
// read.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart, type PartHydrationState } from "@/lib/parts/hooks";
import { FirmAdminDoorDialog } from "./FirmAdminDoorDialog";
import {
  proposeVendorIdentityBinding,
  signVendorIdentityBinding,
  revokeVendorIdentityBinding,
  getVendorBinding,
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

/** F2's own read — a plain data-fetch labelled as a read at this call site
 *  (AGENTS.md: "a read-flavoured RPC still rides callDoor as transport but is
 *  NOT a governed act"). Mounted inside the Sign/Revoke dialogs so the human
 *  sees what they are about to approve before confirming. */
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
  canSign,
  canRevoke,
  act,
}: {
  binding: VendorBindingRow;
  busy: boolean;
  /** E-7 (裁-190): `clara.sign_vendor_identity_binding` floors at ADMIN
   *  (`0028_vendor_identity_binding.sql:809`). Below that rank the trigger is
   *  ABSENT — this file's header used to argue the opposite, and that argument
   *  is now narrowed, not deleted: the RANK is derivable from the caller
   *  context and is gated here, while the PERSON wall (signer ≠ proposer,
   *  裁-18a) is NOT derivable client-side and is still left entirely to the
   *  door, which refuses CLR04 with `reason=signer_is_proposer` verbatim. */
  canSign: boolean;
  /** `clara.revoke_vendor_identity_binding` floors at bookkeeper (`0028:903`). */
  canRevoke: boolean;
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
          {binding.status === "proposed" && canSign ? (
            <FirmAdminDoorDialog
              triggerLabel={t("signTrigger")}
              title={t("signTitle")}
              description={t("signDescription")}
              confirmLabel={t("signTrigger")}
              busy={busy}
              onConfirm={() => act(async () => { await signVendorIdentityBinding(sessionTokenAccessor, binding.binding_id); })}
            >
              <VendorBindingDetailView bindingId={binding.binding_id} />
            </FirmAdminDoorDialog>
          ) : null}
          {binding.status === "live" && canRevoke ? (
            <RevokeDialog bindingId={binding.binding_id} busy={busy} act={act} />
          ) : null}
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

/** F3(b) (independent review, fix-required, 2026-08-28): before this fix, the
 *  Propose trigger vanished whenever the counterparties read failed —
 *  indistinguishable from "not allowed to propose", which the DB never said.
 *  The trigger is now ALWAYS rendered; the caller passes the FULL
 *  counterparties `useHydratedPart` state, so a failed read shows its own
 *  verbatim error + a retry INSIDE the dialog body instead of a silently
 *  empty picker. */
export function ProposeBindingDialog({
  clientId,
  counterpartiesState,
  busy,
  act,
}: {
  clientId: string;
  counterpartiesState: PartHydrationState<VendorCounterpartyRow[]>;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const tc = useTranslations("Common");
  const [counterpartyId, setCounterpartyId] = useState("");
  const counterparties = counterpartiesState.data;

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
      {!counterparties ? (
        counterpartiesState.err ? (
          <div className="flex flex-col gap-2">
            <StateBanner
              tone="error"
              className="text-xs"
              code={counterpartiesState.clr ? `${counterpartiesState.clr.code}${counterpartiesState.clr.reason ? ` · ${counterpartiesState.clr.reason}` : ""}` : undefined}
            >
              {counterpartiesState.err}
            </StateBanner>
            <Button type="button" size="sm" variant="outline" onClick={() => void counterpartiesState.reload()}>
              {tc("retry")}
            </Button>
          </div>
        ) : (
          <LoadingState className="text-xs">{t("counterpartiesLoading")}</LoadingState>
        )
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="vb-propose-counterparty">{t("counterpartyLabel")}</Label>
          <NativeSelect id="vb-propose-counterparty" value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">{counterparties.length > 0 ? t("counterpartyPlaceholder") : t("counterpartyNoneYet")}</option>
            {counterparties.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
    </FirmAdminDoorDialog>
  );
}
