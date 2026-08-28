"use client";

// seed_fixed_asset — bookkeeper+. THE OPENING ACT that seams into T3's
// fixed-asset register (lib/registers/fixed-assets.ts): the row this mints
// reads through list_fixed_assets at status "pending" immediately and flips
// to "active" the moment approve_opening_seed finalizes this batch. Field set
// and validation hints mirror `clara._draft_opening_item_core`'s
// `v_kind='fixed_asset'` branch (lib/registers/opening-item-doors.ts's own
// grounding) — the door is still the wall; this dialog only avoids sending an
// obviously-incomplete baseline.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { CentsInput } from "./staff-advance-money-input";
import { OpeningDoorDialog } from "./OpeningDoorDialog";
import { seedFixedAsset } from "@/lib/registers/opening-item-doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { OpeningFixedAssetInput } from "@/lib/registers/opening-types";
import type { OpeningSeedRow } from "@/lib/registers/opening-types";
import type { AccountRow } from "@/lib/registers/accounts";

const EMPTY: OpeningFixedAssetInput = {
  item_key: "",
  description: "",
  acquired_date: "",
  cost_cents: 0,
  accumulated_depreciation_cents: 0,
  residual_cents: 0,
  useful_life_months: null,
  depreciation_method: "straight_line",
  depreciation_rate_bps: null,
  depreciation_start_date: "",
  asset_account_code: "",
  accum_depr_account_code: "",
  depr_expense_account_code: "",
};

function readyToSubmit(a: OpeningFixedAssetInput): boolean {
  if (!a.item_key.trim() || !a.description.trim() || !a.acquired_date || !a.depreciation_start_date) return false;
  if (!a.cost_cents || a.cost_cents <= 0) return false;
  if (!a.asset_account_code) return false;
  if (a.depreciation_method === "straight_line" && !(a.useful_life_months && a.useful_life_months > 0)) return false;
  if (a.depreciation_method === "reducing_balance" && !(a.useful_life_months && a.useful_life_months > 0 && a.depreciation_rate_bps && a.depreciation_rate_bps >= 1 && a.depreciation_rate_bps <= 10000)) return false;
  if (a.depreciation_method !== "none" && (!a.accum_depr_account_code || !a.depr_expense_account_code)) return false;
  return true;
}

export function OpeningFixedAssetDialog({
  clientId,
  seed,
  accounts,
  keyedResolutionId,
  busy,
  act,
}: {
  clientId: string;
  seed: OpeningSeedRow;
  accounts: AccountRow[];
  /** opening.ts's `loadOpeningKeyedResolution` — see opening-items-panel.tsx's
   *  own doc comment on the same prop for why an untied seed needs it. */
  keyedResolutionId: string | null;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown.fixedAsset");
  const [a, setA] = useState<OpeningFixedAssetInput>(EMPTY);
  const untiedAndUnresolved = !seed.tie_document_id && !keyedResolutionId;
  const assetAccounts = accounts.filter((x) => x.is_active && x.account_type === "asset" && x.account_class === null);
  const expenseAccounts = accounts.filter((x) => x.is_active && x.account_type === "expense" && x.account_class === null);

  function patch(p: Partial<OpeningFixedAssetInput>) {
    setA((prev) => ({ ...prev, ...p }));
  }

  return (
    <OpeningDoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("trigger")}
      busy={busy}
      confirmDisabled={!readyToSubmit(a) || untiedAndUnresolved}
      onConfirm={async () => {
        await act(async () => {
          await seedFixedAsset(sessionTokenAccessor, {
            client: clientId,
            seed: seed.id,
            asset: a,
            resolution: seed.tie_document_id ? null : keyedResolutionId,
          });
        });
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-key">{t("itemKeyLabel")}</Label>
            <Input id="opening-fa-key" value={a.item_key} onChange={(e) => patch({ item_key: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-desc">{t("descriptionLabel")}</Label>
            <Input id="opening-fa-desc" value={a.description} onChange={(e) => patch({ description: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-acquired">{t("acquiredDateLabel")}</Label>
            <Input id="opening-fa-acquired" type="date" value={a.acquired_date} onChange={(e) => patch({ acquired_date: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-cost">{t("costLabel")}</Label>
            <CentsInput ariaLabel={t("costLabel")} cents={a.cost_cents} onChange={(cost_cents) => patch({ cost_cents })} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-accum">{t("accumulatedLabel")}</Label>
            <CentsInput ariaLabel={t("accumulatedLabel")} cents={a.accumulated_depreciation_cents ?? 0} onChange={(v) => patch({ accumulated_depreciation_cents: v })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="opening-fa-residual">{t("residualLabel")}</Label>
            <CentsInput ariaLabel={t("residualLabel")} cents={a.residual_cents ?? 0} onChange={(v) => patch({ residual_cents: v })} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opening-fa-method">{t("methodLabel")}</Label>
          <NativeSelect id="opening-fa-method" value={a.depreciation_method} onChange={(e) => patch({ depreciation_method: e.target.value as OpeningFixedAssetInput["depreciation_method"] })}>
            <option value="straight_line">{t("methods.straight_line")}</option>
            <option value="reducing_balance">{t("methods.reducing_balance")}</option>
            <option value="none">{t("methods.none")}</option>
          </NativeSelect>
        </div>
        {a.depreciation_method !== "none" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="opening-fa-life">{t("usefulLifeLabel")}</Label>
              <Input id="opening-fa-life" type="number" min="1" value={a.useful_life_months ?? ""} onChange={(e) => patch({ useful_life_months: e.target.value ? Number(e.target.value) : null })} />
            </div>
            {a.depreciation_method === "reducing_balance" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="opening-fa-rate">{t("rateBpsLabel")}</Label>
                <Input id="opening-fa-rate" type="number" min="1" max="10000" value={a.depreciation_rate_bps ?? ""} onChange={(e) => patch({ depreciation_rate_bps: e.target.value ? Number(e.target.value) : null })} />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="opening-fa-start">{t("startDateLabel")}</Label>
          <Input id="opening-fa-start" type="date" value={a.depreciation_start_date} onChange={(e) => patch({ depreciation_start_date: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="opening-fa-asset-acct">{t("assetAccountLabel")}</Label>
          <NativeSelect id="opening-fa-asset-acct" value={a.asset_account_code} onChange={(e) => patch({ asset_account_code: e.target.value })}>
            <option value="">—</option>
            {assetAccounts.map((x) => (
              <option key={x.account_code} value={x.account_code}>{x.account_code} — {x.name}</option>
            ))}
          </NativeSelect>
        </div>
        {a.depreciation_method !== "none" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="opening-fa-accum-acct">{t("accumAccountLabel")}</Label>
              <NativeSelect id="opening-fa-accum-acct" value={a.accum_depr_account_code ?? ""} onChange={(e) => patch({ accum_depr_account_code: e.target.value || null })}>
                <option value="">—</option>
                {assetAccounts.map((x) => (
                  <option key={x.account_code} value={x.account_code}>{x.account_code} — {x.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="opening-fa-expense-acct">{t("expenseAccountLabel")}</Label>
              <NativeSelect id="opening-fa-expense-acct" value={a.depr_expense_account_code ?? ""} onChange={(e) => patch({ depr_expense_account_code: e.target.value || null })}>
                <option value="">—</option>
                {expenseAccounts.map((x) => (
                  <option key={x.account_code} value={x.account_code}>{x.account_code} — {x.name}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
        ) : null}
        {untiedAndUnresolved ? <p className="text-xs text-warning">{t("keyedResolutionRequired")}</p> : null}
      </div>
    </OpeningDoorDialog>
  );
}
