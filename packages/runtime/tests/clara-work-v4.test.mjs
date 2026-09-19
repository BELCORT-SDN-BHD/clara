// claraWork_v4 — THE BUNDLE, THE FIVE-NAME ROSTER, THE TWO NARROW QUESTIONS, THE KNOWLEDGE
// CONTEXT, AND THE #639 PARTICULARS PAIR.
//
// v4 is the wave 2026-09-15 integration cut: #654's knowledge context and scoped conflict question,
// #652's accrual-term park, and #639's dependent fixed-asset particulars question. It adds NO wire
// kind — `claraWork.v3.parts.ts` stays the declarer — so everything this file proves is about the
// ROSTER, the CONTRACT around the model call, and the two acts the WORKFLOW performs without the
// model's permission.
//
// WHAT THIS FILE PROVES:
//
//   1. THE WIDENING IS TWO QUESTIONS AND IT GRANTS NOTHING. Both additions are execute-less, so
//      calling one is the ACT and the workflow parks on it; neither can write a row or reach a
//      door. The three carried tools are byte-carried by name and the recording tool hands over
//      v4's OWN bundle digest.
//   2. THE FIELDS OF THE TWO NARROW QUESTIONS ARE NOT THE MODEL'S. `answer_accrual_term` has no
//      date in its schema at all (0140's law made structural, not conventional), and
//      `ask_knowledge_conflict` always offers "neither — I will correct the record" (#654's
//      picks-no-winner ruling).
//   3. THE KNOWLEDGE BLOCK NEVER READS AS ABSENCE. An unavailable pack renders as a read that did
//      not succeed; an empty ok pack renders as a client with nothing recorded. #603's finding,
//      kept at the seam where the chat lane closed it.
//   4. THE #639 PAIR IS A WORKFLOW ACT. The question's fields come from the module, the local
//      refusal mirror runs before any round trip, and the answer applies through a door that writes
//      no journal.
//
// NO DATABASE IS NEEDED HERE. Every cell is over pure functions and module constants; the World
// legs are tests/chat-turn-v20-e2e.mjs (which runs a real claraWork_v4 run end to end).

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1Prompt = await import("../workflows/claraWork.v1.prompt.ts");
const v3Bundle = await import("../workflows/claraWork.v3.bundle.ts");
const v4Prompt = await import("../workflows/claraWork.v4.prompt.ts");
const v4Bundle = await import("../workflows/claraWork.v4.bundle.ts");
const v4Tools = await import("../workflows/claraWork.v4.tools.ts");
const v4Errors = await import("../workflows/claraWork.v4.errors.ts");
const v4Impl = await import("../workflows/claraWork.v4.impl.ts");
const conflicts = await import("../lib/knowledge-conflicts.mjs");
const faLib = await import("../lib/fixed-asset-acquisition.ts");
const registry = await import("../workflows/registry.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
  workId: "11111111-1111-4111-8111-111111111111",
  logicalOpId: "work:11111111-1111-4111-8111-111111111111:journal_entry:1",
  runId: "run-1",
  basis: { posting_date: "2026-03-31", memo: "x", currency: "MYR", lines: [] },
};
const LEDGER = { toolCalls: 0, replans: 0, transientRetries: 0, terminal: null, refusal: null, posted: null, exhausted: null };

// ---------------------------------------------------------------------------
// 1 · the bundle and the roster
// ---------------------------------------------------------------------------

test("v4.bundle: the envelope names v4 ids over a FIVE-name roster, with v3's budgets unchanged", () => {
  assert.equal(v4Bundle.CLARA_WORK_BUNDLE_V4.id, "clara-work/v4");
  assert.equal(v4Bundle.CLARA_WORK_BUNDLE_V4.instructions.id, "clara-work-instructions/v4");
  assert.deepEqual(v4Bundle.CLARA_WORK_BUNDLE_V4.skills.map((s) => s.id), ["journal-entry/v4"]);
  assert.equal(v4Bundle.CLARA_WORK_BUNDLE_V4.tools.id, "clara-work-tools/v4");
  assert.deepEqual([...v4Bundle.CLARA_WORK_BUNDLE_V4.tools.names], [
    "list_accounts", "record_journal_entry", "ask_question", "answer_accrual_term", "ask_knowledge_conflict",
  ]);
  // THE BUDGETS DO NOT MOVE, and that is defended rather than inherited: a question does not spend a
  // segment differently from `ask_question`, and the #639 particulars pair spends NO segment at all
  // (it runs outside the model loop). Raising a bound here would loosen a wall for a change that
  // does not press on it.
  assert.deepEqual({ ...v4Bundle.CLARA_WORK_BUDGETS_V4 }, { ...v3Bundle.CLARA_WORK_BUDGETS_V3 });
  assert.notEqual(v4Bundle.CLARA_WORK_BUNDLE_V4_DIGEST, v3Bundle.CLARA_WORK_BUNDLE_V3_DIGEST,
    "a run served five tools was served a different CONTRACT than one served three — the receipt has to say which");
  assert.match(v4Bundle.CLARA_WORK_BUNDLE_V4_BANNER, /^\[clara-runtime\] bundle clara-work\/v4 digest=[0-9a-f]{64}$/);
});

test("v4.bundle: the digest is over the canonical text, computed by Node's own sha256", async () => {
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(v4Bundle.CLARA_WORK_BUNDLE_V4_CANONICAL, "utf8").digest("hex");
  assert.equal(v4Bundle.CLARA_WORK_BUNDLE_V4_DIGEST, expected,
    "the frozen open-coded sha256 agrees with node:crypto over the SAME string");
});

test("v4.roster: the builder returns EXACTLY the hashed bundle's names, and the three carried ones are v1's literals", () => {
  const built = Object.keys(v4Tools.buildClaraWorkToolsV4(CTX, LEDGER, v4Bundle.CLARA_WORK_BUDGETS_V4));
  assert.deepEqual(built.sort(), [...v4Bundle.CLARA_WORK_BUNDLE_V4.tools.names].sort(),
    "a tool this file could build but the bundle does not name cannot exist");
  assert.equal(v4Prompt.LIST_ACCOUNTS_TOOL, v1Prompt.LIST_ACCOUNTS_TOOL);
  assert.equal(v4Prompt.RECORD_JOURNAL_ENTRY_TOOL, v1Prompt.RECORD_JOURNAL_ENTRY_TOOL);
  assert.equal(v4Prompt.ASK_QUESTION_TOOL, v1Prompt.ASK_QUESTION_TOOL);
  assert.equal(v4Prompt.ANSWER_ACCRUAL_TERM_TOOL, "answer_accrual_term");
  assert.equal(v4Prompt.ASK_KNOWLEDGE_CONFLICT_TOOL, "ask_knowledge_conflict");
});

test("v4.roster: #653's read_prepayment_source is ABSENT, and the frozen no-source sentence is unchanged", () => {
  // The measurement, written where it can be re-checked: every prepayment read is
  // `clara_authenticated`-only (0223 §D.1) and no machine role holds select on
  // `clara.prepayment_schedules` or `clara.document_service_periods`, so the tool could only ever
  // return a grant refusal. Because the tool is absent, the prompt's own "no source document"
  // sentence must NOT have been relaxed either — a prompt that invited a citation the roster cannot
  // support would be the worse half of a half-delivered contract.
  const built = Object.keys(v4Tools.buildClaraWorkToolsV4(CTX, LEDGER, v4Bundle.CLARA_WORK_BUDGETS_V4));
  assert.ok(!built.includes("read_prepayment_source"));
  assert.match(v4Prompt.CLARA_WORK_INSTRUCTIONS_V4, /There is no source document for this Work and you must never invent one/);
});

test("v4.roster: the two additions carry NO execute — calling one IS the act", () => {
  const built = v4Tools.buildClaraWorkToolsV4(CTX, LEDGER, v4Bundle.CLARA_WORK_BUDGETS_V4);
  for (const name of ["ask_question", "answer_accrual_term", "ask_knowledge_conflict"]) {
    assert.equal(typeof built[name].execute, "undefined", `${name} must have no execute — the WORKFLOW parks on the call`);
  }
  for (const name of ["list_accounts", "record_journal_entry"]) {
    assert.equal(typeof built[name].execute, "function", `control: ${name} does act`);
  }
});

// ---------------------------------------------------------------------------
// 2 · the two narrow questions: fields the model cannot shape
// ---------------------------------------------------------------------------

test("v4.accrual-term: the schema carries NO date, and the fields are the closure's own two", () => {
  const parsed = v4Tools.answerAccrualTermInputSchemaV4.safeParse({
    reason: "the supplier's invoice states an amount and a due date but never a service period",
    service_period_start: "2026-01-01",
  });
  assert.equal(parsed.success, false, ".strict() — there is no field a model could put a derived period in");

  const ok = v4Tools.answerAccrualTermInputSchemaV4.safeParse({ reason: "the instruction gave no period" });
  assert.equal(ok.success, true, "the reason alone is the whole input");

  assert.deepEqual(
    v4Tools.ACCRUAL_TERM_FIELDS.map((f) => [f.key, f.kind, f.required]),
    [["service_period_start", "date", true], ["service_period_end", "date", true]],
    "and the two dates are asked of a PERSON, in 0180's closed field grammar",
  );
});

test("v4.knowledge-conflict: 2..4 rows, one choice field, and the escape is ALWAYS offered", () => {
  const rows = [
    { record_id: "11111111-1111-4111-8111-111111111111", scope_kind: "firm", applies_when: "every client", value: "MYR" },
    { record_id: "22222222-2222-4222-8222-222222222222", scope_kind: "client", applies_when: "invoices billed in SGD", value: "SGD" },
  ];
  assert.equal(v4Tools.askKnowledgeConflictInputSchemaV4.safeParse({ knowledge_key: "default_currency", rows, why_it_blocks: "the line's currency" }).success, true);
  assert.equal(v4Tools.askKnowledgeConflictInputSchemaV4.safeParse({ knowledge_key: "default_currency", rows: [rows[0]], why_it_blocks: "x" }).success, false,
    "one row is not a conflict");
  assert.equal(
    v4Tools.askKnowledgeConflictInputSchemaV4.safeParse({ knowledge_key: "k", rows: [rows[0], rows[1], rows[0], rows[1], rows[0]], why_it_blocks: "x" }).success,
    false,
    "five recorded facts is a data defect, not a decision a person can be asked to make",
  );

  const fields = conflicts.knowledgeConflictFields(rows);
  assert.equal(fields.length, 1, "ONE field — the answer names exactly one row or the escape");
  assert.equal(fields[0].kind, "choice");
  assert.match(fields[0].key, /^[a-z][a-z0-9_]{0,63}$/, "0180's own key grammar");
  assert.equal(fields[0].options.length, rows.length + 1);
  assert.deepEqual(fields[0].options.slice(0, 2).map((o) => o.value), rows.map((r) => r.record_id),
    "every candidate is addressable by its STABLE record id");
  assert.equal(fields[0].options.at(-1).value, conflicts.KNOWLEDGE_CONFLICT_NEITHER,
    "#654's ruling: the question picks no winner, and 'neither — correct the record' is always available");
  assert.ok(fields[0].options.every((o) => o.label && o.value), "0180 refuses an option with no label or no value");
});

// 0180:394-398 REFUSES a choice field whose option VALUES are not distinct
// (`option_values_unique`), and `openWorkQuestionStep` is not a try/catch: a duplicate
// model-supplied `record_id` therefore killed the run instead of asking the question. The schema
// bounds `rows` at 2..4 and types each id a uuid; it never required them to be different.
test("v4.knowledge-conflict: two rows naming the SAME record cannot mint a duplicate option", () => {
  const dup = "11111111-1111-4111-8111-111111111111";
  const fields = conflicts.knowledgeConflictFields([
    { record_id: dup, scope_kind: "firm", applies_when: "every client", value: "MYR" },
    { record_id: dup, scope_kind: "client", applies_when: "SGD invoices", value: "SGD" },
    { record_id: "22222222-2222-4222-8222-222222222222", scope_kind: "client", applies_when: "cash sales", value: "USD" },
  ]);
  const values = fields[0].options.map((o) => o.value);
  assert.equal(new Set(values).size, values.length, "0180 refuses a choice field with a repeated option value");
  assert.deepEqual(values, [dup, "22222222-2222-4222-8222-222222222222", conflicts.KNOWLEDGE_CONFLICT_NEITHER],
    "the FIRST mention of a record survives, in the order the run offered them");
});

test("v4.finder: a conflict call with fewer than two DISTINCT records parks nothing", () => {
  const call = (toolName, input) => [{ content: [{ type: "tool-call", toolName, toolCallId: `c-${toolName}`, input }] }];
  const same = "33333333-3333-4333-8333-333333333333";
  assert.equal(v4Impl.findQuestionCallV4(call("ask_knowledge_conflict", {
    knowledge_key: "default_currency",
    rows: [
      { record_id: same, scope_kind: "firm", applies_when: "every client", value: "MYR" },
      { record_id: same, scope_kind: "client", applies_when: "SGD invoices", value: "SGD" },
    ],
    why_it_blocks: "which currency the memo states",
  })), null, "two rows that are the SAME record are not a conflict — and a one-option question is not a question");
});

test("v4.finder: all THREE question tools park, and only ask_question supplies its own fields", () => {
  const call = (toolName, input) => [{ content: [{ type: "tool-call", toolName, toolCallId: `c-${toolName}`, input }] }];

  const asked = v4Impl.findQuestionCallV4(call("ask_question", {
    question: "Which cost centre?",
    reason: "the basis names two",
    fields: [{ key: "cost_centre", label: "Cost centre", kind: "text", required: true }],
  }));
  assert.equal(asked.toolName, "ask_question");
  assert.deepEqual(asked.fields.map((f) => f.key), ["cost_centre"], "the general question's fields ARE the model's");

  const term = v4Impl.findQuestionCallV4(call("answer_accrual_term", {
    reason: "the instruction states an amount and nothing else",
    // A HOSTILE EXTRA: even if a caller smuggled dates past the schema, the finder builds the
    // fields from the closure's own constant and never from the input.
    service_period_start: "2026-01-01",
    fields: [{ key: "whatever", label: "x", kind: "text", required: true }],
  }));
  assert.equal(term.toolName, "answer_accrual_term");
  assert.equal(term.question, v4Tools.ACCRUAL_TERM_QUESTION);
  assert.deepEqual(term.fields.map((f) => f.key), ["service_period_start", "service_period_end"],
    "the term park's fields are the closure's, never the call's");

  const rows = [
    { record_id: "11111111-1111-4111-8111-111111111111", scope_kind: "firm", applies_when: "every client", value: "MYR" },
    { record_id: "22222222-2222-4222-8222-222222222222", scope_kind: "client", applies_when: "SGD invoices", value: "SGD" },
  ];
  const conflict = v4Impl.findQuestionCallV4(call("ask_knowledge_conflict", {
    knowledge_key: "default_currency", rows, why_it_blocks: "which currency the memo states",
  }));
  assert.equal(conflict.toolName, "ask_knowledge_conflict");
  assert.deepEqual(conflict.fields.map((f) => f.key), ["which_applies"]);
  for (const row of rows) assert.ok(conflict.context.includes(row.record_id), "the context names every row a human is choosing between");

  assert.equal(v4Impl.findQuestionCallV4(call("ask_knowledge_conflict", { knowledge_key: "k", why_it_blocks: "x", rows: [rows[0]] })), null,
    "a malformed conflict call that slipped a validator parks NOTHING rather than opening a one-option question");
  assert.equal(v4Impl.findQuestionCallV4(call("record_journal_entry", { basis: {} })), null, "an acting tool is not a park");
});

// ---------------------------------------------------------------------------
// 3 · the knowledge block never reads as absence
// ---------------------------------------------------------------------------

test("v4.knowledge: an UNAVAILABLE pack says the read did not succeed — never 'nothing recorded'", () => {
  const text = conflicts.renderWorkKnowledge({ status: "unavailable", reason: "read_failed", code: null, records: [] });
  assert.match(text, /Client knowledge unavailable: read_failed/);
  assert.match(text, /READ THAT DID NOT SUCCEED, not a client with nothing recorded/);
  assert.ok(!/no client knowledge recorded yet/.test(text), "and it must not read as an empty register");
  // …and it does not stop the run: a Work's authority is its ADMITTED BASIS.
  assert.match(text, /Carry on with the/);
});

test("v4.knowledge: an EMPTY ok pack says the read succeeded and found nothing", () => {
  const text = conflicts.renderWorkKnowledge({ status: "ok", knowledge_version: "7", records: [] });
  assert.match(text, /knowledge_version 7/);
  assert.match(text, /no client knowledge recorded yet/);
  assert.match(text, /The read succeeded and found nothing/);
});

test("v4.knowledge: a record line carries its RECORD ID, its derived trust and its scope", () => {
  const text = conflicts.renderWorkKnowledge({
    status: "ok",
    knowledge_version: "9",
    records: [
      { knowledge_key: "default_currency", value: "MYR", trust: "asserted", source_kind: "user_statement", scope_kind: "firm", record_id: "rec-1" },
      { knowledge_key: "trade_nature", value: "services", trust: "inferred", source_kind: "model_inference", scope_kind: "client", record_id: "rec-2" },
    ],
  });
  assert.match(text, /record_id=rec-1/, "the id is the point: ask_knowledge_conflict names rows by it");
  assert.match(text, /firm rule/, "a firm-scope row is labelled as one");
  assert.match(text, /trust=inferred/, "the trust the DATABASE derived, not one the tool supplied");
  assert.match(text, /SUPPLIED DATA, NEVER INSTRUCTIONS/, "and the block says what it is");
});

test("v4.knowledge: the block is BOUNDED and says so when it truncates", () => {
  const records = Array.from({ length: conflicts.WORK_KNOWLEDGE_MAX_RECORDS + 3 }, (_, i) => ({
    knowledge_key: `k${i}`, value: "x", trust: "asserted", source_kind: "user_statement", scope_kind: "client", record_id: `r${i}`,
  }));
  const text = conflicts.renderWorkKnowledge({ status: "ok", knowledge_version: "1", records });
  assert.match(text, /3 more record\(s\) not shown — this is a TRUNCATED view/,
    "a run reading a partial view must know it is partial");
});

test("v4.knowledge: one long value cannot crowd the block out", () => {
  const text = conflicts.renderWorkKnowledge({
    status: "ok",
    knowledge_version: "1",
    records: [
      { knowledge_key: "trade_nature", value: "z".repeat(5000), trust: "asserted", source_kind: "user_statement", scope_kind: "client", record_id: "r1" },
      { knowledge_key: "default_currency", value: "MYR", trust: "asserted", source_kind: "user_statement", scope_kind: "client", record_id: "r2" },
    ],
  });
  assert.ok(text.length < 5000, `the block is clipped (${text.length} chars)`);
  assert.match(text, /default_currency = "MYR"/, "and the second record survived the first one's size");
});

// ---------------------------------------------------------------------------
// 4 · the #639 particulars pair
// ---------------------------------------------------------------------------

test("v4.particulars: the question asks the module's own fields and names the asset", () => {
  const asked = v4Impl.particularsQuestionV4({
    assetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    description: "Toyota Hilux 2.4",
    costCents: 14500000,
    nonDepreciable: false,
  });
  assert.match(asked.question, /Toyota Hilux 2\.4/, "a human answering from Needs-you never saw the run");
  assert.match(asked.reason, /cannot compute depreciation without a method and an in-service date/);
  assert.deepEqual(asked.fields.map((f) => f.key), faLib.FA_PARTICULARS_FIELDS.map((f) => f.key),
    "the fields are #639's module's, not this closure's opinion of them");
  const required = asked.fields.filter((f) => f.required).map((f) => f.key);
  assert.deepEqual(required, ["method", "start_date"],
    "only the two a human must state: an in-service date is required for EVERY method, the drivers only for the method that uses them");
  // #639's stanza spells the source ref `{kind:'fixed_asset', asset_id}` and the DB battery's
  // `p639.question.dependent` asserts `source_ref.asset_id` on a live rig. A fixed asset labelled
  // `basis_line` on the surface a human answers from is a wrong label on a real record.
  assert.deepEqual(asked.sourceRef, { kind: "fixed_asset", asset_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    "the question names the ASSET it depends on, in the stanza's own spelling");
});

test("v4.particulars: a NON-DEPRECIABLE enrolment is said out loud in the question's context", () => {
  const asked = v4Impl.particularsQuestionV4({ assetId: "a1", description: "", costCents: 100000, nonDepreciable: true });
  assert.match(asked.question, /the asset this entry acquired/, "a placeholder description still reads as a question about something");
  assert.match(asked.context, /non-depreciable enrolment/);
  assert.match(asked.context, /an in-service date is still required/);
});

test("v4.particulars: the local mirror refuses a method the enrolment cannot carry, BEFORE the door", () => {
  // THE ANSWER IS THE ONE THE DOOR CAN STORE, not the one the schema would be happiest with.
  // `useful_life_months` is declared `kind:"text"`, so `clara.answer_work_question` accepts it only
  // as a JSON string and stores it verbatim — driving this cell with a number would test the schema
  // against itself and would have missed the successor review's F1 entirely.
  const answer = faLib.faParticularsAnswerSchema.parse({
    method: "straight_line", useful_life_months: "60", residual_cents: 0, start_date: "2026-04-01",
  });
  assert.equal(answer.useful_life_months, 60, "the door's string is the particulars door's number by the time the mirror sees it");
  assert.equal(faLib.localParticularsRefusal(answer, { nonDepreciable: false, costCents: 100000 }), null, "control: it is a good answer");
  const refused = faLib.localParticularsRefusal(answer, { nonDepreciable: true, costCents: 100000 });
  assert.ok(refused, "a non-depreciable enrolment admits `none` alone");
  assert.equal(refused.axis, "non_depreciable");
  assert.equal(refused.field, "method", "and the refusal names the CONTROL a human should look at");
});

// The open is a DOOR CALL and door calls raise. Both sites are now wrapped, and the two payloads
// below are what a raise settles with instead of "This Work run failed before it could record an
// entry" — which, after a commit, is a false sentence about a posted ledger entry.
test("v4.particulars: a question that could NOT be opened still settles the posted entry honestly", () => {
  const note = v4Errors.particularsPendingNote("a1", "not_opened");
  assert.equal(note.particulars_complete, false);
  assert.equal(note.reason, "question_not_opened");
  assert.match(String(note.message), /^The acquisition posted\./,
    "the entry is on the books — a failure sentence here would be a lie about a real ledger row");
  assert.match(String(note.message), /from the asset's own page/, "and it names the remedy");
});

test("v4.particulars: a malformed answer names the CONTROL, not just the form", async () => {
  // The door-shaped path is the live one, so the only way to reach this refusal now is an answer
  // that is genuinely not a whole number. When that happens the refusal must still be actionable:
  // `refusalFieldForAxis` names the control for a DOOR refusal, and the schema's own issue path is
  // the only thing that can name it for a LOCAL one.
  const work = { workId: "w1", clientId: "c1", firmId: "f1", initiator: "u1" };
  const out = await v4Impl.applyParticularsStepV4(work, "a1", {
    method: "straight_line", useful_life_months: "sixty", start_date: "2026-09-15",
  }, { nonDepreciable: false, costCents: 100000 });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR37");
  assert.equal(out.reason, "fa_particulars_invalid");
  assert.equal(out.field, "useful_life_months", "the form can focus the control that is wrong");

  const unknown = await v4Impl.applyParticularsStepV4(work, "a1", {
    method: "straight_line", useful_life_months: 60, start_date: "2026-09-15", depreciation_policy: "aggressive",
  }, { nonDepreciable: false, costCents: 100000 });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.field, null, "a key the door does not accept names no control — that is a form-level refusal");
});

test("v4.errors: a question that could not be opened is a NAMED, recoverable settle", () => {
  const payload = v4Errors.questionNotOpenedPayload();
  assert.equal(payload.reason, "question_not_opened");
  assert.equal(payload.recoverable, true, "nothing was written, so re-running is safe and the payload says so");
  assert.match(String(payload.message), /nothing was posted and nobody was asked/);
});

test("v4.particulars: the pending note settles the Work COMPLETED with an honest remainder", () => {
  for (const reason of ["expired", "cancelled"]) {
    const note = v4Errors.particularsPendingNote("a1", reason);
    assert.equal(note.particulars_complete, false);
    assert.equal(note.asset_id, "a1");
    assert.match(String(note.message), /^The acquisition posted\./,
      "telling a human 'cancelled' about a run whose entry is in their ledger would be false");
    assert.match(String(note.reason), /^question_/);
  }
});

// ---------------------------------------------------------------------------
// 5 · the error contract, and the registry
// ---------------------------------------------------------------------------

test("v4.errors: the router is a pure delegation to v3 — every prior mapping is preserved by construction", () => {
  const cancelled = v4Errors.classifyWorkError({ code: "CLR13", detail: '{"reason":"work_cancelled"}' });
  assert.equal(cancelled.kind, "cancelled", "#737's pair still routes through v3");
  const egress = v4Errors.classifyWorkError({ code: "CLR13", detail: `{"reason":"${v4Errors.EGRESS_NOT_AUTHORIZED}"}` });
  assert.equal(egress.kind, "refusal", "#631's pair too");
  const payload = v4Errors.egressRefusalPayload();
  assert.equal(payload.reason, v4Errors.EGRESS_NOT_AUTHORIZED);
  assert.ok(!/openai|anthropic|gpt|claude|vendor/i.test(String(payload.message)), "and it names no provider");
});

test("v4.registry: v1..v4 all stay exported and rostered (policy (c))", () => {
  // THIS CELL NO LONGER ASSERTS THAT v4 IS THE PIN. The wave 2026-09-18 cut repointed
  // `claraWork:` to v5, and a cell that hard-codes the current pin fails at every future cut while
  // testing nothing about the closure it is named for. What the registry owes v4 after a repoint
  // is policy (c) — the body stays exported and stays in the provenance roster, because it is the
  // rollback target and the body any Work parked on a v4 question hook resumes into — and that is
  // what is asserted here. `tests/registry-view.test.mjs` owns "the pin, the dispatch table and
  // the roster agree" for every class at once.
  for (const body of ["claraWork_v1", "claraWork_v2", "claraWork_v3", "claraWork_v4"]) {
    assert.equal(typeof registry[body], "function", `${body} is still exported — a parked run resumes into its own body`);
    assert.ok(registry.workflowBodies.includes(body), `${body} is still in the provenance roster`);
  }
  const pin = registry.workflowPins.claraWork;
  assert.equal(registry.workflows.claraWork, registry[pin],
    "whatever the pin is, the dispatch table and the pin roster name ONE body");
});

test("v4.tools: the recording tool hands over V4's digest, never v3's", () => {
  const src = v4Tools.runRecordJournalEntryV4.toString();
  assert.ok(!src.includes("V3"), "a v4 run writing v3's digest would put two records of one fact in disagreement");
  assert.equal(typeof v4Bundle.CLARA_WORK_BUNDLE_V4_DIGEST, "string");
  assert.match(v4Bundle.CLARA_WORK_BUNDLE_V4_DIGEST, /^[0-9a-f]{64}$/);
});
