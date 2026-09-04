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
 * THE LANE MOCKS THIS GATE CENSUSES. The rule is a rule for the SERVER, not for one lane,
 * and a guard that only ever read one file was one file away from the class recurring.
 *
 * The written list is checked against one DERIVED from `serve-built.mjs` below — a
 * hand-kept list and its guard living in the same file could both forget the same mock.
 */
const LANE_MOCKS = [
  "agentic-finish-mock.mjs",
  "bank-close-registers-mock.mjs",
] as const;

const LANE_MOCK = join(E2E_DIR, "agentic-finish-mock.mjs");
const L7_MOCK = join(E2E_DIR, "bank-close-registers-mock.mjs");

/**
 * The lane mocks `serve-built.mjs` actually imports, read from its source the same way
 * `sharedSubject()` reads its `SUBJECT` — a re-typed constant is a second copy that drifts,
 * and this whole file exists because of drift. The pattern matches the module SPECIFIER, not
 * an identifier or a comment: a lane mock IS a `./<name>-mock.mjs` sibling the server consults.
 */
function derivedLaneMocks(): string[] {
  const source = readFileSync(SERVE_BUILT, "utf8");
  return [...new Set([...source.matchAll(/from "\.\/([a-z0-9-]+-mock\.mjs)"/g)].map((m) => m[1]!))].sort();
}

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
/**
 * EVERY WAY A HANDLER OPENS, as one expression — used by the census AND by its independent
 * positive control, so the two can never disagree about what a handler even is.
 *
 * review-549 MAJOR 8: the first cut recognised only `path === "/rest/…"`. The L7 mock
 * dispatches its RPC half on `verb === "…"` after slicing the prefix once
 * (`bank-close-registers-mock.mjs`), so FIVE of its ten handlers were invisible to a gate
 * whose whole job is to see them — and an unscoped one among them would have passed
 * silently. A census that cannot see a handler cannot report it unscoped, which is the
 * failure mode this file was written to prevent, one level up.
 */
const HANDLER_OPENER = /(?:path === "(\/(?:rest|api)\/[^"]+)"|verb === "([a-z0-9_]+)")/;
const HANDLER_OPENER_G = new RegExp(HANDLER_OPENER.source, "g");

/** The label a census row carries, so an RPC-verb handler reads like the route it answers. */
function openerLabel(m: RegExpExecArray): string {
  return m[1] ?? `/rest/v1/rpc/${m[2]}`;
}

/** An independent count of the handler openers in a file, used as the positive control on the
 *  scan below: a loop that walks the wrong lines, or stops early, disagrees with this. Written
 *  as a whole-source match rather than a per-line walk on purpose — two techniques, one fact. */
function openerCount(file: string): number {
  return (readFileSync(file, "utf8").match(HANDLER_OPENER_G) ?? []).length;
}

function handlerCensus(mock: string = LANE_MOCK): { path: string; scoped: boolean }[] {
  const source = readFileSync(mock, "utf8");
  const lines = source.split("\n");
  const out: { path: string; scoped: boolean }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const opened = HANDLER_OPENER.exec(lines[i]!);
    if (!opened) continue;
    // The block runs to ITS OWN closing brace — tracked by brace DEPTH, not by "the
    // next handler opener or a column-0 `}`".
    //
    // ROUND-2 FIX, found by the L7 lane's own census: the first cut kept scanning past
    // the LAST handler's closing brace and picked up the function's own trailing
    // `return false;` fall-through, reporting that handler as SCOPED when it is not.
    // That is the direction that matters — an over-reporting instrument hides exactly
    // the unscoped handler this census exists to name. Depth counting cannot make that
    // mistake, and the two positive controls below still hold.
    let scoped = false;
    let depth = 0;
    for (let j = i; j < lines.length; j += 1) {
      const line = lines[j]!;
      // `return false;` ANYWHERE on the line, not only at its start: the scoping guard
      // is usually written as a one-line `if (…) return false;`.
      if (j > i && /\breturn false;/.test(line)) { scoped = true; break; }
      for (const ch of line) {
        if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }
      if (j > i && depth <= 0) break;
    }
    out.push({ path: openerLabel(opened), scoped });
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
  // COMPLETENESS, not sufficiency (review-549 MAJOR 8). `>= 10` only says the walk found
  // SOME handlers; it cannot notice a shape the opener does not recognise. The equality
  // against an independent whole-source match is what does: if the file grows a dispatch
  // form this census cannot see, the two counts diverge and this reds — which is the only
  // way a gate can report on handlers it does not know how to find.
  assert.equal(
    census.length,
    openerCount(LANE_MOCK),
    `the line walk found ${census.length} handlers, the source match ${openerCount(LANE_MOCK)} — the census is not seeing every dispatch form in this file`,
  );
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

// ---------------------------------------------------------------------------
// The SAME rule, applied to L7's mock lane (bank/close/registers).
// ---------------------------------------------------------------------------

/** L7's own two unscopeable handlers, each argued in that file beside itself: the
 *  gate CATALOG is firm-wide and carries no filter, and the close page's receipt
 *  panel reads `report_agent_receipts` unfiltered. Both are reachable only from
 *  `/clients/:id/close`, and only this lane's walk opens that route. */
const L7_UNSCOPEABLE = new Set(["/rest/v1/close_gate_checks", "/rest/v1/report_agent_receipts"]);

test("N5 (L7) · every bank/close/registers handler scopes by the request's own subject, or is a NAMED exception", () => {
  const census = handlerCensus(L7_MOCK);
  // The same completeness equality, and it is what this lane's own MAJOR was: this mock
  // dispatches its RPC half on `verb === "…"` after slicing the prefix once, so before the
  // opener learned that form FIVE of its ten handlers were invisible here.
  assert.equal(
    census.length,
    openerCount(L7_MOCK),
    `the line walk found ${census.length} handlers, the source match ${openerCount(L7_MOCK)} — the census is not seeing every dispatch form in this file`,
  );
  assert.ok(census.length >= 10, `the census found ${census.length} handlers in the L7 mock — too few to be reading the file`);
  // The verb-dispatched half, named: an absence assertion above cannot prove they were seen.
  for (const verb of ["list_fiscal_years", "get_close_plan", "get_close_readiness", "list_agent_act_receipts", "abandon_close"]) {
    assert.ok(
      census.some((r) => r.path === `/rest/v1/rpc/${verb}`),
      `the census must see the verb-dispatched handler for ${verb} — five of this mock's ten handlers open that way`,
    );
  }
  for (const row of census) console.log(`  ${row.scoped ? "scoped  " : "UNSCOPED"} ${row.path}`);

  const unscoped = census.filter((r) => !r.scoped).map((r) => r.path);
  const undeclared = unscoped.filter((p) => !L7_UNSCOPEABLE.has(p));
  assert.deepEqual(
    undeclared,
    [],
    "an unscoped handler answers for subjects this lane does not own — scope it, or add it to L7_UNSCOPEABLE with its reason in source",
  );

  // The allowlist must not rot: every entry still has to BE an unscoped handler here.
  for (const declared of L7_UNSCOPEABLE) {
    assert.ok(unscoped.includes(declared), `${declared} is declared unscopeable but is no longer an unscoped handler in the L7 mock — retire the entry`);
  }
});

test("N4 (L7) · the hold fixture's held_by IS the shared subject — otherwise the name-resolution journey proves only the fallback", () => {
  const subject = sharedSubject();
  const source = readFileSync(L7_MOCK, "utf8");
  const match = /heldBy: "([0-9a-f-]+)"/.exec(source);
  assert.ok(match, "the L7 mock must declare heldBy");
  assert.equal(
    match[1],
    subject,
    "serve-built.mjs's firm_members_visible publishes exactly the shared SUBJECT, so a DIFFERENT held_by would resolve to null and the walk would be asserting the shortened-id fallback while claiming to assert the name",
  );
});

test("N6 · the census reads EVERY lane mock serve-built.mjs consults — a third one cannot arrive uncensused", () => {
  const derived = derivedLaneMocks();
  console.log(`  serve-built.mjs consults: ${derived.join(", ")}`);
  const censused = [...LANE_MOCKS].sort();

  // `fs4-checkout-mock.mjs` and `chat-parity-mock.mjs` are consulted too. They are NOT in
  // LANE_MOCKS yet and this cell says so out loud rather than asserting equality it cannot
  // honestly claim: censusing them belongs to whoever owns those files, and #548 is widening
  // this same list in parallel. What this asserts is the ONE-WAY rule that actually protects
  // the gate — every file this census claims to read must really be a lane mock the server
  // consults, so a stale entry (a renamed or deleted mock) reds here instead of silently
  // censusing nothing.
  for (const mock of censused) {
    assert.ok(
      derived.includes(mock),
      `${mock} is censused by this gate but serve-built.mjs no longer consults it — retire the entry or fix the import`,
    );
  }
  assert.ok(derived.length >= censused.length, "the derived list is read from the server, never from this file");
});
