// #899 — THE CLIENT BIRTH WALL. Migration: 0287_client_birth_wall.sql; gated on the LIVE
// CATALOG, never on the number.
//
// WHAT THIS BATTERY OWNS. Two doors and a census:
//   * `clara.open_client_onboarding` — the NEW birth verb: arity 0 proceeds, arity 1 requires
//     `p_acknowledged_candidate` to name the one candidate `clara.client_identity_candidates`
//     returns, arity >=2 raises CLR10 `name_family_collision` with that read's own rows — all
//     of it reachable with NO prior call to the read (`p899.new_verb.*`).
//   * `clara.begin_client_onboarding`, RE-POINTED: arity >=2 now raises the SAME CLR10, closing
//     `client-onboarding-identity.test.mjs`'s own `p649.identity.direct_birth_residual`
//     (`p899.legacy.*`). Arity 1 is DELIBERATELY UNCHANGED — 0287's own header measures why —
//     and one cell here proves that boundary rather than leaving it assumed.
//   * `p899.census.*` — a live, catalogue-derived sweep of every granted, client-minting body,
//     naming `clara.create_client` as the ONE documented, tested exception (0287's header has
//     the full evidence: re-pointing it would turn `buildWorld()`/`buildWaveBWorld()` and
//     `name-only-guard.test.mjs` red for a fixture-naming coincidence unrelated to what any of
//     them test).
//
// EVERY ASSERTION GOES THROUGH `humanQuery` — a real per-role session under real RLS. `rootQuery`
// appears only to PLANT a fixture (client-onboarding-identity.test.mjs's own posture: going
// through `create_firm`/`add_member` here would only add ways to fail for reasons that are not
// the subject) or to read the CATALOG for the census cell.

import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  CLR, assertRaises, endPool, humanQuery, opk, rootQuery,
} from "./rig-fixtures.mjs";

const EXPECTED_CELLS = 11;
let live = false;
let executed = 0;

/** True iff 0287's own cohort is applied. A PARTIAL cohort THROWS — the estate's "wholly present
 *  or wholly absent" rule (rig-meta.mjs's cohortFailures). */
async function birthWallCohortApplied() {
  const r = await rootQuery(
    `select
       to_regprocedure('clara._client_birth_core(uuid,uuid,text,jsonb,uuid,boolean,text,text)') is not null as core,
       to_regprocedure('clara.open_client_onboarding(text,text,jsonb,uuid)')                    is not null as open_door,
       (select position('_client_birth_core' in prosrc) > 0
          from pg_proc where oid = 'clara.begin_client_onboarding(text,text)'::regprocedure)     as legacy_repointed`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#899 0287 cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

before(async () => { live = await birthWallCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CLIENT_BIRTH_WALL === "1") {
    console.warn("SKIP client-birth-wall: the 0287 cohort is not applied (explicit pre-integration run).");
    t.skip("0287 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0287 client-birth-wall cohort is required for a focused run: apply 0287_client_birth_wall.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------
// Fixtures. PLANTED through the root connection: the subject is the birth doors, so going
// through create_firm/add_member only adds ways to fail for reasons that are not the subject.
// Client-onboarding-identity.test.mjs's own posture, restated here rather than imported from a
// .test.mjs file.
// ---------------------------------------------------------------------------

async function firmWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`p899_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const role of ["owner", "admin", "bookkeeper", "viewer"]) {
    const id = randomUUID();
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `p899 ${role} ${suffix}`, `p899_${role}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [firm, id, role],
    );
    people[role] = id;
  }
  return { firm, suffix, ...people };
}

const addClient = async (firm, name, status = "active") =>
  (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,$3) returning id",
    [firm, name, status],
  )).rows[0].id;

const addCounterparty = async (firm, client, name, createdBy) =>
  (await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
     values ($1,$2,'vendor',$3, lower(regexp_replace($3, '[^a-zA-Z0-9]', '', 'g')), $4) returning id`,
    [firm, client, name, createdBy],
  )).rows[0].id;

// ---------------------------------------------------------------------------
// Door callers. NAMED arguments throughout (rig-helpers' SIGNATURE STRATEGY).
// ---------------------------------------------------------------------------

const CANDIDATES = `select clara.client_identity_candidates(p_name => $1, p_identifier => $2::jsonb) as r`;
const candidatesAs = (sub, name) =>
  humanQuery(sub, CANDIDATES, [name, null]).then((r) => r.rows[0].r);

const openAs = (sub, name, { opKey = opk("p899_open"), identifier = null, ack = null } = {}) =>
  humanQuery(sub,
    "select clara.open_client_onboarding(p_name => $1, p_op_key => $2, p_identifier => $3::jsonb, p_acknowledged_candidate => $4::uuid) as r",
    [name, opKey, identifier === null ? null : JSON.stringify(identifier), ack])
    .then((r) => r.rows[0].r);

const beginAs = (sub, name, opKey = opk("p899_begin")) =>
  humanQuery(sub, "select clara.begin_client_onboarding(p_name => $1, p_op_key => $2) as r", [name, opKey])
    .then((r) => r.rows[0].r);

const clientCount = async (firm) =>
  Number((await rootQuery("select count(*)::int n from clara.clients where firm_id=$1", [firm])).rows[0].n);

const reasonOf = (err) => { try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; } };
const detailOf = (err) => { try { return JSON.parse(err.detail ?? "{}"); } catch { return {}; } };

// ===========================================================================
// clara.open_client_onboarding
// ===========================================================================

cell("p899.new_verb.arity_zero — nothing in the firm answers to the name; the door creates the client and its plan in one call", async () => {
  const w = await firmWorld("open0");
  const name = `Utara Trading ${w.suffix}`;
  const out = await openAs(w.admin, name);
  assert.ok(out.client_id, "a client was born");
  assert.ok(out.plan_id, "…with its onboarding plan");
  const row = await rootQuery("select name, status from clara.clients where id=$1", [out.client_id]);
  assert.equal(row.rows[0].status, "onboarding");
  assert.equal(row.rows[0].name, name);
});

cell("p899.new_verb.arity_two_no_prior_read — AC1: called with NO prior read, the door refuses at two-or-more with the SAME token and rows the read itself returns", async () => {
  const w = await firmWorld("open2");
  const client = await addClient(w.firm, `Selatan Holdings ${w.suffix}`);
  const cp = await addCounterparty(w.firm, client, `Selatan Logistics ${w.suffix}`, w.admin);
  const name = "Selatan Ventures Berhad";
  const before_ = await clientCount(w.firm);

  // The independent source of truth: what the READ itself would answer, asked separately.
  const readErr = await assertRaises(CLR.badRequest, () => candidatesAs(w.admin, name), "the read, for comparison");
  const readDetail = detailOf(readErr);

  // THE DOOR, asked directly, with NO candidates() call preceding it in this cell.
  const doorErr = await assertRaises(CLR.badRequest, () => openAs(w.admin, name), "open_client_onboarding, no prior read");
  assert.equal(reasonOf(doorErr), "name_family_collision");
  const doorDetail = detailOf(doorErr);
  assert.equal(doorDetail.arity, readDetail.arity, "same arity");
  assert.deepEqual(
    doorDetail.candidates.map((c) => c.id).sort(),
    readDetail.candidates.map((c) => c.id).sort(),
    "same candidate ids",
  );
  assert.deepEqual(doorDetail.candidates.map((c) => c.id).sort(), [client, cp].sort());
  assert.equal(doorDetail.name, name);
  assert.equal(await clientCount(w.firm), before_, "a refused birth creates nothing");
});

cell("p899.new_verb.arity_one_unacknowledged_refused — AC2 (refusal half): no p_acknowledged_candidate, no creation", async () => {
  const w = await firmWorld("ack_no");
  const only = await addClient(w.firm, `Timur Public Advisory ${w.suffix}`, "onboarding");
  const before_ = await clientCount(w.firm);

  const err = await assertRaises(CLR.badRequest, () => openAs(w.admin, "Timur Ventures Berhad"), "unacknowledged arity 1");
  assert.equal(reasonOf(err), "identity_acknowledgement_required");
  const d = detailOf(err);
  assert.equal(d.arity, 1);
  assert.equal(d.candidates.length, 1);
  assert.equal(d.candidates[0].id, only);
  assert.equal(await clientCount(w.firm), before_, "nothing born while unacknowledged");

  // A WRONG id (not the candidate the read actually returned) is refused the same way — an
  // acknowledgement names a SPECIFIC candidate, never a bare "yes".
  const wrongErr = await assertRaises(CLR.badRequest,
    () => openAs(w.admin, "Timur Ventures Berhad", { ack: randomUUID() }),
    "acknowledging a candidate the read never returned");
  assert.equal(reasonOf(wrongErr), "identity_acknowledgement_required");
  assert.equal(await clientCount(w.firm), before_);
});

cell("p899.new_verb.arity_one_acknowledged_succeeds — AC2 (success half): naming the one candidate the read returns creates the client", async () => {
  const w = await firmWorld("ack_yes");
  const only = await addClient(w.firm, `Utara Public Advisory ${w.suffix}`, "onboarding");
  const name = "Utara Ventures Berhad";

  const answer = await candidatesAs(w.admin, name);
  assert.equal(answer.arity, 1);
  assert.equal(answer.candidates[0].id, only);

  const out = await openAs(w.admin, name, { ack: only });
  assert.ok(out.client_id, "the acknowledged arity-1 call creates the client");
  assert.notEqual(out.client_id, only, "a NEW client, not the acknowledged one");
  const row = await rootQuery("select status from clara.clients where id=$1", [out.client_id]);
  assert.equal(row.rows[0].status, "onboarding");
});

cell("p899.new_verb.replay — same-op_key retry replays the receipt byte-identically, exactly once born, even though the retry's OWN identity check now sees the client the first call just created (the reservation-before-wall ordering this proves)", async () => {
  const w = await firmWorld("replay");
  const name = `Timur Trading ${w.suffix}`;
  const key = opk("p899_replay");
  const r1 = await openAs(w.admin, name, { opKey: key });
  const r2 = await openAs(w.admin, name, { opKey: key });
  assert.deepEqual(r1, r2, "byte-identical receipt");
  assert.equal(await clientCount(w.firm), 1, "exactly one client, not two");
});

cell("p899.new_verb.floor — admin floor, matching every other client-minting body", async () => {
  const w = await firmWorld("floor");
  await assertRaises(CLR.authz, () => openAs(w.bookkeeper, `Barat Trading ${w.suffix}`), "bookkeeper");
  await assertRaises(CLR.authz, () => openAs(w.viewer, `Barat Trading ${w.suffix}`), "viewer");
});

// ===========================================================================
// clara.begin_client_onboarding — RE-POINTED
// ===========================================================================

cell("p899.legacy.arity_two_now_refused — closes p649.identity.direct_birth_residual: the legacy two-argument door no longer creates a third same-family client", async () => {
  const w = await firmWorld("legacy2");
  const client = await addClient(w.firm, `Rome Public Advisory ${w.suffix}`);
  const cp = await addCounterparty(w.firm, client, `Rome Logistics ${w.suffix}`, w.admin);
  const before_ = await clientCount(w.firm);

  const err = await assertRaises(CLR.badRequest, () => beginAs(w.admin, "Rome Ventures Berhad"),
    "begin_client_onboarding at arity 2, no prior read");
  assert.equal(reasonOf(err), "name_family_collision");
  const d = detailOf(err);
  assert.deepEqual(d.candidates.map((c) => c.id).sort(), [client, cp].sort());
  assert.equal(await clientCount(w.firm), before_, "the residual is closed: nothing is born");
});

cell("p899.legacy.arity_one_unchanged — the deliberate scope boundary: at arity 1 the legacy door still creates (it has no argument to carry an acknowledgement), exactly as before 0287", async () => {
  const w = await firmWorld("legacy1");
  const only = await addClient(w.firm, `Selatan Public Advisory ${w.suffix}`, "onboarding");
  const out = await beginAs(w.admin, "Selatan Ventures Berhad");
  assert.ok(out.client_id, "arity 1 through the legacy door still succeeds — see 0287's header for why");
  assert.notEqual(out.client_id, only);
});

cell("p899.legacy.arity_zero_unchanged — begin_client_onboarding's own ordinary case is untouched by 0287", async () => {
  const w = await firmWorld("legacy0");
  const name = `Zamboni Holdings ${w.suffix}`;
  const out = await beginAs(w.admin, name);
  assert.ok(out.client_id);
  assert.ok(out.plan_id);
});

// ===========================================================================
// The census
// ===========================================================================

cell("p899.census.granted_client_minters_have_wall_except_create_client — a live, catalogue-derived sweep: every granted human-reachable body that mints a clara.clients row, DIRECTLY or by delegating to clara._client_birth_core, calls the wall, except the one documented exception", async () => {
  // TWO SHAPES OF MINTER, because §A of 0287 moved the literal `insert into clara.clients(` out
  // of every granted door and into one ungranted shared core: a census that only grepped granted
  // bodies for that literal text (0017's own historical tail did exactly that) would now see
  // NOTHING, since `open_client_onboarding` and `begin_client_onboarding` no longer contain it —
  // they DELEGATE. So a minter is either (a) a granted body with the literal insert in its own
  // text, or (b) a granted body that calls `_client_birth_core(`, the one ungranted body that
  // still carries it.
  const r = await rootQuery(
    `select p.proname,
            regexp_replace(lower(p.prosrc), '\\s+', '', 'g') as norm
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
       join pg_roles ro on ro.oid = a.grantee
      where n.nspname = 'clara' and a.privilege_type = 'EXECUTE'
        and ro.rolname in ('clara_authenticated', 'clara_runtime', 'clara_agent_ro',
                            'clara_wake_interactive', 'clara_wake_proactive')
        and (regexp_replace(lower(p.prosrc), '\\s+', '', 'g') like '%insertintoclara.clients(%'
             or regexp_replace(lower(p.prosrc), '\\s+', '', 'g') like '%_client_birth_core(%')`,
  );
  const minters = [...new Set(r.rows.map((x) => x.proname))].sort();
  assert.deepEqual(minters, ["begin_client_onboarding", "create_client", "open_client_onboarding"],
    `the set of granted client-minting bodies changed -- update this census deliberately if that is intended (got ${JSON.stringify(minters)})`);

  // clara._client_birth_core ITSELF must not appear here: it is granted to nobody, so a row for
  // it would mean it gained a human/agent/wake grant -- exactly the finding this sweep exists to
  // catch. It is asserted directly for a belt, since the query above only selects GRANTED bodies.
  const coreGrant = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, '{}'::aclitem[])) a
      join pg_roles ro on ro.oid = a.grantee
     where n.nspname = 'clara' and p.proname = '_client_birth_core'
       and a.privilege_type = 'EXECUTE'
       and ro.rolname in ('clara_authenticated', 'clara_runtime', 'clara_agent_ro',
                           'clara_wake_interactive', 'clara_wake_proactive')`,
  );
  assert.equal(coreGrant.rows[0].n, 0, "clara._client_birth_core must not be human/agent/wake reachable");

  // A minter HAS THE WALL when its own body either carries the read directly (create_client, if
  // it ever were re-pointed) or delegates to the shared core that does (open_client_onboarding,
  // begin_client_onboarding both call `clara._client_birth_core(`, whose OWN body — pinned by
  // 0287's tail — calls `clara.client_identity_candidates`).
  const hasWall = (norm) => norm.includes("client_identity_candidates(") || norm.includes("_client_birth_core(");
  const unwalled = [...new Set(r.rows.filter((x) => !hasWall(x.norm)).map((x) => x.proname))].sort();
  assert.deepEqual(unwalled, ["create_client"],
    `expected create_client as the ONLY granted client-minting body without the wall (got ${JSON.stringify(unwalled)}) -- see 0287's header for why it is the one documented exception`);
});

cell("p899.census.create_client_documented_exception — the residual, named and evidenced rather than silent: create_client still creates without the wall, and buildWorld()'s own two-same-family-client shape is why 0287 does not touch it", async () => {
  const w = await firmWorld("cc_resid");
  const a1 = (await humanQuery(w.admin, "select clara.create_client(p_name => $1, p_op_key => $2) as r",
    [`rig_${w.suffix}_A1`, opk("p899cc")])).rows[0].r;
  // A SECOND same-leading-token ("rig") client in the SAME firm -- exactly buildWorld()'s own
  // A1/A2 shape -- succeeds silently, because create_client is not re-pointed.
  const a2 = (await humanQuery(w.admin, "select clara.create_client(p_name => $1, p_op_key => $2) as r",
    [`rig_${w.suffix}_A2`, opk("p899cc")])).rows[0].r;
  assert.ok(a1.client_id);
  assert.ok(a2.client_id);
  assert.notEqual(a1.client_id, a2.client_id);
});
