// P4 tranche-2 -- 裁-11: clara.counterparty_aliases gains a human read the table carried zero of.
// T8's rung-0 finding: no clara_authenticated grant at all, not merely no policy -- both close
// here. The policy is a verbatim copy of clara.counterparties' own p_counterparties_human shape
// (firm-scoped only, the MEASURED live shape -- see the migration's own header note).

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

test("p4t2.counterparty_aliases: [裁-11] a firm member (viewer, no rank floor -- matching counterparties' own shape) can now SELECT the firm's own aliases", async () => {
  const sc = await scene("read");
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "TNB", origin: "human", opKey: opk("read-alias") });
  const r = await humanQuery(sc.viewer, "select alias_display, origin from clara.counterparty_aliases where firm_id = $1", [sc.firm]);
  assert.equal(r.rows.length, 1, "before this migration, clara_authenticated had ZERO grant on this table -- this read must now succeed");
  assert.equal(r.rows[0].alias_display, "TNB");
  assert.equal(r.rows[0].origin, "human");
});

test("p4t2.counterparty_aliases: cross-firm isolation -- firm B's member sees ZERO of firm A's aliases", async () => {
  const scA = await scene("crossA");
  const scB = await scene("crossB");
  await addAlias(scA.owner, { client: scA.client, counterparty: scA.counterparty, alias: "Cross Alias A", origin: "human", opKey: opk("crossA-alias") });
  const r = await humanQuery(scB.owner, "select id from clara.counterparty_aliases where firm_id = $1", [scA.firm]);
  assert.equal(r.rows.length, 0);
  // Positive control -- the same query from firm A's own owner DOES see it, so the zero above is
  // the firm predicate excluding it, not a broken read entirely.
  const positive = await humanQuery(scA.owner, "select id from clara.counterparty_aliases where firm_id = $1", [scA.firm]);
  assert.equal(positive.rows.length, 1);
});

test("p4t2.counterparty_aliases: an unscoped SELECT from a member returns EXACTLY that firm's aliases, closed-world", async () => {
  const sc = await scene("closedworld");
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "Closed World One", origin: "human", opKey: opk("cw-1") });
  await addAlias(sc.owner, { client: sc.client, counterparty: sc.counterparty, alias: "Closed World Two", origin: "trade_name", opKey: opk("cw-2") });
  const other = await scene("closedworld_other");
  await addAlias(other.owner, { client: other.client, counterparty: other.counterparty, alias: "Other Firm Alias", origin: "human", opKey: opk("cw-other") });
  const r = await humanQuery(sc.owner, "select alias_display from clara.counterparty_aliases where firm_id = $1 order by alias_display", [sc.firm]);
  assert.deepEqual(r.rows.map((row) => row.alias_display), ["Closed World One", "Closed World Two"]);
});

test("p4t2.counterparty_aliases: clara_freeform_ro's own pre-existing grant is untouched (still SELECT), and agent/wake/runtime gain ZERO", async () => {
  const grants = await rootQuery(
    `select grantee, privilege_type from information_schema.role_table_grants
      where table_schema = 'clara' and table_name = 'counterparty_aliases' order by grantee, privilege_type`,
  );
  const byRole = new Map();
  for (const g of grants.rows) {
    if (!byRole.has(g.grantee)) byRole.set(g.grantee, new Set());
    byRole.get(g.grantee).add(g.privilege_type);
  }
  assert.ok(byRole.get("clara_freeform_ro")?.has("SELECT"), "clara_freeform_ro must keep its pre-existing SELECT");
  assert.ok(byRole.get("clara_authenticated")?.has("SELECT"), "clara_authenticated must now have SELECT (裁-11)");
  for (const role of ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_runtime"]) {
    assert.ok(!byRole.has(role), `${role} must have ZERO grant on counterparty_aliases -- 裁-11 never asked for this`);
  }
});

test("p4t2.counterparty_aliases: the new policy's qual is BYTE-IDENTICAL to counterparties' own p_counterparties_human qual", async () => {
  const [aliasPol, cpPol] = await Promise.all([
    rootQuery(
      `select pg_get_expr(polqual, polrelid) as qual from pg_policy where polrelid = 'clara.counterparty_aliases'::regclass and polname = 'p_counterparty_aliases_human'`,
    ),
    rootQuery(
      `select pg_get_expr(polqual, polrelid) as qual from pg_policy where polrelid = 'clara.counterparties'::regclass and polname = 'p_counterparties_human'`,
    ),
  ]);
  assert.equal(aliasPol.rows.length, 1);
  assert.equal(cpPol.rows.length, 1);
  assert.equal(aliasPol.rows[0].qual, cpPol.rows[0].qual, "the two policies' predicates must read byte-identical -- the 裁-11 'copy verbatim' instruction");
});
