"use client";

// The particulars form fields shared by complete_fixed_asset_particulars,
// revise_fixed_asset_particulars, and the needs-you inline
// `fixed_asset_incomplete` affordance — the EXACT closed key set
// `clara._fa_validate_particulars` accepts (lib/registers/fixed-assets.ts's
// `FaParticularsInput`). A pure controlled-fields component: the caller owns
// the `FaParticularsInput` state and passes it down whole, so complete/
// revise/the inline affordance share one field layout without sharing a
// dialog shell (each of those is a genuinely different door).

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import type { FaParticularsInput } from "@/lib/registers/fixed-assets";

const METHODS = ["straight_line", "reducing_balance", "none"] as const;

export function FaParticularsFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string;
  value: FaParticularsInput;
  onChange: (next: FaParticularsInput) => void;
}) {
  const t = useTranslations("FixedAssetsDepreciation.particulars");

  const patch = (p: Partial<FaParticularsInput>) => onChange({ ...value, ...p });

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-method`}>{t("methodLabel")}</Label>
        <NativeSelect
          id={`${idPrefix}-method`}
          value={value.method}
          onChange={(e) => {
            const method = e.target.value as FaParticularsInput["method"];
            // Method drives which drivers are admitted (the door's own CLR37
            // `axis:"drivers"` refusal) — clearing the inapplicable ones here
            // means the confirm click never carries a stale life/rate the new
            // method would refuse.
            patch({
              method,
              useful_life_months: method === "none" ? null : value.useful_life_months,
              rate_bps: method === "reducing_balance" ? value.rate_bps : null,
            });
          }}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`methods.${m}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-start`}>{t("startDateLabel")}</Label>
        <Input
          id={`${idPrefix}-start`}
          type="date"
          value={value.start_date}
          onChange={(e) => patch({ start_date: e.target.value })}
        />
      </div>
      {value.method !== "none" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-life`}>{t("usefulLifeLabel")}</Label>
          <Input
            id={`${idPrefix}-life`}
            type="number"
            min={1}
            inputMode="numeric"
            value={value.useful_life_months ?? ""}
            onChange={(e) => patch({ useful_life_months: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      ) : null}
      {value.method === "reducing_balance" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-rate`}>{t("rateBpsLabel")}</Label>
          <Input
            id={`${idPrefix}-rate`}
            type="number"
            min={1}
            max={10000}
            inputMode="numeric"
            value={value.rate_bps ?? ""}
            onChange={(e) => patch({ rate_bps: e.target.value === "" ? null : Number(e.target.value) })}
          />
        </div>
      ) : null}
      {value.method !== "none" ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-residual`}>{t("residualLabel")}</Label>
          <Input
            id={`${idPrefix}-residual`}
            inputMode="decimal"
            placeholder="0.00"
            value={value.residual_cents != null ? (value.residual_cents / 100).toFixed(2) : ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              patch({ residual_cents: e.target.value === "" || !Number.isFinite(n) ? null : Math.round(n * 100) });
            }}
          />
        </div>
      ) : null}
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-desc`}>{t("descriptionLabel")}</Label>
        <Input
          id={`${idPrefix}-desc`}
          value={value.description ?? ""}
          onChange={(e) => patch({ description: e.target.value === "" ? null : e.target.value })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-caclass`}>{t("caClassLabel")}</Label>
        <Input
          id={`${idPrefix}-caclass`}
          value={value.ca_class ?? ""}
          onChange={(e) => patch({ ca_class: e.target.value === "" ? null : e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.is_commercial_vehicle ?? false}
          onChange={(e) => patch({ is_commercial_vehicle: e.target.checked })}
        />
        {t("commercialVehicleLabel")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value.is_new ?? false} onChange={(e) => patch({ is_new: e.target.checked })} />
        {t("isNewLabel")}
      </label>
    </div>
  );
}

/** The empty starting value every complete/revise/inline-affordance form
 *  seeds from — `method`/`start_date` are the door's own two ALWAYS-required
 *  fields (`_fa_validate_particulars`: every method needs a start_date, even
 *  `none`). */
export const EMPTY_PARTICULARS: FaParticularsInput = {
  method: "straight_line",
  useful_life_months: null,
  rate_bps: null,
  residual_cents: null,
  start_date: "",
  description: null,
  ca_class: null,
  is_commercial_vehicle: null,
  is_new: null,
};

/** Client-side completeness gate for the CONFIRM button — a convenience, not
 *  a wall (the door itself is the wall and re-validates everything). Mirrors
 *  `_fa_validate_particulars`'s own required-field shape so a human is not
 *  sent to a CLR37 refusal for an empty date field alone. */
export function particularsReadyToSubmit(v: FaParticularsInput): boolean {
  if (!v.start_date) return false;
  if (v.method === "straight_line") return v.useful_life_months != null && v.useful_life_months > 0;
  if (v.method === "reducing_balance") {
    return v.useful_life_months != null && v.useful_life_months > 0 && v.rate_bps != null && v.rate_bps >= 1 && v.rate_bps <= 10000;
  }
  return true; // method === "none"
}
