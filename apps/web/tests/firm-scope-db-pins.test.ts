import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  CALLER_CONTEXT_SELECT,
  FIRM_ROLES,
  loadCallerContext,
} from "../lib/firm/caller-context";
import {
  REGISTRATION_REQUESTS_SELECT,
  loadRegistrationRequestsForApplicant,
} from "../lib/registration/reads";
import { loadOwnRegistrationRequests } from "../lib/registration/server-reads";
import { lexSql, stripComments } from "../test/sourceOracle";
import type { SessionTokenAccessor } from "@/lib/session";
import type { ServerSession } from "../lib/supabase/server-session";

/**
 * THE DB-FACING PINS for P4-2 — the projections are the DB's own words, the
 * rung-0 live-body census is mechanised, and what reaches the wire is asserted on
 * the URL rather than read off the source.
 *
 * EVERY SQL READ GOES THROUGH A LEXER, NEVER A RAW REGEX (Codex review of #451,
 * LOW-5). The previous version matched against raw file text, so a commented-out
 * contract tuple or a commented `CREATE OR REPLACE VIEW` counted as evidence —
 * and `declaredContract` took the FIRST match, which a decoy placed above the real
 * one would win. Definitions are now sought only in statement-level SQL (strings
 * and dollar-quoted bodies blanked), contracts only in comment-free SQL, and both
 * must match EXACTLY ONCE.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

// ---------------------------------------------------------------------------
// THE ISOMORPHIC WALL — a client-importable module may not reach next/headers
// ---------------------------------------------------------------------------

/** Resolve a relative or `@/`-aliased specifier to a file under apps/web, or null
 *  for a bare package specifier (which this walk does not follow). */
function resolveLocal(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(WEB_ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(join(WEB_ROOT, fromFile)), spec)
      : null;
  if (base === null) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate.slice(WEB_ROOT.length + 1).split(sep).join("/");
  }
  return null;
}

/** Every specifier a module imports — VALUE imports only. `import type` is erased
 *  at compile time and drags nothing into a bundle, which is exactly why a
 *  type-only edge must not be followed here. */
function valueImports(webRelative: string): string[] {
  const code = stripComments(readFileSync(join(WEB_ROOT, webRelative), "utf8"));
  const out: string[] = [];
  for (const m of code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
    if (/^\s*type\s/.test(m[1] as string)) continue;
    out.push(m[2] as string);
  }
  for (const m of code.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  return out;
}

/** The transitive value-import closure, plus every bare specifier reached. */
function importClosure(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (files.has(current)) continue;
    files.add(current);
    for (const spec of valueImports(current)) {
      const local = resolveLocal(current, spec);
      if (local === null) bare.add(spec);
      else queue.push(local);
    }
  }
  return { files, bare };
}

describe("client-importable modules never drag next/headers into the bundle", () => {
  // P4-5 found this the hard way: value-importing anything from
  // lib/registration/reads.ts pulled server-session.ts → supabase/server.ts →
  // next/headers, so a client component that imported one constant broke. The
  // server-only half moved to lib/registration/server-reads.ts; this walk is what
  // keeps the split honest instead of trusting a comment.
  const ISOMORPHIC = ["lib/registration/reads.ts", "lib/firm/caller-context.ts", "lib/read.ts"];

  for (const entry of ISOMORPHIC) {
    it(`${entry} reaches no server-only module`, () => {
      const { files, bare } = importClosure(entry);
      assert.ok(!bare.has("next/headers"), `${entry} transitively value-imports next/headers`);
      assert.ok(
        !files.has("lib/supabase/server.ts"),
        `${entry} reaches lib/supabase/server.ts, which imports next/headers`,
      );
      assert.ok(
        !files.has("lib/supabase/server-session.ts"),
        `${entry} reaches lib/supabase/server-session.ts, which reaches next/headers`,
      );
    });
  }

  it("VACUITY CONTROL: the walk DOES find next/headers where it really is", () => {
    const { files, bare } = importClosure("lib/registration/server-reads.ts");
    assert.ok(files.has("lib/supabase/server-session.ts"), "the walk cannot see a one-hop edge");
    assert.ok(
      bare.has("next/headers"),
      "the walk cannot see next/headers even on the module that genuinely imports it — every assertion above would be vacuous",
    );
  });

  it("VACUITY CONTROL: a type-only edge is NOT followed", () => {
    // `import type` is erased, so following it would red modules that are
    // perfectly safe — lib/read.ts type-imports @/lib/session, which is
    // browser-only, and that edge costs a bundle nothing.
    const code = 'import type { X } from "@/lib/supabase/server";\nimport { y } from "./read";';
    const specs = (() => {
      const out: string[] = [];
      for (const m of stripComments(code).matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
        if (/^\s*type\s/.test(m[1] as string)) continue;
        out.push(m[2] as string);
      }
      return out;
    })();
    assert.deepEqual(specs, ["./read"], "a type-only import was followed as a value edge");
  });
});

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const migration = (name: string): string => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

/** Which migrations carry a real, statement-level `create [or replace] view
 *  clara.<name>` — the live-body census, mechanised. */
function viewDefiners(view: string): string[] {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+clara\\.${view}\\b`, "gi");
  return MIGRATION_FILES.filter((f) => re.test(lexSql(migration(f)).statements));
}

/** The `('<relation>', <n>, '<cols>')` column contract a migration registers in its
 *  own tail census. Comment-free, and required to appear EXACTLY ONCE. */
function declaredContract(sql: string, relation: string): { count: number; columns: string } {
  const re = new RegExp(`\\(\\s*'${relation}'\\s*,\\s*(\\d+)\\s*,\\s*'([^']+)'\\s*\\)`, "g");
  const hits = [...lexSql(sql).withoutComments.matchAll(re)];
  assert.equal(hits.length, 1, `expected exactly ONE active column contract for '${relation}', found ${hits.length}`);
  const [, count, columns] = hits[0] as RegExpMatchArray;
  assert.ok(typeof count === "string" && typeof columns === "string", "contract matched without both groups");
  return { count: Number(count), columns };
}

describe("LOW-5 — the SQL lexer, controlled before it is trusted", () => {
  it("a commented-out CREATE VIEW is not a definition", () => {
    const sql = "-- create view clara.decoy as select 1;\n/* create view clara.decoy as select 2; */\ncreate view clara.real as select 3;";
    const { statements } = lexSql(sql);
    assert.ok(!/create\s+view\s+clara\.decoy/i.test(statements), "a commented DDL counted");
    assert.ok(/create\s+view\s+clara\.real/i.test(statements), "the real DDL was eaten");
  });

  it("a CREATE VIEW inside a dollar-quoted body is text, not a definition", () => {
    const sql = "do $$ begin raise notice 'create view clara.decoy as select 1'; end $$;\ncreate view clara.real as select 1;";
    const { statements } = lexSql(sql);
    assert.ok(!/create\s+view\s+clara\.decoy/i.test(statements));
    assert.ok(/create\s+view\s+clara\.real/i.test(statements));
  });

  it("comments INSIDE a dollar-quoted body are still stripped", () => {
    // The contracts live inside `do $$ … $$`, so a decoy tuple one level down is
    // exactly where it would hide.
    const sql = "do $$ begin\n  -- ('decoy', 9, 'a,b')\n  perform ('real', 2, 'a,b');\nend $$;";
    const { withoutComments } = lexSql(sql);
    assert.ok(!withoutComments.includes("decoy"), "a comment inside a do-block survived");
    assert.ok(withoutComments.includes("'real'"), "the live tuple was eaten");
  });

  it("a `--` inside a string is not a comment", () => {
    const { withoutComments } = lexSql("select 'p4t1 tail: OK -- everything live', 1;");
    assert.ok(withoutComments.includes("everything live"), "a string's contents were eaten as a comment");
  });

  it("VACUITY CONTROL: the migration corpus was actually read", () => {
    assert.ok(MIGRATION_FILES.length > 100, `only ${MIGRATION_FILES.length} migrations found`);
  });
});

describe("the projections are the DB's own declared column contracts", () => {
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
    assert.deepEqual(viewDefiners("firm_registration_requests_visible"), [
      "0145_p4_tranche2_registration_operator_alias.sql",
    ]);
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

  it("a module that NAMES its pinning test must name one that really pins it", () => {
    // The nit this closes: both pin headers cited `tests/require-firm-scope.test.ts`
    // and stayed that way after the pins moved here — a citation nobody could
    // follow, found by a human reviewer rather than a gate. Prose is not usually
    // checkable, but a cited FILE plus the SYMBOL it claims to pin is.
    const CITATIONS: ReadonlyArray<{ module: string; symbol: string }> = [
      { module: "lib/firm/caller-context.ts", symbol: "CALLER_CONTEXT_SELECT" },
      { module: "lib/registration/reads.ts", symbol: "REGISTRATION_REQUESTS_SELECT" },
    ];
    for (const { module, symbol } of CITATIONS) {
      const src = readFileSync(join(WEB_ROOT, module), "utf8");
      const cited = [...src.matchAll(/`(tests\/[\w.-]+\.test\.tsx?)`/g)].map((m) => m[1] as string);
      assert.ok(cited.length > 0, `${module} names no pinning test at all`);
      for (const file of new Set(cited)) {
        const abs = join(WEB_ROOT, file);
        assert.ok(existsSync(abs), `${module} cites ${file}, which does not exist`);
        assert.ok(
          readFileSync(abs, "utf8").includes(symbol),
          `${module} cites ${file}, but that file does not mention ${symbol} — the citation points at the wrong test`,
        );
      }
    }
  });

  it("VACUITY CONTROL: the contract parser fails loudly on a relation it cannot find", () => {
    assert.throws(
      () => declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "no_such_relation"),
      /exactly ONE active column contract/,
    );
  });

  it("MEDIUM-2: FIRM_ROLES is the CHECK constraint's own vocabulary (0002:215)", () => {
    // The validator refuses a role off this ladder, so the list must be the DB's,
    // not a hand-written lookalike. Parsed out of the constraint, comment-free.
    const foundation = lexSql(migration("0002_foundation.sql")).withoutComments;
    const m = /role\s+text\s+not null\s+check\s*\(\s*role\s+in\s*\(([^)]*)\)/i.exec(foundation);
    assert.ok(m, "0002 no longer declares firm_memberships.role's CHECK where this gate can read it");
    const declared = [...(m[1] as string).matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(
      declared,
      [...FIRM_ROLES].sort(),
      "the DB's role ladder and lib/firm/caller-context.ts's FIRM_ROLES have drifted — every member holding the new role would be denied",
    );
  });
});

const APPLICANT = "44444444-4444-4444-8444-444444444444";
const testSession: SessionTokenAccessor = { getAccessToken: async () => "test-token" };
const SESSION: ServerSession = { accessToken: "test-token", subject: APPLICANT };

describe("what the two reads actually put on the wire", () => {
  const realFetch = globalThis.fetch;
  const hadUrl = Object.hasOwn(process.env, "NEXT_PUBLIC_SUPABASE_URL");
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let calls: string[] = [];

  before(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rig.supabase.test";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
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

  it("LOW-4: an unverifiable caller is its OWN branch — and issues no request", async () => {
    const result = await loadOwnRegistrationRequests({ resolveSession: async () => null });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "no_session");
    assert.equal(
      calls.length,
      0,
      "a read went out with no identity — and a returned emptiness would also be true of an unfiltered read that came back empty",
    );
  });

  it("LOW-4: a verified caller with zero rows is a SUCCESSFUL empty result", async () => {
    const result = await loadOwnRegistrationRequests({ resolveSession: async () => SESSION });
    assert.equal(result.ok, true);
    assert.deepEqual((result as { rows: unknown[] }).rows, []);
    assert.equal(new URL(onlyCall()).searchParams.get("applicant"), `eq.${APPLICANT}`);
  });

  it("RED-before: collapsing both into [] makes the two indistinguishable", async () => {
    const collapsed = async (session: ServerSession | null) => (session === null ? [] : []);
    assert.deepEqual(await collapsed(null), await collapsed(SESSION));
    const a = await loadOwnRegistrationRequests({ resolveSession: async () => null });
    const b = await loadOwnRegistrationRequests({ resolveSession: async () => SESSION });
    assert.notDeepEqual(a, b, "the two answers must not be the same value");
  });
});
