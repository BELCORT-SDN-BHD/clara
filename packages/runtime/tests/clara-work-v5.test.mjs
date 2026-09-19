// claraWork_v5 — THE BOUNDED KNOWLEDGE READ, ITS TERMINAL, THE TWO INSPECTION READS, THE DRIFT
// REPLAN, THE TWO RIDERS, AND THE BUNDLE DIGEST THAT FINALLY COVERS A TOOL'S SCHEMA.
//
// v5 is the wave 2026-09-18 integration cut: #658's Work lane, rider #847's writer-side trace
// bounds and rider #882(a)'s one-row CLR40 reclassification. It adds NO wire kind —
// `claraWork.v3.parts.ts` stays the declarer — so everything this file proves is about the ROSTER,
// the CONTRACT around the model call, and the three decisions the WORKFLOW makes without the
// model's permission: whether a failed read ends the run, whether a drift spends a replan, and
// which refusal gets the estate's sentence.
//
// WHAT THIS FILE PROVES:
//
//   1. THE WIDENING IS TWO READS AND IT IS BOUNDED BY THE DATABASE. Both are `.strict()`, both
//      spend `budget.toolCalls`, both refuse before any round trip when the run has no client pin,
//      and NEITHER takes the firm or the client from the model — those come from the Work row.
//   2. THE TERMINAL IS ALL-OR-NOTHING AND THAT IS THE POINT (DECISIONS §6.2.0 R-D). It fires on
//      every one of the five frozen `unavailable` reasons and on NO `ok` answer, however small the
//      core tier is. A cell drives the predicate rather than reading the body.
//   3. THE DRIFT REPLAN IS SPENT ONLY ON A CONFIRMED MOVE. `relevant:true` spends one existing
//      replan; `relevant:null` and an unreadable drift are SURFACED and spend nothing — the
//      null-as-empty defect, refused one layer up.
//   4. THE BUNDLE DIGEST SEES A SCHEMA. ARCHITECTURE:435-445 has been binding since v4 and v4 did
//      not meet it; a cell changes ONE tool's schema and proves the digest moves while the roster
//      does not.
//   5. THE TWO RIDERS. #847's bounds are NO TIGHTER than 0210's door; #882(a) adds exactly ONE
//      row and the other two CLR40 reasons keep today's reading.
//
// NO DATABASE IS NEEDED HERE. Every cell is over pure functions and module constants; the World
// legs are tests/work-knowledge-e2e.mjs and tests/chat-turn-v21-e2e.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const { z } = await import("zod");
const v1Prompt = await import("../workflows/claraWork.v1.prompt.ts");
const v4Prompt = await import("../workflows/claraWork.v4.prompt.ts");
const v4Bundle = await import("../workflows/claraWork.v4.bundle.ts");
const v4Errors = await import("../workflows/claraWork.v4.errors.ts");
const v5Prompt = await import("../workflows/claraWork.v5.prompt.ts");
const v5Bundle = await import("../workflows/claraWork.v5.bundle.ts");
const v5Tools = await import("../workflows/claraWork.v5.tools.ts");
const v5Errors = await import("../workflows/claraWork.v5.errors.ts");
const v5Impl = await import("../workflows/claraWork.v5.impl.ts");
const bounds = await import("../lib/work-trace-bounds.mjs");
const registryV2 = await import("../lib/capability-registry-v2.mjs");
const retrieval = await import("../lib/knowledge-retrieval.mjs");
const registry = await import("../workflows/registry.ts");

/** The file's CODE with its comments removed.
 *
 * A SOURCE PIN THAT READS COMMENTS IS NOT A SOURCE PIN. Every module in this closure states its
 * own contract at length in prose — including, deliberately, the shapes it refuses to have — so a
 * pin that asserted "this text appears" would pass on the header that promises it and a pin that
 * asserted "this text does not appear" would fail on the header that names it. The sibling file
 * chat-turn-v21-tools.test.mjs found this the direct way. Pins below read code alone.
 */
function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

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
const RECORD_ID = "55555555-5555-4555-8555-555555555555";
const ledger = () => ({ toolCalls: 0, replans: 0, transientRetries: 0, terminal: null, refusal: null, posted: null, exhausted: null });
const B = v5Bundle.CLARA_WORK_BUDGETS_V5;

// ---------------------------------------------------------------------------
// 1 · the bundle, the roster, and the digest that finally sees a schema
// ---------------------------------------------------------------------------

test("v5.bundle: the envelope names v5 ids over a SEVEN-name roster, with v4's budgets unchanged", () => {
  assert.equal(v5Bundle.CLARA_WORK_BUNDLE_V5.id, "clara-work/v5");
  assert.equal(v5Bundle.CLARA_WORK_BUNDLE_V5.instructions.id, "clara-work-instructions/v5");
  assert.equal(v5Bundle.CLARA_WORK_BUNDLE_V5.skills[0].id, "journal-entry/v5");
  assert.equal(v5Bundle.CLARA_WORK_BUNDLE_V5.tools.id, "clara-work-tools/v5");
  assert.equal(v5Prompt.CLARA_WORK_TOOL_NAMES_V5.length, 7);
  // BUDGETS DO NOT MOVE — #658's stanza is explicit, and the two additions do not press on them:
  // the preload is a step outside the model loop, the drift replan spends an EXISTING allowance,
  // and the two reads draw `toolCalls` from the same twelve as everything else.
  assert.deepEqual(
    { ...v5Bundle.CLARA_WORK_BUDGETS_V5 },
    { ...v4Bundle.CLARA_WORK_BUDGETS_V4 },
    "a cut that quietly raised a wall would be loosening it for free",
  );
  assert.equal(v5Bundle.CLARA_WORK_BUDGETS_V5.replans, 2);
});

test("v5.roster: v5 is v4's five plus EXACTLY read_knowledge_source and read_knowledge_history", () => {
  const v4 = [...v4Prompt.CLARA_WORK_TOOL_NAMES_V4];
  const v5 = [...v5Prompt.CLARA_WORK_TOOL_NAMES_V5];
  assert.deepEqual(v5.slice(0, 5), v4, "the five carried names keep their order and their spelling");
  assert.deepEqual(v5.slice(5), ["read_knowledge_source", "read_knowledge_history"]);
  // and the BUILDER cannot drift from the hashed roster
  const built = Object.keys(v5Tools.buildClaraWorkToolsV5(CTX, ledger(), B));
  assert.deepEqual(built.sort(), v5.slice().sort(), "a tool the bundle does not name cannot exist");
});

test("v5.roster: the three question tools still carry NO execute, and the two reads DO", () => {
  const built = v5Tools.buildClaraWorkToolsV5(CTX, ledger(), B);
  for (const name of ["ask_question", "answer_accrual_term", "ask_knowledge_conflict"]) {
    assert.equal(typeof built[name].execute, "undefined", `${name}: calling it IS the act; the workflow parks`);
  }
  for (const name of ["read_knowledge_source", "read_knowledge_history"]) {
    assert.equal(typeof built[name].execute, "function", `${name} is a READ and actually reads`);
  }
});

test("v5.roster: #653's read_prepayment_source is STILL absent, and the frozen no-source sentence is unchanged", () => {
  assert.ok(!v5Prompt.CLARA_WORK_TOOL_NAMES_V5.includes("read_prepayment_source"));
  assert.ok(!Object.keys(v5Tools.buildClaraWorkToolsV5(CTX, ledger(), B)).includes("read_prepayment_source"));
  // The sentence may not soften while the read is unreachable: changing it would license citing a
  // source this lane cannot read (0223 §D.1 grants the prepayment reads to clara_authenticated).
  assert.match(v5Prompt.CLARA_WORK_INSTRUCTIONS_V5, /There is no source document for this Work and you must never invent one/);
});

test("v5.bundle: the digest is over the canonical text, computed by Node's own sha256", async () => {
  const { createHash } = await import("node:crypto");
  const expected = createHash("sha256").update(v5Bundle.CLARA_WORK_BUNDLE_V5_CANONICAL).digest("hex");
  assert.equal(v5Bundle.CLARA_WORK_BUNDLE_V5_DIGEST, expected);
  assert.match(v5Bundle.CLARA_WORK_BUNDLE_V5_DIGEST, /^[0-9a-f]{64}$/);
  assert.notEqual(v5Bundle.CLARA_WORK_BUNDLE_V5_DIGEST, v4Bundle.CLARA_WORK_BUNDLE_V4_DIGEST);
});

test("v5.bundle: ARCHITECTURE:435-445 — the digest covers each tool's JSON SCHEMA and its declared dependencies", () => {
  const tools = v5Bundle.CLARA_WORK_BUNDLE_V5.tools;
  // v4's block was `{id, names}` and that is the gap #791 named.
  assert.deepEqual(Object.keys(v4Bundle.CLARA_WORK_BUNDLE_V4.tools).sort(), ["id", "names"]);
  assert.deepEqual(Object.keys(tools).sort(), ["dependencies", "id", "names", "schemas"]);
  for (const name of v5Prompt.CLARA_WORK_TOOL_NAMES_V5) {
    assert.ok(tools.schemas[name], `${name} has a JSON Schema in the hashed bundle`);
    assert.equal(tools.schemas[name].type, "object");
    assert.ok(Array.isArray(tools.dependencies[name]) && tools.dependencies[name].length > 0,
      `${name} declares the door(s) it reaches`);
  }
  // THE HASHED SCHEMA IS THE BUILT SCHEMA, not a second description of it.
  const built = v5Tools.buildClaraWorkToolsV5(CTX, ledger(), B);
  for (const name of v5Prompt.CLARA_WORK_TOOL_NAMES_V5) {
    const fromBuilder = z.toJSONSchema(built[name].inputSchema, { target: "draft-07", io: "input" });
    assert.deepEqual(tools.schemas[name], fromBuilder,
      `${name}: the bundle hashes exactly the schema the model is handed`);
  }
  // and the doors named are the doors reached
  assert.deepEqual(tools.dependencies.read_knowledge_source, ["clara.read_knowledge_record_for"]);
  assert.deepEqual(tools.dependencies.read_knowledge_history, ["clara.read_knowledge_history_for"]);
});

test("v5.bundle: a tool whose SCHEMA changes while its NAME does not MOVES the digest — #791's own defect, closed", () => {
  // Re-derive the canonical text with ONE schema tightened and nothing else touched: same id, same
  // seven names, same budgets, same prose. Under v4's `{id,names}` shape this produces an
  // IDENTICAL digest — which is exactly how `ask_question`'s v1→v2 change escaped (#791).
  const original = JSON.parse(JSON.stringify(v5Bundle.CLARA_WORK_BUNDLE_V5));
  const mutated = JSON.parse(JSON.stringify(v5Bundle.CLARA_WORK_BUNDLE_V5));
  mutated.tools.schemas.read_knowledge_source.properties.reason.maxLength = 400;
  assert.notDeepEqual(mutated.tools.schemas, original.tools.schemas);
  assert.deepEqual(mutated.tools.names, original.tools.names, "the ROSTER is untouched — that is the point");
  assert.equal(mutated.tools.id, original.tools.id, "and so is the tools id — no hand-bump to rely on");
  assert.notEqual(JSON.stringify(mutated), JSON.stringify(original),
    "the hashed text differs, so the digest differs: a name is not a contract");
  // The v4-shaped projection of both is identical, which is the measurement of what was missed.
  const asV4 = (b) => JSON.stringify({ id: b.tools.id, names: b.tools.names });
  assert.equal(asV4(mutated), asV4(original),
    "under v4's tools:{id,names} digest this change is INVISIBLE — that is the gap v5 closes");
});

// ---------------------------------------------------------------------------
// 2 · the two inspection reads
// ---------------------------------------------------------------------------

test("v5.read: the input is `.strict()` — an invented key is refused, never silently dropped", () => {
  const good = { record_id: RECORD_ID, reason: "the memo cites a policy I cannot read in full" };
  assert.equal(v5Prompt.readKnowledgeInputSchemaV5.safeParse(good).success, true);
  const extra = v5Prompt.readKnowledgeInputSchemaV5.safeParse({ ...good, client_id: CTX.clientId });
  assert.equal(extra.success, false, "a model-supplied client id must not ride in on an ignored field");
  const extra2 = v5Prompt.readKnowledgeInputSchemaV5.safeParse({ ...good, firm_id: CTX.firmId });
  assert.equal(extra2.success, false);
});

test("v5.read: the schema carries NO firm and NO client — those are the RUN's, never the model's", () => {
  const shape = Object.keys(v5Prompt.readKnowledgeInputSchemaV5.shape).sort();
  assert.deepEqual(shape, ["reason", "record_id"],
    "the model supplies which record and why; whose knowledge is legible is decided by the Work row");
  assert.equal(v5Prompt.readKnowledgeInputSchemaV5.safeParse({ record_id: "not-a-uuid", reason: "x" }).success, false);
  assert.equal(v5Prompt.readKnowledgeInputSchemaV5.safeParse({ record_id: RECORD_ID, reason: "" }).success, false,
    "a read with no stated reason is not an auditable read");
  assert.equal(v5Prompt.readKnowledgeInputSchemaV5.safeParse({ record_id: RECORD_ID, reason: "x".repeat(501) }).success, false);
});

test("v5.read: the door argument order is (p_firm, p_client, p_record), and BOTH identifiers come from ctx", () => {
  // A SOURCE PIN rather than a spy: `runKnowledgeRead` is a door call and cannot be driven without
  // a database, and the thing worth pinning is the call SITE — which identifiers are bound to
  // which parameter. `v4.tools`' own digest cell uses the same instrument.
  const src = codeOf(new URL("../workflows/claraWork.v5.tools.ts", import.meta.url));
  assert.match(src, /p_firm => \$1::uuid, p_client => \$2::uuid, p_record => \$3::uuid/,
    "named args in the door's own order — positional binding to a movable arity is how a mis-bind happens");
  const params = src.slice(src.indexOf("p_record => $3::uuid"));
  const bound = params.slice(0, 260);
  assert.match(bound, /ctx\.firmId[\s\S]*ctx\.clientId[\s\S]*input\.record_id/,
    "the firm and the client are the RUN's and only the record is the model's");
  assert.ok(!/input\.firm|input\.client/.test(src), "no model-supplied tenant identifier reaches any door");
});

test("v5.read: CLR11 is record_not_in_scope, CLR03 is no_pack_context, and an unmapped refusal keeps the door's OWN message", () => {
  const notInScope = v5Tools.readKnowledgeRefusal("CLR11", "record_not_in_scope", "fallback");
  assert.equal(notInScope.ok, false);
  assert.equal(notInScope.code, "CLR11");
  assert.equal(notInScope.message, v5Tools.READ_KNOWLEDGE_REFUSALS.record_not_in_scope);
  assert.match(notInScope.message, /not one this Work can read/);
  assert.ok(!/does not exist|no such record/i.test(notInScope.message),
    "the door refuses WITHOUT an existence oracle and the sentence must not reinstate one");

  const noContext = v5Tools.readKnowledgeRefusal("CLR03", "no_pack_context", "fallback");
  assert.equal(noContext.message, v5Tools.READ_KNOWLEDGE_REFUSALS.no_pack_context);

  // VERBATIM on anything the estate does not know — re-wording a refusal nobody reviewed is how a
  // wall becomes a rumour.
  const unknown = v5Tools.readKnowledgeRefusal("CLR99", "something_new", "the door's own words");
  assert.equal(unknown.message, "the door's own words");
  assert.equal(unknown.reason, "something_new");
  const noReason = v5Tools.readKnowledgeRefusal("42501", null, "a grant is missing");
  assert.equal(noReason.message, "a grant is missing");
});

test("v5.read: a Work with no client pin refuses BEFORE any round trip, and the tool call is still spent", async () => {
  const noClient = { ...CTX, clientId: null };
  const l = ledger();
  const built = v5Tools.buildClaraWorkToolsV5(noClient, l, B);
  const out = await built.read_knowledge_source.execute({ record_id: RECORD_ID, reason: "why" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR03");
  assert.equal(out.reason, "no_pack_context");
  assert.equal(l.toolCalls, 1, "the budget records the attempt — an act nobody counted is an act nobody bounded");
});

test("v5.read: a spent tool-call budget refuses by name and never reaches the door", async () => {
  const l = ledger();
  l.toolCalls = B.toolCalls;
  const built = v5Tools.buildClaraWorkToolsV5(CTX, l, B);
  const out = await built.read_knowledge_history.execute({ record_id: RECORD_ID, reason: "why" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "budget_exhausted");
  assert.equal(out.reason, "toolCalls");
  assert.equal(l.exhausted, "toolCalls");
});

test("v5.read: neither read mints a part kind, and neither returns a document's bytes", () => {
  const src = codeOf(new URL("../workflows/claraWork.v5.tools.ts", import.meta.url));
  const region = src.slice(src.indexOf("runKnowledgeRead"));
  assert.ok(!/type:\s*"(work_result|work_status|work_question|knowledge_receipt)"/.test(region),
    "#658's stanza: NO part kind for either read");
  assert.ok(!/bytes|download|object_key/i.test(region), "the byte door is 0190's and is not reachable from here");
});

// ---------------------------------------------------------------------------
// 3 · the terminal (D16 / R-D)
// ---------------------------------------------------------------------------

test("v5.terminal: knowledge_read_failed fires on EVERY one of the five frozen unavailable reasons", () => {
  const reasons = ["refused", "read_failed", "malformed", "no_client", "no_purpose"];
  for (const reason of reasons) {
    assert.equal(v5Impl.knowledgeReadFailedV5({ status: "unavailable", reason }), true,
      `${reason}: the door is ATOMIC — every way a tier can fail to be read arrives as one unavailable answer`);
    // and each maps onto a face word the estate's column admits, never `unavailable`
    const face = retrieval.faceStatusOf({ status: "unavailable", reason });
    assert.ok(["unknown", "denied"].includes(face), `${reason} -> ${face}`);
    assert.notEqual(face, "unavailable");
  }
});

test("v5.terminal: an OK answer NEVER fires it, however small the core tier is", () => {
  assert.equal(v5Impl.knowledgeReadFailedV5({ status: "ok" }), false);
  // R-D's second half, and the one a careless reading gets wrong: a client that genuinely has
  // nothing recorded is not a failed read, and stopping every Work for every new client would be
  // the same defect pointing the other way.
  const emptyCore = { status: "ok", tiers: { core: 0, requested: 0, remainder: 0 }, records: [], truncated: false };
  assert.equal(v5Impl.knowledgeReadFailedV5(emptyCore), false);
  assert.equal(retrieval.faceStatusOf(emptyCore), "ok");
  // a truncated read is `partial`, which is a BOUNDED view and not a failure either
  assert.equal(v5Impl.knowledgeReadFailedV5({ status: "ok", truncated: true }), false);
  assert.equal(retrieval.faceStatusOf({ status: "ok", truncated: true }), "partial");
});

test("v5.terminal: there is NO per-tier readability signal anywhere in this closure, and the payload says what happened", () => {
  // The integrator was told explicitly not to write the terminal as though a core-only signal
  // existed. This is the cell that would catch it being added back.
  // THE WHOLE FILE, COMMENTS INCLUDED, and that is deliberate here where every other pin reads
  // code alone: a header sentence promising a per-tier signal would be as false as an `if` that
  // branched on one, and this is the claim the integrator was warned twice not to get wrong.
  for (const f of ["claraWork.v5.ts", "claraWork.v5.impl.ts", "claraWork.v5.errors.ts"]) {
    const src = readFileSync(new URL(`../workflows/${f}`, import.meta.url), "utf8");
    assert.ok(!/core_readable|core_unreadable|core_ok|tiers\.core\s*===?\s*0/.test(src),
      `${f}: a per-tier signal would be an invented contract — 0230 answers all three tiers or raises`);
  }
  const payload = v5Errors.knowledgeReadFailedPayload(CTX.clientId, "read_failed");
  assert.equal(payload.code, "knowledge_read_failed");
  assert.equal(payload.reason, "read_failed");
  assert.equal(payload.recoverable, true);
  assert.equal(payload.client_id, CTX.clientId);
  assert.match(String(payload.message), /NOTHING WAS POSTED/);
  assert.match(String(payload.message), /not a client with nothing recorded/,
    "#603's closure: a failed read never reads as absence");
  assert.equal(v5Errors.knowledgeReadFailedPayload(CTX.clientId, null).reason, "unknown");
});

// ---------------------------------------------------------------------------
// 4 · the drift replan
// ---------------------------------------------------------------------------

test("v5.drift: relevant:true spends one replan and the note NAMES the keys that moved", () => {
  const drift = { status: "ok", reason: null, relevant: true, drifted: true, observed_from: "read",
    observed_version: "10", current_version: "12", moved_keys: ["sst_regime", "accounting_basis"] };
  assert.equal(v5Impl.driftSpendsReplanV5(drift), true);
  const note = v5Impl.driftNoteV5(drift);
  assert.match(note, /A FACT YOU READ CHANGED/);
  assert.match(note, /sst_regime/);
  assert.match(note, /accounting_basis/);
});

test("v5.drift: relevant:null is SURFACED, never coerced to false, and spends NOTHING", () => {
  // 0230 answers null — never false — when the observed version came from an execution trace
  // rather than a recorded read-set. Coercing it would re-open the null-as-empty defect one layer
  // up, and charging a replan for it would let an unconfirmable signal exhaust a run.
  const drift = { status: "ok", reason: null, relevant: null, drifted: true, observed_from: "trace",
    observed_version: "10", current_version: "12", moved_keys: [] };
  assert.equal(v5Impl.driftSpendsReplanV5(drift), false);
  const note = v5Impl.driftNoteV5(drift);
  assert.notEqual(note, null, "a null relevance is NEWS, not silence");
  assert.match(note, /cannot say whether any of it was something YOU read/);
  assert.match(note, /rather than as 'nothing changed'/);
});

test("v5.drift: relevant:false is silent and spends nothing — the one case where nothing is owed", () => {
  const drift = { status: "ok", reason: null, relevant: false, drifted: false, observed_from: "read",
    observed_version: "12", current_version: "12", moved_keys: [] };
  assert.equal(v5Impl.driftSpendsReplanV5(drift), false);
  assert.equal(v5Impl.driftNoteV5(drift), null);
});

test("v5.drift: an UNREADABLE drift is surfaced as its own third thing, and spends nothing", () => {
  const drift = { status: "unavailable", reason: "read_failed", relevant: null, drifted: null,
    observed_from: null, observed_version: null, current_version: null, moved_keys: [] };
  assert.equal(v5Impl.driftSpendsReplanV5(drift), false);
  const note = v5Impl.driftNoteV5(drift);
  assert.match(note, /could NOT be checked/);
  assert.match(note, /read_failed/);
  assert.match(note, /That is not "nothing changed"/);
});

test("v5.drift: the three notes are three DIFFERENT sentences — a run told the wrong one reasons confidently about the wrong thing", () => {
  const moved = v5Impl.driftNoteV5({ status: "ok", relevant: true, moved_keys: ["k"] });
  const unknown = v5Impl.driftNoteV5({ status: "ok", relevant: null, moved_keys: [] });
  const unread = v5Impl.driftNoteV5({ status: "unavailable", reason: "refused", relevant: null, moved_keys: [] });
  assert.equal(new Set([moved, unknown, unread]).size, 3);
});

// ---------------------------------------------------------------------------
// 5 · the riders
// ---------------------------------------------------------------------------

test("v5.rider847: the writer's two clauses are applied before traceSafely, and lib/work-trace.mjs is NOT opened", () => {
  const impl = codeOf(new URL("../workflows/claraWork.v5.impl.ts", import.meta.url));
  assert.match(impl, /from "\.\.\/lib\/work-trace-bounds\.mjs"/, "the SIBLING module, which is what #815 asked for");
  assert.match(impl, /boundedRunId\(row\.runId\) === null\) return;/, "a run id the door would refuse skips the row");
  assert.match(impl, /boundedRevisionNumber\(value\)/, "every NUMERIC observed revision passes 0210's numeric clause");
  // the guard is in BOTH writers — the bare one and the in-transaction one
  assert.equal((impl.match(/boundedRunId\(row\.runId\) === null/g) || []).length, 2);
});

test("v5.rider847: the writer is NO TIGHTER than the door — every shape 0210 admits, the bounds admit", () => {
  // Carried from work-trace-bounds.test.mjs's own acceptance set; restated here because it is the
  // v5 closure that now depends on it, and a writer stricter than its door loses rows silently.
  for (const v of [0, 1, -1, 12.5, 999999999999, 0.000001, -0.123456]) {
    assert.equal(bounds.boundedRevisionNumber(v), v, `the door admits ${v}`);
  }
  assert.equal(bounds.boundedRevisionNumber(1e12), null, "0210's ceiling is exclusive");
  assert.equal(bounds.boundedRevisionNumber(0.0000001), null, "scale 7 is past 0210's six");
  assert.equal(bounds.boundedRevisionNumber("12"), null, "a string revision is the rev grammar's business, not this clause's");
  const wdk = "wrun_01ARZ3NDEKTSV4RRFFQ69G5FAV";
  assert.equal(bounds.boundedRunId(wdk), wdk);
  assert.equal(bounds.boundedRunId("run_9f8e7d6c-1234-4abc-8def-0123456789ab"), "run_9f8e7d6c-1234-4abc-8def-0123456789ab");
  assert.equal(bounds.boundedRunId("run-1234567890123"), null, "thirteen consecutive digits is the clause 0210 was written for");
});

test("v5.rider882a: (CLR40, fa_cost_adjustment_deferred) is a REFUSAL carrying the door's own remedy", () => {
  const err = {
    code: "CLR40",
    message: "reducing the cost of an enrolled fixed-asset account is not yet a supported adjustment; "
      + "reverse the acquisition entry and re-book it at the corrected cost",
    detail: JSON.stringify({ reason: "fa_cost_adjustment_deferred", entry_id: "e", account_code: "1500", role: "cost" }),
  };
  const v5 = v5Errors.classifyWorkError(err);
  assert.equal(v5.kind, "refusal");
  assert.equal(v5.terminal, true, "the model gets no second attempt: the ADJUSTMENT SHAPE is what is not admitted");
  assert.equal(v5.recoverable, true, "a human who reverses and re-books CAN retry, which is what recoverable means");
  assert.equal(v5Errors.workOutcomeFor(v5.kind), "refused");
  assert.equal(v5Errors.taskErrorCodeFor(v5.kind), "tool_error");
  assert.match(v5.message, /reverse the acquisition entry and re-book it at the corrected cost/,
    "VERBATIM — a governed refusal is the database's considered answer and is never re-worded");
  // and the inherited default really was the other thing
  const v4 = v4Errors.classifyWorkError(err);
  assert.equal(v4.kind, "invariant");
  assert.equal(v4.recoverable, false, "which told a human 'something is wrong with Clara' and offered no Retry");
});

test("v5.rider882a: the other TWO CLR40 reasons are NOT widened — one row was ruled, one row ships", () => {
  for (const reason of ["fa_k_gl_balance_on_enrolled", "fa_belt_unregistered_movement"]) {
    const err = { code: "CLR40", message: "m", detail: JSON.stringify({ reason }) };
    assert.equal(v5Errors.classifyWorkError(err).kind, "invariant", `${reason} keeps today's reading`);
    assert.deepEqual(v5Errors.classifyWorkError(err), v4Errors.classifyWorkError(err));
  }
  assert.equal(v5Errors.FA_COST_ADJUSTMENT_DEFERRED, "fa_cost_adjustment_deferred");
});

test("v5.errors: every v1..v4 mapping is preserved BY CONSTRUCTION — the router delegates and overrides one pair", () => {
  const sample = [
    { code: "CLR13", detail: '{"reason":"work_cancelled"}' },
    { code: "CLR13", detail: '{"reason":"egress_not_authorized"}' },
    { code: "CLR10", detail: '{"reason":"basis_mismatch"}' },
    { code: "CLR19", detail: '{"reason":"write_into_closed_period"}' },
    { code: "40001" },
    { code: "42883" },
  ];
  for (const err of sample) {
    assert.deepEqual(v5Errors.classifyWorkError(err), v4Errors.classifyWorkError(err),
      `${err.code}: v5 adds no second table`);
  }
});

// ---------------------------------------------------------------------------
// 5b · FIX ROUND 1 — the block the run can ACT on, and what the digest cannot see
// ---------------------------------------------------------------------------

test("v5.knowledge: the block NAMES each record, so the three id-taking tools are reachable", () => {
  // REVIEW ADV-S-1. `read_knowledge_source`, `read_knowledge_history` and v4's still-rostered
  // `ask_knowledge_conflict` all take a `record_id` — and `ask_knowledge_conflict` takes
  // `scope_kind` and `applies_when` PER ROW. The model can only have learnt any of them from this
  // block, and the first cut of `recordLine` printed key, value and trust alone.
  const records = [
    {
      record_id: "11111111-1111-4111-8111-000000000001",
      knowledge_key: "sst_regime", value: "sales_tax", tier: "core", trust: "asserted",
      source_kind: "legacy_client_fact", scope_kind: "client", applies_when: { branch: "KL" },
      in_effect: true,
    },
    {
      record_id: "11111111-1111-4111-8111-000000000002",
      knowledge_key: "sst_regime", value: "service_tax", tier: "core", trust: "derived",
      source_kind: "knowledge_record", scope_kind: "firm", applies_when: {}, in_effect: true,
    },
  ];
  const block = retrieval.renderRetrievedKnowledge({
    status: "ok", knowledge_version: "7", as_of: "2026-09-30",
    tiers: { core: 2, requested: 0, remainder: 0 }, keys: ["sst_regime"], truncated: false,
    hidden_count: 0, records,
  });
  for (const r of records) assert.ok(block.includes(`record_id=${r.record_id}`), `${r.record_id} is named`);
  assert.match(block, /in force/, "which of the two rows GOVERNS — the conflict tool's whole subject");
  assert.match(block, /firm rule/);
  assert.match(block, /applies_when=/);
  // the schema the block has to feed, pinned against the block rather than described
  const row = v5Tools.knowledgeConflictRowSchema.parse({
    record_id: records[0].record_id,
    scope_kind: "client",
    applies_when: JSON.stringify(records[0].applies_when),
    value: String(records[0].value),
  });
  assert.equal(row.record_id, records[0].record_id);
});

test("v5.knowledge: the Work lane prints its OWN bound, and the row says what the block showed", () => {
  // REVIEW ADV-S-5. 0230 caps only the REMAINDER at `p_limit`; core and requested are unbounded,
  // so the print cap is the one place a CORE row can be dropped — and `records_shown`/`truncated`
  // must describe the BLOCK, not the door's answer, or the Work's durable result says "55 shown,
  // not truncated" about a block that printed 40.
  assert.equal(retrieval.RETRIEVED_MAX_RECORDS, 40, "knowledge-conflicts.mjs:44's number, the Work lane's own");
  assert.equal(retrieval.RETRIEVED_MAX_VALUE_CHARS, 200);
  const records = [];
  for (let i = 0; i < 55; i += 1) {
    records.push({
      record_id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
      knowledge_key: `k_${i}`, value: "v", tier: "core", trust: "asserted", in_effect: true,
    });
  }
  const answer = {
    status: "ok", knowledge_version: "7", as_of: "2026-09-30",
    tiers: { core: 55, requested: 0, remainder: 0 }, keys: [], truncated: false,
    hidden_count: 0, records,
  };
  const view = retrieval.renderedView(answer, retrieval.RETRIEVED_MAX_RECORDS);
  assert.deepEqual(view, { records_shown: 40, truncated: true });
  assert.equal(retrieval.faceStatusOf(answer, view.truncated), "partial",
    "a clipped block is a PARTIAL view and the estate's face word says so");
  assert.match(retrieval.renderRetrievedKnowledge(answer), /15 of them CORE/,
    "and the block tells the run which tier it lost");
  // the step hands both to the recorder rather than letting it count the door's records
  const impl = codeOf(new URL("../workflows/claraWork.v5.impl.ts", import.meta.url));
  assert.match(impl, /recordsShown: view\.records_shown, truncated: view\.truncated/);
  assert.match(impl, /records_shown: view\.records_shown/);
});

test("v5.knowledge: read_seq is NULL when this attempt's facts landed on no row", () => {
  // REVIEW ADV-S-12(a). `read_seq` is documented as "the seq this attempt's facts actually landed
  // on". Four divergent replays exhaust the bound and a failed first write lands nothing at all;
  // answering the last seq TRIED in either case is a claim about the estate the estate does not
  // carry.
  const impl = codeOf(new URL("../workflows/claraWork.v5.impl.ts", import.meta.url));
  assert.match(impl, /const landedSeq = recorded && !divergent \? seq : null;/);
  assert.ok(!/Math\.min\(seq, KNOWLEDGE_READ_MAX_SEQ\)/.test(impl),
    "the bound is not a seq this attempt landed on");
});

test("v5.bundle: the digest CANNOT see a zod refinement, and the roster's one refinement is pinned", () => {
  // REVIEW ADV-S-4. `z.toJSONSchema` erases `.superRefine`/`.refine` entirely, so the header's
  // "a tool that … now MOVES THE DIGEST" is true of every item it lists and false as a general
  // claim. This cell records the limit as a MEASUREMENT rather than a memory, and pins both the
  // census of schemas carrying such a check and the behaviour of the only one that does.
  const plain = z.object({ kind: z.enum(["text", "choice"]), options: z.array(z.string()).optional() }).strict();
  const refined = plain.superRefine((v, ctx) => {
    if (v.kind === "choice" && v.options === undefined) ctx.addIssue({ code: "custom", message: "options required" });
  });
  const toJson = (schema) => JSON.stringify(z.toJSONSchema(schema, { target: "draft-07", io: "input" }));
  assert.equal(toJson(plain), toJson(refined),
    "MEASURED: the hashed text is identical with and without the rule, so the digest is blind to it");
  assert.equal(plain.safeParse({ kind: "choice" }).success, true);
  assert.equal(refined.safeParse({ kind: "choice" }).success, false,
    "...while the two schemas accept DIFFERENT inputs — which is what a contract is");

  // THE CENSUS: which roster schemas carry a check the digest cannot see. A new one must be
  // declared here, which is the gate the digest itself cannot be.
  const customChecks = (schema, path, out) => {
    const def = schema?._zod?.def;
    if (!def) return out;
    for (const c of Array.isArray(def.checks) ? def.checks : []) {
      if (c?._zod?.def?.check === "custom") out.push(path);
    }
    if (def.type === "object" && def.shape) {
      for (const [k, v] of Object.entries(def.shape)) customChecks(v, `${path}.${k}`, out);
    }
    if (def.type === "array" && def.element) customChecks(def.element, `${path}[]`, out);
    if ((def.type === "optional" || def.type === "nullable") && def.innerType) customChecks(def.innerType, path, out);
    if (Array.isArray(def.options)) def.options.forEach((o, i) => customChecks(o, `${path}|${i}`, out));
    return out;
  };
  const census = [];
  for (const name of v5Prompt.CLARA_WORK_TOOL_NAMES_V5) {
    census.push(...customChecks(v5Prompt.CLARA_WORK_TOOL_SCHEMAS_V5[name], name, []));
  }
  assert.deepEqual(census, ["ask_question.fields[]"],
    "exactly one roster schema carries a rule the bundle digest cannot see — #791's own example");

  // AND THAT ONE RULE IS PINNED BY BEHAVIOUR, so relaxing it reds here even though the digest
  // would not move.
  const askQuestion = v5Prompt.CLARA_WORK_TOOL_SCHEMAS_V5[v1Prompt.ASK_QUESTION_TOOL];
  const field = (over) => Object.assign({ key: "k", label: "L", kind: "text" }, over);
  const ask = (fields) => askQuestion.safeParse({
    question: "Which basis?", reason: "the basis is ambiguous", fields,
  });
  assert.equal(ask([field({ kind: "choice", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] })]).success, true);
  assert.equal(ask([field({ kind: "choice" })]).success, false, "`choice` without options is refused");
  assert.equal(ask([field({ options: [{ value: "a", label: "A" }] })]).success, false,
    "...and options on a non-choice field is refused");
});

// ---------------------------------------------------------------------------
// 6 · the capability registry, the trace scheme and the registry pin
// ---------------------------------------------------------------------------

test("v5.capabilities: the two new ids are model-bound under accounting_work, and v1 is carried by REFERENCE", () => {
  for (const id of ["accounting_work.retrieve_knowledge", "accounting_work.inspect_knowledge_source"]) {
    assert.equal(registryV2.isModelBoundV2(id), true,
      "retrieved knowledge goes INTO the model's context, so a dispatch authorization is owed");
    assert.equal(registryV2.purposeForV2(id), "accounting_work");
  }
  assert.equal(registryV2.CAPABILITY_REGISTRY_VERSION_V2, "clara-capability-registry/v2");
  // v1's five, unchanged and unedited — the sibling pattern, not a widening of a hash-locked module
  assert.equal(registryV2.capabilityIdsV2().length, 7);
  assert.equal(registryV2.purposeForV2("accounting_work.model_segment"), "accounting_work");
});

test("v5.trace: the seq scheme gives every act its own number and nothing collides", () => {
  const seen = new Set([v5Impl.CLAIM_TRACE_SEQ, v5Impl.KNOWLEDGE_TRACE_SEQ]);
  assert.equal(v5Impl.CLAIM_TRACE_SEQ, 1);
  assert.equal(v5Impl.KNOWLEDGE_TRACE_SEQ, 2);
  for (let i = 0; i < B.segments; i += 1) {
    const base = v5Impl.segmentTraceBase(i);
    for (let k = 0; k < 4; k += 1) {
      assert.equal(seen.has(base + k), false, `segment ${i} row ${k} (seq ${base + k}) is already taken`);
      seen.add(base + k);
    }
  }
  assert.equal(seen.has(v5Impl.SETTLE_TRACE_SEQ), false, "the settle takes the first number past the last segment");
  assert.equal(v5Impl.SETTLE_TRACE_SEQ, 3 + B.segments * 4);
  // the DRIFT row of segment n+1 is what the body writes on a resume, so it must be inside the
  // scheme rather than past it
  assert.ok(v5Impl.segmentTraceBase(B.segments - 1) + 3 < v5Impl.SETTLE_TRACE_SEQ);
});

test("v5.trace: the drift row a RESUME can write is inside the scheme — the settle's seq is nobody else's", () => {
  // THE CELL THE FIRST CUT SHOULD HAVE WRITTEN (review ADV-S-3). The loop above stops at
  // `B.segments - 1`, so it never reached the row the body can actually write on the LAST
  // segment's resume: `readKnowledgeDriftStepV5(..., segmentTraceBase(segment + 1))` with
  // `segment = B.segments - 1` is `segmentTraceBase(B.segments)` — which IS `SETTLE_TRACE_SEQ`.
  // `clara.record_work_execution_trace` ends `on conflict (work_id, run_id, seq) do nothing` and
  // both writers swallow the answer, so the settle row — outcome, refusal, receipt — was simply
  // dropped, silently, on that path.
  for (let i = 0; i <= B.segments; i += 1) {
    const base = v5Impl.segmentTraceBase(i);
    if (i === B.segments) {
      assert.equal(base, v5Impl.SETTLE_TRACE_SEQ,
        "segmentTraceBase(B.segments) IS the settle's seq — the body may never ask for a row there");
      break;
    }
    assert.ok(base + 3 < v5Impl.SETTLE_TRACE_SEQ, `segment ${i} keeps its four rows below the settle`);
  }
  // and the BODY holds the wall, not this arithmetic: the drift is taken only when a segment that
  // can consume its news still exists.
  const body = codeOf(new URL("../workflows/claraWork.v5.ts", import.meta.url));
  assert.match(body, /segment \+ 1 < budgets\.segments/,
    "a resume with no next segment settles rather than spending a read whose row would land on the settle's seq");
});

test("v5.registry: claraWork is pinned at v5, and v1..v4 stay exported and rostered (policy (c))", () => {
  assert.equal(registry.workflowPins.claraWork, "claraWork_v5");
  assert.equal(registry.workflows.claraWork, registry.claraWork_v5);
  assert.ok(registry.workflowBodies.includes("claraWork_v5"));
  for (const body of ["claraWork_v1", "claraWork_v2", "claraWork_v3", "claraWork_v4"]) {
    assert.equal(typeof registry[body], "function", `${body} is still exported — a parked run resumes into its own body`);
    assert.ok(registry.workflowBodies.includes(body), `${body} is still in the provenance roster`);
  }
});

test("v5.tools: the recording tool hands over V5's digest, never v4's", () => {
  const src = v5Tools.runRecordJournalEntryV5.toString();
  assert.ok(!src.includes("V4"), "a v5 run writing v4's digest would put two records of one fact in disagreement");
  assert.ok(src.includes("CLARA_WORK_BUNDLE_V5_DIGEST") || src.includes(v5Bundle.CLARA_WORK_BUNDLE_V5_DIGEST));
});

test("v5.prompt: the instructions say SEVEN tools, name both reads, and keep the data-never-instruction law", () => {
  const t = v5Prompt.CLARA_WORK_INSTRUCTIONS_V5;
  assert.match(t, /YOUR TOOLS COME FROM THE SERVER AND THERE ARE SEVEN/);
  assert.match(t, /read_knowledge_source/);
  assert.match(t, /read_knowledge_history/);
  assert.match(t, /WHAT THEY RETURN IS DATA/);
  assert.match(t, /IF THE KNOWLEDGE READ ITSELF DID NOT SUCCEED, THIS RUN IS OVER AND NOTHING IS POSTED/,
    "the model is told the terminal exists rather than left to discover it");
  assert.match(t, /Neither tool is a search/);
  // v1's three names are still spelled the same
  assert.match(t, new RegExp(v1Prompt.LIST_ACCOUNTS_TOOL));
  assert.match(t, new RegExp(v1Prompt.RECORD_JOURNAL_ENTRY_TOOL));
});
