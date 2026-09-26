// claraWork_v7 — #1144, the CLOSING wave's Work successor.
//
// ONE CHANGE, AND IT IS A STEP BODY: `loadFaProposalInputsStepV7` replaces
// `loadFaProposalInputsStepV6`. `claraWork.v6.impl.ts`'s step is deploy-locked on `main`, so the
// consolidated contract in `waveS-lane05-fix.md` § "Successor contract, the proposal input-loading
// step" lands as v7's own step, never as an edit to v6 — which is the rule the sweep wave's own
// report states in those words.
//
// WHAT THIS FILE PROVES, cell by cell:
//
//   1. THE COMPLETENESS PREDICATE IS THE ESTATE'S OWN SIX-CONDITION FORM (SPEC-1093-A). v6's step
//      carries a two-condition form, under which a row with a method and a start date but no
//      useful life reads COMPLETE and the question that would collect the missing drivers is
//      skipped. The expected value is not re-derived here: it is `clara._fa_particulars_complete`'s
//      own body, read live from `pg_proc` on `clara_c04` (337 files / 0361) on 2026-09-26 and
//      transcribed into this cell.
//   2. THE TWO NEW GROUNDS ARE FED, from the lane's own unfrozen module and with the argument
//      orders the contract names: `[clientId, null]` for the client's recorded depreciation note
//      and `[clientId, assetAccount]` for the account's retired policy.
//   3. A NULL ACCOUNT HAS NO POLICY, so the retired-policy read is not even attempted — the
//      contract's own line, and a statement that cannot be scoped must not be run.
//   4. THE RETURN GAINS THE TWO KEYS the deriver already ranks, and v6's OMITTED comment goes with
//      them: `clara.knowledge_keys` DOES catalogue the depreciation key now (0345) and the
//      retired-policy relation IS reachable from this credential (0346).
//   5. THE BUNDLE IDENTITY MOVED: `clara-work/v7`, `clara-work-tools/v7`, a digest that differs
//      from v6's, and a banner the world-start sequence logs — a line whose absence is a silent,
//      misattributed failure of the whole work-lane e2e battery.
//   6. THE ROSTER DID NOT MOVE: v7 adds no tool and widens no schema.
//
// NO DATABASE IS NEEDED HERE. Every cell is over module constants and source text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v6Bundle = await import("../workflows/claraWork.v6.bundle.ts");
const v7Bundle = await import("../workflows/claraWork.v7.bundle.ts");
const v6Prompt = await import("../workflows/claraWork.v6.prompt.ts");
const v7Prompt = await import("../workflows/claraWork.v7.prompt.ts");
const registry = await import("../workflows/registry.ts");

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

const SRC = codeOf(new URL("../workflows/claraWork.v7.impl.ts", import.meta.url));

// ---------------------------------------------------------------------------
// 1 · the completeness predicate — the estate's own, not the shipped narrow one
// ---------------------------------------------------------------------------

test("v7.proposal: `particulars_complete` is the estate's SIX-condition predicate, not v6's two", () => {
  // THE EXPECTED VALUE IS AN INDEPENDENT SOURCE OF TRUTH: `clara._fa_particulars_complete`'s live
  // body, read from `pg_proc` on `clara_c04` (337 files, max `0361_reservation_release_advice`) on
  // 2026-09-26. `loadPendingFixedAssetStepV4` carries the same six conditions.
  for (const clause of [
    "fa.depreciation_start_date is not null",
    "fa.depreciation_method is not null",
    "fa.depreciation_method = 'none'",
    "fa.depreciation_method = 'straight_line'",
    "fa.useful_life_months is not null and fa.residual_cents is not null",
    "fa.depreciation_method = 'reducing_balance'",
    "fa.depreciation_rate_bps is not null",
  ]) {
    assert.ok(SRC.includes(clause), clause);
  }
  // and the NARROW form v6 shipped is gone: under it a row with a method and a start date but no
  // useful life reads COMPLETE, and the question that would collect the drivers is skipped.
  assert.ok(
    !SRC.includes("(fa.depreciation_start_date is not null and fa.depreciation_method is not null)\n"),
    "the two-condition form must not survive into v7",
  );
});

// ---------------------------------------------------------------------------
// 2 · the two grounds the sweep wave built, fed
// ---------------------------------------------------------------------------

test("v7.proposal: both grounds come from the lane's own module, with the contract's argument orders", () => {
  assert.match(SRC, /from "\.\.\/lib\/fa-proposal-grounds\.js"/);
  for (const name of [
    "FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL",
    "mapDepreciationKnowledgeRows",
    "FA_RETIRED_ACCOUNT_POLICY_SQL",
    "mapRetiredAccountPolicyRow",
  ]) {
    assert.ok(SRC.includes(name), name);
  }
  // `$2` is the calendar day the proposal is made for; `null` means today in MYT, computed in the
  // statement. The run carries no as-of, so it passes null rather than inventing one.
  assert.match(SRC, /FA_DEPRECIATION_POLICY_KNOWLEDGE_SQL, \[work\.clientId, null\]/);
  // `$2` is the row's OWN account, which step (a) already selected.
  assert.match(SRC, /FA_RETIRED_ACCOUNT_POLICY_SQL, \[work\.clientId, assetAccount\]/);
  // A NULL ACCOUNT HAS NO POLICY — the read is not even attempted, because a statement that
  // cannot be scoped must not be run.
  assert.match(SRC, /assetAccount === null \? null :/);
  // the SQL is a CONSTANT from that module, never re-spelled here: one home for one statement, and
  // the db battery drives THAT string under a real `clara_agent_ro` credential.
  assert.ok(!/fa_account_depreciation_policies/.test(SRC),
    "the retired-policy statement is the module's constant, not a copy");
  assert.ok(!/knowledge_records/.test(SRC),
    "the knowledge statement is the module's constant, not a copy");
});

test("v7.proposal: the return gains the two keys, and v6's OMITTED comment goes with them", () => {
  assert.match(SRC, /siblings,\s*\n\s*knowledge,\s*\n\s*retiredPolicy,/);
  // v6's step ends its return with an OMITTED comment whose claim this wave makes false: that
  // `clara.knowledge_keys` catalogues no depreciation key and the retired-policy relation is
  // unreachable from this credential. 0345 catalogues it and 0346 reaches it. The comment must not
  // ride into the successor as a claim, so it is asserted absent from the STEP's own body — the
  // place it stood — rather than from the file, where a header may honestly record that it went.
  const step = SRC.slice(SRC.indexOf("export async function loadFaProposalInputsStepV7"));
  assert.ok(step.length > 0);
  assert.ok(!/OMITTED on this frontier/.test(step),
    "a sentence this wave makes false must not ride into the successor's step body");
  // and the v6 file it was copied from still carries it, which is what makes the absence a MOVE
  // rather than a file that never had it
  const v6Src = readFileSync(new URL("../workflows/claraWork.v6.impl.ts", import.meta.url), "utf8");
  assert.match(v6Src, /OMITTED on this frontier/);
});

// ---------------------------------------------------------------------------
// 3 · the identity — the bundle, the banner, the pin, and policy (c)
// ---------------------------------------------------------------------------

test("v7.identity: the bundle ids move and the digest moves with them", () => {
  assert.equal(v7Bundle.CLARA_WORK_BUNDLE_V7.id, "clara-work/v7");
  assert.equal(v7Bundle.CLARA_WORK_BUNDLE_V7.tools.id, "clara-work-tools/v7");
  assert.equal(v7Bundle.CLARA_WORK_BUNDLE_V7.instructions.id, "clara-work-instructions/v7");
  assert.notEqual(v7Bundle.CLARA_WORK_BUNDLE_V7_DIGEST, v6Bundle.CLARA_WORK_BUNDLE_V6_DIGEST,
    "a v7 run stamped with v6's digest is a receipt naming a contract it was not served under");
  assert.equal(
    v7Bundle.CLARA_WORK_BUNDLE_V7_BANNER,
    `[clara-runtime] bundle clara-work/v7 digest=${v7Bundle.CLARA_WORK_BUNDLE_V7_DIGEST}`,
  );
  const identity = v7Bundle.claraWorkBundleIdentityV7();
  assert.equal(identity.id, "clara-work/v7");
  assert.equal(identity.tools, "clara-work-tools/v7");
  assert.equal(identity.digest, v7Bundle.CLARA_WORK_BUNDLE_V7_DIGEST);
  // the manifest carries the per-run model beside the identity
  assert.equal(v7Bundle.claraWorkRunManifestV7("gpt-5.6-terra").model, "gpt-5.6-terra");
});

test("v7.identity: the ROSTER did not move — v7 adds no tool and widens no schema", () => {
  // The honest description of this cut: the model's capabilities and its instructions are v6's;
  // what moved is the step that gathers the proposal's grounds, which is a BODY change the model
  // never sees.
  assert.deepEqual([...v7Prompt.CLARA_WORK_TOOL_NAMES_V7], [...v6Prompt.CLARA_WORK_TOOL_NAMES_V6]);
  assert.equal(v7Prompt.CLARA_WORK_INSTRUCTIONS_V7, v6Prompt.CLARA_WORK_INSTRUCTIONS_V6);
  assert.deepEqual(v7Bundle.CLARA_WORK_BUDGETS_V7, v6Bundle.CLARA_WORK_BUDGETS_V6);
});

test("v7.identity: the registry pins v7 and every superseded body stays rostered", () => {
  assert.equal(registry.workflowPins.claraWork, "claraWork_v7");
  assert.equal(registry.workflows.claraWork, registry.claraWork_v7);
  assert.ok(registry.workflowBodies.includes("claraWork_v7"));
  // POLICY (c): a Work parked on a v1..v6 question hook resumes into the body it left.
  for (let n = 1; n <= 6; n += 1) {
    assert.equal(typeof registry[`claraWork_v${n}`], "function", `policy (c): claraWork_v${n} is still exported`);
    assert.ok(registry.workflowBodies.includes(`claraWork_v${n}`));
  }
});

test("v7.identity: the SEVENTH banner and the build-info roster land with the repoint", () => {
  // THE DEFECT THIS CELL EXISTS FOR, paid for once already at the v21/v5 cut: when v5 was pinned
  // without its banner the engine booted clean on every visible signal — /health 200, /ready 200,
  // `stranded bodies n=0` — and SIX work-lane e2es failed reporting "serve child did not become
  // ready", because `tests/pinned-work-bundle.mjs`'s `waitBooted` blocks on exactly that line and
  // its throw is swallowed by the caller's retry loop.
  const startWorld = readFileSync(new URL("../plugins/startWorld.ts", import.meta.url), "utf8");
  assert.match(startWorld, /import \{ CLARA_WORK_BUNDLE_V7_BANNER \} from "\.\.\/workflows\/claraWork\.v7\.bundle\.js";/);
  assert.match(startWorld, /console\.log\(CLARA_WORK_BUNDLE_V7_BANNER\);/);
  // every predecessor's banner stays: a rollback preflight reads these lines to know which bodies
  // this process actually carries.
  for (let n = 1; n <= 6; n += 1) {
    assert.match(startWorld, new RegExp(`console\\.log\\(CLARA_WORK_BUNDLE_V${n}_BANNER\\);`), `v${n} banner`);
  }
  const buildInfo = readFileSync(new URL("../src/buildInfoRoutes.ts", import.meta.url), "utf8");
  assert.match(buildInfo, /claraWorkBundleIdentityV7\(\)/);
  // NEWEST FIRST, and every retained body
  assert.match(buildInfo, /claraWorkBundleIdentityV7\(\), claraWorkBundleIdentityV6\(\)/);
});
