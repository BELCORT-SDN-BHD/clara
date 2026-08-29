// 裁-41 (owner ruling, 2026-08-30) — clara.client_identifiers gains a UNIQUE over
// (client_id, kind, value_normalized), and both direct writers gain the narrow
// unique_violation -> typed-refusal map.
//
// Migration: packages/db/migrations/UNNUMBERED_client_identifiers_unique.sql (numbered at merge).
// Ground: docs/plan/active/mohe-grill-rulings-2026-08-29.md 裁-41; the gap it closes is the
// CONFIRM-side race that 0148_promotion_dup_open_wall's partial unique deliberately leaves open
// (settling a card frees the slot, so a second card can legally open and be confirmed).
//
// GATING is on the CATALOG, never on a migration number — a number-keyed gate goes vacuous the
// day the conductor renumbers the file at merge.
//
// WHAT THESE CELLS ARE FOR, and how they are meant to break.
//   * The REFUSAL cells each have an ADMITTING twin beside them, because "it refused" is
//     worthless next to a wall that refuses everything. In particular ci-3 proves the sibling
//     conflict 0007:235 kept representable is STILL representable — the same value on a
//     different client — which is the one thing this ruling must not have broken.
//   * NARROWNESS is proven PER WRITER, and the two proofs are NOT the same strength — say so
//     rather than let the naming imply symmetry. ci-9 is a behavioural mutant-kill for
//     clara.add_client_identifier: it has no re-read, so deleting its narrow guard turns a
//     foreign 23505 into the typed CLR10 and ci-9 reds. ci-9b covers
//     clara._add_bank_account_core, where the guard and the re-read share a predicate and are
//     therefore NOT separable — ci-9b proves the handler does not SWALLOW a foreign violation
//     (it escapes raw, naming the constraint that fired), but deleting that writer's guard does
//     NOT red it. There, the guard's standing coverage is ci-12's `guards` count, which is
//     STATIC. Two earlier drafts of this header over-claimed here — first that ci-9 covered
//     "either writer", then that ci-9b killed the guard mutant. Neither was true.
//   * ci-8 and ci-10 are the INTERLEAVE cells: two sessions, the block PROVEN with
//     waitBlockedByOrThrow (pg_blocking_pids), never a sleep. Drop the index and no side ever
//     blocks, so they red. ci-10b is NOT one of them — its winner COMMITS before the loser's
//     insert is attempted, so nothing blocks and there is no lock to observe; its observable is
//     the SNAPSHOT, and it needs no blocking by construction.
//   * ci-10 pins the asymmetry: _add_bank_account_core's handler CONTINUES where
//     add_client_identifier REFUSES. But ci-10 alone does NOT prove the RE-READ inside that
//     handler — under READ COMMITTED the winner's row is visible, so deleting the re-read leaves
//     ci-10 green. ci-10b makes the re-read load-bearing: it runs the loser at REPEATABLE READ,
//     where the 23505 still fires but the re-read genuinely CANNOT see the committed row, so the
//     handler must re-raise. Delete the re-read and ci-10b goes green-on-success instead.
//   * EVERY bank-core cell runs TWICE, once per guarded insert (`.house` / `.digits`), because
//     that function has TWO client_identifiers writes with TWO separate handlers. The account
//     number is HYPHENATED so the door's two normalization forms differ; a purely numeric number
//     collapses them to one string, the first insert always raises, and the second handler is
//     never reached — which is exactly how it stayed unguarded through the first fix round.
//   * ci-11 exercises a COPY of the pre-flight's census expression, re-typed inline — it cannot
//     see drift in the migration's own §0.6 text, because it never reads it. Stated plainly so
//     nobody mistakes it for a drift guard: what it proves is that a GROUP BY/HAVING of this
//     shape finds and NAMES a duplicate group and does not sweep in a singleton. The real
//     end-to-end refusal cannot be provoked against a live database once the index exists; that
//     proof is a rig ceremony and it is recorded in the PR body.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, endPool, buildWorld, opk, assertRaises, getPool, ROLES, upsertAccount,
} from "./rig-fixtures.mjs";
import { waitBlockedByOrThrow } from "./wave-b/wb-calls.mjs";

const INDEX = "uq_client_identifiers_client_kind_value";
const MODEL = '{"provider":"anthropic","model":"m","version":"v"}';

let world = null;
let live = false;

/** Applied? Asked of the LIVE catalog, and BY PROPERTY: an index that exists under this name but
 *  is not unique is not "applied", it is a defect wearing the right name (law 3). */
async function wallApplied() {
  const r = await rootQuery(
    `select coalesce((select i.indisunique and i.indisvalid and i.indisready and i.indislive
                        from pg_index i where i.indexrelid = to_regclass($1)), false) as ok,
            to_regclass($1) is not null as present`, [`clara.${INDEX}`]);
  const { ok, present } = r.rows[0];
  if (present && !ok) {
    throw new Error(`clara.${INDEX} exists but is not unique+valid+ready+live — a half-applied wall is a defect, refusing to skip past it`);
  }
  return ok;
}

before(async () => {
  live = await wallApplied();
  if (live) world = await buildWorld();
});
after(async () => { await endPool(); });

/** Two-armed gate. The package-wide sweep skips LOUDLY via the pre-integration gate's variable;
 *  a focused run with the variable UNSET fails instead of skipping. */
const gate = (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_CLIENT_IDENTIFIERS_UNIQUE === "1") {
      console.warn(`SKIP client-identifiers-unique: clara.${INDEX} is not applied to this database (explicit pre-integration run).`);
      t.skip(`clara.${INDEX} not applied — explicit pre-integration run`);
      return true;
    }
    assert.fail(`clara.${INDEX} is required for a focused or post-migration run: apply the migration, or set CLARA_ALLOW_MISSING_CLIENT_IDENTIFIERS_UNIQUE=1 for the package-wide pre-integration sweep`);
  }
  return false;
};

const val = (tag) => `${tag}${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const addIdentifier = (sub, client, kind, value, opKey) =>
  humanQuery(sub, "select clara.add_client_identifier($1,$2,$3,$4) as r", [client, kind, value, opKey ?? opk("aci")]);

const countRows = async (client, kind, value) =>
  (await rootQuery(
    "select count(*)::int as n from clara.client_identifiers where client_id=$1 and kind=$2 and value_normalized=$3",
    [client, kind, value])).rows[0].n;

/** Mint an OPEN promotion card straight at the core, the way f-a7-pi's own battery does. */
async function proposeCard(client, kind, value) {
  const r = await rootQuery(
    `select clara._identifier_promotion_core($1,$2,null,null,$3,$4,$5,3,
       '[{"region":"r1"}]'::jsonb,'seen three times',$6::jsonb) as id`,
    [world.agent, world.firms.A, client, kind, value, MODEL]);
  return r.rows[0].id;
}

// ---------------------------------------------------------------------------------------
// A · THE WRITER DOOR — clara.add_client_identifier
// ---------------------------------------------------------------------------------------

test("ci-1 · a SECOND add_client_identifier for the same (client, kind, value) under a DIFFERENT op_key refuses BY NAME, and writes nothing", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  const first = await addIdentifier(world.users.bob, world.clients.A1, "tin", v, opk("ci1a"));
  assert.ok(first.rows[0].r.identifier_id, "the first call mints an identifier");
  assert.equal(await countRows(world.clients.A1, "tin", v), 1);

  // A DIFFERENT op_key, so the op-receipt wall (which is per-op_key) cannot be what refuses —
  // this is the exact shape 裁-41 names, and before the index it wrote a second identical row.
  const err = await assertRaises("CLR10",
    () => addIdentifier(world.users.bob, world.clients.A1, "tin", v, opk("ci1b")),
    "a second identical identifier");
  assert.match(String(err.detail ?? ""), /already_recorded/,
    `ci-1: names the typed reason already_recorded (got ${err.detail ?? "(none)"})`);
  assert.match(String(err.message ?? ""), /already recorded for this client/,
    "ci-1: the refusal reads as a sentence a bookkeeper can act on");
  assert.equal(await countRows(world.clients.A1, "tin", v), 1, "still exactly one — the refusal wrote nothing");
});

test("ci-2 · a DIFFERENT value, and a DIFFERENT kind at the same value, are both still ADMITTED", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  await addIdentifier(world.users.bob, world.clients.A1, "tin", v, opk("ci2a"));
  const other = await addIdentifier(world.users.bob, world.clients.A1, "tin", `${v}x`, opk("ci2b"));
  assert.ok(other.rows[0].r.identifier_id, "a different value on the same client is admitted");
  // `kind` is part of the key, so the same string under another kind is a different fact.
  const kind2 = await addIdentifier(world.users.bob, world.clients.A1, "ssm", v, opk("ci2c"));
  assert.ok(kind2.rows[0].r.identifier_id, "the same value under a different kind is admitted");
  assert.equal(await countRows(world.clients.A1, "tin", v), 1);
  assert.equal(await countRows(world.clients.A1, "ssm", v), 1);
});

test("ci-3 · THE SIBLING CONFLICT SURVIVES: the same (kind, value) on a DIFFERENT client is admitted", async (t) => {
  if (gate(t)) return;
  const v = val("ssm");
  await addIdentifier(world.users.bob, world.clients.A1, "ssm", v, opk("ci3a"));
  const sibling = await addIdentifier(world.users.bob, world.clients.A2, "ssm", v, opk("ci3b"));
  assert.ok(sibling.rows[0].r.identifier_id,
    "0007:235's sibling-client conflict must stay representable — the attribution lane and _confirm_bank_identifier_promotion_core's ambiguity refusal both depend on SEEING it");
  const firmWide = await rootQuery(
    "select count(distinct client_id)::int as n from clara.client_identifiers where firm_id=$1 and kind='ssm' and value_normalized=$2",
    [world.firms.A, v]);
  assert.equal(firmWide.rows[0].n, 2, "two clients of one firm carry the same identifier, exactly as before this wall");
});

test("ci-4 · an op-key REPLAY returns the cached receipt (it never reaches the index)", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  const key = opk("ci4");
  const first = await addIdentifier(world.users.bob, world.clients.A2, "tin", v, key);
  const replay = await addIdentifier(world.users.bob, world.clients.A2, "tin", v, key);
  assert.equal(replay.rows[0].r.identifier_id, first.rows[0].r.identifier_id,
    "the replay returns the SAME identifier_id — _reserve_op answers before the insert is ever attempted");
  assert.equal(await countRows(world.clients.A2, "tin", v), 1, "and writes nothing more");
});

test("ci-5 · the wall is on the NORMALISED value, not the spelling", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  await addIdentifier(world.users.bob, world.clients.A2, "tin", v, opk("ci5a"));
  // add_client_identifier stores lower(regexp_replace(value,'\s+','','g')) — DC-1's rule. A spaced,
  // mixed-case spelling of the same machine identifier is the SAME fact and must collide.
  const spaced = ` ${v.slice(0, 4).toUpperCase()} ${v.slice(4)} `;
  const err = await assertRaises("CLR10",
    () => addIdentifier(world.users.bob, world.clients.A2, "tin", spaced, opk("ci5b")),
    "a re-spelled duplicate");
  assert.match(String(err.detail ?? ""), /already_recorded/);
  assert.equal(await countRows(world.clients.A2, "tin", v), 1);
});

// ---------------------------------------------------------------------------------------
// B · THE CONFIRM DOORS — they inherit the refusal, with no body change of their own
// ---------------------------------------------------------------------------------------

test("ci-6 · 裁-41's headline: TWO separately-settled promotion cards for one subject — the second confirm refuses and its card STAYS proposed", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  const cardA = await proposeCard(world.clients.A1, "tin", v);
  const confirmed = await humanQuery(world.users.bob,
    "select clara.confirm_identifier_promotion($1,$2) as r", [cardA, opk("ci6a")]);
  assert.ok(confirmed.rows[0].r.identifier_id, "the first card confirms and mints the identifier");

  // 0148's wall is PARTIAL (`where status = 'proposed'`), so settling card A legitimately frees
  // the slot and card B opens. That is by design; it is also precisely the hole 裁-41 closes.
  const cardB = await proposeCard(world.clients.A1, "tin", v);
  assert.ok(cardB, "a second card opens once the first is settled — 0148's partial index permits it");

  const err = await assertRaises("CLR10",
    () => humanQuery(world.users.bob,
      "select clara.confirm_identifier_promotion($1,$2)", [cardB, opk("ci6b")]),
    "confirming a second card onto an identifier that already exists");
  assert.match(String(err.detail ?? ""), /already_recorded/,
    `ci-6: the writer door's typed refusal reaches the confirm door unchanged (got ${err.detail ?? "(none)"})`);

  assert.equal(await countRows(world.clients.A1, "tin", v), 1,
    "exactly ONE identity row — this is the whole point of the ruling");
  const cards = await rootQuery(
    "select id, status, identifier_id from clara.client_identifier_promotions where id = any($1) order by id",
    [[cardA, cardB]]);
  const byId = new Map(cards.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(cardA).status, "confirmed");
  assert.equal(byId.get(cardB).status, "proposed",
    "the losing card is left OPEN for a human to decline — the refusal rolls its whole call back, it does not silently settle it");
  assert.equal(byId.get(cardB).identifier_id, null);
});

test("ci-7 · the losing card can still be DECLINED afterwards, so the refusal is not a dead end", async (t) => {
  if (gate(t)) return;
  const v = val("ssm");
  const cardA = await proposeCard(world.clients.A2, "ssm", v);
  await humanQuery(world.users.bob, "select clara.confirm_identifier_promotion($1,$2)", [cardA, opk("ci7a")]);
  const cardB = await proposeCard(world.clients.A2, "ssm", v);
  await assertRaises("CLR10",
    () => humanQuery(world.users.bob, "select clara.confirm_identifier_promotion($1,$2)", [cardB, opk("ci7b")]),
    "the second confirm");
  await humanQuery(world.users.bob,
    "select clara.decline_identifier_promotion($1,'already recorded',$2)", [cardB, opk("ci7c")]);
  const card = (await rootQuery(
    "select status, identifier_id from clara.client_identifier_promotions where id=$1", [cardB])).rows[0];
  assert.equal(card.status, "declined", "the human's escape hatch still works after the wall refuses");
  assert.equal(card.identifier_id, null);
  assert.equal(await countRows(world.clients.A2, "ssm", v), 1);
});

// ---------------------------------------------------------------------------------------
// C · THE TWO-SESSION RACES. Both PROVE the interleave (pg_blocking_pids), never a sleep.
// ---------------------------------------------------------------------------------------

/** Check out a pooled connection already impersonating `sub` as clara_authenticated, and report
 *  its SERVER-observed backend pid (never inferred from the client handle). */
async function humanSession(sub) {
  const c = await getPool().connect();
  await c.query(`set role ${ROLES.authenticated}`);
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub, role: "authenticated" })]);
  const pid = (await c.query("select pg_backend_pid() as pid")).rows[0].pid;
  return { c, pid };
}

async function releaseSession(s) {
  await s.c.query("rollback").catch(() => {});
  await s.c.query("reset role").catch(() => {});
  await s.c.query("reset all").catch(() => {});
  s.c.release();
}

test("ci-8 · TWO SESSIONS racing the same identifier: the loser observably BLOCKS on the winner's index entry, then refuses typed", async (t) => {
  if (gate(t)) return;
  const v = val("tin");
  const t1 = await humanSession(world.users.bob);
  const t2 = await humanSession(world.users.alice);
  let loser = null;
  try {
    await t1.c.query("begin");
    await t1.c.query("select clara.add_client_identifier($1,'tin',$2,$3)",
      [world.clients.A1, v, opk("ci8a")]);        // holds the uncommitted index entry

    // T2 is an ordinary autocommitting call on ANOTHER session, fired from inside T1's open
    // window. Uncommitted work is invisible across sessions, so T2's insert reaches the index
    // and waits there — the ONE observable this cell is built on.
    const p = t2.c.query("select clara.add_client_identifier($1,'tin',$2,$3)",
      [world.clients.A1, v, opk("ci8b")]).then(() => null).catch((e) => e);
    await waitBlockedByOrThrow(t2.pid, t1.pid, { what: `the ${INDEX} entry` });

    await t1.c.query("commit");
    loser = await p;
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
  assert.ok(loser, "the losing session must not succeed");
  assert.equal(loser.code, "CLR10", `ci-8: the loser refuses typed, not raw (got ${loser.code} — ${loser.message})`);
  assert.match(String(loser.detail ?? ""), /already_recorded/);
  assert.equal(await countRows(world.clients.A1, "tin", v), 1, "exactly one row survives the race");
});

/**
 * A HYPHENATED account number, so the door's TWO normalization forms genuinely DIFFER:
 * `v_house` strips whitespace and lowercases but KEEPS hyphens, `v_digits` strips every
 * non-digit. That difference is what lets a cell choose WHICH of the two guarded inserts it puts
 * under test. A purely numeric number collapses both forms to one string, so the first insert
 * always raises and the SECOND IS NEVER REACHED — which is exactly how the second insert's
 * handler stayed unguarded through the first fix round.
 */
function bankNumber() {
  const d = randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9);
  const number = `7${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}`;
  return { number, house: number, digits: `7${d}` };
}

/**
 * Stand up a bank-candidate chart account. The code is FIXED per cell, never drawn at random:
 * several draws from one narrow range on ONE client collide often enough to matter (~1% per run,
 * and this battery runs twice per CI job), and a collision is NOT benign — an earlier cell binds
 * the code to an active bank account, so a later cell refuses `coa_account_already_bank` BEFORE
 * reaching client_identifiers and reds for a reason unrelated to what it tests. buildWorld's own
 * chart is 1000/1100/4000/5000/9990 and every run mints a fresh client, so fixed constants in the
 * 17xx range cannot collide with the seeded chart or with each other.
 */
async function bankScaffold(tag, coaCode) {
  await upsertAccount(world.users.alice,
    { client: world.clients.A2, code: coaCode, name: `${tag} bank ${coaCode}`, type: "asset", opKey: opk(`${tag}coa`) });
  const inst = (await rootQuery("select code from clara.bank_institutions where active order by code limit 1")).rows[0];
  assert.ok(inst, `${tag}: the chain must carry at least one active bank institution`);
  return { coaCode, bankCode: inst.code, ...bankNumber() };
}

/** The two guarded inserts, addressed by which normalization form the winner plants on. */
const FORMS = [
  ["house", "the FIRST guarded insert (hyphen-preserving house form)"],
  ["digits", "the SECOND guarded insert (digits-only form)"],
];

FORMS.forEach(([form, where], i) => {
  test(`ci-10.${form} · the backstop CONTINUES at ${where}: a concurrently-committed identifier row does not fail the registration`, async (t) => {
    if (gate(t)) return;
    const sc = await bankScaffold(`ci10${form}`, String(1700 + i));
    const planted = sc[form];
    const other = form === "house" ? sc.digits : sc.house;
    const client = world.clients.A2;
    const firm = world.firms.A;

    const t1 = { c: await getPool().connect(), pid: null };
    t1.pid = (await t1.c.query("select pg_backend_pid() as pid")).rows[0].pid;
    const t2 = await humanSession(world.users.alice);
    let outcome = null;
    try {
      // T1 commits NOTHING yet: the row exists only inside its open transaction, so T2's
      // `if not exists` guard genuinely sees nothing and its INSERT reaches the index.
      await t1.c.query("begin");
      await t1.c.query(
        `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
           values ($1,$2,'bank_account',$3,$4)`, [firm, client, planted, world.users.alice]);

      const p = t2.c.query(
        `select clara.add_bank_account(p_client => $1, p_coa_account_code => $2, p_bank_code => $3,
           p_account_number => $4, p_bank_name_display => 'CI10 Bank', p_op_key => $5) as r`,
        [client, sc.coaCode, sc.bankCode, sc.number, opk(`ci10${form}`)])
        .then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, e }));
      await waitBlockedByOrThrow(t2.pid, t1.pid, { what: `the ${INDEX} entry` });

      await t1.c.query("commit");
      outcome = await p;
    } finally {
      await releaseSession(t1);
      await releaseSession(t2);
    }
    assert.ok(outcome.ok,
      `ci-10.${form}: the registration must SURVIVE the identifier race — the backstop re-reads the row and continues, it does not refuse (got ${outcome.e?.code} — ${outcome.e?.message})`);
    assert.ok(outcome.r.rows[0].r.bank_account_id, `ci-10.${form}: and it really registered the account`);
    assert.equal(await countRows(client, "bank_account", planted), 1,
      `ci-10.${form}: exactly one row at the contended form — T1's, kept; the loser wrote none and raised none`);
    assert.equal(await countRows(client, "bank_account", other), 1,
      `ci-10.${form}: and the door's OTHER guarded insert still wrote its own form, so the continue did not skip it`);
  });

  test(`ci-10b.${form} · the RE-READ is load-bearing at ${where}: at REPEATABLE READ the backstop CANNOT see the winner's row and must RE-RAISE`, async (t) => {
    if (gate(t)) return;
    // ci-10 proves the handler CONTINUES. It cannot prove the RE-READ, because under READ
    // COMMITTED the winner's row is visible and "continue unconditionally" reaches the same
    // answer. This cell makes the re-read the only thing between a correct refusal and a silent
    // continue: at REPEATABLE READ the 23505 still fires (unique enforcement is
    // snapshot-INDEPENDENT), but the handler's re-read runs against a snapshot taken BEFORE the
    // winner committed and comes back empty. Law 2 says that must fall through to the fail-closed
    // branch — a raw re-raise — never to an inferred "the row must be there".
    //
    // NOT a two-session interleave cell: the winner COMMITS before the loser's insert is
    // attempted, so nothing ever blocks and there is no lock to observe. The observable here is
    // the SNAPSHOT, which is why it needs no waitBlockedByOrThrow.
    const sc = await bankScaffold(`ci10b${form}`, String(1702 + i));
    const planted = sc[form];
    const client = world.clients.A2;
    const firm = world.firms.A;
    const t2 = await humanSession(world.users.alice);
    let outcome = null;
    try {
      await t2.c.query("begin isolation level repeatable read");
      // FORCE the snapshot now — REPEATABLE READ takes it at the first real query, not at BEGIN.
      await t2.c.query("select 1 from clara.clients limit 1");
      // Only NOW does the winner write and COMMIT, so its row is invisible to t2's snapshot.
      await rootQuery(
        `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
           values ($1,$2,'bank_account',$3,$4)`, [firm, client, planted, world.users.alice]);
      outcome = await t2.c.query(
        `select clara.add_bank_account(p_client => $1, p_coa_account_code => $2, p_bank_code => $3,
           p_account_number => $4, p_bank_name_display => 'CI10b Bank', p_op_key => $5) as r`,
        [client, sc.coaCode, sc.bankCode, sc.number, opk(`ci10b${form}`)])
        .then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, e }));
    } finally {
      await releaseSession(t2);
    }
    assert.equal(outcome.ok, false,
      `ci-10b.${form}: the backstop must NOT continue when its re-read comes back empty — a continue here would be the handler INFERRING the row exists from the 23505 alone (review law 2), which is exactly the bug this cell exists to catch`);
    // The exact SQLSTATE is secondary and deliberately not over-pinned: what is load-bearing is
    // that the call FAILED rather than continuing, and `ok === false` above is what the mutant
    // flips. A 23505 is the expected shape; a 40001 would mean this server serialises the
    // conflict instead, which is still a refusal and still fail-closed.
    assert.ok(["23505", "40001"].includes(outcome.e?.code),
      `ci-10b.${form}: expected the re-raised conflict (23505, or 40001 if this server serialises it) — got ${outcome.e?.code} — ${outcome.e?.message}`);
    if (outcome.e?.code === "23505") {
      assert.equal(outcome.e.constraint, INDEX,
        `ci-10b.${form}: the re-raise must carry THIS index's name, untouched (got ${outcome.e.constraint ?? "(none)"})`);
    }
  });
});

// ---------------------------------------------------------------------------------------
// D · NARROWNESS, STRUCTURE, AND THE PRE-FLIGHT'S POSITIVE CONTROL
// ---------------------------------------------------------------------------------------

test("ci-9 · NARROWNESS: a unique_violation that is NOT this index's escapes the handler as a RAW 23505", async (t) => {
  if (gate(t)) return;
  const v = val("ssm");
  // A partial unique index scoped to exactly this probe's value, so creating it can never
  // collide with data already on the table — and so it cannot outlive the rollback below.
  let err = null;
  let created = false;
  const c = await getPool().connect();
  try {
    for (let i = 0; ; i++) {
      try {
        await c.query("begin");
        await c.query("set local lock_timeout = '4s'");
        await c.query(
          `create unique index ci9_foreign_uq on clara.client_identifiers (value_normalized)
             where value_normalized = '${v}'`);
        created = true;
        break;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        if ((e.code === "55P03" || e.code === "40P01") && i < 6) { await new Promise((r) => setTimeout(r, 120)); continue; }
        throw e;
      }
    }
    // Client A1 takes the value first.
    await c.query(
      `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
         values ($1,$2,'ssm',$3,$4)`, [world.firms.A, world.clients.A1, v, world.users.alice]);
    // Now the DOOR writes the same value for a DIFFERENT client: 裁-41's index is NOT violated
    // (client_id differs, and ci-3 proves that case is admitted), but ci9_foreign_uq IS.
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: world.users.bob, role: "authenticated" })]);
    try {
      await c.query("select clara.add_client_identifier($1,'ssm',$2,$3)", [world.clients.A2, v, opk("ci9")]);
    } catch (e) { err = e; }
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
  assert.ok(created, "ci-9: the foreign index must actually have been created, or this cell proves nothing");
  assert.ok(err, "ci-9: the foreign unique index must still refuse the write");
  assert.equal(err.code, "23505",
    `ci-9: a FOREIGN unique_violation must escape the narrow handler RAW, never relabelled as the typed CLR10 (got ${err.code} — ${err.message})`);
  assert.equal(err.constraint, "ci9_foreign_uq",
    `ci-9: and it must still name the constraint that actually fired (got ${err.constraint ?? "(none)"})`);
});

FORMS.forEach(([form, where], i) => {
  test(`ci-9b.${form} · NO-SWALLOW, second writer: a FOREIGN unique_violation at ${where} escapes _add_bank_account_core RAW, carrying the constraint that fired`, async (t) => {
    if (gate(t)) return;
    // WHAT THIS CELL PROVES, stated exactly, because an earlier draft of it over-claimed. It
    // proves the bank core does NOT SWALLOW a foreign unique_violation: the call fails, raw, with
    // the constraint that actually fired. That is the property that matters at this door — its
    // handler has a CONTINUE branch, and a continue on a foreign violation would carry on past a
    // write that never happened.
    //
    // WHAT IT DOES NOT PROVE, and cannot: it is not a mutant-kill for the narrow guard here.
    // Delete `if v_con is distinct from ... then raise; end if` from this handler and this cell
    // STILL PASSES — the re-read below it filters on `client_id = p_client`, this cell plants the
    // colliding row on a DIFFERENT client, so the re-read finds nothing, falls to the bare
    // `raise`, and re-raises the identical 23505 with the identical constraint name. The guard
    // and the re-read are not separable in this writer (see the migration's own note beside the
    // handler: their predicates coincide). The narrow guard's standing coverage here is STATIC —
    // ci-12's `guards` count going 2 -> 1 — not behavioural, and the PR's re-verify recipe says
    // so rather than promising a mutant kill it will not get. ci-9 IS the behavioural kill, for
    // add_client_identifier, which has no re-read to mask it.
    const sc = await bankScaffold(`ci9b${form}`, String(1704 + i));
    const planted = sc[form];
    const idx = `ci9b_foreign_uq_${form}`;
    const client = world.clients.A2;
    let err = null;
    let created = false;
    const c = await getPool().connect();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await c.query("begin");
          await c.query("set local lock_timeout = '4s'");
          // Scoped to exactly this probe's value, so creating it cannot collide with data already
          // on the table, and it dies with the rollback below.
          await c.query(
            `create unique index ${idx} on clara.client_identifiers (value_normalized)
               where value_normalized = '${planted}'`);
          created = true;
          break;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          if ((e.code === "55P03" || e.code === "40P01") && attempt < 6) { await new Promise((r) => setTimeout(r, 120)); continue; }
          throw e;
        }
      }
      // A DIFFERENT client takes the value first: 裁-41's index is NOT violated by what follows
      // (ci-3 proves that case is admitted), but the foreign index is.
      await c.query(
        `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
           values ($1,$2,'bank_account',$3,$4)`,
        [world.firms.A, world.clients.A1, planted, world.users.alice]);
      await c.query(`set role ${ROLES.authenticated}`);
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: world.users.alice, role: "authenticated" })]);
      try {
        await c.query(
          `select clara.add_bank_account(p_client => $1, p_coa_account_code => $2, p_bank_code => $3,
             p_account_number => $4, p_bank_name_display => 'CI9b Bank', p_op_key => $5)`,
          [client, sc.coaCode, sc.bankCode, sc.number, opk(`ci9b${form}`)]);
      } catch (e) { err = e; }
    } finally {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
    assert.ok(created, `ci-9b.${form}: the foreign index must actually have been created, or this cell proves nothing`);
    assert.ok(err, `ci-9b.${form}: the foreign unique index must still refuse the write`);
    assert.equal(err.code, "23505",
      `ci-9b.${form}: a FOREIGN unique_violation must escape the handler RAW — never swallowed by its continue branch, never relabelled (got ${err.code} — ${err.message})`);
    assert.equal(err.constraint, idx,
      `ci-9b.${form}: and it must still name the constraint that actually fired (got ${err.constraint ?? "(none)"})`);
  });
});

test("ci-11 · the PRE-FLIGHT's positive control: the migration's own duplicate census finds and NAMES a duplicate group", async (t) => {
  if (gate(t)) return;
  // The live table can no longer hold a duplicate — that is the point of the wall — so the
  // census EXPRESSION is exercised against a copy carrying one. The real end-to-end refusal (a
  // planted duplicate at the 0148 frontier stopping the migration) is a rig ceremony, recorded
  // in the PR body; this cell is the regression guard that keeps the expression honest.
  const dup = randomUUID();
  const r = await rootQuery(
    `with copy as (
       select client_id, kind, value_normalized from clara.client_identifiers
       union all select $1::uuid, 'tin', 'ci11probe'
       union all select $1::uuid, 'tin', 'ci11probe'
       union all select $1::uuid, 'ssm', 'ci11singleton')
     select count(*)::int as dups,
            coalesce(string_agg(format('(client=%s kind=%s value=%s n=%s)', client_id, kind, value_normalized, n), ', '), '') as list
       from (select client_id, kind, value_normalized, count(*) as n
               from copy group by client_id, kind, value_normalized having count(*) > 1) g`,
    [dup]);
  assert.equal(r.rows[0].dups, 1, "ci-11: exactly the planted group is found — the singleton is not swept in with it");
  assert.match(r.rows[0].list, new RegExp(`client=${dup}`), "ci-11: the refusal NAMES the client");
  assert.match(r.rows[0].list, /kind=tin/, "ci-11: ...and the kind");
  assert.match(r.rows[0].list, /value=ci11probe/, "ci-11: ...and the value");
  assert.match(r.rows[0].list, /n=2/, "ci-11: ...and how many rows are in the group");
});

test("ci-12 · the wall's STRUCTURE, read by property, and the closed-world writer census", async (t) => {
  if (gate(t)) return;
  const ix = (await rootQuery(
    `select i.indisunique, i.indisvalid, i.indisready, i.indislive, i.indnullsnotdistinct,
            pg_get_expr(i.indpred, i.indrelid) as pred,
            (select string_agg(a.attname, ',' order by k.ord)
               from unnest(i.indkey::smallint[]) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att) as cols
       from pg_index i where i.indexrelid = $1::regclass`, [`clara.${INDEX}`])).rows[0];
  assert.equal(ix.indisunique, true);
  assert.equal(ix.indisvalid, true);
  assert.equal(ix.indisready, true);
  assert.equal(ix.indislive, true);
  assert.equal(ix.cols, "client_id,kind,value_normalized", "the ruling's key, in the ruling's order");
  assert.equal(ix.pred, null, "TOTAL, not partial — a predicate would leave a silent hole");
  assert.equal(ix.indnullsnotdistinct, false,
    "inert by construction: all three key columns are NOT NULL, so NULLS NOT DISTINCT would only mislead a future reader");

  // All three key columns still NOT NULL — the premise the line above rests on.
  const notNull = await rootQuery(
    `select count(*)::int as n from pg_attribute
      where attrelid='clara.client_identifiers'::regclass and attnum>0 and not attisdropped
        and attname in ('client_id','kind','value_normalized') and attnotnull`);
  assert.equal(notNull.rows[0].n, 3);

  // The sibling-conflict read path is untouched.
  const match = (await rootQuery(
    "select indisunique from pg_index where indexrelid='clara.ix_client_identifiers_match'::regclass")).rows[0];
  assert.equal(match.indisunique, false,
    "ix_client_identifiers_match must stay NON-unique — promoting it would wall sibling clients out of a shared value");

  // CLOSED-WORLD: the same instrument the migration's own §0.8/§4(7) census uses. A writer added
  // later without the map would surface HERE, on every run, rather than as a raw 23505 in
  // production.
  // `maps` matches THE GUARD LINE, not the bare index name. Both bodies also mention the index in
  // a comment, so a bare-name probe would report true for a body that had lost its handler
  // entirely — the standing post-merge guard would then be satisfied by prose.
  const writers = await rootQuery(
    `select p.oid::regprocedure::text as sig,
            (position('get stacked diagnostics v_con = constraint_name' in p.prosrc) > 0
             and position('if v_con is distinct from ''' || $1 || ''' then raise; end if' in p.prosrc) > 0) as maps,
            (length(p.prosrc) - length(replace(p.prosrc, 'if v_con is distinct from ''' || $1 || ''' then raise; end if', '')))
              / length('if v_con is distinct from ''' || $1 || ''' then raise; end if') as guards
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.prosrc ~* '(insert[[:space:]]+into|merge[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(clara[[:space:]]*\\.[[:space:]]*)?client_identifiers([^A-Za-z0-9_]|$)'
      order by 1`, [INDEX]);
  assert.deepEqual(writers.rows.map((r) => r.sig).sort(), [
    "clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)",
    "clara.add_client_identifier(uuid,text,text,text)",
  ], "exactly two clara functions name a DML against clara.client_identifiers — a third needs the unique_violation map before it merges");
  assert.ok(writers.rows.every((r) => r.maps),
    `both writers must carry the NARROW re-raise guard for ${INDEX} — a comment naming the index does not count`);
  // One guard per guarded insert: add_client_identifier has one write, _add_bank_account_core has
  // two. A handler deleted from just ONE of the bank core's two inserts is caught here.
  const byName = new Map(writers.rows.map((r) => [r.sig, Number(r.guards)]));
  assert.equal(byName.get("clara.add_client_identifier(uuid,text,text,text)"), 1);
  assert.equal(byName.get("clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)"), 2,
    "_add_bank_account_core guards BOTH of its client_identifiers inserts, not just the first");
});
