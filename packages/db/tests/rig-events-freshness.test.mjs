// Slice-3 rig — the EVENT SPINE, part 2: IDEMPOTENT REPLAY + the FRESHNESS GATE
// (§4.3/§4.4 of docs/plan/slice3-event-spine-contract.md v2.2; suite map in rig-events.test.mjs).
// Every negative asserts an EXACT SQLSTATE; a divergence from the contract stays as
// the contract states.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  ROUTINE_CENTS,
  assertRaises,
  balanced,
  opk,
  rootQuery,
  human,
  ensureReady,
  buildWorld,
  endPool,
  draftEntry,
  addMember,
  createClient,
  upsertAccount,
  freshResolution,
  mintWake,
  insertUser,
  eventsReady,
  maxSeq,
  packVersion,
  wakeDraftWithVersion,
  seedFreshFirm,
  c1FreshnessInterleaving,
} from "./rig-events-helpers.mjs";

let world = null;
let ready = false;

before(async () => {
  await ensureReady();
  ready = await eventsReady();
  if (ready) world = await buildWorld();
});
after(endPool);

function unready(t) {
  if (!ready) {
    t.skip("Slice-3 event spine not present — lane-migration 0005 not yet applied");
    return true;
  }
  return false;
}

const P = () => `evtf_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;

// ===========================================================================
// §3 — IDEMPOTENT REPLAY.
// ===========================================================================
test("§3 replay: op_key replays the original receipt byte-identically even after later events (no CLR12)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const res = await freshResolution(users.bob, clients.A1);
  const cred = await mintWake({ kind: "interactive", firm: firms.A });
  const v0 = await packVersion(users.alice, clients.A1);
  const key = opk("replay");
  const lines = balanced(coa.A1, ROUTINE_CENTS);

  const first = await wakeDraftWithVersion({ secret: cred.secret, client: clients.A1, resolution: res, lines, opKey: key, booksVersion: v0 });
  assert.ok(first.entry_id, "the first wake draft posts");

  // later events land (the books move well past v0)
  await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines, opKey: opk() });
  await addMember(users.alice, { firm: firms.A, user: await insertUser(world.prefix, "rz"), role: "viewer", opKey: opk() });

  // replay with the ORIGINAL (now-stale) token → the reserve short-circuit returns the
  // original receipt BEFORE the freshness gate: NO CLR12, byte-identical.
  const staleReplay = await wakeDraftWithVersion({ secret: cred.secret, client: clients.A1, resolution: res, lines, opKey: key, booksVersion: v0 });
  assert.deepEqual(staleReplay, first, "replay with the stale token returns the original receipt (no CLR12)");

  // replay with a REFRESHED token → still the same op (books_version excluded from the request hash, N3a)
  const vNow = await packVersion(users.alice, clients.A1);
  const freshReplay = await wakeDraftWithVersion({ secret: cred.secret, client: clients.A1, resolution: res, lines, opKey: key, booksVersion: vNow });
  assert.deepEqual(freshReplay, first, "replay with a refreshed token is the SAME op (token not part of op identity)");

  const n = await rootQuery("select count(*)::int as n from clara.journal_entries where id = $1", [first.entry_id]);
  assert.equal(n.rows[0].n, 1, "exactly one entry exists for the op_key");
});

test("§3 replay-after-CLR12: a stale wake draft aborts, then the SAME op_key with a refreshed token succeeds (N3a)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const res = await freshResolution(users.bob, clients.A1);
  const cred = await mintWake({ kind: "interactive", firm: firms.A });
  const lines = balanced(coa.A1, ROUTINE_CENTS);
  const vFresh = await packVersion(users.alice, clients.A1);

  // stale the token: a relevant A1 event lands
  await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines, opKey: opk() });

  const key = opk("clr12-retry");
  await assertRaises(
    CLR.stale,
    () => wakeDraftWithVersion({ secret: cred.secret, client: clients.A1, resolution: res, lines, opKey: key, booksVersion: vFresh }),
    "stale token → CLR12 (the whole txn incl. the op reservation rolls back)",
  );

  // retry the SAME op_key with a refreshed token → succeeds (the aborted reservation rolled back)
  const vNow = await packVersion(users.alice, clients.A1);
  const receipt = await wakeDraftWithVersion({ secret: cred.secret, client: clients.A1, resolution: res, lines, opKey: key, booksVersion: vNow });
  assert.ok(receipt.entry_id, "the refreshed-token retry with the same op_key succeeds");
  const n = await rootQuery("select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'draft_entry' and op_key = $2", [firms.A, key]);
  assert.equal(n.rows[0].n, 1, "exactly one receipt for the op_key (the CLR12 attempt left none)");
});

// ===========================================================================
// §4 — FRESHNESS GATE.
// ===========================================================================
test("§4 assert_books_current: current ok; own-client stales; client-B does not; firm-level does; forged-high; p_below window", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const A = firms.A;
  const call = (client, version, below = null) =>
    rootQuery("select clara.assert_books_current(p_firm => $1, p_client => $2, p_version => $3, p_below => $4)", [A, client, version, below]);

  const M0 = await maxSeq(A);
  await call(clients.A1, M0); // current → no throw

  // client-B (A2) activity does NOT stale A1
  const resA2 = await freshResolution(users.alice, clients.A2);
  await draftEntry(human(users.alice), { client: clients.A2, resolution: resA2, lines: balanced(coa.A2, ROUTINE_CENTS), opKey: opk() });
  const afterA2 = await maxSeq(A);
  await call(clients.A1, M0); // still current — only A2-scoped events landed
  await call(clients.A1, M0, afterA2 + 1); // p_below spans the A2 window, still no A1/firm-level event → ok

  // an A1 event DOES stale A1
  await freshResolution(users.bob, clients.A1); // client.resolved for A1 → relevant
  await assertRaises(CLR.stale, () => call(clients.A1, M0), "an A1-scoped event after M0 stales A1");

  // a firm-level event stales any client
  const M1 = await maxSeq(A);
  await addMember(users.alice, { firm: A, user: await insertUser(world.prefix, "fl"), role: "viewer", opKey: opk() });
  await assertRaises(CLR.stale, () => call(clients.A2, M1), "a firm-level event after M1 stales A2");

  // a token above the firm max is never current
  const forged = (await maxSeq(A)) + 1000;
  await assertRaises(CLR.stale, () => call(clients.A1, forged), "forged-high token → CLR12");
});

test("§4 wake gate: fresh token posts; own write stales; client-B does not; firm-level does; forged-high; null → CLR10", async (t) => {
  if (unready(t)) return;
  const prefix = P();
  const { owner, firm, client, coa } = await seedFreshFirm(prefix, "fresh");
  const clientB = await createClient(owner, { name: `${prefix}_fresh_c2`, opKey: opk() });
  await upsertAccount(owner, { client: clientB, code: "1000", name: "Cash", type: "asset", opKey: opk() });
  await upsertAccount(owner, { client: clientB, code: "4000", name: "Sales", type: "income", opKey: opk() });
  const resA = await freshResolution(owner, client);
  const resB = await freshResolution(owner, clientB);
  const cred = await mintWake({ kind: "interactive", firm });
  const lines = balanced(coa, ROUTINE_CENTS);
  const linesB = balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS);

  // null token → CLR10 (the required-but-defaulted param pattern)
  await assertRaises(
    CLR.badRequest,
    () => wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: null }),
    "null books_version → CLR10",
  );

  // fresh token → posts
  let v = await packVersion(owner, client);
  const ok1 = await wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: v });
  assert.ok(ok1.entry_id, "a fresh token posts");

  // Clara's OWN write staled her pack — the same token now → CLR12
  await assertRaises(
    CLR.stale,
    () => wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: v }),
    "Clara's own write stales her own pack (token v now stale)",
  );

  // a client-B event does NOT stale client A
  v = await packVersion(owner, client);
  await draftEntry(human(owner), { client: clientB, resolution: resB, lines: linesB, opKey: opk() });
  const ok2 = await wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: v });
  assert.ok(ok2.entry_id, "a client-B event does not stale client A's token");

  // a firm-level event DOES stale client A
  v = await packVersion(owner, client);
  await addMember(owner, { firm, user: await insertUser(prefix, "m"), role: "viewer", opKey: opk() });
  await assertRaises(
    CLR.stale,
    () => wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: v }),
    "a firm-level event stales every client's token",
  );

  // forged-high token → CLR12
  v = await packVersion(owner, client);
  await assertRaises(
    CLR.stale,
    () => wakeDraftWithVersion({ secret: cred.secret, client, resolution: resA, lines, opKey: opk(), booksVersion: v + 1000 }),
    "forged-high token → CLR12",
  );
});

test("§4 C1 interleaving: T2 commits a relevant event between T1's fast-fail and allocation → T1 aborts CLR12, no gap", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "c1");
  const res = await freshResolution(owner, client);
  const cred = await mintWake({ kind: "interactive", firm });
  const token = await packVersion(owner, client); // fresh (T2 not yet run)

  const out = await c1FreshnessInterleaving({ firm, client, humanSub: owner, wakeSecret: cred.secret, resolution: res, coa, amount: ROUTINE_CENTS, token });
  assert.equal(out.provedBlocked, true, "T1 was proven WAITING at the allocator (past the fast gate) before T2 committed — so ONLY the commit-time recheck, not the fast gate, can catch the staleness");
  assert.ok(out.t1 && out.t1.ok === false, `T1 aborted (got ${JSON.stringify(out.t1)})`);
  assert.equal(out.t1.code, CLR.stale, "T1's commit-time recheck aborts with CLR12");
  assert.equal(out.gapFree, true, "the aborted T1 allocation left no seq gap");
});
