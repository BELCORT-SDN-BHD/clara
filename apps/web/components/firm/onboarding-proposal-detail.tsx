"use client";

// P6-5 ③ — THE SEVENTH FIRM-QUESTION KIND'S CARD: Clara's own "I think this document is a
// new client" proposal (`onboarding_proposed`, widened into the live CHECK at 0142:219-222).
//
// WHY THIS EXISTS AT ALL. The renderer was fail-soft, so nothing was BROKEN — the row
// already rendered with an honest "Unrecognized kind (onboarding_proposed)" badge and the
// two generic doors. What was missing is the only thing that makes the proposal actionable:
// the NAME Clara proposed, and the basis she proposed it on. Those sat inside a
// `JSON.stringify` blob behind a `<details>` summary, which is the correct default for the
// five kinds whose candidate shape the database does not commit to — and the wrong one for
// the one kind where it does.
//
// EVERY FIGURE HERE IS THE DATABASE'S. `sightings` is DERIVED by
// `clara._resolve_proposal_basis` and the caller's raw claim is persisted NOWHERE (0143's
// own HIGH-2 note, 裁-22) — PRD §6 invariant 1 is why. The citation count is the length of
// the resolved array, computed from rows, not from a model's assertion about them. This
// component adds no arithmetic of its own beyond that length.
//
// WHAT IT DELIBERATELY DOES NOT OFFER: an "accept this proposal" button. `onboarding_plans`
// carries `opened_from_question` (0142:229) with a CHECK making it non-null only for an
// agent-opened plan — and NO HUMAN DOOR WRITES IT. Accepting is F-A7b PR-b's door, unbuilt
// on this tip (measured: no `create function` in `packages/db/migrations/*.sql` writes that
// column). Composing "resolve the question" + "begin_client_onboarding" into one control
// here would imply an atomicity the database does not give, which is exactly what
// frontend-handoff-addendum-2026-08-24.md §2 forbids — and it would silently mint a
// human-opened plan while the card claimed it accepted Clara's. So the card says what the
// proposal IS, links to the document it came from, hands the context to the rail, and
// leaves the two REAL doors (resolve / dismiss) to the row that owns them.

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { focusRail } from "@/lib/command/bus";
import type { OnboardingProposalCandidate } from "@/lib/firm/needs-you-gaps";

export function OnboardingProposalDetail({
  proposal,
  questionText,
}: {
  proposal: OnboardingProposalCandidate;
  questionText: string;
}) {
  const t = useTranslations("NeedsYou.onboardingProposal");

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2">
      <p className="text-card-foreground">
        {t("proposedName", { name: proposal.proposedName })}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {/* Rendered only when the read SAW them. A missing basis is not "0 citations" —
            that would be a number this card made up about evidence it never read. */}
        {proposal.citationCount !== null ? (
          <>
            <dt>{t("citationsLabel")}</dt>
            <dd>{proposal.citationCount}</dd>
          </>
        ) : null}
        {proposal.sightings !== null ? (
          <>
            <dt>{t("sightingsLabel")}</dt>
            <dd>{proposal.sightings}</dd>
          </>
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">{t("acceptNotBuilt")}</p>
      {/* NO DEEP LINK TO THE DOCUMENT, and this is a measured absence rather than an
          oversight. 裁-17 ④'s deep links land on the tab that OWNS an object, and every
          document surface in this build is CLIENT-scoped
          (`app/(firm)/clients/[clientId]/documents/page.tsx` — the only documents page in
          the tree). An `onboarding_proposed` question exists precisely because the document
          has NO client yet, so there is no owning tab to link to. A `/documents/<id>` href
          would be a link to Next's 404, and "the UI never invents a link"
          (apps/web/AGENTS.md) — so the row says where the document is instead. */}
      <p className="text-xs text-muted-foreground">{t("documentNotAddressable")}</p>
      <div className="flex flex-wrap gap-2">
        {/* 裁-17 ④ — "ask Clara about this", carrying THIS row's context into the rail. The
            text is a question a human would type, never an instruction to a tool. */}
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => focusRail({ query: t("askPrefill", { name: proposal.proposedName, question: questionText }), source: "inbox" })}
        >
          {t("ask")}
        </Button>
      </div>
    </div>
  );
}
