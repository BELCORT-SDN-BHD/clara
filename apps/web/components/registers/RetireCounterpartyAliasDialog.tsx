"use client";

// retire_counterparty_alias's door dialog — bookkeeper+. No extra input: the
// alias id is already known from the row this trigger renders on, so the
// dialog's own body is confirmation prose only (still a real Dialog, never a
// bare button — the house "one click opens, one confirm performs exactly one
// governed call" shape stays uniform even for a field-less write).

import { useTranslations } from "next-intl";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";

export function RetireCounterpartyAliasDialog({
  aliasDisplay,
  busy,
  onSubmit,
}: {
  aliasDisplay: string;
  busy: boolean;
  onSubmit: () => Promise<void>;
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
