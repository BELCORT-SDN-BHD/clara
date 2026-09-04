"use client";

// Per-row door dialogs for the fixed-asset register: complete particulars,
// revise (prospective), dispose. Each performs EXACTLY ONE governed call via
// the caller's shared `act` (the table's own useAsyncRead) — never a
// second write mechanism (AGENTS.md hard constraint 2 / the P3 house law).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/common/money-input";
import { NativeSelect } from "@/components/common/native-select";
import { FaDoorDialog } from "./FaDoorDialog";
import { FaParticularsFields, EMPTY_PARTICULARS, particularsReadyToSubmit } from "./fa-particulars-fields";
import { fmtCents } from "@/lib/registers/money";
import { completeFixedAssetParticulars, reviseFixedAssetParticulars, disposeFixedAsset } from "@/lib/registers/fixed-assets";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { FixedAssetRow, FaParticularsInput } from "@/lib/registers/fixed-assets";
import type { AccountRow } from "@/lib/registers/accounts";

type RowActionsProps = {
  clientId: string;
  asset: FixedAssetRow;
  accounts: AccountRow[];
  busy: boolean;
  /** useAsyncRead's own `act` — resolves `true`/`false` (never rejects). Each
   *  dialog below now RETURNS that boolean: FaDoorDialog's `onConfirm` contract
   *  is `() => Promise<boolean>` and it closes only on `true` (CB-AE2E-004).
   *  The reload `act` triggers is still what re-derives the register's real
   *  state; the boolean decides only whether the dialog — and the particulars
   *  the human typed into it — survives a refusal. */
  act: (fn: () => Promise<void>) => Promise<boolean>;
};

/** Complete once (COMPLETE-ONCE — the door's own law): pending/active rows
 *  that have never had a method set. */
export function CompleteParticularsDialog({ clientId, asset, busy, act }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [particulars, setParticulars] = useState<FaParticularsInput>(EMPTY_PARTICULARS);

  return (
    <FaDoorDialog
      triggerLabel={t("complete")}
      title={t("completeTitle")}
      description={t("completeDescription")}
      confirmLabel={t("complete")}
      busy={busy}
      confirmDisabled={!particularsReadyToSubmit(particulars)}
      onConfirm={() =>
        act(async () => {
          await completeFixedAssetParticulars(sessionTokenAccessor, { clientId, assetId: asset.id, particulars });
        })
      }
    >
      <FaParticularsFields idPrefix={`fa-complete-${asset.id}`} value={particulars} onChange={setParticulars} />
    </FaDoorDialog>
  );
}

/** Prospective revision: only offered on an active row that ALREADY has its
 *  particulars complete — seeded from the row's own current values so the
 *  human edits forward rather than re-typing everything. */
export function ReviseParticularsDialog({ clientId, asset, busy, act }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [particulars, setParticulars] = useState<FaParticularsInput>({
    method: (asset.method ?? "straight_line") as FaParticularsInput["method"],
    useful_life_months: asset.useful_life_months,
    rate_bps: asset.rate_bps,
    residual_cents: asset.residual_cents,
    start_date: asset.start_date ?? "",
    description: asset.description,
    ca_class: asset.ca_class,
    is_commercial_vehicle: asset.is_commercial_vehicle,
    is_new: asset.is_new,
  });

  return (
    <FaDoorDialog
      triggerLabel={t("revise")}
      title={t("reviseTitle")}
      description={t("reviseDescription")}
      confirmLabel={t("revise")}
      busy={busy}
      confirmDisabled={!effectiveFrom || !particularsReadyToSubmit(particulars)}
      onConfirm={() =>
        act(async () => {
          await reviseFixedAssetParticulars(sessionTokenAccessor, { clientId, assetId: asset.id, particulars, effectiveFrom });
        })
      }
    >
      <div className="flex flex-col gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-revise-eff-${asset.id}`}>{t("effectiveFromLabel")}</Label>
          <Input id={`fa-revise-eff-${asset.id}`} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </div>
        <FaParticularsFields idPrefix={`fa-revise-${asset.id}`} value={particulars} onChange={setParticulars} />
      </div>
    </FaDoorDialog>
  );
}

/** Dispose — one un-dead draft per asset (the door's own CLR39
 *  `disposal_draft_outstanding` wall); `asset.disposal_draft_outstanding` is
 *  the register's own PROJECTION of that same predicate (`_fa_asset_json`).
 *  F7 (independent review, fix-required, 2026-08-28): the visibility note
 *  now renders on the REGISTER ROW itself (fixed-assets-register.tsx), not
 *  inside this dialog — a human deciding whether to open Dispose at all
 *  needs to see the freeze BEFORE opening it, which is the whole reason the
 *  projection exists. The trigger stays enabled either way (constraint:
 *  never pre-hide on a client-side guess — the door is still the wall). */
export function DisposeDialog({ clientId, asset, accounts, busy, act }: RowActionsProps) {
  const t = useTranslations("FixedAssetsDepreciation.actions");
  const [disposalDate, setDisposalDate] = useState("");
  const [proceedsCents, setProceedsCents] = useState<number | null>(null);
  const [proceedsValid, setProceedsValid] = useState(true);
  const [proceedsAccount, setProceedsAccount] = useState("");
  const [gainAccount, setGainAccount] = useState("");
  const [lossAccount, setLossAccount] = useState("");
  const [memo, setMemo] = useState("");
  const [costPortionCents, setCostPortionCents] = useState<number | null>(null);
  const [costPortionValid, setCostPortionValid] = useState(true);

  const assetAccounts = accounts.filter((a) => a.account_type === "asset" && a.account_class === null && a.is_active);
  const incomeAccounts = accounts.filter((a) => a.account_type === "income" && a.account_class === null && a.is_active);
  const expenseAccounts = accounts.filter((a) => a.account_type === "expense" && a.account_class === null && a.is_active);

  return (
    <FaDoorDialog
      triggerLabel={t("dispose")}
      triggerVariant="destructive"
      title={t("disposeTitle")}
      description={t("disposeDescription")}
      confirmLabel={t("dispose")}
      busy={busy}
      confirmDisabled={!disposalDate || !gainAccount || !lossAccount || !proceedsValid || !costPortionValid}
      onConfirm={() =>
        act(async () => {
          await disposeFixedAsset(sessionTokenAccessor, {
            clientId,
            assetId: asset.id,
            disposalDate,
            proceedsCents: proceedsCents ?? 0,
            proceedsAccount: proceedsAccount || null,
            gainAccount,
            lossAccount,
            memo: memo || null,
            costPortionCents,
          });
        })
      }
    >
      <div className="flex flex-col gap-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-date-${asset.id}`}>{t("disposalDateLabel")}</Label>
            <Input id={`fa-disp-date-${asset.id}`} type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-proceeds-${asset.id}`}>{t("proceedsCentsLabel")}</Label>
            <MoneyInput
              id={`fa-disp-proceeds-${asset.id}`}
              mode="signed"
              cents={proceedsCents}
              onValueChange={(change) => {
                setProceedsValid(change.ok);
                if (change.ok) setProceedsCents(change.cents);
              }}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-proc-acct-${asset.id}`}>{t("proceedsAccountLabel")}</Label>
          <NativeSelect id={`fa-disp-proc-acct-${asset.id}`} value={proceedsAccount} onChange={(e) => setProceedsAccount(e.target.value)}>
            <option value="">—</option>
            {assetAccounts.map((a) => (
              <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-gain-${asset.id}`}>{t("gainAccountLabel")}</Label>
            <NativeSelect id={`fa-disp-gain-${asset.id}`} value={gainAccount} onChange={(e) => setGainAccount(e.target.value)}>
              <option value="">—</option>
              {incomeAccounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-disp-loss-${asset.id}`}>{t("lossAccountLabel")}</Label>
            <NativeSelect id={`fa-disp-loss-${asset.id}`} value={lossAccount} onChange={(e) => setLossAccount(e.target.value)}>
              <option value="">—</option>
              {expenseAccounts.map((a) => (
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-memo-${asset.id}`}>{t("memoLabel")}</Label>
          <Input id={`fa-disp-memo-${asset.id}`} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-disp-portion-${asset.id}`}>{t("costPortionLabel")}</Label>
          <MoneyInput
            id={`fa-disp-portion-${asset.id}`}
            mode="signed"
            cents={costPortionCents}
            onValueChange={(change) => {
              setCostPortionValid(change.ok);
              if (change.ok) setCostPortionCents(change.cents);
            }}
          />
          <p className="text-xs text-muted-foreground">{t("costPortionHint")}</p>
        </div>
        {proceedsCents !== null && (
          <p className="text-xs text-muted-foreground">{fmtCents(proceedsCents)}</p>
        )}
      </div>
    </FaDoorDialog>
  );
}
