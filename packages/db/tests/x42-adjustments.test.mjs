// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 1: the propose→sign→retire
// LIFECYCLE (design §2.1/§2.2), the POSTER's admission law (§2.3), WDB-G4's catch-up
// boundary, the RAMP and the occurrence ENTRY SHAPE (ABI §B/§C).
// The structural probes + the due oracle live in `x42-adj-due.test.mjs`; arm (2)'s
// seven staleness axes and the two D-a defect classes in `x42-adjustments-stale.test.mjs`;
// the pair in `x42-pair.test.mjs` + `x42-pair-correction.test.mjs`. The split is only
// the repo's 500-line file ceiling — `node --test tests/` discovers all five.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from
// docs/plan/completed/wave-d-b-design.md + -abi.md + wave-d-contract.md §4 ONLY, never from
// 0042's SQL. Refusals are asserted by their pinned ERRCODE + detail.reason (ABI §F).
//
// Every date descends from the DB's own Asia/Kuala_Lumpur anchor: mon(-1) is the
// newest month that has ENDED, mon(0) is in progress, mon(+1) is unambiguously future.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, namedCall, opk, idOf, endPool, printLaneNotes,
  printSkipCount, assertRaises, PG, CLR,
  x42EnsureReady, skip42, refuses, refusesAxis, refusesCode,
  T, CLR38, CLR10, CLR04,
  EXPA, EXPB, ACCR, ACCR2, PREP2, BANKX, ARX, INACT, FACOST, FAACC, FAEXP,
  mon, dayIn, addDays, mytToday, lastEndedFy, occurrenceMemo, expectedMode,
  proposeTemplate, signTemplate, retireTemplate, runManual,
  adjustmentRunDue, adjustmentRunDueAsHuman, runAndSettle, caught,
  setClientFyEnd, upsertFaProfile,
  enrolAdvance, addBankAccount, accrualLines, prepaymentLines, uniqTag,
  adjWorld, freshAdjClient, liveTemplate, approveDraft,
  templateRow, templateRows, entryRowOf, entryLinesOf, receiptForEntry, runRowsForTemplate,
  rampClock, signedOnMyt, firmThresholdOf, clientFy, deactivateAccountRaw,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adjustments");
  printSkipCount("x42-adjustments");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b adjustment lifecycle battery");

// ===========================================================================
// x42.t — THE TEMPLATE LIFECYCLE.
// ===========================================================================

test("x42.t1 propose→sign is the happy path: the envelope names {template_id, status, content_hash}, propose floors at bookkeeper+ and sign/retire at admin+ (WD-R9)", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t1");
  const lines = accrualLines(120_000);
  const name = `x42 t1 ${uniqTag()}`;

  // A VIEWER cannot propose (bookkeeper+ floor).
  await assertRaises(CLR04, () => proposeTemplate(w.users.carol, {
    client, name: `${name} viewer`, start: mon(-3).start, lines, memo: "x42 t1",
  }), "a VIEWER proposing an adjustment template");

  const proposed = await proposeTemplate(w.users.bob, {
    client, name, cadence: "monthly", start: mon(-3).start, lines, memo: "x42 t1 accrual",
  });
  const id = idOf(proposed, "template_id");
  assert.ok(id, `the propose envelope names template_id (got ${JSON.stringify(proposed)})`);
  assert.equal(proposed.status, "proposed", "…and the status it was born in");
  assert.ok(typeof proposed.content_hash === "string" && proposed.content_hash.length > 0,
    "…and the content_hash the partial-unique scope is keyed on (ABI §A)");

  // Signing is admin+ — a bookkeeper is refused, and so is retiring.
  await assertRaises(CLR04, () => signTemplate(w.users.bob, { client, template: id }),
    "a BOOKKEEPER signing a template (WD-R9 floors signing at admin+)");
  assert.equal((await templateRow(id)).status, "proposed", "the refused sign left the template proposed");

  const signed = await signTemplate(w.users.hana, { client, template: id });
  assert.equal(signed.template_id ?? signed.id, id, "the sign envelope names the same template");
  assert.equal(signed.status, "live", "…now LIVE");
  const row = await templateRow(id);
  assert.equal(row.signed_by, w.users.hana, "signing stamps signed_by — the last_human_editor identity (§2.2)");
  assert.ok(row.signed_at, "…and signed_at, which WDB-G4's catch-up boundary reads");

  await assertRaises(CLR04, () => retireTemplate(w.users.bob, { client, template: id }),
    "a BOOKKEEPER retiring a template");
  const retired = await retireTemplate(w.users.hana, { client, template: id, reason: "x42 t1 done" });
  assert.equal(retired.status, "retired", "an admin retires it");
});

test("x42.t2 the content-hash duplicate wall is scoped to proposed+live: an identical live twin refuses template_duplicate, a RETIRED twin does not block", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t2");
  const spec = { client, name: `x42 t2 ${uniqTag()}`, cadence: "monthly", start: mon(-3).start, end: null, autoReverse: false, lines: accrualLines(90_000), memo: "x42 t2" };

  const first = await proposeTemplate(w.users.bob, spec);
  const firstId = idOf(first, "template_id");
  // A byte-identical PROPOSED twin collides (the partial unique covers 'proposed').
  await refuses(() => proposeTemplate(w.users.bob, spec), T.templateDuplicate,
    "a byte-identical second proposal while the first is PROPOSED", { code: CLR10 });

  await signTemplate(w.users.hana, { client, template: firstId });
  await refuses(() => proposeTemplate(w.users.bob, spec), T.templateDuplicate,
    "a byte-identical second proposal while the first is LIVE", { code: CLR10 });

  // Retiring the twin frees the hash — the scope is 'proposed','live' ONLY (§2.1).
  await retireTemplate(w.users.hana, { client, template: firstId, reason: "x42 t2 retire" });
  const second = await proposeTemplate(w.users.bob, spec);
  assert.ok(idOf(second, "template_id"), "an identical template is proposable once the twin is RETIRED");
  assert.equal((await templateRows(client)).length, 2, "…and both rows survive (retire, never delete)");
  assert.equal(second.content_hash, first.content_hash,
    "…carrying the SAME content_hash, which is what proves the scope (not the hash) moved");
});

test("x42.t3 propose validation: start_date must be a cadence period-START, end_date a period-END, end >= start, and the line set must be >=2 balanced positive one-sided rows", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t3");
  const m = mon(-3);
  const base = { client, cadence: "monthly", start: m.start, end: null, autoReverse: false, lines: accrualLines(50_000), memo: "x42 t3" };
  const P = (over) => proposeTemplate(w.users.bob, { ...base, name: `x42 t3 ${uniqTag()}`, ...over });

  await refuses(() => P({ start: dayIn(m, 5) }), T.templateFyStale,
    "a MONTHLY start_date that is not the first of a month", { code: CLR10 });
  await refuses(() => P({ end: dayIn(m, 20) }), T.templateFyStale,
    "a MONTHLY end_date that is not a month END", { code: CLR10 });
  // Annual alignment is measured against the CURRENT FYE (unset here → 31 December).
  const fy = lastEndedFy(12, 31);
  await refuses(() => P({ cadence: "annual", start: addDays(fy.start, 1) }), T.templateFyStale,
    "an ANNUAL start_date that is not the client's FY period-START", { code: CLR10 });
  await P({ cadence: "annual", start: fy.start, end: fy.end }); // the aligned annual shape IS admitted

  await refusesCode(() => P({ start: mon(-2).start, end: mon(-3).end }), [CLR10, PG.checkViolation],
    "end_date BEFORE start_date");
  await refusesCode(() => P({ lines: [{ account_code: EXPA, debit_cents: 100, credit_cents: 0 }] }), [CLR10],
    "a ONE-row line set (ABI §C demands >= 2)");
  await refusesCode(() => P({ lines: [
    { account_code: EXPA, debit_cents: 100, credit_cents: 0 },
    { account_code: ACCR, debit_cents: 0, credit_cents: 99 }] }), [CLR10, CLR.balance],
  "a line set that does not balance to the sen");
  await refusesCode(() => P({ lines: [
    { account_code: EXPA, debit_cents: 100, credit_cents: 40 },
    { account_code: ACCR, debit_cents: 0, credit_cents: 60 }] }), [CLR10],
  "a row carrying BOTH a debit and a credit (exactly one side per row)");
  await refusesCode(() => P({ lines: [
    { account_code: EXPA, debit_cents: 0, credit_cents: 0 },
    { account_code: ACCR, debit_cents: 0, credit_cents: 0 }] }), [CLR10],
  "a ZERO-amount line set (an occurrence ALWAYS carries a charge)");
});

test("x42.t4 propose-time line eligibility refuses all five ineligible codes — inactive, control-classed, the client's bank code, an FA-reserved code and an actively-enrolled advance code — and writes nothing", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t4");
  const before = (await templateRows(client)).length;
  const P = (lines) => proposeTemplate(w.users.bob, {
    client, name: `x42 t4 ${uniqTag()}`, cadence: "monthly", start: mon(-3).start,
    end: null, autoReverse: false, lines, memo: "x42 t4",
  });

  // (a) INACTIVE. MEASURED first (the x41.b6 finding): no COA deactivation door exists,
  // so the inactive shape is staged by superuser surgery — see the helper's header.
  assert.equal((await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ '^(deactivate|retire|archive)_.*_account$'
        and p.proname not like '%bank%' and p.proname not like '%advance%'`)).rows[0].n, 0,
  "still no COA deactivation verb — the inactive account remains a surgery-only shape");
  await deactivateAccountRaw(client, INACT);
  await refusesCode(() => P(accrualLines(50_000, { debit: INACT })), [CLR10],
    "a template line on an INACTIVE account");

  // (b) CONTROL-CLASSED — `account_class IS NULL` is the rule (§2.1).
  await refusesCode(() => P(accrualLines(50_000, { debit: EXPA, credit: ARX })), [CLR10],
    "a template line on a CONTROL-class (receivable) account");

  // (c) THE CLIENT'S BANK CODE — a template must never move the bank.
  await addBankAccount(w.users.alice, {
    client, bankCode: "MBB", accountNumber: `4242${uniqTag()}${uniqTag()}`, coaAccountCode: BANKX,
  });
  await refusesCode(() => P(accrualLines(50_000, { debit: EXPA, credit: BANKX })), [CLR10],
    "a template line on the client's registered BANK code");

  // (d) AN FA-RESERVED CODE — `_acct_role_reserved` reads FA profiles ∪ register rows.
  await upsertFaProfile(w.users.alice, { client, assetAccount: FACOST, accumAccount: FAACC, expenseAccount: FAEXP });
  await refusesCode(() => P(prepaymentLines(50_000, { asset: FACOST })), [CLR10],
    "a template line on an FA-enrolled COST account");

  // (e) AN ACTIVELY-ENROLLED ADVANCE CODE — the same reader's third arm (WDB-G7).
  await enrolAdvance(w.users.hana, { client, accountCode: PREP2 });
  await refusesCode(() => P(prepaymentLines(50_000, { asset: PREP2 })), [CLR10],
    "a template line on an actively-enrolled STAFF-ADVANCE account");

  assert.equal((await templateRows(client)).length, before,
    "every eligibility refusal wrote NOTHING — no half-born template row survives");
  // The control: two ordinary, unreserved, active, non-control codes ARE admitted.
  assert.ok(idOf(await P(accrualLines(50_000, { debit: EXPB, credit: ACCR2 })), "template_id"),
    "…and an ordinary expense/accrual pair is still proposable (the rule is eligibility, not scarcity)");
});

test("x42.t5 sign-time revalidation closes the propose→FYE-change→sign window: the annual template that was aligned at propose refuses template_fy_stale at sign", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t5");
  await setClientFyEnd(w.users.alice, { client, month: 12, day: 31 });
  const fy = lastEndedFy(12, 31);
  const proposed = await proposeTemplate(w.users.bob, {
    client, name: `x42 t5 ${uniqTag()}`, cadence: "annual", start: fy.start, end: null,
    autoReverse: false, lines: accrualLines(70_000), memo: "x42 t5 annual",
  });
  const id = idOf(proposed, "template_id");

  // A PROPOSED annual template does not block the FYE door (§2.2 guards LIVE ones).
  await setClientFyEnd(w.users.alice, { client, month: 6, day: 30 });
  assert.deepEqual(await clientFy(client), { month: 6, day: 30 }, "the FYE really moved to 30 June");

  await refuses(() => signTemplate(w.users.hana, { client, template: id }), T.templateFyStale,
    "signing an annual template whose start_date no longer aligns to the CURRENT FYE", { code: CLR10 });
  assert.equal((await templateRow(id)).status, "proposed", "the refused sign left it PROPOSED — never half-signed");
});

test("x42.t6 retire refuses while an occurrence draft is outstanding and succeeds once it resolves; set_client_fy_end is blocked by a live ANNUAL template and NOT by a live MONTHLY one", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("t6");
  const tpl = await liveTemplate({ client, label: "t6", start: mon(-3).start });
  const first = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  assert.equal(first.status, "drafted", "the ramp's first occurrence drafts");

  await refuses(() => retireTemplate(w.users.hana, { client, template: tpl.id, reason: "x42 t6 early" }),
    T.occurrenceDraftOutstanding, "retiring a template while its occurrence draft is outstanding", { code: CLR38 });
  assert.equal((await templateRow(tpl.id)).status, "live", "the refused retire left it LIVE");

  await approveDraft(w.users.alice, first.entry_id);
  const retired = await retireTemplate(w.users.hana, { client, template: tpl.id, reason: "x42 t6 done" });
  assert.equal(retired.status, "retired", "once the draft resolves the retire succeeds");

  // The FYE guard: a live MONTHLY template is FY-independent and must NOT block.
  const mClient = await freshAdjClient("t6m");
  await setClientFyEnd(w.users.alice, { client: mClient, month: 12, day: 31 });
  await liveTemplate({ client: mClient, label: "t6monthly", start: mon(-3).start });
  await setClientFyEnd(w.users.alice, { client: mClient, month: 3, day: 31 });
  assert.deepEqual(await clientFy(mClient), { month: 3, day: 31 },
    "a live MONTHLY template does NOT block set_client_fy_end (the sandbox's live monthly authority is the design's cell)");

  const aClient = await freshAdjClient("t6a");
  await setClientFyEnd(w.users.alice, { client: aClient, month: 12, day: 31 });
  const fy = lastEndedFy(12, 31);
  await liveTemplate({ client: aClient, label: "t6annual", cadence: "annual", start: fy.start });
  await refusesCode(() => setClientFyEnd(w.users.alice, { client: aClient, month: 6, day: 30 }), [CLR10, CLR38],
    "moving the FYE while a live ANNUAL template exists");
  assert.deepEqual(await clientFy(aClient), { month: 12, day: 31 }, "…and the FYE did not move");
});

// ===========================================================================
// x42.p — THE POSTER'S ADMISSION LAW (design §2.3; tokens are ABI §F rows).
// ===========================================================================

test("x42.p1 poster admission: template_not_live, period_out_of_window, occurrence_draft_outstanding and period_already_met each refuse CLR38 by name", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("p1");
  const lines = accrualLines(80_000);

  // NOT LIVE — a merely PROPOSED template, and a RETIRED one.
  const proposedOnly = idOf(await proposeTemplate(w.users.bob, {
    client, name: `x42 p1 proposed ${uniqTag()}`, cadence: "monthly", start: mon(-3).start,
    end: null, autoReverse: false, lines, memo: "x42 p1" }), "template_id");
  await refuses(() => runManual(w.users.bob, {
    client, template: proposedOnly, periodStart: mon(-3).start, periodEnd: mon(-3).end }),
  T.templateNotLive, "running a PROPOSED template", { code: CLR38 });

  // WINDOW — [start_date, coalesce(end_date, 'infinity')].
  const bounded = await liveTemplate({
    client, label: "p1w", start: mon(-3).start, end: mon(-2).end, lines });
  await refuses(() => runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-4).start, periodEnd: mon(-4).end }),
  T.periodOutOfWindow, "a period BEFORE start_date", { code: CLR38 });
  await refuses(() => runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-1).start, periodEnd: mon(-1).end }),
  T.periodOutOfWindow, "a period AFTER end_date", { code: CLR38 });

  // BLOCKED — one outstanding occurrence draft closes the whole template.
  const first = await runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  assert.equal(first.status, "drafted", "the first occurrence drafts (ramp + WDB-G4)");
  await refuses(() => runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-2).start, periodEnd: mon(-2).end }),
  T.occurrenceDraftOutstanding, "a SECOND period while an occurrence draft is outstanding", { code: CLR38 });

  // MET — an approved, un-reversed role='occurrence' entry for the pair.
  await approveDraft(w.users.alice, first.entry_id);
  await refuses(() => runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-3).start, periodEnd: mon(-3).end }),
  T.periodAlreadyMet, "re-running a period that is already met", { code: CLR38 });

  await retireTemplate(w.users.hana, { client, template: bounded.id, reason: "x42 p1 retire" });
  await refuses(() => runManual(w.users.bob, {
    client, template: bounded.id, periodStart: mon(-2).start, periodEnd: mon(-2).end }),
  T.templateNotLive, "running a RETIRED template", { code: CLR38 });
});

test("x42.p2 period_request_invalid names its axis (not_cadence_aligned / not_ended), and the two floors bind: the machine verb is clara_runtime-only, the human twin is bookkeeper+", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("p2");
  const tpl = await liveTemplate({ client, label: "p2", start: mon(-4).start });
  const m = mon(-3);

  await refusesAxis(() => runManual(w.users.bob, {
    client, template: tpl.id, periodStart: dayIn(m, 5), periodEnd: m.end }),
  T.periodRequestInvalid, ["not_cadence_aligned"],
  "a monthly period whose START is not the first of the month", { code: CLR38 });
  await refusesAxis(() => runManual(w.users.bob, {
    client, template: tpl.id, periodStart: m.start, periodEnd: addDays(m.end, -1) }),
  T.periodRequestInvalid, ["not_cadence_aligned"],
  "a monthly period whose END is not the month end", { code: CLR38 });
  await refusesAxis(() => runManual(w.users.bob, {
    client, template: tpl.id, periodStart: mon(1).start, periodEnd: mon(1).end }),
  T.periodRequestInvalid, ["not_ended"],
  "a cadence-aligned period that has NOT ended (mon(+1) is wholly in the future)", { code: CLR38 });

  // The MACHINE verb is granted to clara_runtime ONLY (ABI §A) — a human is refused at
  // the ROLE level, not by a message.
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(w.users.alice, namedCall(
    "run_adjustment_occurrence", [
      { name: "p_client" }, { name: "p_template" }, { name: "p_period_start", cast: "date" },
      { name: "p_period_end", cast: "date" }, { name: "p_op_key" }]),
  [client, tpl.id, m.start, m.end, opk("x42humanmachine")]),
  "a HUMAN calling the machine-only run_adjustment_occurrence");

  // …and the human twin floors at bookkeeper+.
  await assertRaises(CLR04, () => runManual(w.users.carol, {
    client, template: tpl.id, periodStart: m.start, periodEnd: m.end }),
  "a VIEWER calling run_adjustment_manual");
  assert.equal((await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: m.start, periodEnd: m.end })).status, "drafted",
  "…while a bookkeeper runs it lawfully");
});

// ===========================================================================
// x42.m — WDB-G4's catch-up boundary, the RAMP, and the occurrence entry SHAPE.
// ===========================================================================

test("x42.m1 [WDB-G4] catch-up occurrences ALL draft: every period that ENDED BEFORE the signature drafts, ramp earned or not, and the poster stamps mode='draft' on each", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("m1");
  const tpl = await liveTemplate({ client, label: "m1", start: mon(-3).start, cents: 70_000 });
  const signedOn = await signedOnMyt(tpl.id);
  assert.equal(signedOn, mytToday(), "the template was signed TODAY, so every ended period is catch-up");

  const seen = [];
  for (const p of [mon(-3), mon(-2), mon(-1)]) {
    const before = await rampClock(tpl.id);
    const r = await runManual(w.users.bob, {
      client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
    assert.equal(r.status, "drafted",
      `${p.key}: a catch-up occurrence DRAFTS (ramp earned=${before.earned}) — WDB-G4`);
    assert.equal(r.mode, "draft", `${p.key}: …and the receipt reports mode 'draft'`);
    const e = await entryRowOf(r.entry_id);
    assert.equal(e.flags.recurring_adjustment.mode, "draft", `${p.key}: …stamped on the entry itself (ABI §B)`);
    seen.push(before.earned);
    await approveDraft(w.users.alice, r.entry_id);
  }
  assert.deepEqual(seen, [false, true, true],
    "the ramp WAS earned from the second occurrence on — so the draft was forced by catch-up, not by the ramp");
  assert.equal((await runRowsForTemplate(tpl.id)).length, 3,
    "each approved catch-up occurrence still mints its receipt (the ramp gates the MODE, never the receipt)");
});

test("x42.m2 the ramp: occurrence #1 drafts, #2 auto-posts once the ramp is earned and the period is not catch-up, and a HIGH-STAKES template drafts forever (WCA-R7)", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("m2");
  const threshold = await firmThresholdOf(client);
  // SURGERY 1 (see the helper header): the signature is moved BEFORE mon(-4) so the
  // periods under test are NOT catch-up — the only way a same-day suite can reach the
  // auto-post branch the design's §7 acceptance chain names.
  const tpl = await liveTemplate({
    client, label: "m2", start: mon(-4).start, cents: 60_000, backdateSignTo: mon(-5).end });
  const signedOn = await signedOnMyt(tpl.id);

  const p1 = mon(-4);
  const r1 = await runManual(w.users.bob, { client, template: tpl.id, periodStart: p1.start, periodEnd: p1.end });
  assert.equal(r1.status, "drafted", "occurrence #1 ALWAYS drafts — the one-time ramp (WD-R8)");
  assert.equal(expectedMode({ periodEnd: p1.end, signedOn, rampEarned: false, highStakes: false }), "draft",
    "…and the design's own mode predicate agrees for #1");
  await approveDraft(w.users.alice, r1.entry_id);
  assert.equal((await rampClock(tpl.id)).earned, true, "an approved un-reversed occurrence earns autonomy");

  const p2 = mon(-3);
  const want = expectedMode({ periodEnd: p2.end, signedOn, rampEarned: true, highStakes: false });
  assert.equal(want, "post", "the fixture really reaches the non-catch-up branch");
  const r2 = await runManual(w.users.bob, { client, template: tpl.id, periodStart: p2.start, periodEnd: p2.end });
  assert.equal(r2.status, "posted", "occurrence #2 AUTO-POSTS (ramp earned · not high-stakes · not catch-up)");
  assert.equal(r2.mode, "post", "…with mode 'post'");
  const e2 = await entryRowOf(r2.entry_id);
  assert.equal(e2.status, "approved", "…the entry is approved inside the poster's own transaction");
  const receipt = await receiptForEntry(r2.entry_id);
  assert.ok(receipt, "…and the receipt was minted (design §2.5)");
  assert.equal(receipt.mode, "post", "…carrying the mode READ FROM THE FLAGS STAMP");

  // HIGH STAKES always drafts, ramp or no ramp.
  const hs = await liveTemplate({
    client, label: "m2hs", start: mon(-4).start, cents: threshold + 500_000,
    lines: accrualLines(threshold + 500_000, { debit: EXPB, credit: ACCR2 }),
    backdateSignTo: mon(-5).end });
  const h1 = await runManual(w.users.bob, { client, template: hs.id, periodStart: p1.start, periodEnd: p1.end });
  assert.equal(h1.status, "drafted", "a high-stakes occurrence drafts for a distinct checker");
  await approveDraft(w.users.alice, h1.entry_id);
  const h2 = await runManual(w.users.bob, { client, template: hs.id, periodStart: p2.start, periodEnd: p2.end });
  assert.equal(h2.status, "drafted", "…and every subsequent high-stakes period still drafts, ramp or no ramp");
  assert.equal(expectedMode({ periodEnd: p2.end, signedOn: await signedOnMyt(hs.id), rampEarned: true, highStakes: true }),
    "draft", "…exactly as the design's mode predicate composes it");
});

test("x42.m3 the occurrence entry shape: origin='scheduled_run', posting_date=period_end, maker=actor, last_human_editor=the signer, the three headers FALSE (annual too), the ABI §B flags stamp and the memo grammar", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("m3");
  const memo = "Accrued audit fee";
  const tpl = await liveTemplate({ client, label: "m3", start: mon(-3).start, cents: 45_600, memo });
  const p = mon(-3);
  const r = await runManual(w.users.bob, { client, template: tpl.id, periodStart: p.start, periodEnd: p.end });
  const e = await entryRowOf(r.entry_id);

  assert.equal(e.status, "draft", "the occurrence is born a draft here (catch-up)");
  assert.equal(e.origin, "scheduled_run", "origin='scheduled_run' (the §8 writer census)");
  assert.equal(e.posting_date, p.end, "posting_date = period_end");
  assert.equal(e.maker_actor, w.users.bob, "maker_actor = the acting caller");
  assert.equal(e.last_human_editor, tpl.signedBy,
    "last_human_editor = template.signed_by — else the distinct-checker intent never binds");
  assert.equal(e.is_opening_balance, false, "is_opening_balance FALSE, always (§2.3)");
  assert.equal(e.is_year_end, false, "is_year_end FALSE, always");
  assert.equal(e.tax_affecting, false, "tax_affecting FALSE, always");
  assert.equal(e.memo, occurrenceMemo(memo, "monthly", p.end),
    "memo = memo_template || ' — ' || period_label, with an EM DASH and to_char(period_end,'Mon YYYY')");

  const st = e.flags?.recurring_adjustment;
  assert.ok(st, "the entry carries the ABI §B `recurring_adjustment` flags key");
  assert.deepEqual(Object.keys(st).sort(), [
    "auto_reverse", "mode", "op_key", "period_end", "period_start", "reversal_date", "role", "template_id",
  ], `the stamp carries EXACTLY the ABI §B key set (got ${Object.keys(st).sort().join(",")})`);
  assert.equal(st.template_id, tpl.id, "…template_id");
  assert.equal(st.role, "occurrence", "…role");
  assert.equal(st.auto_reverse, false, "…auto_reverse mirrors the template");
  assert.equal(st.period_start, p.start, "…period_start");
  assert.equal(st.period_end, p.end, "…period_end");
  // reversal_date is CONDITIONAL on auto_reverse, and this template does not auto-reverse.
  //
  // ADJUDICATED AT ASSEMBLY (the contract-blind lane asserted `period_end + 1` here
  // unconditionally). ABI §B lists `reversal_date` among the stamp's keys but never states
  // its nullability, and design §2.3 does the same — so both readings were available to a
  // lane authoring from the documents alone. The build stamps the date only when the
  // template auto-reverses, and NULL otherwise, keeping the KEY present either way so the
  // exact-key-set assertion above still holds. That is the correct reading: this stamp is
  // what /queue reads to disclose the coming pair BEFORE it exists ([L1/24], the G2
  // disclosure item), so a date on an occurrence that will never be reversed would announce
  // a mirror that is never coming — worse than announcing nothing. The paired positive case
  // (auto_reverse = true ⇒ period_end + 1, and the mirror actually lands on that date) is
  // pinned by x42.r1.
  assert.equal(st.reversal_date, null,
    "…reversal_date is NULL on a non-auto-reversing occurrence — the key is present but " +
    "claims no mirror, because none is coming (WDB-G1; the positive case is x42.r1)");
  assert.ok(typeof st.op_key === "string" && st.op_key.length > 0, "…and the issuing op_key");

  const lines = await entryLinesOf(r.entry_id);
  assert.equal(lines.length, 2, "the occurrence carries the template's lines");
  assert.equal(Number(lines[0].debit_cents), 45_600, "…to the sen");
  assert.equal(Number(lines[1].credit_cents), 45_600, "…balanced");

  // The ANNUAL headers-FALSE cell: a year-end-flavoured cadence still births FALSE
  // headers, so template-lane CLR05 is amount-driven only (§2.3, §7).
  const aClient = await freshAdjClient("m3a");
  await setClientFyEnd(w.users.alice, { client: aClient, month: 12, day: 31 });
  const fy = lastEndedFy(12, 31);
  const at = await liveTemplate({
    client: aClient, label: "m3annual", cadence: "annual", start: fy.start, cents: 33_300, memo });
  const ar = await runManual(w.users.bob, {
    client: aClient, template: at.id, periodStart: fy.start, periodEnd: fy.end });
  const ae = await entryRowOf(ar.entry_id);
  assert.equal(ae.is_year_end, false, "an ANNUAL occurrence is is_year_end FALSE (the headers-FALSE cell)");
  assert.equal(ae.tax_affecting, false, "…and tax_affecting FALSE");
  assert.equal(ae.memo, occurrenceMemo(memo, "annual", fy.end),
    "…and its label is 'FY'||to_char(period_end,'YYYY')");
});

// ===========================================================================
// x42.d — THE DUE ORACLE (design §2.3).
// ===========================================================================

test("x42.d1 adjustment_run_due names the OLDEST unmet (template, period) among non-blocked live templates and lists the blocked ones with reason occurrence_draft_outstanding", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("d1");
  const a = await liveTemplate({ client, label: "d1a", start: mon(-3).start, cents: 40_000 });
  const b = await liveTemplate({ client, label: "d1b", start: mon(-2).start, cents: 30_000,
    lines: accrualLines(30_000, { debit: EXPB, credit: ACCR2 }) });

  const due1 = await adjustmentRunDue(client);
  assert.equal(due1.due, true, "with two live templates something is due");
  assert.equal(due1.template_id, a.id, "…the OLDEST unmet pair belongs to template A");
  assert.equal(due1.period_start, mon(-3).start, "…at its first eligible period");
  assert.equal(due1.period_end, mon(-3).end, "…period_end alongside it");
  assert.deepEqual(due1.blocked, [], "…and nothing is blocked yet");

  const first = await runManual(w.users.bob, {
    client, template: a.id, periodStart: mon(-3).start, periodEnd: mon(-3).end });
  const due2 = await adjustmentRunDue(client);
  assert.equal(due2.due, true, "A is blocked by its own draft, so the oracle moves to B");
  assert.equal(due2.template_id, b.id, "…naming template B");
  assert.equal(due2.blocked.length, 1, "…and blocked[] carries exactly one entry");
  assert.equal(due2.blocked[0].template_id, a.id, "…identifying template A");
  assert.equal(due2.blocked[0].reason, "occurrence_draft_outstanding",
    "…with blocked[]'s only v1 reason (design §2.3)");

  await approveDraft(w.users.alice, first.entry_id);
  const due3 = await adjustmentRunDue(client);
  assert.deepEqual(due3.blocked, [], "approving the draft unblocks A");
  assert.equal(due3.template_id, a.id, "…and A's next unmet period is oldest again");
  assert.equal(due3.period_start, mon(-2).start, "…which is the month after the one just met");

  const human = await adjustmentRunDueAsHuman(w.users.carol, client);
  assert.equal(human.due, due3.due, "the oracle reads identically for a human (it is rendered on /rules)");
  assert.equal(human.template_id, due3.template_id, "…naming the same template");

  // Draining to the frontier leaves nothing due — the sweep's own ladder converges.
  await runAndSettle({ client, template: a.id, period: mon(-2) });
  await runAndSettle({ client, template: a.id, period: mon(-1) });
  await runAndSettle({ client, template: b.id, period: mon(-2) });
  await runAndSettle({ client, template: b.id, period: mon(-1) });
  const drained = await adjustmentRunDue(client);
  assert.equal(drained.due, false, "once every ended period is met, nothing is due (mon(0) has not ended)");
  assert.equal((await caught(() => runManual(w.users.bob, {
    client, template: a.id, periodStart: mon(0).start, periodEnd: mon(0).end }))) !== null, true,
  "…and the month in progress is refused rather than silently posted");
});
