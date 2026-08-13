// Wave E delta / gamma residual -- the v5 context-pack period/snapshot metadata surface.
// CONTRACT-BLIND on the residual migration: assertions read returned JSON and live ACLs.
// The one direct snapshot insert creates the otherwise-unreachable no-assessment prestate
// needed to prove absence => unknown; no audited producer can lawfully mint that shape.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, roleQuery, ROLES, PG, assertRaises, opk, firmOf, mintWake5,
  buildWorld, endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
} from "./wave-a-fixtures.mjs";
import {
  has0057, freshActiveClient, setupCloseCoa, mintMonthSnapshot, bookToday,
} from "./x57-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

let ready = false;
let world = null;

function skipResidual(t) {
  if (!ready) {
    if (process.env.CLARA_ALLOW_MISSING_WAVE_E_DELTA === "1") {
      markSkip();
      t.skip("delta gamma context-pack residual not applied in the explicit pre-integration run");
      return true;
    }
    assert.fail("delta gamma context-pack residual is required for focused/post-migration acceptance");
  }
  return false;
}

async function pastMonthStart(n) {
  const [y, m] = (await bookToday()).split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

before(async () => {
  if (!(await has0057())) { noteLane("0057 absent -- delta context-pack residual suite skipped"); return; }
  const def = (await rootQuery(
    "select pg_get_functiondef('clara.get_context_pack(uuid,text)'::regprocedure) as d",
  )).rows[0]?.d ?? "";
  ready = def.includes("'pack_schema_version',5") && def.includes("'period_snapshot_registry'");
  if (!ready) { noteLane("v5 period_snapshot_registry absent -- delta context-pack residual suite skipped"); return; }
  const posture = (await rootQuery(`select p.prosecdef,p.proowner::regrole::text owner,p.proconfig
    from pg_proc p where p.oid='clara._tf_metric_cell_provenance_complete()'::regprocedure`)).rows[0];
  assert.deepEqual(
    [posture.prosecdef, posture.owner, posture.proconfig],
    [true, ROLES.fnOwner, ["search_path=clara, pg_temp"]],
    "the residual provenance function is a clara_fn_owner definer with a pinned path",
  );
  const triggers = (await rootQuery(`select t.tgname,t.tgrelid::regclass::text relation,t.tgdeferrable,t.tginitdeferred
    from pg_trigger t where not t.tgisinternal
      and t.tgfoid='clara._tf_metric_cell_provenance_complete()'::regprocedure order by t.tgname`)).rows;
  assert.equal(triggers.length, 8);
  assert.ok(triggers.every((row) => row.tgdeferrable && row.tginitdeferred));
  assert.deepEqual(new Map(triggers.map((row) => [row.tgname, row.relation])), new Map([
    ["t_metric_cell_provenance_complete", "clara.metric_cells"],
    ["t_metric_cell_periods_complete", "clara.metric_cell_periods"],
    ["t_metric_cell_snapshots_complete", "clara.metric_cell_snapshots"],
    ["t_metric_cell_account_sets_complete", "clara.metric_cell_account_sets"],
    ["t_metric_cell_constants_complete", "clara.metric_cell_constants"],
    ["t_metric_cell_entries_complete", "clara.metric_cell_entries"],
    ["t_metric_cell_documents_complete", "clara.metric_cell_documents"],
    ["t_metric_cell_presentation_maps_complete", "clara.metric_cell_presentation_maps"],
  ]));
  world = await buildWorld();
});
after(async () => {
  printLaneNotes("delta-context-pack-residual");
  printSkipCount("delta-context-pack-residual");
  await endPool();
});

test("v5 human + real clara_agent_ro wake calls preserve absence semantics and enforce client pinning", async (t) => {
  if (skipResidual(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "packv5wake");
  const otherClient = await freshActiveClient(owner, "packv5other");
  const firm = await firmOf(client);

  const human = await wb.packHuman(owner, { client, purpose: "reporting_context" });
  assert.equal(human.pack_schema_version, 5, "the human read reports the exact v5 schema identity");
  assert.deepEqual(human.period_snapshot_registry, {
    ordering: "period_start_desc_then_period_id",
    limit: 12,
    total_count: 0,
    truncated: false,
    periods: [],
  }, "a client with no period rows gets an explicit empty bounded block, never an inferred period");

  const cred = await mintWake5({
    kind: "autodraft", firm, onBehalfOf: null, client,
  });
  const wake = await wb.packWake(cred, { client, purpose: "reporting_context" });
  assert.ok(wake, "a real client-pinned wake credential reaches get_context_pack through clara_agent_ro");
  assert.equal(wake.pack_schema_version, 5, "the real wake path reports the exact v5 schema identity");
  assert.equal(wake.client.id, client, "the wake pack is pinned to the credential's client");

  const wrongPinnedClient = await wb.packWake(cred, {
    client: otherClient, purpose: "reporting_context",
  });
  assert.equal(wrongPinnedClient, null, "the same real credential returns NULL for another same-firm client");
  const absent = await wb.packHuman(owner, {
    client: randomUUID(), purpose: "reporting_context",
  });
  assert.equal(absent, null, "an unknown client returns NULL -- no existence oracle");
});

test("v5 bounds both lists and fail-closes a privileged assessment-less corruption fixture to unknown", async (t) => {
  if (skipResidual(t)) return;
  const owner = world.users.alice;
  const client = await freshActiveClient(owner, "packv5shape");
  await setupCloseCoa(owner, client);
  const monthStart = await pastMonthStart(6);
  const minted = await mintMonthSnapshot(owner, {
    client, monthStart, opKey: opk("delta-pack-v5-mint"),
  });

  // Use gamma's own internal period producer for twelve old calendar months. Together with
  // the minted period this forces the outer total=13/window=12/truncated=true branch.
  await rootQuery(
    `select clara._ensure_month_period($1,
       (date '2010-01-01' + (g::text || ' months')::interval)::date, $2)
       from generate_series(0,11) g`,
    [client, owner],
  );

  // Six deliberately assessment-less snapshot artifacts force the inner total=7/window=5
  // branch. Their distinct display timestamps make the deterministic order observable;
  // causal state still comes only from snapshot_assessments.seq and therefore reads unknown.
  await rootQuery(
    `insert into clara.period_snapshots
       (id, firm_id, client_id, reporting_period_id, period_start, period_end, kind,
        minted_by, minted_at, books_watermark, dataset_sha256, payload)
     select gen_random_uuid(), rp.firm_id, rp.client_id, rp.id, rp.period_start, rp.period_end,
            'management_accounts', $2, clock_timestamp() + g * interval '1 second',
            pg_current_snapshot()::text, repeat('0',64), '{}'::jsonb
       from clara.reporting_periods rp cross join generate_series(1,6) g
      where rp.id=$1`,
    [minted.reporting_period_id, owner],
  );

  const pack = await wb.packHuman(owner, { client, purpose: "reporting_context" });
  const registry = pack.period_snapshot_registry;
  assert.equal(registry.total_count, 13);
  assert.equal(registry.limit, 12);
  assert.equal(registry.truncated, true);
  assert.equal(registry.periods.length, 12);
  assert.equal(registry.ordering, "period_start_desc_then_period_id");
  assert.equal(registry.periods[0].reporting_period_id, minted.reporting_period_id,
    "the most recent calendar period is first under the disclosed deterministic order");

  const snapshots = registry.periods[0].snapshots;
  assert.equal(snapshots.total_count, 7);
  assert.equal(snapshots.limit, 5);
  assert.equal(snapshots.truncated, true);
  assert.equal(snapshots.ordering, "recent_by_minted_at",
    "timestamp order is called recent_by_minted_at, never causal latest");
  assert.equal(snapshots.recent_by_minted_at.length, 5);
  for (const snapshot of snapshots.recent_by_minted_at) {
    assert.deepEqual(Object.keys(snapshot).sort(), ["kind", "minted_at", "snapshot_id", "state"],
      "each snapshot exposes metadata only");
    assert.equal(snapshot.state, "unknown",
      "a snapshot with no assessment row reads unknown -- absence is never derived as current");
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "payload"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "books_watermark"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot, "dataset_sha256"), false);
  }
  const timestamps = snapshots.recent_by_minted_at.map((s) => Date.parse(s.minted_at));
  assert.deepEqual(timestamps, [...timestamps].sort((a, b) => b - a),
    "recent_by_minted_at is deterministic descending timestamp order");
});

test("the v5 wake surface adds no raw registry grant and no direct snapshot RPC grant", async (t) => {
  if (skipResidual(t)) return;
  assert.equal(await roleQuery(ROLES.agentRo,
    "select has_function_privilege(current_user, 'clara.get_context_pack(uuid,text)', 'execute') as ok")
    .then((r) => r.rows[0].ok), true, "clara_agent_ro retains the one context-pack door");

  for (const table of ["reporting_periods", "period_snapshots", "snapshot_assessments"]) {
    const granted = (await rootQuery(
      "select has_table_privilege($1, $2, 'select') as ok",
      [ROLES.agentRo, `clara.${table}`],
    )).rows[0].ok;
    assert.equal(granted, false, `clara_agent_ro has no raw SELECT on clara.${table}`);
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(ROLES.agentRo, `select 1 from clara.${table} limit 1`),
      `clara_agent_ro raw read of ${table}`);
  }

  for (const [signature, sql, params] of [
    ["clara.mint_month_snapshot(uuid,date,text)", "select clara.mint_month_snapshot(p_client=>$1,p_month_start=>$2::date,p_op_key=>$3)", [randomUUID(), "2020-01-01", opk("denied-mint")]],
    ["clara.snapshot_state(uuid)", "select clara.snapshot_state(p_snapshot=>$1)", [randomUUID()]],
    ["clara.verify_snapshot(uuid)", "select clara.verify_snapshot(p_snapshot=>$1)", [randomUUID()]],
    ["clara.days_in_period(uuid)", "select clara.days_in_period(p_period=>$1)", [randomUUID()]],
  ]) {
    const granted = (await rootQuery(
      "select has_function_privilege($1, $2, 'execute') as ok",
      [ROLES.agentRo, signature],
    )).rows[0].ok;
    assert.equal(granted, false, `clara_agent_ro has no direct EXECUTE on ${signature}`);
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(ROLES.agentRo, sql, params),
      `clara_agent_ro direct call of ${signature}`);
  }
});
