import { getTranslations } from "next-intl/server";

import { PageHeader, PageShell } from "@/components/common/page-shell";
import { MembersPanel } from "@/components/admin/members-panel";

/**
 * "/admin/members" — the RBAC surface (design §4 D: "the roster, the pending-invite
 * list, role change, remove", on one screen).
 *
 * NO SCOPE CHECK HERE, and that is not an omission. This page sits under
 * `app/(firm)`, whose layout already calls `requireFirmScope()` — the ONE
 * implementation, at one of its three registered entrances (P4-2,
 * `lib/require-firm-scope.ts`). A second call in this page would make it a fourth
 * entrance, and `tests/firm-scope-surfaces.test.ts` matches the registry against
 * the real app tree BOTH WAYS, so it would go red on sight.
 *
 * NOTHING ON THIS PAGE IS A WALL EITHER. Every read is RLS-scoped and floored in
 * the view's own predicate, and every act goes through a door that floors at
 * admin+ in `clara._human_ctx`. The panel shows its controls to everyone the page
 * admits and lets the DB answer, verbatim — plan §2 rule (b).
 */
export default async function AdminMembersPage() {
  const t = await getTranslations("Members");

  return (
    <PageShell>
      <PageHeader title={t("pageHeading")} description={t("pageDescription")} />
      <MembersPanel />
    </PageShell>
  );
}
