import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { OperatorSupportConsole } from "@/components/operator/support-queue";
import { OPERATOR_HEADING_ID } from "@/lib/navigation/heading-ids";

/**
 * "/operator" — the operator support destination (#615, refresh spec #612 journey D3).
 *
 * ITS OWN ADDRESS, deliberately. This surface used to live at "/settings/registrations" (moved
 * there from "/admin/registrations" by #614, whose registry row carried a comment saying #615
 * might relocate it). It is relocated: an operator's queue is estate-wide work about OTHER
 * people's admission, not a property of the firm the operator happens to be a member of, and
 * journey D3's own requirement is not to merge operator controls into normal client navigation.
 * Both old paths 307 here (`lib/navigation/legacy-routes.ts`).
 *
 * IT IS SMOKE-TESTABLE NOW, which the surface it replaces was not. The page it supersedes carried
 * a note that `clara.firms.is_operator` existed and ZERO firms carried it, so no live walk was
 * possible; BELCORT carries the flag on the hosted estate today, the DB battery
 * (`packages/db/tests/operator-support.test.mjs`) drives both doors under real least-privileged
 * roles, and `apps/web/e2e/operator-support-walk.spec.ts` walks the browser journey. The note is
 * retired rather than relocated.
 *
 * OPERATOR ONLY, as an AFFORDANCE. `OperatorSupportConsole` renders the honest refusal line and
 * zero action controls for anyone else; `clara.list_operator_support_queue` /
 * `clara.get_operator_support_case` carry the real wall (0188 §2/§3 — the
 * `approve_firm_registration` predicate, re-derived at call time), so a caller who types this URL
 * still meets CLR04.
 */
export default async function OperatorSupportPage() {
  const t = await getTranslations("Operator");

  return (
    <PageShell>
      <PageHeader title={t("heading")} description={t("pageDescription")} headingId={OPERATOR_HEADING_ID} />
      <OperatorSupportConsole />
    </PageShell>
  );
}
