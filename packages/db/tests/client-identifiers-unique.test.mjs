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
//   * ci-9 is the NARROWNESS cell: a unique_violation that is NOT this index's must escape the
//     handler untouched as a raw 23505. Relabel every unique_violation in either writer (drop
//     the `if v_con is distinct from ... then raise` line) and ONLY this cell reds — which is
//     exactly why it exists.
//   * ci-8 and ci-10 are the two-session cells. They PROVE the interleave with
//     waitBlockedByOrThrow (pg_blocking_pids), never a sleep. Drop the index and neither side
//     ever blocks, so both red.
//   * ci-10 additionally pins the asymmetry: _add_bank_account_core's handler CONTINUES after
//     re-reading the row (its two writes mean "ensure present", never "mint"), where
//     add_client_identifier REFUSES. A handler copied blindly from one to the other reds here.
//   * ci-11 is the pre-flight's positive control INSIDE the battery. The real refusal cannot be
//     provoked against a live database once the index exists (that proof is a rig ceremony, and
//     it is recorded in the PR body); what is regression-guarded here is that the census
//     EXPRESSION the migration refuses on actually finds and names a duplicate group.

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

test("ci-10 · _add_bank_account_core's backstop CONTINUES: a concurrently-committed identifier row does not fail the bank-account registration", async (t) => {
  if (gate(t)) return;
  // A digits-only account number, so the door's house form and digits form are the SAME string
  // and one planted row covers both of its guarded inserts.
  const number = `7${randomUUID().replace(/\D/g, "").padEnd(9, "1").slice(0, 9)}`;
  const client = world.clients.A2;
  const firm = world.firms.A;
  const coaCode = `1${String(700 + Math.floor(Math.random() * 280))}`;
  await upsertAccount(world.users.alice,
    { client, code: coaCode, name: `ci10 bank ${coaCode}`, type: "asset", opKey: opk("ci10coa") });
  const inst = (await rootQuery("select code from clara.bank_institutions where active order by code limit 1")).rows[0];
  assert.ok(inst, "ci-10: the chain must carry at least one active bank institution");

  const t1 = { c: await getPool().connect(), pid: null };
  t1.pid = (await t1.c.query("select pg_backend_pid() as pid")).rows[0].pid;
  const t2 = await humanSession(world.users.alice);
  let outcome = null;
  try {
    // T1 commits NOTHING yet: the identifier row exists only inside its open transaction, so
    // T2's `if not exists` guard genuinely sees nothing and its INSERT reaches the index.
    await t1.c.query("begin");
    await t1.c.query(
      `insert into clara.client_identifiers(firm_id,client_id,kind,value_normalized,added_by)
         values ($1,$2,'bank_account',$3,$4)`, [firm, client, number, world.users.alice]);

    const p = t2.c.query(
      `select clara.add_bank_account(p_client => $1, p_coa_account_code => $2, p_bank_code => $3,
         p_account_number => $4, p_bank_name_display => 'CI10 Bank', p_op_key => $5) as r`,
      [client, coaCode, inst.code, number, opk("ci10")]).then((r) => ({ ok: true, r })).catch((e) => ({ ok: false, e }));
    await waitBlockedByOrThrow(t2.pid, t1.pid, { what: `the ${INDEX} entry` });

    await t1.c.query("commit");
    outcome = await p;
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
  assert.ok(outcome.ok,
    `ci-10: the bank-account registration must SURVIVE the identifier race — the backstop re-reads the row and continues, it does not refuse (got ${outcome.e?.code} — ${outcome.e?.message})`);
  assert.ok(outcome.r.rows[0].r.bank_account_id, "ci-10: and it really registered the account");
  assert.equal(await countRows(client, "bank_account", number), 1,
    "ci-10: exactly one identifier row — T1's, kept; the loser wrote none and raised none");
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
  const writers = await rootQuery(
    `select p.oid::regprocedure::text as sig, (p.prosrc ~ $1) as maps
       from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.prosrc ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(clara[[:space:]]*\\.[[:space:]]*)?client_identifiers([^A-Za-z0-9_]|$)'
      order by 1`, [INDEX]);
  assert.deepEqual(writers.rows.map((r) => r.sig).sort(), [
    "clara._add_bank_account_core(jsonb,uuid,text,text,text,text,uuid,text)",
    "clara.add_client_identifier(uuid,text,text,text)",
  ], "exactly two functions write clara.client_identifiers — a third needs the unique_violation map before it merges");
  assert.ok(writers.rows.every((r) => r.maps), `both writers must name ${INDEX} in a narrow handler`);
});
