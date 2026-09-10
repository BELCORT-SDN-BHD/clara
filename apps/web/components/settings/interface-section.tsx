"use client";

// #626 (refresh spec #612, journey D1) — the Interface section: the two
// SUPPORTED, GENUINELY CONSUMED preferences (see account-settings.tsx's own
// header for the inventory this ticket's first acceptance line required).
// Each field is presentational only — every piece of state and every write
// lives in account-settings.tsx; this component just renders one
// PreferenceRadioField per field so the two share one control shape.

import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { PreferenceRadioField } from "@/components/settings/preference-radio-field";
import type { MotionPreference } from "@/lib/settings/motion-preference";
import type { SidebarDefaultPreference } from "@/lib/settings/preferences";

export type InterfaceFieldViewState<T extends string> = {
  readonly value: T | undefined;
  readonly dirty: boolean;
  readonly invalid: boolean;
  readonly errorMessage?: string;
  readonly focusToken?: number;
  readonly onChange: (value: T) => void;
  readonly onReset: () => void;
};

export function InterfaceSection({
  motion,
  sidebarDefault,
  disabled,
}: {
  motion: InterfaceFieldViewState<MotionPreference>;
  sidebarDefault: InterfaceFieldViewState<SidebarDefaultPreference>;
  disabled?: boolean;
}) {
  const t = useTranslations("Settings.account.sections.interface");

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-interface-heading">
      <SectionHeader level={2}>
        <span id="settings-interface-heading">{t("heading")}</span>
      </SectionHeader>

      <PreferenceRadioField
        name="motion"
        legend={t("motion.legend")}
        scopeLabel={t("userScopeBadge")}
        description={t("motion.description")}
        options={[
          {
            value: "system",
            label: t("motion.options.system.label"),
            description: t("motion.options.system.description"),
          },
          {
            value: "reduced",
            label: t("motion.options.reduced.label"),
            description: t("motion.options.reduced.description"),
          },
        ]}
        value={motion.value}
        dirty={motion.dirty}
        invalid={motion.invalid}
        errorMessage={motion.errorMessage}
        focusRequestToken={motion.focusToken}
        onChange={motion.onChange}
        onReset={motion.onReset}
        unsavedLabel={t("unsavedBadge")}
        resetLabel={t("resetAction")}
        disabled={disabled}
      />

      <PreferenceRadioField
        name="sidebarDefault"
        legend={t("sidebarDefault.legend")}
        scopeLabel={t("userScopeBadge")}
        description={t("sidebarDefault.description")}
        options={[
          {
            value: "expanded",
            label: t("sidebarDefault.options.expanded.label"),
            description: t("sidebarDefault.options.expanded.description"),
          },
          {
            value: "collapsed",
            label: t("sidebarDefault.options.collapsed.label"),
            description: t("sidebarDefault.options.collapsed.description"),
          },
        ]}
        value={sidebarDefault.value}
        dirty={sidebarDefault.dirty}
        invalid={sidebarDefault.invalid}
        errorMessage={sidebarDefault.errorMessage}
        focusRequestToken={sidebarDefault.focusToken}
        onChange={sidebarDefault.onChange}
        onReset={sidebarDefault.onReset}
        unsavedLabel={t("unsavedBadge")}
        resetLabel={t("resetAction")}
        disabled={disabled}
      />
    </section>
  );
}
