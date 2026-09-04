// @frozen
//
// statementFacts_v3 — THE TWO DETERMINISTIC HEADER TRANSFORMS (H-02 · H-03). Pure functions
// over one channel's answered header: no DB, no clock, no randomness, no I/O. They are split
// into their own file so every branch can be judged by a unit cell without a scripted client,
// and so `statementFacts.v3.behavior.mjs` stays inside the repo's 500-line file gate.
//
// NEITHER FUNCTION DECIDES ANYTHING FINANCIAL. Hard constraint 2 stands unchanged: the DB owns
// every authoritative number, and everything below is either an IDENTITY PROJECTION (a printed
// institution name -> the roster code the DB binds on) or a DETERMINISTIC RESTATEMENT of a date
// the reader itself printed (a statement date -> the calendar month it falls in). Both record a
// STATED BASIS on the non-authoritative `corroboration` receipt, so a human reading the stored
// extraction can always see HOW a bound or a code was obtained. The institution side keeps every
// DB verdict it had: the live-roster check at 0038:1557-1566 and the two-reader agreement on
// `institution_code` still run and still decide. The PERIOD side does NOT — see "WHICH WALLS
// SURVIVE A DERIVED BAND" below, which is the correction that matters most in this file.
//
// ---------------------------------------------------------------------------------------
// H-03 — WHY THE ROSTER IS A FROZEN LITERAL HERE AND NOT A DB READ.
//
// `clara.bank_institutions` is the authority (0038:182-209) and this file is a MIRROR of its
// seed, not a second authority. A DB read would be the better shape and it is NOT AVAILABLE to
// this process: 0038:224-231 grants `select` to `clara_authenticated` ONLY and says so in
// prose — "clara_agent_ro and clara_runtime get nothing here" — while the table carries FORCE
// row level security with no policy for `clara_runtime`. Widening that grant is a migration,
// and a migration is not this lane's to write. So the mirror is the lawful shape available
// today, and it is bounded three ways:
//
//   (1) a drift-guard cell parses the seed out of
//       `packages/db/migrations/0038_wave_c_b_bank.sql` and asserts this roster IS that seed,
//       code-for-code and name-for-name — it reds the moment a migration grows the catalog, so
//       a stale mirror cannot ship quietly;
//   (2) a printed value that is ALREADY CODE-SHAPED (`^[A-Z0-9]{2,10}$`, the table's own PK
//       check) is relayed even when this mirror does not know it — UPPER-CASED to the table's
//       own code form, which is the one normalisation the DB itself performs anyway
//       (`_stmt_header_norm` does `upper(btrim(...))`, 0038:1188), and otherwise untouched. So
//       a bank added by a later migration keeps working with no runtime change AS LONG AS ITS
//       STATEMENT PRINTS A CODE. That carve-out is the honest limit of this bullet: a bank
//       added after this image was built whose statement prints only its NAME refuses here
//       until the mirror is re-cut as a v4 (or the DB-side resolver lands). The drift-guard
//       cell is what makes that a scheduled re-cut rather than a surprise;
//   (3) a printed NAME that resolves to zero or to more than one roster row is REFUSED
//       (fail closed), with the printed string and the candidate codes on the receipt.
//
// The DB-side resolver (`clara._stmt_institution_code(text)`, or a `select` grant on the
// roster) remains the durable answer and is named in this PR's body as a DB-lane item.
//
// WHY NOT `../lib/statement-grammar.mjs`'s `matchInstitution`. It exists (:225) and it is a
// different instrument: a REGEX SNIFFER over raw OCR page text, used by v1's Azure engine to
// guess a bank from a letterhead blob. Its patterns are deliberately loose — `/\bmaybank\b/i`
// matches "MAYBANK ISLAMIC BERHAD", which is a DIFFERENT legal entity that this roster does
// not seed, and binding a statement to MBB on that evidence is exactly the mis-identification
// an accounting system must never make. This file matches a WHOLE answered name against the
// roster and refuses anything else. Importing that file would also pull it onto the freeze
// surface for the first time (it is reachable today only through non-frozen v1 services).
//
// ---------------------------------------------------------------------------------------
// H-02 — WHY A DERIVED BAND IS ALLOWED AT ALL, AND WHERE IT STOPS.
//
// The Maybank corporate current-account shape prints `TARIKH PENYATA / STATEMENT DATE :
// 30/06/25` and NO from-to band. `clara._stmt_header_norm` (0038:1207-1217) requires all three
// of period_start, period_end and statement_date to be ISO-shaped or it raises
// `header_unreadable`, and it has no derivation path — so every such statement refuses today.
//
// The derivation below is the NARROWEST one that answers it: when BOTH bounds are unreadable
// and a statement date IS readable, the band is that date's own calendar month, opening on the
// first of the month and CLOSING ON THE STATEMENT DATE ITSELF — never on the month's last day,
// which would claim coverage of days the statement does not show. The basis is recorded. Every
// other shape is left exactly as the reader answered it, so the DB gives its own diagnosis:
//   * both bounds printed          -> basis `printed`, values untouched;
//   * exactly ONE bound printed    -> basis `printed_incomplete`, values untouched, and
//                                     `_stmt_header_norm` still refuses `header_unreadable` —
//                                     a half-printed band is a defect, not an invitation to
//                                     overwrite the half that WAS printed;
//   * neither bound and no date    -> basis `unreadable`, values untouched, refused exactly as
//                                     v2 refuses it.
//
// THE MODEL NO LONGER INFERS ANYTHING. v2's prompt was internally contradictory on this exact
// field (`period_start`'s describe invited "as the statement's own printed month implies" while
// SHARED_RULES 1 and 3 forbade inferring and guessing); v3's prompt tells the reader to answer
// both bounds null when no band is printed, and the derivation moved HERE, where it is
// deterministic, replayable from the same statement_date, and covered by cells.
//
// ---------------------------------------------------------------------------------------
// WHICH WALLS SURVIVE A DERIVED BAND — AND THE TWO THAT DO NOT.
//
// It would be comfortable to say the DB's period walls still decide. They do not, and saying so
// would be the kind of claim that gets believed for a year.
//
//   * `period_invalid` is UNREACHABLE by construction on this class. It is exactly two
//     predicates (0038:1646-1656): `period_start > period_end`, and
//     `statement_date < period_start`. A band derived as first-of-month(sd) .. sd satisfies
//     NEITHER, ever. That matters because the migration's own comment says the second predicate
//     exists precisely to catch a wrong period YEAR — "Maybank line dates print DD/MM with no
//     year and the year comes from the period, so a wrong period year has to be caught here or
//     every line date inherits it." For a derived band that catch is vacuous.
//   * `line_date_out_of_period` (0038:1705-1710) then compares each line date against that SAME
//     derived band. Since the corpus prints line dates as DD/MM and takes the year FROM the
//     period, a misread year is inherited on both sides of the comparison and cannot show up.
//     It still catches a line in the wrong MONTH or DAY, which is worth having; it cannot
//     contradict the year.
//
// SO WHAT DOES STAND, on a two-digit printed year like `TARIKH PENYATA : 30/06/25`? The
// TWO-READER AGREEMENT on `statement_date` (0038:1511) — the text channel and the vision channel
// must independently read the same date off the page, and the band is a pure function of that
// date. That is the control. The duplicate / overlap / continuity rungs (0038:1663-1679,
// 1743-1754) can also expose a wrong year, but ONLY when a live neighbouring statement already
// exists on the same account; continuity in particular keys on strict contiguity
// (`period_end = period_start - 1`), so on an empty or gapped history none of the three fires.
//
// THE MISSING WALL, named as a DB-lane item rather than built here: `bank_statements` declares
// `period_start` and `period_end` as bare `date not null` with NO plausibility bound at all
// (0038:380-381). A CHECK rejecting a band outside a sane window would close this class at the
// only layer that can see every lane. Not this lane's to add.

/** The `clara.bank_institutions` seed, MIRRORED (0038:189-209). Codes are the PK; names are
 *  the seed's own display names, byte-for-byte. Pinned by the drift-guard cell in
 *  `packages/runtime/tests/f-a2-statement-header-v3.test.mjs`, which reads the migration. */
export const STATEMENT_INSTITUTION_ROSTER = Object.freeze([
  Object.freeze({ code: "MBB", name: "Malayan Banking Berhad (Maybank)" }),
  Object.freeze({ code: "CIMB", name: "CIMB Bank Berhad" }),
  Object.freeze({ code: "PBB", name: "Public Bank Berhad" }),
  Object.freeze({ code: "RHB", name: "RHB Bank Berhad" }),
  Object.freeze({ code: "HLB", name: "Hong Leong Bank Berhad" }),
  Object.freeze({ code: "AMB", name: "AmBank (M) Berhad" }),
  Object.freeze({ code: "BIMB", name: "Bank Islam Malaysia Berhad" }),
  Object.freeze({ code: "BMMB", name: "Bank Muamalat Malaysia Berhad" }),
  Object.freeze({ code: "OCBC", name: "OCBC Bank (Malaysia) Berhad" }),
  Object.freeze({ code: "UOB", name: "United Overseas Bank (Malaysia) Bhd" }),
  Object.freeze({ code: "HSBC", name: "HSBC Bank Malaysia Berhad" }),
  Object.freeze({ code: "SCB", name: "Standard Chartered Bank Malaysia Berhad" }),
  Object.freeze({ code: "AFFIN", name: "Affin Bank Berhad" }),
  Object.freeze({ code: "ALB", name: "Alliance Bank Malaysia Berhad" }),
  Object.freeze({ code: "BSN", name: "Bank Simpanan Nasional Berhad" }),
  Object.freeze({ code: "AGRO", name: "Bank Pertanian Malaysia Berhad (Agrobank)" }),
  Object.freeze({ code: "MBSB", name: "MBSB Bank Berhad" }),
]);

/** `clara.bank_institutions.code`'s OWN check constraint (0038:183), restated so a printed
 *  value this mirror does not know can still be recognised as code-SHAPED and passed through
 *  to the DB, which is the only thing that can say whether it is LIVE. */
export const STATEMENT_INSTITUTION_CODE_RE = /^[A-Z0-9]{2,10}$/;

/** Tokens that are legal form or geography, not identity: two spellings of the same bank must
 *  not fail to match because one letterhead prints BHD and the other BERHAD. Dropping
 *  `malaysia` is safe against THIS roster because no two seeded rows differ only by it — the
 *  no-collision property is asserted by a cell, not assumed here. */
const INSTITUTION_NOISE_TOKENS = new Set(["berhad", "bhd", "malaysia", "malaysian"]);

/** The shortest alias this file will trust. "(M)" in `AmBank (M) Berhad` normalises to a
 *  one-letter token, and a one- or two-letter alias would match half the country. */
const MIN_ALIAS_LENGTH = 3;

/** Case-, punctuation- and legal-form-insensitive key for one printed institution string. */
export function normalizeInstitutionName(value) {
  const cleaned = String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.split(" ").filter((token) => token && !INSTITUTION_NOISE_TOKENS.has(token)).join(" ");
}

/** One roster row's matchable names: the name with its parentheticals removed, plus each
 *  parenthetical on its own (that is where the seed keeps a bank's trading name — "(Maybank)",
 *  "(Agrobank)"). Short fragments are dropped. */
export function institutionAliases(name) {
  const raw = String(name ?? "");
  const inside = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const outside = raw.replace(/\([^)]*\)/g, " ");
  const out = new Set();
  for (const candidate of [outside, ...inside]) {
    const key = normalizeInstitutionName(candidate);
    if (key.length >= MIN_ALIAS_LENGTH) out.add(key);
  }
  return out;
}

const ROSTER_INDEX = Object.freeze(
  STATEMENT_INSTITUTION_ROSTER.map((row) => Object.freeze({ ...row, aliases: institutionAliases(row.name) })),
);

/** Every roster code, for the drift-guard cell and for a refusal's candidate list. */
export function statementInstitutionCodes() {
  return STATEMENT_INSTITUTION_ROSTER.map((row) => row.code);
}

/**
 * ONE printed institution string -> the roster CODE the DB binds on.
 *
 * The order is deliberate and load-bearing: NAME first, then CODE, then code-shaped
 * passthrough. "MAYBANK" is BOTH a printed name and a string that satisfies the code regex, and
 * resolving it as a code would send `MAYBANK` to a table whose only Maybank row is `MBB` — the
 * exact `header_unreadable` this item exists to remove. So a whole-name match always wins.
 *
 * @returns {{ code: string|null, printed: string|null, basis: string, candidates: string[] }}
 *   `basis` is one of `roster_name` | `roster_code` | `printed_code` | `absent` |
 *   `unknown_name` | `ambiguous_name`. A null `code` is a REFUSAL for the caller to raise; it
 *   is never silently dropped.
 */
export function resolveInstitutionCode(printed) {
  const raw = String(printed ?? "").trim();
  if (!raw) return { code: null, printed: null, basis: "absent", candidates: [] };

  // The PRINTED value is put through the SAME alias derivation the roster rows are, so a
  // letterhead that prints its own parenthetical ("AmBank (M) Berhad") is compared on the same
  // footing as the seed name it came from. A printed string that yields two keys naming two
  // different rows is AMBIGUOUS and refuses — it is never resolved to whichever matched first.
  const printedKeys = [...institutionAliases(raw)];
  const byName = printedKeys.length
    ? ROSTER_INDEX.filter((row) => printedKeys.some((key) => row.aliases.has(key)))
    : [];
  if (byName.length === 1) {
    return { code: byName[0].code, printed: raw, basis: "roster_name", candidates: [byName[0].code] };
  }
  if (byName.length > 1) {
    return { code: null, printed: raw, basis: "ambiguous_name", candidates: byName.map((row) => row.code) };
  }

  const upper = raw.toUpperCase();
  const byCode = ROSTER_INDEX.filter((row) => row.code === upper);
  if (byCode.length === 1) {
    return { code: byCode[0].code, printed: raw, basis: "roster_code", candidates: [byCode[0].code] };
  }

  // CODE-SHAPED BUT UNKNOWN TO THIS MIRROR: relay it, UPPER-CASED to the table's own code form
  // and otherwise unchanged — `_stmt_header_norm` applies the same `upper(btrim(...))` at
  // 0038:1188, so this is the DB's normalisation, not a second one. The live roster is the DB's,
  // and a bank added by a migration after this image was built must not be refused HERE — the DB
  // refuses it at 0038:1557-1566 if it really is not seeded, with its own message. The basis
  // token says `printed_code` and not "verbatim" on purpose: the case DID change.
  if (STATEMENT_INSTITUTION_CODE_RE.test(upper)) {
    return { code: upper, printed: raw, basis: "printed_code", candidates: [] };
  }

  return { code: null, printed: raw, basis: "unknown_name", candidates: [] };
}

/** ISO YYYY-MM-DD that is also a REAL calendar date, or null. `2025-02-30` is regex-valid and
 *  is not a date; a normalizer that accepted it would hand the DB a cast that throws. */
export function isoCalendarDate(value) {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return s;
}

/**
 * THE PERIOD BAND AND ITS STATED BASIS. See this file's H-02 header for why the derived band
 * closes on the statement date rather than on the month's last day.
 *
 * @returns {{ period_start: unknown, period_end: unknown, basis: string }} `basis` is one of
 *   `printed` | `derived_from_statement_date_month` | `printed_incomplete` | `unreadable`.
 */
export function deriveStatementPeriod(header) {
  const h = header && typeof header === "object" ? header : {};
  const start = isoCalendarDate(h.period_start);
  const end = isoCalendarDate(h.period_end);
  if (start && end) return { period_start: start, period_end: end, basis: "printed" };

  const asIs = { period_start: h.period_start ?? null, period_end: h.period_end ?? null };
  if (start || end) return { ...asIs, basis: "printed_incomplete" };

  const statementDate = isoCalendarDate(h.statement_date);
  if (!statementDate) return { ...asIs, basis: "unreadable" };
  return {
    period_start: `${statementDate.slice(0, 7)}-01`,
    period_end: statementDate,
    basis: "derived_from_statement_date_month",
  };
}

/**
 * ONE channel's answered header -> the header this lane sends to
 * `clara.persist_statement_facts_v2`, plus the receipt describing what was changed and why.
 *
 * The returned header carries NO NEW KEYS. `_stmt_header_norm` builds its output object from a
 * fixed field list (0038:1259-1272), so an extra `period_basis` key on the wire header would be
 * silently dropped on the floor — and sending answer vocabulary the DB does not verify is the
 * mistake `statementFacts.v3.prompts.mjs`'s header warns against. The basis therefore rides the
 * `corroboration` block, which `_persist_statement_core_v2` DOES store verbatim, under
 * `corroboration_claimed`, on BOTH reader extraction envelopes (0098:475,484).
 */
export function normalizeStatementHeaderV3(wireHeader) {
  const source = wireHeader && typeof wireHeader === "object" ? wireHeader : {};
  const institution = resolveInstitutionCode(source.institution_code);
  const period = deriveStatementPeriod(source);
  const header = { ...source };
  if (institution.code !== null) header.institution_code = institution.code;
  header.period_start = period.period_start;
  header.period_end = period.period_end;
  return {
    header,
    institution,
    period,
    receipt: {
      institution_printed: institution.printed,
      institution_code: institution.code,
      institution_basis: institution.basis,
      period_basis: period.basis,
    },
  };
}
