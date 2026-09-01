import { TaxWorkbenchPage } from "@/components/tax/TaxWorkbenchPage";

/**
 * "/clients/:clientId/tax" — one tab of the client workspace (P6-T, 裁-34).
 * Malaysia's SST and income-tax lifecycle for this client — a proposal/
 * receipt surface (裁-44), never a form. IA only on this tip: see
 * components/tax/TaxWorkbenchPage.tsx's header for the measured backend
 * state and why every panel is a static honest note.
 */
export default async function ClientTaxPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <TaxWorkbenchPage clientId={clientId} />;
}
