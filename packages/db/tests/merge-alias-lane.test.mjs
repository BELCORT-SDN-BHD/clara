// #889 — the counterparty merge door's residue alias write names its recording lane.
// Migration of record: packages/db/migrations/0289_merge_alias_lane.sql.
// Ticket of record: issue #889, narrowed by its 2026-09-20 triage comment: the brief's other
// residue writer, clara.tick_seeding_proposal, is not covered here — #1012 (0288, this same
// lane, applied first) removed its insert outright, so this file drives ONE door.
//
// EVERY ASSERTION RUNS THROUGH `humanQuery` — a real least-privileged `clara_authenticated`
// session with a real JWT sub, at the rank the cell names. `rootQuery` is used ONLY to build
// the world and to read the catalog / the revision log / the event spine for readback.
//
// THE GATE. `merge-alias-lane-preintegration-gate.mjs` is preloaded by the package-wide
// `pnpm test` script, so on a chain that has NOT applied 0289 this battery skips LOUDLY. A
// FOCUSED invocation does not preload it and therefore FAILS — a cell that only ever skips is
// a false green (the client-birth-wall.test.mjs / counterparty-identity.test.mjs precedent).
// The readiness probe is a body-sha check, not a to_regproc/column presence check: 0289 adds no
// new catalog object, only a body splice, so "applied" is a BEHAVIOUR frontier rather than a
// structural one — the same reason 0289 itself pins clara.merge_counterparties both ways.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rootQuery, endPool } from "./rig-helpers.mjs";
import { identityCohortApplied, identityWorld, createCounterparty, mergeCounterparties, revisionRows } from "./counterparty-identity-fixtures.mjs";

const MERGE_ALIAS_LANE_POST_SHA = "2e4cb1af232e4b9ef6eec18c9b147fe0d2beefe40fff5b04d31d2b8d4782f8f9";

let applied = false;
let ready = false;
let w = null;

before(async () => {
  applied = await identityCohortApplied();
  if (applied) {
    w = await identityWorld("p889");
    const r = await rootQuery(
      `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p
        where p.oid='clara.merge_counterparties(uuid,uuid,uuid,text,text)'::regprocedure`);
    ready = r.rows[0]?.sha === MERGE_ALIAS_LANE_POST_SHA;
  }
});
after(async () => { await endPool(); });

/** FAIL-CLOSED unless the pre-0289 shape is DECLARED by the package-wide gate module. */
function need(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_MERGE_ALIAS_LANE === "1") {
    t.skip("0289 merge-alias-lane cohort absent and the pre-0289 shape is DECLARED (CLARA_ALLOW_MISSING_MERGE_ALIAS_LANE=1)");
    return true;
  }
  assert.fail("the #889 merge-alias-lane cohort (0289) is absent and nothing declared a pre-0289 database — set CLARA_ALLOW_MISSING_MERGE_ALIAS_LANE=1 only when that is deliberate");
  return true;
}

const name = (p) => `${p}-${randomUUID().slice(0, 8)}`;

// ===========================================================================
// AC1 — THE MERGE'S ALIAS, ITS REVISION AND ITS EVENT AGREE ON THE HUMAN LANE.
// ===========================================================================

test("p889.merge.human_lane — a merge's residue alias, its identity revision (on BOTH parties) and its emitted event all carry recorded_via='human_ui' and agree", async (t) => {
  if (need(t)) return;
  const survivor = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("SURV") });
  const merged = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("DUPE") });
  const res = await mergeCounterparties(w.bookkeeper, { client: w.clientA, survivor, merged });
  assert.ok(res.merge_id, "p889.merge.human_lane: the receipt carries merge_id");

  // The alias row itself — the merged party's former name, planted on the survivor.
  const carrier = await rootQuery("select alias_id from clara.counterparty_merges where id=$1", [res.merge_id]);
  const aliasId = carrier.rows[0]?.alias_id;
  assert.ok(aliasId, "p889.merge.human_lane: the merge created an alias and the carrier recorded its id (M12)");
  const alias = await rootQuery("select recorded_via from clara.counterparty_aliases where id=$1", [aliasId]);
  assert.equal(alias.rows[0].recorded_via, "human_ui",
    "p889.merge.human_lane: the alias row names the human lane, not the legacy_unknown default");

  // The identity revision log: TWO acts land from ONE merge — 'alias_added' on the SURVIVOR
  // (t_counterparty_aliases_revision, which copies new.recorded_via verbatim) and 'merged' on
  // the MERGED party (t_counterparty_merge_revision, which derives human_ui from the session
  // subject). Before #889 these disagreed for the SAME human act; this cell is the regression
  // guard that they no longer do.
  const survivorRevisions = await revisionRows(survivor);
  const aliasAdded = survivorRevisions.find((r) => r.act === "alias_added" && r.alias_id === aliasId);
  assert.ok(aliasAdded, "p889.merge.human_lane: the survivor's revision log carries the alias_added act for this merge's alias");
  assert.equal(aliasAdded.recorded_via, "human_ui", "p889.merge.human_lane: alias_added agrees with the alias row");

  const mergedRevisions = await revisionRows(merged);
  const mergedAct = mergedRevisions.find((r) => r.act === "merged");
  assert.ok(mergedAct, "p889.merge.human_lane: the merged party's revision log carries the merged act");
  assert.equal(mergedAct.recorded_via, "human_ui",
    "p889.merge.human_lane: merged agrees with alias_added — the two acts of one merge no longer disagree about their own lane");

  // The emitted event: clara._tf_counterparty_alias_revision reads new.recorded_via straight
  // onto counterparty.alias_added's payload (0215), so fixing the WRITE fixes this for free —
  // no trigger edit, exactly as the ticket's key interfaces name it.
  const event = await rootQuery(
    `select payload from clara.domain_events where event_type='counterparty.alias_added'
       and client_id=$1 and (payload->>'alias_id')::uuid=$2 order by seq desc limit 1`,
    [w.clientA, aliasId]);
  assert.equal(event.rows[0]?.payload?.recorded_via, "human_ui",
    "p889.merge.human_lane: the emitted counterparty.alias_added event agrees too");
});

// ===========================================================================
// AC3 — THE CLOSED-WORLD CENSUS: NO APPLICATION-REACHABLE WRITER CAN STILL LAND
// legacy_unknown. Structural, catalog-only — the same instrument 0289's own migration tail
// runs at apply time, run again here so drift is caught by the daily battery, not only at
// migration-apply time.
// ===========================================================================

test("p889.census.no_legacy_writer — every clara-schema function reachable from an application role that inserts into clara.counterparty_aliases names recorded_via in its own code, and the roster is closed at exactly the three human doors 0215 floors", async (t) => {
  if (need(t)) return;
  const roles = ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_runtime"];
  const r = await rootQuery(
    `select p.proname, p.prosrc
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and position('into clara.counterparty_aliases(' in p.prosrc) > 0
        and exists (select 1 from unnest($1::text[]) role_name
                     where has_function_privilege(role_name, p.oid, 'execute'))
      order by p.proname`,
    [roles]);
  assert.deepEqual(r.rows.map((row) => row.proname),
    ["add_counterparty_alias", "merge_counterparties", "rename_counterparty"],
    "p889.census.no_legacy_writer: the closed roster of application-reachable counterparty_aliases writers — a fourth member (or a dropped one) means this census must be re-derived, not silently widened");
  for (const row of r.rows) {
    // Comment-stripped, so a body that lost the column from its CODE while keeping the word
    // in a COMMENT would still fail this (the 0149 M2 drift-guard shape).
    const code = row.prosrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
    const pos = code.indexOf("into clara.counterparty_aliases(");
    const end = code.indexOf("values(", pos);
    assert.ok(end > pos, `p889.census.no_legacy_writer: clara.${row.proname} — could not find the matching values( after its counterparty_aliases insert`);
    const cols = code.slice(pos, end);
    assert.ok(cols.includes("recorded_via"),
      `p889.census.no_legacy_writer: clara.${row.proname} must name recorded_via IN CODE in its own insert column list`);
  }

  // tick_seeding_proposal is absent from the roster above not because a grant filter merely
  // stopped counting it, but because #1012 (0288) removed its insert outright — checked
  // directly so this cell does not silently pass if that ever regressed.
  const seeder = await rootQuery(
    `select position('into clara.counterparty_aliases(' in prosrc) > 0 as writes
       from pg_proc where oid='clara.tick_seeding_proposal(uuid,text)'::regprocedure`);
  assert.equal(seeder.rows[0].writes, false,
    "p889.census.no_legacy_writer: tick_seeding_proposal contains no counterparty_aliases insert at all (0288's retirement) — the ticket's narrowing is not merely a filed exemption");
});
