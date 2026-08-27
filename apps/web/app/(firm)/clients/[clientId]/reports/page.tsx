import { ReportsPage } from "@/components/reports/ReportsPage";

/**
 * "/clients/:clientId/reports" — one tab of the client workspace (owner ruling
 * Q3). Three direct DB-read surfaces: the sealed statutory close-report
 * archive (0127), the watermarked analysis sandbox's history (0132 — its
 * mint/request verbs are agent-lane only, see components/reports/
 * SandboxExportsPanel.tsx), and the freeform read audit log (0131). This
 * route only threads `clientId` down to the client component that does the
 * reading.
 */
export default async function ClientReportsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ReportsPage clientId={clientId} />;
}
