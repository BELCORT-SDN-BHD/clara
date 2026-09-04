// THE RECEIPT-KIND REGISTER PIN (E-2 / CB-AE2E-018).
//
// `clara.agent_receipt_surfaces` is the closed registry the activity feed's
// label map is supposed to cover, and NOTHING enforced that: the map held the
// seven rows 0103 registered while 0142 and 0154 had appended two more, so two
// LIVE kinds rendered as raw snake_case tokens. The join that used to enforce
// it died with apps/dashboard at the P6-X source delete (lib/firm/needs-you.ts
// :55-70 writes up the identical class). This is its replacement, and it is the
// strongest thing a database-free apps/web test can do: parse the register's own
// rows out of the migrations rather than retype them.
//
// WHY A STATIC PARSE IS A SOUND CENSUS HERE. The table is APPEND-ONLY at the
// database level — `t_agent_receipt_surfaces_append_only` fires BEFORE DELETE OR
// UPDATE and `t_agent_receipt_surfaces_no_truncate` BEFORE TRUNCATE
// (0103_f_a7_pi_additive.sql:974-978) — so a row that was ever inserted is still
// there. The union of the INSERTs IS the register.
//
// THE DISCRIMINATOR IS STRUCTURAL, NOT TYPOGRAPHIC. Seven further INSERTs into
// this table exist across 0142 and 0154, every one of them a NEGATIVE PROBE
// (`probe_kind_a`, `pb_ghost`, …) sitting inside a `do $$ … $$` block that
// asserts the row is REFUSED and swallows the exception. Telling them apart by
// indentation, or by their `probe_` spelling, would be reading a projection of
// the thing (review law 3). Instead every dollar-quoted body — every DO block
// and every function body — is BLANKED before parsing, so only statements the
// migration executes unconditionally at top level survive. The named-refuter
// case below proves that blanking actually works by requiring each known probe
// row to be ABSENT from the parse.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENT_RECEIPT_KINDS,
  UNWIRED_AGENT_RECEIPT_KINDS,
  WIRED_AGENT_RECEIPT_KINDS,
  isKnownAgentReceiptKind,
} from "./receipt-kinds";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "packages", "db", "migrations");

/**
 * Comments blanked, then every dollar-quoted body blanked, length-preserving.
 * Single-quoted values survive — they are the register's own rows. A `$` inside
 * a single-quoted string is never treated as a delimiter, which is why strings
 * are walked rather than regex-skipped.
 */
function topLevelStatements(sql: string): string {
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
    if (sql[i] === "'") {
      out += "'";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { out += "''"; i += 2; continue; }
        if (sql[i] === "'") { out += "'"; i += 1; break; }
        out += sql[i];
        i += 1;
      }
      continue;
    }
    if (sql[i] === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        if (close >= 0) {
          const body = sql.slice(i, close + tag.length);
          for (const ch of body) out += ch === "\n" ? "\n" : " ";
          i = close + tag.length;
          continue;
        }
      }
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

const INSERT_RE = /insert\s+into\s+clara\.agent_receipt_surfaces\s*\([^)]*\)\s*values\s*([\s\S]*?);/gi;
const TUPLE_RE = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;

type SurfaceRow = { item: string; receipt_kind: string; shim: string; source: string; file: string };

function registeredSurfaces(): SurfaceRow[] {
  const rows: SurfaceRow[] = [];
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = topLevelStatements(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    for (const stmt of sql.matchAll(INSERT_RE)) {
      for (const t of (stmt[1] ?? "").matchAll(TUPLE_RE)) {
        rows.push({ item: t[1] ?? "", receipt_kind: t[2] ?? "", shim: t[3] ?? "", source: t[4] ?? "", file });
      }
    }
  }
  return rows;
}

test("the register parse is NOT vacuous and excludes every known negative probe", () => {
  const rows = registeredSurfaces();
  // The floor: the four items whose registering migrations receipt-kinds.ts
  // cites by name. A parser that silently stopped matching cannot pass this.
  for (const kind of ["entry_post", "agent_filing", "onboarding_agent", "binding_agent"]) {
    assert.ok(rows.some((r) => r.receipt_kind === kind), `the parse lost the registered kind "${kind}"`);
  }
  assert.ok(rows.length >= 9, `expected at least the nine registered surfaces, parsed ${rows.length}`);
  // THE NAMED REFUTERS: every probe row lives inside a `do $$ … $$` block that
  // asserts its own refusal. If the dollar-body blanking ever stops working,
  // these appear and the pin starts covering rows that are not in the register.
  for (const probe of ["f_a7bx", "f_a99y", "pb_probea", "pb_Probe", "f_a42", "pb_ghost"]) {
    assert.equal(
      rows.find((r) => r.item === probe),
      undefined,
      `"${probe}" is a NEGATIVE PROBE inside a DO block and must never reach the parse`,
    );
  }
  // And every surviving row satisfies the register's own pairing CHECK
  // (ck_agent_receipt_surfaces_shim_matches_item, 0154:946) — a second, cheap
  // proof that what came back is register-shaped.
  for (const r of rows) {
    assert.equal(r.shim, `_agent_receipt_src_${r.item}`, `${r.file}: ${r.item} is paired with ${r.shim}`);
  }
});

test("AGENT_RECEIPT_KINDS covers EVERY receipt_kind the register carries (the drift that shipped)", () => {
  const registered = [...new Set(registeredSurfaces().map((r) => r.receipt_kind))].sort();
  const missing = registered.filter((kind) => !isKnownAgentReceiptKind(kind));
  assert.deepEqual(
    missing,
    [],
    `the activity feed has no label for these registered receipt kinds, so they render as raw tokens: ${missing.join(", ")}`,
  );
  // The other direction too: a kind in the roster that the register never
  // registered is a label for something that cannot exist.
  const invented = AGENT_RECEIPT_KINDS.filter((kind) => !registered.includes(kind));
  assert.deepEqual(invented, [], `these roster entries are not in clara.agent_receipt_surfaces: ${invented.join(", ")}`);
});

test("every registered kind has a label in messages/en.json under FirmActivity.receiptKinds", async () => {
  const messages = (await import("../../messages/en.json", { with: { type: "json" } })).default as {
    FirmActivity: { receiptKinds: Record<string, string> };
  };
  for (const kind of AGENT_RECEIPT_KINDS) {
    const label = messages.FirmActivity.receiptKinds[kind];
    assert.equal(typeof label, "string", `FirmActivity.receiptKinds.${kind} is missing — the feed would render "${kind}" raw`);
    assert.ok((label ?? "").length > 0, `FirmActivity.receiptKinds.${kind} is empty`);
  }
});

test("the wired/unwired split is total and disjoint — 'empty stub' is a DECLARED state, not a silent one", () => {
  const wired = new Set<string>(WIRED_AGENT_RECEIPT_KINDS);
  const unwired = new Set<string>(UNWIRED_AGENT_RECEIPT_KINDS);
  for (const kind of AGENT_RECEIPT_KINDS) {
    assert.notEqual(wired.has(kind) === unwired.has(kind), true, `${kind} must be in exactly one of the two lists`);
  }
  assert.equal(wired.size + unwired.size, AGENT_RECEIPT_KINDS.length, "the two lists must partition the roster");
});

test("the wired/unwired split matches the shims' own definitions in packages/db/migrations", () => {
  // A shim whose ONLY definition is 0103's is still the typed-empty stub; one
  // that a later migration re-cut projects real rows. Measured, not asserted —
  // this is what lets the feed's coverage copy stay true as the DB lane lands.
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const byKind = new Map(registeredSurfaces().map((r) => [r.receipt_kind, r.item] as const));
  for (const kind of AGENT_RECEIPT_KINDS) {
    const item = byKind.get(kind);
    assert.ok(item, `${kind} has no registered item`);
    const definers = files.filter((f) =>
      new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+clara\\._agent_receipt_src_${item}\\b`, "i").test(
        topLevelStatements(readFileSync(join(MIGRATIONS_DIR, f), "utf8")),
      ),
    );
    const isStubOnly = definers.length === 1 && definers[0]?.startsWith("0103") === true;
    const declaredUnwired = (UNWIRED_AGENT_RECEIPT_KINDS as readonly string[]).includes(kind);
    assert.equal(
      isStubOnly,
      declaredUnwired,
      `${kind} (${item}) is defined by ${definers.join(", ")}, which contradicts its declared ${declaredUnwired ? "UNWIRED" : "WIRED"} state`,
    );
  }
});
