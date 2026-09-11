// THE COMPOSER'S REFUSAL ROSTER, BOUND TO THE SURFACES THAT PRODUCE IT.
//
// #634, reviewed finding. `apps/web/lib/work/journal-basis.ts`'s
// `fieldForServerPath` and `components/accounting/journal-composer.tsx`'s
// `apply` are the two places a refusal from `POST /api/work/journal` becomes
// something a preparer can see — a message beside a control, or a banner with
// one next action. Both were bound to the runtime and to migration 0182 BY
// CITATION ONLY: each carries a comment naming a file, and nothing checked that
// the file still says what the comment says. So a field path added on the
// runtime side, or a refusal token added in the migration, would land in the
// browser as a form that focuses NOTHING and reds no control — the exact defect
// the `basis.postingDate` / `postingDate` episode already cost this lane once
// (see the WIRE FIELD PATHS note in `packages/runtime/src/workRoutes.ts`).
//
// So this file CENSUSES the producers and asserts the consumers cover them:
//
//   A · every field path `workRoutes.ts` itself can put in a 400 `field` slot
//   B · every source-ref constraint migration 0182 can raise, at its own path
//   C · every 4xx `error` token the route can answer with → a typed result kind
//   D · every kind of `SubmitJournalWorkResult` → an arm of the composer's apply
//
// `apps/web/tests/runtime-outbound.test.ts` is the precedent for reading a sibling
// package's source from a web cell, and its VACUITY CONTROL discipline is kept:
// a parser that silently found nothing would make every assertion below pass for
// the wrong reason, so each census asserts what it read before it asserts what it
// means.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fieldForServerPath, type JournalFieldId } from "@/lib/work/journal-basis";
import { submitJournalWork } from "@/lib/work/api";
import { readCode } from "../test/sourceOracle";
import type { SessionTokenAccessor } from "@/lib/session";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WORK_ROUTES = join(REPO, "packages", "runtime", "src", "workRoutes.ts");
const MIGRATION_0182 = join(
  REPO, "packages", "db", "migrations", "0182_journal_work_evidence.sql",
);
const COMPOSER = join(
  dirname(fileURLToPath(import.meta.url)), "..", "components", "accounting", "journal-composer.tsx",
);
const WORK_API = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "work", "api.ts");

/** The route's own 400 paths, read off `invalid(...)` and `linePath(...)` in
 *  COMMENT-STRIPPED source. `linePath` is the one place the 1-based arithmetic
 *  happens, so its two shapes are materialised at ordinal 1 — which is exactly
 *  the offset a mis-mapped consumer gets wrong. */
function routeFieldPaths(): string[] {
  const { code } = readCode(WORK_ROUTES);
  const paths = new Set<string>();
  for (const m of code.matchAll(/\binvalid\(\s*"([^"]+)"/gu)) paths.add(m[1]!);
  for (const m of code.matchAll(/\binvalid\(\s*linePath\(\s*i\s*(?:,\s*"([^"]+)")?\s*\)/gu)) {
    paths.add(m[1] === undefined ? "lines[1]" : `lines[1].${m[1]}`);
  }
  // The route's own template path for an evidence element, materialised at 1.
  for (const m of code.matchAll(/`(sourceRefs)\[\$\{i \+ 1\}\]`/gu)) paths.add(`${m[1]}[1]`);
  return [...paths].sort();
}

/** Every 4xx `error` token the route can answer a SUBMIT with, read off
 *  `workErrorResponse` plus the handler's own direct answers. */
function routeErrorTokens(): string[] {
  const { code } = readCode(WORK_ROUTES);
  const tokens = new Set<string>();
  for (const m of code.matchAll(/error:\s*"([a-z_]+)"/gu)) tokens.add(m[1]!);
  for (const m of code.matchAll(/\{\s*error:\s*"([a-z_]+)"/gu)) tokens.add(m[1]!);
  return [...tokens].sort();
}

/** Every `constraint` token migration 0182's source-ref assertion can raise,
 *  read off the migration text between the assertion's own boundaries. */
function evidenceConstraints(): string[] {
  const sql = readFileSync(MIGRATION_0182, "utf8");
  const start = sql.indexOf("create function clara._assert_journal_source_refs");
  assert.ok(start > 0, "0182 no longer declares clara._assert_journal_source_refs");
  const end = sql.indexOf("revoke all on function clara._assert_journal_source_refs", start);
  assert.ok(end > start, "0182's source-ref assertion has no revoke tail to bound it");
  const body = sql.slice(start, end);
  const found = new Set<string>();
  for (const m of body.matchAll(/'constraint'\s*,\s*'([a-z_]+)'/gu)) found.add(m[1]!);
  return [...found].sort();
}

/** The kinds `SubmitJournalWorkResult` declares, read off its union. */
function submitResultKinds(): string[] {
  const { code } = readCode(WORK_API);
  const start = code.indexOf("export type SubmitJournalWorkResult");
  assert.ok(start > 0, "lib/work/api.ts no longer declares SubmitJournalWorkResult");
  const end = code.indexOf(";", code.indexOf("kind: \"lost\"", start));
  const union = code.slice(start, end);
  const kinds = new Set<string>();
  for (const m of union.matchAll(/kind:\s*"([a-z_]+)"/gu)) kinds.add(m[1]!);
  return [...kinds].sort();
}

/** The kinds the composer's `apply` names explicitly. */
function composerPlacedKinds(): string[] {
  const { code } = readCode(COMPOSER);
  // `async` is OPTIONAL in this anchor on purpose: `apply` became async when the
  // `source_conflict` arm had to resolve the CLAIMANT client of the entry the refusal names
  // (#728 delta review [3]) — a change to ONE arm's body, not to the roster this cell is about.
  // Matching either spelling keeps the pin on what it claims to watch.
  const declaration = /const apply = (?:async )?\(result: SubmitJournalWorkResult\)/u.exec(code);
  assert.ok(declaration, "the composer no longer declares apply(result)");
  const start = declaration.index;
  const end = code.indexOf("const send = async", start);
  assert.ok(end > start, "apply's body could not be bounded");
  const body = code.slice(start, end);
  const kinds = new Set<string>();
  for (const m of body.matchAll(/result\.kind === "([a-z_]+)"/gu)) kinds.add(m[1]!);
  return [...kinds].sort();
}

/** Paths that are REAL wire paths with no control of their own. Each renders as
 *  a form-level banner carrying the server's own reason — honest, and the
 *  composer's own header says why (this form has no currency field, and `basis`
 *  is the whole payload). Anything NOT on this list must reach a control. */
const FORM_LEVEL_PATHS = ["basis", "currency"];

describe("#634 — the composer's refusal roster is BOUND to its producers", () => {
  it("A · VACUITY CONTROL: the route's own 400 paths were actually read", () => {
    const paths = routeFieldPaths();
    assert.ok(paths.length >= 8, `expected the route's field-path census to be non-trivial, got ${paths.join(", ")}`);
    for (const expected of ["posting_date", "memo", "currency", "lines", "sourceRefs"]) {
      assert.ok(paths.includes(expected), `${expected} vanished from workRoutes.ts's 400 paths`);
    }
  });

  it("A · every field path the ROUTE can emit reaches a control, or is rostered as form-level", () => {
    for (const path of routeFieldPaths()) {
      const control = fieldForServerPath(path);
      if (FORM_LEVEL_PATHS.includes(path)) {
        assert.equal(control, null,
          `${path} is rostered as form-level but now maps to ${String(control)} — decide which it is`);
        continue;
      }
      assert.notEqual(control, null,
        `POST /api/work/journal can answer 400 with field "${path}" and the composer maps it to NO `
        + "control: the message would appear beside nothing and focus would stay on Submit. Add it "
        + "to fieldForServerPath, or roster it as form-level and say why.");
    }
  });

  it("A · the line paths are ONE-BASED at the browser's edge", () => {
    // The single most consequential arithmetic on this wire: `lines[1]` is the
    // FIRST row of the form. Getting it wrong reds a control the server never
    // named and focuses the wrong money field.
    assert.equal(fieldForServerPath("lines[1].account_code"), "line.0.account" satisfies JournalFieldId);
    assert.equal(fieldForServerPath("lines[2].credit_cents"), "line.1.credit" satisfies JournalFieldId);
    assert.equal(fieldForServerPath("lines[0].account_code"), null, "lines[0] is not a path this vocabulary produces");
  });

  it("B · every source-ref constraint 0182 can raise lands on the evidence control", () => {
    const constraints = evidenceConstraints();
    assert.ok(constraints.length >= 5,
      `expected 0182's source-ref constraint census to be non-trivial, got ${constraints.join(", ")}`);
    assert.ok(constraints.includes("not_filed"),
      "not_filed is the one arm only the database can reach — if it is gone, the fold in "
      + "workErrorResponse has nothing to carry");
    // The DATABASE spells the path `source_refs[N]`; the route re-spells it
    // `sourceRefs[N]`. BOTH must reach the one chooser this journey renders,
    // because a refusal is not allowed to depend on which half caught it.
    for (const path of ["source_refs[1]", "sourceRefs[1]"]) {
      assert.equal(fieldForServerPath(path), "evidence" satisfies JournalFieldId,
        `${path} must reach the evidence chooser`);
    }
  });

  it("C · every 4xx error token the route can answer with becomes a typed result", async () => {
    const tokens = routeErrorTokens();
    assert.ok(tokens.length >= 5, `expected the route's error-token census to be non-trivial, got ${tokens.join(", ")}`);
    for (const expected of ["invalid_basis", "source_already_posted", "intent_payload_conflict", "not_found"]) {
      assert.ok(tokens.includes(expected), `${expected} vanished from workRoutes.ts's answers`);
    }
    // The STATUS each token rides is the route's own; a token this table does
    // not know is a NEW answer nobody taught the browser about, and it fails
    // here rather than reaching a preparer as "the runtime answered 409".
    const status: Record<string, number> = {
      invalid_basis: 400,
      source_already_posted: 409,
      intent_payload_conflict: 409,
      not_retryable: 409,
      conflict: 409,
      not_found: 404,
      forbidden: 403,
      shutting_down: 503,
      // The unclassified-error answer. `workErrorResponse` returns null for an
      // error its map does not claim, and the handler logs it and answers 500 —
      // which the browser must read as "nobody can tell yet", never as a refusal.
      internal: 500,
      // AuthError's own tokens, answered by `sendAuthError` on the same route.
      unauthenticated: 401,
      no_session: 401,
      // #630 — the cancel and take-over doors' own tokens, on the SAME route. They are not
      // reachable from `POST /api/work/journal` (the door this cell's producer drives), but the
      // census reads the whole FILE, and that is the point: a token the route can answer with and
      // the browser has never been taught is exactly what this cell exists to catch. Their browser
      // readers are `cancelWork` / `takeOverWork` in lib/work/api.ts, pinned in its own suite.
      basis_confirmation_required: 400,
      not_takeable: 409,
      work_cancelled: 409,
      work_settled: 409,
      // …and the two the #630 review added. `run_already_terminal` is the stranded-pair belt's own
      // 409 (before it, that shape reached a human as the task matrix's untyped CLR13 dressed as a
      // codeless conflict); `transient` is PostgreSQL's own 40P01/40001, which say nothing about
      // the request and must read as "try again" rather than as an internal failure.
      run_already_terminal: 409,
      transient: 409,
    };
    const kinds = new Set(submitResultKinds());
    for (const token of tokens) {
      const code = status[token];
      assert.notEqual(code, undefined,
        `workRoutes.ts can answer { error: "${token}" } and this cell does not know which status it `
        + "rides — teach it, and teach the browser at the same time.");
      const result = await withStubbedFetch(code!, { error: token }, () =>
        submitJournalWork({ getAccessToken: async () => "tok" } satisfies SessionTokenAccessor, {
          clientId: "11111111-1111-4111-8111-111111111111",
          intentKey: "k",
          basis: {
            postingDate: "2026-09-01", memo: "m", currency: "MYR",
            lines: [
              { accountCode: "6100", debitCents: 1, creditCents: 0 },
              { accountCode: "1100", debitCents: 0, creditCents: 1 },
            ],
          },
        }));
      assert.ok(kinds.has(result.kind),
        `${code} { error: "${token}" } produced kind "${result.kind}", which is not a member of `
        + "SubmitJournalWorkResult");
    }
  });

  it("D · every kind of SubmitJournalWorkResult is PLACED by the composer", () => {
    const kinds = submitResultKinds();
    assert.ok(kinds.length >= 8, `expected a non-trivial result union, got ${kinds.join(", ")}`);
    const placed = composerPlacedKinds();
    // `lost` and `unavailable` are the deliberate FALLTHROUGH pair: apply's last
    // statement sets one or the other, so they are placed without being named in
    // a `result.kind === …` test. Every other kind must be named.
    const fallthrough = ["lost", "unavailable"];
    for (const kind of kinds) {
      if (fallthrough.includes(kind)) continue;
      assert.ok(placed.includes(kind),
        `submitJournalWork can answer { kind: "${kind}" } and the composer's apply() has no arm for `
        + "it: the form would silently stay in whatever phase it was in and tell a preparer nothing.");
    }
    const { code } = readCode(COMPOSER);
    for (const kind of fallthrough) {
      assert.ok(code.includes(`kind: "${kind}"`),
        `${kind} is claimed as a fallthrough arm but the composer never sets that phase`);
    }
  });
});

/** Swap `fetch` for one canned answer, and restore it unconditionally. */
async function withStubbedFetch<T>(
  status: number,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}
