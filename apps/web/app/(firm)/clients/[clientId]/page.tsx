import { PageShell } from "@/components/common/page-shell";
import { ClientWorkspaceOverview } from "@/components/firm/client-workspace-overview";

/**
 * Client-workspace "Home" tab ("/clients/:clientId") — the client's situation board.
 *
 * THE `<h1>` MOVED INTO THE BOARD, and that is the one structural change here. It used to be a
 * static `PageHeader title="Client workspace"` — a label, not a name — printed above a component
 * that already knew the client's real name. The board now owns the heading and fills it with
 * `clara.clients.name`, so the page's one h1 says which client the reader is looking at.
 *
 * The layout one level up prints the client's name too, as a `<p>` (app/(firm)/clients/
 * [clientId]/layout.tsx:43-45). That line must NOT be promoted to a heading — it is the altitude
 * marker for the tab strip, and two headings carrying the same name would make the document
 * outline claim two subjects. Lane L15 owns that header's own responsive rework; this train
 * leaves the file alone.
 *
 * `clientId` still comes verbatim from the URL; the workspace layout below it is what scopes
 * reads by it (components/client-scope-provider.tsx).
 */
export default async function ClientWorkspacePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return (
    <PageShell>
      <ClientWorkspaceOverview clientId={clientId} />
    </PageShell>
  );
}
