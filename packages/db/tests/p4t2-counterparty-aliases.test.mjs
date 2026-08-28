// P4 tranche-2 -- 裁-11: clara.counterparty_aliases gains a human read the table carried zero of.
// T8's rung-0 finding: no clara_authenticated grant at all, not merely no policy -- both close
// here.
//
// ROUND 4 CORRECTION (rev-p4t2's full estate suite, a real merge-blocker round 1-3 missed): the
// FIRST attempt (a direct clara_authenticated grant + policy on the base table, copying
// clara.counterparties' own shape) violated wave-a-shape.test.mjs's §13 invariant --
// counterparty_aliases is a member of the fn-fronted-only table family, which counterparties
// itself is NOT. The mechanism is now a masked view, clara.counterparty_aliases_visible, in this
// tranche's own firm_registration_requests_visible idiom (§E of the migration) -- see the
// migration's own §F header for the full account. Every cell below now reads through the VIEW,
// never the base table directly.

import test from "node:test";
import assert from "node:assert/strict";
import { opk, rootQuery, humanQuery, insertUser, createFirm, createClient, seedAdmission } from "./rig-fixtures.mjs";
import { createCounterparty, addAlias } from "./wave-a-fixtures.mjs";

async function scene(tag) {
  const owner = await insertUser("p4t2ca", `${tag}_owner`);
  const token = await seedAdmission(`p4t2-ca-${tag}`);
  const firm = await createFirm(owner, { name: `P4T2 Aliases ${tag} ${Date.now()}`, token, opKey: opk(`cafirm_${tag}`) });
  const viewer = await insertUser("p4t2ca", `${tag}_viewer`);
  await humanQuery(owner, "select clara.add_member(p_firm => $1, p_user => $2, p_role => $3, p_op_key => $4)", [
    firm, viewer, "viewer", opk(`addviewer_${tag}`),
  ]);
  const client = await createClient(owner, { name: `${tag} Client`, opKey: opk(`client_${tag}`) });
  const cpReceipt = await createCounterparty(owner, { client, kind: "vendor", name: `${tag} Vendor`, opKey: opk(`cp_${tag}`) });
  return { firm, owner, viewer, client, counterparty: cpReceipt.counterparty_id };
}

test("p4t2.counterparty_aliases: [裁-11] a firm member (viewer, no rank floor) can now read the firm's own aliases via counterparty_aliases_visible", async () => {
  const sc = await scene("read");
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "TNB", origin: "human", opKey: opk("read-alias") });
  const r = await humanQuery(sc.viewer, "select alias_display, counterparty_id from clara.counterparty_aliases_visible", []);
  assert.equal(r.rows.length, 1, "before this migration, clara_authenticated had ZERO grant anywhere on this data -- this read must now succeed, through the view");
  assert.equal(r.rows[0].alias_display, "TNB");
  assert.equal(r.rows[0].counterparty_id, sc.counterparty);
});

test("p4t2.counterparty_aliases: the BASE TABLE refuses clara_authenticated directly -- CLR (undefined_table / insufficient_privilege), the mask is not bypassable", async () => {
  const sc = await scene("bypass");
  await assert.rejects(
    () => humanQuery(sc.owner, "select 1 from clara.counterparty_aliases limit 1", []),
    /permission denied|does not exist/i,
    "clara_authenticated must never reach the base table directly (wave-a-shape's fn-fronted-only invariant)",
  );
});

test("p4t2.counterparty_aliases: cross-firm isolation through the VIEW -- firm B's member sees ZERO of firm A's aliases, positive control through firm A's own owner sees them", async () => {
  const scA = await scene("crossA");
  const scB = await scene("crossB");
  await addAlias(scA.owner, { client: scA.client, counterparty: scA.counterparty, alias: "Cross Alias A", origin: "human", opKey: opk("crossA-alias") });
  const r = await humanQuery(scB.owner, "select id from clara.counterparty_aliases_visible", []);
  assert.equal(r.rows.length, 0);
  // Positive control -- the SAME view, queried as firm A's own owner, DOES see it -- the zero
  // above is the firm predicate excluding it, not a broken read entirely.
  const positive = await humanQuery(scA.owner, "select id from clara.counterparty_aliases_visible", []);
  assert.equal(positive.rows.length, 1);
});

test("p4t2.counterparty_aliases: an unscoped SELECT from a member returns EXACTLY that firm's aliases, closed-world, through the view", async () => {
  const sc = await scene("closedworld");
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "Closed World One", origin: "human", opKey: opk("cw-1") });
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "Closed World Two", origin: "trade_name", opKey: opk("cw-2") });
  const other = await scene("closedworld_other");
  await addAlias(other.owner, { client: other.client, counterparty: other.counterparty, alias: "Other Firm Alias", origin: "human", opKey: opk("cw-other") });
  const r = await humanQuery(sc.owner, "select alias_display from clara.counterparty_aliases_visible order by alias_display", []);
  assert.deepEqual(r.rows.map((row) => row.alias_display), ["Closed World One", "Closed World Two"]);
});

test("p4t2.counterparty_aliases: grant matrix -- the BASE TABLE carries ZERO app-role grant beyond its pre-existing clara_freeform_ro read (wave-a-shape §13's own invariant); the VIEW carries clara_authenticated=SELECT exactly, and agent/wake/runtime gain ZERO on either", async () => {
  const [baseGrants, viewGrants] = await Promise.all([
    rootQuery(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'clara' and table_name = 'counterparty_aliases' order by grantee, privilege_type`,
    ),
    rootQuery(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'clara' and table_name = 'counterparty_aliases_visible' order by grantee, privilege_type`,
    ),
  ]);
  const byRole = (rows) => {
    const m = new Map();
    for (const g of rows) {
      if (!m.has(g.grantee)) m.set(g.grantee, new Set());
      m.get(g.grantee).add(g.privilege_type);
    }
    return m;
  };
  const base = byRole(baseGrants.rows);
  const view = byRole(viewGrants.rows);

  assert.ok(base.get("clara_freeform_ro")?.has("SELECT"), "clara_freeform_ro must keep its pre-existing SELECT on the base table");
  assert.ok(!base.has("clara_authenticated"), "the BASE TABLE must carry ZERO clara_authenticated grant -- the fn-fronted-only invariant (round 4 correction)");
  for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_runtime"]) {
    assert.ok(!base.has(role), `${role} must have ZERO grant on the base table -- 裁-11 never asked for this`);
    assert.ok(!view.has(role), `${role} must have ZERO grant on the view -- 裁-11 never asked for this`);
  }
  assert.deepEqual([...(view.get("clara_authenticated") ?? [])], ["SELECT"], "clara_authenticated must hold EXACTLY SELECT on the view, never a write privilege");
});

test("p4t2.counterparty_aliases: security_barrier is set on counterparty_aliases_visible", async () => {
  const r = await rootQuery(
    `select reloptions from pg_class where oid = 'clara.counterparty_aliases_visible'::regclass`,
  );
  assert.ok(Array.isArray(r.rows[0].reloptions) && r.rows[0].reloptions.includes("security_barrier=true"));
});

// ---------------------------------------------------------------------------
// Cross-tenant leak probe, both polarities (rev-hb's own instrument, run against this view too
// per the conductor's heads-up): a non-leakproof, artificially low-cost function in the caller's
// own WHERE clause must never observe a row the view's OWN security qual would have excluded --
// security_barrier is what stops the planner from pushing a cheap caller-supplied qual ahead of
// the view's own restricting predicate. Proven both ways: WITH the barrier (as shipped) the probe
// fires zero times on a bystander's query; WITHOUT it (a rolled-back negative control) the SAME
// probe fires and directly observes another firm's alias text, proving the probe itself is real.
// ---------------------------------------------------------------------------

test("p4t2.counterparty_aliases: cross-tenant leak probe -- WITH security_barrier (shipped), a bystander's non-leakproof low-cost probe function never fires on another firm's alias", async () => {
  const scA = await scene("leakA");
  const bystander = await scene("leakBystander");
  await addAlias(scA.owner, { client: scA.client, counterparty: scA.counterparty, alias: "Leak Probe Alias A", origin: "human", opKey: opk("leak-a-alias") });

  const { getPool } = await import("./rig-helpers.mjs");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set local role clara_authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bystander.owner, role: "authenticated" })]);
    await client.query("set local enable_indexscan = off");
    await client.query("set local enable_bitmapscan = off");
    await client.query("create temp table if not exists _ca_leak_hits(val text) on commit drop");
    await client.query(
      "create or replace function pg_temp._ca_leaky_probe(t text) returns boolean language plpgsql as $$ begin insert into _ca_leak_hits values (t); return true; end $$ cost 0.0000001",
    );
    const r = await client.query("select count(*)::int as n from clara.counterparty_aliases_visible where pg_temp._ca_leaky_probe(alias_display)");
    const hits = await client.query("select val from _ca_leak_hits");
    assert.equal(r.rows[0].n, 0, "the bystander must see zero rows");
    assert.equal(hits.rows.length, 0, "the leaky probe function must NEVER fire -- security_barrier orders the view's own predicate first");
    await client.query("rollback");
  } finally {
    client.release();
  }
});

test("p4t2.counterparty_aliases: cross-tenant leak probe -- WITHOUT security_barrier (negative control, rolled back), the SAME probe function fires and directly observes another firm's alias text -- proving the probe is real, not a vacuous always-zero read", async () => {
  const scA = await scene("leakNegA");
  const bystander = await scene("leakNegBystander");
  await addAlias(scA.owner, { client: scA.client, counterparty: scA.counterparty, alias: "Leak Probe Alias Neg", origin: "human", opKey: opk("leak-neg-alias") });

  const { getPool } = await import("./rig-helpers.mjs");
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set role clara_fn_owner");
    await client.query("alter view clara.counterparty_aliases_visible set (security_barrier = false)");
    await client.query("reset role");
    await client.query("set local role clara_authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bystander.owner, role: "authenticated" })]);
    await client.query("set local enable_indexscan = off");
    await client.query("set local enable_bitmapscan = off");
    await client.query("create temp table if not exists _ca_leak_hits(val text) on commit drop");
    await client.query(
      "create or replace function pg_temp._ca_leaky_probe(t text) returns boolean language plpgsql as $$ begin insert into _ca_leak_hits values (t); return true; end $$ cost 0.0000001",
    );
    const r = await client.query("select count(*)::int as n from clara.counterparty_aliases_visible where pg_temp._ca_leaky_probe(alias_display)");
    const hits = await client.query("select val from _ca_leak_hits");
    assert.equal(r.rows[0].n, 0, "the bystander's FINAL result set is still correctly empty -- RLS/the view WHERE still filters it");
    assert.ok(hits.rows.length >= 1, "without the barrier, the leaky probe function DOES fire -- observing data the caller has no right to see, proving the probe is meaningful");
    assert.ok(hits.rows.some((h) => h.val === "Leak Probe Alias Neg"), "the leak must be the OTHER firm's real alias text");
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
});
