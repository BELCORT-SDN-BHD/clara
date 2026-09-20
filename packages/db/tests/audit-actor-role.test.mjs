// #912 — THE ROLE THE ACTOR HELD AT THE INSTANT OF A GOVERNED ACT.
// Migration: 0243_audit_actor_role.sql. Every cell gates on the LIVE CATALOG, never on the
// migration number (knowledge-fixtures.mjs `auditActorRoleCohortApplied`), the 0240/0241/0242
// idiom this lane has already used three times.
//
// THE SHAPE THE OWNER RULED (issue #912, ruling comment 2026-09-18): the AUDIT-ROW shape, not a
// membership-history relation. `clara._audit` -- the ONE writer of `clara.audit_log` -- resolves
// the actor's role at write time; `clara.audit_log` carries it; `clara.list_firm_knowledge`'s
// promotion block cites it beside the promoter's CURRENT role; a row written before the column
// existed reads as unknown, and NOTHING is back-dated.
//
// THE SEAMS. Every cell addresses a PUBLIC interface:
//   · a governed door (`clara.capture_knowledge`) -> the committed `clara.audit_log` row it
//     leaves behind, read back with `rootQuery` (the rig's "READ BACK a table" idiom, never as
//     the caller of the act);
//   · `clara.list_firm_knowledge()` -- the firm register read -- through `humanQuery` at the
//     least privilege that should succeed;
//   · the catalog itself, for the census #912's ruling asks for ("every governed door inherits
//     the column with NO per-door change").
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ROLES, assertRaises, endPool, humanQuery, opk, roleQuery, rootQuery } from "./rig-fixtures.mjs";
import { auditActorRoleCohortApplied, knowledgeWorld } from "./knowledge-fixtures.mjs";

const EXPECTED_CELLS = 3;
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

cell("ar.02 history is left alone -- the rows that predate the column still read unknown, nothing can back-fill them later, and a row arriving from the past is never handed a role", async () => {
  // (a) THE HISTORY IS STILL THERE, AND STILL UNKNOWN. 0243's own §A measured this in the
  // transaction that minted the column ("all 66879 pre-existing row(s) stay NULL, none
  // back-filled"); this is the same claim re-measured from outside the migration. The bound is a
  // floor, not an equality: the battery cannot know how many acts this rig has run since.
  const nulls = (await rootQuery(
    "select count(*)::int as n from clara.audit_log where actor_role is null")).rows[0].n;
  assert.ok(nulls > 60000,
    `only ${nulls} audit row(s) carry NULL -- the ~66.9k rows that predate the column must still read unknown, never a back-filled guess`);

  // (b) …AND NOTHING CAN EVER BACK-FILL THEM. The claim that matters is not a snapshot but an
  // enforced property: clara.audit_log is append-only (0003), so a later editor cannot decide to
  // give history a role after the fact. Proved through the table itself, as the OWNER of the
  // table, which is the highest privilege any migration or definer body runs at.
  const victim = (await rootQuery(
    "select id from clara.audit_log where actor_role is null order by id limit 1")).rows[0].id;
  const refusal = await assertRaises("CLR08", () => roleQuery(ROLES.fnOwner,
    "update clara.audit_log set actor_role = 'owner' where id = $1", [victim]),
  "back-filling a role onto a pre-mechanism audit row");
  assert.equal(refusal.message, "audit_log is append-only");

  // (c) …AND RE-LOADING HISTORY DOES NOT HAND IT ONE EITHER. scripts/restore.mjs replays a plain
  // dump through psql, whose COPY fires this same BEFORE INSERT trigger; a row that arrives
  // carrying a timestamp from the past is not an act this database witnessed.
  const w = await knowledgeWorld("p912a2");
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args, at)
     values ($1, $2, 'rig_912_replayed_history', '{}'::jsonb, now() - interval '400 days')`,
    [w.firm, w.admin]);
  const replayed = (await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_replayed_history'",
    [w.firm])).rows[0];
  assert.equal(replayed.actor_role, null,
    "a row whose own timestamp predates this transaction is history being re-loaded, not an act -- it keeps its unknown");

  // The control that proves the stamp was armed the whole time: the SAME actor, the same table, a
  // row that claims to be happening NOW, is stamped.
  await rootQuery(
    `insert into clara.audit_log(firm_id, actor, fn, args)
     values ($1, $2, 'rig_912_act_now', '{}'::jsonb)`, [w.firm, w.admin]);
  const now = (await rootQuery(
    "select actor_role from clara.audit_log where firm_id = $1 and fn = 'rig_912_act_now'",
    [w.firm])).rows[0];
  assert.equal(now.actor_role, "admin");
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
