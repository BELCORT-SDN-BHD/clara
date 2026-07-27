// interview_v2 — closure-logic battery for the F2 entity-aware framework/basis interview, its
// driver, the inventories, and the durability discipline the v2 workflow bodies inherit from the
// frozen v1 spine. (F1, the registration grammar, has its own file:
// wave-b-interview-v2-registration.test.mjs.) STUBBED ask + pools; no WDK engine, no DB.
//
// Three things this file is trying to prove, in order of what would hurt most if wrong:
//   1. v1 IS UNTOUCHED. Its inventories and validators still behave exactly as their own battery
//      asserts, because "we shipped a v2" is only true if v1 kept its semantics for the parked
//      runs finishing on it (ARCHITECTURE Appendix A policy (a)/(c)).
//   2. The two statutory impossibilities are refused LOUDLY and everything else unusual is
//      recorded WITH an acknowledged warning — the house's refuse-nothing-silently posture.
//   3. The new machinery cannot swallow anything: nothing persists before an echo-confirm (P19),
//      a cancel at ANY of the four park kinds terminates clean, and the park sequence is a pure
//      function of the answers (the property a WDK replay depends on).

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const core = await import("../workflows/interview.v2.core.ts");
const fw = await import("../workflows/interview.v2.frameworks.ts");
const q = await import("../workflows/interview.v2.questions.ts");
const { scriptedAsk, ANSWER, CANCEL, EXPIRE } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegmentV2, segmentApplies, questionOf } = core;
const { FIRM_SEGMENTS_V2, CLIENT_SEGMENTS_V2 } = q;

const firmSeg = (k) => FIRM_SEGMENTS_V2.find((s) => s.key === k);
const clientSeg = (k) => CLIENT_SEGMENTS_V2.find((s) => s.key === k);

/** Drive one v2 segment with a scripted answer sequence. */
async function drive(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegmentV2(seg, s.ask, prior);
  return { res, asked: s.asked, remaining: s.remaining() };
}

// ===========================================================================
// F2 — the option table.
// ===========================================================================

test("F2: entity-type defaults match the adjudicated memo table, for every entity type", () => {
  const expected = {
    sdn_bhd: ["MPERS", "ACCRUAL"],
    bhd: ["MFRS", "ACCRUAL"],
    sole_prop: ["SPECIAL_PURPOSE_TAX_MANAGEMENT", "ACCRUAL"],
    partnership: ["SPECIAL_PURPOSE_TAX_MANAGEMENT", "ACCRUAL"],
    llp: ["SPECIAL_PURPOSE_TAX_MANAGEMENT", "ACCRUAL"],
    society: ["REGULATOR_CONTRACTUAL", "ACCRUAL"],
    cooperative: ["REGULATOR_CONTRACTUAL", "ACCRUAL"],
    other: ["UNDETERMINED", "ACCRUAL"],
  };
  for (const [entity, [framework, basis]] of Object.entries(expected)) {
    const d = fw.defaultsFor(entity, "not_determined");
    assert.equal(d.framework, framework, `${entity} framework default`);
    assert.equal(d.basis, basis, `${entity} basis default`);
    assert.ok(d.because.length > 0, `${entity} default carries its reason`);
  }
  // An INELIGIBLE Sdn Bhd defaults exactly as a Bhd does — the memo's second row.
  assert.equal(fw.defaultsFor("sdn_bhd", "ineligible").framework, "MFRS");
  assert.equal(fw.defaultsFor("sdn_bhd", "eligible").framework, "MPERS");
});

test("F2: the option list is entity-conditional, default-first, and never offers MPERS to an ineligible company", () => {
  const sole = fw.frameworkOptionsFor("sole_prop", "not_determined").map((o) => o.code);
  assert.equal(sole[0], "SPECIAL_PURPOSE_TAX_MANAGEMENT", "the default is listed first");
  assert.ok(!sole.includes("MPERS"), "MPERS is not offered to a ROBA business as if it applied");
  assert.ok(sole.includes("MPERS_ALIGNED_SPECIAL_PURPOSE"), "the honest alternative IS offered");

  const bhd = fw.frameworkOptionsFor("bhd", "ineligible").map((o) => o.code);
  assert.equal(bhd[0], "MFRS");
  assert.ok(!bhd.includes("MPERS"));

  const eligible = fw.frameworkOptionsFor("sdn_bhd", "eligible").map((o) => o.code);
  assert.equal(eligible[0], "MPERS");
  assert.ok(eligible.includes("MFRS"), "an eligible private entity may still elect MFRS");

  const ineligible = fw.frameworkOptionsFor("sdn_bhd", "ineligible").map((o) => o.code);
  assert.ok(!ineligible.includes("MPERS"), "a screened-ineligible Sdn Bhd is not offered MPERS");
  assert.equal(ineligible[0], "MFRS");

  // Every entity type can always say OTHER or UNDETERMINED — the two escape hatches that keep
  // the table from being a cage.
  for (const entity of fw.ENTITY_TYPES_V2) {
    const codes = fw.frameworkOptionsFor(entity, "not_determined").map((o) => o.code);
    assert.ok(codes.includes("OTHER"), `${entity} can name something else`);
    assert.ok(codes.includes("UNDETERMINED"), `${entity} can defer`);
  }
});

test("F2: the question TEXT is built from the table — options listed, default marked, reason given", () => {
  const question = questionOf(firmSeg("framework"), { entity_type: "sole_prop" });
  assert.match(question, /Special-purpose tax \/ management accounts/);
  assert.match(question, /usual for this entity type/);
  assert.match(question, /ROBA 1956/, "the default states WHY it is the default");
  assert.ok(!/MPERS —/.test(question), "MPERS is not listed for a sole proprietorship");
  const sdnQuestion = questionOf(firmSeg("framework"), { entity_type: "sdn_bhd" });
  assert.match(sdnQuestion, /MPERS/);
  assert.match(sdnQuestion, /MFRS/);
});

test("F2: answers normalize through the alias table (typed forms, not enum codes)", () => {
  assert.equal(fw.frameworkByAnswer("mpers").code, "MPERS");
  assert.equal(fw.frameworkByAnswer("Management Accounts").code, "SPECIAL_PURPOSE_TAX_MANAGEMENT");
  assert.equal(fw.frameworkByAnswer("tax basis").code, "SPECIAL_PURPOSE_TAX_MANAGEMENT");
  assert.equal(fw.frameworkByAnswer("MPERS-aligned").code, "MPERS_ALIGNED_SPECIAL_PURPOSE");
  assert.equal(fw.frameworkByAnswer("not sure").code, "UNDETERMINED");
  assert.equal(fw.frameworkByAnswer("nonsense-framework"), null);
  assert.equal(fw.basisByAnswer("Receipts and Payments").code, "CASH_RECEIPTS_PAYMENTS");
  assert.equal(fw.basisByAnswer("accrual").code, "ACCRUAL");
  assert.equal(fw.basisByAnswer("hybrid").code, "MODIFIED_CASH");
});

test("F2: the entity enum widened to the eight shapes the defaults need", () => {
  const v = q.CLIENT_SEGMENTS_V2.find((s) => s.key === "entity_type").validate;
  assert.equal(v("Berhad", {}).value, "bhd");
  assert.equal(v("Sendirian Berhad", {}).value, "sdn_bhd", "the Sdn Bhd reading never collides with the public-company one");
  assert.equal(v("koperasi", {}).value, "cooperative");
  assert.equal(v("persatuan", {}).value, "society");
  assert.equal(v("PLT", {}).value, "llp");
  assert.equal(v("enterprise", {}).value, "sole_prop");
  assert.equal(v("something", {}).ok, false);
});

// ===========================================================================
// F2 — the two hard refusals.
// ===========================================================================

test("HARD RULE 1: a Bhd answering MPERS is refused with the statute, and re-asked (never recorded)", async () => {
  const { res, asked } = await drive(firmSeg("framework"), [ANSWER("MPERS"), ANSWER("MFRS"), ANSWER("yes")], { entity_type: "bhd" });
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.framework_code, "MFRS");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "c"], "the refusal produced NO confirm park — nothing was recorded (P19)");
  assert.match(asked[1].question, /not a “private entity”|private entity/);
  assert.match(asked[1].question, /s\.244/, "the refusal cites the statute");
});

test("HARD RULE 1: a SCREENED-INELIGIBLE Sdn Bhd is refused; an eligible or undetermined one is not", async () => {
  const ineligible = { entity_type: "sdn_bhd", mpers_eligibility: { determination: "ineligible" } };
  assert.equal(firmSeg("framework").validate("MPERS", ineligible).ok, false);

  const eligible = { entity_type: "sdn_bhd", mpers_eligibility: { determination: "eligible" } };
  assert.equal(firmSeg("framework").validate("MPERS", eligible).ok, true);

  // NOT refused on an assumption: an unscreened Sdn Bhd keeps MPERS. Refusing here would block a
  // correct answer on a fact the interview does not hold.
  assert.equal(firmSeg("framework").validate("MPERS", { entity_type: "sdn_bhd" }).ok, true);
});

test("HARD RULE 2: a company naming cash as its REPORTING basis is refused after the observed-state question", async () => {
  const { res, asked } = await drive(
    firmSeg("accounting_basis"),
    [ANSWER("cash"), ANSWER("reporting"), ANSWER("accrual"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.accounting_basis, "ACCRUAL");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "q", "c"], "question → observed-state follow-up → re-ask → confirm");
  assert.match(asked[1].question, /REPORTED on|records as they stand/);
  assert.match(asked[2].question, /accrual basis/);
  assert.match(asked[2].question, /s\.244/);
});

test("HARD RULE 2: the observed-state path RECORDS the defect instead of blocking the interview", async () => {
  const { res, asked } = await drive(
    firmSeg("accounting_basis"),
    [ANSWER("cash"), ANSWER("records_today"), ANSWER("Cashbook only for FY2025; converting to accrual at the year end."), ANSWER("yes"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.accounting_basis, "UNDETERMINED", "the TARGET basis is undetermined, never silently cash");
  assert.equal(res.value.observed_basis, "CASH_RECEIPTS_PAYMENTS", "the observed state is kept");
  assert.equal(res.value.remediation_required, true);
  assert.match(res.value.observed_note.verbatim, /Cashbook only for FY2025/);
  assert.equal(res.value.observed_note.normalized, res.value.observed_note.verbatim.toLowerCase());
  assert.ok(Array.isArray(res.value.warnings) && res.value.warnings.some((w) => w.code === "basis_undetermined"));
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "q", "c", "c"], "basis → observed → note → warning ack → echo confirm");
});

test("HARD RULE 2: the observed-state explanation is MANDATORY (an unexplained flag helps nobody)", async () => {
  const { res, asked } = await drive(
    firmSeg("accounting_basis"),
    [ANSWER("modified cash"), ANSWER("records_today"), ANSWER("skip"), ANSWER("Sales cut-off only; AP already accrued."), ANSWER("yes"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.observed_basis, "MODIFIED_CASH");
  assert.match(asked[3].question, /explanation is required/, "the skip was refused with a reason and the SAME question re-asked");
});

test("HARD RULE 2 does not fire for a non-company — an unincorporated cash answer is warned, not refused", async () => {
  const { res, asked } = await drive(firmSeg("accounting_basis"), [ANSWER("cash"), ANSWER("yes"), ANSWER("yes")], { entity_type: "sole_prop" });
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.accounting_basis, "CASH_RECEIPTS_PAYMENTS", "recorded as answered — no observed-state detour");
  assert.equal(res.value.warnings[0].code, "unincorporated_cash_basis");
  assert.match(asked[1].question, /PR 5\/2000/, "the warning cites the ruling it rests on");
});

// ===========================================================================
// F2 — warnings: visible, acknowledged, recorded, refusable.
// ===========================================================================

test("F2: a non-company answering MPERS is WARNED (not blocked) and the acknowledgement is recorded", async () => {
  // The edition follow-up fires here too, and should: an LLP claiming MPERS is claiming an
  // edition of it. The warning park then sits between the follow-up and the echo confirm.
  const { res, asked } = await drive(firmSeg("framework"), [ANSWER("MPERS"), ANSWER("2025"), ANSWER("yes"), ANSWER("yes")], { entity_type: "llp" });
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.framework_code, "MPERS", "the answer stands — the house refuses nothing silently and blocks nothing it may not");
  assert.equal(res.value.framework_version, "MPERS_2025");
  assert.equal(res.value.warnings.length, 1);
  assert.equal(res.value.warnings[0].code, "non_company_mpers");
  assert.equal(res.value.warnings[0].acknowledged, true);
  assert.match(res.value.warnings[0].message, /MPERS-aligned special purpose/, "the warning names the honest alternative");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "c", "c"], "question → edition → warning acknowledgement → echo confirm");
  assert.match(asked[2].question, /⚠/);
});

test("F2: DECLINING a warning re-asks the question and records nothing from the declined round", async () => {
  const { res, asked } = await drive(
    firmSeg("framework"),
    [ANSWER("MPERS"), ANSWER("2016"), ANSWER("change"), ANSWER("MPERS-aligned"), ANSWER("yes")],
    { entity_type: "sole_prop" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.framework_code, "MPERS_ALIGNED_SPECIAL_PURPOSE", "the hyphenated printed label is accepted verbatim");
  assert.equal(res.value.warnings, undefined, "the re-answered value carries no warning from the abandoned round");
  assert.equal(res.value.framework_version, undefined, "nothing from the abandoned round survives — not the edition either");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "c", "q", "c"]);
});

test("F2: an LLP on a cash basis is a HIGH-SEVERITY warning citing LLP Act s.69", async () => {
  const { res, asked } = await drive(firmSeg("accounting_basis"), [ANSWER("cash"), ANSWER("yes"), ANSWER("yes")], { entity_type: "llp" });
  assert.equal(res.value.warnings[0].code, "llp_cash_basis");
  assert.match(asked[1].question, /HIGH SEVERITY/);
  assert.match(asked[1].question, /s\.69/);
});

test("F2: a company recording special-purpose accounts is warned that the statutory framework still applies", async () => {
  const { res } = await drive(firmSeg("framework"), [ANSWER("management accounts"), ANSWER("yes"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(res.value.framework_code, "SPECIAL_PURPOSE_TAX_MANAGEMENT");
  assert.equal(res.value.warnings[0].code, "company_special_purpose");
});

test("F2: UNDETERMINED is a first-class answer — recorded, flagged for review, never a silent gap", async () => {
  const { res } = await drive(firmSeg("framework"), [ANSWER("not sure"), ANSWER("yes"), ANSWER("yes")], { entity_type: "partnership" });
  assert.equal(res.value.framework_code, "UNDETERMINED");
  assert.equal(res.value.warnings[0].code, "framework_undetermined");
  assert.match(res.value.warnings[0].message, /practitioner/);
});

// ===========================================================================
// F2 — the free-text and version follow-ups.
// ===========================================================================

test("F2: OTHER demands free text (skip is refused) and records it verbatim + normalized", async () => {
  const { res, asked } = await drive(
    firmSeg("framework"),
    [ANSWER("other"), ANSWER("skip"), ANSWER("IFRS for SMEs — the parent's group-reporting instruction"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.framework_code, "OTHER");
  assert.equal(res.value.free_text.verbatim, "IFRS for SMEs — the parent's group-reporting instruction");
  assert.equal(res.value.free_text.normalized, "ifrs for smes — the parent's group-reporting instruction");
  assert.match(asked[2].question, /required for this option/, "the skip was refused with a reason");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "q", "c"]);
  assert.match(res.echo, /IFRS for SMEs/, "the echo shows what will be recorded");
});

test("F2: the regulator/contractual option demands its authority", async () => {
  const { res } = await drive(
    clientSeg("framework"),
    [ANSWER("regulator"), ANSWER("SKM GP23"), ANSWER("yes")],
    { entity_type: "cooperative" },
  );
  assert.equal(res.value.framework_code, "REGULATOR_CONTRACTUAL");
  assert.equal(res.value.free_text.verbatim, "SKM GP23");
});

test("F2: MPERS asks its EDITION and records the dated rule; MFRS asks nothing", async () => {
  const mpers = await drive(firmSeg("framework"), [ANSWER("MPERS"), ANSWER("2025"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(mpers.res.value.framework_version, "MPERS_2025");
  assert.deepEqual(mpers.res.value.framework_version_rule, { mandatory_from: "2027-01-01", mandatory_version: "MPERS_2025" });
  assert.match(mpers.asked[1].question, /1 January 2027/, "the commencement date is stated, not assumed");
  assert.deepEqual(mpers.asked.map((a) => a.phase), ["q", "q", "c"]);

  const mfrs = await drive(firmSeg("framework"), [ANSWER("MFRS"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(mfrs.res.value.framework_version, undefined);
  assert.deepEqual(mfrs.asked.map((a) => a.phase), ["q", "c"], "no edition park for a framework with one live edition");

  // The edition may be deferred, and deferring is an ANSWER, not a silence.
  const undetermined = await drive(firmSeg("framework"), [ANSWER("MPERS"), ANSWER("skip"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(undetermined.res.value.framework_version, "UNDETERMINED");
});

// ===========================================================================
// The MPERS-eligibility screen — asked of exactly one entity shape.
// ===========================================================================

test("the s.244 private-entity screen applies to a Sdn Bhd and to nobody else", () => {
  const seg = firmSeg("mpers_eligibility");
  assert.equal(segmentApplies(seg, { entity_type: "sdn_bhd" }), true);
  for (const entity of ["bhd", "sole_prop", "partnership", "llp", "society", "cooperative", "other"]) {
    assert.equal(segmentApplies(seg, { entity_type: entity }), false, `${entity} is not asked the private-entity test`);
  }
  // A Bhd needs no screen — the law already answers it.
  assert.equal(fw.eligibilityOf({ entity_type: "bhd" }), "ineligible");
  assert.equal(fw.eligibilityOf({ entity_type: "sdn_bhd" }), "not_determined");
});

test("the screen records a determination, not a yes/no", async () => {
  const yes = await drive(firmSeg("mpers_eligibility"), [ANSWER("yes"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(yes.res.value.determination, "ineligible");
  assert.equal(yes.res.value.test, "ca2016_s244_private_entity");
  assert.match(yes.res.echo, /MFRS applies/);
  const no = await drive(firmSeg("mpers_eligibility"), [ANSWER("no"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(no.res.value.determination, "eligible");
  assert.equal(firmSeg("mpers_eligibility").validate("maybe", {}).ok, false);
});

// ===========================================================================
// Driver discipline — P19, cancel/expire at EVERY park kind, replay determinism.
// ===========================================================================

test("P19: a validator refusal re-asks with the reason and never reaches a confirm park", async () => {
  const { res, asked } = await drive(firmSeg("ssm"), [ANSWER("garbage"), ANSWER("SA1234567-X"), ANSWER("yes")]);
  assert.equal(res.outcome, "answered");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "c"]);
  assert.match(asked[1].question, /not a Malaysian business registration number/);
});

test("cancel and expire terminate cleanly at EVERY park kind the v2 driver can open", async () => {
  const prior = { entity_type: "sdn_bhd" };
  const cases = [
    ["question park", firmSeg("framework"), [CANCEL()], prior],
    ["follow-up park", firmSeg("framework"), [ANSWER("MPERS"), CANCEL()], prior],
    ["warning park", firmSeg("framework"), [ANSWER("MPERS"), ANSWER("2025"), CANCEL()], { entity_type: "llp" }],
    ["confirm park", firmSeg("framework"), [ANSWER("MFRS"), CANCEL()], prior],
    ["observed-state park", firmSeg("accounting_basis"), [ANSWER("cash"), CANCEL()], prior],
  ];
  for (const [what, seg, script, p] of cases) {
    const { res } = await drive(seg, script, p);
    assert.equal(res.outcome, "cancelled", `cancel at the ${what}`);
    assert.equal(res.items, undefined, `nothing produced by a cancelled ${what}`);
  }
  const expired = await drive(firmSeg("framework"), [ANSWER("MPERS"), EXPIRE()], prior);
  assert.equal(expired.res.outcome, "expired");
});

test("REPLAY DETERMINISM: the same answers produce byte-identical parks, values and items", async () => {
  const script = [ANSWER("MPERS"), ANSWER("2025"), ANSWER("yes")];
  const prior = { entity_type: "sdn_bhd", mpers_eligibility: { determination: "eligible" } };
  const a = await drive(firmSeg("framework"), [...script], prior);
  const b = await drive(firmSeg("framework"), [...script], prior);
  assert.deepEqual(
    a.asked.map((x) => [x.seg, x.phase, x.question]),
    b.asked.map((x) => [x.seg, x.phase, x.question]),
    "a WDK replay re-drives the same control flow — the park sequence must be a pure function of the answers",
  );
  assert.deepEqual(a.res.value, b.res.value);
  assert.deepEqual(a.res.items, b.res.items);
  assert.deepEqual(a.res.echo, b.res.echo);
});

test("every park of a segment carries THAT segment's key and only 'q'/'c' phases (the shipped dashboard's contract)", async () => {
  const runs = [
    await drive(firmSeg("framework"), [ANSWER("other"), ANSWER("IFRS for SMEs"), ANSWER("yes")], { entity_type: "llp" }),
    await drive(firmSeg("accounting_basis"), [ANSWER("cash"), ANSWER("records_today"), ANSWER("cashbook only"), ANSWER("yes"), ANSWER("yes")], { entity_type: "sdn_bhd" }),
  ];
  for (const r of runs) {
    for (const park of r.asked) {
      assert.ok(["q", "c"].includes(park.phase), `phase ${park.phase} is renderable by the shipped dashboard`);
      assert.ok(["framework", "accounting_basis"].includes(park.seg), "every park names the segment, so 'step N' keeps working");
    }
  }
});

test("the plan item records the question AS ASKED (entity-aware), not a generic fallback", async () => {
  const { res } = await drive(firmSeg("framework"), [ANSWER("MFRS"), ANSWER("yes")], { entity_type: "bhd" });
  assert.match(res.items[0].question, /MFRS — Malaysian Financial Reporting Standards/);
  assert.match(res.items[0].question, /usual for this entity type/);
});
