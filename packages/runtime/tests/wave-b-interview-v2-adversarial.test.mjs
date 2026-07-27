// interview_v2 — the ADVERSARIAL round (Codex REFUSED, findings L1-L7, 2026-07-27).
//
// One block per finding, each driving the ORIGINAL attack scenario rather than a paraphrase of
// it, so a re-review can read the attack and the refusal side by side. Pure closure logic — no
// WDK engine, no DB. The two findings that lived inside "use workflow" bodies (L4, L6) are
// reachable here because their logic was extracted into pure injectable units; the workflow
// bodies now call those units and nothing else.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const core = await import("../workflows/interview.v2.core.ts");
const fw = await import("../workflows/interview.v2.frameworks.ts");
const rules = await import("../workflows/interview.v2.rules.ts");
const q = await import("../workflows/interview.v2.questions.ts");
const planwrite = await import("../workflows/interview.v2.planwrite.ts");
const grammar = await import("../lib/malaysian-registration.mjs");
const { scriptedAsk, ANSWER, CANCEL, EXPIRE } = await import("./wave-b-interview-testkit.mjs");

const { askAndConfirmSegmentV2, segmentApplies, questionOf, applyPersistOutcome } = core;
const { FIRM_SEGMENTS_V2, CLIENT_SEGMENTS_V2 } = q;
const firmSeg = (k) => FIRM_SEGMENTS_V2.find((s) => s.key === k);

async function drive(seg, script, prior = {}) {
  const s = scriptedAsk(script);
  const res = await askAndConfirmSegmentV2(seg, s.ask, prior);
  return { res, asked: s.asked };
}

// ===========================================================================
// L1 — arbitrary 12-digit values became "verified" registrations.
// ===========================================================================

test("L1: a 12-digit value with an impossible year prefix is REFUSED (the reported attack inputs)", () => {
  // Both are Codex's own inputs: a mobile number, and a placeholder.
  for (const attack of ["601112345678", "999999999999", "123456789012", "000000000000"]) {
    assert.equal(grammar.classifyBusinessRegistration(attack).ok, false, `${attack} must not read as a registration`);
    assert.equal(core.validateBusinessRegistration(attack).ok, false, `${attack} refused at the interview gate too`);
  }
  // The constraint is STRUCTURAL (the field is year-prefixed), not an enumeration of known values:
  // every plausible registration year still passes, including ones nobody has issued yet.
  for (const real of ["190112345678", "199901000001", "202401001234", "209912345678"]) {
    assert.equal(grammar.classifyBusinessRegistration(real).ok, true, `${real} is a plausible unified number`);
  }
  // It binds the check-suffixed and combined prints too — not just the bare form.
  assert.equal(grammar.classifyBusinessRegistration("601112345678-K").ok, false, "the check-letter variant is bound by the same rule");
  assert.equal(grammar.classifyBusinessRegistration("601112345678 (1130695-T)").ok, false, "so is the combined print's outer half");
});

test("L1: the record claims FORMAT verification only — it never claims the identity was checked", async () => {
  const recognised = core.validateBusinessRegistration("202401001234");
  assert.equal(recognised.value.format_verified, true);
  assert.equal("verified" in recognised.value, false, "the overclaiming name is gone from the recorded shape");
  assert.match(recognised.echo, /format checked/i);
  assert.match(recognised.echo, /not an SSM identity lookup/i, "the echo says what was NOT done");

  const insisted = core.insistUnverifiedRegistration("ROB-9/2019 KUCHING", "ROB-9/2019 KUCHING");
  assert.equal(insisted.value.format_verified, false);
  assert.equal("verified" in insisted.value, false);
  assert.match(insisted.echo, /FORMAT UNVERIFIED/);

  // The marker the plan carries is format-scoped in BOTH directions, and its reader agrees.
  const { res } = await drive(firmSeg("ssm"), [ANSWER("202401001234"), ANSWER("yes")]);
  assert.equal(res.items[0].answer.format_verified, true);
  assert.equal("verified" in res.items[0].answer, false, "no bare `verified` reaches the durable record");
  assert.equal(core.isUnverifiedRegistration(res.items[0].answer), false);
});

// ===========================================================================
// L2 — both statutory hard blocks were bypassable through OTHER.
// ===========================================================================

test("L2 scenario A: a Bhd answering OTHER then typing “MPERS” is REFUSED, exactly as a direct MPERS is", async () => {
  const { res, asked } = await drive(
    firmSeg("framework"),
    [ANSWER("other"), ANSWER("MPERS"), ANSWER("MFRS"), ANSWER("yes")],
    { entity_type: "bhd" },
  );
  assert.equal(res.outcome, "answered");
  assert.equal(res.value.framework_code, "MFRS", "the refused route recorded nothing");
  // question → free text → RESTART carrying the statute → the corrected answer → confirm.
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "q", "c"]);
  assert.match(asked[2].question, /private entity/);
  assert.match(asked[2].question, /s\.244/, "the same statutory reason the direct answer gets");
});

test("L2 scenario A′: free text that names a REAL option is treated as that option for every gate", async () => {
  // A sole prop typing MPERS under OTHER must hit the non-company warning AND the edition
  // follow-up — everything the direct answer would have triggered.
  const { res, asked } = await drive(
    firmSeg("framework"),
    [ANSWER("other"), ANSWER("MPERS"), ANSWER("2025"), ANSWER("yes"), ANSWER("yes")],
    { entity_type: "sole_prop" },
  );
  assert.equal(res.value.framework_code, "MPERS", "promoted out of OTHER");
  assert.equal(res.value.entered_as, "OTHER", "…and the route is kept in the record");
  assert.equal(res.value.free_text.verbatim, "MPERS");
  assert.equal(res.value.framework_version, "MPERS_2025", "the edition follow-up fired");
  assert.equal(res.value.warnings[0].code, "non_company_mpers", "the warning fired");
  assert.deepEqual(asked.map((a) => a.phase), ["q", "q", "q", "c", "c"]);
});

test("L2 scenario B: basis OTHER then “cash basis” reaches the observed-state flow and the hard refusal", async () => {
  // Reporting basis → refused, exactly as a direct "cash" answer is.
  const refused = await drive(
    firmSeg("accounting_basis"),
    [ANSWER("other"), ANSWER("cash basis"), ANSWER("reporting"), ANSWER("accrual"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(refused.res.value.accounting_basis, "ACCRUAL");
  assert.match(refused.asked[2].question, /REPORTED on|records as they stand/, "the observed-state question WAS asked");
  assert.match(refused.asked[3].question, /s\.244/, "and the statutory refusal followed");

  // Observed state → recorded, with its mandatory note, exactly as a direct answer is.
  const observed = await drive(
    firmSeg("accounting_basis"),
    [ANSWER("other"), ANSWER("cash basis"), ANSWER("records_today"), ANSWER("Cashbook only for FY2025."), ANSWER("yes"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(observed.res.value.accounting_basis, "UNDETERMINED");
  assert.equal(observed.res.value.observed_basis, "CASH_RECEIPTS_PAYMENTS");
  assert.equal(observed.res.value.remediation_required, true);
  assert.equal(observed.res.value.entered_as, "OTHER");
});

test("L2: genuinely-other text STAYS other — the screen resolves options, it does not swallow answers", async () => {
  const { res } = await drive(
    firmSeg("framework"),
    [ANSWER("other"), ANSWER("IFRS for SMEs — the parent's group-reporting instruction"), ANSWER("yes")],
    { entity_type: "sdn_bhd" },
  );
  assert.equal(res.value.framework_code, "OTHER", "text that names no listed option is what OTHER is FOR");
  assert.equal(res.value.entered_as, undefined);
  assert.equal(res.value.free_text.verbatim, "IFRS for SMEs — the parent's group-reporting instruction");
  // And the screening helpers say so directly.
  assert.equal(rules.frameworkCodeFromFreeText("IFRS for SMEs — parent instruction"), null);
  assert.equal(rules.frameworkCodeFromFreeText("mpers"), "MPERS");
  assert.equal(rules.frameworkCodeFromFreeText("other"), null, "OTHER resolving to itself would be a loop, not a promotion");
  assert.equal(rules.basisCodeFromFreeText("cash basis"), "CASH_RECEIPTS_PAYMENTS");
  assert.equal(rules.basisCodeFromFreeText("whatever the lender asks for"), null);
});

// ===========================================================================
// L3 — the MPERS eligibility screen was incomplete and had an unsafe synonym.
// ===========================================================================

test("L3: the screen asks the Interest Schemes limb the memo requires", () => {
  const question = questionOf(firmSeg("mpers_eligibility"), { entity_type: "sdn_bhd" });
  assert.match(question, /Interest Schemes Act 2016/);
  assert.match(question, /related to one/, "and the specified-related-entities limb");
  assert.match(question, /securities or banking law/);
  assert.match(question, /subsidiary, associate or jointly-controlled/);
  assert.match(question, /s\.244/);
});

test("L3: a bare “subsidiary” opens the WHOSE-subsidiary follow-up instead of deciding the test", async () => {
  // A subsidiary of an ordinary private company is still a private entity — the old synonym
  // marked it ineligible and cost it MPERS.
  const ordinary = await drive(firmSeg("mpers_eligibility"), [ANSWER("subsidiary"), ANSWER("no"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(ordinary.res.value.determination, "eligible");
  assert.equal(ordinary.res.value.parent_test, "ordinary_private_parent");
  assert.deepEqual(ordinary.asked.map((a) => a.phase), ["q", "q", "c"], "screen → parent follow-up → confirm");
  assert.match(ordinary.asked[1].question, /Whose subsidiary/);
  assert.match(ordinary.asked[1].question, /still a private entity/);

  const regulated = await drive(firmSeg("mpers_eligibility"), [ANSWER("subsidiary"), ANSWER("yes"), ANSWER("yes")], { entity_type: "sdn_bhd" });
  assert.equal(regulated.res.value.determination, "ineligible");
  assert.equal(regulated.res.value.parent_test, "regulated_or_listed_parent");

  // And the determination still drives the hard block in both directions.
  assert.equal(firmSeg("framework").validate("MPERS", { entity_type: "sdn_bhd", mpers_eligibility: ordinary.res.value }).ok, true);
  assert.equal(firmSeg("framework").validate("MPERS", { entity_type: "sdn_bhd", mpers_eligibility: regulated.res.value }).ok, false);
});

test("L3: the screen stays capture-class — it adds no new commit gate", () => {
  assert.equal(firmSeg("mpers_eligibility").requiredForCommit, false);
  assert.equal(firmSeg("mpers_eligibility").skippable, false, "…but it must still be answered when asked");
});

// ===========================================================================
// L4 — a CAS re-echo persisted one entity type while later segments used another.
// ===========================================================================

test("L4: the re-echoed value becomes the value later segments read (the exact reported scenario)", () => {
  // The client confirms sdn_bhd; a concurrent edit forces a stale conflict; the re-echo answers
  // sole_prop and THAT is what gets persisted.
  const prior = { entity_type: "sdn_bhd" };
  applyPersistOutcome(prior, "entity_type", { kind: "written", value: "sole_prop", echo: "entity type sole_prop" });
  assert.equal(prior.entity_type, "sole_prop", "prior tracks what the PLAN holds, not the first answer");

  // The consequences the finding named, now correct:
  assert.equal(segmentApplies(firmSeg("mpers_eligibility"), prior), false, "a sole proprietorship is NOT asked the Sdn Bhd screen");
  assert.equal(fw.defaultsFor(prior.entity_type, "not_determined").framework, "SPECIAL_PURPOSE_TAX_MANAGEMENT", "sole-prop defaults apply");
  assert.equal(rules.mpersEligibilityRefusal("MPERS", prior), null, "company statutory rules no longer bind it");
  assert.equal(rules.companyCashBasisRefusal("CASH_RECEIPTS_PAYMENTS", prior), null);
  assert.deepEqual(rules.basisWarnings("CASH_RECEIPTS_PAYMENTS", prior).map((w) => w.code), ["unincorporated_cash_basis"]);
});

test("L4: a re-echo that SKIPS withdraws the optimistic value (the same bug, other shoe)", () => {
  const prior = { msic: "46900" };
  applyPersistOutcome(prior, "msic", { kind: "skipped" });
  assert.equal("msic" in prior, false, "prior must never hold an answer the plan does not");
});

test("L4: kill/resume replays to the SAME state — the fold is deterministic", () => {
  const replay = () => {
    const p = {};
    applyPersistOutcome(p, "entity_type", { kind: "written", value: "sdn_bhd", echo: "e" });
    applyPersistOutcome(p, "entity_type", { kind: "written", value: "sole_prop", echo: "e" }); // the re-echo
    applyPersistOutcome(p, "msic", { kind: "written", value: "46900", echo: "e" });
    applyPersistOutcome(p, "msic", { kind: "skipped" });
    return p;
  };
  assert.deepEqual(replay(), replay(), "a WDK replay of the same deliveries reconstructs the same prior");
  assert.deepEqual(replay(), { entity_type: "sole_prop" });
  // A terminating outcome leaves prior untouched — nothing reads it after.
  const ending = { entity_type: "sdn_bhd" };
  applyPersistOutcome(ending, "entity_type", { kind: "cancelled" });
  assert.deepEqual(ending, { entity_type: "sdn_bhd" });
});

// ===========================================================================
// L5 — the warning acknowledgement was not actor-bound.
// ===========================================================================

const A = "aaaaaaaa-1111-4111-8111-111111111111";
const B = "bbbbbbbb-2222-4222-8222-222222222222";

test("L5: bookkeeper A acknowledges, bookkeeper B confirms — the record shows BOTH, in their right places", async () => {
  const s = scriptedAsk([
    ANSWER("cash", A), // the answer itself
    { kind: "answer", value: "yes", answeredBy: A }, // A takes on the warning
    { kind: "answer", value: "yes", answeredBy: B }, // B confirms the echo
  ]);
  const res = await askAndConfirmSegmentV2(firmSeg("accounting_basis"), s.ask, { entity_type: "llp" });
  assert.equal(res.outcome, "answered");
  assert.equal(res.answeredBy, B, "the segment is answered by whoever confirmed it");
  assert.equal(res.value.warnings[0].acknowledged, true);
  assert.equal(res.value.warnings[0].acknowledged_by, A, "…and the WARNING names whoever accepted it");
  assert.notEqual(res.value.warnings[0].acknowledged_by, res.answeredBy, "the two identities are recorded separately");
  // It survives into the durable item — an acknowledgement only in memory proves nothing later.
  assert.equal(res.items[0].answer.warnings[0].acknowledged_by, A);
});

test("L5: the observed-defective-records path carries its acknowledger (the memo's practitioner approval)", async () => {
  const s = scriptedAsk([
    ANSWER("cash", A),
    ANSWER("records_today", A),
    ANSWER("Cashbook only; converting at year end.", A),
    { kind: "answer", value: "yes", answeredBy: A },
    { kind: "answer", value: "yes", answeredBy: B },
  ]);
  const res = await askAndConfirmSegmentV2(firmSeg("accounting_basis"), s.ask, { entity_type: "sdn_bhd" });
  assert.equal(res.value.observed_basis, "CASH_RECEIPTS_PAYMENTS");
  assert.equal(res.value.warnings.every((w) => w.acknowledged_by === A), true, "the person who accepted the defect is named");
});

// ===========================================================================
// L6 — firm onboarding reported success after three failed plan writes.
// ===========================================================================

/** A stub plan writer: `conflicts` consecutive stale_conflicts, then a clean write. */
function stubPlanWriter(conflicts) {
  const calls = { writes: [], opKeys: [] };
  let n = 0;
  return {
    calls,
    deps: (ask) => ({
      ask,
      mintOpKey: async (label) => {
        calls.opKeys.push(label);
        return `op:${label}`;
      },
      updatePlan: async (args) => {
        n += 1;
        calls.writes.push(args.opKey);
        if (n <= conflicts) {
          return { revisionToken: `rev-${n}`, revisionN: n, status: "stale_conflict", conflictingKeys: ["legal_name"], liveItems: [] };
        }
        return { revisionToken: `rev-${n}`, revisionN: n, status: "updated" };
      },
    }),
  };
}

const WRITE_ARGS = { planId: "plan-1", items: [{ item_key: "legal_name", item_kind: "capture", question: null, answer: "ACME", state: "answered", required_for_commit: false }], answeredBy: A, revision: "rev-0", knownItems: {} };

test("L6: three conflicts NEVER report success — the run parks, loudly, naming stale_conflict", async () => {
  const w = stubPlanWriter(99); // every write conflicts
  const s = scriptedAsk([CANCEL()]);
  const out = await planwrite.writeFirmPlanWithRetries(w.deps(s.ask), WRITE_ARGS);
  assert.notEqual(out.status, "written", "exhaustion is not success");
  assert.equal(out.status, "abandoned");
  assert.equal(out.resolution, "cancelled");
  assert.equal(w.calls.writes.length, 3, "three bounded attempts, then the park");
  assert.equal(s.asked.length, 1, "the person was ASKED, not silently failed");
  assert.match(s.asked[0].question, /stale_conflict/);
  assert.match(s.asked[0].question, /could not be saved/);
  assert.match(s.asked[0].question, /None of your answers are lost/);
  assert.equal(s.asked[0].seg, "plan_write");
});

test("L6: a retry after the park succeeds cleanly, on FRESH op_keys", async () => {
  const w = stubPlanWriter(3); // round 1 exhausts; round 2's first write lands
  const s = scriptedAsk([ANSWER("retry")]);
  const out = await planwrite.writeFirmPlanWithRetries(w.deps(s.ask), WRITE_ARGS);
  assert.equal(out.status, "written");
  assert.equal(out.rounds, 2);
  assert.equal(w.calls.writes.length, 4, "3 conflicted + 1 that landed");
  assert.equal(new Set(w.calls.opKeys).size, w.calls.opKeys.length, "every attempt minted a DISTINCT op_key label");
  assert.ok(w.calls.opKeys.includes("firm_plan_write#1#0"), "the round counter is in the label, so a replay cannot reuse round 0's key");
});

test("L6: the park's own instruction works, and only a real answer retries", async () => {
  for (const word of ["retry", "RETRY", "again", "yes"]) {
    assert.equal(planwrite.wantsPlanWriteRetry({ kind: "answer", value: word }), true, `“${word}” retries`);
  }
  for (const resolution of [{ kind: "answer", value: "cancel" }, { kind: "answer", value: "" }, { kind: "cancelled" }, { kind: "expired" }]) {
    assert.equal(planwrite.wantsPlanWriteRetry(resolution), false, JSON.stringify(resolution));
  }
});

test("L6: an EXPIRED park abandons as expired, and a clean first write never parks at all", async () => {
  const expired = stubPlanWriter(99);
  const se = scriptedAsk([EXPIRE()]);
  const out = await planwrite.writeFirmPlanWithRetries(expired.deps(se.ask), WRITE_ARGS);
  assert.equal(out.status, "abandoned");
  assert.equal(out.resolution, "expired");

  const clean = stubPlanWriter(0);
  const sc = scriptedAsk([]);
  const ok = await planwrite.writeFirmPlanWithRetries(clean.deps(sc.ask), WRITE_ARGS);
  assert.deepEqual(ok, { status: "written", rounds: 1 });
  assert.equal(sc.asked.length, 0, "the happy path opens no park");
});

// ===========================================================================
// L7 — societies/co-ops got a false LHDN small-business warning.
// ===========================================================================

test("L7: PR 5/2000 reaches sole props and conventional partnerships ONLY", () => {
  for (const entity of ["sole_prop", "partnership"]) {
    const codes = rules.basisWarnings("CASH_RECEIPTS_PAYMENTS", { entity_type: entity }).map((w) => w.code);
    assert.deepEqual(codes, ["unincorporated_cash_basis"], `${entity} keeps the LHDN ruling`);
  }
  for (const entity of ["society", "cooperative"]) {
    const warnings = rules.basisWarnings("CASH_RECEIPTS_PAYMENTS", { entity_type: entity });
    const codes = warnings.map((w) => w.code);
    assert.deepEqual(codes, ["regulator_basis_cash"], `${entity} gets its regulator's rule, not LHDN's`);
    assert.doesNotMatch(warnings[0].message, /PR 5\/2000/, "and is never told to check an LHDN small-business test");
    assert.match(warnings[0].message, /Registrar of Societies|SKM GP23/);
  }
  // Unchanged neighbours.
  assert.deepEqual(rules.basisWarnings("CASH_RECEIPTS_PAYMENTS", { entity_type: "llp" }).map((w) => w.code), ["llp_cash_basis"]);
  assert.deepEqual(rules.basisWarnings("ACCRUAL", { entity_type: "society" }).map((w) => w.code), [], "accrual warns nobody");
  assert.deepEqual(rules.basisWarnings("ACCRUAL", { entity_type: "sole_prop" }).map((w) => w.code), []);
});

test("L7: a society on receipts-and-payments is recorded without a false authority", async () => {
  const { res, asked } = await drive(firmSeg("accounting_basis"), [ANSWER("receipts and payments"), ANSWER("yes"), ANSWER("yes")], { entity_type: "society" });
  assert.equal(res.value.accounting_basis, "CASH_RECEIPTS_PAYMENTS");
  assert.equal(res.value.warnings[0].code, "regulator_basis_cash");
  assert.doesNotMatch(asked[1].question, /PR 5\/2000/);
});

// ===========================================================================
// Cross-cutting: the client inventory carries every fix too.
// ===========================================================================

test("both inventories carry the L-round fixes (one segment factory, two interviews)", () => {
  const clientFramework = CLIENT_SEGMENTS_V2.find((s) => s.key === "framework");
  const clientBasis = CLIENT_SEGMENTS_V2.find((s) => s.key === "accounting_basis");
  const clientEligibility = CLIENT_SEGMENTS_V2.find((s) => s.key === "mpers_eligibility");
  assert.equal(clientFramework.followUps.length, 2, "free-text screen + edition");
  assert.equal(clientBasis.followUps.length, 3, "free-text screen FIRST, then observed-state, then its note");
  assert.equal(typeof clientEligibility.followUps[0], "function", "the parent follow-up");
  // Order is the L2 fix: the screen must precede the observed-state gate.
  assert.equal(clientBasis.validate("other", { entity_type: "sdn_bhd" }).value.accounting_basis, "OTHER");
});
