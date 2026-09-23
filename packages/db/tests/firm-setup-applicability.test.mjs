// #891 — FIRM SETUP APPLICABILITY PREDICATES: an item that does not apply to this firm is not
// asked. Migration: 0257_firm_setup_applicability.sql. Frontier-gated on its own STABLE STEM
// (`firm_setup_applicability$`), never its number — numbers are claimed at merge
// (packages/db/README.md) — the `firm_setup_polish$` / `onboarding_plan_firm_uniqueness$` idiom.
//
// CONTRACT-BLIND against the migration's own tail: its `raise notice … OK` describes one apply,
// this file describes the live catalog (packages/db/README.md, "Migration and deployment
// behavior").
//
// WHAT IS UNDER TEST, one cell per acceptance criterion, gated on the ORIGINAL `firm_setup_
// applicability$` stem (0257) alone -- `mpers_eligibility`'s own behaviour is UNTOUCHED by #1032:
//   AC1 — `p891.mpers.entity_type` — a Sdn Bhd is seeded (asked) the eligibility item through the
//     doors; another entity type is not, and stays unseeded across a later reconciliation.
//   AC4 — `p891.answer.survives` — an item answered before it became inapplicable keeps its
//     answer; only its reported applicability changes.
//
// #1032 (riders wave 4, lane 06) — Owner's ruling 2026-09-23, Option A: the TIN item is seeded for
// EVERY firm now, required or optional from the turnover answer rather than seeded-or-not. This
// REWRITES the two cells #891 pinned on the old "seeded only once applicable" shape for `tin`
// (formerly `p891.tin.turnover` and `p891.counter.excludes`) and adds one more, ALL gated on their
// OWN stem (`firm_setup_tin_required$`, 0311) rather than 0257's alone — a database carrying 0257
// but not yet 0311 must skip these cells loudly rather than assert a shape `tin` can no longer
// take (the `activity-feed.test.mjs` multi-stem-in-one-file idiom: "0183, gated on its OWN stem
// rather than 0181's"). `mpers_eligibility`'s own two cells above are left byte-for-byte and need
// no such gate, because #1032 leaves their subject untouched:
//   AC1/AC2 — `p1032.tin.always_seeded_required_or_optional` — tin is seeded (never unseeded)
//     whatever the turnover answer; it reads optional while turnover is unanswered or below the
//     threshold and required once turnover makes MyInvois mandatory; the required counter and
//     `required_outstanding` follow the SAME verdict, and their arithmetic invariant
//     (`required_total - required_answered === required_outstanding.length`) holds throughout.
//   AC3 — `p1032.tin.flip_keeps_answer_both_ways` — an already-recorded TIN answer survives a
//     turnover correction in EITHER direction; only the required marking moves.
//   AC2/defer — `p1032.commit.refuses_until_tin_answered_when_required` — the commit door refuses
//     until a dynamically-required TIN is answered (and admits a commit that leaves an optional
//     one unanswered); the defer door refuses to skip TIN while it reads required.
//
// ROLE DISCIPLINE: every door call runs through `humanQuery` as a named admin persona. The world is
// planted through the ROOT connection exactly as `clara._create_firm_core` plants a firm plan
// (0145:492-494) — the `firm-setup-polish.test.mjs` precedent — because the subject here is the
// applicability door and its callers, not firm creation or membership.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertRaises, endPool, humanQuery, opk, rootQuery } from "./rig-fixtures.mjs";

const STEM = "firm_setup_applicability$";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 2;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing (the
 *  `onboarding-plan-firm-uniqueness.test.mjs` idiom, verbatim). */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

// #1032 — the TIN required/optional recut lives in ITS OWN migration (0311), a separate frontier
// from 0257's above: a slice-frontier CI leg can be pinned AT 0257, before 0311 lands, and the
// cells below must skip cleanly there rather than assert a shape `tin` can no longer take.
const TIN_REQUIRED_STEM = "firm_setup_tin_required$";
let tinRequiredReady = false;
let tinRequiredExecuted = 0;
const TIN_REQUIRED_EXPECTED_CELLS = 3;

async function tinRequiredLaneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [TIN_REQUIRED_STEM]);
  return r.rows[0].n > 0;
}

before(async () => {
  ready = await laneReady();
  tinRequiredReady = await tinRequiredLaneReady();
});
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  if (tinRequiredReady) {
    assert.equal(tinRequiredExecuted, TIN_REQUIRED_EXPECTED_CELLS,
      `expected ${TIN_REQUIRED_EXPECTED_CELLS} tin-required cells to run, ${tinRequiredExecuted} did`);
  }
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing.
 *  Only the package run, which preloads `firm-setup-applicability-preintegration-gate.mjs`, turns
 *  the absence into a loud skip. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_APPLICABILITY === "1") {
    console.warn(`SKIP firm-setup-applicability: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-applicability lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #891 firm-setup-applicability lane is required for a focused run: apply 0257_firm_setup_applicability.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

/** The #1032 counterpart of `gate` above, for the tin-required stem (0311) alone. */
function gateTinRequired(t) {
  if (tinRequiredReady) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_SETUP_TIN_REQUIRED === "1") {
    console.warn(`SKIP firm-setup-tin-required: no ${TIN_REQUIRED_STEM} migration applied (explicit pre-integration run).`);
    t.skip("firm-setup-tin-required lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #1032 firm-setup-tin-required lane is required for a focused run: apply 0311_firm_setup_tin_required.sql");
}

function cellTinRequired(name, fn) {
  test(name, async (t) => {
    if (gateTinRequired(t)) return;
    tinRequiredExecuted += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// THE WORLD. Minted through the root connection, `firm-setup-polish.test.mjs`'s own precedent: the
// subject is the applicability door and its two callers, and going through create_firm/
// claim_paid_firm would only add ways to fail for reasons that are not the subject.
// ---------------------------------------------------------------------------------------------
async function firmSetupWorld(tag) {
  const suffix = `${tag}_${randomUUID().slice(0, 8)}`;
  const firm = (await rootQuery("insert into clara.firms(name) values ($1) returning id", [`fsa_${suffix}`]))
    .rows[0].id;
  const admin = randomUUID();
  await rootQuery(
    "insert into clara.users(id, display_name, email, is_agent) values ($1,$2,$3,false)",
    [admin, `fsa admin ${suffix}`, `fsa_admin_${suffix}@rig.test`]);
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
  humanQuery(sub, "select clara.seed_firm_setup_plan(p_op_key => $1) as r", [opKey]).then((r) => r.rows[0].r);
const readSetup = (sub) =>
  humanQuery(sub, "select clara.get_firm_setup() as r", []).then((r) => r.rows[0].r);
const answer = (sub, o) =>
  humanQuery(sub,
    `select clara.answer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_answer => $4::jsonb, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, JSON.stringify(o.answer), o.opKey ?? opk("fsaans")],
  ).then((r) => r.rows[0].r);
/** #1032 — the two doors `p1032.commit.refuses_until_tin_answered_when_required` drives. */
const commitSetup = (sub, o) =>
  humanQuery(sub,
    `select clara.commit_firm_setup(p_plan => $1, p_expected_revision => $2, p_op_key => $3) as r`,
    [o.plan, o.revision, o.opKey ?? opk("fsacommit")],
  ).then((r) => r.rows[0].r);
const deferItem = (sub, o) =>
  humanQuery(sub,
    `select clara.defer_firm_setup_item(p_plan => $1, p_expected_revision => $2,
       p_item_key => $3, p_reason => $4, p_op_key => $5) as r`,
    [o.plan, o.revision, o.itemKey, o.reason, o.opKey ?? opk("fsadefer")],
  ).then((r) => r.rows[0].r);

const itemOf = (env, key) => env.items.find((i) => i.item_key === key);
/** `firm-setup.test.mjs`'s own idiom, restated here: the refusal's typed discriminant lives in
 *  DETAIL as a JSON object, never in the message text alone. */
const reasonOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
};
const detailOf = (err) => {
  try { return JSON.parse(err.detail ?? "{}"); } catch { return {}; }
};
/** The invariant every cell below re-checks: the SAME predicate drives the counter and the named
 *  outstanding list, so their arithmetic can never disagree (0259's own invariant, #1032's recut
 *  keeps it true over a set that can now include tin dynamically). */
const agreeInvariant = (env, where) => assert.equal(
  env.counter.required_total - env.counter.required_answered, env.required_outstanding.length,
  `${where}: the counter says ${env.counter.required_total - env.counter.required_answered} required facts are missing, the outstanding list names ${env.required_outstanding.length}`);

// =============================================================================================
// AC1 — mpers_eligibility follows entity_type, through the doors.
// =============================================================================================

cell("p891.mpers.entity_type a Sdn Bhd is seeded the eligibility item through the doors; another entity type stays unseeded", async () => {
  const sdnBhd = await firmSetupWorld("t1a");
  await seed(sdnBhd.admin, opk("fsaseed1a"));
  let env = await readSetup(sdnBhd.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "undetermined",
    "entity_type is unanswered -- the eligibility screen cannot be determined yet");
  assert.equal(itemOf(env, "mpers_eligibility").state, "unseeded");

  await answer(sdnBhd.admin, {
    plan: sdnBhd.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sdn_bhd",
  });
  await seed(sdnBhd.admin, opk("fsaseed1b"));
  env = await readSetup(sdnBhd.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "applicable");
  assert.equal(itemOf(env, "mpers_eligibility").state, "pending",
    "the reconciliation after entity_type is answered must seed the now-applicable item");

  const soleProp = await firmSetupWorld("t1b");
  await seed(soleProp.admin, opk("fsaseed1c"));
  env = await readSetup(soleProp.admin);
  await answer(soleProp.admin, {
    plan: soleProp.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sole_prop",
  });
  await seed(soleProp.admin, opk("fsaseed1d"));
  env = await readSetup(soleProp.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "inapplicable");
  assert.equal(itemOf(env, "mpers_eligibility").state, "unseeded",
    "a non-Sdn-Bhd firm must never have the eligibility screen seeded");
});

// =============================================================================================
// #1032 AC1/AC2 — tin is seeded for EVERY firm; it reads optional while turnover is unanswered or
// below the threshold, and required once turnover makes MyInvois mandatory. The required counter
// and required_outstanding follow the SAME verdict throughout.
// =============================================================================================

cellTinRequired("p1032.tin.always_seeded_required_or_optional tin is seeded whatever the turnover answer, and reads required or optional from it", async () => {
  // Firm A: seed with turnover still unanswered. tin is SEEDED (never unseeded) and OPTIONAL.
  const unanswered = await firmSetupWorld("t1032a");
  await seed(unanswered.admin, opk("fsatr1a"));
  let env = await readSetup(unanswered.admin);
  assert.equal(itemOf(env, "tin").state, "pending",
    "tin must be seeded the moment the plan is reconciled, even before turnover is answered");
  assert.equal(itemOf(env, "tin").applicability, "optional");
  assert.equal(itemOf(env, "tin").required, false);
  assert.equal(env.counter.required_total, 8, "the eight rows the catalogue marks required_for_commit -- tin optional does not join them");
  assert.ok(!env.required_outstanding.includes("tin"));
  agreeInvariant(env, "a freshly seeded plan, turnover unanswered");

  // Firm B: turnover answered BELOW the RM1M threshold. tin stays seeded and optional.
  const below = await firmSetupWorld("t1032b");
  await seed(below.admin, opk("fsatr1b"));
  env = await readSetup(below.admin);
  await answer(below.admin, { plan: below.plan, revision: env.revision_token, itemKey: "turnover", answer: "<RM1M" });
  env = await readSetup(below.admin);
  assert.equal(itemOf(env, "tin").state, "pending", "a sub-threshold firm must still have tin seeded and answerable");
  assert.equal(itemOf(env, "tin").applicability, "optional");
  assert.equal(itemOf(env, "tin").required, false);
  assert.equal(env.counter.required_total, 8, "an optional tin never joins the denominator");
  assert.equal(env.counter.required_answered, 1, "turnover itself is now answered");
  assert.ok(!env.required_outstanding.includes("tin"), "an optional row is never named as outstanding");
  agreeInvariant(env, "turnover answered below the threshold");

  // A sub-threshold firm can still VOLUNTEER its TIN -- the ticket's own reason for this file:
  // the answer form is offered in both cases.
  const answered = await answer(below.admin, { plan: below.plan, revision: env.revision_token, itemKey: "tin", answer: "C0000000001" });
  env = await readSetup(below.admin);
  assert.equal(itemOf(env, "tin").state, "answered");
  assert.equal(itemOf(env, "tin").answer, "C0000000001");
  assert.equal(itemOf(env, "tin").required, false, "a voluntary answer does not make the item required");
  assert.equal(answered.revision_token, env.revision_token);

  // Firm C: turnover answered AT/ABOVE the threshold. tin is seeded and REQUIRED, and joins the
  // denominator (and required_outstanding, while it is still pending).
  const above = await firmSetupWorld("t1032c");
  await seed(above.admin, opk("fsatr1c"));
  env = await readSetup(above.admin);
  await answer(above.admin, { plan: above.plan, revision: env.revision_token, itemKey: "turnover", answer: "RM1M-5M" });
  env = await readSetup(above.admin);
  assert.equal(itemOf(env, "tin").state, "pending", "tin was already seeded before turnover ever became answerable");
  assert.equal(itemOf(env, "tin").applicability, "required");
  assert.equal(itemOf(env, "tin").required, true);
  assert.equal(env.counter.required_total, 9, "a dynamically-required tin joins the denominator beside the eight static rows");
  assert.equal(env.counter.required_answered, 1, "turnover itself is now answered");
  assert.ok(env.required_outstanding.includes("tin"), "a required, pending row must be named as outstanding");
  agreeInvariant(env, "turnover answered at the threshold, tin required and pending");

  await answer(above.admin, { plan: above.plan, revision: env.revision_token, itemKey: "tin", answer: "C0000000002" });
  env = await readSetup(above.admin);
  assert.equal(env.counter.required_total, 9);
  assert.equal(env.counter.required_answered, 2, "answering the now-required tin moves the numerator");
  assert.ok(!env.required_outstanding.includes("tin"), "an answered required row leaves the outstanding list");
  agreeInvariant(env, "the required tin answered");
});

// =============================================================================================
// #1032 AC3 — a TIN answer survives a turnover correction in EITHER direction; only the required
// marking moves.
// =============================================================================================

cellTinRequired("p1032.tin.flip_keeps_answer_both_ways an already-recorded TIN answer survives a turnover flip in either direction; only the required marking moves", async () => {
  const w = await firmSetupWorld("t1032d");
  await seed(w.admin, opk("fsatr2a"));
  let env = await readSetup(w.admin);

  // Answered while OPTIONAL (turnover still unanswered).
  await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "tin", answer: "C1234567890" });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").required, false);
  assert.equal(itemOf(env, "tin").answer, "C1234567890");

  // Turnover answered ABOVE the threshold: tin flips to required, keeps its answer.
  await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "turnover", answer: "RM1M-5M" });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").applicability, "required");
  assert.equal(itemOf(env, "tin").required, true);
  assert.equal(itemOf(env, "tin").state, "answered", "the plan item's own state is untouched by the flip");
  assert.equal(itemOf(env, "tin").answer, "C1234567890", "the earlier answer survives the flip to required");

  // Turnover corrected BACK below the threshold: tin flips back to optional, STILL keeps its
  // answer -- the flip touches only the marking, in either direction (AC3, both ways).
  await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "turnover", answer: "<RM1M" });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "tin").applicability, "optional");
  assert.equal(itemOf(env, "tin").required, false);
  assert.equal(itemOf(env, "tin").state, "answered");
  assert.equal(itemOf(env, "tin").answer, "C1234567890", "the earlier answer survives the flip back to optional");
});

// =============================================================================================
// #1032 AC2/defer — the commit door refuses until a dynamically-required TIN is answered (and
// admits a commit that leaves an OPTIONAL tin unanswered); the defer door refuses to skip TIN
// while it reads required.
// =============================================================================================

cellTinRequired("p1032.commit.refuses_until_tin_answered_when_required the commit door refuses a dynamically-required tin left pending, and the defer door refuses to skip it", async () => {
  // Answer every STATICALLY required item (the eight `required_for_commit` rows the catalogue
  // marks, tin excluded), a value of the shape the CATALOGUE declares -- `firm-setup.test.mjs`'s
  // own `sampleAnswer`/`answerAllRequired` idiom, restated here rather than imported (this file's
  // own `answer`/`readSetup` wrappers take named, not positional, args). `turnoverAnswer` decides
  // which of the two worlds (mandatory / exempt) this call builds.
  const sampleAnswer = (item) => {
    switch (item.answer_shape) {
      case "choice": return item.item_key === "entity_type" ? "sole_prop" : item.answer_options[0];
      case "month": return 6;
      case "long_text": return "1 Jalan Rig\nKuala Lumpur";
      case "labelled_object":
        return { [item.answer_field]: item.answer_options.length > 0 ? item.answer_options[0] : "MPERS" };
      default: return `rig ${item.item_key}`;
    }
  };
  const answerEveryStaticRequired = async (w, turnoverAnswer) => {
    let env = await readSetup(w.admin);
    // Computed BEFORE turnover is answered: the eight static rows, tin (required=false here)
    // deliberately excluded -- the whole point of this cell is to leave it pending on purpose.
    const staticRequired = env.items.filter((i) => i.required);
    for (const item of staticRequired) {
      const value = item.item_key === "turnover" ? turnoverAnswer : sampleAnswer(item);
      await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: item.item_key, answer: value });
      env = await readSetup(w.admin);
    }
    return env;
  };

  // Turnover makes MyInvois mandatory: tin is required, and left unanswered.
  const w = await firmSetupWorld("t1032e");
  await seed(w.admin, opk("fsatr3a"));
  let env = await answerEveryStaticRequired(w, "RM1M-5M");
  assert.equal(itemOf(env, "tin").required, true);
  assert.equal(itemOf(env, "tin").state, "pending");
  assert.ok(env.required_outstanding.includes("tin"));

  // The DEFER door refuses to skip a dynamically-required item -- the same refusal it already
  // gives a statically-required one (0218 §E.3), never widened for it before #1032.
  const deferErr = await assertRaises("CLR10",
    () => deferItem(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "tin", reason: "not ready yet" }),
    "defer of a dynamically-required tin");
  assert.equal(reasonOf(deferErr), "firm_setup_item_required");

  // The COMMIT door refuses while tin is required and pending.
  const commitErr = await assertRaises("CLR10",
    () => commitSetup(w.admin, { plan: w.plan, revision: env.revision_token }),
    "commit with a required, pending tin");
  assert.equal(reasonOf(commitErr), "required_items_outstanding");
  assert.ok(detailOf(commitErr).item_keys?.includes("tin"), "the refusal does not NAME tin among the outstanding items");

  // Once tin is answered, commit succeeds.
  const answered = await answer(w.admin, { plan: w.plan, revision: env.revision_token, itemKey: "tin", answer: "C9999999999" });
  const committed = await commitSetup(w.admin, { plan: w.plan, revision: answered.revision_token });
  assert.equal(committed.state, "committed");

  // A SEPARATE firm, turnover below the threshold: tin stays optional and pending, and commit
  // succeeds WITHOUT it ever being answered -- the ticket's own "the commit door ignores it".
  const below = await firmSetupWorld("t1032f");
  await seed(below.admin, opk("fsatr3b"));
  const belowEnv = await answerEveryStaticRequired(below, "<RM1M");
  assert.equal(itemOf(belowEnv, "tin").required, false);
  assert.equal(itemOf(belowEnv, "tin").state, "pending", "an optional tin is left unanswered on purpose");
  assert.ok(!belowEnv.required_outstanding.includes("tin"));
  const belowCommitted = await commitSetup(below.admin, { plan: below.plan, revision: belowEnv.revision_token });
  assert.equal(belowCommitted.state, "committed");
});

// =============================================================================================
// AC4 — an item answered before it became inapplicable keeps its answer.
// =============================================================================================

cell("p891.answer.survives an item answered before it became inapplicable keeps its answer and is marked inapplicable, not deleted", async () => {
  const w = await firmSetupWorld("t4");
  await seed(w.admin, opk("fsaseed4a"));
  let env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sdn_bhd",
  });
  await seed(w.admin, opk("fsaseed4b"));
  env = await readSetup(w.admin);
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "mpers_eligibility",
    answer: { determination: "eligible" },
  });
  env = await readSetup(w.admin);
  assert.equal(itemOf(env, "mpers_eligibility").applicability, "applicable");
  assert.deepEqual(itemOf(env, "mpers_eligibility").answer, { determination: "eligible" });
  assert.equal(itemOf(env, "mpers_eligibility").state, "answered");

  // entity_type is corrected away from sdn_bhd -- mpers_eligibility's OWN row is never touched.
  await answer(w.admin, {
    plan: w.plan, revision: env.revision_token, itemKey: "entity_type", answer: "sole_prop",
  });
  env = await readSetup(w.admin);
  const mpers = itemOf(env, "mpers_eligibility");
  assert.equal(mpers.applicability, "inapplicable", "re-derived live, off the corrected entity_type");
  assert.equal(mpers.state, "answered", "the plan item's own state is untouched -- nothing deletes it");
  assert.deepEqual(mpers.answer, { determination: "eligible" }, "the earlier answer survives the correction");
  assert.equal(mpers.required, false,
    "the per-item required flag is the catalogue's own required_for_commit -- false for a conditional row whatever its applicability, so the surface keeps offering its skip control");
});
