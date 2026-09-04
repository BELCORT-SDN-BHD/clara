// statementFacts_v3 — THE TWO DETERMINISTIC HEADER TRANSFORMS (H-03 institution roster
// resolution, H-02 period basis). Unit only: no DB, no network, no key. The transforms are pure
// functions by construction, which is the whole reason they live in their own module.
//
// THE CELL THIS FILE EXISTS FOR is the DRIFT GUARD at the bottom. `statementFacts.v3.header.mjs`
// mirrors the `clara.bank_institutions` seed as a frozen literal because `clara_runtime` holds
// ZERO grant on that table (0038:224-231, prose and grant agree) and the table carries FORCE
// row-level security with no policy for the role — so this process CANNOT read the roster and a
// mirror is the only shape available. A mirror is only safe while something reds when it drifts,
// so the guard parses the seed out of the migration itself and compares code-for-code and
// name-for-name. It also asserts that 0038 is still the ONLY file that seeds the table: a later
// additive migration must red this cell and force a v4, not slip past a census of one file.
//
// EVIDENCE LAW 3 (spelling is not identity): every resolution assertion is put to the real
// exported resolver, and the roster round-trip drives every seeded row rather than the three
// the handover happened to name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  STATEMENT_INSTITUTION_ROSTER,
  deriveStatementPeriod,
  institutionAliases,
  isoCalendarDate,
  normalizeInstitutionName,
  normalizeStatementHeaderV3,
  resolveInstitutionCode,
  statementInstitutionCodes,
} from "../workflows/statementFacts.v3.header.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(HERE, "..", "..", "db", "migrations");

// ---------------------------------------------------------------------------
// H-03 — the institution resolver
// ---------------------------------------------------------------------------

test("institution: the two names the handover named resolve to their roster codes", () => {
  // The Alliance statement's letterhead and the Maybank corporate statement's, both of which
  // `_stmt_header_norm` could only ever answer `header_unreadable` on (0038:183 — a code is
  // `^[A-Z0-9]{2,10}$`, and "ALLIANCE BANK" has a space in it).
  assert.equal(resolveInstitutionCode("ALLIANCE BANK").code, "ALB");
  assert.equal(resolveInstitutionCode("MAYBANK").code, "MBB");
  assert.equal(resolveInstitutionCode("MALAYAN BANKING BERHAD").code, "MBB");
});

test("institution: case, punctuation, BHD/BERHAD and MALAYSIA are noise, not identity", () => {
  for (const printed of [
    "alliance bank",
    "Alliance Bank Berhad",
    "Alliance Bank Malaysia Berhad",
    "ALLIANCE  BANK,  MALAYSIA  BHD.",
  ]) {
    assert.equal(resolveInstitutionCode(printed).code, "ALB", `printed ${JSON.stringify(printed)}`);
  }
  assert.equal(normalizeInstitutionName("Alliance Bank Malaysia Berhad"), "alliance bank");
  assert.equal(normalizeInstitutionName("UNITED OVERSEAS BANK (MALAYSIA) BHD"), "united overseas bank");
  // …and why the alias splitter exists on top of the plain normaliser: a parenthetical the
  // normaliser cannot distinguish from a word ("(M)") survives it, and would defeat a bare
  // equality match against the seed name.
  assert.equal(normalizeInstitutionName("AmBank (M) Berhad"), "ambank m");
  assert.deepEqual([...institutionAliases("AmBank (M) Berhad")], ["ambank"]);
  assert.equal(resolveInstitutionCode("AmBank (M) Berhad").code, "AMB");
});

test("institution: a PRINTED code is relayed as the code, and the basis says which rung matched", () => {
  const byCode = resolveInstitutionCode("MBB");
  assert.equal(byCode.code, "MBB");
  assert.equal(byCode.basis, "roster_code");
  const byName = resolveInstitutionCode("Maybank");
  assert.equal(byName.code, "MBB");
  assert.equal(byName.basis, "roster_name");
});

test("institution: NAME beats CODE-SHAPE — 'MAYBANK' is not a code, it is a name", () => {
  // The ordering cell. "MAYBANK" satisfies `^[A-Z0-9]{2,10}$` exactly as a real code does, so a
  // resolver that tried the code rung first would relay `MAYBANK` to a roster whose only Maybank
  // row is `MBB` — reproducing the very `header_unreadable` this item removes.
  const r = resolveInstitutionCode("MAYBANK");
  assert.equal(r.code, "MBB");
  assert.notEqual(r.basis, "printed_code");
});

test("institution: an UNKNOWN printed name REFUSES — it is never relayed and never guessed", () => {
  for (const printed of ["BANK RAKYAT", "MAYBANK ISLAMIC BERHAD", "Some Bank Nobody Seeded"]) {
    const r = resolveInstitutionCode(printed);
    assert.equal(r.code, null, `printed ${JSON.stringify(printed)} must not resolve`);
    assert.equal(r.basis, "unknown_name");
    assert.equal(r.printed, printed, "the refusal carries what the page actually printed");
  }
});

test("institution: 'MAYBANK ISLAMIC BERHAD' is the reason the matcher is whole-name, not a sniffer", () => {
  // `packages/runtime/lib/statement-grammar.mjs:215` matches this string to MBB with
  // `/\bmaybank\b/i`. Maybank Islamic Berhad is a DIFFERENT legal entity and is NOT seeded, so
  // binding its statement to MBB would file one company's bank statement under another's
  // institution. This cell is what keeps the two instruments from being "unified" later.
  assert.equal(resolveInstitutionCode("MAYBANK ISLAMIC BERHAD").code, null);
});

test("institution: an AMBIGUOUS letterhead refuses and NAMES the candidates it matched", () => {
  const r = resolveInstitutionCode("Maybank (CIMB Bank)");
  assert.equal(r.code, null);
  assert.equal(r.basis, "ambiguous_name");
  assert.deepEqual([...r.candidates].sort(), ["CIMB", "MBB"]);
});

test("institution: a code-shaped string this MIRROR does not know is relayed UPPER-CASED, not refused", () => {
  // The staleness escape hatch, and it is load-bearing: `clara.bank_institutions` grows
  // additively by migration, and an image built before that migration must not become the reason
  // a live roster entry is refused — as long as the statement prints a CODE. The DB decides at
  // 0038:1557-1566. It is relayed UPPER-CASED, not verbatim: `_stmt_header_norm` applies the
  // same `upper(btrim(...))` at 0038:1188, so the case change is the DB's own normalisation and
  // the lower-case cell below is what proves this arm performs it rather than assuming it.
  const r = resolveInstitutionCode("NEWBANK1");
  assert.equal(r.code, "NEWBANK1");
  assert.equal(r.basis, "printed_code");
  assert.equal(resolveInstitutionCode("newbank1").code, "NEWBANK1", "the case IS changed");
  assert.equal(resolveInstitutionCode("newbank1").printed, "newbank1",
    "…and the receipt still carries what the page printed, which is the half that IS verbatim");
});

test("institution: an ABSENT institution is a refusal with its own basis, never an empty code", () => {
  for (const printed of [null, undefined, "", "   "]) {
    const r = resolveInstitutionCode(printed);
    assert.equal(r.code, null);
    assert.equal(r.basis, "absent");
  }
});

test("institution: EVERY seeded row round-trips from BOTH its code and its full seed name", () => {
  // A three-example cell would pass against a resolver that hard-coded three examples.
  for (const row of STATEMENT_INSTITUTION_ROSTER) {
    assert.equal(resolveInstitutionCode(row.code).code, row.code, `code ${row.code}`);
    assert.equal(resolveInstitutionCode(row.name).code, row.code, `name ${row.name}`);
  }
});

test("institution: no two roster rows share a normalised alias — the noise-token strip is safe", () => {
  // Dropping `malaysia` / `berhad` / `bhd` is only sound while it cannot collapse two banks into
  // one key. Asserted, never assumed.
  const seen = new Map();
  for (const row of STATEMENT_INSTITUTION_ROSTER) {
    for (const alias of institutionAliases(row.name)) {
      assert.equal(seen.has(alias), false, `alias ${JSON.stringify(alias)} is shared by ${seen.get(alias)} and ${row.code}`);
      seen.set(alias, row.code);
    }
  }
  assert.equal(seen.size >= STATEMENT_INSTITUTION_ROSTER.length, true);
});

// ---------------------------------------------------------------------------
// H-02 — the period band and its stated basis
// ---------------------------------------------------------------------------

test("period: a PRINTED band is passed through untouched and stated as printed", () => {
  const out = deriveStatementPeriod({ period_start: "2025-06-01", period_end: "2025-06-30", statement_date: "2025-06-30" });
  assert.deepEqual(out, { period_start: "2025-06-01", period_end: "2025-06-30", basis: "printed" });
});

test("period: the Maybank shape — a statement DATE and no band — derives the month, closing on the date", () => {
  // `TARIKH PENYATA / STATEMENT DATE : 30/06/25`, nothing else. v2 answered null/null here and
  // `_stmt_header_norm` raised header_unreadable (0038:1211-1217).
  assert.deepEqual(
    deriveStatementPeriod({ period_start: null, period_end: null, statement_date: "2025-06-30" }),
    { period_start: "2025-06-01", period_end: "2025-06-30", basis: "derived_from_statement_date_month" },
  );
  // The discriminating case: a MID-month statement date. The band must close on the statement
  // date itself, never on the month's last day — a band that ran to 31/07 would claim coverage
  // of sixteen days the statement does not show, and `line_date_out_of_period` could never catch
  // it because there are no rows there to catch.
  assert.deepEqual(
    deriveStatementPeriod({ period_start: null, period_end: null, statement_date: "2025-07-15" }),
    { period_start: "2025-07-01", period_end: "2025-07-15", basis: "derived_from_statement_date_month" },
  );
});

test("period: exactly ONE printed bound is NOT an invitation to overwrite the other", () => {
  // Fail closed: a half-printed band is a document defect. Deriving here would silently replace
  // a bound the bank actually printed with one this process computed.
  const out = deriveStatementPeriod({ period_start: "2025-06-05", period_end: null, statement_date: "2025-06-30" });
  assert.deepEqual(out, { period_start: "2025-06-05", period_end: null, basis: "printed_incomplete" });
});

test("period: neither a band nor a statement date still refuses — v3 removes no refusal", () => {
  const out = deriveStatementPeriod({ period_start: null, period_end: null, statement_date: null });
  assert.deepEqual(out, { period_start: null, period_end: null, basis: "unreadable" });
});

test("period: a date that is ISO-SHAPED but not a real day is not a date", () => {
  // `2025-02-30` passes `^\d{4}-\d{2}-\d{2}$` and is not a day. Deriving `2025-02-01`..`2025-02-30`
  // from it would hand `_persist_statement_core_v2` a cast that throws where a clean
  // `header_unreadable` belongs.
  assert.equal(isoCalendarDate("2025-02-30"), null);
  assert.equal(isoCalendarDate("2025-13-01"), null);
  assert.equal(isoCalendarDate("30/06/2025"), null);
  assert.equal(isoCalendarDate("2025-02-28"), "2025-02-28");
  assert.equal(isoCalendarDate("2024-02-29"), "2024-02-29", "a leap day IS a day");
  assert.equal(
    deriveStatementPeriod({ period_start: null, period_end: null, statement_date: "2025-02-30" }).basis,
    "unreadable",
  );
});

// ---------------------------------------------------------------------------
// The composed transform
// ---------------------------------------------------------------------------

test("header: the transform adds NO KEY to the wire header — the basis rides the receipt", () => {
  // `_stmt_header_norm` builds its output from a fixed field list (0038:1259-1272), so a
  // `period_basis` key on the header would be dropped on the floor and the receipt would be a
  // lie. This cell is what keeps the basis where the DB actually stores it.
  const wire = {
    institution_code: "ALLIANCE BANK", account_number: "123-456", currency: null,
    period_start: null, period_end: null, statement_date: "2025-06-30",
    opening_cents: 1000, closing_cents: 2000, opening_label: null, closing_label: null,
    total_debit_cents: 0, total_credit_cents: 1000,
  };
  const out = normalizeStatementHeaderV3(wire);
  assert.deepEqual(Object.keys(out.header).sort(), Object.keys(wire).sort(),
    "no key was added to, or removed from, the wire header");
  assert.equal(out.header.institution_code, "ALB");
  assert.equal(out.header.period_start, "2025-06-01");
  assert.equal(out.header.period_end, "2025-06-30");
  assert.equal(out.header.account_number, "123-456", "every other field is untouched");
  assert.deepEqual(out.receipt, {
    institution_printed: "ALLIANCE BANK",
    institution_code: "ALB",
    institution_basis: "roster_name",
    period_basis: "derived_from_statement_date_month",
  });
});

test("header: an unresolved institution leaves the printed string in place for the caller to refuse on", () => {
  // The transform never invents a code and never blanks the field: it reports `code: null` and
  // the behaviour raises. A silent null in the header would reach the DB as a different
  // diagnosis entirely.
  const out = normalizeStatementHeaderV3({ institution_code: "BANK RAKYAT", period_start: "2025-06-01", period_end: "2025-06-30" });
  assert.equal(out.institution.code, null);
  assert.equal(out.header.institution_code, "BANK RAKYAT");
  assert.equal(out.receipt.institution_basis, "unknown_name");
});

test("header: a non-object wire header does not throw — it becomes an empty, refusable header", () => {
  for (const junk of [null, undefined, "header", 7, []]) {
    const out = normalizeStatementHeaderV3(junk);
    assert.equal(out.institution.code, null);
    assert.equal(out.period.basis, "unreadable");
  }
});

// ---------------------------------------------------------------------------
// THE DRIFT GUARD — the frozen mirror IS the migration's seed
// ---------------------------------------------------------------------------

/** The seed statement, matched as SQL rather than as a SPELLING: `INSERT INTO` and
 *  `insert  into` are the same statement, and a guard that reads one exact rendering of it
 *  would go quietly blind the day someone reformatted the migration (review law 3). */
const SEED_INSERT_RE = /insert\s+into\s+clara\.bank_institutions\b/i;

/** Parse `insert into clara.bank_institutions (code, name) values (...)` out of a migration. */
function seededInstitutions(sql) {
  const start = sql.search(SEED_INSERT_RE);
  if (start < 0) return null;
  const end = sql.indexOf(";", start);
  assert.notEqual(end, -1, "the seed insert must terminate");
  const block = sql
    .slice(start, end)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  return [...block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']*)'\s*\)/g)].map((m) => ({ code: m[1], name: m[2] }));
}

test("drift guard: the frozen roster IS clara.bank_institutions' seed, code-for-code and name-for-name", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const seeding = files.filter((f) => SEED_INSERT_RE.test(readFileSync(join(MIGRATIONS_DIR, f), "utf8")));
  // A CENSUS, not a lookup: the roster grows additively by migration, so a SECOND seeding file
  // is exactly the event this guard has to catch. Enumerated, never counted by grep.
  assert.deepEqual(seeding, ["0038_wave_c_b_bank.sql"],
    `the bank roster is seeded by ${seeding.length} migration(s); the frozen mirror in statementFacts.v3.header.mjs covers 0038 only and must be re-cut as a v4 when another one lands`);

  const seed = seededInstitutions(readFileSync(join(MIGRATIONS_DIR, seeding[0]), "utf8"));
  assert.equal(Array.isArray(seed) && seed.length > 0, true, "the seed parser found no rows — the migration's shape moved");
  assert.deepEqual(
    STATEMENT_INSTITUTION_ROSTER.map((r) => ({ code: r.code, name: r.name })),
    seed,
    "statementFacts.v3.header.mjs's mirror has drifted from the migration seed",
  );
});

test("drift guard: every code this resolver can EMIT is a seeded code", () => {
  // The other direction. The cell above proves the mirror is not missing a bank; this one proves
  // the resolver cannot answer with a code the DB has never heard of — the `printed_code`
  // rung is excluded on purpose, because relaying an unknown code TO the DB is its whole job.
  const seeded = new Set(
    seededInstitutions(readFileSync(join(MIGRATIONS_DIR, "0038_wave_c_b_bank.sql"), "utf8")).map((r) => r.code),
  );
  for (const code of statementInstitutionCodes()) {
    assert.equal(seeded.has(code), true, `resolver code ${code} is not seeded`);
  }
  for (const row of STATEMENT_INSTITUTION_ROSTER) {
    for (const alias of institutionAliases(row.name)) {
      const r = resolveInstitutionCode(alias);
      assert.equal(seeded.has(r.code), true, `alias ${JSON.stringify(alias)} resolved to ${r.code}, which is not seeded`);
    }
  }
});
