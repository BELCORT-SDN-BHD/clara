"use client";

// #635 — WHICH FIRM YOU ARE IN, AND WHERE ITS OWN DETAILS LIVE.
//
// IT RENDERS NO FIRM IDENTITY FACT (2026-09-15 D10 / §6 H5, restated in this ticket's brief).
// No registered name, no SSM number, no address, no financial-year end. Those are
// `/settings/setup`'s, which #934/#935/#891/#895 own; repeating any of them here would give a
// firm two screens that can disagree about its own registration, and the one that is not the
// editor would be the one that goes stale.
//
// IT ISSUES NO READ. The firm's name, the caller's role and the firm id all come from the ONE
// request-scoped `FirmScopeProvider` the layout already populated (P4-6: "no child re-reads the
// session or caller_context merely to shape an affordance"). `createdAt` is the single value
// this card does not have from scope; it arrives as a prop from the panel's commercial read
// (admin+ only) and is simply ABSENT at lower ranks rather than fetched a second way.

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/common/section-header";
import { useFirmScope } from "@/components/firm-scope-provider";
import { formatDay } from "@/lib/firm/commercial-format";

export function FirmIdentityCard({ createdAt = null }: { createdAt?: string | null }) {
  const t = useTranslations("FirmSettings");
  const scope = useFirmScope();
  const [copied, setCopied] = useState(false);
  const created = formatDay(createdAt);

  async function copyFirmId() {
    if (!scope.firm_id) return;
    try {
      await navigator.clipboard.writeText(scope.firm_id);
      setCopied(true);
    } catch {
      // A blocked clipboard is not worth a banner: the id is on screen and selectable.
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("identityHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("identitySubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{t("identityNameLabel")}</dt>
            <dd className="font-medium">{scope.firm_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{t("identityRoleLabel")}</dt>
            <dd className="font-medium">{scope.role ?? "—"}</dd>
          </div>
          {created !== null ? (
            <div>
              <dt className="text-xs text-muted-foreground">{t("identityCreatedLabel")}</dt>
              <dd className="font-medium">{created}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">{t("identityIdLabel")}</dt>
            <dd className="flex items-center gap-2">
              <code className="wrap-anywhere text-xs">{scope.firm_id ?? "—"}</code>
              {scope.firm_id ? (
                <Button type="button" variant="outline" size="sm" onClick={copyFirmId}>
                  {copied ? t("identityCopied") : t("identityCopyId")}
                </Button>
              ) : null}
            </dd>
          </div>
        </dl>
        <p className="max-w-prose text-xs text-muted-foreground">{t("identityNote")}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link className="underline underline-offset-4" href="/settings/setup">
            {t("identitySetupLink")}
          </Link>
          <Link className="underline underline-offset-4" href="/settings/knowledge">
            {t("identityKnowledgeLink")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
