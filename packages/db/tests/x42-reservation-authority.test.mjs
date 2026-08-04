// 0042 Wave D-b — THE RESERVATION AUTHORITY (owner ruling 2026-08-03: WDB-R1 root-not-
// symptom, WDB-R3 symmetry, WDB-R4 a cell that asks what the fix did not think of).
//
// The ruling found ONE subject broken in two directions, and this file is its battery.
//
//   x42.ra1  THE LIFECYCLE GATE, ACROSS EVERY TERMINAL STATUS. clara._fa_reserved_roles'
//            three clara.fixed_assets disjuncts carried no status test, so a register row
//            reserved its three codes forever. The finding named `disposed`; the CHECK
//            constraint names FIVE statuses and THREE of them are terminal, so this cell
//            walks disposed AND superseded AND unwound — and pins that pending/active
//            still reserve, because a release that released too much is the worse defect.
//   x42.ra2  THE SYMMETRY (WDB-R3). Both FA claiming doors — the account-profile door and
//            the K-doc carry-down seed — now consult the shared union, so an actively
//            enrolled staff-advance code cannot be claimed from either.
//   x42.ra3  THE RESURRECTION WINDOW (WDB-R4 applied to my own fix). Releasing a terminal
//            row's codes makes them claimable; reversing the disposal would then restore
//            the row onto a code somebody else owns. Refused at clara._fa_reversal_blocked,
//            the one predicate the verb and the approve-time hook share.
//   x42.ra4  WHAT THE FIX DID NOT THINK OF. The questions this fix's own path never asks:
//            does the predicate fail closed on a status nobody classified; does the tie stay
//            HONEST once a released code is re-used; can the census that polices the claiming
//            doors actually FAIL (round 4 measured three ways it could not).
//
// THE ROUND-4 ROOT FIXES ARE THE SIBLING FILE, x42-reservation-role.test.mjs (x42.ra5 the one
// discriminator, x42.ra6 the tie recut). They are separate only because this file reached the
// repo's 500-line cap; both import their fixtures from x42-ra-helpers.mjs, and x42.ra2(c) and
// x42.ra4(b) below were RECUT by those fixes rather than left standing beside them.
//
// NOT CONTRACT-BLIND, and deliberately so: these cells exist because of a ruling made AFTER
// the design closed, so there is no contract text to be blind to. Each pins the ruling's own
// words and cites the 0042 section that implements them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, printSkipCount, noteLane, caught, reasonToken,
  x42EnsureReady, skip42, refusesNamed, E,
  ADV1, ADV2, FACOST, FAACCUM, FAEXP,
  advWorld, freshAdvClient, upsertFaProfile, enrolAdvance, disburse, mon, dayIn,
} from "./x42-adv-world.mjs";
// The fixtures live in x42-ra-helpers.mjs so this battery and x42-reservation-role can
// share one planter — two copies of a lifecycle fixture is how two cells drift apart on
// the one field an as-of walk turns on (the disposal date).
import { reserved, faRegisterTie, plantEntry, plantRow, plantDisposed } from "./x42-ra-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-reservation-authority");
  printSkipCount("x42-reservation-authority");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the D-b reservation-authority battery");

// ===========================================================================
// x42.ra1 — THE LIFECYCLE GATE, ACROSS EVERY TERMINAL STATUS.
// ===========================================================================

test("x42.ra1 a register row reserves its three baked codes while it is PENDING or ACTIVE and releases all three once it is DISPOSED, SUPERSEDED or UNWOUND — the finding named one terminal status and there are three", async (t) => {
  if (skipHere(t)) return;

  // The predicate is asked about all three ROLES on every status, because the defect lived
  // in three separate disjuncts and a splice that landed on two of them would otherwise pass.
  const ROLES = [[FACOST, "cost"], [FAACCUM, "accum"], [FAEXP, "expense"]];

  // Each status gets its OWN client — clara.fixed_assets rows are corrected by supersede and
  // never deleted (the 0017 immutability belt), so isolation is by fixture, not by cleanup.
  for (const status of ["pending", "active"]) {
    const { client } = await freshAdvClient(`ra1L${status.slice(0, 3)}`, { enrol: false });
    await plantRow(w.users.alice, client, { status });
    for (const [code, role] of ROLES) {
      const hits = await reserved(client, code);
      assert.ok(hits.some((h) => h.domain === "fa" && h.role === role),
        `a ${status.toUpperCase()} register row must RESERVE its ${role} code — it can still move money on it (got ${JSON.stringify(hits)})`);
    }
  }

  for (const status of ["disposed", "superseded", "unwound"]) {
    const { client } = await freshAdvClient(`ra1T${status.slice(0, 3)}`, { enrol: false });
    await plantRow(w.users.alice, client, { status });
    for (const [code, role] of ROLES) {
      assert.deepEqual(await reserved(client, code), [],
        `a ${status.toUpperCase()} register row must RELEASE its ${role} code — it can never post again, and holding it was what made a lawful correction un-recordable`);
    }
    // …AND THE RELEASE IS USABLE, not merely visible in the predicate: the code can actually
    // be enrolled again. This is the act the ruling was about — the advance re-enrolment a
    // permanent reservation refused with "not possible, and will not become possible".
    await enrolAdvance(w.users.alice, {
      client, accountCode: FACOST, personLabel: `ra1 ${status}`,
    });
  }

  // …AND ONE LIVE ROW ANYWHERE IN THE LINEAGE IS ENOUGH. The union is a disjunction over
  // rows, so a client holding a terminal row AND a live row on the same code must still
  // reserve it. A gate that answered "released" here would be reading the wrong row.
  const { client: mixed } = await freshAdvClient("ra1mix", { enrol: false });
  await plantRow(w.users.alice, mixed, { status: "disposed" });
  await plantRow(w.users.alice, mixed, { status: "active" });
  assert.ok((await reserved(mixed, FACOST)).some((h) => h.domain === "fa"),
    "a client with BOTH a disposed and an active row on one code still reserves it — the live row decides");
});

// ===========================================================================
// x42.ra2 — THE SYMMETRY (WDB-R3): every FA claiming door consults the union.
// ===========================================================================

test("x42.ra2 an ACTIVELY ENROLLED staff-advance code cannot be claimed by EITHER fixed-asset claiming door — the account-profile door and the K-doc carry-down seed both consult the shared union", async (t) => {
  if (skipHere(t)) return;

  // (a) THE PROFILE DOOR (0042 S5.16). ADV1 is enrolled by the fixture, so it is owned by the
  // staff-advance register. Each of the three FA roles is tried, because the door takes three
  // codes and a guard that checked only the cost argument would leave two thirds open.
  const { client } = await freshAdvClient("ra2p");
  for (const shape of [
    { assetAccount: ADV1, accumAccount: null, expenseAccount: null, role: "cost" },
    { assetAccount: FACOST, accumAccount: ADV1, expenseAccount: FAEXP, role: "accumulated" },
    { assetAccount: FACOST, accumAccount: FAACCUM, expenseAccount: ADV1, role: "expense" },
  ]) {
    await refusesNamed(() => upsertFaProfile(w.users.alice, {
      client, assetAccount: shape.assetAccount, accumAccount: shape.accumAccount,
      expenseAccount: shape.expenseAccount,
    }), `claiming an actively enrolled advance code as the FA ${shape.role} account`,
    { codes: [E.badRequest, "CLR37"] });
  }
  // …and the refusal NAMES the owner and a remedy, because a refusal that does not is the
  // walled-corridor class WDB-R2 is about.
  const err = await caught(() => upsertFaProfile(w.users.alice, {
    client, assetAccount: ADV1, accumAccount: null, expenseAccount: null,
  }));
  const blob = `${err?.message ?? ""} ${err?.detail ?? ""}`;
  assert.ok(/staff_advance/.test(blob), `the refusal names the owning register (got ${blob})`);
  assert.ok(/retire_staff_advance_account/.test(blob),
    `…and names the verb that releases the claim, WITH its own precondition (got ${blob})`);
  assert.ok(/settled/.test(blob),
    "…and does not promise that verb will succeed — it states the precondition (every advance settled), which is what stops this being a walled corridor");

  // (b) THE ORDINARY PATH IS UNTOUCHED. A guard is only worth having if the everyday act is
  // effortless: an unenrolled chart code still enrols as a full three-role profile.
  await upsertFaProfile(w.users.alice, {
    client, assetAccount: FACOST, accumAccount: FAACCUM, expenseAccount: FAEXP,
  });
  assert.ok((await reserved(client, FACOST)).some((h) => h.domain === "fa" && h.role === "cost"),
    "…and the lawful profile really did land — the union now reserves its cost code for the FA domain");

  // (c) THE SEED DOOR (0042 S5.17), asserted STRUCTURALLY. Driving a whole K-doc carry-down
  // here would make this a test of the opening-seed machinery (x41.b5 and the x42.s5 cells own
  // that); what x42.ra2 is about is that the door ASKS. The claiming-door census inside the
  // migration (S5.14 item 6) is the behavioural gate — it fails the migration if any body that
  // writes role-claiming state cannot reach the union — and this asserts the same fact from
  // the outside, so a future recut that drops the consult is caught by the suite too.
  //
  // ROUND-4 RECUT, AND THE OLD FORM OF THIS ASSERTION IS WHY THE DEFECT SHIPPED. It asked
  // only "does the body name the union", which the first S5.17 splice satisfied while
  // filtering on `domain` alone — no role — so the door admitted a register row whose COST
  // code was another live row's ACCUMULATED code. The question is now the one that matters:
  // does the door reach the SHARED DISCRIMINATOR, and does it hand that predicate the ROLE it
  // is claiming. x42.ra5 proves the discriminator itself behaviourally.
  const { rows: seed } = await rootQuery(
    `select (p.prosrc like '%clara._fa_role_claim_conflict%') as consults,
            (p.prosrc like '%clara._fa_lock_roles%') as takes_leaf,
            (p.prosrc like '%q.want_role%') as carries_role,
            (p.prosrc ~ 'domain *(<>|is distinct from) *''fa''') as inline_filter
       from pg_proc p where p.pronamespace = 'clara'::regnamespace
        and p.proname = '_draft_opening_item_core'`);
  assert.equal(seed[0]?.consults, true,
    "the K-doc fixed-asset seed door consults the shared reservation discriminator before baking three codes onto a register row");
  assert.equal(seed[0]?.takes_leaf, true,
    "…under the fa-roles leaf, so the read-then-insert is a decision and not a snapshot");
  assert.equal(seed[0]?.carries_role, true,
    "…and it hands the discriminator the ROLE it is claiming — a consult without the role admits a cost claim on another row's accumulated account, which is exactly what shipped and what fa_register_tie then reported as an unexplainable difference");
  assert.equal(seed[0]?.inline_filter, false,
    "…and it does NOT re-express the rule inline: three doors hand-wrote that filter and one wrote it wrong, so it lives in clara._fa_role_claim_conflict alone");
});

// ===========================================================================
// x42.ra3 — THE RESURRECTION WINDOW the lifecycle gate opens.
// ===========================================================================

test("x42.ra3 reversing a disposal onto a code that was re-claimed while the asset was disposed is REFUSED — the release makes resurrection reachable, so the shared FA-reversal predicate learns about it", async (t) => {
  if (skipHere(t)) return;

  // The window in one line: dispose -> the codes release (x42.ra1) -> somebody claims one ->
  // reversing the disposal would restore the row onto it, and both registers would own it.
  const { client } = await freshAdvClient("ra3", { enrol: false });
  const disposalEntry = await plantEntry(w.users.alice, client, { memo: "x42 ra3 disposal" });
  await rootQuery(
    `insert into clara.fixed_assets
       (firm_id, client_id, description, acquired_date, cost_cents, useful_life_months,
        depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, status, disposed_at, disposal_entry_id)
     select cl.firm_id, cl.id, 'x42 ra3', current_date - 400, 100000, 60, 'straight_line',
            $2::text, $3::text, $4::text, 'disposed', current_date - 30, $5::uuid
       from clara.clients cl where cl.id = $1::uuid`,
    [client, FACOST, FAACCUM, FAEXP, disposalEntry]);

  // Nothing is claimed yet, so the predicate is silent — the guard must not refuse a lawful
  // disposal reversal, which is the ordinary case and by far the common one.
  assert.equal(await caught(() =>
    rootQuery("select clara._fa_reversal_blocked($1::uuid)", [disposalEntry])), null,
  "a disposal reversal with nobody else on the codes is ADMITTED — the guard is not a blanket refusal");

  // Now the released cost code is enrolled as a staff advance, exactly as x42.ra1 proved it
  // may be, and the same reversal becomes un-admittable.
  await enrolAdvance(w.users.alice, { client, accountCode: FACOST, personLabel: "ra3 claimant" });
  const err = await caught(() =>
    rootQuery("select clara._fa_reversal_blocked($1::uuid)", [disposalEntry]));
  assert.ok(err, "…and once the code is claimed, restoring the row onto it is REFUSED");
  assert.equal(reasonToken(err), "fa_reverse_role_reclaimed",
    `…by name (got ${err?.message} / ${err?.detail})`);
  assert.ok(/release that claim/.test(`${err?.message}`),
    "…with a remedy, not a dead end");

  // WHAT THIS ARM ADDS OVER THE OBVIOUS ONE: the clash need not be cross-DOMAIN. Releasing the
  // code also lets another FA profile take it in a DIFFERENT role, which the profile door now
  // lawfully admits — and restoring the row would put a cost role and an accumulated role on
  // one account, the topology clara.upsert_fa_account_profile refuses at enrolment. A guard
  // that filtered on `domain <> 'fa'` alone would have missed exactly half of this.
  const { client: c2 } = await freshAdvClient("ra3role", { enrol: false });
  const e2b = await plantEntry(w.users.alice, c2, { memo: "x42 ra3b disposal" });
  await rootQuery(
    `insert into clara.fixed_assets
       (firm_id, client_id, description, acquired_date, cost_cents, useful_life_months,
        depreciation_method, asset_account_code, accum_depr_account_code,
        depr_expense_account_code, status, disposed_at, disposal_entry_id)
     select cl.firm_id, cl.id, 'x42 ra3b', current_date - 400, 100000, 60, 'straight_line',
            $2::text, $3::text, $4::text, 'disposed', current_date - 30, $5::uuid
       from clara.clients cl where cl.id = $1::uuid`,
    [c2, FACOST, FAACCUM, FAEXP, e2b]);
  // FACOST is free now, so a profile may take it as its ACCUMULATED account — a role swap.
  await upsertFaProfile(w.users.alice, {
    client: c2, assetAccount: ADV2, accumAccount: FACOST, expenseAccount: FAEXP,
  });
  const err2 = await caught(() =>
    rootQuery("select clara._fa_reversal_blocked($1::uuid)", [e2b]));
  assert.ok(err2, "a CROSS-ROLE reclaim blocks the resurrection too, not only a cross-domain one");
  assert.equal(reasonToken(err2), "fa_reverse_role_reclaimed",
    `…under the same token (got ${err2?.message} / ${err2?.detail})`);
});

// ===========================================================================
// x42.ra4 — WHAT THE FIX DID NOT THINK OF (WDB-R4).
// ===========================================================================

test("x42.ra4 the questions this fix's own path never asks: the status predicate fails CLOSED, the register tie stays HONEST rather than merely green once a released code is re-used, and the claiming-door census is not vacuous", async (t) => {
  if (skipHere(t)) return;

  // (a) FAIL CLOSED. The gate is a classification, and a classification's real risk is the
  // value nobody classified. A later migration adding a sixth clara.fixed_assets status must
  // not have it silently treated as RELEASING — that would free a code somebody is posting to,
  // which is the very defect fold G4 closed. It raises instead.
  const err = await caught(() => rootQuery(
    "select clara._fa_status_holds_account_role('a_status_nobody_classified')"));
  assert.ok(err, "an UNCLASSIFIED fixed-asset status is refused, not answered");
  assert.equal(reasonToken(err), "fa_status_unclassified",
    `…by name, so the next author is told what to do (got ${err?.message})`);
  // …and every status the live CHECK constraint actually admits IS classified. This is the
  // assertion that makes "handle every terminal status" a fact rather than a claim.
  const { rows: known } = await rootQuery(
    `select unnest(regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''::text', 'g')) as st
       from pg_constraint con where con.conrelid = 'clara.fixed_assets'::regclass
        and con.conname = 'fixed_assets_status_check_0017'`);
  assert.ok(known.length >= 5, `the status CHECK still enumerates its values (got ${known.length})`);
  for (const { st } of known) {
    assert.equal(await caught(() => rootQuery(
      "select clara._fa_status_holds_account_role($1::text)", [st])), null,
    `every status the constraint admits is classified — '${st}' is not`);
  }

  // (b) THE TIE STAYS HONEST — AND THIS ARM IS THE ONE THE ROUND-4 LADDER OVERTURNED.
  //
  // WHAT IT USED TO PIN, AND WHY THAT WAS WRONG. Before 0042 S5.19, clara.fa_register_tie's
  // account walk took EVERY clara.fixed_assets row of the client with no status filter, so a
  // terminal row's codes stayed in the tie forever. This cell called the resulting red
  // "the tie telling the truth". Measured, it was not: the fixed-asset register holds NOTHING
  // on that account at that date — the disposal relieved both legs and the row can never post
  // again — so the difference reported was another register's money attributed to the FA
  // register, and NO ACCOUNTING ACT COULD CLEAR IT. A red a professional cannot act on is not
  // honesty; it is the thing that teaches them to ignore the tie. The writer (S5.15) had been
  // gated and this reader had not, which is the exact regression shape this wave exists to end.
  //
  // WHAT IT PINS NOW: the walk's universe is the accounts the FA family holds AT p_as_of, so
  // an account released by a terminal row and re-used by another register simply is not the
  // fixed-asset register's business and does not appear. x42.ra6 walks the arms this one does
  // not: that a HISTORICAL as-of still sees the account (the dangerous direction of the same
  // recut), and that a code a LIVE row holds can never be taken by another register at all.
  const { client } = await freshAdvClient("ra4tie", { enrol: false });
  await plantDisposed(w.users.alice, client, { memo: "x42 ra4 disposal" });

  const tieOf = () => faRegisterTie(w.users.alice, client, dayIn(mon(1), 28));
  const before = await tieOf();
  const costRow = (tie) => (tie.accounts ?? []).find((r) => r.asset_account === FACOST);
  // The row was disposed a month ago and the as-of is a month ahead of that, so at THIS date
  // the FA family holds nothing on the code: the account has already left the walk. Reading
  // it as "absent, or present and tying at zero" would be weaker than the invariant — the
  // invariant is that the universe is what the family HOLDS, so absence is the assertion.
  assert.equal(costRow(before), undefined,
    "an account whose only register row is TERMINAL at the as-of date is not in the tie's universe — the fixed-asset register holds nothing on it, so it has nothing to answer for");
  assert.equal(before.tie, true,
    "…and the tie is clean, because every account it DOES walk is one the register really holds");

  // Now re-use the released code from the OTHER register, and move REAL money through it by
  // the real verbs: enrol it as a staff advance and disburse. The disbursement soft-births an
  // advance register row on a code the fixed-asset register once carried — reached from the
  // one direction the ruling leaves open on purpose (the FA row is TERMINAL, so it has no
  // claim). The fixed-asset tie must be UNMOVED by it: this is another register's money.
  await enrolAdvance(w.users.alice, { client, accountCode: FACOST, personLabel: "ra4 claimant" });
  await disburse({ client, cents: 500_000, postingDate: dayIn(mon(-1), 10), account: FACOST });
  const after = await tieOf();
  assert.equal(costRow(after), undefined,
    "…and it stays out of the universe once another register moves money through it — the walk asks who HOLDS the account, not who ever did");
  assert.equal(after.tie, true,
    "the fixed-asset tie is NOT broken by a staff advance on a code the fixed-asset register released — a red no fixed-asset act can clear is the defect, not the diagnosis");
  noteLane("x42.ra4(b) OVERTURNS its own earlier pin (0042 S5.19): the released-then-reclaimed code used to make fa_register_tie report a -500,000 sen difference no act could clear, because the walk had not been recut when the lifecycle gate landed. The walk is now gated by clara._fa_included_at — the SAME predicate both compared sides already used — so the account leaves the universe when the family stops holding it. The advance is reported by clara.staff_advance_tie, which is the register that does hold it.");

  // (c) THE CENSUS THAT POLICES ALL OF THIS MUST BE ABLE TO FAIL. S5.14 item 6 asserts that
  // every body writing role-claiming state reaches the union — and the round-4 ladder measured
  // THREE ways that gate could pass while proving nothing. This arm re-measures all three from
  // outside the migration, because a self-checking gate that only checks itself is the same
  // failure mode WDB-R4 names.
  //
  // (c.i) THE INSTRUMENT. The old census read RAW prosrc, so a body that named the union only
  // in a COMMENT counted as a consumer. Measured on the live catalog: reading raw source finds
  // strictly MORE consumers than reading code, and the difference is real bodies that consult
  // through a delegate. If the two ever agree again, the comments have gone — but until then
  // the gap is the proof that the instrument mattered.
  const NORM = `lower(regexp_replace(regexp_replace(regexp_replace(
                  p.prosrc, '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g'), '\\s+', ' ', 'g'))`;
  const { rows: instr } = await rootQuery(
    `select count(*) filter (where p.prosrc like '%_acct_role_reserved%')::int as raw_n,
            count(*) filter (where ${NORM} ~ '_acct_role_reserved *\\(')::int as code_n
       from pg_proc p where p.pronamespace = 'clara'::regnamespace`);
  assert.ok(instr[0].raw_n > instr[0].code_n,
    `a raw-source census over-counts consumers of the reservation union (raw ${instr[0].raw_n} vs code ${instr[0].code_n}) — the census must read CODE, or a comment stands in for a consult`);

  // (c.ii) THE DOOR SET IS EXACT, ON BOTH SIDES, AND WHITESPACE CANNOT HIDE A DOOR. Measured
  // hazards from the live catalog: clara.approve_opening_seed writes `set status='active',`
  // with no spaces, and it and clara.approve_opening_correction both write
  // `update clara.fixed_assets fa set ...` with an ALIAS — three shapes a naive
  // single-space, INSERT-only regex cannot see.
  const EXPECT_DOORS = [
    "_adv_on_approve", "_draft_opening_item_core", "_fa_on_approve",
    "approve_opening_correction", "approve_opening_seed", "complete_fixed_asset_particulars",
    "complete_staff_advance_particulars", "enrol_staff_advance_account",
    "retire_fa_account_profile", "retire_staff_advance_account",
    "revise_fixed_asset_particulars", "upsert_fa_account_profile",
  ];
  const { rows: doors } = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and ${NORM} ~ '(insert into|update) clara\\.(fa_account_profiles|fixed_assets|staff_advance_accounts|staff_advances)\\M'
      order by p.proname collate "C"`);
  assert.deepEqual(doors.map((d) => d.proname), EXPECT_DOORS,
    "the set of bodies that WRITE role-claiming state is exact — an UPDATE-side door re-points a code or re-activates an enrolment with no INSERT anywhere, and an INSERT-only census never sees it");
  const updOnly = doors.map((d) => d.proname)
    .filter((n) => !["_draft_opening_item_core", "enrol_staff_advance_account"].includes(n));
  assert.ok(updOnly.length >= 8,
    `…and the UPDATE side is most of it (${updOnly.length} bodies), which is why leaving it unexamined was the largest of the three blind spots`);

  // (c.iii) THE RULE HAS EXACTLY ONE EXPRESSION. Three doors hand-wrote the discriminator and
  // one wrote it without the role. Nothing outside clara._fa_role_claim_conflict may state it.
  //
  // ONE CLASSIFIED EXCLUSION (round 6, beside the migration's own S5.14(6e) classification).
  // clara._fa_gl_leg_foreign spells the same TEXT while asking a different QUESTION: not "may
  // the fixed-asset family CLAIM this role on this code now" but "did another register family
  // OWN this code at the instant this entry was approved" — an attribution question, over the
  // AS-OF union, asked by clara.fa_register_tie's GL side. The exclusion is EARNED below on the
  // two properties that make it not a fourth hand-written copy, so it cannot be inherited by a
  // body that merely takes the name.
  const { rows: inline } = await rootQuery(
    `select p.proname from pg_proc p
      where p.pronamespace = 'clara'::regnamespace
        and p.proname not in ('_fa_role_claim_conflict', '_fa_gl_leg_foreign')
        and ${NORM} ~ 'domain *(<>|!=|is distinct from) *''fa'''`);
  assert.deepEqual(inline.map((r) => r.proname), [],
    "no body re-expresses the reservation discriminator inline — it has one home, because three hand-written copies produced one wrong one");
  const { rows: gl } = await rootQuery(
    `select ${NORM} as src from pg_proc p
      where p.pronamespace = 'clara'::regnamespace and p.proname = '_fa_gl_leg_foreign'`);
  assert.ok(gl[0]?.src?.includes("clara._acct_role_reserved_at("),
    "the excluded body reads the AS-OF authority, so it cannot be answering the NOW claim question the discriminator owns");
  assert.equal(/role *(=|<>|!=|is distinct from|in) */.test(gl[0].src), false,
    "…and it never tests a ROLE, which is exactly what the hand-written copy that broke a register row had dropped");

  // …and the THREE bodies excluded from the consult requirement are excluded because they
  // INHERIT their codes rather than choosing them — measured, not asserted: a door that
  // chooses reads the code out of caller input, and none of these has such a read.
  // clara._adv_on_approve joined this list in round 4: it passed the OLD census only on a
  // comment match, and reading code alone exposed that it never called the union at all.
  const { rows: inherit } = await rootQuery(
    `select p.proname, (p.prosrc like '%>>''asset_account_code''%'
                        or p.prosrc like '%>>''accum_depr_account_code''%'
                        or p.prosrc like '%>>''depr_expense_account_code''%'
                        or p.prosrc ~ '->> *''account_code''') as chooses
       from pg_proc p where p.pronamespace = 'clara'::regnamespace
        and p.proname in ('_fa_on_approve', 'revise_fixed_asset_particulars', '_adv_on_approve')
      order by p.proname collate "C"`);
  assert.equal(inherit.length, 3, "all three excluded bodies are present to be checked");
  for (const b of inherit) {
    assert.equal(b.chooses, false,
      `clara.${b.proname} is excluded from the claiming-door census ONLY because it inherits its account codes — it now reads one from caller input, so it is a claiming door`);
  }
});
