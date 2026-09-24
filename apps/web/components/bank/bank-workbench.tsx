"use client";

// The /bank tab's own six-way sub-nav: accounts · statements · matching ·
// exceptions · reconciliation · agency.
//
// #657 (D14): URL-AS-TRUTH, for all six. This strip used to be in-page `useState`, whose own
// comment called that "a deliberate simplification for this pass" — so a reload, a shared link
// or a Back press could not reach the Matching tab at all, and a human who had spent five
// minutes assembling a match lost the tab on any refresh. The pattern copied here is the
// house's, verbatim: `components/registers/registers-workbench.tsx:28-47` — a `TABS` tuple, an
// `isTab` guard, `useSearchParams`, and `router.replace(pathname + "?" + qs)`.
//
// TWO CONSEQUENCES, both deliberate:
//   * `router.replace` creates NO history entry, which is the house's existing behaviour on the
//     registers workbench. Reload-stability is what a walk asserts; Back returns to the
//     PREVIOUS PAGE rather than stepping backwards through tabs, and that is the right answer
//     for a sub-nav — a tab is a view of one page, not a place.
//   * `?line=` addresses the Matching tab's DETAIL pane, so a specific bank line is linkable.
//     A multi-SELECTION does not go in the URL: a selection set is a DRAFT, not an address, and
//     putting it there would make an unsubmitted decision look like a shareable fact.
//
// No `lib/navigation/tree.ts` row is added: `/bank` is still ONE route
// (`{ id: "bank", segment: "bank", … }`), and `?tab=` is a query, not a segment.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SectionTabs } from "@/components/common/section-tabs";
import { AccountsSection } from "./accounts-section";
import { StatementsSection } from "./statements-section";
import { MatchingSection } from "./matching-section";
import { PayrollSettlementsSection } from "./payroll-settlements-section";
import { RentSettlementsSection } from "./rent-settlements-section";
import { ExceptionsSection } from "./exceptions-section";
import { ReconciliationSection } from "./reconciliation-section";
import { AgencySection } from "./agency-section";

const TABS = ["accounts", "statements", "matching", "exceptions", "reconciliation", "agency"] as const;
type BankTab = (typeof TABS)[number];

function isTab(v: string | null): v is BankTab {
  return (TABS as readonly string[]).includes(v ?? "");
}

export function BankWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientBank.tabs");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: BankTab = isTab(tabParam) ? tabParam : "accounts";
  const lineParam = searchParams.get("line");

  const setTab = (next: BankTab) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", next);
    // Leaving Matching drops the line address with it: `?line=` names a row on THIS tab, and a
    // stale line id riding along to Reconciliation would be a fact about nothing.
    if (next !== "matching") qs.delete("line");
    router.replace(`${pathname}?${qs.toString()}`);
  };

  const setLine = (next: string | null) => {
    const qs = new URLSearchParams(searchParams.toString());
    qs.set("tab", "matching");
    if (next) qs.set("line", next);
    else qs.delete("line");
    router.replace(`${pathname}?${qs.toString()}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* P3 polish: the filled-primary pill strip became the shared
          <SectionTabs> underline. --primary is the interaction colour, and
          spending it on "which section am I reading" left this page's real
          primary actions (Add account, Enter statement, Match) with nothing
          louder to say. N17's fix travels with it intact: the strip is
          labelled for ITSELF (`navLabel`), never with the active tab's own
          name — that was the defect, and SectionTabs' `label` prop carries the
          same rule for every lane. It is a tablist now rather than a <nav>
          landmark, which is what it always was: these buttons select among
          panels, they do not navigate. */}
      <SectionTabs
        label={t("navLabel")}
        items={TABS.map((tb) => ({ value: tb, label: t(tb) }))}
        value={tab}
        onSelect={setTab}
      />

      {tab === "accounts" && <AccountsSection clientId={clientId} />}
      {tab === "statements" && <StatementsSection clientId={clientId} />}
      {tab === "matching" && (
        <div className="flex flex-col gap-4">
          {/* #947 — a payroll run's own net pay, found on the bank statement, above the ordinary
              line/entry matcher: a settlement is a match too, and this is where a person looks
              first for "did the payroll payment clear yet". */}
          <PayrollSettlementsSection clientId={clientId} />
          {/* #949 (fix round, finding SPEC-14) -- the tenancy half of the same question, beside
              the payroll one: a month of rent whose payment has not appeared, and the deposit
              this lane can only OFFER a coding for. Without this panel the Needs-you row for an
              unpaid month landed on a page that said nothing about rent. */}
          <RentSettlementsSection clientId={clientId} />
          <MatchingSection clientId={clientId} selectedLineId={lineParam} onSelectLine={setLine} />
        </div>
      )}
      {tab === "exceptions" && <ExceptionsSection clientId={clientId} />}
      {tab === "reconciliation" && <ReconciliationSection clientId={clientId} />}
      {tab === "agency" && <AgencySection clientId={clientId} />}
    </div>
  );
}
