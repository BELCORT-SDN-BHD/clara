import { JournalsWorkbench } from "@/components/journals/journals-workbench";

/**
 * "/clients/:clientId/journals" — one tab of the client workspace (owner
 * ruling Q3). The real surface: the DOCUMENT-sourced drafts queue, the review
 * queue (approve/revise/withdraw), the posted table with its Work / receipt /
 * source / correction links, and posted-entry reversal (law 6: reverse-not-
 * delete — there is no delete verb). #634 RETIRED the manual JE compose
 * ceremony that used to live here: the one manual-JV entry point is journey C3's
 * composer route, and this page's primary act links to it. See lib/journals/api.ts
 * for the full verb/view grounding, migration-cited.
 *
 * A Server Component boundary only — `clientId` is handed straight to the
 * Client Component that owns the actual hydration (direct RLS reads via
 * getRows + governed doors via callDoor, both browser-only: they read the
 * session token via lib/session-accessor.ts).
 *
 * #634 — `?tab=` and `?entry=` ARE READ HERE, on the server, and handed down as
 * plain props. A `useSearchParams()` in the client component would work too, but
 * it forces a Suspense boundary on every build of this route for a value that is
 * only ever the OPENING state; reading it here keeps the address the source of
 * truth for arrival and leaves the component's own state the source of truth
 * afterwards. The address matters because a refusal elsewhere in this journey
 * ("that document already backs a posted entry") links straight to one entry,
 * and Back must return the reader to what they were doing.
 */
export default async function ClientJournalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clientId } = await params;
  const query = (await searchParams) ?? {};
  const one = (value: string | string[] | undefined): string =>
    typeof value === "string" ? value : Array.isArray(value) ? (value[0] ?? "") : "";
  const tab = one(query.tab);

  return (
    <JournalsWorkbench
      clientId={clientId}
      initialTab={tab === "posted" || tab === "drafts" || tab === "clarifications" ? tab : undefined}
      initialEntryId={one(query.entry)}
    />
  );
}
