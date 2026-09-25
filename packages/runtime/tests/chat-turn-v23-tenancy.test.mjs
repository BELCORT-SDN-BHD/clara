// chatTurn_v23 — #1144, the four tenancy tools of #1137 (contracts in
// `waveS-lane08-ticket1137.md`, as amended by `waveS-lane08-fix.md` §7).
//
// TWO READS AND TWO ON-BEHALF-OF CONFIRMATIONS, built under the owner's ruling of 2026-09-25
// recorded on #1137. The reads run on the `clara_agent_ro` read pool through `readScoped`; the
// confirmations run on `clara_runtime` through `pools().withRuntime`, exactly as
// `runStartPrepaymentScheduleWork` does — which is also why they emit NO new part kind
// (`waveS-lane08-fix.md` §7.2 settles that by measurement).
//
// WHAT THIS FILE PROVES, cell by cell:
//
//   1. THE INPUTS ARE #1137's OWN, `.strict()`. `read_tenancy_terms` takes the DOCUMENT alone and
//      no client: all three doors take the document and each core resolves the client itself
//      under the credential's firm, so a client argument would be one more existence surface.
//   2. THE THIRD READ IS CONDITIONAL. `clara.wake_propose_contract_terms` is called ONLY when no
//      terms are recorded — the RECORD is what a person decided, the proposal is what a machine
//      read, and offering the second beside the first invites the model to prefer its own.
//   3. THE CONFIRMATIONS REFUSE A CLIENT DISAGREEMENT rather than resolving it silently.
//   4. THE OP KEY IS STABLE and derived from the task id (§7.3), not fresh per act.
//   5. THE REFUSAL LADDER CARRIES §7.1's `client_inactive` row, in the position the fix names.
//   6. NO SETTLE TOOL, NO RECORD-TERMS TOOL, NO UNGRANTED CORE — #1137's "what the cut must NOT
//      do", asserted over the module's own source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v23Tenancy = await import("../workflows/chatTurn.v23.tenancy.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const DOC = "66666666-6666-4666-8666-666666666666";
const OTHER_CLIENT = "11111111-1111-4111-8111-111111111111";

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const SRC = codeOf(new URL("../workflows/chatTurn.v23.tenancy.ts", import.meta.url));

// ---------------------------------------------------------------------------
// 1 · `read_tenancy_terms` (#949 item 1)
// ---------------------------------------------------------------------------

test("v23.tenancy_terms: the input is the DOCUMENT alone, and a client_id is refused", () => {
  const schema = v23Tenancy.readTenancyTermsInputSchema;
  assert.deepEqual(Object.keys(schema.shape), ["document_id"]);
  assert.equal(schema.safeParse({ document_id: DOC }).success, true);
  // #949's input, unchanged, and the report says why no client belongs here: all three doors take
  // the DOCUMENT and each core resolves the client itself under the credential's firm.
  assert.equal(schema.safeParse({ document_id: DOC, client_id: CTX.clientId }).success, false);
  assert.equal(schema.safeParse({ document_id: "nope" }).success, false);
  assert.equal(v23Tenancy.READ_TENANCY_TERMS_TOOL, "read_tenancy_terms");
});

test("v23.tenancy_terms: three doors, in the contract's order, and the proposal ONLY when nothing is recorded", () => {
  assert.match(SRC, /clara\.wake_get_contract_terms\(\$1::uuid\)/);
  assert.match(SRC, /clara\.wake_get_tenancy_rent_plan_draft\(\$1::uuid\)/);
  assert.match(SRC, /clara\.wake_propose_contract_terms\(\$1::uuid\)/);
  // the CONDITION is the point of the third read, so it is pinned as source rather than implied
  assert.match(SRC, /recorded\.length === 0/);
  // #1137's "what the cut must NOT do": the four ungranted cores are never named
  for (const core of [
    "_tenancy_lease_treatment",
    "_tenancy_rent_plan_draft",
    "_tenancy_escalation_state",
    "_rent_payable_unsettled",
  ]) {
    assert.ok(!SRC.includes(`clara.${core}`), `${core} is granted to nobody and is never called`);
  }
  assert.ok(!/settle_rent_payable|record_contract_terms/.test(SRC),
    "no settle tool and no record-terms tool at this cut");
});

test("v23.tenancy_terms: the refusal sentences are #1137's, and a stranger's tenancy answers as a missing one", () => {
  assert.equal(
    v23Tenancy.TENANCY_TERMS_REFUSALS.not_permitted,
    "I cannot read your firm's agreements in this conversation.",
  );
  assert.equal(
    v23Tenancy.TENANCY_TERMS_REFUSALS.not_found,
    "I cannot find that agreement under your firm.",
  );
  // the CLR03 sentence never names the document — the caller could not read agreements at all
  assert.ok(!v23Tenancy.TENANCY_TERMS_REFUSALS.not_permitted.includes("document"));
  // `not_a_tenancy` is a refusal of its own: a deterministic evaluator decided the class from the
  // words the page uses for itself, so the answer SAYS what class it is rather than guessing.
  assert.equal(v23Tenancy.TENANCY_TERMS_REFUSALS.not_a_tenancy,
    "That agreement is not a tenancy, so there is no rent plan to read.");
});

test("v23.tenancy_terms: a draft that is not a tenancy is refused BY CLASS, not by silence", () => {
  // The pure classifier, driven at both arms. The draft answer is the door's own shape: the class
  // it carries, and the refusal list its own branch produced.
  assert.equal(v23Tenancy.tenancyRefusedByClass({ agreement_class: "tenancy", refusals: [] }), null);
  assert.equal(v23Tenancy.tenancyRefusedByClass({ agreement_class: "hire_purchase", refusals: [] }), "hire_purchase");
  assert.equal(
    v23Tenancy.tenancyRefusedByClass({ agreement_class: "tenancy", refusals: ["not_a_tenancy"] }),
    "tenancy",
    "the branch's own refusal wins even when the class reads tenancy",
  );
  assert.equal(v23Tenancy.tenancyRefusedByClass(null), null, "an unreadable draft is not a class verdict");
});

// ---------------------------------------------------------------------------
// 2 · `read_rent_settlement_candidates` (#949 item 4)
// ---------------------------------------------------------------------------

test("v23.rent_candidates: the input is the CLIENT alone, and no candidate is takeable", () => {
  const schema = v23Tenancy.readRentSettlementCandidatesInputSchema;
  assert.deepEqual(Object.keys(schema.shape), ["client_id"]);
  assert.equal(schema.safeParse({ client_id: CTX.clientId }).success, true);
  for (const invented of ["line_id", "candidate", "match_id", "document_id"]) {
    assert.equal(schema.safeParse({ client_id: CTX.clientId, [invented]: "x" }).success, false,
      `${invented}: two lines of the same amount in one window are two lines a PERSON adjudicates`);
  }
  assert.equal(v23Tenancy.READ_RENT_SETTLEMENT_CANDIDATES_TOOL, "read_rent_settlement_candidates");
});

test("v23.rent_candidates: two doors, the client wall, and the empty months sentence", async () => {
  assert.match(SRC, /clara\.wake_get_rent_settlement_candidates\(\$1::uuid\)/);
  assert.match(SRC, /clara\.wake_get_tenancy_deposit_coding\(\$1::uuid\)/);
  assert.equal(
    v23Tenancy.NO_RENT_MONTH_AWAITING_PAYMENT,
    "No month of rent is waiting on its payment.",
  );
  assert.equal(
    v23Tenancy.RENT_CANDIDATES_REFUSALS.not_permitted,
    "I cannot read this client's rent in this conversation.",
  );
  assert.equal(
    v23Tenancy.RENT_CANDIDATES_REFUSALS.client_not_found,
    "I cannot find that client under your firm.",
  );
  const none = await v23Tenancy.runReadRentSettlementCandidates(
    { ...CTX, clientId: null }, { client_id: CTX.clientId });
  assert.equal(none.ok, false);
  assert.equal(none.reason, "rent_candidates_needs_client_pin");
  const other = await v23Tenancy.runReadRentSettlementCandidates(CTX, { client_id: OTHER_CLIENT });
  assert.equal(other.ok, false);
  assert.equal(other.reason, "client_not_in_conversation");
});

// ---------------------------------------------------------------------------
// 3 · `confirm_tenancy_rent_plan` (#949 item 2, under the ruling of 2026-09-25)
// ---------------------------------------------------------------------------

test("v23.confirm_plan: the input is #1137's five keys, `.strict()`, each nullable where it says so", () => {
  const schema = v23Tenancy.confirmTenancyRentPlanInputSchema;
  assert.deepEqual(
    Object.keys(schema.shape).sort(),
    ["client_id", "document_id", "judgement", "payable_account", "rent_account"],
  );
  const full = {
    client_id: CTX.clientId,
    document_id: DOC,
    rent_account: "6100",
    payable_account: "2050",
    judgement: "The lease runs 24 months; MPERS Section 20 admits straight-line.",
  };
  assert.equal(schema.safeParse(full).success, true);
  // null is an ANSWER on this wire, not an omitted key: null takes the draft's own account.
  assert.equal(schema.safeParse({ ...full, rent_account: null, payable_account: null, judgement: null }).success, true);
  // and an omitted key is NOT the same as a null one — the door is sent all five explicitly
  assert.equal(schema.safeParse({ client_id: CTX.clientId, document_id: DOC }).success, false);
  assert.equal(schema.safeParse({ ...full, rent_account: "" }).success, false, "an empty account is not an account");
  assert.equal(schema.safeParse({ ...full, rent_account: "x".repeat(33) }).success, false);
  assert.equal(schema.safeParse({ ...full, judgement: "x".repeat(4001) }).success, false);
  assert.equal(schema.safeParse({ ...full, op_key: "mine" }).success, false, "the op key is never the model's");
  assert.equal(v23Tenancy.CONFIRM_TENANCY_RENT_PLAN_TOOL, "confirm_tenancy_rent_plan");
});

test("v23.confirm_plan: a client DISAGREEMENT is refused, never silently resolved", async () => {
  const input = {
    client_id: OTHER_CLIENT, document_id: DOC,
    rent_account: null, payable_account: null, judgement: null,
  };
  const mismatch = await v23Tenancy.runConfirmTenancyRentPlan(CTX, input);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.code, "CLR03");
  assert.equal(mismatch.reason, "rent_plan_client_mismatch");
  // #1137's own line: a tool that quietly preferred one of two client ids would be deciding whose
  // books an act lands in.
  const unpinned = await v23Tenancy.runConfirmTenancyRentPlan(
    { ...CTX, clientId: null }, { ...input, client_id: CTX.clientId });
  assert.equal(unpinned.ok, false);
  assert.equal(unpinned.reason, "rent_plan_needs_client_pin");
});

test("v23.confirm_plan: the op key is STABLE on the task and the input, and never on the author", () => {
  // waveS-lane08-fix.md §7.3. A retried tool call in ONE conversation is ONE intent, so the key is
  // `stableOpKey(ctx.taskId, TOOL, input)` — not #949's "a FRESH p_op_key per act", which was
  // written for the WEB surface where two clicks are two intents.
  const input = {
    client_id: CTX.clientId, document_id: DOC,
    rent_account: "6100", payable_account: "2050", judgement: null,
  };
  const a = v23Tenancy.confirmTenancyRentPlanOpKey(CTX, input);
  const b = v23Tenancy.confirmTenancyRentPlanOpKey(CTX, { ...input });
  assert.equal(a, b, "the same intent in the same conversation is ONE key");
  // a DIFFERENT author in the same conversation converges on the same key: the core's reservation
  // hashes the caller's five arguments and NOT the named author, which is what makes a chat
  // confirmation and a human replay converge on one receipt.
  assert.equal(v23Tenancy.confirmTenancyRentPlanOpKey({ ...CTX, createdBy: OTHER_CLIENT }, input), a);
  // a different ARGUMENT is a different intent
  assert.notEqual(v23Tenancy.confirmTenancyRentPlanOpKey(CTX, { ...input, payable_account: "2060" }), a);
  // and a different conversation is a different key: `ctx.taskId` cannot outlive the initiating
  // person, which is exactly why §7.3 calls this choice safe.
  assert.notEqual(v23Tenancy.confirmTenancyRentPlanOpKey({ ...CTX, taskId: DOC }, input), a);
  assert.match(a, /^eta-confirm_tenancy_rent_plan-/);
});

test("v23.confirm_plan: the door is the OBO twin, with all seven arguments named and judgement sent EXPLICITLY", () => {
  assert.match(SRC, /clara\.confirm_tenancy_rent_plan_for\(/);
  for (const arg of [
    "p_client          => \\$1::uuid",
    "p_author          => \\$2::uuid",
    "p_document        => \\$3::uuid",
    "p_rent_account    => \\$4::text",
    "p_payable_account => \\$5::text",
    "p_judgement       => \\$6::text",
    "p_op_key          => \\$7::text",
  ]) {
    assert.match(SRC, new RegExp(arg), arg);
  }
  // the HUMAN door stays `clara_authenticated`-only and is never called from here
  assert.ok(!/clara\.confirm_tenancy_rent_plan\(/.test(SRC),
    "the human door is not the tool's door — the OBO twin is");
  // the author is the person the turn acts FOR, never the agent and never the task
  assert.match(SRC, /ctx\.createdBy/);
});

test("v23.confirm_plan: the refusal ladder carries §7.1's client_inactive as its LAST wall", () => {
  const map = v23Tenancy.CONFIRM_RENT_PLAN_REFUSALS;
  // Every token #1137's table names, plus the one waveS-lane08-fix.md §7.1 ADDED.
  assert.deepEqual(Object.keys(map).sort(), [
    "account_not_in_chart",
    "client_inactive",
    "confirm_wrong_kind",
    "payable_account_in_use",
    "plan_credits_bank_account",
    "rent_plan_already_confirmed",
    "terms_incomplete",
  ].sort());
  // §7.1's sentence is `clara.create_accounting_plan`'s own, carried word for word.
  assert.equal(
    map.client_inactive,
    "This client is not active, so no new accounting plan can be created for it. Reactivate the client first.",
  );
  // THE POSITION IN THE LADDER is named so a tool author does not reorder it: it fires AFTER
  // every other wall, because it lives in the plan step.
  assert.equal(
    v23Tenancy.CONFIRM_RENT_PLAN_LADDER[v23Tenancy.CONFIRM_RENT_PLAN_LADDER.length - 1],
    "client_inactive",
  );
  assert.equal(v23Tenancy.CONFIRM_RENT_PLAN_LADDER[0], "invalid_op_key");
  // `professional_judgement_required` is NOT in the sentence map, and that is the ruling: the
  // refusal's MESSAGE is the branch's own question and must be given verbatim.
  assert.equal(map.professional_judgement_required, undefined);
  assert.ok(v23Tenancy.CONFIRM_RENT_PLAN_LADDER.includes("professional_judgement_required"));
});

test("v23.confirm_plan: the answer is a TYPED TOOL RESULT, not a new part kind (§7.2)", () => {
  // The receipt the door returns, per #1137: `occurrences` is a COUNT (24 for a two-year monthly
  // tenancy), not a list, and a replayed op key returns the byte-identical receipt.
  const receipt = {
    document_id: DOC,
    client_id: CTX.clientId,
    confirmation_id: "c1",
    plan_id: "p1",
    revision_id: "r1",
    status: "confirmed",
    occurrences: 24,
    next_occurrences: ["2026-10-01", "2026-11-01"],
    overlap_warning: null,
    treatment: { standard: "MPERS Section 20" },
    professional_judgement: "The lease runs 24 months.",
    replayed: true,
  };
  const part = v23Tenancy.rentPlanPart(receipt);
  assert.equal(part.occurrences, 24);
  assert.equal(typeof part.occurrences, "number", "a COUNT, never a list");
  assert.equal(part.plan_id, "p1");
  assert.equal(part.status, "confirmed");
  assert.deepEqual(part.next_occurrences, ["2026-10-01", "2026-11-01"]);
  // NO `type` discriminant: this is a typed tool RESULT in runStartPrepaymentScheduleWork's shape,
  // and the turn's existing mapping decides what reaches the wire. A `type` here would make the
  // chat lane the seventh construction site of `work_result`.
  assert.equal(part.type, undefined);
  assert.ok(!/work_result/.test(SRC), "§7.2: no new part kind and no parity entry");
});

// ---------------------------------------------------------------------------
// 4 · `confirm_tenancy_rent_plan_revision` (#949 item 3, under the same ruling)
// ---------------------------------------------------------------------------

test("v23.confirm_revision: the input is three keys and the judgement is nullable", () => {
  const schema = v23Tenancy.confirmTenancyRentPlanRevisionInputSchema;
  assert.deepEqual(Object.keys(schema.shape).sort(), ["client_id", "document_id", "judgement"]);
  const full = { client_id: CTX.clientId, document_id: DOC, judgement: "Straight-line over the term." };
  assert.equal(schema.safeParse(full).success, true);
  // nullable, and #1137 says why in one line: "a stepped rent ALWAYS makes the branch ask, so in
  // practice this is required" — which is the DOOR's business to enforce, not the schema's.
  assert.equal(schema.safeParse({ ...full, judgement: null }).success, true);
  assert.equal(schema.safeParse({ client_id: CTX.clientId, document_id: DOC }).success, false);
  // the model never names the figures: it reads them off the offer and passes a judgement through
  for (const invented of ["from_cents", "to_cents", "effective_from", "new_cents"]) {
    assert.equal(schema.safeParse({ ...full, [invented]: 1 }).success, false, invented);
  }
  assert.equal(v23Tenancy.CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL, "confirm_tenancy_rent_plan_revision");
});

test("v23.confirm_revision: the OFFER is read first on the read pool, the ACT second on the runtime pool", () => {
  assert.match(SRC, /clara\.wake_get_tenancy_escalation_revision\(\$1::uuid\)/);
  assert.match(SRC, /clara\.confirm_tenancy_rent_plan_revision_for\(/);
  for (const arg of [
    "p_client    => \\$1::uuid",
    "p_author    => \\$2::uuid",
    "p_document  => \\$3::uuid",
    "p_judgement => \\$4::text",
    "p_op_key    => \\$5::text",
  ]) {
    assert.match(SRC, new RegExp(arg), arg);
  }
  // the offer is a READ and the act is a WRITE, and they run on different pools by construction
  const body = SRC.slice(SRC.indexOf("export async function runConfirmTenancyRentPlanRevision"));
  assert.ok(body.indexOf("readScoped") < body.indexOf("pools().withRuntime"),
    "the offer is read BEFORE the act is taken — #1137's own order");
});

test("v23.confirm_revision: `nothing_to_revise` is ONE answer for two different absences", () => {
  const map = v23Tenancy.CONFIRM_RENT_REVISION_REFUSALS;
  // #1137's table maps both `no_escalation_recorded` and `no_confirmed_plan` to
  // `nothing_to_revise` — but each keeps its OWN sentence, because what a person does next
  // differs: recording an escalation is their act, and confirming a plan is the other tool's.
  assert.notEqual(map.no_escalation_recorded, map.no_confirmed_plan);
  assert.match(map.no_escalation_recorded, /escalation/);
  assert.match(map.no_confirmed_plan, /rent plan/);
  assert.match(map.not_due_yet, /sixty|60/);
  assert.match(map.already_revised, /already charges/);
  // as for tool 3: the judgement refusal's message is the branch's own question, verbatim
  assert.equal(map.professional_judgement_required, undefined);
});

test("v23.confirm_revision: the receipt carries BOTH figures, and the op key is its own", () => {
  const receipt = {
    document_id: DOC, client_id: CTX.clientId, confirmation_id: "c2", plan_id: "p1",
    revision: 2, revision_id: "r2", from_cents: 250000, to_cents: 275000,
    effective_from: "2027-01-01", treatment: { standard: "MFRS 16" },
    professional_judgement: "The increases follow expected general inflation.",
  };
  const part = v23Tenancy.rentPlanRevisionPart(receipt);
  assert.equal(part.from_cents, 250000);
  assert.equal(part.to_cents, 275000);
  assert.equal(part.effective_from, "2027-01-01");
  assert.equal(part.revision, 2);
  assert.equal(part.type, undefined, "§7.2 again: a typed tool result, not a part kind");
  // the two confirmations do NOT share an op-key namespace: a revision is not a confirmation
  const input = { client_id: CTX.clientId, document_id: DOC, judgement: null };
  assert.match(v23Tenancy.confirmTenancyRentPlanRevisionOpKey(CTX, input),
    /^eta-confirm_tenancy_rent_plan_revision-/);
});
