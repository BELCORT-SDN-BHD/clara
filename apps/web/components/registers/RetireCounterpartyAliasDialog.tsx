"use client";

// retire_counterparty_alias's door dialog — bookkeeper+.
//
// WIRED SINCE #647. It used to sit here unreachable: the previous build had no honest way to
// discover an alias's id, so offering the control would have been offering a dead one. Both
// reads that fix that now exist — `clara.counterparty_aliases_visible` was widened in place by
// 0200 §8.1 and `clara.get_counterparty_identity` (0200 §8.2) projects each alias's id beside
// its provenance — and the identity detail renders this dialog per live alias.
//
// A RETIREMENT IS NOT DESTRUCTIVE, so this stays a plain Dialog rather than an Alert Dialog
// (appendix D reserves 3 for a clearly consequential destructive act; the destructive one in
// this domain is the merge). The alias row is never deleted: `retired_at` is stamped, the row
// stays in the history, and the identity revision log records the retirement as its own act.

import { useTranslations } from "next-intl";
import { ArApCounterpartyDoorDialog } from "./ArApCounterpartyDoorDialog";
import type { DialogRefusal } from "@/components/common/dialog-refusal";

export function RetireCounterpartyAliasDialog({
  aliasDisplay,
  busy,
  refusal,
  onSubmit,
}: {
  aliasDisplay: string;
  busy: boolean;
  refusal?: DialogRefusal;
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
      refusal={refusal}
      onConfirm={onSubmit}
    />
  );
}
