import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SettingsNav } from "@/components/settings/settings-nav";
import { FirmSetupChecklist } from "@/components/firm-setup/firm-setup-checklist";

/**
 * "/settings/setup" — journey A5's destination: the resumable list of facts a firm must state
 * about itself, derived from the real required items on the firm's own onboarding plan.
 *
 * WHY A SETTINGS SECTION AND NOT A THREAD CARD. AC3 puts the confirmed facts in "the same canonical
 * record used by Settings and Knowledge", and Settings is where a fact is corrected afterwards;
 * AC4's "useful authorised next step" is the firm-home tile that links here. R7's in-thread
 * onboarding-card ruling is NOT transplanted: that decision was about a CLIENT onboarding card and
 * its stated reason was "there is no /onboarding route"
 * (`components/firm/client-home/OnboardingChecklistCard.tsx:3-12`). A settings section is not that
 * route, and a firm-wide administrative act does not belong in a client-scoped conversation.
 *
 * `/settings/firm` IS UNTOUCHED. Its two honest paragraphs are deliberately empty of data pending
 * 裁-188's database lane and are pinned by `e2e/firm-navigation-walk.spec.ts` and
 * `tests/firm-admin-pages-a11y.test.tsx`; this section sits beside it rather than filling it in.
 *
 * NO SCOPE CHECK HERE, and that is not an omission — the `app/(firm)` layout already calls
 * `requireFirmScope()` at one of its registered entrances. A second call in this page would make it
 * another entrance, and `tests/firm-scope-surfaces.test.ts` matches the registry against the real
 * app tree BOTH WAYS, so it would go red on sight (the `/settings/members` page carries the same
 * note for the same reason).
 *
 * NOTHING ON THIS PAGE IS A WALL EITHER. The section is `minimumRole: "admin"` in the navigation
 * registry, so a bookkeeper never sees it — and `clara.get_firm_setup` floors at admin in its own
 * body, so a deep link is refused by the database and rendered as a named denied face.
 */
export default async function SettingsFirmSetupPage() {
  const t = await getTranslations("FirmSetup");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} />
      <SettingsNav />
      <FirmSetupChecklist />
    </PageShell>
  );
}
