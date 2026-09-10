"use client";

// THE ONE capability-boundary destination every unsupported Tax operation deep-links to
// (#627, refresh spec #612 journey D4 / Appendix C's own D4 recipe: "an inactive feature
// explains what can currently be read. No fake Prepare/File buttons. Existing read-only
// data remains reachable where authorised."). Every "not enabled" note on this page points
// HERE instead of writing its own bespoke explanation, so there is exactly one place that
// says what is and is not enabled — never two notes quietly disagreeing.
//
// WHAT THIS SECTION DOES NOT DO, ON PURPOSE. It names no statutory due date and no
// activation workflow — #612's own Out of Scope excludes a new statutory-deadline calendar
// and beta-Tax activation (issue #627's historical-obligations rows C55.1-C55.9/C55.16/
// C55.18/C83.12-20, all "deferred-tax-expansion" / "deferred-out-of-scope"). The database
// does hold a developer-seeded `clara.statutory_deadlines` table (migration 0139) and SST
// rate/threshold reference tables (migration 0153), but BOTH carry zero `clara_authenticated`
// grant and the reader this ticket's inventory would need (`list_statutory_calendar`) is
// unbuilt — so this section states the boundary honestly rather than reading a table no
// human session can reach.

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const CAPABILITY_BOUNDARY_ANCHOR = "capability-boundary";
export const CAPABILITY_BOUNDARY_HEADING_ID = "tax-capability-boundary-heading";

export function CapabilityBoundarySection() {
  const t = useTranslations("ClientTax.boundary");
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  // Deep-link focus return (Appendix C §4: "Work detail focuses its heading when reached
  // by navigation"). TWO arrivals both move focus to the heading, not just one:
  //   - a hash present ON MOUNT (a fresh navigation with the hash already in the URL — an old
  //     bookmark, a legacy redirect, or a full page load) — the native browser fragment-target
  //     algorithm targets THIS SECTION's own id (`#capability-boundary`, on the Card, which
  //     carries no tabindex), never the heading two levels in, so it cannot be relied on alone;
  //   - a LATER same-page click on one of the "see the capability boundary" links this page
  //     hands out, while `CapabilityBoundarySection` is already mounted — that changes the hash
  //     WITHOUT remounting anything, so only a `hashchange` listener (not the mount effect
  //     above) ever sees it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const focusIfBoundaryHash = () => {
      if (window.location.hash === `#${CAPABILITY_BOUNDARY_ANCHOR}`) {
        headingRef.current?.focus();
      }
    };
    focusIfBoundaryHash();
    window.addEventListener("hashchange", focusIfBoundaryHash);
    return () => window.removeEventListener("hashchange", focusIfBoundaryHash);
  }, []);

  return (
    <Card id={CAPABILITY_BOUNDARY_ANCHOR} aria-labelledby={CAPABILITY_BOUNDARY_HEADING_ID}>
      <CardHeader>
        <h2
          id={CAPABILITY_BOUNDARY_HEADING_ID}
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-medium text-foreground outline-none"
        >
          {t("heading")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("subheading")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-foreground">{t("enabledHeading")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>{t("enabledSstWatch")}</li>
            <li>{t("enabledComplianceActs")}</li>
            <li>{t("enabledTurnoverClassification")}</li>
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-foreground">{t("notEnabledHeading")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>{t("notEnabledRegistration")}</li>
            <li>{t("notEnabledComputation")}</li>
            <li>{t("notEnabledStatutory")}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
