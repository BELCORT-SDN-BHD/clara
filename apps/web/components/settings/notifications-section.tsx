"use client";

// #626 (refresh spec #612, journey D1) — the Notifications section. NO
// consumer reads a per-user notification preference anywhere in this codebase
// today: clara.notifications (0003_books_core.sql:184) is a firm/client EVENT
// LOG with no recipient column, and no apps/web surface reads it at all (grep
// verified before writing this file). 0179_user_preferences.sql's own
// `notifications` jsonb column therefore accepts ZERO keys — any patch to it
// is refused CLR10 (`unsupported_key`). Per the ticket's own inventory
// instruction, "a control whose value nothing consumes is a lie" — so this
// section renders the honest absence rather than a toggle that would silently
// do nothing, and it gains a real control the day a real channel exists, not
// a day sooner.

import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { StateBanner } from "@/components/common/state";

export function NotificationsSection() {
  const t = useTranslations("Settings.account.sections.notifications");

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-notifications-heading">
      <SectionHeader level={2}>
        <span id="settings-notifications-heading">{t("heading")}</span>
      </SectionHeader>
      <StateBanner tone="neutral" title={t("notConfiguredTitle")}>
        {t("notConfiguredBody")}
      </StateBanner>
    </section>
  );
}
