"use client";

// The (cost, accumulated, expense) account-profile panel — clara.
// fa_account_profiles is read as part of clara.list_fixed_assets's own
// envelope today has no dedicated list read, so this panel derives its rows
// from the SAME accounts list a client already loaded (an active COA
// account carrying a fixed-asset role, surfaced via the accounts register's
// own read) rather than inventing a second relation read. Governed writes:
// upsert_fa_account_profile / retire_fa_account_profile.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { useHydratedPart } from "@/lib/parts/hooks";
import { upsertFaAccountProfile, retireFaAccountProfile } from "@/lib/registers/fa-account-profiles";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";
import type { FixedAssetRow } from "@/lib/registers/fixed-assets";
import type { AccountRow } from "@/lib/registers/accounts";

/** Derived, never a second read: one row per DISTINCT (asset_account,
 *  accum_account) pair any non-unwound register row currently carries — the
 *  same population `fa_register_tie`'s own walk enumerates (fixed-assets.ts's
 *  `FaTieAccountRow`), read here off the register the panel's own caller
 *  already loaded. */
function deriveProfiles(assets: FixedAssetRow[]): { assetAccount: string; accumAccount: string | null }[] {
  const seen = new Map<string, { assetAccount: string; accumAccount: string | null }>();
  for (const a of assets) {
    if (!a.asset_account || a.status === "unwound") continue;
    const key = `${a.asset_account}::${a.accum_account ?? ""}`;
    if (!seen.has(key)) seen.set(key, { assetAccount: a.asset_account, accumAccount: a.accum_account });
  }
  return [...seen.values()].sort((x, y) => x.assetAccount.localeCompare(y.assetAccount));
}

export function FaAccountProfilesPanel({ clientId, assets, accounts }: { clientId: string; assets: FixedAssetRow[]; accounts: AccountRow[] }) {
  const t = useTranslations("FixedAssetsDepreciation.profiles");
  const { err, clr, busy, act } = useHydratedPart<null>(sessionTokenAccessor, () => Promise.resolve(null));
  const profiles = deriveProfiles(assets);

  return (
    <div className="flex flex-col gap-2">
      <SectionHeader level={2} action={<UpsertDialog clientId={clientId} accounts={accounts} busy={busy} act={act} />}>
        {t("heading")}
      </SectionHeader>
      <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      {err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined} className="text-xs">
          {err}
        </StateBanner>
      ) : null}
      {profiles.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1">
          {profiles.map((p) => (
            <li key={`${p.assetAccount}:${p.accumAccount ?? ""}`} className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{p.assetAccount}</Badge>
              <span className="text-muted-foreground">→</span>
              <span>{p.accumAccount ?? "—"}</span>
              <RetireDialog clientId={clientId} assetAccount={p.assetAccount} busy={busy} act={act} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpsertDialog({
  clientId,
  accounts,
  busy,
  act,
}: {
  clientId: string;
  accounts: AccountRow[];
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FixedAssetsDepreciation.profiles");
  const [assetAccount, setAssetAccount] = useState("");
  const [accumAccount, setAccumAccount] = useState("");
  const [expenseAccount, setExpenseAccount] = useState("");
  const assetAccounts = accounts.filter((a) => a.account_type === "asset" && a.account_class === null && a.is_active);
  const expenseAccounts = accounts.filter((a) => a.account_type === "expense" && a.account_class === null && a.is_active);

  return (
    <FaDoorDialog
      triggerLabel={t("upsertTrigger")}
      title={t("upsertTitle")}
      description={t("upsertDescription")}
      confirmLabel={t("upsertTrigger")}
      busy={busy}
      confirmDisabled={!assetAccount}
      onConfirm={() =>
        act(async () => {
          await upsertFaAccountProfile(sessionTokenAccessor, {
            clientId,
            assetAccount,
            accumAccount: accumAccount || null,
            expenseAccount: expenseAccount || null,
          });
        })
      }
    >
      <div className="flex flex-col gap-2">
        <NativeSelect aria-label={t("assetAccountLabel")} value={assetAccount} onChange={(e) => setAssetAccount(e.target.value)}>
          <option value="">{t("assetAccountLabel")}</option>
          {assetAccounts.map((a) => (
            <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label={t("accumAccountLabel")} value={accumAccount} onChange={(e) => setAccumAccount(e.target.value)}>
          <option value="">{t("accumAccountLabel")}</option>
          {assetAccounts.map((a) => (
            <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label={t("expenseAccountLabel")} value={expenseAccount} onChange={(e) => setExpenseAccount(e.target.value)}>
          <option value="">{t("expenseAccountLabel")}</option>
          {expenseAccounts.map((a) => (
            <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.name}</option>
          ))}
        </NativeSelect>
      </div>
    </FaDoorDialog>
  );
}

function RetireDialog({
  clientId,
  assetAccount,
  busy,
  act,
}: {
  clientId: string;
  assetAccount: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("FixedAssetsDepreciation.profiles");
  return (
    <FaDoorDialog
      triggerLabel={t("retireTrigger")}
      title={t("retireTitle")}
      description={t("retireDescription")}
      confirmLabel={t("retireTrigger")}
      busy={busy}
      onConfirm={() => act(async () => { await retireFaAccountProfile(sessionTokenAccessor, { clientId, assetAccount }); })}
    />
  );
}
