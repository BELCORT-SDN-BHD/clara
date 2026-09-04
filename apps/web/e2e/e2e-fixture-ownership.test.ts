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

/**
 * EVERY LANE MOCK, not one (裁-190 fold).
 *
 * This gate shipped censusing a single hard-coded file, so the rule it enforces —
 * "a lane handler scopes by the request's own subject, or it is a named exception" —
 * applied to whichever lane happened to be named here and to nobody else. Two more
 * lane mocks were already sitting beside it, unmeasured, and a third arrived with the
 * journals table. A gate that watches one of four files is not a gate.
 *
 * WHAT A LANE MOCK IS, so this list is maintainable rather than a place things fall out
 * of: a file-disjoint sibling of `serve-built.mjs` that `serve-built.mjs` consults
 * through a hook and that answers PostgREST paths from its own fixtures. Adding a
 * fourth means adding a row here; the count assertion below is what makes forgetting
 * visible instead of silent.
 */
const LANE_MOCKS = [
  "agentic-finish-mock.mjs",
  "chat-parity-mock.mjs",
  "journals-table-mock.mjs",
] as const;

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

/** Every `path === "/rest/v1/..."` or `path === "/api/..."` handler in ONE lane mock, with
 *  whether its block contains a `return false` — the fall-through that makes it scoped. */
function handlerCensus(file: string = LANE_MOCK): { path: string; scoped: boolean }[] {
  const source = readFileSync(file, "utf8");
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
 * TWO DECLARATIONS PER LANE MOCK, and they are deliberately different KINDS.
 *
 * `unscopeable` — a handler that CANNOT be scoped, with the reason recorded in source beside
 * it. An allowlist is only honest when it is short, named and argued. The two on the P6-5 lane
 * are RPCs whose request carries no SUBJECT: `list_coa_templates()` takes no arguments at all,
 * and `begin_client_onboarding` takes a free-text name rather than an id — keying on this lane's
 * own string would be scoping by a label, the "spelling is not identity" mistake applied to a
 * fixture. Both are measured to have no other caller in `apps/web/e2e`.
 *
 * `debt` — a handler that COULD be scoped and simply is not. Recording those as "unscopeable"
 * would be writing a false reason into a gate, so they get their own name. All three sit on the
 * chat-parity lane and each carries a discriminant its handler ignores: `answer_interruption`
 * and `record_client_resolution` are POSTs whose body has an id, and
 * `document_intakes_visible` is a GET that can filter. They predate this gate's widening
 * (裁-190), they are recorded rather than fixed because that file belongs to another lane's
 * scope, and the assertions below hold the count EXACTLY — so this list can shrink but a fourth
 * entry cannot appear quietly.
 *
 * The journals lane declares NEITHER, which is the shape a new lane mock should aim for.
 */
const LANE_DECLARATIONS: Record<string, { unscopeable: string[]; debt: string[] }> = {
  "agentic-finish-mock.mjs": {
    unscopeable: ["/rest/v1/rpc/list_coa_templates", "/rest/v1/rpc/begin_client_onboarding"],
    debt: [],
  },
  "chat-parity-mock.mjs": {
    unscopeable: [],
    debt: [
      "/rest/v1/rpc/answer_interruption",
      "/rest/v1/document_intakes_visible",
      "/rest/v1/rpc/record_client_resolution",
    ],
  },
  "journals-table-mock.mjs": { unscopeable: [], debt: [] },
};

test("N5 · every lane handler either scopes by the request's own subject, or is a NAMED exception", () => {
  // THE LIST ITSELF IS PINNED. Without this, adding a lane mock and forgetting to declare it
  // makes the gate silently smaller — the exact failure the widening exists to end.
  assert.deepEqual(
    Object.keys(LANE_DECLARATIONS).sort(),
    [...LANE_MOCKS].sort(),
    "every lane mock needs a declaration row, and every row needs a lane mock",
  );

  let totalScoped = 0;

  for (const mock of LANE_MOCKS) {
    const { unscopeable, debt } = LANE_DECLARATIONS[mock]!;
    const declared = new Set([...unscopeable, ...debt]);
    const census = handlerCensus(join(E2E_DIR, mock));

    console.log(`\n  ${mock}`);
    assert.ok(census.length >= 5, `${mock}: the census found ${census.length} handlers — it is not reading the file`);
    for (const row of census) {
      console.log(`    ${row.scoped ? "scoped  " : "UNSCOPED"} ${row.path}`);
    }

    const unscoped = census.filter((r) => !r.scoped).map((r) => r.path);
    const scoped = census.filter((r) => r.scoped).map((r) => r.path);
    totalScoped += scoped.length;

    assert.deepEqual(
      unscoped.filter((p) => !declared.has(p)),
      [],
      `${mock}: an unscoped handler answers for subjects this lane does not own — scope it, or declare it (unscopeable, with its reason in source) or record it as debt`,
    );

    // Neither list may rot into a place things are parked: every entry has to still BE a
    // handler in this file, and still be unscoped. One that quietly became scoped, or
    // disappeared, should leave the list.
    for (const allowed of declared) {
      const row = census.find((r) => r.path === allowed);
      assert.ok(row, `${mock}: ${allowed} is declared but is no longer a handler — drop it`);
      assert.equal(row.scoped, false, `${mock}: ${allowed} is declared but now SCOPES — drop it`);
    }

    // The per-file tail, replacing the single global count. EXACT, not `>=`: a new unscoped
    // handler has to be argued for in source before this goes green again.
    assert.equal(
      unscoped.length,
      declared.size,
      `${mock}: expected exactly ${declared.size} undeclared-free unscoped handlers, saw ${unscoped.length} (${unscoped.join(", ")})`,
    );
    assert.equal(scoped.filter((p) => declared.has(p)).length, 0, `${mock}: no handler is counted both ways`);
  }

  // THE POSITIVE CONTROL ON THE CENSUS ITSELF. An empty `unscoped` list proves nothing unless
  // the instrument can tell the two apart — and it could not on its first cut, which anchored
  // `return false;` at the line start and reported every one-line guard as UNSCOPED. Across the
  // three files the SCOPED class must stay large, or the reader is broken rather than the
  // fixtures clean.
  assert.ok(totalScoped >= 20, `the census recognised only ${totalScoped} scoped handlers across ${LANE_MOCKS.length} files — it is not reading the guards`);
});
