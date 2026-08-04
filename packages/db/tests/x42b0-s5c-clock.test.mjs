// ===========================================================================
// [WAVE D-b SPLIT — D-b0 (0042, shared authorities)] A FORK OF `x42-s5c-clock.test.mjs`.
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
// CELLS HERE (4): x42.s5c.1, x42.s5c.2, x42.s5c.3, x42.s5c.4
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0 (0041 template + 0042)
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
import { S5_25_BARE_TOKEN_RE, S5_25_BARE_TOKEN_ROSTER } from "./x42-s5-helpers.mjs";

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
// x42.s5c.1 — THE AUTHORITY IS THE HOUSE'S, AND THE DIVERGENCE IS FORCED.
// ===========================================================================
test("x42.s5c.1 clara._book_today() is timezone-independent while current_date provably is not, and _fa_today still agrees", async (t) => {
  if (skipHere(t)) return;
  const house = iso(await houseToday());
  const seen = [];
  // The authority is NOT reachable by an app role — its ACL is clara._fa_today()'s,
  // exactly. Asserted first, because a probe that had to widen the grant to run
  // would have been measuring a different function from the one production calls.
  await assert.rejects(
    () => inZone(sub, "UTC", (c) => c.query("select clara._book_today() as d")),
    (e) => e.code === "42501",
    "clara._book_today() must not be invokable by clara_authenticated (PUBLIC revoked, definer chain only)",
  );
  for (const tz of HOSTILE) {
    const r = await inZoneAsOwner(tz, (c) => c.query(
      "select clara._book_today() as book, clara._fa_today() as fa, current_date as sess, (now() at time zone 'Asia/Kuala_Lumpur')::date as myt"));
    const row = r.rows[0];
    assert.equal(iso(row.book), iso(row.myt), `${tz}: the authority must be the MYT date, whatever the session says`);
    assert.equal(iso(row.fa), iso(row.book), `${tz}: the FA-lane delegate must not move — twelve live 0041 readers depend on it`);
    seen.push({ tz, sess: iso(row.sess), book: iso(row.book) });
  }
  // NON-VACUITY, FORCED. Pacific/Midway (UTC-11) and Pacific/Kiritimati (UTC+14)
  // bracket MYT so their union disagrees with it at EVERY instant. If neither
  // diverged, this cell measured nothing and must say so rather than pass.
  const diverged = seen.filter((s) => s.sess !== s.book);
  assert.ok(
    diverged.length > 0,
    `no session timezone disagreed with the house date — the probe proved nothing. Measured: ${JSON.stringify(seen)}`,
  );
  noteLane(`s5c.1 house=${house}; session-clock divergence measured in ${diverged.map((d) => `${d.tz}(${d.sess})`).join(", ")}`);

  // ...and the authority is STABLE, not IMMUTABLE. An IMMUTABLE clock would be
  // constant-folded into an index or a generated column and freeze the house date
  // at whatever day the plan was built. Asked because the fix did not think of it.
  const vol = (await rootQuery(
    "select provolatile from pg_proc where pronamespace='clara'::regnamespace and proname='_book_today'")).rows;
  assert.equal(vol.length, 1, "clara._book_today() must exist exactly once — an overload is a second answer");
  assert.equal(vol[0].provolatile, "s", "the authority must be STABLE (never IMMUTABLE: it reads the clock)");
});

// ===========================================================================
// x42.s5c.2 — apply_open_items, END TO END, THROUGH THE AUDITED DOOR, UNDER A
// SESSION TIMEZONE THAT DISAGREES WITH THE HOUSE.
// ===========================================================================
test("x42.s5c.2 apply_open_items stamps BOTH effective_dates from the house legal date, not the session's", async (t) => {
  if (skipHere(t)) return;
  const cp = await birthCustomer(`X42 CLOCKCO ${randomUUID().slice(0, 6)}`);
  const inv = await controlEntry(cp, 80000, +1);
  const cred = await controlEntry(cp, 30000, -1);

  const before_ = await houseToday();
  const receipt = await inZone(sub, "Pacific/Midway", async (c) => {
    const sess = (await c.query("select current_date as d")).rows[0].d;
    const r = await c.query(
      namedCall("apply_open_items", [
        { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" }]),
      [client, JSON.stringify([{ source_item_id: cred, target_item_id: inv, amount_cents: 30000 }]),
        "x42 clock apply", opk("k42apply")]);
    return { result: r.rows[0].result, sess };
  });
  const after_ = await houseToday();
  const group = idOf(receipt.result, "group_id", "group");
  assert.ok(group, `apply_open_items names its application_group (got ${JSON.stringify(receipt.result)})`);

  const rows = await allocationsOf(group);
  assert.equal(rows.length, 2, "the apply writes the balanced PAIR (unchanged by this fix)");
  assert.equal(rows.reduce((s, r) => s + Number(r.amount_cents), 0), 0, "…and the pair still nets EXACTLY zero");
  for (const r of rows) {
    assertHouseDate(r.effective_date, before_, after_, "apply_open_items effective_date");
  }
  // BOTH SIDES ON ONE DATE. now() is transaction_timestamp(), so the two INSERTs
  // cannot straddle midnight MYT — asserted rather than assumed, because a future
  // author reaching for a per-statement clock would split one act across two days.
  assert.equal(iso(rows[0].effective_date), iso(rows[1].effective_date),
    "both halves of one application carry the SAME date");
  if (iso(receipt.sess) !== iso(rows[0].effective_date)) {
    noteLane(`s5c.2 session date was ${iso(receipt.sess)} (Pacific/Midway) and the stamp is ${iso(rows[0].effective_date)} — the pre-0042 body would have written the session's`);
  }
});

// ===========================================================================
// x42.s5c.3 — unallocate_group: the house date INSIDE greatest(), with the 0040
// monotonicity reading intact on BOTH branches.
// ===========================================================================
test("x42.s5c.3 unallocate_group dates its negation from the house date and greatest() still governs both branches", async (t) => {
  if (skipHere(t)) return;
  const cp = await birthCustomer(`X42 UNDOCO ${randomUUID().slice(0, 6)}`);
  const inv = await controlEntry(cp, 60000, +1);
  const cred = await controlEntry(cp, 20000, -1);
  const applyR = await humanQuery(sub,
    namedCall("apply_open_items", [
      { name: "p_client" }, { name: "p_applications", cast: "jsonb" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, JSON.stringify([{ source_item_id: cred, target_item_id: inv, amount_cents: 20000 }]),
      "x42 clock apply for undo", opk("k42apply2")]);
  const group = idOf(applyR.rows[0].result, "group_id", "group");

  const before_ = await houseToday();
  const undo = await inZone(sub, "Pacific/Kiritimati", async (c) => (await c.query(
    namedCall("unallocate_group", [
      { name: "p_client" }, { name: "p_group" }, { name: "p_reason" }, { name: "p_op_key" }]),
    [client, group, "x42 clock unallocate", opk("k42undo")])).rows[0].result);
  const after_ = await houseToday();
  const newGroup = idOf(undo, "group_id", "group");
  assert.ok(newGroup, `unallocate_group names its negation group (got ${JSON.stringify(undo)})`);

  const neg = await allocationsOf(newGroup);
  assert.equal(neg.length, 2, "the undo writes the exact-negation PAIR (unchanged by this fix)");
  assert.ok(neg.every((r) => r.reverses_allocation_id != null), "…each row still names the allocation it negates");
  for (const r of neg) assertHouseDate(r.effective_date, before_, after_, "unallocate_group effective_date");

  // THE greatest() BRANCH THE WORLD CANNOT REACH CHEAPLY. A settlement dated in the
  // FUTURE is legal, and 0040 FIX WAVE C5 [R9] exists so the negation never sorts
  // BEFORE what it negates. The clock fix could have broken that branch; measured
  // here as arithmetic against the installed authority, under a hostile timezone.
  const g = await inZoneAsOwner("Pacific/Midway", (c) => c.query(
    "select greatest(clara._book_today(), '2099-01-01'::date) as future, greatest(clara._book_today(), '2000-01-01'::date) as past, clara._book_today() as today"));
  assert.equal(iso(g.rows[0].future), "2099-01-01", "a FUTURE-dated allocation still pins its own negation forward");
  assert.equal(iso(g.rows[0].past), iso(g.rows[0].today), "a past-dated allocation is negated on the house date, never retroactively");

  // ...and the body really is that expression, not something that merely behaves so
  // today. Read from the SHIPPED catalog — the instrument production uses.
  const src = (await rootQuery(
    "select prosrc from pg_proc where pronamespace='clara'::regnamespace and proname='unallocate_group'")).rows[0].prosrc;
  assert.ok(src.includes("greatest(clara._book_today(), oa.effective_date)"),
    "unallocate_group must date its negation greatest(house today, the row it negates)");
});

// ===========================================================================
// x42.s5c.4 — THE STATUTORY YEAR. The retention horizon's error is a YEAR, not a
// day: date_trunc('year', today) on 1 January before 08:00 MYT saw the OUTGOING
// year on a UTC session and computed a horizon a full year short.
// ===========================================================================
test("x42.s5c.4 the document retention horizon is computed from the house year under every hostile session timezone", async (t) => {
  if (skipHere(t)) return;
  const house = await houseToday();
  const wantYear = new Date(iso(house)).getUTCFullYear();
  for (const tz of HOSTILE) {
    const r = await withActor({ role: ROLES.fnOwner }, async (c) => {
      await c.query(`set time zone '${tz}'`);
      return c.query("select clara._document_retention_date($1) as d, current_date as sess", [client]);
    });
    const d = r.rows[0].d;
    assert.ok(d, `${tz}: the retention date is defined for a real client`);
    const got = iso(d);
    assert.equal(got, `${wantYear + 9}-12-31`,
      `${tz}: the ten-year horizon must run from the HOUSE year (session date was ${iso(r.rows[0].sess)})`);
  }
  // ...and its ONE consumer still reaches it: a helper nobody calls is a fix nobody gets.
  const n = (await rootQuery(
    "select count(*)::int as n from pg_proc where pronamespace='clara'::regnamespace and prosrc like '%clara._document_retention_date(%'")).rows[0].n;
  assert.equal(n, 1, "clara._recompute_document_retention must be its only caller");
});
