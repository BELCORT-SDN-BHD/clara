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
import { readFileSync, readdirSync } from "node:fs";
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

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

function migration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
}

/** Every migration carrying a plain `create [or replace] function clara.<name>(`.
 *  Sorted by filename, so the LAST entry is the live body — unless something
 *  splices it dynamically, which the census below checks separately. */
function functionDefiners(fn: string): string[] {
  const re = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+clara\\.${fn}\\s*\\(`, "i");
  return MIGRATION_FILES.filter((f) => re.test(migration(f)));
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

describe("the role ladder is clara.role_rank's own mapping", () => {
  it("ROLE_LADDER's order IS the SQL's case expression, parsed out of 0002", () => {
    const sql = migration("0002_foundation.sql");
    const body = /create function clara\.role_rank\(p_role text\)[\s\S]*?\$\$;/.exec(sql)?.[0];
    assert.ok(body, "clara.role_rank's body was not found — re-census before trusting ROLE_LADDER");
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
