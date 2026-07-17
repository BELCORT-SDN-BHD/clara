// Slice-2 rig — the role / RLS / grant / isolation WALL.
// Families (v1 §6 as amended by v2 §I): T1 cross-firm read isolation, T2 cross-firm
// write, T3 SELECT-wrapped-writer-fails, T6 wake allowlist, T10 posted immutability
// + agent EXECUTE-enumeration, T13 live revocation, T14 last-owner (+concurrent),
// T16 GUC spoofing (v2 §A model), T16b GUC-cleared, T17 grant matrix, T17b canary,
// T18 definer hygiene, T19 poison-role, T23 admission + create_client RBAC.
//
// Negative paths are the deliverable: every negative assertion checks an EXACT
// SQLSTATE. Where the schema contradicts the contract, the assertion stays as the
// contract specifies (a suspected lane-M defect), never weakened to green.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  ROLES,
  AGENT_USER_ID,
  ROUTINE_CENTS,
  assertRaises,
  balanced,
  namedCall,
  opk,
  getPool,
  withActor,
  asRole,
  humanQuery,
  roleQuery,
  rootQuery,
  human,
  ensureReady,
  buildWorld,
  endPool,
  draftEntry,
  approveEntry,
  recordNotification,
  createClient,
  createFirm,
  addMember,
  setMemberRole,
  removeMember,
  ingestDocument,
  membershipId,
  insertUser,
  seedAdmission,
  freshResolution,
  mintWake,
  revokeWake,
} from "./rig-fixtures.mjs";
import {
  agentReachableOutsideClara,
  grantMatrixFailures,
  definerHygieneFailures,
  governedRlsFailures,
} from "./rig-meta.mjs";
import { raceProactiveNotification } from "./rig-txn.mjs";

let world = null;
let ready = false;

before(async () => {
  ready = await ensureReady();
  if (ready) world = await buildWorld();
});
after(endPool);

/** true → the test body must return early (schema not yet migrated). */
function unready(t) {
  if (!ready) {
    t.skip("Slice-2 governed schema not present — lane-M migrations not yet applied");
    return true;
  }
  return false;
}

async function draftRoutine(sub, client, coa, amount = ROUTINE_CENTS, extra = {}) {
  const resolution = await freshResolution(sub, client);
  return draftEntry(human(sub), { client, resolution, lines: balanced(coa, amount), opKey: opk(), ...extra });
}

async function approvedRoutine(sub, client, coa, amount = ROUTINE_CENTS) {
  const r = await draftRoutine(sub, client, coa, amount);
  await approveEntry(sub, { entry: r.entry_id, expectedRevision: r.revision_token, opKey: opk() });
  return r.entry_id;
}

async function visibleCount(sub, table, id) {
  const r = await humanQuery(sub, `select count(*)::int as n from clara.${table} where id = $1`, [id]);
  return r.rows[0].n;
}

// ===========================================================================
// T1 — cross-firm read isolation
// ===========================================================================
test("T1 cross-firm read isolation: each firm sees only its own rows", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const entryA = await approvedRoutine(users.bob, clients.A1, coa.A1);
  const entryB = await approvedRoutine(users.dave, clients.B1, coa.B1);

  assert.equal(await visibleCount(users.alice, "journal_entries", entryA), 1, "alice sees A entry");
  assert.equal(await visibleCount(users.alice, "journal_entries", entryB), 0, "alice must NOT see B entry");
  assert.equal(await visibleCount(users.dave, "journal_entries", entryB), 1, "dave sees B entry");
  assert.equal(await visibleCount(users.dave, "journal_entries", entryA), 0, "dave must NOT see A entry");
  assert.equal(await visibleCount(users.alice, "firms", firms.A), 1, "alice sees firm A");
  assert.equal(await visibleCount(users.alice, "firms", firms.B), 0, "alice must NOT see firm B");
  assert.equal(await visibleCount(users.alice, "clients", clients.B1), 0, "alice must NOT see B's client");

  const listA = await humanQuery(users.alice, "select clara.list_journal_entries(p_client => $1) as e", [clients.A1]);
  assert.ok(listA.rows.length >= 1, "alice list_journal_entries returns A rows");
  const getByDave = await humanQuery(users.dave, "select clara.get_journal_entry(p_entry => $1) as e", [entryA]);
  assert.ok(getByDave.rows[0]?.e == null, "dave get_journal_entry on A's entry returns null (RLS-scoped)");
});

// ===========================================================================
// T2 — cross-firm write (guard-first → CLR11, no existence oracle)
// ===========================================================================
test("T2 cross-firm write attempts all raise CLR11 (unknown id is identical)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const entryB = await approvedRoutine(users.dave, clients.B1, coa.B1);
  const reverseSql = namedCall("reverse_entry", [{ name: "p_entry" }, { name: "p_reason" }, { name: "p_op_key" }]);

  await assertRaises(CLR.notFound, () => draftEntry(human(users.alice), { client: clients.B1, resolution: randomUUID(), lines: balanced(coa.A1, ROUTINE_CENTS), opKey: opk() }), "alice draft vs B client");
  await assertRaises(CLR.notFound, () => freshResolution(users.alice, clients.B1), "alice resolution vs B client");
  await assertRaises(CLR.notFound, () => ingestDocument(human(users.alice), { client: clients.B1, sha256: "a".repeat(64), opKey: opk() }), "alice ingest vs B client");
  await assertRaises(CLR.notFound, () => approveEntry(users.alice, { entry: entryB, expectedRevision: randomUUID(), opKey: opk() }), "alice approve B entry");
  await assertRaises(CLR.notFound, () => humanQuery(users.alice, reverseSql, [entryB, "x", opk()]), "alice reverse B entry");
  await assertRaises(CLR.notFound, () => addMember(users.alice, { firm: firms.B, user: users.erin, role: "viewer", opKey: opk() }), "alice add_member to firm B");
  await assertRaises(CLR.notFound, () => draftEntry(human(users.alice), { client: randomUUID(), resolution: randomUUID(), lines: balanced(coa.A1, ROUTINE_CENTS), opKey: opk() }), "alice draft vs nonexistent client");
});

// ===========================================================================
// T3 — a SELECT-wrapped writer FAILS as the read-only agent (grants are the wall)
// ===========================================================================
test("T3 agent_ro cannot execute writers or DML — even with read_only OFF", async (t) => {
  if (unready(t)) return;
  const { clients, coa } = world;
  const draftSpecs = [
    { name: "p_client" }, { name: "p_resolution" }, { name: "p_posting_date", cast: "date" },
    { name: "p_memo" }, { name: "p_lines", cast: "jsonb" }, { name: "p_op_key" },
  ];
  const draftSql = namedCall("draft_entry", draftSpecs);
  const draftVals = [clients.A1, randomUUID(), "2026-01-15", "t3", JSON.stringify(balanced(coa.A1, ROUTINE_CENTS)), opk()];

  await asRole(ROLES.agentRo, async (c) => {
    await assertRaises(PG.insufficientPrivilege, () => c.query(draftSql, draftVals), "agent_ro draft_entry");
    await assertRaises(PG.insufficientPrivilege, () => c.query("select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3)", [randomUUID(), randomUUID(), opk()]), "agent_ro approve_entry");
    await assertRaises(PG.insufficientPrivilege, () => c.query("insert into clara.journal_entries (client_id) values ($1)", [clients.A1]), "agent_ro raw INSERT");
    await c.query("set default_transaction_read_only = off"); // unbuckle the belt — the wall is GRANTS
    await assertRaises(PG.insufficientPrivilege, () => c.query(draftSql, draftVals), "agent_ro draft_entry (read_only off)");
    await assertRaises(PG.insufficientPrivilege, () => c.query("insert into clara.journal_entries (client_id) values ($1)", [clients.A1]), "agent_ro raw INSERT (read_only off)");
  });
});

// ===========================================================================
// T6 — wake allowlist + credential lifecycle (interactive vs single-use proactive)
// ===========================================================================
test("T6 wake lane: allowlist, single-use proactive, agent-never-signs, expiry/revoke/forge", async (t) => {
  if (unready(t)) return;
  const { firms, clients, users, coa } = world;

  // Proactive is single-use: one notification consumes it; a second → CLR03.
  const proactive = await mintWake({ kind: "proactive", firm: firms.A });
  const notifId = await recordNotification({ kind: "wake", role: ROLES.wakeProactive, secret: proactive.secret }, { kind: "rig.proactive", opKey: opk(), wake: true });
  const created = await rootQuery("select created_by from clara.notifications where id = $1", [notifId]);
  assert.equal(created.rows[0].created_by, AGENT_USER_ID, "proactive notification created_by = agent");
  await assertRaises(CLR.wake, () => recordNotification({ kind: "wake", role: ROLES.wakeProactive, secret: proactive.secret }, { kind: "rig.p2", opKey: opk(), wake: true }), "proactive reuse with a FRESH op_key (consumed) → CLR03");

  // CONCURRENCY (HIGH 2): two simultaneous proactive notifications on ONE credential
  // (distinct op keys) must yield EXACTLY ONE notification — the loser raises CLR03
  // and rolls back. Consume-before-effect makes single-use race-safe.
  const race = await mintWake({ kind: "proactive", firm: firms.A });
  const raceOut = await raceProactiveNotification({ secret: race.secret });
  const winners = [raceOut.a, raceOut.b].filter((r) => r && r.ok).length;
  assert.equal(winners, 1, `exactly one concurrent proactive notification wins (got ${JSON.stringify(raceOut)})`);
  assert.ok(raceOut.b && raceOut.b.ok === false && raceOut.b.code === CLR.wake, `the loser raised CLR03 (got ${JSON.stringify(raceOut.b)})`);
  const nWritten = await rootQuery("select count(*)::int as n from clara.notifications where firm_id = $1 and kind in ('race.a','race.b')", [firms.A]);
  assert.equal(nWritten.rows[0].n, 1, "the single-use credential produced exactly one notification");

  // ADR-009 at-least-once: a legitimate RETRY (same op_key) after a lost response must
  // REPLAY the original receipt, even though the proactive credential is now consumed.
  const retryCred = await mintWake({ kind: "proactive", firm: firms.A });
  const retryKey = opk("proactive-retry");
  const first = await recordNotification({ kind: "wake", role: ROLES.wakeProactive, secret: retryCred.secret }, { kind: "rig.retry", opKey: retryKey, wake: true });
  const replay = await recordNotification({ kind: "wake", role: ROLES.wakeProactive, secret: retryCred.secret }, { kind: "rig.retry", opKey: retryKey, wake: true });
  assert.equal(replay, first, "same-op_key retry on a consumed proactive credential replays the original notification");

  // Proactive holds no writer grant and no table SELECT. (wake_draft_entry EXECUTE
  // is asserted absent in T17; here we check the human writer + raw table wall.)
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.wakeProactive, "insert into clara.journal_entries (client_id) values ($1)", [clients.A1]), "wake_proactive raw INSERT");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.wakeProactive, "select id from clara.journal_entries limit 1"), "wake_proactive raw SELECT");

  // Interactive needs a HUMAN resolution (agent proposals never satisfy the gate — v2 §D).
  const resolution = await freshResolution(users.bob, clients.A1);
  const interactive = await mintWake({ kind: "interactive", firm: firms.A });
  const receipt = await draftEntry({ kind: "wake", role: ROLES.wakeInteractive, secret: interactive.secret }, { client: clients.A1, resolution, lines: balanced(coa.A1, ROUTINE_CENTS), opKey: opk(), wake: true });
  assert.ok(receipt.entry_id, "wake_draft_entry (interactive) creates an entry");
  const maker = await rootQuery("select maker_actor, last_human_editor from clara.journal_entries where id = $1", [receipt.entry_id]);
  assert.equal(maker.rows[0].maker_actor, AGENT_USER_ID, "wake maker_actor = agent");
  assert.equal(maker.rows[0].last_human_editor, null, "wake last_human_editor is NULL");

  // Agent can NEVER sign: no wake approve exists; human approve_entry ungranted to wake.
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.wakeInteractive, "select clara.approve_entry(p_entry => $1, p_expected_revision => $2, p_op_key => $3)", [receipt.entry_id, receipt.revision_token, opk()]), "wake_interactive approve_entry");

  // Interactive is multi-use.
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: interactive.secret }, { kind: "rig.i1", opKey: opk(), wake: true });
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: interactive.secret }, { kind: "rig.i2", opKey: opk(), wake: true });

  // Expired / revoked / forged → CLR03 (forge may surface as CLR04).
  const expired = await mintWake({ kind: "interactive", firm: firms.A, ttl: "-1 minute" });
  await assertRaises(CLR.wake, () => recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: expired.secret }, { kind: "rig.exp", opKey: opk(), wake: true }), "expired credential");
  const revoked = await mintWake({ kind: "interactive", firm: firms.A });
  await revokeWake(revoked.credentialId);
  await assertRaises(CLR.wake, () => recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: revoked.secret }, { kind: "rig.rev", opKey: opk(), wake: true }), "revoked credential");
  // A forged secret hashes to no credential row → wake_context returns nothing →
  // the wake entry raises exactly CLR03 (v2 wake entry points; drop the CLR04 alt).
  await assertRaises(CLR.wake, () => recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: `forged_${randomUUID()}` }, { kind: "rig.forge", opKey: opk(), wake: true }), "forged secret");
});

// ===========================================================================
// T10a — posted immutability; T10b — agent EXECUTE-enumeration
// ===========================================================================
test("T10a posted entries are immutable / append-only (raw superuser DML → CLR08)", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const entry = await approvedRoutine(users.bob, clients.A1, coa.A1);
  await assertRaises(CLR.immutable, () => rootQuery("update clara.journal_lines set description = 'x' where entry_id = $1", [entry]), "UPDATE posted line");
  await assertRaises(CLR.immutable, () => rootQuery("delete from clara.journal_lines where entry_id = $1", [entry]), "DELETE posted line");
  await assertRaises(CLR.immutable, () => rootQuery("update clara.journal_entries set memo = 'x' where id = $1", [entry]), "UPDATE posted entry memo");
  await assertRaises(CLR.immutable, () => rootQuery("delete from clara.journal_entries where id = $1", [entry]), "DELETE posted entry");
  await assertRaises(CLR.immutable, () => rootQuery("truncate clara.journal_lines"), "TRUNCATE journal_lines");
  // journal_entries is FK-referenced (journal_lines), so a BARE truncate hits the FK
  // restriction; CASCADE reaches the BEFORE TRUNCATE trigger → CLR08 (append-only).
  await assertRaises(CLR.immutable, () => rootQuery("truncate clara.journal_entries cascade"), "TRUNCATE journal_entries CASCADE");
});

test("T10b agent_ro can EXECUTE nothing outside pg_catalog + clara", async (t) => {
  if (unready(t)) return;
  const leaked = await agentReachableOutsideClara();
  assert.deepEqual(leaked, [], `agent_ro reaches functions outside pg_catalog/clara: ${leaked.join(", ")}`);
});

// ===========================================================================
// T13 — live revocation
// ===========================================================================
test("T13 live revocation: remove_member cuts access immediately; re-add restores", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  await draftRoutine(users.bob, clients.A1, coa.A1);
  const before = await humanQuery(users.bob, "select count(*)::int as n from clara.journal_entries");
  assert.ok(before.rows[0].n >= 1, "bob sees firm A rows while a member");

  const bobMembership = await membershipId(firms.A, users.bob);
  await removeMember(users.alice, { membership: bobMembership, opKey: opk() });

  const afterRemoval = await humanQuery(users.bob, "select count(*)::int as n from clara.journal_entries");
  assert.equal(afterRemoval.rows[0].n, 0, "removed bob sees 0 rows (no active membership → NULL firm)");
  await assertRaises(CLR.authz, () => draftRoutine(users.bob, clients.A1, coa.A1), "removed bob draft_entry");

  await addMember(users.alice, { firm: firms.A, user: users.bob, role: "bookkeeper", opKey: opk() });
  const restored = await humanQuery(users.bob, "select count(*)::int as n from clara.journal_entries");
  assert.ok(restored.rows[0].n >= 1, "re-added bob sees firm A rows again");
});

// ===========================================================================
// T14 — last-owner protection (sequential + concurrent write-skew)
// ===========================================================================
test("T14 last-owner: cannot remove/demote the sole owner (CLR09)", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const daveMembership = await membershipId(firms.B, users.dave);
  await assertRaises(CLR.lastOwner, () => removeMember(users.dave, { membership: daveMembership, opKey: opk() }), "remove sole owner");
  await assertRaises(CLR.lastOwner, () => setMemberRole(users.dave, { membership: daveMembership, role: "bookkeeper", opKey: opk() }), "demote sole owner");
});

test("T14 concurrent demote of two owners leaves at least one owner", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const bobMembership = await membershipId(firms.A, users.bob);
  await setMemberRole(users.alice, { membership: bobMembership, role: "owner", opKey: opk() });
  const aliceMembership = await membershipId(firms.A, users.alice);
  const demoteSql = namedCall("set_member_role", [{ name: "p_membership" }, { name: "p_role" }, { name: "p_op_key" }]);

  const c1 = await getPool().connect();
  const c2 = await getPool().connect();
  const results = [];
  try {
    await c1.query(`set role ${ROLES.authenticated}`);
    await c1.query("begin");
    await c1.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users.alice })]);
    await c1.query(demoteSql, [bobMembership, "bookkeeper", opk()]); // holds the per-firm lock

    await c2.query(`set role ${ROLES.authenticated}`);
    await c2.query("begin");
    await c2.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: users.bob })]);
    const c2call = c2
      .query(demoteSql, [aliceMembership, "bookkeeper", opk()])
      .then(() => results.push({ who: "c2", ok: true }))
      .catch((e) => results.push({ who: "c2", ok: false, code: e.code }));

    await c1.query("commit"); // releases the lock; c2 re-evaluates against 1 owner
    await c2call;
    await c2.query("commit").catch(() => c2.query("rollback").catch(() => {}));
  } finally {
    for (const c of [c1, c2]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {}); // RESET ALL does NOT reset the role
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }
  // Safety invariant: the write-skew backstop (per-firm FOR UPDATE + guard_last_owner)
  // must prevent BOTH demotions from committing. The loser fails with CLR09 (still the
  // last owner) or CLR04 (its actor was itself just demoted out of admin) — both safe.
  const owners = await rootQuery("select count(*)::int as n from clara.firm_memberships where firm_id = $1 and role = 'owner' and status = 'active'", [firms.A]);
  assert.ok(owners.rows[0].n >= 1, `at least one active owner survives (results: ${JSON.stringify(results)})`);
  const winners = results.filter((r) => r.ok).length;
  assert.ok(winners <= 1, `at most one concurrent demote may win (results: ${JSON.stringify(results)})`);
  // The loser fails with a KNOWN safe SQLSTATE — CLR09 (still the last owner) or CLR04
  // (its own actor was just demoted out of admin under the lock). Never a raw error.
  for (const r of results.filter((x) => !x.ok)) {
    assert.ok([CLR.lastOwner, CLR.authz].includes(r.code), `loser raised CLR09/CLR04, not ${r.code}`);
  }
});

// ===========================================================================
// T16 — GUC handling (v2 §A: reads scope to the caller's firm; NO in-definer lane
// detection — a forged jwt naming a real member's sub is a CHANNEL concern, not
// DB-enforceable, so it is NOT tested here; the enforceable properties are).
// ===========================================================================
test("T16 read-scoping: agent_ro scopes ONLY by its credential; a forged jwt is inert", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  // As-built (STRICTER than v2 §A): lane-M's split-lane RLS scopes an agent_ro read
  // purely by clara.wake_firm() (the credential). The jwt branch (clara.jwt_firm) is
  // a SEPARATE policy bound to clara_authenticated, so an agent_ro session NEVER
  // consults request.jwt.claims — a forged jwt on an agent session is wholly inert.
  // journal_entries is the contract-guaranteed agent_ro read surface (books tables).
  const entryA = await approvedRoutine(users.bob, clients.A1, coa.A1);
  const entryB = await approvedRoutine(users.dave, clients.B1, coa.B1);

  // (a) No credential + a forged (non-member) jwt → sees nothing.
  await withActor({ role: ROLES.agentRo, jwtSub: randomUUID() }, async (c) => {
    const r = await c.query("select count(*)::int as n from clara.journal_entries where id = $1", [entryA]);
    assert.equal(r.rows[0].n, 0, "no credential → agent sees nothing (jwt never consulted)");
  });

  // (b) Valid firm-A credential + a forged firm-B jwt → sees A only (credential is the
  // sole source; the forged jwt cannot add or redirect firm B).
  const credA = await mintWake({ kind: "interactive", firm: firms.A });
  await withActor({ role: ROLES.agentRo, wakeSecret: credA.secret, jwtSub: users.dave, transaction: true }, async (c) => {
    const a = await c.query("select count(*)::int as n from clara.journal_entries where id = $1", [entryA]);
    assert.equal(a.rows[0].n, 1, "credential firm (A) is the read scope");
    const b = await c.query("select count(*)::int as n from clara.journal_entries where id = $1", [entryB]);
    assert.equal(b.rows[0].n, 0, "forged B jwt does not expose B's entry");
  });

  // (c) Invalid (garbage) credential + a valid firm-A jwt → still sees NOTHING: the
  // agent lane does not fall through to the jwt (stricter than v2 §A's fallthrough).
  await withActor({ role: ROLES.agentRo, wakeSecret: `garbage_${randomUUID()}`, jwtSub: users.alice, transaction: true }, async (c) => {
    const r = await c.query("select count(*)::int as n from clara.journal_entries where id = $1", [entryA]);
    assert.equal(r.rows[0].n, 0, "invalid credential → agent sees nothing (no jwt fallthrough for agent_ro)");
  });
});

// HONESTY (MEDIUM 14 downgrade): this only proves that a `set_config(..., true)`
// (txn-local) secret is gone after COMMIT — the pool-contamination guard the runtime
// relies on. It does NOT prove the DB REJECTS a session-level `SET clara.wake_secret`
// that survives commit: wake_context() trusts whatever GUC value is present. Setting
// the secret txn-local is a RUNTIME POOL CONTRACT (the runtime always uses
// set_config(..., true) and resets on checkout — a Slice-4 deliverable), not a
// DB-enforced property. See design v2 §C.
test("T16b clara.wake_secret is txn-local and cleared after the transaction", async (t) => {
  if (unready(t)) return;
  const c = await getPool().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('clara.wake_secret', $1, true)", ["secret-xyz"]);
    const during = await c.query("select current_setting('clara.wake_secret', true) as s");
    assert.equal(during.rows[0].s, "secret-xyz", "secret visible inside its own txn");
    await c.query("commit");
    const post = await c.query("select current_setting('clara.wake_secret', true) as s");
    assert.ok(post.rows[0].s === null || post.rows[0].s === "", "secret gone after COMMIT (no pool contamination)");
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {}); // RESET ALL does NOT reset the role
    await c.query("reset all").catch(() => {});
    c.release();
  }
});

// ===========================================================================
// T16 CRITICAL-1 — a human writer must IGNORE a foreign wake credential present in
// the same session: the write lands in the JWT (human) firm, never the credential's.
// ===========================================================================
test("T16 CRITICAL-1: a human create_client ignores a foreign wake_secret (lands in the jwt firm)", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const credB = await mintWake({ kind: "interactive", firm: firms.B }); // a VALID firm-B credential
  let clientId;
  await withActor({ role: ROLES.authenticated, jwtSub: users.alice, wakeSecret: credB.secret, transaction: true }, async (c) => {
    const r = await c.query("select clara.create_client(p_name => $1, p_op_key => $2) as receipt", [`${world.prefix}_crit1`, opk()]);
    clientId = r.rows[0].receipt.client_id;
  });
  const firmOf = await rootQuery("select firm_id from clara.clients where id = $1", [clientId]);
  assert.equal(firmOf.rows[0].firm_id, firms.A, "client lands in alice's jwt firm A, NOT the wake credential's firm B");
});

// ===========================================================================
// T13 HIGH-5 — a demoted on_behalf_of member's credential goes inert on next use
// (live revalidation), even if it escaped the demotion's revocation scan.
// ===========================================================================
test("T13 HIGH-5: demoting an on_behalf_of member makes its credential inert (live revalidation)", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const gina = await insertUser(world.prefix, "gina");
  await addMember(users.alice, { firm: firms.A, user: gina, role: "bookkeeper", opKey: opk() });
  const cred = await mintWake({ kind: "interactive", firm: firms.A, onBehalfOf: gina });
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: cred.secret }, { kind: "rig.obo", opKey: opk(), wake: true });

  // Raw-demote gina to viewer WITHOUT the writer's credential revocation — simulating
  // the HIGH-5 race where the credential was minted just after the revocation scan.
  const ginaM = await membershipId(firms.A, gina);
  await rootQuery("update clara.firm_memberships set role = 'viewer' where id = $1", [ginaM]);
  await assertRaises(CLR.wake, () => recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: cred.secret }, { kind: "rig.obo2", opKey: opk(), wake: true }), "credential inert once on_behalf_of drops below bookkeeper");
});

// ===========================================================================
// T13 HIGH-4 — an old A membership cannot revoke a firm-B credential.
// ===========================================================================
test("T13 HIGH-4: an A admin acting on a removed A membership cannot touch a firm-B credential", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  const hank = await insertUser(world.prefix, "hank");
  await addMember(users.alice, { firm: firms.A, user: hank, role: "bookkeeper", opKey: opk() });
  const hankAm = await membershipId(firms.A, hank);
  await removeMember(users.alice, { membership: hankAm, opKey: opk() }); // revokes hank's firm-A creds

  await addMember(users.dave, { firm: firms.B, user: hank, role: "bookkeeper", opKey: opk() });
  const credB = await mintWake({ kind: "interactive", firm: firms.B, onBehalfOf: hank });
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: credB.secret }, { kind: "rig.b1", opKey: opk(), wake: true });

  // An A admin tries to remove hank's now-REMOVED historical A membership → CLR11
  // (not active), so it never reaches the credential-revocation step.
  const hankRemovedAm = await membershipId(firms.A, hank, "removed");
  await assertRaises(CLR.notFound, () => removeMember(users.alice, { membership: hankRemovedAm, opKey: opk() }), "operate on a removed membership → CLR11");
  // credB is untouched.
  await recordNotification({ kind: "wake", role: ROLES.wakeInteractive, secret: credB.secret }, { kind: "rig.b2", opKey: opk(), wake: true });
  const live = await rootQuery("select revoked_at from clara.wake_credentials where id = $1", [credB.credentialId]);
  assert.equal(live.rows[0].revoked_at, null, "the firm-B credential was never revoked by the A admin");
});

// ===========================================================================
// T14 HIGH-11 — the global agent identity can never be a member/owner.
// ===========================================================================
test("T14 HIGH-11: agent cannot be add_member'd; guard_last_owner ignores an agent owner", async (t) => {
  if (unready(t)) return;
  const { users, firms } = world;
  await assertRaises(CLR.badRequest, () => addMember(users.alice, { firm: firms.A, user: AGENT_USER_ID, role: "bookkeeper", opKey: opk() }), "add_member(agent) rejected");

  // Fresh firm with one human owner + a raw-inserted agent owner. Removing the human
  // owner must still raise CLR09 — the agent is not a surviving non-agent owner.
  // The agent-owner row is a GLOBAL-unique active membership, so clean any stale one
  // from a prior run on this DB first, and remove ours at the end (re-runnable rig).
  await rootQuery("delete from clara.firm_memberships where user_id = $1", [AGENT_USER_ID]);
  const ivan = await insertUser(world.prefix, "ivan");
  const token = await seedAdmission();
  const firmI = await createFirm(ivan, { name: `${world.prefix}_firmI`, token, opKey: opk() });
  await rootQuery("insert into clara.firm_memberships (firm_id, user_id, role, status) values ($1, $2, 'owner', 'active')", [firmI, AGENT_USER_ID]);
  try {
    const ivanM = await membershipId(firmI, ivan);
    await assertRaises(CLR.lastOwner, () => removeMember(ivan, { membership: ivanM, opKey: opk() }), "last HUMAN owner protected even with an agent owner present");
  } finally {
    await rootQuery("delete from clara.firm_memberships where user_id = $1 and firm_id = $2", [AGENT_USER_ID, firmI]).catch(() => {});
  }
});

// ===========================================================================
// T17 — privilege matrix; T17b — post-migrate canary (no PUBLIC/default leak)
// ===========================================================================
test("T17 grant matrix: exact per-role EXECUTE, no PUBLIC leak, helpers/cores not app-callable", async (t) => {
  if (unready(t)) return;
  const failures = await grantMatrixFailures();
  assert.deepEqual(failures, [], `grant-matrix drift:\n  ${failures.join("\n  ")}`);
});

// T17b — the PUBLIC-lockdown MECHANISM. PostgreSQL grants EXECUTE to PUBLIC on every
// new function by default, and `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE FROM
// PUBLIC` is a confirmed NO-OP for that hardwired default (verified on PG16/17: it
// materializes no pg_default_acl entry). So a freshly-created clara fn IS
// PUBLIC-executable until an EXPLICIT `REVOKE EXECUTE ... FROM PUBLIC` runs — which
// is exactly what every migration's lockdown block does. This proves (a) the leak is
// real without the revoke, and (b) the migration's explicit-revoke mechanism closes
// it. CONVENTION (enforced by review + this test's existence): every future migration
// that CREATEs functions MUST end with the explicit revoke, because ADP will not.
test("T17b PUBLIC-lockdown mechanism: a fresh fn leaks to PUBLIC until the explicit REVOKE closes it", async (t) => {
  if (unready(t)) return;
  const name = `_rig_canary_${Date.now().toString(36)}`;
  await asRole(ROLES.fnOwner, (c) => c.query(`create function clara.${name}() returns int language sql immutable as $$ select 1 $$`));
  try {
    // Before the explicit revoke: the fresh fn is PUBLIC-executable (ADP did NOT stop it).
    const leaks = await roleQuery(ROLES.wakeProactive, `select clara.${name}() as v`);
    assert.equal(leaks.rows[0].v, 1, "a fresh fn is PUBLIC-executable until an explicit revoke (ADP is a no-op)");
    // The migration's ACTUAL mechanism — the explicit blanket revoke — closes it.
    await rootQuery(`revoke execute on all functions in schema clara from public`);
    await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.wakeProactive, `select clara.${name}()`), "after explicit REVOKE, PUBLIC cannot execute");
  } finally {
    await rootQuery(`drop function if exists clara.${name}()`).catch(() => {});
  }
});

// ===========================================================================
// T18 — definer hygiene + forced RLS on governed tables
// ===========================================================================
test("T18 every SECURITY DEFINER fn pins search_path + is owned by clara_fn_owner", async (t) => {
  if (unready(t)) return;
  const bad = await definerHygieneFailures();
  assert.deepEqual(bad, [], `definer hygiene violations: ${bad.join(", ")}`);
});

test("T18 governed firm-scoped tables have RLS ENABLED and FORCED", async (t) => {
  if (unready(t)) return;
  const problems = await governedRlsFailures();
  assert.deepEqual(problems, [], `RLS not forced on governed tables:\n  ${problems.join("\n  ")}`);
});

// ===========================================================================
// T19 — poison a role → the documented reset+re-migrate convergence normalizes it.
// Destructive (drops schema clara), so gated: set CLARA_RIG_ALLOW_RESET=1 to run
// (isolated DB only). Plain re-migrate does NOT re-run 0002 — see the lane report.
// ===========================================================================
test("T19 poison-role: reset + re-migrate normalizes a poisoned clara role", async (t) => {
  if (unready(t)) return;
  if (process.env.CLARA_RIG_ALLOW_RESET !== "1") {
    t.skip("destructive (drops schema clara); set CLARA_RIG_ALLOW_RESET=1 on an isolated DB to run");
    return;
  }
  const { reset } = await import("../scripts/reset.mjs");
  const { migrate } = await import("../scripts/migrate.mjs");
  await rootQuery("alter role clara_agent_ro bypassrls");
  await reset({ log: () => {} });
  await migrate({ log: () => {} });
  const r = await rootQuery("select rolbypassrls, rolsuper, rolcanlogin from pg_roles where rolname = 'clara_agent_ro'");
  assert.equal(r.rows[0].rolbypassrls, false, "re-migrate normalized NOBYPASSRLS");
  assert.equal(r.rows[0].rolsuper, false, "clara_agent_ro is NOSUPERUSER");
  assert.equal(r.rows[0].rolcanlogin, false, "clara_agent_ro is NOLOGIN");
});

// ===========================================================================
// T23 — admission gate on create_firm + create_client admin-only (v2 §F)
// ===========================================================================
test("T23 create_firm is fail-closed on an admission token; create_client is admin-only", async (t) => {
  if (unready(t)) return;
  const { users } = world;
  const frank = await insertUser(world.prefix, "frank");

  await assertRaises(CLR.authz, () => createFirm(frank, { name: `${world.prefix}_noTok`, token: randomUUID(), opKey: opk() }), "create_firm unknown token");

  const token = await seedAdmission();
  const firmF = await createFirm(frank, { name: `${world.prefix}_firmF`, token, opKey: opk() });
  assert.ok(firmF, "create_firm with a valid token succeeds");
  const consumed = await rootQuery("select consumed_at from clara.firm_admissions where token = $1", [token]);
  assert.ok(consumed.rows[0].consumed_at != null, "admission token is consumed");
  const owner = await rootQuery("select role from clara.firm_memberships where firm_id = $1 and user_id = $2 and status = 'active'", [firmF, frank]);
  assert.equal(owner.rows[0]?.role, "owner", "bootstrapping user becomes owner");
  const grace = await insertUser(world.prefix, "grace");
  await assertRaises(CLR.authz, () => createFirm(grace, { name: `${world.prefix}_reuse`, token, opKey: opk() }), "reuse consumed token");

  await assertRaises(CLR.authz, () => createClient(users.bob, { name: `${world.prefix}_bkClient`, opKey: opk() }), "bookkeeper create_client");
  const okClient = await createClient(users.alice, { name: `${world.prefix}_adminClient`, opKey: opk() });
  assert.ok(okClient, "admin create_client succeeds");
});
