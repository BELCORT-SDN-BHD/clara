// #623 — THE BUNDLE PIN. The immutability claim for claraWork_v1's invocation envelope.
//
// Three independent legs, and the file exists because none of them alone is enough:
//   1. THE HEX PIN. `CLARA_WORK_BUNDLE_V1_DIGEST` is asserted against a literal written here.
//      Change one character of the instructions, the skill, a tool name or a budget and this
//      cell reds — which is exactly what "immutable bundle" has to mean in a repo where the
//      files are text somebody can edit.
//   2. THE REFERENCE CHECK. The bundle module open-codes SHA-256 because the Workflow DevKit
//      refuses `node:crypto` inside a module reachable from a `"use workflow"` body (measured:
//      `nitro build` fails on the import). An open-coded hash is only safe if something proves
//      it, so this cell recomputes the SAME canonical text with Node's own `createHash` and
//      asserts byte equality.
//   3. THE ROSTER CLOSURE. The tool names in the hashed bundle must be exactly the tools the
//      builder produces — no more (a tool outside the bundle would be an unversioned
//      capability) and no fewer (a bundle naming a tool nobody built is a false manifest).
//
// Reached through the SAME tsx/esm register() idiom tests/registry-view.test.mjs established for
// importing a .ts workflow module directly from a .mjs cell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const { register } = await import("tsx/esm/api");
register();

const bundle = await import("../workflows/claraWork.v1.bundle.ts");
const tools = await import("../workflows/claraWork.v1.tools.ts");
const prompt = await import("../workflows/claraWork.v1.prompt.ts");

/** THE PIN. Regenerate ONLY as a deliberate act, beside a new _vN closure. */
const PINNED_DIGEST = "afb2038addcdf2ec9dca8f1439a00770f6ed893e0732b3576270c9bfdb9877a4";

test("623.bundle: the digest is pinned to a literal", () => {
  assert.equal(
    bundle.CLARA_WORK_BUNDLE_V1_DIGEST,
    PINNED_DIGEST,
    "the clara-work/v1 bundle digest moved — a bundle change ships as claraWork_v2, never as an edit",
  );
});

test("623.bundle: the open-coded sha256 agrees with node:crypto byte for byte", () => {
  const reference = createHash("sha256").update(bundle.CLARA_WORK_BUNDLE_V1_CANONICAL, "utf8").digest("hex");
  assert.equal(bundle.CLARA_WORK_BUNDLE_V1_DIGEST, reference, "the module's own sha256 must equal Node's");
  // A second, independent vector so the agreement above is not an artifact of one input length.
  assert.equal(bundle.sha256Hex(""), createHash("sha256").update("", "utf8").digest("hex"));
  assert.equal(bundle.sha256Hex("abc"), createHash("sha256").update("abc", "utf8").digest("hex"));
  const long = "clara".repeat(1000);
  assert.equal(bundle.sha256Hex(long), createHash("sha256").update(long, "utf8").digest("hex"));
  // Multi-byte UTF-8: the padding maths is over BYTES, not characters.
  const utf8 = "会计工作 — RM 1,200.00";
  assert.equal(bundle.sha256Hex(utf8), createHash("sha256").update(utf8, "utf8").digest("hex"));
});

test("623.bundle: the canonical text is key-sorted and carries the whole envelope", () => {
  const parsed = JSON.parse(bundle.CLARA_WORK_BUNDLE_V1_CANONICAL);
  assert.deepEqual(Object.keys(parsed), ["budgets", "id", "instructions", "skills", "tools"], "canonicalJson key-sorts");
  assert.equal(parsed.id, "clara-work/v1");
  assert.equal(parsed.instructions.id, "clara-work-instructions/v1");
  assert.deepEqual(parsed.skills.map((s) => s.id), ["journal-entry/v1"]);
  assert.equal(parsed.tools.id, "clara-work-tools/v1");
  assert.ok(parsed.instructions.text.length > 200, "the instruction text is inside the hash, not merely named");
  assert.ok(parsed.skills[0].text.length > 200, "the skill text is inside the hash, not merely named");
});

test("623.bundle: every budget is a finite positive integer and is recorded", () => {
  const budgets = bundle.CLARA_WORK_BUDGETS_V1;
  assert.deepEqual(Object.keys(budgets).sort(), ["modelCalls", "replans", "segments", "toolCalls", "transientRetries"]);
  for (const [name, value] of Object.entries(budgets)) {
    assert.equal(typeof value, "number", `${name} is a number`);
    assert.ok(Number.isFinite(value), `${name} is finite`);
    assert.ok(Number.isInteger(value), `${name} is an integer`);
    assert.ok(value > 0, `${name} is positive`);
  }
  // The identity a run stamps onto the Work row carries them — "有限且被记录" is two claims.
  assert.deepEqual(bundle.claraWorkBundleIdentity().budgets, budgets);
  assert.deepEqual(bundle.claraWorkRunManifest("gpt-5.6-terra").budgets, budgets);
});

test("623.bundle: the run manifest is identity + digest + budgets + THIS run's model", () => {
  const manifest = bundle.claraWorkRunManifest("gpt-5.6-terra");
  assert.deepEqual(Object.keys(manifest).sort(), ["budgets", "digest", "id", "instructions", "model", "skills", "tools"]);
  assert.equal(manifest.digest, bundle.CLARA_WORK_BUNDLE_V1_DIGEST);
  assert.equal(manifest.model, "gpt-5.6-terra", "the model is per-RUN and therefore outside the hashed bundle");
  assert.equal(JSON.stringify(manifest).includes("You are Clara"), false, "the manifest carries ids, never the prose");
});

test("623.bundle: the tool roster is closed and matches what the builder actually produces", () => {
  const declared = [...bundle.CLARA_WORK_BUNDLE_V1.tools.names];
  assert.deepEqual(declared, ["list_accounts", "record_journal_entry", "ask_question"]);
  assert.deepEqual(declared, [...prompt.CLARA_WORK_TOOL_NAMES]);

  const built = tools.buildClaraWorkTools(
    {
      firmId: "f",
      clientId: "c",
      createdBy: "u",
      taskId: "t",
      workId: "w",
      logicalOpId: "work:w:journal_entry:1",
      runId: "r",
      basis: { posting_date: "2026-09-01", memo: "m", currency: "MYR", lines: [] },
    },
    tools.newBudgetLedger(),
    bundle.CLARA_WORK_BUDGETS_V1,
  );
  assert.deepEqual(Object.keys(built).sort(), declared.slice().sort(), "the built tool set IS the bundle's roster");
  // `ask_question` is the park and MUST carry no execute — calling it is the act, exactly as
  // chat's `clarify` works. An executable ask_question would answer itself.
  assert.equal(typeof built.ask_question.execute, "undefined");
  assert.equal(typeof built.list_accounts.execute, "function");
  assert.equal(typeof built.record_journal_entry.execute, "function");
});

test("623.bundle: the bundle object is frozen, so a runtime mutation throws", () => {
  assert.equal(Object.isFrozen(bundle.CLARA_WORK_BUNDLE_V1), true);
  assert.equal(Object.isFrozen(bundle.CLARA_WORK_BUDGETS_V1), true);
  assert.throws(() => {
    bundle.CLARA_WORK_BUDGETS_V1.segments = 99;
  }, TypeError);
});

test("623.bundle: the world-start banner names the same digest the manifest does (C88.8)", () => {
  assert.equal(bundle.CLARA_WORK_BUNDLE_V1_BANNER, `[clara-runtime] bundle clara-work/v1 digest=${PINNED_DIGEST}`);
  assert.equal(bundle.claraWorkBundleIdentity().digest, PINNED_DIGEST);
});

test("623.bundle: /api/build-info SERVES that digest — the payload, not just the route source", async () => {
  // The route-shape cell in l9-build-info.test.mjs pins that `src/buildInfoRoutes.ts` passes
  // `bundles: [claraWorkBundleIdentity()]`. This one drives the PAYLOAD builder those names reach,
  // so "one read answers which bundle this image is running" is measured at the surface an
  // operator actually curls rather than inferred from a source match.
  const { buildInfo } = await import("../lib/build-info.mjs");
  const payload = await buildInfo({
    names: ["chatTurn"],
    bundles: [bundle.claraWorkBundleIdentity()],
    withRuntime: async () => ({ rows: [{ frontier: { count: 178, max_version: "0178" } }] }),
  });
  assert.equal(Array.isArray(payload.bundles), true, "the payload carries a bundles array");
  assert.equal(payload.bundles.length, 1);
  assert.equal(payload.bundles[0].id, "clara-work/v1");
  assert.equal(payload.bundles[0].digest, PINNED_DIGEST, "and it is THE digest, not a second copy that could drift");
  assert.deepEqual(payload.bundles[0].budgets, bundle.CLARA_WORK_BUDGETS_V1, "budgets ride; they are part of what an image promises");
  assert.equal("text" in payload.bundles[0], false, "the INSTRUCTION PROSE does not — a build-info payload is a version report, not a prompt dump");
  // Copied, never aliased: a caller must not be able to mutate a frozen module's object through
  // the response (the `workflows: [...names]` precedent in the same builder).
  assert.notEqual(payload.bundles[0], bundle.claraWorkBundleIdentity());
});

test("623.bundle: the fault injection is inert without RELAY_TEST_MODE", () => {
  assert.equal(tools.workTestFault({ CLARA_WORK_TEST_FAULT: "exit_after_commit" }), null, "production combination is inert");
  assert.equal(tools.workTestFault({ RELAY_TEST_MODE: "1" }), null, "no fault named is no fault");
  assert.equal(tools.workTestFault({ RELAY_TEST_MODE: "1", CLARA_WORK_TEST_FAULT: "exit_after_commit" }), "exit_after_commit");
});
