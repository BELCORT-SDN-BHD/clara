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
 *
 * #660 — `?period=` IS READ HERE, on the server, and handed down as a plain prop, on the
 * precedent this workspace's journals tab already set (`journals/page.tsx:18-25`) and for the same
 * reason: a `useSearchParams()` would work too, but it forces a Suspense boundary on every build
 * of this route for a value that is only ever the OPENING state. Reading it here keeps THE ADDRESS
 * the source of truth for the period, which is what makes Back restore the period a reader came
 * from rather than only the page they came from.
 *
 * It narrows the MONEY BAND and nothing else on this board. The Work band has no period axis at
 * all and must not grow one — `client-work-attention.test.tsx`'s `p650.pack.no_period_axis` mounts
 * this very page at `?fy=…&period=…` and asserts that nothing in that band changes.
 */
export default async function ClientWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = (await searchParams) ?? {};
  return (
    <PageShell>
      <ClientWorkspaceOverview clientId={clientId} periodParam={query.period} />
    </PageShell>
  );
}
