// claraWork_v6 — the Work-lane half of the cut: roster entries A8 (#915 items 2 and 3), A9 (#941
// item 2), A10 (#933, as CORRECTED by `wave4-lane05-fix.md`) and D1 (#939).
//
// v6 was minted by #1030 with v5's roster unchanged. This ticket is the one that widens it, and
// every widening below is a READ or a QUESTION — nothing here writes, and nothing here decides.
//
// WHAT THIS FILE PROVES:
//   1. THE ROSTER GREW BY THREE and by exactly three: `read_prepayment_source`,
//      `read_revenue_recognition_source` and `answer_prepayment_term`. The names, the schemas and
//      the declared dependencies all move together, so the bundle digest cannot describe a roster
//      it does not serve.
//   2. Both reads take ONE uuid: the Work's own client and firm come from the run's context and
//      are never model-supplied. Neither has a bytes key and neither ever will.
//   3. `answer_prepayment_term` has NO date field and never will (D1, #939): the model may ask,
//      and the fields are the closure's own constants, so there is no path from a tool input to a
//      service period.
//   4. A10: the proposal is a WORKFLOW-BODY act, so v6's tool roster gains nothing for it, and
//      `particularsQuestionV6` changes ONLY the source ref. A null proposal opens exactly v5's
//      question.
//   5. The `acquired_date::text` cast is present, and it is load-bearing.
//   6. The prompt stanza replaces claraWork.v1's "there is no source document" clause.
//
// NO DATABASE IS NEEDED HERE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v5Prompt = await import("../workflows/claraWork.v5.prompt.ts");
const v6Prompt = await import("../workflows/claraWork.v6.prompt.ts");
const v6Tools = await import("../workflows/claraWork.v6.tools.ts");
const v6Impl = await import("../workflows/claraWork.v6.impl.ts");
const v4Impl = await import("../workflows/claraWork.v4.impl.ts");
const proposal = await import("../lib/fa-particulars-proposal.ts");

const ASSET = "aaaaaaaa-2222-4222-8222-222222222222";
const ENTRY = "88888888-8888-4888-8888-888888888888";

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 · the roster, and the three declarations that must move together
// ---------------------------------------------------------------------------

test("v6.roster: v5's seven plus exactly three, and the three declarations agree", () => {
  const before = [...v5Prompt.CLARA_WORK_TOOL_NAMES_V5];
  const after = [...v6Prompt.CLARA_WORK_TOOL_NAMES_V6];
  assert.equal(before.length, 7, "v5's measured roster");
  assert.deepEqual(after.filter((n) => !before.includes(n)).sort(), [
    "answer_prepayment_term",
    "read_prepayment_source",
    "read_revenue_recognition_source",
  ]);
  assert.deepEqual(before.filter((n) => !after.includes(n)), [], "nothing v5 could do stops being possible");
  // THE BUNDLE HASHES `{id, names, schemas, dependencies}`. A name with no schema, or a schema with
  // no declared dependency, would let a roster change ship under a digest that describes the old
  // one — which is the one thing the digest exists to prevent.
  assert.deepEqual(Object.keys(v6Prompt.CLARA_WORK_TOOL_SCHEMAS_V6).sort(), after.slice().sort());
  assert.deepEqual(Object.keys(v6Prompt.CLARA_WORK_TOOL_DEPENDENCIES_V6).sort(), after.slice().sort());
});

test("v6.roster: the built tool map IS the declared roster, name for name", () => {
  const ctx = { firmId: "f", clientId: "c", createdBy: "u", taskId: "t", workId: "w", logicalOpId: "l", runId: "r", basis: {} };
  const ledger = { toolCalls: 0, replans: 0, transientRetries: 0, posted: null, terminal: null, exhausted: null };
  const built = Object.keys(v6Tools.buildClaraWorkToolsV6(ctx, ledger, { toolCalls: 8, modelCalls: 4, replans: 2, transientRetries: 3 }));
  assert.deepEqual(built.slice().sort(), [...v6Prompt.CLARA_WORK_TOOL_NAMES_V6].sort());
});

test("v6.roster: each new tool declares the door it actually reaches", () => {
  const deps = v6Prompt.CLARA_WORK_TOOL_DEPENDENCIES_V6;
  assert.deepEqual([...deps.read_prepayment_source], ["clara.read_prepayment_source_for"]);
  assert.deepEqual([...deps.read_revenue_recognition_source], ["clara.read_revenue_recognition_source_for"]);
  // The question tool has no `execute`; it names the door its CALL causes the workflow to reach,
  // exactly as v4's three question tools do.
  assert.deepEqual([...deps.answer_prepayment_term], ["clara.open_work_question"]);
});

// ---------------------------------------------------------------------------
// 2 · the two reads
// ---------------------------------------------------------------------------

test("v6.reads: each takes ONE uuid, `.strict()`, and no firm or client from the model", () => {
  for (const schema of [v6Tools.readPrepaymentSourceInputSchema, v6Tools.readRevenueRecognitionSourceInputSchema]) {
    assert.deepEqual(Object.keys(schema.shape), ["source_entry_id"]);
    assert.equal(schema.safeParse({ source_entry_id: ENTRY }).success, true);
    for (const invented of ["firm_id", "client_id", "bytes", "document_id"]) {
      assert.equal(schema.safeParse({ source_entry_id: ENTRY, [invented]: ENTRY }).success, false, invented);
    }
  }
});

test("v6.reads: the doors are called with (firm, client, entry) in THAT order, from the run's context", () => {
  const src = codeOf(new URL("../workflows/claraWork.v6.tools.ts", import.meta.url));
  // ONE BODY SERVES BOTH DOORS, so the door name is a constant rather than a literal in the
  // statement — the same shape v5's inspection pair uses. What is pinned is therefore the two
  // constants, the arity and the BINDING ORDER, which is the thing a positional mis-bind moves.
  assert.equal(v6Tools.READ_PREPAYMENT_SOURCE_DOOR, "clara.read_prepayment_source_for");
  assert.equal(v6Tools.READ_REVENUE_RECOGNITION_SOURCE_DOOR, "clara.read_revenue_recognition_source_for");
  assert.match(src, /\$\{door\}\(\$1::uuid, \$2::uuid, \$3::uuid\) as answer/);
  assert.match(src, /\[ctx\.firmId, ctx\.clientId, input\.source_entry_id\]/);
  // NO BYTES KEY, EVER — #915 and #941 both say so, and the byte door stays 0190's.
  assert.ok(!/get_document_bytes|document_bytes/.test(src));
});

test("v6.reads: a not-found is the SAME answer for another firm's entry — no existence oracle", () => {
  const missing = v6Tools.prepaymentSourceRefusal("CLR11", "prepayment_source_not_found", "x");
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "prepayment_source_not_found");
  assert.match(missing.message, /cannot see that/i);
  assert.ok(!/firm|another/i.test(missing.message), "the sentence describes THIS Work's reach, never another firm");
  // CLR10 is an internal wiring error and is never shown as a thing a person can act on.
  const scope = v6Tools.prepaymentSourceRefusal("CLR10", "prepayment_read_scope_required", "x");
  assert.equal(scope.reason, "prepayment_read_scope_required");
  // and the revenue lane maps its own two the same way
  assert.equal(
    v6Tools.revenueRecognitionSourceRefusal("CLR11", "revenue_recognition_source_not_found", "x").reason,
    "revenue_recognition_source_not_found",
  );
});

// ---------------------------------------------------------------------------
// 3 · the term question — D1's prohibition, in the shape of a schema
// ---------------------------------------------------------------------------

test("v6.term: the tool has NO date field, and the fields are the closure's own", () => {
  const shape = Object.keys(v6Tools.answerPrepaymentTermInputSchemaV6.shape).sort();
  assert.deepEqual(shape, ["context", "reason", "source_ref"]);
  for (const invented of ["period_start", "period_end", "service_period_start", "dates"]) {
    assert.equal(
      v6Tools.answerPrepaymentTermInputSchemaV6.safeParse({ reason: "the document states none", [invented]: "2026-01-01" }).success,
      false,
      invented,
    );
  }
  // THE FIELDS ARE #915'S THREE, AND THE MODEL CANNOT REACH THEM. There is no path from a tool
  // input to this list, which is where "the model never supplies a term" actually lives.
  assert.deepEqual(v6Tools.PREPAYMENT_TERM_FIELDS.map((f) => f.key),
    ["period_start", "period_end", "basis"]);
  assert.deepEqual(v6Tools.PREPAYMENT_TERM_FIELDS.map((f) => f.kind), ["date", "date", "text"]);
  assert.deepEqual(v6Tools.PREPAYMENT_TERM_FIELDS.map((f) => f.required), [true, true, true]);
  assert.equal(v6Tools.PREPAYMENT_TERM_FIELDS[2].max, 4000);
});

test("v6.term: the finder supplies the fields and the question, never the model", () => {
  const asked = v6Impl.findQuestionCallV6([
    { content: [{ type: "tool-call", toolCallId: "c1", toolName: "answer_prepayment_term", input: { reason: "the document states no service period" } }] },
  ]);
  assert.equal(asked.toolName, "answer_prepayment_term");
  assert.equal(asked.question, v6Tools.PREPAYMENT_TERM_QUESTION);
  assert.deepEqual(asked.fields.map((f) => f.key), ["period_start", "period_end", "basis"]);
  // and a call with no reason parks nothing: a question nobody can act on is worse than none
  assert.equal(
    v6Impl.findQuestionCallV6([
      { content: [{ type: "tool-call", toolCallId: "c1", toolName: "answer_prepayment_term", input: { reason: "  " } }] },
    ]),
    null,
  );
});

test("v6.term: v4's three arms still find what they always found", () => {
  const steps = [
    { content: [{ type: "tool-call", toolCallId: "c2", toolName: "answer_accrual_term", input: { reason: "no period stated" } }] },
  ];
  assert.deepEqual(v6Impl.findQuestionCallV6(steps), v4Impl.findQuestionCallV4(steps));
});

// ---------------------------------------------------------------------------
// 4 · A10 — the proposal, and the ONE thing it changes
// ---------------------------------------------------------------------------

const PENDING = { assetId: ASSET, description: "Toyota Hilux", costCents: 12000000, nonDepreciable: false };

test("v6.proposal: the tool roster gains NOTHING for it — it is a workflow-body act", () => {
  // #933 §2: "The proposal is not a model act." v6's roster grew for the reads and the term
  // question; no tool named for the proposal exists, and none should.
  for (const name of v6Prompt.CLARA_WORK_TOOL_NAMES_V6) {
    assert.ok(!/proposal/i.test(name), name);
  }
});

test("v6.proposal: particularsQuestionV6 changes ONLY the source ref", () => {
  const derived = proposal.deriveFaParticularsProposal({
    asset: {
      assetId: ASSET, description: "Toyota Hilux", costCents: 12000000, nonDepreciable: false,
      particularsComplete: false, assetAccount: "1500", acquiredDate: "2026-09-15",
    },
    siblings: [
      { assetAccount: "1500", particularsComplete: true, method: "straight_line", usefulLifeMonths: 60, rateBps: null },
    ],
  });
  assert.notEqual(derived, null);
  const before = v4Impl.particularsQuestionV4(PENDING);
  const after = v6Impl.particularsQuestionV6(PENDING, derived);
  for (const key of ["question", "reason", "context"]) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.deepEqual(after.fields, before.fields);
  assert.deepEqual(after.sourceRef, proposal.proposalSourceRef(ASSET, derived));
  assert.equal(after.sourceRef.proposal.v, 1);
});

test("v6.proposal: a NULL proposal opens exactly v5's question, key for key", () => {
  // #933 §5: a failed read, or a failed safeParse, yields `proposal = null` and the question opens
  // exactly as v5's does. Never a block the particulars door would later refuse.
  assert.deepEqual(v6Impl.particularsQuestionV6(PENDING, null), v4Impl.particularsQuestionV4(PENDING));
});

test("v6.proposal: a proposal that fails its own schema is treated as ABSENT, not shipped", () => {
  const bad = { v: 1, method: "straight_line", useful_life_months: 60, rate_bps: null, residual_cents: 0, start_date: "15/09/2026", description: "x", basis: [], reason: "" };
  const asked = v6Impl.particularsQuestionV6(PENDING, bad);
  assert.deepEqual(asked, v4Impl.particularsQuestionV4(PENDING),
    "never put a block the particulars door would refuse onto a durable question a person reads hours later");
});

test("v6.proposal: the read casts acquired_date, and does NOT select residual_cents", () => {
  const src = codeOf(new URL("../workflows/claraWork.v6.impl.ts", import.meta.url));
  const step = src.slice(src.indexOf("export async function loadFaProposalInputsStepV6"));
  // THE CAST IS LOAD-BEARING. Without it node-postgres returns a JS Date at local midnight whose
  // UTC spelling under Asia/Kuala_Lumpur is the PREVIOUS calendar day, and every depreciation
  // charge from then on is computed from a date one day early.
  assert.match(step, /fa\.acquired_date::text as acquired_date/);
  // and query (b) does NOT select residual_cents: the proposal's residual is the firm's nil
  // default by the owner's #932 decision, so carrying it would only invite a half-adoption.
  assert.ok(!/residual_cents/.test(step));
  // the credential is v4's own OBO read, client-pinned
  assert.match(step, /readScoped/);
});

// ---------------------------------------------------------------------------
// 5 · the prompt
// ---------------------------------------------------------------------------

test("v6.prompt: the source-document clause is replaced, and #1030's stanza is still there", () => {
  const instructions = v6Prompt.CLARA_WORK_INSTRUCTIONS_V6;
  assert.ok(instructions.includes(v6Prompt.PREPAYMENT_SOURCE_STANZA));
  assert.match(v6Prompt.PREPAYMENT_SOURCE_STANZA, /only source you may cite/i);
  assert.match(v6Prompt.PREPAYMENT_SOURCE_STANZA, /never read the document itself/i);
  assert.match(v6Prompt.PREPAYMENT_SOURCE_STANZA, /never state a service period/i);
  // #1030's stanza, landed before this ticket, is untouched
  assert.ok(instructions.includes(v6Prompt.SOURCE_CORRECTION_SUCCESSOR_STANZA));
  // and v5's whole text is still underneath, by import rather than by copy
  assert.ok(instructions.startsWith(v5Prompt.CLARA_WORK_INSTRUCTIONS_V5));
});
