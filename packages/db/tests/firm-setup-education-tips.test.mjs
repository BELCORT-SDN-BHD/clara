// #935 — FIRM SETUP (2/2): three optional education tips, a read-or-later rendering, outside the
// required counters and the audit trail. Migration: 0259_firm_setup_education_tips.sql.
// Frontier-gated on its own STABLE STEM (`firm_setup_education_tips$`), never its number — numbers
// are claimed at merge (packages/db/README.md) — the `firm_setup_user_notes$` idiom verbatim.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, one cell per acceptance criterion in the ticket's Agent Brief:
//   AC1 — `p935.seed.education_kind` — the three tips seed with `item_kind = 'education'` carried
//     straight from the catalogue (never folded onto `todo`) and `required_for_commit = false`.
//   AC2 — `p935.counters.excludes_tips` — an unread tip neither counts toward the required
//     counter, nor appears in `required_outstanding`, nor blocks `commit_firm_setup` — proven by
//     actually committing a plan with all three tips still pending.
//   AC3 — `p935.tip.dismiss_no_audit_trail` — acknowledging AND deferring a tip through
//     `clara.dismiss_firm_setup_tip` each write NO audit row and emit NO domain event (both halves
//     asserted), while the plan item itself reads back settled with the action it recorded.
//   AC3 (idempotency, a residual the migration's own header names) —
//     `p935.tip.dismiss_idempotent` — a repeat call on an already-settled tip is a silent no-op.
//   AC3 (the narrow-door fence, this file's own decision, see 0259's header) —
//     `p935.tip.narrow_door_guards` — `dismiss_firm_setup_tip` refuses a non-education item, and
//     `answer_firm_setup_item`/`defer_firm_setup_item` each refuse an education item, all three
//     `CLR10` named by reason.
//
// AC4 (the firm-home tile ignores tips) is a claim about `clara.get_firm_setup`'s counters and
// `required_outstanding`, which `p935.counters.excludes_tips` already proves; the tile's own
// rendering is `firm-setup-checklist.test.tsx`'s and `firm-setup-walk.spec.ts`'s job.
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona. The world is
// planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — the `firm-setup-applicability.test.mjs` / `firm-setup-user-notes.test.mjs`
// precedent.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertRaises, endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const STEM = "firm_setup_education_tips$";
const TIP_KEYS = ["tip_invite_colleagues", "tip_knowledge_page", "tip_start_from_conversation"];

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 5;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing (the
 *  `firm-setup-user-notes.test.mjs` idiom, verbatim). */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing.
 *  Only the package run, which preloads `firm-setup-education-tips-preintegration-gate.mjs`, turns
 *  the absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_EDUCATION_TIPS === "1") {
    console.warn(`SKIP firm-setup-education-tips: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-education-tips lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #935 firm-setup-education-tips lane is required for a focused run: apply 0259_firm_setup_education_tips.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the root connection, `firm-setup-user-notes.test.mjs`'s own precedent:
// the subject is one new door plus two recut ones, and going through create_firm/claim_paid_firm
// would only add ways to fail for reasons that are not the subject.
// ---------------------------------------------------------------------------------------------
async function firmSetupWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fset_${suffix}`]))
    .rows[0].id;
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `fset admin ${suffix}`, `fset_admin_${suffix}@rig.test`]);
  await rootQuery(
    "insert into clara.firm_memberships(firm_id, user_id, role, status) values ($1,$2,'admin','active')",
    [firm, admin]);
  /** The firm-scope plan exactly as `clara._create_firm_core` opens one (0145:492-494). */
  const plan = (await rootQuery(
    `insert into clara.onboarding_plans(firm_id, scope_kind, review_maker, reviewed_at, contributors)
     values ($1,'firm',$2, now(), array[$2]::uuid[]) returning id`,
    [firm, admin])).rows[0].id;
  await rootQuery(
    `insert into clara.onboarding_plan_revisions(plan_id, revision_n, snapshot)
     values ($1, 1, clara._onboarding_plan_snapshot($1))`,
    [plan]);
  return { firm, admin, plan };
}

const seed = (sub, opKey) =>
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [opKey ?? opk("fsetseed")])
    .then((r) => r.rows[0].r);
const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);
const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("fsetans")],
  ).then((r) => r.rows[0].r);
const defer = (sub, o) =>
  humanQuery(sub,
    `select clara.defer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_reason => $4, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, o.reason, o.opKey ?? opk("fsetdef")],
  ).then((r) => r.rows[0].r);
const commit = (sub, o) =>
  humanQuery(sub,
    "select clara.commit_firm_setup(p_plan => $1, p_expected_revision => $2, p_op_key => $3) as r",
    [o.plan, o.revision, o.opKey ?? opk("fsetcom")],
  ).then((r) => r.rows[0].r);
const dismiss = (sub, o) =>
  humanQuery(sub,
    "select clara.dismiss_firm_setup_tip(p_plan => $1, p_item_key => $2, p_action => $3) as r",
    [o.plan, o.itemKey, o.action],
  ).then((r) => r.rows[0].r);

const itemOf = (env, key) => env.items.find((i) => i.item_key === key);
const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};

/** Answer every REQUIRED catalogue row (never a tip: `required` is false for all three), in
 *  catalogue order, re-reading the CAS token each time. Returns the final envelope. */
async function answerAllRequired(sub, plan) {
  let env = await readSetup(sub);
  for (const item of env.items.filter((i) => i.required)) {
    if (item.state !== "pending" && item.state !== "unseeded") continue;
    const value =
      item.answer_shape === "choice" ? item.answer_options[0]
      : item.answer_shape === "month" ? 6
      : item.answer_shape === "long_text" ? "1 Jalan Rig\nKuala Lumpur"
      : item.answer_shape === "labelled_object"
        ? { [item.answer_field]: item.answer_options.length > 0 ? item.answer_options[0] : "MPERS" }
        : `rig ${item.item_key}`;
    await answer(sub, { plan, revision: env.revision_token, itemKey: item.item_key, answer: value });
    env = await readSetup(sub);
  }
  return env;
}

const totalAudit = (firm) =>
  rootQuery("select count(*)::int as n from clara.audit_log where firm_id = $1", [firm]).then((r) => r.rows[0].n);
const totalEvents = (firm) =>
  rootQuery("select count(*)::int as n from clara.domain_events where firm_id = $1", [firm]).then((r) => r.rows[0].n);

// =============================================================================================
// AC1 — the three tips seed with the catalogue's OWN item_kind, never folded onto `todo`.
// =============================================================================================

cell("p935.seed.education_kind the three tips seed with item_kind carried straight from the catalogue, required_for_commit false, in the tips group", async () => {
  const w = await firmSetupWorld("t1");
  const receipt = await seed(w.admin);
  assert.equal(receipt.catalogue_total, 15, "the twelve accounting rows plus the three tips");
  // All three tips have no dependency at all -- `_firm_setup_applicability` returns `applicable`
  // for any item_key it does not name -- so a FIRST seed on an empty plan seeds every one of them.
  for (const key of TIP_KEYS) {
    const row = (await rootQuery(
      "select item_kind, required_for_commit, state from clara.onboarding_plan_items where plan_id = $1 and item_key = $2",
      [w.plan, key])).rows[0];
    assert.ok(row, `${key} was not seeded`);
    assert.equal(row.item_kind, "education", `${key}'s plan item does not carry the catalogue's own kind`);
    assert.equal(row.required_for_commit, false);
    assert.equal(row.state, "pending");
  }

  const env = await readSetup(w.admin);
  for (const key of TIP_KEYS) {
    const item = itemOf(env, key);
    assert.ok(item, `${key} is missing from get_firm_setup`);
    assert.equal(item.kind, "education");
    assert.equal(item.group_key, "tips");
    assert.equal(item.required, false);
    assert.equal(item.knowledge_key, null, "a tip must never carry a knowledge_key");
    assert.ok(item.note && item.note.length > 0, `${key} rendered a blank note`);
  }
  assert.equal(itemOf(env, "tip_invite_colleagues").question, "Invite your colleagues");
});

// =============================================================================================
// AC2 — a tip never counts, never blocks completion, and never appears as outstanding.
// =============================================================================================

cell("p935.counters.excludes_tips an unread tip neither counts toward required_total/required_answered nor appears in required_outstanding, and does not block commit_firm_setup", async () => {
  const w = await firmSetupWorld("t2");
  await seed(w.admin);
  let env = await readSetup(w.admin);
  for (const key of TIP_KEYS) assert.equal(itemOf(env, key).state, "pending");
  const before = { total: env.counter.required_total, answered: env.counter.required_answered };

  // Answering every REQUIRED row leaves the three tips untouched and still pending.
  env = await answerAllRequired(w.admin, w.plan);
  assert.equal(env.counter.required_answered, env.counter.required_total,
    "every required row is answered, tips aside");
  assert.deepEqual(env.required_outstanding, []);
  for (const key of TIP_KEYS) {
    assert.equal(itemOf(env, key).state, "pending", `${key} must stay untouched by answering the required rows`);
    assert.ok(!env.required_outstanding.includes(key), `${key} must never appear as outstanding`);
  }
  // The denominator did not move by seeding or answering the three tips -- it is exactly the
  // catalogue's own eight-row required set, unmoved by fifteen catalogue rows now existing.
  assert.equal(env.counter.required_total, before.total,
    "the required_total denominator moved -- a tip must never be counted");

  // COMMIT SUCCEEDS with all three tips still pending -- the strongest form of "never blocks
  // completion": not merely "the counter reads full", but the gate itself admits it.
  const receipt = await commit(w.admin, { plan: w.plan, revision: env.revision_token });
  assert.equal(receipt.state, "committed");
  const after = await readSetup(w.admin);
  for (const key of TIP_KEYS) {
    assert.equal(itemOf(after, key).state, "pending", `${key} must survive the commit untouched`);
  }
});

// =============================================================================================
// AC3 — acknowledging or deferring a tip writes NO audit row and emits NO domain event.
// =============================================================================================

cell("p935.tip.dismiss_no_audit_trail acknowledging one tip and deferring another each write no audit row and emit no domain event, and the plan item reads back settled", async () => {
  const w = await firmSetupWorld("t3");
  await seed(w.admin);

  // (a) "Got it" — acknowledged.
  const auditBefore = await totalAudit(w.firm);
  const eventsBefore = await totalEvents(w.firm);
  const ack = await dismiss(w.admin, { plan: w.plan, itemKey: "tip_invite_colleagues", action: "acknowledged" });
  assert.equal(ack.state, "answered");
  assert.equal(ack.tip_action, "acknowledged");
  assert.equal(await totalAudit(w.firm), auditBefore, "acknowledging a tip wrote an audit row");
  assert.equal(await totalEvents(w.firm), eventsBefore, "acknowledging a tip emitted a domain event");

  // (b) "Later" — deferred, no reason parameter exists on this door at all.
  const auditBefore2 = await totalAudit(w.firm);
  const eventsBefore2 = await totalEvents(w.firm);
  const later = await dismiss(w.admin, { plan: w.plan, itemKey: "tip_knowledge_page", action: "deferred" });
  assert.equal(later.state, "deferred");
  assert.equal(later.tip_action, "deferred");
  assert.equal(await totalAudit(w.firm), auditBefore2, "deferring a tip wrote an audit row");
  assert.equal(await totalEvents(w.firm), eventsBefore2, "deferring a tip emitted a domain event");

  // The plan item itself is what "remembered" the act -- read back through the catalog, not the
  // door's own echo, and through the production read.
  const rows = (await rootQuery(
    "select item_key, state, answer, answered_by from clara.onboarding_plan_items where plan_id = $1 and item_key = any($2::text[])",
    [w.plan, ["tip_invite_colleagues", "tip_knowledge_page"]])).rows;
  const byKey = Object.fromEntries(rows.map((r) => [r.item_key, r]));
  assert.equal(byKey.tip_invite_colleagues.state, "answered");
  assert.deepEqual(byKey.tip_invite_colleagues.answer, { tip_action: "acknowledged" });
  assert.equal(byKey.tip_invite_colleagues.answered_by, w.admin);
  assert.equal(byKey.tip_knowledge_page.state, "deferred");
  assert.deepEqual(byKey.tip_knowledge_page.answer, { tip_action: "deferred" });

  const env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tip_invite_colleagues").state, "answered");
  assert.equal(itemOf(env, "tip_knowledge_page").state, "deferred");
  // …and it is STILL outside the counters and never in Activity's own event stream, even settled.
  assert.ok(!env.required_outstanding.includes("tip_invite_colleagues"));
  const events = await rootQuery(
    "select event_type from clara.domain_events where firm_id = $1 order by seq", [w.firm]);
  assert.deepEqual(events.rows.map((r) => r.event_type).filter((t) => t.startsWith("firm_setup.")),
    ["firm_setup.seeded"], "a tip dismissal must never register in the firm_setup.* event stream");
});

// =============================================================================================
// AC3 residual — a repeat dismissal is idempotent, never an error and never a second write.
// =============================================================================================

cell("p935.tip.dismiss_idempotent a repeat dismissal on an already-settled tip is a silent no-op", async () => {
  const w = await firmSetupWorld("t4");
  await seed(w.admin);
  const first = await dismiss(w.admin, { plan: w.plan, itemKey: "tip_start_from_conversation", action: "acknowledged" });
  assert.equal(first.state, "answered");
  const answeredAtFirst = (await rootQuery(
    "select answered_at from clara.onboarding_plan_items where plan_id = $1 and item_key = $2",
    [w.plan, "tip_start_from_conversation"])).rows[0].answered_at;

  // The SAME action again -- no error, and the row's own answered_at does not move.
  const replay = await dismiss(w.admin, { plan: w.plan, itemKey: "tip_start_from_conversation", action: "acknowledged" });
  assert.equal(replay.state, "answered");
  assert.equal(replay.tip_action, "acknowledged");

  // A DIFFERENT action on an already-settled tip also does not overwrite it -- the read echoes
  // the tip's ACTUAL settled state, never the action just requested.
  const differing = await dismiss(w.admin, { plan: w.plan, itemKey: "tip_start_from_conversation", action: "deferred" });
  assert.equal(differing.state, "answered", "a settled tip must not be re-settled to a different state");
  assert.equal(differing.tip_action, "deferred", "the echoed action is what was requested this call, not a lie");

  const answeredAtAfter = (await rootQuery(
    "select answered_at, state, answer from clara.onboarding_plan_items where plan_id = $1 and item_key = $2",
    [w.plan, "tip_start_from_conversation"])).rows[0];
  assert.deepEqual(answeredAtAfter.answered_at, answeredAtFirst, "a repeat call rewrote the settled row");
  assert.equal(answeredAtAfter.state, "answered");
  assert.deepEqual(answeredAtAfter.answer, { tip_action: "acknowledged" });
});

// =============================================================================================
// AC3's narrow-door fence (0259's own decision, see its header) — neither door may cross into the
// other's territory.
// =============================================================================================

cell("p935.tip.narrow_door_guards dismiss_firm_setup_tip refuses a non-tip; answer/defer each refuse a tip", async () => {
  const w = await firmSetupWorld("t5");
  await seed(w.admin);
  const env = await readSetup(w.admin);

  const err1 = await assertRaises("CLR10", () => dismiss(w.admin, {
    plan: w.plan, itemKey: "mia", action: "acknowledged",
  }), "dismiss_firm_setup_tip against an accounting item");
  assert.equal(reasonOf(err1), "firm_setup_item_not_a_tip");

  const auditBefore = await totalAudit(w.firm);
  const err2 = await assertRaises("CLR10", () => answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "tip_invite_colleagues", answer: "nonsense",
  }), "answer_firm_setup_item against a tip");
  assert.equal(reasonOf(err2), "firm_setup_item_is_a_tip");

  const err3 = await assertRaises("CLR10", () => defer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "tip_knowledge_page", reason: "later",
  }), "defer_firm_setup_item against a tip");
  assert.equal(reasonOf(err3), "firm_setup_item_is_a_tip");

  // Neither refused attempt left a mark: the tip is still pending, and neither refusal wrote an
  // audit row (the door's own CLR10s raise before any write, same as every other named refusal).
  assert.equal(await totalAudit(w.firm), auditBefore);
  const after = await readSetup(w.admin);
  assert.equal(itemOf(after, "tip_invite_colleagues").state, "pending");
  assert.equal(itemOf(after, "tip_knowledge_page").state, "pending");
});
