"use client";

// The registers tab (owner ruling Q3) — a segmented control over the five
// read-only register domains that exist today (census, this build's coordinator
// ruling). URL-as-truth via ?tab=, so a register view is bookmarkable/shareable
// without adding new route segments.

import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SectionTabs } from "@/components/common/section-tabs";
import { AgingRegister } from "./aging-register";
import { FixedAssetsRegister } from "./fixed-assets-register";
import { AdjustmentsRegister } from "./adjustments-register";
import { StaffAdvancesRegister } from "./staff-advances-register";
import { ChartOfAccountsRegister } from "./chart-of-accounts-register";

const TABS = ["aging", "fixedAssets", "adjustments", "staffAdvances", "accounts"] as const;
type Tab = (typeof TABS)[number];

function isTab(v: string | null): v is Tab {
  return (TABS as readonly string[]).includes(v ?? "");
}

export function RegistersWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientRegisters");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const active: Tab = isTab(tabParam) ? tabParam : "aging";

  const setTab = (tab: Tab) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", tab);
    router.replace(`${pathname}?${qs.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* P3 polish: the muted-pill strip became the shared <SectionTabs>
          underline. The pill belongs to the client-workspace nav one rung up
          (components/client-workspace-nav.tsx) — a second rung of pills
          directly beneath it flattened the hierarchy. The tablist/tab/
          aria-selected semantics this lane already had are what the shared
          component adopted for everyone. */}
      <SectionTabs
        label={t("heading")}
        items={TABS.map((tab) => ({ value: tab, label: t(`tabs.${tab}`) }))}
        value={active}
        onSelect={setTab}
      />
      {active === "aging" ? <AgingRegister clientId={clientId} /> : null}
      {active === "fixedAssets" ? <FixedAssetsRegister clientId={clientId} /> : null}
      {active === "adjustments" ? <AdjustmentsRegister clientId={clientId} /> : null}
      {active === "staffAdvances" ? <StaffAdvancesRegister clientId={clientId} /> : null}
      {active === "accounts" ? <ChartOfAccountsRegister clientId={clientId} /> : null}
    </div>
  );
}
