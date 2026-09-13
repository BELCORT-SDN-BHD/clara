"use client";

// THE VISIBLE ISOLATION STATEMENT (#615 AC1; PRD §7; ARCHITECTURE §10 anchor
// `admission-and-operator-support`).
//
// The boundary is enforced by the database — `clara.list_operator_support_queue` and
// `clara.get_operator_support_case` read five admission relations and nothing else, and migration
// 0188's own tail censuses both bodies for any books relation. This banner does not enforce it;
// it STATES it, on the screen, to the person using the authority. That is the half a refusal
// sentence cannot do: an operator who can see every firm's registrations needs to know, without
// asking, what this destination does and does not reach, and a reviewer walking the surface needs
// the claim to be visible rather than inferred from a migration.
//
// It renders as a plain `role="note"`-shaped region rather than an alert: nothing has gone wrong.

import { useTranslations } from "next-intl";

export const ISOLATION_STATEMENT_ID = "operator-isolation-statement";

export function IsolationBanner() {
  const t = useTranslations("Operator");
  return (
    <section
      aria-labelledby={ISOLATION_STATEMENT_ID}
      data-operator-region="isolation"
      className="rounded-md border border-info/30 bg-info-muted px-3 py-2 text-sm text-info"
    >
      <h2 id={ISOLATION_STATEMENT_ID} className="font-medium">
        {t("isolationTitle")}
      </h2>
      <p className="mt-1 max-w-prose">{t("isolationBody")}</p>
    </section>
  );
}
