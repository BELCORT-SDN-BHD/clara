// THE MEMBERS DOOR-WRAPPER SUITE (P4-4) — and the mechanised rung-0 census
// behind it.
//
// A wrapper module's own claims are the cheapest place for a citation to rot: a
// comment that says "LIVE BODY 0147:372" stays green forever no matter what
// `0156` does to the body. So this file does three things a comment cannot:
//
//  1. RE-DERIVES THE LIVE-BODY CENSUS from the migration corpus on every run. For
//     each of the five doors and both views it collects every file carrying a
//     `create [or replace] function|view clara.<name>`, asserts the LAST one is
//     the file this module cites, and carries a vacuity control proving the
//     detector can find anything at all. A later migration replacing any of them
//     reds this file and forces a re-census instead of leaving a stale comment.
//  2. PINS BOTH PROJECTIONS to the column contract the migration itself declares,
//     PARSED out of the .sql rather than retyped — review law 3, spelling is not
//     identity. The idiom is `tests/firm-scope-surfaces.test.ts`'s, deliberately:
//     the same instrument, not a second habit.
//  3. ASSERTS WHAT REACHES THE WIRE — the relation, the `select=`, the ordering,
//     the RPC name and every argument NAME — because a wrapper that posts
//     `p_membership_id` to a door expecting `p_membership` typechecks perfectly
//     and fails only against a real database.
//
// It also proves the one thing the ROLE LADDER rests on: that `ROLE_LADDER`'s
// order IS `clara.role_rank`'s own `case` mapping, read out of `0002`.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  ADMIN_RANK,
  FIRM_INVITES_RELATION,
  FIRM_INVITES_SELECT,
  FIRM_MEMBERS_RELATION,
  FIRM_MEMBERS_SELECT,
  INVITE_STATUSES,
  MEMBERSHIP_STATUSES,
  ROLE_LADDER,
  isKnownInviteStatus,
  isKnownMembershipStatus,
  loadFirmInvites,
  loadFirmMembers,
  roleRank,
} from "./reads";
import { addMember, removeMember, revokeInvite, setMemberRole } from "./doors";
import type { SessionTokenAccessor } from "@/lib/session";
import { semanticFunctionOperations } from "../../test/sqlFunctionCensus";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function migration(name: string, dir = MIGRATIONS_DIR): string {
  return readFileSync(join(dir, name), "utf8");
}

/** Every migration carrying a plain definition OR a dynamic body splice for
 *  `clara.<name>`. Sorted by filename, so the LAST entry owns the live body. */
function functionDefiners(fn: string, dir = MIGRATIONS_DIR): string[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+clara\\.${fn}\\s*\\(`, "i");
  const dynamicName = new RegExp(`v_name\\s+text\\s*:=\\s*'${fn}'`, "i");
  return files.filter((f) => {
    const sql = migration(f, dir);
    return re.test(sql) || (/execute\s+replace\(\s*v_head/i.test(sql) && dynamicName.test(sql));
  });
}

function viewDefiners(view: string): string[] {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?view\\s+clara\\.${view}\\b`, "i");
  return MIGRATION_FILES.filter((f) => re.test(migration(f)));
}

/** The `('<relation>', <n>, '<cols>')` column contract a migration registers in
 *  its own tail census. Parsed, never retyped. */
function declaredContract(sql: string, relation: string): { count: number; columns: string } {
  const m = new RegExp(`\\(\\s*'${relation}'\\s*,\\s*(\\d+)\\s*,\\s*'([^']+)'\\s*\\)`).exec(sql);
  assert.ok(m, `no column contract for '${relation}' — the migration stopped declaring it`);
  const [, count, columns] = m;
  assert.ok(typeof count === "string" && typeof columns === "string");
  return { count: Number(count), columns };
}

const M0141 = "0141_p4_tranche1_invite_rbac.sql";
const M0145 = "0145_p4_tranche2_registration_operator_alias.sql";
const M0147 = "0147_db_hardening_b_hash_only_bearer_tokens.sql";

function pinnedRoleRankBody(dir = MIGRATIONS_DIR): string {
  const operations = semanticFunctionOperations(dir, "role_rank");
  let live: (typeof operations)[number] | null = null;
  for (const operation of operations) live = operation.kind === "define" ? operation : null;
  assert.ok(live !== null, "clara.role_rank has no final LIVE definition — re-census before trusting ROLE_LADDER");
  assert.ok(live.definition !== null, "clara.role_rank's final definition was not retained by the semantic census");
  return live.definition;
}

describe("rung 0 — the live bodies this module cites are still the live bodies", () => {
  it("VACUITY CONTROL: the migration corpus was actually read", () => {
    assert.ok(MIGRATION_FILES.length > 100, `only ${MIGRATION_FILES.length} migrations found at ${MIGRATIONS_DIR}`);
  });

  it("VACUITY CONTROL: the definer detector finds a known door, and misses a fictional one", () => {
    assert.ok(functionDefiners("invite_member").length > 0, "the detector cannot see a door it is pointed straight at");
    assert.deepEqual(functionDefiners("no_such_door_exists"), []);
  });

  it("invite_member's live body is 0147, NOT the 0141 that first created it", () => {
    const definers = functionDefiners("invite_member");
    assert.deepEqual(definers, [M0141, M0145, M0147]);
    assert.equal(definers.at(-1), M0147, "lib/members/doors.ts cites 0147:372 — re-census if this moved");
  });

  it("revoke_invite is created exactly once, at 0141", () => {
    assert.deepEqual(functionDefiners("revoke_invite"), [M0141]);
  });

  it("set_member_role's live body is 0145, over 0004 and 0005", () => {
    const definers = functionDefiners("set_member_role");
    assert.deepEqual(definers, ["0004_governed_fns.sql", "0005_event_spine.sql", M0145]);
  });

  it("remove_member's live body is 0005, over 0004 — and nothing later touches it", () => {
    assert.deepEqual(functionDefiners("remove_member"), ["0004_governed_fns.sql", "0005_event_spine.sql"]);
  });

  it("add_member's live body is 0145, over 0004/0005/0141", () => {
    const definers = functionDefiners("add_member");
    assert.deepEqual(definers, ["0004_governed_fns.sql", "0005_event_spine.sql", M0141, M0145]);
  });

  it("no migration DYNAMICALLY splices any of the five (the superseded-body trap)", () => {
    // `0119` and `0129` rewrite live bodies through `execute replace(v_head, …)`,
    // which a plain `create` grep cannot see. Their targets are named literally in
    // their own source, so this asserts none of the five appears inside such a
    // splice — the census's blind spot, closed rather than assumed away.
    const spliceFiles = MIGRATION_FILES.filter((f) => /execute\s+replace\(\s*v_head/i.test(migration(f)));
    assert.ok(spliceFiles.length > 0, "VACUITY CONTROL: no dynamic-splice migration found at all");
    for (const file of spliceFiles) {
      const sql = migration(file);
      for (const fn of ["invite_member", "revoke_invite", "set_member_role", "remove_member", "add_member"]) {
        assert.doesNotMatch(
          sql,
          new RegExp(`v_name\\s+text\\s*:=\\s*'${fn}'`),
          `${file} splices ${fn} — lib/members/doors.ts's census is stale`,
        );
      }
    }
  });

  it("the last-owner trigger function is created ONCE and never replaced", () => {
    // `_tf_guard_last_owner` is the CLR09 the surface renders and never pre-empts.
    assert.deepEqual(functionDefiners("_tf_guard_last_owner"), ["0003_books_core.sql"]);
    assert.match(migration("0003_books_core.sql"), /cannot demote\/remove the last active owner/);
  });

  it("both views have ONE live body, at 0141", () => {
    assert.deepEqual(viewDefiners("firm_members_visible"), [M0141]);
    assert.deepEqual(viewDefiners("firm_invites_visible"), [M0141]);
  });
});

describe("the projections are the DB's own declared column contracts", () => {
  it("firm_members_visible's 9-column contract matches FIRM_MEMBERS_SELECT byte for byte", () => {
    const declared = declaredContract(migration(M0141), "firm_members_visible");
    assert.equal(declared.count, 9);
    assert.equal(declared.columns, FIRM_MEMBERS_SELECT);
    assert.equal(FIRM_MEMBERS_SELECT.split(",").length, declared.count);
  });

  it("firm_invites_visible's 10-column contract matches FIRM_INVITES_SELECT byte for byte", () => {
    const declared = declaredContract(migration(M0141), "firm_invites_visible");
    assert.equal(declared.count, 10);
    assert.equal(declared.columns, FIRM_INVITES_SELECT);
    assert.equal(FIRM_INVITES_SELECT.split(",").length, declared.count);
  });

  it("the roster projection NEVER names token_hash, and the invite one never does either", () => {
    assert.ok(!FIRM_INVITES_SELECT.includes("token_hash"));
    assert.ok(!FIRM_MEMBERS_SELECT.includes("token_hash"));
  });

  it("VACUITY CONTROL: the contract parser fails loudly on a relation it cannot find", () => {
    assert.throws(() => declaredContract(migration(M0141), "no_such_relation"), /no column contract/);
  });
});

describe("every FILE these modules cite actually exists", () => {
  // LOW-12 (independent review of #455). `lib/members/reads.ts` pointed a reader
  // at `components/admin/members-roster.tsx` for the withheld-email behaviour —
  // a file that has never existed in this tree; the roster table is a
  // module-level component inside `members-panel.tsx`. Nothing caught it because
  // a comment is not executable.
  //
  // Prose is not usually checkable. A BACKTICKED PATH is: it either resolves or
  // it does not, and `tests/firm-scope-db-pins.test.ts` already established the
  // idiom one layer up (its "a module that NAMES its pinning test must name one
  // that really pins it" cell). This is the same instrument over this train's
  // own modules.
  const CITING = [
    "lib/members/reads.ts",
    "lib/members/doors.ts",
    "lib/members/courier.ts",
    "lib/members/invite-mail.ts",
    "components/admin/members-panel.tsx",
    "components/admin/member-row-menu.tsx",
    "components/admin/invite-dialog.tsx",
    "components/admin/members-confirm-dialog.tsx",
  ];
  /** A backticked repo-relative path with a source extension. Deliberately NOT
   *  every backticked token: `0147:372` and `p_op_key` are citations of other
   *  kinds, checked by other cells in this file. */
  const CITATION = /`((?:app|lib|components|tests|test|scripts|messages)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|mjs|json|txt))`/g;

  for (const module of CITING) {
    it(`${module} cites no path that fails to resolve`, () => {
      const src = readFileSync(join(WEB_ROOT, module), "utf8");
      const cited = [...src.matchAll(CITATION)].map((m) => m[1] as string);
      for (const path of new Set(cited)) {
        assert.ok(
          existsSync(join(WEB_ROOT, path)),
          `${module} points a reader at ${path}, which does not exist — a citation nobody can follow`,
        );
      }
    });
  }

  it("VACUITY CONTROL: the walk finds real citations, and would catch a fake one", () => {
    // Without this the cells above are equally green on a regex that matches
    // nothing — the absence-from-the-wrong-instrument class, and the reason this
    // defect survived review in the first place.
    const found = CITING.flatMap((module) => [
      ...readFileSync(join(WEB_ROOT, module), "utf8").matchAll(CITATION),
    ]).map((m) => m[1] as string);
    assert.ok(found.length >= 10, `only ${found.length} citations were seen across ${CITING.length} modules`);
    assert.ok(
      found.some((p) => existsSync(join(WEB_ROOT, p))),
      "not one cited path resolved — the walk is reading the wrong root",
    );
    const fake = [...'`components/admin/members-roster.tsx`'.matchAll(CITATION)].map((m) => m[1] as string);
    assert.deepEqual(fake, ["components/admin/members-roster.tsx"], "the regex no longer recognises the shape it exists for");
    assert.equal(existsSync(join(WEB_ROOT, fake[0] as string)), false, "…and that path really is the one that does not resolve");
  });
});

describe("the role ladder is clara.role_rank's own mapping", () => {
  it("ROLE_LADDER's order IS the LIVE SQL case expression, found by the all-migration census", () => {
    const body = pinnedRoleRankBody();
    // Read the pairs the SQL actually declares, in its own order, rather than
    // asserting a list this file typed out.
    const pairs = [...body.matchAll(/when '([a-z]+)' then (\d+)/g)].map(([, role, rank]) => ({
      role,
      rank: Number(rank),
    }));
    assert.equal(pairs.length, 4, "clara.role_rank no longer declares exactly four roles");
    for (const { role, rank } of pairs) {
      assert.equal(ROLE_LADDER[rank], role, `role_rank('${role}') = ${rank}, but ROLE_LADDER[${rank}] is ${ROLE_LADDER[rank]}`);
      assert.equal(roleRank(role!), rank);
    }
    assert.equal(roleRank("admin"), ADMIN_RANK, "ADMIN_RANK must be the rank the SQL gives 'admin'");
    // `else null` — an out-of-ladder role ranks NULL, never a number.
    assert.match(body, /else null end/);
    assert.equal(roleRank("wizard"), null);
  });

  it("RED-BEFORE: EXECUTE format with concatenated head and %I.%I target becomes the LIVE role_rank body", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(
        join(fixture, "0002_foundation.sql"),
        "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select case p_role when 'viewer' then 0 when 'bookkeeper' then 1 when 'admin' then 2 when 'owner' then 3 else null end $$;\n",
      );
      writeFileSync(
        join(fixture, "9999_role_rank_recut.sql"),
        "do $$ declare v_schema text := 'clara'; v_name text := 'role_rank'; v_head text := 'create or replace func' || 'tion '; begin execute format('%s%I.%I(text) returns integer language sql as ''select 7''', v_head, v_schema, v_name); end $$;\n",
      );
      assert.match(pinnedRoleRankBody(fixture), /select 7/, "the formatted dynamic redefinition did not become LIVE");
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("RED-BEFORE N1: the LIVE role_rank body is the final define after define/drop/redefine", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(
        join(fixture, "0001_history.sql"),
        "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select 0 $$;\n" +
          "drop function clara.role_rank(text);\n" +
          "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select case p_role when 'viewer' then 0 when 'bookkeeper' then 1 when 'admin' then 2 when 'owner' then 3 else null end $$;\n",
      );
      assert.match(
        pinnedRoleRankBody(fixture),
        /when 'admin' then 2/,
        "the consumer must derive the final live definition, not demand one historical occurrence",
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("RED-BEFORE N1: plain and both dollar-quoted EXECUTEs enter ordered history; commented DROP does not", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(
        join(fixture, "0001_define.sql"),
        "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select 0 $$;\n",
      );
      writeFileSync(
        join(fixture, "0002_plain.sql"),
        "do $body$ begin execute 'drop function clara.role_rank(text)'; end $body$;\n",
      );
      writeFileSync(
        join(fixture, "0003_bare_dollar.sql"),
        "do $body$ begin execute $$create function clara.role_rank(p_role text) returns int language sql as 'select 1'$$; end $body$;\n",
      );
      writeFileSync(
        join(fixture, "0004_tagged_dollar.sql"),
        "do $body$ begin execute $ddl$drop function clara.role_rank(text)$ddl$; end $body$;\n",
      );
      writeFileSync(
        join(fixture, "0005_format.sql"),
        "do $$ declare v_schema text := 'clara'; v_name text := 'role_rank'; begin execute format('create function %I.%I(p_role text) returns int language sql as ''select 2''', v_schema, v_name); end $$;\n",
      );
      writeFileSync(
        join(fixture, "0006_comments.sql"),
        "-- drop function clara.role_rank(text);\n/* drop function clara.role_rank(text); */\n",
      );
      assert.deepEqual(
        semanticFunctionOperations(fixture, "role_rank").map(({ file, kind }) => ({ file, kind })),
        [
          { file: "0001_define.sql", kind: "define" },
          { file: "0002_plain.sql", kind: "drop" },
          { file: "0003_bare_dollar.sql", kind: "define" },
          { file: "0004_tagged_dollar.sql", kind: "drop" },
          { file: "0005_format.sql", kind: "define" },
        ],
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("RED-BEFORE N1: an opaque EXECUTE fails closed with a named census error", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(join(fixture, "0001_opaque.sql"), "do $$ begin execute v_opaque_ddl; end $$;\n");
      assert.throws(
        () => semanticFunctionOperations(fixture, "role_rank"),
        /sql_function_census_unresolved_execute/,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("RED-BEFORE: a second definition in the same migration supersedes the first", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(
        join(fixture, "0002_foundation.sql"),
        "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select 0 $$;\n" +
          "create or replace function clara.role_rank(p_role text) returns int language sql immutable as $$ select 7 $$;\n",
      );
      assert.match(pinnedRoleRankBody(fixture), /select 7/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("RED-BEFORE: a later DROP invalidates the role_rank pin", () => {
    const fixture = mkdtempSync(join(tmpdir(), "clara-role-rank-"));
    try {
      writeFileSync(
        join(fixture, "0002_foundation.sql"),
        "create function clara.role_rank(p_role text) returns int language sql immutable as $$ select 0 $$;\n",
      );
      writeFileSync(join(fixture, "9999_drop.sql"), "drop function clara.role_rank(text);\n");
      assert.throws(() => pinnedRoleRankBody(fixture), /no final LIVE/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("the two closed status worlds match the DB's own CHECK constraints", () => {
    const m0141 = migration(M0141);
    const m0002 = migration("0002_foundation.sql");
    // firm_invites.status's CHECK (0141:181) — the view's synthesised `expired`
    // widens no domain, which is why one closed set covers both.
    const inviteCheck = /status\s+text\s+not null default 'pending' check \(status in \(([^)]+)\)\)/.exec(m0141)?.[1];
    assert.ok(inviteCheck, "firm_invites.status's CHECK was not found");
    const inviteValues = [...inviteCheck.matchAll(/'([a-z]+)'/g)].map(([, v]) => v).sort();
    assert.deepEqual(inviteValues, [...INVITE_STATUSES].sort());
    for (const v of INVITE_STATUSES) assert.equal(isKnownInviteStatus(v), true);
    assert.equal(isKnownInviteStatus("delivered"), false, "there is no delivery state and there must never be one");

    const memberCheck = /status\s+text\s+not null default 'active' check \(status in \(([^)]+)\)\)/.exec(m0002)?.[1];
    assert.ok(memberCheck, "firm_memberships.status's CHECK was not found");
    const memberValues = [...memberCheck.matchAll(/'([a-z]+)'/g)].map(([, v]) => v).sort();
    assert.deepEqual(memberValues, [...MEMBERSHIP_STATUSES].sort());
    assert.equal(isKnownMembershipStatus("suspended"), false);
  });
});

// ---------------------------------------------------------------------------
// WHAT ACTUALLY REACHES THE WIRE
// ---------------------------------------------------------------------------

type Call = { url: string; method: string; body: unknown };

describe("what the reads and the four direct doors put on the wire", () => {
  const realFetch = globalThis.fetch;
  const hadUrl = Object.hasOwn(process.env, "NEXT_PUBLIC_SUPABASE_URL");
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const session: SessionTokenAccessor = { getAccessToken: async () => "test-token" };
  let calls: Call[] = [];

  before(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rig.supabase.test";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      let body: unknown = null;
      if (typeof init?.body === "string") body = JSON.parse(init.body);
      calls.push({ url, method: init?.method ?? "GET", body });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
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

  it("loadFirmMembers reads the roster view with the pinned projection, oldest first", async () => {
    await loadFirmMembers(session);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0]!.url);
    assert.ok(url.pathname.endsWith(`/rest/v1/${FIRM_MEMBERS_RELATION}`), url.pathname);
    assert.equal(url.searchParams.get("select"), FIRM_MEMBERS_SELECT);
    assert.equal(url.searchParams.get("order"), "created_at.asc");
    // NO client-side status filter: removed rows are published by the view and
    // this module does not decide what the roster is.
    assert.equal(url.searchParams.get("status"), null);
  });

  it("loadFirmInvites reads the invite view with the pinned projection, newest first", async () => {
    await loadFirmInvites(session);
    const url = new URL(calls[0]!.url);
    assert.ok(url.pathname.endsWith(`/rest/v1/${FIRM_INVITES_RELATION}`), url.pathname);
    assert.equal(url.searchParams.get("select"), FIRM_INVITES_SELECT);
    assert.equal(url.searchParams.get("order"), "created_at.desc");
  });

  it("setMemberRole posts p_membership / p_role / p_op_key, and nothing else", async () => {
    await setMemberRole(session, "m-1", "bookkeeper");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, "POST");
    assert.ok(calls[0]!.url.endsWith("/rest/v1/rpc/set_member_role"), calls[0]!.url);
    const body = calls[0]!.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["p_membership", "p_op_key", "p_role"]);
    assert.equal(body.p_membership, "m-1");
    assert.equal(body.p_role, "bookkeeper");
    assert.equal(typeof body.p_op_key, "string");
    assert.notEqual(body.p_op_key, "");
  });

  it("removeMember posts p_membership / p_op_key", async () => {
    await removeMember(session, "m-2");
    assert.ok(calls[0]!.url.endsWith("/rest/v1/rpc/remove_member"));
    const body = calls[0]!.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["p_membership", "p_op_key"]);
    assert.equal(body.p_membership, "m-2");
  });

  it("revokeInvite posts p_invite / p_op_key", async () => {
    await revokeInvite(session, "i-1");
    assert.ok(calls[0]!.url.endsWith("/rest/v1/rpc/revoke_invite"));
    const body = calls[0]!.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["p_invite", "p_op_key"]);
    assert.equal(body.p_invite, "i-1");
  });

  it("addMember posts all four arguments in the door's own names", async () => {
    // No component calls this — see lib/members/doors.ts's own note: no read
    // available to `clara_authenticated` publishes a `user_id` for someone who is
    // NOT already in the firm, so a control would be a fake one. The WRAPPER is
    // still proven, so the seam is one line the day that read exists.
    await addMember(session, "f-1", "u-1", "viewer");
    assert.ok(calls[0]!.url.endsWith("/rest/v1/rpc/add_member"));
    const body = calls[0]!.body as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), ["p_firm", "p_op_key", "p_role", "p_user"]);
    assert.equal(body.p_firm, "f-1");
    assert.equal(body.p_user, "u-1");
    assert.equal(body.p_role, "viewer");
  });

  it("every op_key is FRESH per attempt — a replayed key would return a stale receipt", async () => {
    await setMemberRole(session, "m-1", "admin");
    await setMemberRole(session, "m-1", "admin");
    const first = (calls[0]!.body as Record<string, unknown>).p_op_key;
    const second = (calls[1]!.body as Record<string, unknown>).p_op_key;
    assert.notEqual(first, second);
  });

  it("NO door in this module names an email or a token argument", async () => {
    // The email lives in the JWT for `accept_invite` and in the courier's own
    // request for `invite_member`; nothing here may carry either, and no wrapper
    // here may carry a token at all.
    await setMemberRole(session, "m-1", "admin");
    await removeMember(session, "m-2");
    await revokeInvite(session, "i-1");
    await addMember(session, "f-1", "u-1", "viewer");
    for (const call of calls) {
      const keys = Object.keys(call.body as Record<string, unknown>);
      assert.ok(!keys.some((k) => /email|token/i.test(k)), `${call.url} carries ${keys.join(",")}`);
    }
  });

  it("the four direct doors go through callDoor's RPC path, never a hand-rolled query", async () => {
    await setMemberRole(session, "m-1", "admin");
    await removeMember(session, "m-2");
    await revokeInvite(session, "i-1");
    await addMember(session, "f-1", "u-1", "viewer");
    assert.equal(calls.length, 4);
    for (const call of calls) {
      assert.equal(call.method, "POST");
      assert.match(call.url, /\/rest\/v1\/rpc\//);
    }
  });
});
