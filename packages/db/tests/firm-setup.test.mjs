// #648 (journey A5) — RESUME FIRM SETUP FROM THE FACTS THAT ARE ACTUALLY MISSING.
// Migration: 0203_firm_setup.sql. Every cell gates on the LIVE CATALOG, never on a migration
// number (`firmSetupCohortApplied` below).
//
// WHAT THESE CELLS ARE FOR. #648's acceptance is mostly a claim about what the DATABASE does with
// a firm's own onboarding plan, under real roles:
//   AC1 — progress derives from real required items, an accepted fact is never re-asked, and a
//         concurrent editor is met with a CAS refusal rather than a lost write (cells 1, 2, 5).
//   AC2 — an OPTIONAL item can be skipped with a stated reason and the checklist still completes
//         (cell 6, and cell 7's second half).
//   AC3 — the three firm-defaultable facts reach the SAME canonical `clara.knowledge_records`
//         register Settings and Knowledge read, with scope, source and actor; the other nine
//         reach none (cells 8, 9, 10, 11).
//   AC4 — "the firm workspace stays usable" becomes an ASSERTION, not an assumption (cell 15).
//   AC7 — every assertion under test runs through a least-privileged persona (`humanQuery`), never
//         `rootQuery`; `rootQuery` appears only to PLANT a world or to READ BACK a row the cell is
//         proving was NOT written (cells 3, 4, 12, 13, 14).
//
// ROLE DISCIPLINE (wave DECISIONS §1.10). Every door call in this file goes through `humanQuery`
// as a named persona at a real rank. The one exception is the deferral MECHANISM PROBE in cell 6,
// which deliberately writes as root: its subject is `ck_onboarding_plan_items_answer` itself —
// what the CHECK admits — and that question has no door.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertRaises, endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const EXPECTED_CELLS = 17;
let live = false;
let executed = 0;

/** True iff 0203's whole cohort is applied. A PARTIAL cohort throws — "wholly present or wholly
 *  absent" is the estate's rule (rig-meta.mjs cohortFailures), and a half-applied firm setup lane
 *  must be visible as a defect rather than skipped as an old frontier. */
async function firmSetupCohortApplied() {
  const r = await rootQuery(
    `select
       to_regclass('clara.firm_setup_keys')                                    is not null as catalogue,
       to_regclass('clara.uq_onboarding_plans_one_open_firm')                  is not null as one_open_index,
       to_regprocedure('clara.seed_firm_setup_plan(text)')                     is not null as seed_door,
       to_regprocedure('clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)') is not null as answer_door,
       to_regprocedure('clara.defer_firm_setup_item(uuid,uuid,text,text,text)')   is not null as defer_door,
       to_regprocedure('clara.commit_firm_setup(uuid,uuid,text)')              is not null as commit_door,
       to_regprocedure('clara.get_firm_setup()')                               is not null as read_door`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#648 firm setup cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

before(async () => { live = await firmSetupCohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_0203 === "1") {
    console.warn("SKIP firm-setup: the 0203 cohort is not applied (explicit pre-integration run).");
    t.skip("firm setup cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0203 firm setup cohort is required for a focused run: apply 0203_firm_setup.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the ROOT connection on purpose, the knowledge-fixtures.mjs precedent:
// the subject of these cells is the firm SETUP doors, and going through create_firm /
// claim_paid_firm would only add ways to fail for reasons that are not the subject. The firm PLAN
// is planted exactly as `clara._create_firm_core` plants one (0145:492-494) — the opener recorded
// both as `review_maker` and as the first contributor, plus its revision-1 snapshot — so what the
// doors meet here is the row a real firm actually has.
// ---------------------------------------------------------------------------------------------
const ROLES_IN_WORLD = ["owner", "admin", "admin2", "bookkeeper", "viewer"];

async function firmSetupWorld(tag, { withPlan = true } = {}) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fs_${suffix}`]))
    .rows[0].id;
  const people = {};
  for (const who of ROLES_IN_WORLD) {
    const id = randomUUID();
    const role = who === "admin2" ? "admin" : who;
    await rootQuery(
      "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
      [id, `fs ${who} ${suffix}`, `fs_${who}_${suffix}@rig.test`],
    );
    await rootQuery(
      "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,$3,'active')",
      [firm, id, role],
    );
    people[who] = id;
  }
  const client = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `fs_c_${suffix}`],
  )).rows[0].id;
  const clientB = (await rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [firm, `fs_cb_${suffix}`],
  )).rows[0].id;

  let plan = null;
  if (withPlan) plan = await plantFirmPlan(firm, people.owner);
  return { firm, client, clientB, plan, ...people };
}

/** The firm-scope plan exactly as clara._create_firm_core opens one. */
async function plantFirmPlan(firm, opener) {
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[]) returning id`,
    [firm, opener],
  )).rows[0].id;
  await rootQuery(
    `insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
     values ($1, 1, clara._onboarding_plan_snapshot($1))`,
    [plan],
  );
  return plan;
}

/** Plant items the way `firmInterview_v3` leaves them: answered, attributed, on the SAME plan
 *  (packages/runtime/workflows/firmInterview.v3.ts:163-166 via clara.update_onboarding_plan). */
async function plantInterviewItems(firm, plan, answeredBy, items) {
  for (const it of items) {
    await rootQuery(
      `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
          answer, state, required_for_commit, answered_by, answered_at)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9, now())`,
      [plan, firm, it.kind ?? "must_ask", it.key, it.question ?? `v3 asked ${it.key}`,
        JSON.stringify(it.answer), it.state ?? "answered", it.required ?? true, answeredBy],
    );
  }
}

const planRow = (plan) =>
  rootQuery("select * from clara.onboarding_plans where id = $1", [plan]).then((r) => r.rows[0]);
const itemRow = (plan, key) =>
  rootQuery("select * from clara.onboarding_plan_items where plan_id = $1 and item_key = $2", [plan, key])
    .then((r) => r.rows[0] ?? null);

// ---------------------------------------------------------------------------------------------
// Door wrappers. Named args throughout (the rig's signature strategy).
// ---------------------------------------------------------------------------------------------
const seed = (sub, o = {}) =>
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [o.opKey ?? opk("fsseed")])
    .then((r) => r.rows[0].r);

const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("fsans")],
  ).then((r) => r.rows[0].r);

const defer = (sub, o) =>
  humanQuery(sub,
    `select clara.defer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_reason => $4, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, o.reason, o.opKey ?? opk("fsdef")],
  ).then((r) => r.rows[0].r);

const commit = (sub, o) =>
  humanQuery(sub,
    "select clara.commit_firm_setup(p_plan => $1, p_expected_revision => $2, p_op_key => $3) as r",
    [o.plan, o.revision, o.opKey ?? opk("fscom")],
  ).then((r) => r.rows[0].r);

const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r").then((r) => r.rows[0].r);

const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};
const detailOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}"); } catch { return {}; }
};

/** Answer every catalogue row that is required_for_commit, in catalogue order, re-reading the CAS
 *  token each time. Returns the final envelope. */
async function answerAllRequired(sub, plan) {
  let env = await readSetup(sub);
  for (const item of env.items.filter((i) => i.required)) {
    if (item.state !== "pending" && item.state !== "unseeded") continue;
    await answer(sub, { plan, revision: env.revision_token, itemKey: item.item_key, answer: sampleAnswer(item) });
    env = await readSetup(sub);
  }
  return env;
}

/** A value of the shape the CATALOGUE declares — never a shape this file invents. */
function sampleAnswer(item) {
  switch (item.answer_shape) {
    case "choice": return item.answer_options[0];
    case "month": return 6;
    case "long_text": return "1 Jalan Rig\nKuala Lumpur";
    case "labelled_object":
      return { [item.answer_field]: item.answer_options.length > 0 ? item.answer_options[0] : "MPERS" };
    default: return `rig ${item.item_key}`;
  }
}

// =============================================================================================
// SEAM 1 — THE SEED IS A RECONCILIATION (AC1's centre).
// =============================================================================================

cell("p648.seed.reconcile a plan already carrying firmInterview_v3 items is reconciled, not collided with", async () => {
  const w = await firmSetupWorld("t1");
  // The v3 shape: four answered firm facts, attributed to the opener, on the same plan.
  await plantInterviewItems(w.firm, w.plan, w.owner, [
    { key: "legal_name", answer: "Rig & Co PLT" },
    { key: "ssm", answer: { registration: "LLP0001234-LGN", format_verified: true } },
    { key: "mia", answer: "MIA-9911", kind: "capture", required: false },
    // …and the two items this journey deliberately does not own.
    { key: "bookkeeper_email", answer: "book@rig.test" },
    { key: "first_client_onboarding", answer: { intended: false }, kind: "todo", state: "deferred", required: false },
  ]);
  const before = {
    legal_name: await itemRow(w.plan, "legal_name"),
    ssm: await itemRow(w.plan, "ssm"),
    mia: await itemRow(w.plan, "mia"),
  };

  const receipt = await seed(w.admin);
  assert.equal(receipt.plan_id, w.plan);
  // RED BEFORE THE DOOR EXISTED: a blind insert raises 23505 on uq_onboarding_plan_items_key.
  assert.equal(receipt.catalogue_total, 12);
  assert.equal(receipt.seeded, 9, "the seed inserted something other than the nine MISSING catalogue rows");

  for (const key of ["legal_name", "ssm", "mia"]) {
    const after = await itemRow(w.plan, key);
    assert.deepEqual(
      {
        answer: after.answer, answered_by: after.answered_by,
        answered_at: after.answered_at?.toISOString() ?? null, state: after.state,
        question: after.question, item_kind: after.item_kind,
      },
      {
        answer: before[key].answer, answered_by: before[key].answered_by,
        answered_at: before[key].answered_at?.toISOString() ?? null, state: before[key].state,
        question: before[key].question, item_kind: before[key].item_kind,
      },
      `the reseed rewrote the accepted item ${key}`,
    );
  }
  // The plan advanced exactly one revision and appended exactly one snapshot.
  const p = await planRow(w.plan);
  assert.equal(p.revision_n, 2);
  assert.equal(p.revision_token, receipt.revision_token);
  const revs = await rootQuery(
    "select count(*)::int as n from clara.onboarding_plan_revisions where plan_id = $1", [w.plan]);
  assert.equal(revs.rows[0].n, 2);
  // …and an ACCEPTED fact is never re-asked: the read returns it answered, not pending.
  const env = await readSetup(w.admin);
  assert.equal(env.items.find((i) => i.item_key === "legal_name").state, "answered");
  assert.equal(env.items.find((i) => i.item_key === "legal_name").answer, "Rig & Co PLT");
});

cell("p648.seed.empty a claimed firm's empty plan gains exactly the catalogue, and a replay yields one receipt", async () => {
  const w = await firmSetupWorld("t2");
  const before = await planRow(w.plan);
  assert.equal(before.scope_kind, "firm");
  assert.equal(before.state, "open");
  assert.equal(before.client_id, null);
  const zero = await rootQuery(
    "select count(*)::int as n from clara.onboarding_plan_items where plan_id = $1", [w.plan]);
  assert.equal(zero.rows[0].n, 0, "the claim path's plan was not empty");

  const key = opk("fsseed");
  const first = await seed(w.admin, { opKey: key });
  assert.equal(first.seeded, 12);
  assert.equal(first.catalogue_total, 12);

  const rows = await rootQuery(
    `select i.item_key, i.state, i.required_for_commit, i.item_kind, k.required_for_commit as cat_required
       from clara.onboarding_plan_items i
       join clara.firm_setup_keys k on k.item_key = i.item_key
      where i.plan_id = $1 order by k.sort_order`, [w.plan]);
  assert.equal(rows.rows.length, 12);
  for (const r of rows.rows) {
    assert.equal(r.state, "pending", `${r.item_key} was seeded in state ${r.state}`);
    assert.equal(r.required_for_commit, r.cat_required, `${r.item_key} lost its catalogue required flag`);
  }
  // The token rotated and a snapshot was appended.
  const after = await planRow(w.plan);
  assert.notEqual(after.revision_token, before.revision_token);
  assert.equal(after.revision_n, 2);

  // SAME op_key REPLAYS ONE RECEIPT — no second reconciliation, no second revision.
  const replay = await seed(w.admin, { opKey: key });
  assert.deepEqual(replay, first, "the op_key replay did not return the same receipt");
  const still = await planRow(w.plan);
  assert.equal(still.revision_n, 2, "a replay advanced the plan");
  const receipts = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'seed_firm_setup_plan'",
    [w.firm]);
  assert.equal(receipts.rows[0].n, 1);
});

cell("p648.seed.excludes the catalogue carries neither bookkeeper_email (#625) nor first_client_onboarding (#649)", async () => {
  const cat = await rootQuery(
    "select item_key, required_for_commit, knowledge_key from clara.firm_setup_keys order by sort_order");
  const keys = cat.rows.map((r) => r.item_key);
  assert.deepEqual(keys, [
    "legal_name", "ssm", "entity_type", "address", "mia",
    "turnover", "tin", "fye",
    "mpers_eligibility", "framework", "accounting_basis", "currency",
  ], "the catalogue is not FIRM_SEGMENTS_V2 minus the two exclusions");
  assert.ok(!keys.includes("bookkeeper_email"), "bookkeeper_email is member provisioning (#625)");
  assert.ok(!keys.includes("first_client_onboarding"), "first_client_onboarding is #649's journey");
  // D8: exactly three rows are firm-defaultable.
  assert.deepEqual(
    cat.rows.filter((r) => r.knowledge_key !== null).map((r) => `${r.item_key}->${r.knowledge_key}`).sort(),
    ["accounting_basis->accounting_basis", "currency->default_currency", "framework->reporting_framework"],
  );
});

// =============================================================================================
// SEAM 2 — THE FLOORS AND THE CAS.
// =============================================================================================

cell("p648.answer.floor a bookkeeper cannot answer a firm setup item: CLR04, and nothing is written", async () => {
  const w = await firmSetupWorld("t4");
  await seed(w.admin);
  const env = await readSetup(w.admin);
  const auditBefore = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = 'answer_firm_setup_item'",
    [w.firm]);

  await assertRaises("CLR04", () => answer(w.bookkeeper, {
    plan: w.plan, revision: env.revision_token, itemKey: "legal_name", answer: "Bookkeeper & Co",
  }), "answer_firm_setup_item as a bookkeeper");

  const item = await itemRow(w.plan, "legal_name");
  assert.equal(item.state, "pending");
  assert.equal(item.answer, null);
  assert.equal(item.answered_by, null);
  const auditAfter = await rootQuery(
    "select count(*)::int as n from clara.audit_log where firm_id = $1 and fn = 'answer_firm_setup_item'",
    [w.firm]);
  assert.equal(auditAfter.rows[0].n, auditBefore.rows[0].n, "a refused answer left an audit row");

  // …and the READ is floored too, so a deep link from a bookkeeper's browser is refused by the
  // database rather than only hidden by the menu.
  await assertRaises("CLR04", () => readSetup(w.bookkeeper), "get_firm_setup as a bookkeeper");
  await assertRaises("CLR04", () => readSetup(w.viewer), "get_firm_setup as a viewer");

  // An admin succeeds on the identical call.
  const ok = await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "legal_name", answer: "Rig & Co PLT",
  });
  assert.equal(ok.state, "answered");
  assert.equal(ok.answered_by, w.admin);
});

cell("p648.answer.stale a stale revision token is CLR06 + detail.reason stale_plan, never CLR31, and the item is unchanged", async () => {
  const w = await firmSetupWorld("t5");
  await seed(w.admin);
  const env = await readSetup(w.admin);
  const staleToken = env.revision_token;

  // A second editor (the firm's other admin) answers first and rotates the token.
  await answer(w.admin2, {
    plan: w.plan, revision: staleToken, itemKey: "legal_name", answer: "Admin Two & Co",
  });

  const err = await assertRaises("CLR06", () => answer(w.admin, {
    plan: w.plan, revision: staleToken, itemKey: "address", answer: "1 Jalan Rig",
  }), "answer_firm_setup_item with a stale revision");
  assert.equal(reasonOf(err), "stale_plan");
  assert.notEqual(err.code, "CLR31", "the plan CAS must ride the CLR06 revision class, not the SEED family");

  const item = await itemRow(w.plan, "address");
  assert.equal(item.state, "pending");
  assert.equal(item.answer, null);
  // The winner's answer stands, and a re-read hands the loser the authoritative token.
  const fresh = await readSetup(w.admin);
  assert.equal(fresh.items.find((i) => i.item_key === "legal_name").answer, "Admin Two & Co");
  assert.notEqual(fresh.revision_token, staleToken);
  const retry = await answer(w.admin, {
    plan: w.plan, revision: fresh.revision_token, itemKey: "address", answer: "1 Jalan Rig",
  });
  assert.equal(retry.state, "answered");
});

// =============================================================================================
// SEAM 3 — SKIPPING AN OPTIONAL ITEM, AND WHERE ITS REASON LANDS.
// =============================================================================================

cell("p648.defer.reason the deferred CHECK arm admits an answer, so a skip's stated reason survives a re-read", async () => {
  const w = await firmSetupWorld("t6");

  // THE MECHANISM PROBE, and the ONE deliberate root write in this file: its subject is
  // `ck_onboarding_plan_items_answer` itself (0017:1058-1064), which no door owns. If the CHECK
  // admits a non-null `answer` on a deferred row, the door takes the preferred form; if it
  // refuses, the reason has to fall back to the audit detail and the UI has to say so.
  const probe = await rootQuery(
    `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question,
        answer, state, required_for_commit, answered_by, answered_at)
     values ($1,$2,'todo','p648_probe','probe', $3::jsonb, 'deferred', false, $4, now())
     returning answer`,
    [w.plan, w.firm, JSON.stringify({ deferred_reason: "probe" }), w.owner],
  ).catch((e) => e);
  assert.ok(!(probe instanceof Error),
    `ck_onboarding_plan_items_answer REFUSED a deferred row carrying an answer (${probe?.message}) -- `
    + "the door must fall back to parking the reason in the audit detail");
  assert.deepEqual(probe.rows[0].answer, { deferred_reason: "probe" });
  await rootQuery("delete from clara.onboarding_plan_items where plan_id = $1 and item_key = 'p648_probe'", [w.plan]);

  // …now the real door, on the two items FIRM_SEGMENTS_V2 itself marks skippable
  // (mia :38 and currency :43, both requiredForCommit:false).
  await seed(w.admin);
  let env = await readSetup(w.admin);
  const reasonMia = "The firm is not MIA-registered.";
  const r1 = await defer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "mia", reason: reasonMia,
  });
  assert.equal(r1.state, "deferred");
  env = await readSetup(w.admin);
  const mia = env.items.find((i) => i.item_key === "mia");
  assert.equal(mia.state, "deferred");
  assert.deepEqual(mia.answer, { deferred_reason: reasonMia });
  assert.equal(mia.answered_by, w.admin);
  assert.ok(mia.answered_at, "a deferral must carry its actor and its instant");

  const reasonCur = "MYR is the only currency the firm bills in; leaving the default unstated.";
  await defer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "currency", reason: reasonCur });
  env = await readSetup(w.admin);
  assert.deepEqual(
    env.items.find((i) => i.item_key === "currency").answer, { deferred_reason: reasonCur });

  // A DEFERRAL CAPTURES NOTHING, even though `currency` is a firm-defaultable key.
  const k = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where firm_id = $1", [w.firm]);
  assert.equal(k.rows[0].n, 0, "skipping a firm-defaultable item wrote a knowledge record");

  // A REQUIRED item cannot be skipped, and the refusal names it.
  const err = await assertRaises("CLR10", () => defer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "legal_name", reason: "later",
  }), "defer a required item");
  assert.equal(reasonOf(err), "firm_setup_item_required");
  // …and a skip without a reason is refused rather than recorded as an empty one.
  const err2 = await assertRaises("CLR10", () => defer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "tin", reason: "   ",
  }), "defer without a reason");
  assert.equal(reasonOf(err2), "firm_setup_reason_required");
});

// =============================================================================================
// SEAM 3b — THE CORRECTION PATH (C48.5's third word), AND WHAT AN OP KEY MAY BE DERIVED FROM.
//
// The surface's correction control (components/firm-setup/firm-setup-checklist.tsx) rests on two
// claims about this door, and both are asserted here rather than assumed there:
//   · a settled item is corrected by ANSWERING IT AGAIN, and a deferral is un-skipped the same
//     way — the door sets `state='answered'` from any non-committed state and replaces `answer`
//     wholesale, so the deferral reason does not survive as a ghost beside the new value;
//   · an item whose answer reached the KNOWLEDGE REGISTER is NOT corrected that way — the second
//     capture of a live key is refused `knowledge_already_live`, which is why the surface sends a
//     captured fact to `clara.correct_knowledge` on the facts panel instead of offering a form.
// =============================================================================================

cell("p648.answer.correct a settled item is corrected by answering it again, a deferral is un-skipped, and a LIVE firm default is not re-captured", async () => {
  const w = await firmSetupWorld("t16");
  await seed(w.admin);
  let env = await readSetup(w.admin);

  // (a) DEFER, then ANSWER: the item lands on `answered` with the new value and NO ghost reason.
  await defer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "mia",
    reason: "Nobody could find the certificate this morning.",
  });
  env = await readSetup(w.admin);
  assert.equal(env.items.find((i) => i.item_key === "mia").state, "deferred");
  await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "mia", answer: "MIA-9911" });
  env = await readSetup(w.admin);
  const mia = env.items.find((i) => i.item_key === "mia");
  assert.equal(mia.state, "answered", "answering a skipped item did not un-skip it");
  assert.equal(mia.answer, "MIA-9911");
  assert.equal(mia.answered_by, w.admin);
  const miaRow = await itemRow(w.plan, "mia");
  assert.equal(miaRow.answer?.deferred_reason, undefined,
    "the deferral reason survived beside the new answer -- the item now says two things at once");

  // (b) ANSWER, then ANSWER AGAIN: a plan-only fact is corrected in place, by the corrector.
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "legal_name", answer: "Rig & Co PLT",
  });
  env = await readSetup(w.admin);
  await answer(w.admin2, {
    plan: w.plan, revision: env.revision_token, itemKey: "legal_name", answer: "Rig & Partners PLT",
  });
  env = await readSetup(w.admin);
  const legal = env.items.find((i) => i.item_key === "legal_name");
  assert.equal(legal.answer, "Rig & Partners PLT", "a recorded plan item could not be corrected");
  assert.equal(legal.answered_by, w.admin2, "the correction did not re-attribute the item to its corrector");

  // (c) A LIVE FIRM DEFAULT is a different path: the capture door refuses the second one by name,
  // so the surface must NOT offer a second answer for it.
  const captured = env.items.find((i) => i.knowledge_key !== null && i.state === "pending");
  assert.ok(captured, "the catalogue carries no pending firm-defaultable item to prove this on");
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: captured.item_key,
    answer: sampleAnswer(captured),
  });
  env = await readSetup(w.admin);
  const live = env.items.find((i) => i.item_key === captured.item_key);
  assert.ok(live.knowledge_record_id, "answering a firm-defaultable item recorded no knowledge row");
  const err = await assertRaises("CLR10", () => answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: captured.item_key,
    answer: sampleAnswer(captured),
  }), "re-answer a live firm-defaultable item");
  assert.equal(reasonOf(err), "knowledge_already_live",
    "a second capture of a live key is not refused by name -- the surface's 'correct it on the register' "
    + "sentence would then be wrong");
});

cell("p648.opkey.attempt an op key derived from the VALUE alone can never be re-sent; a per-attempt key can, and an identical replay still yields one receipt", async () => {
  const w = await firmSetupWorld("t17");
  await seed(w.admin);
  let env = await readSetup(w.admin);

  // THE DEFECT A VALUE-DERIVED KEY CARRIES. `_reserve_op` hashes the WHOLE argument list — the
  // expected revision included (0004_governed_fns.sql:46-60) — so the same key against a plan that
  // has moved on is a DIFFERENT request and is refused, permanently, by name.
  const stableKey = opk("fsattempt");
  const rev0 = env.revision_token;
  await answer(w.admin, { plan: w.plan, revision: rev0, itemKey: "mia", answer: "MIA-1", opKey: stableKey });
  env = await readSetup(w.admin);
  assert.notEqual(env.revision_token, rev0, "an accepted answer did not rotate the CAS token");

  const reused = await assertRaises("CLR10", () => answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "mia", answer: "MIA-1", opKey: stableKey,
  }), "the same op key against a plan that has moved on");
  assert.match(reused.message, /op_key reused with different args/);
  assert.equal(reasonOf(reused), null, "this refusal carries no detail -- the message is the only discriminant");

  // …while the BYTE-IDENTICAL request under that key — the op key AND the revision that was
  // actually sent — replays its receipt rather than acting twice. That is the whole lost-response
  // contract, and it is why the surface remembers what it sent instead of what it has since read.
  const replay = await answer(w.admin, {
    plan: w.plan, revision: rev0, itemKey: "mia", answer: "MIA-1", opKey: stableKey,
  }).catch((e) => e);
  assert.ok(!(replay instanceof Error), `the identical replay was refused: ${replay?.message}`);
  assert.equal(replay.item_key, "mia");
  const receipts = (await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'answer_firm_setup_item' and op_key = $2",
    [w.firm, stableKey])).rows[0].n;
  assert.equal(receipts, 1, "one op key minted more than one receipt");

  // A PER-ATTEMPT KEY, on the other hand, lets a person go A -> B -> back to A.
  for (const value of ["MIA-2", "MIA-1"]) {
    env = await readSetup(w.admin);
    await answer(w.admin, {
      plan: w.plan, revision: env.revision_token, itemKey: "mia", answer: value, opKey: opk("fsattempt"),
    });
  }
  env = await readSetup(w.admin);
  assert.equal(env.items.find((i) => i.item_key === "mia").answer, "MIA-1",
    "the earlier value could not be restored");
});

// =============================================================================================
// SEAM 4 — THE COMMIT GATE.
// =============================================================================================

cell("p648.commit.outstanding a pending required item is CLR10 required_items_outstanding NAMING it; a complete list commits once", async () => {
  const w = await firmSetupWorld("t7");
  await seed(w.admin);
  let env = await readSetup(w.admin);
  // EIGHT of the twelve catalogue rows are required_for_commit — the segments FIRM_SEGMENTS_V2
  // itself marks `requiredForCommit:true`, minus the excluded bookkeeper_email. The denominator is
  // the CATALOGUE's, counted in the database, never a percentage and never a facet sum.
  assert.equal(env.counter.required_total, 8, "the required denominator is not the catalogue's");
  assert.equal(env.counter.required_answered, 0);

  const err = await assertRaises("CLR10", () => commit(w.admin, {
    plan: w.plan, revision: env.revision_token,
  }), "commit with every required item pending");
  assert.equal(reasonOf(err), "required_items_outstanding");
  assert.deepEqual(detailOf(err).item_keys,
    ["legal_name", "ssm", "entity_type", "address", "turnover", "fye", "framework", "accounting_basis"],
    "the refusal does not NAME the outstanding required items in catalogue order");

  env = await answerAllRequired(w.admin, w.plan);
  assert.equal(env.counter.required_answered, env.counter.required_total);
  assert.deepEqual(env.required_outstanding, []);
  // …the OPTIONAL items are still pending, and that does not block the commit (AC2's second half).
  assert.ok(env.items.some((i) => !i.required && i.state === "pending"));

  const key = opk("fscom");
  const receipt = await commit(w.admin, { plan: w.plan, revision: env.revision_token, opKey: key });
  assert.equal(receipt.state, "committed");
  const p = await planRow(w.plan);
  assert.equal(p.state, "committed");
  assert.equal(p.committed_by, w.admin);
  assert.ok(p.committed_at);

  const replay = await commit(w.admin, { plan: w.plan, revision: env.revision_token, opKey: key });
  assert.deepEqual(replay, receipt, "the commit op_key replay did not return the same receipt");
  const receipts = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where firm_id = $1 and fn = 'commit_firm_setup'",
    [w.firm]);
  assert.equal(receipts.rows[0].n, 1);

  // A committed plan takes no further writes.
  const after = await readSetup(w.admin);
  const errClosed = await assertRaises("CLR10", () => answer(w.admin, {
    plan: w.plan, revision: after.revision_token, itemKey: "mia", answer: "MIA-1",
  }), "answer a committed plan");
  assert.equal(reasonOf(errClosed), "firm_setup_not_open");
});

// =============================================================================================
// SEAM 5 — THE RECORD HALF (AC3), AND THE WALL AROUND IT (D8 / D10).
// =============================================================================================

cell("p648.capture.eligible answering currency / framework / accounting_basis writes a firm-scope knowledge record", async () => {
  const w = await firmSetupWorld("t8");
  await seed(w.admin);
  let env = await readSetup(w.admin);

  for (const key of ["currency", "framework", "accounting_basis"]) {
    const item = env.items.find((i) => i.item_key === key);
    const receipt = await answer(w.admin, {
      plan: w.plan, revision: env.revision_token, itemKey: key, answer: sampleAnswer(item),
    });
    assert.ok(receipt.knowledge, `${key} did not capture a knowledge record`);
    assert.equal(receipt.knowledge.status, "captured");
    env = await readSetup(w.admin);
  }

  const rows = await rootQuery(
    `select knowledge_key, scope_kind, client_id, asserted_by, recorded_via, source_kind, trust, state, value
       from clara.knowledge_records where firm_id = $1 order by knowledge_key`, [w.firm]);
  assert.deepEqual(rows.rows.map((r) => r.knowledge_key),
    ["accounting_basis", "default_currency", "reporting_framework"]);
  for (const r of rows.rows) {
    assert.equal(r.scope_kind, "firm");
    assert.equal(r.client_id, null);
    assert.equal(r.asserted_by, w.admin, "the record does not name the answering administrator");
    assert.equal(r.recorded_via, "human_ui");
    assert.equal(r.source_kind, "user_statement");
    assert.equal(r.trust, "asserted");
    assert.equal(r.state, "live");
  }

  // The read links each item to the record it produced, and renders the confirmed facts.
  const currency = env.items.find((i) => i.item_key === "currency");
  assert.ok(currency.knowledge_record_id, "the read does not link the answered item to its record");
  assert.equal(env.confirmed_facts.length, 3);
  const fact = env.confirmed_facts.find((f) => f.knowledge_key === "default_currency");
  assert.equal(fact.scope_kind, "firm");
  assert.equal(fact.trust, "asserted");
  assert.equal(fact.item_key, "currency");
  assert.equal(fact.authority_current, true);
  assert.equal(fact.asserted_by_active, true);

  // A SECOND answer to the same key is the DESIGNED refusal, not a silent overwrite: a fact on
  // the register is corrected through clara.correct_knowledge.
  const err = await assertRaises("CLR10", () => answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "currency",
    answer: currency.answer_options[1],
  }), "re-answer a captured item");
  assert.equal(reasonOf(err), "knowledge_already_live");
});

cell("p648.capture.ineligible the other nine items write NO knowledge record and move NO catalog row", async () => {
  const w = await firmSetupWorld("t9");
  const keysBefore = await rootQuery("select count(*)::int as n from clara.knowledge_keys");
  const mapBefore = await rootQuery("select count(*)::int as n from clara.knowledge_plan_item_map");
  await seed(w.admin);
  let env = await readSetup(w.admin);

  const ineligible = ["legal_name", "ssm", "entity_type", "address", "mia", "turnover", "tin", "fye", "mpers_eligibility"];
  assert.equal(ineligible.length, 9);
  for (const key of ineligible) {
    const item = env.items.find((i) => i.item_key === key);
    assert.equal(item.knowledge_key, null, `${key} carries a knowledge_key -- D8/D10 keep it a plan item`);
    const receipt = await answer(w.admin, {
      plan: w.plan, revision: env.revision_token, itemKey: key, answer: sampleAnswer(item),
    });
    assert.equal(receipt.knowledge, null, `${key} captured a knowledge record`);
    env = await readSetup(w.admin);
    assert.equal(env.items.find((i) => i.item_key === key).knowledge_record_id, null);
  }

  const records = await rootQuery(
    "select count(*)::int as n from clara.knowledge_records where firm_id = $1", [w.firm]);
  assert.equal(records.rows[0].n, 0, "an identity fact reached the knowledge register (D10 forbids it)");
  assert.equal(env.confirmed_facts.length, 0);
  // …and neither append-only catalog moved (wave rule §1.5: #654 owns both).
  const keysAfter = await rootQuery("select count(*)::int as n from clara.knowledge_keys");
  const mapAfter = await rootQuery("select count(*)::int as n from clara.knowledge_plan_item_map");
  assert.equal(keysAfter.rows[0].n, keysBefore.rows[0].n);
  assert.equal(mapAfter.rows[0].n, mapBefore.rows[0].n);
  // …but the facts ARE durably recorded, with their author and a revision snapshot.
  const legal = await itemRow(w.plan, "legal_name");
  assert.equal(legal.answered_by, w.admin);
  assert.ok(legal.answered_at);
  const snap = await rootQuery(
    `select snapshot from clara.onboarding_plan_revisions
      where plan_id = $1 order by revision_n desc limit 1`, [w.plan]);
  assert.ok(JSON.stringify(snap.rows[0].snapshot).includes("legal_name"),
    "the revision snapshot does not carry the plan items");
});

cell("p648.capture.shadow a firm default reaches a client with no row of its own and is shadowed by one that has", async () => {
  const w = await firmSetupWorld("t10");
  await seed(w.admin);
  const env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "currency", answer: "SGD",
  });

  const list = (sub, client) =>
    humanQuery(sub, "select clara.list_client_knowledge(p_client => $1) as r", [client])
      .then((r) => r.rows[0].r);

  const a = await list(w.bookkeeper, w.client);
  const rowA = a.records.find((r) => r.knowledge_key === "default_currency");
  assert.ok(rowA, "the firm default did not reach a client without its own row");
  assert.equal(rowA.scope_kind, "firm");
  assert.equal(rowA.value, "SGD");

  // A client that states its own value shadows the firm default (0192:1338-1356).
  await humanQuery(w.bookkeeper,
    `select clara.capture_knowledge(p_knowledge_key => 'default_currency', p_value => $1::jsonb,
       p_basis => $2, p_op_key => $3, p_scope_kind => 'client', p_client => $4)`,
    [JSON.stringify("USD"), "this client invoices in USD", opk("fskn"), w.clientB]);
  const b = await list(w.bookkeeper, w.clientB);
  const rowsB = b.records.filter((r) => r.knowledge_key === "default_currency");
  assert.equal(rowsB.length, 1, "both the client exception and the firm default were rendered");
  assert.equal(rowsB[0].scope_kind, "client");
  assert.equal(rowsB[0].value, "USD");
  // …and the first client still sees the firm default.
  const a2 = await list(w.bookkeeper, w.client);
  assert.equal(a2.records.find((r) => r.knowledge_key === "default_currency").scope_kind, "firm");
});

cell("p648.authority.downgrade a confirmed fact's authority is judged by the author's CURRENT rank", async () => {
  const w = await firmSetupWorld("t11");
  await seed(w.admin);
  const env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "framework",
    answer: { framework_label: "MPERS" },
  });
  const before = await readSetup(w.owner);
  const factBefore = before.confirmed_facts.find((f) => f.knowledge_key === "reporting_framework");
  assert.equal(factBefore.authority_current, true);
  assert.equal(factBefore.asserted_by_role, "admin");

  // The owner downgrades the author through the REAL membership door.
  const membership = (await rootQuery(
    "select id from clara.firm_memberships where firm_id = $1 and user_id = $2", [w.firm, w.admin])).rows[0].id;
  await humanQuery(w.owner,
    "select clara.set_member_role(p_membership => $1, p_role => $2, p_op_key => $3)",
    [membership, "bookkeeper", opk("fsrole")]);

  const after = await readSetup(w.owner);
  const factAfter = after.confirmed_facts.find((f) => f.knowledge_key === "reporting_framework");
  assert.equal(factAfter.asserted_by_active, true);
  assert.equal(factAfter.asserted_by_role, "bookkeeper");
  assert.equal(factAfter.authority_current, false,
    "a downgraded author still reads as carrying the authority they no longer hold");
  // The RECORD itself is untouched — authority is a judgement at read time, never a rewrite.
  assert.equal(factAfter.record_id, factBefore.record_id);
  assert.equal(factAfter.state, "live");
});

// =============================================================================================
// SEAM 6 — TENANCY, POSTURE AND THE LIVE-DOOR FIX.
// =============================================================================================

cell("p648.isolation.oracle firm B's admin naming firm A's real plan id is refused byte-identically to a random uuid", async () => {
  const a = await firmSetupWorld("t12a");
  const b = await firmSetupWorld("t12b");
  await seed(a.admin);
  const env = await readSetup(a.admin);

  const foreign = await assertRaises("CLR11", () => answer(b.admin, {
    plan: a.plan, revision: env.revision_token, itemKey: "legal_name", answer: "B & Co",
  }), "answer another firm's REAL plan");
  const absent = await assertRaises("CLR11", () => answer(b.admin, {
    plan: randomUUID(), revision: env.revision_token, itemKey: "legal_name", answer: "B & Co",
  }), "answer a random uuid");
  assert.equal(foreign.message, absent.message, "the refusal is an existence oracle");
  assert.equal(foreign.detail ?? null, absent.detail ?? null);

  for (const [label, call] of [
    ["defer", (plan) => defer(b.admin, { plan, revision: env.revision_token, itemKey: "mia", reason: "x" })],
    ["commit", (plan) => commit(b.admin, { plan, revision: env.revision_token })],
  ]) {
    const f = await assertRaises("CLR11", () => call(a.plan), `${label} another firm's real plan`);
    const r = await assertRaises("CLR11", () => call(randomUUID()), `${label} a random uuid`);
    assert.equal(f.message, r.message, `${label} refusal is an existence oracle`);
  }
  // …and firm A's plan is untouched by any of it.
  const item = await itemRow(a.plan, "legal_name");
  assert.equal(item.state, "pending");
});

cell("p648.acl.census every 0203 name is clara_authenticated-only; no runtime, agent or wake role reaches one", async () => {
  const granted = [
    "clara.seed_firm_setup_plan(text)",
    "clara.answer_firm_setup_item(uuid,uuid,text,jsonb,text)",
    "clara.defer_firm_setup_item(uuid,uuid,text,text,text)",
    "clara.commit_firm_setup(uuid,uuid,text)",
    "clara.get_firm_setup()",
  ];
  const ungranted = [
    "clara._firm_setup_plan(uuid)",
    "clara._assert_firm_setup_answer(text,jsonb)",
    "clara._firm_setup_bump(uuid,uuid)",
  ];
  for (const sig of granted) {
    const r = await rootQuery(
      `select pg_get_userbyid(p.proowner) as owner, p.prosecdef,
              array_to_string(p.proconfig, ',') as cfg,
              array_to_string(p.proacl, ',') as acl
         from pg_proc p where p.oid = $1::regprocedure`, [sig]);
    const row = r.rows[0];
    assert.equal(row.owner, "clara_fn_owner", sig);
    assert.equal(row.prosecdef, true, sig);
    assert.equal(row.cfg, "search_path=clara, pg_temp,plan_cache_mode=force_custom_plan", sig);
    assert.equal(row.acl, "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner", sig);
  }
  for (const sig of ungranted) {
    const r = await rootQuery(
      `select array_to_string(p.proacl, ',') as acl, p.prosecdef,
              array_to_string(p.proconfig, ',') as cfg
         from pg_proc p where p.oid = $1::regprocedure`, [sig]);
    assert.equal(r.rows[0].acl, "clara_fn_owner=X/clara_fn_owner", sig);
    assert.equal(r.rows[0].prosecdef, true, sig);
    assert.equal(r.rows[0].cfg, "search_path=clara, pg_temp", sig);
  }
  const reach = await rootQuery(
    `select p.oid::regprocedure::text as sig, r.rolname
       from pg_proc p cross join (values ('clara_runtime'),('clara_agent_ro'),
              ('clara_wake_interactive'),('clara_wake_proactive')) as r(rolname)
      where p.oid = any ($1::regprocedure[])
        and has_function_privilege(r.rolname, p.oid, 'execute')`,
    [[...granted, ...ungranted]]);
  assert.deepEqual(reach.rows, [], "a machine role can execute a firm setup verb");

  // The catalogue table: FORCE RLS and SELECT to clara_authenticated alone.
  const tbl = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
            array_to_string(c.relacl, ',') as acl
       from pg_class c where c.oid = 'clara.firm_setup_keys'::regclass`);
  assert.equal(tbl.rows[0].relrowsecurity, true);
  assert.equal(tbl.rows[0].relforcerowsecurity, true);
  assert.equal(tbl.rows[0].owner, "clara_fn_owner");
  assert.equal(tbl.rows[0].acl,
    "clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner");

  // …and the runtime-only item writer is untouched.
  const uop = await rootQuery(
    `select array_to_string(p.proacl, ',') as acl from pg_proc p
      where p.oid = 'clara.update_onboarding_plan(uuid,uuid,jsonb,uuid,text)'::regprocedure`);
  assert.equal(uop.rows[0].acl, "clara_fn_owner=X/clara_fn_owner,clara_runtime=X/clara_fn_owner");
});

cell("p648.plans.one_open the partial unique index refuses a second OPEN firm plan", async () => {
  const w = await firmSetupWorld("t14");
  const def = await rootQuery(
    "select pg_get_indexdef(i.indexrelid) as d from pg_index i where i.indexrelid = 'clara.uq_onboarding_plans_one_open_firm'::regclass");
  assert.match(def.rows[0].d, /CREATE UNIQUE INDEX/);
  assert.match(def.rows[0].d, /\(firm_id\)/);
  assert.match(def.rows[0].d, /WHERE \(\(state = 'open'::text\) AND \(scope_kind = 'firm'::text\)\)/);

  // A second open firm plan — exactly what `clara.claim_paid_firm`'s bare `select ... into`
  // (0186:1555-1557) would otherwise resolve arbitrarily — is now a loud unique violation.
  const err = await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[])`, [w.firm, w.owner]).catch((e) => e);
  assert.ok(err instanceof Error, "a second OPEN firm plan was admitted");
  assert.equal(err.code, "23505");
  assert.equal(err.constraint, "uq_onboarding_plans_one_open_firm");

  // …while a CLIENT plan on the same firm is untouched by it (0017's index still governs those).
  const ok = await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, client_id, review_maker, reviewed_at, contributors)
     values ($1,'client',$2,$3, now(), array[$3]::uuid[]) returning id`,
    [w.firm, w.client, w.owner]);
  assert.ok(ok.rows[0].id);
});

cell("p648.workspace.open an uncommitted firm setup gates nothing: a bookkeeper still reads clients, Work and activity", async () => {
  const w = await firmSetupWorld("t15");
  await seed(w.admin);
  const env = await readSetup(w.admin);
  assert.equal(env.state, "open");
  assert.ok(env.required_outstanding.length > 0, "the world was not left mid-setup");

  // The client register the firm home reads, under RLS as a bookkeeper.
  const clients = await humanQuery(w.bookkeeper,
    "select id, name, status from clara.clients order by name");
  assert.ok(clients.rows.length >= 2, "a bookkeeper lost the client register while setup was open");

  // The production Work read.
  const work = await humanQuery(w.bookkeeper, "select clara.list_accounting_work(p_limit => 5) as r");
  assert.ok(work.rows[0].r, "a bookkeeper lost the Work list while setup was open");

  // The production activity read.
  const activity = await humanQuery(w.bookkeeper, "select clara.list_activity(p_limit => 5) as r");
  assert.ok(activity.rows[0].r, "a bookkeeper lost the activity feed while setup was open");

  // …and the firm-altitude attention read the firm home board renders.
  const queue = await humanQuery(w.bookkeeper,
    "select clara.list_review_queue(p_scope => '{}'::jsonb, p_cursor => null, p_limit => 5) as r");
  assert.ok(queue.rows[0].r, "a bookkeeper lost the review queue while setup was open");

  // The client knowledge register, which a firm default would later ride into.
  const knowledge = await humanQuery(w.viewer,
    "select clara.list_client_knowledge(p_client => $1) as r", [w.client]);
  assert.ok(knowledge.rows[0].r, "a viewer lost the client knowledge register while setup was open");
});
