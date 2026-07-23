// Slice-3 rig — the EVENT SPINE, part 3: ISOLATION + MATRIX, APPEND-ONLY, CATALOG/
// VALIDATION, CONTEXT PACK, DEADLOCKS, STAMPING, ALLOCATOR (§4.5–§4.10 + P6 of
// docs/plan/slice3-event-spine-contract.md v2.2; suite map in rig-events.test.mjs). Every negative asserts
// an EXACT SQLSTATE; a divergence stays as the contract states.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  ROLES,
  HIGH_STAKES_CENTS,
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesOneOf,
  balanced,
  opk,
  sha,
  rootQuery,
  humanQuery,
  roleQuery,
  withActor,
  human,
  ensureReady,
  buildWorld,
  endPool,
  draftEntry,
  approveEntry,
  reverseEntry,
  ingestDocument,
  recordNotification,
  freshResolution,
  mintWake,
  insertUser,
  eventsReady,
  maxSeq,
  allSeqs,
  amountShapedKeys,
  contextPack,
  packVersion,
  wakeDraftWithVersion,
  seedFreshFirm,
  addMemberVsDraft,
  approveMirrorVsReverse,
  firstEventRace,
  ALL_EVENT_TYPES,
  EVENT_CLIENT_SCOPED,
  TAXONOMY_V1,
} from "./rig-events-helpers.mjs";
import { withTxn, truncateGuardError } from "./rig-txn.mjs";

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

const P = () => `evts_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;

/** Insert a wake_intent (as runtime) for `eventId` with CORRECT derived fields + the
 *  v1 decision for the event's type — used by the isolation/immutability sweeps. */
async function makeIntent(eventId) {
  const e = (await rootQuery("select firm_id, seq, event_type from clara.domain_events where id = $1", [eventId])).rows[0];
  await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, $3, $4, $5, 1)",
    [eventId, e.firm_id, e.seq, e.event_type, TAXONOMY_V1[e.event_type]],
  );
}

/** The id of the most recent event of a given type for a firm (root). */
async function latestEvent(firm, type) {
  const r = await rootQuery("select id, firm_id, seq::int as seq, event_type from clara.domain_events where firm_id = $1 and event_type = $2 order by seq desc limit 1", [firm, type]);
  return r.rows[0];
}

// ===========================================================================
// §5 — ISOLATION + MATRIX.
// ===========================================================================
test("§5 isolation: firm-A human/agent lanes cannot see firm-B domain_events / wake_intents", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  await ingestDocument(human(users.dave), { client: clients.B1, sha256: sha(randomUUID()), opKey: opk() });
  await makeIntent((await latestEvent(firms.A, "document.ingested")).id);
  await makeIntent((await latestEvent(firms.B, "document.ingested")).id);

  const aH = await humanQuery(users.alice, "select count(*)::int n from clara.domain_events where firm_id = $1", [firms.A]);
  const bH = await humanQuery(users.alice, "select count(*)::int n from clara.domain_events where firm_id = $1", [firms.B]);
  assert.ok(aH.rows[0].n >= 1, "firm-A human sees firm-A events");
  assert.equal(bH.rows[0].n, 0, "firm-A human sees ZERO firm-B events");

  const credA = await mintWake({ kind: "interactive", firm: firms.A });
  await withActor({ role: ROLES.agentRo, wakeSecret: credA.secret, transaction: true }, async (c) => {
    const a = await c.query("select count(*)::int n from clara.domain_events where firm_id = $1", [firms.A]);
    const b = await c.query("select count(*)::int n from clara.domain_events where firm_id = $1", [firms.B]);
    assert.ok(a.rows[0].n >= 1, "firm-A agent sees firm-A events");
    assert.equal(b.rows[0].n, 0, "firm-A agent sees ZERO firm-B events");
  });

  const aI = await humanQuery(users.alice, "select count(*)::int n from clara.wake_intents where firm_id = $1", [firms.A]);
  const bI = await humanQuery(users.alice, "select count(*)::int n from clara.wake_intents where firm_id = $1", [firms.B]);
  assert.ok(aI.rows[0].n >= 1, "firm-A human sees firm-A intents");
  assert.equal(bI.rows[0].n, 0, "firm-A human sees ZERO firm-B intents");
});

test("§5 matrix: agent cannot INSERT events/intents; no EXECUTE on wake_draft_entry; get_context_pack grants/STABLE; no orphan overloads (C11)", async (t) => {
  if (unready(t)) return;
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "insert into clara.domain_events (firm_id, seq, event_type, payload) values ($1, 1, 'firm.created', '{}')", [randomUUID()]), "agent_ro INSERT domain_events");
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, 1, 'x', 'ignore', 1)", [randomUUID(), randomUUID()]), "agent_ro INSERT wake_intents");

  const wd = await rootQuery(
    "select coalesce(bool_or(has_function_privilege($1, p.oid, 'execute')), false) as ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = 'wake_draft_entry'",
    [ROLES.agentRo],
  );
  assert.equal(wd.rows[0].ok, false, "agent_ro has NO EXECUTE on wake_draft_entry");

  const gcp = await rootQuery("select p.oid::int8 as oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = 'get_context_pack'");
  assert.equal(gcp.rows.length, 1, "exactly one get_context_pack");
  const oid = gcp.rows[0].oid;
  const roleHas = async (role) => (await rootQuery("select has_function_privilege($1, $2::oid, 'execute') as ok", [role, oid])).rows[0].ok;
  assert.equal(await roleHas(ROLES.authenticated), true, "authenticated may EXECUTE get_context_pack");
  assert.equal(await roleHas(ROLES.agentRo), true, "agent_ro may EXECUTE get_context_pack");
  assert.equal(await roleHas(ROLES.wakeInteractive), false, "wake_interactive may NOT EXECUTE get_context_pack");
  assert.equal(await roleHas(ROLES.runtime), false, "runtime may NOT EXECUTE get_context_pack");
  const pub = await rootQuery(
    "select (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')) as public_exec from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = 'get_context_pack'",
  );
  assert.equal(pub.rows[0].public_exec, false, "get_context_pack is NOT PUBLIC-executable");

  const vol = await rootQuery("select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = 'get_context_pack'");
  assert.equal(vol.rows[0].provolatile, "s", "get_context_pack is STABLE (provolatile = 's')");

  for (const fn of ["_draft_entry_core", "wake_draft_entry"]) {
    const rows = await rootQuery("select p.pronargs, p.proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = $1", [fn]);
    assert.equal(rows.rows.length, 1, `exactly one overload of ${fn} (no orphan old-arity — C11)`);
    assert.ok((rows.rows[0].proargnames || []).includes("p_books_version"), `${fn} carries the new p_books_version param`);
  }
});

// ===========================================================================
// §6 — APPEND-ONLY / IMMUTABILITY.
// ===========================================================================
test("§6 append-only: domain_events / event_types / taxonomy_versions / trigger_taxonomy / wake_intents reject UPDATE/DELETE/TRUNCATE (CLR08)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  await makeIntent((await latestEvent(firms.A, "document.ingested")).id);

  const frozen = [
    { tbl: "domain_events", upd: "update clara.domain_events set payload = '{}' where firm_id = $1", del: "delete from clara.domain_events where firm_id = $1", args: [firms.A] },
    { tbl: "event_types", upd: "update clara.event_types set description = 'x'", del: "delete from clara.event_types where name = 'firm.created'", args: [] },
    { tbl: "taxonomy_versions", upd: "update clara.taxonomy_versions set note = 'x'", del: "delete from clara.taxonomy_versions", args: [] },
    { tbl: "trigger_taxonomy", upd: "update clara.trigger_taxonomy set note = 'x'", del: "delete from clara.trigger_taxonomy", args: [] },
    { tbl: "wake_intents", upd: "update clara.wake_intents set status = 'pending'", del: "delete from clara.wake_intents", args: [] },
  ];
  for (const f of frozen) {
    await assertRaises(CLR.immutable, () => rootQuery(f.upd, f.args), `UPDATE ${f.tbl} → CLR08`);
    await assertRaises(CLR.immutable, () => rootQuery(f.del, f.args), `DELETE ${f.tbl} → CLR08`);
    const te = await truncateGuardError(`truncate clara.${f.tbl} cascade`);
    assert.equal(te && te.code, CLR.immutable, `TRUNCATE ${f.tbl} → CLR08 (got ${te && te.code}: ${te && te.message})`);
  }
});

test("§6 taxonomy_active permits ONLY the version repoint; rejects DELETE/TRUNCATE/singleton-flip/second-row", async (t) => {
  if (unready(t)) return;
  // A legal version repoint is ALLOWED — proven inside a rolled-back txn so the active
  // pointer is left untouched for every other test (append-only permits the INSERT).
  await withTxn(async (c) => {
    await c.query("insert into clara.taxonomy_versions (version, note) values (99001, 'rig temp repoint')");
    await c.query("update clara.taxonomy_active set version = 99001"); // the ONLY legal mutation → no throw
  }, { commit: false });

  await assertRaises(CLR.immutable, () => rootQuery("delete from clara.taxonomy_active"), "DELETE taxonomy_active → CLR08");
  const tta = await truncateGuardError("truncate clara.taxonomy_active");
  assert.equal(tta && tta.code, CLR.immutable, `TRUNCATE taxonomy_active → CLR08 (got ${tta && tta.code})`);
  await assertRaisesOneOf([CLR.immutable, PG.checkViolation], () => rootQuery("update clara.taxonomy_active set singleton = false"), "singleton flip rejected");
  await assertRaisesOneOf(
    [CLR.immutable, PG.uniqueViolation, PG.checkViolation],
    () => rootQuery("insert into clara.taxonomy_active (singleton, version) values (true, (select min(version) from clara.taxonomy_versions))"),
    "a second taxonomy_active row is impossible (guarded singleton)",
  );
});

test("§6 relay_dead_letters: UPDATE limited to status/attempt_count/resolved_at; other columns + DELETE → CLR08", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  const ev = await latestEvent(firms.A, "document.ingested");
  await roleQuery(
    ROLES.runtime,
    "insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason) values ('router', $1, $2, 1, 'x', 'rig reason')",
    [ev.id, firms.A],
  );

  await rootQuery("update clara.relay_dead_letters set status = 'resolved', attempt_count = 2, resolved_at = now() where event_id = $1", [ev.id]);
  await assertRaises(CLR.immutable, () => rootQuery("update clara.relay_dead_letters set reason = 'tampered' where event_id = $1", [ev.id]), "UPDATE reason on dead-letter");
  await assertRaises(CLR.immutable, () => rootQuery("update clara.relay_dead_letters set event_seq = 999 where event_id = $1", [ev.id]), "UPDATE event_seq on dead-letter");
  await assertRaises(CLR.immutable, () => rootQuery("delete from clara.relay_dead_letters where event_id = $1", [ev.id]), "DELETE dead-letter");
});

// ===========================================================================
// §7 — CATALOG / COVERAGE / VALIDATION.
// ===========================================================================
test("§7 coverage: the active taxonomy version covers every event_type; the 13 contract types are present with correct client_scoped", async (t) => {
  if (unready(t)) return;
  // The active version must ROUTE every catalog row (contract §0.5 / §2.7): anti-join ∅.
  // `rig.%` is the reserved TEST namespace: the runtime relay suite appends a
  // synthetic wake-bound type whose coverage tracks whichever version was active
  // when it registered — on a shared DB (CI runs every package against one
  // database) it must not false-fail the REAL catalog's full-coverage law.
  const uncovered = await rootQuery(`
    select et.name from clara.event_types et
    where et.name not like 'rig.%'
      and not exists (
      select 1 from clara.trigger_taxonomy tt
      where tt.version = (select version from clara.taxonomy_active) and tt.event_type = et.name)`);
  assert.deepEqual(uncovered.rows.map((r) => r.name), [], "the active version covers every event_type (anti-join empty)");

  // The catalog is APPEND-ONLY: a shared-DB run may carry an extra synthetic type appended
  // by the runtime suite, so assert the 13 contract types are PRESENT (superset), never
  // exact-set equality — an appended type must not false-fail the rig.
  const cat = (await rootQuery("select name, client_scoped from clara.event_types")).rows;
  const flags = new Map(cat.map((r) => [r.name, r.client_scoped]));
  const missing = ALL_EVENT_TYPES.filter((n) => !flags.has(n));
  assert.deepEqual(missing, [], `every contract event type is present in the catalog (missing: ${missing.join(", ")})`);
  for (const n of ALL_EVENT_TYPES) assert.equal(flags.get(n), EVENT_CLIENT_SCOPED[n], `${n} client_scoped matches the contract`);
});

test("§7 validation: firm-level event with a non-null client_id is rejected; a foreign entity id is rejected (D2)", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients, coa } = world;
  const base = (await maxSeq(firms.A)) + 1000;

  await assertRaises(
    CLR.badRequest,
    () => rootQuery("insert into clara.domain_events (firm_id, seq, event_type, client_id, payload) values ($1, $2, 'firm.created', $3, '{}')", [firms.A, base, clients.A1]),
    "firm-level event with non-null client_id",
  );

  const bDraft = await draftEntry(human(users.dave), { client: clients.B1, resolution: await freshResolution(users.dave, clients.B1), lines: balanced(coa.B1, ROUTINE_CENTS), opKey: opk() });
  await assertRaises(
    CLR.badRequest,
    () => rootQuery("insert into clara.domain_events (firm_id, seq, event_type, client_id, entry_id, payload) values ($1, $2, 'entry.drafted', $3, $4, '{}')", [firms.A, base + 1, clients.A1, bDraft.entry_id]),
    "entry_id belonging to another firm (D2)",
  );

  const bDoc = await ingestDocument(human(users.dave), { client: clients.B1, sha256: sha(randomUUID()), opKey: opk() });
  await assertRaises(
    CLR.badRequest,
    () => rootQuery("insert into clara.domain_events (firm_id, seq, event_type, client_id, document_id, payload) values ($1, $2, 'document.ingested', $3, $4, '{}')", [firms.A, base + 2, clients.A1, bDoc]),
    "document_id belonging to another firm (D2)",
  );
});

test("§7 payload confidentiality: no emitted event payload contains amount-shaped fields (N2)", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "n2");
  const res = await freshResolution(owner, client);
  const d = await draftEntry(human(owner), { client, resolution: res, lines: balanced(coa, HIGH_STAKES_CENTS), opKey: opk() });
  await approveEntry(owner, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "sole practitioner attests", opKey: opk() });
  await reverseEntry(owner, { entry: d.entry_id, reason: "n2 sweep", opKey: opk() });
  await ingestDocument(human(owner), { client, sha256: sha(randomUUID()), opKey: opk() });
  await recordNotification(human(owner), { client, kind: "n2.kind", payload: { note: "hello" }, opKey: opk() });

  const rows = (await rootQuery("select event_type, payload from clara.domain_events where firm_id = $1", [firm])).rows;
  assert.ok(rows.length >= 6, "the sweep exercised a representative set of emitters");
  for (const r of rows) {
    const bad = amountShapedKeys(r.payload);
    assert.deepEqual(bad, [], `${r.event_type} payload leaks amount-shaped keys: ${bad.join(", ")} — ${JSON.stringify(r.payload)}`);
  }
});

// ===========================================================================
// §8 — get_context_pack.
// ===========================================================================
test("§8 get_context_pack: full shape; books_version == firm max seq; blank purpose → CLR10; cross-firm → null", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  const pack = await contextPack(users.alice, clients.A1, "close review");
  assert.ok(pack, "a pack is returned for a visible client");
  // 0016 (P5/contract §2.3): pack_schema_version 2 → 3 + the sst_registration_watch array.
  // W6 pins the additive 3-to-4 bump.
  assert.equal(pack.pack_schema_version, 4, "0017 pack_schema_version = 4 (W6)");
  assert.equal(pack.purpose, "close review", "purpose echoed");
  for (const k of ["generated_at", "books_version", "client", "firm", "coa", "trial_balance", "recent_entries", "documents", "resolutions", "approval_history", "sst_registration_watch"]) {
    assert.ok(k in pack, `pack has key ${k}`);
  }
  assert.ok(Array.isArray(pack.sst_registration_watch), "sst_registration_watch is an array (one element per open watch; [] when none)");
  assert.equal(pack.client.id, clients.A1, "pack.client.id");
  assert.ok("status" in pack.client, "pack.client.status present");
  assert.ok("high_stakes_amount_cents" in pack.firm, "pack.firm.high_stakes_amount_cents present");
  assert.equal(Number(pack.books_version), await maxSeq(firms.A), "books_version == the firm's max seq at read");

  await assertRaises(CLR.badRequest, () => contextPack(users.alice, clients.A1, ""), "blank purpose → CLR10");
  const foreign = await contextPack(users.alice, clients.B1, "x");
  assert.equal(foreign, null, "a cross-firm client → NULL pack (no existence oracle)");
});

test("§8 archived client: the pack surfaces status='archived' AND BOTH draft lanes refuse CLR10 (R1)", async (t) => {
  if (unready(t)) return;
  const { owner, firm, client, coa } = await seedFreshFirm(P(), "arch");
  const res = await freshResolution(owner, client);
  const cred = await mintWake({ kind: "interactive", firm });
  const token = await packVersion(owner, client);
  const lines = balanced(coa, ROUTINE_CENTS);

  await rootQuery("update clara.clients set status = 'archived' where id = $1", [client]);

  const pack = await contextPack(owner, client, "archived check");
  assert.ok(pack, "the pack is still returned for a visible (archived) client");
  assert.equal(pack.client.status, "archived", "the pack surfaces status = archived");

  await assertRaises(CLR.badRequest, () => draftEntry(human(owner), { client, resolution: res, lines, opKey: opk() }), "human draft on an archived client → CLR10");
  await assertRaises(
    CLR.badRequest,
    () => wakeDraftWithVersion({ secret: cred.secret, client, resolution: res, lines, opKey: opk(), booksVersion: token }),
    "wake draft on an archived client → CLR10 (R1: both lanes)",
  );
});

// ===========================================================================
// §9 — DEADLOCK REGRESSIONS.
// ===========================================================================
test("§9 deadlock (C4): add_member (firms lock) vs a concurrent same-firm draft — both complete, no 40P01", async (t) => {
  if (unready(t)) return;
  const prefix = P();
  const { owner, firm, client, coa } = await seedFreshFirm(prefix, "c4");
  const res = await freshResolution(owner, client);
  const newUser = await insertUser(prefix, "c4new");
  const out = await addMemberVsDraft({ firm, adminSub: owner, newUser, client, resolution: res, coa, amount: ROUTINE_CENTS });
  assert.ok(out.addMember && out.addMember.ok, `add_member completed (got ${JSON.stringify(out.addMember)})`);
  assert.ok(out.draft && out.draft.ok, `draft completed (got ${JSON.stringify(out.draft)})`);
  assert.notEqual(out.addMember.code, "40P01", "add_member did not deadlock");
  assert.notEqual(out.draft.code, "40P01", "draft did not deadlock");
});

test("§9 deadlock (C5): approve reversal-mirror vs concurrent reverse-original — no 40P01, exactly one approved reversal", async (t) => {
  if (unready(t)) return;
  const { users, clients, coa } = world;
  const res = await freshResolution(users.bob, clients.A1);
  const hs = await draftEntry(human(users.bob), { client: clients.A1, resolution: res, lines: balanced(coa.A1, HIGH_STAKES_CENTS), opKey: opk() });
  await approveEntry(users.alice, { entry: hs.entry_id, expectedRevision: hs.revision_token, opKey: opk() });
  const rev = await reverseEntry(users.bob, { entry: hs.entry_id, reason: "c5 base", opKey: opk() }); // high-stakes mirror lands draft
  const mtok = (await rootQuery("select revision_token from clara.journal_entries where id = $1", [rev.reversal_id])).rows[0].revision_token;

  // NOTE (X7b): the counterfactual AB-BA deadlock schedule that the C5 fix prevents can
  // NOT be reproduced against the FIXED code — approve_entry now locks the original
  // before the mirror (consistent original-before-mirror order), so no lock-order cycle
  // exists to force. The coverage for C5 is therefore: the design-time probe (P5-class,
  // reproduced the FK/lock cycle pre-fix), this concurrent race (both interleavings run,
  // never 40P01), and the single-approved-reversal slot assertion below.
  const out = await approveMirrorVsReverse({ approverSub: users.alice, reverserSub: users.bob, original: hs.entry_id, mirror: rev.reversal_id, mirrorToken: mtok });
  assert.notEqual(out.approve?.code, "40P01", `approve did not deadlock (got ${JSON.stringify(out.approve)})`);
  assert.notEqual(out.reverse?.code, "40P01", `reverse did not deadlock (got ${JSON.stringify(out.reverse)})`);

  const approvedRev = await rootQuery("select count(*)::int n from clara.journal_entries where reversal_of = $1 and status = 'approved'", [hs.entry_id]);
  assert.equal(approvedRev.rows[0].n, 1, `exactly one approved reversal survives (approve=${JSON.stringify(out.approve)} reverse=${JSON.stringify(out.reverse)})`);
  if (out.reverse && out.reverse.ok === false) {
    assert.ok(String(out.reverse.code || "").startsWith("CLR"), `the reverse loser failed with a clean CLR code, not 40P01 (got ${out.reverse.code})`);
  }
});

// ===========================================================================
// §10 — STAMPING (C6).
// ===========================================================================
test("§10 stamping (C6): wake_intents AND relay_dead_letters INSERTs with wrong firm/seq/type are corrected from the event; an invalid triple → CLR10", async (t) => {
  if (unready(t)) return;
  const { users, firms, clients } = world;
  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  const ev = await latestEvent(firms.A, "document.ingested");

  // wake_intents: insert with a WRONG firm/seq/type; the trigger derives all three.
  await roleQuery(
    ROLES.runtime,
    "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, 999999, 'totally.wrong', 'background_review', 1)",
    [ev.id, randomUUID()],
  );
  const stored = (await rootQuery("select firm_id, event_seq::int as seq, event_type from clara.wake_intents where event_id = $1", [ev.id])).rows[0];
  assert.equal(stored.firm_id, ev.firm_id, "wake_intents firm_id derived from the event (caller value overwritten)");
  assert.equal(stored.seq, ev.seq, "wake_intents event_seq derived from the event");
  assert.equal(stored.event_type, ev.event_type, "wake_intents event_type derived from the event");

  // relay_dead_letters carries the SAME C6 stamping trigger — insert with WRONG
  // firm/seq/type and READ BACK all three, so deleting the dead-letter stamping trigger
  // cannot stay green (the §6 dead-letter test never reads the derived fields back).
  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  const dlEv = await latestEvent(firms.A, "document.ingested");
  await roleQuery(
    ROLES.runtime,
    "insert into clara.relay_dead_letters (consumer, event_id, firm_id, event_seq, event_type, reason) values ('router', $1, $2, 888888, 'nope', 'rig stamp')",
    [dlEv.id, randomUUID()],
  );
  const dl = (await rootQuery("select firm_id, event_seq::int as seq, event_type from clara.relay_dead_letters where event_id = $1", [dlEv.id])).rows[0];
  assert.equal(dl.firm_id, dlEv.firm_id, "dead-letter firm_id derived from the event (caller value overwritten)");
  assert.equal(dl.seq, dlEv.seq, "dead-letter event_seq derived from the event");
  assert.equal(dl.event_type, dlEv.event_type, "dead-letter event_type derived from the event");

  await ingestDocument(human(users.bob), { client: clients.A1, sha256: sha(randomUUID()), opKey: opk() });
  const ev2 = await latestEvent(firms.A, "document.ingested");
  await assertRaises(
    CLR.badRequest,
    () => roleQuery(ROLES.runtime, "insert into clara.wake_intents (event_id, firm_id, event_seq, event_type, decision, taxonomy_version) values ($1, $2, 1, 'x', 'internal_task', 1)", [ev2.id, firms.A]),
    "an invalid (taxonomy_version, event_type, decision) triple → CLR10",
  );
});

// ===========================================================================
// §P6 — allocator: concurrent first-events for a brand-new firm.
// ===========================================================================
test("§P6 allocator: two concurrent first-events for a brand-new firm get distinct contiguous seqs (D4)", async (t) => {
  if (unready(t)) return;
  const out = await firstEventRace();
  const seqs = [out.a, out.b].sort((x, y) => x - y);
  assert.deepEqual(seqs, [1, 2], `concurrent first-events get distinct contiguous seqs 1,2 (got ${JSON.stringify(out)})`);
  assert.deepEqual(await allSeqs(out.firm), [1, 2], "exactly two contiguous events landed for the fresh firm");
});
