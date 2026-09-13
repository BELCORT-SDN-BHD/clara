import { Suspense } from "react";
import { DocumentsWorkbench } from "@/components/documents/documents-workbench";

/**
 * "/clients/:clientId/documents" — the real P3 client Documents tab (owner ruling
 * Q3; mohe-grill-rulings-2026-08-27.md Q8's workbench-first-on-direct-RLS-reads
 * rule). Server component only for the params await; every read/write lives in
 * <DocumentsWorkbench> (a Client Component — hydrate-never-trust needs a live
 * session token and re-derives on mount).
 *
 * THE SUSPENSE BOUNDARY IS REQUIRED, not decorative (#719's Documents half): the
 * workbench now reads `?document=` through `useSearchParams`, and Next bails the
 * whole route out to client-side rendering unless that read sits inside one. The
 * Registers tab's own page carries the identical boundary for the identical reason
 * (`app/(firm)/clients/[clientId]/registers/page.tsx`), and the /login page before
 * it. `fallback={null}` rather than a skeleton: the workbench renders its own
 * PageShell and its own three loading sentences, so anything here would be a second,
 * competing loading state for the same moment.
 */
export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return (
    <Suspense fallback={null}>
      <DocumentsWorkbench clientId={clientId} />
    </Suspense>
  );
}
