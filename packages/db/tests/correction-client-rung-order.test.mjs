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
//
// WHAT THIS FILE DELIBERATELY DOES NOT RE-TEST (AC4, "every existing refusal is unchanged; name
// the battery"). 0238 reorders two lock acquisitions and changes nothing else, so the door's
// refusals are proved unchanged by the batteries that already own them, re-run against the recut
// body rather than duplicated here -- and by 0238's own tail, which counts fifteen `raise` sites
// and requires all fifteen 0125 messages to still be present:
//
//   * `x42-s5c-awcc.test.mjs`       -- the door's own battery (the house legal date, the mirror)
//   * `x37-wave-c-a-subledger.test.mjs` -- 0037's lock-order body pin + the allocation refusal
//   * `x38-wave-c-b-match.test.mjs` / `x38-wave-c-b-bank.test.mjs` -- the bank-match refusals
//   * `x27-filings-lock-order.test.mjs` -- 0027's documents-before-document_filings order
//   * `s6-locks.test.mjs` / `s6-tasks.test.mjs` / `s6-schema.test.mjs` -- the correction
//     schedules, the coding-task insertion, the grant surface
//   * `f-a7-alpha.test.mjs` / `f-a7-beta-filing-verb.test.mjs` -- 0125's judgement arm
//   * `x42-r10-o3.test.mjs` / `x42-r9-mirror.test.mjs` / `x42-adj-period-double.test.mjs` /
//     `x42b0-r8-tails.test.mjs` / `f-a2-grants.test.mjs` /
//     `subledger-hook-caller-roster.test.mjs` -- the censuses that name this door

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

// ===========================================================================
// AC2 -- the catalogue-derived census. A claim about EVERY door, which no dynamic schedule can
// make. Derived INDEPENDENTLY of migration 0238's own tail: 0238 uses PostgreSQL regexes over a
// comment-stripped body; this reads the same catalog into JavaScript and splits it into
// statements with parenthesis-depth tracking, so a `clara.clients` reference inside a CTE of a
// statement whose locking clause belongs to another table is not counted. The two detectors
// agreed on the same eleven bodies and the same single pre-0238 violator, measured before the
// migration was written.
// ===========================================================================

/** Strip SQL line comments and block comments, preserving offsets (blanks, not deletes), and
 *  leaving string literals alone -- a `--` inside a quoted string is not a comment. */
function stripComments(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "-" && s[i + 1] === "-") {
      while (i < s.length && s[i] !== "\n") { out += " "; i += 1; }
    } else if (s[i] === "/" && s[i + 1] === "*") {
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) { out += " "; i += 1; }
      out += "  "; i += 2;
    } else if (s[i] === "'") {
      out += s[i]; i += 1;
      while (i < s.length) {
        out += s[i];
        if (s[i] === "'" && s[i + 1] === "'") { out += s[i + 1]; i += 2; continue; }
        if (s[i] === "'") { i += 1; break; }
        i += 1;
      }
    } else { out += s[i]; i += 1; }
  }
  return out;
}

const ROW_LOCK = /\bfor\s+(update|no\s+key\s+update|share|key\s+share)\b/gi;
const CLIENTS = /clara\.clients\b/g;
const CLIENTS_WRITE = /\b(update|delete\s+from)\s+clara\.clients\b/gi;

/**
 * Where a body FIRST acquires a `clara.clients` ROW, and where it FIRST takes the client rung.
 * A client-row acquisition is either a statement that names `clara.clients` at parenthesis depth
 * 0 and carries a locking clause at depth 0, or an UPDATE/DELETE of the table. Returns
 * `{ rungAt, rowAt }`, each -1 when absent.
 */
function ladder(prosrcRaw) {
  const src = stripComments(prosrcRaw);
  const depth = new Array(src.length).fill(0);
  let d = 0;
  let inStr = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'") inStr = !inStr;
    if (!inStr) { if (ch === "(") d += 1; else if (ch === ")") d = Math.max(0, d - 1); }
    depth[i] = d;
  }
  const bounds = [0];
  inStr = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "'") inStr = !inStr;
    if (!inStr && ch === ";" && depth[i] === 0) bounds.push(i + 1);
  }
  bounds.push(src.length);
  let rowAt = -1;
  for (let b = 0; b < bounds.length - 1 && rowAt < 0; b += 1) {
    const start = bounds[b];
    const stmt = src.slice(start, bounds[b + 1]);
    const at = (re) => {
      re.lastIndex = 0;
      let m = re.exec(stmt);
      while (m !== null) {
        if (depth[start + m.index] === 0) return start + m.index;
        m = re.exec(stmt);
      }
      return -1;
    };
    const write = at(CLIENTS_WRITE);
    if (write >= 0) { rowAt = write; break; }
    const lock = at(ROW_LOCK);
    const cl = at(CLIENTS);
    if (lock >= 0 && cl >= 0) rowAt = cl;
  }
  return { rungAt: src.indexOf(`pg_advisory_xact_lock(${CLIENT_RUNG}`), rowAt };
}

/** The eleven live bodies that acquire a `clara.clients` row, measured on this rig at 237
 *  migrations (before 0238 was written) and again at 238. Pinned so an empty violator set means
 *  "nothing inverts", never "the detector stopped detecting". */
const CLIENT_ROW_BODIES = [
  "_publish_wiki_page_version_core",
  "approve_wrong_client_correction",
  "bootstrap_client_plan",
  "cancel_client_onboarding",
  "commit_client_onboarding",
  "mark_wiki_citations_stale",
  "retire_document_filing",
  "retire_wiki_page",
  "set_client_fy_end",
  "settle_client_onboarding_facts",
  "wake_reattribute_document",
];

async function census() {
  const r = await rootQuery(
    `select p.proname::text as fn, p.prosrc
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
      order by p.proname`,
  );
  const rows = [];
  for (const row of r.rows) {
    const l = ladder(row.prosrc);
    if (l.rowAt >= 0) rows.push({ fn: row.fn, ...l });
  }
  return rows;
}

test("cr.2 catalogue census: no clara door takes a clara.clients ROW before the client rung", async (t) => {
  if (unready(t)) return;
  const rows = await census();
  const names = rows.map((r) => r.fn);
  for (const fn of CLIENT_ROW_BODIES) {
    assert.ok(names.includes(fn),
      `the census no longer sees clara.${fn} acquiring a clara.clients row -- the detector has `
      + "stopped detecting, so an empty violator set would mean nothing");
  }
  const violators = rows
    .filter((r) => r.rungAt >= 0 && r.rowAt < r.rungAt)
    .map((r) => `${r.fn} (row@${r.rowAt} before rung@${r.rungAt})`);
  assert.deepEqual(violators, [],
    `a door still takes a clara.clients row before the client rung ${CLIENT_RUNG}`);
  noteLane(`cr.2 censused ${rows.length} bodies acquiring a clara.clients row, 0 violators`);
});

test("cr.3 the door itself is IN that census, on the right side of it, with one rung on the source client", async (t) => {
  if (unready(t)) return;
  const rows = await census();
  const door = rows.find((r) => r.fn === "approve_wrong_client_correction");
  assert.ok(door, "clara.approve_wrong_client_correction must still acquire a clara.clients row -- "
    + "0238 moved that lock, it did not remove it; removing it would drop the serializer against "
    + "wiki publication on the source client (0019 SS1)");
  assert.ok(door.rungAt >= 0, "the door still takes the client rung");
  assert.ok(door.rungAt < door.rowAt,
    `the door's rung (@${door.rungAt}) must precede its client row (@${door.rowAt})`);

  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure",
  )).rows[0].prosrc;
  assert.equal(src.split(`pg_advisory_xact_lock(${CLIENT_RUNG}`).length - 1, 1,
    "the client rung is acquired exactly once -- for the client it covers, not per item");
  assert.ok(src.includes(`pg_advisory_xact_lock(${CLIENT_RUNG},hashtext(x.from_client::text))`),
    "the one acquisition names the correction's SOURCE client (x.from_client)");
  assert.ok(!src.includes(`pg_advisory_xact_lock(${CLIENT_RUNG},hashtext(o.client_id::text))`),
    "the per-item acquisition on o.client_id is gone, not merely duplicated");
  assert.equal(src.split("pg_advisory_xact_lock(203005002").length - 1, 1,
    "the FIRM rung is still taken exactly once -- no rung was added or renumbered");
});

// ===========================================================================
// AC3 -- the source client row lock is still the serializer against PUBLICATION, and the source
// filing is still retired while the door holds it. `clara.record_wiki_source_ingest` (0017:2228,
// granted to clara_runtime only) is the deterministic publication path: it delegates to
// `clara._publish_wiki_page_version_core`, whose FIRST row lock is the `clara.clients` row of the
// client it publishes for -- so a block there is unambiguously a block on that row, not on a
// wiki relation.
// ===========================================================================

const WIKI_SQL =
  "select clara.record_wiki_source_ingest(p_client => $1, p_document => $2, p_note => $3,"
  + " p_op_key => $4) as r";

const GUARD = "set local statement_timeout = '30s'";

// `p_note` is NULL in every publication call below, on purpose: a later migration made the
// deterministic ingest path refuse a caller-supplied note (CLR10 `source_note_not_permitted`), so
// the page's content is derived from the document alone. Measured, not assumed -- the first
// version of this cell passed a note, and the call refused BEFORE it ever reached the client row,
// which would have made the block it proves vacuous.

/**
 * The door holds its transaction open; a publication on `client` for `document` is fired and
 * must block. While it is blocked we read ITS OWN lock set out of `pg_locks`, so the claim is
 * "blocked ON the clara.clients row", not merely "blocked on something the door holds" -- the
 * door also holds a `clara.documents` row, and a publication that cited the same document would
 * queue there instead, which would prove nothing about the client row.
 */
async function doorHoldsThenPublish({ jwtSub, correction, planHash, client, document }) {
  const pool = getPool();
  const cDoor = await pool.connect();
  const cPub = await pool.connect();
  const out = { door: null, publisher: null, provedBlocked: false, waitLocks: [] };
  try {
    const doorPid = (await cDoor.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cDoor.query(`set role ${ROLES.authenticated}`);
    await cDoor.query("begin");
    await cDoor.query(GUARD);
    await cDoor.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: jwtSub, role: "authenticated" })]);
    out.door = { ok: true, receipt: (await cDoor.query(DOOR_SQL,
      [correction, planHash, "#914 rig attest", opk("c914w")])).rows[0].r };

    const pubPid = (await cPub.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cPub.query(`set role ${ROLES.runtime}`);
    await cPub.query("begin");
    await cPub.query(GUARD);
    const pPub = Promise.resolve()
      .then(() => cPub.query(WIKI_SQL, [client, document, null, opk("c914wiki")]))
      .then((r) => { out.publisher = { ok: true, receipt: r.rows[0].r }; })
      .catch((e) => { out.publisher = { ok: false, code: e.code, message: e.message }; });

    out.provedBlocked = await waitBlockedBy(pubPid, doorPid);
    if (out.provedBlocked) {
      out.waitLocks = (await rootQuery(
        `select l.locktype, coalesce(l.relation::regclass::text,'-') as rel, l.mode, l.granted
           from pg_locks l where l.pid = $1 order by l.granted, l.locktype`, [pubPid])).rows;
    }
    await cDoor.query("commit").catch(() => cDoor.query("rollback").catch(() => {}));
    await pPub;
    await cPub.query("commit").catch(() => cPub.query("rollback").catch(() => {}));
  } finally {
    await release([cDoor, cPub]);
  }
  return out;
}

/**
 * The reverse order, and the one that can tell the DELIBERATE serializer from an incidental one.
 *
 * A publication holds the source client's row; the door is fired and must block. It blocks either
 * way -- even with no `clara.clients ... for update` at all, the door's own inserts carry foreign
 * keys to `clara.clients` and would take FOR KEY SHARE on that row, which conflicts with the
 * publisher's FOR UPDATE. What distinguishes the two is WHERE it stops: with 0019 SS1's row lock
 * in place the door is stopped BEFORE its item loop writes anything, so it holds no
 * RowExclusiveLock on `clara.journal_entries`; without it, the door has already inserted the
 * reversal mirror by the time an FK lock stops it, and that write lock is held. So the cell reads
 * the BLOCKED door's own lock modes.
 */
async function publishHoldsThenDoor({ jwtSub, correction, planHash, client, document }) {
  const pool = getPool();
  const cPub = await pool.connect();
  const cDoor = await pool.connect();
  const out = { publisher: null, door: null, provedBlocked: false, doorLocks: [] };
  try {
    const pubPid = (await cPub.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cPub.query(`set role ${ROLES.runtime}`);
    await cPub.query("begin");
    await cPub.query(GUARD);
    out.publisher = { ok: true, receipt: (await cPub.query(WIKI_SQL,
      [client, document, null, opk("c914wiki2")])).rows[0].r };

    const doorPid = (await cDoor.query("select pg_backend_pid() as pid")).rows[0].pid;
    await cDoor.query(`set role ${ROLES.authenticated}`);
    await cDoor.query("begin");
    await cDoor.query(GUARD);
    await cDoor.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: jwtSub, role: "authenticated" })]);
    const pDoor = Promise.resolve()
      .then(() => cDoor.query(DOOR_SQL, [correction, planHash, "#914 rig attest", opk("c914w2")]))
      .then((r) => { out.door = { ok: true, receipt: r.rows[0].r }; })
      .catch((e) => { out.door = { ok: false, code: e.code, message: e.message }; });

    out.provedBlocked = await waitBlockedBy(doorPid, pubPid);
    if (out.provedBlocked) {
      out.doorLocks = (await rootQuery(
        `select l.mode, l.granted from pg_locks l
          where l.pid = $1 and l.relation = 'clara.journal_entries'::regclass
          order by l.mode`, [doorPid])).rows;
    }
    await cPub.query("commit").catch(() => cPub.query("rollback").catch(() => {}));
    await pDoor;
    await cDoor.query("commit").catch(() => cDoor.query("rollback").catch(() => {}));
  } finally {
    await release([cPub, cDoor]);
  }
  return out;
}

test("cr.4 the door still serialises against publication on the SOURCE client, in both directions, and retires the source filing while holding that row", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // A SECOND document, filed to the SAME source client, with NO entry on it and no part in the
  // correction. Publishing THIS one shares exactly one object with the correction -- the source
  // client -- so a block cannot be blamed on the `clara.documents` row the door also locks.
  const sideDoc = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const sideDoc2 = await seedCitedDocument(users.alice, { firm, client: clients.A1 });

  // Leg A -- the DOOR holds the source client's row; publication on that client BLOCKS, and the
  // lock it is queued behind is a clara.clients lock, read out of pg_locks while it waits.
  const planA = await proposeOne();
  const legA = await doorHoldsThenPublish({
    jwtSub: users.bob, correction: planA.correction, planHash: planA.planHash,
    client: clients.A1, document: sideDoc.documentId,
  });
  assert.ok(legA.provedBlocked,
    "wiki publication on the SOURCE client must BLOCK on the row the correction holds "
    + "(pg_blocking_pids) -- that row lock is the 0019 SS1 serializer, and 0238 moved it, it did "
    + `not drop it. publication outcome: ${JSON.stringify(legA.publisher)}`);
  assert.ok(legA.waitLocks.some((l) => l.rel === "clara.clients"),
    "the blocked publisher must be queued on a clara.clients lock specifically -- its whole "
    + `overlap with the correction is that one client. pg_locks for the waiter: `
    + JSON.stringify(legA.waitLocks));
  assert.notEqual(legA.publisher?.code, "40P01", "no deadlock in the door-first schedule");
  assert.equal(legA.door.receipt.status, "completed", "the door returned its ordinary receipt");
  assert.equal(legA.publisher.ok, true,
    `publication then committed once the correction released the row: ${legA.publisher.message ?? ""}`);

  // ... and the retirement it made is the one the waiting publisher was waiting behind.
  const filing = (await rootQuery(
    `select retired_at, correction_id from clara.document_filings
      where document_id=$1 and client_id=$2 order by filed_at limit 1`,
    [planA.document, clients.A1],
  )).rows[0];
  assert.ok(filing.retired_at !== null,
    "the SOURCE filing is retired by the transaction that held the source client's row");
  assert.equal(filing.correction_id, planA.correction,
    "the retirement names this correction");

  // Leg B -- the reverse order: publication on the SIDE document holds the source client's row,
  // and the correction BLOCKS on it. Neither direction deadlocks, because publication takes no
  // advisory rung at all (measured: it is not among the rung-bearing bodies of cr.2's census),
  // so the pair meets only on the client row.
  const planB = await proposeOne();
  const legB = await publishHoldsThenDoor({
    jwtSub: users.bob, correction: planB.correction, planHash: planB.planHash,
    client: clients.A1, document: sideDoc2.documentId,
  });
  assert.ok(legB.provedBlocked,
    "the correction must BLOCK on the client row a publication holds -- the serialization is "
    + "symmetric, which is what makes it a serializer rather than a coincidence");
  assert.ok(legB.doorLocks.some((l) => l.mode === "RowShareLock"),
    "while blocked, the correction must already hold its `for update of je` RowShareLock on "
    + `clara.journal_entries. Measured locks: ${JSON.stringify(legB.doorLocks)}`);
  assert.ok(!legB.doorLocks.some((l) => l.mode === "RowExclusiveLock"),
    "while blocked, the correction must hold NO RowExclusiveLock on clara.journal_entries -- it "
    + "is stopped by 0019 SS1's deliberate `clara.clients ... for update` BEFORE its item loop "
    + "writes anything. A RowExclusiveLock means the reversal mirror was already inserted and "
    + "the door was stopped later by an incidental foreign-key lock instead, which is exactly "
    + "what happens when that deliberate lock is gone. Measured locks: "
    + JSON.stringify(legB.doorLocks));
  assert.notEqual(legB.door?.code, "40P01", "no deadlock in the publication-first schedule");
  assert.equal(legB.door.ok, true, `the correction then completed: ${legB.door.message ?? ""}`);
  assert.equal(legB.door.receipt.status, "completed", "and returned its ordinary receipt");
  noteLane("cr.4 both directions blocked and committed; source filing retired under the row lock");
});

test("cr.5 the source client's row lock is taken BEFORE the source filing is retired, in the live body", async (t) => {
  if (unready(t)) return;
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.approve_wrong_client_correction(uuid,text,text,text)'::regprocedure",
  )).rows[0].prosrc;
  // `ladder()` finds a client-row ACQUISITION -- the statement must carry a locking clause, so an
  // unlocked read of clara.clients at the same place does not satisfy this cell.
  const { rowAt } = ladder(src);
  const retireAt = src.indexOf("update clara.document_filings set retired_at=now()");
  assert.ok(rowAt >= 0, "the source client's row LOCK is still in the body");
  assert.ok(retireAt >= 0, "the source filing retirement is still in the body");
  assert.ok(rowAt < retireAt,
    `the client row lock (@${rowAt}) must be acquired before the source filing is retired `
    + `(@${retireAt}); a row lock is held to commit, so this order is what "retired under that `
    + 'lock" means');
});
