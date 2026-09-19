// #659 / C88.10 — the COMPLIANCE WATCH DISPOSITION battery for the second door installed by
// packages/db/migrations/0231_firm_portfolio_pack.sql.
//
// FRONTIER-GATED on the same `firm_portfolio_pack$` stable stem as its sibling battery — one
// migration, one stem, one cohort ("wholly present or wholly absent").
//
// WHAT THIS FILE IS ABOUT, AND WHY THE DOOR HAD TO BE BUILT. The three acts on a compliance watch
// have shipped since 0016 — `ack_compliance_watch` (0016:1047), `snooze_compliance_watch`
// (0016:1101) and `resolve_compliance_watch` (0016:1151), every one of them bookkeeper-floored and
// every one of them refusing an agent identity outright. What has NEVER existed is a way for a
// BROWSER to read back what those acts recorded: `clara.compliance_watches` and
// `clara.compliance_watch_events` both FORCE RLS with a single `clara_fn_owner` policy and carry no
// application-role grant at all (0016:396-414), and `list_review_queue`'s `compliance` envelope
// carries nine figure/date keys and not one disposition key (0016:4699-4714). So the acknowledgement
// echo C88.10 asks for was a MISSING DOOR, not missing wiring, and this is that door.
//
// SECURITY DEFINER FOR EXACTLY ONE REASON, asserted here rather than asserted in prose: an INVOKER
// body would see nothing, because the caller's role holds no privilege on either relation. The
// definer body being the only reader is the whole point, so `p659.watch.floor` re-measures the
// ungranted posture AFTER the migration.
//
// AND "VERSION" HAS NO REFERENT. The ticket's AC6 asks for "actor / time / version". The estate
// carries the first two and NOT the third: `clara.compliance_watches` has no version column
// (0016:298-350) and `clara.audit_log.args` records only `{watch, rationale, op_key}`
// (0016:1092-1093). `state_before -> state_after` on the append-only event trail is what the
// database actually holds, so that is what the door returns — and `p659.watch.no_version` asserts
// the absence rather than inventing a number to satisfy a word.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, endPool, buildWorld, AGENT_USER_ID, ROLES, roleQuery, opk,
  assertRaises, addMember, insertUser,
} from "./rig-fixtures.mjs";
import { assertPair } from "./work-journal-fixtures.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { printSkipCount } from "./wave-a-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import {
  a21EnsureReady, evaluateSstWatch, freshWatchClient, approvedTurnoverEntry,
  openWatchRow, watchEventRows, watchEventCount, ackWatch, resolveWatch,
  THRESHOLD_CENTS, mytMonthDate,
} from "./a21-helpers.mjs";

const CLR03 = "CLR03";
const CLR04 = "CLR04";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const STEM = "firm_portfolio_pack$";
const DISPO_SIG = "clara.get_compliance_watch_disposition(uuid)";

/** The five APPLICATION roles — the ones a request can arrive as. `clara_freeform_ro` is
 *  deliberately NOT one of them: it is 0131's read-only freeform analytics identity, it reaches no
 *  PostgREST surface, and `p659.watch.floor` states what it does hold rather than pretending it
 *  holds nothing. */
const APPLICATION_ROLES = [
  "clara_authenticated", "clara_runtime", "clara_agent_ro",
  "clara_wake_interactive", "clara_wake_proactive",
];

let _ready = null;
async function dispositionLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

let has16 = false;
let world = null;
let firmBKeeper = null;

async function gate(t) {
  if (!(await dispositionLaneReady())) {
    markSkip();
    t.skip(`#659 compliance-watch-disposition lane absent (no ${STEM} migration applied)`);
    return true;
  }
  if (!has16) {
    markSkip();
    t.skip("0016 not applied — the watch relations this door reads do not exist");
    return true;
  }
  return false;
}

before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud.
  if (!(await dispositionLaneReady()) && process.env.CLARA_ALLOW_MISSING_FIRM_PORTFOLIO_PACK !== "1") {
    throw new Error(
      `#659: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_FIRM_PORTFOLIO_PACK is not set. Apply 0231_firm_portfolio_pack.sql, "
      + "or preload tests/firm-portfolio-pack-preintegration-gate.mjs if a lane-less database is "
      + "expected here.",
    );
  }
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (!has16) {
    noteLane("0016 absent — compliance-watch-disposition suite dormant");
    return;
  }
  world = await buildWorld();
  // FIRM B NEEDS A SECOND MEMBER, and only for the maker/checker distinctness the approval door
  // enforces — a firm-B watch is what makes "a foreign watch and an invented uuid answer the same"
  // a behavioural claim rather than a restatement of the null case.
  firmBKeeper = await insertUser(world.prefix, "p659bkb");
  await addMember(world.users.dave, {
    firm: world.firms.B, user: firmBKeeper, role: "bookkeeper", opKey: opk("p659-memb"),
  });
});
after(async () => {
  printLaneNotes("compliance-watch-disposition");
  printSkipCount("compliance-watch-disposition");
  await endPool();
});

/** The door wrapper. NAMED argument only. */
async function disposition(sub, watch) {
  const r = await humanQuery(sub,
    "select clara.get_compliance_watch_disposition(p_watch => $1::uuid) as result", [watch]);
  return r.rows[0].result;
}

/** A CROSSED watch for a fresh client of `owner`'s firm, through the estate's own verbs. */
async function crossedWatch({ owner, checker, tag }) {
  const client = await freshWatchClient(owner, { name: `p659w_${tag}_${randomUUID().slice(0, 6)}` });
  await approvedTurnoverEntry({
    maker: owner, checker, client, cents: THRESHOLD_CENTS + 1, date: await mytMonthDate(-1, 4),
  });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.ok(w, "the evaluator opened a watch for this client");
  assert.equal(w.state, "crossed", "the fixture needs a CROSSED watch");
  return { client, watch: w.id, row: w };
}

// ===========================================================================================
// p659.watch.receipt — THE ECHO. Same actor, same instant, and a replay appends nothing.
// ===========================================================================================
test("p659.watch.receipt — after ack_compliance_watch the read returns the same actor and instant; a replay under the same op_key appends NO second event", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const { watch } = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "rcpt" });

  const before = await disposition(users.bob, watch);
  assert.equal(before.acknowledged_by, null, "nothing has been acknowledged yet");
  assert.equal(before.acknowledged_at, null);
  assert.equal(before.state, "crossed");

  const key = opk("p659-ack");
  await ackWatch(users.alice, { watch, rationale: "client informed; registration in progress", opKey: key });

  const after1 = await disposition(users.bob, watch);
  const stored = await rootQuery(
    "select acknowledged_by, acknowledged_at from clara.compliance_watches where id = $1", [watch]);
  assert.equal(after1.acknowledged_by, stored.rows[0].acknowledged_by,
    "the receipt names the ACTOR the write stamped, not the reader");
  assert.equal(new Date(after1.acknowledged_at).toISOString(),
    new Date(stored.rows[0].acknowledged_at).toISOString(),
    "and the INSTANT the write stamped");
  assert.equal(after1.state, "crossed", "an acknowledgement is an overlay — it never erases the condition");

  const events = after1.events.filter((e) => e.event_kind === "acknowledged");
  assert.equal(events.length, 1, "exactly one acknowledgement event on the trail");
  assert.equal(events[0].state_before, "crossed");
  assert.equal(events[0].state_after, "crossed",
    "state_before -> state_after is what this table holds where the ticket asks for a version");
  assert.ok(events[0].actor, "the trail names the actor");
  assert.ok(events[0].rationale, "and carries the rationale the door demanded");

  // THE REPLAY. `_reserve_op`/`_finish_op` (0004:46, :62) make the same op_key return the cached
  // result; nothing may be appended a second time.
  const countBefore = await watchEventCount(watch, "acknowledged");
  await ackWatch(users.alice, { watch, rationale: "client informed; registration in progress", opKey: key });
  assert.equal(await watchEventCount(watch, "acknowledged"), countBefore,
    "a replay under the same op_key appends no second event");
  const after2 = await disposition(users.bob, watch);
  assert.deepEqual(after2.events, after1.events, "and the trail the browser reads is unchanged");
});

// ===========================================================================================
// p659.watch.reload — the disposition is TABLE STATE, not a response.
// ===========================================================================================
test("p659.watch.reload — the disposition survives a fresh session, because it is table state and not a response", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const { watch } = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "rld" });
  await ackWatch(users.alice, { watch, rationale: "noted before the reload", opKey: opk("p659-ack") });

  // Every `humanQuery` is its own pooled checkout with RESET ALL on release (rig-helpers'
  // `withActor`), so this second read IS a fresh session by construction — and it is read by a
  // DIFFERENT member of the firm, which is the half a browser reload cannot prove on its own.
  const reread = await disposition(users.bob, watch);
  const byOwner = await disposition(users.alice, watch);
  assert.ok(reread.acknowledged_at, "the receipt is still there after the session ends");
  assert.equal(reread.acknowledged_by, byOwner.acknowledged_by,
    "and it names the same actor to every member of the firm");
  assert.equal(new Date(reread.acknowledged_at).toISOString(),
    new Date(byOwner.acknowledged_at).toISOString());
  assert.ok(reread.updated_at, "the row's own last-touched instant travels with it");
});

// ===========================================================================================
// p659.watch.refusal_keeps_nothing — a refusal writes NOTHING.
// ===========================================================================================
test("p659.watch.refusal_keeps_nothing — a resolved watch refuses a second acknowledgement CLR10 and appends no event row", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const { watch } = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "ref" });
  await resolveWatch(users.alice, {
    watch, conclusion: "registration_recorded", evidence: "SST registration no. RIG-0001",
    opKey: opk("p659-res"),
  });

  const settled = await disposition(users.bob, watch);
  assert.equal(settled.state, "resolved");
  assert.equal(settled.resolved_conclusion, "registration_recorded");
  assert.ok(settled.resolved_by, "the resolution names its actor");
  assert.ok(settled.resolved_at, "and its instant");
  assert.equal(settled.resolved_evidence, "SST registration no. RIG-0001",
    "and keeps the typed evidence the door demanded");

  const trailBefore = await watchEventRows(watch);
  await assertRaises(CLR10, () => ackWatch(users.alice, {
    watch, rationale: "too late", opKey: opk("p659-ack2"),
  }), "a resolved watch cannot be acknowledged (0016:1071-1073)");
  const trailAfter = await watchEventRows(watch);
  assert.equal(trailAfter.length, trailBefore.length, "the refusal appended no event row");

  const afterRefusal = await disposition(users.bob, watch);
  assert.equal(afterRefusal.resolved_evidence, "SST registration no. RIG-0001",
    "and the standing disposition is exactly what it was before the refusal");
});

// ===========================================================================================
// p659.watch.agent_refused — the database FORBIDS an agent acknowledgement. Not a deferred tool.
// ===========================================================================================
test("p659.watch.agent_refused — an agent identity is refused CLR03 before any write", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const { watch } = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "agt" });
  const trailBefore = await watchEventRows(watch);

  const err = await assertRaises(CLR03, () => humanQuery(AGENT_USER_ID,
    "select clara.ack_compliance_watch(p_watch => $1, p_rationale => $2, p_op_key => $3)",
    [watch, "the model would like to close this", opk("p659-agent")]),
    "the agent user row is is_agent=true, and 0016:1053-1055 refuses it before _human_ctx runs");
  assert.match(err.message, /agent/i, "the refusal says so in its own words");

  assert.equal((await watchEventRows(watch)).length, trailBefore.length,
    "BEFORE any write — nothing was appended");
  const w = await rootQuery(
    "select acknowledged_by, acknowledged_at from clara.compliance_watches where id = $1", [watch]);
  assert.equal(w.rows[0].acknowledged_by, null, "and nothing was stamped");
});

// ===========================================================================================
// p659.watch.floor — the bookkeeper floor, the not-found posture, and the ungranted relations.
// ===========================================================================================
test("p659.watch.floor — a viewer is refused CLR04; a foreign watch and an invented uuid are both CLR11 'watch not found'; both relations remain ungranted to every application role", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const mine = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "flr" });
  const theirs = await crossedWatch({ owner: users.dave, checker: firmBKeeper, tag: "flrb" });

  await assertRaises(CLR04, () => disposition(users.carol, mine.watch),
    "a viewer is below the bookkeeper floor the three write doors already hold");

  await assertPair(CLR10, "invalid_watch", () => disposition(users.bob, null),
    "a null watch is a CALLER defect, not an answer");

  const foreign = await assertRaises(CLR11, () => disposition(users.bob, theirs.watch),
    "another firm's watch");
  const invented = await assertRaises(CLR11,
    () => disposition(users.bob, "11111111-1111-4111-8111-111111111111"), "a uuid that names nothing");
  assert.equal(foreign.message, invented.message,
    "an id that names nothing and an id that names somebody else's watch are INDISTINGUISHABLE");
  assert.equal(foreign.message, "watch not found", "and both use the write doors' own token");

  // THE DECISIVE NEGATIVE FOR DOOR 2'S WHOLE RATIONALE, re-measured AFTER the migration.
  const grants = await rootQuery(
    "select table_name, grantee, privilege_type from information_schema.role_table_grants "
    + "where table_schema = 'clara' and table_name in ('compliance_watches','compliance_watch_events') "
    + "and grantee = any($1::text[])", [APPLICATION_ROLES]);
  assert.equal(grants.rows.length, 0,
    `no application role holds any privilege on either relation: ${JSON.stringify(grants.rows)}`);

  // AND WHAT IS ACTUALLY THERE, stated rather than implied. `clara_freeform_ro` (0131's read-only
  // freeform analytics identity) holds SELECT on the watch table under its own policy; the EVENT
  // trail — the half this door exists to publish — has no non-owner grantee at all.
  const nonOwner = await rootQuery(
    "select table_name, grantee, privilege_type from information_schema.role_table_grants "
    + "where table_schema = 'clara' and table_name in ('compliance_watches','compliance_watch_events') "
    + "and grantee <> 'clara_fn_owner' order by table_name, grantee, privilege_type");
  assert.deepEqual(nonOwner.rows, [
    { table_name: "compliance_watches", grantee: "clara_freeform_ro", privilege_type: "SELECT" },
  ], "the only non-owner privilege on either relation is 0131's freeform read on the watch table");

  const pol = await rootQuery(
    "select polname, polrelid::regclass::text as rel from pg_policy "
    + "where polrelid in ('clara.compliance_watches'::regclass, 'clara.compliance_watch_events'::regclass) "
    + "order by rel, polname");
  assert.equal(pol.rows.length, 3, "three policies: owner on both relations plus 0131's freeform read");
  const forced = await rootQuery(
    "select relname, relrowsecurity, relforcerowsecurity from pg_class "
    + "where relnamespace = 'clara'::regnamespace "
    + "and relname in ('compliance_watches','compliance_watch_events') order by relname");
  for (const r of forced.rows) {
    assert.equal(r.relrowsecurity, true, `${r.relname} has RLS enabled`);
    assert.equal(r.relforcerowsecurity, true, `${r.relname} FORCES it`);
  }
});

// ===========================================================================================
// p659.watch.no_version — the word the ticket asks for has no referent, and the door says so.
// ===========================================================================================
test("p659.watch.no_version — the returned object carries no version key and prosrc names none", async (t) => {
  if (await gate(t)) return;
  const { users } = world;
  const { watch } = await crossedWatch({ owner: users.alice, checker: users.bob, tag: "ver" });
  // The rationale text is deliberately free of the word under test: this cell greps the whole
  // serialised envelope, so a fixture that typed it would fail for its own reason.
  await ackWatch(users.alice, { watch, rationale: "noted for the receipt cell", opKey: opk("p659-ack") });

  const d = await disposition(users.bob, watch);
  const flat = JSON.stringify(d);
  assert.equal(flat.includes("version"), false,
    "no version key anywhere in the envelope — clara.compliance_watches has no such column");
  assert.equal(Object.prototype.hasOwnProperty.call(d, "version"), false);
  for (const e of d.events) {
    assert.equal(Object.prototype.hasOwnProperty.call(e, "version"), false);
    assert.ok(Object.prototype.hasOwnProperty.call(e, "state_before"));
    assert.ok(Object.prototype.hasOwnProperty.call(e, "state_after"));
  }

  const src = await rootQuery(
    `select prosrc from pg_proc where oid = '${DISPO_SIG}'::regprocedure`);
  assert.equal(src.rows[0].prosrc.includes("version"), false,
    "and the body names none either — the absence is asserted, never a number invented to fill a word");

  // POSTURE, in the cell that reads the body anyway: SECURITY DEFINER is the whole reason this
  // door exists, and STABLE plus the pinned search_path is how it stays a read.
  const meta = await rootQuery(
    "select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile, "
    + "coalesce(array_to_string(p.proconfig, ','), '') as cfg, "
    + "coalesce(array_to_string(p.proacl, ' | '), '(null)') as acl, "
    + "pg_get_function_arguments(p.oid) as args "
    + `from pg_proc p where p.oid = '${DISPO_SIG}'::regprocedure`);
  const m = meta.rows[0];
  assert.equal(m.owner, "clara_fn_owner");
  assert.equal(m.prosecdef, true, "SECURITY DEFINER — an INVOKER body would see nothing at all");
  assert.equal(m.provolatile, "s");
  assert.ok(m.cfg.replace(/ /g, "").includes("search_path=clara,pg_temp"));
  assert.equal(m.acl, "clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner");
  assert.equal(m.args, "p_watch uuid");

  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    await assertRaises("42501", () => roleQuery(role,
      `select clara.get_compliance_watch_disposition('${watch}'::uuid)`),
      `${role} must not execute the disposition read`);
  }
});
