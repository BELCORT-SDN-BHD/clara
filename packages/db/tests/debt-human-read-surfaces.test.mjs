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
after(async () => { await endPool(); });

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
