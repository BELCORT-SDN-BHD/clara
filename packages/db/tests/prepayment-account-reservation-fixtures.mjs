// #1078 — THE PREPAYMENT-ACCOUNT ROSTER RESERVES ITS ENROLLED CODES, THE WAY ITS FIXED-ASSET AND
// STAFF-ADVANCE SIBLINGS ALREADY DO. Migration: 0337_prepayment_account_reservation.sql.
//
// NOT a test file: a frontier resolver and a set of verb wrappers, on the
// `prepayment-account-roster` / `revenue-recognition-plan-op-key` idiom. The name does not end in
// `.test.mjs`, so `node --test` ignores it.
//
// THE DEFECT #1078 NAMES. `clara.enrol_prepayment_account` (0306, recut by 0308 and 0315) wrote a
// roster row and reserved nothing: `clara._acct_role_reserved` (0043:756) unioned the fixed-asset
// family and the staff-advance register and knew nothing about the prepayment roster. So an
// account enrolled as a prepayment account today could be bound as a bank account, enrolled into
// the fixed-asset register, or enrolled as a staff-advance account the very next day, and the
// collision was only discovered later, at the schedule door, through the shared negative wall.
//
// THE OWNER RULING OF 2026-09-24 (recorded on the ticket) is TWO answers, and only the second is
// built here: `account_inactive` stays a known, harmless dead axis for chart accounts (no
// deactivation door is built), and the prepayment roster DOES reserve its enrolled accounts.
//
// IT EXTENDS #940'S BATTERY rather than building a second world: every scene, every door wrapper
// and every reader this file needs already lives in `prepayment-account-roster-fixtures.mjs`.

import { rootQuery, humanQuery, namedCall, opk } from "./prepayment-account-roster-fixtures.mjs";

export * from "./prepayment-account-roster-fixtures.mjs";

// ===========================================================================================
// 1 · The frontier gate. Keyed on the migration's STABLE STEM, never its number — numbers are
//     claimed at MERGE (packages/db/README.md).
// ===========================================================================================

/** This migration's STABLE STEM. */
export const RESERVATION_STEM = "prepayment_account_reservation$";

/** The preintegration gate module's variable, so a message can name it. */
export const RESERVATION_GATE = "CLARA_ALLOW_MISSING_PREPAYMENT_ACCOUNT_RESERVATION";

let _applied = null;
/** Is 0337 on this chain? Probed ONCE at the live ledger, never inferred from a file listing. */
export async function reservationApplied() {
  if (_applied === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1",
        [RESERVATION_STEM]);
      _applied = Number(r.rows[0].n) > 0;
    } catch {
      _applied = false;
    }
  }
  return _applied;
}

// ===========================================================================================
// 2 · The vocabulary this battery asserts on. The DOMAIN is new; every axis, remedy and reason
//     beside it is an existing token of the door that answers, carried through unchanged.
// ===========================================================================================

/** The reservation reader's three domains after 0337. `prepayment` is this ticket's. */
export const RESERVED_DOMAIN = {
  fa: "fa",
  staffAdvance: "staff_advance",
  prepayment: "prepayment",
};

/** Inside the prepayment domain the ROLE is the roster row's own purpose — the roster carries
 *  both from birth (0306 §A) and both reserve. */
export const RESERVED_ROLE = {
  prepayment: "prepayment",
  deferredRevenue: "deferred_revenue",
};

/** The bank belt's reason tokens. The advance one is 0041's and does not move; the prepayment one
 *  is minted by 0337 so a surface reading the token is not told "advance" about a roster row. */
export const BANK_BELT_REASON = {
  advance: "coa_account_advance_reserved",
  prepayment: "coa_account_prepayment_reserved",
};

/** The staff-advance enrolment door's remedy for a code the prepayment roster holds. Its two
 *  siblings (`retire_fa_profile_then_re_enrol`, `retire_advance_enrolment_then_re_enrol`) are
 *  0043's and are unchanged. */
export const ADV_REMEDY_PREPAYMENT = "retire_prepayment_enrolment_then_re_enrol";

/** The signatures 0337 recuts — the census walks exactly this list. */
export const RESERVATION_RECUTS = [
  "clara._acct_role_reserved(uuid,text)",
  "clara._adj_line_eligibility_breach(uuid,jsonb)",
  "clara._adv_enrolment_admission(uuid,text,uuid)",
  "clara._fa_assert_code_unreserved(uuid,text)",
  "clara.upsert_fa_account_profile(uuid,text,text,text,text)",
];

// ===========================================================================================
// 3 · Readers and verb wrappers.
// ===========================================================================================

/**
 * THE SHARED RESERVATION READER, asked as a caller asks it. `rootQuery` because the reader is
 * ungranted (0043 revokes it from public) and is reached only from inside a definer body: this is
 * the instrument for "which domain holds this code", never a door under test.
 */
export async function reservedRolesFor(client, code) {
  const r = await rootQuery(
    `select domain, role, owner_ref
       from clara._acct_role_reserved($1::uuid, $2::text)
      order by domain, role`, [client, code]);
  return r.rows;
}

/**
 * THE SHARED NEGATIVE WALL, asked the way every posting-side caller asks it: one credit-shaped
 * line on one code. The instrument for "0337 moved no answer this wall gives".
 */
export async function eligibilityBreach(client, code, { debit = 0, credit = 1 } = {}) {
  const r = await rootQuery(
    `select clara._adj_line_eligibility_breach($1::uuid,
       jsonb_build_array(jsonb_build_object('account_code', $2::text,
         'debit_cents', $3::bigint, 'credit_cents', $4::bigint))) as breach`,
    [client, code, debit, credit]);
  return r.rows[0].breach;
}

/**
 * ENROL A STAFF-ADVANCE ACCOUNT through 0043's own door — the instrument for "a code the
 * prepayment roster holds cannot also be enrolled to a person". Admin floor, named arguments only.
 */
export async function enrolStaffAdvanceAccount(sub, {
  client, account, personLabel = null, attestation = null, opKey = null,
}) {
  const r = await humanQuery(sub, namedCall("enrol_staff_advance_account", [
    { name: "p_client", cast: "uuid" }, { name: "p_account_code", cast: "text" },
    { name: "p_person_label", cast: "text" }, { name: "p_confirm_dedicated", cast: "boolean" },
    { name: "p_attestation", cast: "text" }, { name: "p_op_key", cast: "text" },
  ]), [
    client, account, personLabel ?? `p1078 staff ${opk("lbl").slice(-8)}`, true,
    attestation ?? "#1078 battery: the code is dedicated to one person and carries no other traffic",
    opKey ?? opk("p1078-adv"),
  ]);
  return r.rows[0].result;
}

/** Every `clara` body whose comment-stripped source CALLS the shared reservation reader. The
 *  census instrument: it reads the CATALOG, never a migration's text, so a body a later file
 *  recuts is measured as it stands. */
export async function reservationConsumers() {
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara'
        and lower(regexp_replace(regexp_replace(regexp_replace(
              p.prosrc, '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))
            ~ 'clara\\._acct_role_reserved *\\('
      order by 1`);
  return r.rows.map((x) => x.sig);
}

/** The live `sha256(prosrc)` of one body, the same expression every migration prestate in this
 *  estate measures with. The instrument for "this file recut exactly these bodies". */
export async function bodySha(signature) {
  const r = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') as sha
       from pg_proc p where p.oid = $1::regprocedure`, [signature]);
  return r.rows[0]?.sha ?? null;
}
