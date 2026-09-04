import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
import { stripComments } from "../test/sourceOracle";
import { lexSql, viewDefinitionOffsets } from "../test/sqlOracle";
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
  const code = stripComments({
    path: webRelative,
    code: readFileSync(join(WEB_ROOT, webRelative), "utf8"),
  }).code;
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
  const ISOMORPHIC = [
    "lib/registration/reads.ts",
    "lib/registration/doors.ts",
    "lib/firm/caller-context.ts",
    "lib/read.ts",
  ];

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
      for (const m of stripComments({ path: "type-only-control.ts", code }).code
        .matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
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

type MigrationCorpus = {
  readonly files: readonly string[];
  readonly read: (name: string) => string;
};

const DEFAULT_MIGRATION_CORPUS: MigrationCorpus = { files: MIGRATION_FILES, read: migration };

/** Exact, reviewed dynamic-SQL barriers. A new migration is never admitted here
 * merely because the lexer could not inspect it: adding an entry is a review act
 * and the reason records why this specific barrier is understood. */
type ReviewedDynamicSqlBarrier = { readonly reason: string; readonly sha256: string };

const REVIEWED_DYNAMIC_SQL_BARRIERS = new Map<string, ReviewedDynamicSqlBarrier>([
  [
    "0146_ninth_rowkind_seeding_proposal.sql",
    {
      reason: "Reviewed splice of clara.list_review_queue() from pg_get_functiondef; it cannot replace either P4 scope view.",
      sha256: "561ede4d64af78cbc150894b8ca6014f7b1514d45fa5d313ef6681012d2398a6",
    },
  ],
  [
    "0147_db_hardening_b_hash_only_bearer_tokens.sql",
    {
      reason: "Reviewed ALTER TABLE formatter drops the discovered firm_admissions primary-key constraint; it emits no view definition.",
      sha256: "28cfc3f7d83e28818e455c96849efe61ab87008bd7482239dfab41d0499f8121",
    },
  ],
  [
    "0149_counterparty_merge_pr_1.sql",
    {
      reason: "Reviewed pg_get_functiondef splices recut four named counterparty functions only; neither P4 scope view is a target.",
      sha256: "e44758a0a931122c1be8452fa4f4866d29e180bbffa0cff1ea3c9a9a94425cb5",
    },
  ],
  [
    "0151_f_a9_pr_1b_brake_census.sql",
    {
      reason: "Reviewed pg_get_functiondef loop recuts the explicit F-A9 function roster only; neither P4 scope view is a target.",
      sha256: "f6d093e5b5e6037386522581ec07fab6ad955b4944f3871fc5a31b2635173b7b",
    },
  ],
  // MERGE-TIME OBLIGATION: this key is the FILENAME, and this file is renamed when its
  // migration number is claimed. Re-key the entry to the numbered name at merge; the sha256
  // does not move, because a rename changes no bytes.
  [
    "UNNUMBERED_dba4_coding_lane_kind_exclusion.sql",
    {
      reason: "Reviewed pg_get_functiondef splices recut exactly two FUNCTIONS — clara.list_uncoded_filings(uuid) and clara.list_review_queue(jsonb,jsonb,integer) — each read at a literal signature and re-installed with one appended WHERE conjunct; the block emits no view definition at all, so neither P4 scope view can be a target. Same family as 0146's splice of the same queue function.",
      sha256: "c6f3b99a27f554650982893bc6288f7de33953824e5b930fc862f02c1e42b8d4",
    },
  ],
]);

/**
 * Every real, statement-level `create [or replace] view clara.<name>` OCCURRENCE
 * from the pinned live definition onward. A migration whose dynamic SQL the
 * oracle cannot resolve is recorded as a named barrier, never an invented
 * absence; independently inspectable successors are still censused so one
 * barrier cannot hide later static evidence.
 *
 * OCCURRENCES, NOT FILENAMES, AND A FRESH REGEX PER FILE (#451 Codex round 2,
 * item 3 — a bug in this gate, not in the code it guards). The previous version
 * built ONE global regex and called `.test()` on each file in a `filter`. A global
 * regex carries `lastIndex` across calls, so `.test()` resumed mid-way through the
 * next file and could miss a definition near its start; and returning filenames
 * collapsed two definitions in ONE file into a single entry. Either way the census
 * could report "exactly one" while the corpus held two — the precise failure this
 * cell exists to catch. Ironic and instructive: a stateful module-level regex is
 * the same hazard the cache-safety cell now bans by name.
 */
function viewDefinitions(
  view: string,
  expectedFile: string,
  corpus: MigrationCorpus = DEFAULT_MIGRATION_CORPUS,
): { definitions: { file: string; offset: number }[]; blockedAt: string[] } {
  const out: { file: string; offset: number }[] = [];
  const blockedAt: string[] = [];
  const first = corpus.files.indexOf(expectedFile);
  assert.notEqual(first, -1, `the pinned live migration ${expectedFile} is absent`);
  for (const file of corpus.files.slice(first)) {
    let offsets: number[];
    try {
      offsets = viewDefinitionOffsets(corpus.read(file), view, file);
    } catch (error) {
      assert.match(
        error instanceof Error ? error.message : String(error),
        new RegExp(`^unmodelled: unresolved dynamic SQL at ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:`),
      );
      const reviewed = REVIEWED_DYNAMIC_SQL_BARRIERS.get(file);
      if (reviewed === undefined) {
        throw new Error(`unmodelled: unreviewed dynamic-SQL barrier at ${file} - the successor census cannot prove this migration unrelated`);
      }
      const actualSha256 = createHash("sha256").update(corpus.read(file), "utf8").digest("hex");
      assert.equal(actualSha256, reviewed.sha256, `reviewed dynamic-SQL barrier sha256 mismatch at ${file}`);
      assert.ok(reviewed.reason.length >= 40, `${file}'s reviewed barrier reason is too thin`);
      blockedAt.push(file);
      continue;
    }
    for (const offset of offsets) out.push({ file, offset });
  }
  return { definitions: out, blockedAt };
}

/** The pinned body plus every successor the oracle can positively inspect. */
function theOnlyDefinition(view: string, expectedFile: string): void {
  const census = viewDefinitions(view, expectedFile);
  const defs = census.definitions;
  assert.deepEqual(
    defs.map((d) => `${d.file}@${d.offset}`),
    defs.length === 1 && defs[0]?.file === expectedFile
      ? [`${expectedFile}@${defs[0].offset}`]
      : [`${expectedFile}@<exactly one>`],
    `clara.${view} must have exactly ONE statement-level definition, in ${expectedFile} — re-run the rung-0 census`,
  );
  assert.deepEqual(
    census.blockedAt,
    [...REVIEWED_DYNAMIC_SQL_BARRIERS.keys()],
    `clara.${view}'s successor census did not record exactly the reviewed unresolved-dynamic-SQL barriers`,
  );
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

describe("the projections are the DB's own declared column contracts", () => {
  it("clara.caller_context has ONE pinned body — successors stop at the exact reviewed dynamic barriers", () => {
    theOnlyDefinition("caller_context", "0141_p4_tranche1_invite_rbac.sql");
  });

  it("caller_context's 6-column contract matches CALLER_CONTEXT_SELECT byte for byte", () => {
    const declared = declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "caller_context");
    assert.equal(declared.count, 6);
    assert.equal(declared.columns, CALLER_CONTEXT_SELECT);
    assert.equal(CALLER_CONTEXT_SELECT.split(",").length, declared.count);
  });

  it("clara.firm_registration_requests_visible has ONE pinned body — successors stop at the exact reviewed dynamic barriers", () => {
    theOnlyDefinition(
      "firm_registration_requests_visible",
      "0145_p4_tranche2_registration_operator_alias.sql",
    );
  });

  it("VACUITY CONTROL: the census counts OCCURRENCES, not files", () => {
    // Two definitions in ONE input must count as two. The previous version
    // returned FILENAMES from a `filter`, so a file defining the view twice
    // reported "exactly one" — the precise failure the census exists to catch.
    const count = (sql: string) => {
      const re = new RegExp("create\\s+(or\\s+replace\\s+)?view\\s+clara\\.probe\\b", "gi");
      return [...lexSql(sql).statements.matchAll(re)].length;
    };
    assert.equal(
      count("create view clara.probe as select 1;\ncreate or replace view clara.probe as select 2;"),
      2,
      "two definitions in one file collapsed into one",
    );
    assert.equal(count("create view clara.probe as select 1;"), 1);
    assert.equal(count("select 1;"), 0);
  });

  it("VACUITY CONTROL: the OLD `.test()` technique really did skip — matchAll does not", () => {
    // Honest record of why the technique changed, and a live demonstration that
    // the hazard is real rather than a story. A global regex reused across
    // `.test()` calls carries `lastIndex` and resumes mid-way through the NEXT
    // input, so a definition near its start is missed. `matchAll` is immune
    // because it iterates over an internal clone — which is also why simply
    // sharing the regex object is no longer a bug, and why the mutant that only
    // shares it stays green.
    const inputs = ["-- pad --\ncreate view clara.probe as select 1;", "create view clara.probe as select 2;"];
    const shared = /create\s+view\s+clara\.probe\b/gi;
    const stateful = inputs.filter((s) => shared.test(s));
    assert.equal(stateful.length, 1, "the stateful hazard has stopped reproducing — re-examine this control");

    const sound = inputs.filter((s) => [...s.matchAll(/create\s+view\s+clara\.probe\b/gi)].length > 0);
    assert.equal(sound.length, 2, "matchAll must see both");
  });

  it("PIN SQL-10: a second, unreviewed dynamic-SQL barrier fails the successor census", () => {
    const scratch = mkdtempSync(join(tmpdir(), "clara-scope-census-"));
    try {
      const files = [
        ["0141_base.sql", "create view clara.probe as select 1;"],
        ["0146_ninth_rowkind_seeding_proposal.sql", migration("0146_ninth_rowkind_seeding_proposal.sql")],
        ["0147_unreviewed_successor.sql", "do $$ begin execute later_sql; end $$;"],
      ] as const;
      for (const [file, sql] of files) writeFileSync(join(scratch, file), sql, "utf8");
      const corpus: MigrationCorpus = {
        files: readdirSync(scratch).sort(),
        read: (file) => readFileSync(join(scratch, file), "utf8"),
      };
      assert.throws(
        () => viewDefinitions("probe", "0141_base.sql", corpus),
        /unmodelled: unreviewed dynamic-SQL barrier at 0147_unreviewed_successor\.sql/,
      );
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("PIN N1: an edited reviewed barrier fails its content-addressed identity pin", () => {
    const barrier = "0146_ninth_rowkind_seeding_proposal.sql";
    const corpus: MigrationCorpus = {
      files: ["0141_base.sql", barrier],
      read: (file) => file === barrier
        ? `${migration(barrier)}\n-- edited after review`
        : "create view clara.probe as select 1;",
    };
    assert.throws(
      () => viewDefinitions("probe", "0141_base.sql", corpus),
      /reviewed dynamic-SQL barrier sha256 mismatch at 0146_ninth_rowkind_seeding_proposal\.sql/,
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
    // not a hand-written lookalike.
    //
    // TWO VIEWS, ONE OFFSET (#451 Codex round 2, item 4). The CHECK has to be
    // found at STATEMENT level — a decoy inside a comment, a string or a
    // dollar-quoted body must not count — but the role NAMES live in string
    // literals, which the statement view masks. Because the lexer's masking is
    // length-preserving, the match found in `statements` addresses the same bytes
    // in `withoutComments`: locate it in the view that proves it is real, read it
    // from the view that still carries its values.
    const { withoutComments, statements } = lexSql(migration("0002_foundation.sql"));
    assert.equal(withoutComments.length, statements.length, "the lexer's views fell out of alignment");

    const re = /role\s+text\s+not null\s+check\s*\(\s*role\s+in\s*\(([^)]*)\)/i;
    const atStatementLevel = re.exec(statements);
    assert.ok(
      atStatementLevel,
      "0002 no longer declares firm_memberships.role's CHECK at statement level where this gate can read it",
    );
    const start = atStatementLevel.index;
    const values = withoutComments.slice(start, start + atStatementLevel[0].length);
    const declared = [...values.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(
      declared,
      [...FIRM_ROLES].sort(),
      "the DB's role ladder and lib/firm/caller-context.ts's FIRM_ROLES have drifted — every member holding the new role would be denied",
    );
  });
});

const APPLICANT = "44444444-4444-4444-8444-444444444444";
const testSession: SessionTokenAccessor = { getAccessToken: async () => "test-token" };
const SESSION: ServerSession = { accessToken: "test-token", subject: APPLICANT, email: null };

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
    assert.deepEqual((result as { rows: readonly unknown[] }).rows, []);
    assert.equal(
      (result as { subject: string }).subject,
      SESSION.subject,
      "the mapper cannot bind hydrated rows unless the verified subject survives the read seam",
    );
    assert.deepEqual(
      result.ok ? result.context : null,
      { ok: false, reason: "no_membership" },
      "zero registration rows were treated as membership evidence",
    );
    assert.equal(calls.length, 2, "the holding read did not positively ask both relations");
    const urls = calls.map((call) => new URL(call));
    const registrations = urls.find((url) => url.pathname.endsWith("/firm_registration_requests_visible"));
    const context = urls.find((url) => url.pathname.endsWith("/caller_context"));
    assert.equal(registrations?.searchParams.get("applicant"), `eq.${APPLICANT}`);
    assert.equal(context?.searchParams.get("limit"), "2");
  });

  it("RED-before: collapsing both into [] makes the two indistinguishable", async () => {
    const collapsed = async (session: ServerSession | null) => (session === null ? [] : []);
    assert.deepEqual(await collapsed(null), await collapsed(SESSION));
    const a = await loadOwnRegistrationRequests({ resolveSession: async () => null });
    const b = await loadOwnRegistrationRequests({ resolveSession: async () => SESSION });
    assert.notDeepEqual(a, b, "the two answers must not be the same value");
  });
});
