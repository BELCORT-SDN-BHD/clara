// THE CAPABILITY PINS (E-7 / CB-AE2E-014 / CB-AE2E-033, 裁-187).
//
// Two jobs, and the first is the one that matters most: every floor
// `lib/firm/capabilities.ts` mirrors is PARSED OUT OF THE MIGRATION IT CITES,
// never retyped here. Review law 3 — a floor written from memory is a projection
// of the database's rule, not the rule. A capability that silently drifts above
// its door's floor hides a control from someone entitled to it; one that drifts
// below offers a control that can only refuse, which is the exact defect the
// owner reported.
//
// THE CITATION IS PROVEN LIVE, not merely present — and "live" has to mean
// SURVIVING, not merely last-created. `set_member_role` alone has four creations
// across 0004/0005/0145/0157, and citing any but the last would cite a
// superseded wall; worse, `sign_vendor_identity_binding`'s two-argument body was
// DROPPED outright at `0154:2725` and replaced by a three-argument one, so its
// last CREATE-of-that-overload is a body no caller can reach. This file cited
// exactly that dead body until review-550 caught it.
//
// So the live-body check walks `test/sqlFunctionCensus.ts`'s
// `semanticFunctionOperations` — every define AND drop of the name, in migration
// order, with dynamic `EXECUTE` splices rendered rather than skipped — and takes
// the survivors, exactly as `lib/command/do-action-floors.test.ts:57-66` and
// `lib/members/members-doors.test.ts` already do. Reusing that instrument rather
// than hand-rolling a third regex census is the no-second-implementation law;
// the mutant panel points a citation at the dropped body and requires this file
// to go red.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIRM_CAPABILITY_CONJUNCTS,
  FIRM_CAPABILITY_FLOORS,
  assignableRoles,
  canActOnMemberOfRole,
  capabilityScopeFromRows,
  firmCapabilities,
  firmCapabilitiesFromRows,
  type FirmCapabilities,
} from "./capabilities";
import type { CallerContextRow } from "./caller-context";
import { semanticFunctionOperations } from "../../test/sqlFunctionCensus";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "packages", "db", "migrations");

/** Comments blanked, every offset and newline preserved, so a line number in a
 *  citation still lands on the same line and a COMMENTED-OUT floor can never be
 *  read as evidence. Single-quoted values are kept — they are the roles. */
function stripSqlComments(sql: string): string {
  let out = "";
  for (let i = 0; i < sql.length; ) {
    if (sql.slice(i, i + 2) === "--") {
      while (i < sql.length && sql[i] !== "\n") { out += " "; i += 1; }
      continue;
    }
    if (sql.slice(i, i + 2) === "/*") {
      while (i < sql.length && sql.slice(i, i + 2) !== "*/") { out += sql[i] === "\n" ? "\n" : " "; i += 1; }
      out += "  ";
      i += 2;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

const migrationCache = new Map<string, string[]>();
function migrationLines(file: string): string[] {
  const cached = migrationCache.get(file);
  if (cached) return cached;
  const lines = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8")).split("\n");
  migrationCache.set(file, lines);
  return lines;
}

// (The hand-rolled migration walk that used to live here went with the
// `creationSites` helper it fed — `semanticFunctionOperations` does the walking
// now, drops included.)

test("FIRM_CAPABILITY_FLOORS: every cited line declares the role the capability mirrors", () => {
  assert.ok(FIRM_CAPABILITY_FLOORS.length >= 9, "the mirror table must not have been emptied");
  for (const row of FIRM_CAPABILITY_FLOORS) {
    const line = migrationLines(row.migration)[row.line - 1];
    assert.ok(line !== undefined, `${row.migration}:${row.line} does not exist`);
    const expected = `clara._human_ctx(clara.role_rank('${row.role}'))`;
    assert.ok(
      (line ?? "").includes(expected),
      `${row.capability} claims ${row.door} floors at '${row.role}', but ${row.migration}:${row.line} reads:\n  ${(line ?? "").trim()}`,
    );
  }
});

test("FIRM_CAPABILITY_FLOORS: each cited floor line belongs to the door it names", () => {
  // The nearest PRECEDING `create [or replace] function clara.<x>(` decides
  // which body a line sits in. Without this, a citation could land on some other
  // function's identical floor call in the same file and read as green.
  const CREATE_RE = /^create\s+(?:or\s+replace\s+)?function\s+clara\.([a-z0-9_]+)\s*\(/i;
  for (const row of FIRM_CAPABILITY_FLOORS) {
    const lines = migrationLines(row.migration);
    let owner: string | null = null;
    for (let i = row.line - 1; i >= 0; i -= 1) {
      const m = CREATE_RE.exec((lines[i] ?? "").trim());
      if (m) { owner = m[1] ?? null; break; }
    }
    assert.equal(owner, row.door, `${row.migration}:${row.line} sits inside clara.${owner}, not clara.${row.door}`);
  }
});

/** Every SURVIVING define of `clara.<door>`, in migration order — a DROP clears
 *  the list, so this answers "what is live", not "how many times the name ever
 *  appeared". The exact shape `lib/command/do-action-floors.test.ts:57-66` uses,
 *  reading the same shared census. */
function liveDefines(door: string): { file: string; definition: string; offset: number }[] {
  const out: { file: string; definition: string; offset: number }[] = [];
  for (const operation of semanticFunctionOperations(MIGRATIONS_DIR, door)) {
    if (operation.kind === "drop") { out.length = 0; continue; }
    if (operation.definition !== null) {
      out.push({ file: operation.file, definition: operation.definition, offset: operation.offset });
    }
  }
  return out;
}

/** The 1-based line an offset falls on, in the same file the census read. */
function lineAt(file: string, offset: number): number {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8").slice(0, offset).split("\n").length;
}

const FLOOR_RE = /clara\._human_ctx\(clara\.role_rank\('([a-z]+)'\)\)/;

test("FIRM_CAPABILITY_FLOORS: every citation names a SURVIVING body, and every surviving body floors at the mirrored role", () => {
  // Two independent claims, and the first is the one review-550 caught this file
  // failing: the cited (file, line) must sit inside a define that a later DROP
  // did NOT remove. `sign_vendor_identity_binding`'s two-argument body is
  // dropped at 0154:2725; a citation into it points at code no caller reaches.
  //
  // The second claim — every SURVIVING overload floors at the same role — is
  // what makes the mirrored rank right whichever overload PostgREST resolves.
  for (const row of FIRM_CAPABILITY_FLOORS) {
    const defines = liveDefines(row.door);
    assert.ok(defines.length > 0, `clara.${row.door} has no surviving definition`);

    const roles = new Set(defines.map((d) => FLOOR_RE.exec(d.definition)?.[1] ?? null));
    assert.deepEqual(
      [...roles],
      [row.role],
      `clara.${row.door} does not floor uniformly at '${row.role}' across its LIVE bodies — ` +
        defines.map((d) => `${d.file}:${lineAt(d.file, d.offset)}=${FLOOR_RE.exec(d.definition)?.[1] ?? "none"}`).join(", "),
    );

    const cited = defines.find((d) => {
      if (d.file !== row.migration) return false;
      const start = lineAt(d.file, d.offset);
      return row.line >= start && row.line < start + d.definition.split("\n").length;
    });
    assert.ok(
      cited,
      `${row.migration}:${row.line} is not inside any SURVIVING body of clara.${row.door} — live bodies are ` +
        defines.map((d) => `${d.file}:${lineAt(d.file, d.offset)}`).join(", "),
    );
  }
});

test("THE INSTRUMENT WORKS: the census really does honour a DROP", () => {
  // A guard is judgement logic and gets its own positive control. If this ever
  // returns the two-argument body, every "live body" verdict above is worthless.
  const defines = liveDefines("sign_vendor_identity_binding");
  assert.equal(defines.length, 1, `expected exactly one surviving body, got ${defines.map((d) => d.file).join(", ")}`);
  assert.equal(defines[0]?.file, "0154_binding_proposal_pr_1.sql", "the survivor is 0154's three-argument body");
  assert.match(
    defines[0]?.definition ?? "",
    /p_attestation text default null/,
    "…and it is the THREE-argument one: the two-argument overload was dropped at 0154:2725",
  );
  // And the dropped body really was defined earlier, so the census had something
  // to drop — an empty history would make the assertion above vacuous.
  const everyOperation = semanticFunctionOperations(MIGRATIONS_DIR, "sign_vendor_identity_binding");
  assert.ok(
    everyOperation.some((o) => o.kind === "drop"),
    "the census must SEE the drop, not merely fail to find the old body",
  );
  assert.ok(
    everyOperation.filter((o) => o.kind === "define").length >= 3,
    "0028, 0144 and 0154 all define this name — the census must see all three",
  );
});

test("FIRM_CAPABILITY_CONJUNCTS: the operator conjunct's cited lines really test the caller's OWN firm", () => {
  assert.equal(FIRM_CAPABILITY_CONJUNCTS.length, 2, "approve and reject each carry the conjunct");
  for (const row of FIRM_CAPABILITY_CONJUNCTS) {
    const line = (migrationLines(row.migration)[row.line - 1] ?? "").trim();
    assert.ok(line.includes("f.is_operator"), `${row.migration}:${row.line} does not read is_operator: ${line}`);
    assert.ok(line.includes("clara.jwt_firm()"), `${row.migration}:${row.line} does not scope to the caller's own firm: ${line}`);
  }
});

// --- the derivation itself --------------------------------------------------

const ALL_FALSE: FirmCapabilities = {
  canManageMembers: false,
  canInviteMember: false,
  canRevokeInvite: false,
  canDecideFirmRegistrations: false,
  canProposeVendorBinding: false,
  canRevokeVendorBinding: false,
  canSignVendorBinding: false,
};

test("firmCapabilities: the four unknown-rank shapes ALL deny — the gate fails CLOSED (裁-187)", () => {
  assert.deepEqual(firmCapabilities(null), ALL_FALSE, "no scope at all denies");
  assert.deepEqual(firmCapabilities({ role_rank: null, is_operator: true }), ALL_FALSE, "a NULL role_rank denies");
  assert.deepEqual(firmCapabilitiesFromRows(null), ALL_FALSE, "a read that has not landed denies");
  assert.deepEqual(firmCapabilitiesFromRows([]), ALL_FALSE, "zero rows denies");
  const row = (rank: number): CallerContextRow => ({
    user_id: "u", firm_id: "f", firm_name: "F", role: "owner", role_rank: rank, is_operator: true,
  });
  assert.deepEqual(firmCapabilitiesFromRows([row(3), row(3)]), ALL_FALSE, "more than one row is a structural surprise and denies");
  assert.equal(capabilityScopeFromRows([row(3), row(3)]), null, "the cardinality fold itself denies, so every consumer inherits it");
});

test("firmCapabilities: each capability turns on at exactly its own floor, and not one rank earlier", () => {
  const at = (rank: number) => firmCapabilities({ role_rank: rank, is_operator: true });
  // viewer 0 · bookkeeper 1 · admin 2 · owner 3 (clara.role_rank, 0002:326-331)
  assert.deepEqual(at(0).canProposeVendorBinding, false, "a viewer may not propose a binding");
  assert.deepEqual(at(1).canProposeVendorBinding, true, "a bookkeeper may");
  assert.deepEqual(at(1).canRevokeVendorBinding, true, "a bookkeeper may revoke one");
  assert.deepEqual(at(1).canSignVendorBinding, false, "a bookkeeper may NOT sign one — that door is admin+");
  assert.deepEqual(at(2).canSignVendorBinding, true, "an admin may sign");
  assert.deepEqual(at(1).canManageMembers, false, "a bookkeeper may not change a role or remove a member");
  assert.deepEqual(at(2).canManageMembers, true, "an admin may");
  assert.deepEqual(at(2).canInviteMember, true, "an admin may invite");
  assert.deepEqual(at(2).canRevokeInvite, true, "an admin may revoke an invite");
  assert.deepEqual(at(2).canDecideFirmRegistrations, false, "an admin may NOT decide registrations — that door is owner+");
  assert.deepEqual(at(3).canDecideFirmRegistrations, true, "an owner of an operator firm may");
});

// --- the two rank-only walls inside the members doors -----------------------
// Added in the review-550 fold. The mutant panel is what demanded them: deleting
// the `canActOnMemberOfRole` comparison outright reddened NOTHING, which meant
// the derivation had shipped with no cell of its own. An untested guard is an
// assumption wearing a function's clothes.

test("assignableRoles: the ladder is truncated at the caller's OWN rank (0157:277-279)", () => {
  const at = (rank: number | null) => assignableRoles(rank === null ? null : { role_rank: rank, is_operator: false });
  assert.deepEqual(at(0), ["viewer"], "a viewer may assign only viewer");
  assert.deepEqual(at(1), ["viewer", "bookkeeper"]);
  assert.deepEqual(at(2), ["viewer", "bookkeeper", "admin"], "an ADMIN may not assign owner — the defect this closes");
  assert.deepEqual(at(3), ["viewer", "bookkeeper", "admin", "owner"], "an owner may assign the whole ladder");
  // FAIL CLOSED, both shapes.
  assert.deepEqual(at(null), [], "no scope offers nothing");
  assert.deepEqual(assignableRoles({ role_rank: null, is_operator: true }), [], "a NULL rank offers nothing");
});

test("canActOnMemberOfRole: mirrors 0157:320-321's `>` — equal ranks are ALLOWED, higher is not", () => {
  const admin = { role_rank: 2, is_operator: false };
  assert.equal(canActOnMemberOfRole(admin, "viewer"), true);
  assert.equal(canActOnMemberOfRole(admin, "bookkeeper"), true);
  // THE `>` NOT `>=` HALF: the door allows admin-on-admin, so the UI must too.
  // Tightening this to `<` would hide a control the database would have honoured
  // — the same defect as offering one it refuses, pointed the other way.
  assert.equal(canActOnMemberOfRole(admin, "admin"), true, "admin-on-admin is allowed by the door and must be offered");
  assert.equal(canActOnMemberOfRole(admin, "owner"), false, "…and acting on a SUPERIOR is the wall");
  assert.equal(canActOnMemberOfRole({ role_rank: 3, is_operator: false }, "owner"), true, "owner-on-owner likewise");
  // FAIL CLOSED on an unreadable caller AND on an unrankable member.
  assert.equal(canActOnMemberOfRole(null, "viewer"), false);
  assert.equal(canActOnMemberOfRole({ role_rank: null, is_operator: false }, "viewer"), false);
  assert.equal(
    canActOnMemberOfRole(admin, "some_future_role"),
    false,
    "a role outside the ladder cannot be ranked, so the UI reasons about it by offering nothing",
  );
});

test("firmCapabilities: registrations need the OPERATOR conjunct as well as owner rank", () => {
  const ownerElsewhere = firmCapabilities({ role_rank: 3, is_operator: false });
  assert.equal(ownerElsewhere.canDecideFirmRegistrations, false, "an owner of a non-operator firm may not decide registrations");
  assert.equal(ownerElsewhere.canManageMembers, true, "…while every other owner capability is unaffected by the flag");
});
