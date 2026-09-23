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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { MoneyInput } from "@/components/common/money-input";
import { useHydratedPart } from "@/lib/parts/hooks";
import { loadFaAccountProfiles, upsertFaAccountProfile, retireFaAccountProfile } from "@/lib/registers/fa-account-profiles";
import {
  loadFaDepreciationPolicies, setFaDepreciationPolicy, retireFaDepreciationPolicy,
  type FaDepreciationMethod, type FaDepreciationPolicyRow,
} from "@/lib/registers/fa-depreciation-policies";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { FaDoorDialog } from "./FaDoorDialog";
import type { AccountRow } from "@/lib/registers/accounts";

const POLICY_METHODS: readonly FaDepreciationMethod[] = ["straight_line", "reducing_balance", "none"];

export function FaAccountProfilesPanel({
  clientId,
  accounts,
  onActed,
}: {
  clientId: string;
  accounts: AccountRow[];
  /** Fired on every SETTLED enrol/retire (sweep addendum item 2). Enrolling or
   *  retiring an account changes the UNIVERSE `clara.fa_register_tie` walks
   *  (`fa_account_profiles WHERE active UNION fixed_assets`, 0041:4276-4283), so the
   *  tie banner beside this panel is stale the moment either succeeds — and it owns
   *  its own read, which this panel's `act()` cannot reach. */
  onActed?: () => void;
}) {
  const t = useTranslations("FixedAssetsDepreciation.profiles");
  const tp = useTranslations("FixedAssetsDepreciation.policies");
  const { data: profiles, loading, err, clr, busy, act: rawAct } = useHydratedPart(sessionTokenAccessor, (s) => loadFaAccountProfiles(s, clientId));
  const {
    data: policies, busy: policyBusy, err: policyErr, clr: policyClr, act: rawPolicyAct,
  } = useHydratedPart(sessionTokenAccessor, (s) => loadFaDepreciationPolicies(s, clientId));
  const act = async (fn: () => Promise<void>): Promise<boolean> => {
    const ok = await rawAct(fn);
    onActed?.();
    return ok;
  };
  // #932: the policy panel's OWN act — a policy set/retire never changes fa_account_profiles or
  // the register's own display columns the enrolment `onActed` refresh exists for, so it does
  // not fire that callback; it only re-hydrates ITS OWN read.
  const policyAct = (fn: () => Promise<void>): Promise<boolean> => rawPolicyAct(fn);
  const policyFor = (assetAccount: string): FaDepreciationPolicyRow | undefined =>
    policies?.find((p) => p.asset_account_code === assetAccount);

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
      {/* N1 (mechanical sweep, 2026-08-28): `loading` gates the empty claim —
          without it, "no profiles enrolled" could paint while the first read
          is still in flight (or had already failed), which is the SAME
          false-absence shape review law 2 exists to catch. */}
      {loading ? null : !profiles || profiles.length === 0 ? (
        <EmptyState className="text-xs">{t("empty")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {profiles.map((p) => {
            const policy = policyFor(p.asset_account_code);
            return (
              <li key={p.id} className="flex flex-col gap-1 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="secondary">{p.asset_account_code}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span>{p.accum_depr_account_code ?? "—"}</span>
                  <RetireDialog clientId={clientId} assetAccount={p.asset_account_code} busy={busy} act={act} />
                </div>
                {/* #932 — the "default depreciation policy" block per enrolled account (AC1). */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{tp("heading")}:</span>
                  {policy ? (
                    <>
                      <Badge variant="outline">{tp(`methods.${policy.method}`)}</Badge>
                      {policy.method !== "none" ? (
                        <span className="text-muted-foreground">
                          {policy.method === "reducing_balance"
                            ? tp("summaryRb", { life: policy.useful_life_months ?? 0, rate: (policy.rate_bps ?? 0) / 100 })
                            : tp("summarySl", { life: policy.useful_life_months ?? 0 })}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">{tp("versionLabel", { version: policy.version })}</span>
                      <RetirePolicyDialog clientId={clientId} assetAccount={p.asset_account_code} busy={policyBusy} act={policyAct} />
                      <SetPolicyDialog clientId={clientId} assetAccount={p.asset_account_code} nonDepreciable={p.accum_depr_account_code === null} busy={policyBusy} act={policyAct} triggerLabel={tp("changeTrigger")} />
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">{tp("none")}</span>
                      <SetPolicyDialog clientId={clientId} assetAccount={p.asset_account_code} nonDepreciable={p.accum_depr_account_code === null} busy={policyBusy} act={policyAct} triggerLabel={tp("setTrigger")} />
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {policyErr ? (
        <StateBanner tone="error" code={policyClr ? `${policyClr.code}${policyClr.reason ? ` · ${policyClr.reason}` : ""}` : undefined} className="text-xs">
          {policyErr}
        </StateBanner>
      ) : null}
    </div>
  );
}

function SetPolicyDialog({
  clientId,
  assetAccount,
  nonDepreciable,
  busy,
  act,
  triggerLabel,
}: {
  clientId: string;
  assetAccount: string;
  /** AC1 / the door's own wall: an enrolment with no accumulated-depreciation account admits
   *  ONLY method none — offered before the door refuses one, the same discipline the
   *  particulars form already gives (fa-particulars-fields.tsx's own non_depreciable note). */
  nonDepreciable: boolean;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
  triggerLabel: string;
}) {
  const tp = useTranslations("FixedAssetsDepreciation.policies");
  const [method, setMethod] = useState<FaDepreciationMethod>(nonDepreciable ? "none" : "straight_line");
  const [life, setLife] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [residualCents, setResidualCents] = useState<number | null>(0);
  const [reason, setReason] = useState("");

  const ready =
    method === "none" ? true
      : method === "straight_line" ? life != null && life > 0
      : life != null && life > 0 && rate != null && rate >= 1 && rate <= 10000;

  return (
    <FaDoorDialog
      triggerLabel={triggerLabel}
      title={tp("setTitle")}
      description={tp("setDescription")}
      confirmLabel={triggerLabel}
      busy={busy}
      confirmDisabled={!ready}
      onConfirm={() =>
        act(async () => {
          await setFaDepreciationPolicy(sessionTokenAccessor, {
            clientId,
            assetAccount,
            method,
            usefulLifeMonths: method === "none" ? null : life,
            rateBps: method === "reducing_balance" ? rate : null,
            residualCents: method === "none" ? 0 : (residualCents ?? 0),
            reason: reason.trim() === "" ? null : reason.trim(),
          });
        })
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`fa-policy-method-${assetAccount}`}>{tp("methodLabel")}</Label>
          <NativeSelect
            id={`fa-policy-method-${assetAccount}`}
            value={method}
            onChange={(e) => {
              const next = e.target.value as FaDepreciationMethod;
              setMethod(next);
              if (next === "none") { setLife(null); setRate(null); }
              if (next !== "reducing_balance") setRate(null);
            }}
          >
            {POLICY_METHODS.filter((m) => !nonDepreciable || m === "none").map((m) => (
              <option key={m} value={m}>{tp(`methods.${m}`)}</option>
            ))}
          </NativeSelect>
        </div>
        {method !== "none" ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-policy-life-${assetAccount}`}>{tp("usefulLifeLabel")}</Label>
            <Input
              id={`fa-policy-life-${assetAccount}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={life ?? ""}
              onChange={(e) => setLife(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        ) : null}
        {method === "reducing_balance" ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-policy-rate-${assetAccount}`}>{tp("rateBpsLabel")}</Label>
            <Input
              id={`fa-policy-rate-${assetAccount}`}
              type="number"
              min={1}
              max={10000}
              inputMode="numeric"
              value={rate ?? ""}
              onChange={(e) => setRate(e.target.value === "" ? null : Number(e.target.value))}
            />
          </div>
        ) : null}
        {method !== "none" ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`fa-policy-residual-${assetAccount}`}>{tp("residualLabel")}</Label>
            <MoneyInput
              id={`fa-policy-residual-${assetAccount}`}
              cents={residualCents}
              mode="unsigned"
              zeroIsBlank={false}
              onValueChange={(change) => {
                if (change.ok) setResidualCents(change.cents);
              }}
            />
          </div>
        ) : null}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`fa-policy-reason-${assetAccount}`}>{tp("reasonLabel")}</Label>
          <Input id={`fa-policy-reason-${assetAccount}`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </div>
    </FaDoorDialog>
  );
}

function RetirePolicyDialog({
  clientId,
  assetAccount,
  busy,
  act,
}: {
  clientId: string;
  assetAccount: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const tp = useTranslations("FixedAssetsDepreciation.policies");
  return (
    <FaDoorDialog
      triggerLabel={tp("retireTrigger")}
      title={tp("retireTitle")}
      description={tp("retireDescription")}
      confirmLabel={tp("retireTrigger")}
      busy={busy}
      onConfirm={() => act(async () => { await retireFaDepreciationPolicy(sessionTokenAccessor, { clientId, assetAccount }); })}
    />
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
  act: (fn: () => Promise<void>) => Promise<boolean>;
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
  act: (fn: () => Promise<void>) => Promise<boolean>;
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
