import { ClosePage } from "@/components/close/ClosePage";

/**
 * "/clients/:clientId/close" — one tab of the client workspace (owner ruling
 * Q3). Fiscal-year picker + the selected year's close plan: the begin/
 * finalize/abandon/reopen doors, the close-gate checks, the receipt/
 * segregation panel, and an honest not-built note for "Clara proposes close"
 * (no `close_proposals` carrier exists yet — see components/close/
 * CloseProposalPanel.tsx). All state comes from the DB — this route only
 * threads `clientId` down to the client component that does the reading.
 */
export default async function ClientClosePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClosePage clientId={clientId} />;
}
