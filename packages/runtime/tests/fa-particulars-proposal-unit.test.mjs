// #933 — THE DEPRECIATION-PARTICULARS PROPOSAL, DERIVED, driven as a pure function.
//
// SUBJECT: `lib/fa-particulars-proposal.ts` — the derivation core the next `claraWork` successor
// (v6) will call after it has parked the #639 dependent particulars question, so the question can
// carry Clara's proposal instead of an empty form. The core is PURE: every fact it reasons from is
// passed in, because the reads that gather them are the successor's own step and a function that
// reached for a pool could not be driven here at all.
//
// #883's OWNER RULING IS THE WHOLE TEST PLAN. "A person stays the author of every depreciation
// estimate." So a cell that saw Clara invent a useful life out of an asset's NAME would be a cell
// against this product, not for it: the core proposes a driver only where a GROUND for it exists
// (the enrolment's own rule, a recorded note, the account's retired policy, the account's other
// completed assets), and where none does it proposes the two facts that are not estimates at all
// — the acquisition's posting date and the firm's nil residual — and leaves the method to the
// person.
//
// THE EXPECTED VALUES COME FROM THE SPEC AND THE ESTATE, NOT FROM RE-RUNNING THE CODE: the nine
// admitted particulars keys are 0041:2977-2984's closed set, the three methods are 0041's CHECK,
// the nil residual and the posting-date start are the owner's 2026-09-18 decisions recorded on
// #932, and `none` for a non-depreciable enrolment is `clara.complete_fixed_asset_particulars`'s
// own rule (0041:3080-3083).

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";

register();
const p = await import("../lib/fa-particulars-proposal.ts");

/** A pending register row on an enrolled, depreciable account — the state the dependent
 *  particulars question is opened for. */
const pendingAsset = (over = {}) => ({
  assetId: "11111111-1111-4111-8111-111111111111",
  description: "Air compressor, workshop bay 2",
  costCents: 1_200_000,
  nonDepreciable: false,
  particularsComplete: false,
  assetAccount: "1500",
  acquiredDate: "2026-09-15",
  ...over,
});

/** One of the account's other register rows, complete, to ground a method by precedent. */
const sibling = (over = {}) => ({
  assetAccount: "1500",
  particularsComplete: true,
  method: "straight_line",
  usefulLifeMonths: 60,
  rateBps: null,
  ...over,
});

test("p933.core.siblings_ground_the_method — the account's other completed assets agree, so the proposal carries their method and life, and its basis names them", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling(), sibling(), sibling()],
  });
  assert.ok(proposal, "a pending row on a policy-less account earns a proposal");
  assert.equal(proposal.method, "straight_line");
  assert.equal(proposal.useful_life_months, 60);
  assert.equal(proposal.rate_bps, null);
  assert.ok(proposal.basis.includes("account_siblings"),
    "the reason is derivable: the proposal names the ground it stands on");
});

test("p933.core.absent_when_the_policy_path_completed_the_row — a row born complete from the account's default policy earns NO proposal", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset({ particularsComplete: true }),
    siblings: [sibling(), sibling()],
  });
  assert.equal(proposal, null,
    "#932's policy path birthed this row complete: no question opens, so there is nothing to propose about");
});

test("p933.core.a_split_account_grounds_no_method — two completed siblings disagree, so Clara proposes no method rather than choosing between two humans", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling(), sibling({ usefulLifeMonths: 120 })],
  });
  assert.ok(proposal);
  assert.equal(proposal.method, null, "an account whose other assets disagree grounds nothing");
  assert.equal(proposal.useful_life_months, null);
  assert.deepEqual(proposal.basis, ["acquisition_date", "firm_default_residual"],
    "and the block claims no METHOD ground it does not have — only the two facts");
});

test("p933.core.only_this_account_and_only_completed_rows ground a method — a sibling on ANOTHER account and a still-pending one are both ignored", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [
      sibling({ assetAccount: "1600", usefulLifeMonths: 120 }),
      sibling({ particularsComplete: false, usefulLifeMonths: 24 }),
      sibling(),
    ],
  });
  assert.ok(proposal);
  assert.equal(proposal.useful_life_months, 60, "only 1500's completed rows are read, and they agree on 60");
});

test("p933.core.an_incongruent_sibling_is_dropped, never repaired — a straight_line row carrying a rate is a shape the door refuses", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling({ rateBps: 2000 }), sibling()],
  });
  assert.ok(proposal);
  assert.equal(proposal.method, "straight_line");
  assert.equal(proposal.rate_bps, null,
    "the malformed row is not counted as a dissent and its rate never reaches the proposal");
});

test("p933.core.the_enrolment_outranks_every_other_ground — a non-depreciable enrolment proposes `none` with no drivers, whatever the account's other rows say", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset({ nonDepreciable: true }),
    siblings: [sibling(), sibling(), sibling()],
  });
  assert.ok(proposal);
  assert.equal(proposal.method, "none",
    "clara.complete_fixed_asset_particulars admits `none` alone on an enrolment with no accumulated-depreciation account (0041:3080-3083)");
  assert.equal(proposal.useful_life_months, null, "`none` carries no life");
  assert.equal(proposal.rate_bps, null, "`none` carries no rate");
  assert.deepEqual(proposal.basis, ["enrolment", "acquisition_date", "firm_default_residual"],
    "the enrolment is the ground, and the siblings that would have said otherwise are not claimed as one");
});

test("p933.core.a_retired_account_policy_outranks_the_siblings — a person of the firm signed it for THESE assets, so it grounds the proposal and the basis names it", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling(), sibling()],
    retiredPolicy: {
      assetAccount: "1500", version: 2,
      method: "reducing_balance", usefulLifeMonths: 96, rateBps: 2000,
    },
  });
  assert.ok(proposal);
  assert.equal(proposal.method, "reducing_balance");
  assert.equal(proposal.useful_life_months, 96);
  assert.equal(proposal.rate_bps, 2000);
  assert.deepEqual(proposal.basis, ["retired_account_policy", "acquisition_date", "firm_default_residual"],
    "a retired policy is history, not noise — and it is never claimed alongside the siblings it outranks");
});

test("p933.core.a_retired_policy_for_ANOTHER_account_grounds_nothing", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling(), sibling()],
    retiredPolicy: {
      assetAccount: "1600", version: 1,
      method: "reducing_balance", usefulLifeMonths: 96, rateBps: 2000,
    },
  });
  assert.ok(proposal);
  assert.equal(proposal.method, "straight_line", "the account's own completed rows are the ground that remains");
  assert.deepEqual(proposal.basis, ["account_siblings", "acquisition_date", "firm_default_residual"]);
});

// THE KNOWLEDGE GROUND IS WIRED AND UNFED TODAY, AND THE MODULE'S HEADER SAYS SO. `clara.knowledge_keys`
// is a CLOSED, code-populated catalogue (migration 0230) and none of its fourteen keys is about
// depreciation, so no recorded record can state one yet; cataloguing a key is a migration this
// ticket does not own. The ground is built, ranked and driven here so that cataloguing the key is
// the whole of the later change — and the report records that nothing feeds it on this frontier.
test("p933.core.a_recorded_depreciation_note_outranks_the_account's_own_retired_policy", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling()],
    retiredPolicy: {
      assetAccount: "1500", version: 2,
      method: "reducing_balance", usefulLifeMonths: 96, rateBps: 2000,
    },
    knowledge: [{
      recordId: "k1", assetAccount: "1500", label: "Plant depreciated over 8 years, straight line",
      method: "straight_line", usefulLifeMonths: 96, rateBps: null,
    }],
  });
  assert.ok(proposal);
  assert.equal(proposal.method, "straight_line");
  assert.equal(proposal.useful_life_months, 96);
  assert.deepEqual(proposal.basis, ["client_knowledge", "acquisition_date", "firm_default_residual"]);
});

test("p933.core.a_note_about_THIS_account_beats_a_client-wide_one", () => {
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    knowledge: [
      { recordId: "k-all", assetAccount: null, label: "everything over 10 years",
        method: "straight_line", usefulLifeMonths: 120, rateBps: null },
      { recordId: "k-1500", assetAccount: "1500", label: "plant over 5 years",
        method: "straight_line", usefulLifeMonths: 60, rateBps: null },
    ],
  });
  assert.ok(proposal);
  assert.equal(proposal.useful_life_months, 60, "the narrower record governs the account it names");
});

test("p933.core.the_two_facts_that_are_not_estimates_are_always_proposed — the acquisition's posting date and a nil residual, even when nothing grounds a method", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset(), siblings: [] });
  assert.ok(proposal, "an ungrounded account still earns a proposal — of the facts, not of a guess");
  assert.equal(proposal.method, null, "a useful life is a professional judgement and Clara does not invent one");
  assert.equal(proposal.useful_life_months, null);
  assert.equal(proposal.start_date, "2026-09-15", "the owner's 2026-09-18 rule: the acquisition's posting date");
  assert.equal(proposal.residual_cents, 0, "the owner's 2026-09-18 default: nil");
  assert.equal(proposal.description, "Air compressor, workshop bay 2", "the row's own description, not a guess about it");
  assert.deepEqual(proposal.basis, ["acquisition_date", "firm_default_residual"],
    "the block claims exactly the two grounds it has");
});

test("p933.core.an_acquisition_with_no_posting_date_claims_no_date_ground", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset({ acquiredDate: null, description: "  " }) });
  assert.ok(proposal);
  assert.equal(proposal.start_date, null);
  assert.equal(proposal.description, null, "a placeholder description is absent, never the literal blank");
  assert.deepEqual(proposal.basis, ["firm_default_residual"]);
});

// THE ONE-LINE REASON — "with the one-line reason she derived them from" (#933's brief). It is the
// half of this ticket a person actually reads, so the cells below judge it as prose: ONE line, the
// ground named in words, and — where nothing grounded a method — an explicit statement that Clara
// is not proposing one rather than a silence a reader would mistake for a recommendation.
test("p933.reason.names_the_ground_in_one_line", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset(), siblings: [sibling(), sibling()] });
  assert.ok(proposal);
  assert.equal(proposal.reason.includes("\n"), false, "one line — it renders beside a form control");
  assert.ok(proposal.reason.length > 0 && proposal.reason.length <= 400, "readable at a glance");
  assert.match(proposal.reason, /1500/, "the account it read is named");
  assert.match(proposal.reason, /60 months/, "and what it found there, in words a person checks");
  assert.match(proposal.reason, /15 September 2026|2026-09-15/, "the in-service date it proposes is stated");
});

test("p933.reason.says_plainly_when_no_ground_supports_a_method", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset(), siblings: [] });
  assert.ok(proposal);
  assert.equal(proposal.reason.includes("\n"), false);
  assert.match(proposal.reason, /method/i, "the missing half is named rather than left silent");
  assert.match(proposal.reason, /1500/, "and the account that offered no ground is named too");
});

test("p933.reason.a_non-depreciable_enrolment_is_explained_as_the_register's_rule, not as a choice", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset({ nonDepreciable: true }), siblings: [sibling()] });
  assert.ok(proposal);
  assert.match(proposal.reason, /accumulated-depreciation/,
    "the person is told WHY `none` is the only method, so the proposal is checkable rather than trusted");
});

// THE WIRE. The proposal reaches every answering surface inside the question's `source_ref`, which
// migration 0180 constrains to "an object or null" and nothing more (0180:183) — so this block
// needs NO migration and no change to `clara.open_work_question`. The `{kind, asset_id}` stanza
// #639 shipped is EXTENDED, never replaced: `sourceRefText`
// (apps/web/components/work/work-question-form.tsx:891-897) reads `kind` and `id` alone, so the
// supporting line a person already sees is unmoved.
test("p933.wire.the_source_ref_extends #639's stanza rather than replacing it", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset(), siblings: [sibling(), sibling()] });
  const ref = p.proposalSourceRef(pendingAsset().assetId, proposal);
  assert.equal(ref.kind, "fixed_asset", "#639's own kind, unmoved");
  assert.equal(ref.asset_id, "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(ref.proposal, proposal, "the block travels verbatim");
});

test("p933.wire.no_proposal_means_no_proposal_key — a question for a row with nothing to propose carries #639's stanza exactly", () => {
  const ref = p.proposalSourceRef("11111111-1111-4111-8111-111111111111", null);
  assert.deepEqual(ref, { kind: "fixed_asset", asset_id: "11111111-1111-4111-8111-111111111111" },
    "a null proposal is ABSENT from the wire, never a `proposal: null` a reader has to interpret");
});

test("p933.wire.the_schema_admits_what_the_core_derives_and_refuses_a_shape_the_particulars_door_would", () => {
  const proposal = p.deriveFaParticularsProposal({ asset: pendingAsset(), siblings: [sibling()] });
  assert.equal(p.faParticularsProposalSchema.safeParse(proposal).success, true);
  assert.equal(p.faParticularsProposalSchema.safeParse({ ...proposal, method: "declining" }).success, false,
    "a method outside 0041's three is not a proposal");
  assert.equal(p.faParticularsProposalSchema.safeParse({ ...proposal, residual_cents: -1 }).success, false,
    "a negative residual is one clara._fa_validate_particulars refuses (0041:3086)");
  assert.equal(p.faParticularsProposalSchema.safeParse({ ...proposal, start_date: "15/09/2026" }).success, false,
    "the in-service date is ISO, the spelling the answer door stores");
});

// ---------------------------------------------------------------------------
// THE WIRE CONTRACT AND THE PRODUCER, held to each other
// ---------------------------------------------------------------------------

test("p933.wire.long_description — a realistic document-derived description rides the block whole; the schema imposes no bound the particulars door does not have", () => {
  // MEASURED FROM THE ESTATE, NOT INVENTED: clara._fa_validate_particulars (0041:2977-3033)
  // imposes NO length bound on `description`, and clara.fixed_assets.description is `text` with
  // character_maximum_length NULL and no length CHECK. A wire bound the door does not have is a
  // rule of this module's own, and this one deleted the WHOLE proposal for exactly the assets a
  // person most wants help with — vehicles and plant, whose descriptions carry a registration, a
  // chassis and an invoice reference (adversarial ADV-L05-02, 2026-09-24).
  const description =
    "Toyota Hiace panel van, registration WXY 1234, chassis JTFSX22P900123456, purchased from "
    + "Sunrise Motors Sdn Bhd under invoice SM/2026/004417 dated 15 September 2026, fitted with "
    + "refrigeration unit and rear shelving";
  assert.ok(description.length > 200, `the fixture must exceed the removed bound: ${description.length}`);

  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset({ description }),
    siblings: [sibling()],
  });
  assert.equal(proposal.description, description, "the description rides whole — never truncated");
  const parsed = p.faParticularsProposalSchema.safeParse(proposal);
  assert.equal(parsed.success, true,
    "and the block still parses: truncating it would be worse than carrying it, because the web pre-fills this value straight back into the door");
});

test("p933.wire.reason_ceiling — the ONE bound this module does impose on its own prose, it honours: a pathological recorded-policy label still leaves a reason the schema admits", () => {
  // The 400-character cap is this MODULE's rule, not the door's, and the header says so. A rule the
  // producer can break is not a rule: the client_knowledge branch measured 401 characters against a
  // single realistic policy label and dropped the whole proposal (ADV-L05-02).
  const label = "Plant and machinery are written off over five years on a straight-line basis, per the "
    + "policy the partners recorded at the 2026 year-end planning meeting and confirmed in writing to "
    + "every client of the firm on 30 June 2026, superseding the earlier ten-year convention";
  assert.ok(label.length > 200, `the fixture must be pathological: ${label.length}`);

  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset({ assetAccount: "1500-PLANT-AND-MACHINERY-AT-COST-CONSOLIDATED-GROUP" }),
    knowledge: [{
      recordId: "22222222-2222-4222-8222-222222222222",
      assetAccount: "1500-PLANT-AND-MACHINERY-AT-COST-CONSOLIDATED-GROUP",
      label,
      method: "straight_line",
      usefulLifeMonths: 60,
      rateBps: null,
    }],
  });
  assert.ok(proposal.reason.length <= 400, `the reason must honour its own bound, got ${proposal.reason.length}`);
  assert.equal(p.faParticularsProposalSchema.safeParse(proposal).success, true,
    "the derivation never emits a block its own schema refuses");
  // ...and what it drops is the label's tail, never the two facts that are not estimates.
  assert.match(proposal.reason, /in-service date, and a nil residual, which is this firm's default\.$/,
    "the in-service date and the residual survive the trim — they are the part a person acts on");
});

test("p933.wire.acquired_date_must_be_a_calendar_string — a JS Date is REFUSED loudly, because node-postgres hands one back for an uncast `date` column", () => {
  // THE TRANSCRIPTION TRAP THIS GUARD EXISTS FOR. `select fa.acquired_date` through pg returns a
  // JS Date, whose UTC spelling under Asia/Kuala_Lumpur is the PREVIOUS calendar day
  // (measured: '2026-09-15'::date -> 2026-09-14T16:00:00.000Z). Silently accepted, that is either a
  // dropped proposal or a wrong in-service date under a person's signature — the driver every
  // depreciation charge is computed from (adversarial ADV-L05-03, 2026-09-24). The successor's own
  // SQL casts (`fa.acquired_date::text`); this guard is what makes a forgotten cast LOUD.
  assert.throws(
    () => p.deriveFaParticularsProposal({
      asset: pendingAsset({ acquiredDate: new Date("2026-09-15T00:00:00+08:00") }),
      siblings: [sibling()],
    }),
    /acquiredDate must be a YYYY-MM-DD calendar string/,
    "a Date is a caller's forgotten ::text cast, and it is named as one",
  );
  assert.throws(
    () => p.deriveFaParticularsProposal({ asset: pendingAsset({ acquiredDate: "15/09/2026" }) }),
    /acquiredDate must be a YYYY-MM-DD calendar string/,
    "and so is any other spelling",
  );
  // The two shapes the contract DOES admit still pass straight through.
  assert.equal(
    p.deriveFaParticularsProposal({ asset: pendingAsset({ acquiredDate: "2026-09-15" }) }).start_date,
    "2026-09-15",
  );
  assert.equal(
    p.deriveFaParticularsProposal({ asset: pendingAsset({ acquiredDate: null }) }).start_date,
    null,
  );
});

// ---------------------------------------------------------------------------
// THE THREE GROUNDS, HELD TO ONE ANOTHER'S RULES
// ---------------------------------------------------------------------------

test("p933.core.a_null_asset_account_narrows_every_ground, not just the knowledge one — an unclassified row grounds on nothing but another unclassified row", () => {
  // `clara.fixed_assets.asset_account_code` is nullable (measured: information_schema.columns,
  // is_nullable = YES), so this state is representable. The knowledge arm always read it
  // correctly; the sibling and retired arms SKIPPED the account filter entirely when the pending
  // row had none, so every account in the register grounded the proposal and the reason then said
  // "every other completed asset on this asset account" about an account the ground never came
  // from (adversarial ADV-L05-05, 2026-09-24). Three arms, one rule.
  const unclassified = pendingAsset({ assetAccount: null });

  const bySibling = p.deriveFaParticularsProposal({
    asset: unclassified,
    siblings: [sibling({ assetAccount: "1500", usefulLifeMonths: 36 })],
  });
  assert.equal(bySibling.method, null, "a sibling on account 1500 does not speak for a row on no account");
  assert.ok(!bySibling.basis.includes("account_siblings"));

  const byRetired = p.deriveFaParticularsProposal({
    asset: unclassified,
    retiredPolicy: { assetAccount: "1500", version: 2, method: "straight_line", usefulLifeMonths: 36, rateBps: null },
  });
  assert.equal(byRetired.method, null, "...and neither does 1500's own retired policy");
  assert.ok(!byRetired.basis.includes("retired_account_policy"));

  const byNote = p.deriveFaParticularsProposal({
    asset: unclassified,
    knowledge: [{ recordId: "n1", assetAccount: "1500", label: "plant policy", method: "straight_line", usefulLifeMonths: 36, rateBps: null }],
  });
  assert.equal(byNote.method, null, "...and neither does a note about 1500 — which is what the other two now match");

  // ...while a ground that is ALSO about no particular account still speaks, on all three arms.
  const wide = p.deriveFaParticularsProposal({
    asset: unclassified,
    siblings: [sibling({ assetAccount: null, usefulLifeMonths: 48 })],
  });
  assert.equal(wide.method, "straight_line");
  assert.equal(wide.useful_life_months, 48);
  assert.ok(wide.basis.includes("account_siblings"));
});

test("p933.core.two_disagreeing_recorded_notes_ground_nothing — the same rule a split account already got", () => {
  // The module's own header states the rule: a split ground "grounds nothing and says so: picking
  // a side would be Clara choosing between two humans' judgements". `fromSiblings` honoured it;
  // the knowledge loop took the FIRST admissible note and never compared it with a later one, so
  // two records made by two people resolved by ARRAY ORDER (adversarial ADV-L05-06, 2026-09-24).
  const note = (over) => ({
    recordId: "n", assetAccount: "1500", label: "a policy",
    method: "straight_line", usefulLifeMonths: 60, rateBps: null, ...over,
  });

  const split = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    knowledge: [note({ recordId: "a", usefulLifeMonths: 60 }), note({ recordId: "b", usefulLifeMonths: 120 })],
  });
  assert.equal(split.method, null, "two records that disagree ground no method");
  assert.ok(!split.basis.includes("client_knowledge"));
  assert.match(split.reason, /Nothing on record grounds a depreciation method/);

  // Order must not change the answer: that is what "resolved by array order" would have looked like.
  const reversed = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    knowledge: [note({ recordId: "b", usefulLifeMonths: 120 }), note({ recordId: "a", usefulLifeMonths: 60 })],
  });
  assert.deepEqual(
    [reversed.method, reversed.useful_life_months], [split.method, split.useful_life_months],
    "the derivation is order-independent",
  );

  // AND THE NARROWER TIER STILL WINS OUTRIGHT. A record about THIS account governs, even where the
  // client-wide records disagree among themselves — the narrower statement is the one its author
  // meant for these assets, and the wide ones are not its rivals.
  const scopedWins = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    knowledge: [
      note({ recordId: "wide1", assetAccount: null, usefulLifeMonths: 24 }),
      note({ recordId: "scoped", usefulLifeMonths: 60 }),
      note({ recordId: "wide2", assetAccount: null, usefulLifeMonths: 120 }),
    ],
  });
  assert.equal(scopedWins.useful_life_months, 60, "the record naming this account governs");
  assert.ok(scopedWins.basis.includes("client_knowledge"));

  // ...but two records about THIS account that disagree are a split, whatever the wide ones say.
  const scopedSplit = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    knowledge: [
      note({ recordId: "wide", assetAccount: null, usefulLifeMonths: 24 }),
      note({ recordId: "s1", usefulLifeMonths: 60 }),
      note({ recordId: "s2", usefulLifeMonths: 120 }),
    ],
  });
  assert.equal(scopedSplit.method, null,
    "a split at the narrower tier is a split — falling back to the wide record would be choosing a side by another route");
});

test("p933.reason.a_sibling_ground_claims_the_DRIVERS it read, never 'the same' about a residual it did not", () => {
  // The residual is the owner's #932 default and is never read off a ground (the three input types
  // no longer carry one). So the sentence names what was actually read — the method and its
  // drivers — and the tail states the residual as this firm's default, which is what it is
  // (adversarial ADV-L05-06, 2026-09-24).
  const proposal = p.deriveFaParticularsProposal({
    asset: pendingAsset(),
    siblings: [sibling(), sibling()],
  });
  assert.equal(proposal.residual_cents, 0);
  assert.doesNotMatch(proposal.reason, /so I propose the same\./,
    "'the same' over-claims: the proposal's residual is Clara's default, not the siblings' own");
  assert.match(proposal.reason, /straight line over 60 months/, "the drivers it DID read are named");
  assert.match(proposal.reason, /a nil residual, which is this firm's default/,
    "and the residual is stated as the default it is");
});

// =========================================================================================
// #1090 — `mapDepreciationKnowledgeRows`: `clara.knowledge_records` rows (migration 0345's new
// `depreciation_policy` key) -> `FaProposalKnowledgeNote[]`. The RANKING this note feeds is
// already proven above (`p933.core.a_recorded_depreciation_note_outranks_the_account's_own_
// retired_policy` runs it alongside an agreeing sibling and shows client_knowledge still wins);
// what is new here is the READ-SHAPE MAPPING itself, driven as a pure function exactly like the
// rest of this file.

test("p1090.map.happy_path — a well-formed row maps field for field, from an independent expected literal", () => {
  const notes = p.mapDepreciationKnowledgeRows([
    { id: "rec-1", applies_when: { asset_account_code: "1500" },
      value: { method: "straight_line", useful_life_months: 96, rate_bps: null, label: "Plant, 8 years" } },
  ]);
  assert.deepEqual(notes, [
    { recordId: "rec-1", assetAccount: "1500", label: "Plant, 8 years",
      method: "straight_line", usefulLifeMonths: 96, rateBps: null },
  ]);
});

test("p1090.map.client_wide_when_applies_when_is_empty — an empty applies_when (the client-wide capture) maps assetAccount to null, never an empty string", () => {
  const [note] = p.mapDepreciationKnowledgeRows([
    { id: "rec-2", applies_when: {}, value: { method: "reducing_balance", useful_life_months: 60, rate_bps: 2000 } },
  ]);
  assert.equal(note.assetAccount, null);
  assert.equal(note.method, "reducing_balance");
  assert.equal(note.usefulLifeMonths, 60);
  assert.equal(note.rateBps, 2000);
});

test("p1090.map.missing_fields_become_null_or_empty_label, never undefined", () => {
  const [note] = p.mapDepreciationKnowledgeRows([{ id: "rec-3", applies_when: {}, value: {} }]);
  assert.deepEqual(note, {
    recordId: "rec-3", assetAccount: null, label: "", method: null, usefulLifeMonths: null, rateBps: null,
  });
});

test("p1090.map.a_malformed_value_is_DROPPED, never thrown — the catalog validates 'an object' alone (shape_only), so anything narrower is this mapper's own problem to tolerate", () => {
  const notes = p.mapDepreciationKnowledgeRows([
    { id: "bad-null", applies_when: {}, value: null },
    { id: "bad-string", applies_when: {}, value: "not an object" },
    { id: "bad-array", applies_when: {}, value: ["not", "an", "object"] },
    { id: "good", applies_when: {}, value: { method: "none" } },
  ]);
  assert.deepEqual(notes.map((n) => n.recordId), ["good"],
    "every malformed row is silently dropped and the well-formed one still comes through");
});

test("p1090.map.a_malformed_applies_when_reads_as_client-wide, never thrown", () => {
  const [note] = p.mapDepreciationKnowledgeRows([
    { id: "rec-4", applies_when: "not an object", value: { method: "none" } },
  ]);
  assert.equal(note.assetAccount, null);
});

test("p1090.map.order_is_preserved_and_nothing_is_ranked_here — ranking is deriveFaParticularsProposal's own job, over every note it is handed", () => {
  const notes = p.mapDepreciationKnowledgeRows([
    { id: "first", applies_when: {}, value: { method: "straight_line", useful_life_months: 24 } },
    { id: "second", applies_when: {}, value: { method: "straight_line", useful_life_months: 48 } },
  ]);
  assert.deepEqual(notes.map((n) => n.recordId), ["first", "second"]);
});
