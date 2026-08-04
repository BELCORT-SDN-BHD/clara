// 0041 Wave D-a — the ROUND-3.5 fix-ledger battery, part D: ONE RESERVATION PREDICATE —
// A GUARD MUST SEE THE FACTS WHEREVER THEY LIVE (fix ledger G4, shapes (e)/(f)/(g)).
//
//   x41.s6  (e) the reservation is TWO-directional: the bank COA doors refuse an
//           FA-reserved code, and do not over-refuse an ordinary one.
//   x41.s7  (f) a code baked on a LIVE register row is reserved even when no ACTIVE profile
//           mentions it — version-forward frees the profile, never the fact; and a
//           disposal entry never soft-births a register row. [ROUND-4, OVERTURNED by the
//           owner ruling of 2026-08-03 / WDB-R1 item 2] A TERMINAL row — unwound, disposed
//           or superseded — DOES release its codes. Round 4 pinned the opposite ("an
//           ever-used FA code stays role-reserved"); that made the reservation permanent
//           with no verb able to lift it, and the measured cost was an advance entry that
//           could never be reversed. The cell now pins BOTH halves — live reserves,
//           terminal releases — and still measures the tie through the next movement.
//   x41.s8  (g) proceeds may not be routed into a RETIRED or VERSION-FORWARDED FA code
//           that a live register row still posts to.
//
// THE SHAPE (the round-3.5 fold's own words): a guard written against the CURRENT
// enrolment table while the facts that matter — a register row's baked codes, a bank
// mapping — live elsewhere. Each of the three cells below drives a sequence that is
// individually lawful at every step and ends somewhere the register cannot survive:
// a bank whose every receipt soft-births a phantom asset and whose every payment out is
// refused with an un-followable remedy; a disposal that fabricates
// "Fixed asset (particulars pending)" out of its own accumulated-depreciation debit;
// proceeds banked into the accumulated account the disposed asset just relieved.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers). The bank
// doors' refusal SPELLING was never pinned by a contract — these cells therefore demand a
// refusal that NAMES the FA reservation (token or axis) and record what actually fired.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanCall, idOf, opk, uniqTag, noteLane, endPool, printLaneNotes, printSkipCount,
  x41EnsureReady, skip41, caught, refusesAxis, refusesOneOf, reasonToken,
  T, COST, COST2, ACCUM, ACCUM2, EXPENSE2, BANK, GAIN, LOSS, mon, dayIn,
  upsertFaProfile, retireFaProfile, disposeAsset, disposeAndSettle, reverseAndSettle,
  faRegisterTie, tieAccts, tieSumBy,
  faWorld, faRow, faRows, profileRows,
  freshFaClient, buyAsset, completeSL, liveAuthority, earnRamp, runAndSettle,
} from "./x41-round35-helpers.mjs";
import { addBankAccount, deactivateBankAccount } from "./x38-match-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round35-reservation");
  printSkipCount("x41-round35-reservation");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3.5 reservation battery");

/** The FA-reservation refusal, by token OR named axis — the bank doors are a different
 *  verb family and no contract pins their spelling, so the pin is "this refusal is about
 *  the FA reservation", and `refusesOneOf` records which discriminant actually fired. */
const RESERVED = [T.profileInvalid, "reserved_account", "fa_reserved"];

const acctNo = () => `41${uniqTag()}${uniqTag()}`;

const remapBankCoa = (sub, { client, bankAccount, code, opKey = null }) =>
  humanCall(sub, "remap_bank_account_coa", [
    { name: "p_client" }, { name: "p_bank_account" }, { name: "p_new_coa_account_code" }, { name: "p_op_key" },
  ], [client, bankAccount, code, opKey ?? opk("x41s6remap")]);

const reactivateBank = (sub, { client, bankAccount, opKey = null }) =>
  humanCall(sub, "reactivate_bank_account", [
    { name: "p_client" }, { name: "p_bank_account" }, { name: "p_op_key" },
  ], [client, bankAccount, opKey ?? opk("x41s6react")]);

const bankRowsOn = async (client, codes) =>
  Number((await rootQuery(
    "select count(*)::int as n from clara.bank_accounts where client_id=$1 and coa_account_code = any($2)",
    [client, codes],
  )).rows[0].n);

const activeProfilesOn = async (client, code) =>
  (await profileRows(client)).filter((p) => p.active && p.asset_account_code === code);

// ===========================================================================
// x41.s6 — (e) THE BANK DOORS KNOW ABOUT FA ENROLMENT.
// ===========================================================================

test("x41.s6 the reservation is two-directional: add_bank_account and remap_bank_account_coa refuse an FA-enrolled code by name, while an ordinary bank code still registers, remaps and reactivates", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s6");

  // NO OVER-REFUSAL FIRST — a plain bank account on a non-enrolled code is the everyday
  // case and must stay effortless, otherwise the guard below proves nothing.
  const ok = await addBankAccount(w.users.alice, {
    client, bankCode: "MBB", accountNumber: acctNo(), coaAccountCode: BANK,
  });
  const bankAccount = idOf(ok, "bank_account_id", "id");
  assert.ok(bankAccount, `mandatory setup: an ordinary bank account registers on ${BANK} (got ${JSON.stringify(ok)})`);

  // THE PIN — the enrolled COST and ACCUMULATED codes (both asset-typed and class-less,
  // so nothing but the FA reservation can be doing the refusing).
  for (const [role, code] of [["COST", COST], ["ACCUMULATED-depreciation", ACCUM]]) {
    await refusesOneOf(() => addBankAccount(w.users.alice, {
      client, bankCode: "MBB", accountNumber: acctNo(), coaAccountCode: code,
    }), RESERVED,
    `add_bank_account on the enrolled ${role} account — every receipt into it would soft-birth a phantom register row and every payment out would be refused by the belt with a remedy ("reverse the acquisition and re-book it") that is meaningless for a bank movement`);
  }
  assert.equal(await bankRowsOn(client, [COST, ACCUM]), 0, "…and NO bank mapping landed on either enrolled code");

  // The remap door is the same hole with a later timestamp.
  await refusesOneOf(() => remapBankCoa(w.users.alice, { client, bankAccount, code: COST }), RESERVED,
    "remap_bank_account_coa pointing an existing bank account AT the enrolled cost account");
  assert.equal(await bankRowsOn(client, [COST, ACCUM]), 0, "…and the remap left no mapping behind either");
  assert.equal((await rootQuery(
    "select coa_account_code as c from clara.bank_accounts where id=$1", [bankAccount])).rows[0].c, BANK,
  "…the account still points at its original ordinary code");

  // …and the third door does not over-refuse on an ordinary code. [ROUND-4] This is the
  // cell's NO-OVER-REFUSAL control, so it MUST SUCCEED: admitting "some unrelated refusal"
  // here would let the everyday banking path fail for any reason at all while the cell
  // still reported the guard as well-scoped.
  await deactivateBankAccount(w.users.alice, { client, bankAccount, reason: "x41 s6 park" });
  const back = await caught(() => reactivateBank(w.users.alice, { client, bankAccount }));
  assert.ok(!back,
    `reactivate_bank_account on an ORDINARY code must SUCCEED — the FA reservation is about FA codes, not about banking. Got reason='${reasonToken(back) ?? "(none)"}' code=${back?.code} — ${back?.message}`);
  assert.equal((await rootQuery("select active from clara.bank_accounts where id=$1", [bankAccount])).rows[0].active, true,
    "…and the ordinary account really is active again");
});

// ===========================================================================
// x41.s7 — (f) A BAKED CODE IS RESERVED WHILE A LIVE ROW POSTS TO IT.
// ===========================================================================

test("x41.s7 version-forward frees the PROFILE, never the FACT: a code baked on a LIVE register row cannot be re-enrolled in another role and a disposal entry never soft-births — but UNWINDING the row DOES release it (owner ruling 2026-08-03), and the register still ties through the next movement", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("s7");
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 441_665, postingDate: dayIn(start, 1), memo: "x41 s7" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 s7" });
  await liveAuthority(client);
  await earnRamp(client, start); // real money on the baked accumulated code
  // [ASSEMBLY] Month −2 is settled too, because the disposal below falls in month −1 and
  // §4.1's PRE-EXISTING per-asset precondition refuses a disposal while an EARLIER period
  // is uncharged (x41-disposal's own `settlePrior` convention). That precondition is not
  // this cell's subject — the RESERVATION is — so the fixture meets it instead of tripping it.
  await runAndSettle(client, mon(-2));
  assert.equal((await faRow(asset.id)).accum_depr_account_code, ACCUM,
    "mandatory setup: the register row BAKED its accumulated code at birth and posts to it forever");

  // (1) The lawful version-forward (x41.q2's own law) retires the interval and frees the
  // code from every ACTIVE profile — while the register row keeps posting to it.
  await upsertFaProfile(w.users.alice, {
    client, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2,
  });
  assert.equal((await faRow(asset.id)).accum_depr_account_code, ACCUM,
    "…the row still names the ORIGINAL accumulated code (register rows are immutable)");
  assert.equal((await profileRows(client)).filter((p) => p.active && p.accum_depr_account_code === ACCUM).length, 0,
    "…and no ACTIVE profile mentions it any more — the enrolment table alone can no longer see the fact");

  // (2) THE PIN. Re-enrolling the freed code is what turns a lawful disposal into a
  // fabricated asset: the disposal's accumulated-depreciation DEBIT lands on what is now
  // an enrolled COST account and soft-births "Fixed asset (particulars pending)" with a
  // cost nobody ever spent.
  await refusesAxis(() => upsertFaProfile(w.users.alice, {
    client, assetAccount: ACCUM, accumAccount: null, expenseAccount: null,
  }), T.profileInvalid, ["reserved_account", "role_overlap"],
  "enrolling as a COST account a code that a LIVE register row still carries as its accumulated-depreciation account (freed by version-forward, but the fact lives on the row)");
  await refusesAxis(() => upsertFaProfile(w.users.alice, {
    client, assetAccount: COST2, accumAccount: ACCUM, expenseAccount: EXPENSE2,
  }), T.profileInvalid, ["accum_shared", "reserved_account", "role_overlap"],
  "…or as a SECOND profile's accumulated account, which would make the per-pair tie mathematically impossible for the row already posting there");
  assert.equal((await activeProfilesOn(client, ACCUM)).length, 0, "…and no enrolment landed on the baked code");

  // (3) …and the mechanical site itself: a disposal entry NEVER soft-births. Its
  // accumulated debit, its proceeds debit and its loss debit are settlement legs, not
  // acquisitions — the phantom's signature is a register row whose acquisition_entry_id
  // IS a disposal entry, and there must never be one.
  const before = (await faRows(client)).length;
  const sold = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 12), proceedsCents: 150_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 s7 sold",
  });
  assert.equal((await faRow(asset.id)).status, "disposed", "the lawful disposal posts");
  const after = await faRows(client);
  assert.equal(after.length, before, `…and births NOTHING (had ${before} register rows, now ${after.length})`);
  assert.equal(after.filter((r) => r.acquisition_entry_id === sold.entryId).length, 0,
    "…no register row was born FROM the disposal entry — the phantom's exact mechanical signature");

  // (4) [ROUND-4, OVERTURNED BY THE OWNER RULING OF 2026-08-03 — WDB-R1 item 2.]
  //
  // WHAT THIS CELL USED TO PIN, AND WHY IT IS WRONG. Round 4 read the reservation as a fact
  // about every row that EVER existed: "an ever-used FA code stays role-reserved", on the
  // reasoning that `fa_register_tie` censuses per (asset_account, accumulated_account) pair
  // and cannot describe one code in two roles across one history. The reasoning about the
  // TIE is sound and is measured at the foot of this cell. The conclusion drawn from it was
  // not: it made `clara._fa_reserved_roles` reserve a code PERMANENTLY, through disposal,
  // supersession and unwinding alike, with no verb anywhere able to release it. The measured
  // consequence (D-b ladder round 3) is an accounting-correctness one: a code a fixed asset
  // once carried can never be re-enrolled as a staff-advance account, so a historical advance
  // entry becomes permanently un-reversible — a correction the books MUST record and cannot.
  // The owner ruled: fix it at the root. 0042 S5.15 gates the three register-row disjuncts on
  // `clara._fa_status_holds_account_role`, so pending/active rows reserve and the three
  // TERMINAL statuses (disposed, superseded, unwound) release.
  //
  // THIS CELL THEREFORE NOW PINS BOTH HALVES, because a release that released too much would
  // be the worse defect: the LIVE row still refuses (the mandatory setup below is the same
  // assertion round 4 made, unchanged, and it still passes), and only the terminal row lets go.
  const c2 = await freshFaClient("s7rel");
  const { entry: acq, asset: a2 } = await buyAsset({ client: c2, cents: 90_000, postingDate: dayIn(start, 2), memo: "x41 s7 release" });
  await completeSL(c2, a2.id, { life: 36, start: start.start, description: "x41 s7 release" });
  await upsertFaProfile(w.users.alice, { client: c2, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2 });
  await refusesAxis(() => upsertFaProfile(w.users.alice, {
    client: c2, assetAccount: ACCUM, accumAccount: null, expenseAccount: null,
  }), T.profileInvalid, ["reserved_account", "role_overlap"],
  "THE HALF THAT DID NOT CHANGE: while the register row is LIVE, the code it baked is reserved and a different-role re-enrolment is refused");
  await reverseAndSettle(w.users.alice, { entry: acq, reason: "x41 s7 undo acquisition", opKey: opk("x41s7rel") });
  assert.equal((await faRow(a2.id)).status, "unwound", "the acquisition reverses cleanly (no charges, no descendants)");
  // THE RULED RELEASE. The row is unwound — the acquisition entry was reversed, so the GL
  // carries nothing on either code and the row can never post again. It lets the code go.
  await upsertFaProfile(w.users.alice, {
    client: c2, assetAccount: ACCUM, accumAccount: null, expenseAccount: null,
  });
  assert.equal((await activeProfilesOn(c2, ACCUM)).length, 1,
    "an UNWOUND row RELEASES its baked codes — the enrolment that round 4 refused forever is now admitted (owner ruling 2026-08-03)");
  // …AND IT IS RELEASED FOR THE RIGHT REASON, not because the guard stopped working. The
  // still-LIVE profile's own codes are untouched by the gate and are still reserved.
  await refusesAxis(() => upsertFaProfile(w.users.alice, {
    client: c2, assetAccount: ACCUM2, accumAccount: null, expenseAccount: null,
  }), T.profileInvalid, ["reserved_account", "role_overlap", "accum_shared"],
  "…while the ACTIVE profile's accumulated code is still reserved — the gate released the terminal ROW, it did not disarm the predicate");

  // …AND THE REGISTER STILL MOVES. A reservation predicate is only worth having if the
  // everyday path after it is effortless: the next acquisition on the still-enrolled cost
  // account births normally, and the tie — the instrument WD-R14 pre-flights with — is
  // clean at an as-of past the reversal mirror, with the unwound row contributing nothing
  // to either side.
  const { asset: a3 } = await buyAsset({ client: c2, cents: 120_000, postingDate: dayIn(mon(-1), 6), memo: "x41 s7 first movement" });
  assert.equal((await faRow(a3.id)).status, "active", "the FIRST MOVEMENT after the refused reuse births a normal register row");
  const asOf = dayIn(mon(1), 28); // past every mirror this database can hold
  const tie = await faRegisterTie(w.users.alice, c2, asOf);
  const rows = tieAccts(tie, COST);
  assert.ok(rows.length >= 1, "…and the enrolled cost account appears in the tie");
  assert.equal(tieSumBy(rows, /^register_cost/, "the tie register cost"), 120_000,
    "…the register reports the LIVE asset's cost alone — the unwound row is out of the as-of window, not netted against it");
  assert.equal(tieSumBy(rows, /^cost_diff/, "the tie cost difference"), 0, "…cost difference EXACTLY zero");
  assert.equal(tieSumBy(rows, /^accum_diff/, "the tie accumulated difference"), 0, "…accumulated difference EXACTLY zero");
  assert.equal(tie.tie, true, `fa_register_tie is GREEN after the reuse attempt and the next movement (got ${JSON.stringify(tie.accounts ?? tie)})`);
});

// ===========================================================================
// x41.s8 — (g) RETIRED CODES DO NOT REOPEN THE PROCEEDS HOLE.
// ===========================================================================

test("x41.s8 proceeds may never be routed into an FA code a live register row still posts to — whether the profile was version-forwarded or retired outright — and the ordinary disposal still posts", async (t) => {
  if (skipHere(t)) return;
  const start = mon(-3);

  /** An enrolled client with one charged, still-active asset. */
  const fixture = async (label) => {
    const client = await freshFaClient(label);
    const { asset } = await buyAsset({ client, cents: 400_000, postingDate: dayIn(start, 1), memo: `x41 ${label}` });
    await completeSL(client, asset.id, { life: 40, start: start.start, description: `x41 ${label}` });
    await liveAuthority(client);
    await earnRamp(client, start);
    // [ASSEMBLY] …and month −2, so the month −1 disposals below meet §4.1's pre-existing
    // per-asset "no EARLIER uncharged period" precondition (the `settlePrior` convention).
    await runAndSettle(client, mon(-2));
    return { client, asset: asset.id };
  };

  // ---- ARM A — the code freed by VERSION-FORWARD.
  const a = await fixture("s8vf");
  await upsertFaProfile(w.users.alice, {
    client: a.client, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2,
  });
  await refusesAxis(() => disposeAsset(w.users.alice, {
    client: a.client, asset: a.asset, disposalDate: dayIn(mon(-1), 10),
    proceedsCents: 100_000, proceedsAccount: ACCUM, gainAccount: GAIN, lossAccount: LOSS,
  }), T.disposalRequestInvalid, ["proceeds_account"],
  "banking the proceeds into the disposed asset's OWN accumulated-depreciation account after a version-forward freed it from the active profile — the register would zero while that account keeps a debit, and the F7 hardening must scope on the FACT, not on `active`");
  assert.equal((await faRow(a.asset)).status, "active", "…and the refusal left the asset untouched");

  // ---- ARM B — the whole profile RETIRED while the asset is still live. Either the
  // retirement itself refuses (the hole closed upstream) or the disposal must; a lawful
  // retirement followed by a lawful proceeds-into-accum is the reopened F7 defect.
  const b = await fixture("s8ret");
  const retired = await caught(() => retireFaProfile(w.users.alice, { client: b.client, assetAccount: COST }));
  if (retired) {
    // [ROUND-4] EXACTLY ENUMERATED, by the DETAIL discriminant. The old free-text match
    // (`/fa_|profile|asset/i` over message+detail) admitted almost any failure this verb
    // could throw — including one that has nothing to do with the live register row —
    // and would have reported the hole as "closed upstream" on the strength of a word.
    const tok = reasonToken(retired);
    assert.ok([T.profileInvalid, T.enrolledDeactivation].includes(tok),
      `retiring a profile whose asset is still live may be refused ONLY by one of the named FA reasons '${T.profileInvalid}' / '${T.enrolledDeactivation}' — anything else is an unrelated failure the disposal-door arm below would then be crediting to this guard. Got reason='${tok ?? "(none)"}' code=${retired.code} — ${retired.message}`);
    noteLane(`x41.s8 retire_fa_account_profile REFUSED while a live register row posts to the profile: '${tok}' — the hole is closed at the retirement door`);
    assert.equal((await activeProfilesOn(b.client, COST)).length, 1, "…and the profile stayed active");
  } else {
    assert.equal((await activeProfilesOn(b.client, COST)).length, 0, "the retirement went through (the interval is closed)");
    noteLane("x41.s8 retire_fa_account_profile is ADMITTED while a live register row posts to the profile — the disposal door therefore owns the refusal");
  }
  await refusesAxis(() => disposeAsset(w.users.alice, {
    client: b.client, asset: b.asset, disposalDate: dayIn(mon(-1), 10),
    proceedsCents: 100_000, proceedsAccount: ACCUM, gainAccount: GAIN, lossAccount: LOSS,
  }), T.disposalRequestInvalid, ["proceeds_account"],
  "banking the proceeds into the RETIRED profile's accumulated-depreciation account — retirement never releases a code a live register row still posts to");

  // ---- ARM C — NO OVER-REFUSAL. The ordinary shape still posts on both clients, so the
  // guard above is about the reserved account and nothing else.
  for (const [label, f] of [["version-forwarded", a], ["retired", b]]) {
    let sold = null;
    const err = await caught(async () => {
      sold = await disposeAndSettle(w.users.alice, {
        client: f.client, asset: f.asset, disposalDate: dayIn(mon(-1), 12), proceedsCents: 100_000,
        proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: `x41 s8 ${label} sale`,
      });
    });
    assert.ok(!err,
      `the lawful trio (bank / gain / loss) MUST still dispose the asset on the ${label} client — this is the arm that proves the two refusals above are about the reserved account and nothing else. Got reason='${reasonToken(err) ?? "(none)"}' — ${err?.message}`);
    assert.equal((await faRow(f.asset)).status, "disposed",
      `…and the register row really flips disposed on the ${label} client (mode '${sold.mode}')`);
  }
});
