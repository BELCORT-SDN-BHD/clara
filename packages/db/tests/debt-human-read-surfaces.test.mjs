// Debt-clearing lane -- three additive human read surfaces the 磨合 (frontend integration)
// window found missing (PROGRESS.md's 磨合 lane row): clara.firm_open_questions_visible,
// clara.client_identifier_promotions_visible, clara.users_visible.
//
// Migration: packages/db/migrations/0137_debt_human_read_surfaces.sql.
//
// GATING is on the CATALOG, never on the migration number (the estate's own convention,
// f-a7-pi.test.mjs's own header): `debtApplied()` asks whether the three new views exist. A
// PARTIAL set throws rather than skips -- a half-applied migration is a defect, not an absence.
//
// WHAT THESE CELLS ARE FOR. Per view: a POSITIVE cell (the intended reader sees the row), a
// role-floor NEGATIVE cell (a below-floor role sees nothing, where a floor applies), a
// cross-firm NEGATIVE cell (another firm sees nothing), and a CLOSED-WORLD COLUMN CENSUS (the
// view exposes exactly its declared column list, nothing more -- proven independently of the
// migration's own tail census). One shared adversarial-twin cell proves the ACL wall actually
// holds by breaking it inside a rolled-back transaction, mirroring f-a7-pi.test.mjs's pi-A9.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, buildWorld, opk, sha, ROLES,
  ingestDocument, assertRaises, getPool,
} from "./rig-fixtures.mjs";

let world = null;
let live = false;

/** Run `fn` inside ONE transaction that is ALWAYS rolled back, so adversarial DDL against a
 *  shared view/table never leaks between cells or out of the suite (f-a7-pi.test.mjs's own
 *  idiom, reproduced locally — not exported from the shared fixtures). `rollback` → `reset
 *  role` → `reset all` before release (db-tests.md): one cell below does `SET ROLE` inside the
 *  transaction, and while ROLLBACK undoes a transactional SET ROLE on its own, resetting
 *  explicitly too is the house belt against a pooled client returning still impersonating. */
async function inRolledBackTx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    try { await client.query("rollback"); } catch { /* best-effort cleanup */ }
    try { await client.query("reset role"); } catch { /* best-effort cleanup */ }
    try { await client.query("reset all"); } catch { /* best-effort cleanup */ }
    client.release();
  }
}

async function debtApplied() {
  const wanted = ["firm_open_questions_visible", "client_identifier_promotions_visible", "users_visible"];
  const r = await rootQuery(
    `select c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = any($1)`,
    [wanted],
  );
  const found = new Map(r.rows.map((x) => [x.relname, x.relkind]));
  const missing = wanted.filter((w) => found.get(w) !== "v");
  if (missing.length === 0) return true;
  if (missing.length === wanted.length) return false;
  throw new Error(
    `debt human-read-surfaces is HALF applied -- missing/mistyped: ${missing.join(", ")}. `
    + "A partial layer is a defect; refusing to skip past it.",
  );
}

before(async () => {
  live = await debtApplied();
  if (live) world = await buildWorld();
});
after(async () => {
  // MEASURED (fix-round finding): the LOW-6 attack cells' planted snoop artifacts
  // (clara._hrd_a_snoop / clara._hrd_a_snoop_witness) are NOT test-local -- they live in the
  // shared `clara` schema on the shared rig, and the estate's OWN closed-world censuses
  // elsewhere (rig-isolation.test.mjs's T17 grant matrix, T18 definer-hygiene/RLS censuses)
  // enumerate the WHOLE schema and correctly flag an unlisted, ungoverned function/table as a
  // drift -- exactly the class of bug those censuses exist to catch. Drop them here so this
  // file leaves no residue for any test that runs after it in the same `node --test` process.
  try { await rootQuery("drop function if exists clara._hrd_a_snoop(text)"); } catch { /* best-effort cleanup */ }
  try { await rootQuery("drop table if exists clara._hrd_a_snoop_witness"); } catch { /* best-effort cleanup */ }
  await endPool();
});

const gate = (t) => {
  if (!live) { t.skip("debt human-read-surfaces layer not applied -- clara.users_visible absent"); return true; }
  return false;
};

/** Every live column of `relname`, in ordinal order -- read straight from the catalog so a
 *  census cell never trusts what the migration CLAIMS it built. */
async function liveColumns(relname) {
  const r = await rootQuery(
    `select attname from pg_attribute where attrelid = $1::regclass
       and attnum > 0 and not attisdropped order by attnum`,
    [`clara.${relname}`],
  );
  return r.rows.map((x) => x.attname);
}

async function docFor(client, tag) {
  return ingestDocument({ kind: "human", sub: world.users.alice },
    { client, sha256: sha(`debt-rs-${tag}-${Math.random()}`), opKey: opk("doc") });
}

// ---------------------------------------------------------------------------------------
// A · clara.firm_open_questions_visible
// ---------------------------------------------------------------------------------------

const FOQ_COLUMNS = [
  "id", "firm_id", "document_id", "kind", "question_text", "candidates", "status",
  "opened_by", "opened_at", "settled_by", "settled_at", "settlement_text",
  "named_client", "receipt_id",
];

test("debt-A1 · firm_open_questions_visible: bookkeeper+ of the SAME firm sees the row", async (t) => {
  if (gate(t)) return;
  const doc = await docFor(world.clients.A1, "a1");
  const qid = (await rootQuery(
    `select clara._firm_question_core($1,$2,null,null,$3,'unattributed','who is this?','[]'::jsonb,null) as id`,
    [world.agent, world.firms.A, doc])).rows[0].id;

  // Positive: bob is a BOOKKEEPER of firm A.
  const asBob = await humanQuery(world.users.bob,
    "select * from clara.firm_open_questions_visible where id = $1", [qid]);
  assert.equal(asBob.rowCount, 1, "firm A's bookkeeper sees firm A's open question");
  assert.equal(asBob.rows[0].question_text, "who is this?");

  // Positive floor: alice is firm A's OWNER (rank above bookkeeper) — the floor is "at least
  // bookkeeper", not "exactly bookkeeper".
  const asAlice = await humanQuery(world.users.alice,
    "select count(*)::int as n from clara.firm_open_questions_visible where id = $1", [qid]);
  assert.equal(asAlice.rows[0].n, 1, "firm A's owner (above the floor) also sees it");

  // Negative, role floor: carol is a VIEWER of firm A — below the bookkeeper+ floor.
  const asCarol = await humanQuery(world.users.carol,
    "select count(*)::int as n from clara.firm_open_questions_visible where id = $1", [qid]);
  assert.equal(asCarol.rows[0].n, 0, "a viewer (below the bookkeeper+ floor) sees nothing");

  // Negative, cross-firm: dave is firm B's owner.
  const asDave = await humanQuery(world.users.dave,
    "select count(*)::int as n from clara.firm_open_questions_visible where id = $1", [qid]);
  assert.equal(asDave.rows[0].n, 0, "firm B cannot see firm A's open question");
});

test("debt-A2 · firm_open_questions_visible: closed-world column census", async (t) => {
  if (gate(t)) return;
  const cols = await liveColumns("firm_open_questions_visible");
  assert.deepEqual(cols, FOQ_COLUMNS,
    "the view exposes EXACTLY the declared 14 columns, in order -- nothing more, nothing fewer");
});

// ---------------------------------------------------------------------------------------
// B · clara.client_identifier_promotions_visible
// ---------------------------------------------------------------------------------------

const CIP_COLUMNS = [
  "id", "firm_id", "client_id", "kind", "value_normalized", "sightings", "citations",
  "rationale", "model", "status", "proposed_by", "proposed_at", "settled_by",
  "settled_at", "identifier_id",
];
const MODEL = '{"provider":"anthropic","model":"m","version":"v"}';

async function proposeCard(firm, client, kind = "ssm", value = "AB-1234-X") {
  const r = await rootQuery(
    `select clara._identifier_promotion_core($1,$2,null,null,$3,$4,$5,3,
       '[{"region":"r1"}]'::jsonb,'seen three times',$6::jsonb) as id`,
    [world.agent, firm, client, kind, value, MODEL]);
  return r.rows[0].id;
}

test("debt-B1 · client_identifier_promotions_visible: bookkeeper+ of the SAME firm sees the "
  + "row, value_normalized and model included unmasked", async (t) => {
    if (gate(t)) return;
    const pid = await proposeCard(world.firms.A, world.clients.A2, "tin", "C9998887770");

    const asBob = await humanQuery(world.users.bob,
      "select * from clara.client_identifier_promotions_visible where id = $1", [pid]);
    assert.equal(asBob.rowCount, 1, "firm A's bookkeeper sees firm A's promotion card");
    assert.equal(asBob.rows[0].value_normalized, "c9998887770",
      "the proposed value is visible -- the review the card exists for needs it");
    assert.equal(asBob.rows[0].model.provider, "anthropic", "model attribution is visible, unmasked");
    assert.equal(asBob.rows[0].status, "proposed");

    // Negative, role floor: carol is a viewer of firm A.
    const asCarol = await humanQuery(world.users.carol,
      "select count(*)::int as n from clara.client_identifier_promotions_visible where id = $1", [pid]);
    assert.equal(asCarol.rows[0].n, 0, "a viewer (below the bookkeeper+ floor) sees nothing");

    // Negative, cross-firm: dave is firm B's owner.
    const asDave = await humanQuery(world.users.dave,
      "select count(*)::int as n from clara.client_identifier_promotions_visible where id = $1", [pid]);
    assert.equal(asDave.rows[0].n, 0, "firm B cannot see firm A's promotion card");
  });

test("debt-B2 · client_identifier_promotions_visible: closed-world column census", async (t) => {
  if (gate(t)) return;
  const cols = await liveColumns("client_identifier_promotions_visible");
  assert.deepEqual(cols, CIP_COLUMNS,
    "the view exposes EXACTLY the declared 15 columns, in order -- nothing more, nothing fewer");
});

// ---------------------------------------------------------------------------------------
// C · clara.users_visible
// ---------------------------------------------------------------------------------------

test("debt-C1 · users_visible: any firm-mate resolves a name, no role floor, the agent "
  + "identity resolves to every firm, cross-firm resolves to nothing", async (t) => {
    if (gate(t)) return;
    // Positive, no floor: carol is a plain VIEWER of firm A, resolving firm-mate alice.
    const carolSeesAlice = await humanQuery(world.users.carol,
      "select display_name from clara.users_visible where id = $1", [world.users.alice]);
    assert.equal(carolSeesAlice.rowCount, 1, "a viewer resolves a firm-mate's name -- no role floor");
    assert.ok(carolSeesAlice.rows[0].display_name.length > 0);

    // Positive: the global agent identity resolves for EVERY firm, including one (S) the agent
    // row itself holds no firm_memberships row for.
    const erinSeesAgent = await humanQuery(world.users.erin,
      "select display_name from clara.users_visible where id = $1", [world.agent]);
    assert.equal(erinSeesAgent.rowCount, 1,
      "the global agent identity resolves to every firm, closing the base policy's measured gap");
    assert.equal(erinSeesAgent.rows[0].display_name, "Clara (agent)");

    // Negative, cross-firm: bob (firm A) cannot resolve dave's name (dave is firm B only).
    const bobSeesDave = await humanQuery(world.users.bob,
      "select count(*)::int as n from clara.users_visible where id = $1", [world.users.dave]);
    assert.equal(bobSeesDave.rows[0].n, 0, "a firm A member cannot resolve a firm B-only user's name");
  });

test("debt-C2 · users_visible: exactly id + display_name -- email is not just permission-"
  + "denied, it is ABSENT from the projection", async (t) => {
    if (gate(t)) return;
    const cols = await liveColumns("users_visible");
    assert.deepEqual(cols, ["id", "display_name"],
      "the view exposes EXACTLY id + display_name -- never email/is_agent/created_at");
    await assertRaises("42703",
      () => humanQuery(world.users.bob, "select email from clara.users_visible limit 1"),
      "selecting a column the view never projects");
  });

// ---------------------------------------------------------------------------------------
// 裁-15 (mohe-grill-rulings, 2026-08-28) · THE ESTATE security_barrier CENSUS.
// WIDENED past the "six" briefing (independent review NEW-H1, 2026-08-29): the same-shape
// family (a view, owned by clara_fn_owner, SELECT-granted to clara_authenticated, doing its
// OWN tenant scoping in the body via jwt_firm()/actor_role_rank()/jwt_sub()) is ELEVEN at this
// migration's frontier -- derived from the CATALOG below via the SAME shape predicate the
// migration's own prestate/tail use, never a hardcoded count, so a twelfth member (P4
// tranche-2 is expected to add firm_registration_requests_visible later, already designed as
// security_barrier) is exactly what THIS file would then require too, correctly, once it
// lands -- not silently missed.
// ---------------------------------------------------------------------------------------

const HRD_A_FAMILY_PREDICATE = `
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'clara' and c.relkind = 'v'
     and pg_get_userbyid(c.relowner) = 'clara_fn_owner'
     and has_table_privilege('clara_authenticated', c.oid, 'select')
     and pg_get_viewdef(c.oid, true) ~ '\\yjwt_firm\\(|\\yactor_role_rank\\(|\\yjwt_sub\\('
`;

async function hrdAFamily() {
  const r = await rootQuery(`${HRD_A_FAMILY_PREDICATE} order by c.relname`);
  return r.rows.map((x) => x.relname);
}

test("debt-BAR1 · 裁-15 estate census — EVERY member of the catalog-derived same-shape family (fourteen since the firm timeline landed) carries security_barrier, and the reloption is proven to buy pushdown-ordering, not target-list masking", async (t) => {
  if (gate(t)) return;
  const family = await hrdAFamily();
  // firm_timeline_visible ships in an UNNUMBERED file until merge prep (裁-108), and the runner
  // SILENTLY SKIPS such a file — so on CI's chain the view is simply absent and the roster is
  // thirteen. Gated on the LIVE CATALOG, exactly like every other member would be: the census is
  // catalog-derived on the left-hand side, so pinning a hardcoded fourteen on the right would make
  // this cell fail for the one reason it must not — the cohort not being applied.
  const timelineLanded = (await rootQuery(
    "select to_regclass('clara.firm_timeline_visible') is not null as ok")).rows[0].ok;
  assert.deepEqual(family, [
    "agent_receipts_visible", "agent_tasks_visible", "caller_context",
    "client_identifier_promotions_visible", "coding_tasks_visible",
    "counterparty_aliases_visible",
    "document_intakes_visible", "document_processing_tasks_visible",
    "firm_invites_visible", "firm_members_visible", "firm_open_questions_visible",
    "firm_registration_requests_visible",
    ...(timelineLanded ? ["firm_timeline_visible"] : []),
    "users_visible",
  ], "the catalog-derived family must be exactly the expected members, closed-world -- P4 tranche-2 (0145) landed both firm_registration_requests_visible (anticipated by this file's own header comment) and counterparty_aliases_visible (a round-4 addition this file's author could not have known about -- 裁-11's masked-view mechanism was chosen AFTER this file merged, to satisfy wave-a-shape's fn-fronted-only invariant), and CB-AE2E-018 / 裁-190 landed firm_timeline_visible (the bookkeeper+ activity feed over clara.domain_events -- a FOURTEENTH member this census caught on its author's first estate run, which is the derivation working: the family is read from the catalog, so a new same-shape view joins it whether or not anyone remembered 裁-15)");

  const r = await rootQuery(
    `select c.relname, c.reloptions
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = any($1)`,
    [family],
  );
  for (const view of family) {
    const row = r.rows.find((x) => x.relname === view);
    assert.ok(row, `${view} must exist`);
    assert.ok(
      Array.isArray(row.reloptions) && row.reloptions.includes("security_barrier=true"),
      `${view} must carry security_barrier=true`,
    );
  }

  // WHAT IT DOES NOT BUY, re-proven here (not merely stated in a comment): security_barrier
  // governs qual-PUSHDOWN ORDER, never column projection. users_visible's own masking is
  // structural (it never selects email/is_agent/created_at at all, proven by debt-C2's column
  // census); this half instead re-proves client_identifier_promotions_visible's UNMASKED
  // columns (value_normalized, model — deliberately visible per 0137's own header) are still
  // returned in full under the reloption, so a reader cannot mistake "carries
  // security_barrier" for "therefore also masks more than it already did".
  const pid = await proposeCard(world.firms.A, world.clients.A2, "bank_account", "1234567890");
  const asBob = await humanQuery(world.users.bob,
    "select value_normalized, model from clara.client_identifier_promotions_visible where id = $1", [pid]);
  assert.equal(asBob.rowCount, 1);
  assert.equal(asBob.rows[0].value_normalized, "1234567890",
    "security_barrier changes nothing about which columns this view projects — value_normalized is still unmasked");
  assert.equal(asBob.rows[0].model.provider, "anthropic", "model attribution is still unmasked under the reloption");
});

test("debt-BAR2 (LOW-6 negative control) · resetting security_barrier on ONE family member, inside a rolled-back transaction, FLIPS the census — proving debt-BAR1's instrument can say NO, not just happen to always say YES", async (t) => {
  if (gate(t)) return;
  await inRolledBackTx(async (client) => {
    await client.query("set role clara_fn_owner");
    await client.query("alter view clara.users_visible reset (security_barrier)");
    const r = await client.query(
      `select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'clara' and c.relname = 'users_visible'`,
    );
    assert.ok(
      !Array.isArray(r.rows[0].reloptions) || !r.rows[0].reloptions.includes("security_barrier=true"),
      "the census instrument must observe the reloption actually gone once reset",
    );
  });
  // Rolled back: the estate is clean again, proven rather than assumed.
  const restored = await rootQuery(
    `select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'users_visible'`,
  );
  assert.ok(
    Array.isArray(restored.rows[0].reloptions) && restored.rows[0].reloptions.includes("security_barrier=true"),
    "users_visible's security_barrier survives outside the rolled-back cell",
  );
});

// ---------------------------------------------------------------------------------------
// LOW-6 (independent review, 2026-08-29) · THE ATTACK CELLS. 裁-15 closes a DEMONSTRATED
// cross-tenant read channel, not a hygiene item: a caller-supplied WHERE qualifier calling a
// non-leakproof, near-zero-cost VOLATILE function can be planned AHEAD of a view's own
// firm-scoping predicate absent security_barrier, so the function's own side effect (here: a
// witness-table INSERT) fires on rows the caller's final result set never includes. Two
// independent findings on a control rig WITHOUT this migration's ALTERs (measured, not
// theoretical): users_visible leaks under the DEFAULT plan; three of the five newly-covered
// views (agent_tasks_visible, document_processing_tasks_visible, coding_tasks_visible) leak
// only once the planner is forced away from an index/bitmap plan
// (enable_indexscan/enable_bitmapscan=off, both USERSET session GUCs — a caller's own choice,
// not an admin setting). agent_receipts_visible and document_intakes_visible are covered by
// the SAME instrument (identical shape, same predicate) but a leak was NOT independently
// demonstrated on either — stated honestly, not assumed from the shape alone.
//
// Both cells below run the SAME probe TWICE inside one test: once against the LIVE (PR-rig)
// state (security_barrier ON, from this migration) — expect NO leak — and once inside a
// rolled-back transaction with security_barrier RESET on that one view — expect a leak. This
// proves the barrier is what closes the channel, on this exact rig, without needing a second
// container.
// ---------------------------------------------------------------------------------------

async function plantSnoop() {
  await rootQuery("create table if not exists clara._hrd_a_snoop_witness(seen text)");
  // SECURITY DEFINER (owned by the connecting superuser, which always has table access) --
  // plpgsql defaults to SECURITY INVOKER, which would run the INSERT as whatever role is
  // calling the probe (clara_authenticated inside the attack query), and that role holds no
  // grant on the witness table by design (this is a planted attacker artifact, not a real
  // clara.* table -- it gets no app-role grant of its own).
  await rootQuery(
    `create or replace function clara._hrd_a_snoop(t text) returns boolean
       language plpgsql volatile cost 0.0000001 security definer as $snoop$
     begin
       insert into clara._hrd_a_snoop_witness(seen) values (t);
       return true;
     end
     $snoop$`,
  );
  await rootQuery("grant execute on function clara._hrd_a_snoop(text) to clara_authenticated");
}

async function snoopSaw(needle) {
  const r = await rootQuery("select count(*)::int as n from clara._hrd_a_snoop_witness where seen = $1", [needle]);
  return r.rows[0].n > 0;
}

async function clearSnoopWitness() {
  await rootQuery("truncate clara._hrd_a_snoop_witness");
}

test("debt-ATTACK1 (LOW-6) · users_visible: a non-leakproof near-zero-cost probe in the caller's WHERE clause LEAKS a firm-B caller's view of firm-A's display_name WITHOUT security_barrier (default plan), and does NOT leak WITH it (this migration's own live state)", async (t) => {
  if (gate(t)) return;
  await plantSnoop();
  // alice is firm A's own owner; her display_name (set by buildWorld's insertUser fixture,
  // unique per run via world.prefix) is the canary -- dave (firm B) can NEVER see alice in his
  // own final result set (cross-firm, no shared membership), so if the probe recorded her
  // display_name, the function was invoked on her row's data despite that.
  const canary = (await rootQuery("select display_name from clara.users where id = $1", [world.users.alice])).rows[0].display_name;

  // ATTACK, WITH security_barrier (the live, migrated state) -- expect NO leak.
  await clearSnoopWitness();
  await humanQuery(world.users.dave, "select id from clara.users_visible where clara._hrd_a_snoop(display_name)", []);
  assert.equal(await snoopSaw(canary), false,
    "WITH security_barrier, the probe must never see firm A's display_name while queried by firm B's caller");

  // ATTACK, WITHOUT security_barrier -- expect a leak, proving the reloption is what closed
  // the channel above, not some other property of the view. MEASURED (fix-round finding): a
  // ROLLED-BACK transaction is the WRONG instrument here -- it would roll back the probe's
  // own witness-table INSERT along with the ALTER, so the leak could never be observed
  // afterward even if it genuinely happened (confirmed by directly reproducing this exact
  // shape on the rig: EXPLAIN shows the probe evaluated on all 405 rows inside a single
  // rolled-back transaction, but the witness table held ZERO rows once rolled back -- the
  // side effect and the DDL share one rollback boundary). This attack half therefore uses a
  // REAL, COMMITTED reset, then restores it in `finally` -- the view is genuinely (if
  // briefly) less safe on this throwaway rig for the duration of one query, which is the
  // whole point: proving the mechanism, not just asserting it.
  await rootQuery("set role clara_fn_owner");
  await rootQuery("alter view clara.users_visible reset (security_barrier)");
  await rootQuery("reset role");
  try {
    await clearSnoopWitness();
    await humanQuery(world.users.dave, "select id from clara.users_visible where clara._hrd_a_snoop(display_name)", []);
  } finally {
    await rootQuery("set role clara_fn_owner");
    await rootQuery("alter view clara.users_visible set (security_barrier = true)");
    await rootQuery("reset role");
  }
  assert.equal(await snoopSaw(canary), true,
    "WITHOUT security_barrier, the SAME probe/query shape must see firm A's display_name -- proving the reloption, not some other property, is what closes the channel");
  // Restored, proven rather than assumed.
  const restored = await rootQuery(
    `select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'users_visible'`,
  );
  assert.ok(
    Array.isArray(restored.rows[0].reloptions) && restored.rows[0].reloptions.includes("security_barrier=true"),
    "users_visible's security_barrier is restored after this cell",
  );
});

test("debt-ATTACK2 (LOW-6) · agent_tasks_visible: the SAME probe leaks a firm-A task's id to a firm-B caller WITHOUT security_barrier once the planner is forced off index/bitmap plans (enable_indexscan/enable_bitmapscan=off — a caller's own USERSET choice), and does NOT leak WITH it", async (t) => {
  if (gate(t)) return;
  await plantSnoop();
  // Direct-insert (root bypasses RLS). MEASURED (fix-round finding): a kind='wake' task's OWN
  // trigger (_tf_agent_task_insert, 0011/0120) requires a real origin_intent_id resolving
  // through wake_intents+domain_events -- kind='chat_turn' is the simpler admission (a real
  // chat_sessions row + status='queued'). The task's own id is the canary (any firm-B-invisible
  // value would do -- the id is convenient and needs no extra column).
  const sessionId = (await rootQuery(
    "insert into clara.chat_sessions(firm_id, created_by) values ($1, $2) returning id",
    [world.firms.A, world.users.alice],
  )).rows[0].id;
  const taskId = (await rootQuery(
    "insert into clara.agent_tasks(firm_id, kind, session_id, status) values ($1, 'chat_turn', $2, 'queued') returning id",
    [world.firms.A, sessionId],
  )).rows[0].id;

  // MEASURED (fix-round finding, same class as debt-ATTACK1): a ROLLED-BACK transaction is
  // the wrong instrument when the probe's OWN witness-table INSERT must be observed
  // afterward -- a rollback discards that side effect along with anything else in the same
  // transaction. Both attack halves below run on ONE raw client, GUCs/role/claims set
  // SESSION-scoped (no wrapping BEGIN, so each statement autocommits and the witness INSERT
  // genuinely persists), reset via the estate's own recipe (`reset role` -> `reset all`,
  // db-tests.md) before the client is released back to the pool.
  async function attackAgentTasksVisibleAsDave() {
    const client = await getPool().connect();
    try {
      await client.query("set enable_indexscan = off");
      await client.query("set enable_bitmapscan = off");
      await client.query("set role clara_authenticated");
      await client.query("select set_config('request.jwt.claims', $1, false)",
        [JSON.stringify({ sub: world.users.dave, role: "authenticated" })]);
      await client.query("select id from clara.agent_tasks_visible where clara._hrd_a_snoop(id::text)");
    } finally {
      try { await client.query("reset role"); } catch { /* best-effort cleanup */ }
      try { await client.query("reset all"); } catch { /* best-effort cleanup */ }
      client.release();
    }
  }

  // ATTACK, WITH security_barrier (the live, migrated state), planner forced off index/bitmap
  // plans -- expect NO leak.
  await clearSnoopWitness();
  await attackAgentTasksVisibleAsDave();
  assert.equal(await snoopSaw(taskId), false,
    "WITH security_barrier, the probe must never see firm A's task id even with index/bitmap plans disabled");

  // ATTACK, WITHOUT security_barrier, SAME forced plan -- expect a leak. A REAL, COMMITTED
  // reset (restored in `finally`), same reasoning as debt-ATTACK1.
  await rootQuery("set role clara_fn_owner");
  await rootQuery("alter view clara.agent_tasks_visible reset (security_barrier)");
  await rootQuery("reset role");
  try {
    await clearSnoopWitness();
    await attackAgentTasksVisibleAsDave();
  } finally {
    await rootQuery("set role clara_fn_owner");
    await rootQuery("alter view clara.agent_tasks_visible set (security_barrier = true)");
    await rootQuery("reset role");
  }
  assert.equal(await snoopSaw(taskId), true,
    "WITHOUT security_barrier, forcing the planner off index/bitmap plans, the SAME probe/query shape must see firm A's task id -- proving the reloption, not some other property, is what closes the channel");
  // Restored, proven rather than assumed.
  const restored = await rootQuery(
    `select c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relname = 'agent_tasks_visible'`,
  );
  assert.ok(
    Array.isArray(restored.rows[0].reloptions) && restored.rows[0].reloptions.includes("security_barrier=true"),
    "agent_tasks_visible's security_barrier is restored after this cell",
  );
});

// NOTE (LOW-6, honest record): agent_receipts_visible and document_intakes_visible carry the
// IDENTICAL shape (same predicate, same census, now security_barrier=true) but a leak was NOT
// independently demonstrated on either -- this file does not claim otherwise. Covered by the
// same instrument; not attack-proven.

// ---------------------------------------------------------------------------------------
// D · THE ACL WALL — cross-role reach + the adversarial twin
// ---------------------------------------------------------------------------------------

// pi-A9's own shape: an ACL census via has_table_privilege, not an attempted read.
// PICK-UP FROM REVIEW: the original cell attempted `select ... limit 1` as each role and
// asserted 42501 — but that can never go red. jwt_firm()/actor_role_rank() are SECURITY
// DEFINER and ungranted to PUBLIC/every app role but clara_authenticated (0002/0103), so
// EVEN WITH a SELECT grant injected on a view, agent/wake/runtime roles hit 42501 on the
// VIEW'S OWN PREDICATE calling those functions — a second, unrelated wall — before the
// table-privilege check this cell claims to be proving ever gets to matter. assertRaises
// compares only err.code, so a query denied by either wall reads identically: "a read that
// cannot say NO has a meaningless YES" (this suite's own law, f-a7-pi.test.mjs pi-A9). The
// census below asks the catalog directly, and the positive control proves THAT instrument
// (not a read attempt) actually flips under an injected grant.
async function aclLeaks() {
  const views = [
    "firm_open_questions_visible", "client_identifier_promotions_visible", "users_visible",
  ];
  const roles = [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime];
  const bad = [];
  for (const view of views) {
    for (const role of roles) {
      const r = await rootQuery(
        "select has_table_privilege($1, $2, 'select') as ok", [role, `clara.${view}`]);
      if (r.rows[0].ok) bad.push(`${role} can SELECT clara.${view}`);
    }
  }
  return bad;
}

test("debt-D1 · THE ACL CENSUS — no agent/wake/runtime role holds SELECT on any of the three "
  + "views, and the census FLIPS when one is granted", async (t) => {
    if (gate(t)) return;
    assert.deepEqual(await aclLeaks(), [],
      "no agent/wake/runtime role holds SELECT on firm_open_questions_visible, "
      + "client_identifier_promotions_visible or users_visible");

    // THE POSITIVE CONTROL. Grant one, and the SAME instrument must name it — proving the
    // census can say YES, not just that it happened to say NO everywhere above.
    await inRolledBackTx(async (client) => {
      await client.query(`grant select on clara.users_visible to ${ROLES.agentRo}`);
      const r = await client.query(
        "select has_table_privilege($1, $2, 'select') as ok", [ROLES.agentRo, "clara.users_visible"]);
      assert.equal(r.rows[0].ok, true,
        "has_table_privilege DOES flip true under an injected grant — the census is a live instrument");
    });
    // Rolled back: the estate is clean again, proven rather than assumed.
    assert.deepEqual(await aclLeaks(), [], "the injected grant did not survive the cell");
  });

test("debt-D2 · THE ACL CENSUS — a stray grant on a BASE table is caught, and the census "
  + "clears once rolled back", async (t) => {
    if (gate(t)) return;
    // clara.users is deliberately EXCLUDED from this census: it was never ungranted
    // (0002:534-539 already grants clara_authenticated + clara_agent_ro select on it, a
    // multi-relation grant statement missed by an earlier text-grep — the migration's own
    // header explains it, and its tail proves that grant is byte-unchanged rather than
    // absent). Only the two tables THIS lane's views actually front are checked here.
    const baseGrantCensus = `
      select t.n from (values ('firm_open_questions'),('client_identifier_promotions')) t(n)
       where has_table_privilege('clara_authenticated', ('clara.'||t.n)::regclass, 'select')`;
    const clean = await rootQuery(baseGrantCensus);
    assert.equal(clean.rowCount, 0, "no base table grants clara_authenticated SELECT directly");

    await inRolledBackTx(async (client) => {
      await client.query("grant select on clara.client_identifier_promotions to clara_authenticated");
      const dirty = await client.query(baseGrantCensus);
      assert.equal(dirty.rowCount, 1, "the census names the wrongly-granted base table");
      assert.equal(dirty.rows[0].n, "client_identifier_promotions");
      const reachable = await client.query(
        "select has_table_privilege('clara_authenticated','clara.client_identifier_promotions','select') as ok");
      assert.equal(reachable.rows[0].ok, true, "the stray grant makes the base table's SELECT privilege reachable");
      // MEASURED FACT (corrected here after review — the first cut claimed "EVERY row", which
      // is true only for a VIEW): this base table carries FORCE RLS with ONLY the owner policy
      // (0103:961-962). A stray table-level grant widens REACHABILITY (has_table_privilege
      // above), but Postgres has no permissive policy naming clara_authenticated to admit any
      // row, so an ACTUAL read through the stray grant returns ZERO rows — proven, not asserted.
      // The real hole a stray grant would open is a grant PLUS a matching policy together;
      // this file names that distinction rather than building a wall against a threat that
      // (grant alone) does not exist.
      await client.query("set role clara_authenticated");
      const rows = await client.query("select * from clara.client_identifier_promotions");
      assert.equal(rows.rowCount, 0,
        "FORCE RLS with only the owner policy admits ZERO rows to clara_authenticated, even once granted");
    });
    // Rolled back: the estate is clean again, proven rather than assumed.
    assert.equal((await rootQuery(baseGrantCensus)).rowCount, 0, "the grant did not survive the cell");
  });

test("debt-D3 · revoking the view grant actually removes the read (the grant is load-bearing, "
  + "not decorative)", async (t) => {
    if (gate(t)) return;
    // Same-session belt: within ONE transaction, revoke then immediately SET ROLE and try the
    // read — a session sees its OWN uncommitted DDL, so this needs no cross-connection commit
    // and rolls back cleanly. The failing SELECT aborts the transaction (Postgres refuses
    // further statements until it ends), so nothing after it but the helper's own ROLLBACK
    // runs — SET ROLE is itself transactional, so the rollback also undoes the impersonation.
    await inRolledBackTx(async (client) => {
      await client.query("revoke select on clara.users_visible from clara_authenticated");
      await client.query("set role clara_authenticated");
      await assert.rejects(
        () => client.query("select 1 from clara.users_visible limit 1"),
        (err) => err.code === "42501",
        "clara_authenticated cannot read users_visible once its grant is revoked",
      );
    });
    // Rolled back: the grant is restored, proven rather than assumed (not a tautology — bob
    // reading his OWN row back through users_visible is a real, specific positive result).
    const restored = await humanQuery(world.users.bob, "select 1 as ok from clara.users_visible limit 1");
    assert.equal(restored.rowCount, 1, "the grant survives outside the rolled-back cell");
    assert.equal(restored.rows[0].ok, 1);
  });
