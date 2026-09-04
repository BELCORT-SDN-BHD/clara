// THE CAPABILITY PINS (E-7 / CB-AE2E-014 / CB-AE2E-033, 裁-190).
//
// Two jobs, and the first is the one that matters most: every floor
// `lib/firm/capabilities.ts` mirrors is PARSED OUT OF THE MIGRATION IT CITES,
// never retyped here. Review law 3 — a floor written from memory is a projection
// of the database's rule, not the rule. A capability that silently drifts above
// its door's floor hides a control from someone entitled to it; one that drifts
// below offers a control that can only refuse, which is the exact defect the
// owner reported.
//
// THE CITATION IS PROVEN LIVE, not merely present. For each row the test also
// requires that the cited migration is the LAST file in packages/db/migrations
// that creates that door — the "chase the LIVE body" law (apps/web/AGENTS.md),
// mechanised. `set_member_role` alone has FOUR creations across 0004/0005/0145/
// 0157, and citing any but the last would be citing a superseded wall.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIRM_CAPABILITY_CONJUNCTS,
  FIRM_CAPABILITY_FLOORS,
  capabilityScopeFromRows,
  firmCapabilities,
  firmCapabilitiesFromRows,
  type FirmCapabilities,
} from "./capabilities";
import type { CallerContextRow } from "./caller-context";

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

const ALL_MIGRATIONS = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

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

/** Every `create [or replace] function clara.<door>(` site across the estate, as
 *  `{ file, line }`, with the ROLE its body floors at — the first
 *  `_human_ctx(role_rank('…'))` between that CREATE and the next one. */
function creationSites(door: string): { file: string; line: number; role: string | null }[] {
  const createRe = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?function\\s+clara\\.${door}\\s*\\(`, "i");
  const anyCreateRe = /^create\s+(?:or\s+replace\s+)?function\s+/i;
  const floorRe = /clara\._human_ctx\(clara\.role_rank\('([a-z]+)'\)\)/;
  const sites: { file: string; line: number; role: string | null }[] = [];
  for (const file of ALL_MIGRATIONS) {
    const lines = migrationLines(file);
    for (let i = 0; i < lines.length; i += 1) {
      if (!createRe.test((lines[i] ?? "").trim())) continue;
      let role: string | null = null;
      for (let j = i + 1; j < lines.length; j += 1) {
        const text = lines[j] ?? "";
        if (anyCreateRe.test(text.trim())) break;
        const m = floorRe.exec(text);
        if (m) { role = m[1] ?? null; break; }
      }
      sites.push({ file, line: i + 1, role });
    }
  }
  return sites;
}

test("FIRM_CAPABILITY_FLOORS: EVERY body of a cited door floors at the same role, and the citation is one of them", () => {
  // A TOTAL CENSUS, not a "last creator" guess, because two of these doors carry
  // OVERLOADS rather than a plain supersession chain: `sign_vendor_identity_binding`
  // exists as `(uuid,text)` (0028, replaced by 0144) AND as
  // `(uuid,text,text default null)` (0154:2727), and both are callable. Asserting
  // only the last file would have picked the three-argument body this surface
  // never calls. Requiring that EVERY body agrees on the rank is stronger: the
  // mirrored floor is then right whichever overload PostgREST resolves, and a
  // future migration that floors one overload differently reds here.
  for (const row of FIRM_CAPABILITY_FLOORS) {
    const sites = creationSites(row.door);
    assert.ok(sites.length > 0, `no migration creates clara.${row.door}`);
    const roles = new Set(sites.map((s) => s.role));
    assert.deepEqual(
      [...roles],
      [row.role],
      `clara.${row.door} does not floor uniformly at '${row.role}' — ${sites.map((s) => `${s.file}:${s.line}=${s.role}`).join(", ")}`,
    );
    assert.ok(
      sites.some((s) => s.file === row.migration && s.line <= row.line),
      `the cited ${row.migration}:${row.line} is not inside any creation of clara.${row.door} (sites: ${sites.map((s) => `${s.file}:${s.line}`).join(", ")})`,
    );
  }
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

test("firmCapabilities: the four unknown-rank shapes ALL deny — the gate fails CLOSED (裁-190)", () => {
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

test("firmCapabilities: registrations need the OPERATOR conjunct as well as owner rank", () => {
  const ownerElsewhere = firmCapabilities({ role_rank: 3, is_operator: false });
  assert.equal(ownerElsewhere.canDecideFirmRegistrations, false, "an owner of a non-operator firm may not decide registrations");
  assert.equal(ownerElsewhere.canManageMembers, true, "…while every other owner capability is unaffected by the flag");
});
