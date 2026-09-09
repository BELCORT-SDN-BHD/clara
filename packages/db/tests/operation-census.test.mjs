// #618 — THE OPERATION-CONTRACT CENSUS, as a live gate.
//
// WHAT THIS CELL IS FOR. `packages/db/scripts/operation-census.mjs` recomputes the public SQL
// operation boundary — every clara routine, who may EXECUTE it, and every call site in
// apps/web and packages/runtime that names it — from the LIVE catalog and the CURRENT sources.
// This file runs that census in-process and asserts the boundary is clean: nothing PUBLIC,
// nothing called that does not exist, nothing called by a lane that cannot reach it, no
// argument a function does not have, and nothing granted that no cohort in rig-meta.mjs claims.
//
// THE ASSERTIONS ARE NOT THE INTERESTING PART — the POSITIVE CONTROLS are. An analyser that
// reports zero because it cannot see is indistinguishable from a clean boundary, so every
// label this file asserts to be zero is also DELIBERATELY BROKEN here and proven to fire:
//   opcen.3  a caller naming a function that does not exist          -> called_missing
//   opcen.4  a REAL `grant execute ... to public`, inside a rolled-back transaction
//                                                                    -> public_execute
//   opcen.5  a caller sending a parameter the function does not have -> named_arg_mismatch
//   opcen.6  a lane calling an owner-only internal                   -> called_ungranted
//   opcen.7  the roster this census attributes against, emptied      -> unattributed
// and the waiver mechanism itself is proven ONE-ALLOWS-ONE-DENIES (opcen.8) plus refusing an
// under-explained exemption (opcen.9). opcen.10 pins the SHAPE of the called_ungranted rule:
// it is decided per CALL SITE, so one reachable caller may never absorb an unreachable one.
//
// FRONTIER (C33.1). The census reports the frontier from `clara.schema_migrations` — the
// LEDGER — never from a migration's own success text. opcen.2 re-reads the ledger directly
// and compares, so "the census says 172" can never drift from "the ledger says 172".
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ensureReady, endPool, getPool, rootQuery } from "./rig-helpers.mjs";
import { ALLOWED, RLS_HELPERS } from "./rig-meta.mjs";
import { runCensus, FINDING_LABELS, HARD_LABELS } from "../scripts/operation-census.mjs";
import { WAIVERS, validateWaivers, MIN_REASON_CHARS } from "./fixtures/operation-census-waivers.mjs";

/** The frontier this census was built against. Below it, the cell SKIPS — loudly. */
const REQUIRED_MIGRATION = "0177";

let ready = false;
let reason = "";
let census = null;

const query = (sql, params) => rootQuery(sql, params);

before(async () => {
  await ensureReady();
  const at = await rootQuery(
    "select count(*)::int as n, max(version) as frontier from clara.schema_migrations where version ~ $1",
    [`^${REQUIRED_MIGRATION}_`],
  );
  if (at.rows[0].n === 0) {
    const top = await rootQuery("select max(version) as v from clara.schema_migrations");
    reason = `the operation census describes the boundary at migration ${REQUIRED_MIGRATION} and above; `
      + `this database's ledger tops out at ${JSON.stringify(top.rows[0].v)}. SKIPPING — a census run `
      + "against an older frontier would report retired functions and missing grants as findings, "
      + "which says nothing about the boundary this file describes.";
    return;
  }
  ready = true;
  census = await runCensus({ query });
});
after(endPool);

function unready(t) {
  if (!ready) {
    t.skip(reason);
    return true;
  }
  return false;
}

// ===========================================================================================
// opcen.1 — the boundary is clean on every HARD label, after waivers.
// ===========================================================================================
test("opcen.1 the operation boundary carries no unwaived hard finding", async (t) => {
  if (unready(t)) return;
  assert.deepEqual(
    census.scan_errors,
    [],
    "a source file the caller census could not lex is a HOLE in the census, not a warning — "
    + "its call sites were not read at all",
  );
  for (const label of ["public_execute", "called_missing", "called_ungranted", "named_arg_mismatch", "unattributed"]) {
    const open = census.findings.filter((f) => f.label === label && !f.waived);
    assert.deepEqual(
      open.map((f) => `${f.target} — ${f.detail}`),
      [],
      `${label} is not zero after waivers`,
    );
  }
  // A waiver that matches nothing is a DEAD exemption: the finding it was written for is gone,
  // so the exemption now silently covers nothing and would hide a future recurrence unreviewed.
  assert.deepEqual(census.waivers_unused, [], "operation-census waivers that suppress no finding");
  // The census must actually have LOOKED at something. A run that read no catalog and no call
  // site would satisfy every assertion above.
  assert.ok(census.scope.catalog_functions > 500, `only ${census.scope.catalog_functions} clara routines were read`);
  assert.ok(census.scope.caller_sites > 200, `only ${census.scope.caller_sites} call sites were found`);
});

// ===========================================================================================
// opcen.2 — C33.1: the frontier is the LEDGER's, and it matches the ledger read directly.
// ===========================================================================================
test("opcen.2 the reported frontier is the ledger's own count and max version", async (t) => {
  if (unready(t)) return;
  const direct = await rootQuery("select count(*)::int as n, max(version) as v from clara.schema_migrations");
  assert.equal(census.frontier.ledger_count, direct.rows[0].n, "census ledger count differs from clara.schema_migrations");
  assert.equal(census.frontier.ledger_max_version, direct.rows[0].v, "census ledger max version differs from clara.schema_migrations");
  assert.equal(
    census.frontier.matched,
    true,
    `the ledger (${census.frontier.ledger_count} @ ${census.frontier.ledger_max_version}) and the migration files on disk `
    + `(${census.frontier.disk_count} @ ${census.frontier.disk_max_version}) disagree — a green chain is not a landed frontier`,
  );
  assert.deepEqual(census.findings.filter((f) => f.label === "frontier_mismatch"), []);
});

// ===========================================================================================
// POSITIVE CONTROLS — each label, deliberately broken, must be REPORTED.
// ===========================================================================================

const SYNTHETIC = (over = {}) => ({
  lane: "web",
  file: "packages/db/tests/operation-census.test.mjs",
  line: 0,
  function: "no_such_function_618",
  via: "callDoor",
  args: null,
  args_complete: false,
  lane_roles: ["clara_authenticated"],
  lane_source: "synthetic-control",
  ...over,
});

test("opcen.3 CONTROL called_missing: a caller naming a function the catalog does not have is reported", async (t) => {
  if (unready(t)) return;
  const broken = await runCensus({ query, extraCallers: [SYNTHETIC()] });
  const hit = broken.findings.filter((f) => f.label === "called_missing" && !f.waived);
  assert.deepEqual(hit.map((f) => f.target), ["clara.no_such_function_618"]);
  assert.equal(broken.counts.after_waivers.called_missing, 1);
});

// The GRANT below is REAL and lands on the shared rig, so it is confined to a transaction that
// always rolls back: an ACL change is invisible to every other session until COMMIT, which never
// happens here. (T17b's own PUBLIC-lockdown mechanism cell does its revoke uncommitted for the
// same reason.) The subject is chosen from the census — the alphabetically first owner-only
// function — rather than named here, so the control cannot rot into a function that was retired.
test("opcen.4 CONTROL public_execute: a real GRANT ... TO PUBLIC is detected, and the rollback clears it", async (t) => {
  if (unready(t)) return;
  const internal = census.functions.find((f) => f.boundary === "internal" && f.kind === "f");
  assert.ok(internal, "the catalog has no owner-only function to break — the control has no subject");
  const client = await getPool().connect();
  let inside = null;
  try {
    await client.query("reset role");
    await client.query("begin");
    await client.query(`grant execute on function ${internal.identity} to public`);
    inside = await runCensus({ query: (sql, params) => client.query(sql, params) });
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query("reset all").catch(() => {});
    client.release();
  }
  const leaked = inside.findings.filter((f) => f.label === "public_execute");
  assert.deepEqual(leaked.map((f) => f.target), [internal.identity], "the PUBLIC grant was not reported");
  // The same function must also stop being 'internal' the moment PUBLIC can reach it.
  assert.equal(inside.functions.find((f) => f.identity === internal.identity).boundary, "public");
  // …and the rollback must have put it back: re-read the catalog outside that transaction.
  const after = await runCensus({ query });
  assert.equal(after.counts.before_waivers.public_execute, 0, "the control's GRANT survived its own rollback");
  assert.equal(after.functions.find((f) => f.identity === internal.identity).boundary, "internal");
});

test("opcen.5 CONTROL named_arg_mismatch: a parameter the function does not have is reported", async (t) => {
  if (unready(t)) return;
  const door = census.functions.find((f) => f.boundary === "public" && f.input_args.length > 0
    && f.required_args.length === f.input_args.length);
  assert.ok(door, "no fully-required public door to build the control on");
  const broken = await runCensus({
    query,
    extraCallers: [SYNTHETIC({
      function: door.name,
      args: [...door.input_args, "p_not_a_parameter_618"].sort(),
      args_complete: true,
    })],
  });
  const hit = broken.findings.filter((f) => f.label === "named_arg_mismatch" && !f.waived);
  assert.equal(hit.length, 1, `expected exactly one named_arg_mismatch, got ${JSON.stringify(hit)}`);
  assert.match(hit[0].detail, /p_not_a_parameter_618/);
  // The SAME caller with only real parameter names must be silent — the control proves the
  // detector reacts to the injected name, not merely to the presence of a synthetic caller.
  const clean = await runCensus({
    query,
    extraCallers: [SYNTHETIC({ function: door.name, args: [...door.input_args].sort(), args_complete: true })],
  });
  assert.equal(clean.counts.after_waivers.named_arg_mismatch, 0);
});

test("opcen.6 CONTROL called_ungranted: a lane calling an owner-only internal is reported", async (t) => {
  if (unready(t)) return;
  const internal = census.functions.find((f) => f.boundary === "internal" && f.kind === "f");
  const broken = await runCensus({
    query,
    extraCallers: [SYNTHETIC({ lane: "runtime", function: internal.name, lane_roles: ["clara_runtime"] })],
  });
  const hit = broken.findings.filter((f) => f.label === "called_ungranted" && !f.waived);
  assert.deepEqual(hit.map((f) => f.target), [internal.identity]);
});

test("opcen.7 CONTROL unattributed: a public door no cohort claims is reported", async (t) => {
  if (unready(t)) return;
  // Break the ATTRIBUTION SOURCE, not the catalog. rig-meta.mjs's cohorts are what this label
  // reports against, so removing ONE name from them must make exactly that door — and nothing
  // else — fall out. One allows, one denies, applied to attribution.
  const roster = new Set(Object.values(ALLOWED).flatMap((set) => [...set]));
  assert.ok(roster.size > 100, "rig-meta ALLOWED is the attribution source and it is nearly empty");
  const publicDoors = census.functions.filter((f) => f.boundary === "public");
  assert.ok(publicDoors.length > 100, `only ${publicDoors.length} public doors — the control has no subject`);
  // A door claimed by a cohort, with exactly one overload and no RLS-helper/policy standing
  // (both of which attribute a name independently of ALLOWED).
  const byName = new Map();
  for (const f of publicDoors) byName.set(f.name, (byName.get(f.name) ?? 0) + 1);
  const subject = publicDoors.find((f) => roster.has(f.name) && byName.get(f.name) === 1 && !RLS_HELPERS.has(f.name));
  assert.ok(subject, "no single-overload cohort door to build the control on");
  roster.delete(subject.name);
  const broken = await runCensus({ query, attributionNames: roster });
  const hit = broken.findings.filter((f) => f.label === "unattributed" && !f.waived);
  assert.deepEqual(
    hit.map((f) => f.target),
    [subject.identity],
    "retiring one name from the cohorts must unattribute exactly that door",
  );
});

// ===========================================================================================
// opcen.8 / opcen.9 — the waiver mechanism itself.
// ===========================================================================================
test("opcen.8 CONTROL waivers: one allows, one denies — a waiver suppresses exactly its own target", async (t) => {
  if (unready(t)) return;
  // `granted_uncalled` is the informational label, so this control can borrow two of its real
  // targets without touching a waiver that gates anything.
  const targets = census.findings.filter((f) => f.label === "granted_uncalled").map((f) => f.target);
  assert.ok(targets.length >= 2, "need two same-label findings to prove a waiver is not a blanket");
  const [allowed, denied] = targets;
  const reasonText = "one-allows-one-denies control: this exact target is suppressed and its sibling is not";
  assert.ok(reasonText.length >= MIN_REASON_CHARS);
  const scoped = await runCensus({
    query,
    waivers: new Map([[`granted_uncalled:${allowed}`, { reason: reasonText }]]),
  });
  const byTarget = new Map(scoped.findings.filter((f) => f.label === "granted_uncalled").map((f) => [f.target, f]));
  assert.equal(byTarget.get(allowed).waived, true, `${allowed} should be suppressed by its own waiver`);
  assert.equal(byTarget.get(denied).waived, false, `${denied} must still be reported — a waiver is not a blanket`);
  assert.equal(
    scoped.counts.after_waivers.granted_uncalled,
    scoped.counts.before_waivers.granted_uncalled - 1,
    "exactly one finding may be suppressed by one waiver",
  );
  // The same waiver key under a DIFFERENT label suppresses nothing: the pair is the key.
  const wrongLabel = await runCensus({
    query,
    waivers: new Map([[`public_execute:${allowed}`, { reason: reasonText }]]),
  });
  assert.equal(wrongLabel.counts.after_waivers.granted_uncalled, wrongLabel.counts.before_waivers.granted_uncalled);
  assert.deepEqual(wrongLabel.waivers_unused, [`public_execute:${allowed}`]);
});

test("opcen.9 CONTROL waivers: an under-explained or blanket exemption is REFUSED", async (t) => {
  if (unready(t)) return;
  const target = "clara.no_such_function_618()";
  assert.throws(
    () => validateWaivers(new Map([[`called_missing:${target}`, { reason: "reviewed, fine" }]])),
    /at least 40 characters/,
    "a waiver reason under 40 characters must be refused",
  );
  assert.throws(
    () => validateWaivers(new Map([["called_missing:*", { reason: "a".repeat(MIN_REASON_CHARS) }]])),
    /does not name exactly one target/,
    "a wildcard target must be refused — there is no function-level blanket exemption",
  );
  assert.throws(
    () => validateWaivers(new Map([[`not_a_label:${target}`, { reason: "a".repeat(MIN_REASON_CHARS) }]])),
    /unknown label/,
    "a waiver that can never match a label must be refused, not silently carried",
  );
  assert.throws(
    () => validateWaivers(new Map([["no-colon-here", { reason: "a".repeat(MIN_REASON_CHARS) }]])),
    /is not "<label>:<target>"/,
  );
  // The shipped set passes its own validator, and every label it names is a real one.
  validateWaivers(WAIVERS);
  for (const key of WAIVERS.keys()) {
    assert.ok(FINDING_LABELS.includes(key.slice(0, key.indexOf(":"))), `${key} names an unknown label`);
  }
  assert.ok(HARD_LABELS.every((l) => FINDING_LABELS.includes(l)));
});

// ===========================================================================================
// opcen.10 — called_ungranted is decided PER CALL SITE, not per (function, lane).
//
// THE REGRESSION THIS EXISTS FOR. The detector accumulates its call sites into a map keyed by
// (target, lane). A first draft ALSO carried a `delete` on that map whenever some overload of
// the current caller turned out to be reachable. It was dead code — the key it deleted was
// `<bare name> <lane>` and the map is keyed `<target> <lane>` — so removing it changed nothing;
// what matters is that "fixing" the key would have been the real defect. This cell puts two
// callers of ONE door in ONE lane on the boundary, the unreachable one FIRST, and requires the
// unreachable one to still be reported. Under a working delete the second, reachable caller
// would erase the first and the boundary would read clean.
// ===========================================================================================
test("opcen.10 CONTROL called_ungranted survives a reachable sibling call site in the same lane", async (t) => {
  if (unready(t)) return;
  const overloadCount = new Map();
  for (const f of census.functions) overloadCount.set(f.name, (overloadCount.get(f.name) ?? 0) + 1);
  const alreadyOpen = new Set(census.findings.filter((f) => f.label === "called_ungranted").map((f) => f.target));
  const roles = census.scope.application_roles;
  // One door, one overload (so the finding's target is the identity), reachable by at least one
  // application role and NOT reachable by at least one other, and not already reported.
  const door = census.functions.find((f) => f.boundary === "public"
    && overloadCount.get(f.name) === 1
    && f.application_roles.length > 0
    && roles.some((r) => !f.granted_roles.includes(r))
    && !alreadyOpen.has(f.identity));
  assert.ok(door, "no single-overload public door with a reachable and an unreachable role — the control has no subject");
  const reachableRole = door.application_roles[0];
  const unreachableRole = roles.find((r) => !door.granted_roles.includes(r));
  assert.ok(!door.granted_roles.includes(unreachableRole), `${unreachableRole} must NOT hold EXECUTE on ${door.identity}`);

  const unreachableSite = SYNTHETIC({
    function: door.name, line: 1, lane_roles: [unreachableRole], lane_source: "synthetic-unreachable",
  });
  const reachableSite = SYNTHETIC({
    function: door.name, line: 2, lane_roles: [reachableRole], lane_source: "synthetic-reachable",
  });
  const broken = await runCensus({ query, extraCallers: [unreachableSite, reachableSite] });

  // The premise: callers sort by `lane file line function`, so the UNREACHABLE site is seen
  // first and is already in the map when the reachable one is read. Without this ordering the
  // cell would pass under a working delete and prove nothing.
  const seen = broken.callers.map((c) => c.lane_source);
  assert.ok(
    seen.indexOf("synthetic-unreachable") < seen.indexOf("synthetic-reachable"),
    "the control's unreachable call site must be processed BEFORE the reachable one",
  );

  const hits = broken.findings.filter((f) => f.label === "called_ungranted" && f.target === door.identity);
  assert.equal(hits.length, 1, `expected ${door.identity} to be reported once, got ${JSON.stringify(hits)}`);
  assert.equal(hits[0].waived, false);
  assert.match(hits[0].detail, /synthetic-unreachable/, "the finding must name the unreachable call site");
  assert.doesNotMatch(hits[0].detail, /synthetic-reachable/, "a reachable call site is not a called_ungranted site");

  // One allows, one denies: the REACHABLE caller alone must produce nothing for this door, so
  // the cell reacts to the lane's roles and not merely to a synthetic caller being present.
  const clean = await runCensus({ query, extraCallers: [reachableSite] });
  assert.deepEqual(
    clean.findings.filter((f) => f.label === "called_ungranted" && f.target === door.identity),
    [],
    "a call site whose lane HOLDS execute must not be reported",
  );
});
