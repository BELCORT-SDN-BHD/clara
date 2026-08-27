import { DocumentsWorkbench } from "@/components/documents/documents-workbench";

/**
 * "/clients/:clientId/documents" — the real P3 client Documents tab (owner ruling
 * Q3; mohe-grill-rulings-2026-08-27.md Q8's workbench-first-on-direct-RLS-reads
 * rule). Server component only for the params await; every read/write lives in
 * <DocumentsWorkbench> (a Client Component — hydrate-never-trust needs a live
 * session token and re-derives on mount).
 */
export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return <DocumentsWorkbench clientId={clientId} />;
}
