// 0041 Wave D-a — the ROUND-3 fix-ledger battery, part C: ENROLMENT INTERVALS ARE
// IMMUTABLE FACTS, ACCOUNT TOPOLOGY, AND THE ACT-DATE FLOORS (fix ledger F5, F7, F8,
// F10 + the smalls).
//
//   x41.q1  F5(a) — the belt evaluates the enrolment interval AT `approved_at`, so a
//           same-transaction retire/remap cannot open a TOCTOU window.
//   x41.q2  F5(b) — an enrolled account pair is NEVER mutated in place: an upsert that
//           changes any code VERSION-FORWARDS (retire + fresh row), and `retired_at`
//           stamps the closed interval.
//   x41.q3  F5(c) — client-wide role topology: roles disjoint, accumulated codes
//           unique, and a `clara.bank_accounts`-mapped code is RESERVED.
//   x41.q4  F7 — proceeds / gain / loss may not be enrolled in ANY FA role.
//   x41.q5  F8 — no act may be dated before the row it acts on was born.
//   x41.q6  F10 — the outstanding-disposal probe is client-scoped and index-backed.
//   x41.q7  the smalls: the issuer op-receipt binding names the CLIENT, and the
//           NULL-accum-with-carried-accumulated shape is either unreachable or named.
//
// [ROUND-3.5 · fix ledger G7] TWO pins in this file were DEFECTIVE and are re-cut here:
// q6 proved the index EXISTS but never that the plan USES it, and q7(a) was VACUOUS —
// its ±700-char `client_id` window matched the unrelated `<alias>.client_id <> e.client_id`
// tenancy checks that sit beside every anchor, so it passed on a body whose whole
// request-hash re-derivation had been deleted. Both re-cuts MEASURE: q6 reads the planner's
// own answer, q7(a) proves its predicate discriminating against mutants built from the live
// body in the cell's own setup. No other cell in this file is touched.
//
// CONTRACT-BLIND (see x41-fa-fixtures.mjs / x41-round3-helpers.mjs headers).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, getPool, ROLES, namedCall, opk, noteLane, endPool, printLaneNotes, printSkipCount,
  x41EnsureReady, skip41, refuses, refusesOneOf, refusesAxis, axisOf, fnSource, uniqTag,
  T, COST, COST2, ACCUM, ACCUM2, EXPENSE, EXPENSE2, LAND, BANK, GAIN, LOSS, mon, dayIn,
  draftEntryV3, manualRes, upsertFaProfile, retireFaProfile, completeParticulars, disposeAsset,
  disposeAndSettle,
  reviseParticulars, faWorld, faRow, entryRowOf, entryLinesOf, profileRows, columnExists,
  freshFaClient, buyAsset, completeSL,
  // [ROUND-3.5 · G7] the two re-cut pins' instruments (x41-round35-helpers.mjs).
  explainPlan, flatPlan, nodeTypes,
  decomment, lookupSpans, clientBoundIssuerLookups, cutRequestHashConjuncts, round3Pin,
  CLIENT_IN_HASH_G,
} from "./x41-round35-helpers.mjs";
import { addBankAccount } from "./x38-match-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("x41-round3-guards");
  printSkipCount("x41-round3-guards");
  await endPool();
});

const skipHere = (t) => skip41(t, live, "the Wave-D-a round-3 guard battery");

/** Approve `entry` and run `tail` in ONE transaction, then COMMIT — the shape the
 *  deferred belt exists to survive. Returns the raised error (or null). The x41.m1
 *  two-session idiom, single-session: the belt is DEFERRABLE INITIALLY DEFERRED, so
 *  its verdict lands on the COMMIT, after `tail` has already moved the profile. */
async function approveThenInSameTxn(sub, { entry, expectedRevision, opKey }, tail) {
  const c = await getPool().connect();
  try {
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub, role: "authenticated" })]);
    await c.query(namedCall("approve_entry", [
      { name: "p_entry" }, { name: "p_expected_revision" }, { name: "p_op_key" },
    ]), [entry, expectedRevision, opKey]);
    await tail(c);
    await c.query("commit");
    return null;
  } catch (e) {
    return e;
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** A DRAFTED hand journal that moves an enrolled account with no register act behind it. */
async function draftUnregisteredMovement(client, { code, cents = 5_000, label }) {
  return draftEntryV3(w.users.bob, {
    client, resolution: await manualRes(w.users.bob, client), memo: label,
    postingDate: dayIn(mon(-1), 6),
    lines: [
      { account_code: code, debit_cents: cents, credit_cents: 0, description: "unregistered" },
      { account_code: BANK, debit_cents: 0, credit_cents: cents, description: "funded" },
    ],
    opKey: opk("x41q1draft"),
  });
}

// ===========================================================================
// x41.q1 / q2 — ENROLMENT INTERVALS ARE IMMUTABLE FACTS (F5 a/b).
// ===========================================================================

test("x41.q1 the belt evaluates the enrolment interval AT approved_at: retiring or remapping the profile in the SAME transaction cannot slip an unregistered movement past it", async (t) => {
  if (skipHere(t)) return;
  for (const [label, tail] of [
    ["RETIRING the profile", async (c, client) => c.query(namedCall("retire_fa_account_profile", [
      { name: "p_client" }, { name: "p_asset_account" }, { name: "p_op_key" },
    ]), [client, COST, opk("x41q1ret")])],
    ["REMAPPING the enrolled pair", async (c, client) => c.query(namedCall("upsert_fa_account_profile", [
      { name: "p_client" }, { name: "p_asset_account" }, { name: "p_accum_account" },
      { name: "p_depr_expense_account" }, { name: "p_op_key" },
    ]), [client, COST, ACCUM2, EXPENSE2, opk("x41q1map")])],
  ]) {
    const client = await freshFaClient(`q1_${label.slice(0, 3).toLowerCase()}`);
    // A hand journal DEBITING the enrolled accumulated-depreciation account: a GL
    // movement on an enrolled role with no register act anywhere behind it.
    const d = await draftUnregisteredMovement(client, { code: ACCUM, label: `x41 q1 ${label}` });
    const err = await approveThenInSameTxn(
      w.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x41q1apr") },
      (c) => tail(c, client),
    );
    assert.ok(err, `${label} in the approving transaction must NOT open a window — the commit was expected to refuse`);
    const blob = `${err.message ?? ""} ${err.detail ?? ""} ${err.hint ?? ""}`;
    // The belt covers all three enrolled roles; which of its two named refusals fires on
    // an accum-side movement is the belt's own business — that one of them DOES fire at
    // COMMIT, after the profile was already retired/remapped, is the whole cell (F5a).
    const named = [T.beltUnregistered, T.costAdjDeferred].find((tok) => blob.includes(tok));
    assert.ok(named,
      `${label}: the deferred belt still names its refusal at COMMIT (expected ${T.beltUnregistered} or ${T.costAdjDeferred}; got code=${err.code} — ${err.message})`);
    noteLane(`x41.q1 ${label}: the deferred belt fired '${named}' at COMMIT despite the same-transaction profile move`);

    // The whole transaction rolled back: the entry never approved and the profile never moved.
    assert.equal((await entryRowOf(d.entry_id)).status, "draft", `${label}: the refused entry is still a draft`);
    const active = (await profileRows(client)).filter((p) => p.active && p.asset_account_code === COST);
    assert.equal(active.length, 1, `${label}: the profile is untouched (exactly one active enrolment)`);
    assert.equal(active[0].accum_depr_account_code, ACCUM, `${label}: …still carrying its original accumulated code`);
  }
});

test("x41.q2 an enrolled pair is never mutated in place: changing any code VERSION-FORWARDS, the historical interval keeps its own codes and enrolled_at, and retirement stamps retired_at", async (t) => {
  if (skipHere(t)) return;
  assert.equal(await columnExists("fa_account_profiles", "retired_at"), true,
    "clara.fa_account_profiles carries `retired_at` — an enrolment INTERVAL, not just a boolean (F5a)");

  const client = await freshFaClient("q2");
  const before = (await profileRows(client)).filter((p) => p.asset_account_code === COST);
  assert.equal(before.length, 1, "mandatory setup: exactly one enrolment to begin with");
  const original = before[0];
  assert.equal(original.retired_at, null, "…and it is open-ended while active");

  await upsertFaProfile(w.users.alice, {
    client, assetAccount: COST, accumAccount: ACCUM2, expenseAccount: EXPENSE2,
  });
  const rows = (await profileRows(client)).filter((p) => p.asset_account_code === COST);
  assert.equal(rows.length, 2,
    `a code change VERSION-FORWARDS: the old interval is retired and a FRESH row is written (got ${rows.length} rows for ${COST})`);
  const closed = rows.find((p) => p.id === original.id);
  const fresh = rows.find((p) => p.id !== original.id);
  assert.ok(closed && fresh, "…both intervals are present");
  assert.equal(closed.accum_depr_account_code, ACCUM,
    "the HISTORICAL interval keeps its own accumulated code — an in-place overwrite would erase what the belt must evaluate at approved_at (F5b)");
  assert.equal(closed.depr_expense_account_code, EXPENSE, "…and its own expense code");
  assert.equal(closed.active, false, "…it is no longer active");
  assert.equal(String(closed.enrolled_at), String(original.enrolled_at), "…its enrolled_at watermark is untouched");
  assert.ok(closed.retired_at, "…and it now carries retired_at, closing the interval");
  assert.ok(new Date(closed.retired_at) >= new Date(closed.enrolled_at), "…at or after its own enrolment");

  assert.equal(fresh.accum_depr_account_code, ACCUM2, "the FRESH interval carries the new accumulated code");
  assert.equal(fresh.depr_expense_account_code, EXPENSE2, "…and the new expense code");
  assert.equal(fresh.active, true, "…is active");
  assert.equal(fresh.retired_at, null, "…and is open-ended");

  await retireFaProfile(w.users.alice, { client, assetAccount: COST });
  const retired = (await profileRows(client)).find((p) => p.id === fresh.id);
  assert.equal(retired.active, false, "retire_fa_account_profile deactivates the row");
  assert.ok(retired.retired_at, "…and STAMPS retired_at (F5a — the belt reads the interval, never `active`)");
});

// ===========================================================================
// x41.q3 — CLIENT-WIDE ROLE TOPOLOGY + RESERVED ACCOUNTS (F5c).
// ===========================================================================

test("x41.q3 profile topology is CLIENT-WIDE: roles are disjoint across active profiles, accumulated codes are unique, a bank-mapped code is reserved — and a genuinely distinct second profile is still admitted", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("q3");
  const sub = w.users.alice;

  await refusesAxis(() => upsertFaProfile(sub, { client, assetAccount: ACCUM, accumAccount: ACCUM2, expenseAccount: EXPENSE2 }),
    T.profileInvalid, ["role_overlap"],
    "enrolling as a COST account a code that is already another profile's ACCUMULATED role (soft-birth cannot tell a cost purchase from an accumulated-depreciation clearing leg)");
  await refusesAxis(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: COST, expenseAccount: EXPENSE2 }),
    T.profileInvalid, ["role_overlap"],
    "…and the mirror: an enrolled COST account taken as another profile's ACCUMULATED role");
  await refusesAxis(() => upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: ACCUM, expenseAccount: EXPENSE2 }),
    T.profileInvalid, ["accum_shared", "role_overlap"],
    "a SECOND profile sharing the first profile's accumulated account (the per-pair tie becomes mathematically impossible)");

  // NO over-refusal: a fully distinct second register is exactly what COST2 exists for.
  await upsertFaProfile(sub, { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: EXPENSE2 });
  assert.equal((await profileRows(client)).filter((p) => p.active).length, 2,
    "a second profile whose three codes are all distinct is ADMITTED — the rule is disjointness, not scarcity");

  // The RESERVED-ACCOUNT door: one mis-typed code in the enrolment form is the widest
  // blast radius in the wave (every receipt births a phantom asset, every payment out is
  // refused at approval with an un-followable remedy).
  const bankClient = await freshFaClient("q3bank");
  const added = await addBankAccount(sub, {
    client: bankClient, bankCode: "MBB", accountNumber: `1041${uniqTag()}${uniqTag()}`, coaAccountCode: BANK,
  });
  assert.ok(added, "mandatory setup: an operationally-live bank account is registered against the BANK coa code");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.bank_accounts where client_id=$1 and coa_account_code=$2",
    [bankClient, BANK])).rows[0].n, 1, "…and clara.bank_accounts really maps it");

  await refusesAxis(() => upsertFaProfile(sub, { client: bankClient, assetAccount: BANK, accumAccount: ACCUM2, expenseAccount: EXPENSE2 }),
    T.profileInvalid, ["reserved_account"],
    "enrolling a clara.bank_accounts-mapped code as an FA COST account");
  await refusesAxis(() => upsertFaProfile(sub, { client: bankClient, assetAccount: COST2, accumAccount: BANK, expenseAccount: EXPENSE2 }),
    T.profileInvalid, ["reserved_account"],
    "…or as the ACCUMULATED-depreciation account");
  assert.equal((await profileRows(bankClient)).filter((p) => p.active && p.asset_account_code === BANK).length, 0,
    "…and no enrolment landed on the bank code");
});

// ===========================================================================
// x41.q4 / q5 — DISPOSAL ACCOUNT HARDENING (F7) + ACT-DATE FLOORS (F8).
// ===========================================================================

test("x41.q4 a disposal may never route money into an FA role: proceeds into an accumulated or cost account, and the loss leg into a depreciation-expense account, are refused by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("q4");
  await upsertFaProfile(w.users.alice, { client, assetAccount: COST2, accumAccount: ACCUM2, expenseAccount: EXPENSE2 });
  const start = mon(-3);
  const { asset } = await buyAsset({ client, cents: 360_000, postingDate: dayIn(start, 1), memo: "x41 q4" });
  await completeSL(client, asset.id, { life: 36, start: start.start, description: "x41 q4" });
  // No authority: the per-asset precondition is vacuous, so every refusal below is the
  // ACCOUNT rule and nothing else (the x41.g4c law).
  const base = {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 12), proceedsCents: 100_000, memo: "x41 q4",
  };

  await refusesAxis(() => disposeAsset(w.users.alice, { ...base, proceedsAccount: ACCUM }),
    T.disposalRequestInvalid, ["proceeds_account"],
    "proceeds landing on the disposed asset's OWN accumulated-depreciation account (the register would zero while the GL keeps a debit)");
  await refusesAxis(() => disposeAsset(w.users.alice, { ...base, proceedsAccount: ACCUM2 }),
    T.disposalRequestInvalid, ["proceeds_account"], "…or ANOTHER profile's accumulated account");
  await refusesAxis(() => disposeAsset(w.users.alice, { ...base, proceedsAccount: COST2 }),
    T.disposalRequestInvalid, ["proceeds_account"], "…or another profile's enrolled COST account");
  await refusesAxis(() => disposeAsset(w.users.alice, { ...base, proceedsAccount: BANK, lossAccount: EXPENSE }),
    T.disposalRequestInvalid, ["loss_account"], "the loss leg landing on the enrolled DEPRECIATION EXPENSE account");
  await refusesAxis(() => disposeAsset(w.users.alice, { ...base, proceedsAccount: BANK, lossAccount: EXPENSE2 }),
    T.disposalRequestInvalid, ["loss_account"], "…or another profile's depreciation expense account");
  assert.equal((await faRow(asset.id)).status, "active", "every refusal left the asset untouched");

  const ok = await disposeAsset(w.users.alice, {
    ...base, proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS,
  });
  assert.ok(ok, "…and the lawful shape (a non-enrolled bank/gain/loss trio) still posts");
  assert.equal((await faRow(asset.id)).status, "disposed", "…disposing the asset");
});

test("x41.q5 no act may be dated before the row it acts on was born: a revision or a disposal behind coalesce(effective_from, acquired_date) is refused", async (t) => {
  if (skipHere(t)) return;
  const client = await freshFaClient("q5");
  const birthMonth = mon(-2);
  const birth = dayIn(birthMonth, 10);
  const { asset } = await buyAsset({ client, cents: 200_000, postingDate: birth, memo: "x41 q5" });
  await completeSL(client, asset.id, { life: 24, start: birthMonth.start, description: "x41 q5" });
  const forward = { method: "straight_line", useful_life_months: 36, residual_cents: 0, start_date: birthMonth.start };

  // (a) a revision effective BEFORE the acquisition GL exists: the successor would
  // appear in a register month that has no acquisition debit behind it.
  await refusesOneOf(() => reviseParticulars(w.users.alice, {
    client, asset: asset.id, particulars: forward, effectiveFrom: dayIn(mon(-3), 5),
  }), [T.reviseEffectiveConflict, T.particularsInvalid],
  "a revision effective BEFORE the asset's own birth date (F8)");

  // (b) a disposal dated BEFORE the acquisition: cost credited before it was debited.
  const errB = await refuses(() => disposeAsset(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-3), 6), proceedsCents: 0, proceedsAccount: null,
  }), T.disposalRequestInvalid, "a disposal dated BEFORE the asset's own birth date (F8)");
  noteLane(`x41.q5 the pre-birth disposal refusal named axis '${axisOf(errB) ?? "(none)"}'`);
  assert.equal((await faRow(asset.id)).status, "active", "both refusals left the row untouched");

  // (c) the floor follows the ROW, not the acquisition: a successor's own effective_from
  // is its birth, so a revision behind it is refused too.
  const revFrom = dayIn(mon(-1), 1);
  await reviseParticulars(w.users.alice, { client, asset: asset.id, particulars: forward, effectiveFrom: revFrom });
  const succId = (await faRow(asset.id)).superseded_by_asset_id;
  assert.ok(succId, "mandatory setup: the lawful revision minted a successor");
  await refusesOneOf(() => reviseParticulars(w.users.alice, {
    client, asset: succId, particulars: { ...forward, useful_life_months: 48 }, effectiveFrom: dayIn(birthMonth, 20),
  }), [T.reviseEffectiveConflict, T.particularsInvalid],
  "revising a SUCCESSOR effective before its own effective_from (the birth floor is coalesce(effective_from, acquired_date))");
});

// ===========================================================================
// x41.q6 / q7 — THE PERF SHAPE (F10) AND THE SMALLS.
// ===========================================================================

test("x41.q6 the outstanding-disposal-draft probe is CLIENT-scoped and index-backed — it never full-scans journal_entries once per asset inside the sweep", async (t) => {
  if (skipHere(t)) return;
  const args = (await rootQuery(
    `select pg_get_function_arguments(p.oid) as a from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='_fa_disposal_draft_outstanding'`,
  )).rows.map((r) => r.a);
  assert.equal(args.length, 1, `exactly one _fa_disposal_draft_outstanding overload (got ${args.length})`);
  assert.ok(/client/i.test(args[0]),
    `…and it takes the CLIENT its callers already know, so the scan can be predicated (F10) — got '${args[0]}'`);

  const idx = (await rootQuery(
    `select indexname, indexdef from pg_indexes
      where schemaname='clara' and tablename='journal_entries' and indexdef ilike '%fa_disposal%'`,
  )).rows;
  assert.ok(idx.length >= 1,
    "a PARTIAL index on clara.journal_entries backs the outstanding-disposal probe (F10) — none found");
  const def = idx.map((r) => r.indexdef).join(" | ");
  assert.ok(/client_id/.test(def), `…keyed by client_id (got ${def})`);
  assert.ok(/draft/.test(def), `…and restricted to drafts (got ${def})`);
  noteLane(`x41.q6 the outstanding-disposal index is ${idx.map((r) => r.indexname).join(", ")}`);

  // [ROUND-3.5 · G7] AN INDEX THAT EXISTS IS NOT AN INDEX THAT IS USED. Ask the planner
  // itself about the predicate the probe rides — a future rewrite (an added OR arm, a
  // wrapped expression, a lost `flags ?` operator) would silently revert to a Seq Scan
  // per asset inside the sweep and leave every assertion above green.
  const probe = `select 1 from clara.journal_entries e
     where e.client_id = '00000000-0000-0000-0000-000000000000'::uuid
       and e.status = 'draft' and e.flags ? 'fa_disposal'`;
  noteLane(`x41.q6 the NATURAL plan for the outstanding-disposal predicate: ${nodeTypes(await explainPlan(probe)).join(" > ")}`);
  // `enable_seqscan = off` does not FORBID a sequential scan — it only prices it out of
  // reach. A predicate the partial index cannot serve still plans as a Seq Scan, so this
  // measures index USABILITY and stays deterministic on a rig whose journal_entries is
  // too small for the planner to prefer an index naturally.
  const nodes = flatPlan(await explainPlan(probe, { noSeqScan: true }));
  assert.ok(!nodes.some((n) => n["Node Type"] === "Seq Scan" && n["Relation Name"] === "journal_entries"),
    `the outstanding-disposal predicate must NEVER plan as a Seq Scan over clara.journal_entries (F10) — got ${nodeTypes(nodes).join(" > ")}`);
  const used = nodes.map((n) => n["Index Name"]).filter(Boolean);
  assert.ok(used.length >= 1,
    `…it plans as an Index / Index-Only / Bitmap-Index scan (got ${nodeTypes(nodes).join(" > ")})`);
  const names = idx.map((r) => r.indexname);
  assert.ok(used.some((n) => names.includes(n)),
    `…and the index it rides is F10's own partial index (expected one of ${names.join(", ")}; the planner chose ${used.join(", ")})`);
  noteLane(`x41.q6 the planner rides '${used.join(", ")}' for the outstanding-disposal predicate (Seq Scan absent)`);
});

test("x41.q7 the smalls: the issuer op-receipt binding names the CLIENT, and a NULL-accum register row can never carry accumulated depreciation through a D-a door", async (t) => {
  if (skipHere(t)) return;
  // (a) the op-receipt binding. A firm-only match lets ANY op-receipt of the same firm
  // authenticate a proposal for a different client of that firm; the binding must also
  // pin the client. This is a CATALOG census (the x41.k1 idiom), not a body read.
  //
  // [ROUND-3.5 · G7] RE-PINNED, AND PROVEN DISCRIMINATING. The round-3 assertion looked
  // for `client_id` anywhere in a ±700-char window around each `op_key =` anchor and
  // quantified with `some()`; every anchor sits beside an unrelated
  // `<alias>.client_id <> e.client_id` tenancy check, so it answered TRUE on a body with
  // the entire request-hash re-derivation removed. The pin below demands the exact
  // client-bound re-derivation fragment inside EVERY op-receipt lookup, and the three
  // mutants — built here from the live body — prove the predicate rejects the defect.
  const src = await fnSource("_fa_on_approve");
  assert.ok(src && src.length > 0, "the approve-time hook body is readable from the catalog");
  const live = decomment(src);
  const spans = lookupSpans(live);
  assert.ok(spans.length >= 2,
    `the approve-time hook carries BOTH issuer op-receipt lookups — the depreciation proposal's and the disposal proposal's (found ${spans.length}). If the fix lane factored them into a helper, this cell must follow them there, not be relaxed.`);
  assert.equal(clientBoundIssuerLookups(live), true,
    "EVERY issuer op-receipt lookup re-derives the request hash INCLUDING `'client', <entry>.client_id` — a firm-only match is a cross-client oracle (STR minor)");

  // MUTATION PROOF 1 — the firm-only binding: the client leaves the hash at BOTH sites,
  // while the neighbouring `<alias>.client_id <> e.client_id` tenancy checks stay put —
  // the defect class the STR-minor fold exists to kill.
  const mutFirmOnly = live.replace(CLIENT_IN_HASH_G, "");
  assert.notEqual(mutFirmOnly, live, "the mutation really changed the body (the fragment under test is present)");
  assert.equal(clientBoundIssuerLookups(mutFirmOnly), false,
    "MUTATION PROOF: the pin REJECTS a body whose request hash no longer names the client — the round-3 window matched the unrelated tenancy checks instead and was vacuous");

  // MUTATION PROOF 2 — a HALF-bound body: only the LAST lookup loses the client. `some()`
  // would still answer true; `every()` is the quantifier the law needs.
  const hits = [...live.matchAll(CLIENT_IN_HASH_G)]
    .filter((m) => spans.some(([a, b]) => m.index >= a && m.index < b));
  assert.ok(hits.length >= 2, `each issuer lookup carries its own client-bound fragment (found ${hits.length} inside the lookup windows)`);
  const last = hits[hits.length - 1];
  const mutHalfBound = live.slice(0, last.index) + live.slice(last.index + last[0].length);
  assert.equal(clientBoundIssuerLookups(mutHalfBound), false,
    "MUTATION PROOF: the pin REJECTS a body bound at one issuer lookup and not the other — `every()`, never `some()`");

  // MUTATION PROOF 3 — the whole request-hash conjunct cut: an op_key match alone, with no
  // re-derivation at all (the shape the STR-minor fold exists to kill).
  const mutNoRehash = cutRequestHashConjuncts(live);
  assert.notEqual(mutNoRehash, live, "the NO-REHASH mutation really changed the body");
  assert.equal(clientBoundIssuerLookups(mutNoRehash), false,
    "MUTATION PROOF: the pin REJECTS a body that matches the op_key without re-deriving the request hash at all");
  noteLane(`x41.q7(a) mutation matrix over ${spans.length} issuer lookup(s) — live:true firm_only:false half_bound:false no_rehash:false. For the record, the ROUND-3 pin answers no_rehash:${round3Pin(mutNoRehash)} firm_only:${round3Pin(mutFirmOnly)} on the same comment-blanked mutants (the round-3.5 lens measured it TRUE on the raw body — either way it cannot tell the fixed body from the defective one).`);

  // (b) the NULL-accum shape. On a non-depreciable (land) profile the accum account is
  // NULL by construction, so the disposal omits the accumulated leg. Through the D-a
  // doors such a row can only ever carry ZERO accumulated, which balances exactly.
  const client = await freshFaClient("q7", { enrol: false });
  await upsertFaProfile(w.users.alice, { client, assetAccount: LAND, accumAccount: null, expenseAccount: null });
  const { asset } = await buyAsset({
    client, cents: 5_000_000, postingDate: dayIn(mon(-2), 4), account: LAND, memo: "x41 q7 land",
  });
  await completeParticulars(w.users.alice, {
    client, asset: asset.id,
    particulars: { method: "none", residual_cents: 0, start_date: mon(-2).start, description: "x41 q7 land" },
  });
  assert.equal(Number((await faRow(asset.id)).accumulated_depreciation_cents ?? 0), 0,
    "a row born on a NULL-accum profile carries ZERO accumulated — the D-a doors cannot reach the risky shape");
  // [ROUND-3 re-green] A 6,000,000-sen disposal is HIGH-STAKES (the x41 firms carry a
  // 1,000,000 threshold — measured), so the proposal DRAFTS for a distinct checker by design
  // and the register act only materialises at approve. That maker-checker window is the
  // subject of x41.g5/g6, not of this cell, so settle it through the world's own idiom.
  const { entryId: entry, mode } = await disposeAndSettle(w.users.alice, {
    client, asset: asset.id, disposalDate: dayIn(mon(-1), 5), proceedsCents: 6_000_000,
    proceedsAccount: BANK, gainAccount: GAIN, lossAccount: LOSS, memo: "x41 q7 land sold",
  });
  noteLane(`x41.q7 the land disposal proposal landed as '${mode}' (high-stakes drafts for a checker)`);
  assert.equal((await faRow(asset.id)).status, "disposed", "…and it disposes lawfully");
  const lines = await entryLinesOf(entry);
  assert.ok(!lines.some((l) => l.account_code === ACCUM || l.account_code === ACCUM2),
    "…writing NO accumulated-depreciation leg (the zero-amount leg is omitted, design §4.1)");

  // The remaining risky shape is K-only (a carry-down with a NULL accum code and a
  // non-zero carried accumulated). Report whether the corpus can even reach it — a bare
  // CLR07 there would violate the every-refusal-is-named law (ACC-m4).
  const risky = await rootQuery(
    `select count(*)::int as n from clara.fixed_assets
      where accum_depr_account_code is null and coalesce(accumulated_depreciation_cents,0) <> 0
        and status in ('pending','active')`,
  );
  noteLane(`x41.q7 register rows with a NULL accum account AND non-zero carried accumulated: ${risky.rows[0].n} (ACC-m4 — 0 means the shape is unreachable through every audited door)`);
  assert.equal(Number(risky.rows[0].n), 0,
    "no register row anywhere carries a NULL accumulated account WITH carried accumulated depreciation — the shape that would fail the exact-balance check with a bare CLR07 instead of a named refusal (ACC-m4). If this ever becomes non-zero, dispose_fixed_asset owes it a NAMED guard.");
});
