import { FirmHomeBoard } from "@/components/firm/firm-home/firm-home-board";

/**
 * Firm-altitude home ("/") — the roll-up over the four firm surfaces.
 *
 * TRUED 2026-09-04 (map item E-1, 裁-190). The old body rendered a `PageHeader` and nothing
 * else, with an in-file note explaining that the roll-up "was never built". It is built: the
 * board below reads `clara.caller_context`, `clara.list_review_queue`, `clara.clients`,
 * `clara.agent_tasks_visible` and the firm timeline contract, and every tile links into the
 * surface that owns its verb. The note that said otherwise is deleted rather than softened —
 * a stale not-built claim is the same class of lie as a premature built one.
 *
 * The board is a CLIENT component and owns its own `PageShell`/`PageHeader`, the shape
 * `components/tax/TaxWorkbenchPage.tsx` already establishes for a workbench that must name its
 * page from a read. Nothing is fetched here: the firm's name is a browser read like every other
 * number on the page, so it fails, loads and retries under the same rules as its neighbours.
 */
export default async function FirmHomePage() {
  return <FirmHomeBoard />;
}
