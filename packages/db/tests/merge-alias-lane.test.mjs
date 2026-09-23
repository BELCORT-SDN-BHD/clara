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
import {
  caught, identityCohortApplied, identityWorld, createCounterparty, mergeCounterparties, reasonOf, revisionRows,
} from "./counterparty-identity-fixtures.mjs";

const MERGE_ALIAS_LANE_POST_SHA = "ac31da36065caa5f3682d7792d6bad2c49ffd06665adfef6e343f64107f228e7";

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
// THE DOOR IS NOT AN EXISTENCE ORACLE. Fix round 1, review finding W3L07-ADV-03: a foreign
// firm's REAL counterparty id used to answer CLR23 `cross_client` while an id that exists
// nowhere answered CLR11, so a firm could test whether an arbitrary uuid was live somewhere
// else in the estate. `rig-helpers.mjs`'s own CLR taxonomy states the law this broke:
// `notFound: "CLR11", // not-found-in-your-firm (NO existence oracle)`.
// ===========================================================================

test("p889.merge.no_cross_tenant_oracle — another firm's REAL counterparty is indistinguishable from one that exists nowhere (both CLR11), while a SAME-firm different-client pair still answers CLR23 cross_client", async (t) => {
  if (need(t)) return;
  const mine = await createCounterparty(w.bookkeeper, { client: w.clientA, name: name("MINE") });
  const foreignSurvivor = await createCounterparty(w.otherAdmin, { client: w.otherClient, name: name("FOR-S") });
  const foreignMerged = await createCounterparty(w.otherAdmin, { client: w.otherClient, name: name("FOR-M") });

  // THE TWO ANSWERS THAT MUST AGREE, asked by the SAME caller with the SAME client id.
  const foreign = await caught(() => mergeCounterparties(w.bookkeeper,
    { client: w.clientA, survivor: foreignSurvivor, merged: foreignMerged }));
  const nowhere = await caught(() => mergeCounterparties(w.bookkeeper,
    { client: w.clientA, survivor: randomUUID(), merged: randomUUID() }));
  assert.ok(foreign && nowhere, "p889.merge.no_cross_tenant_oracle: both probes must refuse");
  assert.equal(foreign.code, "CLR11",
    "p889.merge.no_cross_tenant_oracle: a counterparty outside the caller's firm is NOT FOUND, never a cross-client refusal that confirms it exists");
  assert.equal(foreign.code, nowhere.code, "the two refusals must carry the same code");
  assert.equal(foreign.message, nowhere.message, "…the same message");
  assert.equal(reasonOf(foreign), reasonOf(nowhere), "…and the same typed reason");

  // MIXED: one of mine, one foreign — the same answer, for the same reason.
  const mixed = await caught(() => mergeCounterparties(w.bookkeeper,
    { client: w.clientA, survivor: mine, merged: foreignMerged }));
  assert.equal(mixed.code, "CLR11", "one foreign id is enough to make the pair not-found");
  assert.equal(mixed.message, nowhere.message);

  // AND THE LEGITIMATE REFUSAL SURVIVES. Two counterparties of the caller's OWN firm under
  // DIFFERENT clients is a real cross-client mistake the caller is entitled to be told about,
  // and it keeps its own CLR23 token (counterparty-merge-pr-1.test.mjs's cm.19/3 pins it).
  const sibling = await createCounterparty(w.bookkeeper, { client: w.clientB, name: name("SIB") });
  const cross = await caught(() => mergeCounterparties(w.bookkeeper,
    { client: w.clientA, survivor: mine, merged: sibling }));
  assert.equal(reasonOf(cross), "cross_client",
    "p889.merge.no_cross_tenant_oracle: a same-firm, different-client pair still answers cross_client — this fix narrows the oracle, it does not blunt the door");
});

// ===========================================================================
// AC3 — THE CLOSED-WORLD CENSUS: NO APPLICATION-REACHABLE WRITER CAN STILL LAND
// legacy_unknown. Structural, catalog-only — the same instrument 0289's own migration tail
// runs at apply time, run again here so drift is caught by the daily battery, not only at
// migration-apply time.
// ===========================================================================

/** SQL comments off, so a body that lost the column from its CODE while keeping the word in a
 *  COMMENT still fails the census (the 0149 M2 drift-guard shape). */
const stripSqlComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

/** The text between `open` and its MATCHING close paren, depth-aware, scanning from `from`. */
function parenthesised(code, open, from) {
  const start = code.indexOf(open, from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start + open.length - 1; i < code.length; i += 1) {
    if (code[i] === "(") depth += 1;
    else if (code[i] === ")") {
      depth -= 1;
      if (depth === 0) return { inner: code.slice(start + open.length, i), end: i };
    }
  }
  return null;
}

/** Split a SQL expression list on its TOP-LEVEL commas only: `format('a, %s', btrim(x))` is ONE
 *  element, not three. Quoted literals are skipped whole (doubled quotes included). */
function splitTopLevel(list) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (let i = 0; i < list.length; i += 1) {
    const ch = list[i];
    if (quoted) {
      current += ch;
      if (ch === "'") {
        if (list[i + 1] === "'") { current += list[i + 1]; i += 1; } else quoted = false;
      }
      continue;
    }
    if (ch === "'") { quoted = true; current += ch; continue; }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { out.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

/** EVERY `insert into clara.counterparty_aliases(...) values(...)` in one body, not only the
 *  first — a second insert further down used to be invisible to this census. */
function aliasInserts(prosrc, label) {
  const code = stripSqlComments(prosrc);
  const found = [];
  let cursor = 0;
  for (;;) {
    const at = code.indexOf("into clara.counterparty_aliases(", cursor);
    if (at < 0) return found;
    const cols = parenthesised(code, "into clara.counterparty_aliases(", at);
    assert.ok(cols, `${label}: an alias insert has unbalanced parentheses at offset ${at}`);
    const vals = parenthesised(code, "values(", cols.end);
    assert.ok(vals, `${label}: an alias insert has no matching values( after its column list`);
    found.push({
      columns: splitTopLevel(cols.inner).map((c) => c.trim().toLowerCase()),
      values: splitTopLevel(vals.inner),
    });
    cursor = vals.end;
  }
}

/** The lanes a door may hard-write (0215's four-value CHECK, minus the `legacy_unknown` DEFAULT
 *  the residue used to land — the one value no writer may name). */
const HONEST_LANES = ["'human_ui'", "'agent'", "'seeding'"];

test("p889.census.no_legacy_writer — every clara-schema function reachable from an application role that inserts into clara.counterparty_aliases WRITES a literal honest lane at recorded_via, in EVERY one of its inserts, and the roster is closed on the SIGNATURE at exactly the three human doors 0215 floors", async (t) => {
  if (need(t)) return;
  const roles = ["clara_authenticated", "clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_runtime"];
  const r = await rootQuery(
    `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
            p.proname, p.prosrc
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara'
        and position('into clara.counterparty_aliases(' in p.prosrc) > 0
        and exists (select 1 from unnest($1::text[]) role_name
                     where has_function_privilege(role_name, p.oid, 'execute'))
      order by 1`,
    [roles]);
  // CLOSED ON THE IDENTITY, NOT THE BARE NAME (fix round 1, review finding W3L07-ADV-05): an
  // OVERLOAD of one of these three would collapse into the same member under a proname-only
  // roster and could carry an entirely different insert.
  assert.deepEqual(r.rows.map((row) => row.sig),
    [
      "add_counterparty_alias(p_client uuid, p_counterparty uuid, p_alias text, p_origin text, p_op_key text, p_basis text, p_source_document uuid, p_source_extraction uuid, p_source_region uuid, p_source_field_path text)",
      "merge_counterparties(p_client uuid, p_survivor uuid, p_merged uuid, p_reason text, p_op_key text)",
      "rename_counterparty(p_client uuid, p_counterparty uuid, p_new_name text, p_op_key text)",
    ],
    "p889.census.no_legacy_writer: the closed roster of application-reachable counterparty_aliases writers — a fourth member, a dropped one, or a NEW OVERLOAD of one of these three means this census must be re-derived, not silently widened");

  let inspected = 0;
  for (const row of r.rows) {
    const label = `p889.census.no_legacy_writer: clara.${row.proname}`;
    const inserts = aliasInserts(row.prosrc, label);
    assert.ok(inserts.length >= 1, `${label} — no parsable alias insert found`);
    for (const [n, ins] of inserts.entries()) {
      const at = ins.columns.indexOf("recorded_via");
      assert.ok(at >= 0, `${label} insert #${n + 1} must name recorded_via IN CODE in its own insert column list`);
      assert.equal(ins.values.length, ins.columns.length,
        `${label} insert #${n + 1} — ${ins.columns.length} columns but ${ins.values.length} values, so the positional read below would be meaningless`);
      // THE VALUE, NOT ONLY THE COLUMN NAME. A body that named the column and then bound it to a
      // variable, a parameter or the default's own literal passed the earlier census unchanged.
      const written = ins.values[at];
      assert.ok(HONEST_LANES.includes(written),
        `${label} insert #${n + 1} writes ${JSON.stringify(written)} at recorded_via. A writer must hard-write one of `
        + `${HONEST_LANES.join(", ")} — never legacy_unknown, and never a variable or parameter a caller could steer`);
      inspected += 1;
    }
  }
  assert.ok(inspected >= 3, `p889.census.no_legacy_writer: only ${inspected} insert site(s) inspected across three writers`);

  // THE INSTRUMENT IS NOT VACUOUS. Read against a crafted body, it must see BOTH inserts (the
  // earlier census only ever looked at the first), must not be fooled by a comma inside a
  // function call in the values list, and must read the VALUE rather than the column name — the
  // three ways a writer could have kept its `legacy_unknown` while passing the old shape.
  const crafted = `
    -- insert into clara.counterparty_aliases(recorded_via) values('human_ui')  <- a comment
    insert into clara.counterparty_aliases(firm_id,recorded_via,recorded_basis)
      values(c.firm,'human_ui',format('a, b %s', btrim(x)));
    insert into clara.counterparty_aliases(firm_id,recorded_via)
      values(c.firm,v_lane);`;
  const probe = aliasInserts(crafted, "vacuity probe");
  assert.equal(probe.length, 2, "the census must see EVERY insert in a body, not only the first");
  assert.deepEqual(probe[0].values,
    ["c.firm", "'human_ui'", "format('a, b %s', btrim(x))"],
    "a comma inside a function call must not split the values list");
  assert.equal(HONEST_LANES.includes(probe[0].values[probe[0].columns.indexOf("recorded_via")]), true);
  assert.equal(HONEST_LANES.includes(probe[1].values[probe[1].columns.indexOf("recorded_via")]), false,
    "a body that NAMES recorded_via and then binds it to a variable must fail this census");

  // tick_seeding_proposal is absent from the roster above not because a grant filter merely
  // stopped counting it, but because #1012 (0288) removed its insert outright — checked
  // directly so this cell does not silently pass if that ever regressed.
  const seeder = await rootQuery(
    `select position('into clara.counterparty_aliases(' in prosrc) > 0 as writes
       from pg_proc where oid='clara.tick_seeding_proposal(uuid,text)'::regprocedure`);
  assert.equal(seeder.rows[0].writes, false,
    "p889.census.no_legacy_writer: tick_seeding_proposal contains no counterparty_aliases insert at all (0288's retirement) — the ticket's narrowing is not merely a filed exemption");
});
