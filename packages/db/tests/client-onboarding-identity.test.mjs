// #649 — A6: create a client, then continue accounting onboarding from what is already known.
// Migration: 0219_client_onboarding_facts.sql; gated on the LIVE CATALOG, never on the number.
//
// WHAT THIS BATTERY OWNS. Two doors and one negative:
//   * `clara.client_identity_candidates` — the duplicate/ambiguity READ the human face asks
//     BEFORE a client is created, at the three arities the owner ruled (0 proceed, 1 show and
//     acknowledge in the face, >=2 the DATABASE refuses with the candidate ids).
//   * `clara.settle_client_onboarding_facts` — the write that carries a COMMITTED plan's
//     financial-year end onto `clara.clients`, with the DAY supplied as a parameter (D7: asked,
//     never derived) and both of `set_client_fy_end`'s CLR38 annual-cadence refusals surfaced
//     rather than swallowed.
//   * the NEGATIVE the whole wrapper design turns on: `0103:1225-1239`'s five-role
//     `has_function_privilege` census over the three `name_family_*` helpers is STILL EMPTY
//     after 0219 (repeated at `0126:509` and `0154:551`).
//
// EVERY ASSERTION UNDER TEST GOES THROUGH `humanQuery` — a real per-role session carrying real
// JWT claims, under real RLS. `rootQuery` appears only where the subject is the CATALOG itself
// (the privilege census) or where a fixture is being PLANTED (the substrate, never the door).
//
// THE ONE THING THIS BATTERY DELIBERATELY DOES NOT ASSERT is a wall inside the birth verb.
// `p649.identity.direct_birth_residual` documents the opposite: at arity >=2 the read refuses
// and `clara.begin_client_onboarding` still succeeds, because DECISIONS §1.3 gives this wave no
// recut of that verb. A residual nobody wrote down is a residual nobody can close.

import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  CLR, PG, asHuman, asRoot, assertRaises, endPool, humanQuery, opk, roleQuery, rootQuery, ROLES,
} from "./rig-fixtures.mjs";
import { signAuthorityCompat } from "./fa-authority-sign-compat.mjs";

/** Postgres' own deadlock SQLSTATE. Named here rather than in `rig-helpers.mjs`'s shared `PG`
 *  table: eleven other lanes are editing that file in this wave, and this constant has exactly two
 *  readers: `p649.settle.lock_order` and `p649.settle.opening_rung_order`. */
const PG_DEADLOCK = "40P01";

/** Postgres' `lock_not_available` — what a statement raises when `lock_timeout` expires while it
 *  waits for a lock. Named here for the same reason as PG_DEADLOCK: one reader
 *  (`p649.settle.foreign_plan_takes_no_lock`), and eleven other lanes are editing `rig-helpers.mjs`
 *  this wave. */
const PG_LOCK_TIMEOUT = "55P03";

const CLR37 = "CLR37";
const CLR38 = "CLR38";

const EXPECTED_CELLS = 13;
let live = false;
let executed = 0;

/** True iff 0219's whole cohort is applied. A PARTIAL cohort THROWS — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a settle door without its
 *  identity read (or without the ungranted month helper) is a narrower boundary nobody chose. */
async function factsCohortApplied() {
  const r = await rootQuery(
    `select
       to_regprocedure('clara.client_identity_candidates(text,jsonb)')                      is not null as identity_read,
       to_regprocedure('clara.settle_client_onboarding_facts(uuid,integer,integer,text)')   is not null as settle_door,
       to_regprocedure('clara._plan_fye_month(uuid)')                                       is not null as month_helper,
       exists (select 1 from clara.event_types where name = 'client.onboarding_facts_settled') as event_type`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#649 0219 cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

before(async () => { live = await factsCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CLIENT_ONBOARDING_FACTS === "1") {
    console.warn("SKIP client-onboarding-identity: the 0219 cohort is not applied (explicit pre-integration run).");
    t.skip("0219 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0219 client-onboarding-facts cohort is required for a focused run: apply 0219_client_onboarding_facts.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------
// Fixtures. PLANTED through the root connection on purpose: the subject of these cells is the
// two new doors, so going through create_firm / add_member would only add ways to fail for
// reasons that are not the subject (knowledge-fixtures.mjs's own stated posture). Every door
// call a cell makes is the real door, as the real role.
// ---------------------------------------------------------------------------

/** One firm, four people at four ranks. */
async function firmWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`p649_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const role of ["owner", "admin", "bookkeeper", "viewer"]) {
    const id = randomUUID();
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `p649 ${role} ${suffix}`, `p649_${role}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [firm, id, role],
    );
    people[role] = id;
  }
  return { firm, suffix, ...people };
}

const addClient = async (firm, name, status = "active") =>
  (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,$3) returning id",
    [firm, name, status],
  )).rows[0].id;

/** A counterparty of one client — the other half of `name_family_candidates`' UNION
 *  (0103:764-771: LIVE means `retired_at is null and merged_into is null`).
 *
 *  `mergedInto` stamps the RETIRED post-image at INSERT rather than by a later UPDATE, and both
 *  halves are measured facts rather than convenience: `clara.counterparties` carries an
 *  immutability trigger that refuses a direct mutation (CLR08 "illegal counterparty mutation"),
 *  and `ck_counterparties_merge_retirement` admits only `(merged_into IS NULL AND retired_at IS
 *  NULL)` or `(both set, and merged_into <> id)` — this estate has no retirement that is not a
 *  merge. The SUBJECT of the cell is what the identity read does with a merged-away row, not how
 *  it became one. */
const addCounterparty = async (firm, client, name, createdBy, { mergedInto = null } = {}) =>
  (await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by,
        merged_into, retired_at)
     values ($1,$2,'vendor',$3, lower(regexp_replace($3, '[^a-zA-Z0-9]', '', 'g')), $4,
        $5::uuid, case when $5::uuid is null then null else now() end) returning id`,
    [firm, client, name, createdBy, mergedInto],
  )).rows[0].id;

/** A client onboarding plan in the given state, with the given item answers.
 *  `answers` maps item_key -> jsonb value (state 'answered', answered_by the given user). */
async function plan({ firm, client, state, answeredBy, answers = {} }) {
  const committed = state === "committed";
  const id = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, state, committed_at,
        committed_by, contributors)
     values ($1,'client',$2,$3, case when $3 = 'committed' then now() else null end,
        case when $3 = 'committed' then $4::uuid else null end, array[$4]::uuid[])
     returning id`,
    [firm, client, state, answeredBy],
  )).rows[0].id;
  for (const [itemKey, value] of Object.entries(answers)) {
    await rootQuery(
      `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
          answer, state, required_for_commit, answered_by, answered_at)
       values ($1,$2,'capture',$3,$4,$5::jsonb,'answered',false,$6, now())`,
      [id, firm, itemKey, `rig question ${itemKey}`, JSON.stringify(value), answeredBy],
    );
  }
  if (committed) {
    await rootQuery("update clara.clients set status='active' where id=$1", [client]);
  }
  return id;
}

/** A FIRM-scope plan (no client), for the settle door's scope refusal. */
async function firmPlan({ firm, state, by }) {
  return (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, state, committed_at,
        committed_by, contributors)
     values ($1,'firm',null,$2, case when $2='committed' then now() else null end,
        case when $2='committed' then $3::uuid else null end, array[$3]::uuid[]) returning id`,
    [firm, state, by],
  )).rows[0].id;
}

// ---------------------------------------------------------------------------
// Door callers. NAMED arguments throughout (rig-helpers' SIGNATURE STRATEGY).
// ---------------------------------------------------------------------------

const CANDIDATES = `select clara.client_identity_candidates(p_name => $1, p_identifier => $2::jsonb) as r`;
const candidatesAs = (sub, name, identifier = null) =>
  humanQuery(sub, CANDIDATES, [name, identifier === null ? null : JSON.stringify(identifier)])
    .then((r) => r.rows[0].r);

const SETTLE = `select clara.settle_client_onboarding_facts(
  p_plan => $1, p_fy_end_month => $2::int, p_fy_end_day => $3::int, p_op_key => $4) as r`;
const settleAs = (sub, planId, month, day, opKey) =>
  humanQuery(sub, SETTLE, [planId, month, day, opKey]).then((r) => r.rows[0].r);

const beginOnboardingAs = (sub, name) =>
  humanQuery(sub, "select clara.begin_client_onboarding(p_name => $1, p_op_key => $2) as r",
    [name, opk("p649_birth")]).then((r) => r.rows[0].r);

const clientFy = async (client) => {
  const r = await rootQuery("select fy_end_month, fy_end_day, status from clara.clients where id=$1", [client]);
  return r.rows[0];
};

const clientCount = async (firm) =>
  Number((await rootQuery("select count(*)::int n from clara.clients where firm_id=$1", [firm])).rows[0].n);

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};
const detailOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}"); } catch { return {}; }
};

// ===========================================================================
// IDENTITY
// ===========================================================================

cell("p649.identity.family — the leading-token family is returned with its match reason, and another firm's same-name clients are invisible", async () => {
  const a = await firmWorld("fam_a");
  const b = await firmWorld("fam_b");
  const mine = await addClient(a.firm, `Rome Public Advisory ${a.suffix}`);
  // THE FOREIGN FIRM HOLDS TWO of the same family. If firm scoping leaked they would join the
  // caller's own one and the read would RAISE at arity 3 — so a quiet arity of 1 below is the
  // assertion, not a side effect.
  await addClient(b.firm, `Rome Public Advisory ${b.suffix}`);
  await addClient(b.firm, `Rome Trading Sdn Bhd ${b.suffix}`);

  const exact = await candidatesAs(a.admin, `Rome Public Advisory ${a.suffix}`);
  assert.equal(exact.arity, 1, "exactly the caller's own same-named client");
  assert.equal(exact.candidates.length, 1);
  assert.equal(exact.candidates[0].id, mine);
  assert.equal(exact.candidates[0].party_kind, "client");
  assert.equal(exact.candidates[0].status, "active");
  assert.equal(exact.candidates[0].client_id, mine, "a client candidate links to itself");
  assert.equal(exact.candidates[0].match_reason, "exact_name");

  // A DIFFERENT name in the SAME family reads as `name_family`, not `exact_name` — the two
  // reasons are what let the face say WHY it is showing this row.
  const family = await candidatesAs(a.admin, "Rome Ventures Berhad");
  assert.equal(family.arity, 1);
  assert.equal(family.candidates[0].id, mine);
  assert.equal(family.candidates[0].match_reason, "name_family");

  // …and a name in NO family at all is the silent arity-0 answer.
  const none = await candidatesAs(a.admin, `Zamboni Holdings ${a.suffix}`);
  assert.equal(none.arity, 0);
  assert.deepEqual(none.candidates, []);
});

cell("p649.identity.wall_two — two same-family parties (a client and a LIVE counterparty) raise CLR10 name_family_collision with both ids, and no client is born", async () => {
  const w = await firmWorld("wall");
  const client = await addClient(w.firm, `Rome Public Advisory ${w.suffix}`);
  const cp = await addCounterparty(w.firm, client, `Rome Logistics ${w.suffix}`, w.admin);
  // …and a THIRD same-family party that was MERGED AWAY into that live one. It must not count:
  // a face that demanded an acknowledgement for a party the estate already retired would be
  // asking about a record nobody can act on. Arity stays 2, which is what the assertion below
  // measures.
  await addCounterparty(w.firm, client, `Rome Salvage ${w.suffix}`, w.admin, { mergedInto: cp });
  const before_ = await clientCount(w.firm);

  const err = await assertRaises(CLR.badRequest,
    () => candidatesAs(w.admin, "Rome Ventures Berhad"),
    "two same-family parties");
  assert.equal(reasonOf(err), "name_family_collision",
    "the token is the agent lane's own (0142:451-453), never a second vocabulary for one fact");
  const d = detailOf(err);
  assert.equal(d.arity, 2);
  // THE REFUSAL CARRIES THE ROWS, not bare ids: the face renders the DB's message verbatim with
  // its code AND the same linkable list it would have rendered at arity 1. A refusal naming only
  // uuids would force a SECOND read of the same fact, which is how two surfaces come to disagree
  // about it.
  assert.deepEqual(d.candidates.map((x) => x.id).sort(), [client, cp].sort(),
    "the refusal hands back WHICH parties collided, so the face can link them");
  const kinds = Object.fromEntries(d.candidates.map((x) => [x.id, x.party_kind]));
  assert.deepEqual(kinds, { [client]: "client", [cp]: "counterparty" });
  for (const row of d.candidates) {
    assert.ok(typeof row.name === "string" && row.name.length > 0, "each candidate carries its name");
    assert.ok(["exact_name", "name_family", "identifier"].includes(row.match_reason),
      "each candidate says WHY it matched");
  }
  assert.equal(d.name, "Rome Ventures Berhad", "the refusal echoes the name that was asked about");

  // THE ASSERTION IS THE ROW COUNT, NOT THE MESSAGE: a read that refused must not have created
  // anything on its way to refusing.
  assert.equal(await clientCount(w.firm), before_, "a refused identity read births nothing");
});

cell("p649.identity.arity_one — one candidate is RETURNED and does not raise: the wall at arity 1 is the face's, by ruling", async () => {
  const w = await firmWorld("one");
  const only = await addClient(w.firm, `Rome Public Advisory ${w.suffix}`, "onboarding");

  const r = await candidatesAs(w.admin, "Rome Ventures Berhad");
  assert.equal(r.arity, 1, "the estate's own predicate is count(*) > 1; one party has never been ambiguous");
  assert.equal(r.candidates[0].id, only);
  assert.equal(r.candidates[0].status, "onboarding", "the candidate carries its real status, not a guess");

  // A NAME WITH NO ALPHANUMERIC CONTENT has no leading token at all, so it has no family and no
  // basis — `clara.name_family_token` returns NULL and the predicate returns nothing (0103's own
  // comment states this fail-closed reading). It is arity 0, not an error.
  const punctuation = await candidatesAs(w.admin, "   ---   ");
  assert.equal(punctuation.arity, 0);
  assert.deepEqual(punctuation.candidates, []);
});

cell("p649.identity.direct_birth_residual — at arity >=2 the READ refuses and clara.begin_client_onboarding STILL succeeds (the named residual, documented not asserted away)", async () => {
  const w = await firmWorld("resid");
  const client = await addClient(w.firm, `Rome Public Advisory ${w.suffix}`);
  await addCounterparty(w.firm, client, `Rome Logistics ${w.suffix}`, w.admin);

  const name = `Rome Ventures ${w.suffix}`;
  await assertRaises(CLR.badRequest, () => candidatesAs(w.admin, name), "the read at arity 2");

  // THE RESIDUAL, IN ONE LINE OF EVIDENCE. The wall lives at the candidates READ, not inside the
  // birth door: DECISIONS §1.3 gives #649 no recut, and `begin_client_onboarding(text,text)`'s
  // signature is censused by name (0017:5139-5140) so a defaulted acknowledgement parameter
  // would create the overload 0103:1055-1070 refuses. A caller that never asks still births.
  const born = await beginOnboardingAs(w.admin, name);
  assert.ok(born.client_id, "the birth door is untouched by this wave and still creates the client");
  assert.ok(born.plan_id, "…with its onboarding plan, in one transaction");
  const row = await rootQuery("select name, status from clara.clients where id=$1", [born.client_id]);
  assert.equal(row.rows[0].status, "onboarding");
});

cell("p649.identity.floor — admin floor: a bookkeeper and a viewer get CLR04, clara_runtime gets 42501, and a below-floor caller cannot tell a real family from a name that matches nothing", async () => {
  const w = await firmWorld("floor");
  const client = await addClient(w.firm, `Rome Public Advisory ${w.suffix}`);
  await addCounterparty(w.firm, client, `Rome Logistics ${w.suffix}`, w.admin);

  const matching = "Rome Ventures Berhad";              // arity 2 for an admin — it would RAISE
  const nothing = `Zamboni Holdings ${w.suffix}`;        // arity 0 for an admin

  const bkMatch = await assertRaises(CLR.authz, () => candidatesAs(w.bookkeeper, matching), "bookkeeper, matching name");
  const bkNone = await assertRaises(CLR.authz, () => candidatesAs(w.bookkeeper, nothing), "bookkeeper, unmatched name");
  assert.equal(bkMatch.message, bkNone.message,
    "a below-floor caller learns nothing about the firm's names: both refusals are byte-identical");
  assert.equal(bkMatch.detail ?? null, bkNone.detail ?? null);

  await assertRaises(CLR.authz, () => candidatesAs(w.viewer, matching), "viewer");

  // The machine lane holds no EXECUTE at all — a privilege refusal, one rung before the body.
  await assertRaises(PG.insufficientPrivilege,
    () => roleQuery(ROLES.runtime, CANDIDATES, [matching, null]),
    "clara_runtime");
});

cell("p649.identity.census_replay — after 0219 the 0103 privilege census over the three name_family_* helpers is STILL empty", async () => {
  // THE SUBJECT IS THE CATALOG, so this one reads as root by construction: `has_function_privilege`
  // is a system read, and asking it as a role would only tell us about that role. This is the exact
  // assertion 0103:1225-1239 makes at migration time (repeated at 0126:509 and 0154:551), re-run
  // against the database 0219 actually left behind.
  const r = await rootQuery(
    `select s.sig, r.rolname
       from (values ('clara.name_family_token(text)'),
                    ('clara.name_family_candidates(uuid,text)'),
                    ('clara.name_family_is_ambiguous(uuid,text)')) s(sig)
       cross join (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                          ('clara_wake_proactive'),('clara_runtime')) r(rolname)
      where has_function_privilege(r.rolname, s.sig, 'execute')`);
  assert.deepEqual(r.rows, [],
    "0219 publishes the predicate's ANSWER through a definer wrapper precisely so no app role gains the predicate");

  // The counter-half: the WRAPPER is reachable by the human lane and by nobody else, so the
  // negative above is not merely "nothing was granted anywhere".
  const w = await rootQuery(
    `select r.rolname
       from (values ('clara_authenticated'),('clara_agent_ro'),('clara_wake_interactive'),
                    ('clara_wake_proactive'),('clara_runtime')) r(rolname)
      where has_function_privilege(r.rolname, 'clara.client_identity_candidates(text,jsonb)', 'execute')
      order by 1`);
  assert.deepEqual(w.rows.map((x) => x.rolname), ["clara_authenticated"]);
});

// ===========================================================================
// SETTLE
// ===========================================================================

cell("p649.settle.fy_end — the door writes month+day from its parameters, refuses a NULL day, takes the plan's month, refuses a contradicting one, refuses an OPEN plan, CLR37s an impossible day, and replays byte-identically", async () => {
  const w = await firmWorld("settle");

  // (a) THE HAPPY PATH: no month supplied, so the plan's own `fye` answer is used and the DAY
  //     comes from the parameter. `ck_clients_fy_end` admits only both-NULL or both-set.
  const c1 = await addClient(w.firm, `Settle One ${w.suffix}`, "onboarding");
  const p1 = await plan({ firm: w.firm, client: c1, state: "committed", answeredBy: w.admin, answers: { fye: 6 } });
  const k1 = opk("p649_settle");
  const r1 = await settleAs(w.admin, p1, null, 30, k1);
  assert.equal(r1.fy_end_month, 6);
  assert.equal(r1.fy_end_day, 30);
  assert.equal(r1.fy_end_month_source, "plan");
  assert.equal(r1.client_id, c1);
  assert.deepEqual(await clientFy(c1), { fy_end_month: 6, fy_end_day: 30, status: "active" });

  // (a2) THE REPLAY IS BYTE-IDENTICAL, and a replay carrying a DIFFERENT day is the house
  //      receipt-hash CLR10 rather than a second, silent year-end move.
  assert.deepEqual(await settleAs(w.admin, p1, null, 30, k1), r1, "an exact replay returns the stored receipt");
  await assertRaises(CLR.badRequest, () => settleAs(w.admin, p1, null, 15, k1),
    "the same op_key carrying a different day");
  assert.deepEqual(await clientFy(c1), { fy_end_month: 6, fy_end_day: 30, status: "active" },
    "…and the refused replay moved nothing");

  // (b) A NULL DAY IS A REFUSAL, NEVER A DERIVATION (D7).
  const c2 = await addClient(w.firm, `Settle Two ${w.suffix}`, "onboarding");
  const p2 = await plan({ firm: w.firm, client: c2, state: "committed", answeredBy: w.admin, answers: { fye: 6 } });
  const dayErr = await assertRaises(CLR.badRequest, () => settleAs(w.admin, p2, null, null, opk("p649_noday")),
    "a NULL financial-year-end day");
  assert.equal(reasonOf(dayErr), "fy_end_day_required");
  assert.deepEqual(await clientFy(c2), { fy_end_month: null, fy_end_day: null, status: "active" },
    "nothing was written and nothing was derived");

  // (c) A SUPPLIED MONTH THAT CONTRADICTS THE PLAN REFUSES AND NAMES BOTH NUMBERS.
  const conflict = await assertRaises(CLR.badRequest, () => settleAs(w.admin, p2, 9, 30, opk("p649_conflict")),
    "a month contradicting the plan's own answer");
  assert.equal(reasonOf(conflict), "fy_end_month_contradicts_plan");
  assert.deepEqual({ supplied: detailOf(conflict).supplied, plan: detailOf(conflict).plan }, { supplied: 9, plan: 6 });
  // …and supplying the SAME month is accepted, recorded as a confirmation rather than a caller value.
  const confirmed = await settleAs(w.admin, p2, 6, 30, opk("p649_confirm"));
  assert.equal(confirmed.fy_end_month_source, "plan_confirmed");

  // (d) A PLAN THAT ANSWERED NO MONTH, with none supplied.
  const c3 = await addClient(w.firm, `Settle Three ${w.suffix}`, "onboarding");
  const p3 = await plan({ firm: w.firm, client: c3, state: "committed", answeredBy: w.admin, answers: {} });
  const unanswered = await assertRaises(CLR.badRequest, () => settleAs(w.admin, p3, null, 31, opk("p649_unans")),
    "no month on the plan and none supplied");
  assert.equal(reasonOf(unanswered), "fy_end_month_unanswered");
  // …and with a month supplied it settles, recorded as the CALLER's value.
  const caller = await settleAs(w.admin, p3, 12, 31, opk("p649_caller"));
  assert.equal(caller.fy_end_month_source, "caller");
  assert.deepEqual(await clientFy(c3), { fy_end_month: 12, fy_end_day: 31, status: "active" });

  // (e) AN OPEN PLAN REFUSES: settle follows commit.
  const c4 = await addClient(w.firm, `Settle Four ${w.suffix}`, "onboarding");
  const p4 = await plan({ firm: w.firm, client: c4, state: "open", answeredBy: w.admin, answers: { fye: 3 } });
  const open = await assertRaises(CLR.badRequest, () => settleAs(w.admin, p4, null, 31, opk("p649_open")),
    "an OPEN onboarding plan");
  assert.equal(reasonOf(open), "onboarding_plan_open");

  // (f) 31 FEBRUARY IS CLR37, raised by clara.set_client_fy_end and NOT re-derived here.
  const c5 = await addClient(w.firm, `Settle Five ${w.suffix}`, "onboarding");
  const p5 = await plan({ firm: w.firm, client: c5, state: "committed", answeredBy: w.admin, answers: { fye: 2 } });
  const feb = await assertRaises(CLR37, () => settleAs(w.admin, p5, null, 31, opk("p649_feb")), "31 February");
  assert.equal(reasonOf(feb), "fa_particulars_invalid");
  assert.deepEqual(await clientFy(c5), { fy_end_month: null, fy_end_day: null, status: "active" });

  // (g) A FIRM-SCOPE plan has no client record to settle, and another firm's plan is CLR11 with
  //     no existence oracle.
  const fp = await firmPlan({ firm: w.firm, state: "committed", by: w.admin });
  const scope = await assertRaises(CLR.badRequest, () => settleAs(w.admin, fp, 6, 30, opk("p649_scope")),
    "a firm-scope plan");
  assert.equal(reasonOf(scope), "plan_not_client_scoped");
  const foreign = await firmWorld("settle_foreign");
  const fc = await addClient(foreign.firm, `Foreign ${foreign.suffix}`, "onboarding");
  const fpl = await plan({ firm: foreign.firm, client: fc, state: "committed", answeredBy: foreign.admin, answers: { fye: 6 } });
  const cross = await assertRaises(CLR.notFound, () => settleAs(w.admin, fpl, null, 30, opk("p649_cross")),
    "another firm's plan");
  const random = await assertRaises(CLR.notFound, () => settleAs(w.admin, randomUUID(), null, 30, opk("p649_rand")),
    "a plan id that does not exist");
  assert.equal(cross.message, random.message, "no existence oracle: absent and foreign are one answer");
});

cell("p649.settle.clr38 — under a live ANNUAL depreciation authority the door surfaces set_client_fy_end's CLR38 and writes nothing", async () => {
  const w = await firmWorld("clr38");
  const client = await addClient(w.firm, `Cadence ${w.suffix}`, "onboarding");
  const p = await plan({ firm: w.firm, client, state: "committed", answeredBy: w.admin, answers: { fye: 6 } });

  // The authority is raised through its OWN real doors, at their own floors (propose:
  // bookkeeper+, sign: ADMIN+) — never planted, because the thing under test is what the LIVE
  // spliced guard does, and a hand-written row could differ from what those doors produce.
  const proposed = await humanQuery(w.bookkeeper,
    "select clara.propose_depreciation_authority(p_client => $1, p_cadence => 'annual', p_op_key => $2) as r",
    [client, opk("p649_prop")]).then((r) => r.rows[0].r);
  // #651 [0227]: the sign door's instruction reference is REQUIRED and the arity moved to four.
  // The shared compat helper feature-detects the signature, so this cell runs at both frontiers.
  await signAuthorityCompat(humanQuery, w.admin,
    { client, authority: proposed.authority_id, opKey: opk("p649_sign") });

  const err = await assertRaises(CLR38, () => settleAs(w.admin, p, null, 30, opk("p649_locked")),
    "settling while a live ANNUAL depreciation authority stands");
  assert.equal(reasonOf(err), "fy_end_locked_by_annual_cadence",
    "the inner door's own token reaches the caller — this door catches nothing");
  assert.equal(detailOf(err).axis, "depreciation_authority");

  assert.deepEqual(await clientFy(client), { fy_end_month: null, fy_end_day: null, status: "active" },
    "a refused financial-year write must never be presented as a settled onboarding");
  const receipts = await rootQuery(
    "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='settle_client_onboarding_facts'",
    [w.firm]);
  assert.equal(Number(receipts.rows[0].n), 0,
    "the raise aborted the transaction, so the reservation this door took is gone with it");
});

cell("p649.settle.replay_isolation — the door never touches another client's plan, and two concurrent settles under one op_key leave exactly one receipt and one write", async () => {
  const w = await firmWorld("iso");
  const c1 = await addClient(w.firm, `Iso One ${w.suffix}`, "onboarding");
  const c2 = await addClient(w.firm, `Iso Two ${w.suffix}`, "onboarding");
  const p1 = await plan({ firm: w.firm, client: c1, state: "committed", answeredBy: w.admin, answers: { fye: 4 } });
  await plan({ firm: w.firm, client: c2, state: "committed", answeredBy: w.admin, answers: { fye: 4 } });

  const key = opk("p649_race");
  const [a, b] = await Promise.all([
    settleAs(w.admin, p1, null, 30, key),
    settleAs(w.admin, p1, null, 30, key),
  ]);
  // ONE of the two may observe the reservation before its result was stored, which the house
  // shape reports as `{pending:true}` (0004:_reserve_op). Anything else must be the identical
  // receipt — never a second, different one.
  for (const r of [a, b]) {
    if (r.pending === true) continue;
    assert.equal(r.client_id, c1);
    assert.equal(r.fy_end_month, 4);
    assert.equal(r.fy_end_day, 30);
  }
  const receipts = await rootQuery(
    "select count(*)::int n from clara.op_receipts where firm_id=$1 and fn='settle_client_onboarding_facts' and op_key=$2",
    [w.firm, key]);
  assert.equal(Number(receipts.rows[0].n), 1, "one op key, one receipt");

  assert.deepEqual(await clientFy(c1), { fy_end_month: 4, fy_end_day: 30, status: "active" });
  assert.deepEqual(await clientFy(c2), { fy_end_month: null, fy_end_day: null, status: "active" },
    "the sibling client's record is untouched — a settle addresses one plan and one client");

  // And the event the door appends is client-scoped to the client it settled, exactly once.
  const events = await rootQuery(
    `select client_id, payload from clara.domain_events
      where firm_id=$1 and event_type='client.onboarding_facts_settled'`, [w.firm]);
  assert.equal(events.rows.length, 1, "one settle, one domain event");
  assert.equal(events.rows[0].client_id, c1);
  assert.equal(events.rows[0].payload.fy_end_day, 30);
});

cell("p649.settle.lock_order — the settle door takes the CLIENT before the PLAN, so it cannot deadlock against commit/cancel, which take them in that order", async () => {
  // THE LAW THIS CELL DEFENDS. Every other door in the onboarding family locks the CLIENT row
  // first and the PLAN row second — `commit_client_onboarding` (0017:2764 then 0017:2768),
  // `cancel_client_onboarding` (0017:2852 then 0017:2853) — and 0037:2514-2536 states the
  // estate's single-total-order rule that makes those acquisitions deadlock-free rather than
  // merely documented. A settle door that took the plan first would invert against BOTH of them,
  // and the loser of that cycle is a 40P01 the web door has no refusal face for: a legitimate
  // financial-year write dying with an untyped error while the human is told nothing.
  //
  // THE ADVERSARY IS ROOT, and deliberately: what it performs is cancel/commit's OWN first
  // acquisition (`select … from clara.clients … for update`), which no application role may issue
  // directly (no app-role DML, so a human session cannot take a row lock at all). The DOOR under
  // test is still called through `humanQuery`, as this battery's own posture requires — the root
  // session is the substrate the door races, never the subject.
  const w = await firmWorld("lock");
  const client = await addClient(w.firm, `Lock Order ${w.suffix}`, "onboarding");
  const planId = await plan({ firm: w.firm, client, state: "committed", answeredBy: w.admin, answers: { fye: 6 } });

  const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
  const held = defer();
  const settleIssued = defer();
  let holderOutcome = null;

  const holder = asRoot(async (c) => {
    await c.query("begin");
    // 1 · cancel/commit's FIRST acquisition.
    await c.query("select 1 from clara.clients where id=$1 for update", [client]);
    held.resolve();
    // 2 · let the settle door run and reach whatever it blocks on.
    await settleIssued.promise;
    await new Promise((r) => setTimeout(r, 1_500));
    try {
      // 3 · cancel/commit's SECOND acquisition. Under the INVERTED order this closes the cycle
      //     and Postgres shoots one of the two transactions with 40P01.
      await c.query("select 1 from clara.onboarding_plans where id=$1 for update", [planId]);
      holderOutcome = "acquired";
    } catch (err) {
      holderOutcome = err.code ?? String(err);
    }
    await c.query("rollback");
  });

  const settle = (async () => {
    await held.promise;
    const call = settleAs(w.admin, planId, null, 30, opk("p649_lockorder"));
    settleIssued.resolve();
    try { return { ok: await call }; } catch (err) { return { code: err.code ?? null, message: err.message }; }
  })();

  const [outcome] = await Promise.all([settle, holder]);

  assert.notEqual(outcome.code, PG_DEADLOCK,
    `the settle door deadlocked against cancel/commit's own lock order: ${outcome.message}`);
  assert.notEqual(holderOutcome, PG_DEADLOCK,
    "…and neither did the transaction holding the client row: a settle must QUEUE behind the onboarding family, never race it");
  assert.equal(holderOutcome, "acquired", "the client-first transaction took the plan lock unobstructed");

  // AND THE WRITE LANDED. Queuing is only the right answer if the door still does its work once
  // the row is free — a settle that merely avoided the deadlock by refusing would be a worse bug.
  assert.equal(outcome.ok?.client_id, client);
  assert.deepEqual(await clientFy(client), { fy_end_month: 6, fy_end_day: 30, status: "active" });
});

cell("p649.settle.opening_rung_order — the settle door takes the CLIENT ADVISORY RUNG before any row lock, so it cannot deadlock against the opening / fy-end family, which takes that rung first", async () => {
  // THE SECOND HALF OF THE SAME LAW, AND THE HALF THE FIRST FIX DID NOT REACH.
  // `p649.settle.lock_order` above settles the order of the two ROW locks. This cell settles
  // where the CLIENT ADVISORY RUNG — `pg_advisory_xact_lock(203005004, hashtext(client))` — sits
  // relative to them, because two LIVE doors have already answered that, and both put the rung
  // ABOVE the rows (measured on this rig, off `pg_proc.prosrc`):
  //   * `clara.approve_opening_seed` — the seed row FOR UPDATE, then the rung, THEN
  //     `select * into p from clara.onboarding_plans … for update`. The rung precedes the PLAN row.
  //   * `clara.set_client_fy_end` — the rung ("THE RUNG BEFORE THE GUARD READS", 0042 §S5.12),
  //     then `update clara.clients`. The rung precedes the CLIENT row — and that is the very
  //     write this door makes, through that very door.
  // 0037 SECTION K states the rung ladder as a PARTIAL order over who takes what
  // ("firm (203005002) -> client (203005004)"), which is exactly how it must be read here: a
  // settle that took the two rows FIRST and only met the rung deep inside `set_client_fy_end`
  // would invert against BOTH doors above, and the loser of that cycle is a 40P01 out of a human
  // door — the financial-year write dead, the face with nothing to say.
  //
  // THE ADVERSARY IS ROOT and performs `approve_opening_seed`'s OWN two acquisitions in its own
  // order (the rung, then the plan row). No application role may take either directly. The DOOR
  // is still called through `humanQuery`, as this battery's posture requires.
  const w = await firmWorld("rung");
  const client = await addClient(w.firm, `Rung Order ${w.suffix}`, "onboarding");
  const planId = await plan({ firm: w.firm, client, state: "committed", answeredBy: w.admin, answers: { fye: 6 } });

  const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
  const held = defer();
  const settleIssued = defer();
  let holderOutcome = null;

  const holder = asRoot(async (c) => {
    await c.query("begin");
    // 1 · approve_opening_seed's rung, on this client.
    await c.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client]);
    held.resolve();
    // 2 · let the settle door run and reach whatever it blocks on.
    await settleIssued.promise;
    await new Promise((r) => setTimeout(r, 1_500));
    try {
      // 3 · approve_opening_seed's NEXT acquisition. Under a rung-last settle this closes the
      //     cycle — the settle holds the plan row and waits for the rung — and Postgres shoots
      //     one of the two transactions with 40P01.
      await c.query("select 1 from clara.onboarding_plans where id=$1 for update", [planId]);
      holderOutcome = "acquired";
    } catch (err) {
      holderOutcome = err.code ?? String(err);
    }
    await c.query("rollback");
  });

  const settle = (async () => {
    await held.promise;
    const call = settleAs(w.admin, planId, null, 30, opk("p649_rungorder"));
    settleIssued.resolve();
    try { return { ok: await call }; } catch (err) { return { code: err.code ?? null, message: err.message }; }
  })();

  const [outcome] = await Promise.all([settle, holder]);

  assert.notEqual(outcome.code, PG_DEADLOCK,
    `the settle door deadlocked against the client advisory rung's own order: ${outcome.message}`);
  assert.notEqual(holderOutcome, PG_DEADLOCK,
    "…and neither did the transaction holding the rung: a settle must QUEUE behind the rung, never race it");
  assert.equal(holderOutcome, "acquired", "the rung-first transaction took the plan lock unobstructed");

  // AND THE WRITE LANDED once the rung was free — queuing is only the right answer if the door
  // still does its work.
  assert.equal(outcome.ok?.client_id, client);
  assert.deepEqual(await clientFy(client), { fy_end_month: 6, fy_end_day: 30, status: "active" });
});

cell("p649.settle.foreign_plan_takes_no_lock — another firm's plan refuses CLR11 without ever waiting on that firm's rung or rows", async () => {
  // NO EXISTENCE ORACLE MEANS NO TIMING ORACLE EITHER. This door's own header cites 0021's rule
  // and promises that a plan which "does not exist, or belongs to another firm, yields NULL and
  // locks nothing". A caller who cannot see the plan must not be able to MEASURE it — and any
  // lock taken on the owning firm's rung, client row or plan row BEFORE the firm check hands
  // them exactly that measurement: hold those locks inside the owning firm and the outsider's
  // refusal arrives late instead of at once.
  //
  // THE DIFFERENCE IS A SQLSTATE, NOT A STOPWATCH. The outsider runs under `lock_timeout = 1s`,
  // so a door that queues on any of those objects aborts with 55P03 lock_not_available, and a
  // door that locks nothing answers CLR11 straight away. The second arm is the CONTROL that
  // proves the instrument: the same timeout, the same door, a plan the caller DOES own, one lock
  // held — and there the door is supposed to wait.
  const a = await firmWorld("xta");
  const b = await firmWorld("xtb");
  const client = await addClient(a.firm, `Cross Tenant ${a.suffix}`, "onboarding");
  const planId = await plan({ firm: a.firm, client, state: "committed", answeredBy: a.admin, answers: { fye: 6 } });

  const defer = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
  const settleUnder = async (sub, key) => asHuman(sub, async (c) => {
    await c.query("set lock_timeout = '1s'");
    const started = Date.now();
    try {
      const r = await c.query(SETTLE, [planId, 6, 30, key]);
      return { ok: r.rows[0].r, ms: Date.now() - started };
    } catch (err) {
      return { code: err.code ?? null, reason: reasonOf(err), ms: Date.now() - started, message: err.message };
    }
  });

  // ARM 1 — the owning firm holds EVERYTHING this door could want on its own client.
  const held1 = defer();
  const release1 = defer();
  const holder1 = asRoot(async (c) => {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(203005004, hashtext($1::text))", [client]);
    await c.query("select 1 from clara.clients where id=$1 for update", [client]);
    await c.query("select 1 from clara.onboarding_plans where id=$1 for update", [planId]);
    held1.resolve();
    await release1.promise;
    await c.query("rollback");
  });
  await held1.promise;
  const outsider = await settleUnder(b.admin, opk("p649_xtenant"));
  release1.resolve();
  await holder1;

  assert.notEqual(outsider.code, PG_LOCK_TIMEOUT,
    `an outsider queued on the owning firm's locks before being refused (${outsider.ms}ms) — that wait IS the oracle`);
  assert.equal(outsider.code, CLR.notFound, `expected CLR11, got ${outsider.code ?? "success"}`);
  assert.equal(outsider.reason, "plan_not_in_firm",
    "and it is the SAME refusal an unknown plan gets — one answer for both");
  assert.deepEqual(await clientFy(client), { fy_end_month: null, fy_end_day: null, status: "active" },
    "nothing was written for a firm the caller is not in");

  // ARM 2 — THE CONTROL. Same door, same 1s timeout, a plan this caller DOES own, with only the
  // plan row held: the door is supposed to queue here, and 55P03 is the proof that the timeout in
  // arm 1 was live and would have fired had the door waited at all.
  const held2 = defer();
  const release2 = defer();
  const holder2 = asRoot(async (c) => {
    await c.query("begin");
    await c.query("select 1 from clara.onboarding_plans where id=$1 for update", [planId]);
    held2.resolve();
    await release2.promise;
    await c.query("rollback");
  });
  await held2.promise;
  const insider = await settleUnder(a.admin, opk("p649_xtenant_ctl"));
  release2.resolve();
  await holder2;

  assert.equal(insider.code, PG_LOCK_TIMEOUT,
    `the control must WAIT and time out on the plan row (got ${insider.code ?? "success"})`);
});

cell("p649.settle.fye_unreadable — an unreadable `fye` answer reads as ABSENT and refuses with a TYPED reason, never an untyped cast error", async () => {
  // `clara.update_onboarding_plan` (0017:2632) is the RUNTIME's interview writer and it validates
  // item_key/item_kind/state only — the answer goes in as whatever JSON the caller sent. So every
  // shape below is reachable through a GRANTED door, and `clara._plan_fye_month`'s own comment
  // makes the promise this cell measures: "ANY OTHER SHAPE READS AS ABSENT … a number outside
  // 1..12 or a non-numeric string is not a month". A JSON number too large for `int` must meet
  // that promise too, rather than raising 22003 out of a human door with no refusal face.
  const w = await firmWorld("fye_shape");
  const unreadable = async (label, literal) => {
    const client = await addClient(w.firm, `Shape ${label} ${w.suffix}`, "onboarding");
    const planId = await plan({ firm: w.firm, client, state: "committed", answeredBy: w.admin, answers: {} });
    await rootQuery(
      `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
          answer, state, required_for_commit, answered_by, answered_at)
       values ($1,$2,'capture','fye','rig fye', $3::jsonb, 'answered', false, $4, now())`,
      [planId, w.firm, literal, w.admin],
    );
    const err = await assertRaises(CLR.badRequest,
      () => settleAs(w.admin, planId, null, 30, opk(`p649_shape_${label}`)),
      `a plan whose fye answer is ${label}`);
    assert.equal(reasonOf(err), "fy_end_month_unanswered",
      `an unreadable fye (${label}) must read as ABSENT and refuse with the typed reason`);
    assert.deepEqual(await clientFy(client), { fy_end_month: null, fy_end_day: null, status: "active" },
      `…and nothing may be written for ${label}`);
  };

  await unreadable("out_of_range_number", "99999999999999999999");
  await unreadable("month_thirteen", "13");
  await unreadable("month_zero", "0");
  await unreadable("object", '{"month":6}');
  await unreadable("array", "[6]");
  await unreadable("word", '"June"');
});
