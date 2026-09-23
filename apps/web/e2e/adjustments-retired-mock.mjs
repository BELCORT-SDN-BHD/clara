// #927 (riders wave 3) — the retired Adjustments register (`/clients/:id/registers?tab=adjustments`),
// a file-disjoint sibling of `staff-advances-register-mock.mjs`, consulted by `serve-built.mjs`
// through the ONE hook this lane needs. No sidebar entry points here any more (`lib/navigation/
// tree.ts:382` — #640 repointed it to `/clients/:id/plans`); the tab is reached only through the
// registers workbench's own in-page `SectionTabs`, the same "no browser coverage existed" gap
// #879 closed for `?tab=staffAdvances`, closed here for the shape this ticket leaves behind.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL. PostgREST behind it is FAKED. So this walk proves the retired tab's own
// JOURNEY — the notice renders, Propose/Sign/Run-now are genuinely gone from the DOM (not merely
// disabled), Retire still submits through `components/registers/adjustments-register.tsx`'s
// hydrate-never-trust `act()` and the row reflects it — and it proves NOTHING about whether
// Postgres would accept a retire call. `packages/db/tests/x42-adjustments.test.mjs` (migration
// 0282) owns that.
//
// SCOPE. Every handler below names this lane's OWN client id and falls through otherwise —
// `e2e-fixture-ownership.test.ts`'s own law (a handler claiming a shared endpoint replaces every
// other lane's fixture).
import { readCachedJson, matchVerb } from "./mock-dispatch.mjs";

export const AR = {
  clientId: "92792792-9279-4927-9279-927927927927",
  clientName: "SEGAMAT TIMBER SDN BHD",
  // A LIVE template — historical, pre-#927. Retire must still show for it; Sign must not.
  liveTemplateId: "92792701-9279-4927-9279-927927927001",
  liveTemplateName: "Monthly rent accrual",
  // A PROPOSED (unsigned) template — the EXACT shape that used to render the Sign dialog. Proving
  // Sign is gone even here, not merely on a row that never showed it, is the point of seeding one.
  proposedTemplateId: "92792702-9279-4927-9279-927927927002",
  proposedTemplateName: "Quarterly audit fee accrual",
};

const CLIENT = { id: AR.clientId, name: AR.clientName, status: "active", created_at: "2026-01-01T00:00:00.000Z" };

/** The lane's own mutable model — mutated only by this lane's own governed write (retire). */
const state = {
  templates: [
    { id: AR.liveTemplateId, client_id: AR.clientId, status: "live", name: AR.liveTemplateName, cadence: "monthly", start_date: "2026-01-01", end_date: null, auto_reverse: false, memo_template: "Rent accrual" },
    { id: AR.proposedTemplateId, client_id: AR.clientId, status: "proposed", name: AR.proposedTemplateName, cadence: "annual", start_date: "2026-01-01", end_date: null, auto_reverse: false, memo_template: "Audit fee accrual" },
  ],
};

const OWNED_RPC_VERBS = new Set(["list_adjustment_runs", "adjustment_run_due", "retire_adjustment_template"]);

export async function handleAdjustmentsRetiredSupabase(request, response, path, url, sendJson, cors) {
  const clientFilter = url.searchParams.get("client_id");

  if (request.method === "GET" && path === "/rest/v1/clients") {
    const idFilter = url.searchParams.get("id");
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id !== AR.clientId) return false;
    sendJson(response, 200, [CLIENT], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/adjustment_templates") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== AR.clientId) return false;
    sendJson(response, 200, state.templates, cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/adjustment_runs") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== AR.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method === "GET" && path === "/rest/v1/adjustment_pair_reversals") {
    const client = clientFilter?.startsWith("eq.") ? clientFilter.slice(3) : null;
    if (client !== AR.clientId) return false;
    sendJson(response, 200, [], cors);
    return true;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!matchVerb(OWNED_RPC_VERBS, verb)) return false;

  if (verb === "list_adjustment_runs") {
    const body = await readCachedJson(request);
    if (body?.p_client !== AR.clientId) return false;
    sendJson(response, 200, { client_id: AR.clientId, runs: [] }, cors);
    return true;
  }

  if (verb === "adjustment_run_due") {
    const body = await readCachedJson(request);
    if (body?.p_client !== AR.clientId) return false;
    sendJson(response, 200, { due: false, reason: "nothing_due", blocked: [] }, cors);
    return true;
  }

  if (verb === "retire_adjustment_template") {
    const body = await readCachedJson(request);
    if (body?.p_client !== AR.clientId) return false;
    const row = state.templates.find((t) => t.id === body?.p_template);
    if (!row) return false;
    row.status = "retired";
    sendJson(response, 200, { template_id: row.id, status: "retired" }, cors);
    return true;
  }

  return false;
}
