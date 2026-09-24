"use client";

// #933 — THE ONE LINE CLARA DERIVED HER PROPOSAL FROM, on screen beside the controls it filled.
//
// WHY THIS IS A COMPONENT AND NOT A STRING. Two register-side entrances answer the same question
// about the same asset — the asset page's Complete-particulars dialog and the Needs-you inline
// form — and #883's ruling is that a person confirms or edits what Clara proposed. A proposal
// NOBODY CAN CHECK is a proposal nobody should confirm, so the derivation's own sentence travels
// with the values it produced, in one place, rather than being transcribed twice and drifting.
//
// IT IS NOT A BANNER AND IT DOES NOT ANNOUNCE. Nothing has gone wrong and nothing changed while
// the person was reading: the form simply arrived with values in it, and the note says where they
// came from. A live region here would speak over the field labels on every open.
//
// THE PROPOSAL IS NEVER THE AUTHORITY, and the copy is written so a reader can tell: it says what
// Clara PROPOSES and why, and the controls beside it are the person's to change.

import { useTranslations } from "next-intl";

import type { FaParticularsProposal } from "@/lib/registers/fa-particulars-proposal";

export function FaProposalNote({ proposal }: { proposal: FaParticularsProposal | null }) {
  const t = useTranslations("FixedAssetsDepreciation.particulars");
  if (proposal === null || proposal.reason.trim() === "") return null;
  return (
    <div className="flex flex-col gap-1 rounded-md border p-2" data-testid="fa-proposal-note">
      <p className="text-xs font-medium">{t("proposalHeading")}</p>
      <p className="text-xs text-muted-foreground">{proposal.reason}</p>
      <p className="text-xs text-muted-foreground">{t("proposalHelp")}</p>
    </div>
  );
}
