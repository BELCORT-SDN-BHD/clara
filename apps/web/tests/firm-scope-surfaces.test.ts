// `./next-runtime-globals` FIRST — this file imports lib/require-firm-scope.ts
// for its two registries, and that module loads `next/navigation`.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  SCOPE_ENTRANCES,
  SCOPE_EXEMPT_SURFACES,
} from "../lib/require-firm-scope";
import {
  CALLER_CONTEXT_SELECT,
  loadCallerContext,
} from "../lib/firm/caller-context";
import {
  REGISTRATION_REQUESTS_SELECT,
  loadOwnRegistrationRequests,
  loadRegistrationRequestsForApplicant,
} from "../lib/registration/reads";
import type { SessionTokenAccessor } from "@/lib/session";

/**
 * THE SCOPE SPINE'S STRUCTURAL HALF (P4-2). `tests/require-firm-scope.test.ts` is
 * the behaviour — the decision and its three adapters. This file proves the three
 * things behaviour cannot:
 *
 *  1. ONE IMPLEMENTATION, THREE CALL SITES — READ OFF THE TREE, NEVER CLAIMED.
 *     The `app/` tree is walked and the set of files that import AND call the
 *     spine is compared to `SCOPE_ENTRANCES` BOTH WAYS. Neither a fourth silent
 *     entrance nor an entrance that quietly stopped calling can pass, which is
 *     what makes design §4 E's "the seam is visible, not implicit" a gate.
 *  2. THE TWO EXEMPTIONS, ASSERTED AS EXEMPTIONS, with a vacuity control proving
 *     the detector can see a call at all (review law 2 — a "does not call"
 *     assertion from a blind instrument is an absence, not evidence).
 *  3. THE PINS ARE THE DB'S OWN WORDS. Both column projections are compared
 *     byte-for-byte against the column contract the migration itself declares,
 *     PARSED out of the .sql rather than retyped (review law 3 — spelling is not
 *     identity), and the rung-0 live-body census is mechanised so a later
 *     migration replacing either view reds this file and forces a re-census
 *     instead of leaving a stale citation in a comment.
 *
 * Plus what actually reaches the wire: the self-scope filter is asserted on the
 * URL, not in the source, and the no-identity branch is asserted to issue NO
 * REQUEST AT ALL.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

// ---------------------------------------------------------------------------
// ONE IMPLEMENTATION, THREE CALL SITES — read off the tree, never claimed
// ---------------------------------------------------------------------------

const SOURCE_EXT = /\.(ts|tsx)$/;

function walkSources(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkSources(abs, out);
    else if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push(abs);
  }
  return out;
}

/** Repo-relative, forward-slashed — the same spelling `SCOPE_ENTRANCES` and
 *  `SCOPE_EXEMPT_SURFACES` use, so the comparison is like-for-like. */
function webRelative(abs: string): string {
  return relative(WEB_ROOT, abs).split(sep).join("/");
}

function readSource(webRelativePath: string): string {
  return readFileSync(join(WEB_ROOT, webRelativePath), "utf8");
}

/**
 * Source with every comment removed, string and template literals preserved.
 *
 * THIS EXISTS BECAUSE THE RED-BEFORE DRILL CAUGHT THE DETECTOR CHEATING. Deleting
 * the real `await requireFirmScope();` from either layout left this suite GREEN:
 * both files NAME the spine in their own header comments, so a regex over the raw
 * text still matched. That is review law 3 in miniature — a guard that reads a
 * NAME reads a projection of the thing, not the thing. Every call-detection below
 * runs on CODE; only the prose assertions (which are deliberately about comments)
 * read the raw file.
 *
 * Regex literals are not tokenised — none of the files this walks contains one
 * whose body could be mistaken for a comment or a quote, and the two controls
 * below fail loudly if that ever stops being true.
 */
function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const d = src[i + 1];
    if (quote !== null) {
      out += c;
      if (c === "\\") {
        out += d ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** The file's CODE — comments gone. */
function readCode(webRelativePath: string): string {
  return stripComments(readSource(webRelativePath));
}

/** A file "calls the spine" only if its CODE imports the module AND invokes one of
 *  its entrances. The exempt files name the spine precisely to say they do not use
 *  it; the entrances name it in their headers too. */
const SPINE_IMPORT = /from\s+["']@\/lib\/require-firm-scope["']/;
const SPINE_CALL = /\b(requireFirmScope|firmScopeRefusal|resolveFirmScope)\s*\(/;

function callsSpineIn(code: string): boolean {
  return SPINE_IMPORT.test(code) && SPINE_CALL.test(code);
}

function callsSpine(webRelativePath: string): boolean {
  return callsSpineIn(readCode(webRelativePath));
}

describe("the spine has ONE implementation and exactly three entrances", () => {
  const appFiles = walkSources(join(WEB_ROOT, "app")).map(webRelative);
  const libFiles = walkSources(join(WEB_ROOT, "lib")).map(webRelative);
  const componentFiles = walkSources(join(WEB_ROOT, "components")).map(webRelative);

  it("VACUITY CONTROL: the walk found a real tree, not an empty one", () => {
    assert.ok(appFiles.length > 15, `only ${appFiles.length} app sources found`);
    assert.ok(libFiles.length > 30, `only ${libFiles.length} lib sources found`);
    assert.ok(componentFiles.length > 20, `only ${componentFiles.length} component sources found`);
  });

  it("VACUITY CONTROL: the caller-detector actually detects a known caller", () => {
    assert.equal(
      callsSpine("app/(firm)/layout.tsx"),
      true,
      "the detector cannot see a call it is pointed straight at — every 'does not call' below would be vacuous",
    );
    assert.equal(
      callsSpine("app/layout.tsx"),
      false,
      "the detector reports a call in the root layout, which has none",
    );
  });

  it("VACUITY CONTROL: the detector reads CODE, not prose", () => {
    // The exact shape that made this suite stay GREEN with both layouts' calls
    // deleted, before `stripComments` existed: the import is real, the only
    // mention of the call is in a comment.
    const commentOnly = [
      'import { requireFirmScope } from "@/lib/require-firm-scope";',
      "/** This surface deliberately does not call requireFirmScope(). */",
      "// requireFirmScope() would be the wrong wall here",
      "export default function Surface() { return null; }",
    ].join("\n");
    assert.equal(
      callsSpineIn(stripComments(commentOnly)),
      false,
      "a comment-only mention counts as a call — mutants A and B of the RED-before panel would pass again",
    );
    const realCall = commentOnly.replace("return null;", "requireFirmScope(); return null;");
    assert.equal(
      callsSpineIn(stripComments(realCall)),
      true,
      "the detector cannot see a real call once comments are stripped",
    );
  });

  it("VACUITY CONTROL: the stripper keeps string literals, drops both comment forms", () => {
    const stripped = stripComments(
      'const u = "https://a.example/x"; // LINE_GONE\n/* BLOCK_GONE */ const v = `t//t`;',
    );
    assert.ok(stripped.includes("https://a.example/x"), "a URL inside a string was eaten");
    assert.ok(stripped.includes("t//t"), "a template literal's contents were eaten");
    assert.ok(!stripped.includes("LINE_GONE"), "a line comment survived");
    assert.ok(!stripped.includes("BLOCK_GONE"), "a block comment survived");
  });

  it("exactly one module DEFINES each spine export", () => {
    for (const symbol of ["resolveFirmScope", "requireFirmScope", "firmScopeRefusal"]) {
      const definers = [...libFiles, ...appFiles, ...componentFiles].filter((p) =>
        new RegExp(`export\\s+(async\\s+)?function\\s+${symbol}\\b`).test(readCode(p)),
      );
      assert.deepEqual(
        definers,
        ["lib/require-firm-scope.ts"],
        `${symbol} is defined in ${definers.length} place(s) — the spine must be ONE implementation`,
      );
    }
  });

  it("the app tree's spine callers ARE the registry, both ways", () => {
    const found = appFiles.filter(callsSpine).sort();
    const registered = SCOPE_ENTRANCES.map((e) => e.path).sort();
    assert.deepEqual(
      found,
      registered,
      "a surface calls the spine without being registered, or a registered entrance stopped calling it",
    );
    assert.equal(registered.length, 3);
  });

  it("every entrance exists, and calls the spine with NO argument", () => {
    for (const entrance of SCOPE_ENTRANCES) {
      assert.ok(existsSync(join(WEB_ROOT, entrance.path)), `${entrance.path} is missing`);
      const src = readCode(entrance.path);
      assert.match(
        src,
        /\b(requireFirmScope|firmScopeRefusal)\(\s*\)/,
        `${entrance.path} does not call the spine bare`,
      );
      assert.doesNotMatch(
        src,
        /\b(requireFirmScope|firmScopeRefusal)\(\s*[^)\s]/,
        `${entrance.path} passes an argument — an entrance must never be handed its own reader`,
      );
    }
  });

  it("the two layouts REDIRECT and the API route REFUSES — not the other way round", () => {
    for (const entrance of SCOPE_ENTRANCES) {
      const src = readCode(entrance.path);
      if (entrance.onDenial === "redirect") {
        assert.match(src, /requireFirmScope\(\s*\)/, `${entrance.path} must redirect`);
        assert.doesNotMatch(src, /firmScopeRefusal/, `${entrance.path} must not answer a status`);
      } else {
        assert.match(src, /firmScopeRefusal\(\s*\)/, `${entrance.path} must answer a status`);
        assert.doesNotMatch(src, /requireFirmScope\(/, `${entrance.path} must not redirect a data request`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// THE TWO EXEMPTIONS, ASSERTED AS EXEMPTIONS
// ---------------------------------------------------------------------------

describe("the two deliberate exemptions stay exempt", () => {
  it("the registry names both, each with a reason substantial enough to survive", () => {
    const paths = SCOPE_EXEMPT_SURFACES.map((e) => e.path).sort();
    assert.deepEqual(paths, ["app/api/invite/route.ts", "app/logout/route.ts"]);
    for (const entry of SCOPE_EXEMPT_SURFACES) {
      assert.ok(
        entry.reason.length >= 120,
        `${entry.path}'s exemption reason is too thin to survive a later lane reading it`,
      );
      assert.match(entry.reason, /EXEMPT (BY NECESSITY|ON PRINCIPLE)/);
    }
  });

  it("no exempt file that EXISTS calls the spine — detector proven above", () => {
    const present = SCOPE_EXEMPT_SURFACES.filter((e) => existsSync(join(WEB_ROOT, e.path)));
    assert.ok(
      present.length >= 1,
      "no exempt file exists on disk, so this check ran against nothing",
    );
    for (const entry of present) {
      assert.equal(
        callsSpine(entry.path),
        false,
        `${entry.path} is registered as EXEMPT but calls the spine`,
      );
    }
    // Stated, not skipped: app/api/invite/route.ts is P4-4's courier and does not
    // exist at this tip. The moment it lands, the loop above starts binding it.
    assert.equal(present.length, SCOPE_EXEMPT_SURFACES.length - 1);
  });

  it("logout carries its exemption in its OWN source, where a 'fixing' lane looks", () => {
    const src = readSource("app/logout/route.ts");
    assert.match(src, /DELIBERATELY EXEMPT FROM THE SCOPE SPINE/);
    assert.match(src, /do not "fix"/);
    assert.match(src, /SCOPE_EXEMPT_SURFACES/);
  });

  it("logout keeps the two walls that DO matter there", () => {
    const src = readCode("app/logout/route.ts");
    assert.match(src, /isSameOriginRequest\(/, "the same-origin wall is gone");
    assert.match(src, /export async function POST\(/, "logout stopped being POST-only");
    assert.doesNotMatch(src, /export async function GET\(/, "logout gained a GET entrance");
  });
});

// ---------------------------------------------------------------------------
// THE WIRE-SHAPE PINS AND THE MECHANISED RUNG-0 CENSUS
// ---------------------------------------------------------------------------

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function migration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/** Which migration files contain a `create [or replace] view clara.<name>` — the
 *  live-body census, mechanised. `apps/web/AGENTS.md`: a citation must chase the
 *  LIVE body, never a migration's first CREATE. */
function viewDefiners(view: string): string[] {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+clara\\.${view}\\b`, "i");
  return MIGRATION_FILES.filter((f) => re.test(migration(f)));
}

/** The `('<relation>', <n>, '<cols>')` column contract each migration registers in
 *  its own tail census. Parsed, never retyped. */
function declaredContract(sql: string, relation: string): { count: number; columns: string } {
  const m = new RegExp(`\\(\\s*'${relation}'\\s*,\\s*(\\d+)\\s*,\\s*'([^']+)'\\s*\\)`).exec(sql);
  assert.ok(m, `no column contract for '${relation}' — the migration stopped declaring it`);
  const [, count, columns] = m;
  assert.ok(
    typeof count === "string" && typeof columns === "string",
    `the column contract for '${relation}' matched without both capture groups`,
  );
  return { count: Number(count), columns };
}

describe("the projections are the DB's own declared column contracts", () => {
  it("VACUITY CONTROL: the migration corpus was actually read", () => {
    assert.ok(
      MIGRATION_FILES.length > 100,
      `only ${MIGRATION_FILES.length} migrations found at ${MIGRATIONS_DIR}`,
    );
  });

  it("clara.caller_context has ONE live body — 0141:544, nothing superseding it", () => {
    assert.deepEqual(
      viewDefiners("caller_context"),
      ["0141_p4_tranche1_invite_rbac.sql"],
      "a later migration now defines caller_context — re-run the rung-0 census before trusting lib/firm/caller-context.ts's header",
    );
  });

  it("caller_context's 6-column contract matches CALLER_CONTEXT_SELECT byte for byte", () => {
    const declared = declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "caller_context");
    assert.equal(declared.count, 6);
    assert.equal(declared.columns, CALLER_CONTEXT_SELECT);
    assert.equal(CALLER_CONTEXT_SELECT.split(",").length, declared.count);
  });

  it("clara.firm_registration_requests_visible has ONE live body — 0145:911", () => {
    assert.deepEqual(
      viewDefiners("firm_registration_requests_visible"),
      ["0145_p4_tranche2_registration_operator_alias.sql"],
      "a later migration now defines the registration view — re-run the census",
    );
  });

  it("the registration view's 10-column contract matches REGISTRATION_REQUESTS_SELECT", () => {
    const declared = declaredContract(
      migration("0145_p4_tranche2_registration_operator_alias.sql"),
      "firm_registration_requests_visible",
    );
    assert.equal(declared.count, 10);
    assert.equal(declared.columns, REGISTRATION_REQUESTS_SELECT);
    assert.equal(REGISTRATION_REQUESTS_SELECT.split(",").length, declared.count);
  });

  it("VACUITY CONTROL: the contract parser fails loudly on a relation it cannot find", () => {
    assert.throws(
      () => declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "no_such_relation"),
      /no column contract/,
    );
  });
});

// ---------------------------------------------------------------------------
// WHAT ACTUALLY REACHES THE WIRE
// ---------------------------------------------------------------------------

const APPLICANT = "44444444-4444-4444-8444-444444444444";
const testSession: SessionTokenAccessor = { getAccessToken: async () => "test-token" };

describe("what the two reads actually put on the wire", () => {
  const realFetch = globalThis.fetch;
  const hadUrl = Object.hasOwn(process.env, "NEXT_PUBLIC_SUPABASE_URL");
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let calls: string[] = [];

  before(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rig.supabase.test";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : String(input));
      return new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
    if (hadUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  beforeEach(() => {
    calls = [];
  });

  /** Exactly one request went out, and here is its URL. The count assertion is
   *  part of the evidence, not a convenience: "the filter was on SOME request"
   *  would still be true of a second, unfiltered one. */
  function onlyCall(): string {
    assert.equal(calls.length, 1, `expected exactly one request, saw ${calls.length}`);
    const [first] = calls;
    assert.ok(typeof first === "string", "no request URL was captured");
    return first;
  }

  it("loadCallerContext sends the pinned select and bounds the read at 2 rows", async () => {
    await loadCallerContext(testSession);
    const url = new URL(onlyCall());
    assert.equal(url.pathname, "/rest/v1/caller_context");
    assert.equal(url.searchParams.get("select"), CALLER_CONTEXT_SELECT);
    assert.equal(
      url.searchParams.get("limit"),
      "2",
      "without a 2-row bound a >1 result is truncated to one and the ambiguous branch can never fire",
    );
  });

  it("the applicant read is SELF-scoped ON THE WIRE, not just in the view", async () => {
    await loadRegistrationRequestsForApplicant(testSession, APPLICANT);
    const url = new URL(onlyCall());
    assert.equal(url.pathname, "/rest/v1/firm_registration_requests_visible");
    assert.equal(
      url.searchParams.get("applicant"),
      `eq.${APPLICANT}`,
      "an unfiltered read hands an operator-firm owner the WHOLE estate's queue",
    );
    assert.equal(url.searchParams.get("select"), REGISTRATION_REQUESTS_SELECT);
    assert.equal(url.searchParams.get("order"), "created_at.desc");
  });

  it("no subject → NO REQUEST AT ALL, not merely an empty result", async () => {
    const rows = await loadOwnRegistrationRequests({
      subject: async () => null,
      session: testSession,
    });
    assert.deepEqual(rows, []);
    assert.equal(
      calls.length,
      0,
      "a read went out with no identity — 'returned []' would also be true of an unfiltered read that happened to come back empty",
    );
  });

  it("POSITIVE CONTROL: with a subject, exactly one filtered read goes out", async () => {
    await loadOwnRegistrationRequests({
      subject: async () => APPLICANT,
      session: testSession,
    });
    assert.equal(new URL(onlyCall()).searchParams.get("applicant"), `eq.${APPLICANT}`);
  });
});
