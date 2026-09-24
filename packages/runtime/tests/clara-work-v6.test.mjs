// claraWork_v6 — THE CUT PHASE'S WORK SUCCESSOR (#1030), at the seams the cut owns.
//
// WHAT THIS FILE IS FOR, and what it deliberately is not. The three doors #1030 adds are proved
// against a real database in `packages/db/tests/work-source-correction-rederivation.test.mjs`; the
// belt that drives them is proved at its own seam in `tests/reconcile-source-correction-unit.test.mjs`;
// the derivation is proved in `tests/source-correction-rederive.test.mjs`. THIS file proves the
// VERSION CUT: that v6 exists, that it carries its own identity everywhere the estate reads one,
// that the one behaviour it adds is the confirmation a successor owes, and that the sixth banner
// the last cut forgot is there.
//
// Pure: no database, no world, no model.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { register } = await import("tsx/esm/api");
register();

const v5Bundle = await import("../workflows/claraWork.v5.bundle.ts");
const v6Bundle = await import("../workflows/claraWork.v6.bundle.ts");
const v6Prompt = await import("../workflows/claraWork.v6.prompt.ts");
const v5Prompt = await import("../workflows/claraWork.v5.prompt.ts");
const v6Impl = await import("../workflows/claraWork.v6.impl.ts");
const registry = await import("../workflows/registry.ts");

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

test("v6.bundle: the ids are this cut's own, and the digest is the hash of the canonical text", () => {
  assert.equal(v6Bundle.CLARA_WORK_BUNDLE_V6.id, "clara-work/v6");
  assert.equal(v6Bundle.CLARA_WORK_BUNDLE_V6.instructions.id, "clara-work-instructions/v6");
  assert.equal(v6Bundle.CLARA_WORK_BUNDLE_V6.skills[0].id, "journal-entry/v6");
  assert.equal(v6Bundle.CLARA_WORK_BUNDLE_V6.tools.id, "clara-work-tools/v6");

  const expected = createHash("sha256").update(v6Bundle.CLARA_WORK_BUNDLE_V6_CANONICAL).digest("hex");
  assert.equal(v6Bundle.CLARA_WORK_BUNDLE_V6_DIGEST, expected,
    "the digest is Node's own sha256 of the exact canonical string, not a re-derivation");
  assert.match(v6Bundle.CLARA_WORK_BUNDLE_V6_DIGEST, /^[0-9a-f]{64}$/);
  assert.notEqual(v6Bundle.CLARA_WORK_BUNDLE_V6_DIGEST, v5Bundle.CLARA_WORK_BUNDLE_V5_DIGEST,
    "a version whose digest equalled its predecessor's would be a cut nothing downstream could see");
});

test("v6.bundle: the ROSTER does not move, and saying so is the honest description of this cut", () => {
  const v5 = v5Bundle.CLARA_WORK_BUNDLE_V5.tools;
  const v6 = v6Bundle.CLARA_WORK_BUNDLE_V6.tools;
  assert.deepEqual([...v6.names], [...v5.names], "same seven tools");
  assert.deepEqual(v6.schemas, v5.schemas, "…the same input schemas, to the byte of their JSON");
  assert.deepEqual(v6.dependencies, v5.dependencies, "…and the same declared doors");
  assert.deepEqual(v6Bundle.CLARA_WORK_BUDGETS_V6, v5Bundle.CLARA_WORK_BUDGETS_V5,
    "and the budgets do not move: the confirmation parks BEFORE the loop and spends nothing");
  // WHAT DID MOVE. Exactly one thing, and it is the reason the digest is different.
  assert.notEqual(
    v6Bundle.CLARA_WORK_BUNDLE_V6.instructions.text,
    v5Bundle.CLARA_WORK_BUNDLE_V5.instructions.text,
  );
  assert.ok(
    v6Bundle.CLARA_WORK_BUNDLE_V6.instructions.text.startsWith(v5Prompt.CLARA_WORK_INSTRUCTIONS_V5),
    "v6's instructions are v5's text, composed rather than retyped, so they cannot silently drift",
  );
  assert.ok(
    v6Bundle.CLARA_WORK_BUNDLE_V6.instructions.text.includes(v6Prompt.SOURCE_CORRECTION_SUCCESSOR_STANZA),
    "…plus the one stanza this cut adds",
  );
});

test("v6.bundle: the stanza tells the model the confirmation already happened, and forbids re-deriving", () => {
  const stanza = v6Prompt.SOURCE_CORRECTION_SUCCESSOR_STANZA;
  assert.match(stanza, /CONFIRMED this basis/,
    "the model is told the authority this basis carries");
  assert.match(stanza, /do not re-derive a figure/,
    "…and that re-deriving is not its job");
  assert.match(stanza, /never post the earlier figure/,
    "…and the one figure it must never post");
  // IT ADDS NO CAPABILITY. A stanza that named a tool would be a roster change in prose.
  for (const name of v6Bundle.CLARA_WORK_BUNDLE_V6.tools.names) {
    if (stanza.includes(name)) assert.fail(`the stanza names the tool ${name} — it adds no capability`);
  }
});

test("v6.question: the confirmation names BOTH figures, asks for a decision, and never for an amount", () => {
  const asked = v6Impl.sourceCorrectionQuestionV6({
    op_key: "source_corrected:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222",
    revision_id: "11111111-1111-4111-8111-111111111111",
    document_id: "88888888-8888-4888-8888-888888888888",
    field_path: "invoice.total",
    retired_work_id: "77777777-7777-4777-8777-777777777777",
    // The two readings, as the database hands them back: `cents` is a bigint and arrives a STRING.
    retired_reading: { text: "RM 640.00", cents: "64000" },
    corrected_reading: { text: "RM 999.00", cents: "99900" },
    retired_basis: null,
  });

  // BOTH figures, rendered — the expected strings are written as literals from the fixture, not
  // re-derived the way the code renders them.
  assert.equal(asked.question, "The document now says 999.00 where it said 640.00. Record the corrected figures?");
  assert.match(asked.context, /was 640\.00, now 999\.00/);
  assert.match(asked.reason, /Nothing has been posted and nothing will be until you answer\./);
  assert.deepEqual(asked.sourceRef, { kind: "document", document_id: "88888888-8888-4888-8888-888888888888" });

  // ONE FIELD, AND IT IS A CHOICE. A `money` or `text` field here would be a figure a person typed
  // into a model's question — the thing #939 and #940 rule out by name.
  assert.equal(asked.fields.length, 1);
  assert.equal(asked.fields[0].key, "confirm");
  assert.equal(asked.fields[0].kind, "choice");
  assert.equal(asked.fields[0].required, true);
  assert.deepEqual(asked.fields[0].options.map((o) => o.value), ["record", "stop"]);
  for (const f of asked.fields) {
    assert.notEqual(f.kind, "money", "no field takes an amount");
  }
});

test("v6.question: a confirmation is a POSITIVE act — anything else is a stop", () => {
  assert.equal(v6Impl.sourceCorrectionConfirmedV6({ confirm: "record" }), true);
  for (const answer of [
    { confirm: "stop" }, { confirm: "" }, { confirm: null }, {}, null, undefined, "record", 1,
    { confirmed: true }, { confirm: "RECORD" },
  ]) {
    assert.equal(v6Impl.sourceCorrectionConfirmedV6(answer), false,
      `${JSON.stringify(answer)} is not a confirmation`);
  }
});

test("v6.registry: the five edits, and every superseded body still exported and rostered", () => {
  assert.equal(registry.workflowPins.claraWork, "claraWork_v6", "the pin moved");
  assert.equal(typeof registry.claraWork_v6, "function", "…the body is exported");
  assert.ok(registry.workflowBodies.includes("claraWork_v6"), "…and rostered");
  // POLICY (c): a superseded body stays imported, exported and rostered, or a parked run is
  // stranded and the World refuses to start database-wide.
  for (const n of ["claraWork_v1", "claraWork_v2", "claraWork_v3", "claraWork_v4", "claraWork_v5"]) {
    assert.equal(typeof registry[n], "function", `${n} is still exported`);
    assert.ok(registry.workflowBodies.includes(n), `${n} is still rostered`);
  }
  // …and the dispatch table routes the CLASS to the pinned body, which is what actually takes
  // traffic. `registryModule[pin] === workflows[class]` is registry-view's own cell; this one is
  // the narrower statement that the pin and the dispatch agree for THIS class.
  assert.equal(registry.workflows.claraWork, registry.claraWork_v6);
});

test("v6.boot: the SIXTH banner is imported and logged — the defect the last cut shipped", () => {
  // THE CELL THE v21/v5 CUT DID NOT HAVE. A missing banner boots an engine that looks healthy on
  // every visible signal and fails the whole work-lane e2e battery with a message about HTTP
  // readiness that is simply false, because `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks
  // on exactly this line and its throw is swallowed by the caller's retry loop.
  const boot = src("../plugins/startWorld.ts");
  assert.match(boot, /import \{ CLARA_WORK_BUNDLE_V6_BANNER \} from "\.\.\/workflows\/claraWork\.v6\.bundle\.js"/);
  assert.match(boot, /console\.log\(CLARA_WORK_BUNDLE_V6_BANNER\)/);
  // …and the banner itself is the shape `waitBooted` matches: the pinned bundle id, then the digest.
  assert.equal(
    v6Bundle.CLARA_WORK_BUNDLE_V6_BANNER,
    `[clara-runtime] bundle clara-work/v6 digest=${v6Bundle.CLARA_WORK_BUNDLE_V6_DIGEST}`,
  );
  // EVERY carried version still logs its own line: an operator reads these to know which bodies
  // this process has, and a rollback preflight enumerates them.
  for (const n of [2, 3, 4, 5, 6]) {
    assert.ok(boot.includes(`console.log(CLARA_WORK_BUNDLE_V${n}_BANNER)`), `v${n}'s banner is logged`);
  }
});

test("v6.body: the confirmation parks BEFORE the knowledge read and before any segment", () => {
  // A STRUCTURAL CELL, and the repo's own standard asks for one here: the SAFETY property is an
  // ORDER ("nothing may post until that question is answered"), and the only way to drive it end
  // to end is a World. What can be measured here is that there is no path from the claim to the
  // segment loop that does not pass through the park — which is what the order of these four
  // anchors in one function body says.
  const body = src("../workflows/claraWork.v6.ts");
  const at = (needle) => {
    const i = body.indexOf(needle);
    assert.ok(i > 0, `claraWork.v6.ts contains ${needle}`);
    return i;
  };
  const claim = at("const claim = await claimWorkRunStepV6(taskId)");
  const probe = at("const correction = await loadSourceCorrectionBriefStepV6(work.workId)");
  const park = at("const confirmation = await hook;");
  const knowledge = at("knowledge = await loadWorkKnowledgeStepV6(");
  const loop = at("for (; segment < budgets.segments; segment++)");
  assert.ok(claim < probe, "the probe runs after the claim");
  assert.ok(probe < park, "…the park after the probe");
  assert.ok(park < knowledge, "…the knowledge read after the park: a Work a person may stop is not"
    + " worth reading a client's governed knowledge for");
  assert.ok(knowledge < loop, "…and the segment loop last of all");
  // AND A FAILED PROBE IS TERMINAL, not "not a successor".
  assert.match(body, /if \(!correction\.ok\) \{\s*\n\s*await settle\("failed", "internal", sourceCorrectionProbeFailedPayload\(correction\.reason\), null\);/);
});
