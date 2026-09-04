"use client";

// retire_counterparty_alias's door dialog — bookkeeper+, EXECUTE-granted at
// the live catalog (confirmed). NOT currently rendered from
// counterparty-hygiene-panel.tsx: `clara.counterparty_aliases` carries no
// clara_authenticated human-read policy (rung-0 finding, counterparty.ts's
// own header), so this build has no honest way to discover an alias's id to
// retire. Kept ready — takes `aliasDisplay` + an id-bearing `onSubmit` — for
// the day a read exists; it is not dead in the sense of wrong, only
// currently unreachable from any real screen.

import { useTranslations } from "next-intl";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";

export function RetireCounterpartyAliasDialog({
  aliasDisplay,
  busy,
  onSubmit,
}: {
  aliasDisplay: string;
  busy: boolean;
  onSubmit: () => Promise<boolean>;
}) {
  const t = useTranslations("ArApCounterparty.retireAlias");

  return (
    <ArApCounterpartyDoorDialog
      triggerLabel={t("trigger")}
      triggerSize="xs"
      title={t("title", { alias: aliasDisplay })}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      onConfirm={onSubmit}
    />
  );
}
