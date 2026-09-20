// #1018 — the shared loopback-host + allowed-database-name gate every standalone runtime World
// e2e driver used to hand-roll for itself. Before this module existed, 23 files each carried
// their own copy of this safety check; some admitted the wave's per-lane `clara_l<NN>` databases
// and most did not, and nothing stopped a file's OWN two copies (a PGDATABASE regex and a second,
// independently-typed WORKFLOW_POSTGRES_URL regex encoding the same list) from drifting apart.
// This file proves the shared building blocks in isolation, at the seam the drivers now call:
// `allowedDbPattern`, `assertLocalDbGate`, and the named `DB_NAME_SHAPE` constants they compose.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate, isLoopbackHost } from "./local-db-gate.mjs";

test("1018: isLoopbackHost admits exactly 127.0.0.1 and localhost, nothing else", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(isLoopbackHost("example.com"), false);
  assert.equal(isLoopbackHost(undefined), false);
});

test("1018: allowedDbPattern admits exactly the named shapes it was given, anchored", () => {
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}`);
  assert.equal(pattern.dbRegex.test("clara_rt_test"), true);
  assert.equal(pattern.dbRegex.test("clara_wave_b_ci"), true);
  assert.equal(pattern.dbRegex.test("clara_l10"), false, "a shape not composed in must be refused");
  assert.equal(pattern.dbRegex.test("clara_rt_testXtra"), false, "the pattern is anchored, not a prefix match");
  assert.equal(pattern.dbRegex.test("not_clara_rt_test"), false, "the pattern is anchored, not a substring match");
});

test("1018: allowedDbPattern's optional outer suffix applies AFTER whichever shape matched", () => {
  // intake-batch-e2e's own historical shape: `clara_(rt_test|intake_ci|\d{3})(_world)?` — the
  // `_world` suffix is not tied to any one alternative, unlike trade-invoice-e2e's
  // `\d{3}(_world)?`, which only ever admits it on the numeric ticket id.
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.PER_TICKET}`, { outerOptionalSuffix: "_world" });
  assert.equal(pattern.dbRegex.test("clara_rt_test_world"), true);
  assert.equal(pattern.dbRegex.test("clara_123_world"), true);
  assert.equal(pattern.dbRegex.test("clara_rt_test"), true, "the suffix is optional");
  assert.equal(pattern.dbRegex.test("clara_1234_world"), false, "PER_TICKET is exactly three digits");
});

test("1018: assertLocalDbGate throws naming the label when the host is not loopback", () => {
  const pattern = allowedDbPattern(DB_NAME_SHAPE.RT_TEST);
  assert.throws(
    () => assertLocalDbGate({ label: "some-e2e", pattern, env: { PGHOST: "prod.example.com", PGDATABASE: "clara_rt_test" } }),
    /some-e2e is hard-gated to a loopback host/,
  );
});

test("1018: assertLocalDbGate throws naming the label when PGDATABASE is not an admitted shape", () => {
  const pattern = allowedDbPattern(DB_NAME_SHAPE.RT_TEST);
  assert.throws(
    () => assertLocalDbGate({ label: "some-e2e", pattern, env: { PGHOST: "127.0.0.1", PGDATABASE: "clara_prod" } }),
    /some-e2e is hard-gated to a loopback host/,
  );
});

test("1018: assertLocalDbGate passes on a loopback host + admitted database, with no DSN checks requested", () => {
  const pattern = allowedDbPattern(DB_NAME_SHAPE.RT_TEST);
  assert.doesNotThrow(() =>
    assertLocalDbGate({ label: "some-e2e", pattern, env: { PGHOST: "localhost", PGDATABASE: "clara_rt_test" } }));
});

test("1018: checkDsnString requires WORKFLOW_POSTGRES_URL to match the SAME composed shapes", () => {
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.INTAKE_CI}`);
  const okEnv = {
    PGHOST: "127.0.0.1", PGDATABASE: "clara_intake_ci",
    WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:5544/clara_intake_ci",
  };
  assert.doesNotThrow(() => assertLocalDbGate({ label: "intake-e2e", pattern, checkDsnString: true, env: okEnv }));

  const wrongDsnEnv = { ...okEnv, WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:5544/clara_wave_b_ci" };
  assert.throws(
    () => assertLocalDbGate({ label: "intake-e2e", pattern, checkDsnString: true, env: wrongDsnEnv }),
    /intake-e2e needs WORKFLOW_POSTGRES_URL/,
  );

  const missingDsnEnv = { PGHOST: okEnv.PGHOST, PGDATABASE: okEnv.PGDATABASE };
  assert.throws(
    () => assertLocalDbGate({ label: "intake-e2e", pattern, checkDsnString: true, env: missingDsnEnv }),
    /intake-e2e needs WORKFLOW_POSTGRES_URL/,
  );
});

test("1018: checkDsnParsed requires every WORKFLOW_POSTGRES_URL field to equal the PG* env exactly", () => {
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}`);
  const okEnv = {
    PGHOST: "127.0.0.1", PGPORT: "55705", PGDATABASE: "clara_wave_b_ci",
    WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:55705/clara_wave_b_ci",
  };
  assert.doesNotThrow(() => assertLocalDbGate({ label: "trade-invoice-e2e", pattern, checkDsnParsed: true, env: okEnv }));

  // Both individually "allowed" shapes, but the DSN's own database disagrees with PGDATABASE —
  // exactly the case the string-only check in checkDsnString would have let through, and the
  // reason the parsed-equality style exists at all.
  const disagreeingEnv = { ...okEnv, WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:55705/clara_rt_test" };
  assert.throws(
    () => assertLocalDbGate({ label: "trade-invoice-e2e", pattern, checkDsnParsed: true, env: disagreeingEnv }),
    /trade-invoice-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate/,
  );

  const wrongPortEnv = { ...okEnv, WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:9999/clara_wave_b_ci" };
  assert.throws(
    () => assertLocalDbGate({ label: "trade-invoice-e2e", pattern, checkDsnParsed: true, env: wrongPortEnv }),
    /trade-invoice-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate/,
  );

  const queryEnv = { ...okEnv, WORKFLOW_POSTGRES_URL: okEnv.WORKFLOW_POSTGRES_URL + "?sslmode=disable" };
  assert.throws(
    () => assertLocalDbGate({ label: "trade-invoice-e2e", pattern, checkDsnParsed: true, env: queryEnv }),
    /trade-invoice-e2e: WORKFLOW_POSTGRES_URL failed the parsed DSN gate/,
    "an unexpected query string is not silently ignored",
  );

  const missingEnv = { PGHOST: okEnv.PGHOST, PGPORT: okEnv.PGPORT, PGDATABASE: okEnv.PGDATABASE };
  assert.throws(
    () => assertLocalDbGate({ label: "trade-invoice-e2e", pattern, checkDsnParsed: true, env: missingEnv }),
    /trade-invoice-e2e needs WORKFLOW_POSTGRES_URL/,
  );
});

test("1018: both DSN checks together (group 2's shape) both have to pass", () => {
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.WAVE_B_CI}|${DB_NAME_SHAPE.PER_LANE}`);
  const okEnv = {
    PGHOST: "127.0.0.1", PGPORT: "55750", PGDATABASE: "clara_l10",
    WORKFLOW_POSTGRES_URL: "postgres://postgres@127.0.0.1:55750/clara_l10",
  };
  assert.doesNotThrow(() =>
    assertLocalDbGate({ label: "work-journal-e2e", pattern, checkDsnString: true, checkDsnParsed: true, env: okEnv }));

  const badLaneEnv = { ...okEnv, PGDATABASE: "clara_l999" };
  assert.throws(
    () => assertLocalDbGate({ label: "work-journal-e2e", pattern, checkDsnString: true, checkDsnParsed: true, env: badLaneEnv }),
    /work-journal-e2e is hard-gated/,
    "PER_LANE is exactly two digits",
  );
});

// A driver's own real, historical composition (transcribed from the file BEFORE #1018, not
// recomputed from the shared module) — proves at least one real driver's admitted set is
// unchanged after the refactor, not merely that the generic builder behaves as designed above.
test("1018: intake-e2e's historical set (clara_rt_test, clara_intake_ci — nothing else) is unchanged", () => {
  const pattern = allowedDbPattern(`${DB_NAME_SHAPE.RT_TEST}|${DB_NAME_SHAPE.INTAKE_CI}`);
  for (const name of ["clara_rt_test", "clara_intake_ci"]) {
    assert.equal(pattern.dbRegex.test(name), true, `${name} must stay admitted`);
  }
  for (const name of ["clara_wave_b_ci", "clara_l10", "clara_123", "clara_intake_ci_world"]) {
    assert.equal(pattern.dbRegex.test(name), false, `${name} must stay refused — intake-e2e never admitted it`);
  }
});
