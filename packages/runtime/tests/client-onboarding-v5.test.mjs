// clientOnboarding_v5 — THE QUESTION INVENTORY AND THE KNOWN-FACTS GUARD.
//
// v5 is #649's successor contract, delivered at the wave 2026-09-15 integration cut because
// DECISIONS §1.1 forbade the implementation branch from cutting a `_vN`. Three changes, and this
// file proves each of them over PURE functions — no engine, no database. The World half is
// `tests/interview-e2e.mjs` (whose `p649.interview.sst_park_closed` cell is the flip #649 asked for).
//
//   1. H-52 — `sst_no` is gated behind `sst_regime !== 'not_registered'`. A client that has just
//      said it is not registered is no longer asked for its registration number.
//   2. D7 — a `fye_day` segment immediately after `fye`, validated against that month's own length,
//      recorded as a `capture` that does NOT gate the commit ceremony.
//   3. The known-facts pre-read: a registered fact the segment's own validator accepts makes the
//      question ABSENT; one it REFUSES makes the question a CONFIRM with the record shown.
//
// AND THE DISCIPLINE THE INVENTORY IS BUILT ON, asserted rather than assumed: every unchanged
// segment is the SAME OBJECT REFERENCE v3 holds. A copied literal would drift from v3 the first
// time somebody edited one of them, and `interview.v3.questions.ts` states the rule for exactly
// this reason.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v3Questions = await import("../workflows/interview.v3.questions.ts");
const v4Questions = await import("../workflows/interview.v4.questions.ts");
const v4Known = await import("../workflows/interview.v4.known.ts");
const core = await import("../workflows/interview.v2.core.ts");
const registry = await import("../workflows/registry.ts");

const V3 = v3Questions.CLIENT_SEGMENTS_V3;
const V4 = v4Questions.CLIENT_SEGMENTS_V4;
const seg = (key) => V4.find((s) => s.key === key);

// ---------------------------------------------------------------------------
// 1 · the inventory: built by reference, order preserved
// ---------------------------------------------------------------------------

test("v5.inventory: V4 is V3 with ONE segment replaced and ONE inserted — everything else is the same object", () => {
  const v3Keys = V3.map((s) => s.key);
  const v4Keys = V4.map((s) => s.key);
  assert.deepEqual(v4Keys.filter((k) => k !== "fye_day"), v3Keys, "the order is v3's, with fye_day the only new key");
  assert.equal(V4.length, V3.length + 1);
  for (const s of V4) {
    if (s.key === "fye_day" || s.key === "sst_no") continue;
    assert.equal(s, V3.find((x) => x.key === s.key), `${s.key} is the SAME object v3 holds, not a copy`);
  }
});

test("v5.inventory: fye_day sits IMMEDIATELY after fye — the validator reads prior['fye']", () => {
  const i = V4.findIndex((s) => s.key === "fye");
  assert.ok(i >= 0, "control: fye is still asked");
  assert.equal(V4[i + 1].key, "fye_day", "the driver seeds `prior` in order, so the month must be recorded before the day is asked");
});

test("v5.inventory: sst_no keeps v3's question, validator and flags — it gains ONLY appliesTo", () => {
  const v3sst = V3.find((s) => s.key === "sst_no");
  const v4sst = seg("sst_no");
  assert.notEqual(v4sst, v3sst, "it is a new object (v3's is frozen inside a deployed closure)");
  assert.equal(v4sst.question, v3sst.question, "…carrying v3's own question text");
  assert.equal(v4sst.validate, v3sst.validate, "…v3's own validator, by reference");
  assert.equal(v4sst.requiredForCommit, v3sst.requiredForCommit);
  assert.equal(v4sst.skippable, v3sst.skippable);
  assert.equal(typeof v4sst.appliesTo, "function", "and exactly one new field");
  assert.equal(v3sst.appliesTo, undefined, "control: v3 asked it of everybody");
});

// ---------------------------------------------------------------------------
// 2 · H-52
// ---------------------------------------------------------------------------

test("v5.h52: sst_no is not asked of a client that is not registered — and IS asked of one that is", () => {
  const sst = seg("sst_no");
  assert.equal(core.segmentApplies(sst, { sst_regime: "not_registered" }), false, "H-52 closed");
  for (const regime of ["sales_tax", "service_tax", "both"]) {
    assert.equal(core.segmentApplies(sst, { sst_regime: regime }), true, `a ${regime} client is still asked`);
  }
  // AN ABSENT REGIME STILL ASKS. "We do not know" is not "not registered", and an interview that
  // silenced a question because it had not reached the one before it would be inventing an answer.
  assert.equal(core.segmentApplies(sst, {}), true);
  assert.equal(v4Questions.sstNumberApplies({ sst_regime: "not_registered" }), false, "…and the predicate is exported so a cell can drive it directly");
});

// ---------------------------------------------------------------------------
// 3 · D7 — the fy-end day
// ---------------------------------------------------------------------------

test("v5.fye_day: the day is validated against the MONTH the previous segment recorded", () => {
  const v = (raw, month) => v4Questions.validateFyeDay(raw, month === undefined ? {} : { fye: month });
  assert.equal(v("30", 6).ok, true, "30 June is a date");
  assert.equal(v("31", 6).ok, false, "31 June is not — and `ck_clients_fy_end` (0041) would refuse it too");
  assert.equal(v("29", 2).ok, true, "a leap-day year end is rare but real, and the CHECK admits it");
  assert.equal(v("30", 2).ok, false, "30 February is not a date in any year");
  assert.equal(v("31", 12).ok, true);
  assert.equal(v("0", 12).ok, false);
  assert.equal(v("32", 12).ok, false);
  assert.equal(v("the last day", 12).ok, false, "a word is not a day — the interview asks for the number");
  // NO MONTH IN HAND falls back to the calendar maximum rather than refusing a correct answer for a
  // reason the person cannot act on.
  assert.equal(v("31").ok, true);
  assert.equal(v("30", 6).value, 30, "and the accepted value is normalised to a NUMBER");
});

test("v5.fye_day: the month-length table IS ck_clients_fy_end's own shape", () => {
  assert.deepEqual([...v4Questions.FYE_MONTH_LAST_DAY], [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
});

test("v5.fye_day: the plan item is a capture that does NOT gate the commit ceremony", () => {
  const s = seg("fye_day");
  assert.equal(s.requiredForCommit, false,
    "making the day a commit prerequisite is a product change nobody ruled — and would newly block every commit whose plan predates this cut");
  assert.equal(s.skippable, false, "which is not the same thing: the interview does not offer 'skip' as an answer");
  const items = s.toItems(30, s);
  assert.equal(items.length, 1);
  assert.deepEqual(
    [items[0].item_key, items[0].item_kind, items[0].state, items[0].required_for_commit, items[0].answer],
    ["fye_day", "capture", "answered", false, 30],
  );
  assert.equal(items[0].question, s.question, "the plan records the question AS ASKED");
  assert.match(s.question, /Clara does not assume month end/, "D7: ask, never derive");
});

test("v5.fye_day: nothing in commit_client_onboarding's own item vocabulary moved", () => {
  // The three keys 0017's commit gate reads BY NAME are a DB contract. This cell exists so a later
  // hand cannot make `fye_day` gating by renaming it into that set without noticing.
  const contractKeys = ["coa_seed_decision", "first_year_zero_opening", "carry_down_deferred"];
  assert.ok(!contractKeys.includes("fye_day"));
  const coa = seg("coa_seed");
  assert.equal(coa.requiredForCommit, true, "control: the contract key that IS required is untouched");
  assert.deepEqual(coa.toItems("yes", coa).map((i) => i.item_key), ["coa_seed_decision", "coa_chart_apply"]);
});

// ---------------------------------------------------------------------------
// 4 · the known-facts pre-read
// ---------------------------------------------------------------------------

const PACK = (records) => ({ status: "ok", knowledge_version: "12", records });
const record = (key, value, extra = {}) => ({
  knowledge_key: key,
  value,
  record_id: `rec-${key}`,
  knowledge_version: "12",
  trust: "asserted",
  source_kind: "user_statement",
  scope_kind: "client",
  ...extra,
});

test("v5.known: the map is SEGMENT key -> KNOWLEDGE key, and the two that differ are named", () => {
  assert.equal(v4Known.KNOWN_FACT_KEYS.turnover, "turnover_band");
  assert.equal(v4Known.KNOWN_FACT_KEYS.currency, "default_currency");
  assert.equal(v4Known.KNOWN_FACT_KEYS.fye, "financial_year_end_month");
  // THE OBJECT-SHAPED FOLDS ARE DELIBERATELY ABSENT: each records the interview's own FOLD of an
  // answer, not the answer, so replaying one as an answer would feed a validator a value no person
  // could have typed.
  for (const absent of ["framework", "accounting_basis", "mpers_eligibility", "coa_seed"]) {
    assert.ok(!(absent in v4Known.KNOWN_FACT_KEYS), `${absent} must not be auto-answered from its recorded fold`);
  }
});

test("v5.known: an unavailable or malformed pack yields NO known facts — every question is asked", () => {
  assert.deepEqual(v4Known.knownFactsFromPack({ status: "unavailable", reason: "read_failed" }), {});
  assert.deepEqual(v4Known.knownFactsFromPack(null), {});
  assert.deepEqual(v4Known.knownFactsFromPack({ status: "ok" }), {}, "a pack with no records array is not an empty register");
});

test("v5.known: a recorded fact the segment's OWN validator accepts makes the question absent", () => {
  const known = v4Known.knownFactsFromPack(PACK([record("default_currency", "MYR")]));
  const currency = seg("currency");
  const answer = v4Known.knownAnswer(currency, {}, known);
  assert.ok(answer, "the register answered it");
  assert.equal(answer.value, "MYR", "normalised by the SAME code path a person's typing takes");
  assert.equal(answer.fact.recordId, "rec-default_currency");
  assert.equal(v4Known.knownApplies(currency, {}, known), false, "so the question is not asked");
  assert.equal(v4Known.knownApplies(seg("msic"), {}, known), true, "control: a segment with no recorded fact still is");
});

test("v5.known: a recorded fact the validator REFUSES is ASKED, with the record shown — known, confirm", () => {
  // The disagreement clause. `turnover_band` is a closed enum in the register AND in the segment;
  // a row carrying something outside it cannot be replayed as an answer, and silently skipping the
  // question would lose both the fact and the chance to correct it.
  const known = v4Known.knownFactsFromPack(PACK([record("turnover_band", "RM500M+")]));
  const turnover = seg("turnover");
  assert.equal(v4Known.knownAnswer(turnover, {}, known), null, "it does not answer the question");
  assert.equal(v4Known.knownApplies(turnover, {}, known), true, "so the question IS asked");
  const q = v4Known.knownQuestionFor(turnover, {}, known);
  assert.match(q, /RM500M\+/, "…with the recorded value in front of the person");
  assert.match(q, /trust asserted/, "…and its provenance");
  assert.match(q, /stays as it is until somebody corrects it/, "…and an honest statement that this lane does not write it back");
  assert.ok(q.endsWith(core.questionOf(turnover, {})), "the original question is still the last thing they read");
});

test("v5.known: an ACCEPTED fact leaves the question text alone", () => {
  const known = v4Known.knownFactsFromPack(PACK([record("default_currency", "MYR")]));
  const currency = seg("currency");
  assert.equal(v4Known.knownQuestionFor(currency, {}, known), core.questionOf(currency, {}),
    "there is nothing to show — the question is simply not asked");
  assert.equal(v4Known.knownQuestionFor(seg("msic"), {}, {}), core.questionOf(seg("msic"), {}),
    "and a segment with no recorded fact is unchanged");
});

test("v5.known: an answer given IN THIS RUN beats the register — the person is at the keyboard now", () => {
  const known = v4Known.knownFactsFromPack(PACK([record("default_currency", "USD")]));
  assert.equal(v4Known.knownAnswer(seg("currency"), { currency: "MYR" }, known), null);
  assert.equal(v4Known.knownFactFor(seg("currency"), { currency: "MYR" }, known), null);
});

test("v5.known: the CLIENT's own record beats the firm's rule, whichever order the pack returns them in", () => {
  // `clara.get_knowledge_pack` sorts by `knowledge_key` ALONE (0192:1502,
  // `jsonb_agg(j order by knowledge_key)`) and appends the legacy rows after that, so two rows
  // under one key come back in whatever order the scan produced. This fold may NOT rely on it:
  // `default_currency` is one of the three firm-eligible keys, so a firm rule and a client
  // exception with different applicability genuinely reach the pack together — and whichever wins
  // is the value that SKIPS the question.
  const clientFirst = v4Known.knownFactsFromPack(PACK([
    record("default_currency", "MYR", { record_id: "client-row" }),
    record("default_currency", "SGD", { record_id: "firm-row", scope_kind: "firm" }),
  ]));
  assert.equal(clientFirst.currency.recordId, "client-row");

  const firmFirst = v4Known.knownFactsFromPack(PACK([
    record("default_currency", "SGD", { record_id: "firm-row", scope_kind: "firm" }),
    record("default_currency", "MYR", { record_id: "client-row" }),
  ]));
  assert.equal(firmFirst.currency.recordId, "client-row",
    "the client's own exception governs its own interview, whatever order the aggregate emitted");
  assert.equal(firmFirst.currency.scopeKind, "client");

  // A firm rule with NO client row beside it still answers — it is the firm's stated default and
  // nothing contradicts it.
  const firmOnly = v4Known.knownFactsFromPack(PACK([
    record("default_currency", "SGD", { record_id: "firm-row", scope_kind: "firm" }),
  ]));
  assert.equal(firmOnly.currency.recordId, "firm-row");
  assert.equal(firmOnly.currency.scopeKind, "firm");

  // Two CLIENT rows under one key is a conflict this lane does not resolve: the first wins and the
  // later one is simply not used, which is what the docblock has always said.
  const twoClient = v4Known.knownFactsFromPack(PACK([
    record("default_currency", "MYR", { record_id: "first" }),
    record("default_currency", "USD", { record_id: "second" }),
  ]));
  assert.equal(twoClient.currency.recordId, "first");
});

// ---------------------------------------------------------------------------
// 4b · #649 item 3's OTHER half: the plan's own answered items
// ---------------------------------------------------------------------------
//
// The stanza seeds `prior` "from clara.get_knowledge_pack … PLUS the plan's own answered items".
// The pack half shipped at the cut; this is the plan half. It matters for a plan a firm partly
// filled from the dashboard before starting the interview — `clara.begin_client_onboarding` seeds
// NO items, so a fresh plan folds to `{}` and nothing about a first run changes.

test("v5.plan-prior: an item the plan already carries as ANSWERED seeds prior, normalised by the segment's own validator", () => {
  const prior = v4Known.priorFromPlanItems(V4, [
    { itemKey: "interview_run", state: "answered", answer: { run_id: "r1" } },
    { itemKey: "entity_type", state: "answered", answer: "sdn_bhd" },
    { itemKey: "fye", state: "answered", answer: 6 },
    { itemKey: "fye_day", state: "answered", answer: "30" },
  ]);
  assert.equal(prior.entity_type, "sdn_bhd");
  assert.equal(prior.fye, 6);
  assert.equal(prior.fye_day, 30, "the validator NORMALISES — a plan item is put through the same code path a person's typing takes");
  assert.ok(!("interview_run" in prior), "the run binding is not a segment and answers no question");
});

test("v5.plan-prior: a PENDING item, an absent item and a value the validator refuses all leave the question to be asked", () => {
  const prior = v4Known.priorFromPlanItems(V4, [
    { itemKey: "entity_type", state: "pending", answer: null },
    { itemKey: "turnover", state: "answered", answer: "RM500M+" },
    { itemKey: "fye", state: "answered", answer: 2 },
    { itemKey: "fye_day", state: "answered", answer: 31 },
  ]);
  assert.ok(!("entity_type" in prior), "a pending item is an unanswered question, not an answered one");
  assert.ok(!("turnover" in prior), "a recorded value outside the segment's own enum is asked, never replayed");
  assert.equal(prior.fye, 2);
  assert.ok(!("fye_day" in prior),
    "…and the cross-field validator runs with the prior built SO FAR: February has 29 days, so 31 is refused here exactly as it would be from a person");
});

test("v5.plan-prior: an empty or absent item list folds to nothing — a fresh plan behaves exactly as v4 did", () => {
  assert.deepEqual(v4Known.priorFromPlanItems(V4, []), {});
  assert.deepEqual(v4Known.priorFromPlanItems(V4, null), {});
  assert.deepEqual(v4Known.priorFromPlanItems(V4, undefined), {});
});

test("v5.plan-prior: a register-answered segment is stamped with WHERE the value came from", () => {
  const known = v4Known.knownFactsFromPack(PACK([record("default_currency", "MYR")]));
  const item = v4Known.knownProvenanceItem(known.currency);
  assert.equal(item.item_key, "currency__known_from_register");
  assert.equal(item.item_kind, "capture", "0017 closes item_kind to must_ask/capture/todo");
  assert.equal(item.required_for_commit, false, "a NEW key nothing in commit_client_onboarding reads — the gate does not move");
  assert.equal(item.state, "answered");
  assert.equal(item.answer.knowledge_record_id, "rec-default_currency");
  assert.equal(item.answer.knowledge_key, "default_currency");
  assert.equal(item.answer.scope_kind, "client");
  assert.equal(item.answer.trust, "asserted");
  // The ANSWER item itself is untouched: `clara.commit_client_onboarding` reads plan answers by
  // name, so wrapping the value in a provenance envelope would have moved the ceremony's gate.
  const currency = seg("currency");
  const auto = v4Known.knownAnswer(currency, {}, known);
  assert.equal(auto.value, "MYR", "the answer stays the answer");
});

test("v5.known: segmentAsking copies field by field and drops questionFor", () => {
  // THE FRAMEWORK SEGMENT IS THE ONE THAT MATTERS HERE: it carries `questionFor` (the entity-aware
  // option list), `followUps` (the MPERS edition question) and `warn`. If `segmentAsking` dropped
  // any of those three, a confirm-shaped re-ask would quietly become a different, weaker question.
  const framework = seg("framework");
  assert.equal(typeof framework.questionFor, "function", "control: the framework segment builds its question from prior");
  assert.ok(Array.isArray(framework.followUps) && framework.followUps.length > 0, "control: …and opens a follow-up");
  assert.equal(typeof framework.warn, "function", "control: …and can warn");
  const asked = v4Known.segmentAsking(framework, "A DIFFERENT QUESTION");
  assert.equal(asked.question, "A DIFFERENT QUESTION");
  assert.equal(asked.questionFor, undefined, "carrying it would let the dynamic text override the resolved one at ask time");
  assert.equal(asked.validate, framework.validate, "…and every other field is v3's own, by reference");
  assert.equal(asked.followUps, framework.followUps, "…the follow-ups survive");
  assert.equal(asked.warn, framework.warn, "…and so does the warning");
  assert.equal(asked.requiredForCommit, framework.requiredForCommit);
  assert.equal(core.questionOf(asked, {}), "A DIFFERENT QUESTION");
  // …and the gated segment's own new field survives a copy too, so a re-echo cannot re-open a
  // question H-52 just closed.
  const sstAsked = v4Known.segmentAsking(seg("sst_no"), "x");
  assert.equal(sstAsked.appliesTo, seg("sst_no").appliesTo);
});

// ---------------------------------------------------------------------------
// 5 · the registry
// ---------------------------------------------------------------------------

test("v5.registry: clientOnboarding is pinned at v5 and v1..v4 stay exported (policy (c))", () => {
  assert.equal(registry.workflowPins.clientOnboarding, "clientOnboarding_v5");
  assert.equal(registry.workflows.clientOnboarding, registry.clientOnboarding_v5);
  for (let n = 1; n <= 4; n += 1) {
    assert.equal(typeof registry[`clientOnboarding_v${n}`], "function", `clientOnboarding_v${n} is still exported — the >=48h parks are the whole point of this class`);
  }
  assert.ok(registry.workflowBodies.includes("clientOnboarding_v5"));
});
