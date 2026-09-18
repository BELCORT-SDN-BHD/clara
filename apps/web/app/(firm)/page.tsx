import { FirmHomeBoard } from "@/components/firm/firm-home/firm-home-board";

/**
 * Firm-altitude home ("/") — the roll-up over the four firm surfaces, and since #659 the firm's
 * PORTFOLIO of clients.
 *
 * TRUED 2026-09-04 (map item E-1, 裁-190). The old body rendered a `PageHeader` and nothing
 * else, with an in-file note explaining that the roll-up "was never built". It is built: the
 * board below reads `clara.caller_context`, `clara.list_review_queue`, `clara.clients`,
 * `clara.agent_tasks_visible`, `clara.get_firm_portfolio_pack` and `clara.list_activity`, and
 * every tile links into the surface that owns its verb. The note that said otherwise is deleted
 * rather than softened — a stale not-built claim is the same class of lie as a premature built
 * one.
 *
 * The board is a CLIENT component and owns its own `PageShell`/`PageHeader`, the shape
 * `components/tax/TaxWorkbenchPage.tsx` already establishes for a workbench that must name its
 * page from a read. Nothing is fetched here: the firm's name is a browser read like every other
 * number on the page, so it fails, loads and retries under the same rules as its neighbours.
 *
 * #659 — THE ROUTE NOW CARRIES URL STATE, AND THIS FILE STILL READS NO `searchParams`, which is
 * the deliberate half of that sentence. `/?status=&attention=&q=&cursor=` is parsed in exactly
 * ONE place — `lib/firm/portfolio-url-state.ts`, read by the board through `useSearchParams` —
 * and every one of those axes narrows or pages a table the board renders client-side. There is no
 * decision on this route that is genuinely about MARKUP the way `app/(firm)/work/page.tsx:32-41`'s
 * is: that page reads `?view=` on the server because the running-agent-task panel does not belong
 * on the attention view at all, which is a question about what exists in the document. Nothing
 * here appears or disappears with the portfolio's filter, so parsing the URL a second time on the
 * server would be a duplicated contract bought for nothing.
 *
 * Every route in this group is already dynamic — `app/(firm)/layout.tsx` reads cookies twice over
 * and carries the two `<Suspense>` boundaries `useSearchParams()` needs — so the client-side read
 * costs this page no rendering mode it did not already have.
 */
export default async function FirmHomePage() {
  return <FirmHomeBoard />;
}
