"use client";

// The (cost, accumulated, expense) account-profile panel — clara.
// fa_account_profiles read directly (F2/F3 fix, independent review: this
// relation is genuinely SELECT-granted to clara_authenticated, the Q3
// read-the-tables mechanism lib/registers/accounts.ts already uses for
// coa_accounts — never derived from the register's own asset rows, which
// went dark on an enrol with no register row yet and produced phantom
// Retire triggers on disposed/superseded rows). Governed writes:
// upsert_fa_account_profile / retire_fa_account_profile; `act()` re-reads
// this SAME relation after every one.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadFaAccountProfiles, upsertFaAccountProfile, retireFaAccountProfile } from "@/lib/registers/fa-account-profiles";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";
import type { AccountRow } from "@/lib/registers/accounts";

export function FaAccountProfilesPanel({ clientId, accounts }: { clientId: string; accounts: AccountRow[] }) {
  const t = useTranslations("FixedAssetsDepreciation.profiles");
  const { data: profiles, err, clr, busy, act } = useHydratedPart(sessionTokenAccessor, (s) => loadFaAccountProfiles(s, clientId));

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
      {!profiles || profiles.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1">
          {profiles.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{p.asset_account_code}</Badge>
              <span className="text-muted-foreground">→</span>
              <span>{p.accum_depr_account_code ?? "—"}</span>
              <RetireDialog clientId={clientId} assetAccount={p.asset_account_code} busy={busy} act={act} />
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
