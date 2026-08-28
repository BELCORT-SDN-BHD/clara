"use client";

// "Clara proposes close" — the CARRIER and its DOORS are LIVE (verb-coverage
// census, 2026-08-28; migration 0138_f_a4_pr_1c_close_agent_limb.sql):
// clara.close_proposals (§A.2) holds the digest vector, the drafted
// attestation texts and the model/narrative triple; clara.wake_propose_close
// (0138:2333) is the agent-side writer; clara.attest_close_exception's own
// p_from_proposal arm (0120:1010-1041, LIVE since 0120 and pinned unchanged
// at 0138's own prestate §0.3) is the human-side adoption path — a human
// signs an exception FROM a live proposal, never inventing one.
//
// This corrects an earlier claim on this panel (superseded by 0138 landing):
// "no clara.close_proposals table, no wake_propose_close ... F-A4 PR-1c is
// unbuilt". That was true when written; it is false at the frontier now.
//
// What is STILL NOT BUILT is this panel's OWN surface — a card that reads a
// live clara.close_proposals row and lets a human adopt/withdraw it through
// the doors above. That lands with P6's four-card wire bump (chatTurn_v15).
// This note stays a NotBuiltNote for exactly that reason: the DB side is
// done, the frontend card is not, and the mission's "anything unbuilt
// renders honestly, never worked around" rule applies to the LATTER, not a
// verb that no longer exists.

import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";

export function CloseProposalPanel() {
  const t = useTranslations("ClientClose.proposal");
  return (
    <NotBuiltNote>
      <SectionHeader level={3}>{t("heading")}</SectionHeader>
      <p>{t("body")}</p>
    </NotBuiltNote>
  );
}
