import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { FirmSettingsPanel } from "@/components/firm-admin/firm-settings-panel";

/**
 * "/settings/firm" — the firm's authority controls. Moved from
 * "/admin/settings" by #614; the old path redirects here.
 *
 * #635 GAVE IT A SURFACE. The page now carries five cards — who this firm is and where its own
 * details live, its LEGAL STANDING (with the owner's in-app way to accept a new version, the
 * only remedy for a withdrawn derived model-egress authority), its billing plan and payment
 * record, its monthly model usage, and its processing caps — all from migration 0233's three
 * governed reads. The two legacy cards below them are UNCHANGED and still rendered from
 * `SettingsPanel`, whose own header carries their history; `FirmSettingsPanel` composes it
 * rather than re-typing their copy.
 *
 * THE HEADING DOES NOT MOVE. `e2e/shell-migration-walk.spec.ts:133` pins the `<h1>` "Firm
 * settings" and `e2e/firm-navigation-walk.spec.ts:175-197` walks this route at two ranks; the
 * page keeps its title, its description and its `SettingsNav`.
 *
 * THE PATH CHANGED BUT THE SURFACE DID NOT (the #614 history this page was built on). FS-8 PR-2 (裁-97) built this page
 * around the high-stakes threshold control; **裁-187 retired that control
 * outright** and its dialog was deleted with it. What remains is the approvals
 * note and the honest capabilities note. `SettingsPanel`'s own header carries the
 * ruling, the live-database facts the copy must stay true to while 裁-188's
 * wall-removal lane is outstanding, and what that lane changes here when it lands.
 *
 * THE ROUTE IS NOW "FIRM", NOT "SETTINGS", because it sits UNDER /settings: a
 * path reading `/settings/settings` says nothing about which settings, and this
 * section is specifically the firm-wide ones (the caller's own live at
 * /settings/account).
 */
export default async function SettingsFirmPage() {
  const t = await getTranslations("FirmAdminCompliance.settings");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <SettingsNav />
      <FirmSettingsPanel />
    </PageShell>
  );
}
