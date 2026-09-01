// 裁-21 PR-c — the interview finally CONSUMES `coa_seed_decision`, and it does so as
// clientOnboarding_v4 (a new frozen export + a registry repoint), never as an edit to v3.
//
// Design of record: docs/plan/active/coa-template-design.md D-7, D-13 item 4 ·
// docs/plan/active/coa-template-gate-record.md Q9 (RULED 裁-23) ·
// docs/plan/active/coa-template-annexes.md Annex E (the non-goals), Annex G (PR-c) ·
// docs/plan/active/fa7b-gate-record.md (the five materials playbooks).
// Modules: packages/runtime/workflows/interview.v3.questions.ts · clientOnboarding.v4.ts.
//
// WHAT THIS FILE HAS TO PROVE, and the one thing it deliberately proves NEGATIVELY:
//   * the v3 inventory is v2 with EXACTLY ONE segment swapped, by object IDENTITY and in order;
//   * v3's own inventory (CLIENT_SEGMENTS_V2) is untouched, so a parked v3 run finishes on the
//     semantics it started with (constraint 9);
//   * the DB contract -- item_key `coa_seed_decision`, `required_for_commit: true` -- survives,
//     because commit_client_onboarding reads it BY NAME;
//   * both answer directions produce the consumption item, and they DIFFER;
//   * the registry points `clientOnboarding` at v4 while v3 stays exported and reachable;
//   * and, negatively, that NOTHING in v4's closure reaches clara.apply_coa_template. 裁-23 Q5
//     ruled the apply is not automatic, Annex E's first non-goal forbids an agent path to the bulk
//     act, and the door is bookkeeper-floored through clara._human_ctx which a workflow step
//     cannot satisfy. The cell below is a TEXT census over this train's own modules -- a
//     mistake-net for a later hand, not a closed-world proof; the ACL and _human_ctx are what
//     actually bind, and 裁-21 PR-b's own battery (§3.1/§3.2) proves those behaviourally.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { register } = await import("tsx/esm/api");
register();

const core = await import("../workflows/interview.v2.core.ts");
const q2 = await import("../workflows/interview.v2.questions.ts");
const q3 = await import("../workflows/interview.v3.questions.ts");
const reg = await import("../workflows/registry.ts");
const v4mod = await import("../workflows/clientOnboarding.v4.ts");
const v3mod = await import("../workflows/clientOnboarding.v3.ts");
const { ANSWER, scriptedAsk } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegmentV2 } = core;
const { CLIENT_SEGMENTS_V2 } = q2;
const { CLIENT_SEGMENTS_V3, COA_SEED_QUESTION_V3, coaSeedItemsV3 } = q3;

const WORKFLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "workflows");
const segV2 = (k) => CLIENT_SEGMENTS_V2.find((s) => s.key === k);
const segV3 = (k) => CLIENT_SEGMENTS_V3.find((s) => s.key === k);

/** Drive one segment: an answer, then the echo confirmation. */
async function drive(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegmentV2(seg, s.ask, prior);
  return { res, asked: s.asked };
}

// ===========================================================================
// §1 -- THE DELTA IS EXACTLY ONE SEGMENT.
// ===========================================================================

test("§1.1 CLIENT_SEGMENTS_V3 is V2 with only `coa_seed` swapped -- by object IDENTITY, in order", () => {
  assert.equal(CLIENT_SEGMENTS_V3.length, CLIENT_SEGMENTS_V2.length, "no segment added or removed");
  assert.deepEqual(CLIENT_SEGMENTS_V3.map((s) => s.key), CLIENT_SEGMENTS_V2.map((s) => s.key),
    "ORDER preserved -- the cross-field validators depend on it (turnover must precede tin)");

  const differing = [];
  for (let i = 0; i < CLIENT_SEGMENTS_V2.length; i += 1) {
    // Reference equality, not deep equality: a deep-equal COPY would drift from v2 the first time
    // someone edited a v2 segment, and this cell would never notice.
    if (CLIENT_SEGMENTS_V3[i] !== CLIENT_SEGMENTS_V2[i]) differing.push(CLIENT_SEGMENTS_V3[i].key);
  }
  assert.deepEqual(differing, ["coa_seed"], "exactly one segment is a different object");
});

test("§1.2 v3's OWN inventory is untouched -- a parked clientOnboarding_v3 run keeps its semantics", async () => {
  const { res } = await drive(segV2("coa_seed"), [ANSWER("yes"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.equal(res.items.length, 1, "v2's coa_seed still produces exactly ONE item");
  assert.equal(res.items[0].item_key, "coa_seed_decision");
  assert.deepEqual(res.items[0].answer, { seed: "lhdn_mpers_standard" },
    "and still the LEGACY value -- constraint 9: the deployed body is immutable");
  assert.match(segV2("coa_seed").question, /LHDN-aligned/,
    "v2 still asks the old question; the re-wording lives in v3 alone");
});

test("§1.3 the v3 wording drops the claim no source supports (裁-23 Q9)", () => {
  const s = segV3("coa_seed");
  assert.equal(s.question, COA_SEED_QUESTION_V3);
  assert.doesNotMatch(s.question, /LHDN/i, "LHDN publishes no chart of accounts -- the claim is gone");
  assert.doesNotMatch(s.question, /MPERS/i, "and the framework claim with it");
  assert.match(s.question, /firm's standard chart of accounts/, "the ruled wording, verbatim");
  assert.equal(s.requiredForCommit, true, "still required for commit");
  assert.equal(s.skippable, false, "and still unskippable");
});

// ===========================================================================
// §2 -- THE CONSUMPTION, both directions, with a counter.
// ===========================================================================

test("§2.1 `yes` produces the DB-contract item AND the pending-apply item", async () => {
  const { res } = await drive(segV3("coa_seed"), [ANSWER("yes"), ANSWER("yes")]);
  assert.equal(res.items.length, 2, "TWO items -- the decision, and its consumer");

  const decision = res.items.find((i) => i.item_key === "coa_seed_decision");
  assert.ok(decision, "the DB contract item is present under its exact key");
  assert.equal(decision.item_kind, "must_ask");
  assert.equal(decision.state, "answered");
  assert.equal(decision.required_for_commit, true,
    "commit_client_onboarding reads this BY NAME -- the key and the flag are a DB contract");
  assert.deepEqual(decision.answer, { seed: "firm_template" }, "D-13 item 4's new value");

  const chart = res.items.find((i) => i.item_key === "coa_chart_apply");
  assert.ok(chart, "the consumption item is present");
  assert.equal(chart.item_kind, "todo");
  assert.equal(chart.state, "deferred", "a pending human act, which is exactly what 裁-23 Q5 ruled");
  assert.deepEqual(chart.answer, { chart: "firm_template", applied: false });
  assert.equal(chart.required_for_commit, false, "it does not block the commit -- Q5 again");
});

test("§2.2 `no` produces the SAME two keys, with the other decision -- so no reader proves an absence", async () => {
  const { res } = await drive(segV3("coa_seed"), [ANSWER("no"), ANSWER("yes")]);
  assert.equal(res.items.length, 2, "TWO items in BOTH arms -- the plan shape does not depend on the answer");
  assert.deepEqual(res.items.map((i) => i.item_key).sort(), ["coa_chart_apply", "coa_seed_decision"]);
  assert.deepEqual(res.items.find((i) => i.item_key === "coa_seed_decision").answer, { seed: "manual" },
    "Q4's escape hatch, recorded positively");
  const chart = res.items.find((i) => i.item_key === "coa_chart_apply");
  assert.equal(chart.state, "answered", "the manual arm is a settled fact, not a pending act");
  assert.equal(chart.item_kind, "capture");
  assert.deepEqual(chart.answer, { chart: "manual", applied: false });
});

test("§2.3 THE COUNTER: the two arms differ in exactly the ways they should, and in no other", () => {
  const yes = coaSeedItemsV3("yes", COA_SEED_QUESTION_V3);
  const no = coaSeedItemsV3("no", COA_SEED_QUESTION_V3);
  assert.equal(yes.length, 2);
  assert.equal(no.length, 2);
  assert.deepEqual(yes.map((i) => i.item_key), no.map((i) => i.item_key), "same keys, same order");

  const diffs = [];
  for (let i = 0; i < yes.length; i += 1) {
    for (const field of ["item_kind", "state", "required_for_commit"]) {
      if (yes[i][field] !== no[i][field]) diffs.push(`${yes[i].item_key}.${field}`);
    }
    if (JSON.stringify(yes[i].answer) !== JSON.stringify(no[i].answer)) diffs.push(`${yes[i].item_key}.answer`);
    if (yes[i].question !== no[i].question) diffs.push(`${yes[i].item_key}.question`);
  }
  assert.deepEqual(diffs.sort(), [
    "coa_chart_apply.answer", "coa_chart_apply.item_kind", "coa_chart_apply.question",
    "coa_chart_apply.state", "coa_seed_decision.answer",
  ], "the decision's ANSWER moves and the follow-up's whole shape moves; nothing else does");

  // `applied` is false in BOTH arms and this workflow never sets it true (§3).
  assert.equal(yes[1].answer.applied, false);
  assert.equal(no[1].answer.applied, false);
});

test("§2.4 the widened answer vocabulary maps onto the canonical yes/no, and garbage still refuses", async () => {
  for (const [word, seed] of [["firm_template", "firm_template"], ["standard", "firm_template"],
    ["manual", "manual"], ["own", "manual"], ["skip", "manual"]]) {
    const { res } = await drive(segV3("coa_seed"), [ANSWER(word), ANSWER("yes")]);
    assert.equal(res.outcome, "answered", `${word} is accepted`);
    assert.deepEqual(res.items[0].answer, { seed }, `${word} -> ${seed}`);
  }
  // The validator still discriminates: a refused answer re-asks rather than being recorded.
  const s = scriptedAsk([ANSWER("purple"), ANSWER("yes"), ANSWER("yes")]);
  const res = await askAndConfirmSegmentV2(segV3("coa_seed"), s.ask, {});
  assert.equal(res.outcome, "answered");
  assert.deepEqual(res.items[0].answer, { seed: "firm_template" }, "the refused answer was NOT recorded");
  assert.ok(s.asked.length >= 3, "the segment re-asked rather than accepting `purple`");
});

// ===========================================================================
// §3 -- WHAT v4 DOES NOT DO, and the registry.
// ===========================================================================

test("§3.1 NOTHING in this train's modules reaches clara.apply_coa_template or any database verb", () => {
  // A text census over THIS TRAIN's own modules. Named as what it is (a mistake-net for a later
  // hand, not a closed-world proof): the real walls are the door's ACL and clara._human_ctx, and
  // 裁-21 PR-b's battery proves those behaviourally against a live database.
  const files = ["clientOnboarding.v4.ts", "interview.v3.questions.ts"];
  for (const f of files) {
    const src = readFileSync(join(WORKFLOWS_DIR, f), "utf8");
    // Strip line comments so the headers' own EXPLANATIONS of why the call is absent do not read
    // as the call being present. Measuring the comment instead of the code is the classic
    // wrong-instrument failure.
    const code = src.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    for (const verb of ["apply_coa_template", "add_coa_template_family", "coa_chart_state"]) {
      assert.doesNotMatch(code, new RegExp(verb), `${f} does not call clara.${verb}`);
    }
    assert.doesNotMatch(code, /withRuntime|getPool|\.query\(/,
      `${f} opens no database connection of its own`);
  }
  // Non-vacuity: the stripper must not have eaten the whole file.
  const v4 = readFileSync(join(WORKFLOWS_DIR, "clientOnboarding.v4.ts"), "utf8");
  const v4code = v4.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
  assert.match(v4code, /CLIENT_SEGMENTS_V3/, "the census ran over real code, not an empty string");
  assert.match(v4code, /"use workflow"/, "and over the workflow body itself");
});

test("§3.2 v4 is byte-identical to v3 apart from the inventory it walks and its own names", () => {
  const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && l.trim() !== "").join("\n");
  const v3 = strip(readFileSync(join(WORKFLOWS_DIR, "clientOnboarding.v3.ts"), "utf8"));
  const v4 = strip(readFileSync(join(WORKFLOWS_DIR, "clientOnboarding.v4.ts"), "utf8"));
  // Rewrite v4's own identity back onto v3's and require the remainder to match EXACTLY. This is
  // the cell that would catch a "while I'm here" edit smuggled into the successor body -- the
  // failure mode a _vN bump exists to prevent.
  const normalised = v4
    .replaceAll("CLIENT_SEGMENTS_V3", "CLIENT_SEGMENTS_V2")
    .replaceAll("./interview.v3.questions.js", "./interview.v2.questions.js")
    .replaceAll("clientOnboarding_v4", "clientOnboarding_v3")
    .replaceAll("ClientOnboardingV4Input", "ClientOnboardingV3Input")
    .replaceAll("ClientOnboardingV4Outcome", "ClientOnboardingV3Outcome");
  assert.equal(normalised, v3,
    "the successor body carries the predecessor's logic verbatim -- only the inventory and the names move");
});

test("§3.3 the registry points clientOnboarding at v4, and v3 stays exported and distinct", () => {
  assert.equal(reg.workflows.clientOnboarding, v4mod.clientOnboarding_v4, "the pointer moved to v4");
  assert.equal(reg.clientOnboarding_v3, v3mod.clientOnboarding_v3,
    "v3 is still EXPORTED under its own name -- the >=48h parks resume into their own body");
  assert.notEqual(reg.workflows.clientOnboarding, v3mod.clientOnboarding_v3, "and they are different bodies");
  for (const older of ["clientOnboarding_v1", "clientOnboarding_v2"]) {
    assert.equal(typeof reg[older], "function", `${older} is still exported`);
  }
  // The registry VIEW is the object the enqueue-provenance check trusts; the pointer must be
  // reachable through it, not merely through the module's own named export.
  assert.equal(reg.workflowsByName.clientOnboarding, v4mod.clientOnboarding_v4,
    "and the frozen registry view carries the same object -- the bundle proof");
});

test("§3.4 the materials playbook does NOT narrow the chart decision (design D-8's named trap)", async () => {
  // F-A7b rules that bank-only and shoebox take no OPENING SEED. That is about balances. A chart
  // must still be complete, and D-8 records the opposite intuition as the mistake. The structural
  // proof is that the segment reads NOTHING from `prior`: drive it with each playbook in hand and
  // the produced items are identical.
  const outs = [];
  for (const playbook of ["predecessor_pack", "management_account", "bank_only", "shoebox", "mid_year"]) {
    const { res } = await drive(segV3("coa_seed"), [ANSWER("yes"), ANSWER("yes")],
      { materials_basis: playbook, opening_position: "ongoing_carry_down" });
    outs.push(JSON.stringify(res.items));
  }
  assert.equal(new Set(outs).size, 1,
    "the chart decision is identical under all five materials playbooks -- the trim does not get more aggressive because there are fewer materials");
  assert.equal(segV3("coa_seed").appliesTo, undefined, "and the segment is asked of every client");
});
