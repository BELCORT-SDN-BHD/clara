// #912 — THE ROLE THE ACTOR HELD AT THE INSTANT OF A GOVERNED ACT.
// Migration: 0243_audit_actor_role.sql. Every cell gates on the LIVE CATALOG, never on the
// migration number (knowledge-fixtures.mjs `auditActorRoleCohortApplied`), the 0240/0241/0242
// idiom this lane has already used three times.
//
// THE SHAPE THE OWNER RULED (issue #912, ruling comment 2026-09-18): the AUDIT-ROW shape, not a
// membership-history relation. The role is resolved at write time; `clara.audit_log` carries it;
// `clara.list_firm_knowledge`'s promotion block cites it beside the promoter's CURRENT role; a row
// written before the column existed reads as unknown, and NOTHING is back-dated.
//
// WHERE IT IS RESOLVED. The ruling names `clara._audit`, the sole writer of the table. That body
// CANNOT be recut -- it is ordinal 10 of the frozen `metric_input_snapshot` v1 producer closure
// (`clara.metric_input_producer_version_members` pins its `pg_get_functiondef` sha,
// `clara.verify_metric_input_producer_freeze()` raises on drift, and scripts/migrate.mjs's
// FREEZE_GUARDS refuse any migration that moves it). 0243 therefore stamps the column from a
// BEFORE INSERT row trigger on `clara.audit_log` itself, which is WIDER than the recut would have
// been: the stamp is on the table's write path, so every writer inherits it, not only one
// function. See 0243's own header and packages/db/README.md's "#912" section.
//
// THE SEAMS. Every cell addresses a PUBLIC interface:
//   · a governed door (`clara.capture_knowledge`, `clara.create_client`) -> the committed
//     `clara.audit_log` row it leaves behind, read back with `rootQuery` (the rig's "READ BACK a
//     table" idiom, never as the caller of the act);
//   · `clara.audit_log`'s own write path, for the two claims that are ABOUT that path rather
//     than about any door: history being re-loaded is not an act (ar.02), and an actor with no
//     active membership is 'none' rather than unknown (ar.05);
//   · `clara.list_firm_knowledge()` -- the firm register read -- through `humanQuery` at the
//     least privilege that should succeed;
//   · the catalog itself, for the census #912's ruling asks for ("every governed door inherits
//     the column with NO per-door change").
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AGENT_USER_ID, ROLES, assertRaises, endPool, getPool, humanQuery, opk, roleQuery, rootQuery } from "./rig-fixtures.mjs";
import { auditActorRoleCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 7;
let live = false;
let executed = 0;

before(async () => { live = await auditActorRoleCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_AUDIT_ACTOR_ROLE_0243 === "1") {
    console.warn("SKIP audit-actor-role: the 0243 cohort is not applied (explicit pre-integration run).");
    t.skip("audit actor-role cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0243 audit actor-role cohort is required for a focused run: apply 0243_audit_actor_role.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// --------------------------------------------------------------------------------------------
// Door wrapper. Named args, the same shape knowledge-firm-defaults.test.mjs uses so the two
// batteries cannot drift into two dialects.
// --------------------------------------------------------------------------------------------
const CAPTURE = `select clara.capture_knowledge(
  p_knowledge_key => $1, p_value => $2::jsonb, p_basis => $3, p_op_key => $4,
  p_scope_kind => $5, p_client => $6, p_source_kind => $7) as r`;

function capture(sub, o) {
  return humanQuery(sub, CAPTURE, [
    o.key, JSON.stringify(o.value), o.basis ?? "rig basis", o.opKey ?? opk("p912"),
    o.scope ?? "client", o.client ?? null, o.sourceKind ?? "user_statement",
  ]).then((r) => r.rows[0].r);
}

const listFirmKnowledge = (sub) =>
  humanQuery(sub, "select clara.list_firm_knowledge() as r", []).then((r) => r.rows[0].r);

/**
 * EVERY function in this estate that writes `clara.audit_log` itself, read off the catalog.
 *
 * The census is the wall the ruling's "every governed door inherits the column with no per-door
 * change" actually rests on, so it must not be a SPELLING. Every definer body here carries
 * `set search_path = clara, pg_temp`, so `insert into audit_log(...)` is as lawful as
 * `INSERT INTO clara.audit_log (...)` or a line break after `into` -- and a census that matched
 * one exact lowercase, schema-qualified string would call a second writer "no writer at all".
 * Line comments are stripped first (`regexp_replace(..., '--.*', '', 'gn')`): without that, the
 * case-insensitive match reads the PROSE in clara.set_wake_source_enabled -- "never a direct
 * multi-row INSERT into audit_log" -- as a writer. `query` is whichever connection the caller
 * passes, so the CONTROL in ar.06 can show the census catching a real, uncommitted second writer.
 */
async function auditWriters(query = rootQuery) {
  const r = await query(
    `select ns.nspname || '.' || p.proname as f
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname not in ('pg_catalog', 'information_schema')
        and regexp_replace(p.prosrc, '--.*', '', 'gn')
            ~* 'insert[[:space:]]+into[[:space:]]+(clara[[:space:]]*[.][[:space:]]*)?audit_log'
      order by 1`);
  return r.rows.map((x) => x.f);
}

/**
 * Wait until some backend in THIS database is really parked on a lock, polled off pg_stat_activity
 * rather than slept on a guess. ar.07's whole claim depends on the door being admitted and then
 * BLOCKED with its audit write still ahead of it; if that never happens the cell must fail loudly
 * instead of quietly asserting nothing.
 */
async function awaitBlockedBackend(deadlineMs = 20000) {
  const started = Date.now();
  for (;;) {
    const r = await rootQuery(
      `select count(*)::int as n from pg_stat_activity
        where datname = current_database() and state = 'active' and wait_event_type = 'Lock'`);
    if (r.rows[0].n > 0) return;
    if (Date.now() - started > deadlineMs) {
      throw new Error("no backend ever parked on the lock -- ar.07's race did not set up, so the cell would assert nothing");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** The committed audit row a door left behind, READ BACK (never the caller of the act). */
function auditRowOf(firm, fn, actor) {
  return rootQuery(
    `select actor, actor_role, args ->> 'revision_id' as revision_id
       from clara.audit_log where firm_id = $1 and fn = $2 and actor = $3
      order by id desc limit 1`, [firm, fn, actor]).then((r) => r.rows[0]);
}

// =============================================================================================
// SEAM 1 — THE GOVERNED ACT'S OWN AUDIT ROW.
// =============================================================================================

cell("ar.01 a governed act records the role its actor held at write time -- the ACTOR's role, not a constant", async () => {
  const w = await knowledgeWorld("p912a1");

  // Two people at two DIFFERENT ranks walk through the SAME door. Expected values come from the
  // roster knowledgeWorld minted (an independent source of truth), never from re-reading what
  // clara._audit computed.
  await capture(w.bookkeeper, { key: "default_currency", client: w.clientA, value: "USD",
    basis: "the client invoices in dollars" });
  await capture(w.admin, { key: "default_currency", client: w.clientB, value: "SGD",
    basis: "the client invoices in Singapore dollars" });

  const byBookkeeper = await auditRowOf(w.firm, "capture_knowledge", w.bookkeeper);
  const byAdmin = await auditRowOf(w.firm, "capture_knowledge", w.admin);
  assert.equal(byBookkeeper.actor_role, "bookkeeper",
    "the act a bookkeeper committed must carry the bookkeeper rank it was committed under");
  assert.equal(byAdmin.actor_role, "admin",
    "the SAME door, walked by an admin, must carry admin -- the column is the actor's role, not the door's floor");
});

cell("ar.02 history is left alone -- a row arriving from the past is never handed a role, nothing can back-fill it later, and writing a fresh act moves no historical row", async () => {
  // WHAT THIS CELL CLAIMS, AND WHY IT IS NOT A ROW COUNT. 0243's own §A measured "every
  // pre-existing row stays NULL" inside the transaction that minted the column. That measurement
  // is about the MIGRATION; this cell is about the MECHANISM, and it must mean the same thing on
  // any database. An earlier cut asserted `nulls > 60000` -- true only of THIS rig, whose 66.9k
  // NULL rows are the batteries this lane ran between applying 0240 and applying 0243. On a
  // from-scratch chain 0243 lands before the seed, so the NULL population is in the hundreds and
  // that assertion would be red for a reason that has nothing to do with the mechanism. So the
  // claim here is RELATIVE and self-minted: whatever carries NULL before this cell runs still
  // carries NULL after a real act has been written through the armed stamp.
  const nullsBefore = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where actor_role is null")).rows[0].n;

  // (a) A ROW ARRIVING FROM THE PAST IS NOT AN ACT. scripts/restore.mjs replays a plain dump
  // through psql, whose COPY fires this same BEFORE INSERT trigger; a row that arrives carrying a
  // timestamp from before this transaction is history being re-loaded, and the database must not
  // invent a role for an act it never witnessed. Minted HERE rather than found in the log, so the
  // cell owns its own subject on any database.
  const w = await knowledgeWorld("p912a2");
  const history = (await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args, at)
     values ($1, $2, 'rig_912_replayed_history', '{}'::jsonb, now() - interval '400 days')
     returning id, actor_role`, [w.firm, w.admin])).rows[0];
  assert.equal(history.actor_role, null,
    "a row whose own timestamp predates this transaction is history being re-loaded, not an act -- it keeps its unknown");

  // (b) …AND NOTHING CAN EVER BACK-FILL IT. The claim that matters is not a snapshot but an
  // enforced property: clara.audit_log is append-only (0003), so a later editor cannot decide to
  // give history a role after the fact. Proved against the row this cell just minted, through the
  // table itself, as the OWNER of the table -- the highest privilege any migration or definer
  // body runs at.
  const refusal = await assertRaises("CLR08", () => roleQuery(ROLES.fnOwner,
    "update clara.audit_log set actor_role = 'owner' where id = $1", [history.id]),
  "back-filling a role onto a pre-mechanism audit row");
  assert.equal(refusal.message, "audit_log is append-only");

  // (c) THE CONTROL that proves the stamp was armed the whole time: the SAME actor, the same
  // table, a row that claims to be happening NOW, is stamped.
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args)
     values ($1, $2, 'rig_912_act_now', '{}'::jsonb)`, [w.firm, w.admin]);
  const now = (await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_act_now'",
    [w.firm])).rows[0];
  assert.equal(now.actor_role, "admin");

  // (d) …AND THE HISTORY DID NOT MOVE WHILE THAT HAPPENED. Exactly ONE row joined the NULL
  // population -- the one (a) minted -- so the armed stamp neither back-filled an old row nor
  // left the fresh act unstamped. This is the portable form of 0243 §A's "none back-filled".
  const nullsAfter = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where actor_role is null")).rows[0].n;
  assert.equal(nullsAfter, nullsBefore + 1,
    "the only audit row to join the unknown population is the one this cell replayed from the past -- no historical row may be given a guess, and no fresh act may be left unstamped");
});

// =============================================================================================
// SEAM 2 — THE FIRM REGISTER. `clara.list_firm_knowledge()`, through humanQuery at the least
// privilege that should succeed (viewer, the read's own floor).
// =============================================================================================

cell("ar.03 a promotion keeps the authority it actually ran under -- the register reports the role at the act beside the promoter's new, lower role", async () => {
  const w = await knowledgeWorld("p912a3");
  // A SECOND owner, so the firm never loses its last one: clara._tf_guard_last_owner (0003:415)
  // refuses to demote the last active non-agent owner, and the act under test is the DEMOTION.
  const second = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [second, "p912 second owner", `p912_second_${second.slice(0, 8)}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'owner','active')",
    [w.firm, second]);

  // THE ACT, at the authority it really had: an OWNER promotes the firm default.
  const promoted = await capture(w.owner, {
    key: "default_currency", scope: "firm", client: null, value: "MYR",
    basis: "Partner meeting 2026-09-20: ringgit presentation is the firm's default",
  });
  assert.equal(promoted.status, "captured");

  // THE DEMOTION, through the real governed door, by the other owner.
  const membership = (await rootQuery(
    "select id from clara.firm_memberships where firm_id = $1 and user_id = $2 and status = 'active'",
    [w.firm, w.owner])).rows[0].id;
  await humanQuery(second,
    "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3) as r",
    [membership, "bookkeeper", opk("p912demote")]);

  const entry = (await listFirmKnowledge(w.viewer)).records
    .find((x) => x.knowledge_key === "default_currency");
  assert.ok(entry, "the firm register did not return the promoted rule");
  // The three facts are three facts, and they disagree on purpose. Expected values come from the
  // roster this cell minted and from the door it walked, never from re-reading the register.
  assert.equal(entry.authority.promoter_role_at_act, "owner",
    "the register must report the role the promoter ACTUALLY held when the rule was recorded");
  assert.equal(entry.authority.promoter_role_now, "bookkeeper",
    "…beside their CURRENT role, which the demotion moved below the floor the act required");
  assert.equal(entry.authority.required_role, "admin",
    "…and the authority the door verified at the time is unchanged by either");
  assert.equal(entry.authority.promoter_active, true,
    "a demoted member is still an active member -- that is a different fact again");
});

cell("ar.04 a promotion the mechanism never saw says UNKNOWN -- and the register does not quietly substitute the role its promoter holds today", async () => {
  const w = await knowledgeWorld("p912a4");

  // A PROMOTION EXACTLY AS A PRE-#912 DATABASE HOLDS ONE: the revision and the audit row
  // `clara._knowledge_insert_revision` wrote beside it, both dated before the column existed.
  // Minted through root, the way this battery's whole world is minted -- and the audit row keeps
  // its NULL for a REAL reason, not because the fixture asked: the stamp refuses to invent a role
  // for a row arriving from the past (ar.02c). That is byte-for-byte the shape 0243 left the
  // ~66.9k rows already in this log.
  const revision = randomUUID();
  await rootQuery(
    `insert into clara.knowledge_records(
        id, record_id, revision_n, firm_id, scope_kind, knowledge_key, kind, value,
        source_kind, trust, basis, asserted_by, recorded_via, recorded_at,
        knowledge_version, revision_kind, state)
     values ($1, $1, 1, $2, 'firm', 'default_currency', 'assertion', '"MYR"'::jsonb,
        'user_statement', 'asserted', 'Partner meeting, recorded before Clara kept the role',
        $3, 'human_ui', now() - interval '400 days', 1, 'capture', 'live')`,
    [revision, w.firm, w.admin]);
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args, at)
     values ($1, $2, 'capture_knowledge', jsonb_build_object('revision_id', $3::text),
             now() - interval '400 days')`,
    [w.firm, w.admin, revision]);
  const stored = (await rootQuery(
    "select actor_role from clara.audit_log where args ->> 'revision_id' = $1", [revision])).rows[0];
  assert.equal(stored.actor_role, null, "the fixture is only honest if the audit row really is unstamped");

  const entry = (await listFirmKnowledge(w.viewer)).records
    .find((x) => x.knowledge_key === "default_currency");
  assert.ok(entry, "the firm register did not return the pre-mechanism rule");
  assert.equal(entry.authority.promoter_role_at_act, null,
    "an act recorded before the mechanism existed is UNKNOWN -- the register must say so rather than guess");
  assert.equal(entry.authority.promoter_role_now, "admin",
    "…and the promoter's CURRENT role is still reported, as the separate fact it is: an unknown "
    + "historical role must never be filled in from the live roster");
});

// =============================================================================================
// SEAM 3 — THE CATALOG. The ruling's own third acceptance criterion: "every governed door
// inherits the column with no per-door change (a census over `_audit` callers)". This is the
// structural cell the repo's own standard asks for (work order rule 4), and the behavioural
// halves beside it walk two doors from lanes this ticket never touched.
// =============================================================================================

cell("ar.05 every governed door inherits the column with no per-door change -- one writer, one stamp, and no second overload to drift into", async () => {
  // (a) THE SOLE WRITER, counted by `auditWriters` rather than by one exact spelling (ar.06c
  // shows the difference is real). A second writer would not escape the STAMP -- the trigger is
  // attached to the table -- but it would escape `clara._audit`'s discipline of naming neither
  // `at` nor `actor_role`, which is what ar.06 shows the unforgeability guarantee rests on.
  assert.deepEqual(await auditWriters(), ["clara._audit"],
    "clara.audit_log must have exactly one writer -- every door's audit row goes through it");

  // (b) ONE SIGNATURE, ONE OVERLOAD. A door that needed a per-door change would show up here as a
  // second `_audit` to call instead, or as a moved argument list. The exact CALLER COUNT is a
  // frontier fact and is pinned in 0243's own tail (304 at 0242); here it is a floor, so the cell
  // stays true as the estate grows.
  const shape = (await rootQuery(
    `select count(*)::int as overloads,
            max(pg_get_function_identity_arguments(p.oid)) as args
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.proname = '_audit'`)).rows[0];
  assert.equal(shape.overloads, 1, "a second clara._audit overload would be a per-door fork");
  assert.equal(shape.args,
    "p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text, p_fn text, p_entry uuid, p_args jsonb",
    "clara._audit's argument list is what all of its callers pass positionally -- it must not move");
  const callers = (await rootQuery(
    `select count(*)::int as n
       from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'clara' and p.prosrc like '%clara._audit(%'`)).rows[0].n;
  assert.ok(callers >= 300, `only ${callers} function(s) call clara._audit -- the census that makes "every door" mean something`);

  // (c) A DOOR FROM A LANE THIS TICKET NEVER TOUCHED. clara.create_client (0004) has nothing to do
  // with knowledge, and inherits the column anyway.
  const w = await knowledgeWorld("p912a5");
  await humanQuery(w.admin,
    "select clara.create_client(p_name => $1, p_op_key => $2) as r",
    [`p912 inherit ${randomUUID().slice(0, 8)}`, opk("p912cc")]);
  const created = await auditRowOf(w.firm, "create_client", w.admin);
  assert.equal(created.actor_role, "admin",
    "a door in another lane entirely records the role, with no edit of its own");

  // (d) THE WAKE LANE'S ACTOR IS 'none', NEVER NULL. 0004's lane split makes the global agent
  // identity the actor of every wake act, and it holds no membership by construction. Storing
  // 'none' is what keeps NULL meaning exactly one thing (ar.04's "predates the mechanism").
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, via_wake_kind, fn, args)
     values ($1, $2, 'proactive', 'rig_912_wake_actor', '{}'::jsonb)`, [w.firm, AGENT_USER_ID]);
  const agentRow = (await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_wake_actor'",
    [w.firm])).rows[0];
  assert.equal(agentRow.actor_role, "none",
    "an actor with no active membership is recorded as 'none' -- measured, not unknown");
  // …and 'none' is not a rank, so nothing can compare it as authority.
  const rank = (await rootQuery("select clara.role_rank('none') as r")).rows[0].r;
  assert.equal(rank, null);

  // (e) AN ACT WITH NO ACTOR AT ALL IS A FOURTH WORD, NOT 'none'. clara.audit_log.actor is
  // nullable and the estate writes a great many rows through it: on this rig, 39,272 of the
  // 40,369 rows carrying a role of 'none' have no actor whatsoever (estate notices, seeding,
  // sweeps). 'none' is DEFINED as "the mechanism looked the actor up and they held no active
  // membership in this firm" -- a fact about a person. Saying that about a row with nobody in it
  // is the exact conflation the three-way exists to prevent, so a row with no actor records
  // 'no_actor' and the four words stay one meaning each.
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args)
     values ($1, null, 'rig_912_no_actor', '{}'::jsonb)`, [w.firm]);
  const actorless = (await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_no_actor'",
    [w.firm])).rows[0];
  assert.equal(actorless.actor_role, "no_actor",
    "an act with no actor at all was never looked up -- it is 'no_actor', not the 'none' that means a person with no membership");
  assert.equal((await rootQuery("select clara.role_rank('no_actor') as r")).rows[0].r, null,
    "…and like 'none' it is deliberately not a rank");
});

cell("ar.06 no insert into clara.audit_log can assert a role the database did not measure -- not by supplying one, not by backdating itself, and not by becoming a second writer", async () => {
  const w = await knowledgeWorld("p912a6");

  // (a) A SUPPLIED ROLE ON AN ACT HAPPENING NOW IS THROWN AWAY. The writer says 'owner'; the
  // database measures the roster and records what it measured.
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args, actor_role)
     values ($1, $2, 'rig_912_supplied_now', '{}'::jsonb, 'owner')`, [w.firm, w.bookkeeper]);
  assert.equal((await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_supplied_now'",
    [w.firm])).rows[0].actor_role, "bookkeeper",
  "a role supplied by the writer is replaced by the one the database measured -- for every act it witnesses");

  // (b) …AND SO IS A ROW THAT BACKDATES ITSELF. `at` is the only thing separating an act from
  // history, so if the history arm KEPT what the insert carried, `at` would be a dial: an
  // earlier cut of 0243 returned that row unchanged, and as clara_fn_owner -- the identity every
  // SECURITY DEFINER body in this estate runs as -- a row backdated by one second kept a forged
  // 'owner' for an actor holding no membership anywhere (review finding ADV-06). The arm now
  // CLEARS the column: an act this database did not witness reads unknown, which is the honest
  // word, and there is no value of `at` that buys a writer an authority.
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args, at, actor_role)
     values ($1, $2, 'rig_912_supplied_past', '{}'::jsonb, now() - interval '1 second', 'owner')`,
    [w.firm, w.bookkeeper]);
  assert.equal((await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_supplied_past'",
    [w.firm])).rows[0].actor_role, null,
  "a row that backdates itself is not an act this database witnessed -- its role is cleared to unknown, never kept from the writer");

  // …and a RESTORE is untouched by that, which is measured rather than argued: pg_dump emits
  // triggers in its POST-DATA section, after the data, so clara.audit_log's COPY runs before
  // t_audit_actor_role exists and every restored row keeps the role the dump carried. The
  // measurement is recorded in 0243 §B beside the arm (`pg_dump --section=post-data`); it is a
  // property of pg_dump's own section order, not of this database, so there is nothing here for
  // a cell on this rig to assert.

  // (c) …SO THE SOLE-WRITER CENSUS IS THE WALL, AND IT MAY NOT BE A SPELLING. CONTROL: a real
  // second writer, spelled the other lawful way (uppercase, unqualified -- every definer body
  // here sets search_path = clara, pg_temp), created and censused inside a transaction that is
  // then rolled back. The census this battery and 0243's §Z share must SEE it.
  const client = await getPool().connect();
  try {
    await client.query("reset role");
    await client.query("begin");
    await client.query(`create function clara._rig_912_second_writer(p_firm uuid) returns void
      language plpgsql security definer set search_path = clara, pg_temp as $rig$
      begin
        INSERT INTO audit_log(firm_id, fn, args) values (p_firm, 'rig_912_second', '{}'::jsonb);
      end $rig$;`);
    const seen = await auditWriters((sql, params) => client.query(sql, params));
    assert.ok(seen.includes("clara._rig_912_second_writer"),
      `a second writer spelled INSERT INTO audit_log must be caught by the census, got ${JSON.stringify(seen)}`);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.query("reset all").catch(() => {});
    client.release();
  }
  assert.deepEqual(await auditWriters(), ["clara._audit"],
    "the control's second writer survived its own rollback");

  // (d) …AND THE SOLE WRITER NAMES NEITHER ESCAPE. `clara._audit`'s INSERT column list carries no
  // `at` and no `actor_role`, so every one of its 304 callers arrives with this transaction's
  // timestamp and no role to assert -- and that body is frozen (ordinal 10 of the
  // metric_input_snapshot v1 producer closure), so it can never be made to name either.
  const body = (await rootQuery(
    `select prosrc from pg_proc where oid = 'clara._audit(uuid,uuid,uuid,text,text,uuid,jsonb)'::regprocedure`
  )).rows[0].prosrc;
  const open = body.indexOf("clara.audit_log(") + "clara.audit_log(".length;
  const columns = body.slice(open, body.indexOf(")", open)).split(",").map((c) => c.trim());
  assert.ok(columns.length > 1 && columns.every((c) => /^[a-z_]+$/.test(c)),
    `could not read clara._audit's INSERT column list, got ${JSON.stringify(columns)}`);
  // Compared as TOKENS, not as substrings: 'at' occurs inside plenty of lawful column names, and
  // a substring test would call a body that named `created_at` clean while calling one that
  // named `format` dirty.
  for (const forbidden of ["at", "actor_role"]) {
    assert.ok(!columns.includes(forbidden),
      `clara._audit's INSERT column list must not name '${forbidden}', got ${JSON.stringify(columns)}`);
  }
});

cell("ar.07 the role is resolved at the AUDIT WRITE, not at the door's admission -- a promotion that commits while the act is parked on a lock is what the row then carries", async () => {
  // WHAT THIS CELL IS FOR. 0243's column means "the role the actor held WHEN THE DATABASE
  // RECORDED THE ACT", and the header, the column comment, packages/db/README.md and CONTEXT.md
  // all say so in those words because the admission-time role cannot be carried: every function
  // between the door's check and the write -- clara._human_ctx, clara.role_rank,
  // clara.actor_role_rank, clara.jwt_sub, clara.jwt_firm, clara._reserve_op and clara._audit
  // itself -- is a pinned member of the frozen metric_input_snapshot v1 producer closure
  // (measured: select member_signature from clara.metric_input_producer_version_members). Prose
  // that nothing tests is prose that drifts, so the difference is PINNED here as a property: if
  // some later change ever did resolve the role at admission, this cell goes red and the four
  // places that state the meaning have to be rewritten deliberately rather than by accident.
  const w = await knowledgeWorld("p912a7");

  // THE CONTROL, FIRST: the same actor through the same lane with nothing racing records the
  // role they were admitted at. Without this, the assertion below could be green because the
  // roster was misread rather than because the resolution moment is late.
  const rule = await capture(w.bookkeeper, { key: "default_currency", client: w.clientA,
    value: "USD", basis: "the client invoices in dollars" });
  assert.equal(rule.status, "captured");
  assert.equal((await auditRowOf(w.firm, "capture_knowledge", w.bookkeeper)).actor_role, "bookkeeper",
    "with nothing racing, the act carries the role its actor was admitted at");

  const blocker = await getPool().connect();
  let raced;
  try {
    await blocker.query("reset role");
    await blocker.query("begin");
    // Park on the live revision the correction must supersede. The door is admitted BEFORE it
    // reaches this row (clara._human_ctx runs first), so the act waits here with its audit write
    // still ahead of it -- the exact window the claim is about.
    const held = await blocker.query(
      `select id from clara.knowledge_records
        where record_id = $1 and firm_id = $2 and superseded_at is null for update`,
      [rule.record_id, w.firm]);
    assert.equal(held.rowCount, 1, "the cell must hold exactly the row the correction will supersede");

    // The act, through the real governed door, at BOOKKEEPER rank. Not awaited yet: it parks.
    raced = humanQuery(w.bookkeeper,
      `select clara.correct_knowledge(p_record => $1, p_value => $2::jsonb, p_reason => $3,
          p_op_key => $4) as r`,
      [rule.record_id, JSON.stringify("SGD"), "the client re-based to Singapore dollars",
        opk("p912race")]);
    await awaitBlockedBackend();

    // THE ROSTER MOVES UNDER THE PARKED ACT, and commits. Minted through the table the way this
    // battery mints every other roster fact (ar.03 mints its second owner the same way): the
    // subject under test is WHEN the stamp reads the roster, not how the roster changed.
    await blocker.query(
      `update clara.firm_memberships set role = 'owner'
        where firm_id = $1 and user_id = $2 and status = 'active'`, [w.firm, w.bookkeeper]);
    await blocker.query("commit");
  } finally {
    await blocker.query("rollback").catch(() => {});
    await blocker.query("reset all").catch(() => {});
    blocker.release();
  }

  const corrected = (await raced).rows[0].r;
  assert.equal(corrected.status, "corrected");
  assert.equal((await auditRowOf(w.firm, "correct_knowledge", w.bookkeeper)).actor_role, "owner",
    "the column is resolved at the audit write: a promotion that COMMITTED while the act was "
    + "parked is what the row carries, which is why nothing in this estate calls it the role at "
    + "the door's admission");
});
