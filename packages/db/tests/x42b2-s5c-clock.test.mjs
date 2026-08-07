// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-s5c-clock.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-s5c-clock.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// ONE DECLARED PROLOGUE SUBSTITUTION (light re-confirm RC4/LENS-3), NOT A CELL EDIT:
//   version ~ '^0042_'  ->  version ~ '^[0-9]{4}_wave_d_b0_shared_authorities$'
// The whole unit's frontier pin was the migration NUMBER; under the split the number
// is claimed at merge (slices/forks/RENUMBER.md) and only the slice NAME is stable.
// Left numeric, this battery goes DORMANT after any renumber -- a skip, not a
// failure. The generator asserts the substitution lands OUTSIDE every cell.
//
// CELLS HERE (2): x42.s5c.5, x42.s5c.6
// CELLS IN THE SIBLING FORK(S): b0 → D-b0
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-s5c-clock.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — x42.s5c: THE SESSION-CLOCK CLASS (round-6 fix lane, owner ruling
// 2026-08-03 WDB-R1/WDB-R2/WDB-R4).
//
// THE INVARIANT UNDER TEST
//   Every date this product writes into a legally significant column — posting_date,
//   effective_date, a statutory retention horizon — is the LEGAL date in
//   Asia/Kuala_Lumpur: a property of the HOUSE, never of whoever opened the session.
//   `current_date` is the SESSION timezone's date; on the UTC runtime it is one day
//   early for eight hours of every day.
//
// WHAT ROUND 6 MEASURED. Three live bodies stamped money dates from the session
// clock — clara.approve_wrong_client_correction (0027), clara.apply_open_items and
// clara.unallocate_group (0040) — plus clara._document_retention_date (0007), whose
// error is a YEAR rather than a day. The ROOT was that the house fact had no
// authority: nine inline copies of the timezone expression and one helper named for
// the FA lane (clara._fa_today), so an author outside that lane had nothing
// house-shaped to reach for. 0042 S5.20..S5.25 installs clara._book_today() as the
// one body, makes _fa_today its delegate, recuts all four writers, and gates the
// class on the CATALOG SHAPE rather than on any lane's identity.
//
// WDB-R4 — THIS CELL ASKS WHAT THE FIX DID NOT THINK OF. It never asserts a spelling
// where it can assert an ANSWER, and it deliberately walks past its own fix's path:
//   * the divergence is FORCED, never hoped for — s5c.1 picks a session timezone
//     that provably disagrees with MYT at THIS instant, so a green run is a
//     measurement and not an accident of the hour it ran in;
//   * the writer is measured END TO END through the audited door with a hostile
//     session timezone, on the stamped ROW, not on the function source;
//   * the delegate is re-measured, because the fix could have moved twelve live 0041
//     FA readers while looking correct;
//   * the census is re-run in CI, because the migration's own arm is an APPLY-TIME
//     gate and cannot stop a REGRESSION landing after 0042;
//   * and the detector is given a positive AND a negative control, because a census
//     that silently sees nothing is worse than no census.
//
// DECLARED LIMITS, so the next reader does not have to infer them:
//   * clara.approve_wrong_client_correction is exercised END TO END in the sibling
//     cell x42-s5c-awcc.test.mjs (it needs the document/filing correction world);
//     here it is pinned only at the catalog.
//   * greatest()'s FUTURE-dated arm is measured as arithmetic against the installed
//     authority rather than through a future-dated settlement — the branch, not the
//     world, is what the clock fix could have broken.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, withActor, namedCall, opk, ROLES,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf, upsertAccountClassed, grantConsent,
  freshResolution, draftEntryV3, approveEntry, counterpartyRows, normalize, idOf,
} from "./a21-helpers.mjs";
import { S5_25_BARE_TOKEN_RE, s5BareTokenRoster, s5KlDuplicationRoster } from "./x42-s5-helpers.mjs";

// This suite's OWN codes (grepped against every other battery before choosing).
const ARK = "374-K42"; // receivable control (asset, account_class='receivable')
const REVK = "684-K42"; // revenue
const BIRTHDK = "575-K42"; // the counterparty-birth fixture's debit
const BIRTHCK = "685-K42"; // ...and its credit

// The two zones that BRACKET Asia/Kuala_Lumpur (UTC+8). Pacific/Midway is UTC-11, so
// its local date differs from MYT whenever MYT's time-of-day is before 19:00;
// Pacific/Kiritimati is UTC+14, so its date differs from 18:00 onward. Their union
// covers all 24 hours: at EVERY instant at least one of them disagrees with the
// house date, which is why s5c.1 can force a real divergence at any hour.
const HOSTILE = ["Pacific/Midway", "Pacific/Kiritimati", "UTC", "America/Los_Angeles", "Asia/Tokyo"];

let ready = false;
let world = null;
let client = null;
let sub = null;

function skipHere(t) {
  if (!ready) {
    markSkip();
    t.skip("0042 not applied (clara.schema_migrations has no '0042_%' row) — the clock-class battery is dormant");
    return true;
  }
  return false;
}

async function has0042() {
  try {
    return (await rootQuery("select version from clara.schema_migrations where version ~ '^[0-9]{4}_wave_d_b0_shared_authorities$'")).rows.length > 0;
  } catch {
    return false;
  }
}

/** Run `fn(pgClient)` as `who` with the session timezone forced to `tz`. The pooled
 *  client is RESET ALL'd on release, so the zone cannot leak to the next checkout. */
function inZone(who, tz, fn) {
  assert.ok(/^[A-Za-z_/+-]+$/.test(tz), `refusing a non-identifier timezone: ${tz}`);
  return withActor({ role: ROLES.authenticated, jwtSub: who }, async (c) => {
    await c.query(`set time zone '${tz}'`);
    return fn(c);
  });
}

/** The same, as a bare ROLE. clara._book_today() / clara._fa_today() have PUBLIC
 *  revoked and are reachable only from the definer chain, so a direct probe of the
 *  authority must be the function owner — asserted as an ACL fact in s5c.1. */
function inZoneAsOwner(tz, fn) {
  assert.ok(/^[A-Za-z_/+-]+$/.test(tz), `refusing a non-identifier timezone: ${tz}`);
  return withActor({ role: ROLES.fnOwner }, async (c) => {
    await c.query(`set time zone '${tz}'`);
    return fn(c);
  });
}

/** The house legal date, read from the DB, in its own transaction. */
const houseToday = async () =>
  (await rootQuery("select (now() at time zone 'Asia/Kuala_Lumpur')::date as d")).rows[0].d;

/** `YYYY-MM-DD` for a pg `date` (node-postgres hands back a JS Date at local noon). */
const iso = (d) => (d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : String(d));

/** A stamped date must be the house date. Captured on BOTH sides of the act so a
 *  midnight-MYT crossing mid-cell is a pass, not a flake — and so the assertion can
 *  never be satisfied by a date that is neither. */
function assertHouseDate(actual, before_, after_, label) {
  const got = iso(actual);
  const ok = got === iso(before_) || got === iso(after_);
  assert.ok(ok, `${label}: stamped ${got}, expected the house legal date (${iso(before_)} … ${iso(after_)})`);
}

before(async () => {
  const base = await a21EnsureReady();
  ready = Boolean(base.base && base.has16 && (await has0042()));
  if (!ready) {
    noteLane("0042 absent (or the 0011/0016 surface is not ready) — x42.s5c dormant");
    return;
  }
  world = await buildWorld();
  sub = world.users.alice;
  client = world.clients.A1;
  await upsertAccountClassed(sub, { client, code: ARK, name: "Trade Debtors (x42 clock)", type: "asset", accountClass: "receivable", opKey: opk("k42ar") });
  await upsertAccountClassed(sub, { client, code: REVK, name: "Revenue (x42 clock)", type: "income", opKey: opk("k42rev") });
  await upsertAccountClassed(sub, { client, code: BIRTHDK, name: "Sundry (x42 clock birth)", type: "expense", opKey: opk("k42bd") });
  await upsertAccountClassed(sub, { client, code: BIRTHCK, name: "Sundry income (x42 clock birth)", type: "income", opKey: opk("k42bc") });
  await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
});

after(async () => {
  printLaneNotes("x42.s5c — the session-clock class");
  printSkipCount();
  await endPool();
});

// ---------------------------------------------------------------------------
// Fixtures — every object is built THROUGH the audited verbs (the x37 dog-fooding
// law). Raw reads appear only in assertions.
// ---------------------------------------------------------------------------

const manualRes = (who, cl) => freshResolution(who, cl, { subjectKind: "manual", subjectId: null });

async function birthCustomer(name) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: `x42 clock birth ${name}`,
    lines: [
      { account_code: BIRTHDK, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: BIRTHCK, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: { new: { name }, kind: "customer" }, opKey: opk("k42birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("k42birtha") });
  const want = normalize(name);
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the customer ${name} was born (mandatory setup)`);
  return cp.id;
}

/** An approved control entry with `cp` on the receivable leg. `sign` = +1 mints a
 *  POSITIVE ar item (an invoice), -1 a NEGATIVE one (a credit note). */
async function controlEntry(cp, cents, sign) {
  const lines = sign > 0
    ? [{ account_code: ARK, debit_cents: cents, credit_cents: 0, description: "dr" },
       { account_code: REVK, debit_cents: 0, credit_cents: cents, description: "cr" }]
    : [{ account_code: REVK, debit_cents: cents, credit_cents: 0, description: "dr" },
       { account_code: ARK, debit_cents: 0, credit_cents: cents, description: "cr" }];
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), memo: "x42 clock control", postingDate: "2026-04-01",
    lines, vendor: { existing_id: cp, kind: "customer" }, opKey: opk("k42gen"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("k42gena") });
  const items = (await rootQuery(
    "select id, amount_cents from clara.open_items where entry_id=$1 order by id", [d.entry_id])).rows;
  assert.equal(items.length, 1, `a receivable control entry mints exactly ONE item (got ${items.length})`);
  return items[0].id;
}

const allocationsOf = async (group) => (await rootQuery(
  "select operation_kind, amount_cents, effective_date, reverses_allocation_id from clara.open_item_allocations where application_group=$1 order by id",
  [group])).rows;

// ===========================================================================
// x42.s5c.5 — THE FORWARD RATCHET. The migration's census is an APPLY-TIME gate; it
// cannot stop a regression landing after 0042. This is the same two arms, re-asked
// in CI, with the detector's own positive and negative controls.
// ===========================================================================
test("x42.s5c.5 no clara object derives a date from the session clock, and the duplication roster is exactly the pinned set", async (t) => {
  if (skipHere(t)) return;
  // [round-7 E1] WIDENED to tolerate one optional wrapping paren around the clock-fn token —
  // Postgres's OWN deparse of a view/default/policy/constraint wraps `now()::date` as
  // `(now())::date` (measured in x42-r7-s5-census.test.mjs's own reproduction), which the
  // pre-round-7 pattern (clock token immediately followed by `::`) could not see. This is the
  // SAME pattern S5.25's v_forbidden now carries; kept duplicated here on purpose (this file's
  // whole job is re-deriving the migration's census independently, so a drift between the two
  // is itself a finding).
  const FORBIDDEN =
    "(\\mcurrent_date\\M|\\mcurrent_time\\M|\\mlocaltime\\M|\\mlocaltimestamp\\M"
    + "|\\(?(now\\(\\)|current_timestamp|localtimestamp|clock_timestamp\\(\\)"
    + "|statement_timestamp\\(\\)|transaction_timestamp\\(\\))\\)?[[:space:]]*::[[:space:]]*date)";

  // (0) CONTROLS. A census that silently sees nothing is worse than no census, and a
  // census that fires on correct code is one nobody keeps.
  const ctl = (await rootQuery(
    `select ('select current_date' ~* $1) as p1, ('select now()::date' ~* $1) as p2,
            ('select localtimestamp' ~* $1) as p3,
            ('select (now() at time zone ''utc'')::date' ~* $1) as n1,
            ('select clock_timestamp()' ~* $1) as n2,
            ('select current_dates_view' ~* $1) as n3`, [FORBIDDEN])).rows[0];
  assert.deepEqual(
    [ctl.p1, ctl.p2, ctl.p3, ctl.n1, ctl.n2, ctl.n3], [true, true, true, false, false, false],
    "the forbidden-clock detector must catch every session-clock date shape and NOTHING else",
  );
  // [round-7 E1] THE DEPARSED SHAPE, POSITIVE — the exact near-miss reproduced in
  // x42-r7-s5-census.test.mjs.1, re-asserted here so this file's OWN copy of the pattern is
  // proven to catch it too, independently.
  const ctlDeparsed = (await rootQuery(
    `select ('(now())::date' ~* $1) as p1, ('(CURRENT_TIMESTAMP)::date' ~* $1) as p2,
            ('(transaction_timestamp())::date' ~* $1) as p3, ('(clock_timestamp())::date' ~* $1) as p4,
            ('((now() AT TIME ZONE ''Asia/Kuala_Lumpur''::text))::date' ~* $1) as n1,
            ('((statement_timestamp() AT TIME ZONE ''Asia/Kuala_Lumpur''::text))::date' ~* $1) as n2`,
    [FORBIDDEN])).rows[0];
  assert.deepEqual(
    [ctlDeparsed.p1, ctlDeparsed.p2, ctlDeparsed.p3, ctlDeparsed.p4, ctlDeparsed.n1, ctlDeparsed.n2],
    [true, true, true, true, false, false],
    "the widened detector must catch Postgres's OWN paren-wrapped deparse of a bare clock-fn cast, and still exempt the lawful explicitly-zoned form (raw or deparsed)",
  );

  // (A) FUNCTIONS, VIEWS, POLICIES, COLUMN DEFAULTS, CONSTRAINTS — all five surfaces.
  // A census that only reads pg_proc is how the fourth writer hid in the first place.
  // [round-7 E2] `strip` (plain prosrc) stays for section (D)'s occurrence COUNTS below —
  // pg_get_functiondef reproduces the same body text a second time for an ordinary
  // prosrc-bodied function, so widening an occurrence-COUNT source would double every count
  // and break those exact-N assertions. `stripWide` (prosrc || pg_get_functiondef) is for
  // EXISTENCE checks only (this file's (A)/(B)/(C), never (D)) — closing the same
  // prosqlbody hole x42-r7-s5-census.test.mjs.3 reproduces, without disturbing (D).
  const strip = "lower(regexp_replace(regexp_replace(regexp_replace(prosrc,'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const stripWide = "lower(regexp_replace(regexp_replace(regexp_replace(coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),''),'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const fns = (await rootQuery(
    `select coalesce(string_agg(proname, ', ' order by proname),'') as n from pg_proc
      where pronamespace='clara'::regnamespace and ${stripWide} ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(fns, "", `clara function(s) derive a date from the SESSION clock: ${fns}. Call clara._book_today().`);
  const views = (await rootQuery(
    `select coalesce(string_agg(c.relname, ', ' order by c.relname),'') as n
       from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and c.relkind in ('v','m') and lower(pg_get_viewdef(c.oid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(views, "", `clara view(s) derive a date from the session clock: ${views}`);
  const pol = (await rootQuery(
    `select coalesce(string_agg(tablename||'.'||policyname, ', '),'') as n from pg_policies
      where schemaname='clara' and lower(coalesce(qual,'')||' '||coalesce(with_check,'')) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(pol, "", `clara RLS policy/policies derive a date from the session clock: ${pol}`);
  const defs = (await rootQuery(
    `select coalesce(string_agg(c.relname||'.'||a.attname, ', '),'') as n
       from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
       join pg_class c on c.oid=d.adrelid join pg_namespace ns on ns.oid=c.relnamespace
      where ns.nspname='clara' and lower(pg_get_expr(d.adbin,d.adrelid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(defs, "", `clara column default(s) derive a date from the session clock: ${defs}`);
  const cons = (await rootQuery(
    `select coalesce(string_agg(conrelid::regclass::text||'.'||conname, ', '),'') as n from pg_constraint
      where connamespace='clara'::regnamespace and lower(pg_get_constraintdef(oid)) ~* $1`, [FORBIDDEN])).rows[0].n;
  assert.equal(cons, "", `clara constraint(s) derive a date from the session clock: ${cons}`);

  // (B) THE DUPLICATION ROSTER. Bodies that SPELL the conversion, never bodies that
  // CALL the authority — a new caller is the outcome the fix wants and must never
  // fail a gate; a new SPELLING is a second body owning one house fact.
  const roster = (await rootQuery(
    `select coalesce(string_agg(proname, ' ' order by proname),'') as n from pg_proc
      where pronamespace='clara'::regnamespace and ${stripWide} like '%asia/kuala_lumpur%'`)).rows[0].n;
  assert.equal(
    roster,
    await s5KlDuplicationRoster(rootQuery),
    "the Asia/Kuala_Lumpur duplication roster changed. A NEW name is a second body owning the house legal date"
    + " — call clara._book_today(). A MISSING name means a recorded pre-existing copy moved.",
  );
  const stillInlined = (await rootQuery(
    "select count(*)::int as n from pg_proc where pronamespace='clara'::regnamespace"
    + " and proname='_fa_today' and (coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),'')) like '%Kuala_Lumpur%'")).rows[0].n;
  assert.equal(stillInlined, 0, "clara._fa_today must DELEGATE to the authority, never keep its own copy");

  // (B2) [round-7 finding C residual, NEW] THE AUTHORITY'S OWN CLOCK, PINNED. Arm (B) cannot
  // see WHAT clock function lives inside an already-rostered body; a future "simplification"
  // of clara._book_today() back to now()/transaction_timestamp() would satisfy (A) (exempt,
  // explicitly zoned) and (B) (the marker is still there) while silently reopening round-7
  // finding C. Re-derives S5.25 arm (B2) independently.
  const bookTodayBody = (await rootQuery(
    `select ${stripWide} as body from pg_proc where pronamespace='clara'::regnamespace and proname='_book_today'`)).rows[0]?.body;
  assert.ok(bookTodayBody, "clara._book_today() must exist");
  assert.ok(bookTodayBody.includes("statement_timestamp()"), "clara._book_today() must call statement_timestamp()");
  assert.doesNotMatch(bookTodayBody, /\bnow\(\)|\btransaction_timestamp\(\)|\bcurrent_timestamp\b/,
    "clara._book_today() must not call a transaction-pinned clock — round-7 finding C's exact defect");

  // (C) THE READER SIDE OF THE TIE, PINNED. The writers this wave fixed feed columns
  // whose readers default their as-of from the house date; if a reader ever moved to
  // the session clock the pair would be asymmetric again from the other end.
  for (const fn of ["staff_advance_summary", "staff_advance_statement"]) {
    const n = (await rootQuery(
      `select count(*)::int as n from pg_proc where pronamespace='clara'::regnamespace and proname=$1
        and ((coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),'')) like '%clara._fa_today()%'
          or (coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),'')) like '%clara._book_today()%')`, [fn])).rows[0].n;
    assert.equal(n, 1, `clara.${fn} must still default its as-of from the house legal date`);
  }
  // (D) THE THREE MONEY WRITERS ACTUALLY CALL THE AUTHORITY — on the shipped source,
  // comment-stripped, so a splice comment that merely NAMES it cannot satisfy this.
  // Plain `strip` (prosrc only) — an occurrence COUNT, not an existence check; see the note
  // above (A) for why this one must NOT use the widened source.
  for (const [fn, want] of [["approve_wrong_client_correction", 1], ["apply_open_items", 2], ["unallocate_group", 1]]) {
    const n = (await rootQuery(
      `select (length(${strip}) - length(replace(${strip}, 'clara._book_today()', '')))
              / length('clara._book_today()') as n
         from pg_proc where pronamespace='clara'::regnamespace and proname=$1`, [fn])).rows[0].n;
    assert.equal(Number(n), want, `clara.${fn} must call the house legal date exactly ${want} time(s) in CODE`);
  }
});

// x42.s5c.6 [round-8 M4 F2] — arm (D)'s forward ratchet, re-derived independently (matching
// x42.s5c.5's arms A/B/B2/C). Fuller cell (decoys, exact roster, _book_today's name-
// exemption): x42-r7-s5-clock.test.mjs.5.
test("x42.s5c.6 [F2] arm (D)'s bare-token detector and roster, re-derived independently of the migration", async (t) => {
  if (skipHere(t)) return;
  const ctl = (await rootQuery(
    `select ('v_date date; v_date := now();' ~* $1) as p1, ('insert into t(d) values (now())' ~* $1) as p2,
            ('select updated_at from t' ~* $1) as n1`, [S5_25_BARE_TOKEN_RE])).rows[0];
  assert.deepEqual([ctl.p1, ctl.p2, ctl.n1], [true, true, false], "arm (D) must catch a NO-::date assignment-cast/INSERT read, not an ordinary column name");
  const wide = "lower(regexp_replace(regexp_replace(regexp_replace(coalesce(prosrc,'')||coalesce(pg_get_functiondef(oid),''),'/\\*[\\s\\S]*?\\*/','','g'),'--[^\\n]*','','g'),'\\s+',' ','g'))";
  const flagged = (await rootQuery(
    `select coalesce(string_agg(distinct proname, ', ' order by proname), '') as n from pg_proc
      where pronamespace='clara'::regnamespace and proname <> '_book_today' and ${wide} ~* $1`, [S5_25_BARE_TOKEN_RE])).rows[0].n;
  // 0046: frontier-aware — see s5BareTokenRoster's header.
  assert.equal(flagged, (await s5BareTokenRoster(rootQuery)).join(", "), "arm (D)'s live roster drifted from the round-8 M4 measurement");
});
