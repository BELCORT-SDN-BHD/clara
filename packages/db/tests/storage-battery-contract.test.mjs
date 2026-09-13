// #620 AC4 — THE BATTERY'S OWN CONTRACT, measured WITHOUT a Supabase stack.
//
// WHY THIS FILE EXISTS AT ALL. packages/db/storage-battery/run.mjs is the only thing in this
// repository that touches the Storage HTTP API, and it needs Docker plus a multi-container vendor
// stack to say anything. On a box without them the battery's entire contribution to the evidence
// record is the sentence "it did not run" — including the two parts of it that are ordinary,
// deterministic code and need no stack at all:
//
//   1. verdicts.mjs — WHAT COUNTS AS A DENIAL. Supabase answers a policy refusal as outer HTTP
//      400 with the real status wrapped in the body, and answers a duplicate, a missing object
//      and a server fault the same outer way. Every denial cell in the battery rests on this
//      vocabulary telling those apart. Fed fabricated responses it is fully testable here.
//   2. stack.mjs — WHICH STACK THE BATTERY MEASURES, or the named reason it measures none. A
//      battery that silently pointed at a half-configured target, or that skipped green because
//      an env var was misspelt, would be worse than no battery: both read as "PASS" from the
//      outside.
//
// So this file pins the decision layer locally and the provider stack proves the wire. Neither
// substitutes for the other, and the README and the #620 report label them separately.
//
// NO DATABASE, NO DOCKER, NO NETWORK: every cell below is a pure function call. This file must
// therefore never skip — a skip here would mean the module failed to import.

import { test } from "node:test";
import assert from "node:assert/strict";

import { innerStatus, effectiveStatus, deniedWith, absent, refusal, wikiWireStatus }
  from "../storage-battery/verdicts.mjs";
import { resolveStackPlan, ADOPTED_ENV_KEYS } from "../storage-battery/stack.mjs";

// =============================================================================================
// V — THE VERDICT VOCABULARY. Fabricated responses, so the distinctions are measured rather than
// read out of the vendor's docs. The bodies are the vendor's real shapes (README.md cites them).
// =============================================================================================
const wrapped = (status, statusCode) =>
  ({ ok: false, status, body: JSON.stringify({ statusCode: String(statusCode), error: "x", message: "y" }) });

test("V1 — a policy denial (outer 400, wrapped 403) is a denial; a DUPLICATE (wrapped 409) is not", () => {
  const denial = wrapped(400, 403);
  const duplicate = wrapped(400, 409);
  assert.equal(innerStatus(denial), 403);
  assert.equal(innerStatus(duplicate), 409);
  assert.equal(deniedWith(denial, [403]), true);
  // THE WHOLE POINT: both are `!res.ok` with the SAME outer status. A boolean assertion would
  // have called the write that landed a denial.
  assert.equal(deniedWith(duplicate, [403]), false, "a wrapped 409 is the write landing, never the policy refusing");
  assert.equal(denial.status, duplicate.status);
});

test("V2 — an UNWRAPPED failure is judged on its own status, so an outage can never pass for a denial", () => {
  const outage = { ok: false, status: 500, body: "<html>upstream</html>" };
  assert.equal(innerStatus(outage), null, "no wrapped status to read");
  assert.equal(effectiveStatus(outage), 500);
  assert.equal(deniedWith(outage, [403]), false);
  assert.equal(deniedWith(outage, [403, 404]), false);
  // A fabricated outer 403 with no wrapper IS a denial — the vendor uses that shape too, and the
  // rule is "judge on the wrapper when there is one, on the status otherwise".
  assert.equal(deniedWith({ ok: false, status: 403, body: "" }, [403]), true);
});

test("V3 — an `ok` response is never a denial, whatever its body says", () => {
  assert.equal(deniedWith({ ok: true, status: 200, body: JSON.stringify({ statusCode: "403" }) }, [403]), false);
  assert.equal(absent({ ok: true, status: 200, body: "" }), false);
});

test("V4 — absence is 404 from a privileged probe; a 403 leaves absence UNMEASURED", () => {
  assert.equal(absent(wrapped(400, 404)), true);
  assert.equal(absent(wrapped(400, 403)), false, "a refused probe proves nothing about whether the object exists");
  assert.equal(absent({ ok: false, status: 404, body: "" }), true);
});

test("V5 — refusal() prints outer and wrapped status, so a log line is checkable", () => {
  assert.equal(refusal(wrapped(400, 403)), "HTTP 400/403");
  assert.equal(refusal({ ok: false, status: 500, body: "" }), "HTTP 500");
});

test("V6 — wikiWireStatus separates a PRE-REQUEST key refusal from one Storage actually answered", () => {
  assert.equal(wikiWireStatus("wiki storage upload failed (403)"), 403);
  // safeWikiKey throws the same error class BEFORE any fetch; that message carries no status, and
  // the B12 cell must not count it as a boundary Storage was ever asked about.
  assert.equal(wikiWireStatus("unsafe wiki storage key"), null);
  assert.equal(wikiWireStatus(undefined), null);
});

// =============================================================================================
// S — WHICH STACK. The four env keys the work order names, the CLI/Docker fallback, and the two
// ways to have no stack: a NAMED skip and a HARD abort.
// =============================================================================================
const adopted = {
  CLARA_STORAGE_BATTERY_DB_URL: "postgres://postgres:pw@127.0.0.1:54322/postgres",
  CLARA_STORAGE_BATTERY_API_URL: "http://127.0.0.1:54321",
  CLARA_STORAGE_BATTERY_JWT_SECRET: "super-secret-jwt-token-with-at-least-32-characters",
};
const cliUp = () => ({ cli: true, docker: true });
const cliDown = () => ({ cli: false, docker: false });

test("S1 — the three named env vars adopt an EXISTING stack: no CLI, no Docker, nothing to dispose", () => {
  const plan = resolveStackPlan({ env: adopted, probe: cliDown });
  assert.equal(plan.mode, "adopted");
  assert.equal(plan.stack.apiUrl, "http://127.0.0.1:54321");
  assert.equal(plan.stack.dbUrl, adopted.CLARA_STORAGE_BATTERY_DB_URL);
  assert.equal(plan.stack.jwtSecret, adopted.CLARA_STORAGE_BATTERY_JWT_SECRET);
  assert.equal(plan.stack.anonKey, null, "the anon key is optional — mintable from the secret");
  assert.equal(plan.disposes, false, "a stack this run did not boot is never stopped by this run");
  assert.match(plan.why, /CLARA_STORAGE_BATTERY_/);
});

test("S1.2 — CLARA_STORAGE_BATTERY_ANON_KEY is carried through when the stack publishes one", () => {
  const plan = resolveStackPlan({
    env: { ...adopted, CLARA_STORAGE_BATTERY_ANON_KEY: "sb_publishable_xyz" },
    probe: cliDown,
  });
  assert.equal(plan.mode, "adopted");
  assert.equal(plan.stack.anonKey, "sb_publishable_xyz");
});

test("S2 — a PARTLY configured target is an ABORT, never a silent fallback to booting one", () => {
  for (const missing of ADOPTED_ENV_KEYS) {
    const env = { ...adopted };
    delete env[missing];
    const plan = resolveStackPlan({ env, probe: cliUp });
    assert.equal(plan.mode, "abort",
      `${missing} absent while the others are set must abort, got ${plan.mode}`);
    assert.match(plan.reason, new RegExp(missing),
      "the abort must NAME the variable that is missing");
  }
  // …and the same partial env must not be rescued by the skip switch: a misspelt variable is a
  // configuration error, and a battery that skipped green on one would hide it forever.
  const env = { ...adopted, CLARA_STORAGE_BATTERY_ALLOW_SKIP: "1" };
  delete env.CLARA_STORAGE_BATTERY_API_URL;
  assert.equal(resolveStackPlan({ env, probe: cliDown }).mode, "abort");
});

test("S3 — with no env target and a usable CLI + Docker, the battery BOOTS its own disposable stack", () => {
  const plan = resolveStackPlan({ env: {}, probe: cliUp });
  assert.equal(plan.mode, "boot");
  assert.equal(plan.disposes, true, "a stack this run booted is always disposed by this run");
});

test("S4 — no env target and no Docker: a NAMED skip only when the caller asked for one", () => {
  const bare = resolveStackPlan({ env: {}, probe: cliDown });
  assert.equal(bare.mode, "abort",
    "CI never sets the skip switch, so a runner that lost Docker must go RED, not green");
  assert.match(bare.reason, /docker/i);

  const opted = resolveStackPlan({ env: { CLARA_STORAGE_BATTERY_ALLOW_SKIP: "1" }, probe: cliDown });
  assert.equal(opted.mode, "skip");
  assert.match(opted.reason, /docker/i, "the skip reason must NAME what is missing");
  assert.match(opted.reason, /CLARA_STORAGE_BATTERY_DB_URL/,
    "…and say what would let it run instead");
});

test("S5 — Docker present but the CLI unusable is its own named answer, not 'no docker'", () => {
  const plan = resolveStackPlan({
    env: { CLARA_STORAGE_BATTERY_ALLOW_SKIP: "1" },
    probe: () => ({ cli: false, docker: true }),
  });
  assert.equal(plan.mode, "skip");
  assert.match(plan.reason, /supabase/i);
  assert.doesNotMatch(plan.reason, /docker daemon is unavailable/i);
});
