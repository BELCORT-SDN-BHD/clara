// OPERATION-CONTRACT CENSUS — THE RUN.
//
// One pass: frontier, catalog, callers, findings, waivers, counts. This module is deliberately
// thin — it decides ORDER and nothing else, so every claim in the output traces to the module
// that measured it (catalog.mjs, callers.mjs, findings.mjs) rather than to a step invented here.
//
// The census never opens a connection itself: it is handed a `query` function, which is what
// lets packages/db/tests/operation-census.test.mjs run it inside a transaction that rolls back
// (opcen.4's REAL `grant execute … to public`) and against injected control call sites.
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { WAIVERS, validateWaivers } from "../../tests/fixtures/operation-census-waivers.mjs";
import { EXCLUDED_NOTE, REPO_ROOT, RUNTIME_ROOTS, WEB_ROOTS } from "./scope.mjs";
import { readCatalog, readFrontier } from "./catalog.mjs";
import { resolveCallers, scanRuntimeCallers, scanWebCallers } from "./callers.mjs";
import { applyWaivers, collectFindings } from "./findings.mjs";

/**
 * Run the census.
 * @param {{query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}>,
 *          repoRoot?: string, waivers?: Map<string, {reason: string, expires_frontier?: string}>,
 *          extraCallers?: object[], migrationsDir?: string, attributionNames?: Set<string>}} opts
 */
export async function runCensus(opts) {
  const { query } = opts;
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const waivers = opts.waivers === undefined ? WAIVERS : opts.waivers;
  validateWaivers(waivers);

  // --- frontier: THE LEDGER, never a migration's own success flag -----------------------
  const frontier = await readFrontier(query, opts.migrationsDir);

  // --- catalog -------------------------------------------------------------------------
  const { functions, byName, relations, policyHelpers, applicationRoles, knownRoles } = await readCatalog(query);

  // --- callers -------------------------------------------------------------------------
  const web = scanWebCallers(repoRoot);
  const runtime = scanRuntimeCallers(repoRoot, knownRoles);
  const scanErrors = [...web.scanErrors, ...runtime.scanErrors]
    .sort((a, b) => (a.file < b.file ? -1 : 1));
  const rawCallers = [...web.callers, ...runtime.callers, ...(opts.extraCallers || [])];
  const { callers, relationRefs } = resolveCallers(rawCallers, byName, relations);

  // --- findings, then waivers ----------------------------------------------------------
  const findings = collectFindings({
    frontier,
    functions,
    callers,
    policyHelpers,
    attributionNames: opts.attributionNames,
  });
  const { waivers_applied: waiversApplied, waivers_unused: waiversUnused, counts } = applyWaivers(findings, waivers);

  return {
    frontier,
    scope: {
      catalog_functions: functions.length,
      application_roles: applicationRoles,
      web_roots: WEB_ROOTS,
      runtime_roots: RUNTIME_ROOTS,
      excluded: EXCLUDED_NOTE,
      caller_sites: callers.length,
      relation_references_skipped: relationRefs.length,
      prose_mentions_skipped: runtime.prose.length,
    },
    scan_errors: scanErrors,
    counts,
    waivers_applied: waiversApplied,
    waivers_unused: waiversUnused,
    findings,
    functions,
    callers,
    relation_references: relationRefs,
    prose_mentions: runtime.prose,
  };
}
