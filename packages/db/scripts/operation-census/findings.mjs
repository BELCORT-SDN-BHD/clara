// OPERATION-CONTRACT CENSUS — FINDINGS AND WAIVERS.
//
// The seven labels, and the one place a finding may be suppressed. Both halves live here
// because a waiver is only meaningful against the exact `<label>:<target>` string the finding
// carries: split them and the key becomes a convention two files agree on by hand.
//
// ATTRIBUTION IS READ, NOT RESTATED. `unattributed` compares the public boundary against
// packages/db/tests/rig-meta.mjs's own cohort rosters (plus RLS_HELPERS and the helpers named
// in pg_policies). This module imports those rosters rather than keeping a copy, so retiring a
// name there is what makes a door fall out here — which is exactly what opcen.7 proves.
//
// Split out of scripts/operation-census.mjs at this repository's 500-line ceiling. Behaviour
// is byte-identical to the code it replaced.

import { ALLOWED, RLS_HELPERS } from "../../tests/rig-meta.mjs";
import { FINDING_LABELS } from "./scope.mjs";

/**
 * Every finding the census can make, sorted by `<label> <target>`.
 *
 * @param {{frontier: object, functions: object[], callers: object[],
 *          policyHelpers: Set<string>, attributionNames?: Set<string>}} input
 * @returns {{label: string, target: string, detail: string}[]}
 */
export function collectFindings({ frontier, functions, callers, policyHelpers, attributionNames }) {
  const findings = [];
  const push = (label, target, detail) => findings.push({ label, target, detail });

  if (!frontier.matched) {
    push(
      "frontier_mismatch",
      "ledger-vs-disk",
      `clara.schema_migrations holds ${frontier.ledger_count} row(s) with max version `
      + `${JSON.stringify(frontier.ledger_max_version)}; packages/db/migrations holds `
      + `${frontier.disk_count} file(s) with max version ${JSON.stringify(frontier.disk_max_version)}. `
      + "The ledger is the frontier; a green chain is not a landed frontier.",
    );
  }

  for (const fn of functions) {
    if (fn.public_execute) {
      push("public_execute", fn.identity, `PUBLIC holds EXECUTE (acl ${JSON.stringify(fn.acl)}).`);
    }
  }

  // called_missing — one finding per named function, listing every call site.
  const missing = new Map();
  for (const c of callers) {
    if (c.resolved) continue;
    const key = `clara.${c.function}`;
    if (!missing.has(key)) missing.set(key, []);
    missing.get(key).push(`${c.file}:${c.line} (${c.lane})`);
  }
  for (const [target, sites] of [...missing.entries()].sort()) {
    push("called_missing", target, `no clara function of this name exists in the catalog; called from ${sites.sort().join(", ")}.`);
  }

  // called_ungranted — no role in the call site's lane can EXECUTE the resolved function.
  //
  // THE DECISION IS PER CALL SITE, and only `anyReachable` makes it. An earlier draft also
  // carried a `delete` on the accumulating map whenever one overload turned out to be
  // reachable. That branch was dead — its key was `<bare name> <lane>` while the map is keyed
  // `<target> <lane>`, and a target is an identity (`clara.f(uuid)`) or `clara.f`, so the two
  // never met — but reviving it "correctly" would be the actual bug: one REACHABLE call site
  // would erase a different, genuinely unreachable site already recorded under the same
  // (target, lane) key, and an ungranted lane would read clean because some other module in
  // the same lane could reach the door. opcen.10 pins this: two callers of one door in one
  // lane, the second reachable and the first not, and the first must still be reported.
  const ungranted = new Map();
  for (const c of callers) {
    if (!c.resolved) continue;
    const anyReachable = c.overloads.some((identity) => {
      const fn = functions.find((f) => f.identity === identity);
      return fn && c.lane_roles.some((role) => fn.granted_roles.includes(role));
    });
    if (anyReachable) continue;
    const target = c.overloads.length === 1 ? c.overloads[0] : `clara.${c.function}`;
    const key = `${target} ${c.lane}`;
    if (!ungranted.has(key)) ungranted.set(key, { target, lane: c.lane, roles: c.lane_roles, sites: [] });
    ungranted.get(key).sites.push(`${c.file}:${c.line} [${c.lane_source}]`);
  }
  for (const [, v] of [...ungranted.entries()].sort()) {
    push(
      "called_ungranted",
      v.target,
      `the ${v.lane} lane calls it as ${v.roles.join("/")}, none of which holds EXECUTE; call sites: ${v.sites.sort().join(", ")}.`,
    );
  }

  // named_arg_mismatch — PostgREST/named-argument resolution: some overload must accept
  // every key the caller sends AND receive every argument that has no default.
  const argIssues = new Map();
  for (const c of callers) {
    if (!c.resolved || !c.args || !c.args_complete) continue;
    const overloads = c.overloads.map((identity) => functions.find((f) => f.identity === identity)).filter(Boolean);
    const fits = overloads.find((fn) =>
      c.args.every((a) => fn.input_args.includes(a)) && fn.required_args.every((r) => c.args.includes(r)));
    if (fits) continue;
    const best = overloads[0];
    const target = best ? best.identity : `clara.${c.function}`;
    const unknown = best ? c.args.filter((a) => !best.input_args.includes(a)) : c.args;
    const missingReq = best ? best.required_args.filter((r) => !c.args.includes(r)) : [];
    if (!argIssues.has(target)) argIssues.set(target, []);
    argIssues.get(target).push(
      `${c.file}:${c.line} sends {${c.args.join(", ")}}`
      + (unknown.length ? `; not parameters of this function: ${unknown.join(", ")}` : "")
      + (missingReq.length ? `; missing required parameter(s): ${missingReq.join(", ")}` : ""),
    );
  }
  for (const [target, sites] of [...argIssues.entries()].sort()) {
    push("named_arg_mismatch", target, sites.sort().join(" | "));
  }

  // unattributed — a public function no rig-meta cohort claims. The cohorts are READ here.
  // `attributionNames` exists so a test can prove this label FIRES: remove one name from the
  // roster and exactly that door must fall out. It defaults to the real cohorts.
  const attributed = new Set([...RLS_HELPERS, ...policyHelpers]);
  const roster = attributionNames
    ?? new Set(Object.values(ALLOWED).flatMap((set) => [...set]));
  for (const name of roster) attributed.add(name);
  for (const fn of functions) {
    if (fn.boundary !== "public") continue;
    if (attributed.has(fn.name)) continue;
    push(
      "unattributed",
      fn.identity,
      `granted to ${fn.application_roles.join(", ") || "PUBLIC"} but no cohort in `
      + "packages/db/tests/rig-meta.mjs ALLOWED (nor RLS_HELPERS, nor a pg_policies helper) claims the name.",
    );
  }

  // granted_uncalled — informational.
  //
  // KNOWN LIMITATION, STATED RATHER THAN HIDDEN: this label groups by BARE NAME, so an
  // OVERLOAD that nothing calls is missed whenever a sibling overload of the same name is
  // called. It is not a grouping choice that could simply be changed to `fn.identity`: a
  // caller resolves to EVERY overload of the name it spells (`c.overloads`), because picking
  // one would need overload resolution the scanner cannot do. Measured at frontier 0177: all
  // three overloaded public names — consume_egress_dispatch, prepare_egress_dispatch,
  // settle_autodraft_task, two overloads each — are called ONLY from runtime SQL sites with
  // POSITIONAL arguments (`args: null`), so there is not even a named-argument key set to
  // narrow with; narrowing would require parsing the SQL argument expressions and inferring
  // their types, which is exactly the kind of inference this tool refuses elsewhere. The
  // exposure is therefore those 3 names out of 470 distinct public names, and the label is
  // informational to begin with — `called_ungranted` and `named_arg_mismatch`, which are the
  // HARD labels, are both per call site and unaffected.
  const calledNames = new Set(callers.filter((c) => c.resolved).map((c) => c.function));
  for (const fn of functions) {
    if (fn.boundary !== "public") continue;
    if (calledNames.has(fn.name)) continue;
    push("granted_uncalled", fn.identity, `granted to ${fn.application_roles.join(", ")}; no apps/web or packages/runtime call site names it.`);
  }

  findings.sort((a, b) => {
    const k = (x) => `${x.label} ${x.target}`;
    return k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0;
  });
  return findings;
}

/**
 * Apply the waiver set to `findings`, IN PLACE: each finding gains `waived` (always), and a
 * waived one gains the reason it was waived for.
 *
 * A waiver that matched nothing is returned as `waivers_unused` rather than dropped: a dead
 * exemption is a finding of its own — the thing it was written for is gone, so it now covers
 * nothing and would hide a recurrence unreviewed.
 *
 * @param {{label: string, target: string}[]} findings
 * @param {Map<string, {reason: string, expires_frontier?: string}>} waivers
 */
export function applyWaivers(findings, waivers) {
  const usedWaivers = new Set();
  for (const f of findings) {
    const key = `${f.label}:${f.target}`;
    const waiver = waivers.get(key);
    if (waiver) {
      f.waived = true;
      f.waiver_reason = waiver.reason;
      if (waiver.expires_frontier) f.waiver_expires_frontier = waiver.expires_frontier;
      usedWaivers.add(key);
    } else {
      f.waived = false;
    }
  }
  const waiversUnused = [...waivers.keys()].filter((k) => !usedWaivers.has(k)).sort();

  const countsBefore = Object.fromEntries(FINDING_LABELS.map((l) => [l, findings.filter((f) => f.label === l).length]));
  const countsAfter = Object.fromEntries(
    FINDING_LABELS.map((l) => [l, findings.filter((f) => f.label === l && !f.waived).length]),
  );
  return {
    waivers_applied: [...usedWaivers].sort().map((k) => ({ key: k, reason: waivers.get(k).reason })),
    waivers_unused: waiversUnused,
    counts: { before_waivers: countsBefore, after_waivers: countsAfter },
  };
}
