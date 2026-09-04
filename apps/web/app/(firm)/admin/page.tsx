import { AdminHub, AdminPageDescription, AdminPageTitle } from "@/components/admin/admin-hub";
import { PageHeader, PageShell } from "@/components/common/page-shell";

/**
 * "/admin" — the firm administration hub (P4-6). Cards are shaped from the
 * caller context the parent layout already read. A typed URL still meets the
 * destination's own RLS policy or governed door; this page grants nothing.
 *
 * THE TITLE IS RANK-AWARE (E-7 / CB-AE2E-014, 裁-187) and therefore comes from a
 * client component rather than `getTranslations` here: the sidebar entry reads
 * "Firm" below admin rank, and a page titled "Admin" underneath it would put the
 * two words at odds. `PageHeader` takes a `ReactNode` for both slots, so the h1
 * stays exactly where it was in the heading tree.
 */
export default function AdminPage() {
  return (
    <PageShell>
      <PageHeader title={<AdminPageTitle />} description={<AdminPageDescription />} />
      <AdminHub />
    </PageShell>
  );
}
