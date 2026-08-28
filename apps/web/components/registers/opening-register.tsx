"use client";

// The opening-seed lifecycle placeholder (T0 seam, port-wave plan §3.3,
// conductor ruling 2026-08-28) — registers-workbench.tsx's "opening" tab.
// create_opening_seed and its approve/cancel/reopen/correction/dry-run doors
// are T2's own scope (port-wave plan §4); this file is the honest "not built
// yet" placeholder every train's own tab starts as (the census's own
// NotBuiltNote law: names the verb and the train, and truing it is part of
// T2's own merge, never a later sweep). T2 replaces this file's body with the
// real seed-lifecycle workbench — the array position and the file identity
// stay the same, only the content changes.

import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";

// No `clientId` prop — like components/close/CloseProposalPanel.tsx (the
// shape this file copies), a NotBuiltNote placeholder reads nothing from the
// client; T2 adds the prop back when the real seed-lifecycle workbench needs
// a scoped read.
export function OpeningRegister() {
  const t = useTranslations("OpeningCarryDown.notBuilt");
  return (
    <NotBuiltNote>
      <SectionHeader level={3}>{t("heading")}</SectionHeader>
      <p>{t("body")}</p>
    </NotBuiltNote>
  );
}
