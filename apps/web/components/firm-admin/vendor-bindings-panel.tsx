"use client";

// The vendor identity bindings governance panel, under /admin (port-wave plan
// §4 T10, §5's door-dialogs row). Every one of the five vendor-binding doors
// is CLIENT-scoped (lib/firm-admin/vendor-bindings.ts's own header) — there is
// no firm-wide vendor-bindings read, so this panel carries its own client
// picker (loadClientRegister, unchanged) rather than assuming a cross-client
// listing the DB does not offer.

import { useState } from "react";
import { useTranslations } from "next-intl";

import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { SectionHeader } from "@/components/common/section-header";
import { Label } from "@/components/ui/label";
import { useHydratedPart } from "@/lib/parts/hooks";
import { useFirmScope } from "@/components/firm-scope-provider";
import { firmCapabilities, type FirmCapabilities } from "@/lib/firm/capabilities";
import { loadClientRegister } from "@/lib/firm/reads";
import { listVendorBindings, loadVendorCounterparties } from "@/lib/firm-admin/vendor-bindings";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { VendorBindingRowActions, ProposeBindingDialog } from "./vendor-binding-ceremony";

// E-7 (裁-187): the capabilities come from the FIRM LAYOUT's own positively-read
// caller context, handed down by `FirmScopeProvider` — no second read of
// `clara.caller_context` is issued for this. `firmCapabilities` denies on a NULL
// `role_rank`, which is the fail-closed reading the ruling asks for.

export function VendorBindingsPanel() {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const capabilities = firmCapabilities(useFirmScope());
  const clientsState = useHydratedPart(sessionTokenAccessor, (session) => loadClientRegister(session));
  const [clientId, setClientId] = useState<string>("");

  return (
    <div className="flex flex-col gap-3">
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="vb-client-picker">{t("clientPickerLabel")}</Label>
        {!clientsState.data ? (
          clientsState.err ? (
            <StateBanner tone="error">{clientsState.err}</StateBanner>
          ) : (
            <LoadingState>{t("clientPickerLoading")}</LoadingState>
          )
        ) : (
          <NativeSelect id="vb-client-picker" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">{t("clientPickerPlaceholder")}</option>
            {clientsState.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {clientId ? (
        <ClientVendorBindings key={clientId} clientId={clientId} capabilities={capabilities} />
      ) : (
        <EmptyState>{t("noClientSelected")}</EmptyState>
      )}
    </div>
  );
}

function ClientVendorBindings({
  clientId,
  capabilities,
}: {
  clientId: string;
  capabilities: FirmCapabilities;
}) {
  const t = useTranslations("FirmAdminCompliance.vendorBindings");
  const { data: bindings, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (session) => listVendorBindings(session, clientId));
  const counterpartiesState = useHydratedPart(sessionTokenAccessor, (session) => loadVendorCounterparties(session, clientId));

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader
        level={2}
        // F3(b) (independent review, fix-required, 2026-08-28): the trigger
        // is ALWAYS rendered now — see ProposeBindingDialog's own header for
        // why passing the FULL counterparties state (not just `.data`) is
        // what lets it show a real read failure + retry instead of vanishing.
        // E-7 (裁-187): `clara.propose_vendor_identity_binding` floors at
        // bookkeeper (`0154_binding_proposal_pr_1.sql:2506`). A viewer, and a
        // caller whose rank could not be read, get no trigger at all.
        action={
          capabilities.canProposeVendorBinding ? (
            <ProposeBindingDialog clientId={clientId} counterpartiesState={counterpartiesState} busy={busy} act={act} />
          ) : null
        }
      >
        {t("heading")}
      </SectionHeader>
      {!bindings ? (
        err ? (
          <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
            {err}
          </StateBanner>
        ) : (
          <LoadingState>{t("loading")}</LoadingState>
        )
      ) : bindings.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <>
          {err ? (
            <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
              {err}
            </StateBanner>
          ) : null}
          <ul className="flex flex-col rounded-lg border border-border">
            {bindings.map((b) => (
              <VendorBindingRowActions
                key={b.binding_id}
                binding={b}
                busy={busy}
                canSign={capabilities.canSignVendorBinding}
                canRevoke={capabilities.canRevokeVendorBinding}
                act={act}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
