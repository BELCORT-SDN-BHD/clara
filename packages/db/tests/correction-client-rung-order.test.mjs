// #914 -- `clara.approve_wrong_client_correction` took a `clara.clients` ROW before the CLIENT
// ADVISORY RUNG (203005004), the only door in the estate that did. Every sibling takes the rung
// first (`clara.settle_client_onboarding_facts` since #649 round 2, `clara.set_client_fy_end`
// since 0042 SS5.12), so the one door that inverted was the shape that deadlocks under concurrent
// corrections. Migration 0238 moves the client row lock DOWN below a rung taken ONCE, and the
// rung stays where 0037 SECTION H.3 pinned it -- AFTER the captured entries' journal_entries row
// locks (the approve core's order, 0037 SECTION K's one named exception).
//
// SEAMS (written down before the first test, work-order rule 4). The Agent Brief names three,
// and this file tests at those three only:
//
//   1. `clara.approve_wrong_client_correction(uuid,text,text,text)` -- the door itself, called
//      as a human bookkeeper through `clara_authenticated`, under a forced two-session schedule.
//      The oracle is the DEADLOCK ERROR (40P01/40001), never a source read.
//   2. THE TWO ADVISORY RUNGS -- their identifiers and the client each covers, observed as lock
//      ACQUISITION under that same schedule (an adversary in the rung-first order every sibling
//      uses), never as a claim about text.
//   3. THE SOURCE CLIENT ROW LOCK -- still the serializer against wiki publication on the source
//      client, and still held when the source filing is retired. Measured by racing the door
//      against `clara.record_wiki_source_ingest` (the deterministic publication path,
//      0017:2228).
//
// Plus the catalogue-derived census the Agent Brief's AC2 asks for, which is structural by
// nature (work-order rule 4's "where this repo's own documented standard asks for a structural
// cell, that standard wins"): it is a claim about EVERY door in the estate, and no dynamic
// schedule can make that claim.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ROUTINE_CENTS,
  opk,
  rootQuery,
  getPool,
  endPool,
  s6EnsureReady,
  buildWorld,
  printLaneNotes,
  noteLane,
  firmOf,
  seedCitedDocument,
  draftEntryV3,
  approveEntry,
  freshResolution,
  previewCorrection,
  proposeCorrection,
  balanced,
  ev,
  FIELD,
  idOf,
} from "./s6-fixtures.mjs";
import { waitBlockedBy } from "./rig-docs-race.mjs";

/** The client advisory rung 0037 SECTION K names; the door's second rung. */
const CLIENT_RUNG = 203005004;

const MIGRATION = "0238_correction_client_rung_order.sql";
const STEM = "correction_client_rung_order$";

const DOOR_SQL =
  "select clara.approve_wrong_client_correction(p_correction => $1, p_plan_hash => $2,"
  + " p_attestation => $3, p_op_key => $4) as r";

let ready = false;
let world = null;

before(async () => {
  ready = await s6EnsureReady();
  if (!ready) return;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_CORRECTION_CLIENT_RUNG_ORDER !== "1") {
      throw new Error(
        `#914 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
        + "and CLARA_ALLOW_MISSING_CORRECTION_CLIENT_RUNG_ORDER is unset -- this is a FOCUSED run "
        + "and must fail loudly, not skip. Preload "
        + "./tests/correction-client-rung-order-preintegration-gate.mjs for an estate sweep "
        + "against a pre-#914 chain.");
    }
    ready = false;
    return;
  }
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("correction-client-rung-order");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: s6EnsureReady() failed, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

/**
 * ONE proposed wrong-client correction A1 -> A2 over a freshly cited document carrying one
 * APPROVED entry (so the correction's single item takes the `reverse` branch -- the branch that
 * held the rung before 0238). Built through the audited doors, never by raw insert.
 *
 * The plan binds `books_version = max(domain_events.seq)` for the firm, and ANY later firm event
 * makes the plan stale (CLR19), so each cell builds its own proposal immediately before its own
 * race and nothing else writes to firm A in between.
 */
async function proposeOne() {
  const { users, clients, coa } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const draft = await draftEntryV3(users.alice, {
    client: clients.A1,
    resolution: await freshResolution(users.alice, clients.A1),
    document: cited.documentId,
    sha256: cited.sha256,
    lines: balanced(coa.A1, ROUTINE_CENTS),
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    opKey: opk("c914"),
  });
  await approveEntry(users.alice, {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("c914ap"),
  });
  await previewCorrection(users.alice, {
    document: cited.documentId, fromClient: clients.A1, toClient: clients.A2,
  });
  await freshResolution(users.alice, clients.A2, {
    subjectKind: "document", subjectId: cited.documentId,
  });
  const proposal = await proposeCorrection(users.alice, {
    document: cited.documentId, fromClient: clients.A1, toClient: clients.A2,
    reason: "#914 rung-order rig",
  });
  const correction = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash
    ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correction]))
      .rows[0]?.plan_hash;
  return { correction, planHash, document: cited.documentId, entry: draft.entry_id };
}

async function release(conns) {
  for (const c of conns) {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset session authorization").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/**
 * THE SCHEDULE THAT DEADLOCKED, driven in three steps so it is forced, not hoped for:
 *
 *   1. ADVERSARY takes the CLIENT RUNG on the source client and holds it -- the first half of
 *      the rung-first order every sibling door uses.
 *   2. DOOR fires. Under the OLD order it first takes the `clara.clients` ROW and only then
 *      wants the rung; under the NEW order it wants the rung before any client row. Either way
 *      it BLOCKS on the adversary's rung, which we PROVE with pg_blocking_pids (a schedule that
 *      never blocked proves nothing).
 *   3. ADVERSARY completes its order by taking the same client ROW.
 *
 * Under the OLD order step 3 closes a cycle (adversary waits for the door's row lock, door waits
 * for the adversary's rung) and PostgreSQL's deadlock detector raises 40P01 on one side. Under
 * the NEW order the door holds no client row when it blocks, so step 3 is uncontended, the
 * adversary commits, and the door runs to its receipt.
 */
async function rungFirstAdversaryVsDoor({ client, jwtSub, correction, planHash }) {
  const pool = getPool();
  const cAdv = await pool.connect();
  const cDoor = await pool.connect();
  const out = { adversary: null, door: null, doorBlocked: false };
  try {
    const advPid = (await cAdv.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cAdv.query("begin");
    await cAdv.query("set local statement_timeout = '30s'");
    await cAdv.query("select pg_advisory_xact_lock($1, hashtext($2::text))", [CLIENT_RUNG, client]);

    const doorPid = (await cDoor.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cDoor.query(`set role ${ROLES.authenticated}`);
    await cDoor.query("begin");
    await cDoor.query("set local statement_timeout = '30s'");
    await cDoor.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: jwtSub, role: "authenticated" })]);
    const pDoor = Promise.resolve()
      .then(() => cDoor.query(DOOR_SQL, [correction, planHash, "#914 rig attest", opk("c914rc")]))
      .then((r) => { out.door = { ok: true, receipt: r.rows[0].r }; })
      .catch((e) => { out.door = { ok: false, code: e.code, message: e.message }; });

    out.doorBlocked = await waitBlockedBy(doorPid, advPid);

    await Promise.resolve()
      .then(() => cAdv.query("select 1 from clara.clients where id=$1 for update", [client]))
      .then(() => { out.adversary = { ok: true }; })
      .catch((e) => { out.adversary = { ok: false, code: e.code, message: e.message }; });
    await cAdv.query("commit").catch(() => cAdv.query("rollback").catch(() => {}));
    await pDoor;
    await cDoor.query("commit").catch(() => cDoor.query("rollback").catch(() => {}));
  } finally {
    await release([cAdv, cDoor]);
  }
  return out;
}

// ===========================================================================
// AC1 -- the deadlock error is the oracle.
// ===========================================================================

test("cr.1 the door no longer inverts: an adversary holding the client rung and then taking the client row does NOT deadlock with a concurrent correction", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const plan = await proposeOne();
  const out = await rungFirstAdversaryVsDoor({
    client: clients.A1, jwtSub: users.bob, correction: plan.correction, planHash: plan.planHash,
  });

  assert.ok(out.doorBlocked,
    "the schedule must actually interleave: the door has to BLOCK on the adversary's client rung "
    + "(pg_blocking_pids), otherwise nothing about lock ORDER has been measured");
  for (const [side, r] of [["adversary", out.adversary], ["door", out.door]]) {
    assert.ok(r, `${side} produced no outcome at all`);
    assert.notEqual(r.code, "40P01",
      `${side} lost to a DEADLOCK (40P01) -- the door still takes a clara.clients row before the `
      + `client advisory rung ${CLIENT_RUNG}, inverting against every sibling door: ${r.message}`);
    assert.notEqual(r.code, "40001", `${side} lost to a serialization failure: ${r.message}`);
  }
  assert.equal(out.adversary.ok, true, "the rung-first adversary completed its own order");
  assert.equal(out.door.ok, true, `the correction completed: ${out.door.message ?? ""}`);
  assert.equal(out.door.receipt.status, "completed", "the door returned its ordinary receipt");
  noteLane("cr.1 door blocked on the rung, then completed; adversary uncontended");
});
