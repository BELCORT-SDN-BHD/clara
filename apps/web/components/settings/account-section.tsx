"use client";

// #626 (refresh spec #612, journey D1) — the Account section: display name and
// email are both READ-ONLY facts from their own pre-existing authorities (see
// lib/settings/account-identity.ts's own header), never preferences 0179 stores.
// Sign-out is components/logout-button.tsx, unchanged and unforked — see that
// file's own header for why a second implementation is the wrong move.

import { useTranslations } from "next-intl";

import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { StateBanner } from "@/components/common/state";
import { SectionHeader } from "@/components/common/section-header";
import { LogoutButton } from "@/components/logout-button";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { getMyDisplayName, getSessionIdentity } from "@/lib/settings/account-identity";

type AccountIdentity = { displayName: string | null; email: string | null };

async function loadIdentity(): Promise<AccountIdentity> {
  const identity = await getSessionIdentity();
  if (!identity) return { displayName: null, email: null };
  const displayName = await getMyDisplayName(identity.userId);
  return { displayName, email: identity.email };
}

export function AccountSection() {
  const t = useTranslations("Settings.account.sections.account");
  const { data, loading, err } = useHydratedPart(sessionTokenAccessor, loadIdentity);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-account-heading">
      <SectionHeader level={2}>
        <span id="settings-account-heading">{t("heading")}</span>
      </SectionHeader>

      {loading ? (
        <div className="flex flex-col gap-2" aria-hidden="true">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>
      ) : err ? (
        <StateBanner tone="error">{err}</StateBanner>
      ) : (
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>
                <FieldTitle>{t("displayNameLabel")}</FieldTitle>
              </FieldLabel>
            </FieldContent>
            <span className="text-sm text-foreground">{data?.displayName ?? "—"}</span>
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>
                <FieldTitle>{t("emailLabel")}</FieldTitle>
                <FieldDescription>{t("emailScopeNote")}</FieldDescription>
              </FieldLabel>
            </FieldContent>
            <span className="text-sm text-foreground">{data?.email ?? "—"}</span>
          </Field>
        </FieldGroup>
      )}

      <StateBanner tone="neutral" className="max-w-prose">
        {t("editNote")}
      </StateBanner>

      <div className="flex flex-col items-start gap-2">
        <SectionHeader level={3}>{t("sessionHeading")}</SectionHeader>
        <LogoutButton variant="outline" align="stretch" />
      </div>
    </section>
  );
}
