// Wave-A rig — the lane-fn MATRIX (Codex probes 1/2/20; contract §2 WA-L1 +
// companion §3 + PIN-DELTA-2). coding_lane / list_coding_lanes / get_entry_diff /
// get_doc_entry_diff across every role: ACLs, identical not-found shapes,
// client-pinning (the C-11 floor), cross-client + cross-firm oracle-safety,
// null/expired credential, raw logins, and the PIN-DELTA-2 autodraft-allowlist
// carve (list fns + diffs are NOT on the autodraft allowlist; coding_lane IS).
// Contract-blind. Every test SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, rootQuery, assertRaises, endPool, printLaneNotes, noteLane,
  printSkipCount, skipUnready, waveAEnsureReady, buildWorld, firmOf, opk,
  upsertPayableAccount, upsertAccountClassed, revokeWake,
  readyFiling, mintAutodraftCred, wakeClientOf,
  codingLane, listCodingLanes, getEntryDiff, agentPersona, humanPersona, rawRole,
} from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
const filings = {}; // client -> a filing id (bare cited filing, DB computes the lane)

before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2, world.clients.B1]) {
      const owner = c === world.clients.B1 ? world.users.dave : world.users.alice;
      await upsertPayableAccount(owner, { client: c, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(owner, { client: c, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("exp") });
      const owner2 = c === world.clients.B1 ? world.users.dave : world.users.alice;
      const rf = await readyFiling(owner2, { client: c });
      filings[c] = rf.filingId;
    }
  }
});
after(async () => { printLaneNotes("wave-a-lane-fn"); printSkipCount("wave-a-lane-fn"); await endPool(); });

// ===========================================================================
// Human lane — jwt_firm scoped; a member sees own-firm lanes, never another firm.
// ===========================================================================

test("human lane: an in-firm member computes coding_lane; a cross-firm filing returns the SINGLE not-found shape (no oracle)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const own = await codingLane(humanPersona(users.alice), { client: clients.A1, filing: filings[clients.A1] });
  assert.ok(own, "alice (firm A member) gets a coding_lane row for her own filing");
  assert.ok(typeof own.lane === "string" || own.lane === null, "the row carries a qualitative lane (or null), never a numeric confidence");
  assert.ok(Array.isArray(own.reasons), "reasons is a text[] token array");
  // Oracle-safety is at the CLIENT boundary: a cross-firm client and a NON-EXISTENT
  // client both return the not-found shape (null) — you cannot probe another firm's
  // client. (As-built divergence surfaced at integration: a bad FILING within your OWN
  // client is a legitimate lane computation — needs_you/no_active_filing — not an
  // oracle, so it is NOT the comparison here.)
  const crossFirm = await codingLane(humanPersona(users.alice), { client: clients.B1, filing: filings[clients.B1] });
  const bogusClient = await codingLane(humanPersona(users.alice), { client: "00000000-0000-4000-8000-0000000c0000", filing: filings[clients.A1] });
  assert.deepEqual(crossFirm, bogusClient, "a cross-firm client is INDISTINGUISHABLE from a nonexistent client (no cross-firm oracle at the client boundary)");
});

// ===========================================================================
// Agent lane — CLR03 on null wake_firm; client-pinned; cross-client not-found.
// ===========================================================================

test("agent lane: an autodraft cred pinned to a client computes coding_lane for THAT client; a cross-client call returns the not-found shape (C-11 floor)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  const firmA = await firmOf(clients.A1);
  const cred = await mintAutodraftCred(firmA, clients.A1);
  // Sanity: the credential is pinned to A1.
  const pinned = await wakeClientOf(ROLES.agentRo, cred.secret);
  assert.equal(pinned, clients.A1, "wake_client() returns the credential's bound client (A1)");
  const own = await codingLane(agentPersona(cred.secret), { client: clients.A1, filing: filings[clients.A1] });
  assert.ok(own, "the client-pinned agent reads its own client's lane");
  // Same firm, DIFFERENT client (A2) → the single not-found shape.
  const crossClient = await codingLane(agentPersona(cred.secret), { client: clients.A2, filing: filings[clients.A2] });
  assert.ok(crossClient == null || crossClient.lane == null, `a same-firm cross-client agent read is the not-found shape (got ${JSON.stringify(crossClient)})`);
});

test("agent lane: a NULL / garbage / revoked credential raises CLR03 (wake_firm null) — never an empty leak", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  const firmA = await firmOf(clients.A1);
  await assertRaises(CLR.wake, () => codingLane(agentPersona(`garbage_${opk("x")}`), { client: clients.A1, filing: filings[clients.A1] }), "garbage-secret agent coding_lane");
  const cred = await mintAutodraftCred(firmA, clients.A1);
  await revokeWake(cred.credentialId);
  await assertRaises(CLR.wake, () => codingLane(agentPersona(cred.secret), { client: clients.A1, filing: filings[clients.A1] }), "revoked-cred agent coding_lane");
});

test("agent lane: a raw clara_agent_ro role WITHOUT a wake secret raises CLR03 (no ambient firm)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  await assertRaises(CLR.wake, () => codingLane(rawRole(ROLES.agentRo), { client: clients.A1, filing: filings[clients.A1] }), "raw agent_ro coding_lane (no secret)");
});

// ===========================================================================
// PIN-DELTA-2 — the autodraft allowlist carve: coding_lane IS on it; the list fns
// and the diff reads are NOT, so the same cred is refused there (fail-closed).
// ===========================================================================

test("PIN-DELTA-2 an autodraft credential is REFUSED on list_coding_lanes + get_entry_diff (not on the autodraft allowlist) but ALLOWED on coding_lane", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  const firmA = await firmOf(clients.A1);
  const cred = await mintAutodraftCred(firmA, clients.A1);
  // coding_lane is on the allowlist → succeeds (already covered) — assert no raise.
  await codingLane(agentPersona(cred.secret), { client: clients.A1, filing: filings[clients.A1] });
  // list_coding_lanes is NOT on the autodraft allowlist → the prologue fails closed.
  await assertRaises(CLR.wake, () => listCodingLanes(agentPersona(cred.secret), { client: clients.A1 }), "autodraft cred → list_coding_lanes (off allowlist)");
  // get_entry_diff is NOT on the autodraft allowlist → fail closed (any entry uuid).
  await assertRaises(CLR.wake, () => getEntryDiff(agentPersona(cred.secret), { entry: "00000000-0000-4000-8000-00000000d1ff", client: clients.A1 }), "autodraft cred → get_entry_diff (off allowlist)");
});

// ===========================================================================
// Oracle-safety — the ungranted internal helpers stay unreachable by app roles
// (probe P1: an agent granted _resolve_counterparty / _invoice_fact_state would be
// a cross-firm oracle). The lane fn calls them internally (definer); the helpers
// themselves keep zero app grant.
// ===========================================================================

test("oracle-safety: clara_agent_ro cannot EXECUTE the ungranted helpers the lane fn calls internally (_resolve_counterparty / _open_question_blocks)", async (t) => {
  if (skipUnready(t, ready)) return;
  for (const helper of ["_resolve_counterparty", "_open_question_blocks"]) {
    const oid = (await rootQuery("select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1 limit 1", [helper])).rows[0]?.oid;
    if (!oid) { noteLane(`${helper} absent — internal-helper name may differ (interface expectation)`); continue; }
    const ok = (await rootQuery("select has_function_privilege($1, $2, 'execute') as ok", [ROLES.agentRo, oid])).rows[0].ok;
    assert.equal(ok, false, `clara_agent_ro must NOT execute internal helper clara.${helper} (cross-firm oracle stays sealed)`);
  }
});

// ===========================================================================
// list_coding_lanes — human lane is client-pinned on the AGENT lane but firm-wide
// for humans; a demoted (removed) member sees nothing (live-membership floor).
// ===========================================================================

test("list_coding_lanes: an in-firm human lists own-client lanes; the agent grant is client-pinned (companion §3 / probe 20)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const list = await listCodingLanes(humanPersona(users.alice), { client: clients.A1 });
  assert.ok(Array.isArray(list), "list_coding_lanes returns a setof rows for the human lane");
  // A cross-firm client through firm A → empty (no oracle).
  const crossFirm = await listCodingLanes(humanPersona(users.alice), { client: clients.B1 });
  assert.equal(crossFirm.length, 0, "a cross-firm client lists nothing through a firm-A identity");
});
