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
//   * `p899.census.*` — a live, catalogue-derived sweep of every granted, client-minting body.
//     `clara.create_client` is `begin_client_onboarding`/`open_client_onboarding`'s ONE sibling
//     that mints a client with no identity wall at all — the reason it is a residual and not a
//     third walled door.
//
// #1038 (riders wave 4, lane 06, migration 0316_create_client_human_grant_withdrawn.sql) CLOSES
// that residual: `clara.create_client`'s `clara_authenticated` grant is WITHDRAWN, so no human
// role can execute it any more (its body stays exactly as 0287 left it — unwalled — because the
// rig's own shared fixtures and `packages/db/scripts/onboard-rpr.mjs` still need that shape; they
// reach it as the postgres superuser with a hand-set `request.jwt.claims` GUC instead, never
// through a grant). The census cells below that depended on the OLD (still-granted) shape are
// REWRITTEN, gated on 0316's OWN stem (`GRANT_WITHDRAWN_STEM` below) rather than 0287's alone —
// the `firm-setup-applicability.test.mjs` / `TIN_REQUIRED_STEM` idiom: a database carrying 0287
// but not yet 0316 skips them loudly instead of asserting a shape the catalogue can no longer
// produce.
//
// EVERY ASSERTION GOES THROUGH `humanQuery` — a real per-role session under real RLS. `rootQuery`
// appears only to PLANT a fixture (client-onboarding-identity.test.mjs's own posture: going
// through `create_firm`/`add_member` here would only add ways to fail for reasons that are not
// the subject) or to read the CATALOG for the census cell.

import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  CLR, PG, assertRaises, endPool, humanQuery, opk, rootQuery,
} from "./rig-fixtures.mjs";
// The two-session machinery (two dedicated pooled clients, a human session on each, and a block
// PROVEN from pg_blocking_pids rather than a sleep) is REUSED from the estate's own helpers
// module rather than copied a fourth time — it is a plain module of generic helpers, not a
// battery's fixtures, and it imports nothing but rig-helpers.
import { asHumanSession, twoSessions, waitBlockedByOrThrow } from "./binding-proposal-pr-1-helpers.mjs";

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

// #1038 (0316_create_client_human_grant_withdrawn.sql) — its OWN stem, separate from 0287's
// above (the `firm-setup-applicability.test.mjs` / `TIN_REQUIRED_STEM` idiom, verbatim): a
// database carrying 0287 but not yet 0316 must skip the cells below loudly rather than assert a
// shape `create_client`'s grant can no longer take.
const GRANT_WITHDRAWN_STEM = "create_client_human_grant_withdrawn$";
let grantWithdrawnLive = false;
let grantWithdrawnExecuted = 0;
const GRANT_WITHDRAWN_EXPECTED_CELLS = 4;

/** True iff a migration whose version matches 0316's stable stem is recorded applied. */
async function grantWithdrawnCohortApplied() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [GRANT_WITHDRAWN_STEM]);
  return r.rows[0].n > 0;
}

before(async () => {
  live = await birthWallCohortApplied();
  grantWithdrawnLive = await grantWithdrawnCohortApplied();
});
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  if (grantWithdrawnLive) {
    assert.equal(grantWithdrawnExecuted, GRANT_WITHDRAWN_EXPECTED_CELLS,
      `expected ${GRANT_WITHDRAWN_EXPECTED_CELLS} #1038 grant-withdrawn cells to run, ${grantWithdrawnExecuted} did`);
  }
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

function gateGrantWithdrawn(t) {
  if (grantWithdrawnLive) return false;
  if (process.env.CLARA_ALLOW_MISSING_CREATE_CLIENT_GRANT_WITHDRAWN === "1") {
    console.warn("SKIP client-birth-wall (#1038 cells): 0316 is not applied (explicit pre-integration run).");
    t.skip("0316 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the #1038 create_client-grant-withdrawn cells require 0316_create_client_human_grant_withdrawn.sql for a focused run");
}

function cellGrantWithdrawn(name, fn) {
  test(name, async (t) => {
    if (gateGrantWithdrawn(t)) return;
    grantWithdrawnExecuted += 1;
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
const candidatesAs = (sub, name, identifier = null) =>
  humanQuery(sub, CANDIDATES, [name, identifier === null ? null : JSON.stringify(identifier)])
    .then((r) => r.rows[0].r);

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

cell("p899.new_verb.identifier_is_recorded_not_only_consulted — p_identifier is a WALL INPUT, so the door stores it: the next caller quoting the same identifier meets the client this one created instead of an arity the first caller's argument silently dropped", async () => {
  const w = await firmWorld("ident");
  // The estate records three identifier kinds (clara.client_identity_candidates' own list); the
  // value carries whitespace and upper case on purpose, because the store normalises both away.
  const identifier = { kind: "tin", value: `C ${w.suffix} 42 X` };
  const normalised = `c${w.suffix}42x`; // written out by hand, not re-derived from the door

  const first = await openAs(w.admin, `Kinta Mining ${w.suffix}`, { identifier });
  assert.ok(first.client_id, "arity 0 with an identifier still proceeds");

  const stored = await rootQuery(
    "select kind, value_normalized, firm_id, added_by from clara.client_identifiers where client_id = $1",
    [first.client_id]);
  assert.equal(stored.rowCount, 1, "the identifier the wall was asked about is RECORDED against the new client");
  assert.equal(stored.rows[0].kind, "tin");
  assert.equal(stored.rows[0].value_normalized, normalised,
    "stored under clara.add_client_identifier's own normalisation, so the read that walls on it can match");
  assert.equal(stored.rows[0].firm_id, w.firm);
  assert.equal(stored.rows[0].added_by, w.admin);

  // THE POINT: the read now answers for that identifier, under a COMPLETELY different name...
  const answer = await candidatesAs(w.admin, `Perak Quarry ${w.suffix}`, identifier);
  assert.equal(answer.arity, 1);
  assert.equal(answer.candidates[0].id, first.client_id);
  assert.equal(answer.candidates[0].match_reason, "identifier");

  // ...and the door refuses that second birth until the candidate is acknowledged.
  const err = await assertRaises(CLR.badRequest,
    () => openAs(w.admin, `Perak Quarry ${w.suffix}`, { identifier }),
    "a second birth quoting an identifier already recorded in this firm");
  assert.equal(reasonOf(err), "identity_acknowledgement_required");
  assert.equal(detailOf(err).candidates[0].id, first.client_id);

  // A MALFORMED identifier is refused by the wall BEFORE anything is created — the door never
  // stores what it did not wall against.
  const before_ = await clientCount(w.firm);
  const bad = await assertRaises(CLR.badRequest,
    () => openAs(w.admin, `Pahang Estates ${w.suffix}`, { identifier: { kind: "passport", value: "A1" } }),
    "an identifier kind this estate does not record");
  assert.equal(reasonOf(bad), "identifier_kind_unknown");
  assert.equal(await clientCount(w.firm), before_, "nothing born on a refused identifier");
});

cell("p899.new_verb.concurrent_same_family_serialised — the wall is not a TOCTOU: a SECOND session racing the same family blocks at the door's own lock, then meets the wall the sequential caller meets, instead of minting a third same-family client behind the first one's uncommitted insert", async () => {
  const w = await firmWorld("race");
  // One same-family party already exists, so BOTH racers read arity 1 and BOTH acknowledge it —
  // the shape an adversarial review drove to three same-family clients in one firm before this
  // door took a lock. The leading token (`clara.name_family_token` = the first token of the
  // normalised name) is unique to this cell's own run, so no sibling cell shares the family.
  const token = `Rentak${w.suffix.replace(/[^a-z0-9]/gi, "")}`;
  const only = await addClient(w.firm, `${token} Public Advisory`, "onboarding");
  const before_ = await clientCount(w.firm);

  const outcome = await twoSessions(async (cA, cB) => {
    const pidA = await asHumanSession(cA, w.admin);
    const pidB = await asHumanSession(cB, w.admin);
    await cA.query("begin");
    await cB.query("begin");

    // A creates, INSIDE an open transaction: its client row is invisible to B's snapshot, which
    // is exactly the window the read-then-insert pair used to leave open.
    const a = (await cA.query(
      "select clara.open_client_onboarding(p_name => $1, p_op_key => $2, p_identifier => null, p_acknowledged_candidate => $3::uuid) as r",
      [`${token} Ventures Alpha`, opk("p899_raceA"), only])).rows[0].r;
    assert.ok(a.client_id, "session A's birth succeeds");

    // B asks the same question of the same family while A still holds.
    const racing = cB.query(
      "select clara.open_client_onboarding(p_name => $1, p_op_key => $2, p_identifier => null, p_acknowledged_candidate => $3::uuid) as r",
      [`${token} Ventures Beta`, opk("p899_raceB"), only])
      .then((r) => ({ receipt: r.rows[0].r, error: null }), (error) => ({ receipt: null, error }));

    // PROVEN from pg_stat_activity, never from a sleep: B is waiting on a LOCK held by A.
    await waitBlockedByOrThrow(pidB, pidA);

    await cA.query("commit");
    const settled = await racing;
    await cB.query("rollback");
    return settled;
  });

  assert.ok(outcome.error, "the second racer must not create silently behind the first one's insert");
  assert.equal(outcome.error.code, CLR.badRequest);
  assert.equal(reasonOf(outcome.error), "name_family_collision",
    "once serialised, B sees the two parties A left behind and meets the SAME wall a sequential caller meets");
  assert.equal(detailOf(outcome.error).arity, 2);
  assert.equal(await clientCount(w.firm), before_ + 1,
    "exactly ONE of the two racers was born — never the three-same-family state the door refuses sequentially");
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

cellGrantWithdrawn("p899.census.no_unwalled_granted_client_minters — #1038 CLOSES the residual the #899 cells once bounded: a live, catalogue-derived sweep of every granted human-reachable body that mints a clara.clients row, DIRECTLY or by delegating to clara._client_birth_core, now finds NO minter without the wall -- the ticket's own criterion (\"no granted human role can reach a client-minting verb that lacks the wall\") is MET, not merely bounded", async () => {
  // TWO SHAPES OF MINTER, because §A of 0287 moved the literal `insert into clara.clients(` out
  // of every granted door and into one ungranted shared core: a census that only grepped granted
  // bodies for that literal text (0017's own historical tail did exactly that) would now see
  // NOTHING, since `open_client_onboarding` and `begin_client_onboarding` no longer contain it —
  // they DELEGATE. So a minter is either (a) a granted body with the literal insert in its own
  // text, or (b) a granted body that calls `_client_birth_core(`, the one ungranted body that
  // still carries it. `create_client` never appears in this sweep any more: 0316 withdrew its
  // ONLY grant among the five roles this sweep checks, so it simply has no row to match.
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
  assert.deepEqual(minters, ["begin_client_onboarding", "open_client_onboarding"],
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

  // A minter HAS THE WALL when its own body either carries the read directly or delegates to the
  // shared core that does (open_client_onboarding, begin_client_onboarding both call
  // `clara._client_birth_core(`, whose OWN body — pinned by 0287's tail — calls
  // `clara.client_identity_candidates`).
  const hasWall = (norm) => norm.includes("client_identity_candidates(") || norm.includes("_client_birth_core(");
  const unwalled = [...new Set(r.rows.filter((x) => !hasWall(x.norm)).map((x) => x.proname))].sort();
  // THE CRITERION, MET: this array is EMPTY. A non-empty result here is a regression -- some
  // granted body reaches clara.clients without going through the wall again.
  assert.deepEqual(unwalled, [],
    `the set of granted client-minting bodies WITHOUT the wall must be EMPTY now that #1038 has withdrawn create_client's grant (got ${JSON.stringify(unwalled)})`);
});

// The trees a browser or the runtime actually ships. Same "production" the operation census and
// sandbox-marker.test.mjs mean (RUNTIME_ROOTS in scripts/operation-census/scope.mjs), plus
// apps/web/components, which is production the other two sweep under different names.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const PRODUCT_TREES = [
  "apps/web/app", "apps/web/components", "apps/web/lib",
  "packages/runtime/lib", "packages/runtime/plugins", "packages/runtime/scripts",
  "packages/runtime/src", "packages/runtime/workflows",
];
const SWEEP_EXTENSIONS = [".sql", ".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".output", ".nitro", "dist", "coverage", ".wrangler", ".open-next"]);

/** Every line under `root` naming `pattern`, as `path:line`. A test file never reaches here:
 *  none of PRODUCT_TREES is a test tree, and `.test.` files inside them are excluded by name. */
function sweepFor(root, pattern) {
  const abs = join(REPO_ROOT, root);
  const hits = [];
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return hits;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); continue; }
      if (!SWEEP_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
      if (/\.(test|spec)\./.test(entry.name)) continue;
      const rel = relative(REPO_ROOT, full).split(sep).join("/");
      readFileSync(full, "utf8").split("\n").forEach((line, i) => {
        if (pattern.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
  };
  walk(abs);
  return hits;
}

cellGrantWithdrawn("p899.census.create_client_residual_closed — the one unwalled granted minter #899 bounded is now UNGRANTED to clara_authenticated: the catalogue says so, no product surface ever called it, and the one non-test caller (the operator script) was always root+jwt rather than the grant", async () => {
  // (a) THE CATALOGUE SAYS IT, not only a migration header a reader must go and find. A comment
  // is the one statement about a function every client of pg_proc can read.
  const comment = (await rootQuery(
    "select obj_description('clara.create_client(text,text)'::regprocedure, 'pg_proc') as c")).rows[0].c;
  assert.ok(comment, "clara.create_client carries no catalogue comment at all");
  for (const token of ["superseded", "open_client_onboarding", "#1038", "withdrawn"]) {
    assert.ok(comment.toLowerCase().includes(token.toLowerCase()),
      `clara.create_client's comment must name ${token} -- a closure nobody wrote down is a closure nobody can verify (got: ${JSON.stringify(comment)})`);
  }

  // (b) NO PRODUCT SURFACE CALLS IT. Unchanged by #1038 -- the browser trees and every runtime
  // tree the operation census counts as a production call site are swept for the name itself.
  const productHits = PRODUCT_TREES.flatMap((root) => sweepFor(root, /\bcreate_client\b/));
  assert.deepEqual(productHits, [],
    "a product surface reaches clara.create_client -- it can be walked around from a browser or the runtime");

  // (c) THE ONE NON-TEST CALLER ANYWHERE is the beta onboarding operator script, and it never
  // rode the clara_authenticated grant: it runs as the postgres superuser with a jwt GUC (its own
  // "HUMAN-CONTEXT IDIOM" header) -- unaffected by #1038's revoke, exactly as 0287's own header
  // predicted.
  const operator = readFileSync(join(REPO_ROOT, "packages/db/scripts/onboard-rpr.mjs"), "utf8");
  assert.ok(/clara\.create_client\(/.test(operator), "the operator script no longer calls create_client -- re-derive this census");
  assert.equal(/set\s+role\s+clara_authenticated/.test(operator), false,
    "the operator script SET ROLEs to clara_authenticated -- it would now depend on the grant #1038 withdrew");

  // (d) THE DIRECT PROOF, independent of (a)-(c): clara_authenticated genuinely lacks EXECUTE.
  const grant = await rootQuery(
    "select has_function_privilege('clara_authenticated', 'clara.create_client(text,text)'::regprocedure, 'execute') as ok");
  assert.equal(grant.rows[0].ok, false, "clara_authenticated must not hold EXECUTE on clara.create_client");
});

cellGrantWithdrawn("p899.census.create_client_refuses_the_human_grant — #1038's own vacuity control: the EXACT call shape this file's history once proved SUCCEEDING (two same-family clients, no wall) now REFUSES 42501 insufficient_privilege, because clara_authenticated no longer holds EXECUTE", async () => {
  const w = await firmWorld("cc_closed");
  await assert.rejects(
    () => humanQuery(w.admin, "select clara.create_client(p_name => $1, p_op_key => $2) as r",
      [`rig_${w.suffix}_A1`, opk("p899cc")]),
    (err) => {
      assert.equal(err.code, PG.insufficientPrivilege,
        `expected ${PG.insufficientPrivilege} insufficient_privilege, got ${err.code ?? "no error"}`);
      return true;
    },
    "a human clara_authenticated session must no longer be able to execute clara.create_client at all",
  );
  // Nothing was born: the refusal is at the grant, before the function body ever runs.
  const n = await rootQuery("select count(*)::int as n from clara.clients where firm_id = $1", [w.firm]);
  assert.equal(n.rows[0].n, 0, "a grant-level refusal creates nothing");
});

// THE TWO FIXTURE TREES THIS CENSUS WALKS. The first cut of this cell (#1038, before the lane's
// own fix round) swept `packages/db/tests` ALONE, so `packages/runtime/tests/relay-fixtures.mjs`
// -- the OTHER shared fixture that mints clients, referenced by ~90 runtime batteries -- kept
// calling the verb through the withdrawn grant and failed 42501 on every database carrying 0316
// while this census stayed green. Both fixture trees are swept now, so a call site outside
// packages/db can never hide from it again.
const CREATE_CLIENT_CENSUS_TREES = ["packages/db/tests", "packages/runtime/tests"];

// The TWO legitimate call sites for the raw, unwalled clara.create_client( verb -- one shared
// fixture per test tree, each reaching it as the base identity with a hand-set jwt claim (the
// root+jwt idiom 0316's own header names), and everywhere else in either tree reaching it, if at
// all, only through that tree's fixture. This file itself is the THIRD legitimate reference: its
// own p899.census.create_client_refuses_the_human_grant cell above calls the literal SQL
// directly, on purpose, to prove the refusal.
const CREATE_CLIENT_CENSUS_EXEMPT = new Set([
  "packages/db/tests/rig-fixtures.mjs",
  "packages/runtime/tests/relay-fixtures.mjs",
  "packages/db/tests/client-birth-wall.test.mjs",
]);

/** Every .mjs file under CREATE_CLIENT_CENSUS_TREES naming `clara.create_client(` directly, as
 *  `path:line`, EXCLUDING the exempt files above. Unlike `sweepFor` (PRODUCT_TREES only), this
 *  walks test files too -- `.test.mjs` names are the whole POINT of this sweep, not excluded by
 *  name. */
function sweepTestsForCreateClient() {
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(full); continue; }
      if (!entry.name.endsWith(".mjs")) continue;
      const rel = relative(REPO_ROOT, full).split(sep).join("/");
      if (CREATE_CLIENT_CENSUS_EXEMPT.has(rel)) continue;
      readFileSync(full, "utf8").split("\n").forEach((line, i) => {
        if (/\bclara\.create_client\(/.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      });
    }
  };
  for (const root of CREATE_CLIENT_CENSUS_TREES) walk(join(REPO_ROOT, root));
  return hits.sort();
}

// HOW AC1 IS MET, STATED PLAINLY (#1038's fix round, review finding L06-SPEC-09). AC1's letter is
// "No test fixture calls the direct door". It is met by the brief's OWN PARENTHETICAL -- "or a
// fixture-only door that no human role can execute" -- and NOT by the literal clause: the two
// shared fixtures still name clara.create_client, but 0316 withdrew its clara_authenticated
// grant, so it IS now a door no human role can execute, and the fixtures reach it only as the
// base identity (the route every migration and seed file already takes). The OTHER route #899's
// own follow-up named -- migrating 48+ batteries onto clara.open_client_onboarding -- is NOT
// taken here and stays open; fixture-minted clients therefore still bypass the identity-collision
// wall #899 put on the product entrance, which is why this file's own wall cells drive
// open_client_onboarding directly rather than through a fixture.
cellGrantWithdrawn("p899.census.no_test_file_calls_create_client_directly — AC1 (met by the brief's parenthetical, see the note above): one shared fixture per test tree (rig-fixtures.mjs, relay-fixtures.mjs) is the ONE call site; every other file in packages/db/tests and packages/runtime/tests reaches clara.create_client, if at all, only through it", async () => {
  const hits = sweepTestsForCreateClient();
  assert.deepEqual(hits, [],
    "a packages/db/tests or packages/runtime/tests file calls clara.create_client( directly, outside its tree's "
    + "designated fixture -- route it through createClientRaw()/createClient() (rig-fixtures.mjs for the db "
    + "batteries, relay-fixtures.mjs for the runtime ones) instead, or add it to CREATE_CLIENT_CENSUS_EXEMPT "
    + "above if the direct call is deliberate (as this file's own refusal cell is)");
});
