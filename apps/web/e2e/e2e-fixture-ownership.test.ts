// THE E2E MOCK OWNERSHIP RULE, MADE MECHANICAL (#519 fold, notes N4 and N5).
//
// `serve-built.mjs` is ONE server for every walk in the suite. A lane that answers a SHARED
// endpoint does not add its own fixture — it REPLACES everyone else's, and the walk that loses
// is whichever one reads a list instead of navigating by id, so the failure surfaces as someone
// else's cell going red for a reason nowhere in their diff.
//
// THIS LANE BROKE THAT RULE THREE TIMES, which is why the rule now has a cell instead of a
// paragraph:
//   1. it claimed `/api/chat/sessions` outright — #507's walk lost its own thread;
//   2. it claimed the UNFILTERED `/rest/v1/clients` register — #507's navigation cell could not
//      find the link it clicks;
//   3. its firm-altitude SESSION ROW carried the shared subject — and this one is the sharpest,
//      because it is a FIXTURE, not a handler. `selectOwnSession` takes the first row matching
//      `created_by === callerSubject && client_id === null`. Before this PR the shared list held
//      ZERO such rows; with the shared subject it held exactly one, so EVERY walk opening the
//      rail at firm altitude resolved this lane's thread.
//
// A prose rule caught none of them. These cells do, and they read the fixtures themselves rather
// than trusting a comment above them.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { P6_5_SESSIONS } from "./agentic-finish-mock.mjs";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const SERVE_BUILT = join(E2E_DIR, "serve-built.mjs");
const LANE_MOCK = join(E2E_DIR, "agentic-finish-mock.mjs");

/** The subject every walk signs in as, read from `serve-built.mjs` rather than re-typed here —
 *  a re-typed constant is a second copy that drifts, and this cell exists because of drift. */
function sharedSubject(): string {
  const match = /const SUBJECT = "([0-9a-f-]+)"/.exec(readFileSync(SERVE_BUILT, "utf8"));
  assert.ok(match, "serve-built.mjs must declare the shared SUBJECT this census reads");
  return match[1]!;
}

test("N4 · no lane fixture may claim the FIRM ALTITUDE for the shared subject", () => {
  const subject = sharedSubject();
  console.log(`  shared SUBJECT = ${subject}`);
  for (const row of P6_5_SESSIONS) {
    console.log(`  ${row.id} client_id=${row.client_id ?? "null"} created_by=${row.created_by}`);
  }

  // THE ASSERTION IS BY SUBJECT, not "two ids differ". `selectOwnSession` resolves on
  // (created_by === callerSubject && client_id === null), so the only thing that matters is
  // whether a firm-altitude row carries THE SHARED SUBJECT — a fixture could use two distinct
  // ids and still hand this lane's thread to every walk if the wrong one were the shared one.
  const claimed = P6_5_SESSIONS.filter((r) => r.client_id === null && r.created_by === subject);
  assert.deepEqual(
    claimed.map((r) => `${r.id} (${r.title})`),
    [],
    "a firm-altitude row with the shared subject is resolved by EVERY walk's rail, not just this lane's",
  );

  // The counter-half: this lane's client rows SHOULD carry the shared subject, or its own walk
  // resolves nothing. Without this, deleting every row would satisfy the assertion above.
  const own = P6_5_SESSIONS.filter((r) => r.client_id !== null && r.created_by === subject);
  assert.equal(own.length, 2, "the lane's two CLIENT threads are still the caller's own");
});

/** Every `path === "/rest/v1/..."` or `path === "/api/..."` handler in the lane's mock, with
 *  whether its block contains a `return false` — the fall-through that makes it scoped. */
function handlerCensus(): { path: string; scoped: boolean }[] {
  const source = readFileSync(LANE_MOCK, "utf8");
  const lines = source.split("\n");
  const out: { path: string; scoped: boolean }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opened = /path === "(\/(?:rest|api)\/[^"]+)"/.exec(lines[i]!);
    if (!opened) continue;
    // The block runs to the next handler opener, or to the end of the function.
    let scoped = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/path === "(\/(?:rest|api)\/[^"]+)"/.test(lines[j]!)) break;
      // `return false;` ANYWHERE on the line, not only at its start: the scoping guard is
      // usually written as a one-line `if (…) return false;`. The first cut anchored at the
      // line start and reported thirteen scoped handlers as UNSCOPED — an instrument that
      // over-reports is still a broken instrument, and the positive control below is what
      // caught it.
      if (/\breturn false;/.test(lines[j]!)) { scoped = true; break; }
      if (/^\}/.test(lines[j]!)) break;
    }
    out.push({ path: opened[1]!, scoped });
  }
  return out;
}

/**
 * The TWO handlers that cannot be scoped, each with the reason recorded in source beside it.
 *
 * An allowlist is only honest when it is short, named and argued. Both of these are RPCs whose
 * request carries no SUBJECT: `list_coa_templates()` takes no arguments at all, and
 * `begin_client_onboarding` takes a free-text name rather than an id — keying on this lane's own
 * string would be scoping by a label, which is the "spelling is not identity" mistake applied to
 * a fixture. Both are measured to have no other caller in `apps/web/e2e`.
 */
const UNSCOPEABLE = new Set(["/rest/v1/rpc/list_coa_templates", "/rest/v1/rpc/begin_client_onboarding"]);

test("N5 · every lane handler either scopes by the request's own subject, or is a NAMED exception", () => {
  const census = handlerCensus();
  assert.ok(census.length >= 10, `the census found ${census.length} handlers — too few to be reading the file`);

  for (const row of census) {
    console.log(`  ${row.scoped ? "scoped  " : "UNSCOPED"} ${row.path}`);
  }

  const unscoped = census.filter((r) => !r.scoped).map((r) => r.path);
  const undeclared = unscoped.filter((p) => !UNSCOPEABLE.has(p));
  assert.deepEqual(
    undeclared,
    [],
    "an unscoped handler answers for subjects this lane does not own — scope it, or add it to UNSCOPEABLE with its reason in source",
  );

  // The allowlist must not rot into a place things are parked: every entry has to still BE a
  // handler in the file, and still be unscoped. An exception that quietly became scoped, or
  // disappeared, should leave the list.
  for (const allowed of UNSCOPEABLE) {
    const row = census.find((r) => r.path === allowed);
    assert.ok(row, `${allowed} is allowlisted but is no longer a handler — drop it from UNSCOPEABLE`);
    assert.equal(row.scoped, false, `${allowed} is allowlisted but now scopes — drop it from UNSCOPEABLE`);
  }

  // THE POSITIVE CONTROL ON THE CENSUS ITSELF. An `unscoped` list that is empty proves nothing
  // unless the instrument can tell the two apart — and it could not on its first cut, which
  // anchored `return false;` at the line start and reported every one-line guard as UNSCOPED.
  // Both classes must be non-empty and disjoint.
  const scoped = census.filter((r) => r.scoped).map((r) => r.path);
  assert.ok(scoped.length >= 10, `the census recognised only ${scoped.length} scoped handlers — it is not reading the guards`);
  assert.equal(unscoped.length, UNSCOPEABLE.size, "and it still sees the two that genuinely cannot scope");
  assert.equal(scoped.filter((p) => UNSCOPEABLE.has(p)).length, 0, "no handler is counted both ways");
});
