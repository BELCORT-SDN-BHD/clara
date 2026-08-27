import { JournalsWorkbench } from "@/components/journals/journals-workbench";

/**
 * "/clients/:clientId/journals" — one tab of the client workspace (owner
 * ruling Q3). The real surface: drafts, the review queue (approve/revise), the
 * manual JE compose ceremony, and posted-entry reversal (law 6: reverse-not-
 * delete — there is no delete verb). See lib/journals/api.ts for the full
 * verb/view grounding, migration-cited.
 *
 * A Server Component boundary only — `clientId` is handed straight to the
 * Client Component that owns the actual hydration (direct RLS reads via
 * getRows + governed doors via callDoor, both browser-only: they read the
 * session token via lib/session-accessor.ts).
 */
export default async function ClientJournalsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  return <JournalsWorkbench clientId={clientId} />;
}
