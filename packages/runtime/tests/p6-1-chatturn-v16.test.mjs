// P6-1 — chatTurn_v16, Q8's FOUR-CARD WIRE BUMP. The PURE battery: no DB, no network, no model.
//
// WHAT THIS FILE PROVES, AND WHY IT IS SHAPED THE WAY IT IS. Q8 adds four part kinds to the
// chat wire, and exactly ONE of them has an emitter in this closure. So this battery has two
// halves that need different instruments and are kept visibly apart:
//
//   THE EMITTER (freeform_result) is exercised — real content arrays through the real
//   `toTypedParts_v16`, including every non-admitting shape, the bigint boundary and the replay
//   dedup. A behavioural cell is available, so nothing here settles for reading source.
//
//   THE THREE DECLARATIONS (agent_receipt, firm_question, close_proposal) cannot be exercised:
//   this body cannot mint one, by grant and by wake-kind allowlist, and the sibling
//   p6-1-chatturn-v16-db.test.mjs READS those walls on a live catalog rather than trusting this
//   file's word for it. What IS this file's to prove is that the declarations P6-2 will
//   transcribe say what the order says they say — so the field lists are censused OUT OF THE
//   DECLARER'S OWN SOURCE, comment-stripped, with the parse asserted to have found exactly four
//   (a parser that silently matched nothing would otherwise pass every field assertion
//   vacuously).
//
// COMMENT-STRIPPING IS LOAD-BEARING HERE, not hygiene. chatTurn.v16.parts.ts and
// chatTurn.v16.ts both NAME all four kinds repeatedly in their headers — deliberately, since
// the headers are where the grant reasoning lives — so a census over raw source would go green
// on prose and could never go red on deleted code. Every source cell below reads
// `stripComments()` output, and one cell mutates the stripper's input to prove it is actually
// removing the header (an instrument that silently stopped stripping would make the other
// source cells vacuous).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const { register } = await import("tsx/esm/api");
register();

const registry = await import("../workflows/registry.ts");
const parts16 = await import("../workflows/chatTurn.v16.parts.ts");
const prompt16 = await import("../workflows/chatTurn.v16.prompt.ts");
const prompt15 = await import("../workflows/chatTurn.v15.prompt.ts");
const usage16 = await import("../workflows/chatTurn.v16.usage.ts");
const usage15 = await import("../workflows/chatTurn.v15.usage.ts");
const impl16 = await import("../workflows/chatTurn.v16.impl.ts");
const tools15 = await import("../workflows/chatTurn.v15.tools.ts");
const freeform15 = await import("../workflows/chatTurn.v15.freeform.ts");
const v15Module = await import("../workflows/chatTurn.v15.ts");
const v16Module = await import("../workflows/chatTurn.v16.ts");

const PARTS_PATH = fileURLToPath(new URL("../workflows/chatTurn.v16.parts.ts", import.meta.url));
const ENTRY_PATH = fileURLToPath(new URL("../workflows/chatTurn.v16.ts", import.meta.url));
const PROMPT_PATH = fileURLToPath(new URL("../workflows/chatTurn.v16.prompt.ts", import.meta.url));
const IMPL_PATH = fileURLToPath(new URL("../workflows/chatTurn.v16.impl.ts", import.meta.url));
const USAGE_PATH = fileURLToPath(new URL("../workflows/chatTurn.v16.usage.ts", import.meta.url));

const PARTS_SRC = await readFile(PARTS_PATH, "utf8");
const ENTRY_SRC = await readFile(ENTRY_PATH, "utf8");
const PROMPT_SRC = await readFile(PROMPT_PATH, "utf8");
const IMPL_SRC = await readFile(IMPL_PATH, "utf8");
const USAGE_SRC = await readFile(USAGE_PATH, "utf8");

const FF = freeform15.FREEFORM_READ_TOOL;
const FAKE_CTX = {
  firmId: "00000000-0000-0000-0000-000000000001",
  clientId: "00000000-0000-0000-0000-000000000002",
  createdBy: "00000000-0000-0000-0000-000000000003",
  taskId: "00000000-0000-0000-0000-000000000004",
};

/** Strip `//` and block comments so a source census reads CODE, not prose — see this file's
 *  header for why that is the difference between a real cell and a vacuous one. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** One ADMITTED freeform tool result, in the exact two-envelope shape `runFreeformRead`
 *  returns: the tool's own `{ok, read}` wrapper around the DB verb's jsonb, which carries its
 *  own `ok`/`outcome` pair (chatTurn.v15.freeform.ts:104, 0131:1264-1286). */
function admittedRead(readId, extra = {}) {
  return {
    type: "tool-result",
    toolCallId: `tc-${readId}`,
    toolName: FF,
    output: {
      ok: true,
      read: {
        ok: true,
        outcome: "ok",
        read_id: readId,
        authority: "narrative",
        claim_eligible: false,
        scope: "firm",
        row_count: 3,
        rows: [{ n: 1 }],
        ...extra,
      },
    },
  };
}

// ==============================================================================================
// 1 · The registry repoint, and policy (c) for every body it moved past.
// ==============================================================================================

test("p6-1.registry: `chatTurn:` is repointed to chatTurn_v16, and it IS chatTurn.v16.ts's own function", () => {
  assert.equal(registry.workflows.chatTurn.name, "chatTurn_v16", "the registry pins chatTurn_v16");
  assert.equal(registry.workflows.chatTurn, v16Module.chatTurn_v16, "...and the pinned value IS the module's own function, not a stand-in");
  assert.notEqual(registry.workflows.chatTurn, v15Module.chatTurn_v15, "the registry no longer points chatTurn: at v15");
});

test("p6-1.registry.policy-c: chatTurn_v15 stays exported and IS its own function — no parked run is stranded", () => {
  assert.equal(typeof registry.chatTurn_v15, "function", "the registry re-exports chatTurn_v15");
  assert.equal(registry.chatTurn_v15, v15Module.chatTurn_v15, "the registry's chatTurn_v15 export IS chatTurn.v15.ts's own function");
});

test("p6-1.registry.rollback-preflight: EVERY chatTurn body v1..v16 is still reachable by export", async () => {
  // The rollback preflight (packages/runtime/README.md) asks whether a target image still
  // exports every version holding non-terminal runs. That question is only answerable if the
  // registry keeps re-exporting all of them, so the repoint is the moment to re-assert it —
  // this is the cell that would catch a "tidy up the old exports" change riding a bump.
  for (let n = 1; n <= 16; n++) {
    const exportName = `chatTurn_v${n}`;
    assert.equal(typeof registry[exportName], "function", `registry re-exports ${exportName}`);
    const mod = await import(`../workflows/chatTurn.v${n}.ts`);
    assert.equal(registry[exportName], mod[exportName], `registry's ${exportName} IS chatTurn.v${n}.ts's own function`);
  }
});

// ==============================================================================================
// 2 · The DECLARER — the four kinds, and the field lists P6-2 transcribes.
// ==============================================================================================

/** Census the four exported object-type declarations out of chatTurn.v16.parts.ts. Returns
 *  kind -> ordered field names, read from CODE. */
function declaredPartShapes(src) {
  const code = stripComments(src);
  const shapes = new Map();
  const decl = /export\s+type\s+[A-Za-z0-9_]+\s*=\s*\{([^{}]*)\}/g;
  let m;
  while ((m = decl.exec(code)) !== null) {
    const body = m[1];
    const kind = /\btype\s*:\s*"([a-z_]+)"/.exec(body);
    if (!kind) continue;
    shapes.set(
      kind[1],
      [...body.matchAll(/(?:^|[;{\s])([a-z_][a-z0-9_]*)\s*:/g)].map((x) => x[1]),
    );
  }
  return shapes;
}

test("p6-1.declarer.instrument: stripComments really removes the header — the source cells below are not reading prose", () => {
  assert.ok(/裁-9|Q8/.test(PARTS_SRC), "the RAW declarer names the ruling in its header (control: the text is there to strip)");
  assert.ok(!/裁-9/.test(stripComments(PARTS_SRC)), "...and the STRIPPED declarer does not — so a census over stripped source cannot pass on a docblock");
  assert.ok(!/hydrate-never-trust/.test(stripComments(PARTS_SRC)), "a second, independently-chosen header phrase is gone too");
});

test("p6-1.declarer: exactly FOUR part kinds are declared, and they are Q8's four", () => {
  const shapes = declaredPartShapes(PARTS_SRC);
  assert.equal(shapes.size, 4, `the declarer declares exactly four part shapes (parsed ${shapes.size}: ${[...shapes.keys()].join(", ")})`);
  assert.deepEqual([...shapes.keys()].sort(), ["agent_receipt", "close_proposal", "firm_question", "freeform_result"]);
});

test("p6-1.declarer: CHATTURN_V16_PART_KINDS is DERIVED-CHECKED against the declarations, never a restatement", () => {
  const declared = [...declaredPartShapes(PARTS_SRC).keys()].sort();
  const constant = [...parts16.CHATTURN_V16_PART_KINDS].sort();
  assert.deepEqual(constant, declared, "the exported constant and the type declarations name the SAME four kinds");
  assert.equal(new Set(parts16.CHATTURN_V16_PART_KINDS).size, 4, "the four names are pairwise distinct");
});

test("p6-1.declarer.fields: each kind's field list is the file's own declaration — identifiers only", () => {
  const shapes = declaredPartShapes(PARTS_SRC);
  assert.deepEqual(shapes.get("agent_receipt"), ["type", "receipt_kind", "receipt_id", "client_id"]);
  assert.deepEqual(shapes.get("firm_question"), ["type", "question_id"]);
  assert.deepEqual(shapes.get("close_proposal"), ["type", "proposal_id", "close_run_id", "client_id"]);
  assert.deepEqual(shapes.get("freeform_result"), ["type", "read_id"]);
});

test("p6-1.declarer.omissions: the fields a stale copy would LIE about are absent, by name", () => {
  // Each of these is a real column on the hydrate surface, deliberately not carried (the
  // docblocks say why). Asserting their ABSENCE is what makes "identifiers only" a checked
  // property rather than a claim — and a later hand widening a shape trips this cell.
  const shapes = declaredPartShapes(PARTS_SRC);
  for (const forbidden of ["state", "narrative", "drafted", "bound_digests", "model_name", "settled_by"]) {
    assert.ok(!shapes.get("close_proposal").includes(forbidden), `close_proposal must not carry '${forbidden}'`);
  }
  for (const forbidden of ["client_id", "document_id", "kind", "question_text", "candidates", "status", "named_client"]) {
    assert.ok(!shapes.get("firm_question").includes(forbidden), `firm_question must not carry '${forbidden}' (client_id is not even a COLUMN — 0103 D-11)`);
  }
  for (const forbidden of ["rows", "query_text", "purpose", "row_count", "outcome", "relations_read"]) {
    assert.ok(!shapes.get("freeform_result").includes(forbidden), `freeform_result must not carry '${forbidden}' — the rows are never persisted and the receipt is read, not copied`);
  }
  for (const forbidden of ["verdict", "failing_rungs", "rationale", "occurred_at", "acting_actor"]) {
    assert.ok(!shapes.get("agent_receipt").includes(forbidden), `agent_receipt must not carry '${forbidden}'`);
  }
});

// ==============================================================================================
// 3 · THE EMITTER — toTypedParts_v16 promotes freeform_result, and nothing else changes.
// ==============================================================================================

test("p6-1.emit: an ADMITTED freeform read promotes exactly one freeform_result addressing its receipt", () => {
  const out = prompt16.toTypedParts_v16([{ type: "text", text: "here is what I found" }, admittedRead(4242)]);
  const cards = out.filter((p) => p.type === "freeform_result");
  assert.equal(cards.length, 1, "exactly one card");
  assert.deepEqual(cards[0], { type: "freeform_result", read_id: "4242" }, "read_id is the receipt row's id, rendered as text");
});

test("p6-1.emit.superset: every part v15 promotes, v16 promotes too, in the same order and first", () => {
  const content = [
    { type: "text", text: "checking" },
    { type: "tool-result", toolCallId: "tc-r", toolName: FF, output: { ok: false, refusal: { type: "refusal", code: "CLR-FREEFORM-B", reason: "read_timeout", message: "too long" } } },
    admittedRead(7),
  ];
  const v15out = prompt15.toTypedParts_v15(content);
  const v16out = prompt16.toTypedParts_v16(content);
  assert.deepEqual(v16out.slice(0, v15out.length), v15out, "v16 WIDENS v15's promotion — it never re-cuts or reorders it");
  assert.equal(v16out.length, v15out.length + 1, "and adds exactly the one card this content earns");
  assert.ok(v15out.some((p) => p.type === "refusal"), "control: v15 really did promote the refusal, so the slice above is not comparing two empties");
});

test("p6-1.emit.refused: a REFUSED read promotes NO card — the refusal is v15's arm and stays the only voice", () => {
  const out = prompt16.toTypedParts_v16([
    { type: "tool-result", toolCallId: "tc-1", toolName: FF, output: { ok: false, refusal: { type: "refusal", code: "CLR-FREEFORM-B", reason: "read_unavailable", message: "no" } } },
  ]);
  assert.equal(out.filter((p) => p.type === "freeform_result").length, 0, "no card for a refused read");
  assert.equal(out.filter((p) => p.type === "refusal").length, 1, "...and exactly one refusal, promoted by v15's own body");
});

test("p6-1.emit.positive-admission: every non-admitting envelope yields NO card (nothing tests for 'fail')", () => {
  const nonAdmitting = [
    ["outer ok missing", { read: { ok: true, outcome: "ok", read_id: 1 } }],
    ["outer ok false", { ok: false, read: { ok: true, outcome: "ok", read_id: 1 } }],
    ["outer ok truthy-but-not-true", { ok: 1, read: { ok: true, outcome: "ok", read_id: 1 } }],
    ["inner ok false", { ok: true, read: { ok: false, outcome: "ok", read_id: 1 } }],
    ["inner outcome refused", { ok: true, read: { ok: true, outcome: "refused", read_id: 1 } }],
    ["inner outcome missing", { ok: true, read: { ok: true, read_id: 1 } }],
    ["inner outcome unknown-future-value", { ok: true, read: { ok: true, outcome: "partial", read_id: 1 } }],
    ["read null", { ok: true, read: null }],
    ["read an array", { ok: true, read: [] }],
    ["output null", null],
    ["output an array", []],
    ["output a string", "ok"],
  ];
  for (const [label, output] of nonAdmitting) {
    const out = prompt16.toTypedParts_v16([{ type: "tool-result", toolCallId: "tc", toolName: FF, output }]);
    assert.equal(out.filter((p) => p.type === "freeform_result").length, 0, `${label}: must not admit`);
  }
  // The control that makes the twelve above non-vacuous: the SAME harness, admitting.
  const ok = prompt16.toTypedParts_v16([{ type: "tool-result", toolCallId: "tc", toolName: FF, output: { ok: true, read: { ok: true, outcome: "ok", read_id: 1 } } }]);
  assert.equal(ok.filter((p) => p.type === "freeform_result").length, 1, "control: the minimal ADMITTED envelope does mint a card");
});

test("p6-1.emit.read_id: a bigint that has already lost digits mints NO card, rather than the wrong receipt", () => {
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: Number.MAX_SAFE_INTEGER } }), String(Number.MAX_SAFE_INTEGER), "the largest exact integer is still exact — it is admitted");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: Number.MAX_SAFE_INTEGER + 2 } }), null, "one past it is not, and fails closed");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: 12.5 } }), null, "a non-integer is not a bigint id");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: 0 } }), null, "0 is not a serial id");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: -5 } }), null, "nor is a negative");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: "9007199254740993" } }), "9007199254740993", "a STRING form rides through exactly — this is the shape that survives a bigint past 2^53");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: "0012" } }), null, "a leading-zero string is not a canonical id");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok", read_id: "abc" } }), null, "nor is a non-numeric string");
  assert.equal(prompt16.admittedFreeformReadId({ ok: true, read: { ok: true, outcome: "ok" } }), null, "an absent read_id mints nothing");
});

test("p6-1.emit.dedupe: two DIFFERENT reads mint two cards; the SAME read twice mints one", () => {
  const two = prompt16.toTypedParts_v16([admittedRead(11), admittedRead(12)]);
  assert.deepEqual(
    two.filter((p) => p.type === "freeform_result").map((p) => p.read_id),
    ["11", "12"],
    "two genuine reads are two cards — a dedupe that collapsed them would be the bank_pack mistake",
  );
  const replay = prompt16.toTypedParts_v16([admittedRead(11), admittedRead(11)]);
  assert.equal(replay.filter((p) => p.type === "freeform_result").length, 1, "a replayed read is one card");
});

test("p6-1.emit.tool-gate: an identical payload under ANOTHER tool's name mints nothing", () => {
  const impostor = { ...admittedRead(99), toolName: "get_bank_pack" };
  const out = prompt16.toTypedParts_v16([impostor]);
  assert.equal(out.filter((p) => p.type === "freeform_result").length, 0, "the promotion is keyed on the tool that produced the result, never on the payload's shape");
  assert.equal(prompt16.toTypedParts_v16([admittedRead(99)]).filter((p) => p.type === "freeform_result").length, 1, "control: the same payload under the freeform tool DOES mint one");
});

test("p6-1.emit.non-tool-parts: a tool-CALL, a text part and an empty content array mint nothing", () => {
  for (const content of [[], [{ type: "text", text: "hi" }], [{ type: "tool-call", toolCallId: "tc", toolName: FF, input: { sql: "select 1" } }]]) {
    assert.equal(prompt16.toTypedParts_v16(content).filter((p) => p.type === "freeform_result").length, 0);
  }
});

// ==============================================================================================
// 4 · pushPart — the CROSS-SEGMENT half of the dedup law, and the three arms that must NOT exist.
// ==============================================================================================

test("p6-1.pushpart: chatTurn.v16.ts carries a freeform_result arm keyed on read_id", () => {
  const code = stripComments(ENTRY_SRC);
  assert.ok(/裁-9|Q8/.test(ENTRY_SRC) && !/裁-9/.test(code), "instrument control: the entry's header is stripped, so the assertions below read code");
  assert.match(code, /p\.type === "freeform_result"/, "the arm exists");
  assert.match(code, /x\.type === "freeform_result" && x\.read_id === p\.read_id/, "...and it dedupes on read_id, the receipt row's own id");
  assert.match(code, /x\.type === "bank_act" && x\.op_key === p\.op_key/, "control: v15's own bank_act arm is byte-carried beside it");
});

test("p6-1.pushpart: the other three Q8 kinds get NO arm, and no executable line of this closure mints one", () => {
  // Not tidiness: an arm for a kind this body cannot mint would assert a producer that does not
  // exist, and the next reader would take it as evidence one does.
  const entryCode = stripComments(ENTRY_SRC);
  assert.ok(entryCode.includes("freeform_result"), "control: the census DOES find the one kind this body emits, so every absence below is a real absence and not a broken instrument");
  for (const kind of ["agent_receipt", "firm_question", "close_proposal"]) {
    assert.ok(!entryCode.includes(kind), `chatTurn.v16.ts must carry no executable mention of '${kind}'`);
  }
  // The prompt module is where the three ARE discussed at length — and discussing them is all it
  // does. This is the pair that makes the point: named in the file, absent from its code.
  const promptCode = stripComments(PROMPT_SRC);
  for (const kind of ["agent_receipt", "firm_question", "close_proposal"]) {
    assert.ok(PROMPT_SRC.includes(kind), `control: chatTurn.v16.prompt.ts really does name '${kind}' — in its header`);
    assert.ok(!promptCode.includes(kind), `...and names it ONLY there: no executable line of the prompt module mints a '${kind}'`);
  }
});

test("p6-1.walls: no file in the v16 closure names a door this lane cannot call", () => {
  const forbidden = ["wake_open_firm_question", "wake_propose_close", "agent_receipts_visible", "firm_open_questions", "close_proposals", "freeform_read_log"];
  for (const [label, src] of [["entry", ENTRY_SRC], ["prompt", PROMPT_SRC], ["impl", IMPL_SRC], ["usage", USAGE_SRC], ["parts", PARTS_SRC]]) {
    const code = stripComments(src);
    for (const name of forbidden) {
      assert.ok(!code.includes(name), `${label}: '${name}' must appear only in prose — this closure calls no such door and reads no such relation`);
    }
  }
  assert.ok(PARTS_SRC.includes("agent_receipts_visible"), "control: the declarer DOES cite the surface in its docblocks, so the census above is discriminating");
});

// ==============================================================================================
// 5 · What did NOT move — the prompt, the intent signal, the tool set.
// ==============================================================================================

test("p6-1.carried: SYSTEM_PROMPT_V16 IS SYSTEM_PROMPT_V15, by identity — not a retyped copy", () => {
  assert.equal(prompt16.SYSTEM_PROMPT_V16, prompt15.SYSTEM_PROMPT_V15, "same value");
  assert.ok(!stripComments(PROMPT_SRC).includes("READING THE BOOKS FREELY"), "and the guidance text is not re-typed anywhere in this closure");
  assert.ok(prompt15.SYSTEM_PROMPT_V15.includes("READING THE BOOKS FREELY"), "control: that phrase really is v15's own guidance, so the absence above means something");
});

test("p6-1.carried: hasCodingIntent_v16 agrees with v15's on both directions — a read is still not acting", () => {
  const readOnly = [{ type: "tool-call", toolCallId: "t1", toolName: FF, input: { sql: "select 1", purpose: "p" } }];
  const acting = [{ type: "tool-call", toolCallId: "t2", toolName: "draft_journal_entry", input: {} }];
  assert.equal(prompt16.hasCodingIntent_v16(readOnly), prompt15.hasCodingIntent_v15(readOnly));
  assert.equal(prompt16.hasCodingIntent_v16(readOnly), false, "a freeform read carries no C-19 obligation");
  assert.equal(prompt16.hasCodingIntent_v16(acting), prompt15.hasCodingIntent_v15(acting));
  assert.equal(prompt16.hasCodingIntent_v16(acting), true, "control: a draft call still is acting intent, so the false above is a verdict not a stub");
});

test("p6-1.carried: v16's tool set IS v15's — no tool added, dropped, renamed or shadowed", () => {
  const v15Names = Object.keys(tools15.buildToolsV15(FAKE_CTX, "gpt-test", 0)).sort();
  assert.ok(v15Names.includes(FF), "control: v15's set really does carry the freeform tool");
  assert.ok(v15Names.length > 13, `control: it is the full set, not a stub (${v15Names.length} tools)`);
  assert.match(stripComments(IMPL_SRC), /buildToolsV15\(ctx, model, segment\)/, "v16's segment step builds v15's tool set, by import");
  assert.ok(!stripComments(IMPL_SRC).includes("buildToolsV16"), "there is no v16 tool module to drift from it");
});

test("p6-1.carried: the C-19 terminal set is byte-unchanged — freeform_result does not join it", () => {
  const code = stripComments(ENTRY_SRC);
  assert.match(
    code,
    /p\.type === "je_review" \|\| p\.type === "entry_posted" \|\| p\.type === "bank_act" \|\| p\.type === "refusal" \|\| p\.type === "clarify"/,
    "the five terminal kinds are exactly v15's five",
  );
});

// ==============================================================================================
// 6 · The engine stamp — moved where it names a body, carried where it does not.
// ==============================================================================================

test("p6-1.stamp: chatEngineId names v16; freeformEngineId still names the body that runs the read", () => {
  assert.equal(usage16.chatEngineId("gpt-5.6-terra"), "llm-openai:gpt-5.6-terra:chatturn-v16");
  assert.notEqual(usage16.chatEngineId("gpt-5.6-terra"), usage15.chatEngineId("gpt-5.6-terra"), "the chat stamp moved");
  assert.equal(usage16.freeformEngineId, usage15.freeformEngineId, "the freeform stamp is v15's FUNCTION by identity — v16 runs v15's freeform body, so relabelling it would name a file that never executed");
  assert.equal(usage16.freeformEngineId("gpt-5.6-terra"), "freeform-read:gpt-5.6-terra:chatturn-v15");
});

test("p6-1.stamp: the recorder is v15's by identity — the stamp moved, the metering door did not", () => {
  assert.equal(usage16.recordChatUsage, usage15.recordChatUsage, "recordChatUsage is imported, never copied");
  assert.equal(usage16.recordFreeformUsage, usage15.recordFreeformUsage);
  assert.equal(usage16.AGENT_USAGE_IDENT, usage15.AGENT_USAGE_IDENT, "and so is the signature probe's expected identity");
  assert.ok(!stripComments(USAGE_SRC).includes("record_agent_usage_event"), "no second copy of the metering SQL exists in this closure");
});

// ==============================================================================================
// 7 · THE BUILT BUNDLE — the one check reading the source cannot do.
// ==============================================================================================

const BUNDLE = fileURLToPath(new URL("../.output/server/index.mjs", import.meta.url));
const GATE = fileURLToPath(new URL("../../../scripts/check-workflow-bundle.mjs", import.meta.url));
const bundleBuilt = await stat(BUNDLE).then(() => true).catch(() => false);

// THE ASSERTIONS LIVE IN THE SCRIPT, NOT HERE — and that is the fix for this cell's own defect.
// As first written, this cell held the bundle assertions itself and SKIPPED when `.output/` was
// absent. CI's build job builds and stops; the estate suite deliberately runs unbuilt. So it
// skipped in every lane and the bundle claim was never actually certified anywhere (Codex review
// MEDIUM-1; law 28 — absence is not evidence). `scripts/check-workflow-bundle.mjs` now runs in
// the build job right after `pnpm build`, where a missing bundle is a FAILURE. This cell invokes
// that same script so there is ONE assertion list: a change to the gate cannot pass here and
// fail there, or the reverse.
//
// The skip that remains is honest — in an unbuilt checkout there is no artifact to judge — and
// `CLARA_REQUIRE_BUNDLE=1` removes it for any lane that wants the hard failure.
const REQUIRE_BUNDLE = process.env.CLARA_REQUIRE_BUNDLE === "1";

test(
  "p6-1.bundle: the shipped workflow-bundle gate passes against this checkout's built artifact",
  { skip: bundleBuilt || REQUIRE_BUNDLE ? false : "no .output/ — run pnpm --filter @clara/runtime build (or set CLARA_REQUIRE_BUNDLE=1 to make this a failure)" },
  () => {
    // Run the REAL gate as CI runs it, through its own process, so what passes here is the same
    // program that guards the build job — never a re-implementation that could drift from it.
    const r = spawnSync(process.execPath, [GATE], { encoding: "utf8" });
    assert.equal(
      r.status,
      0,
      `check-workflow-bundle exited ${r.status}. This is the gate CI runs after \`pnpm build\`:\n${r.stdout}${r.stderr}`,
    );
    // A DISCRIMINATING post-condition: exit 0 alone would also be produced by a gate that
    // checked nothing, so assert it reports having actually looked at the things it names.
    assert.match(r.stdout, /check-workflow-bundle: OK/, "the gate reports OK");
    assert.match(r.stdout, /chatTurn pinned at v16/, "...and says which version it found pinned in the served artifact");
    assert.match(r.stdout, /freeform_result emitter/, "...and that the emitter survived the compile");
    assert.match(r.stdout, /superseded body\(ies\) still ship for parked runs/, "...and that policy (c) holds in the image");
  },
);

test("p6-1.bundle.gate-is-fail-closed: a MISSING bundle fails the gate, and fails it FOR THAT REASON", () => {
  // The defect this whole section exists to close, pinned directly: point the gate at a tree with
  // no `.output/` and it must EXIT NON-ZERO. A gate that stood down politely here is a gate that
  // certified nothing in either of CI's lanes.
  //
  // THE TEMP TREE IS A REAL GIT REPO, and that is the whole difference between this cell and the
  // vacuous one it replaces. The first version ran the gate in a bare temp dir; the gate's own
  // `git rev-parse --show-toplevel` died there, so it exited non-zero WITHOUT EVER REACHING the
  // missing-bundle branch — the cell was green for the wrong reason and survived a mutant that
  // turned that branch's `exit(1)` into `exit(0)`. Caught by this lane's own RED-before panel
  // (M13), which is what a mutant panel is for. So: `git init` first, then assert BOTH the
  // non-zero exit AND that the message names the artifact, which is what makes the reason part
  // of the claim rather than an inference.
  const empty = mkdtempSync(join(tmpdir(), "p6-1-nobundle-"));
  try {
    execFileSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "init", "-q"], { cwd: empty, stdio: ["ignore", "pipe", "pipe"] });
    const r = spawnSync(process.execPath, [GATE], { cwd: empty, encoding: "utf8" });
    const out = `${r.stdout}${r.stderr}`;
    assert.notEqual(r.status, 0, `the gate must FAIL without a built bundle; it exited ${r.status}:\n${out}`);
    assert.match(out, /no built bundle/i, "and it must fail BECAUSE the bundle is missing — not because something else in the gate happened to throw first");
    assert.match(out, /\.output[/\\]server[/\\]index\.mjs/, "...naming the artifact it looked for");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("p6-1.impl: the segment step is v16's own and binds v16's prompt, parts and stamp", () => {
  assert.equal(typeof impl16.runModelSegmentStepV16, "function");
  assert.equal(impl16.CHAT_STEP_BUDGET, 8, "the step budget is unchanged");
  const code = stripComments(IMPL_SRC);
  assert.match(code, /toTypedParts_v16\(content\)/, "the segment promotes through v16's own map");
  assert.match(code, /chatEngineId\(model\)/);
  assert.ok(!code.includes("toTypedParts_v15"), "and never falls back to v15's, which would silently drop the card");
});
